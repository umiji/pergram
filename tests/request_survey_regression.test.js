/**
 * T-070 の回帰・シナリオテスト（テスト担当が実装の報告を受けて足した分）。
 *
 * 受け入れテスト（tests/request_survey.test.js）は完了条件を1つずつ二値にしたもので、
 * 実装側の単体テスト（tests/request_survey_upsert.test.js）は新しい受け口の中の挙動を見る。
 * **どちらも「ブラウザからサーバまでを通しで動かしたときに何が残るか」は見ていない。**
 * ここがその穴を埋める。
 *
 * 見るのは4つ。
 *
 * 1. **既存の待機リストの経路が壊れていない**（完了条件 A-4）。
 *    アンケートの送信先が1つ増えた変更なので、壊れるとしたらここである。
 * 2. **同じ人が2つの表に残ったときに何が起きるか。**
 *    実装の報告で新たに出てきた点。数え方を誤ると回答率が実際の倍に見える。
 * 3. **押下の匿名シグナルの再送の仕組み（T-062）を壊していない。**
 *    実装は `sendRequestSignal` の早期 return の位置を動かしている。
 *    ここは「整理」で元に戻されやすい形をしているので、狙って固定する。
 * 4. **2つの受け口が同じ規則で自由記述と選択肢を扱う。**
 *    実装は検証の道具を `worker/waitlist.js` と共有せず重複させた（意図的・T-070 決定ログ）。
 *    重複が抱える唯一の危険は**片方だけ直されてずれること**なので、ずれを検出する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { NUTRIENTS_OTHER_MAX, REQUESTS_MAX } from '../src/lib/waitlist_fields.js';
import { loadTranslator } from '../src/lib/i18n.js';
import { requestCta, requestFlow } from '../src/templates/request.js';
import { market } from './fixtures.js';
import { DomEvent, runLpScript } from './mini_dom.js';

import worker from '../worker/index.js';

const SURVEY_PATH = '/api/request-survey';
const WAITLIST_PATH = '/api/waitlist';
const SIGNAL_PATH = '/api/request-signal';

const SIGNAL_STORAGE_KEY = 'pergram.request_signal_id';
const SIGNAL_ACK_KEY = 'pergram.request_signal_ack';

const BROWSER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const TEST_EMAIL = 'request@example.com';

/* ====================================================================== */
/* 本物の SQLite（worker/schema.sql をそのまま流す）                        */
/* ====================================================================== */

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const schemaSql = await readFile('worker/schema.sql', 'utf8');
const sqliteOptions = DatabaseSync ? {} : { skip: 'node:sqlite が無い Node で実行された' };

function makeRealEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);

  return {
    db,
    env: {
      DB: {
        prepare(sql) {
          const statement = db.prepare(sql);
          return {
            bind(...args) {
              const params = Object.fromEntries(args.map((value, index) => [index + 1, value]));
              return {
                async run() {
                  statement.run(params);
                  return { success: true };
                },
              };
            },
          };
        },
      },
      ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
    },
  };
}

const post = (path, body) =>
  new Request(`https://pergram.example${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const rowsOf = (db, table) => db.prepare(`SELECT * FROM ${table}`).all();

/* ====================================================================== */
/* ブラウザ側を通しで動かす                                                 */
/* ====================================================================== */

const t = await loadTranslator('ja');
const SCRIPT = 'src/assets/request.js';
const PAGE_ID = 'ja:protein';

const NUTRIENTS_OTHER_INPUT = 'テスト用の成分名';
const REQUESTS_INPUT = 'テスト用のご要望';

function page() {
  return `${requestCta(t, { location: 'products_request_top' })}
${requestCta(t, { location: 'products_request_bottom' })}
${requestFlow(t, { support: market.support, page: PAGE_ID })}`;
}

const callsTo = (dom, path) => dom.fetchCalls.filter((call) => call.url.includes(path));

/**
 * 要望ボタン → アンケート → （任意で）メールアドレス、と実際の順で操作する。
 *
 * @param {object} [options]
 * @param {Record<string, string>} [options.storage] localStorage の初期値
 * @param {string|null} [options.email] メールアドレスまで進めるなら文字列
 */
async function walkThrough({ storage = { [SIGNAL_STORAGE_KEY]: BROWSER_ID }, email = null } = {}) {
  const dom = await runLpScript(page(), {
    scriptPath: SCRIPT,
    storage,
    respond: () => ({ ok: true, status: 204 }),
  });

  dom.body.querySelectorAll('[data-request-cta]')[0].dispatchEvent(new DomEvent('click'));
  await dom.flush();

  const surveyForm = dom.body.querySelector('[data-request-survey]');
  surveyForm.querySelector('input[name="nutrients"][value="creatine"]').checked = true;
  surveyForm.querySelector('input[name="channel"][value="rakuten"]').checked = true;
  surveyForm.querySelector('[name="nutrients_other"]').value = NUTRIENTS_OTHER_INPUT;
  surveyForm.querySelector('[name="requests"]').value = REQUESTS_INPUT;
  surveyForm.dispatchEvent(new DomEvent('submit'));
  await dom.flush();

  if (email !== null) {
    const emailForm = dom.body.querySelector('[data-request-email]');
    emailForm.querySelector('input[type="email"]').value = email;
    emailForm.dispatchEvent(new DomEvent('submit'));
    await dom.flush();
  }

  return dom;
}

/** ブラウザが実際に送った本文を、そのまま受け口へ流し込む */
async function replay(dom, env) {
  const responses = [];
  for (const call of dom.fetchCalls) {
    const path = new URL(call.url, 'https://pergram.example').pathname;
    responses.push({ path, res: await worker.fetch(post(path, call.body), env) });
  }
  return responses;
}

/* ====================================================================== */
/* 1. 既存の待機リストの経路が壊れていない（A-4）                            */
/* ====================================================================== */

test('A-4 メールアドレスまで進めた人は、今までどおり waitlist に回答ごと残る', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();
  const dom = await walkThrough({ email: TEST_EMAIL });

  const responses = await replay(dom, env);
  for (const { path, res } of responses) {
    assert.ok(res.status < 400, `${path} が ${res.status} を返した`);
  }

  const waitlist = rowsOf(db, 'waitlist');
  assert.equal(waitlist.length, 1, '待機リストへの登録が壊れている');
  assert.equal(waitlist[0].email, TEST_EMAIL);
  assert.equal(waitlist[0].nutrients, 'creatine', '🔒 アンケートの相乗りが壊れている');
  assert.equal(waitlist[0].channel, 'rakuten');
  assert.equal(waitlist[0].nutrients_other, NUTRIENTS_OTHER_INPUT);
  assert.equal(waitlist[0].requests, REQUESTS_INPUT);
});

test('A-4 待機リストの2段階の追記（空で上書きしない）も壊れていない', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  // ステップ2まで答えたあとに、同じ人がステップ1だけをもう一度送る（T-011 の 🔒）
  await worker.fetch(
    post(WAITLIST_PATH, {
      email: TEST_EMAIL,
      nutrients: ['creatine'],
      channel: ['rakuten'],
      nutrients_other: 'グルタミン',
      requests: '送料込みで並べたい',
    }),
    env,
  );
  await worker.fetch(post(WAITLIST_PATH, { email: TEST_EMAIL }), env);

  const rows = rowsOf(db, 'waitlist');
  assert.equal(rows.length, 1, '同じメールアドレスで行が増えている');
  assert.equal(rows[0].nutrients, 'creatine', '🔒 空のステップ1が集めた回答を消している');
  assert.equal(rows[0].requests, '送料込みで並べたい');
});

test('A-4 押下の匿名シグナルも今までどおり3つの値で残る', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();
  const dom = await walkThrough({ storage: {} });

  await replay(dom, env);

  const signals = rowsOf(db, 'request_signal');
  assert.equal(signals.length, 1, '押下の匿名シグナルが残っていない');
  assert.equal(signals[0].page, PAGE_ID, '🔒 どのページで押されたかが失われている');
  assert.deepEqual(
    Object.keys(signals[0]).sort(),
    ['created_at', 'id', 'page'],
    '🔒 request_signal は3列で打ち止め',
  );
});

/* ====================================================================== */
/* 2. 同じ人が2つの表に残る — 数え方を固定する                              */
/* ====================================================================== */

/*
 * アンケートを送った時点で `request_survey` に1行、そのあとメールアドレスを入れると
 * `waitlist` にも同じ回答が1行入る。**同じ人の回答が2つの表に在る。**
 *
 * 🔒 だから「成分アンケート回答率」の分子は **`request_survey` の行数だけ**を数える。
 *    2つの表を足すと、メールアドレスまで進んだ人が2回数えられ、回答率が実際より高く出る。
 *    分子を多く見せる方向の誤りなので、広告の撤退判定を**続行側へ**誤らせる。
 * ⚠️ 2つの表は**突き合わせられない。** `waitlist` は識別子を持たず（6列で打ち止め）、
 *    `request_survey` はメールアドレスを持たない（入れた瞬間に匿名でなくなる）。
 *    これは欠陥ではなく、匿名性のために選ばれた形である。**名寄せを足したくなったら
 *    それは設計判断なので PO へ上げること。**
 */

test('同じ人がアンケートとメールアドレスの両方を出すと、2つの表に1行ずつ残る', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();
  const dom = await walkThrough({ email: TEST_EMAIL });

  await replay(dom, env);

  assert.equal(rowsOf(db, 'request_survey').length, 1);
  assert.equal(rowsOf(db, 'waitlist').length, 1);
});

test('🔒 分子は request_survey だけで足りる（メールまで進んだ人も必ず入っている）', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  // メールアドレスを入れない人と、入れる人。回答したのは2人
  await replay(await walkThrough({ storage: { [SIGNAL_STORAGE_KEY]: BROWSER_ID } }), env);
  await replay(
    await walkThrough({
      storage: { [SIGNAL_STORAGE_KEY]: '9f8b6c22-1d4e-4a77-b3f0-51c9a7e2d604' },
      email: TEST_EMAIL,
    }),
    env,
  );

  assert.equal(
    rowsOf(db, 'request_survey').length,
    2,
    '🔒 アンケートに答えた人が全員 request_survey に入っていない。' +
      'ここが分子なので、欠けると回答率が実際より低く出て撤退判定を誤らせる',
  );
  assert.equal(
    rowsOf(db, 'waitlist').length,
    1,
    '待機リストに入るのはメールアドレスを出した人だけ（部分集合）',
  );
});

test('🔒 2つの表は突き合わせられない（匿名性のための設計。名寄せを足さない）', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();
  await replay(await walkThrough({ email: TEST_EMAIL }), env);

  const survey = Object.keys(rowsOf(db, 'request_survey')[0]);
  const waitlist = Object.keys(rowsOf(db, 'waitlist')[0]);

  assert.ok(
    !survey.some((name) => /mail/i.test(name)),
    '🔒 request_survey にメールアドレスの列がある。入れた瞬間に匿名でなくなる',
  );
  assert.ok(
    !waitlist.includes('id'),
    '🔒 waitlist に匿名の識別子が足されている。6列で打ち止め（T-058）。' +
      '名寄せができる形にするのは設計判断であり、PO の判断を要する',
  );
});

/* ====================================================================== */
/* 3. 押下の匿名シグナルの再送（T-062）を壊していない                        */
/* ====================================================================== */

/*
 * 実装は `sendRequestSignal` の「受領済みなら送らない」早期 return を、
 * **識別子を控えたあと**へ動かしている。アンケートの回答を同じ id で送るために要る。
 *
 * 🔒 この2行の順序を元に戻すと、**2回目以降の訪問（受領済みのブラウザ）が
 *    アンケートの回答を1行も残せなくなる。** 押下は既に記録済みなので画面も
 *    サーバも異常を出さず、静かに回答だけが消える。T-062 が直した欠陥と同じ形である。
 */

test('🔒 受領済みのブラウザは押下を送り直さないが、アンケートの回答は送る', async () => {
  const dom = await walkThrough({
    storage: { [SIGNAL_STORAGE_KEY]: BROWSER_ID, [SIGNAL_ACK_KEY]: BROWSER_ID },
  });

  assert.equal(
    callsTo(dom, SIGNAL_PATH).length,
    0,
    '🔒 確認の取れたブラウザが押下を送り直している（T-062）',
  );
  const surveys = callsTo(dom, SURVEY_PATH);
  assert.equal(
    surveys.length,
    1,
    '🔒 2回目以降の訪問でアンケートの回答が送られていない。' +
      '押下は記録済みなので誰にも気づかれないまま回答だけが消える',
  );
  assert.equal(surveys[0].body.id, BROWSER_ID, '押下と違う識別子で送っている');
});

test('🔒 初回訪問では押下とアンケートが同じ識別子で送られる', async () => {
  const dom = await walkThrough({ storage: {} });

  const signal = callsTo(dom, SIGNAL_PATH)[0];
  const survey = callsTo(dom, SURVEY_PATH)[0];
  assert.ok(signal, '押下が送られていない');
  assert.ok(survey, 'アンケートが送られていない');
  assert.equal(
    survey.body.id,
    signal.body.id,
    '🔒 押下とアンケートで識別子が違う。同じブラウザが2人に見え、上書きも効かない',
  );
});

test('押下の送信が失敗しても、アンケートの回答は送られる', async () => {
  const dom = await runLpScript(page(), {
    scriptPath: SCRIPT,
    storage: { [SIGNAL_STORAGE_KEY]: BROWSER_ID },
    // 押下だけ 503。アンケートは通す
    respond: (call) =>
      call.url.includes(SIGNAL_PATH) ? { ok: false, status: 503 } : { ok: true, status: 204 },
  });

  dom.body.querySelectorAll('[data-request-cta]')[0].dispatchEvent(new DomEvent('click'));
  await dom.flush();
  const form = dom.body.querySelector('[data-request-survey]');
  form.querySelector('input[name="nutrients"][value="creatine"]').checked = true;
  form.dispatchEvent(new DomEvent('submit'));
  await dom.flush();

  assert.equal(
    callsTo(dom, SURVEY_PATH).length,
    1,
    '押下の保存が失敗するとアンケートの回答まで送られなくなっている',
  );
});

/* ====================================================================== */
/* 4. 2つの受け口がずれていない（検証の道具を重複させた代償を見る）          */
/* ====================================================================== */

/*
 * 実装は `allowedValues` / `freeText` を `worker/waitlist.js` と共有せず写した。
 * **稼働中の受け口を別の受け口の都合で動かさないため**であり、意図的である
 * （T-070 決定ログ）。ただし重複が抱える唯一の危険は**片方だけ直されてずれること**
 * なので、同じ入力に対して同じ結果になることをここで固定する。
 * ずれたらこのテストが落ちる。落ちたときに直すのはコードであって、この期待値ではない。
 */

const DRIFT_CASES = [
  {
    name: '許可リストに無い成分と購入先を落とし、重複を畳む',
    nutrients: ['creatine', 'aga_hair', 'hmb', 'creatine'],
    channel: ['unknown_shop', 'rakuten', 'rakuten'],
    nutrients_other: 'グルタミン',
    requests: '送料込みで並べたい',
  },
  {
    name: '単一の文字列で届いた選択肢も受ける（古い LP がキャッシュされている間）',
    nutrients: 'creatine',
    channel: 'yahoo',
    nutrients_other: null,
    requests: null,
  },
  {
    name: '空白だけの自由記述は null にする',
    nutrients: [],
    channel: [],
    nutrients_other: '   ',
    requests: '\n\t ',
  },
  {
    name: '上限を超えた自由記述は切る（弾かない）',
    nutrients: ['hmb'],
    channel: ['amazon'],
    nutrients_other: 'あ'.repeat(NUTRIENTS_OTHER_MAX + 40),
    requests: 'い'.repeat(REQUESTS_MAX + 300),
  },
];

/** 実行された SQL とバインド値だけを記録する偽の D1 */
function makeSpyEnv() {
  const writes = [];
  return {
    writes,
    env: {
      DB: {
        prepare(sql) {
          return {
            bind(...args) {
              return {
                async run() {
                  writes.push({ sql, args });
                  return { success: true };
                },
              };
            },
          };
        },
      },
      ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
    },
  };
}

for (const one of DRIFT_CASES) {
  test(`🔒 2つの受け口が同じ規則で扱う — ${one.name}`, async () => {
    const answer = {
      nutrients: one.nutrients,
      channel: one.channel,
      nutrients_other: one.nutrients_other,
      requests: one.requests,
    };

    const survey = makeSpyEnv();
    const surveyRes = await worker.fetch(
      post(SURVEY_PATH, { id: BROWSER_ID, ...answer }),
      survey.env,
    );
    const waitlist = makeSpyEnv();
    const waitlistRes = await worker.fetch(
      post(WAITLIST_PATH, { email: TEST_EMAIL, ...answer }),
      waitlist.env,
    );

    assert.equal(surveyRes.status, 204, `${SURVEY_PATH} が回答を弾いた`);
    assert.equal(waitlistRes.status, 200, `${WAITLIST_PATH} が回答を弾いた`);

    // どちらも [鍵, 成分, 購入先, その他, 要望, 日時] の順で並ぶ。
    // 鍵（識別子 / メールアドレス）と日時を外した4つを突き合わせる
    assert.deepEqual(
      survey.writes[0].args.slice(1, 5),
      waitlist.writes[0].args.slice(1, 5),
      '🔒 2つの受け口の扱いがずれた。検証の道具を写してあるのは意図的だが、' +
        '片方だけ直すと「同じ回答なのに保存された値が違う」が起きる',
    );
  });
}

test('🔒 自由記述の上限は src/lib/waitlist_fields.js の値そのものである', async () => {
  const spy = makeSpyEnv();
  await worker.fetch(
    post(SURVEY_PATH, {
      id: BROWSER_ID,
      nutrients: [],
      channel: [],
      nutrients_other: 'あ'.repeat(NUTRIENTS_OTHER_MAX + 1),
      requests: 'い'.repeat(REQUESTS_MAX + 1),
    }),
    spy.env,
  );

  const [, , , nutrientsOther, requests] = spy.writes[0].args;
  assert.equal(
    nutrientsOther.length,
    NUTRIENTS_OTHER_MAX,
    '🔒 上限を受け口が自前で持っている。画面の maxlength と食い違うと、' +
      '「入力できたのに保存されない」という説明のつかない挙動になる',
  );
  assert.equal(requests.length, REQUESTS_MAX);
});

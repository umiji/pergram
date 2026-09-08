/**
 * T-070 の受け入れテスト（テスト担当が実装より先に書いた分）。
 *
 * === 何が壊れているか ===
 * 要望の導線は 要望ボタン → アンケート → メールアドレス → 支援 の順に開く。
 * アンケートの回答は**メールアドレスの段を送ったときに `waitlist` へ相乗りする**
 * 作りになっており（`src/assets/request.js`）、`waitlist` は `email` が主キーなので
 * **メールアドレスを入れなかった人の回答は1文字も残らない。**
 *
 *   ボタンを押す           → request_signal に1行（id / created_at / page）
 *   アンケートに答える     → **何も残らない**  ← ここが欠落
 *   メールアドレスを入れる → waitlist に1行（回答も相乗り）
 *
 * 「押した → 成分を答えた → メールは入れない」人の回答は、次に何を載せるかを決める
 * 情報そのものであり、docs/research/validation-plan.md の「成分アンケート回答率」の
 * 分子でもある。
 *
 * === この修正の契約（テスト側で先に決めた。T-070 ## 判断してよい範囲） ===
 *   受け口        POST /api/request-survey        成功は 204 No Content（本文を返さない）
 *   テーブル      request_survey                  6列。id が主キー
 *   列            id / nutrients / channel / nutrients_other / requests / created_at
 *   送信本文      { id, nutrients, channel, nutrients_other, requests } **ちょうど**
 *   識別子        localStorage の pergram.request_signal_id（T-062。request_signal.id と同じ値）
 *
 * 🔒 **メールアドレスをこのテーブルにも本文にも入れない。** 入れた瞬間に匿名でなくなる。
 * 🔒 `waitlist`（6列）と `request_signal`（3列）の定義を変えない。既存データを壊さない。
 * 🔒 自由記述は `src/lib/waitlist_fields.js` の上限で**切る。弾かない**
 *    （N-01 / N-05。中身を解釈して弾くと、誤検知で正当な要望を捨てる）。
 * 🔒 回答数・人数を画面に出さない（N-03 / 景表法）。この経路は画面に何も足さない。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import { NUTRIENTS_OTHER_MAX, REQUESTS_MAX } from '../src/lib/waitlist_fields.js';
import { loadTranslator } from '../src/lib/i18n.js';
import { requestCta, requestFlow } from '../src/templates/request.js';
import { market } from './fixtures.js';
import { DomEvent, runLpScript } from './mini_dom.js';

import worker from '../worker/index.js';

/* ====================================================================== */
/* 契約（テスト側で先に決めた値。実装はこれに合わせる）                     */
/* ====================================================================== */

/** 匿名のアンケート回答の受け口 */
const SURVEY_PATH = '/api/request-survey';
/** 保存先。waitlist にも request_signal にも相乗りさせない */
const SURVEY_TABLE = 'request_survey';

/**
 * 保存する列。**識別子 / 成分 / 経路 / その他 / 自由記述 / 日時 の6つで打ち止め。**
 * 🔒 email を足さない。IP・User-Agent・リファラ・ページ内の位置も足さない。
 */
const SURVEY_COLUMNS = ['id', 'nutrients', 'channel', 'nutrients_other', 'requests', 'created_at'];

/**
 * 送信本文のキー。**ちょうど一致で検証する**（`worker/request_signal.js` と同じ厳しさ）。
 * 多い分を黙って捨てると、送っている側は「保存された」と思い込む。
 * `created_at` はサーバが打つので本文には無い。
 */
const PAYLOAD_KEYS = ['channel', 'id', 'nutrients', 'nutrients_other', 'requests'];

/** ブラウザごとの識別子の置き場（T-062）。request_signal.id と同じ値 */
const SIGNAL_STORAGE_KEY = 'pergram.request_signal_id';
const SIGNAL_ACK_KEY = 'pergram.request_signal_ack';

const SURVEY_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER_ID = '9f8b6c22-1d4e-4a77-b3f0-51c9a7e2d604';

const surveyBody = (over = {}) =>
  JSON.stringify({
    id: SURVEY_ID,
    nutrients: ['creatine'],
    channel: ['rakuten'],
    nutrients_other: 'グルタミン',
    requests: '送料込みで並べたい',
    ...over,
  });

/* ====================================================================== */
/* 偽の D1。実行された SQL とバインド値だけを見る                          */
/* ====================================================================== */

/*
 * tests/worker.test.js と同じ作り。テストファイルは import すると中のテストごと
 * 走ってしまうので共有せず写してある（tests/request_unify.test.js も同じ理由）。
 */
function makeEnv({ failWrite = false } = {}) {
  const writes = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async run() {
                if (failWrite) throw new Error('D1_ERROR: connection lost');
                writes.push({ sql, args });
                return { success: true };
              },
            };
          },
        };
      },
    },
    ASSETS: {
      async fetch(request) {
        return new Response('asset', {
          status: 200,
          headers: { 'x-from': new URL(request.url).pathname },
        });
      },
    },
  };
  return { env, writes };
}

const postSurvey = (bodyText) =>
  new Request(`https://pergram.example${SURVEY_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyText,
  });

const normalizeSql = (sql) => sql.replace(/\s+/g, ' ').toUpperCase();

/* ====================================================================== */
/* A-1: メールアドレス無しでも回答が1行残る                                 */
/* ====================================================================== */

test('A-1 メールアドレスを入れずにアンケートを送っても 204 を返し、本文を持たない', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(postSurvey(surveyBody()), env);

  assert.equal(res.status, 204, `${SURVEY_PATH} が 204 を返していません`);
  assert.equal(await res.text(), '');
});

test('A-1 保存されるのは6つの値（id / 成分 / 経路 / その他 / 自由記述 / 日時）', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(postSurvey(surveyBody()), env);

  assert.equal(writes.length, 1, 'アンケートの回答が1行も保存されていません');
  assert.equal(
    writes[0].args.length,
    SURVEY_COLUMNS.length,
    `🔒 保存する値は ${SURVEY_COLUMNS.join(' / ')} の6つだけ`,
  );
  assert.deepEqual(writes[0].args.slice(0, 5), [
    SURVEY_ID,
    'creatine',
    // 複数選択はカンマ区切りの1列に収める（waitlist と同じ。列は増やさない）
    'rakuten',
    'グルタミン',
    '送料込みで並べたい',
  ]);
  assert.match(
    writes[0].args[5],
    /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/,
    'created_at が ISO 8601 の文字列ではありません',
  );
});

test('A-1 🔒 保存先は request_survey だけ（waitlist にも request_signal にも触らない）', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(postSurvey(surveyBody()), env);

  const sql = normalizeSql(writes[0].sql);
  assert.ok(
    sql.includes(SURVEY_TABLE.toUpperCase()),
    `保存先が ${SURVEY_TABLE} ではありません: ${writes[0].sql}`,
  );
  assert.ok(!sql.includes('WAITLIST'), '🔒 匿名の回答が waitlist へ書き込まれています');
  assert.ok(
    !sql.includes('REQUEST_SIGNAL'),
    '🔒 匿名の回答が request_signal へ書き込まれています（3列で打ち止め）',
  );
});

/* ====================================================================== */
/* A-2: メールアドレスが含まれない                                          */
/* ====================================================================== */

test('A-2 🔒 メールアドレスを混ぜた本文は 400 で、DB に触らない', async () => {
  const { env, writes } = makeEnv();
  const res = await worker.fetch(postSurvey(surveyBody({ email: 'a@example.com' })), env);

  assert.equal(res.status, 400, '🔒 メールアドレス付きの本文が通っています');
  assert.equal(writes.length, 0, '🔒 メールアドレス付きの本文で DB に書き込んでいます');
});

test('A-2 🔒 保存された値にメールアドレスらしきものが混ざらない', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(
    postSurvey(surveyBody({ nutrients_other: 'a@example.com', requests: 'b@example.com' })),
    env,
  );

  // 自由記述に何を書かれても**中身は解釈しない**（N-01 / N-05）。ここで見るのは
  // 「サーバが列としてメールアドレスを持たないこと」であって、本文の検閲ではない。
  // したがって自由記述の中身は保存されてよい。列の数が増えていないことを見る。
  assert.equal(writes[0].args.length, SURVEY_COLUMNS.length);
  const sql = normalizeSql(writes[0].sql);
  assert.ok(!sql.includes('EMAIL'), '🔒 SQL に email 列が現れています');
});

/* ====================================================================== */
/* A-5: キー集合ちょうど一致（request_signal.js と同じ厳しさ）              */
/* ====================================================================== */

test('A-5 🔒 キー集合がちょうど一致しなければ 400（余分なキーを黙って無視しない）', async () => {
  const extras = [
    { ua: 'Mozilla/5.0' },
    { referrer: 'https://example.com/' },
    { location: 'products_request_top' },
    { page: 'ja:protein' },
    { email: 'a@example.com' },
    { age: 30 },
    { condition: '疲れやすい' },
  ];

  for (const extra of extras) {
    const { env, writes } = makeEnv();
    const res = await worker.fetch(postSurvey(surveyBody(extra)), env);
    assert.equal(res.status, 400, `${JSON.stringify(extra)} が弾かれていません`);
    assert.equal(writes.length, 0, `${JSON.stringify(extra)} で DB に書き込んでいます`);
  }
});

test('A-5 🔒 キーが足りない本文も 400（任意項目にしない）', async () => {
  for (const missing of PAYLOAD_KEYS) {
    const payload = JSON.parse(surveyBody());
    delete payload[missing];

    const { env, writes } = makeEnv();
    const res = await worker.fetch(postSurvey(JSON.stringify(payload)), env);
    assert.equal(res.status, 400, `${missing} の無い本文が通っています`);
    assert.equal(writes.length, 0, `${missing} の無い本文で DB に書き込んでいます`);
  }
});

test('A-5 id が UUID v4 でなければ 400 で、DB に触らない', async () => {
  for (const id of ['not-a-uuid', '', 12345, null, `${SURVEY_ID} `, ` ${SURVEY_ID}`]) {
    const { env, writes } = makeEnv();
    const res = await worker.fetch(postSurvey(surveyBody({ id })), env);
    assert.equal(res.status, 400, `id=${JSON.stringify(id)} が弾かれていません`);
    assert.equal(writes.length, 0, `id=${JSON.stringify(id)} で DB に書き込んでいます`);
  }
});

test('A-5 壊れた JSON と配列の本文は 400', async () => {
  for (const body of ['{', '[]', 'null', '"text"']) {
    const { env, writes } = makeEnv();
    const res = await worker.fetch(postSurvey(body), env);
    assert.equal(res.status, 400, `${body} が弾かれていません`);
    assert.equal(writes.length, 0);
  }
});

test('A-5 POST 以外は 405 を返し、許可メソッドを伝える', async () => {
  const { env, writes } = makeEnv();
  const res = await worker.fetch(new Request(`https://pergram.example${SURVEY_PATH}`), env);

  assert.equal(res.status, 405);
  assert.equal(res.headers.get('Allow'), 'POST');
  assert.equal(writes.length, 0);
});

test('A-5 🔒 保存に失敗しても応答に原因を書かない', async () => {
  const { env } = makeEnv({ failWrite: true });
  const res = await worker.fetch(postSurvey(surveyBody()), env);

  assert.equal(res.status, 503);
  const body = await res.text();
  assert.ok(!body.includes('D1_ERROR'), '応答に DB のエラーが漏れています');
  assert.ok(!body.includes(SURVEY_ID), '応答に識別子が漏れています');
});

/* ====================================================================== */
/* A-6: 自由記述は上限で切る。弾かない                                      */
/* ====================================================================== */

test('A-6 上限を超えた自由記述は切って保存する（弾かない）', async () => {
  const { env, writes } = makeEnv();
  const res = await worker.fetch(
    postSurvey(
      surveyBody({
        nutrients_other: 'あ'.repeat(NUTRIENTS_OTHER_MAX + 50),
        requests: 'い'.repeat(REQUESTS_MAX + 200),
      }),
    ),
    env,
  );

  assert.equal(res.status, 204, '🔒 長すぎる自由記述を弾いています。切るのが正しい');
  const [, , , nutrientsOther, requests] = writes[0].args;
  assert.equal(nutrientsOther.length, NUTRIENTS_OTHER_MAX);
  assert.equal(requests.length, REQUESTS_MAX);
});

test('A-6 空欄・空白だけの自由記述は null で保存する', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(postSurvey(surveyBody({ nutrients_other: '   ', requests: null })), env);

  const [, , , nutrientsOther, requests] = writes[0].args;
  assert.equal(nutrientsOther, null, '空白だけの入力は null にして列を汚さない');
  assert.equal(requests, null, 'null の自由記述は null のまま保存する');
});

test('A-6 🔒 許可リストにない成分と購入先は落とし、重複は畳む', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(
    postSurvey(
      surveyBody({
        nutrients: ['creatine', 'aga_hair', 'hmb', 'creatine'],
        channel: ['unknown_shop', 'rakuten', 'rakuten'],
      }),
    ),
    env,
  );

  assert.equal(writes[0].args[1], 'creatine,hmb');
  assert.equal(writes[0].args[2], 'rakuten');
});

test('A-6 何も選ばずに送っても1行残る（飛ばすのは skip ボタンの役目）', async () => {
  const { env, writes } = makeEnv();
  const res = await worker.fetch(
    postSurvey(surveyBody({ nutrients: [], channel: [], nutrients_other: null, requests: null })),
    env,
  );

  assert.equal(res.status, 204);
  assert.equal(writes.length, 1, '空の回答でも「送った」という事実は1行として残す');
});

/* ====================================================================== */
/* A-3 / A-4: 本物の SQLite で行の数と既存経路を見る                        */
/* ====================================================================== */

/*
 * 偽の D1 は実行された SQL しか見えないので、「行が増えないか」「既存のテーブルが
 * 壊れていないか」は判定できない。Node 同梱の `node:sqlite` に worker/schema.sql を
 * そのまま流して確かめる（tests/waitlist_upsert.test.js と同じ手）。
 * 依存パッケージは増やしていない。
 */

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

const surveyRows = (db) => db.prepare(`SELECT * FROM ${SURVEY_TABLE}`).all();
const waitlistRows = (db) => db.prepare('SELECT * FROM waitlist').all();

const postWaitlist = (body) =>
  new Request('https://pergram.example/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('A-1 メールアドレスを送っていなくても回答の行が残る', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();
  const res = await worker.fetch(postSurvey(surveyBody()), env);

  assert.equal(res.status, 204);
  assert.equal(waitlistRows(db).length, 0, 'メールアドレスを送っていないのに waitlist に行がある');
  assert.equal(
    surveyRows(db).length,
    1,
    '🔒 メールアドレスを入れなかった人の回答が捨てられている（T-070 の欠陥そのもの）',
  );
});

test('A-2 🔒 残った行のどこにもメールアドレスが無い', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();
  await worker.fetch(postSurvey(surveyBody()), env);

  const row = surveyRows(db)[0];
  assert.deepEqual(
    Object.keys(row).sort(),
    [...SURVEY_COLUMNS].sort(),
    `🔒 ${SURVEY_TABLE} の列は ${SURVEY_COLUMNS.join(' / ')} だけ`,
  );
  assert.ok(
    !Object.keys(row).some((name) => /mail/i.test(name)),
    '🔒 メールアドレスの列がある。入れた瞬間に匿名でなくなる',
  );
});

test('A-3 同じ識別子で2度答えても行は増えず、新しい回答で上書きされる', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(postSurvey(surveyBody()), env);
  await worker.fetch(
    postSurvey(
      surveyBody({
        nutrients: ['hmb'],
        channel: ['amazon'],
        nutrients_other: 'クエン酸',
        requests: '海外の製品も見たい',
      }),
    ),
    env,
  );

  const rows = surveyRows(db);
  assert.equal(rows.length, 1, '🔒 同じブラウザが何度答えても行は1つ（識別子が主キー）');
  assert.equal(rows[0].id, SURVEY_ID);
  assert.equal(rows[0].nutrients, 'hmb', '2度目の回答で上書きされていない');
  assert.equal(rows[0].channel, 'amazon');
  assert.equal(rows[0].nutrients_other, 'クエン酸');
  assert.equal(rows[0].requests, '海外の製品も見たい');
});

test('A-3 識別子が違えば別の行になる', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(postSurvey(surveyBody()), env);
  await worker.fetch(postSurvey(surveyBody({ id: OTHER_ID })), env);

  assert.equal(surveyRows(db).length, 2, '別のブラウザの回答が1行に潰れている');
});

test('A-4 メールアドレスを入れた場合の既存の経路が壊れていない', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  // アンケート（匿名）→ メールアドレス（既存の経路）の順。実際の導線と同じ
  await worker.fetch(postSurvey(surveyBody()), env);
  const res = await worker.fetch(
    postWaitlist({
      email: 'a@example.com',
      nutrients: ['creatine'],
      channel: ['rakuten'],
      nutrients_other: 'グルタミン',
      requests: '送料込みで並べたい',
    }),
    env,
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  const waitlist = waitlistRows(db);
  assert.equal(waitlist.length, 1, '待機リストへの保存が壊れている');
  assert.equal(waitlist[0].email, 'a@example.com');
  assert.equal(waitlist[0].nutrients, 'creatine');
  assert.equal(waitlist[0].requests, '送料込みで並べたい');

  // 匿名の回答は消えない。二重に数える経路ではあるが、突き合わせは識別子で行えない
  // （waitlist 側は識別子を持たない）ので、行はそのまま残す
  assert.equal(surveyRows(db).length, 1);
});

/* ====================================================================== */
/* A-1 / A-2 / A-3: ブラウザ側（送信するのは誰か・何を送るか）              */
/* ====================================================================== */

const t = await loadTranslator('ja');
const SCRIPT = 'src/assets/request.js';
const PAGE_ID = 'ja:protein';
const WAITLIST_ENDPOINT = '/api/waitlist';

/** 自由記述の本文が GA4 へ漏れていないかを見るための目印 */
const SENTINEL = 'ZZQ';
const NUTRIENTS_OTHER_INPUT = `テスト用の成分名${SENTINEL}`;
const REQUESTS_INPUT = `テスト用のご要望${SENTINEL}`;

function page() {
  return `${requestCta(t, { location: 'products_request_top' })}
${requestCta(t, { location: 'products_request_bottom' })}
${requestFlow(t, { support: market.support, page: PAGE_ID })}`;
}

const surveyCalls = (dom) => dom.fetchCalls.filter((call) => call.url.includes(SURVEY_PATH));
const waitlistCalls = (dom) => dom.fetchCalls.filter((call) => call.url.includes(WAITLIST_ENDPOINT));

/**
 * 要望ボタンを押し、アンケートに答えて送るところまで進める。
 *
 * @param {object} [options]
 * @param {(dom: object) => void} [options.beforeClick] 押す直前に環境をいじる
 * @param {boolean} [options.blank] 何も選ばずに送る
 */
async function answerSurvey({ beforeClick, blank = false, ...options } = {}) {
  const dom = await runLpScript(page(), {
    scriptPath: SCRIPT,
    storage: { [SIGNAL_STORAGE_KEY]: SURVEY_ID, [SIGNAL_ACK_KEY]: SURVEY_ID },
    respond: () => ({ ok: true, status: 204 }),
    ...options,
  });
  if (beforeClick) beforeClick(dom);

  const buttons = dom.body.querySelectorAll('[data-request-cta]');
  buttons[0].dispatchEvent(new DomEvent('click'));
  await dom.flush();

  const form = dom.body.querySelector('[data-request-survey]');
  assert.ok(form, 'アンケートのフォームがありません');
  if (!blank) {
    form.querySelector('input[name="nutrients"][value="creatine"]').checked = true;
    form.querySelector('input[name="channel"][value="rakuten"]').checked = true;
    form.querySelector('[name="nutrients_other"]').value = NUTRIENTS_OTHER_INPUT;
    form.querySelector('[name="requests"]').value = REQUESTS_INPUT;
  }

  form.dispatchEvent(new DomEvent('submit'));
  await dom.flush();

  return {
    dom,
    form,
    surveys: surveyCalls(dom),
    emailStep: dom.body.querySelector('[data-request-step="email"]'),
  };
}

test('A-1 アンケートを送るとサーバへ回答が飛ぶ（メールアドレスを入れる前に）', async () => {
  const { surveys, dom } = await answerSurvey();

  assert.equal(
    surveys.length,
    1,
    '🔒 アンケートの回答がサーバへ送られていない。' +
      'メールアドレスを入れなかった人の回答が今まで全部捨てられていた欠陥',
  );
  assert.equal(surveys[0].method, 'POST');
  assert.equal(
    waitlistCalls(dom).length,
    0,
    'メールアドレスの段を送っていないのに待機リストへ送っている',
  );
});

test('A-2 🔒 送信本文のキーはちょうど一致で、メールアドレスを含まない', async () => {
  const { surveys } = await answerSurvey();

  assert.deepEqual(
    Object.keys(surveys[0].body).sort(),
    PAYLOAD_KEYS,
    '🔒 送信本文のキーが契約と違う。受け口はキー集合ちょうど一致で 400 にする',
  );
  assert.deepEqual(surveys[0].body.nutrients, ['creatine']);
  assert.deepEqual(surveys[0].body.channel, ['rakuten']);
  assert.equal(surveys[0].body.nutrients_other, NUTRIENTS_OTHER_INPUT);
  assert.equal(surveys[0].body.requests, REQUESTS_INPUT);
});

test('A-3 送るのは押下と同じ識別子（pergram.request_signal_id）である', async () => {
  const { surveys, dom } = await answerSurvey();

  assert.equal(
    surveys[0].body.id,
    SURVEY_ID,
    '🔒 アンケートの回答が押下と別の識別子で送られている。' +
      '同じブラウザが2人に見え、上書きも効かない',
  );
  assert.equal(
    dom.storageData.get(SIGNAL_STORAGE_KEY),
    SURVEY_ID,
    '🔒 保存済みの識別子を書き換えている',
  );
});

test('A-1 送信が失敗しても次の段（メールアドレス）は開く', async () => {
  for (const [name, respond] of [
    ['400 が返っても', () => ({ ok: false, status: 400 })],
    ['通信が切れても', () => ({ reject: true })],
  ]) {
    const { emailStep, surveys } = await answerSurvey({ respond });
    assert.equal(surveys.length, 1, `${name}アンケートを送っていない`);
    assert.equal(emailStep.hidden, false, `${name}メールアドレスの段が開かない`);
  }
});

test('A-1 識別子を持たないブラウザでは送らないが、導線は止まらない', async () => {
  const { surveys, emailStep } = await answerSurvey({
    storage: {},
    beforeClick: (dom) => {
      dom.window.crypto = undefined;
    },
  });

  assert.equal(
    surveys.length,
    0,
    '🔒 識別子を作れない環境で疑似乱数を自作している。衝突すれば行が潰れ、回答が目減りする',
  );
  assert.equal(emailStep.hidden, false, '識別子が無いと導線が止まっている');
});

test('A-1 localStorage が例外を投げても導線は止まらない', async () => {
  const { emailStep } = await answerSurvey({
    beforeClick: (dom) => {
      dom.window.localStorage = {
        getItem() {
          throw new Error('SecurityError');
        },
        setItem() {
          throw new Error('SecurityError');
        },
        removeItem() {
          throw new Error('SecurityError');
        },
      };
    },
  });

  assert.equal(emailStep.hidden, false, 'localStorage が使えないと段が開かない');
});

test('A-4 メールアドレスの段は今までどおり待機リストへ6列の範囲で送る', async () => {
  const { dom } = await answerSurvey();

  const emailForm = dom.body.querySelector('[data-request-email]');
  emailForm.querySelector('input[type="email"]').value = 'request@example.com';
  emailForm.dispatchEvent(new DomEvent('submit'));
  await dom.flush();

  const calls = waitlistCalls(dom);
  assert.equal(calls.length, 1, '待機リストへの送信が壊れている');
  assert.deepEqual(
    Object.keys(calls[0].body).sort(),
    ['channel', 'email', 'nutrients', 'nutrients_other', 'requests'],
    '🔒 待機リストへ送る範囲は既存の6列のまま（created_at はサーバが打つ）',
  );
  assert.equal(calls[0].body.email, 'request@example.com');
  assert.equal(calls[0].body.requests, REQUESTS_INPUT);
});

test('A-2 🔒 匿名の回答の本文と GA4 にメールアドレスが載らない', async () => {
  const { dom } = await answerSurvey();

  const emailForm = dom.body.querySelector('[data-request-email]');
  emailForm.querySelector('input[type="email"]').value = 'request@example.com';
  emailForm.dispatchEvent(new DomEvent('submit'));
  await dom.flush();

  for (const call of surveyCalls(dom)) {
    assert.ok(
      !JSON.stringify(call.body).includes('request@example.com'),
      '🔒 匿名のアンケートの送信本文にメールアドレスが混ざっている',
    );
  }
  assert.ok(
    !JSON.stringify(dom.gtagCalls).includes('request@example.com'),
    '🔒 GA4 にメールアドレスが送られている',
  );
});

test('🔒 自由記述の本文を GA4 へ送らない（書かれたかどうかだけ）', async () => {
  const { dom } = await answerSurvey();

  assert.ok(
    !JSON.stringify(dom.gtagCalls).includes(SENTINEL),
    '🔒 自由記述の本文が GA4 へ流れている。数えてよいのは 0 / 1 だけ',
  );
  const hit = dom.events().find((event) => 'has_requests' in event.params);
  assert.ok(hit, 'request_survey_submit のパラメータが変わっている');
  assert.equal(hit.params.has_requests, 1);
  assert.equal(hit.params.has_nutrients_other, 1);
});

test('🔒 回答数・人数を画面に描画しない', async () => {
  const { dom } = await answerSurvey();

  const text = dom.body.textContent || '';
  assert.ok(
    !/\d+\s*(件|人|名)/.test(text),
    `🔒 押下数・回答数を画面に出している（N-03 / 景表法）: ${text.slice(0, 200)}`,
  );
});

/* ====================================================================== */
/* B-1 / B-2: スキーマと移行                                                */
/* ====================================================================== */

function parseColumns(inner) {
  return inner
    .split('\n')
    .map((line) => line.replace(/--.*/, '').trim())
    .filter(Boolean)
    .join(' ')
    .split(',')
    .map((one) => one.trim())
    .filter(Boolean)
    .map((one) => ({ name: one.split(/\s+/)[0].toLowerCase(), definition: one }));
}

/** テーブル定義の中身を、コメントと空白の違いを無視した1行にする */
function tableBody(sql, table) {
  const match = sql.match(
    new RegExp(`CREATE TABLE(?:\\s+IF NOT EXISTS)?\\s+${table}\\s*\\(([\\s\\S]*?)\\)\\s*;`, 'i'),
  );
  if (!match) return null;
  return {
    columns: parseColumns(match[1]),
    normalized: match[1]
      .split('\n')
      .map((line) => line.replace(/--.*/, ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .trim(),
  };
}

async function migrationFiles() {
  const dir = 'worker/migrations';
  const names = (await readdir(dir)).filter((name) => name.endsWith('.sql'));
  const files = [];
  for (const name of names) {
    files.push({ name, path: `${dir}/${name}`, sql: await readFile(`${dir}/${name}`, 'utf8') });
  }
  return files;
}

test(`B-1 worker/schema.sql に ${SURVEY_TABLE} があり、列は6つである`, async () => {
  const block = tableBody(schemaSql, SURVEY_TABLE);
  assert.ok(block, `worker/schema.sql に ${SURVEY_TABLE} テーブルの定義が無い`);

  assert.deepEqual(
    block.columns.map((one) => one.name),
    SURVEY_COLUMNS,
    `🔒 ${SURVEY_TABLE} の列は 識別子 / 成分 / 経路 / その他 / 自由記述 / 日時 の6つで打ち止め。` +
      'メールアドレス・IP・User-Agent・リファラ・ページ内の位置を足さない',
  );
  assert.match(
    block.columns[0].definition,
    /TEXT\s+PRIMARY KEY/i,
    '🔒 id が TEXT PRIMARY KEY でない。主キーでないと「同じブラウザで上書き」が成り立たない',
  );
  assert.match(
    block.columns[5].definition,
    /TEXT\s+NOT NULL/i,
    'created_at が TEXT NOT NULL でない',
  );
});

test(`B-1 同じ定義の移行 SQL が worker/migrations/ にある`, async () => {
  const schemaBlock = tableBody(schemaSql, SURVEY_TABLE);
  assert.ok(schemaBlock, `worker/schema.sql に ${SURVEY_TABLE} テーブルの定義が無い`);

  const found = (await migrationFiles())
    .map((file) => ({ file, block: tableBody(file.sql, SURVEY_TABLE) }))
    .filter((one) => one.block);

  assert.equal(
    found.length,
    1,
    `worker/migrations/ に ${SURVEY_TABLE} を作る移行 SQL がちょうど1本ない（見つかった数: ${found.length}）。` +
      'CREATE TABLE IF NOT EXISTS は稼働中の DB に効かないので、移行 SQL を別に置く',
  );
  assert.equal(
    found[0].block.normalized,
    schemaBlock.normalized,
    `${found[0].file.name}: 移行 SQL と worker/schema.sql の定義が食い違っている`,
  );
});

/**
 * 🔒 既存の2つのテーブルの定義。**1文字も変えない。**
 *    `waitlist` は6列で打ち止め（T-058）、`request_signal` は3列で打ち止め（T-058）。
 *    ここが変わるということは、稼働中の D1 と食い違うということである。
 *    コメントの手直しは通る（比較の前に落としている）が、列の定義は通らない。
 */
const FROZEN_TABLES = {
  waitlist:
    'email TEXT PRIMARY KEY, nutrients TEXT, channel TEXT, nutrients_other TEXT, ' +
    'requests TEXT, created_at TEXT NOT NULL',
  request_signal: 'id TEXT PRIMARY KEY, created_at TEXT NOT NULL, page TEXT',
};

test('B-2 🔒 waitlist と request_signal の定義が変わっていない', async () => {
  for (const [table, expected] of Object.entries(FROZEN_TABLES)) {
    const block = tableBody(schemaSql, table);
    assert.ok(block, `worker/schema.sql に ${table} テーブルの定義が無い`);
    assert.equal(
      block.normalized,
      expected,
      `🔒 ${table} の定義を変えている。既存データが入っているテーブルであり、` +
        'SQLite では主キーも列も後から変えられない',
    );
  }
});

/**
 * 既に流し終わっている移行が足した列。**これ以外を足さない。**
 * （`waitlist` の自由記述2列は T-011、`request_signal.page` は T-058。
 *  流し済みのファイルは書き換えられないので、既存の分は許す形で見る）
 */
const ALREADY_SHIPPED_COLUMNS = {
  waitlist: ['nutrients_other', 'requests'],
  request_signal: ['page'],
};

test('B-2 🔒 移行 SQL が既存の2つのテーブルに列を足していない', async () => {
  for (const file of await migrationFiles()) {
    // コメント行の説明（「ADD COLUMN IF NOT EXISTS は無い」など）を拾わない
    const sql = file.sql
      .split('\n')
      .map((line) => line.replace(/--.*/, ''))
      .join('\n');

    for (const [, table] of sql.matchAll(/DROP TABLE\s+(?:IF EXISTS\s+)?(\w+)/gi)) {
      assert.fail(`${file.name}: DROP TABLE ${table} がある。既存データを壊す`);
    }
    for (const [, table, column] of sql.matchAll(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/gi)) {
      const shipped = ALREADY_SHIPPED_COLUMNS[table.toLowerCase()];
      if (!shipped) continue;
      assert.ok(
        shipped.includes(column.toLowerCase()),
        `${file.name}: 🔒 ${table} に新しい列 "${column}" を足している。` +
          'waitlist は6列、request_signal は3列で打ち止め（T-058）。' +
          '匿名の回答は request_survey へ入れる',
      );
    }
  }
});

/* ====================================================================== */
/* B-3: デプロイ手順に移行SQLと順序の危険が書かれている                     */
/* ====================================================================== */

/*
 * T-058 で実際に踏んだ危険である。テーブルを作る前にコードをデプロイすると、
 * その窓の間の書き込みが全部失敗する。**`main` への push で本番へ出る**ので
 * （Cloudflare Workers Builds、docs/ops/deploy.md §4）、移行が先である。
 * 本番の D1 を触れるのは PO だけ（`npx wrangler d1 execute` は deny）。
 */

test('B-3 docs/ops/deploy.md に移行 SQL のファイル名が書かれている', async () => {
  const doc = await readFile('docs/ops/deploy.md', 'utf8');
  const found = (await migrationFiles()).filter((file) => tableBody(file.sql, SURVEY_TABLE));
  assert.equal(found.length, 1, `${SURVEY_TABLE} を作る移行 SQL が1本見つからない`);

  assert.ok(
    doc.includes(found[0].name),
    `docs/ops/deploy.md に "${found[0].name}" の実行手順が無い。` +
      '本番の D1 を触れるのは PO だけなので、手順が書かれていないと流されない',
  );
});

test('B-3 docs/ops/deploy.md にデプロイ順序の危険が書かれている', async () => {
  const doc = await readFile('docs/ops/deploy.md', 'utf8');

  // 「移行が先。コードが後」が読み取れること。語のどれかではなく、全部を要求する
  const required = [
    { token: SURVEY_TABLE, why: `${SURVEY_TABLE} テーブルの話であること` },
    { token: '順序', why: '順序が問題であること' },
    { token: 'デプロイ', why: 'デプロイとの関係であること' },
    { token: '失敗', why: '守らないと書き込みが失敗すること' },
  ];

  for (const { token, why } of required) {
    assert.ok(
      doc.includes(token),
      `docs/ops/deploy.md に "${token}" が無い（${why}）。` +
        '「テーブルを作る前にコードをデプロイすると書き込みが全部失敗する」を書く',
    );
  }
});

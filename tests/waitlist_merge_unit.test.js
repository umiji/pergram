/**
 * まとめる処理（T-072）の**単体テスト**。受け入れテスト
 * （tests/waitlist_merge.test.js）が見ていない2つの経路だけを見る。
 *
 * 1. **メールアドレスの行が先にできていた人**が、匿名の行を持ったまま
 *    もう一度メールアドレスを送る経路。
 *    匿名の行を消さずに `email` を書き込む実装だと `email TEXT UNIQUE` に当たって
 *    落ちる（503）。**消してから書く**順序でなければ通らない。
 *    受け入れテストは「アンケート → メール」の順しか通していないので、ここで見る。
 *
 * 2. **匿名の行の照会そのものが失敗した**とき。
 *    まとめるのは記録の都合であって、利用者の用は「待機リストに載ること」である。
 *    照会が落ちたくらいで登録ごと 503 にしない（行が2つ残るのは劣化であって障害ではない）。
 *
 * 🔒 どちらの経路でも `id` と `email` が同じ行に載らないことを併せて見る。
 *
 * === 差し戻し（2026-09-09、受け入れ判定 D-1 / レビュー R-1）で足した分 ===
 * 3. **まとめた後に匿名の行が作り直される**経路（控えの送り直し / 再アンケート）。
 *    ファイル後半の「D-1」の節。ブラウザ（`src/assets/request.js`）を
 *    `tests/mini_dom.js` で走らせ、その送信本文をそのまま受け口へ流し込んで見ている。
 * 4. 本文が `null` / 配列の JSON で 500 になっていた件（R-3）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadTranslator } from '../src/lib/i18n.js';
import { requestCta, requestFlow } from '../src/templates/request.js';
import { market } from './fixtures.js';
import { DomEvent, runLpScript } from './mini_dom.js';

import worker from '../worker/index.js';

/** node:sqlite は Node 22.5 以降。古い Node ではこのファイルごと飛ばす */
let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const schema = await readFile('worker/schema.sql', 'utf8');
const sqliteOptions = DatabaseSync ? {} : { skip: 'node:sqlite が無い Node で実行された' };

const BROWSER_ID = 'b1d9f0c4-6a2e-4c31-8f7b-2d5e91ac4470';
const EMAIL = 'merge-unit@example.com';
const ANSWERS = {
  nutrients: ['creatine'],
  channel: ['rakuten'],
  nutrients_other: 'グルタミン',
  requests: '送料込みで並べたい',
};

/**
 * 本物の SQLite を D1 の顔で包む。
 *
 * @param {{failLookup?: boolean}} [options] 匿名の行の照会（SELECT）だけを失敗させる
 */
function makeEnv({ failLookup = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);

  const bindParams = (args) => Object.fromEntries(args.map((value, index) => [index + 1, value]));

  const statement = (sql, params) => ({
    bind: (...args) => statement(sql, bindParams(args)),
    async run() {
      const result = db.prepare(sql).run(params ?? {});
      return { success: true, meta: { changes: Number(result.changes ?? 0) } };
    },
    async first(column) {
      if (failLookup) throw new Error('D1_ERROR: lookup failed');
      const row = db.prepare(sql).get(params ?? {});
      if (row === undefined) return null;
      return column === undefined ? row : (row[column] ?? null);
    },
  });

  return {
    db,
    env: {
      DB: {
        prepare: (sql) => statement(sql, null),
        async batch(statements) {
          const out = [];
          for (const one of statements) out.push(await one.run());
          return out;
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
    body: JSON.stringify(body),
  });

const allRows = (db) => db.prepare('SELECT * FROM waitlist').all();
const bothRows = (db) =>
  db.prepare('SELECT * FROM waitlist WHERE id IS NOT NULL AND email IS NOT NULL').all();

test(
  'メールアドレスの行が先にあっても、匿名の行を引き取って1行にまとめる',
  sqliteOptions,
  async () => {
    const { db, env } = makeEnv();

    // 1. 先にメールアドレスだけを登録した（回答なし）
    await worker.fetch(post('/api/waitlist', { email: EMAIL }), env);
    // 2. あとからアンケートに匿名で答えた（別の行になる）
    await worker.fetch(post('/api/request-survey', { id: BROWSER_ID, ...ANSWERS }), env);
    assert.equal(allRows(db).length, 2, '前提: この時点では2行ある');

    // 3. 同じブラウザからもう一度メールアドレスを送る（識別子を添えて）
    const res = await worker.fetch(
      post('/api/waitlist', { email: EMAIL, signal_id: BROWSER_ID }),
      env,
    );

    assert.equal(res.status, 200, 'email が既にある行と衝突して落ちている');
    const rows = allRows(db);
    assert.equal(rows.length, 1, `1行にまとまっていません（${rows.length} 行）`);
    assert.equal(rows[0].email, EMAIL);
    assert.equal(rows[0].id, null, '🔒 まとめた行に匿名の識別子が残っています');
    assert.equal(rows[0].nutrients, 'creatine', '匿名の行の回答が引き取られていません');
    assert.equal(rows[0].requests, ANSWERS.requests, '自由記述が引き取られていません');
    assert.equal(bothRows(db).length, 0);
  },
);

test(
  '匿名の行の照会が失敗しても、メールアドレスの登録は成立する（503 にしない）',
  sqliteOptions,
  async () => {
    const { db, env } = makeEnv({ failLookup: true });

    await worker.fetch(post('/api/request-survey', { id: BROWSER_ID, ...ANSWERS }), env);
    const res = await worker.fetch(
      post('/api/waitlist', { email: EMAIL, signal_id: BROWSER_ID, ...ANSWERS }),
      env,
    );

    assert.equal(res.status, 200, 'まとめる処理の失敗で登録ごと落としています');
    assert.deepEqual(await res.json(), { ok: true });

    const rows = allRows(db);
    assert.equal(rows.length, 2, 'まとめられないのは劣化として許すが、登録は残ること');
    assert.ok(
      rows.some((row) => row.email === EMAIL),
      'メールアドレスの行ができていません',
    );
    assert.equal(bothRows(db).length, 0, '🔒 id と email が同じ行に載っています');
  },
);

/* ====================================================================== */
/* D-1（差し戻し 2026-09-09）まとめた後に匿名の行が作り直されないこと        */
/* ====================================================================== */

/*
 * 受け入れ判定（D-1）とレビュー（R-1）が独立に見つけた欠陥の回帰。
 *
 *   1. アンケートの送信が 5xx / 通信断で失敗すると、控えが
 *      `pergram.request_survey_outbox` に残る
 *   2. メールアドレスを登録すると、まとめられて1行になる（ここまでは正しい）
 *   3. **次の訪問で控えが同じ識別子のまま送り直され、匿名の行が作り直される**
 *      → 行が2つに戻り、同じ回答が両方に入る（二重計上の復活）
 *   4. まとめた後に同じブラウザでアンケートに答え直しても同じことが起きる
 *
 * 🔒 **直したのはブラウザ側だけである。** 受け口の側は、まとめた時点で識別子を
 *    捨てている（それが T-072 の目的そのもの）ので、「この識別子はもう引き取り済みだ」
 *    と知る手段を**設計上持てない。** 持たせるには引き取り済みの識別子を保存する
 *    ことになり、匿名の押下とメールアドレスの紐づけが復活する。
 * 🔒 **控えの回答は捨てない。** 送り先を匿名の受け口から `/api/waitlist` へ移す。
 */

const OUTBOX_KEY = 'pergram.request_survey_outbox';
const SIGNAL_STORAGE_KEY = 'pergram.request_signal_id';
const SIGNAL_ACK_KEY = 'pergram.request_signal_ack';
const SURVEY_PATH = '/api/request-survey';
const WAITLIST_PATH = '/api/waitlist';

const t = await loadTranslator('ja');
const SCRIPT = 'src/assets/request.js';

const page = () => `${requestCta(t, { location: 'products_request_top' })}
${requestFlow(t, { support: market.support, page: 'ja:protein' })}`;

const callsTo = (dom, path) => dom.fetchCalls.filter((call) => call.url.includes(path));

/** アンケートの受け口だけを失敗させる（待機リストは成功させる） */
const surveyFails = (call) =>
  call.url.includes(SURVEY_PATH)
    ? { ok: false, status: 503 }
    : { ok: true, status: 200, body: { ok: true } };

const allOk = (call) =>
  call.url.includes(SURVEY_PATH)
    ? { ok: true, status: 204 }
    : { ok: true, status: 200, body: { ok: true } };

/** ページを開く。`storage` を渡すと前の訪問の localStorage を引き継げる */
const visit = (storage, respond) => runLpScript(page(), { scriptPath: SCRIPT, storage, respond });

/** 押下は受領済みにしておく（匿名シグナルの送信を混ぜない） */
const freshStorage = () => ({
  [SIGNAL_STORAGE_KEY]: BROWSER_ID,
  [SIGNAL_ACK_KEY]: BROWSER_ID,
});

const inherit = (dom) => Object.fromEntries(dom.storageData);

async function clickCta(dom) {
  dom.body.querySelectorAll('[data-request-cta]')[0].dispatchEvent(new DomEvent('click'));
  await dom.flush();
}

async function answerSurvey(dom) {
  const form = dom.body.querySelector('[data-request-survey]');
  form.querySelector('input[name="nutrients"][value="creatine"]').checked = true;
  form.querySelector('input[name="channel"][value="rakuten"]').checked = true;
  form.querySelector('[name="nutrients_other"]').value = ANSWERS.nutrients_other;
  form.querySelector('[name="requests"]').value = ANSWERS.requests;
  form.dispatchEvent(new DomEvent('submit'));
  await dom.flush();
}

async function skipSurvey(dom) {
  dom.body.querySelector('[data-request-skip="survey"]').dispatchEvent(new DomEvent('click'));
  await dom.flush();
}

async function submitEmail(dom) {
  const form = dom.body.querySelector('[data-request-email]');
  form.querySelector('input[type="email"]').value = EMAIL;
  form.dispatchEvent(new DomEvent('submit'));
  await dom.flush();
}

/** ブラウザが送った本文を、そのまま Worker へ流し込む */
async function replay(calls, env) {
  for (const call of calls) {
    const { pathname } = new URL(call.url, 'https://pergram.example');
    await worker.fetch(post(pathname, call.body), env);
  }
}

test(
  'D-1 送りきれなかった控えは、まとめた後の訪問で送り直されない（匿名の行が復活しない）',
  sqliteOptions,
  async () => {
    // 1回目の訪問: アンケートの送信だけ失敗し、メールアドレスの登録は成功する
    const first = await visit(freshStorage(), surveyFails);
    await clickCta(first);
    await answerSurvey(first);
    assert.ok(first.storageData.get(OUTBOX_KEY), '前提: 送れなかった回答が控えられている');
    await submitEmail(first);

    assert.equal(
      first.storageData.get(OUTBOX_KEY),
      undefined,
      '🔒 まとめた後も控えが残っています。次の訪問で匿名の行が作り直される',
    );

    // 2回目の訪問: 控えの送り直しが起きないこと
    const second = await visit(inherit(first), allOk);
    await second.flush();
    assert.equal(
      callsTo(second, SURVEY_PATH).length,
      0,
      '🔒 まとめた後の訪問で匿名の受け口へ送り直しています（匿名の行が復活する）',
    );

    // 通しで DB へ流し込む。行は1つのままで、回答も残っていること
    const { db, env } = makeEnv();
    await replay([...first.fetchCalls, ...second.fetchCalls], env);

    const rows = allRows(db);
    assert.equal(rows.length, 1, `行が ${rows.length} 行あります（二重計上が戻っている）`);
    assert.equal(rows[0].email, EMAIL);
    assert.equal(rows[0].id, null, '🔒 まとめた行に匿名の識別子が残っています');
    assert.equal(rows[0].nutrients, 'creatine', '回答が失われています');
    assert.equal(rows[0].requests, ANSWERS.requests, '自由記述が失われています');
    assert.equal(bothRows(db).length, 0);
  },
);

test(
  'D-1 控えが前の訪問のものしか無くても、回答は待機リストの行へ載って失われない',
  sqliteOptions,
  async () => {
    // 1回目: アンケートに答えたが送信に失敗。**メールアドレスは登録しないまま離脱**
    const first = await visit(freshStorage(), surveyFails);
    await clickCta(first);
    await answerSurvey(first);
    assert.ok(first.storageData.get(OUTBOX_KEY), '前提: 控えが残っている');

    // 2回目: 送り直しも失敗する。**このセッションでは回答が手元に無い**（答えていない）
    const second = await visit(inherit(first), surveyFails);
    await second.flush();
    assert.equal(callsTo(second, SURVEY_PATH).length, 1, '前提: 送り直しは試みている');
    assert.ok(second.storageData.get(OUTBOX_KEY), '前提: 5xx なので控えは残ったまま');

    // その2回目でメールアドレスだけを登録する（アンケートは飛ばす）
    await clickCta(second);
    await skipSurvey(second);
    await submitEmail(second);

    const [waitlistCall] = callsTo(second, WAITLIST_PATH);
    assert.ok(waitlistCall, 'メールアドレスが送られていません');
    assert.deepEqual(
      waitlistCall.body.nutrients,
      ANSWERS.nutrients,
      '🔒 前の訪問の回答が待機リストの送信に載っていません（控えを捨てると回答が失われる）',
    );
    assert.equal(waitlistCall.body.requests, ANSWERS.requests, '🔒 自由記述が失われています');
    assert.equal(waitlistCall.body.id, undefined, '🔒 控えの id をそのまま送っています');

    assert.equal(
      second.storageData.get(OUTBOX_KEY),
      undefined,
      '🔒 送信本文へ載せたのに控えが残っています',
    );

    const { db, env } = makeEnv();
    await replay([...first.fetchCalls, ...second.fetchCalls], env);

    const rows = allRows(db);
    assert.equal(rows.length, 1, `行が ${rows.length} 行あります`);
    assert.equal(rows[0].email, EMAIL);
    assert.equal(rows[0].nutrients, 'creatine', '🔒 前の訪問の回答が保存されていません');
    assert.equal(rows[0].requests, ANSWERS.requests);
  },
);

test(
  'D-1 まとめた後にもう一度アンケートへ答えても、匿名の行は作られない',
  sqliteOptions,
  async () => {
    // 1回目: 素直に通しで送ってまとめる
    const first = await visit(freshStorage(), allOk);
    await clickCta(first);
    await answerSurvey(first);
    await submitEmail(first);
    assert.equal(callsTo(first, SURVEY_PATH).length, 1, '前提: 1回目は匿名でも送っている');

    // 2回目: 同じブラウザでもう一度アンケートに答える
    const second = await visit(inherit(first), allOk);
    await clickCta(second);
    await answerSurvey(second);

    assert.equal(
      callsTo(second, SURVEY_PATH).length,
      0,
      '🔒 まとめた後の回答を匿名の受け口へ送っています（匿名の行が作り直される）',
    );
    assert.equal(
      second.storageData.get(OUTBOX_KEY),
      undefined,
      '🔒 送らないのに控えを作っています（次の訪問で送り直されてしまう）',
    );

    const { db, env } = makeEnv();
    await replay([...first.fetchCalls, ...second.fetchCalls], env);
    assert.equal(allRows(db).length, 1, '🔒 匿名の行が作り直されて2行になっています');
  },
);

test(
  'D-1 まとめた後に控えが書かれても、次の訪問で匿名の受け口へは送らない',
  sqliteOptions,
  async () => {
    // まとめるところまで進める
    const first = await visit(freshStorage(), allOk);
    await clickCta(first);
    await answerSurvey(first);
    await submitEmail(first);

    // 引き取りの後に控えが書かれた状態を作る（別のタブが送信に失敗した、
    // 控えを消す書き込みだけが失敗した、など）。**まとめ済みの印は引き継いでいる**
    const stale = {
      ...inherit(first),
      [OUTBOX_KEY]: JSON.stringify({ id: BROWSER_ID, ...ANSWERS }),
    };

    const second = await visit(stale, allOk);
    await second.flush();

    assert.equal(
      callsTo(second, SURVEY_PATH).length,
      0,
      '🔒 引き取り済みなのに控えを匿名の受け口へ送っています（匿名の行が復活する）',
    );
    assert.equal(
      second.storageData.get(OUTBOX_KEY),
      undefined,
      '🔒 送らない控えを抱えたままです。毎回の訪問でここへ戻ってくる',
    );
  },
);

/* ====================================================================== */
/* R-3 本文が null / 配列でも 500 にしない                                  */
/* ====================================================================== */

test('R-3 本文が null の JSON でも 500 にならず 400 を返す', sqliteOptions, async () => {
  const { db, env } = makeEnv();

  const res = await worker.fetch(post('/api/waitlist', null), env);

  assert.equal(
    res.status,
    400,
    '🔒 500 になっています（送り方の誤りを、サーバの故障として返している）',
  );
  assert.deepEqual(await res.json(), { error: 'invalid_json' });
  assert.equal(allRows(db).length, 0);
});

test('R-3 本文が配列の JSON でも 500 にならず 400 を返す', sqliteOptions, async () => {
  const { db, env } = makeEnv();

  const res = await worker.fetch(post('/api/waitlist', [{ email: EMAIL }]), env);

  assert.equal(res.status, 400);
  assert.equal(allRows(db).length, 0);
});

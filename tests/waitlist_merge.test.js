/**
 * T-072 の受け入れテスト（テスト担当が実装より先に書いた分。**この時点では落ちる**）。
 *
 * === 直す不具合 ===
 * 同じ人が「アンケートに答える → メールアドレスを登録する」の順に送ると、
 * `waitlist` に**2行**できる（`id` だけの匿名の行と、`email` だけの行）。
 * しかも `worker/waitlist.js` も回答4項目を書くため、**同じ回答が両方の行に入る。**
 * 「クレアチンを見たい人」を数えると**同じ人を2回数える** ——
 * docs/research/validation-plan.md の判定に直接効く。
 *
 * === 決まっている直し方（T-072 の決定ログ / PO 指摘） ===
 *
 *   **メールアドレスが送られた時点で、匿名の行へ `email` を書き込み、同時に `id` を捨てる。**
 *
 * - 行は**1つ**になる。回答は最初に答えたものが残る
 * - 残るのは `email` だけ。**`id` は消えるので、`request_signal` と突き合わせる鍵は
 *   どこにも保存されない**
 * - `CHECK (id IS NULL OR email IS NULL)` はそのまま効く（`id` を消してから
 *   `email` を入れる順序になるため）
 *
 * === 🔒 この修正でも越えない線 ===
 * **1行が `id` と `email` を同時に持ってはならない。CHECK 制約を外さない。**
 * `waitlist.id` に入るのは `request_signal.id` と**同じ匿名の識別子**である。
 * 同じ行が両方を持てたら、**それまで匿名だったボタン押下の1行1行が、すべて
 * メールアドレスへ紐づく。** 「1行にするために CHECK を外す」は解ではない。
 *
 * ⚠️ T-071 の「匿名の識別子とメールアドレスを同じ行に置かない」という**結論そのものは
 *    生きている。** 失効したのは「だから行を2つに分ける」という部分だけである
 *    （T-072 決定ログ / 2026-09-09）。
 *
 * === 識別子を載せるキーの名前は、実装の裁量である ===
 * T-072 ## 判断してよい範囲 に「匿名の識別子を `/api/waitlist` の本文へどう載せるか」が
 * 入っている。そこでこのファイルは**キー名を決め打ちしない** —— ブラウザ
 * （`src/assets/request.js`）を1度走らせて、**識別子の値が載っているキーを見つけてから**
 * サーバ側の検査に使う（`IDENTIFIER_KEY`）。未実装の間は `id` を仮に使うので、
 * サーバ側の検査は「まとめられていない」という**正しい理由で落ちる**。
 *
 * === 受け口のパスと本文の形は変えない ===
 * `/api/request-survey` は T-070 の出荷箱（`pergram.request_survey_outbox`）に
 * 控えられた回答の宛先である。**パスも本文のキー集合も1文字も変えない。**
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadTranslator } from '../src/lib/i18n.js';
import { requestCta, requestFlow } from '../src/templates/request.js';
import { market } from './fixtures.js';
import { DomEvent, runLpScript } from './mini_dom.js';

import worker from '../worker/index.js';

/* ====================================================================== */
/* 契約（テスト側で先に決めた値）                                          */
/* ====================================================================== */

const SURVEY_PATH = '/api/request-survey';
const WAITLIST_PATH = '/api/waitlist';
const ORIGIN = 'https://pergram.example';

/** ブラウザごとの識別子の置き場。request_signal.id と同じ値 */
const SIGNAL_STORAGE_KEY = 'pergram.request_signal_id';
const SIGNAL_ACK_KEY = 'pergram.request_signal_ack';

const BROWSER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER_ID = '9f8b6c22-1d4e-4a77-b3f0-51c9a7e2d604';
const EMAIL = 'merge@example.com';
const OTHER_EMAIL = 'other@example.com';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** メールアドレスの段が送ってよい、保存列そのままのキー。識別子はこれとは別に載る */
const EMAIL_PAYLOAD_KEYS = new Set(['email', 'nutrients', 'channel', 'nutrients_other', 'requests']);

/** アンケートの回答。まとめた後もこの4つが残っていること（A-2） */
const ANSWERS = {
  nutrients: ['creatine'],
  channel: ['rakuten'],
  nutrients_other: 'グルタミン',
  requests: '送料込みで並べたい',
};

const surveyBody = (over = {}) => ({ id: BROWSER_ID, ...ANSWERS, ...over });

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

/**
 * 本物の SQLite を D1 の顔で包む。
 *
 * ⚠️ tests/request_survey.test.js のものより**受け口を広く**とってある。
 *    まとめ方（UPDATE してから INSERT / 先に読んでから書く / batch）は
 *    T-072 ## 判断してよい範囲 に入っているので、**どの書き方でも動くようにする。**
 *    とくに `run()` が返す `meta.changes` は「UPDATE が当たったか」を見る実装が
 *    使うので、本物の値を通す。
 */
function makeRealEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);

  const bindParams = (args) => Object.fromEntries(args.map((value, index) => [index + 1, value]));

  const statement = (sql, params) => ({
    bind: (...args) => statement(sql, bindParams(args)),
    async run() {
      const result = db.prepare(sql).run(params ?? {});
      return {
        success: true,
        meta: {
          changes: Number(result.changes ?? 0),
          last_row_id: Number(result.lastInsertRowid ?? 0),
        },
      };
    },
    async first(column) {
      const row = db.prepare(sql).get(params ?? {});
      if (row === undefined) return null;
      return column === undefined ? row : (row[column] ?? null);
    },
    async all() {
      return { success: true, results: db.prepare(sql).all(params ?? {}) };
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
        async exec(sql) {
          db.exec(sql);
          return { count: 1 };
        },
      },
      ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
    },
  };
}

const postJson = (path, body) =>
  new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const postSurvey = (body) => postJson(SURVEY_PATH, body);
const postWaitlist = (body) => postJson(WAITLIST_PATH, body);

const allRows = (db) => db.prepare('SELECT * FROM waitlist').all();
const anonRows = (db) => db.prepare('SELECT * FROM waitlist WHERE id IS NOT NULL').all();
const emailRows = (db) => db.prepare('SELECT * FROM waitlist WHERE email IS NOT NULL').all();
/** 🔒 ここが1行でも返したら、匿名の押下がメールアドレスへ紐づいている */
const bothRows = (db) =>
  db.prepare('SELECT * FROM waitlist WHERE id IS NOT NULL AND email IS NOT NULL').all();

/** 回答4項目がこの行に残っているか（A-2） */
function assertAnswersKept(row, note = '') {
  assert.equal(row.nutrients, 'creatine', `${note}見たい成分の回答が失われている`);
  assert.equal(row.channel, 'rakuten', `${note}購入先の回答が失われている`);
  assert.equal(row.nutrients_other, ANSWERS.nutrients_other, `${note}自由記述（成分）が失われている`);
  assert.equal(row.requests, ANSWERS.requests, `${note}自由記述（要望）が失われている`);
}

/* ====================================================================== */
/* ブラウザ側（src/assets/request.js を最小の DOM で走らせる）              */
/* ====================================================================== */

const t = await loadTranslator('ja');
const SCRIPT = 'src/assets/request.js';
const PAGE_ID = 'ja:protein';

function page() {
  return `${requestCta(t, { location: 'products_request_top' })}
${requestFlow(t, { support: market.support, page: PAGE_ID })}`;
}

const callsTo = (dom, path) => dom.fetchCalls.filter((call) => call.url.includes(path));

/**
 * 押下 → アンケート送信 → メールアドレス送信、までを通しで動かす。
 *
 * @param {object} [options]
 * @param {boolean} [options.answerSurvey] アンケートに答えるか（false なら空のまま送る）
 * @param {boolean} [options.withIdentifier] 匿名の識別子を持つブラウザか
 * @param {string} [options.email] 送るメールアドレス
 */
async function runBrowserFlow({ answerSurvey = true, withIdentifier = true, email = EMAIL } = {}) {
  const dom = await runLpScript(page(), {
    scriptPath: SCRIPT,
    storage: withIdentifier ? { [SIGNAL_STORAGE_KEY]: BROWSER_ID, [SIGNAL_ACK_KEY]: BROWSER_ID } : {},
    respond: () => ({ ok: true, status: 204 }),
  });

  // 識別子を作る道具ごと持たないブラウザ（T-051 / T-070 と同じ作り方）
  if (!withIdentifier) dom.window.crypto = undefined;

  dom.body.querySelectorAll('[data-request-cta]')[0].dispatchEvent(new DomEvent('click'));
  await dom.flush();

  const surveyForm = dom.body.querySelector('[data-request-survey]');
  assert.ok(surveyForm, 'アンケートのフォームがありません');
  if (answerSurvey) {
    surveyForm.querySelector('input[name="nutrients"][value="creatine"]').checked = true;
    surveyForm.querySelector('input[name="channel"][value="rakuten"]').checked = true;
    surveyForm.querySelector('[name="nutrients_other"]').value = ANSWERS.nutrients_other;
    surveyForm.querySelector('[name="requests"]').value = ANSWERS.requests;
  }
  surveyForm.dispatchEvent(new DomEvent('submit'));
  await dom.flush();

  const emailForm = dom.body.querySelector('[data-request-email]');
  assert.ok(emailForm, 'メールアドレスのフォームがありません');
  emailForm.querySelector('input[type="email"]').value = email;
  emailForm.dispatchEvent(new DomEvent('submit'));
  await dom.flush();

  return {
    dom,
    surveys: callsTo(dom, SURVEY_PATH),
    waitlists: callsTo(dom, WAITLIST_PATH),
  };
}

/** ブラウザが送った本文を、そのまま Worker へ流し込む（通しの検査） */
async function replay(calls, env) {
  const out = [];
  for (const call of calls) {
    const { pathname } = new URL(call.url, ORIGIN);
    out.push(await worker.fetch(postJson(pathname, call.body), env));
  }
  return out;
}

/**
 * 匿名の識別子が載っているキーの名前を、ブラウザの送信本文から見つける。
 * **キー名は実装の裁量**（T-072 ## 判断してよい範囲）なので決め打ちしない。
 *
 * 未実装の間は見つからないので `id` を仮に置く —— サーバ側の検査は
 * 「識別子を渡しても1行にまとまらない」という**正しい理由で落ちる**。
 */
async function detectIdentifierKey() {
  try {
    const { waitlists } = await runBrowserFlow();
    const body = waitlists[0]?.body ?? {};
    const found = Object.keys(body).find((key) => body[key] === BROWSER_ID);
    return found ?? 'id';
  } catch {
    return 'id';
  }
}

const IDENTIFIER_KEY = await detectIdentifierKey();

/** メールアドレスの段の送信本文（識別子を添える形） */
const emailBody = ({ id = BROWSER_ID, email = EMAIL, answers = true } = {}) => ({
  email,
  ...(answers ? ANSWERS : {}),
  ...(id === null ? {} : { [IDENTIFIER_KEY]: id }),
});

/* ====================================================================== */
/* A-1: アンケート → メールの順に送ると waitlist は1行になる                */
/* ====================================================================== */

test('A-1 アンケート → メールの順に送っても waitlist は1行だけ', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(postSurvey(surveyBody()), env);
  const res = await worker.fetch(postWaitlist(emailBody()), env);

  assert.equal(res.status, 200, 'メールアドレスの登録が失敗している');
  assert.deepEqual(await res.json(), { ok: true });

  const rows = allRows(db);
  assert.equal(
    rows.length,
    1,
    `🔒 同じ人の行が ${rows.length} 行あります。アンケートに答えた人がメールアドレスを` +
      '登録すると二重に数えられる（T-072 の不具合そのもの）',
  );
});

test('A-1 まとめた1行は email を持ち、id は NULL である', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(postSurvey(surveyBody()), env);
  await worker.fetch(postWaitlist(emailBody()), env);

  const [row] = allRows(db);
  assert.ok(row, '行が1つも残っていません');
  assert.equal(row.email, EMAIL, 'まとめた行にメールアドレスが入っていない');
  assert.equal(
    row.id,
    null,
    '🔒 まとめた行に匿名の識別子が残っています。request_signal の押下がすべて' +
      'メールアドレスへ紐づく。**まとめるときは必ず id を捨てる**',
  );
});

test('A-1 メールの段の送信に、そのブラウザの匿名の識別子が載る', async () => {
  const { waitlists } = await runBrowserFlow();

  assert.equal(waitlists.length, 1, `待機リストへの送信が ${waitlists.length} 回です`);
  const { body } = waitlists[0];
  const carried = Object.keys(body).filter((key) => body[key] === BROWSER_ID);
  assert.equal(
    carried.length,
    1,
    '🔒 メールの段の送信に匿名の識別子が載っていません。' +
      'サーバは、どの匿名の行へ書き足せばよいか分からない（src/assets/request.js）',
  );
});

test('A-1 ブラウザの通し（押下 → アンケート → メール）でも行は1つ', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();
  const { dom, surveys, waitlists } = await runBrowserFlow();

  assert.equal(surveys.length, 1, 'アンケートがサーバへ送られていません');
  assert.equal(waitlists.length, 1, 'メールアドレスがサーバへ送られていません');

  await replay(dom.fetchCalls, env);

  const rows = allRows(db);
  assert.equal(rows.length, 1, `ブラウザの通しで ${rows.length} 行できています（1行であるべき）`);
  assert.equal(rows[0].email, EMAIL);
  assert.equal(rows[0].id, null, '🔒 通しで動かすと匿名の識別子が残る');
  assertAnswersKept(rows[0], '通しの検査: ');
});

/* ====================================================================== */
/* A-2: まとめた1行にアンケートの回答が残っている                           */
/* ====================================================================== */

test('A-2 まとめた1行にアンケートの回答が残っている', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(postSurvey(surveyBody()), env);
  await worker.fetch(postWaitlist(emailBody()), env);

  const rows = allRows(db);
  assert.equal(rows.length, 1, `行が ${rows.length} 行あります（まとめられていない）`);
  assert.equal(rows[0].email, EMAIL, 'まとめた行がメールアドレスの行になっていない');
  assertAnswersKept(rows[0]);
});

test('A-2 メールの送信に回答が載っていなくても、匿名の行の回答が消えない', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  // アンケートに答えた後で再訪し、メールアドレスだけを送る経路。
  // 送信本文の回答は空なので、**匿名の行の回答を残さなければ回答が消える。**
  await worker.fetch(postSurvey(surveyBody()), env);
  await worker.fetch(postWaitlist(emailBody({ answers: false })), env);

  const rows = allRows(db);
  assert.equal(rows.length, 1, `行が ${rows.length} 行あります（1行であるべき）`);
  assert.equal(rows[0].email, EMAIL);
  assertAnswersKept(rows[0], '🔒 空の送信で回答が消えた: ');
});

test('A-2 created_at が失われない（まとめた行が日時を持つ）', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(postSurvey(surveyBody()), env);
  await worker.fetch(postWaitlist(emailBody()), env);

  const rows = allRows(db);
  assert.equal(rows.length, 1, `行が ${rows.length} 行あります（まとめられていない）`);
  assert.ok(rows[0].created_at, 'まとめた行に created_at がありません（NOT NULL 列）');
});

/* ====================================================================== */
/* A-3: 🔒 id と email を両方持つ行は、どの経路でも作られない                */
/* ====================================================================== */

test('A-3 🔒 worker/schema.sql の CHECK 制約が残っている', async () => {
  const block = schemaSql.match(/CREATE TABLE IF NOT EXISTS waitlist\s*\(([\s\S]*?)\n\);/i);
  assert.ok(block, 'worker/schema.sql に waitlist テーブルの定義が見つかりません');
  const inner = block[1].replace(/--.*/g, '');

  assert.ok(
    /CHECK\s*\(\s*id\s+IS\s+NULL\s+OR\s+email\s+IS\s+NULL\s*\)/i.test(inner),
    '🔒 CHECK (id IS NULL OR email IS NULL) が消えています。' +
      '「1行にするために CHECK を外す」は解ではない（T-072 ## 禁止事項）',
  );
});

test('A-3 🔒 id と email を両方持つ行は DB が拒否する', sqliteOptions, () => {
  const { db } = makeRealEnv();

  assert.throws(
    () =>
      db
        .prepare('INSERT INTO waitlist (id, email, created_at) VALUES (?, ?, ?)')
        .run(BROWSER_ID, EMAIL, new Date().toISOString()),
    /CHECK|constraint/i,
    '🔒 CHECK 制約が効いていません。匿名の押下がメールアドレスへ紐づけられる',
  );
});

test('A-3 🔒 まとめた後、id と email を両方持つ行が1つも無い', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(postSurvey(surveyBody()), env);
  await worker.fetch(postWaitlist(emailBody()), env);

  assert.equal(bothRows(db).length, 0, '🔒 匿名の識別子とメールアドレスが同じ行に載っています');
});

test('A-3 🔒 どの順番・組み合わせで送っても、両方を持つ行は生まれない', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  // 1. アンケート → メール（まとめる経路）
  await worker.fetch(postSurvey(surveyBody()), env);
  await worker.fetch(postWaitlist(emailBody()), env);
  // 2. まとめた後にもう一度メール（識別子は localStorage に残ったまま送られてくる）
  await worker.fetch(postWaitlist(emailBody()), env);
  // 3. 別のブラウザがアンケートだけ答える
  await worker.fetch(postSurvey(surveyBody({ id: OTHER_ID })), env);
  // 4. その別のブラウザが、まとめた後にもう一度アンケートへ答える
  await worker.fetch(postSurvey(surveyBody({ id: BROWSER_ID })), env);
  // 5. 識別子を持たない人がメールだけ送る
  await worker.fetch(postWaitlist({ email: OTHER_EMAIL }), env);

  assert.equal(
    bothRows(db).length,
    0,
    '🔒 どこかの経路で id と email が同じ行に載りました：' +
      JSON.stringify(bothRows(db)),
  );
  for (const row of allRows(db)) {
    assert.notEqual(row.id, '', '🔒 id を空文字で埋めています（CHECK をすり抜け UNIQUE を潰す）');
    assert.notEqual(row.email, '', '🔒 email を空文字で埋めています');
  }
});

/* ====================================================================== */
/* A-4: メールだけを送った人（アンケート未回答）の経路が壊れていない          */
/* ====================================================================== */

test('A-4 メールアドレスだけを送っても 1行できる', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  const res = await worker.fetch(postWaitlist({ email: EMAIL }), env);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  const rows = allRows(db);
  assert.equal(rows.length, 1, `行が ${rows.length} 行です`);
  assert.equal(rows[0].email, EMAIL);
  assert.equal(rows[0].id, null, '🔒 アンケート未回答なのに匿名の識別子が入っている');
});

test('A-4 アンケートを飛ばした人でも、識別子付きのメール送信が通る', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  // 押下だけして、アンケートには何も答えずメールアドレスを送る。
  // このとき匿名の行はまだ無い（アンケートを送っていないので）
  const res = await worker.fetch(postWaitlist(emailBody({ answers: false })), env);

  assert.equal(res.status, 200, '匿名の行が無いときに 400 / 503 を返している');
  const rows = allRows(db);
  assert.equal(rows.length, 1, `行が ${rows.length} 行です`);
  assert.equal(rows[0].email, EMAIL);
  assert.equal(rows[0].id, null);
});

test('A-4 不正なメールアドレスは今までどおり 400 で、DB に触らない', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  const res = await worker.fetch(postWaitlist({ email: 'not-an-email' }), env);

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'invalid_email' });
  assert.equal(allRows(db).length, 0, '不正なメールアドレスで行ができている');
});

/* ====================================================================== */
/* A-5: アンケートだけを送った人の行が、そのまま id で残る                   */
/* ====================================================================== */

test('A-5 アンケートだけを送った人の行が id で残る', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  const res = await worker.fetch(postSurvey(surveyBody()), env);

  assert.equal(res.status, 204);
  const rows = anonRows(db);
  assert.equal(rows.length, 1, '🔒 メールアドレスを入れなかった人の回答が捨てられている');
  assert.equal(rows[0].id, BROWSER_ID);
  assert.equal(rows[0].email, null, '🔒 匿名の行に email が入っている');
  assertAnswersKept(rows[0]);
  assert.equal(emailRows(db).length, 0, 'メールアドレスの行が勝手にできている');
});

test('A-5 別の人がメールアドレスを登録しても、匿名の行は引き取られない', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  // BROWSER_ID の人はアンケートだけ答えた。**別のブラウザ**がメールアドレスを送る
  await worker.fetch(postSurvey(surveyBody()), env);
  await worker.fetch(postWaitlist(emailBody({ id: OTHER_ID, email: OTHER_EMAIL })), env);

  assert.equal(anonRows(db).length, 1, '🔒 他人の匿名の行が引き取られています');
  assert.equal(anonRows(db)[0].id, BROWSER_ID);
  assertAnswersKept(anonRows(db)[0], '🔒 他人の登録で回答が動いた: ');
  assert.equal(emailRows(db).length, 1);
  assert.equal(emailRows(db)[0].email, OTHER_EMAIL);
});

/* ====================================================================== */
/* A-6: 同じメールアドレスで2回目を送っても行が増えない                      */
/* ====================================================================== */

test('A-6 同じメールアドレスを2回送っても行は1つ（既存の上書きが効く）', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(postWaitlist({ email: EMAIL, ...ANSWERS }), env);
  await worker.fetch(postWaitlist({ email: EMAIL }), env);

  const rows = allRows(db);
  assert.equal(rows.length, 1, `同じメールアドレスで ${rows.length} 行できています`);
  assertAnswersKept(rows[0], '🔒 空の再送信で回答が消えた: ');
});

test('A-6 まとめた後にもう一度メールを送っても行が増えない', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  // localStorage の識別子は消えないので、2回目も同じ識別子が添えられて送られてくる
  await worker.fetch(postSurvey(surveyBody()), env);
  await worker.fetch(postWaitlist(emailBody()), env);
  await worker.fetch(postWaitlist(emailBody({ answers: false })), env);

  const rows = allRows(db);
  assert.equal(rows.length, 1, `2回目のメール送信で ${rows.length} 行になっています`);
  assert.equal(rows[0].email, EMAIL);
  assert.equal(rows[0].id, null, '🔒 2回目の送信で匿名の識別子が入り直している');
  assertAnswersKept(rows[0], '🔒 2回目のメール送信で回答が消えた: ');
});

test('A-6 違うメールアドレスは別の行になる', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(postWaitlist({ email: EMAIL }), env);
  await worker.fetch(postWaitlist({ email: OTHER_EMAIL }), env);

  assert.equal(allRows(db).length, 2, '別のメールアドレスが1行に潰れています');
});

/* ====================================================================== */
/* A-7: 匿名の識別子を持たないブラウザからのメール送信でも 400 にならない     */
/* ====================================================================== */

test('A-7 識別子のキーが無い本文でも 400 にならない', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  const res = await worker.fetch(postWaitlist({ email: EMAIL, ...ANSWERS }), env);

  assert.equal(res.status, 200, '🔒 識別子を必須にすると、作れない環境の人が登録できない');
  assert.equal(allRows(db).length, 1);
  assert.equal(allRows(db)[0].id, null);
});

test('A-7 識別子が null で送られてきても 400 にならない', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  const res = await worker.fetch(
    postWaitlist({ email: EMAIL, ...ANSWERS, [IDENTIFIER_KEY]: null }),
    env,
  );

  assert.equal(res.status, 200);
  const rows = allRows(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, null, '🔒 null の識別子を空文字などで保存している');
});

test('A-7 識別子の形が壊れていてもメールアドレスの登録は通る', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  const res = await worker.fetch(
    postWaitlist({ email: EMAIL, ...ANSWERS, [IDENTIFIER_KEY]: 'not-a-uuid' }),
    env,
  );

  assert.equal(
    res.status,
    200,
    '🔒 壊れた識別子でメールアドレスの登録ごと落としている（識別子は任意）',
  );
  const rows = allRows(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, EMAIL);
  assert.equal(rows[0].id, null, '🔒 UUID でない値を id 列へ保存している');
});

test('A-7 識別子を作れないブラウザでも、メールの段の送信が成立する', sqliteOptions, async () => {
  const { dom, surveys, waitlists } = await runBrowserFlow({ withIdentifier: false });

  assert.equal(surveys.length, 0, '🔒 識別子を作れない環境で疑似乱数を自作している');
  assert.equal(waitlists.length, 1, '識別子が無いとメールアドレスを送れなくなっている');

  const { body } = waitlists[0];
  for (const [key, value] of Object.entries(body)) {
    if (EMAIL_PAYLOAD_KEYS.has(key)) continue;
    assert.equal(
      value,
      null,
      `🔒 識別子を持たないブラウザなのに ${key}=${JSON.stringify(value)} を送っています` +
        '（空文字で埋めない）',
    );
  }
  assert.ok(
    !Object.values(body).some((value) => typeof value === 'string' && UUID_V4.test(value)),
    '🔒 識別子が無いはずのブラウザが UUID を送っています',
  );

  const { db, env } = makeRealEnv();
  const [res] = await replay(waitlists, env);
  assert.equal(res.status, 200, '識別子の無い送信が 400 / 503 で拒否されています');
  assert.equal(allRows(db).length, 1);
  assert.equal(allRows(db)[0].email, EMAIL);
  assert.equal(dom.navigations.length, 0, '🔒 送信後に別ページへ飛んでいます');
});

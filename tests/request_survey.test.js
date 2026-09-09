/**
 * T-071 の受け入れテスト（テスト担当が実装より先に書いた分）。
 * **T-070 の受け入れテストを、PO 判断による設計変更へ合わせて書き換えたものである。**
 *
 * === 何が変わったか（PO 判断 2026-09-08） ===
 * T-070 は匿名のアンケート回答を **`request_survey` という新しい表**へ入れる設計だった。
 * PO はこれを却下し、**「`waitlist` に挿入されるようにしてくれ。メールが PK になってるから
 * その制約を外すだけでいい。余計なテーブル追加しないでくれ」**と判断した。
 *
 *   T-058 の 🔒「waitlist は6列で打ち止め。匿名の押下を相乗りさせない」→ **失効**
 *   T-070 の「匿名の回答は新しい表へ入れる」                          → **失効**
 *   T-070 の受け入れ条件 B-2「既存2表の定義が1文字も変わらない」      → **失効**
 *
 * `request_survey` は**本番に一度も存在していない**（`num_tables` は 3 のまま）ので、
 * 定義ごと取り下げる。
 *
 * === 🔒 ただし、この1線だけは越えない ===
 * **1行が `id` と `email` を同時に持ってはならない。DB の CHECK 制約で強制する。**
 * `waitlist.id` に入るのは `request_signal.id` と**同じ匿名の識別子**である。
 * 同じ行が両方を持てたら、**それまで匿名だったボタン押下の1行1行が、すべて
 * メールアドレスへ紐づく。** `request_signal` が3列しか持たない理由
 * （「個人を識別できるものを何も持たないことが、この行の存在理由である」）が丸ごと崩れる。
 * **表を1つにするという PO の判断は、この線を越えることまでは含んでいない。**
 * 同じ人の回答が2行に分かれて重複するほうが、はるかに安全である。
 *
 * === この設計の契約（テスト側で先に決めた。T-071 ## 判断してよい範囲） ===
 *   受け口        POST /api/request-survey        **パスも本文の形も T-070 から変えない**
 *   保存先        waitlist（`id` を持つ行）        request_survey は作らない
 *   送信本文      { id, nutrients, channel, nutrients_other, requests } **ちょうど**
 *   識別子        localStorage の pergram.request_signal_id（request_signal.id と同じ値）
 *   書き込む列    **各受け口は自分の鍵の列だけを書く。**
 *                 /api/waitlist        → email + 回答4 + 日時（`id` に触らない）
 *                 /api/request-survey  → id    + 回答4 + 日時（`email` に触らない）
 *
 * ⚠️ 受け口のパスと本文の形を変えてはならない。T-070 で入れた出荷箱
 *    （`pergram.request_survey_outbox`）により、**503 で送れなかった回答が利用者の
 *    ブラウザに控えられている。**形を変えると、その控えは永久に送れず回答が失われる。
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

/** 匿名のアンケート回答の受け口。**T-070 から変えない**（出荷箱の控えが送れなくなる） */
const SURVEY_PATH = '/api/request-survey';
/** 保存先。**新しい表を作らない**（PO 判断） */
const STORE_TABLE = 'waitlist';

/**
 * 作り直したあとの `waitlist` の列。**7つ。**
 * 🔒 `id` は `request_signal.id` と同じ匿名の識別子。`email` と**同じ行には入らない**。
 */
const WAITLIST_COLUMNS = [
  'id',
  'email',
  'nutrients',
  'channel',
  'nutrients_other',
  'requests',
  'created_at',
];

/**
 * 受け口が1回の書き込みでバインドする値の数。**どちらの受け口も6つ。**
 * 🔒 **各受け口は自分の鍵の列だけを書く。** `/api/waitlist` は `id` に触らず、
 *    `/api/request-survey` は `email` に触らない。触らない列は NULL のまま残る。
 *    こうしておくと「もう一方の鍵を、うっかり空文字で埋める」経路がそもそも作れない。
 */
const BOUND_VALUES = 6;

/**
 * 送信本文のキー。**ちょうど一致で検証する**（`worker/request_signal.js` と同じ厳しさ）。
 * ⚠️ **T-070 から1文字も変えない。**出荷箱に控えられた回答がこの形で送られてくる。
 */
const PAYLOAD_KEYS = ['channel', 'id', 'nutrients', 'nutrients_other', 'requests'];

/** ブラウザごとの識別子の置き場。request_signal.id と同じ値 */
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
    BOUND_VALUES,
    '🔒 匿名の受け口が書くのは id / 成分 / 経路 / その他 / 自由記述 / 日時 の6つだけ。' +
      'email の列に触らない',
  );
  assert.deepEqual(writes[0].args.slice(0, 5), [
    SURVEY_ID,
    'creatine',
    // 複数選択はカンマ区切りの1列に収める（列は増やさない）
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

test('A-1 🔒 保存先は waitlist だけ（新しい表を作らない・request_signal に触らない）', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(postSurvey(surveyBody()), env);

  const sql = normalizeSql(writes[0].sql);
  assert.ok(
    sql.includes(STORE_TABLE.toUpperCase()),
    `保存先が ${STORE_TABLE} ではありません: ${writes[0].sql}`,
  );
  assert.ok(
    !sql.includes('REQUEST_SURVEY'),
    '🔒 PO が却下した request_survey 表がまだ使われています（余計な表を作らない）',
  );
  assert.ok(
    !sql.includes('REQUEST_SIGNAL'),
    '🔒 匿名の回答が request_signal へ書き込まれています（3列で打ち止め）',
  );
});

/* ====================================================================== */
/* A-4 / A-2: 匿名の識別子とメールアドレスを同じ行に置かない                 */
/* ====================================================================== */

test('A-4 🔒 メールアドレスを混ぜた本文は 400 で、DB に触らない', async () => {
  const { env, writes } = makeEnv();
  const res = await worker.fetch(postSurvey(surveyBody({ email: 'a@example.com' })), env);

  assert.equal(res.status, 400, '🔒 メールアドレス付きの本文が通っています');
  assert.equal(writes.length, 0, '🔒 メールアドレス付きの本文で DB に書き込んでいます');
});

test('A-4 🔒 匿名の受け口の SQL は email 列に一切触らない', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(
    postSurvey(surveyBody({ nutrients_other: 'a@example.com', requests: 'b@example.com' })),
    env,
  );

  // 自由記述に何を書かれても**中身は解釈しない**（N-01 / N-05）。ここで見るのは
  // 「受け口が email という列を書き込みの対象にしていないこと」であって、本文の検閲ではない。
  assert.equal(writes[0].args.length, BOUND_VALUES);
  const sql = normalizeSql(writes[0].sql);
  assert.ok(
    !sql.includes('EMAIL'),
    '🔒 匿名の受け口が email 列を触っている。同じ行が id と email を持つ入口になる: ' +
      writes[0].sql,
  );
});

/* ====================================================================== */
/* A-5: 受け口の形は T-070 から変えない（出荷箱の控えが送れなくなる）        */
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

test('A-5 🔒 出荷箱に控えられた形の本文が、そのまま 204 で受け取られる', async () => {
  // T-070 の出荷箱（pergram.request_survey_outbox）が控えているのはこの形である。
  // パスか本文の形を変えると、控えは永久に送れず回答が失われる
  const { env, writes } = makeEnv();
  const res = await worker.fetch(
    postSurvey(
      JSON.stringify({
        id: SURVEY_ID,
        nutrients: ['creatine', 'hmb'],
        channel: ['rakuten'],
        nutrients_other: null,
        requests: null,
      }),
    ),
    env,
  );

  assert.equal(res.status, 204, '🔒 出荷箱に控えられた形の本文が通らない。控えが永久に送れなくなる');
  assert.equal(writes.length, 1);
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

const allRows = (db) => db.prepare('SELECT * FROM waitlist').all();
/** 匿名の回答の行（アンケート回答率の分子はこちら） */
const anonRows = (db) => db.prepare('SELECT * FROM waitlist WHERE id IS NOT NULL').all();
/** メールアドレスを預かった行 */
const emailRows = (db) => db.prepare('SELECT * FROM waitlist WHERE email IS NOT NULL').all();

const postWaitlist = (body) =>
  new Request('https://pergram.example/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('A-1 メールアドレスを送っていなくても waitlist に1行残る', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();
  const res = await worker.fetch(postSurvey(surveyBody()), env);

  assert.equal(res.status, 204);
  assert.equal(
    anonRows(db).length,
    1,
    '🔒 メールアドレスを入れなかった人の回答が捨てられている（T-070 / T-071 の欠陥そのもの）',
  );
  assert.equal(emailRows(db).length, 0, 'メールアドレスの行が勝手にできている');

  const row = anonRows(db)[0];
  assert.equal(row.id, SURVEY_ID);
  assert.equal(row.email, null, '🔒 匿名の行に email が入っている');
  assert.equal(row.nutrients, 'creatine');
  assert.equal(row.requests, '送料込みで並べたい');
});

test('A-2 メールアドレスを入れた行は id が NULL のまま入る', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();
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

  const rows = emailRows(db);
  assert.equal(rows.length, 1, '待機リストへの登録が壊れている');
  assert.equal(rows[0].email, 'a@example.com');
  assert.equal(rows[0].id, null, '🔒 メールアドレスの行に匿名の識別子が入っている');
  assert.equal(rows[0].nutrients, 'creatine');
  assert.equal(rows[0].requests, '送料込みで並べたい');
});

test('A-2 待機リストの2段階の追記（空で上書きしない）が壊れていない', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(
    postWaitlist({
      email: 'a@example.com',
      nutrients: ['creatine'],
      channel: ['rakuten'],
      nutrients_other: 'グルタミン',
      requests: '送料込みで並べたい',
    }),
    env,
  );
  // 登録済みに気づかず、もう一度メールアドレスだけを送ってくる経路（T-011 の 🔒）
  await worker.fetch(postWaitlist({ email: 'a@example.com' }), env);

  const rows = emailRows(db);
  assert.equal(rows.length, 1, '同じメールアドレスで行が増えている');
  assert.equal(rows[0].nutrients, 'creatine', '🔒 空のステップ1が集めた回答を消している');
  assert.equal(rows[0].requests, '送料込みで並べたい');
});

test('A-3 同じ識別子で2度答えても行は増えない', sqliteOptions, async () => {
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

  const rows = anonRows(db);
  assert.equal(rows.length, 1, '🔒 同じブラウザが何度答えても行は1つ');
  assert.equal(rows[0].id, SURVEY_ID);
  assert.equal(rows[0].nutrients, 'hmb', '2度目の回答で上書きされていない');
  assert.equal(rows[0].requests, '海外の製品も見たい');
  assert.equal(rows[0].email, null, '🔒 上書きの過程で email が入っている');
});

test('A-3 識別子が違えば別の行になる', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(postSurvey(surveyBody()), env);
  await worker.fetch(postSurvey(surveyBody({ id: OTHER_ID })), env);

  assert.equal(anonRows(db).length, 2, '別のブラウザの回答が1行に潰れている');
});

test('A-2 匿名の行とメールアドレスの行は同じ表で共存する', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(postSurvey(surveyBody()), env);
  await worker.fetch(postWaitlist({ email: 'a@example.com', nutrients: ['creatine'] }), env);

  assert.equal(allRows(db).length, 2, '匿名の行とメールアドレスの行が同居できていない');
  assert.equal(anonRows(db).length, 1);
  assert.equal(emailRows(db).length, 1);
});

/* ====================================================================== */
/* A-4: 🔒 id と email を両方持つ行を、DB が拒否する                        */
/* ====================================================================== */

/*
 * **このタスクで最も重要な検査である。**
 *
 * `waitlist.id` に入るのは `request_signal.id` と同じ匿名の識別子である。
 * 同じ行が `id` と `email` を両方持てたら、**それまで匿名だったボタン押下の
 * 1行1行が、すべてメールアドレスへ紐づく。**
 *
 * 🔒 **運用で気をつける、では守れない。** 理由を知らない担当が将来必ず両方入れる。
 *    DB が拒否する形にしておけば、間違えた時点で落ちる。
 * 🔒 この CHECK 制約を消すと、下の3件が落ちる。**落ちたら、直すのは制約であって
 *    この期待値ではない。**
 */

test('A-4 🔒 id と email を両方持つ行は DB が拒否する', sqliteOptions, () => {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);

  assert.throws(
    () => {
      db.prepare(
        `INSERT INTO waitlist (id, email, nutrients, channel, nutrients_other, requests, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(SURVEY_ID, 'a@example.com', 'creatine', 'rakuten', null, null, '2026-09-08T00:00:00Z');
    },
    /CHECK|constraint/i,
    '🔒 匿名の識別子とメールアドレスを同じ行に置けてしまう。' +
      'それまで匿名だったボタン押下の1行1行が、すべてメールアドレスへ紐づく。' +
      'CHECK 制約で DB に拒否させること',
  );
});

test('A-4 🔒 片方だけの行は通る（制約が広すぎない）', sqliteOptions, () => {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);

  const insert = (id, email) =>
    db.prepare(
      `INSERT INTO waitlist (id, email, nutrients, channel, nutrients_other, requests, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, email, 'creatine', 'rakuten', null, null, '2026-09-08T00:00:00Z');

  insert(SURVEY_ID, null);
  insert(null, 'a@example.com');

  assert.equal(allRows(db).length, 2, '片方だけの行まで拒否している。制約が広すぎる');
});

test('A-4 🔒 匿名の行へ後から email を書き足すこともできない', sqliteOptions, () => {
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);

  db.prepare(
    `INSERT INTO waitlist (id, nutrients, channel, nutrients_other, requests, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(SURVEY_ID, 'creatine', 'rakuten', null, null, '2026-09-08T00:00:00Z');

  assert.throws(
    () => db.prepare('UPDATE waitlist SET email = ? WHERE id = ?').run('a@example.com', SURVEY_ID),
    /CHECK|constraint/i,
    '🔒 UPDATE で紐づけられてしまう。CHECK 制約は INSERT だけでなく UPDATE も止める',
  );
});

/* ====================================================================== */
/* A-1 / A-2 / A-3 / A-5: ブラウザ側                                       */
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

async function answerSurvey({ beforeClick, blank = false, ...options } = {}) {
  const dom = await runLpScript(page(), {
    scriptPath: SCRIPT,
    storage: { [SIGNAL_STORAGE_KEY]: SURVEY_ID, [SIGNAL_ACK_KEY]: SURVEY_ID },
    respond: () => ({ ok: true, status: 204 }),
    ...options,
  });
  if (beforeClick) beforeClick(dom);

  dom.body.querySelectorAll('[data-request-cta]')[0].dispatchEvent(new DomEvent('click'));
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

  assert.equal(surveys.length, 1, '🔒 アンケートの回答がサーバへ送られていない');
  assert.equal(surveys[0].method, 'POST');
  assert.equal(waitlistCalls(dom).length, 0, 'メールの段を送っていないのに待機リストへ送っている');
});

test('A-5 🔒 送信先も本文のキーも T-070 から変わっていない', async () => {
  const { surveys } = await answerSurvey();

  assert.ok(
    surveys[0].url.includes(SURVEY_PATH),
    `🔒 受け口のパスが変わっている。出荷箱に控えられた回答が永久に送れなくなる: ${surveys[0].url}`,
  );
  assert.deepEqual(
    Object.keys(surveys[0].body).sort(),
    PAYLOAD_KEYS,
    '🔒 送信本文のキーが変わっている。出荷箱の控えは古い形のまま送られてくる',
  );
  assert.deepEqual(surveys[0].body.nutrients, ['creatine']);
  assert.equal(surveys[0].body.requests, REQUESTS_INPUT);
});

test('A-3 送るのは押下と同じ識別子（pergram.request_signal_id）である', async () => {
  const { surveys, dom } = await answerSurvey();

  assert.equal(surveys[0].body.id, SURVEY_ID, '🔒 押下と別の識別子で送っている');
  assert.equal(dom.storageData.get(SIGNAL_STORAGE_KEY), SURVEY_ID, '保存済みの識別子を書き換えている');
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

  assert.equal(surveys.length, 0, '🔒 識別子を作れない環境で疑似乱数を自作している');
  assert.equal(emailStep.hidden, false, '識別子が無いと導線が止まっている');
});

test('A-2 メールアドレスの段は今までどおり待機リストへ6列の範囲で送る', async () => {
  const { dom } = await answerSurvey();

  const emailForm = dom.body.querySelector('[data-request-email]');
  emailForm.querySelector('input[type="email"]').value = 'request@example.com';
  emailForm.dispatchEvent(new DomEvent('submit'));
  await dom.flush();

  const calls = waitlistCalls(dom);
  assert.equal(calls.length, 1, '待機リストへの送信が壊れている');

  // ⚠️ **ここは T-072（PO 指摘 2026-09-09）で緩めた。**
  //    以前は「キーはちょうどこの5つ。id を混ぜない（同じ行が両方を持つ入口を作らない）」
  //    だった。**行を2つに分ける設計そのものが誤りだったため失効している** ——
  //    同じ人がアンケートとメールに答えると2行できて、同じ回答が両方に入り、
  //    「クレアチンを見たい人」を数えると同じ人を2回数えていた。
  //    直し方は「メールが送られた時点で匿名の行へ email を書き込み、**同時に id を捨てる**」で、
  //    そのために**メールの段は匿名の識別子を添えて送る**（T-072 ## 変更範囲）。
  // 🔒 **守るべき線は変わっていない。「id と email を同じ行に保存しない」である。**
  //    送信本文に識別子が載ることと、保存された1行が両方を持つことは別の話であり、
  //    後者は DB の CHECK 制約と tests/waitlist_merge.test.js の A-3 群が見張る。
  // 🔒 保存列の外の項目（年齢・体調など）を混ぜないことは、ここで見張り続ける。
  for (const key of Object.keys(calls[0].body)) {
    const isIdentifier = calls[0].body[key] === SURVEY_ID;
    assert.ok(
      ['channel', 'email', 'nutrients', 'nutrients_other', 'requests'].includes(key) || isIdentifier,
      `🔒 待機リストへ保存列の外の項目を送っています: ${key}`,
    );
  }
  assert.equal(calls[0].body.email, 'request@example.com');
});

test('A-4 🔒 匿名の回答の本文と GA4 にメールアドレスが載らない', async () => {
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
});

test('🔒 回答数・人数を画面に描画しない', async () => {
  const { dom } = await answerSurvey();

  const text = dom.body.textContent || '';
  assert.ok(!/\d+\s*(件|人|名)/.test(text), `🔒 押下数・回答数を画面に出している（N-03）: ${text.slice(0, 200)}`);
});

/* ====================================================================== */
/* B 群: スキーマと移行                                                     */
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
    .map((one) => one.split(/[\s(]/)[0].toLowerCase())
    .filter((name) => /^[a-z_]+$/.test(name) && !['primary', 'unique', 'foreign', 'check'].includes(name));
}

function tableBlock(sql, table) {
  const match = sql.match(
    new RegExp(`CREATE TABLE(?:\\s+IF NOT EXISTS)?\\s+${table}\\s*\\(([\\s\\S]*?)\\n\\)\\s*;`, 'i'),
  );
  return match ? match[1] : null;
}

/**
 * 既に本番へ流し終わっている移行SQL。**T-071 で足す分はこの集合の外にある。**
 * （`2026-09-08_request_survey.sql` はここに無い —— 本番に一度も流れていないので
 *  T-071 で削除する。B-3 がそれを検査する）
 */
const SHIPPED_MIGRATIONS = new Set([
  '2026-08-10_waitlist_freetext.sql',
  '2026-09-07_request_signal.sql',
  '2026-09-08_request_signal_page.sql',
]);

async function migrationFiles() {
  const dir = 'worker/migrations';
  const names = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  const files = [];
  for (const name of names) {
    files.push({ name, path: `${dir}/${name}`, sql: await readFile(`${dir}/${name}`, 'utf8') });
  }
  return files;
}

const newMigrations = async () =>
  (await migrationFiles()).filter((file) => !SHIPPED_MIGRATIONS.has(file.name));

/**
 * **本番の DB の今の姿。**移行SQL を流す前の状態をここから作る。
 * 🔒 実際の退避ファイルは読まない（メールアドレスが入っている）。形だけを写す。
 */
const PRODUCTION_SCHEMA = `
CREATE TABLE waitlist (
  email           TEXT PRIMARY KEY,
  nutrients       TEXT,
  channel         TEXT,
  nutrients_other TEXT,
  requests        TEXT,
  created_at      TEXT NOT NULL
);
CREATE TABLE price_alert (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT NOT NULL,
  product_id     TEXT NOT NULL,
  threshold_type TEXT NOT NULL,
  threshold_value REAL,
  created_at     TEXT NOT NULL
);
CREATE TABLE request_signal (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  page       TEXT
);
`;

/** 本番と同じ4行ぶんの合成データ。**本物のメールアドレスは使わない** */
const EXISTING_ROWS = [
  ['one@example.com', 'creatine', 'rakuten', 'グルタミン', '送料込みで並べたい', '2026-08-01T01:00:00.000Z'],
  ['two@example.com', 'hmb,vitamins', 'amazon,iherb', null, null, '2026-08-15T02:00:00.000Z'],
  ['three@example.com', '', '', null, '海外の製品も見たい', '2026-09-01T03:00:00.000Z'],
  ['four@example.com', 'multivitamin', 'yahoo', 'クエン酸', null, '2026-09-07T04:00:00.000Z'],
];

/** 本番と同じ形の DB を作り、4行入れて、新しい移行SQL を流す */
async function migrated() {
  const db = new DatabaseSync(':memory:');
  db.exec(PRODUCTION_SCHEMA);
  const insert = db.prepare(
    `INSERT INTO waitlist (email, nutrients, channel, nutrients_other, requests, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const row of EXISTING_ROWS) insert.run(...row);

  const applied = [];
  for (const file of await newMigrations()) {
    db.exec(file.sql);
    applied.push(file.name);
  }
  return { db, applied };
}

test('B-1 worker/schema.sql の waitlist が7列になっている', async () => {
  const inner = tableBlock(schemaSql, 'waitlist');
  assert.ok(inner, 'worker/schema.sql に waitlist テーブルの定義が無い');

  assert.deepEqual(
    parseColumns(inner).sort(),
    [...WAITLIST_COLUMNS].sort(),
    '🔒 waitlist の列は id / email / 成分 / 経路 / その他 / 自由記述 / 日時 の7つ。' +
      'IP・User-Agent・リファラ・ページ内の位置を足さない',
  );
  assert.ok(
    /CHECK\s*\(/i.test(inner),
    '🔒 CHECK 制約が無い。id と email を同じ行に置けてしまう（T-071 の最重要事項）',
  );
  assert.ok(
    !/email\s+TEXT\s+PRIMARY KEY/i.test(inner),
    '🔒 email の PRIMARY KEY が残っている。匿名の行が物理的に入らない',
  );
});

test('B-1 移行SQL を流した後の姿が worker/schema.sql と一致する', sqliteOptions, async () => {
  const { db, applied } = await migrated();

  assert.ok(applied.length > 0, 'T-071 の移行SQL が worker/migrations/ に無い');
  const columns = db
    .prepare('SELECT name FROM pragma_table_info(?)')
    .all('waitlist')
    .map((row) => row.name);

  assert.deepEqual(
    columns.sort(),
    [...WAITLIST_COLUMNS].sort(),
    `移行SQL（${applied.join(' / ')}）を流した後の waitlist が worker/schema.sql と食い違っている`,
  );
});

test('B-2 🔒 既存の4行が移行後も1文字も変わらずに残る', sqliteOptions, async () => {
  const { db } = await migrated();

  const rows = db.prepare('SELECT * FROM waitlist ORDER BY created_at').all();
  assert.equal(rows.length, EXISTING_ROWS.length, '🔒 移行で行が失われている。本番の登録者である');

  rows.forEach((row, index) => {
    const [email, nutrients, channel, nutrientsOther, requests, createdAt] = EXISTING_ROWS[index];
    assert.equal(row.email, email, `${index} 行目のメールアドレスが変わっている`);
    assert.equal(row.nutrients, nutrients, `${index} 行目の成分が変わっている`);
    assert.equal(row.channel, channel, `${index} 行目の購入先が変わっている`);
    assert.equal(row.nutrients_other, nutrientsOther, `${index} 行目の自由記述が変わっている`);
    assert.equal(row.requests, requests, `${index} 行目の自由記述が変わっている`);
    assert.equal(row.created_at, createdAt, `${index} 行目の登録日時が変わっている`);
    assert.equal(row.id, null, '🔒 既存の行に匿名の識別子が入っている');
  });
});

test('B-2 🔒 移行後の表でも id と email を両方持つ行は拒否される', sqliteOptions, async () => {
  const { db } = await migrated();

  assert.throws(
    () =>
      db.prepare(
        `INSERT INTO waitlist (id, email, nutrients, channel, nutrients_other, requests, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(SURVEY_ID, 'a@example.com', '', '', null, null, '2026-09-08T00:00:00Z'),
    /CHECK|constraint/i,
    '🔒 移行SQL が作った表に CHECK 制約が無い。schema.sql にだけ書いても本番は守られない',
  );
});

test('B-2 移行後の表でも、同じ鍵の2度目は行を増やさない', sqliteOptions, async () => {
  const { db } = await migrated();

  const env = {
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
  };

  await worker.fetch(postSurvey(surveyBody()), env);
  await worker.fetch(postSurvey(surveyBody({ nutrients: ['hmb'] })), env);
  await worker.fetch(postWaitlist({ email: 'one@example.com', nutrients: ['hmb'] }), env);

  assert.equal(anonRows(db).length, 1, '同じ識別子で行が増えている（索引が張られていない）');
  assert.equal(
    emailRows(db).length,
    EXISTING_ROWS.length,
    '既存のメールアドレスで行が増えている（email の一意性が失われている）',
  );
});

test('B-3 🔒 request_survey の定義と移行SQL がリポジトリから消えている', async () => {
  assert.ok(
    !/CREATE TABLE[\s\S]{0,40}request_survey/i.test(schemaSql),
    '🔒 worker/schema.sql に request_survey の定義が残っている（PO が却下した表）',
  );

  for (const file of await migrationFiles()) {
    assert.ok(
      !/CREATE TABLE[\s\S]{0,40}request_survey/i.test(file.sql),
      `🔒 ${file.name} が request_survey を作っている。本番に一度も存在しないので消すのが正しい`,
    );
    assert.notEqual(
      file.name,
      '2026-09-08_request_survey.sql',
      '🔒 T-070 の移行SQL が残っている。流すと不要な表ができる',
    );
  }
});

test('B-4 docs/ops/deploy.md に作り直しの移行手順が書かれている', async () => {
  const doc = await readFile('docs/ops/deploy.md', 'utf8');
  const files = await newMigrations();
  assert.ok(files.length > 0, 'T-071 の移行SQL が無い');

  for (const file of files) {
    assert.ok(
      doc.includes(file.name),
      `docs/ops/deploy.md に "${file.name}" の実行手順が無い。` +
        '本番の D1 を触れるのは PO だけなので、手順が書かれていないと流されない',
    );
  }
  assert.ok(
    !doc.includes('2026-09-08_request_survey.sql'),
    '🔒 取り下げた移行SQL の手順が deploy.md に残っている',
  );
});

test('B-4 🔒 docs/ops/deploy.md の「main へ merge したときだけ本番へ出る」が訂正されている', async () => {
  const doc = await readFile('docs/ops/deploy.md', 'utf8');

  // 2026-09-08 に実測で判明した事実。Deploy command が `npx wrangler deploy` なので
  // **ブランチに関係なく本番の Worker が置き換わる。**
  // 🔒 語が在るかどうかでは足りない —— deploy.md には既に「ブランチ」も
  //    「wrangler deploy」も在るが、**書いてある内容が逆（main だけが出る）だった。**
  //    直すべきはその記述であって、語の追加ではない。
  assert.ok(
    !/`?main`?\s*へ\s*merge\s*した時点で本番へ出る/.test(doc),
    '🔒 「main へ merge した時点で本番へ出る」という記述が残っている。' +
      'これは今日の実測で否定された（org/request-survey のコードが pergram.site で配信されていた）。' +
      '移行より先にどのブランチへ push しても、いま動いている待機リスト登録が壊れる',
  );
  assert.ok(
    /どのブランチ|ブランチに関係なく|ブランチを問わず/.test(doc),
    '🔒 「どのブランチへ push しても本番へ出る」が書かれていない。' +
      'Production branch = main だと思い込むと、移行前の push で登録が壊れる',
  );
  assert.ok(
    doc.includes('wrangler deploy'),
    'Deploy command が本番を置き換えるという根拠が書かれていない',
  );
});

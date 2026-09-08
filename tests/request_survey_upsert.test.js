/**
 * T-070 の単体テスト（実装担当が書いた分）。
 *
 * 受け入れテスト `tests/request_survey.test.js` は**契約**を見ている
 * （受け口のパス、キー集合、列、上書きされること）。ここが見るのは、
 * 契約が縛っていない**2つの境界**である。T-070 の申し送りが名指しした2点で、
 * どちらも実装側の判断としてここに固定する（決定ログは docs/tasks/T-070.md）。
 *
 *   (1) 2度目の送信で**空だった項目**をどう扱うか
 *       → `worker/waitlist.js` と同じ COALESCE 方式。**空で上書きしない。**
 *         回答を消す UI は無いので、これで失われる操作は存在しない。
 *         逆に `INSERT OR REPLACE` にすると、2度目にアンケートの器が開いて
 *         そのまま送られただけで、1度目に集めた回答が消える。
 *
 *   (2) `nutrients` / `channel` を**配列以外**で受けたときの扱い
 *       → `worker/waitlist.js` と同じく、単一の文字列も受ける。**400 で捨てない。**
 *         許可リストが値の側を守っているので、想定外の値は保存されない。
 *         本文ごと弾くと、同じ送信に載っている自由記述まで一緒に捨てることになる。
 *         このタスクは「回答が捨てられている」ことを直すためのものである。
 *
 * 🔒 ここでもメールアドレスは一切出てこない。この経路は匿名である。
 *
 * ⚠️ **保存先は T-071（PO 判断）で `request_survey` から `waitlist` へ変わった。**
 *    上の2つの決定はどちらも保存先に依存しないので、見ている中身は変えていない
 *    （どこへ書くかではなく、**2度目の送信で何が起きるか**を見るテストである）。
 *    あわせて「上書きの過程で `email` 列に触っていないこと」も見る —— 同じ表に
 *    メールアドレスの行が同居するようになったため、ここが新しく壊れうる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import worker from '../worker/index.js';

const SURVEY_PATH = '/api/request-survey';
const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const schemaSql = await readFile('worker/schema.sql', 'utf8');
const sqliteOptions = DatabaseSync ? {} : { skip: 'node:sqlite が無い Node で実行された' };

/** 本物の SQLite を D1 の顔で包む（tests/request_survey.test.js と同じ手） */
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

const post = (body) =>
  new Request(`https://pergram.example${SURVEY_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: ID,
      nutrients: [],
      channel: [],
      nutrients_other: null,
      requests: null,
      ...body,
    }),
  });

/**
 * 匿名の行だけを見る。
 * ⚠️ 保存先は `request_survey` から **`waitlist`** へ変わった（T-071 / PO 判断）。
 *    同じ表にメールアドレスの行も入るので、`id` を持つ行だけを取り出す。
 */
const rows = (db) => db.prepare('SELECT * FROM waitlist WHERE id IS NOT NULL').all();

/* ---- (1) 空で上書きしない ------------------------------------------- */

test('2度目が空でも1度目の回答を消さない', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(
    post({
      nutrients: ['creatine'],
      channel: ['rakuten'],
      nutrients_other: 'グルタミン',
      requests: '送料込みで並べたい',
    }),
    env,
  );
  const res = await worker.fetch(post({}), env);

  assert.equal(res.status, 204);
  const [row] = rows(db);
  assert.equal(row.nutrients, 'creatine', '空の再送信で成分の回答が消えている');
  assert.equal(row.channel, 'rakuten', '空の再送信で購入先の回答が消えている');
  assert.equal(row.nutrients_other, 'グルタミン', '空の再送信で自由記述が消えている');
  assert.equal(row.requests, '送料込みで並べたい', '空の再送信で自由記述が消えている');
  assert.equal(row.email, null, '🔒 上書きの過程で匿名の行に email が入っている');
});

test('2度目に値があればそちらが勝つ（空のときだけ残す）', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(post({ nutrients: ['creatine'], requests: '古い要望' }), env);
  await worker.fetch(post({ nutrients: ['hmb'], requests: '新しい要望' }), env);

  const [row] = rows(db);
  assert.equal(row.nutrients, 'hmb');
  assert.equal(row.requests, '新しい要望');
});

test('created_at は最初に答えた日時のまま動かない', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  await worker.fetch(post({ nutrients: ['creatine'] }), env);
  const first = rows(db)[0].created_at;
  await worker.fetch(post({ nutrients: ['hmb'] }), env);

  assert.equal(rows(db)[0].created_at, first, '再送信で created_at が書き換わっている');
});

/* ---- (3) 同じ表を共有するようになって初めて壊れうる境界（T-071） ------ */

test('匿名の回答は、既に登録されている人の行を1文字も書き換えない', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  // 先に待機リストへ登録がある状態を作る（本番の4行に相当）
  await worker.fetch(
    new Request('https://pergram.example/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'a@example.com',
        nutrients: ['creatine'],
        channel: ['rakuten'],
        nutrients_other: 'グルタミン',
        requests: '送料込みで並べたい',
      }),
    }),
    env,
  );

  // 同じ表へ匿名の回答が来る。違う内容を送っても登録者の行には届かないこと
  await worker.fetch(
    post({ nutrients: ['hmb'], channel: ['amazon'], requests: '海外の製品も見たい' }),
    env,
  );

  const emailRows = db.prepare('SELECT * FROM waitlist WHERE email IS NOT NULL').all();
  assert.equal(emailRows.length, 1, '登録者の行が増減している');
  assert.equal(emailRows[0].nutrients, 'creatine', '🔒 匿名の回答が登録者の回答を上書きしている');
  assert.equal(emailRows[0].channel, 'rakuten');
  assert.equal(emailRows[0].requests, '送料込みで並べたい');
  assert.equal(emailRows[0].id, null, '🔒 登録者の行に匿名の識別子が書き込まれている');
  assert.equal(rows(db).length, 1, '匿名の行が残っていない');
});

/* ---- (2) 配列以外で受けたときの扱い ---------------------------------- */

test('単一の文字列で送られた成分・購入先も保存する（本文ごと弾かない）', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  const res = await worker.fetch(
    post({ nutrients: 'creatine', channel: 'rakuten', requests: '文字列で送られた回' }),
    env,
  );

  assert.equal(res.status, 204, '配列でない選択肢を理由に本文ごと捨てている');
  const [row] = rows(db);
  assert.equal(row.nutrients, 'creatine');
  assert.equal(row.channel, 'rakuten');
  assert.equal(row.requests, '文字列で送られた回', '自由記述まで巻き添えで捨てている');
});

test('選択肢が数値やオブジェクトでも 204 で、許可リストに無い値は保存しない', sqliteOptions, async () => {
  const { db, env } = makeRealEnv();

  const res = await worker.fetch(
    post({ nutrients: 42, channel: { rakuten: true }, requests: '壊れた選択肢と一緒に来た要望' }),
    env,
  );

  assert.equal(res.status, 204);
  const [row] = rows(db);
  assert.equal(row.nutrients, '', '許可リストに無い値が保存されている');
  assert.equal(row.channel, '');
  assert.equal(row.requests, '壊れた選択肢と一緒に来た要望');
});

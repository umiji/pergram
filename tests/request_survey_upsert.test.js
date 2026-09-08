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

const rows = (db) => db.prepare('SELECT * FROM request_survey').all();

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

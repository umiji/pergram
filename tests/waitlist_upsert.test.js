/**
 * 待機リストの保存が「同じ行への追記」になっているかを、**本物の SQLite** で確かめる。
 *
 * tests/worker.test.js と tests/waitlist_step2.test.js の偽 D1 は、実行された SQL と
 * バインド値しか見えない。したがって「行が1つのままか」「前の回答が残るか」は判定できず、
 * T-011 の受け入れテストでも未検証のまま残っている（docs/tasks/T-011.md §証拠）。
 * ここを埋めるために、Node 同梱の `node:sqlite` に worker/schema.sql をそのまま流し、
 * worker/waitlist.js が組み立てた SQL を実際に実行して結果を見る。
 *
 * 依存パッケージは増やしていない（`node:sqlite` は Node 22.5 以降の標準モジュール）。
 * D1 も SQLite なので、UPSERT の意味論はここで確かめられる。
 *
 * 🔒 見ているのは3つ。
 *    1. ステップ1（メールアドレスだけ）で行が1つできる
 *    2. ステップ2の回答が**同じ行**へ入る（行は増えない）
 *    3. あとから空のステップ1がもう一度来ても、集めた回答を**消さない**
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import worker from '../worker/index.js';

/** node:sqlite は Node 22.5 以降。古い Node ではこのファイルごと飛ばす */
let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const schema = await readFile('worker/schema.sql', 'utf8');

/**
 * 本物の SQLite を D1 の顔で包む。使うのは worker/waitlist.js が呼ぶ範囲だけ
 * （prepare → bind → run）。
 */
function makeEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);

  return {
    db,
    env: {
      DB: {
        prepare(sql) {
          const statement = db.prepare(sql);
          return {
            bind(...args) {
              // D1 の `.bind(a, b, …)` は SQL の `?1 ?2 …` に順番で入る。
              // node:sqlite は番号付きのプレースホルダを名前として受けるので、
              // 1 始まりのキーに詰め替える（値の順番の意味は変えていない）。
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
  new Request('https://pergram.example/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const rows = (db) => db.prepare('SELECT * FROM waitlist ORDER BY email').all();

const EMAIL = 'step2@example.com';
const STEP_TWO = {
  email: EMAIL,
  nutrients: ['creatine', 'hmb'],
  channel: ['rakuten'],
  nutrients_other: 'グルタミン',
  requests: '送料込みで並べたい',
};

const options = DatabaseSync ? {} : { skip: 'node:sqlite が無い Node で実行された' };

test('ステップ1だけで行が1つできる', options, async () => {
  const { db, env } = makeEnv();

  assert.equal((await worker.fetch(post({ email: EMAIL }), env)).status, 200);

  const stored = rows(db);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].email, EMAIL);
  assert.match(stored[0].created_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('🔒 ステップ2の回答は同じ行へ入る（行が増えない）', options, async () => {
  const { db, env } = makeEnv();

  await worker.fetch(post({ email: EMAIL }), env);
  await worker.fetch(post(STEP_TWO), env);

  const stored = rows(db);
  assert.equal(stored.length, 1, `行が ${stored.length} 本あります。追記になっていません`);
  assert.equal(stored[0].nutrients, 'creatine,hmb');
  assert.equal(stored[0].channel, 'rakuten');
  assert.equal(stored[0].nutrients_other, 'グルタミン');
  assert.equal(stored[0].requests, '送料込みで並べたい');
});

test('🔒 空のステップ1が後から来ても、集めた回答を消さない', options, async () => {
  const { db, env } = makeEnv();

  await worker.fetch(post({ email: EMAIL }), env);
  await worker.fetch(post(STEP_TWO), env);
  // 同じ人がもう一度メールアドレスだけを送ってくる経路（登録済みに気づかず再送信）
  await worker.fetch(post({ email: EMAIL }), env);

  const stored = rows(db);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].nutrients, 'creatine,hmb', '成分の回答が消えています');
  assert.equal(stored[0].channel, 'rakuten', '購入先の回答が消えています');
  assert.equal(stored[0].nutrients_other, 'グルタミン', '自由記述が消えています');
  assert.equal(stored[0].requests, '送料込みで並べたい', '自由記述が消えています');
});

test('ステップ2をやり直したら新しい回答で置き換わる', options, async () => {
  const { db, env } = makeEnv();

  await worker.fetch(post(STEP_TWO), env);
  await worker.fetch(post({ ...STEP_TWO, nutrients: ['vitamins'], requests: '書き直した' }), env);

  const stored = rows(db);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].nutrients, 'vitamins');
  assert.equal(stored[0].requests, '書き直した');
});

test('別のメールアドレスは別の行になる', options, async () => {
  const { db, env } = makeEnv();

  await worker.fetch(post({ email: EMAIL }), env);
  await worker.fetch(post({ email: 'other@example.com' }), env);

  assert.equal(rows(db).length, 2);
});

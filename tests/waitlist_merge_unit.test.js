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

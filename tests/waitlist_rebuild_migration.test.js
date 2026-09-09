/**
 * T-071 / B-1 の単体テスト — **移行SQL を2度流しても、データが壊れない。**
 *
 * === なぜ要るのか（レビュー B-1 / Blocker） ===
 * `waitlist` の作り直し（新表 → 移す → 消す → 改名）は、素朴に書くと
 * **2度目が失敗せずに完走し、匿名の行の `id` だけを黙って NULL にする。**
 * 1度目の `ALTER TABLE waitlist_new RENAME TO waitlist` で `waitlist_new` は消えるので、
 * 2度目の `CREATE TABLE waitlist_new` が通ってしまうためである。続く
 * `INSERT ... SELECT` は6列（`id` を含まない）しか運ばない。
 *
 * 🔒 `id` は `request_signal` との突き合わせ鍵であり、同じブラウザの上書き鍵でもある。
 *    **消えても画面にもログにも何も出ない。** 本番の D1 を触れるのは PO だけで、
 *    手順書を見ながら手で流す以上、2度流されうる。
 *
 * 対策は移行SQL の**先頭に置いた番兵**（`ALTER TABLE waitlist ADD COLUMN id TEXT;`）。
 * 移行済みの表には既に `id` があるので、**破壊的な文へ進む前に失敗する。**
 * このテストは番兵が消されたら落ちる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  DatabaseSync = null;
}

const MIGRATION = 'worker/migrations/2026-09-08_waitlist_rebuild.sql';
const migrationSql = await readFile(MIGRATION, 'utf8');
const sqliteOptions = DatabaseSync ? {} : { skip: 'node:sqlite が無い Node で実行された' };

/** 移行前の本番の姿（email が主キーの6列）。実際の退避ファイルは読まない */
const PRODUCTION_SCHEMA = `
CREATE TABLE waitlist (
  email           TEXT PRIMARY KEY,
  nutrients       TEXT,
  channel         TEXT,
  nutrients_other TEXT,
  requests        TEXT,
  created_at      TEXT NOT NULL
);`;

const ANON_ID = '11111111-1111-4111-8111-111111111111';

/** 移行前の DB に、登録者の行を1つ入れて返す */
function production() {
  const db = new DatabaseSync(':memory:');
  db.exec(PRODUCTION_SCHEMA);
  db.prepare(
    `INSERT INTO waitlist (email, nutrients, channel, nutrients_other, requests, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('one@example.com', 'creatine', 'rakuten', null, null, '2026-08-01T01:00:00.000Z');
  return db;
}

const rows = (db) => db.prepare('SELECT id, email, nutrients FROM waitlist ORDER BY email').all();
const tables = (db) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((row) => row.name);

/** 移行後に匿名の回答を1行足す（受け口が書くのと同じ形） */
function addAnonRow(db) {
  db.prepare(
    `INSERT INTO waitlist (id, nutrients, channel, nutrients_other, requests, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(ANON_ID, 'hmb', 'amazon', null, null, '2026-09-08T00:00:00.000Z');
}

test('🔒 2度流すと、データを壊す前に止まる', sqliteOptions, () => {
  const db = production();
  db.exec(migrationSql);
  addAnonRow(db);

  const before = rows(db);
  const tablesBefore = tables(db);

  assert.throws(
    () => db.exec(migrationSql),
    /duplicate column name: id/i,
    '🔒 2度目が完走している。番兵（先頭の ALTER TABLE waitlist ADD COLUMN id）が消されている。' +
      'このまま本番で2度流されると、匿名の行の id だけが静かに NULL になる',
  );

  assert.deepEqual(rows(db), before, '🔒 2度目の実行で行が変わっている');
  assert.equal(rows(db).find((row) => row.email === null).id, ANON_ID, '🔒 匿名の識別子が消えた');
  assert.deepEqual(tables(db), tablesBefore, '2度目の実行で表の構成が変わっている');
});

test('1度流せば移行できる（番兵が正常な経路を邪魔しない）', sqliteOptions, () => {
  const db = production();
  db.exec(migrationSql);

  assert.deepEqual(tables(db), ['waitlist'], '作業用の表が残っている');
  const [row] = rows(db);
  assert.equal(row.email, 'one@example.com', '既存の登録者が失われている');
  assert.equal(row.id, null, '既存の行に匿名の識別子が入っている');

  addAnonRow(db);
  assert.equal(rows(db).length, 2, '移行後の表に匿名の行が入らない');
});

/*
 * 番兵には副作用がある —— 1文目が成功すると、旧 `waitlist` に空の `id` 列が足される。
 * そこで止まると「`id` はあるが CHECK も UNIQUE も無い、作り直されていない表」が残る。
 *
 * 🔒 **この状態を「完了」と読んではならない。** 制約の無い表のまま本番が動き続ける。
 *    完了の判定は `id` 列の有無ではなく、**CHECK 制約が DDL に現れるか**で行う
 *    （docs/ops/deploy.md §3「移行できたかの判定」）。
 */

/** 表の DDL。完了の判定はここに CHECK が現れるかで行う */
const ddl = (db) =>
  db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='waitlist'").get().sql;
const columns = (db) =>
  db
    .prepare("SELECT name FROM pragma_table_info('waitlist')")
    .all()
    .map((row) => row.name);

/** 番兵の1文目だけが通って止まった状態を作る */
const sentinelOnly = (db) => db.exec('ALTER TABLE waitlist ADD COLUMN id TEXT;');

test('🔒 番兵だけが通った状態は「完了」と見分けが付く', sqliteOptions, () => {
  const done = production();
  done.exec(migrationSql);

  const stuck = production();
  sentinelOnly(stuck);

  // id 列の有無では区別できない。**これが誤判定の入口である**
  assert.ok(columns(done).includes('id'));
  assert.ok(
    columns(stuck).includes('id'),
    '前提が変わっている: 番兵が id 列を足さないなら、この検査ごと見直すこと',
  );

  // CHECK 制約の有無なら区別できる
  assert.match(ddl(done), /CHECK/i, '移行できた表の DDL に CHECK が無い');
  assert.doesNotMatch(
    ddl(stuck),
    /CHECK/i,
    '🔒 番兵だけが通った表に CHECK がある。完了と未完了を見分けられない',
  );
});

test('番兵だけが通った状態は、deploy.md の手順で復旧できる', sqliteOptions, () => {
  const db = production();
  sentinelOnly(db);

  // そのまま流し直しても番兵が発火して進めない
  assert.throws(() => db.exec(migrationSql), /duplicate column name: id/i);

  // 🔒 足された列は必ず全行 NULL である（誰も書き込む前に止まっている）
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM waitlist WHERE id IS NOT NULL').get().n,
    0,
    '番兵が足した列に値が入っている。落とす前に中身を確認すること',
  );

  // deploy.md の復旧: 足された列を落として、移行前の姿へ戻してから流し直す
  db.exec('ALTER TABLE waitlist DROP COLUMN id;');
  db.exec(migrationSql);

  assert.match(ddl(db), /CHECK/i, '復旧手順を踏んでも移行できていない');
  assert.equal(rows(db)[0].email, 'one@example.com', '復旧の過程で登録者が失われている');
  assert.equal(rows(db)[0].id, null);
});

test('改名の直前で止まった状態は、deploy.md の1文で復旧できる', sqliteOptions, () => {
  const db = production();
  // D1 は明示トランザクションを張れないので、DROP は成功して改名で失敗しうる
  const rename = 'ALTER TABLE waitlist_new RENAME TO waitlist;';
  db.exec(migrationSql.slice(0, migrationSql.lastIndexOf(rename)));

  assert.deepEqual(tables(db), ['waitlist_new'], '止まった状態の見分け方が変わっている');
  assert.throws(
    () => db.exec(migrationSql),
    /no such table: waitlist/i,
    'この状態で流し直したときのエラーが docs/ops/deploy.md の表と食い違っている',
  );

  db.exec(rename);
  assert.deepEqual(tables(db), ['waitlist']);
  assert.equal(rows(db)[0].email, 'one@example.com', '復旧後に登録者が失われている');
});

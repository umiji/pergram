-- 待機リストに自由記述の2列を足す。2026-08-10。
--
-- worker/schema.sql は CREATE TABLE IF NOT EXISTS なので、既に存在するテーブルには
-- 列を足さない。稼働中の D1 にはこのファイルを1度だけ流す。
--
--   npx wrangler d1 execute pergram --remote --file worker/migrations/2026-08-10_waitlist_freetext.sql
--
-- ⚠️ SQLite に ADD COLUMN IF NOT EXISTS は無い。2度流すと
--    「duplicate column name」で失敗する。それが正しい挙動（既に入っている）。

ALTER TABLE waitlist ADD COLUMN nutrients_other TEXT;
ALTER TABLE waitlist ADD COLUMN requests TEXT;

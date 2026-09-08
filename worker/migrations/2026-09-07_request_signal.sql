-- 要望の第1段階の匿名シグナルを入れるテーブルを作る。2026-09-07（T-051）。
--
-- worker/schema.sql は稼働中の DB へ流し直されない前提なので、既存の D1 には
-- このファイルを1度だけ流す。
--
--   npx wrangler d1 execute pergram --remote --file worker/migrations/2026-09-07_request_signal.sql
--
-- 🔒 既存の waitlist テーブルには一切触らない。あちらは email が主キーで、
--    SQLite では後から変えられない。だから匿名の行は別テーブルにしてある。
-- 🔒 列は UUID と日時の2つだけ。ここへ列を足すのは別の設計判断であり、
--    PO の判断を経ずに行わない（worker/request_signal.js のコメントを参照）。
--
-- ⚠️ 上の 🔒 は PO 判断で一度上書きされている（T-058、2026-09-08）。
--    「どのページで押されたか」の page 列が
--    worker/migrations/2026-09-08_request_signal_page.sql で足された。
--    **このファイル自体は書き換えない**（既に流した DB と食い違うため）。
--    現在の正しい姿は worker/schema.sql を見ること。

CREATE TABLE IF NOT EXISTS request_signal (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

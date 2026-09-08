-- 匿名のアンケート回答を入れるテーブルを作る。2026-09-08（T-070）。
--
-- worker/schema.sql は稼働中の DB へ流し直されない前提なので、既存の D1 には
-- このファイルを1度だけ流す。
--
--   npx wrangler d1 execute pergram --remote --file worker/migrations/2026-09-08_request_survey.sql
--
-- ⚠️ **順序が重要である。このファイルを流す前にコードをデプロイすると、
--    /api/request-survey への書き込みが全部失敗する**（テーブルが無いので 503）。
--    デプロイは main への push で自動的に走る（docs/ops/deploy.md §4）ので、
--    **移行が先、main への merge が後**。T-058 で同じ危険を実際に踏んでいる。
--
-- 🔒 既存の waitlist（6列）と request_signal（3列）には一切触らない。
--    waitlist は email が主キーで匿名の行が入らず、request_signal は
--    「個人を識別できるものを何も持たない」ことが存在理由である。
--    だから匿名の回答は別テーブルにしてある。
-- 🔒 列はこの6つで打ち止め。email・IP・User-Agent・リファラ・ページ内の位置を足さない。
-- 🔒 定義は worker/schema.sql と1文字も違えないこと（tests/request_survey.test.js の
--    「B-1 同じ定義の移行 SQL が worker/migrations/ にある」が突き合わせている）。

CREATE TABLE IF NOT EXISTS request_survey (
  id              TEXT PRIMARY KEY,
  nutrients       TEXT,
  channel         TEXT,
  nutrients_other TEXT,
  requests        TEXT,
  created_at      TEXT NOT NULL
);

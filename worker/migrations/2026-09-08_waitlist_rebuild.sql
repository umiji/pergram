-- waitlist を作り直し、email の PRIMARY KEY を外して id 列を足す。2026-09-08（T-071）。
--
-- === なぜ作り直すのか ===
-- PO 判断（2026-09-08）:「waitlist に挿入されるようにしてくれ。メールが PK になってるから
-- その制約を外すだけでいい。余計なテーブル追加しないでくれ」。
-- **SQLite は PRIMARY KEY を後から外せない**（ALTER TABLE では列の追加と改名しかできない）。
-- したがって 新表を作る → 移す → 消す → 改名 の手順になる。
-- T-070 の `request_survey` 表は本番に一度も存在しないまま取り下げた（`num_tables` は 3 のまま）。
--
--   npx wrangler d1 execute pergram --remote --file worker/migrations/2026-09-08_waitlist_rebuild.sql
--
-- ⚠️ **順序が重要である。この移行より先にコードが本番へ出ると、いま動いている
--    待機リストの登録が壊れる**（`id` 列の無い表へ `id` を書きに行って失敗する）。
--    **どのブランチへ push しても本番の Worker が置き換わる**（Deploy command が
--    `npx wrangler deploy`。docs/ops/deploy.md §4 の実測）。**移行が先、push が後。**
--
-- ⚠️ **本番の4行を運ぶ。流す前に退避を取ること**（`.dump` か SELECT の出力）。
--    移し替えは列を明示した INSERT ... SELECT で行う。`SELECT *` にすると
--    列順の思い込みが崩れたときに黙って別の列へ入る。
--
-- 🔒 **1行が id と email を同時に持てないこと（CHECK 制約）を、この表にも必ず付ける。**
--    schema.sql にだけ書いても、稼働中の本番は守られない。
-- 🔒 定義は worker/schema.sql と同じに保つこと
--    （tests/request_survey.test.js の B-1 が、この移行を実際に流した後の姿と突き合わせる）。
-- 🔒 移す既存4行は email だけを持つ。id は NULL のまま入る。

CREATE TABLE waitlist_new (
  id              TEXT UNIQUE,
  email           TEXT UNIQUE,
  nutrients       TEXT,
  channel         TEXT,
  nutrients_other TEXT,
  requests        TEXT,
  created_at      TEXT NOT NULL,
  CHECK (id IS NULL OR email IS NULL)
);

INSERT INTO waitlist_new (email, nutrients, channel, nutrients_other, requests, created_at)
SELECT email, nutrients, channel, nutrients_other, requests, created_at FROM waitlist;

DROP TABLE waitlist;

ALTER TABLE waitlist_new RENAME TO waitlist;

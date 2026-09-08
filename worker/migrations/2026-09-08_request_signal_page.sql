-- 匿名シグナルに「どのページで押されたか」の1列を足す。2026-09-08（T-058）。
--
-- worker/schema.sql の CREATE TABLE IF NOT EXISTS は既存テーブルに列を足さないので、
-- 稼働中の D1 にはこのファイルを1度だけ流す。
--
--   npx wrangler d1 execute pergram --remote --file worker/migrations/2026-09-08_request_signal_page.sql
--
-- 🔒 NOT NULL を付けない。既存の行には page が無く、既定値も持たせない
--    （「どのページか分からない行」を後から嘘の値で埋めない）。
-- 🔒 waitlist にも price_alert にも触れない。触るのは request_signal だけである。
-- 巻き戻し: `ALTER TABLE request_signal DROP COLUMN page;`（SQLite 3.35 以降）。
--    ただし**巻き戻す前に、page を送るブラウザ側を先に戻すこと**（列が無い INSERT は失敗する）。
--    順序を守れば無停止で戻せる。行は消えない。
-- 🔒 足すのはこの1列だけ。IP・User-Agent・リファラ・ページ内の位置を足さない
--    （worker/request_signal.js の冒頭が正典）。

ALTER TABLE request_signal ADD COLUMN page TEXT;

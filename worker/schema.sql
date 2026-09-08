-- Cloudflare D1。requirements.md §10.1
--
-- 🔒 サーバに置いてよいのはここにある列だけ。
--    年齢・性別・服用中サプリ・体調は localStorage / IndexedDB のみで、サーバへ送らない。
--
--   npx wrangler d1 execute pergram --file functions/schema.sql

CREATE TABLE IF NOT EXISTS waitlist (
  email           TEXT PRIMARY KEY,
  nutrients       TEXT,     -- 見たい成分。カンマ区切り。P1 の対象決定に使う
  channel         TEXT,     -- 普段の購入先。複数選択なのでカンマ区切り。提携の優先順位に使う
  nutrients_other TEXT,     -- 選択肢に無い成分の自由記述。上限は waitlist_fields.js
  requests        TEXT,     -- その他の要望の自由記述。上限は waitlist_fields.js
  created_at      TEXT NOT NULL
);
-- ⚠️ CREATE TABLE IF NOT EXISTS は既存テーブルに列を足さない。
--    稼働中の DB には worker/migrations/ の SQL を1度だけ流すこと。

-- 価格アラート（P7）。監視対象は製品 ID のみ。
CREATE TABLE IF NOT EXISTS price_alert (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT NOT NULL,
  product_id     TEXT NOT NULL,
  threshold_type TEXT NOT NULL,
  threshold_value REAL,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_alert_product ON price_alert (product_id);

-- 要望の第1段階（1クリックの意思表示）の匿名シグナル。T-051。
--
-- 🔒 列は UUID と日時と「どのページか」の3つだけ。IP・User-Agent・リファラ・成分・
--    自由記述を足さない。**個人を識別できるものを何も持たないことが、この行の
--    存在理由である。**
-- ⚠️ T-051 の時点では「UUID と日時の2つだけ。押された場所を足さない」だった。
--    **その決定は PO 判断で上書きされている（T-058、2026-09-08）。** どのページからの
--    要望が多いかは次に掲載する成分を決める材料そのもので、GA4 は CSP の設定ミスで
--    全滅した実績がある（T-047）。**page 列を「規約違反だから」と削らないこと。**
-- 🔒 入れてよいのは「どのページか」まで。**ページ内の位置（上の帯 / 下の帯）は入れない。**
--    位置の区別は GA4 の location（data-cta）が持つ。列をこれ以上足すのは PO 判断。
-- 🔒 waitlist へ相乗りさせない。あちらは email が主キーで、匿名の行は入らない。
-- id はブラウザが作る UUID v4。重複はブラウザ側（localStorage）で抑え、
-- ここでは主キーの衝突を INSERT OR IGNORE で握りつぶす。
-- page は `<locale>:<ページの識別子>`（ja:lp / ja:protein / en:creatine）。
-- ⚠️ NOT NULL を付けない。移行前に入った行の page は NULL のままである。
CREATE TABLE IF NOT EXISTS request_signal (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  page       TEXT
);

-- 匿名のアンケート回答（T-070）。**メールアドレスを入れなかった人の回答の置き場。**
--
-- === なぜ waitlist でも request_signal でもないのか 🔒 ===
-- `waitlist` は `email` が主キーなので、**メールアドレスの無い行は物理的に入らない。**
--   （SQLite では主キーを後から変えられない。列も6列で打ち止め＝T-058）
-- `request_signal` は3列で打ち止めで、**個人を識別できるものを何も持たないことが
--   あの行の存在理由**である。自由記述を混ぜた時点でそれが成り立たない。
-- そこで匿名のまま回答を残せる第3のテーブルを置く。
--
-- 🔒 列はこの6つで打ち止め。**email を足さない**（足した瞬間に匿名でなくなる）。
--    IP・User-Agent・リファラも足さない。**ページ内の位置（上の帯 / 下の帯）も入れない。**
--    位置は GA4 の location（data-cta）が持つ。列を足すのは改めて PO 判断を要する。
-- ⚠️ 「どのページか」もここには持たない。同じ id の行が `request_signal` にあり、
--    そちらの `page` と突き合わせられる。二重に持つとずれる。
-- 🔒 id は `request_signal.id` と**同じ値**（ブラウザが作る UUID v4、
--    localStorage の `pergram.request_signal_id`）。主キーにしてあるのは、
--    同じブラウザが何度答えても行を増やさず上書きするためである。
-- 🔒 自由記述は長さで切るだけ。中身を解釈して弾かない（N-01 / N-05）。
CREATE TABLE IF NOT EXISTS request_survey (
  id              TEXT PRIMARY KEY,
  nutrients       TEXT,
  channel         TEXT,
  nutrients_other TEXT,
  requests        TEXT,
  created_at      TEXT NOT NULL
);

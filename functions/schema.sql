-- Cloudflare D1。requirements.md §10.1
--
-- 🔒 サーバに置いてよいのはここにある列だけ。
--    年齢・性別・服用中サプリ・体調は localStorage / IndexedDB のみで、サーバへ送らない。
--
--   npx wrangler d1 execute pergram --file functions/schema.sql
--
-- waitlist は Google スプレッドシートにも同じ4列で転記する（README「待機リストの保存先」）。
-- 列を足すときは両方に足す。

CREATE TABLE IF NOT EXISTS waitlist (
  email      TEXT PRIMARY KEY,
  nutrients  TEXT,          -- 見たい成分。カンマ区切り。P1 の対象決定に使う
  channel    TEXT,          -- 普段の購入先。アフィリエイト提携の優先順位に使う
  created_at TEXT NOT NULL
);

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

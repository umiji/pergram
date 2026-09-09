-- Cloudflare D1。requirements.md §10.1
--
-- 🔒 サーバに置いてよいのはここにある列だけ。
--    年齢・性別・服用中サプリ・体調は localStorage / IndexedDB のみで、サーバへ送らない。
--
--   npx wrangler d1 execute pergram --file functions/schema.sql

-- 待機リスト。**メールアドレスを入れた行と、匿名のアンケート回答の行が同居する。**
--
-- ⚠️ **T-058 の「6列で打ち止め。匿名の押下を相乗りさせない」は失効している**
--    （PO 判断、T-071 / 2026-09-08:「waitlist に挿入されるようにしてくれ。
--    メールが PK になってるから その制約を外すだけでいい。余計なテーブル追加しないでくれ」）。
--    T-070 の `request_survey` 表はこの判断で取り下げた（本番に一度も存在していない）。
--    **`id` 列を「規約違反だから」と削らないこと。**正典は docs/tasks/T-071.md の決定ログ。
--
-- 🔒 **1行が id と email を同時に持ってはならない。下の CHECK 制約がそれを拒否する。**
--    `id` に入るのは `request_signal.id` と**同じ匿名の識別子**である。同じ行が両方を
--    持てたら、**それまで匿名だったボタン押下の1行1行が、すべてメールアドレスへ紐づく。**
--    `request_signal` が3列しか持たない理由（「個人を識別できるものを何も持たないことが、
--    この行の存在理由である」）が丸ごと崩れる。**表を1つにするという PO の判断は、
--    この線を越えることまでは含んでいない。** 同じ人が2行に分かれて残るのが正しい姿。
-- 🔒 **各受け口は自分の鍵の列だけを書く。** /api/waitlist は email を、
--    /api/request-survey は id を書き、もう一方には触らない（NULL のまま残す）。
--    **もう一方を空文字 '' で埋めない。**
--    ⚠️ 危ないのは CHECK ではなく **UNIQUE の側**である。`id=''` / `email=NULL` の行は
--    CHECK を通る（両方が非 NULL ではない）。しかし `id TEXT UNIQUE` により
--    **そういう行は表に1つしか存在できない。** 2人目以降のブラウザの回答は
--    ON CONFLICT(id) で1行目を上書きし、**別々の人の回答が1行に混ざる。**
--    （`INSERT (id, email) VALUES ('…uuid…', '')` のほうは CHECK が拒否する。実測済み）
-- 🔒 email も id も PRIMARY KEY にしない。UNIQUE にしてあるのは、
--    (1) 同じ鍵の2度目で行を増やさない（ON CONFLICT の宛先になる）ため、
--    (2) SQLite の UNIQUE は NULL を互いに違う値として扱うので、
--        「email が NULL の匿名行」も「id が NULL のメール行」も何行でも入れるため。
--    PRIMARY KEY にすると NULL が入らず、片方の行が物理的に作れなくなる。
CREATE TABLE IF NOT EXISTS waitlist (
  id              TEXT UNIQUE,  -- 匿名の識別子（request_signal.id と同じ値）。email と排他
  email           TEXT UNIQUE,  -- 待機リストの登録者。id と排他
  nutrients       TEXT,     -- 見たい成分。カンマ区切り。P1 の対象決定に使う
  channel         TEXT,     -- 普段の購入先。複数選択なのでカンマ区切り。提携の優先順位に使う
  nutrients_other TEXT,     -- 選択肢に無い成分の自由記述。上限は waitlist_fields.js
  requests        TEXT,     -- その他の要望の自由記述。上限は waitlist_fields.js
  created_at      TEXT NOT NULL,
  CHECK (id IS NULL OR email IS NULL)
);
-- ⚠️ CREATE TABLE IF NOT EXISTS は既存テーブルに列を足さない。**主キーも外せない。**
--    稼働中の DB には worker/migrations/ の SQL を1度だけ流すこと。
--    T-071 の移行は表の作り直し（新表 → 移す → 消す → 改名）である。

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
-- 🔒 **押下の1行はここに置き続ける。waitlist へ移さない。**
--    ⚠️ 「waitlist は email が主キーだから匿名の行が入らない」という理由は、
--    T-071（PO 判断）で waitlist を作り直した時点で消えた。それでもこの表は残す ——
--    押下（1クリックの意思表示）とアンケートの回答は別の出来事であり、
--    こちらは自由記述を一切持たないまま「どのページで何回押されたか」だけを数える。
--    混ぜると、この表の存在理由（個人を識別できるものを何も持たない）を保てない。
-- id はブラウザが作る UUID v4。重複はブラウザ側（localStorage）で抑え、
-- ここでは主キーの衝突を INSERT OR IGNORE で握りつぶす。
-- page は `<locale>:<ページの識別子>`（ja:lp / ja:protein / en:creatine）。
-- ⚠️ NOT NULL を付けない。移行前に入った行の page は NULL のままである。
CREATE TABLE IF NOT EXISTS request_signal (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  page       TEXT
);

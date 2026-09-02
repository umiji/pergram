---
paths:
  - "src/**"
  - "scripts/**"
  - "config/**"
  - "worker/**"
  - "locales/**"
  - "wrangler.toml"
---

# pergram のコードの不変条件

**この規約は、実装コード・ビルドスクリプト・設定ファイル・Worker を触るときに読む。**
ルート直下の `CLAUDE.md` には、ここにある不可逆な判断の**見出しだけ**が一覧で載っている。実際に手を動かす前に、この文書で該当箇所の本文を読むこと。

---

### 触るときに壊しやすい箇所

| 場所 | 不変条件 |
|---|---|
| `src/lib/cost.js` | 導出計算はここだけ。`data/` に導出値を保存しない |
| `src/lib/normalize_protein.js` | 唯一のカテゴリ固有処理。他所にカテゴリ分岐を持ち出さない。商品説明文からの含有量読み取り（`extractProteinFromCaption`）もここ。**読めなければ null。推測で埋めない**。読み取りの罠は全部テストで固定してある — 「タンパク質100gあたり」は基準であって値ではない / 「ホエイたんぱく質100%」は原材料の表示 / 「無水換算・乾物換算」は製品そのままの値ではない |
| `scripts/rakuten_api.js` | 楽天 API のエンドポイント・認証・レスポンスの読み方の**唯一の出所**。収集と価格更新で二重に持たない。2026-02-10 の認証基盤刷新で片方だけ移行し、`refresh_prices.js` が旧エンドポイントのまま放置された |
| `scripts/refresh_prices.js` | 公開中の `price_snapshots.json` を**下書きを経由せず直接上書きする**。購入リンク（アフィリエイト URL）と送料区分を落とさない。`RAKUTEN_AFFILIATE_ID` が無ければ実行させない（警告では足りない。素の URL で全上書きになる） |
| `scripts/enrich_draft.js` | 説明文からの LLM 後処理。**下書き→下書き**。ビルドにも Worker にも組み込まない（N-04）。受け取るのは `ENRICHABLE_FIELDS` の数値と固有名詞だけ（N-02）。**根拠の抜粋が原文に文字列として実在しなければ値を捨てる。**モデルの呼び出し口は未接続 |
| `scripts/ingest_draft.js` | ⚠️ **モック限定の暫定措置が入っている。** 同一商品を「内容量＋含有率が一致すれば同じ」とみなして最安1件に絞る（`sameProductKey`）。**これは名寄せキー Q-07 の決定ではない。**2つ目のソースを足す前に Q-07 を確定させ、この処理は捨てる。落とした出品は `merged` で必ず報告する |
| `config/categories.json` | 新カテゴリはここに1ブロック足すだけで済む状態を保つ。`facets` / `secondaryMetrics` / `explainerKey` もここ。UI 側に成分名の分岐を書かない |
| `config/markets.json` | merchant は配列を回して描画する。UI に `if (locale === ...)` を書かない |
| `locales/*.json` | 未定義キーはビルドを落とす。文言をテンプレートに直書きしない |
| `src/build/build.js` | **LP は掲載件数に関わらず常に出力する**（`/ja/`）。実データが20件未満のとき出さないのは**ヒーローのランキングカードだけ**（出典: [design.md](docs/design/design.md) §7 禁止⑧「ヒーローにダミーデータを置く」）。この門をカード以外に広げない。⚠️ **`HERO_PRODUCT_IDS` にβ版限定の暫定措置が入っている** — ヒーローに出す3件を手動指定しており、行番号が実際の順位と食い違う。経緯と解消条件は design.md「ヒーローのランキングカードの例外」。**空配列に戻せば単価順に戻る** |
| `src/styles/tokens.css` | 色・寸法の唯一の出所。`scripts/make_ogp.js` の定数もここと同じ値に保つ |
| `src/templates/lp/` | LP のセクション。チップの並びも許可リストも `src/lib/waitlist_fields.js` が唯一の出所。LP 側と Worker 側で二重に持たない |
| `src/templates/lp/support.js` | 任意支援（Codoc）の埋め込み。設定の出所は `config/markets.json` の `support`。⚠️ **1ページに1つしか置けない** — Codoc は要素の id から `#codoc-entry-<code>` を組み立てて mount 先を引き直すので、同じ id を2箇所に置くと後ろ側は空のまま死ぬ。2箇所に出すなら Codoc 側で2つ目の entry を発行する |
| `src/build/crawl.js` | robots.txt / sitemap.xml / llms.txt の**唯一の出所**。公開範囲は `crawlPolicy()` ひとつに書き、3ファイルすべてをそこから導く。**別々に書くと「robots.txt で塞いだ URL をサイトマップに載せる」事故が静かに起きる**（検索エンジンは矛盾を報告しない）。⚠️ 現在 `/ja/protein/` を塞いでいるのはβ版のプレースホルダ価格が出ているため。`PLACEHOLDER_MERCHANTS` を消すのと同時に `blocked` から `open` へ移す。llms.txt に成分の働きを書かない（N-02）、独自スコアを書かない（N-03） |
| `src/lib/jsonld.js` | 構造化データ。`aggregateRating` / `review` を入れない（N-08）。**LP のヒーローに ItemList を付けない** — `HERO_PRODUCT_IDS` の手動指定で表示順が単価順と一致しておらず、構造化データにすると誤った順位を機械に断言することになる。`<` のエスケープを外さない（生の `<` があるとブラウザがそこでスクリプトを打ち切る） |
| `src/build/headers.js` | CSP と配信ヘッダ。外部から読み込むものを足したら必ずここに許可を書く。**忘れるとブラウザが黙ってブロックし、画面には何も出ない。**許可するオリジンは設定から導き、ドメインを2箇所に書かない |
| `worker/index.js` | Worker の入り口。配信は **Pages ではなく Workers**。`functions/` は使えない。ルートは `ROUTES` に足す。⚠️ `wrangler.toml` の `run_worker_first` により**静的ファイルを含む全要求がここを通る** — 旧ドメイン（`pergram.pergram-official.workers.dev`）からの恒久転送のため。転送先は `src/lib/site.js` の `SITE_ORIGIN` と同じ値に保つ（`tests/worker.test.js` が突き合わせている）。**閲覧は 301、それ以外は 308** — 301 はブラウザが POST を GET に作り替えるので、待機リストの登録が静かに消える |
| `src/templates/products/` | 製品一覧（`/ja/protein/`）。カード表示とリスト表示は**同じマークアップ**を CSS のグリッドだけで組み替える。2つ描き分けない |
| `src/templates/products/item.js` | ⚠️ **β版限定の暫定措置が入っている。** 他ストアの価格表に `PLACEHOLDER_MERCHANTS`（Amazon / Yahoo! / 公式）の行を必ず足す。**🔒 金額は作らない** — 実データが無い欄は `¥X` / `¥XXXX` を出し、リンクも張らない。表示例であることは `products.betaNoData` で画面に明示する。楽天以外の実データが入ったら定数ごと削り、`market.merchants` を回すだけに戻す |
| `src/assets/products.js` | 絞り込みは `hidden` の付け外しだけ。並べ替えを足さない。状態は URL にだけ持ち、localStorage を使わない |
| `wrangler.toml` | Cloudflare のバインディングの唯一の出所。**このファイルがあるとダッシュボードの設定は無視される。**配信は Workers（`main` + `[assets]`）。`pages_build_output_dir` に戻さない |

---

## 不可逆な設計判断 🔒

後から変えるとデータ全件の再計算、URL 全変更、法務やり直しが発生する。**勝手に変更しない。**

### 元素量換算を必ず通す

ラベル記載量と有効成分量は異なる（酸化Mg 500mg ≒ 元素Mg 約300mg / グリシン酸Mg 500mg ≒ 約50mg）。
比較には必ず `amount_elemental` を使う。`amount_labeled` で比較してはならない。

### per serving をソートキーにしない

`serving`（1食 / 1粒）はメーカーが任意に定義した単位であり、製品を横断して比較できない。
`¥52 /食` を補助表示するのは可。**並び順を決めるのは常に有効成分1単位あたりの価格。**

### 導出値を保存しない

保存する独立変数は `serving_size_g` / `servings_per_unit` / `amount_elemental` の3つのみ。
含有率・100gあたり含有量・1食あたり価格などはすべて導出する。二重に持つと片方だけ更新され、必ず矛盾する。

### カテゴリ固有テーブルを作らない

プロテイン用テーブル・カプセル用テーブルのような分岐は破綻する。
**カテゴリ差は表示設定 JSON で吸収する**（`primaryMetric` / `secondaryMetrics` / `displayUnit`）。新カテゴリ追加は JSON に1ブロック足すだけで済む状態を保つ。

唯一のカテゴリ固有処理は抽出時の正規化（例: `normalize_protein()`）。これは DB ではなくパイプラインの問題。

### `locale` と `market` を分離する

| 軸 | 決めるもの |
|---|---|
| `locale` (ja / en) | 表示言語のみ |
| `market` (JP / US) | 表示する merchant、参照値、免責文、通貨 |

**「英語 UI だから楽天ボタンを隠す」は誤り。** 日本在住の外国人は英語 UI で楽天を使う。
免責文・広告表示は `locale` ではなく `market` に紐づける。

### 出し分けは条件分岐ではなくデータで

コンポーネントに `if (locale === 'en')` を書き始めると分岐が増殖する。
market 設定 JSON を**配列として回して描画**し、UI 側の分岐をゼロにする。

```
market.merchants.map(m => <MerchantButton merchant={m} />)
```

### `Product.country` を持たない

購入可能性は「その製品に、その市場の merchant の `PriceSnapshot` が存在するか」で決まる。
国フラグを持たせると複数市場で流通する製品を表現できない。

### URL は最初から `/ja/` `/en/` サブパス

後付けは全 URL 変更 = SEO 大損。文言はすべて翻訳キー経由、ハードコード禁止。
成分名・製品名は `NutrientI18n` / `ProductI18n` の別テーブル（`name_ja` `name_en` のカラム持ちにしない）。

| URL | ページ |
|---|---|
| `/` | `/ja/` へ 302（`_redirects`）。meta refresh も併記 |
| `/ja/` | **LP（トップページ）。** ヘッダのワードマークの飛び先はここ |
| `/ja/{nutrient}/` | 製品一覧（現状 `protein` のみ） |

LP を階層下（`/ja/lp/` 等）に置かない。ワードマークが指す `/ja/` が 404 になる。

### `/ja/` と `/en/` は翻訳関係にない

掲載製品・参照値・免責文がすべて異なる。
**成分ランキングページに hreflang を相互指定しない。** hreflang は「このサイトについて」等の本当に等価なページのみ。

# CLAUDE.md

pergram — サプリメントを有効成分1単位あたりの価格で比較する静的サイト。

## リポジトリの現状

**プロテイン1成分に絞った骨格が動く。データは空。** Node 22 以上、**依存パッケージなし**。

```bash
npm test          # 導出計算・正規化・バリデーション・描画の不変条件
npm run build     # dist/ を生成（--strict で LP 未出力時に失敗）
npm run preview   # サンプルデータで .preview/ に描画。デプロイ禁止
npm run validate  # data/ のバリデーションのみ
```

実装済みは P0 と P1c の骨格。データ投入の手順は [README.md](README.md) を見る。
続きは [docs/product/requirements.md](docs/product/requirements.md) §13 のフェーズ計画に従うこと。

### 触るときに壊しやすい箇所

| 場所 | 不変条件 |
|---|---|
| `src/lib/cost.js` | 導出計算はここだけ。`data/` に導出値を保存しない |
| `src/lib/normalize_protein.js` | 唯一のカテゴリ固有処理。他所にカテゴリ分岐を持ち出さない |
| `config/categories.json` | 新カテゴリはここに1ブロック足すだけで済む状態を保つ。`facets` / `secondaryMetrics` / `explainerKey` もここ。UI 側に成分名の分岐を書かない |
| `config/markets.json` | merchant は配列を回して描画する。UI に `if (locale === ...)` を書かない |
| `locales/*.json` | 未定義キーはビルドを落とす。文言をテンプレートに直書きしない |
| `src/build/build.js` | **LP は掲載件数に関わらず常に出力する**（`/ja/`）。実データが20件未満のとき出さないのは**ヒーローのランキングカードだけ**（出典: [design.md](docs/design/design.md) §7 禁止⑧「ヒーローにダミーデータを置く」）。この門をカード以外に広げない |
| `src/styles/tokens.css` | 色・寸法の唯一の出所。`scripts/make_ogp.js` の定数もここと同じ値に保つ |
| `src/templates/lp/` | LP のセクション。`ROADMAP_NUTRIENTS` と `worker/waitlist.js` の許可リストは対応させる |
| `worker/index.js` | Worker の入り口。配信は **Pages ではなく Workers**。`functions/` は使えない。ルートは `ROUTES` に足す |
| `src/templates/products/` | 製品一覧（`/ja/protein/`）。カード表示とリスト表示は**同じマークアップ**を CSS のグリッドだけで組み替える。2つ描き分けない |
| `src/assets/products.js` | 絞り込みは `hidden` の付け外しだけ。並べ替えを足さない。状態は URL にだけ持ち、localStorage を使わない |
| `wrangler.toml` | Cloudflare のバインディングの唯一の出所。**このファイルがあるとダッシュボードの設定は無視される。**配信は Workers（`main` + `[assets]`）。`pages_build_output_dir` に戻さない |

| ドキュメント | 役割 |
|---|---|
| [docs/product/requirements.md](docs/product/requirements.md) | 要件定義。**迷ったらここが正** |
| [docs/design/design.md](docs/design/design.md) | **デザイン要件書。Claude Design への受け渡しはこれ** |
| `docs/design/*_mock*/` | Claude Design のモック。**`.gitignore` 済みでリポジトリには入っていない**。実装との差分は design.md に記録する |
| [docs/design/service.md](docs/design/service.md) | 本体サービスの UI/UX 定義 |
| ~~[docs/design/ad-lp.md](docs/design/ad-lp.md)~~ | design.md に置き換え済み。検討過程の記録 |
| [docs/research/validation-plan.md](docs/research/validation-plan.md) | 先行需要検証プラン |
| [docs/ops/deploy.md](docs/ops/deploy.md) | Cloudflare Workers + D1 のデプロイ手順。バインディングの出所は `wrangler.toml` ひとつ |

ドキュメント間は相対リンクで相互参照している。**ファイルを移動・改名する場合は全参照を更新すること。**

---

## 絶対にやってはいけないこと 🔒

薬機法・景表法に直結する。機能要件より優先し、迷ったら**より保守的な方**を選ぶ。

| ID | 禁止事項 |
|---|---|
| N-01 | 症状・不調・悩みの入力を受け付ける |
| N-02 | 成分の効能・効果に関する**独自文章を生成する** |
| N-03 | 独自の総合スコア・品質スコア・加重平均ランキングを作る |
| N-04 | ユーザーリクエストパスで LLM を呼ぶ |
| N-05 | 健康状態・体調・服薬情報をサーバに保存する |
| N-07 | 診断的表現（「あなたは◯◯が欠乏しています」等）を書く |
| N-08 | Amazon / iHerb のレビュー本文・星評価をスクレイピングして転載する |
| N-09 | **AGA・育毛・薄毛の文脈で成分を扱う** |
| N-10 | 妊活・美容医療の文脈で成分を扱う |

N-09 / N-10 は**成分の除外ではなく文脈の除外**。亜鉛は筋トレ文脈（ZMA 等）なら対象、育毛文脈では扱わない。

### 成分の機能に言及する文章はホワイトリスト方式

自由記述を一切許さない。`nutrient_claims` テーブルの固定文言のみを使い、コードから動的生成しない。
定型文が存在しない成分には**何も表示しない**（空欄が正しい挙動）。

許される出典は3つのみ:
- 栄養機能食品の規格基準に定められた定型文
- 消費者庁「機能性表示食品」届出データベースの届出表示
- 厚生労働省「日本人の食事摂取基準(2025年版)」の数値

### 推定値で埋めない

`ReferenceValue`（RDA/UL）が存在しない成分では、UI に「公的な推奨量・上限量は定められていない」と明示する。独自の目安を表示しない。

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

---

## データ保護

- 年齢・性別・服用中サプリは **localStorage / IndexedDB のみ**。サーバへ送信しない
- サーバが保持してよいのは**メールアドレスと監視製品ID のみ**（価格アラート）
- GA4 に個人識別情報を送らない。メールアドレスをイベントパラメータに含めない

---

## ブランド表記 🔒

| 項目 | 規則 |
|---|---|
| 正式表記 | **`pergram`** — 全て小文字 |
| 禁止 | `Pergram` `PerGram` |
| 読み | パーグラム |
| タグライン | JP「1gあたり、いくら払ってる?」/ EN「What are you paying per gram?」 |

初回接触時（LP・OGP・広告）は**必ずタグラインとセットで出す**。`-gram` が Instagram / Telegram の連想を呼ぶため。

### 使ってはいけないビジュアル

葉・植物・カプセル・錠剤・筋肉・ハート・体のシルエット・チェックマーク・人物写真。
いずれも効能または推薦を連想させる。

---

## コピーの規則

**禁止語**: 効く / 効果 / 改善 / 高品質 / おすすめ / 人気No.1 / 安心 / 話題の / 選ばれる / 実感
**使う語**: 含有量 / 元素量 / 単価 / 1gあたり / 認証 / 出典 / 更新日 / 比較 / 一覧

- 能動態。ボタンは操作の結果をそのまま名乗る（「価格を通知する」。「登録」ではない）
- 数値には必ず単位と基準を添える（「¥38」ではなく「¥38 / クレアチン1g」）
- 事実のみを書き、優劣を述べない。「グリシン酸マグネシウムは吸収が良い」は書かない
- エラー文は謝らない。何が起きて、どうすれば直るかだけを書く

---

## UI 実装の下限

見た目の基準は [src/styles/tokens.css](src/styles/tokens.css)。**色・寸法をコンポーネントに直書きしない。**

- **数値には `font-variant-numeric: tabular-nums` を必ず適用する。** 桁が揃わない比較表は機能しない
- 色は2つしか意味を持たない。**増やしたくなったら情報設計が間違っている合図**
  - `--signal`（`#2454E6`）= ブランドと操作（CTA・リンク・セクションの目印）
  - `--verified`（`#1F9254`）= **主指標の最安値のみ**。全行に使うと意味が消える
- border-radius はトークン経由（カード 14px / 面 16px / 操作 8-10px / チップは丸）。個別に数値を書かない
- UL 超過・認証の有無・最安を**色だけで表現しない**（順位番号・アイコン・テキストを併記）
- ランキングは `<ol>`、成分表は `<table>` + `scope`。div で組まない
- `prefers-reduced-motion: reduce` を尊重する
- モバイルを主とする。タップ領域 44px 以上、本文 16px 未満にしない

---

## データ取得時の注意

- robots.txt と利用規約を必ず確認し、レート制限を守る
- OCR は **PaddleOCR (Apache-2.0)** を使う。YomiToku は CC BY-NC-SA 4.0 で商用利用に別途ライセンスが必要なため**使わない**
- 抽出値は必ずバリデーションを通す（単位変換の整合性 / 元素量換算後のレンジ / UL 照合 / 桁数 / ブランド内一貫性 / 前回スナップショットとの差分）。異常値は人間レビューキューへ

---

## 未決事項

[docs/product/requirements.md](docs/product/requirements.md) §12 に一覧がある。特に実装前に確定が必要なもの:

- **Q-18** iHerb の送料・関税の扱い 🔒 — 公開後に単価定義を変えると全数字が動く
- **Q-07** 製品の名寄せキー（JAN / UPC / ファジーマッチ）🔒
- **Q-01** `SaltForm` の元素含有率の一次ソース 🔒

これらに触れる実装を行う前に、ユーザーに確認すること。

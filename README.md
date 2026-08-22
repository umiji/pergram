# pergram

**1gあたり、いくら払ってる?**

サプリメントを「有効成分1単位あたりの価格」で横並びに比較するサイト。日本市場向け。

---

## これは何か

サプリメントは剤形・含有量・内容量・価格・**塩形態**がバラバラで、「同じ成分を同じ量だけ摂るのにいくらかかるか」を比較する手段が実質的に存在しない。特に日本には公的なサプリラベルのデータベースがない。

pergram は、ラベル表示の含有量を**元素量に換算**したうえで、有効成分1単位あたりの価格で製品を並べる。

### 位置づけ 🔒

**効能を提案するツールではなく、事実を計算して並べるツール。**

- 症状や悩みから商品を推薦しない
- 独自の「総合スコア」「品質スコア」を作らない
- 提供するのは、含有量・価格・公的基準値・第三者認証という**検証可能な数値と事実のみ**

この位置づけは法務戦略そのものであり、崩すと薬機法リスクが一気に戻る。**不可逆。**

### 差別化

「1gあたり単価」を計算すること自体は既存記事も行っている。pergram の差別化は次の3点に置く。

| 軸 | 既存記事の欠陥 |
|---|---|
| **網羅性** | 「おすすめ10選」形式。全製品を見たうえでの最安が分からない |
| **鮮度** | 執筆時点の価格が残り続ける。プロテインは頻繁にセールする |
| **中立性** | 順位がアフィリエイト報酬に影響されている |

最大の非対称性は**製品ページの自動生成**。競合は手書き記事のため製品ページを量産できないが、pergram は DB を持つため製品数ぶんのページが自動で生まれる。

---

## 現在のステータス

**検証フェーズ。プロテイン1成分に絞った骨格が動く状態。データはまだ空。**

| 段階 | 状態 |
|---|---|
| 段0 キーワードボリューム調査 | ✅ 完了（2026-08-05）— **判定: GO** |
| P0 単位正規化・導出計算・i18n 設計・URL 構造 | ✅ 完了 |
| P1c プロテインのパイプラインと LP | 🟡 骨格完成・**実データ未収集** |
| 段1/段2 LP + X / Google 広告 | ⬜ データ収集後 |

段0 の結果、攻略可能な「コスパ」クラスタでプロテインがクレアチンの約30倍の検索需要を持つことが判明し、**P1 の本命をプロテインに決定**した。

プロテインは塩形態を持たず国内品のみで完結するため、🔒 未決事項（Q-18 iHerb の送料・関税 / Q-07 名寄せキー / Q-01 元素含有率の一次ソース）に触れずに実装できる。これが先にプロテインを通す理由。

---

## 開発

Node 22 以上。**依存パッケージなし**（テストは `node:test`、ビルドは素の Node）。

### 主要コマンド一覧

| コマンド | 役割・説明 |
| :--- | :--- |
| `npm test` | 導出計算・正規化・バリデーション・描画の不変条件テスト |
| `npm run build` | `data/*.json`（実データ）を読み込み `dist/` にWebサイトを出力 |
| `npm run preview` | サンプルデータ（6件）を使って `.preview/` に描画し、プレビュー用サーバー（port:4173）を立ち上げる |
| `npm run cf:dev` | ビルド後に Cloudflare Workers のローカルサーバー（http://127.0.0.1:8787）を立ち上げる（**実データ確認用**） |
| `npm run cf:deploy` | ビルド後に Cloudflare Workers へ本番デプロイ |
| `npm run collect:rakuten` | 楽天APIから製品情報を検索・取得し `data/_drafts/` に下書き作成 |
| `npm run ingest` | `data/_drafts/` の下書きデータを検証・正規化して正式な `data/*.json` に取り込む |
| `npm run prices:refresh` | 掲載商品の価格情報を最新化 |
| `npm run ogp` | SNSシェア用の OGP 画像を生成 |
| `npm run validate` | `data/` のバリデーション（データ整合性チェック） |
| `npm run d1:schema:local` | 初回のみ。ローカル D1 データベースにテーブルを作成 |
| `npm run d1:schema` | リモート D1 データベースにテーブルを作成 |
| `npm run d1:waitlist` | Waitlist（ウェイトリスト）登録データを確認 |
| `npm run x:facts` | X 投稿に書いてよい「今の数字」を実データから出す |
| `npm run x:feed` | 過去の X 投稿をフィードから取り、使った切り口・未使用の切り口を並べる |
| `npm run x:lint` | 投稿下書きの文字数・禁止語・URL の位置・「さらに表示」で切れる位置・過去投稿との重複をチェック |
| `npm run x:card` | X 用アイキャッチ（16:9 / 1600×900）を実データとデザイントークンから生成 |

待機リストの API ごと動かすなら。手順は [docs/ops/deploy.md](docs/ops/deploy.md)。

```bash
npm run d1:schema:local   # 初回だけ。ローカル D1 にテーブルを作る
npm run cf:dev            # http://127.0.0.1:8787 — 実データ + Worker
```

### データを入れる手順

認証情報は `.env.local` に置く。`collect:rakuten` と `prices:refresh` は
`--env-file-if-exists=.env.local` で読むので、コマンド側に書かなくてよい。
`.env.example` を写して埋める。

```bash
# 1. 楽天から製品の下書きを作る（内容量は商品名から自動抽出）
npm run collect:rakuten -- --keyword ホエイプロテイン --pages 4

# 2. data/_drafts/*.json の protein_per_100g と brand を人間が埋める
#    タンパク質含有量は商品名から読めないため、商品ページの栄養成分表示を見る

# 3. 正規化・バリデーションを通して data/ に取り込む
npm run ingest -- data/_drafts/rakuten_ホエイプロテイン_2026-08-06.json

# 4. ビルド
npm run build
```

**LP（`/ja/`）は掲載件数に関わらず必ず出力される。**実データが **20 製品未満**のとき出さないのは
ヒーローのランキングカードだけで、LP 本体と Waitlist フォームは出る。
ヒーローにダミーを置かない決まり（`docs/design/design.md` §7 禁止⑧ 🔒）をビルドで強制している。

### ディレクトリ

| パス | 役割 |
|---|---|
| `data/` | 公開データ。保存してよい独立変数は3つだけ（`data/README.md`） |
| `config/markets.json` | 市場ごとの merchant・参照値・免責・通貨。UI の条件分岐をゼロにするための配列 |
| `config/categories.json` | カテゴリ差の吸収先。カテゴリ固有テーブルを作らないための JSON |
| `locales/` | 翻訳キー。未定義キーはビルドを失敗させる |
| `src/lib/cost.js` | **導出計算の唯一の置き場** |
| `src/lib/normalize_protein.js` | 唯一のカテゴリ固有処理（抽出時の正規化） |
| `src/lib/validate.js` | V-01〜V-06 |
| `src/templates/` | ランキングページ / LP |
| `worker/` | Cloudflare Worker（待機リストの受け口）と D1 スキーマ |
| `scripts/` | 収集・取り込み・価格更新・OGP・X 運用 |
| `.claude/skills/x-post/` | X 投稿文を作る skill（`/post` `/reply` `/image`） |

### X の投稿を作る

投稿文は `.claude/skills/x-post/` の skill が作る。Claude Code で `/post`（単発／ツリーの
自動判断）、`/reply`（返信文）、`/image`（アイキャッチ）を使う。

```bash
npm run x:facts                       # 書いてよい数字（掲載件数・上位の単価・取得日）
npm run x:feed                        # 過去投稿・タイプ別の配分・**次に書くタイプと題材**
npm run x:lint -- draft.txt --feed    # 文字数・禁止語・URL の位置・過去投稿との近さ
npm run x:card -- --type rank --headline "袋の値段では、順位は出ない。" --png
```

下書きは `---` だけの行でツリーの投稿を区切る。`x:lint` は error が1件でもあれば
非ゼロで終わる。🔒 **数字は `x:facts` の出力からしか書かない**（価格は毎日動く）。

何を書くかは印象で決めない。投稿は6タイプ（①市場の発見25% / ②コスパ・比較25% /
③共感・あるある20% / ④データ・ランキング15% / ⑤開発日記10% / ⑥直接告知5%）に分かれ、
`x:feed` が直近の実績と目標のずれを数えて**次に書くタイプと題材**を出す。
🔒 **サービスの告知は毎回しない。直接告知は20本に1本。**

過去投稿のフィード URL は `config/x.json`。取得できないときは `.cache/x_posts.json`
（gitignore 済み）で続行し、キャッシュを使ったことを表示する。

アイキャッチは `/image` か明示的に頼んだときだけ作る。インプレッションの根拠は
[docs/Marketing/X_algorithm_2026.md](docs/Marketing/X_algorithm_2026.md)（2026年8月に
公開されたコードの重み）に置いてあり、二次記事の数字は使わない。

### 検証段階の設定

- `dist/robots.txt` は全面 `Disallow`。広告と計測にだけ使い、インデックスさせない。公開時に外す
- LP にアフィリエイトリンクを置かない（広告審査でアフィリエイトサイト判定を避けるため）
- GA4 は `GA4_MEASUREMENT_ID` を渡したときだけ埋め込まれる

---

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| [docs/product/requirements.md](docs/product/requirements.md) | **要件定義書 v0.4** — スコープ、法規制要件、中核アルゴリズム、データモデル、フェーズ計画 |
| [docs/design/design.md](docs/design/design.md) | **デザイン要件書 v1.0** — 目的・必須要素・絶対制約。**Claude Design への受け渡しはこれ1本** |
| [docs/design/service.md](docs/design/service.md) | **UI/UX 定義書 v0.3** — デザイントークン、画面構成、シグネチャ要素「コストの物差し」 |
| ~~[docs/design/ad-lp.md](docs/design/ad-lp.md)~~ | design.md に置き換え済み。競合調査とベンチマークの記録として残す |
| [docs/research/validation-plan.md](docs/research/validation-plan.md) | **先行需要検証プラン v0.3** — 3段階の検証設計、判定基準、計測設計 |
| [docs/ops/deploy.md](docs/ops/deploy.md) | **デプロイ手順** — Cloudflare Workers + D1 のセットアップ、Waitlist の疎通確認 |

読む順序: `validation-plan`（なぜ作るか）→ `requirements`（何を作るか）→ `design/design`（デザイン要件）→ `design/service`（本体の画面）

---

## 中核アルゴリズム

### 元素量換算 🔒

ラベル記載量と、実際の元素・有効成分量は異なる。**換算せずに比較すると結果が根本的に誤る。**

```
酸化マグネシウム   500mg ≒ 元素マグネシウム 約300mg
グリシン酸マグネシウム 500mg ≒ 元素マグネシウム 約50mg   ← 6倍の差
```

`SaltForm` テーブルに (化合物, 対象元素, 元素含有率) を持ち、`amount_elemental` を必ず算出して保存する。

### 単価計算

保存する独立変数は2つだけ。それ以外はすべて導出する。

```
Product.serving_size_g            1食のグラム数
Product.servings_per_unit         1容器あたりの回数
NutrientContent.amount_elemental  1 serving あたりの有効成分量（換算後）

有効成分1単位あたり価格 = price / (amount_elemental × servings_per_unit)
```

**per serving をソートキーにしない** 🔒 — serving はメーカーが任意に定義した単位であり、製品を横断して比較できない。

---

## 技術スタック（予定）

月額目標は**実質0円**（独自ドメイン代のみ）。

| 層 | 採用 |
|---|---|
| ホスティング | Cloudflare Workers（静的アセット・`/ja/` `/en/` サブパス） |
| バッチ実行 | GitHub Actions (cron) |
| データ配信 | リポジトリ内の静的 JSON |
| DB | Cloudflare D1（価格アラートのみ） |
| メール送信 | Resend |
| OCR | PaddleOCR (Apache-2.0) |
| 解析 | GA4 |

```
[ バッチ層 ]  GitHub Actions (cron)
   ├─ DSLD 同期 / 日本製品クローラ    (月次)
   ├─ OCR + LLM 構造化 / 元素量換算   (随時)
   └─ 価格・レビュー取得              (日次)
              ↓ commit
[ データ ]  リポジトリ内 JSON ─── Cloudflare D1（価格アラートのみ）
              ↓ build
[ 配信 ]    Cloudflare Workers (静的アセット)
```

**LLM はバッチ抽出時のみ使用する。リクエストパスでは使用しない。** 🔒

---

## 主要データソース

| ソース | 用途 | ライセンス |
|---|---|---|
| NIH DSLD API | 米国ブランドの成分ラベル | CC0 1.0 |
| 厚生労働省 日本人の食事摂取基準(2025年版) | RDA / AI / UL / EAR / DG | 公的資料 |
| 消費者庁 機能性表示食品 届出データベース | 届出表示の引用 | 公的資料 |
| 栄養機能食品 規格基準 | 定型文 | 公的資料 |
| 楽天商品検索 API | 価格・レビュー集計値 | 要規約確認 |
| PaddleOCR | OCR | Apache-2.0 |

---

## 免責

本サイトは医療上の助言を行うものではありません。掲載製品は医薬品ではなく、疾病の診断・治療・予防を目的としたものではありません。摂取の判断は医師・薬剤師にご相談ください。

# デプロイ手順 — Cloudflare Pages + D1

配信は Cloudflare Pages。待機リストの受け口だけ Pages Functions（`functions/api/waitlist.js`）で、
保存先は D1。設定の出所は [wrangler.toml](../../wrangler.toml) ひとつ。

> **`wrangler.toml` があると Pages ダッシュボードのバインディング設定は無視される。**
> バインディングを足すときは必ず `wrangler.toml` に書く。ダッシュボードで足しても効かない。

依存パッケージは入れない方針なので wrangler は `npx` 経由で呼ぶ。ローカルには何も常駐しない。

---

## 1. ログイン

```bash
npx wrangler login       # ブラウザが開く。アカウントを選んで許可する
npx wrangler whoami      # アカウント名と ID が出れば成功
```

## 2. D1 を2つ作る

本番と、本番以外のブランチのプレビュー用。**同じ DB を指してはいけない。**
動作確認の投稿が実際の待機リストに混ざり、登録率の分母が狂う。

```bash
npx wrangler d1 create pergram
npx wrangler d1 create pergram-preview
```

それぞれの出力に `database_id = "..."` が出る。
**[wrangler.toml](../../wrangler.toml) の `REPLACE_WITH_PRODUCTION_D1_ID` と
`REPLACE_WITH_PREVIEW_D1_ID` を、この値に置き換えてコミットする。**
（`database_id` は秘密情報ではない。API トークンとは違う）

## 3. スキーマを流す

```bash
npm run d1:schema                                          # 本番
npx wrangler d1 execute pergram-preview --remote --file functions/schema.sql   # プレビュー
```

`waitlist` と `price_alert` ができる。
🔒 サーバに置いてよい列は [functions/schema.sql](../../functions/schema.sql) にあるものだけ。
年齢・性別・体調・服薬情報の列を足さない。

## 4. Pages プロジェクトを作って GitHub と繋ぐ

Cloudflare ダッシュボード → Workers & Pages → Create → Pages → Connect to Git。

| 項目 | 値 |
|---|---|
| リポジトリ | `umiji/pergram` |
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 22 以上（環境変数 `NODE_VERSION=22`） |

ビルド時の環境変数（任意）:

| 変数 | 効果 |
|---|---|
| `GA4_MEASUREMENT_ID` | 渡すと計測タグが入る。**渡さなければ入らない。**検証を始めるまでは未設定でよい |

🔒 `RAKUTEN_APP_ID` は Cloudflare に置かない。データ収集はローカルで回してコミットする。

## 5. デプロイして確認する

Git 連携をしていれば `main` への push で自動デプロイされる。手元から出すなら:

```bash
npm run cf:deploy
```

確認する URL:

| URL | 中身 |
|---|---|
| `/` | `/ja/` へ 302 |
| `/ja/` | LP。**掲載件数に関わらず必ず出る** |
| `/ja/protein/` | 製品一覧。データ 0 件なら「まだ登録されていません」 |

`data/` が空のあいだ、LP のヒーローにランキングカードは出ない（🔒 ダミーを置かないため）。
LP 本体・Waitlist フォームは出る。**これが正しい状態。**

## 6. Waitlist の疎通を確認する

LP のフォームから実際に送信して、行が入ったか見る。

```bash
npm run d1:waitlist
```

🔒 出てくる列が `email` / `nutrients` / `channel` / `created_at` の**4つだけ**であることを確認する。
これ以外が入っていたら、どこかで受け取ってはいけないものを保存している。

---

## ローカルで Functions ごと動かす

D1 バインディングを含めて本番と同じ形で動く。Cloudflare のアカウントは要らない。

```bash
npm run d1:schema:local   # 初回だけ。ローカル D1 (.wrangler/state) にテーブルを作る
npm run cf:dev            # http://127.0.0.1:8788
```

`npm run preview` との違い:

| | データ | Functions |
|---|---|---|
| `npm run preview` | サンプル（`tests/fixtures.js`） | 動かない |
| `npm run cf:dev` | `data/` の実データ（現状 0 件） | 動く |

疎通の確認:

```bash
curl -X POST http://127.0.0.1:8788/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","nutrients":["creatine"],"channel":"rakuten"}'
# → {"ok":true}
npx wrangler d1 execute pergram --local --command "SELECT * FROM waitlist"
```

---

## 決めていないこと

- **`robots.txt` は `Disallow: /`**（[build.js](../../src/build/build.js)）。
  検証段階では意図的にインデックスさせていない。一般公開に切り替えるときに外す。
- **独自ドメイン** 未取得。当面は `*.pages.dev` で動かす。
- **CSP の `script-src 'unsafe-inline'`**（`_headers`）。GA4 の初期化スニペットがインラインなため。
  静的ビルドではリクエストごとの nonce を発行できない。GA4 を使わないなら外せる。

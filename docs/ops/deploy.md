# デプロイ手順 — Cloudflare Workers + D1

## 仕組み

配信は **Cloudflare Workers（静的アセット）**。Pages ではない。

```
リクエスト
   ├─ dist/ に該当ファイルがある  → そのまま返す（LP・製品一覧・CSS・JS）
   └─ 無い                        → worker/index.js が受ける
                                        └─ /api/waitlist なら D1 に保存
```

静的ファイルが先で、そこに無いパスだけが Worker に届く。だから Worker が受けるのは
実質 `/api/waitlist` だけになる。

設定の出所は [wrangler.toml](../../wrangler.toml) ひとつ。
**このファイルがあるとダッシュボードで足したバインディングは効かない。**

> **Pages ではないので `functions/` ディレクトリは使えない。**
> ルートを足すときは [worker/index.js](../../worker/index.js) の `ROUTES` に1行足す。

依存パッケージは入れない方針なので wrangler は `npx` 経由で呼ぶ。

---

## 1. ログイン

```bash
npx wrangler login       # ブラウザが開く。アカウントを選んで許可する
npx wrangler whoami      # アカウント名と ID が出れば成功
```

## 2. D1 を作る（済んでいれば飛ばす）

```bash
npx wrangler d1 create pergram
npx wrangler d1 create pergram-preview
```

出力の `database_id` を [wrangler.toml](../../wrangler.toml) に貼る。
（`database_id` は秘密情報ではない。API トークンとは違う）

## 3. スキーマを流す

```bash
npm run d1:schema     # 本番
```

`waitlist` と `price_alert` ができる。確認は `npx wrangler d1 info pergram` の `num_tables`。

🔒 サーバに置いてよい列は [worker/schema.sql](../../worker/schema.sql) にあるものだけ。
年齢・性別・体調・服薬情報の列を足さない。

## 4. Worker を GitHub と繋ぐ

Cloudflare ダッシュボード → Workers & Pages → 対象の Worker → Settings → Build。

| 項目 | 値 |
|---|---|
| リポジトリ | `umiji/pergram` |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

ビルド時の環境変数（任意）:

| 変数 | 効果 |
|---|---|
| `GA4_MEASUREMENT_ID` | 渡すと計測タグが入る。**渡さなければ入らない。**検証を始めるまでは未設定でよい |

🔒 `RAKUTEN_APP_ID` は Cloudflare に置かない。データ収集はローカルで回してコミットする。

**Production branch は `main`。`main` に入っていない変更はデプロイされない。**
LP が 404 になるときは、まずここを疑う。

## 5. デプロイして確認する

`main` への push で自動デプロイされる。手元から出すなら:

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

**動作確認の行は本番の DB に入る**（下記「プレビューの扱い」）。確認が済んだら消す:

```bash
npx wrangler d1 execute pergram --remote --command "DELETE FROM waitlist WHERE email LIKE '%@example.com'"
```

---

## ローカルで Worker ごと動かす

D1 を含めて本番と同じ形で動く。Cloudflare のアカウントは要らない。

```bash
npm run d1:schema:local   # 初回だけ。ローカル D1 (.wrangler/state) にテーブルを作る
npm run cf:dev            # http://127.0.0.1:8787
```

`npm run preview` との違い:

| | データ | Waitlist API |
|---|---|---|
| `npm run preview` | サンプル（`tests/fixtures.js`） | 動かない |
| `npm run cf:dev` | `data/` の実データ（現状 0 件） | 動く |

疎通の確認:

```bash
curl -X POST http://127.0.0.1:8787/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","nutrients":["creatine"],"channel":"rakuten"}'
# → {"ok":true}
npx wrangler d1 execute pergram --local --command "SELECT * FROM waitlist"
```

---

## つまずいたところ（記録）

- **`EBUSY: resource busy or locked, rmdir 'dist'`** — `wrangler dev` を起動したまま
  `npm run build` を回すと、Worker が `dist` を掴んだままで消せない。
  ターミナルを閉じただけでは残ることがある。
  **`workerd.exe` だけ落としても親の `wrangler dev` が作り直すので、親から落とす:**

  ```powershell
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like '*wrangler*dev*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Get-Process workerd -ErrorAction SilentlyContinue | Stop-Process -Force
  ```

- **D1 の `[code: 7403] The given account is not valid or is not authorized`** —
  Cloudflare API 側の一時的な失敗として観測した。`wrangler d1 list` が通るのに
  `d1 execute --remote` だけ落ちる場合は、少し置いて再実行する。
  再現し続けるならログインし直す（`npx wrangler logout` → `npx wrangler login`）。

- **ダッシュボードで作ると Pages ではなく Workers になる** — 2025年以降、Cloudflare は
  新規を Workers に寄せている。`wrangler pages deployment list` が
  「Project not found」で `wrangler versions list` が通るなら Workers 側。

---

## プレビューの扱い

既定では、本番以外のブランチのプレビューも**本番の D1 に書く**。
分けたいときだけ、ダッシュボードの非本番ブランチの Deploy command を
`npx wrangler deploy --env preview` にする。`pergram-preview` という別の Worker として
配信され、[wrangler.toml](../../wrangler.toml) の `[env.preview]` の D1 を使う。

検証フェーズでは分けなくても回る。その代わり**動作確認の行を必ず消す**（手順6）。

---

## 決めていないこと

- **`robots.txt` は `Disallow: /`**（[build.js](../../src/build/build.js)）。
  検証段階では意図的にインデックスさせていない。一般公開に切り替えるときに外す。
- **独自ドメイン** 未取得。当面は `*.workers.dev` で動かす。
- **CSP の `script-src 'unsafe-inline'`**（`_headers`）。GA4 の初期化スニペットがインラインなため。
  静的ビルドではリクエストごとの nonce を発行できない。GA4 を使わないなら外せる。

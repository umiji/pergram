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

⚠️ `CREATE TABLE IF NOT EXISTS` は**既存のテーブルに列を足さない**。
稼働中の DB に列を増やしたときは `worker/migrations/` の SQL を1度だけ流す。

```bash
npx wrangler d1 execute pergram --remote --file worker/migrations/2026-08-10_waitlist_freetext.sql
```

2度流すと `duplicate column name` で失敗する。それが正しい挙動（既に入っている）。

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

🔒 楽天の認証情報は Cloudflare に置かない。収集はローカル、価格更新は GitHub Actions で回し、
結果を `data/` にコミットする。Cloudflare は生成済みの `dist/` を配るだけ。

### GitHub Secrets（日次の価格更新に要る）

`.github/workflows/prices.yml` が毎朝 06:00 JST に `refresh_prices.js` を回す。

🔒 **置き場は Repository secrets ではなく Environment `pergram-dev`。**
Settings → Environments → `pergram-dev` → Environment secrets に4つとも登録する
（画面の場所: Settings → Secrets and variables → Actions の **Environment secrets** 側）。
workflow の `environment: pergram-dev` の宣言と対になっており、片方だけだと
`secrets.*` が空文字で入って「未設定」で止まる。**値は `.env.local` と同じ。**

| Secret | 備考 |
|---|---|
| `RAKUTEN_APP_ID` | UUID 形式 |
| `RAKUTEN_ACCESS_KEY` | `pk_` で始まる |
| `RAKUTEN_APP_URL` | Referer に載せるアプリ URL。🔒 **楽天デベロッパー画面に登録したアプリ URL と一致していないと 403 `HTTP_REFERRER_NOT_ALLOWED` になる。ドメインを移したらここも必ず更新する**（2026-08-24 の `pergram.site` 移行で更新が漏れ、日次更新が12日間止まった） |
| `RAKUTEN_AFFILIATE_ID` | 🔒 欠けると購入リンクを素の URL で全上書きしてしまうため必須 |

**ドメインを移すときに一緒に直すもの**（`src/lib/site.js` の `SITE_ORIGIN` だけでは足りない）:
Environment `pergram-dev` の `RAKUTEN_APP_URL` / 楽天デベロッパー画面のアプリ URL /
ローカルの `.env.local` の `RAKUTEN_APP_URL`。**3つは常に同じホストに保つ。**

⚠️ このジョブは `data/price_snapshots.json` を更新して `main` にコミットするだけで、
**デプロイはしない。**価格の更新を公開に反映するには別途デプロイが要る。

**Production branch は `main`。`main` に入っていない変更はデプロイされない。**
LP が 404 になるときは、まずここを疑う。

## 5. デプロイして確認する

`main` への push で自動デプロイされる。手元から出すなら:

```bash
npm run cf:deploy
```

確認する URL（本番のオリジンは **`https://pergram.site`**。出所は
[src/lib/site.js](../../src/lib/site.js) の `SITE_ORIGIN` ひとつ）:

| URL | 中身 |
|---|---|
| `/` | `/ja/` へ 302 |
| `/ja/` | LP。**掲載件数に関わらず必ず出る** |
| `/ja/protein/` | 製品一覧。データ 0 件なら「まだ登録されていません」 |
| `/robots.txt` | クロール許可範囲。`Disallow: /ja/protein/` と `Sitemap:` 行が入る |
| `/sitemap.xml` | `/ja/` の1件のみ。`Content-Type` が `application/xml` であること |
| `/llms.txt` | LLM 向けの要約。単価の定義と順位の決め方 |

この3ファイルは [crawl.js](../../src/build/crawl.js) が `crawlPolicy()` ひとつから
生成している。robots.txt を手で書き換えても sitemap.xml が追従しないので、
**必ず `crawlPolicy()` を直す。**

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

- **製品一覧 `/ja/protein/` はクロール対象外**（[crawl.js](../../src/build/crawl.js)）。
  他ストアの価格欄が `¥X` / `¥XXXX` のプレースホルダのままのため塞いでいる。
  実データが入って `PLACEHOLDER_MERCHANTS` を消したら、`crawlPolicy()` の
  `blocked` から外して `open` に移す。robots.txt と sitemap.xml の両方が同時に追従する。
  ⚠️ `Disallow` はクロールを止めるがインデックス登録は止めない。LP からリンクが
  あるため、Google が URL のみで登録する可能性は残る（`noindex` はクロールを
  許可しないと読まれないので両立しない）。被リンクの少ないうちは実害が小さいと判断している。
- **Search Console 未登録**。所有権確認タグは `GOOGLE_SITE_VERIFICATION` を
  渡せば入る（未設定なら出力されない）。登録するときのプロパティは
  **`https://pergram.site/`**。旧 `*.workers.dev` では登録しない（下記のとおり転送元でしかなく、
  移行時に全 URL の申告をやり直すことになる）。
- **旧ドメインを畳む時期**は決めていない。**独自ドメイン `pergram.site` は取得済みで、
  2026-08-24 から本番として稼働している**（実測 2026-09-02: `/robots.txt` `/sitemap.xml`
  `/llms.txt` はいずれも 200。`robots.txt` の `Sitemap:` 行と `sitemap.xml` の `<loc>` も
  `https://pergram.site/` を指している）。旧 `pergram.pergram-official.workers.dev` は
  [worker/index.js](../../worker/index.js) が `pergram.site` へ恒久転送している
  （実測 2026-09-02: 301。🔒 **閲覧は 301、それ以外のメソッドは 308** — 301 はブラウザが
  POST を GET に作り替えるので、待機リストの登録が静かに消える）。転送は
  `wrangler.toml` の `run_worker_first = true` が前提で、**旧ドメインを畳んだら
  `false` に戻してよい。**
- **CSP の `script-src 'unsafe-inline'`**（`_headers`）。GA4 の初期化スニペットがインラインなため。
  静的ビルドではリクエストごとの nonce を発行できない。GA4 を使わないなら外せる。

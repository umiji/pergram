---
name: browser-measure
description: ブラウザで幅ごとのレイアウトを実測する測定台。Chrome ヘッドレス + DevTools Protocol（依存パッケージなし）で、指定した CSS セレクタの位置・寸法・scrollWidth・可視かどうか・行ごとの文字列を JSON で返す。見た目の完了条件を数値で判定するとき、折り返し・横溢れ・孤立行・2つの部品の寸法一致を確かめるとき、押下後やホバー時の姿を測るときに使う。「幅ごとに測る」「レイアウトが崩れていないか確認する」「モバイル幅で見る」ときはこれを使い、自分で Chrome の起動コードを書き起こさない。
---

# ブラウザ実測の測定台

**この手順とコードを、タスクの指示文へ書き写さない。ここを呼ぶ。**

**動かなくなったら、指示文へ手順を書き写して回避せず、このスキルを直すこと。**
Chrome の版とパスに依存しているのは承知の上である（T-072 の決定ログ）。壊れたら直す場所はここ1つ。

**なぜ常設されているか**: T-053 / T-057 / T-061 の3タスクが同じ測定台を**少なくとも6回**書き起こし、
そのうち1回は `document.fonts.ready` を待たない測定台で**誤った設計を確定させた**。

---

## 使い方（3手）

### 1. 測る対象を用意する

```bash
npm run preview -- --build-only    # サンプルデータを .preview/ へ書き出す（配信はしない）
npm run build                      # 実データを測るなら dist/ を作る
```

### 2. 測る

```bash
MSYS_NO_PATHCONV=1 node .claude/skills/browser-measure/measure.js \
  --root .preview --path /ja/protein/ \
  --widths 375,768,1440 \
  --select ".request-band" --select ".request-band__lede" \
  --lines --out measure.json
```

`--root` に渡したディレクトリは、**このスクリプトが 127.0.0.1 の空きポートへ自分で配信する。**
別のターミナルでサーバを立てる必要はない（立てたものを測るなら `--url` を使う）。

### 3. 読む

JSON は `measurements[]`（幅ごと）→ `elements[]`（セレクタごと）の入れ子。1要素につき:

| 欄 | 中身 |
|---|---|
| `x` `y` `left` `top` `right` `bottom` | 位置（ビューポート座標）。`pageX` `pageY` は文書座標 |
| `width` `height` | **箱**の寸法 |
| `inkWidth` `inkHeight` `inkLeft` `inkRight` | **中身（インク）**が実際に占める寸法 |
| `scrollWidth` `clientWidth` `overflowX` | 横溢れの判定。`overflowX` が true なら溢れている |
| `visible` | 可視かどうか（`checkVisibility` + rect + display/visibility/opacity/[hidden]） |
| `display` `fontSize` `lineHeight` `fontFamily` | 計算値。`--styles` で他のプロパティも足せる |
| `lineCount` `lines[]` `lastLineChars` | `--lines` のとき。**孤立行の検査はこれで機械判定できる** |
| `text` `textChars` | `--text` のとき |

`measurements[].document` に文書全体の `scrollWidth` / `clientWidth` / `overflowX` が入る。
セレクタが1件も一致しなければ `missing[]` に理由が入り、**終了コード 2 で失敗する**（黙って空を返さない）。

**`width` と `inkWidth` を取り違えない。** 段落や見出しの `width` は親が決めるので、
書体が入れ替わっても変わらない。**書体の効きは `inkWidth` に出る。**

---

## よく使う形

```bash
# 幅ごとの横溢れと孤立行を一度に見る
--widths 320,375,390,768,900,1024,1280,1440 --lines

# 押した後の姿（要望ボタンの「受領」など）
--click ".request-band__button"

# ホバー時の姿（CSS.forcePseudoState。マウスは動かさない）
--force-hover ".request-band__button"

# 見た目も確認したい（.preview/ 配下は .gitignore 済み。次の npm run preview で消える）
--shot-dir .preview/_shots

# 書体を待つ前後の差を出す（下の「罠」の1つ目の検証）
--font-diff

# .preview では GA4 が構成されず window.dataLayer が空。gtag のスタブを差し込む
--init-script path/to/gtag-stub.js
```

`node .claude/skills/browser-measure/measure.js --help` に全オプションがある。

---

## 罠 — どれも実際に踏んで時間を失ったもの

### 1. `document.fonts.ready` を待たずに測ると、文字幅が細く出る

このサイトは Google Fonts（Noto Sans JP / JetBrains Mono、`display=swap`）を使う。
書体が届く前はフォールバックで組まれ、**文字が 15〜20% 細い。**
この値で「この幅なら折り返さない」と判断すると、実機では折り返す。**T-057 で実際に誤った設計を確定させた。**

このスクリプトは**常に `document.fonts.ready` を待ってから測る。**
差を自分の目で確かめたければ `--font-diff` を付ける（`fontDiff[].inkWidthDeltaPct` に出る）。

### 2. `dist/` や `.preview/` を `file://` で開かない

HTML は CSS と JS を `/assets/...` という**ルート絶対パス**で読む。
`file://` ではドライブのルートを指すので当たらないが、**エラーにはならない。**
素の HTML が「読めるが崩れた見た目」で表示され、**そのまま測るとレイアウトの観測が丸ごと誤る。**

実測（同じページ・同じ幅 1440px、`.request-band`）:

| 開き方 | x | width |
|---|---|---|
| `http://127.0.0.1:PORT/ja/protein/` | 332.5 | 1056 |
| `file:///…/.preview/ja/protein/index.html` | 8 | **1409** |

このスクリプトが自前でサーバを立てているのは、この事故を構造的に起こせなくするためである。
**`--url file://…` は通してあるが、それはこの罠を再現して見せるためのものだと思ってよい。**

### 3. `--window-size` で幅を作らない

`--window-size=375,812` だけでは **meta viewport が無視され**、デスクトップのレイアウトが
375px の窓に切れて写るだけになる。「モバイルで崩れている」ように見えても**計測手段の側の問題**である。

幅は CDP の `Emulation.setDeviceMetricsOverride`（`mobile: true`）で作る。
このスクリプトは幅 768px 未満を既定でモバイル扱いにする（`--mobile always|never` で上書きできる）。

### 4. `--headless=new` は環境によって終了コード 21 で即死する

旧 `--headless` と**絶対パスの `--user-data-dir`** を使う。両方このスクリプトに入っている。
**起動に失敗したら黙って 0 を返さず、終了コードと stderr を添えて終了コード 1 で失敗する。**

### 5. Git Bash が `/ja/protein/` を Windows のパスへ書き換える

MSYS2 のパス変換で `--path /ja/protein/` が `C:/Program Files/Git/ja/protein/` になり、URL が壊れる。
**`MSYS_NO_PATHCONV=1` を頭に付ける。** 付け忘れた場合はスクリプトが検出して理由付きで止まる。

### 6. デスクトップ幅ではスクロールバーが 15px 取る

`--widths 1440` で `document.clientWidth` は **1425** になる（`mobile: false` のとき）。
実機の Chrome も同じなので**これが正しい**が、「1440 のはずが 1425」と驚かないこと。
`mobile: true` の幅ではスクロールバーが乗らないので一致する。

### 7. `.preview` は GA4 が構成されない

`window.dataLayer` が空のまま。計測イベントの回帰を実画面で数えるなら
`--init-script` で `gtag` のスタブをページ読み込み前に差し込む。
**レイアウトの実測には影響しない。**

---

## 中身

| ファイル | 役割 |
|---|---|
| `measure.js` | CLI。引数を解き、幅ごとに測って JSON を返す |
| `lib/chrome.js` | Chrome の起動。**起動オプションはすべて実測の結果である。整理しない** |
| `lib/cdp.js` | 依存パッケージなしの DevTools Protocol クライアント（Node 22 標準の `WebSocket`） |
| `lib/serve.js` | 測定のための静的配信。`scripts/serve.js`（製品側）とは**意図的に別実装** |
| `lib/probe.js` | ページの中で走る測定関数。**モジュールスコープを掴んではならない**（文字列化して送られる） |

**依存パッケージを足さない。** このリポジトリは依存ゼロで動く（`package.json` に手を入れない）。

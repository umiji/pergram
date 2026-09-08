# CTA バンドのベンチマーク — 左テキスト / 右ボタンの帯

製品一覧ページの「行動を呼びかける横長の帯」を組み直すための、実在サービスとデザインシステムの実測記録。
**実装は含まない。** 数値はすべて実測または公開ソースからの引用であり、推測で埋めた欄は「不明」と書いてある。

---

## このベンチマークが pergram の帯に示す含意

1. **垂直中央そろえが多数派。** 左列が複数行でも中央のままにしている（NICE / GOV.UK / Mailchimp / 楽天 / Primer）。pergram も**垂直中央**で組むのが妥当。
2. **右列はグリッドの固定比率にせず、ボタンの文字幅ぶんだけに縮めて右端へ寄せる**例が最多。pergram のボタンも**文字幅**にし、列いっぱいに伸ばさない。
3. **帯そのものに最大幅を置いて中央寄せする**（GOV.UK 960px / Primer 1280px）。1440px 以上で右列を画面の端まで引き伸ばしている例は無かった。
4. **注記・マイクロコピーはボタンの下**。実測できた3例すべてが下で、上に置いた例は0だった。
5. **1列へ落とす閾値は 600〜800px が最頻**（Primer だけ 1012px と早い）。

---

## 調査方法

- ローカルの Chrome を `--headless=new --remote-debugging-port` で起動し、DevTools Protocol の
  `Emulation.setDeviceMetricsOverride` で **1440 / 1024 / 800 / 600px** の4幅に切り替えて同一ページを再測定した。
- 各ページで「ボタン状の要素を最後の子に持ち、最初の子にテキストがあり、両者が同じ行に並ぶ幅500px以上のブロック」を
  自動検出し、`getBoundingClientRect()` と `getComputedStyle()` の実値を記録した。
  ヘッダ・ナビ・フッタ（`header,nav,footer,[role=banner],[role=navigation],[role=contentinfo]`）は除外している。
- デザインシステムについては、ドキュメントページの描画結果に加えて**公開ソースの CSS / TSX を直接読んだ**。
- 測定スクリプトは一時ディレクトリに置いており、リポジトリには入れていない。
- **「見つからなかった」は「1列に落ちた」と「そもそも別レイアウトになった」の区別が付かない。**
  そのため下の「1列化」欄は、2列が確認できた最小幅と、確認できなかった最大幅の**区間**として書いてある。

---

## 事例一覧

| # | 事例 | 種別 | 左:右（1440px 実測） | 垂直そろえ | ボタン幅 | 帯の最大幅 | 1列化 |
|---|---|---|---|---|---|---|---|
| 1 | Primer (GitHub Brand) CTABanner `minimal` | デザインシステム | **6:6 = 50:50**（12カラム） | **中央** `align-items:center` | 文字幅 | **1280px** 中央寄せ | **1012px** |
| 2 | GitHub Copilot 製品ページ ヒーロー | SaaS | 746px : 533px = **58:42** | **中央**（左列 `align-items:center`） | 文字幅 123px | **1280px** | 不明 |
| 3 | NICE Design System Action Banner | デザインシステム（公的医療） | 686px : 91px = 86:11 | **中央** `align-items:center` | 文字幅 91〜110px | コンテナ依存 | 600px でも2列 |
| 4 | GOV.UK「Is this page useful?」 | 政府 | 376px : 240px（帯960px） | **中央** `align-items:center` | 文字幅 240px | **960px** で頭打ち | 600〜800px |
| 5 | Stack Overflow 質問ヘッダ | メディア/Q&A | 688px : 111px = 85:14（@1024） | **上そろえ**（`normal`、両列 top 一致） | 文字幅 99px | 無し | 600〜800px |
| 6 | HubSpot 販促ストリップ | SaaS | 993px : 85px = **91:8** | **上そろえ** `align-items:start` | 文字幅 85px | 無し | 1024〜1440px |
| 7 | GitLab「Flex Commitment」 | SaaS | 583px : 583px = **50:50** | `normal`（stretch） | 文字幅 196px | 無し | 600〜800px |
| 8 | DigitalOcean チュートリアル下部 CTA | SaaS/メディア | 532px : 532px = **50:50**（gap 24px） | `normal`（stretch） | 文字幅 106px | 無し | 600〜800px |
| 9 | Mailchimp Cookie 同意バンド | SaaS | 404px : 202px = 58:29（gap 44px） | **中央** `align-items:center` | **列いっぱい 202px** | 無し | 600〜800px |
| 10 | 楽天市場 会員登録バンド | EC（日本） | 476px : 269px = 47:26 | **中央** `align-items:center` | 文字幅 90px | 親に 1340px / 帯は1020px 固定 | 落ちない（固定幅） |
| 11 | Zapier インライン CTA（**対照例**） | SaaS | 340px : 340px（`justify-content:center`） | **中央** | **列いっぱい 340px** | 無し | 600px 未満 |

---

## 事例ごとの詳細

### 1. Primer (GitHub Brand) CTABanner — `minimal` バリアント

- **URL**: https://primer.github.io/brand/components/CTABanner/
- **ソース**: `primer/brand` の `packages/react/src/CTABanner/CTABanner.module.css` / `CTABanner.tsx`
- **列の比率**: 左右とも `Grid.Column span={{xsmall: 12, large: 6}}` → **large 以上で 6:6（50:50）、xsmall では 12（全幅）**。
- **垂直そろえ**: `.CTABanner-grid-column--primary { display:flex; align-items:center }`、secondary も同じ。
  → **垂直中央**。左列は見出し＋説明文＋注記で**複数行になるが中央のまま**。
- **右列の寄せ**: `.CTABanner--variant-minimal .CTABanner-grid-column--secondary { justify-content: flex-end }` → 右端寄せ。
- **注記の位置**: `trailingComponent` は `restChildren`（見出し・説明文・ButtonGroup を含む）の**直後**に描画される。
  ただし `minimal` バリアントでは **ButtonGroup だけが右列へ移される**ため、注記は左列の説明文の下に残り、ボタンの直下には来ない。
  既定（`default`）バリアントでは1列構成なので、注記は**ボタンの下**になる。
- **ボタン幅**: ButtonGroup は文字幅。`.CTABanner-buttonGroup { padding-block-start: var(--base-size-12) }`。
- **広い画面**: `.CTABanner { max-width: var(--brand-breakpoint-xlarge); margin: 0 auto }`、内側の Grid は `max-width: 1280px`。
  さらに左列テキストは `.CTABanner-content { max-width: 576px }`（minimal/balanced）で頭打ち。**中身を右端まで伸ばさない。**
- **1列化**: `@media screen and (max-width: 63.24rem)` = **1011.84px 以下で縦積み**（large ブレークポイントは 63.25rem = 1012px）。
- **公式の指針**: `align` プロパティは `start`（既定）/ `center`。「Use the left alignment if there's a background image on the right side.」
  `hasBackground` 既定 有効 / `hasShadow` 既定 有効 / `hasBorder` 既定 無効（「recommended only when shadow is absent」）。

### 2. GitHub Copilot 製品ページ ヒーロー

- **URL**: https://github.com/features/copilot
- **列の比率**: 1440px で 746px : 533px（**58:42**）。12カラム 1280px グリッド（1カラム 106.5px）で **7:5 相当**。
- **垂直そろえ**: 左列 `align-items: center`、右列 `justify-content: flex-end`。**両列とも複数行だが中央。**
- **注記の位置**: 右列の内部が 説明文 → ボタン2つ → 「Visual Studio Code をすでにお持ちですか? 今すぐ開く」。→ **ボタンの下**。
- **ボタン幅**: 文字幅（実測 123px、`display:inline-flex`、`width: 122.812px`）。
- **広い画面**: 帯の `max-width: 1280px`。
- **1列化**: **不明**（1440px でのみ測定した）。

### 3. NICE Design System — Action Banner

- **URL**: https://design-system.nice.org.uk/components/action-banner/
- **列の比率**: 1440px で 686px : 91px。**右列は固定比率ではなくボタンの文字幅ぶんだけ**に縮む（`justify-content: space-between`）。
- **垂直そろえ**: `align-items: center`。左列は見出し＋本文の**2行以上**。右列の `top` が左列より下にずれており、帯の中央に置かれていることが実測で確認できる。
- **注記の位置**: 帯の中にマイクロコピー・注記は無い。
- **ボタン幅**: 文字幅（"A CTA" 91px / "A button" 110px）。右列そのものがボタン幅に縮んでいる。
- **広い画面**: コンポーネント自身の `max-width` は測定上 `none`。公式に
  「Don't use within a container component. Action banners fill the available horizontal space and have their own built-in container.」
- **1列化**: **600px でも2列のまま**（テスト範囲では縦積みしない）。

### 4. GOV.UK「Is this page useful?」

- **URL**: https://www.gov.uk/vehicle-tax（GOV.UK 全ページ共通、フッタ手前）
- **列の比率**: 1440px で 376px : 240px、帯は 960px。`justify-content: space-between` なので中間が余白。
- **垂直そろえ**: `align-items: center`。左列は「Is this page useful?」＋ Yes / No の2リンクで**複数行だが中央**。
- **注記の位置**: 無し。
- **ボタン幅**: 文字幅 240px（右列がボタン幅ちょうどに縮んでいる）。
- **広い画面**: **1024px でも 1440px でも帯は 960px**。最大幅で頭打ちにして中央寄せする典型例。
- **1列化**: 800px では2列（帯 740px）、600px では検出されず → **600〜800px の間**。
- **関連する公式指針**（Button コンポーネント）: 「Align the primary action button to the left edge of your form.」
  「Use a button group when two or more buttons are placed together.」
  ボタン幅やマイクロコピーの上下についての記述は**無い**（確認済み）。

### 5. Stack Overflow 質問ヘッダ

- **URL**: https://stackoverflow.com/questions/32551291/in-css-flexbox-why-are-there-no-justify-items-and-justify-self-properties
- **列の比率**: 1024px で 688px : 111px（**85:14**）。`display:flex; justify-content: space-between`、右列 `justify-content: flex-end`。
- **垂直そろえ**: 帯の `align-items` は `normal`。左列と右列の `top` が一致（両方 top80）→ **上そろえ**。左列は質問タイトルで1〜2行。
- **注記の位置**: 無し。
- **ボタン幅**: 文字幅 99px。
- **広い画面**: `max-width` 無し。1440px では検出されず（別レイアウトへ切り替わる）。
- **1列化**: 800px では2列、600px では検出されず → **600〜800px の間**。

### 6. HubSpot 販促ストリップ

- **URL**: https://www.hubspot.com/pricing/marketing
- **列の比率**: 1440px で 993px : 85px（**91:8**）。`justify-content: space-between`。
- **垂直そろえ**: **`align-items: start`（上そろえ）**。ただし帯の高さは 48px、左テキストは1行なので**上そろえと中央の差はほとんど出ない**。
- **注記の位置**: 独立した注記は無く、左テキスト自体が「New customers only. Select offers available…」という注記を兼ねている。
- **ボタン幅**: 文字幅 85px。
- **広い画面**: `max-width` 無し、帯は 1086px。
- **1列化**: 1024px 以下では検出されず → **1024〜1440px の間**。

### 7. GitLab「GitLab Flex Commitment」

- **URL**: https://about.gitlab.com/pricing/
- **列の比率**: `grid-template-columns: 583px 583px` = **50:50**。
- **垂直そろえ**: 帯は `align-items: normal`（= stretch）。右列は `justify-content: center`。**両列とも複数行のブロック**。
- **注記の位置**: ボタンの**下**に副次リンク「詳しく知る」。
- **ボタン幅**: 文字幅 196px（列幅 583px に対して伸ばしていない）。
- **広い画面**: `max-width` 無し、帯は 1168px。
- **1列化**: 800px では2列（362px 362px）、600px では検出されず → **600〜800px の間**。

### 8. DigitalOcean チュートリアル下部 CTA

- **URL**: https://www.digitalocean.com/community/tutorials/how-to-use-flexbox-to-build-a-website-layout
- **列の比率**: `grid-template-columns: 532px 532px`、`gap: 24px` = **50:50**。
- **垂直そろえ**: `align-items: normal`（stretch）。左右とも見出し＋本文＋リンクの複数行ブロック。
- **注記の位置**: 無し。右列は 見出し → 本文 → ボタンの順。
- **ボタン幅**: 文字幅 106px。
- **広い画面**: `max-width` 無し、帯は 1088px。
- **1列化**: 800px では2列（348px 348px）、600px では検出されず → **600〜800px の間**。

### 9. Mailchimp Cookie 同意バンド

- **URL**: https://mailchimp.com/pricing/
- **列の比率**: 404px : 202px（**58:29**）、`gap: 44px`。
- **垂直そろえ**: `align-items: center`。**左列は長い段落（帯の高さ 128px）で明確に複数行だが、それでも中央**。
  → 本ベンチマークで「複数行でも中央」を最も強く裏づける例。
- **注記の位置**: 無し。
- **ボタン幅**: **列いっぱい 202px**。右列に「Customize settings」「Dismiss」の2ボタンを縦に積み、幅を揃えている。
- **広い画面**: `max-width` 無し。
- **1列化**: 800px では2列、600px では検出されず → **600〜800px の間**。

### 10. 楽天市場 会員登録バンド

- **URL**: https://www.rakuten.co.jp/
- **列の比率**: 帯は 1020px 固定。左 476px : 右 269px（**47:26**）。
- **垂直そろえ**: 帯・左列・右列すべて `align-items: center`。左列は「ようこそ楽天市場へ」＋「会員登録で楽天ポイントが貯まる、使える。」の**2行だが中央**。
- **注記の位置**: 無し。
- **ボタン幅**: 文字幅（「ログイン」90px）。右列に「楽天会員登録(無料)」「ログイン」の2ボタン。
- **広い画面**: 親要素に `max-width: 1340px`、帯自体は **1020px の固定幅**。
- **1列化**: 600px でも 1020px のまま。**レスポンシブに落ちない固定幅サイト**なので、閾値の参考にはならない。

### 11. Zapier インライン CTA（対照例 — 左テキスト/右ボタンでは**ない**）

- **URL**: https://zapier.com/
- **列の比率**: 340px : 340px だが `justify-content: center` で**帯の中央に寄せている**。左はリンク、右はボタン。
- **垂直そろえ**: `align-items: center`。
- **ボタン幅**: **列いっぱい（340px / 299px）**。
- **記録した理由**: 「左テキスト・右ボタン」ではなく「リンクとボタンを中央に並べる」型。
  pergram が採らない型として、両者の見え方の違いを残す。

---

## まとめ — 3つの問いへの答え

### 問い1. 垂直中央そろえと上そろえのどちらが多数派か。どういう条件でどちらが選ばれているか

**垂直中央が多数派。** 実測11例のうち、`align-items: center` が明示されていたのは
**7例**（Primer / GitHub Copilot / NICE / GOV.UK / Mailchimp / 楽天 / Zapier）。
明示的に `start`（上そろえ）だったのは **HubSpot の1例だけ**。
残る3例（Stack Overflow / GitLab / DigitalOcean）は `normal`（初期値）のままで、結果として上そろえに見えている。

**「中央は左列が1行のときだけか」への答え: 違う。複数行でも中央にしている。**

- NICE Action Banner: 左列は見出し＋本文の2行 → 中央
- GOV.UK: 左列は問い＋ Yes / No の2リンク → 中央
- **Mailchimp Cookie バンド: 左列は帯の高さ 128px を埋める長い段落 → それでも中央**
- 楽天: 左列2行 → 中央
- Primer / GitHub Copilot: 見出し＋説明文＋注記の複数行 → 中央

**条件の切り分け**は、左列の行数ではなく **右列が何であるか** で決まっていた。

| 右列の中身 | 選ばれている揃え | 該当例 |
|---|---|---|
| **ボタン1個（またはボタンだけの行）** | **垂直中央** | Primer / NICE / GOV.UK / Mailchimp / 楽天 / GitHub Copilot |
| 見出し＋本文＋ボタンの**ブロック**（実質2カラム記事） | `normal` / stretch（上そろえ） | GitLab / DigitalOcean |
| 1行だけの薄い販促ストリップ（高さ48px） | `start`（中央との差がほぼ無い） | HubSpot / Stack Overflow |

**pergram の帯は右列がボタン1個**なので、多数派の条件にそのまま当てはまる → **垂直中央**。

### 問い2. マイクロコピーをボタンの上に置く例と下に置く例の比率、それぞれの狙い

**実測できた範囲では 下:上 = 3:0。上に置いた例は1つも見つからなかった。**

11例のうち、帯の中にマイクロコピー／注記を持っていたのは3例だけで、**3例ともボタンより下**だった。

| 事例 | 位置 | 中身 |
|---|---|---|
| GitHub Copilot | ボタンの**下** | 「Visual Studio Code をすでにお持ちですか? 今すぐ開く」 |
| GitLab | ボタンの**下** | 副次リンク「詳しく知る」 |
| Primer CTABanner（`trailingComponent`） | 子要素の**最後**＝既定バリアントではボタンの下 | 任意の注記スロット |

**狙いの読み取り**（構造から言えること）:

- 下に置かれているものはいずれも **「押した後どうなるか」「押さない人への逃げ道」** であり、
  押す判断そのものには要らない情報。判断に要る情報を、押す位置より後ろへ置いている。
- Primer は注記を**専用のスロット（`trailingComponent`）として型に組み込んでいる**。
  自由な位置に書かせず、常に最後に出す作りになっている。
- なお `minimal` バリアントでは ButtonGroup だけが右列へ移るため、**注記は左列に残る**。
  「左テキスト / 右ボタン」に組み替えたとき、注記がボタンから離れる構造になっている点は
  pergram の設計判断に直結する。

**評価の限界**: 標本が3例と少ない。上下の優劣を実測から結論づけるには足りない。
コンバージョン系の二次情報（マーケティングブログ）は「下」を支持しているが、
**一次情報ではないので根拠として採らない。**
**公開デザインシステムの中に、マイクロコピーをボタンの上下どちらへ置くかを規定した記述は見つからなかった**
（GOV.UK Button / Primer CTABanner のいずれにも無いことを確認済み）。

### 問い3. やってはいけない型として繰り返し指摘されているもの

#### (a) 視覚順序を CSS だけで入れ替えない — 規範（MUST NOT）

CSS Flexible Box Layout Module Level 1, §5.4 Reordering and Accessibility の規範文:

> Authors must not use `order` or the `*-reverse` values of `flex-flow`/`flex-direction`
> as a substitute for correct source ordering, as that can ruin the accessibility of the document.

同じ節に、`order` は「非CSS UA や、音声・順次ナビゲーションのような線形モデルのために
ソース順を保ったまま」使うものだ、とある。

**帯に効いてくる形**: DOM で「ボタン → テキスト」と書いて `row-reverse` や `order` で見た目だけ
「テキスト → ボタン」にすると、**Tab キーの移動順は DOM のまま**残り、
WCAG 2.4.3 Focus Order（レベル A）に反する。
→ pergram は **DOM 順を「見出し → マイクロコピー → ボタン → 注記」にし、CSS は配置だけに使う。**

#### (b) タップ標的を小さくしない

WCAG 2.2 SC 2.5.8 Target Size (Minimum)、**レベル AA**:

> The size of the target for pointer inputs is at least 24 by 24 CSS pixels, except when:
> Spacing, Equivalent, Inline, User Agent Control, or Essential exceptions apply.

**帯に効いてくる形**: 帯を薄く見せようとしてボタンの高さを削ると、ここに触れる。

#### (c) 主ボタンを右端へ飛ばすことは、GOV.UK の指針とは逆向き

GOV.UK Design System（Button）:

> Align the primary action button to the left edge of your form.

pergram の帯はフォームではないので直ちに違反ではない。ただし
**「押させたい導線を、視線の始点から最も遠い右端に置いている」**ことは自覚しておく。
実測でも、右端寄せ（`flex-end` / `space-between`）を採っている例は
**右列がボタン1個で、左列の見出しから視線が横に流れれば届く距離**に収まっていた
（NICE: 帯 795px / GOV.UK: 帯 960px）。**帯を無制限に広げると、この前提が崩れる。**

#### (d) 帯を二重のコンテナに入れない

NICE Design System（Action Banner）:

> Don't use within a container component. Action banners fill the available horizontal space
> and have their own built-in container.

#### (e) 装飾を重ねない

Primer CTABanner: `hasBorder` は既定で無効で、
**影が無いときにだけ**境界線を足すことが推奨されている（影と枠の両方は掛けない）。
また `align="start"`（左そろえ）は「右側に背景画像があるとき」に使う、と用途が限定されている。

---

## 不明だったこと

推測で埋めていない項目を明示する。

- **GitHub Copilot ヒーローの1列化の閾値** — 1440px でしか測っていない。
- **Stack Overflow / GitLab / DigitalOcean / Mailchimp / GOV.UK の正確なブレークポイント** —
  600px と 800px の間、としか分からない。HubSpot は 1024px と 1440px の間。
- **Carbon Design System / Adobe Spectrum / USWDS / Atlassian Design System** —
  ドキュメントページから該当コンポーネントを自動検出できなかった。
  該当する「左テキスト / 右ボタンの帯」を公開ドキュメントに持っていないか、
  遅延描画で測定できなかったかの区別は付いていない。
- **The Guardian / New York Times の支援バンド** — 検出できなかった。
- **NICE Action Banner の SCSS ソース** — GitHub 上のパスを特定できず、
  ブレークポイントの宣言値は確認していない（実測で 600px でも2列であることのみ確認）。
- **マイクロコピーの上下に関する一次情報の指針** — 探した範囲では存在しなかった。「無い」ことの確認であって、
  「探し足りない」可能性は残る。

---

## 出典

**デザインシステム / 仕様**

- Primer (GitHub Brand) CTABanner — https://primer.github.io/brand/components/CTABanner/
  （ソース: `primer/brand` の `packages/react/src/CTABanner/CTABanner.module.css` / `CTABanner.tsx` / `Grid/Grid.module.css`）
- NICE Design System — Action Banner — https://design-system.nice.org.uk/components/action-banner/
- GOV.UK Design System — Button — https://design-system.service.gov.uk/components/button/
- CSS Flexible Box Layout Module Level 1, §5.4 Reordering and Accessibility — https://www.w3.org/TR/css-flexbox-1/
- WCAG 2.2 Understanding SC 2.5.8 Target Size (Minimum) — https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- WCAG 2.2 SC 2.4.3 Focus Order（レベル A）

**実測した公開ページ**

- https://github.com/features/copilot
- https://www.gov.uk/vehicle-tax
- https://stackoverflow.com/questions/32551291/in-css-flexbox-why-are-there-no-justify-items-and-justify-self-properties
- https://www.hubspot.com/pricing/marketing
- https://about.gitlab.com/pricing/
- https://www.digitalocean.com/community/tutorials/how-to-use-flexbox-to-build-a-website-layout
- https://mailchimp.com/pricing/
- https://www.rakuten.co.jp/
- https://zapier.com/

測定日: 2026-09-08

# エージェント開発の性能・速度を実測する — 一次情報の調査

- 調査日: 2026-09-12
- 目的: **この組織の工程改善（D-001 の対策5本など）の効果を、毎回同じ条件で測れる作業台を作る。** その設計に使える既存の実務・リポジトリを探す
- 出典の質: **一次情報（論文・公式リポジトリ）を本文の根拠に使い、二次情報（ブログ）は「未確認」と明示する**

---

## 0. 先に結論

| # | 結論 | 効き方 |
|---|---|---|
| 1 | 🔴 **作業時間の自己申告を指標にしてはならない。** METR の RCT で、熟練開発者は AI 併用で **実測19%遅くなった**のに、**事後でも「20%速くなった」と信じていた** | 「速くなった気がする」は測定値として使えない、が実証されている |
| 2 | **実務が規模を「人間の所要時間」で刻むのは、年単位でモデルを横比較するためである。** 🔴 **この組織には要らない**（§2） | 規模の軸は oracle solution の手数で足りる |
| 3 | **既製品はある。工程別に測るものも、トークンとターン数で測るものも既にある**（§6）。**無いのは「同じ組織の、規約変更の前後」を比べる形だけ** | 導入はしないが、工程の切り方と指標の定義は借りる |
| 4 | 🟢 **測る側の道具は、この組織にほぼ揃っている。** `org-tokens.py` が既に会話記録（JSONL）を読み、タスク別・担当別・モデル別のトークンと**返答回数**を出している | **足りないのは「毎回同じ条件の課題」だけ**である |
| 5 | **同じ課題を2回使うと2回目が速いのは当たり前。** SWE-smith の方式（既存コードへ機械的に不具合を注入して同型の別実体を量産）が、この問題への実務の答え | バリアント生成が要る |

---

## 1. 🔴 最重要 — 自己申告の速度は当てにならない（実証済み）

**METR, 2025-07「Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity」**（[出典](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)）

| | |
|---|---|
| 設計 | **RCT。** 熟練開発者16名、自分のリポジトリ（平均22,000スター / 100万行超）から持ち寄った**実課題246件**を、AI 使用可 / 不可へ**無作為割付** |
| 1課題の大きさ | **平均2時間** |
| 時間の取り方 | 自己申告 + **画面録画** |
| 事前予想 | 開発者は「AI で **24%速くなる**」と予想 |
| **実測** | **19%遅くなった** |
| 🔴 **事後の認識** | 遅くなったにもかかわらず、**「20%速くなった」と信じたまま**だった |

**この組織にそのまま効く。** D-001 の効果測定を「体感」や「所要時間の申告」で閉じると、**符号すら間違える。**

**したがって、実測パッケージが取るべき指標は、会話記録から機械的に出るものに限る** —— 往復数・トークン・起動回数・壁時計・テストの合否。**人の申告は入れない。**

---

## 2. 規模の刻み方 — 実務の「人間の所要時間」は、この組織では要らない

**METR の time horizon 系**（[Time Horizons](https://metr.org/time-horizons/) / [HCAST 論文](https://arxiv.org/abs/2503.17354)）は、課題の大きさを**人間の所要時間**だけで刻む。

- **HCAST**: 189タスク、**人間の所要時間 1分〜8時間超**。**人間ベースライン 563本・のべ1,500時間以上**を AI と同一条件で採取
- 指標は **「50%タスク完了時間地平」** —— 成功率が50%になる地点の、人間の所要時間
- 観測: **人間1時間未満のタスクは 70〜80% 成功、4時間超は 20% 未満**

### 🔴 なぜ彼らがそれを使うのか、そしてなぜ我々には要らないのか

**METR の目的は「2019年から2026年までの歴代モデルを、同じ物差しで並べる」ことである。**
物差しがエージェント側の性質に依存すると、**モデルが速くなるたびに物差しが伸び縮みして、年をまたいだ比較が壊れる。** 人間の所要時間は**エージェントが何であっても動かない**ので、この用途に選ばれている。

**この組織の目的は違う。** 比べるのは「同じ課題を、規約を変える前と後で回した結果」である。
**fixture は毎回バイト単位で同じものを配るので、物差しを外部に校正する必要がそもそも無い。**
S / M / L は**固定された3つの実体に付ける名前**であればよく、絶対尺度である必要が無い。

⚠️ **人間の所要時間は、測る指標としても使わない。** §1 のとおり、人の申告は符号すら間違える。
**測るのは「指示を投げてから、組織がそれを完了と報告するまで」である。**

### 代わりに使う物差し — oracle solution の手数

正解手順（§3-2 の4点セットの4つ目）を1本書けば、次が**エージェント非依存**で決まる。

| 見るもの | S | M | L |
|---|---|---|---|
| 触るファイル数 | 1 | 3〜5 | 8〜 |
| oracle の編集回数 | 1〜2 | 5〜8 | 15〜 |
| **跨ぐ工程** | 実装のみ | 設計→実装→テスト | 全工程＋手戻り1回を仕込む |

**oracle はどのみち書く**（「その課題は解ける」ことの保証と、手数の下限のため）ので、**追加費用はほぼゼロである。**

---

## 3. 形式として流用できるもの（3つ）

### 3-1. METR Task Standard — 「同じ条件を毎回作る」の仕様

[METR/task-standard](https://github.com/METR/task-standard)。`TaskFamily` という Python クラス1つでタスク族を定義する。

| メソッド | 役割 | この組織での対応物 |
|---|---|---|
| `standard_version` | 仕様の版 | 課題形式の版。**必須にする** |
| `get_tasks()` | **1つの族から複数のバリアントを生む** | 同型・別実体の課題（§3-3） |
| `get_instructions(t)` | 課題文 | タスク別ファイルの `## 目的` `## 完了条件` |
| `install()` | 環境構築 | fixture の展開 |
| `score(t, submission)` | **0.0〜1.0 の採点** | 受け入れテストの合否 |

**取るべきは「族 → バリアント」の構造である。** 1つの課題を固定するのではなく、**同じ形の課題をいくつでも出せる型**として持つ。

関連: [METR/task-template](https://github.com/METR/task-template)（雛形）、[METR/vivaria](https://github.com/METR/vivaria)（実行基盤）、[METR/public-tasks](https://github.com/METR/public-tasks)。

### 3-2. Terminal-Bench / Harbor — 「1課題は4点セット」

[Terminal-Bench 論文](https://arxiv.org/abs/2601.11868)。**1課題は必ず次の4つを持つ。**

1. 自然言語の指示
2. **隔離された実行環境**（Docker コンテナ。課題ごとに新品を用意する）
3. **完了を機械判定する検証テスト**
4. 🔴 **oracle solution（正解の手順）**

**4つ目が、この組織に一番効く。** 正解手順があると、**「その課題は解ける」ことが保証され、同時に手数の下限が分かる。** 測定値を「速い / 遅い」と言うための分母がここで手に入る。

規模: Terminal-Bench 2.0 は16分野・89課題を **easy / medium / hard** の3段で持つ。**段は3。** 前回調査の結論5（クラス数は2〜3が最多、4超は皆無）と一致する。

⚠️ **未確認**: `task.yaml` の正確なキー名は取れなかった（リポジトリが `harbor-framework` 配下へ移動した様子で、API が空を返す）。**形式を真似るなら、着手時に現物を1件読むこと。**

### 3-3. SWE-smith — 「同型・別実体」を機械で量産する

[SWE-smith 論文](https://arxiv.org/abs/2504.21798) / [swesmith.com](https://swesmith.com/)

既存の Python リポジトリ128本から、**不具合入りの課題を50,000件**自動生成した。手口は4つ。

1. LM に関数を**わざと壊して書き直させる**
2. **構文木（AST）を機械的に改変する**
3. **既存の PR を巻き戻す**
4. 上記を**組み合わせる**

環境をリポジトリ単位で共有したことで、**保存量が 50〜150TB → 295GB** になった。

**この組織への含意**: 1課題につき環境を作り直すのではなく、**fixture リポジトリ1本を土台に、注入する不具合だけを差し替える。** 手口2（AST 改変）と3（巻き戻し）は決定的で再現性があり、**LM を使わないので毎回同じものが作れる**（N-04 の観点でも安全側）。

---

## 4. 測る側 — 🟢 この組織には既にある

`.claude/scripts/org-tokens.py` は、Claude Code が書き出す会話記録（JSONL）を直接読んでいる。

```
~/.claude/projects/<符号化された作業ディレクトリ>/
    <セッションID>.jsonl              メインセッション
    <セッションID>/subagents/
        agent-XXXX.jsonl              担当エージェント1体分
        agent-XXXX.meta.json          その担当の種別
```

**D-001 の効果測定に要る4指標のうち、実質すべてがここから取れる。**

| 指標 | 取れるか | 出所 |
|---|---|---|
| **実 API 往復** | 🟢 **もう取れている** | 台帳の `返答回数` 列 |
| **起動回数** | 🟢 取れる | `agent-*.jsonl` の本数 |
| **並列のツール呼び出し** | 🟡 **小改修で取れる** | 1つの応答に `tool_use` が2つ以上あるかを数える |
| **テスト実行の回数** | 🟡 小改修で取れる | `Bash` の入力が `npm test` / `node --test` に一致する回数 |
| 壁時計 | 🟡 小改修で取れる | 各エントリの `timestamp` の差 |
| トークン・コスト | 🟢 もう取れている | 4種別（新規入力 / 出力 / キャッシュ書込 / キャッシュ読出） |

**足りないのは測る道具ではなく、毎回同じ条件の課題である。** これが今回の一番の収穫。

⚠️ **副産物として不具合を1件見つけた。** 台帳に `T-0` / `T-00` という行がある。タスクIDの拾い方が前方一致になっており、`T-072` などを短く誤認している疑い。**別件として起票が要る**（この調査の範囲外）。

参考（二次情報・未確認）: Claude Code は OpenTelemetry でも同種の指標を出せる（[claude-code-otel](https://github.com/ColeMurray/claude-code-otel)、[SigNoz](https://signoz.io/blog/claude-code-monitoring-with-opentelemetry/)、[AWS](https://aws.amazon.com/blogs/mt/analyzing-claude-code-usage-with-cloudwatch-and-opentelemetry/)）。**JSONL を直接読む今の方式で足りているので、導入する理由は今のところ無い。**

---

## 5. マルチエージェント特有の測定軸（⚠️ 二次情報。未確認）

複数の2026年のブログが次を挙げている。**一次情報での裏取りは未了なので、指標の候補としてだけ扱う。**

| 軸 | 内容 |
|---|---|
| トークン割増 | 単一セッション比で数倍〜十数倍。**「同じトークン予算なら単一エージェントが並ぶ／勝つ」とする2026年の論文がある**とされる（要確認） |
| **持ち越し比**（carry overhead） | 1回の呼び出しの入力のうち、**実際の指示以外**（履歴・定型文）が占める割合 |
| **やり直し税**（retry tax） | 手戻りで捨てたトークン |
| コスト按分 | 工程 / 役 / ツール種別 / 持ち越し / やり直し の5つに分けて見る |

**持ち越し比とやり直し税は、この組織の台帳から直接出せる**（キャッシュ読出の割合、`手戻り回数`）。**採る価値がある。**

---

## 6. 既製品は「ある」。何があって、何が無いのか

**「そういうものは無い」は誤りだった。** 名指しで確かめた結果、**2系統が既にある。**

### (A) 工程（SDLC）別に測るもの — 課題セットとして参考になる

| 何か | 中身 | 我々に効く点 / 効かない点 |
|---|---|---|
| **DevBench / [open-compass/DevEval](https://github.com/open-compass/DevEval)** ([論文](https://arxiv.org/html/2403.08604v1)) | **22リポジトリ / 4言語**（Python, C/C++, Java, JS）。**5工程**を別々に採点: 設計 / 環境構築 / 実装 / 受け入れテスト / 単体テスト。Apache-2.0＋CC BY 4.0 | 🟢 **工程別に測る発想が既にある。** この組織の標準フロー（設計→テスト→実装→テスト→レビュー）とほぼ同じ切り方<br>🔴 採点は**出力の質**（pass rate / LLM-as-judge の勝率）。**トークン・往復・時間を記録していない** |
| **MetaGPT の SoftwareDev** ([論文](https://arxiv.org/html/2308.00352v6)) | **70課題。** 役割（PM / アーキテクト / エンジニア / テスター）を置く枠組み同士を比較。実行可能性スコアと**所要時間**（例: 503秒）を報告 | 🟢 **「役割を置いた組織」同士を比べた前例。** 時間を指標に入れている<br>🔴 比べているのは**枠組みA vs B**であって、同じ組織の前後ではない |
| **[ChatDev](https://arxiv.org/pdf/2307.07924)** | 要求分析→コーディング→テスト→レビューを会話で回す | 同上 |
| **[MASLab](https://arxiv.org/pdf/2505.16988)** | **20超の手法**を1つのコードベースへ統合、**10超のベンチ・8モデル**で横比較 | 🔴 コスト・トークンの標準化については**明記が無い**（未確認） |

### (B) ハーネスとして測るもの — 指標の定義が参考になる

| 何か | 我々に効く点 |
|---|---|
| **Harbor**（Terminal-Bench 2.0 の実行基盤） | 共通のタスク形式＋実行環境。**rollout ごとにトークンとコストを取る**。Claude Code / Codex CLI / OpenHands を差し替えて走らせられる |
| 🟢 **Workspace-Bench 1.0** ([論文](https://arxiv.org/pdf/2605.03596)) | **「1課題あたりの平均トークン」と「平均ターン数」を主要指標にしている。** 我々が D-001 で置いた4指標と**実務が一致している**ことの裏取りになる |
| [agent-eval-harness](https://github.com/linny006/agent-eval-harness) | 実 GitHub issue でエージェントを比較。ローカル実行＋CI で退行を止める |
| [awesome-agent-harness](https://github.com/Picrew/awesome-agent-harness) | ハーネス系の一覧。**着手前に一度眺める価値がある** |

### 🔴 それでも自作が要る3つの理由

1. **既存は全部「枠組みA vs 枠組みB」を比べる。** 我々が比べたいのは**同じ組織の、規約を変える前と後**である。前後比較用に作られたものが無い
2. **課題が Python / Java / C++ 中心。** この組織の規約・スキル割り当ては Node / 静的サイト / Cloudflare Workers に合わせてある。**別スタックで測ると、別のものを測ることになる**
3. **既存ハーネスは「エージェント1体をコンテナへ注入する」形。** 我々が測るのは Claude Code のサブエージェント機構そのもの（起動回数・並列率・差し戻し）で、**注入する対象が無い**

**したがって: 導入はしない。借りるのは3つ** —— DevBench の**工程の切り方**、Workspace-Bench の**指標の定義**、Harbor の**1課題4点セット**。

## 7. 設計への含意（この調査から直接出るもの）

1. **指標は会話記録から機械的に出るものに限る。** 人の申告を入れない（§1）
2. **測るのは「指示を投げてから完了報告まで」。** 規模の物差しは oracle solution の手数（触るファイル数 / 編集回数 / 跨ぐ工程）。**人間の所要時間は、軸としても指標としても使わない**（§2）
3. **段は3つまで。** 4つ以上に切っている実務が無い（§3-2）
4. **1課題は4点セット。** 指示 / 環境 / 検証テスト / **oracle solution**（§3-2）
5. **課題は「族」として持ち、バリアントを機械生成する。** 同じ実体を2回使わない（§3-1、§3-3）
6. **生成に LM を使わない。** AST 改変と巻き戻しは決定的で再現する（§3-3）
7. **測る道具は既存の `org-tokens.py` を伸ばす。** 新しい計測系を建てない（§4）
8. **既製品は導入しないが、3つ借りる** —— DevBench の工程の切り方、Workspace-Bench の指標の定義、Harbor の1課題4点セット（§6）

---

## 8. 未確認のまま残したもの

| # | 何が未確認か | 確かめ方 |
|---|---|---|
| 1 | Terminal-Bench / Harbor の `task.yaml` の正確なキー | 移動先リポジトリの現物を1件読む |
| 2 | 「同じトークン予算なら単一エージェントが並ぶ」の一次出典 | §5。**この組織の存在意義に直接触れる主張なので、放置しない** |
| 3 | HCAST の中間帯（1〜4時間）の成功率 | 論文本文 |
| 4 | METR RCT の「遅くなった5要因」の内訳 | 論文本文。**この組織の工程設計に直接効く可能性が高い** |

---

## 出典

- METR, [Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)（RCT。19%遅い / 事後も20%速いと認識）
- METR, [Task-Completion Time Horizons of Frontier AI Models](https://metr.org/time-horizons/) / [Time Horizon 1.1](https://metr.org/blog/2026-1-29-time-horizon-1-1/)
- [HCAST: Human-Calibrated Autonomy Software Tasks](https://arxiv.org/abs/2503.17354)（189タスク / 563ベースライン / 1分〜8時間超）
- [METR/task-standard](https://github.com/METR/task-standard)、[METR/task-template](https://github.com/METR/task-template)、[METR/vivaria](https://github.com/METR/vivaria)、[METR/public-tasks](https://github.com/METR/public-tasks)、[METR/hcast-public](https://github.com/METR/hcast-public)
- [Terminal-Bench: Benchmarking Agents on Hard, Realistic Tasks in Command Line Interfaces](https://arxiv.org/abs/2601.11868)、[laude-institute/terminal-bench](https://github.com/laude-institute/terminal-bench)
- [SWE-smith: Scaling Data for Software Engineering Agents](https://arxiv.org/abs/2504.21798)、[swesmith.com](https://swesmith.com/)
- （二次情報・未確認）[claude-code-otel](https://github.com/ColeMurray/claude-code-otel)、[SigNoz](https://signoz.io/blog/claude-code-monitoring-with-opentelemetry/)、[AWS CloudWatch](https://aws.amazon.com/blogs/mt/analyzing-claude-code-usage-with-cloudwatch-and-opentelemetry/)、[Multi-Agent Token Cost](https://dev.to/akaranjkar08/multi-agent-token-cost-context-budget-accounting-2026-3ejp)

# 変更をクラスに分け、クラスごとに手続きを当てる実務 — 一次情報の調査

- 調査日: 2026-09-12
- 目的: 前回調査（[dev-process-sizing.md](dev-process-sizing.md)）が一度も触れていない領域を埋める。すなわち、実務が**変更をどう分類し、分類ごとにどの手続きを当てているか**の、運用として稼働している具体例を取る
- 方針: 一次情報（規格の公式ガイド・著者や研究機関が公開する原典・公式文書）に当たる。**当たれなかった論点は「確認できなかった」と明記し、推測で埋めない**。二次情報を使った箇所はその旨を明示する

**この文書は調査結果であって、規約ではない。** ここから何を採るかは別に決める。

---

## 1. ITIL 4 change enablement — 分類は「個々の変更」ではなく「手続き」に対して行う

### 出典の性格について（先に明記する）

本節の引用は **AXELOS 公式の「ITIL 4 Practice Guide: Change enablement」（2019年11月22日版）の本文**からのものである。ただし **AXELOS / PeopleCert の公式配布サイトは会員ログインを要求するため、そこからは取得できなかった。** 実際に本文を取得したのは第三者サイト上に置かれた同一 PDF であり、**文書自体は AXELOS の版面（`AXELOS Copyright / View Only – Not for Redistribution / © 2019` の透かし入り）そのもの**である。一次情報として扱うが、**取得経路が公式サイトではない**ことを記録しておく。

### 1.1 実践の目的と「変更」の定義

> "The purpose of the change enablement practice is to maximize the number of successful service and product changes by ensuring that risks have been properly assessed, authorizing changes to proceed, and managing the change schedule."
> （change enablement の目的は、**リスクが適切に評価されたことを確かめ**、変更の実施を承認し、変更スケジュールを管理することによって、成功する変更の数を最大化することである）

> **Definition: Change** — "The addition, modification, or removal of anything that could have a direct or indirect effect on services."
> （サービスに直接または間接に影響しうるものの、追加・変更・削除）

目的が「変更を止めること」ではなく「**成功する変更の数を最大化すること**」に置かれている点は、この実践全体の向きを決めている。

### 1.2 分類の軸は「不確実性」である

3分類の前段として置かれているのは、規模でもリスクの絶対値でもなく、**不確実性（uncertainty）** である。

> "Changes can be standardized and automated where uncertainty is low, which helps to decrease the costs and accelerate the changes. Check-lists, templates, and standardized ways of working can be used in these situations. This is reflected in the definition of a standard change."
> （**不確実性が低いところでは**変更を標準化・自動化でき、それによってコストを下げ変更を速められる。チェックリスト・テンプレート・標準化された働き方をこうした状況で使える。これが standard change の定義に反映されている）

### 1.3 standard change — 判定条件は「手続きが一度リスク評価を通っていること」

> **Definition: Standard change** — "A low-risk, pre-authorized change that is well understood and fully documented, and which can be implemented without needing additional authorization."
> （低リスクで**事前承認済み**の、十分に理解され完全に文書化された変更。追加の承認を必要とせずに実施できる）

**判定条件の本体は、次の一文である。これが本調査で最も重要な発見である。**

> "When the procedure for a standard change is created or modified, the procedure should be authorized and undergo a full risk assessment. This risk assessment does not need to be repeated for every change; it is needed only if the procedure itself undergoes another modification."
> （standard change の**手続きが作られたとき、または変更されたとき**、その手続きは承認を受け、**完全なリスク評価を通らなければならない**。このリスク評価は**変更ごとに繰り返す必要はない**。必要になるのは、**手続き自体がもう一度変更されたとき**だけである）

つまり **ITIL 4 における「軽い手続き」とは、審査を省くことではない。審査の対象を「個々の変更」から「その種類の変更を扱う手続き」へ一段上げることである。** 手続きは一度きちんと審査され、以後その手続きに乗る変更は都度の承認を要さない。

standard change の例として挙げられているのは次の4つ。

> "fulfilment of a service request / maintenance of infrastructure / routine testing of contingency measures / routine software updates."

なお、**standard change は平常時専用ではない**ことも明記されている。

> "Although standard changes are usually associated with business-as-usual situations, there are multiple examples of standardization in situations with higher levels of uncertainty. These include: standard incident resolutions / standard responses to disasters."

### 1.4 normal change — 囲み定義が置かれていない

**normal change には、standard change や emergency change と違って `Definition:` の囲みが与えられていない。** 本文中で次のように記述されるだけである。

> "When there is no effective standardized approach to a change, organizations usually attempt to plan, authorize, and control that change. They follow a process that includes collective expert assessment, authorization, and control. The process is performed by a group of people combining expertise and authority. These are 'normal changes', some of which are low risk. The change authority for these is usually someone who can make rapid decisions, often using automation to accelerate the change. When a normal change is high risk, the change authority might be the management board or the equivalent."
> （**有効な標準化されたやり方が無い**とき、組織は通常その変更を計画・承認・統制しようとする。専門知識と権限を併せ持つ人々の集団によって、集合的な専門家評価・承認・統制を含むプロセスが実施される。これが normal change であり、**その一部は低リスクである**。低リスクのものの change authority は通常、素早く判断できる誰か1人であり、しばしば自動化を用いて変更を加速する。normal change が高リスクのときは、change authority は経営会議やそれに相当するものかもしれない）

**normal change は「重い変更」ではなく「標準の手続きが未整備の変更」である。** そしてその中でさらにリスクで承認者の階層が変わる（1人の即断 ↔ 経営会議）。**3分類は、それ自体が工程の重さを決め切っていない。**

### 1.5 emergency change — 省略してよいものが事前に決まっている

> **Definition: Emergency change** — "A change that must be introduced as soon as possible."

> "Change models for emergency changes often include bypassed or delayed procedures, such as change request registration or updating of the change schedule. They may also determine a dedicated change authority of high power and availability, together with other special arrangements. The aim is to accelerate changes while keeping risks at an acceptable level."
> （緊急変更の change model は、変更要求の登録や変更スケジュールの更新といった手続きを**迂回または延期する**ことをしばしば含む。また、権限が強く即応できる専用の change authority を定めることもある。狙いは、**リスクを受容可能な水準に保ったまま**変更を加速することである）

そして、**緊急だから統制が無い、ではない**と釘が刺されている。

> "'Emergency' does not mean 'no rules or control'. Emergency changes can be standardized and automated. This can accelerate them without compromising control. Emergency does not always mean completely unpredictable and unknown."

### 1.6 change authority と change model

> **Definition: Change authority** — "A person or group responsible for authorizing a change."

> **Definition: Change model** — "A repeatable approach to the management of a particular type of change."
> （change model = **ある種類の変更を扱うための、繰り返し使える手順**）

change model を定義するときの因子として列挙されているもの:

> "systems/technologies to change / scale of change / locations/territories / customers / regulatory requirements affecting the change."

**この一覧に `scale of change`（変更の規模）が入っている。** 前回調査の結論1に直接関わるので、最終節で扱う。

change model が四側面それぞれで決めるものの例として、次が挙がっている（Table 2.1）。value streams and processes の側では **"Change process and procedures, including the level of formalization"（手続きの形式化の度合いを含む）／"Level and form of the change authority"／"Acceptance criteria"**、organizations and people の側では **"Organizational solutions (such as change advisory board, or peer review)"／"Delegation rules"**。

### 1.7 規模と反復について ITIL が明言していること

> "In addition, organizations need to consider a change's risk level. An organization may, for example, decide to limit a change's potential risk by deconstructing it into iterations. Each iteration of the change is thus below an agreed risk-level threshold, introducing limited and manageable risk. Generally, smaller changes also cost less and are easier to control. Based on these considerations, many organizations limit the size of individual changes, particularly of software and other digital resources."
> （加えて、組織は変更のリスク水準を考慮する必要がある。例えば、変更を**反復へ分解する**ことでその潜在リスクを制限すると決めてもよい。各反復は合意されたリスク水準の閾値より下に収まり、限定され管理可能なリスクしか持ち込まない。一般に、小さい変更はコストも低く統制しやすい。こうした考慮に基づき、**多くの組織は個々の変更のサイズを制限している**。とくにソフトウェアその他のデジタル資源について）

キーメッセージ（囲み）:

> "Decreasing the size of changes can increase the effectiveness and throughput of the practice while decreasing the level of risk. Size should be an important consideration for organizations' change models."
> （変更のサイズを小さくすることは、リスク水準を下げながら実践の有効性とスループットを高めうる。**サイズは change model にとって重要な考慮事項であるべきである**）

**向きに注意する。** ここで言われているのは「変更が小さいから手続きを省いてよい」ではなく、**「リスクを閾値以下に収めるために、変更を小さく切れ」** である。最終節で前回調査と突き合わせる。

### 1.8 4つのアプローチ（3分類ではない）

キーメッセージの囲みは、**3分類ではなく4つのアプローチ**を並べている。

> "standard changes / changes planned and controlled based on expert analysis of the situation / changes planned based on multiple safe-to-fail experiments / emergency changes implemented without sufficient assessment and planning."

> "The first three approaches are applicable in all types of business situation, from business as usual to catastrophic disasters. The last approach applies to chaotic situations where the cost of delay is higher than the cost of a wrong action."
> （最初の3つは平常時から破局的災害まであらゆる状況に適用できる。最後のものは、**遅延のコストが誤った行動のコストを上回る**混沌とした状況に適用される）

3番目の「複数の safe-to-fail な実験に基づいて計画される変更」は、標準の3分類には現れない。**standard と normal のあいだに、「試して確かめる」という第3の道が置かれている。**

### 1.9 どの変更を実践の対象にするか — 5つの考慮事項

> "Level of risk / Costs and losses / Scope of configuration and asset control / Internal and external regulatory requirements / Need for visibility of the change impact"
> （リスク水準／コストと損失／構成・資産管理の範囲／内外の規制要件／変更影響の可視性の必要）

そしてスケールについて:

> "Based on these and other considerations, organizations decide whether modifications to products and services should be treated as changes and, if so, whether they should be considered as minor, medium, or major. The change enablement practice usually includes different approaches to changes of different scales. These approaches are usually detailed in the change models."
> （これらの考慮に基づき、組織は製品・サービスへの修正を change として扱うべきか、扱うならそれを **minor / medium / major** のどれとみなすかを決める。change enablement の実践は通常、**規模の異なる変更に対して異なるアプローチを含む**。これらのアプローチは通常 change model に詳述される）

**ただし ITIL は `minor / medium / major` の閾値を一切定義していない。** 行数・ファイル数はもちろん、どんな尺度で測るかも書かれていない。決めるのは組織である。

### 1.10 誰が、いつ分類を決めるのか

**個々の変更に対して人が都度クラスを判定する設計にはなっていない。** クラスは **change model という形で事前に決まっており**、変更はそのモデルに流し込まれる。Table 3.2 が2つのモデルの実際の活動を並べている。

| 工程 | Normal changes; manual management | Standard software changes; highly automated management |
| --- | --- | --- |
| Change registration | "Based on the change request, a change record is created by the service owner, resource owner, change manager, or change coordinator." | "Change requests are accumulated in the product or service backlog. **The product development team decides which requests will be taken into development.**" |
| Change assessment | "The service owner, resource owner, change manager, or change coordinator performs an assessment of the change impact, associated risks, and required resources. If needed, other subject matter experts may be involved." | "**The product development team decides on the best way to proceed with the change.**" |
| Change authorization | "**The change authority who has been assigned in line with the change model** reviews the change record and provides authorization. If the change is not authorized, it is sent for review and closure." | "**Change authorization is not needed:** because standard changes are likely to be pre-authorized / where it has been agreed for this model that changes are authorized by taking them into development via backlog assessment." |

右の列で起きていることは重要である。**「バックログに取り込む判断そのものが承認である」と事前に合意しておけば、以後の承認工程は存在しない。** 承認が省かれているのではなく、**承認の所在が移動している**。

change authority の役割定義（§4.1.2）も同じことを言っている。

> "The change authority is responsible for the assessment and authorization of a change during its lifecycle (from initiation to completion). **Depending on the change model, assessment and authorization may be done manually, automatically, or skipped for specific types of change.**"
> （change model に応じて、評価と承認は手動で行われることも、自動で行われることも、**特定の種類の変更については省かれる**こともある）

### 1.11 ITIL 4 自身が CAB を否定している

これは予想外だった。**ITIL の公式ガイドが、CAB をボトルネックと名指ししている。**

> "Changes require resources and introduce risks. This sometimes leads to organizations establishing complicated, and often bureaucratic, systems of change authorization, with formal committees that meet regularly to overview and authorize changes accumulated over the period. These are known as change advisory boards (CABs), and **they often become bottlenecks for the organization's value streams. They introduce delays and limit the throughput of the change enablement practice.** It is important to make sure that changes are authorized based on resource, cost, and priority considerations. **This does not generally need to be a bureaucratic procedure.** Change models should define the requirements and procedures for authorization, **delegating the role of change authority to the appropriate level, such as development teams, technical experts, or service and product owners.**"

**§3（DORA）の結論と同じ方向を向いている。** 「ITSM 側は重い承認を推している／アジャイル側が反対している」という対立図式は、少なくとも ITIL 4 の公式ガイドの本文に関しては成り立たない。

### 1.12 分類そのものを定期的に見直す工程が、実践の中に組み込まれている

change enablement は**2つのプロセス**からなる。

> "**Change lifecycle management** This process ensures the realization of individual changes."
> "**Change optimization** This process focuses on optimizing the handling of changes in the [organization]..."

change optimization の中身:

> "The change manager, together with service owners and other relevant stakeholders, performs a review of **selected (usually unsuccessful) changes** over the period. They identify opportunities for change model and standard change procedures optimization, **including standardization of new change types.**"
> （期間中の**選ばれた（通常は失敗した）変更**をレビューし、change model と standard change 手続きの最適化の機会を特定する。**新しい変更種別の標準化を含む**）

その出力は "Updated change models" と "Updated standard change procedures"。**「どの変更がどのクラスに入るか」は固定ではなく、失敗した変更を材料に定期的に改訂される、という設計である。**

### 確認できなかったこと（1節）

- **分類を誤ったときに何が起きる設計になっているか**は、このガイドに書かれていない。唯一近いのは change authorization の "If the change is not authorized, it is sent for review and closure."（承認されなければレビューと終了へ回される）だけで、**「standard として扱ったが実は standard ではなかった」場合の扱いは記述が無い。** 間接的には change optimization（失敗した変更をレビューして change model を直す）が事後の受け皿になっているが、**そう明記されてはいない。**
- **ITIL 4 Foundation 本体（書籍）の記述**は取得していない。本節はすべて practice guide からである。

### 出典（1節）

- AXELOS, *ITIL 4 Practice Guide: Change enablement*, 22 November 2019（公式版面の PDF。公式配布元はログイン要求のため第三者ホスト経由で取得） — https://www.mafranci.com/itil4/cds/new/1%2020191122_Practice_Change%20enablement.pdf

### このリポジトリへの含意（1節）

- **「軽い工程」を設計するとは、審査を省くことではなく、審査の対象を1段上げることである。** pergram に置き換えるなら、「文言の差し替え」「既存パターンの横展開」といった**種類**に対して一度きちんと手続きを決めて承認を通し、以後その種類の個々のタスクでは工程を問い直さない、という形になる。手続きを変えるときだけ、また審査する。
- **3分類は工程の重さを決め切っていない。** normal change の中にも低リスクのものがあり、その承認者は「素早く判断できる1人」である。この組織の「1タスク＝1つの重さ」に、分類の導入だけで答えを出すことはできない。
- **`## 完了条件` や `## 判断してよい範囲` を、タスクごとではなく「タスクの種類」ごとに雛形として持つ**という方向は、ITIL の change model にそのまま対応する。
- **分類の見直し工程を持つべきである。** ITIL は失敗した変更をレビューして「新しい変更種別の標準化」まで行う工程を実践の中に持っている。この組織には対応物が `docs/org-improvements.md` と組織点検にあるが、**「クラス分けの妥当性」を明示の対象にはしていない。**

---

## 2. Google SRE — error budget が「工程の重さ」を動かす唯一の実例

### 2.1 変更が事故の主因であるという数字

> "SRE has found that **roughly 70% of outages are due to changes in a live system.**"
> （SRE は、**障害のおよそ70%が稼働中システムへの変更に起因する**ことを見出している）

出典は **Chapter 1（Introduction）の "Change Management" 節**。直後に、自動化で達成すべきこととして3つが挙げられている。

> "Best practices in this domain use automation to accomplish the following: Implementing progressive rollouts / Quickly and accurately detecting problems / Rolling back changes safely when problems arise"
> （漸進的なロールアウトの実施／問題の迅速かつ正確な検出／問題発生時の安全なロールバック）

**注意すべき点がある。この70%という数字には、SRE 本の中で出典や測定方法が示されていない。** "SRE has found"（SRE は見出した）とあるだけで、母集団・期間・障害の定義は書かれていない。**数字を引くときはこの限界も併せて引くべきである。**

### 2.2 error budget の定義

> "Once that target is established, **the error budget is one minus the availability target.** ... That permitted 0.01% unavailability is the service's error budget. **We can spend the budget on anything we want, as long as we don't overspend it.**"

Chapter 3（Embracing Risk）側の言い方:

> "Product Management defines an SLO, which sets an expectation of how much uptime the service should have per quarter. The actual uptime is measured by a neutral third party: our monitoring system. **The difference between these two numbers is the 'budget' of how much 'unreliability' is remaining for the quarter.**"

**測るのは中立の第三者（監視システム）である**という点が設計に含まれている。自己申告ではない。

### 2.3 budget の残高が手続きを切り替える

**これが本調査で探していた「工程の重さがデータで自動的に変わる」実例である。**

> "**As long as the uptime measured is above the SLO—in other words, as long as there is error budget remaining—new releases can be pushed.**"

> "Many products use this control loop to manage release velocity: as long as the system's SLOs are met, releases can continue. **If SLO violations occur frequently enough to expend the error budget, releases are temporarily halted while additional resources are invested in system testing and development.**"
> （多くのプロダクトがこの制御ループでリリース速度を管理する。SLO が満たされているあいだリリースは続けられる。**error budget を使い切るほど SLO 違反が頻発したら、リリースは一時停止され、システムテストと開発へ追加の資源が投入される**）

**閾値は事前に数値で決まっており、超えたかどうかは監視システムが機械的に判定する。誰かの裁量で「今回は重くしよう」と決めるのではない。**

### 2.4 リスクの数量化

> "Aggregate availability = (Successful Requests) / (Total Requests)"

具体例として:

> "a system that serves 2.5M requests in a day with a daily availability target of 99.99% can serve up to 250 errors and still hit its target."

**リスクが「高／中／低」ではなく、消費可能な誤りの個数という絶対量で表現されている。** 前回調査の §2（ISO 29119 のリスクベースドテストが**相対評価**であること）と対照的である。

### 2.5 canary — 不可逆性を下げる装置

SRE 本 Chapter 3:

> "It's a best practice to test a new release on some small subset of a typical workload, a practice often called canarying. How long do we wait, and how big is the canary?"

SRE Workbook の canary 章に、より精密な定義と算術がある。

> "**We define canarying as a partial and time-limited deployment of a change in a service and its evaluation.**"
> （canary とは、サービスへの変更の**部分的かつ時間制限つきの**デプロイと、その評価である）

> "**the canary process risks only a small fragment of our error budget, which is limited by time and the size of the canary population.**"
> （canary の過程が賭けているのは error budget のごく一部だけであり、それは**時間と canary 母集団の大きさによって制限されている**）

> "If we instead use a canary population of 5%, we serve 20% errors for 5% of traffic, resulting in a 1% overall error rate."

> "**impact on the budget is directly proportional to the amount of traffic exposed to defects.**"

> "**It should be sizeable and last long enough to be representative of the overall deployment.**"
> "When choosing an appropriate canary duration, you need to factor in development velocity."

**canary は「不可逆性を下げる装置」というより、正確には「損害の上限を事前に確定させる装置」である。** 悪い変更が巻き戻せるようになるのではなく、悪い変更が消費しうる budget の最大値が、母集団比率 × 時間で計算可能になる。

### 出典（2節）

- Google, *Site Reliability Engineering*, Ch.1 Introduction — https://sre.google/sre-book/introduction/
- 同, Ch.3 Embracing Risk — https://sre.google/sre-book/embracing-risk/
- Google, *The Site Reliability Workbook*, Canarying Releases — https://sre.google/workbook/canarying-releases/

### このリポジトリへの含意（2節）

- **「工程の重さを、その時点の実績で自動的に切り替える」という設計が、実務として存在する。** この組織には対応物が無い。今は工程の重さがタスク登録時に人手で決まり、以後動かない。
- pergram で error budget に相当しうるのは、**手戻り回数**（タスク別ファイルのメタデータに既にある）や **`npm test` の失敗**である。「直近 N タスクで手戻りが M 件を超えたら、TDD適用外の判断を止めて全件 TDD へ戻す」という形の制御ループは、SRE の構図をそのまま写せる。
- **判定は中立の測定でなければならない**という点は、この組織が既に部分的に持っている（`org-check.py` の機械検査）。自己申告の完了報告ではなく、台帳の機械検査を閾値の材料にするのが筋である。
- **canary に相当するものが pergram にある。** `npm run preview`（サンプルデータで `.preview/` に描画、デプロイ禁止）と、Cloudflare Workers のデプロイ前検証である。「損害の上限を事前に確定させる装置」として位置づけ直すと、**その装置を通る変更は工程を軽くしてよい**という論法が立つ。

---

## 3. DORA / Accelerate — 「レビューを重くすると安全になる」は測定されて否定されている

### 3.1 四指標の定義（一次情報）

dora.dev の定義（現行の言い回し）:

- **Deployment frequency**: "The number of deployments over a given period or the time between deployments."
- **Change lead time**: "The amount of time it takes for a change to go from committed to version control to deployed in production."
- **Change failure rate**: "The ratio of deployments that require immediate intervention following a deployment."
- **Failed deployment recovery time**: "The time it takes to recover from a deployment that fails and requires immediate intervention."

なお dora.dev は、指標が "the original four keys to the current five-metric model" へ進化し **"Deployment rework rate"** が加わったと記している。**「四指標」は現行の最新形ではない。**

### 3.2 外部承認委員会（CAB）の効果 — 本件の核心

**2019年 Accelerate State of DevOps Report（DORA が公開している原本 PDF）の本文から、逐語で取る。**

エグゼクティブサマリ:

> "**Heavyweight change approval processes, such as change approval boards, negatively impact speed and stability.** In contrast, having a clearly understood process for changes drives speed and stability, as well as reductions in burnout."

本文（"Heavyweight change process" 節）:

> "We found that **formal change management processes that require the approval of an external body such as a change advisory board (CAB) or a senior manager for significant changes have a negative impact on software delivery performance. Survey respondents were 2.6 times more likely to be low performers if their organization had this kind of formal approval process in place.** This expands on our previous research, which found that heavyweight change approvals process were negatively correlated with change failure rates."
> （重要な変更について CAB や上級管理職といった**外部の機関の承認を必要とする形式的な変更管理プロセスは、ソフトウェアデリバリ性能に負の影響を与える**ことを見出した。**そうした形式的承認プロセスを持つ組織の回答者は、低パフォーマーである確率が 2.6 倍高かった**）

> "The motivation behind the heavyweight change management processes proposed by ITSM frameworks is reducing the risk of releases. To examine this, **we investigated whether a more formal approval process was associated with lower change fail rates and we found no evidence to support this hypothesis, consistent with earlier research.**"
> （ITSM フレームワークが提案する重量級の変更管理プロセスの動機はリリースのリスクを下げることである。これを検証するため、**より形式的な承認プロセスが低い change fail rate と結びついているかを調べたが、この仮説を支持する証拠は見つからなかった**。先行研究と整合する）

> "We also examined whether introducing more approvals results in a slower process and the release of larger batches less frequently, with an accompanying higher impact on the production system that is likely to be associated with higher levels of risk and thus higher change fail rates. **Our hypothesis was supported in the data.**"
> （承認を増やすことがプロセスを遅くし、より大きなバッチをより低頻度でリリースさせ、それに伴って本番システムへの影響が大きくなり、結果としてリスク水準と change fail rate が高くなるかも調べた。**この仮説はデータによって支持された**）

**そして、この組織にそのまま向けられる一文がある。**

> "This has important implications for organizations working to reduce risk in their release process: **Organizations often respond to problems with software releases by introducing additional process and more heavyweight approvals. Analysis suggests this approach will make things worse.**"
> （リリース過程のリスクを下げようとしている組織にとって重要な含意がある。**組織はしばしば、ソフトウェアリリースの問題に対して、追加の手続きとより重い承認を導入することで応じる。分析はこのやり方が事態を悪化させることを示唆している**）

### 3.3 代わりに何が効くとされているか

> "**We recommend that organizations move away from external change approval because of the negative effects on performance. Instead, organizations should 'shift left' to peer review-based approval during the development process.** In addition to peer review, automation can be leveraged to detect, prevent, and correct bad changes much earlier in the delivery lifecycle. Techniques such as continuous testing, continuous integration, and comprehensive monitoring and observability provide early and automated detection, visibility, and fast feedback. In this way, errors can be corrected sooner than would be possible if waiting for a formal review."

職務分離（segregation of duties）を軽い形で満たす具体策:

> "One approach is to require every change be approved by someone else on the team as part of code review, either prior to commit to version control (as part of pair programming) or prior to merge into master. **This can be combined with automated thresholds that bound changes.** For example, you may implement checks to not allow developers to push a change (even with peer review) that will increase compute or storage costs over a certain threshold."
> （…これは**変更を境界づける自動の閾値**と組み合わせられる。例えば、ピアレビューを経ていても、計算資源やストレージのコストを一定の閾値以上に増やす変更は push できないようにするチェックを実装してよい）

**「人の承認を減らし、機械の閾値で境界を引く」という交換が明示されている。**

### 3.4 「手続きを明確にすること」自体が効く

> "While moving away from traditional, formal change management processes is the ultimate goal, **simply doing a better job of communicating the existing process and helping teams navigate it efficiently has a positive impact on software delivery performance.** When team members have a clear understanding of the process to get changes approved for implementation, this drives high performance. This means they are confident they can get changes through the approval process in a timely manner and know the steps it takes to go from 'submitted' to 'accepted' every time **for all the types of changes they typically make**. Survey respondents with a clear change process were **1.8 times more likely to be in elite performers**"

（**原文はこの位置で文が途切れている。** "to be in elite performers" は原本 PDF のままであり、本調査による省略や改変ではない。）

**"for all the types of changes they typically make"（自分たちが通常行うすべての種類の変更について）という句に注意する。** DORA の「明確な変更プロセス」は、**変更の種類ごとに経路が分かっていること**を含意している。これは ITIL の change model と同じ発想である。

### 3.5 CAB は消えるのではなく、役割が変わる

> "Since approving each individual change is impossible in practice in the continuous paradigm, **the CAB should focus instead on helping teams with process-improvement work to increase the performance of software delivery.** This can take the form of helping teams implement the capabilities that drive performance by providing guidance and resources. CABs can also weigh in on important business decisions that require a trade-off and sign-off at higher levels of the business, such as the decision between time-to-market and business risk."

> "**You'll note the new role of the CAB is strategic.** ... This transition, **from gatekeeper to process architect and information beacon**, is where we see internal change management bodies headed"
> （…**門番から、プロセスの設計者かつ情報の灯台へ**という移行）

### 確認できなかったこと（3節）

**『Accelerate』書籍本文の相関の逐語は、一次情報で取得できなかった。** 広く引用される次の一文 ——

> "external approvals were negatively correlated with lead time, deployment frequency, and restore time, and had no correlation with change fail rate"
> （外部承認は、リードタイム・デプロイ頻度・復旧時間と負の相関があり、change fail rate とは無相関だった）

—— は複数の二次情報が『Accelerate』(Forsgren / Humble / Kim, 2018) に帰しているが、**書籍本文にも、著者や DORA が管理する公開ページにも、この逐語を確認できなかった。** dora.dev の該当ページ（`capabilities` / `devops-capabilities` の両方）にも、この4指標ごとの相関方向の記述は無い。**指標ごとの相関方向を主張する必要があるときは、二次情報であることを明示すべきである。**

一方、**§3.2 に引いた 2019年報告書の記述はすべて DORA が公開している原本 PDF の本文であり、一次情報である。** 「外部承認は速度と安定性の双方に負」「change fail rate を下げる証拠は無い」という結論は、これだけで十分に支持される。

### 出典（3節）

- DORA, *Accelerate State of DevOps 2019*（原本 PDF） — https://dora.dev/research/2019/dora-report/2019-dora-accelerate-state-of-devops-report.pdf
- DORA, DORA's software delivery performance metrics — https://dora.dev/guides/dora-metrics-four-keys/
- DORA, Capabilities: Streamlining change approval — https://dora.dev/capabilities/streamlining-change-approval/
- Forsgren, Humble & Kim, *Accelerate*（2018）— **本文未確認**

### このリポジトリへの含意（3節）

- **「レビューを重くすると安全になるのか」への答えは、測定された範囲では「ならない。むしろ悪化する」である。** ただし否定されているのは **外部の機関による承認（CAB / 上級管理職）** であって、**ピアレビューではない。** DORA はピアレビューを推奨側に置いている。
- この組織の `org-review` は、**役割としては外部機関に近く、実行としてはピアレビューに近い。** 実装とは別の担当が見るという点では外部だが、コードを直接読み、往復上限2回で実装へ差し戻すという点ではピアレビューである。**DORA の否定が直撃するのは、レビューが「工程の門番として、実装が終わってから別の判断で通す／通さないを決める」形になっている場合である。**
- **「問題が起きたら手続きを足す」という反応が名指しで否定されている。** この組織は、手戻りが起きるたびに規約を厚くしてきた経緯を持つ。**次に手戻りが起きたときの既定の反応を「手続きを足す」から「閾値を機械化する」へ変えるべき**という根拠になる。
- **人の承認を機械の閾値へ交換する**という具体策は、この組織が既に部分的に持っている（`org-check.py`、`npm test`、`.claude/settings.json` の `permissions.deny`）。**足りないのは、機械の閾値が通ったときに人の工程を実際に減らすという交換条件のほうである。** 今は機械の検査と人の工程が両方かかっている。
- **「通常行うすべての種類の変更について、submitted から accepted までの手順が分かっている」ことが 1.8 倍の差を生む。** この組織には**変更の種類の一覧が存在しない。** タスクは1件ずつ登録され、種類でまとめられていない。

---

## 4. 爆発半径（blast radius）と一方通行の扉 — 手続きを変える実務

### 4.1 AWS Well-Architected Framework

Operational Excellence の設計原則に、逐語でこうある。

> "**Make frequent, small, reversible changes:** Design workloads that are scalable and loosely coupled to permit components to be updated regularly. **Automated deployment techniques together with smaller, incremental changes reduces the blast radius and allows for faster reversal when failures occur.** This increases confidence to deliver beneficial changes to your workload while maintaining quality and adapting quickly to changes in market conditions."
> （**頻繁で、小さく、可逆な変更を行う**: …**自動化されたデプロイ技法と、より小さく漸進的な変更とを併せることで、爆発半径が縮み、障害発生時により速く巻き戻せるようになる**…）

関連する原則として、自動化に関するものが**承認を明示的に扱っている**。

> "**Safely automate where possible:** ... In the cloud, you can employ automation safety by **configuring guardrails, including rate control, error thresholds, and approvals.** Through effective automation, you can achieve consistent responses to events, limit human error, and reduce operator toil."
> （…**レート制御・エラー閾値・承認を含むガードレールを設定する**ことで自動化の安全性を確保できる…）

**承認が「ガードレールの一種」として、レート制御やエラー閾値と並べられている。** 承認だけが安全の手段ではない、という位置づけである。

### 確認できなかったこと（4.1）

**AWS 公式ドキュメントに "blast radius" の形式的な定義を見つけられなかった。** Well-Architected Framework の用語定義ページにも項目が無く、**定義せずに使われる語**である。上に引いた設計原則が、AWS 公式で最も定義に近い用法である。Reliability Pillar の該当ページ（`rel_mitigate_interaction_failure_limit_scope_impact.html`）は取得を試みたが、本文が返らなかった。

### 4.2 一方通行の扉 — AWS 公式による定義と運用

前回調査は Bezos の株主書簡（2015 / 2016）を取っている。本調査は、**それが実際の運用へどう落ちているか**を AWS 公式の説明から取った。

> "**A one-way door decision is one that has significant and often irrevocable consequences**—building a fulfillment or data center is an example of a decision that requires a lot of capital expenditure, planning, resources, and thus requires deep and careful analysis."

> "**A two-way door decision, on the other hand, is one that has limited and reversible consequences:** A/B testing a feature on a site detail page or a mobile app is a basic but elegant example of a reversible decision."

> "**When we see a two-way door decision, and have enough evidence and reason to believe it could provide a benefit for customers, we simply walk through it.** You want to encourage your leaders and employees to act with only about 70% of the data they wish they had—waiting for 90% or more means you are likely moving too slow."
> （**両開きの扉の決定を見つけ、顧客に益をもたらしうると信じるだけの証拠と理由があるなら、我々はただ通り抜ける。** …欲しいデータの 70% 程度で動くよう促すべきで、90% 以上を待つのは動きが遅すぎるということである）

### 確認できなかったこと（4.2）

**Type 1 / Type 2 を「開発プロセスの中の具体的な手続き」へ落とし込んだ公開の運用例は、見つけられなかった。** AWS の説明は一貫して**意思決定の文化**の水準にとどまっており、「Type 2 の変更はレビューを1名にする」「Type 1 は設計文書を必須にする」といった、**工程の重さを規定する運用規則の形で公開されているものは確認できなかった。** 実務へ落ちているのは、むしろ **blast radius を縮める技術的な装置（canary、cell、段階的ロールアウト）の側**である。

すなわち — **実務は「不可逆な決定を重い手続きで守る」より、「不可逆な決定そのものを減らす（可逆にする）」ほうへ投資している。** §2.5 の canary、§4.1 の "Make frequent, small, reversible changes" はどちらもその形である。

### Microsoft について

**Azure Architecture Center の "blast radius" の定義・運用は、本調査では取得していない。** 時間配分の都合で AWS と Google に集中した。**未調査であり、「無い」ことを確認したのではない。**

### 出典（4節）

- AWS Well-Architected Framework, Operational Excellence の設計原則 — https://docs.aws.amazon.com/wellarchitected/latest/framework/oe-design-principles.html
- AWS Executive Insights, "Elements of Amazon's Day 1 Culture" — https://aws.amazon.com/executive-insights/content/how-amazon-defines-and-operationalizes-a-day-1-culture/
- Google, *The Site Reliability Workbook*, Canarying Releases — https://sre.google/workbook/canarying-releases/

### このリポジトリへの含意（4節）

- **`CLAUDE.md` の「不可逆な設計判断 🔒」は、それ自体が正しい。** 問題は、**不可逆性を減らす装置への投資が無いこと**である。実務は「重い手続きで守る」より「可逆にする」に賭けている。pergram で言えば、**導出値を保存しない設計は既に「可逆にする」側の投資である**（保存していないので、定義を変えれば再計算で済む）。この方向の投資は、工程を軽くする根拠になる。
- **承認をガードレールの一種として相対化する**という AWS の整理は使える。この組織の工程は現在ほぼ「人の承認」だけで構成されている。レート制御（同時に走らせるタスク数）・エラー閾値（手戻り回数）といった別種のガードレールは、まだ工程の重さと接続されていない。
- **70% のデータで動く**という規則は、この組織の「分からないことを無理に決めない」と緊張関係にある。両立させるなら、**「判断してよい範囲」の内側では 70% で動き、外側では止める**という切り分けになる。これは既存の規約の構造と整合する。

---

## 5. ソフトウェア以外の実務（限定的な調査）

**この節は依頼上も任意であり、調査は浅い。** 深掘りしていないことを明記する。

### 5.1 WHO 手術安全チェックリスト

**19項目、3フェーズ**（麻酔導入前 / 皮膚切開前 / 患者が手術室を出る前）。各フェーズでチームが他の作業を止めて口頭で各項目を確認する。**記憶に頼らず物理的な道具を参照すること**が遵守の条件として挙げられている。

**「どの手術に何項目を課すか」をどう決めるか**については、WHO は**閾値を定めていない。** 代わりに次の姿勢を取っている。

> "Adaptation after local consultation is encouraged."
> （地域での協議を経た上での適合は奨励される）

ただし改変した場合は WHO のロゴを外し、"Based on the WHO Surgical Safety Checklist, © World Health Organization 2009. All rights reserved." と表示することが求められる。

**確認できなかったこと**: 「どの手術にチェックリストを適用するか（適用対象の線引き）」についての WHO の記述は、参照したページに見当たらなかった。**手術の規模やリスクによって項目数を変える設計は確認できていない。** むしろ**全件に同じ19項目**というのがこのチェックリストの形である。

Gawande の著作（*The Checklist Manifesto*）本文は**参照していない。**

### 5.2 航空の Minimum Equipment List（MEL）

**「省略してよいものの事前定義」の実例として、構造だけは確認できた。**

- FAA が機種ごとに **MMEL（Master Minimum Equipment List）** を発行する
- 運航者はそれを基に自社の **MEL** を作る。"Each operator's MEL will expand the MMEL general 'Remarks or Exceptions' to include specific 14 CFR requirements and procedures for operating with the inoperative item(s)."
- MEL は "allows an operator to continue to operate an aircraft with certain inoperative items"（特定の装備が不作動のまま運航を継続することを許す）

**構造が ITIL の standard change と同型である。** 「その場で判断してよいか」を都度決めるのではなく、**どの装備が不作動でも飛べるかを事前にリスト化し、規制当局が事前に承認しておく。** 現場の判断はリストとの照合に還元される。

**確認できなかったこと**: MMEL に載せてよい項目をどう選定するか（安全性解析の手順・基準）は調査していない。引用はいずれも FAA の公開 PDF を検索経由で拾ったもので、**原文の該当箇所を直接読んで確認していない。** この節の記述は**二次的な確度である。**

### 出典（5節）

- WHO, Safe Surgery — Tools and resources — https://www.who.int/teams/integrated-health-services/patient-safety/research/safe-surgery/tool-and-resources
- FAA, AC 120-MEL（草案） — https://www.faa.gov/sites/faa.gov/files/aircraft/draft_docs/afs_ac/AC_120-MEL_Coord_Copy.pdf

### このリポジトリへの含意（5節）

- **WHO チェックリストは「全件に同じものを課す」設計である。** これは「工程を分岐させよ」という本調査全体の流れに対する反例として置いておく価値がある。**項目数が19と少なく、実行が数分で済むからこそ全件に課せる。** 分岐させるか一律にするかの判断は、**1回の実行コスト**に依存する。
- **MEL の形（省略してよいものを事前にリスト化し、一度だけ審査する）は、ITIL の standard change と同じ構造である。** 独立に同じ設計へ到達している2つの実務がある、ということ自体が、この形の頑健さの証拠になる。

---

## 6. 確認できなかったこと（一覧）

| # | 確認できなかったもの | 理由 |
| --- | --- | --- |
| 1 | ITIL 4 で**分類を誤ったときに何が起きるか**の設計 | practice guide に記述が無い。承認されなかった変更が "sent for review and closure" になることしか書かれていない |
| 2 | ITIL 4 Foundation **書籍本体**の記述 | 有償。本調査はすべて公式 practice guide に依拠している |
| 3 | ITIL の `minor / medium / major` の**閾値・尺度** | 「組織が決める」とされ、規格側は一切定義していない。**存在しないことが確認できた**と言ってよい |
| 4 | 『Accelerate』書籍本文の「外部承認はリードタイム・デプロイ頻度・復旧時間と負の相関、change fail rate と無相関」の**逐語** | 書籍が有償。dora.dev の該当ページ2種にもこの4指標別の相関方向の記述が無い。二次情報でのみ確認 |
| 5 | AWS 公式による **"blast radius" の形式的定義** | Well-Architected の用語定義ページに項目が無い。**定義せずに使われる語**である。Reliability Pillar の該当ページは本文が取得できなかった |
| 6 | Type 1 / Type 2 を**開発プロセスの手続きへ落とし込んだ公開の運用例** | AWS の説明は意思決定の文化の水準にとどまる。工程の重さを規定する運用規則の形では見つからなかった |
| 7 | **Microsoft / Azure Architecture Center** の blast radius | 時間配分の都合で未調査。**「無い」ことを確認したのではない** |
| 8 | SRE 本の「障害の約70%が変更起因」の**出典・測定方法** | 本文に "SRE has found" とあるだけで、母集団・期間・障害の定義が示されていない |
| 9 | WHO チェックリストの**適用対象の線引き** | 参照したページに記述が見当たらなかった。Gawande の著作本文は未参照 |
| 10 | MMEL への項目**選定基準** | 未調査。5.2 の記述は原文の該当箇所を直接読んでおらず、**二次的な確度である** |

---

### 前回調査（dev-process-sizing.md §6）との突き合わせ

#### 1. 前回の結論「工程ごとに軸が違う」は — 支持された。ただし軸が1つ増えた

**覆す証拠は出なかった。** 今回調べた4領域は、いずれも「タスクの重さ」という単一の数字を持っていない。

- ITIL は **change model** という単位で工程を決めており、そのモデルが「どの工程を手動でやるか／自動でやるか／飛ばすか」を工程ごとに個別に指定する（§1.10 の Table 3.2 がまさにそれで、registration / assessment / authorization の3工程が**別々に**変わっている）
- DORA が測っているのは**承認工程だけ**である。テストや設計の重さは別の能力（continuous testing, code maintainability）として別に測られている
- SRE の error budget が切り替えるのは**リリース工程だけ**である。設計やレビューには触れていない

**むしろ前回より強く支持された。** ITIL の Table 3.2 は、同じ1つの変更に対して工程ごとに扱いが違うことを**表の形で明示している**。前回は各実務を横に並べて「軸が違う」と推論したが、今回は**1つの実務の内部でも工程ごとに扱いが分かれている**ことが直接確認できた。

**加えて、前回の4軸に無かった軸が1つ出た — 「手続きが既に整備されているか」である。**

ITIL の standard / normal の境界は、リスクでも規模でも曖昧さでもない。**「有効な標準化されたやり方が既に在るか」**である（§1.4 の "When there is no effective standardized approach to a change..."）。これは変更そのものの性質ではなく、**組織がその種類の変更をこれまでに何回扱ってきたかという履歴**で決まる。**同じ内容の変更が、1回目は normal で、5回目には standard になりうる。** 前回の4軸（不可逆性・曖昧さ・リスク・変更の種類）はいずれも変更そのものの性質を見ており、この軸を持っていない。

#### 2. 前回の結論「規模を軸にしている実務は一つも無い」は — 部分的に訂正を要する

**前回の断定は、今回の一次情報によって弱められる。**

ITIL 4 の practice guide は、規模に3か所で言及している。

1. change model を定義する因子の一覧に **`scale of change`（変更の規模）** が入っている（§1.6）
2. 組織は変更を **`minor, medium, or major`** のどれとみなすかを決め、**"The change enablement practice usually includes different approaches to changes of different scales."**（規模の異なる変更には通常異なるアプローチを含む）とされている（§1.9）
3. キーメッセージが **"Size should be an important consideration for organizations' change models."** と明言している（§1.7）

**したがって「規模を工程の重さの軸にしている実務は一つも無い」は、そのままでは維持できない。ITIL 4 は規模を軸の一つとして明示的に挙げている。**

**ただし、前回の結論の核心は生き残る。理由は3つある。**

- **ITIL は規模の尺度も閾値も一切定義していない。** 行数・ファイル数はもちろん、何で測るかすら書いていない。したがって「258行だから軽く」という判断に、ITIL は根拠を与えない。**規模を軸に使ってよいが、閾値は自分で作れ、というだけである。**
- **規模への言及の向きが、前回の Google の200行と同じである。** ITIL が言っているのは「小さいから手続きを省いてよい」ではなく、**「リスクを閾値以下に収めるために変更を小さく切れ」**である（§1.7 の "decide to limit a change's potential risk by deconstructing it into iterations"）。AWS の "Make frequent, small, reversible changes" も同じ向きで、小さくすることが**爆発半径を縮める手段**として置かれている。**規模は独立変数ではなく、リスクを操作するためのつまみである。**
- **DORA は逆に、規模が大きくなること自体を承認プロセスの害として測っている**（§3.2 の "the release of larger batches less frequently ... Our hypothesis was supported in the data"）。バッチが大きいことは**重い工程の結果**であって原因ではない、というのが測定結果である。

**書き換えるなら、こうなる** — 「規模は工程の重さを**決める**軸ではない。規模は**操作する対象**であり、実務は規模を小さくすることでリスクを下げ、その結果として工程を軽くしている。」

#### 3. 変更をいくつのクラスに分けているか

| 実務 | クラス数 | 中身 |
| --- | --- | --- |
| **ITIL 4（定義上）** | **3** | standard / normal / emergency |
| **ITIL 4（キーメッセージの実質）** | **4** | standard / 専門家の分析に基づくもの / **複数の safe-to-fail な実験に基づくもの** / emergency（§1.8） |
| **ITIL 4（規模）** | **3**（直交する別軸） | minor / medium / major |
| **Bezos / AWS** | **2** | 一方通行の扉 / 両開きの扉 |
| **航空 MEL** | **2** | 事前にリスト化され不作動でも運航可 / それ以外 |
| **Google SRE** | **クラス分けを使っていない** | error budget の**残高という連続量**で切り替える。変更を分類しない |
| **DORA** | **クラス分けを使っていない** | 承認の**形式**（外部機関 / ピアレビュー）を問題にする。変更の側を分類しない |
| **WHO 手術安全チェックリスト** | **クラス分けを使っていない** | 全件に同じ19項目 |

**最も多いのは 2〜3クラスである。4を超える実務は見つからなかった。**

**そして重要なのは、クラス分けを使っていない実務が3つあったことである。** しかも三者が三様の代替を持っている。

- **SRE は連続量で置き換えている。** クラスではなく、消費した error budget の残高で工程が切り替わる
- **DORA は変更ではなく手続きの側を見ている。** どの変更が重いかではなく、**誰が承認するか（外部機関かピアか）**が問題である
- **WHO は一律である。** 1回の実行コストが十分に小さければ、分岐させないことが正解になりうる

**この組織にとって、これは選択肢が3つでなく4つあることを意味する** —— クラスを作る／連続量で切り替える／承認の所在を変える／一律のまま実行コストを下げる。前回調査も本調査の依頼文も「クラスを作る」を暗黙の前提にしていたが、**一次情報の側はその前提を共有していない。**

#### 4. 分類を「誰が・いつ」決める設計になっているか

**共通しているのは、「個々の変更が来たときに、人が都度クラスを判定する」設計を誰も採っていないことである。**

| 実務 | 誰が | いつ |
| --- | --- | --- |
| **ITIL 4** | 組織が **change model** として決める。個々の変更ではモデルに流すだけ。standard change では **"Change authorization is not needed"** となり、承認する人自体が居なくなる | **変更が来る前**。手続きが作られた時点で一度だけリスク評価を通す（§1.3）。以後は手続きを変えるときだけ再評価 |
| **ITIL 4（見直し）** | change manager とステークホルダーが、**失敗した変更**をレビューして change model と standard change 手続きを改訂する | **定期的に**（change optimization プロセス、§1.12） |
| **Google SRE** | **誰も決めない。** 監視システムが測った error budget の残高が機械的に決める | **連続的に**。budget が尽きた時点で自動的にリリースが止まる |
| **AWS / Bezos** | 意思決定者自身が可逆性で判断する。**Type 2 なら「ただ通り抜ける」** | 決定の直前 |
| **航空 MEL** | **規制当局（FAA）が MMEL で事前承認**し、運航者が自社 MEL に落とす。現場はリストと照合するだけ | **運航の遥か前**。項目ごとに一度だけ |

**設計として繰り返し現れるのは、次の形である。**

> **クラスの判定は、個々の変更に対して行われるのではない。「その種類の変更を扱う手続き」に対して一度だけ、前もって行われる。個々の変更は、手続きとの照合に還元される。**

ITIL の standard change、航空の MEL、AWS の自動ガードレール（§4.1 の rate control / error thresholds / approvals）が、いずれもこの形である。**そして ITIL は、その手続きの一覧自体を定期的に改訂する工程まで実践の中に持っている。**

**この組織との差は、ここに最も鮮明に出る。** 現在は、タスクを1件登録するたびに、そのタスクの工程の重さを人（オーケストレーター）が判断している。実務が採っているのは逆で、**判断は「タスクの種類」に対して一度だけ行われ、以後は照合になる。** そして**この組織には、そもそも「タスクの種類」の一覧が存在しない。**

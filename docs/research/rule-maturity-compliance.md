# 規約が「有る」ことと「効いている」ことをどう区別するか — 確立した実務の調査

- 調査日: 2026-09-12
- 目的: この組織の課題 **I-010「規約が存在しても実行されない（検知はされているが、何も起きない）」** に対して、思いつきではなく確立した実務の基準で対策を選ぶための材料を集める
- 方針: 一次情報（原典・規格・公式文書・著者本人の文章）に当たる。**当たれなかった論点は「確認できなかった」と明記し、推測で埋めない**。逐語引用は原文（英語）で引き、直後に日本語訳を括弧で添える

**この文書は調査結果であって、規約ではない。** ここから何を採るかは別に決める。

---

## 1. プロセスの成熟度モデル — 「定義した」「実行した」「守らせた」「測った」は別の段である

### 1.1 CMMI — 段の名前そのものが「institutionalization（定着）の度合い」を表す

**CMMI は、プロセスの段を「何をやったか」ではなく「どれだけ組織に食い込んでいるか」で切っている。** その概念を institutionalization と呼び、次のように定義する。

> "Institutionalization is an important concept in process improvement. When mentioned in the generic goal and generic practice descriptions, institutionalization implies that the process is ingrained in the way the work is performed and there is commitment and consistency to performing (i.e., executing) the process."
> （定着は、プロセス改善における重要な概念である。共通ゴールおよび共通プラクティスの記述で言及されるとき、定着とは、そのプロセスが仕事のやり方の中に染み込んでおり、**遂行すること（すなわち実行すること）への確約と一貫性がある**ことを意味する）

> "An institutionalized process is more likely to be retained during times of stress."
> （定着したプロセスは、**ストレス下でも維持されやすい**）

段は3つ。**上の段は下の段を含む**（"A managed process is a performed process. A defined process is a managed process."）。

| 共通ゴール | プロセスの呼び名 | 定義（逐語） |
|---|---|---|
| GG 1 | Performed（遂行された） | "A performed process is a process that accomplishes the work necessary to satisfy the specific goals of a process area."（プロセス領域の固有ゴールを満たすのに必要な作業を成し遂げるプロセス） |
| GG 2 | Managed（管理された） | "A managed process is a performed process that is planned and executed in accordance with policy; employs skilled people having adequate resources to produce controlled outputs; involves relevant stakeholders; is monitored, controlled, and reviewed; and is evaluated for adherence to its process description."（方針に従って計画され実行され、十分な資源を持つ熟練者が統制された成果物を作り、関係者が関与し、監視・統制・レビューされ、**プロセス記述への遵守が評価される**） |
| GG 3 | Defined（定義された） | "A defined process is a managed process that is tailored from the organization's set of standard processes according to the organization's tailoring guidelines; has a maintained process description; and contributes process related experiences to the organizational process assets."（組織の標準プロセス群からテーラリングされ、維持されたプロセス記述を持ち、経験を組織資産へ還元する） |

**Performed と Managed の境目が、I-010 の核心そのものである。**

> "A critical distinction between a performed process and a managed process is the extent to which the process is managed. A managed process is planned (the plan can be part of a more encompassing plan) and the execution of the process is managed against the plan. **Corrective actions are taken when the actual results and execution deviate significantly from the plan.** A managed process achieves the objectives of the plan and is institutionalized for consistent execution."
> （遂行されたプロセスと管理されたプロセスの決定的な違いは、どこまで管理されているかである。管理されたプロセスは計画され、実行が計画に対して管理される。**実際の結果や実行が計画から著しく逸脱したときには、是正措置が取られる。** 管理されたプロセスは計画の目的を達成し、一貫した実行のために定着している）

**「逸脱したときに是正措置が取られるか」が Performed と Managed を分ける。** 逸脱を検知していても是正が起きないなら、それは Managed ではない。

**Defined の段では、プロセス記述に何が書かれていなければならないかが列挙されている。**

> "A defined process clearly states the following: Purpose / Inputs / Entry criteria / Activities / Roles / Measures / Verification steps / Outputs / Exit criteria"
> （定義されたプロセスは次を明示する: 目的／入力／**開始条件**／活動／役割／**測度**／**検証手順**／出力／**終了条件**）

**遵守を誰が確かめるかも、共通プラクティスとして独立に定義されている**（GP 2.9）。

> "Objectively evaluate adherence of the process and selected work products against the process description, standards, and procedures, and **address noncompliance**."
> （プロセスおよび選ばれた成果物の、プロセス記述・標準・手順への遵守を客観的に評価し、**不遵守に対処する**）

> "**People not directly responsible for managing or performing the activities of the process typically evaluate adherence.** In many cases, adherence is evaluated by people in the organization, but external to the process or project, or by people external to the organization. As a result, credible assurance of adherence can be provided even during times when the process is under stress (e.g., when the effort is behind schedule, when the effort is over budget)."
> （**そのプロセスの活動を管理・遂行する責任を直接には負っていない人が、通常、遵守を評価する。** 多くの場合、組織内だがそのプロセスやプロジェクトの外側にいる人、あるいは組織外の人が評価する。その結果、プロセスがストレス下にあるとき——遅れているとき、予算超過のとき——でも、遵守についての信用できる保証が提供できる）

### 出典

- CMMI Product Team, *CMMI for Development, Version 1.3*（CMU/SEI-2010-TR-033, 2010年11月）— 引用は pp. 65-66（Process Institutionalization / Performed・Managed・Defined Process）、p. 106（GP 2.9）
  - 公式の書誌: https://kilthub.cmu.edu/articles/report/CMMI_for_Development_Version_1_3/6572342
  - 本文を読んだ PDF: https://broadswordsolutions.com/wp-content/uploads/2011/03/CMMI-DEV_v1.3.pdf
- **CMMI Institute / ISACA の現行版（V2.0 / V3.0）の Capability Level の公式定義は取得できなかった** — https://cmmiinstitute.com/learning/appraisals/levels が HTTP 403 を返す。上記は SEI が公開している最後の完全版モデル（v1.3）による

---

### 1.2 ISO/IEC 33020 — 「定義すること」と「配備すること」と「保証すること」は別の属性である

**ISO/IEC 33020:2019 は、プロセス能力を6段（0〜5）に切り、各段を「プロセス属性（process attribute）」の集合で定義する。** 重要なのは、**レベル3が3つの独立した属性に分かれていること**である。

| レベル | 名前 | 定義（逐語） |
|---|---|---|
| 0 | Incomplete | "The process is not implemented or fails to achieve its process purpose. At this level there is little or no evidence of any systematic achievement of the process purpose." |
| 1 | Performed | "The implemented process achieves its process purpose."（実装されたプロセスがその目的を達成している） |
| 2 | Managed | "The previously described Performed process is now implemented in a managed fashion (planned, monitored and adjusted) and its documented information are appropriately established, controlled and maintained."（計画され、監視され、**調整される**形で実装され、文書化情報が確立・統制・維持されている） |
| 3 | Established | "The previously described Managed process is now implemented using a defined process..."（定義されたプロセスを用いて実装されている） |
| 4 | Predictable | "The previously described Established process is now performed predictively. Quantitative management needs are identified, measurement data are collected and analysed to identify assignable causes of variation."（**定量的に測られ**、変動の突き止められる原因を特定するためにデータが収集・分析される） |
| 5 | Innovating | "The previously described Predictable process is now continually improved to respond to changes..." |

**レベル3の内訳が、I-010 の構造そのものを言い当てている。**

| 属性 | 何を測るか（逐語） |
|---|---|
| **PA 3.1 Process definition** | "a measure of the extent to which **a standard process is established and maintained**"（標準プロセスが確立・維持されている度合い） |
| **PA 3.2 Process deployment** | "a measure of the extent to which **a standard process is deployed as a defined process**"（標準プロセスが、定義されたプロセスとして**配備されている**度合い） |
| **PA 3.3 Process assurance** | "a measure of the extent to which **the defined process is assured and continually improved**"（定義されたプロセスが**保証され**、継続的に改善されている度合い） |

**PA 3.2（配備）が要求するものは、規約文書の存在ではない。**

> "a) a defined process is deployed based upon an appropriately tailored standard process;
> b) **required roles, responsibilities and authorities necessary for performing the defined process are assigned and communicated**;
> c) **required person(s) necessary for performing the defined process are competent on the basis of defined education, training and experience**;
> d) required resources necessary for performing the defined process are made available, monitored and measured;
> e) documented information is available to ensure that the defined process achieves its intended results."
> （b: 必要な役割・責任・権限が**割り当てられ、伝達されている** ／ c: 遂行に必要な人が、定められた教育・訓練・経験に基づいて**力量を持っている** ／ d: 必要な資源が**利用可能にされ、監視され、測定されている**）

**PA 3.3（保証）が要求するものの中に、I-010 が欠いているものが名指しされている。**

> "d) **action is taken on any nonconformity, based on its nature and effect, and tracked to closure**;"
> （不適合には、その性質と影響に応じて措置が取られ、**クローズされるまで追跡される**）

> "c) conformity of the defined process (and associated activities, outputs and documented information) is **objectively assured**;"
> （定義されたプロセスの適合性が**客観的に保証される**）

### 評定尺度 N / P / L / F — 判定に何の証拠を要求するか

**すべての段は「evidence（証拠）」という語で判定される。** 逐語は次のとおり。

> "N Not achieved: **There is little or no evidence** of achievement of the defined process attribute in the assessed process."
> （証拠がほとんど、あるいは全く無い）

> "P Partially achieved: **There is some evidence** of an approach to, and some achievement of, the defined process attribute in the assessed process. **Some aspects of achievement of the process attribute may be unpredictable.**"
> （何らかの取り組みと、ある程度の達成の証拠がある。達成の一部の側面は**予測不能でありうる**）

> "L Largely achieved: **There is evidence of a systematic approach to, and significant achievement of,** the defined process attribute in the assessed process. Some weaknesses related to this process attribute may exist in the assessed process."
> （**体系的な取り組みと、有意な達成**の証拠がある。この属性に関する弱点がいくらか存在しうる）

> "F Fully achieved: **There is evidence of a complete and systematic approach to, and full achievement of,** the defined process attribute in the assessed process. **No significant weaknesses** related to this process attribute exist in the assessed process."
> （**完全かつ体系的な取り組みと、完全な達成**の証拠がある。有意な弱点は存在しない）

規格はこの順序尺度を**達成率のパーセンテージ**として理解すべきと定める（"The ordinal scale defined above shall be understood in terms of percentage achievement of a process attribute."）。**パーセンテージの表そのものは、公開プレビューPDFが8ページで切れているため取得できなかった。** ISACA の COBIT PAM 記事から取れた細分値は次のとおり（**この4つは二次情報である**）。

- P− : >15% 〜 ≤32.5%（"many aspects" が予測不能）
- P+ : >32.5% 〜 ≤50%（"some aspects" が予測不能）
- L− : >50% 〜 ≤67.5%（"many weaknesses"）
- L+ : >67.5% 〜 ≤85%（"some weaknesses"）

境界から論理的に導けるのは **N = 0〜15%、F = >85〜100%** であるが、**規格本文で確認したわけではない。**

### 出典

- ISO/IEC 33020:2019, *Information technology — Process assessment — Process measurement framework for assessment of process capability*
  - 公開プレビュー PDF（本文を読んだもの。5.2〜5.3、pp. 3-8）: https://cdn.standards.iteh.ai/samples/78526/b1153a825ca94dad89ecd8d292ef4817/ISO-IEC-33020-2019.pdf
  - 書誌: https://standards.iteh.ai/catalog/standards/iso/a6266bce-03e8-44be-bc31-9ee7962bf3de/iso-iec-33020-2019
- ISACA Journal 2018 vol.1, "A COBIT 5 PAM Update Compliant With ISO/IEC 330xx Family"（**二次情報**。細分評定の%のみ） — https://www.isaca.org/resources/isaca-journal/issues/2018/volume-1/a-cobit-5-pam-update-compliant-with-isoiec-330xx-family

### このリポジトリへの含意

- **「規約がある」は CMMI の GG1 / ISO のレベル1 にすら足りない。** レベル1が要求するのは「実装されたプロセスが目的を達成している」ことであり、文書が存在することではない。
- **「逸脱に是正措置が取られる」が Performed と Managed を分ける唯一の判定条件である。** 警告50件が9日間放置されている状態は、CMMI の定義では **Managed に達していない**。
- **ISO はさらに厳しく、「定義（PA 3.1）」と「配備（PA 3.2）」を別の属性に分けている。** 配備の判定条件は、役割が**割り当てられ伝達されている**こと、遂行者が**力量を持つ**こと、資源が**監視・測定されている**こと。規約文書の存在はこのどれでもない。
- **不適合は「クローズまで追跡される」ことが求められている**（PA 3.3 d）。検知だけでは属性を満たさない。
- **遵守の評価は、遂行者自身がやるものではない**（CMMI GP 2.9）。この組織では、検査スクリプトがその役を担っているが、**スクリプトは「address noncompliance」まではしていない。**

---

## 2. 逸脱の常態化と、警告への不応 — 「50件が9日放置」は何と呼ばれるか

### 2.1 normalization of deviance（逸脱の常態化）

**Diane Vaughan 自身の言葉**（2008年のインタビュー）。

> "Social normalization of deviance means that people within the organization become so much accustomed to a deviant behaviour that they don't consider it as deviant."
> （逸脱の社会的常態化とは、組織の中の人々が、ある逸脱した振る舞いに**あまりにも慣れてしまい、それを逸脱だと考えなくなる**ことを意味する）

> "The first time the O-rings were damaged the engineers found a solution and decided the space transportation system to be flying with acceptable risk. The second time damage occurred, they thought the trouble came from something else."
> （O リングが最初に損傷したとき、技術者たちは解決策を見つけ、この輸送システムは許容可能なリスクで飛んでいると判断した。2度目に損傷が起きたとき、彼らは原因が別のところにあると考えた）

**『The Challenger Launch Decision』(1996) の本文からの、ページ番号付きの逐語引用は取得できなかった。** 書籍本文にアクセスできる公開ソースが見つからなかったため、以下は Vaughan 本人のインタビュー、および彼女の分析を採用した公式事故調査報告書・査読論文から引く。

**Columbia 事故調査委員会（CAIB）報告書 第8章**（NASA の公式報告書。Vaughan 本人が委員会に協力している）は、同じ機構をこう記述する。

> "In all official engineering analyses and launch recommendations prior to the accidents, **evidence that the design was not performing as expected was reinterpreted as acceptable and non-deviant**, which diminished perceptions of risk throughout the agency."
> （事故以前のすべての公式な技術解析と打上げ推奨において、**設計が期待どおりに機能していないという証拠は、許容可能で逸脱ではないものとして再解釈され**、それが機関全体のリスク認識を弱めた）

> "the history of engineering decisions on foam and O-ring incidents had identical trajectories that 'normalized' these anomalies, **so that flying with these flaws became routine and acceptable**."
> （フォームと O リングの事象に関する技術的意思決定の歴史は、これらの異常を「常態化」させる同一の軌跡をたどっており、**その結果、これらの欠陥を抱えたまま飛ぶことが日常的で受け入れ可能なことになった**）

**医療分野の査読論文**（Banja, *The normalization of deviance in healthcare delivery*, Business Horizons 53(2), 2010）は、機構を次のように定義する。

> "deviations from standard operating rules become, with enough repetitions, 'normalized' practice patterns. At this juncture, personnel **no longer regard these acts as untoward, but rather as routine, rational, and entirely acceptable**."
> （標準的な運用規則からの逸脱は、十分な回数の反復を経て「常態化された」実践パターンになる。この時点で、担当者は**これらの行為をもはや不都合とは見なさず、日常的で、合理的で、まったく受け入れ可能なものと見なす**）

同論文は、**逸脱が常態化する理由を7つ挙げている。** そのうち I-010 に直接当たるのは次の2つである。

1. "Rules are perceived as stupid and inefficient"（規則が愚かで非効率だと受け取られている）
2. "Leadership withholds or dilutes findings on system problems"（**リーダーシップがシステム上の問題についての所見を出し惜しむ、あるいは薄める**）

**処方箋として同論文が挙げるもの**（逐語ではなく、論文が列挙する対策の要約）。

1. 弱い信号（weak signals）に早期に注意を払う
2. 有害事象について不合理な楽観を排す
3. 感情的に難しい会話の訓練をする
4. 声を上げられる心理的安全性を作る
5. **継続的な監督と監視を確立する**

### 出典

- Diane Vaughan インタビュー（Consulting Newsline, 2008） — https://www.consultingnewsline.com/Info/Vie%20du%20Conseil/Le%20Consultant%20du%20mois/Diane%20Vaughan%20(English).html
- *Columbia Accident Investigation Board Report, Volume I*（2003年8月）第8章 "History as Cause: Columbia and Challenger", pp. 195-204 — https://www.montana.edu/rmaher/engr125/CAIB-History%20as%20a%20cause.pdf ／ 全巻: https://www.nasa.gov/wp-content/uploads/static/history/columbia/reports/CAIBreportv6.pdf
- Banja J., "The normalization of deviance in healthcare delivery", *Business Horizons* 53(2):139-148, 2010 — https://pmc.ncbi.nlm.nih.gov/articles/PMC2821100/
- Diane Vaughan, *The Challenger Launch Decision*, University of Chicago Press, 1996（**本文の逐語は取得できなかった**）

---

### 2.2 alert fatigue / alarm fatigue（警告疲れ）— 定量的な一次情報

**The Joint Commission（米国の医療機関認証機関）の Sentinel Event Alert 第50号**（2013年4月）が、この現象の定義と被害の規模を公式に記録している。

> "As a result, clinicians become desensitized or immune to the sounds, and are overwhelmed by information — in short, they suffer from 'alarm fatigue.' **In response to this constant barrage of noise, clinicians may turn down the volume of the alarm, turn it off, or adjust the alarm settings outside the limits that are safe and appropriate for the patient** — all of which can have serious, often fatal, consequences."
> （その結果、臨床医は音に対して鈍感になるか免疫ができ、情報に圧倒される——要するに「アラーム疲れ」に陥る。**この絶え間ない騒音の集中砲火への反応として、臨床医はアラームの音量を下げ、切り、あるいは患者にとって安全で適切な範囲の外へ設定を調整することがある**——そのいずれもが深刻な、しばしば致命的な結果をもたらしうる）

> "The Joint Commission's Sentinel Event database includes reports of **98 alarm-related events** between January 2009 and June 2012. Of the 98 reported events, **80 resulted in death**, 13 in permanent loss of function, and five in unexpected additional care or extended stay."
> （2009年1月から2012年6月までの間に、98件のアラーム関連事象が報告されている。うち80件が死亡、13件が恒久的な機能喪失、5件が予期せぬ追加治療または入院延長に至った）

> "Among the major contributing factors were: **Alarm fatigue — the most common contributing factor**"
> （主要な寄与要因には次があった: **アラーム疲れ——最も一般的な寄与要因**）

**「警告の大半が行動を要しない」ことが不応の原因である**という定量は、同 Alert が引く推計にある（85〜99%のアラーム信号は臨床的介入を要しない）。

**投薬警告の分野では、無視率が直接測られている。** JAMIA の系統的レビュー（Hussain, Reynolds & Zheng, 2019）は、警告疲れをこう定義する。

> "alert fatigue [occurs] when a high number of irrelevant alerts leads users to habitually override them"
> （警告疲れは、**無関係な警告が大量に出ることによって、利用者が習慣的にそれらを却下するようになる**ときに起きる）

同レビューの測定結果は、**「出し方」で受容率が倍近く変わる**ことを示す。

- 標準的なモーダルダイアログ（ポップアップ）での受容率: **38.67%**
- 代替設計での受容率: **61.57%**

**有効だった対策として挙げられているのは3つ**（いずれも「もっと強く警告する」ではない）。

1. **リスクによる段分け（tiering）** — "Alerts present an indication of the risks associated with an override"（却下に伴うリスクを警告自身が示す）
2. **その場で直せる操作を与える（action shortcuts）** — 全部やり直させるのではなく、ダイアログの中で修正できるようにする
3. **役割ごとの仕立て（role tailoring）** — 誰に出すかを変える

同レビューの結論は次のとおり。

> "alert fatigue may be mitigated by **redesigning the interactive behavior of CDS and tailoring CDS to clinical roles**"
> （警告疲れは、**支援システムの対話的なふるまいを再設計し、臨床上の役割に合わせて仕立てる**ことで緩和されうる）

**薬物相互作用警告の却下率のメタ分析**（Felisberto et al., *Health Informatics Journal*, 2024）では、**医師によるアラート却下の全体有病率が 90%（95%CI 85-95%）** と報告されている（文献中の報告値の範囲は 49〜96%）。

### 出典

- The Joint Commission, *Sentinel Event Alert, Issue 50: Medical device alarm safety in hospitals*（2013年4月8日）— PDF（本文を読んだもの）: https://www.kff.org/wp-content/uploads/sites/2/2013/04/sea_50_alarms_4_5_13_final1.pdf ／ 掲載元: https://www.jointcommission.org/en-us/knowledge-library/newsletters/sentinel-event-alert/issue-50 （直接アクセスは HTTP 403）
- Hussain MI, Reynolds TL, Zheng K, "Medication safety alert fatigue may be reduced via interaction design and clinical role tailoring: a systematic review", *JAMIA* 26(10):1141-1149, 2019 — https://academic.oup.com/jamia/article/26/10/1141/5519579
- Felisberto M. et al., "Override rate of drug-drug interaction alerts in clinical decision support systems: A brief systematic review and meta-analysis", *Health Informatics Journal*, 2024 — https://journals.sagepub.com/doi/10.1177/14604582241263242

### このリポジトリへの含意

- **「警告が出続けて誰も動かない」には、実務上ふたつの名前がついている。** 出す側から見れば **alert fatigue**（警告が情報を運ばなくなった）、守る側から見れば **normalization of deviance**（違反が違反と認識されなくなった）。I-010 の原因推定に書かれている見立ては、実務の用語と一致している。
- **医療分野の数字は、この組織の数字より悪い。** 却下率 90%、警告の85〜99%が行動を要しない。**つまりこれは「この組織がだらしない」という話ではなく、警告を出す設計そのものの既知の失敗モードである。**
- **実務が処方箋として挙げるものは、「もっと強く言う」ではない。** 段分け（重要なものだけ出す）、その場で直せる操作、誰に出すかの仕立て、そして**独立した監督**である。
- 「50件が毎セッション印字される」は、Joint Commission が名指しした "constant barrage of noise"（絶え間ない騒音の集中砲火）そのものである。**件数を減らすこと自体が対策になる。**

---

## 3. 強制する装置 — 「検知する」と「不可能にする」は別物である

### 3.1 forcing function（Donald Norman）— 原典の定義

**Norman の定義は「失敗したら次へ進めない」である。検知ではない。**

> "Forcing functions are a form of physical constraint: **situations in which the actions are constrained so that failure at one stage prevents the next step from happening.**"
> （強制機能とは物理的制約の一形態である。**ある段階での失敗が、次の段階が起きることを妨げるように、行為が制約されている状況**である）

> "Forcing functions are **the extreme case of strong constraints that can prevent inappropriate behavior**. Not every situation allows such strong constraints to operate, but the general principle can be extended to a wide variety of situations. In the field of safety engineering, forcing functions show up under other names... Three such methods are **interlocks, lock-ins, and lockouts**."
> （強制機能は、**不適切な振る舞いを防ぎうる強い制約の極端な場合**である。あらゆる状況で強い制約が働けるわけではないが、一般原理は多様な状況へ拡張できる。安全工学の分野では、強制機能は別の名前で現れる……その3つが、インターロック、ロックイン、ロックアウトである）

| 種類 | 定義（逐語） |
|---|---|
| **Interlock** | "An interlock **forces operations to take place in proper sequence**."（操作を正しい順序で起こさせる） |
| **Lock-in** | "A lock-in **keeps an operation active, preventing someone from prematurely stopping it**."（操作を継続させ、早すぎる中断を防ぐ） |
| **Lockout** | "a lockout **prevents someone from entering a space that is dangerous, or prevents an event from occurring**."（危険な場所へ入ることを防ぐ、あるいは事象が起きることを防ぐ） |

**そして Norman は、強制機能の副作用を明記している。これは対策を選ぶときの制約になる。**

> "**Forcing functions can be a nuisance in normal usage. The result is that many people will deliberately disable the forcing function, thereby negating its safety feature.** The clever designer has to minimize the nuisance value while retaining the safety feature of the forcing function that guards against the occasional tragedy."
> （**強制機能は、通常の使用では厄介物になりうる。その結果、多くの人が意図的に強制機能を無効化し、その安全機能を無にしてしまう。** 賢い設計者は、まれな悲劇から守る安全機能を保ちつつ、厄介さを最小化しなければならない）

Norman が「巧い妥協」として挙げるのは、階段の防火ゲート（地下へ降りてしまうのを防ぐ柵）である。

> "sufficient restraint to make people realize they are leaving the ground floor, **but not enough of an impediment to normal behavior that people will prop open the gate**."
> （1階を通り過ぎようとしていると気づかせるだけの拘束はあるが、**人がゲートを開けっぱなしに固定してしまうほどには、通常の行動を妨げない**）

### 出典

- Donald A. Norman, *The Design of Everyday Things: Revised and Expanded Edition*, Basic Books, 2013, 第4章 "Knowing What To Do: Constraints, Discoverability, and Feedback" の "Forcing Functions" 節 — https://ia902800.us.archive.org/3/items/thedesignofeverydaythingsbydonnorman/The%20Design%20of%20Everyday%20Things%20by%20Don%20Norman.pdf

---

### 3.2 poka-yoke（ポカヨケ）— 「警告する」と「止める」の区別

**新郷重夫（Shigeo Shingo）の原典『Zero Quality Control: Source Inspection and the Poka-Yoke System』（英訳 Productivity Press, 1986）の逐語は取得できなかった。** 書籍本文にアクセスできる公開ソースが見つからなかった。

**確認できたのは二次情報の範囲である**（Six Sigma Daily / Apparel Resources ほかの解説）。新郷は反応の型を2つに分けており、**control（統制型）はプロセスを物理的に停止させ、warning（警告型）はランプやブザーを鳴らすだけである**。統制型は人間の警戒心を必要としないため強く、警告型は安価だが**誰かが気づいて止めることを選ばなければ効かない**。また、不良を後から選り分ける検査ではなく、機械が動く前に条件を確かめる **source inspection（源流検査）** を置くことが主張の中核である。

**この「警告型 vs 統制型」の区別自体は、次節の Google の実務によって、ソフトウェアの文脈で一次情報として裏づけられる。**

### 出典

- Shigeo Shingo, *Zero Quality Control: Source Inspection and the Poka-Yoke System*, Productivity Press, 1986 — 書誌: https://www.routledge.com/Zero-Quality-Control-Source-Inspection-and-the-Poka-Yoke-System/Shingo/p/book/9780915299072 （**本文の逐語は取得できなかった**）
- 二次情報: https://www.sixsigmadaily.com/shigeo-shingo-zero-quality-control/

---

### 3.3 ソフトウェア工学における gate の自動化 — 「警告は無視される」が前提になっている

**Google は、警告が無視されることを経験則として明言し、そこから設計を決めている。**

> "**We have found repeatedly that developers ignore compiler warnings.** We either enable a compiler check as an error (and break the build) or don't show it in compiler output."
> （**開発者がコンパイラ警告を無視することを、我々は繰り返し確認してきた。** そこで我々は、コンパイラのチェックをエラーとして有効にする（そしてビルドを壊す）か、コンパイラ出力に表示しないかの、どちらかにしている）

**これは「警告を出し続ける」という選択肢を最初から捨てている。** ポカヨケの言葉でいえば、警告型を採らず統制型か無かの二択にしている。

> "**Because developers can choose to ignore static analysis warnings displayed in code review**, Google additionally has the ability to add an analysis that blocks committing a pending code change, which we call a **presubmit check**."
> （**コードレビューで表示される静的解析の警告は、開発者が無視することを選べてしまうため**、Google はさらに、保留中の変更のコミットを**ブロックする**解析を追加できるようにしている。これを presubmit check と呼ぶ）

**ただし Google は、止める装置にも成立条件を課している。**

> "Produce **less than 10% effective false positives**. Developers should feel the check is pointing out an actual issue **at least 90% of the time**."
> （実効的な偽陽性を**10%未満**にすること。開発者が、そのチェックは**少なくとも90%の場合に**本物の問題を指摘していると感じられること）

> "who wants to wade through hundreds of false reports in search of a few true ones?"
> （数件の本物を探すために、数百件の誤報をかき分けたい者がいるだろうか）

章の教訓として掲げられているのは3つ。

- "Focus on developer happiness"（開発者の満足に注力する）
- "**Make static analysis part of the core developer workflow**"（静的解析を、開発者の中核ワークフローの一部にする）
- "Empower users to contribute"（利用者が貢献できるようにする）

**同じ形は、GitHub の branch protection にも製品として実装されている。**

> "Required status checks must have a `successful`, `skipped`, or `neutral` status **before collaborators can make changes to a protected branch**."
> （必須ステータスチェックは、**共同作業者が保護されたブランチへ変更を加えられるようになる前に**、成功・スキップ・中立のいずれかの状態でなければならない）

> "all required status checks must pass **before collaborators can merge changes** into the protected branch."
> （すべての必須ステータスチェックが通るまで、**共同作業者は変更をマージできない**）

### 3.4 ただし「人間のゲート」は逆効果である — DORA の測定

**「止める」を人間の承認で実装すると、実務のデータでは悪化する。**

> "We found that formal change management processes that **require the approval of an external body such as a change advisory board (CAB) or a senior manager** for significant changes **have a negative impact on software delivery performance.** Survey respondents were **2.6 times more likely to be low performers** if their organization had this kind of formal approval process in place."
> （重要な変更について、**変更諮問委員会や上級管理者といった外部の主体の承認を要求する**公式な変更管理プロセスは、**ソフトウェアデリバリの性能に負の影響を与える**ことが分かった。この種の公式承認プロセスを持つ組織の回答者は、**低性能である確率が2.6倍**だった）

> "we investigated whether a more formal approval process was associated with lower change fail rates and **we found no evidence to support this hypothesis**"
> （より公式な承認プロセスが変更失敗率の低下と結びついているかを調べたが、**この仮説を支持する証拠は見つからなかった**）

> "Organizations often respond to problems with software releases by introducing additional process and more heavyweight approvals. **Analysis suggests this approach will make things worse.**"
> （組織はしばしば、リリースの問題に対して追加のプロセスとより重い承認を導入して応じる。**分析は、この方法が事態を悪化させることを示唆している**）

**DORA が代わりに推すのは「左へ寄せる」ことである。**

> "organizations should '**shift left**' to **peer review-based approval during the development process**. In addition to peer review, **automation can be leveraged to detect, prevent, and correct bad changes much earlier** in the delivery lifecycle."
> （組織は「左へ寄せ」、開発工程の中でのピアレビューに基づく承認へ移行すべきである。ピアレビューに加えて、**自動化を活用して、悪い変更をデリバリのライフサイクルのずっと早い段階で検出・防止・修正できる**）

### 出典

- Winters / Manshreck / Wright, *Software Engineering at Google*, Ch.20 "Static Analysis" — https://abseil.io/resources/swe-book/html/ch20.html
- GitHub Docs, "About protected branches" — https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- DORA / Google Cloud, *Accelerate: State of DevOps 2019*, pp. 49-51（"Heavyweight change process" / "What happens to the CAB in the continuous delivery paradigm?"）— 報告書自身が案内する公式の入口: https://cloud.google.com/devops ／ PDF: https://services.google.com/fh/files/misc/state-of-devops-2019.pdf

### このリポジトリへの含意

- **「検知する」と「不可能にする」は、実務では明確に別物として設計されている。** Norman の forcing function、新郷の統制型ポカヨケ、Google の presubmit、GitHub の required check は、いずれも**次の段階へ進ませない**。この組織の `org-check.py` は、Norman の分類ではどれにも当たらない（警告を出すだけ）。
- **Google は「警告を出し続ける」を選択肢から外している。** 出すならエラーにしてビルドを壊す、さもなくば表示しない。**この二択は、そのまま I-010 への設計上の問いになる。**
- **止める装置には成立条件がある。** 偽陽性10%未満（Google）、通常の行動を妨げすぎないこと（Norman）。**条件を満たさない forcing function は、意図的に無効化される**（Norman）。
- **ただし「人間が承認するゲート」は、測定された実務では逆効果である**（DORA）。効くのは**開発者自身のワークフローに埋まった自動チェック**であって、外部の人間の関門ではない。**この組織でいえば、「オーケストレーターが完了報告を審査する」を増やす方向は、実務の測定と逆行する。**

---

## 4. 測ることの副作用 — 遵守率を印字することのリスク

### 4.1 Goodhart の法則

**原典**（Charles Goodhart, 1975, "Monetary Relationships: A View from Threadneedle Street", *Papers in Monetary Economics*, Vol. 1, Reserve Bank of Australia）。

> "Any observed statistical regularity will tend to collapse once pressure is placed upon it for control purposes."
> （観測された統計的規則性は、**統制目的で圧力がかけられた途端に崩壊する傾向がある**）

**Marilyn Strathern による定式化**（1997, "'Improving ratings': audit in the British University system", *European Review* 5(3):305-321）。

> "When a measure becomes a target, it ceases to be a good measure."
> （**測度が目標になったとき、それは良い測度ではなくなる**）

**注記: Goodhart 1975 の原論文 PDF、および Strathern 1997 の原論文 PDF のいずれにも直接は到達できなかった。** 上記2つの逐語は、複数の査読論文・百科事典項目が一致して引用する形で確認したものである（例: https://pmc.ncbi.nlm.nih.gov/articles/PMC7901608/ ／ https://en.wikipedia.org/wiki/Goodhart%27s_law ）。**引用文そのものの一致は複数ソースで確認したが、原典ページに当たったわけではない。**

### 4.2 遵守を測ることが形骸化を生む — 実務文献の記述

**Dekker（*Safety Science* 2014, 査読論文）は、安全の官僚化がもたらす二次的効果を列挙しており、その中に「数字ゲーム」が名指しされている。**

> "secondary effects of bureaucratization include a reduced marginal yield of bureaucratic safety initiatives, a difficulty in predicting unexpected events, a shift to bureaucratic accountability, **quantification and 'numbers games,'** the occasional creation of safety problems that result from the application of fixed rules or bureaucratic safety systems, and the real and perceived constraints on organization members' personal freedom, diversity and creativity."
> （官僚化の二次的効果には、官僚的な安全施策の限界収穫の低下、予期せぬ事象の予測困難、官僚的アカウンタビリティへの移行、**定量化と「数字ゲーム」**、固定的な規則や官僚的な安全システムの適用によって時に安全問題そのものが生み出されること、そして組織成員の自由・多様性・創造性への実際のおよび認識上の制約が含まれる）

**同論文は、規則を増やすことそのものへの反証を、航空分野の一次観測から引いている**（Amalberti 2001）。

> "The rate of production of new guidance materials and rules in the European Joint Aviation Regulations is significantly increasing while the global aviation safety remains for years on a plateau at 10⁻⁶ (over 200 new policies/guidance/rules per year). **Since nobody knows really what rules/materials are really linked to the final safety level, the system is purely additive, and old rules and guidance material are never cleaned up.** No surprise, regulations become inapplicable sometimes, and aviation field players **exhibit more and more violations in reaction to this increasing legal pressure**."
> （欧州統一航空規則における新しい指針類・規則の生産速度は著しく増えているが、世界の航空安全は何年も 10⁻⁶ の水準で頭打ちのままである（年200超の新方針・指針・規則）。**どの規則・資料が最終的な安全水準に本当に結びついているのかを誰も本当には知らないため、システムは純粋に加算的であり、古い規則や指針資料が片付けられることは決してない。** 当然ながら、規制は時に適用不能になり、航空現場の当事者たちは**この増大する法的圧力への反応として、ますます多くの違反を示すようになる**）

**「遵守率を測ることが形骸化を生む」ことを正面から測定した実務文献としては、Bevan & Hood (2006) "What's measured is what matters: targets and gaming in the English public health care system" (*Public Administration* 84(3):517-538) が標準的に引かれる。** 同論文は、英国の医療制度における目標管理が、測定される部分への集中と、測定されない重要な目的からの乖離（gaming）を生んだことを示している。**ただし全文はペイウォールおよび 403 により取得できず、逐語引用は得られなかった。** 書誌: https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1467-9299.2006.00600.x ／ https://eprints.lse.ac.uk/16211/

### 出典

- Charles A.E. Goodhart, "Monetary Relationships: A View from Threadneedle Street", *Papers in Monetary Economics*, Vol. 1, Reserve Bank of Australia, 1975（**原典には到達できず**）
- Marilyn Strathern, "'Improving ratings': audit in the British University system", *European Review* 5(3):305-321, 1997（**原典には到達できず**）
- Sidney W.A. Dekker, "The bureaucratization of safety", *Safety Science* 70:348-357, 2014 — https://www.safetydifferently.com/wp-content/uploads/2014/08/BureaucratizationSafety.pdf
- René Amalberti, "The paradoxes of almost totally safe transportation systems", *Safety Science* 37(2-3):109-126, 2001（Dekker 2014 経由で引用）

### このリポジトリへの含意

- **「遵守率を印字する」を対策に選ぶなら、Goodhart の副作用を前提に置く必要がある。** 「証拠が書かれている率」を目標にした瞬間、**中身の無い証拠が書かれるようになる**。
- **これは仮説ではない。** Dekker が列挙する「数字ゲーム」、次節の「表面的遵守（surface compliance）」がまさにそれである。
- **測るなら、測度は「書かれているか」ではなく「書かれたもので完了条件が検証できるか」でなければならない。** 前者は形式で満たせるが、後者は満たしにくい。**ただし後者は機械では判定しにくいという、正面からのトレードオフがある。**

---

## 5. ルール自体を減らすという解

### 5.1 「規則が多いこと自体が遵守率を下げる」— 査読文献の記述

**Rae, Provan, Weber & Dekker (2018) は、これに "safety clutter"（安全の雑然物）という名前を与えている。**

> "Safety clutter is **the accumulation of safety procedures, documents, roles, and activities that are performed in the name of safety, but do not contribute to the safety of operations**."
> （安全の雑然物とは、**安全の名のもとに実行されるが、実際の運用の安全には寄与しない、手順・文書・役割・活動の蓄積**である）

**なぜ問題なのか。3つ挙げられている。**

> "Safety clutter is a problem because of **the opportunity cost of ineffective activity**, because **clutter results in cynicism and 'surface compliance,'** and because **clutter can hamper innovation and get in the way of getting work done**."
> （雑然物が問題なのは、**効果の無い活動の機会費用**のため、**雑然物が冷笑と「表面的遵守」を生む**ため、そして**雑然物が革新を妨げ、仕事を進める邪魔になる**ためである）

**生成の機構は3つ**: duplication（重複）、generalization（一般化）、over-specification（過剰な仕様化）。

**「表面的遵守（surface compliance）」が、I-010 が観測している状態の名前である。** 規約は存在し、形式上は満たされているように見えるが、実質が伴っていない。

**前節で引いた Amalberti の観測（規則が加算的にしか増えず、古い規則が片付けられないため、違反がむしろ増える）も、同じ結論を別の側から支持している。**

**Hale & Borys (2013) は、規則管理の2つのパラダイムを対比している**（Model 1: 上意下達で規則は静的・包括的な制約、違反は抑圧すべき悪 ／ Model 2: 現場発で規則は動的・局所的な構築物、能力とは規則を現実へ適応させる力）。両者から引き出す枠組みの中心に置かれているのは、**規則の監視と適応、規則作りへの作業者の参加、対話を通じた規則の更新**である。**原論文の全文には到達できず、逐語引用は得られなかった。**

### 5.2 チェックリストにおける項目数の上限

**航空（FAA の公式 Advisory Circular）— 数値の上限は定めていないが、「全部載せない」ことが設計原理として明記されている。**

> "For most normal procedures on the flight deck, a '**flow**' is conducted as a sequence of actions **done from memory** to configure the aircraft and its systems. The flow is followed by **a checklist containing a subset of items from the flow that may be the most critical items within that flow and items that confirm the flow was done correctly**."
> （操縦室での大半の通常手順では、まず「フロー」として、航空機とそのシステムを設定する一連の動作を**記憶から**行う。フローの後にチェックリストが続くが、それは**フローの中の項目の部分集合であり、そのフローの中で最も重要な項目と、フローが正しく行われたことを確認する項目からなる**）

**これは、Gawande が "do-confirm" と呼ぶ型そのものである**（先に記憶で作業し、一時停止点でリストを使って抜けを確認する）。**FAA の文書自体は "do-confirm" / "read-do" という語を使っていない。**

> "The probability of interruptions and distractions **increases with checklist length and the time it takes to execute it**. Thus, even though checklists mainly contain critical items, these could be prioritized, and those with higher importance could be placed first on the checklist."
> （中断と注意散漫の確率は、**チェックリストの長さと、それを実行するのにかかる時間とともに増加する**。したがって、チェックリストが主に重要項目を含んでいるとしても、それらは優先順位づけができ、重要度の高いものをリストの先頭に置ける）

**さらに FAA は、チェックリストが「いつ起動されるか」を設計項目として扱っている。**

> "The initiation of a checklist is **best anchored in a clear cue that cannot be easily removed, obstructed, or forgotten**... However, such 'floating' checklist initiations **create a high risk of failing to initiate the checklist on time and thus having to rush through it, or failing to initiate the checklist altogether**."
> （チェックリストの起動は、**容易に取り除かれず、妨げられず、忘れられない明確な合図に結びつけるのが最善である**……しかし、このような「浮いた」起動は、**時間どおりに起動できず急いで済ませることになる、あるいはそもそも起動しないという高いリスクを生む**）

**医療（WHO Surgical Safety Checklist）— 19項目、3つの一時停止点。設計方針が明記されている。**

> "**This checklist is not intended to be comprehensive.** Additions and modifications to fit local practice are encouraged."
> （**このチェックリストは網羅的であることを意図していない。** 現地の実務に合わせた追加と修正が推奨される）

> "The Checklist was also designed **for simplicity and brevity**."
> （チェックリストは**単純さと簡潔さ**を旨として設計された）

**誰が回すかを、WHO は明示的に1人へ固定している。**

> "In order to implement the Checklist during surgery, **a single person must be made responsible for performing the safety checks on the list.** This designated **Checklist coordinator** will often be a circulating nurse, but it can be any clinician participating in the operation."
> （手術中にチェックリストを実施するため、**リスト上の安全確認を行う責任者を1人定めなければならない。** この指名されたチェックリスト調整役は、多くの場合は外回り看護師だが、手術に参加する臨床医であれば誰でもよい）

> "In each phase, **the Checklist coordinator must be permitted to confirm that the team has completed its tasks before it proceeds onward.**"
> （各段階で、**チェックリスト調整役は、チームが次へ進む前にその段階の作業が完了したことを確認できる権限を与えられていなければならない**）

**そして、削ることには歯止めがかけられている。**

> "**removing safety steps because they cannot be accomplished in the existing environment or circumstances is strongly discouraged.**"
> （既存の環境や状況では実施できないという理由で安全ステップを削除することは、**強く推奨されない**）

**「5〜9項目」「60〜90秒」という具体的な上限は、Gawande『The Checklist Manifesto』(2009) 第6章での Boeing の Daniel Boorman の発言として広く引かれているが、書籍本文に到達できなかった。** 複数の書籍要約サイトが一致して伝える内容は次のとおり（**すべて二次情報である**）。

- チェックリストは短く、**5〜9項目**にとどめる（作業記憶の限界）
- 一時停止点で **60〜90秒**を超えると、チェックリストは他のことからの注意散漫になる
- "Bad checklists are vague and imprecise. They are too long; they are hard to use; they are impractical."

**Gawande の New Yorker 記事 "The Checklist"（2007年12月10日）の全文は取得できたが、read-do / do-confirm の区別も項目数の上限も、この記事には含まれていない。** これらは2009年の書籍側の内容である。

### 出典

- Rae A.J., Provan D.J., Weber D.E., Dekker S.W.A., "Safety clutter: the accumulation and persistence of 'safety' work that does not contribute to operational safety", *Policy and Practice in Health and Safety* 16(2):194-211, 2018 — https://www.tandfonline.com/doi/full/10.1080/14773996.2018.1491147 （**全文は 403。抄録の記述に基づく**）
- Hale A., Borys D., "Working to rule, or working safely? Part 1 / Part 2", *Safety Science* 55:207-221 / 222-231, 2013 — https://www.sciencedirect.com/science/article/abs/pii/S0925753512001312 （**全文には到達できず**）
- FAA, *Advisory Circular AC 120-71B: Standard Operating Procedures and Pilot Monitoring Duties for Flight Deck Crewmembers*（2017年1月10日）, 第5章 — https://www.faa.gov/documentlibrary/media/advisory_circular/ac_120-71b.pdf
- WHO, *Implementation Manual WHO Surgical Safety Checklist 2009*（WHO Guidelines for Safe Surgery 2009）— https://www.leapfroggroup.org/sites/default/files/Files/Implementation%20manual%20WHO%20surgical%20safety%20checklist%202009.pdf ／ NCBI 版: https://www.ncbi.nlm.nih.gov/books/NBK143235/
- Atul Gawande, "The Checklist", *The New Yorker*, 2007年12月10日 — https://lchc.ucsd.edu/cogn_150/Readings/gawande_checklist.pdf
- Atul Gawande, *The Checklist Manifesto: How to Get Things Right*, Metropolitan Books, 2009（**本文の逐語は取得できなかった**）

### このリポジトリへの含意

- **「規約を足すと同じ運命をたどる」という I-010 の警告は、実務側の知見と一致している。** safety clutter の「表面的遵守」、Amalberti の「加算的にしか増えない規則と、それに反応して増える違反」がそれである。
- **チェックリストの実務は、「全部を載せない」ことを原理にしている。** FAA は「フローの中で最も重要な項目の部分集合」、WHO は「網羅的であることを意図していない」と明記する。**この組織のタスク別ファイルの節（完了条件／判断してよい範囲／変更範囲／禁止事項／停止条件／連絡してよい相手／申し送り……）が、この原理を満たしているかは検討に値する。**
- **WHO は「1人の調整役」と「その人が次へ進むのを止められる権限」を対にしている。** 権限のない確認役は機能しない、という設計判断である。
- **FAA の「起動の錨（Initiation Anchor）」は、この組織に直接効く。** 「浮いた起動」は**そもそも起動されないリスクが高い**。「担当の指摘を受領時に起票する」が9日間・約78件未起票なのは、**起動の合図が明確な事象に結びついていない**という形で説明できる。

---

## 6. 確認できなかったこと（一覧）

推測で埋めていない箇所を、ここにまとめる。

| # | 確認できなかったもの | 理由 |
| --- | --- | --- |
| 1 | CMMI Institute / ISACA の**現行版（V2.0 / V3.0）の Capability Level の公式定義** | cmmiinstitute.com が HTTP 403。代わりに SEI が公開した最後の完全版モデル（CMMI-DEV v1.3, 2010）を使った |
| 2 | ISO/IEC 33020:2019 の**評定尺度のパーセンテージ表の逐語** | 公開プレビュー PDF が8ページで切れている（表は次ページ）。細分値（P−/P+/L−/L+）は ISACA Journal 記事（二次情報）から。N と F の範囲は境界からの論理的帰結であり、規格本文で確認したものではない |
| 3 | Diane Vaughan *The Challenger Launch Decision*(1996) **本文のページ番号付き逐語** | 書籍本文にアクセスできる公開ソースが無い。代わりに Vaughan 本人の2008年インタビュー、CAIB 報告書第8章、査読論文（Banja 2010）を使った |
| 4 | Goodhart 1975 の**原論文**、Strathern 1997 の**原論文** | いずれも原典 PDF に到達できず。引用文の一致は複数の査読論文・百科事典で確認したが、原典ページには当たっていない |
| 5 | Bevan & Hood 2006（遵守率の測定が gaming を生む実証）の**全文・逐語** | Wiley / LSE eprints ともに 403 またはペイウォール |
| 6 | 新郷重夫『Zero Quality Control』の**本文の逐語**（統制型／警告型ポカヨケの原典定義） | 書籍本文にアクセスできる公開ソースが無い。二次情報の範囲にとどめた |
| 7 | Gawande『The Checklist Manifesto』の**本文の逐語**（5〜9項目、60〜90秒、read-do / do-confirm の区別） | 書籍本文にアクセスできる公開ソースが無い。2007年の New Yorker 記事には**これらの内容が含まれていないことを確認した**（記事全文を取得して確認済み） |
| 8 | Rae et al. 2018「safety clutter」の**全文** | Taylor & Francis が 403。抄録の記述にとどめた |
| 9 | Hale & Borys 2013 の**全文・逐語** | ScienceDirect がペイウォール |
| 10 | FAA AC 120-71B における**チェックリスト項目数の数値上限** | **文書中に存在しないことを確認した。** 定めているのは「長さが増えると中断リスクが増える」という関係と、優先順位づけの推奨のみ |

---

## 7. この組織への含意

### この組織の I-010 への含意

#### 問1: 「規約が1本ある」ことを、何段で評価すべきか。各段の判定は何を証拠にするか

**実務の2つの成熟度モデル（CMMI / ISO/IEC 33020）が一致して示すのは、「定義したこと」「実行したこと」「逸脱に手を打つこと」「独立に確かめること」「測ること」が、それぞれ別の段だということである。** I-010 の「検討の材料」に書かれている3段（①中身 ②実行できる組織か ③遵守率）は、実務の段より粗い。**特に「逸脱に手を打つ」と「独立に確かめる」が抜け落ちている。**

規約1本を評価する段は、次の5段で置くのが実務と整合する。

| 段 | 実務の呼び名 | 判定の証拠（実務の言葉で） |
|---|---|---|
| **0. 定義** | ISO PA 3.1 *Process definition* ／ CMMI GG3 | プロセス記述に **entry criteria / activities / roles / measures / verification steps / exit criteria** が書かれている（CMMI: "A defined process clearly states the following"）。**規約文書が存在するだけではこの段にも足りない** |
| **1. 配備** | ISO PA 3.2 *Process deployment* | **役割・責任・権限が割り当てられ、伝達されている**。遂行者がそれを行う力量を持つ。必要な資源（道具）が**利用可能にされ、監視されている**。**つまり「誰が・何を使って・いつ」が具体的に決まっているか** |
| **2. 遂行** | CMMI GG1 *Performed* ／ ISO Level 1 | プロセスが**その目的を達成している**。証拠は成果物の存在 |
| **3. 管理** | CMMI GG2 *Managed* ／ ISO Level 2 | **逸脱したときに是正措置が取られている**（CMMI: "Corrective actions are taken when the actual results and execution deviate significantly from the plan"）。証拠は**是正の記録**であって、逸脱の検知記録ではない |
| **4. 保証** | CMMI GP 2.9 *Objectively Evaluate Adherence* ／ ISO PA 3.3 | 遵守が**遂行者以外**によって客観的に評価され、不適合が**クローズまで追跡されている**（ISO PA3.3 d: "action is taken on any nonconformity... and **tracked to closure**"） |
| **5. 測定** | ISO Level 4 *Predictable* ／ PA 4.1 | 定量目標が定義され、測定結果が**収集・検証・報告**されている |

**この物差しを当てると、I-010 が観測した7件はすべて段3（管理）に達していない。** 「`## 証拠` 71%空」は、段2（遂行）の達成率が29%、すなわち ISO の評定尺度では **P−〜P+（Partially achieved）の境目**にあたる。「引き継ぎ記録が8セッション・464行」は段0（定義）はあるが段1（配備）が無い——**誰が上書きを行うかの役割が割り当てられ伝達されていない。**

**そして「規約が1本ある」だけの状態は、上の表のどの段にも該当しない。** 段0ですら、entry/exit criteria と verification steps が要る。

#### 問2: 警告50件が9日放置されている状態は、実務の言葉で何と呼ばれるか。処方箋は何か

**2つの名前がつく。どちらも確立した用語である。**

- **出す側から見て: alert fatigue / alarm fatigue（警告疲れ）** — "when a high number of irrelevant alerts leads users to habitually override them"（JAMIA 2019）。The Joint Commission が "constant barrage of noise" と呼び、**アラーム関連の重大事故98件中80件が死亡に至った**分野の、最も一般的な寄与要因として名指ししている
- **守る側から見て: normalization of deviance（逸脱の常態化）** — "people within the organization become so much accustomed to a deviant behaviour that they don't consider it as deviant"（Vaughan）。CAIB の言い方では "evidence that the design was not performing as expected **was reinterpreted as acceptable and non-deviant**"
- **結果として現れる状態: surface compliance（表面的遵守）** — "clutter results in cynicism and 'surface compliance'"（Rae et al. 2018）

**実務が挙げる処方箋は、共通して「もっと強く警告する」ではない。**

| # | 処方箋 | 出所 |
|---|---|---|
| 1 | **警告の件数そのものを減らす。** 行動を要さないものを出さない | Joint Commission SEA 50（85〜99%は介入不要という推計が不応の原因）／ Google（"don't show it in compiler output"） |
| 2 | **リスクで段を分ける（tiering）。** 却下のリスクを警告自身が示す | JAMIA 2019 |
| 3 | **その場で直せる操作を与える。** 全部やり直させない | JAMIA 2019 |
| 4 | **誰が応答するかを役割として決める**（role tailoring / 単一の調整役） | JAMIA 2019 ／ WHO（Checklist coordinator）／ CMMI GP 2.9（遂行者以外が評価） |
| 5 | **不適合をクローズまで追跡する**（検知でなく閉じるまで） | ISO/IEC 33020 PA 3.3 (d) |
| 6 | **起動の合図を、取り除けない明確な事象に結びつける** | FAA AC 120-71B 5.1.5（"floating" な起動は、そもそも起動されないリスクが高い） |
| 7 | **弱い信号に早期に注意を払い、独立した継続的な監督を置く** | Banja 2010 ／ CAIB |

**「毎セッション50件を印字する」は、上の1番と正面から衝突している。** 件数を減らすこと自体が対策である。

#### 問3: 「止める（機械が通さない）」と「測る（遵守率を印字する）」の、どちらが効くとされているか

**実務は「止める」を強く推す。ただし条件つきであり、条件を外すと両方とも壊れる。**

**止めるほうが効くとする根拠（一次情報）**

- Norman: forcing function は "situations in which the actions are constrained so that **failure at one stage prevents the next step from happening**"。**検知ではなく、次へ進ませないこと**が定義である
- Google: "**We have found repeatedly that developers ignore compiler warnings.** We either enable a compiler check as an error (and break the build) or don't show it in compiler output." — **「警告を出し続ける」が選択肢から外されている**
- Google: 表示するだけの静的解析は "developers can choose to ignore" ため、**コミットをブロックする presubmit check** を別に用意している
- GitHub: required status checks は、通るまで**マージそのものができない**
- 新郷（二次情報）: 統制型ポカヨケは**人間の警戒心を必要としない**ため、警告型より強い

**止めることの副作用（これも一次情報）**

- Norman: "**Forcing functions can be a nuisance in normal usage. The result is that many people will deliberately disable the forcing function**, thereby negating its safety feature." — **邪魔になれば、人は無効化する**
- Google: 偽陽性が **10%を超えると信用を失う**。"who wants to wade through hundreds of false reports in search of a few true ones?"
- **DORA: 「止める」を人間の承認で実装すると逆効果。** 外部主体（CAB や上級管理者）の承認を要求する組織の回答者は、**低性能である確率が2.6倍**。変更失敗率が下がる証拠は**見つからなかった**。"Organizations often respond to problems with software releases by introducing additional process and more heavyweight approvals. **Analysis suggests this approach will make things worse.**"

**測ることの副作用（一次情報）**

- Goodhart / Strathern: "When a measure becomes a target, it ceases to be a good measure."
- Dekker 2014: 官僚化の二次的効果に **"quantification and 'numbers games'"** が含まれる
- Rae et al. 2018: 雑然物は **cynicism と surface compliance** を生む
- Amalberti 2001: 規則が加算的にしか増えないと、**当事者はむしろ違反を増やす**

**したがって、この組織にとっての答えは次の形になる。**

1. **「止める」を採る。ただし人間の承認ゲートとしてではなく、担当エージェント自身のワークフローの中の自動チェックとして置く。** DORA の言う "shift left"。オーケストレーターの審査を増やす方向は、測定された実務と逆行する。
2. **止める対象は、偽陽性が10%未満に保てるものだけに絞る。** 保てないものは、Google の二択に従えば**表示しない**側に倒す。
3. **測るなら、測度が目標になったときに何が起きるかを先に書いておく。** 「証拠が書かれている率」を目標にすれば、中身の無い証拠が書かれる。
4. **どちらを採るにせよ、「不適合をクローズまで追跡する」経路が無ければ、段3（管理）には到達しない。** 検知の強化でも測定の強化でもなく、**閉じる経路があるかどうか**が分かれ目である。

**最後に、規約を足さないという I-010 自身の方針は、実務側からも支持される。** safety clutter の3つの生成機構（重複・一般化・過剰な仕様化）と、Amalberti の「古い規則は決して片付けられない」は、**規約を足す対策が必ず払うことになるコスト**を名指ししている。**FAA と WHO のチェックリスト設計が一致して採っているのは、「全部載せる」ではなく「最も重要な部分集合だけを載せる」である。**

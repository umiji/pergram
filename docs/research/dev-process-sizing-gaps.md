# 前回調査の「確認できなかったこと」を取りに行った記録

- 調査日: 2026-09-12
- 位置づけ: [dev-process-sizing.md](dev-process-sizing.md) の **§7「確認できなかったこと（一覧）」に挙がった5件**を、別経路で取りに行った追補である。前回調査の本体を置き換えるものではない
- 方針: 前回と同じ。一次情報（原典・規格本文・著者本人の文章）に当たる。**当たれなかった論点は「確認できなかった」と明記し、推測で埋めない**

**この文書も調査結果であって、規約ではない。** ここから何を採るかは別に決める。

## 今回、前回と何が違ったのか

前回の5件のうち3件は「PDF から本文を抽出できなかった」「有償・403 だった」という**取得手段の問題**で落ちていた。今回は次の3経路が開いた。

| 経路 | 何が取れたか |
| --- | --- |
| `pdftotext`（この実行環境に入っていた） | Fowler の IEEE Software 論文の**全文**。ISO/IEC/IEEE 29119 の**規格本文**（第1版, 2013）全4部 |
| **SEVOCAB**（ISO/IEC JTC1/SC7 と IEEE Computer Society が運営する公式用語データベース） | `risk` / `risk exposure` / `level of risk` / `risk-based testing` の**現行の規格定義と、その出典規格・箇条番号** |
| Kent Beck のニュースレターの**アーカイブ API** | 書籍の各章が連載された際の**投稿題名の全件**と、**無料公開されている回の本文** |

**SEVOCAB は、出典を明記する条件で定義の複製を明示的に許諾している。** 以下の規格定義の引用はこれに依拠する。

---

## 1. ISO/IEC/IEEE 29119 の「リスク」の定義 — 規格は「影響 × 発生可能性」を定義として持っていない

### 結論を先に

**「リスク＝影響 × 発生可能性」という定式は、ソフトウェアテスト規格の本文の定義としては存在しない。** 規格が定義しているのは別の言い方であり、「影響と発生可能性」は**定義ではなく、リスクエクスポージャを割り当てる際の例示**として、しかも `such as`（〜など）付きで現れる。

### 1-1. 規格が自分で定義しているリスク関連の用語は3つだけ

ISO/IEC/IEEE 29119-1:2013（第1版）の箇条4（Terms and definitions）の本文を直接確認した。**`risk` 単体・`risk level`・`risk exposure` は、この箇条に定義が無い。** 定義されているのは次の3つである。

> **4.30 product risk** — "risk that a product may be defective in some specific aspect of its function, quality, or structure"
> （製品リスク：製品が、その機能・品質・構造の何らかの特定の側面において欠陥を持ちうるというリスク）

> **4.31 project risk** — "risk related to the management of a project"
> （プロジェクトリスク：プロジェクトの管理に関連するリスク）
> EXAMPLE: "Lack of staffing, strict deadlines, changing requirements."

> **4.35 risk-based testing** — "testing in which the management, selection, prioritisation, and use of testing activities and resources are consciously based on corresponding types and levels of analyzed risk"
> （リスクベースドテスト：テスト活動とテスト資源の管理・選択・優先順位づけ・使用が、分析されたリスクの**種類と水準**に対応して意識的に基づいているようなテスト）

**どこにも「影響 × 発生可能性」は無い。** 規格が言っているのは「分析されたリスクの**種類と水準**に基づく」までである。

さらに、この箇条には**定義を外部へ委ねる旨が明記されている**。

> "The systems and software engineering Vocabulary ISO/IEC/IEEE 24765 should be referenced for terms not defined in this clause."
> （この箇条で定義されていない用語については、システム及びソフトウェア工学用語集 ISO/IEC/IEEE 24765 を参照すること）

つまり**規格は `risk` の定義を自分では持たず、外部の用語集に預けている。**

### 1-2. 全文検索の結果 — `likelihood` は1回しか出てこない

29119-1:2013 の全文（約3,700行）を機械的に検索した。

| 語 | 出現回数 | 備考 |
| --- | --- | --- |
| `likelihood` | **1回** | 定義ではない（下記） |
| `impact` | 6回 | いずれもリスクの算式ではない（「不具合の影響」等の一般的用法） |
| `risk exposure` | **0回** | |
| `risk level` | 1回 | 定義なし。「テスト対象のリスク水準に応じて」という用法 |

唯一の `likelihood` は、**算式ではなくテスト実行がリスクを下げる仕組みの説明**である。

> "Running test cases mitigates risk because if the test passes then the likelihood of the risk occurring is normally lower – and so the risk score is reduced. Similarly, if the test fails, the risk may increase."
> （テストケースを実行することはリスクを軽減する。テストが通れば、そのリスクが起きる可能性は通常下がり、したがってリスクスコアは下がるからである。同様に、テストが落ちればリスクは上がりうる）

### 1-3. 「影響と発生可能性」が実際に出てくる場所 — 規範的要求だが、あくまで例示

**29119-2:2013（Test processes。規範的＝適合を主張するなら従う必要がある部）** の箇条 7.2.4.3「Identify and Analyze Risks (TP3)」に、`shall`（〜しなければならない）付きで出てくる。

> **7.2.4.3 d)** "Each risk **shall** be assigned a level of exposure (**such as** by considering its impact and likelihood)."
> （各リスクには、エクスポージャの水準を割り当てなければならない（**たとえば**その影響と発生可能性を考慮することによって））

**`such as`（〜など）が入っていることが決定的である。** 規範的に要求されているのは「エクスポージャの水準を割り当てること」までで、**影響 × 発生可能性はその一手段として例示されているにすぎない。規格は算定方法を指定していない。**

続く箇条が、**リスクエクスポージャが何を決めるのか**を規定している。

> **7.2.4.4 a)** "Appropriate means of treating the risks **shall** be identified, based on the risk type, classification and level of risk exposure."
> NOTE: "Appropriate means could include test phases, test types, test design techniques, test completion criteria, etc."
> （リスクへの適切な対処手段は、リスクの種類・分類・エクスポージャの水準に基づいて特定されなければならない。注：適切な手段には、テストフェーズ、テストタイプ、テスト設計技法、**テスト完了基準**などが含まれうる）

そして**このリポジトリにとって最も重要な一文**が、同じ箇条の注記にある。

> "Where constraints (such as time and cost) on testing are known, the mitigations for risks with low risk exposure levels that are not expected to be treatable within these constraints **will be identified as being out of scope for that reason**."
> （テストに対する制約（時間や費用など）が判明している場合、エクスポージャ水準の低いリスクのうち、その制約の中で対処できる見込みのないものへの軽減策は、**その理由をもって対象外と特定される**）

**規格は、時間・費用の制約の下で低エクスポージャのリスクを「対象外」と明記して落とすことを、正規の手順として認めている。** 落とすこと自体ではなく、**落としたと記録すること**が要求である。

### 1-4. 現行版（第2版）でも定義は変わっていない

29119-1 は 2022年、29119-2 は 2021年に第2版が出ている。**第2版の本文は有償で、全文は取得できなかった**（ISO の公開プレビュー PDF は前付と用語 3.1〜3.63 までで、リスク関連の用語に届く前に切れている）。

ただし **SEVOCAB が現行版の定義を持っていた。**

> **risk-based testing** — "testing in which the management, selection, prioritization, and use of testing activities and resources are consciously based on corresponding types and levels of analyzed risk"
> 出典: **ISO/IEC/IEEE 29119-2:2021, 3.16**

2013年版との差は綴りだけ（`prioritisation` → `prioritization`）である。**第2版でも「影響 × 発生可能性」は定義に入っていない。**

### 1-5. では「リスク」はどこで、どう定義されているのか

SEVOCAB で引いた ISO/IEEE 系の正式定義は次のとおり。

| 用語 | 定義 | 出典 |
| --- | --- | --- |
| **risk** | "effect of uncertainty on objectives"（目的に対する不確かさの影響） | ISO/IEC/IEEE **16085:2021**（リスクマネジメント）3.5 / 15288:2023 3.39 / 12207:2026 3.1.47 |
| **risk exposure** | "potential loss presented to an individual, project, or organization by a risk"（あるリスクが個人・プロジェクト・組織にもたらす潜在的な損失） | ISO/IEC/IEEE **16085:2021**, 3.10 |
| **level of risk** | "magnitude of a risk or combination of risks, expressed in terms of the **combination** of consequences and their likelihood"（リスクまたはリスクの組合せの大きさ。結果とその発生可能性の**組合せ**として表される） | ISO/IEC/IEEE **15026-1:2025**（アシュアランス用語）3.3.5 |
| **risk level** | — | **該当する用語は存在しない** |

**3点、注意すべきことがある。**

1. **ISO/IEEE 系の `risk` の正式定義は「目的に対する不確かさの影響」であって、影響 × 発生可能性ではない**
2. **`risk exposure` の ISO/IEEE 定義も「潜在的な損失」であって、積の形をしていない**
3. **「積」という言い方が出てくるのは、ISO/IEEE ではなく PMBOK（米国 PMI の資料）側の注記だけだった**

> （PMBOK 版 `risk exposure` の注記）"Risk exposure is commonly defined as the product of a probability and the magnitude of a consequence, that is, an expected value or expected exposure."
> （リスクエクスポージャは一般に、確率と結果の大きさの**積**、すなわち期待値ないし期待エクスポージャとして定義される）

**「影響 × 発生可能性」という定式は、ISO/IEEE のソフトウェアテスト規格ではなく、プロジェクトマネジメント実務の語彙に由来している。** `level of risk`（15026-1）ですら「積」ではなく「**組合せ**（combination）」と書いている。

### 確認できなかったこと

- **29119-1:2022 / 29119-2:2021（第2版）の本文そのもの**は取得できていない。上記の規格本文の引用はすべて**第1版（2013）**である。第2版での `risk-based testing` の定義が不変であることは SEVOCAB 経由で確認したが、**箇条 7.2.4.3 / 7.2.4.4 の規範的要求が第2版でも同じ文言かは未確認である**
- SEVOCAB は `29119-1` 出典の `risk` 系の項目を持っていなかった。**第2版で 29119-1 自身がこれらを定義し始めた可能性は、否定できていない**

### 出典

- ISO/IEC/IEEE 29119-1:2013 本文（箇条4 用語 / 箇条5.4 Risk-based Testing） — https://wildart.github.io/MISG5020/standards/ISO-IEC-IEEE-29119-1.pdf
- ISO/IEC/IEEE 29119-2:2013 本文（箇条 7.2.4.3 / 7.2.4.4） — https://wildart.github.io/MISG5020/standards/ISO-IEC-IEEE-29119-2.pdf
- ISO/IEC/IEEE 29119-1:2022 公開プレビュー（目次・前付・用語 3.1〜3.63） — https://cdn.standards.iteh.ai/samples/81291/6694557ff8304df8841bb191a00ecc6f/ISO-IEC-IEEE-29119-1-2022.pdf
- **SEVOCAB**（ISO/IEC JTC1/SC7 + IEEE Computer Society 公式用語データベース） — https://pascal.computer.org/sev_display/index.action
- ISO/IEC/IEEE 29119-1:2022 書誌 — https://www.iso.org/standard/81291.html

### このリポジトリへの含意

- **前回 §2 の引用（「高・中・低の相対評価」「High-High に9倍を割かない」）は、規格本文ではなく作業部会サイトの解説記事だった。** 今回、規格本文そのものを確認した結果、**本文はリスクの算定方法を指定していない**ことが分かった。「影響 × 発生可能性で測れ」は規格の要求ではない。**この組織が独自の測り方を採っても規格に反しない**
- 規格が実際に要求しているのは3つだけである: **(1) リスクを特定する / (2) エクスポージャの水準を割り当てる / (3) その水準に基づいて対処手段（テストの種類・技法・完了基準）を決める。** 算定式は自由
- **「時間・費用の制約により、低エクスポージャのリスクは対象外」と書いて落とすことが、規格上の正規の手順である。** タスク別ファイルに「なぜ薄いテストで足りるのか」を1行書く欄を作れば、それがそのまま規格の言う記録になる
- **`risk level` は規格用語として存在しない。** 使うなら `risk exposure`（潜在的損失）のほうが規格語彙に合う

---

## 2. Kent Beck『Tidy First?』— 本文は取れなかったが、著者本人の無料公開から判断規則は取れた

### 前置き — 何が取れて、何が取れなかったか

**書籍本文は今回も取得できなかった**（O'Reilly は Akamai の 403 で、ブラウザの User-Agent を付けても通らない）。

代わりに、**Beck が書籍を執筆しながら各章を自分のニュースレターに連載していた**ことが分かり、アーカイブから次の2つが取れた。

1. **連載時の投稿題名の全件**（有料回も題名だけは公開されている）
2. **無料公開されている回の本文**（構成・理論の骨子・判断規則を含むものが複数あった）

> ⚠️ **以下の引用はすべて、刊行された書籍の本文ではなく、「書籍になる前の、著者本人による連載原稿・構想メモ」である。** 刊行時に加筆修正されている可能性があり、**書籍の確定した本文としては扱えない。** この区別は最後まで維持する。

### 2-1. 章の構成（連載時の題名から）

Part 単位の構成は前回判明済み（Part I Tidyings p.1 / Part II Managing p.33 / Part III Theory p.55 / 全124ページ）。今回、その中身に対応する連載題名が取れた。

| Part | 連載時の題名 |
| --- | --- |
| **I. Tidyings**（整理の手口） | Guard Clause / Dead Code / Delete Redundant Comment / Add Comment / Normalize Symmetries / Cohesion Order / Explicit Parameters / Explaining Variable / Explaining Constant / Chunk Statements / New Interface, Old Implementation / Extract Helper / One Pile / Reading Order / Move Declaration & Initialization Together |
| **II. Managing**（運用） | Separate Tidying / Chaining / Batch Sizes / Rhythm / Getting Untangled / **First, After, Later, Never** |
| **III. Theory**（理論） | Structure & Behavior / **Reversible Structure Changes** / Constantine's Equivalence / Economics: Time Value & Optionality / A Dollar Today > A Dollar Tomorrow / Options / Options Versus Cash Flows / Beneficially Relating Elements / Coupling / Cohesion / Conclusion |

**Part III に `Reversible Structure Changes`（可逆な構造変更）という章がある**ことが、今回の最大の収穫である（後述）。

### 2-2. Part III（Theory）の全体像 — 著者本人による骨子

**2022年6月7日の投稿「Theory Outline」は全文無料で公開されており**、Part III になる理論の全項目が著者自身の言葉で並んでいる。

> "**Structure & behavior changes.** Structure & behavior changes are fundamentally different. Treat them separately."
> （構造の変更と振る舞いの変更は、根本的に別物である。別々に扱え）

> "**Reversibility.** The key difference is reversibility. Structure changes are (usually) cheaply reversible. Behavior changes are (usually) not."
> （**その違いの核心は可逆性である。構造の変更は（通常）安く巻き戻せる。振る舞いの変更は（通常）巻き戻せない**）

> "**Constantine's Equivalence.** cost(software) ~= cost(change) ~= cost(big changes) ~= coupling. So cost(software) ~= coupling. The first purpose of software design is managing the cost of software development."
> （ソフトウェアのコスト ≒ 変更のコスト ≒ 大きな変更のコスト ≒ 結合度。ゆえにソフトウェアのコスト ≒ 結合度。ソフトウェア設計の第一の目的は、開発コストを管理することである）

> "**Coupling with respect to changes.** We don't care about most coupling. We care about the coupling triggered by the behavior changes we *actually* want to make."
> （**結合度の大半はどうでもよい。気にすべきは、実際に行いたい振る舞いの変更が引き起こす結合だけである**）

> "**Coupling/decoupling tradeoff.** The fundamental tradeoff is between the cost of coupling & the cost of decoupling (wrt the changes we actually discover that we want to make). Drive too far up either curve & the cost escalates."
> （根本的なトレードオフは、結合のコストと脱結合のコストの間にある。**どちらの曲線も、登りすぎればコストが跳ね上がる**）

> "**Optionality.** ... Main point being that options *increase* in value as uncertainty increase."
> （要点は、**不確実性が増すほどオプションの価値は上がる**ということ）

> "**Cohesion.** Coupling can be hard to reduce. Cohesion is almost always easy to increase."
> （結合度を下げるのは難しいことがある。凝集度を上げるのは、ほとんどいつでも簡単である）

**「可逆性」が構造／振る舞いの区別の核心に置かれている**ことが、著者の言葉ではっきり確認できた。前回調査が別々の軸として並べていた「不可逆性（Bezos）」と「変更の種類（Beck）」は、**Beck 自身の中では同じ一つの軸である。**

### 2-3. 「いつ整理するか」の判断規則 — 決め手は規模ではなく「遅れのコスト」

**First / After / Later / Never の各章そのものは有料**で、本文は取得できなかった（無料で読めるのは `Never` の理由の一文までで、前回調査の到達点と同じ）。

ただし、**同じ論点を扱った無料回「Tidying Versus Sooner」（2022年8月8日）に判断規則が明示されていた。決め手は遅れのコスト（cost of delay）である。**

> "Let's start the discussion with the cost of delay. The exchange rate from minutes to dollars varies wildly. Saving a demo during a critical sales call can mean the difference between company survival & ummm not survival. ... Another example of high cost of delay is a production incident."
> （議論は遅れのコストから始めよう。分から金への交換レートは激しく変動する。重要な商談中のデモを救うことが、会社が生き延びるか否かの差になりうる。…遅れのコストが高いもう一つの例は、本番障害である）

> "**In such extreme scenarios, don't tidy first unless you have no alternative. Don't tidy after until the price of minutes drops back to normal.** Changing the behavior of the system is by far the priority."
> （**そうした極端な場面では、他に手が無いのでない限り、先に整理するな。分の値段が通常に戻るまでは、後から整理するのもするな。** システムの振る舞いを変えることが圧倒的に優先である）

> "How about situations where the cost of delay is high, but not obscene? ... **Tidying first is still likely called for.** Remember, we're talking about minutes, maybe up to an hour, when we're talking about tidying."
> （遅れのコストが高いが法外ではない場面はどうか。…**それでも先に整理するのが妥当だろう。** 整理と言っているのは数分、長くて1時間の話であることを思い出してほしい）

> "**For any less intense cost-of-delay situation, time & tidying don't interfere.** It's still up to you to limit your tidying to tidying required to make the next behavior change. **A week of tidying is nonsense, even a day.**"
> （**それより緩い遅れのコストの場面では、時間と整理は干渉しない。** ただし整理は、次の振る舞いの変更に必要な分に限るのが前提である。**1週間の整理はナンセンスだし、1日でもそうだ**）

> "So, tidying versus sooner? **Not a thing except in emergencies.**"
> （整理か早さか？ **緊急時を除けば、そもそも対立していない**）

**判定軸は「変更の大きさ」ではなく「いま分が何ドルに相当するか」である。** そして**整理の側には上限が置かれている**（数分〜1時間。1日でも長すぎる）。

### 2-4. 経済性 — 振る舞いの変更＝現金、構造の変更＝オプション

無料回「Behavior Change = Revenue Versus Structure Change = Option」（2022年9月13日）が、Part III の経済性の骨子を示している。

> "the economic value of a system is the sum of: Its discounted cash flows as of today. Options on creating future cash flows."
> （システムの経済価値は次の和である：今日時点の割引キャッシュフローと、将来のキャッシュフローを生むオプション）

> "**every behavior change is a potential source of cash**, either through higher revenue or lower costs. Behavior changes can also reduce optionality by making the next behavior change harder/riskier/more expensive."
> （**振る舞いの変更はすべて、収益増かコスト減を通じた潜在的な現金源である。** 同時に、次の振る舞いの変更を困難・高リスク・高コストにすることで、オプション性を減らしうる）

> "**Structure changes, on the other hand, always (should) increase optionality. Structure changes are never a direct source of revenue.**"
> （**一方、構造の変更は常に（あるべき姿としては）オプション性を増やす。構造の変更が直接の収益源になることは決してない**）

また、書籍から**落とされた**章の草稿「Discarded Chapter: Time Value of Money」（2022年8月18日、無料）に、**規模の指標そのものを否定する一節**があった。

> "What the system *is* is irrelevant. It's a payment system. It consists of umpteen services. **It has 1.4 million lines of code.** ... But none of this matters to me as a purchaser."
> （システムが**何であるか**は関係ない。決済システムである。無数のサービスからなる。**140万行ある。**…だが買い手にとって、そのどれも重要ではない）

> "**dollars without dates are as worthless as 'lines of code per day' or any other bullshit metric.**"
> （**日付のないドルは、「1日あたりの行数」やその他のでたらめな指標と同じくらい無価値である**）

### 確認できなかったこと

- **刊行された書籍『Tidy First?』の本文は、今回も一切取得できなかった。** 上記はすべて**刊行前の連載原稿・構想メモ**であり、確定稿ではない
- **First / After / Later / Never の各分岐の判定基準の本文**は、依然として有料購読の内側にある。今回引いた「遅れのコスト」の規則は**別の回からのもの**であって、当該章そのものの記述ではない
- **章題は「連載時の投稿題名」であって、刊行された書籍の目次そのものではない。** 対応しているとみられるが、照合する手段が無かった（出版社の目次ページが 403 のため）
- Part III が提示する**具体的な計算式**の有無は確認できていない。連載の骨子に式らしきものは `cost(software) ~= coupling` のみである

### 出典

- Kent Beck, "Theory Outline"（2022-06-07, **無料**） — https://newsletter.kentbeck.com/p/theory-outline
- Kent Beck, "Tidying Versus Sooner"（2022-08-08, **無料**） — https://newsletter.kentbeck.com/p/tidying-versus-sooner
- Kent Beck, "Behavior Change = Revenue Versus Structure Change = Option"（2022-09-13, **無料**） — https://newsletter.kentbeck.com/p/behavior-change-revenue-versus-structure
- Kent Beck, "Discarded Chapter: Time Value of Money"（2022-08-18, **無料**） — https://newsletter.kentbeck.com/p/discarded-chapter-time-value-of-money
- Kent Beck, "TF? Book Outline"（2022-01-29, **無料**） — https://newsletter.kentbeck.com/p/tf-book-outline
- Kent Beck, "First, After, Later, Never"（2022-07-29, **有料**・冒頭のみ） — https://newsletter.kentbeck.com/p/first-after-later-never
- 連載アーカイブ（題名一覧の取得元） — https://newsletter.kentbeck.com/archive
- 書誌・Part 構成 — https://books.google.com/books/about/Tidy_First.html?id=-2ndEAAAQBAJ

### このリポジトリへの含意

- **前回の「構造変更タスクに TDD を適用するのは筋が悪い」という結論は、著者本人の言葉で裏づけられた。** 「構造の変更は安く巻き戻せる／振る舞いの変更は巻き戻せない」が根拠である。巻き戻せる変更に、落ちるテストを先に書く手順は要らない
- **整理には上限がある。「1週間の整理はナンセンス、1日でもそう」。** この組織が構造変更タスクに設計工程を回しているなら、それは Beck の想定する整理の粒度を大きく超えている
- **「遅れのコスト」が判定軸として使える。** pergram は検証フェーズにあり、遅れのコストが高い局面にある。Beck の規則に素直に従えば、**いまは整理を後回しにしてよい**（ただし「次の振る舞いの変更に必要な整理」は例外）
- **`Reversible Structure Changes` という章の存在は、Bezos の Type 1 / Type 2 と Beck の構造／振る舞いが同じ軸であることを示している。** 前回 §6 が並べた4つの軸のうち、**1番目（不可逆性）と4番目（変更の種類）は独立ではない**

---

## 3. 「アーキテクチャとは変更が高くつく決定である」— 原典を全文入手した

### 結論を先に

前回「逐語は見つけられなかった／Fowler の言葉として引用する根拠は無い」とした件は、**IEEE Software の原論文の全文を抽出できたため完全に解決した。** 結論は3点である。

1. **"hard to change"（変更が難しい）という定式は、確かに Fowler 自身が書いている。** ただし通俗的な引用とは言い方が違う
2. **その元になった定義は Ralph Johnson のもの**で、Fowler は明示的に "Johnson's secondary definition" と呼んでいる
3. **決定的に重要な点として、Fowler の論旨はこの定式を擁護していない。むしろ「アーキテクチャを無くせ」である**

### 3-1. Ralph Johnson の投稿 — Fowler は「よすぎるので全部引用する」と書いている

論文冒頭で、Fowler は Extreme Programming メーリングリストの Ralph Johnson の投稿を丸ごと引用している。

> "Understanding came to me after reading a posting from Ralph Johnson on the Extreme Programming mailing list. **It's so good I'll quote it all.**"
> （理解は、Extreme Programming メーリングリストの Ralph Johnson の投稿を読んで訪れた。**あまりによいので全部引用する**）

その引用の中に、**よく引かれる2つの文がどちらも入っている。つまりこれらは Fowler ではなく Johnson の言葉である。**

> "There is another style of definition of architecture which is something like 'architecture is the set of design decisions that must be made early in a project.' I complain about that one, too, saying that **architecture is the decisions that you wish you could get right early in a project, but that you are not necessarily more likely to get them right than any other.**"
> （「アーキテクチャとは、プロジェクトの早い段階で下さねばならない設計上の決定の集合である」という別の型の定義がある。私はそれにも文句がある。**アーキテクチャとは、プロジェクトの早い段階で正しく決められたらいいのにと思う決定のことだ。だが実際には、他のどの決定より正しく決められる見込みが高いわけではない**）

> "Architecture is about the important stuff. Whatever that is."
> （アーキテクチャとは重要なものについてのものである。それが何であれ）

**前回 §4 が Fowler の Software Architecture Guide から引いていた "Architecture is about the important stuff. Whatever that is." は、Johnson の言葉である。** 前回の記述（Johnson の定義として紹介していた）と矛盾しない。

### 3-2. Fowler 自身の定式 — "hard to change" ではなく "**perceive as** hard to change"

論文後半の "Getting rid of software architecture" 節で、Fowler が Johnson の定義から自分の定式を導いている。

> "Remember Johnson's secondary definition: '**Architecture is the decisions that you wish you could get right early in a project.**' Why do people feel the need to get some things right early in the project? The answer, of course, is because they perceive those things as hard to change. So you might end up defining architecture as '**things that people perceive as hard to change.**'"
> （Johnson の第二の定義を思い出してほしい。「アーキテクチャとは、プロジェクトの早い段階で正しく決められたらいいのにと思う決定である」。なぜ人は、いくつかのことを早い段階で正しく決めたいと感じるのか。答えはもちろん、**それらを変更が難しいと知覚している**からである。そこで、アーキテクチャを「**人々が変更が難しいと知覚しているもの**」と定義することになるかもしれない）

**3点、通俗的な引用とずれている。**

- **"expensive to change"（高くつく）ではなく "hard to change"（難しい）**
- **"perceive"（知覚している）が入っている。** 客観的な性質ではなく、**人がそう思っているかどうか**である
- **"you might end up defining ..."（〜と定義することになるかもしれない）という留保付きの言い方**であり、Fowler はこれを自分の定義として宣言していない

### 3-3. 最も重要な点 — Fowler の論旨は「アーキテクチャを無くせ」

**この論文は「変更が難しいものには重い工程をかけよ」とは一言も言っていない。正反対である。**

Fowler は直後にデータベーススキーマの例を出す。「本番稼働後のスキーマ変更は難しいから早く正しく決めねばならない」という通念に対し、同僚がスキーマ変更とデータ移行を容易にする仕組みを作った事例を挙げてこう書く。

> "By doing this, he made it so that the database schema was no longer architectural. I see this as an entirely good thing because it let us better handle change."
> （こうすることで彼は、データベーススキーマをアーキテクチャ的なものでなくした。**変更にうまく対処できるようになったのだから、これは全面的によいことだと私は考える**）

そして論文は次の一文で終わる。

> "I think that one of an architect's most important tasks is to **remove architecture by finding ways to eliminate irreversibility in software designs.**"
> （アーキテクトの最も重要な仕事の一つは、**ソフトウェア設計から不可逆性を取り除く方法を見つけることによって、アーキテクチャを無くすことである**と私は考える）

この結論は、経済学者 Enrico Zaninotto の議論を受けたものである。

> "his comment that **irreversibility was one of the prime drivers of complexity.** He saw agile methods, in manufacturing and software development, as **a shift that seeks to contain complexity by reducing irreversibility**"
> （**不可逆性は複雑さの主要な駆動要因の一つである**という彼の指摘。彼はアジャイルな手法を、製造業でもソフトウェア開発でも、**不可逆性を減らすことで複雑さを封じ込めようとする転換**と見ていた）

Johnson も、Fowler への返信で同じ方向を向いている。

> "**There is no theoretical reason that anything is hard to change about software.** If you pick any one aspect of software then you can make it easy to change, but we don't know how to make everything easy to change. Making something easy to change makes the overall system a little more complex, and making everything easy to change makes the entire system very complex. **Complexity is what makes software hard to change.**"
> （**ソフトウェアについて、何かが変更困難であるべき理論的な理由は存在しない。** ソフトウェアのどの側面であれ、一つ選べば変更容易にできる。ただし、すべてを変更容易にする方法は知られていない。何かを変更容易にすると全体が少し複雑になり、すべてを変更容易にすると全体が非常に複雑になる。**ソフトウェアを変更困難にしているのは複雑さである**）

### 出典

- Martin Fowler, "Who Needs an Architect?", *IEEE Software*, July/August 2003, pp.2-4（**今回、全文を抽出して確認**） — https://martinfowler.com/ieeeSoftware/whoNeedsArchitect.pdf
- Martin Fowler, Software Architecture Guide — https://martinfowler.com/architecture/

### このリポジトリへの含意

- **「アーキテクチャとは変更が高くつく決定である」を Fowler の言葉として引用してはならない。** 正確には (a) 元の発想は Johnson の「早い段階で正しく決めたい決定」、(b) Fowler の言い換えは "things that people **perceive as** hard to change"、(c) 留保付きの提示である
- **この論文を「不可逆な判断には重い工程をかけよ」の根拠に使うことはできない。逆を主張している文献である。** 引くなら「**不可逆性そのものを減らせ**」の根拠として引くべきである
- `CLAUDE.md` の「不可逆な設計判断 🔒」に対してこの論文が示唆するのは「重い工程で守れ」ではなく「**そもそも不可逆でなくせないか**」という問いである。「導出値を保存しない」はまさに**不可逆性を減らす設計**（保存しなければ再計算で済む）であり、Fowler と同じ方向を向いている。一方「URL は最初から `/ja/` `/en/`」は不可逆性を減らせないので 🔒 が妥当である
- **"perceive"（知覚）が入っていることは、この組織にそのまま効く。** 実際には安く巻き戻せるのに「重要そうだから」重い工程をかけている箇所が、実測された症状と一致する。**判定すべきは「重要そうか」ではなく「実際に巻き戻せるか」である**

---

## 4. Definition of Ready に「参照すべき資料・入口が示されていること」はあるか — 無い。ただし前提に誤りがあった

### 結論を先に

**前回の「無い」という結論は維持される。** どの権威も「参照すべき資料・入口が特定されていること」を着手前条件の項目として挙げていない。

ただし**調査の前提に1つ誤りがあった。SAFe は Definition of Ready を公開していない。** 「SAFe の DoR を見よ」という指示自体が成り立たなかった。

### 4-1. SAFe — DoR は存在しない

SAFe の公式用語集に **Definition of Done はあるが、Definition of Ready は無い。**

> "The Definition of Done specifies the requirements for completeness of a work product or increment of value."
> 出典: SAFe Glossary — https://framework.scaledagile.com/glossary

さらに、SAFe の中核記事7本（story / iteration-planning / team-kanban / team-backlog / pi-planning / features-and-capabilities / program-backlog / a-scalable-definition-of-done）を機械的に数えた結果、**`definition of ready` の出現は全記事で0回**だった（`definition of done` は2記事で計9回）。

SAFe が代わりに置いているのは INVEST と継続的なリファインメントである。

> "The team backlog must always contain some stories that are ready for implementation without significant risk or surprise. ... Backlog refinement looks at upcoming stories (and features, as appropriate) to discuss, estimate, and establish an initial understanding of acceptance criteria."
> （チームバックログには、大きなリスクや驚きなしに実装可能な状態のストーリーが常にいくつか入っていなければならない。…バックログリファインメントは、今後のストーリーを見て、議論し、見積もり、受け入れ条件の初期的な理解を確立する）

> ⚠️ **注記: 記事本文は 2022年の Wayback Machine のスナップショットから取得した**（現在の SAFe サイトは記事本文をログインの内側に置いている）。用語集の確認だけは現行サイトに対して行った。

### 4-2. Scrum 系 — 最も近い記述はあるが、「特定されていること」を条件にはしていない

**Scrum Guide 2020 に DoR は無い**（前回調査どおり）。`ready` は1回だけ、別の意味で出てくる。

> "Product Backlog items that can be Done by the Scrum Team within one Sprint are deemed ready for selection in a Sprint Planning event."

**Scrum Alliance の用語集**は、DoR が Scrum の規定でないことを明示している。

> "Unlike the Definition of Done, the DoR is not included in the Scrum Guide, but some teams use it as a checklist during backlog refinement or sprint planning to make sure items are well understood, sized appropriately, and free of major blockers."
> （Definition of Done と違い、DoR は Scrum Guide に含まれていない。ただし一部のチームは、項目が十分に理解され、適切なサイズで、大きな阻害要因が無いことを確かめるためのチェックリストとして、リファインメントやスプリントプランニングで使っている）

**今回見つかった中で最も近い記述**が、Scrum Alliance の DoR 解説記事にある。

> "In contrast, a definition of ready might be a checklist with the following:
> • No blockers have been found that cannot be addressed by the team during the sprint
> • **The team has the information and skills necessary to complete the item**
> • **The team has what they need to start working on the item**"
> （…チームがその項目を完了するのに必要な情報と技能を持っていること／チームがその項目に着手するのに必要なものを持っていること）

別記事では **`Dependencies are identified`（依存が特定されていること）** が挙がっている。

**ScrumPLoP（Scrum のパターン・ランゲージ）の DoR パターン**は6条件を挙げるが、**資料に関する項目は無い**: 即座に着手可能 / 価値がある / PO とチームが議論済み / 見積もり済み / テスト可能でテストが指定されている / 適切なサイズ。

### 4-3. Atlassian / Microsoft — 該当なし

**Atlassian** の DoR ページは INVEST がすべてである。

> "There are six critical components of a DoR... The nickname for these components is the INVEST method"

一般的な近接表現として "They know what they need to make it happen." / "Have all the necessary information to ensure they can complete the scope of work on time." はあるが、**項目としての「資料が特定されていること」ではない。**

**Microsoft Azure DevOps** の公式ドキュメントに **DoR の概念は無い。** あるのは "Keep acceptance criteria and the definition of done clear." までである（同社の "Definition of Done" はボードの列設定という機能名であり、概念としての DoD ではない）。

### 4-4. 近接概念 — ここに一次情報の裏づけがあった

**Mary Poppendieck 本人のサイト（2003年4月）に、リーンソフトウェア開発の7つのムダが列挙されている。**

> "The seven wastes of software development are:
> • Partially Done Work (the "inventory" of a development process)
> • Extra Processes (easy to find in documentation-centric development)
> • Extra Features (develop only what customers want right now)
> • **Task Switching** (everyone should do one thing at a time)
> • **Waiting (for instructions, for information)**
> • **Handoffs** (tons of tacit knowledge gets lost)
> • Defects"
> （…タスク切り替え／**待ち（指示を待つ、情報を待つ）**／受け渡し（暗黙知が大量に失われる）…）

**「情報を待つこと」が名指しでムダとして挙がっている。これが今回の調査で見つかった最も強い一次情報である。**

さらに、**「作業を再開するとき、どこで作業すべきかを探し直すことが支配的なコストである」ことの実測**が2本ある。

**Parnin & Rugaber（ICPC 2009）** — 開発者の作業再開の実測:
- 作業再開時、**他の場所へ移動せずにそのまま編集を始められたのは全セッションの 7.5%（1,213件中91件）のみ**
- **83% は別の場所へ移動した**
- 最初の編集に至るまでに訪れた場所は、Visual Studio で 2〜12箇所（中央値7）、Eclipse で 15〜150回の選択操作（中央値135）
- 著者の説明する原因は「最後に作業した場所に手がかりが不足していること」「計画・目標・作業中に使った中間的な知識が明示的に表現されていないこと」

> ⚠️ **注記: この PDF はテキスト抽出で単語間の空白が失われたため、上記の短い語句は「文字単位で正確」ではなく「趣旨として正確」として扱うこと。** 数値は表から直接読んでいる。

**Czerwinski, Horvitz & Wilhite（CHI 2004, Microsoft Research）** — 空白が保持されたため逐語:

> "We found that the reinstatement of complex, long-term projects is poorly supported by current software systems."
> （複雑で長期的なプロジェクトへの復帰が、現在のソフトウェアシステムでは十分に支援されていないことが分かった）

> "Tasks that required returning to after an interruption were rated significantly more difficult to switch to than others, F(1,497)= 8.453, p<.001"
> （中断後に復帰を要したタスクは、そうでないものより有意に切り替えが難しいと評価された）

> "In addition, returned-to tasks required significantly more documents, on average, than other tasks (average 2.5 v. 1.6 documents, respectively), F(1,497)=13.8, p<.001"
> （加えて、復帰を要したタスクは他より平均して有意に多くの文書を必要とした（平均 2.5 対 1.6 文書））

### 確認できなかったこと

- **Scrum.org の公式ガイダンス**は取得できなかった。同サイトはボット対策で 0 バイトを返す。検索エンジンの断片は入手したが、**根拠としては採用していない**
- **Shigeo Shingo の SMED 原典**（1985年の書籍）は取得できなかった。Lean Enterprise Institute の用語集（**二次情報**）で「内段取り／外段取り」の区別は確認したが、これは機械の段取り替えの話であり、情報の話ではない
- **Gerald Weinberg の文脈切り替えコストの表**（*Quality Software Management* Vol.1, 1992, p.284）は取得できなかった。オンラインにあるのは二次情報のブログのみで、**引用していない。** そもそも同時並行プロジェクトによる損失の話であり、参照資料の話ではないため、この項目の裏づけにはならない
- SAFe の記事本文は**2022年時点のアーカイブ**であり、現行版で DoR が追加されていないことは用語集でしか確認していない

### 出典

- SAFe Glossary — https://framework.scaledagile.com/glossary
- SAFe "Team Backlog"（2022年アーカイブ） — http://web.archive.org/web/2022/https://www.scaledagileframework.com/team-backlog/
- Scrum Guide 2020 — https://scrumguides.org/scrum-guide.html
- Scrum Alliance Glossary — https://www.scrumalliance.org/glossary
- Scrum Alliance, "Definition of Done vs. Definition of Ready" — https://resources.scrumalliance.org/Article/definition-vs-ready
- Scrum Alliance, "Pros and Cons of a Definition of Ready" — https://resources.scrumalliance.org/Article/pros-cons-definition-ready
- ScrumPLoP, "Definition of Ready" パターン — https://scrumbook.org/value-stream/product-backlog/definition-of-ready.html
- Atlassian, "Definition of Ready" — https://www.atlassian.com/agile/project-management/definition-of-ready
- Microsoft Learn, Azure Boards ベストプラクティス — https://learn.microsoft.com/en-us/azure/devops/boards/best-practices-agile-project-management?view=azure-devops
- **Mary Poppendieck, "Lean Software Development"（2003年4月、著者本人のサイト）** — https://www.leanessays.com/2003/04/lean-software-development.html
- **Parnin & Rugaber, "Resumption Strategies for Interrupted Programming Tasks", ICPC 2009**（著者公開 PDF） — https://chrisparnin.me/pdf/parnin-icpc09.pdf
- **Czerwinski, Horvitz & Wilhite, "A Diary Study of Task Switching and Interruptions", CHI 2004**（Microsoft 公開 PDF） — https://www.microsoft.com/en-us/research/wp-content/uploads/2004/01/chi2004diarystudyfinal.pdf
- Lean Enterprise Institute, SMED 用語解説（**二次情報**） — https://www.lean.org/lexicon-terms/single-minute-exchange-of-die/

### このリポジトリへの含意

- **前回の結論は維持される。「参照すべき成果物が実在すること」は、DoR の標準項目ではない。** 権威づけには依然として使えない
- **ただし、権威づけの相手を変えれば裏づけはある。** DoR の文献ではなく、**リーンの「情報を待つムダ」と、作業再開コストの実測**を引くべきである。Poppendieck の "Waiting (for instructions, for information)" は一次情報の逐語であり、Parnin/Rugaber と Czerwinski らは**「どこで作業すべきかを探し直すことが着手の支配的コストである」ことを数値で示している**
- **前回調査の「API 往復339回のうち約140回が『探す・読む』だった」という実測は、Parnin/Rugaber の 83% という数字と同じ形をしている。** 実測を根拠に提案するという前回の判断は正しかった。加えて、**この現象には名前と先行研究がある**ことが今回分かった
- **SAFe を根拠に引いてはならない。** SAFe は DoR を公開していない
- 近い記述が欲しい場合、引けるのは Scrum Alliance の "The team has what they need to start working on the item" までである。これは**「必要なものを持っていること」であって「特定されていること」ではない。** 特定する作業自体を条件にしている実務は、見つからなかった

---

## 5. Google の "major project" の規模と、設計文書レビューの運用

### 5-1. 規模の定義 — 再確認の結果、存在しない（かつ意図的に置いていない）

**前回の結論は維持される。** 無償公開されている『Software Engineering at Google』全25章と Ubl の記事を機械的に全文検索した結果:

- **`major project` は書籍全体で「ちょうど1回」しか出てこない**（第10章の当該文のみ）。定義も限定も、他のどこにも無い
- 設計文書に関連して、**規模の単位（行数・ファイル数・人週・人数・期間）はゼロ件**

さらに今回、**Google が数値の閾値を意図的に置いていないことを明言している箇所**が第8章（Style Guides and Rules）に見つかった。

> "The definition of small, however, is somewhat nebulous. A change that propagates the identical one-line update across hundreds of files might actually be easy to review. By contrast, a smaller, 20-line change might introduce complex logic with side effects that are difficult to evaluate. We recognize that there are many different measurements of size, some of which may be subjective—particularly when taking the complexity of a change into account. **This is why we do not have any tooling to autoreject a proposed change that exceeds an arbitrary line limit.** Reviewers can (and do) push back if they judge a change to be too large."
> （ただし「小さい」の定義はいくぶん曖昧である。同一の1行の更新を数百ファイルに伝播させる変更は、実際にはレビューが容易かもしれない。逆に、より小さな20行の変更が、評価の難しい副作用を持つ複雑なロジックを導入するかもしれない。規模の測り方は多数あり、変更の複雑さを考慮するとその一部は主観的でありうると我々は認識している。**だからこそ我々は、任意の行数制限を超えた変更を自動的に却下するツールを一切持っていない。** レビュアは、大きすぎると判断すれば押し返せるし、実際にそうしている）

**これはコード変更についての記述であって設計文書の話ではない。** ただし、**規模は曖昧なので数値のゲートにせず人間の裁量に委ねる、というのが Google の明文化された立場である**ことの直接の証拠である。前回「規模の閾値は存在しない」としたのは、書き忘れではなく意図的な設計だったことになる。

Ubl の記事で数値が出るのは**文書の長さだけ**である。

> "The sweet spot for a larger project seems to be around 10-20ish pages. If you get way beyond that, it might make sense to split up the problem into more manageable sub problems. It should also be noted that it is absolutely possible to write a 1-3 page 'mini design doc'."

### 5-2. 設計文書レビューの運用（新規に取得した部分）

#### ライフサイクルに「承認」という状態が無い

Ubl の記事が明示するライフサイクルは4段階である。

> "The steps in the lifecycle of a design document are:
> Creation and rapid iteration
> Review (may be in multiple rounds)
> Implementation and iteration
> Maintenance and learning"
> （作成と急速な反復 → レビュー（複数ラウンドありうる） → 実装と反復 → 保守と学習）

**`approved`（承認済み）という状態も、`obsolete`（廃止）という状態も無い。**

#### レビューはゲートではない — 明示的に「待つな」と書かれている

> "In the review phase a design doc gets shared with a wider audience than the original set of authors and close collaborators. **Reviews can add a lot of value, but they are also a dangerous trap of overhead, so treat them wisely.**"
> （レビュー段階では、設計文書が元の著者と近い協力者より広い読み手に共有される。**レビューは大きな価値を加えうるが、同時にオーバーヘッドの危険な罠でもあるので、賢く扱うこと**）

> "Naturally waiting for such meetings to happen can significantly slow down the development process. **Engineers can mitigate this by seeking the most crucial feedback directly and not blocking progress on wider review.**"
> （当然ながら、そうした会議を待つことは開発プロセスを大きく遅らせうる。**エンジニアは、最も重要なフィードバックを直接求め、広いレビューで進行を止めないことでこれを緩和できる**）

#### レビューの価値は「問題を見つけること」ではなく「早い時点であること」

> "The primary value that such reviews add is that they form an opportunity for the combined experience of the organization to be incorporated into a design. ... **The primary value of the review isn't that issues get discovered per-se, but rather that this happens relatively early in the development lifecycle when it is still relatively cheap to make changes.**"
> （こうしたレビューが加える第一の価値は、組織の総合的な経験を設計に取り込む機会になることである。…**レビューの第一の価値は、問題が発見されること自体ではなく、それが開発ライフサイクルの比較的早い時点、まだ変更が比較的安い時点で起きることにある**）

#### 実装へ移る条件は「承認」ではなく「確信」

> "**When things have progressed sufficiently to have confidence that further reviews are unlikely to require major changes to the design, it is time to begin implementation.**"
> （**さらなるレビューが設計に大きな変更を要求する見込みが低いと確信できる程度に進んだとき、実装を始める時である**）

**判断するのは著者自身であって、承認者ではない。**

#### 中央のレビュー機関は、規模に耐えられず放棄された

> "When Google was a smaller company, it was customary to send designs to a single central mailing list, where senior engineers would review them at their own leisure. This may very well be a great way to handle things for your company. One benefit was that it did establish a relatively uniform software design culture across the company. **But as the company scaled to a much larger engineering team, it became infeasible to maintain the centralized approach.**"
> （Google がもっと小さな会社だった頃は、設計を単一の中央メーリングリストへ送り、シニアエンジニアが都合のよいときにレビューするのが慣例だった。…一つの利点は、会社全体に比較的均一なソフトウェア設計文化を確立したことである。**しかし会社がずっと大きなエンジニアリングチームへ拡大するにつれ、中央集権的な方式を維持することは不可能になった**）

#### 誰が承認するのかは、どこにも書かれていない

書籍第10章は "an approved design document"（承認済みの設計文書）と書くが、**承認者の役職も、機関も、手続きも記していない。** 書かれているのは、**横断的関心事の節をそれぞれの専門家が見る**ことだけである。

> "The canonical design document templates at Google require engineers to consider aspects of their design such as security implications, internationalization, storage requirements and privacy concerns, and so on. **In most cases, such parts of those design documents are reviewed by experts in those domains.**"

> "Some teams require such design documents to be discussed and debated at specific team meetings... In some respects, these design discussions act as a form of code review before any code is written."

**Ubl の記事には `approve` / `approval` / `approver` / `sign-off` / `reject` という語が一度も出てこない。**

#### 却下されたらどうなるかは、両方の資料が完全に沈黙している

**「却下」という状態も、異議申し立ての経路も、承認されなかった場合の帰結も、どこにも記述が無い。**

#### 設計レビューとコードレビューは別物である（第9章）

> "At Google, we **generally require new code and/or projects to undergo an extensive design review, apart from a code review**. A code review is not the time to debate design decisions already made in the past."
> （Google では一般に、新しいコードやプロジェクトには、**コードレビューとは別に**広範な設計レビューを受けることを要求する。コードレビューは、過去に既に下された設計上の決定を議論する場ではない）

コードレビューは**合意済みの設計への適合を確認する**のであって、設計レビューそのものを行わない。

#### Google の公開「Eng Practices」に設計レビューの文書は存在しない

> "Currently this contains the following documents: Google's Code Review Guidelines, which are actually two separate sets of documents: The Code Reviewer's Guide / The Change Author's Guide"

**これがサイトの全体である。設計レビューに関する文書は無い。**

### 資料間の矛盾（重要）

**書籍第10章は「承認済みの設計文書を要求する」と書き、Ubl の記事には承認という状態も承認者も存在せず、むしろ「広いレビューで進行を止めるな」と書いている。** 両者は同時期の Google の一次情報であり、この食い違いは資料の中で解消されていない。**「Google は設計文書の承認を要求している」という前提は、詳細な側の一次情報が支持していない、たった一文に依拠している。**

### 出典

- Winters / Manshreck / Wright, *Software Engineering at Google*, Ch.10 Documentation — https://abseil.io/resources/swe-book/html/ch10.html
- 同 Ch.9 Code Review — https://abseil.io/resources/swe-book/html/ch09.html
- 同 Ch.8 Style Guides and Rules — https://abseil.io/resources/swe-book/html/ch08.html
- Malte Ubl, "Design Docs at Google" — https://www.industrialempathy.com/posts/design-docs-at-google/
- Google Eng Practices — https://google.github.io/eng-practices/

### このリポジトリへの含意

- **規模の閾値が無いのは調査漏れではなく、Google の明文化された立場である**（「任意の行数制限で自動却下するツールを一切持たない」）。**この組織が行数で工程を決めないことには、明確な一次情報の裏づけがある**
- **設計文書レビューを「通過門」にしてはならない。** Google の一次情報は (a) レビューを「オーバーヘッドの危険な罠」と呼び、(b) 「広いレビューで進行を止めるな」と指示し、(c) 実装開始の判断を**著者自身の確信**に委ねている
- **中央のレビュー機関は、Google が規模に耐えられず放棄したものである。** この組織のオーケストレーターが全タスクのレビューを一手に握る形は、Google が捨てた形と同じである
- **レビューの価値は「早いこと」にある**（問題の発見自体ではない）。工程の後ろに置いたレビューは、一次情報が挙げる価値をほとんど失っている
- **承認・却下という状態は、Google の詳細な一次情報には存在しない。** この組織の「レビュー中 → 完了」という状態遷移は、Google の実務からは導けない。導けるのは「著者が確信を持ったら次へ進む」までである

---

## 6. 確認できなかったこと（今回の一覧）

推測で埋めていない箇所を、ここにまとめる。

| # | 確認できなかったもの | 理由 |
| --- | --- | --- |
| 1 | ISO/IEC/IEEE **29119-1:2022 / 29119-2:2021（第2版）の本文** | 有償。公開プレビューは用語 3.1〜3.63 までで、リスク関連の用語に届く前に切れている。**規格本文の引用はすべて第1版（2013）である。** 第2版で 29119-1 自身が `risk` 系を定義し始めた可能性は否定できていない |
| 2 | **刊行された『Tidy First?』の本文**（章題・章本文とも） | O'Reilly が Akamai で 403。UA 偽装でも通らない。引用はすべて**刊行前の連載原稿**であり、章題も**連載時の投稿題名**である |
| 3 | 『Tidy First?』の **First / After / Later / Never 各章の判定基準の本文** | 有料購読の内側。今回引いた「遅れのコスト」の規則は**別の回（Tidying Versus Sooner）**からのもの |
| 4 | **Scrum.org の公式ガイダンス** | ボット対策で 0 バイトを返す。検索エンジンの断片は根拠に採用していない |
| 5 | **Shigeo Shingo の SMED 原典**、**Gerald Weinberg の文脈切り替えコストの表** | いずれもオンラインに一次情報が無い。二次情報しか無いため引用していない |
| 6 | **Google で設計文書を承認するのは誰か / 却下されたらどうなるか** | 書籍にも Ubl の記事にも**記述が存在しない**。存在しないことが確認できた、と言ってよい |
| 7 | SAFe の記事本文の**現行版** | 現行サイトはログインの内側。本文は2022年のアーカイブ、用語集のみ現行サイトで確認 |
| 8 | Parnin & Rugaber 論文の**文字単位で正確な逐語** | PDF 抽出で単語間の空白が失われた。数値は表から直接読んでおり信頼できるが、**短い語句は「趣旨として正確」として扱うこと** |

---

## 7. 前回調査の結論が変わるか

5件それぞれについて、前回の結論を維持するのか・覆すのかを明示する。

### ① ISO/IEC/IEEE 29119 のリスクの定義 — **覆る（前回の保留が解消し、内容も変わった）**

前回は「『リスク＝影響×発生可能性』が規格本文の定義としてこの表現で書かれているかは未確認」として保留した。

**今回、規格本文を取得して確認した結果、答えは「書かれていない」である。** 規格が定義するのは `product risk` / `project risk` / `risk-based testing` の3つだけで、`risk` 単体の定義すら持たず外部の用語集に委ねている。「影響と発生可能性」は**規範的要求の中に `such as`（〜など）付きの例示として**現れるにすぎない。ISO/IEEE の正式な `risk` の定義は「目的に対する不確かさの影響」であり、「積」という言い方が現れるのは PMBOK 側の注記だけだった。

**前回 §2 の含意（深さを変えるのは規格の要求である／行数比では判定できない）はそのまま生きる。** 変わるのは次の2点である。

- **算定方法は規格の要求ではない。** この組織が独自の測り方を採ってよい
- **「制約により低エクスポージャのリスクは対象外」と書いて落とすことが、規格上の正規の手順である**という、前回に無かった根拠が加わった

### ② Kent Beck『Tidy First?』 — **維持（かつ大幅に補強された）**

前回の結論（構造変更と振る舞い変更を混ぜない／構造変更に TDD は筋が悪い／Never の基準）は**すべて維持される。** 書籍本文は依然として取得できていないが、**著者本人の無料公開から、前回は「確認できなかった」としていた骨子と判断規則が取れた。**

**補強された点が3つある。**

- **「可逆性」が構造／振る舞いの区別の核心である**ことが著者の言葉で確認できた。これにより前回 §6 の4つの軸のうち**1番目と4番目は独立ではない**ことが分かった
- **「いつ整理するか」の判定軸は「遅れのコスト」である**という、前回に無かった具体的な規則が取れた
- **整理には上限がある**（数分〜1時間。1日でも長すぎる）

### ③ Fowler / Booch の「変更が高くつく決定」 — **覆る（前回の「根拠が足りない」は解消したが、結論は逆方向）**

前回は「逐語は見つけられなかった／この定式を Fowler の言葉として引用する根拠は現時点では無い」とした。

**今回、原論文の全文を取得したので、根拠の有無ははっきりした。**

- **前回の「Fowler の言葉として引用する根拠は足りない」という慎重な判断は、結果的に正しかった。** 通俗的な "expensive to change" という言い方は原文に無く、原文は "things that people **perceive as** hard to change" であり、しかも留保付きである
- **元の発想は Ralph Johnson のもの**で、Fowler 自身が "Johnson's secondary definition" と呼んでいる
- **そして最も重要なこととして、この論文は「不可逆なものには重い工程を」という主張を支持しない。正反対に「不可逆性を取り除いてアーキテクチャを無くせ」と結論している**

**この3つ目は、前回調査が予期していなかった発見である。** 前回 §6 が「不可逆性」を工程を重くする軸の筆頭に置いたことは、Bezos については正しいが、**Fowler をその列に並べることはできない。**

### ④ Definition of Ready の「参照すべき資料」 — **維持**

**前回の「無い」という結論は維持される。** SAFe・Scrum Alliance・ScrumPLoP・Atlassian・Azure DevOps のいずれにも、「参照すべき資料・入口が特定されていること」を条件として挙げるものは無かった。最も近いのは Scrum Alliance の「チームが着手に必要なものを持っていること」までで、**特定する作業自体を条件にはしていない。**

**変わる点が2つある。**

- **調査の前提に誤りがあった。SAFe は Definition of Ready を公開していない。** SAFe を根拠に引いてはならない
- **権威づけの相手を変えれば裏づけはある。** リーンの「情報を待つムダ」（Poppendieck の一次情報に逐語で存在）と、作業再開コストの実測（Parnin & Rugaber の 83%、Czerwinski らの CHI 2004）である。**前回「実測データを根拠に提案すべき」とした判断は正しく、加えてこの現象には名前と先行研究があることが分かった**

### ⑤ Google の "major project" の規模 — **維持（かつ強化された）**

**前回の「存在しないことが確認できた」は維持される。** 全25章の全文検索で `major project` は1回しか現れず、規模の単位はゼロ件だった。

**強化された点が1つある。** 第8章に「**任意の行数制限を超えた変更を自動的に却下するツールを一切持っていない**」という明文があり、**規模を数値のゲートにしないことが Google の意図的な立場である**ことが確認できた。前回は「書かれていない」だったが、今回は「**意図的に置いていない**」まで言える。

**追加で取得した設計文書レビューの運用**からは、前回 §1 の含意を修正する材料が出た。前回は「レビューについては Google は全件やる」とだけ書いたが、**設計文書のレビューについては (a) 通過門ではない、(b) 進行を止めてはならない、(c) 実装開始を決めるのは著者自身の確信であって承認ではない、(d) 中央のレビュー機関は規模に耐えられず放棄された、という4点が加わる。**

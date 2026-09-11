# 変更の性質に応じて工程の重さをどう切り分けるか — 確立した実務の調査

- 調査日: 2026-09-12
- 目的: この組織が**全タスクに同じ重さの工程（設計・受け入れテスト・レビュー）を回している**ことを、思いつきではなく確立した実務の基準で見直すための材料を集める
- 方針: 一次情報（原典・規格・公式文書・著者本人の文章）に当たる。**当たれなかった論点は「確認できなかった」と明記し、推測で埋めない**

**この文書は調査結果であって、規約ではない。** ここから何を採るかは別に決める。

---

## 1. Google の設計文書（design doc）— 線引きは「規模」ではなく「設計解の曖昧さ」

### 分かったこと

**Malte Ubl（Google）の "Design Docs at Google" は、設計文書を書くかどうかの判断軸を規模に置いていない。** 置いているのは**設計解が曖昧かどうか**である。

> "whether the solution to the design problem is ambiguous – because of problem complexity or solution complexity, or both. If it is not, then there is little value in going through the process of writing a doc."
> （設計上の問題の解が曖昧かどうか。問題の複雑さによるものか、解の複雑さによるものか、その両方か。曖昧でないなら、文書を書く過程を通る価値はほとんど無い）

判断のための自己診断として、次のような問いが挙げられている。**3つ以上が「はい」なら設計文書を書くのがよい方法だろう**、という閾値の示し方をしている。

- "Are you unsure about the right software design, and would it make sense to spend upfront time to gain certainty?"（正しい設計に確信が無く、先に時間を使って確信を得ることに意味があるか）
- "Is the software design ambiguous or even contentious such that achieving organizational consensus around it would be valuable?"（設計が曖昧、あるいは争点になっていて、組織的な合意を得ること自体に価値があるか）
- "Does my team sometimes forget to consider privacy, security, logging or other cross-cutting concerns?"（プライバシー・セキュリティ・ログなどの横断的関心事を、チームが考え忘れることがあるか）

**書かなくてよい変更は、アンチパターンの形で定義されている。**

> "A clear indicator that a doc might not be necessary are design docs that are really implementation manuals. If a doc basically says 'This is how we are going to implement it' without going into trade-offs, alternatives, and explaining decision making (or if the solution is so obvious as to mean there were no trade-offs), then it would probably have been a better idea to write the actual program right away."
> （文書が要らないかもしれない明確な兆候は、実質的に実装手順書になっている設計文書である。トレードオフ・代替案・意思決定の説明に立ち入らず「こう実装する」としか言っていないなら（あるいは解が自明でトレードオフが存在しなかったなら）、すぐ実際のプログラムを書いたほうがよかったのだろう）

そして設計文書は**オーバーヘッドだと明言されている**。

> "Writing design docs is overhead. The decision whether to write a design doc comes down to the core trade-off of deciding whether the benefits in organizational consensus around design, documentation, senior review, etc. outweigh the extra work of creating the doc."

小さな増分の改善に対しては、1〜3ページの「ミニ設計文書」という中間の重さが用意されている。**要る／要らないの二値ではない。**

### 書籍『Software Engineering at Google』側の記述

第10章（Documentation）には、しばしば引用される一文がある。

> "Most teams at Google require an approved design document before starting work on any major project."
> （Google のほとんどのチームは、**大きなプロジェクト**に着手する前に承認済みの設計文書を要求する）

**この "major project" が何行・何ファイルなのかは、本章では定義されていない。** 代わりに書かれているのは、設計レビューの位置づけ（"Design discussions act as a form of code review before any code is written."）と、テンプレートが強制する考慮事項（セキュリティ・国際化・ストレージ要件・プライバシー）である。**規模の閾値は本文に存在しない。**

第9章（Code Review）には行数が出てくるが、**用途が違う**。

> "'Small' changes should generally be limited to about 200 lines of code."

これは**レビューを受けるかどうかの閾値ではない**（Google は全変更にレビューを要求する）。**1回のレビューの単位を小さく保て**という指示である。**200行という数字を「設計文書の要否」や「テストの要否」の閾値に流用するのは誤読になる。**

一方で第9章は、**変更の種別によってレビューの観点を変える**ことは明示している。

- グリーンフィールド（新規）: 網羅的なテスト・文書・オーナー割り当てを要求する
- バグ修正: **そのバグだけを直す。スコープを広げない**
- 自動生成された変更: レビュアはコード自体にだけコメントし、生成ツールの是非に踏み込まない

加えて、"code review processes that are heavyweight, or that don't scale properly, become unsustainable."（重すぎる、あるいは適切にスケールしないレビュープロセスは持続不能になる）と述べ、presubmit と静的解析による自動化で人間のレビュー負荷を下げることを解決策に置いている。

### 出典

- Malte Ubl, "Design Docs at Google" — https://www.industrialempathy.com/posts/design-docs-at-google/
- Winters / Manshreck / Wright, *Software Engineering at Google*, Ch.10 Documentation — https://abseil.io/resources/swe-book/html/ch10.html
- 同 Ch.9 Code Review — https://abseil.io/resources/swe-book/html/ch09.html
- 書籍トップ — https://abseil.io/resources/swe-book/

### このリポジトリへの含意

- **設計工程の要否を「行数」で決める基準は、Google の実務には無い。** 使えるのは「**代替案が実在するか / トレードオフがあるか**」という問いである。これは二値で判定できるので、タスク登録時のチェックにそのまま落とせる。
- 「代替案が無く、どう書くかが自明」なタスク（文言の差し替え、既存パターンの横展開、設定値の追加）は、Ubl の基準では**設計文書を書かないほうがよい**側に落ちる。書けば必然的に「実装手順書」になる。
- 逆に、`CLAUDE.md` の「不可逆な設計判断 🔒」に触れるものは、**問題の複雑さではなく組織的合意の価値**の側で設計文書が正当化される。
- **1〜3ページのミニ設計文書という中間段があることは、この組織の工程設計にそのまま移せる**（設計工程を「有り／無し」の二値にしない）。
- レビューについては、Google は**全件やる**。ただし種別で観点を変え、自動化で負荷を下げる。**「レビューを省く」ではなく「レビューで見るものを絞る」が実務側の答えである。**

---

## 2. リスクベースドテスト — 深さを決めるのは影響 × 発生可能性、ただし相対評価

### 分かったこと

**ISO/IEC/IEEE 29119 シリーズは、すべてのテストがリスクベースであることを要求している。** 規格の作業部会が運営するサイトに、次の記述がある。

> "It is the basis for the ISO/IEC/IEEE 29119 series of software testing standards, which mandate that all testing should be risk-based."
> （リスクベースドテストは ISO/IEC/IEEE 29119 シリーズの基礎であり、同シリーズはすべてのテストがリスクベースであることを義務づけている）

テスト計画プロセスの中に、"Understand Context" / "Identify & Analyse Risks" / "Identify Risk Mitigation Approaches" / "Design Test Strategy" という、明示的にリスク指向の活動が置かれている（29119-2）。

**リスクの測り方**は、影響（impact）と発生可能性（likelihood）の組み合わせで合っている。ただし**実務では絶対値ではなく相対評価**である点が重要だった。

> "The most common approach to risk assessment for RBT is to use high, medium and low (for impact, likelihood and the resultant risk score)."

そして、**スコアの比をそのまま工数の比にしてはいけない**と明記されている。

> "if we had two risks, one 'Low-Low' with a nominal score of 1, and one 'High-High' with a nominal score of 9, we do not assign nine times as much effort"

**深さの決め方**は次のとおり。

> "we identify those parts of the system under test that are higher risk and we then spend a higher proportion of our test effort on those parts."
> （テスト対象のうちリスクの高い部分を特定し、その部分にテスト工数のより高い割合を割く）

さらに、**リスク評価が決めるのは工数の配分だけではない**。どの種類のテスト・どの技法を選ぶかも決める。

### 確認できなかったこと

**ISO/IEC/IEEE 29119-1:2022 の用語定義（risk / risk level / risk exposure / risk-based testing）の逐語は取得できなかった。** ISO の Online Browsing Platform は 403 を返し、公開プレビュー PDF はこの環境で本文抽出ができなかった。**「リスク＝影響×発生可能性」という定式が規格本文の定義としてこの表現で書かれているかは、未確認である。** 上記の引用は、規格の作業部会が運営する公式サイトの解説記事によるものである。

### 出典

- ISO/IEC/IEEE 29119-2:2013（Test processes） — https://www.iso.org/standard/56736.html
- IEEE SA 29119-2 — https://standards.ieee.org/ieee/29119-2/7498/
- ISO/IEC/IEEE 29119-1:2022（General concepts） — https://www.iso.org/standard/81291.html
- 規格作業部会の公式サイト "Risk-Based Testing for AI"（リスクベースドテスト一般の解説を含む） — https://softwaretestingstandard.org/2024/11/03/risk-based-testing-for-ai/
- 学術レビュー: Felderer & Schieferdecker, "A taxonomy of risk-based testing", *Int. J. Softw. Tools Technol. Transfer* (2014) — https://link.springer.com/article/10.1007/s10009-014-0332-3

### このリポジトリへの含意

- **「全タスクに同じ深さのテストを課す」は、この規格の考え方に正面から反する。** 規格側は、深さを変えることを義務としている。
- pergram でリスクが高いのは、影響の側から見て次のもの: **法令に直結する箇所（N-01〜N-10）／不可逆な設計判断 🔒 に触れる箇所／単価の導出計算／保存する列の定義**。低いのは **文言・見た目・ドキュメント・プレビュー専用の経路**。
- 実測の「製品コード258行に対しテスト1,399行」は、**それだけでは過剰とも適正とも言えない**。高リスク領域なら妥当でありうるし、低リスク領域なら明らかに過剰である。**行数比では判定できない**というのが規格側の立場である。
- 相対評価であること（High-High に Low-Low の9倍を割かない）は、**「高リスクだから青天井」も同様に否定している**点で使える。

---

## 3. Kent Beck『Tidy First?』— 構造の変更と振る舞いの変更を混ぜない

### 分かったこと

**この本の中心は、変更を2種類に分けることである。** 出版社の公式紹介に、"the difference between changes to a system's behavior and changes to its structure"（システムの**振る舞い**への変更と、**構造**への変更の違い）が扱われると明記されている。tidying（整理）とは、**振る舞いを変えずに構造だけを小さく変えること**である。

Beck 自身の発信で確認できた要点:

- **2種類の変更を同時に行わない。** 構造変更と振る舞い変更は別の PR（少なくとも別のコミット）に分ける
- 整理は "deserves its own commits and review cycles, separate from feature work."（機能作業とは別のコミットとレビューサイクルに値する）
- **いつ整理するかは4択**である — First（振る舞いを変える前）／ After（変えた後）／ Later（記録して後で）／ Never（やらない）
- **Never の根拠**として挙げられているのは規模ではない: 整理しない最良の理由は "because we're never going to change the behavior of the code ever ever again."（そのコードの振る舞いを二度と変えないから）
- 順序そのものに利得がある: 先に構造を変えれば後続の振る舞い変更が速く・小さく・安全になる。逆に、散らかったまま振る舞いを変えれば必要な構造変更が見えてくることもある
- 原則として広く知られる言い回し: "First make the change easy (warning, this may be hard) then make the easy change."

### 経済性の議論

Part III（Theory, p.55〜）が経済性を扱う。公式紹介に列挙されている概念は **coupling / cohesion / discounted cash flows / optionality** の4つである。

Beck 自身のサイトの要約から確認できた骨子:

- 開発が遅くなるのは、**機能を1つ足すたびにコードベースのオプション性（optionality）が焼かれる**ため — 複雑さの増加、後方互換の制約、将来の選択肢の減少
- 長期に生きるシステムは、**機能（features）と将来（futures）への投資を交互に行う**必要がある
- 整理は「ビジネスが不確実性を生き延びるための選択肢を保つ」ことに効く

**割引現在価値（DCF）とオプション価値は、同じ方向を向いていない。** DCF は「今日の1ドルは明日の1ドルより価値がある」＝**早く出せ**を支持し、オプション価値は「選べる状態そのものに値段がある」＝**整理して選択肢を残せ**を支持する。この2つの緊張の中で、整理を First / After / Later / Never のどれにするかを選ぶ、というのが Part III の構図である。

### 確認できなかったこと

**各章の本文および章タイトルの逐語は確認できなかった。** O'Reilly のオンライン版は 403、著者の Substack（newsletter.kentbeck.com）は当該記事が有料購読者限定、書籍本文を掲載する第三者サイトは停止中だった。**確認できたのは、出版社の公式紹介文と、Part 構成（Part I Tidyings p.1 / Part II Managing p.33 / Part III Theory p.55 / Appendix A p.93、全124ページ）と、著者本人のサイトの要約までである。** 「オプション価値」「割引現在価値」の章が具体的にどの式・どの判断規則を提示しているかは、本調査では確認できていない。

### 出典

- 出版社ページ（O'Reilly） — https://www.oreilly.com/library/view/tidy-first/9781098151232/
- 書誌と公式紹介・Part 構成（Google Books） — https://books.google.com/books/about/Tidy_First.html?id=-2ndEAAAQBAJ
- Kent Beck, エッセイ要約一覧 — https://kentbeck.com/summaries
- Kent Beck, "First, After, Later, Never" — https://newsletter.kentbeck.com/p/first-after-later-never （冒頭のみ無料）
- Kent Beck, "Change" — https://newsletter.kentbeck.com/p/change

### このリポジトリへの含意

- **「構造の変更」と「振る舞いの変更」を同じタスクに混ぜないことが、そのまま工程の軽量化になる。** 構造だけの変更は、**既存のテストが変わらずに通ること**が完了の証拠になる。受け入れテストを新規に書く必要が無い。
- したがって**構造変更タスクに TDD（受け入れテストを先に書く）を適用するのは筋が悪い**。落ちるテストを先に書けというのは、振る舞いが変わる前提の手順である。この組織の「TDD適用外」は、Beck の分類で言えば**構造変更タスクを含むべき**である。
- レビューも同様に軽くなる。構造変更のレビューで見るのは「振る舞いが変わっていないこと」だけで、要件との突き合わせは不要である。
- **Never の基準が使える**: 「そのコードの振る舞いを二度と変えないなら整理しない」。pergram では、検証フェーズで捨てる可能性のある LP 周辺と、長く残る導出計算とで、整理への投資を変えてよいということになる。

---

## 4. ADR — 記録するのは「構造・非機能・依存・インタフェース・構築技法」に効く決定だけ

### 分かったこと

**Michael Nygard の原典（2011年）** が解こうとしている問題は、この組織の問題と同じ形をしている。

> "One of the hardest things to track during the life of a project is the motivation behind certain decisions."
> （プロジェクトの生涯で最も追跡しにくいものの一つが、ある決定の背後にあった動機である）

理由を知らない新しい担当者は、**盲目的に受け入れる（停滞）か、盲目的に変える（破壊）**の二択に追い込まれる、というのが原典の危機感である。

**何を記録するか（「アーキテクチャ的に重要」の判定）:**

> ADRs document decisions that "affect the structure, non-functional characteristics, dependencies, interfaces, or construction techniques."
> （構造・非機能特性・依存関係・インタフェース・構築技法に影響する決定）

**書式**は5節に固定されている: Title（短い名詞句） / Status（proposed, accepted, deprecated, superseded） / Context（力学を価値中立に、事実として） / Decision（完全な文・能動態で "We will …"） / Consequences（**良い結果だけでなくすべて**）。

**分量は1〜2ページ。** 「将来の開発者との会話」として散文で書く。バージョン管理下に置き、**番号は再利用しない**。

**覆された決定の扱い:**

> "If a decision is reversed, we will keep the old one around, but mark it as superseded."
> （決定が覆された場合、古いものは残したうえで superseded と印を付ける）

**何を記録しないか** は原典では明示されていない。ADR の実務を集約したリファレンス（joelparkerhenderson/architecture-decision-record）に、判定の言語化がある。

> "We want to create an ADR when we want future developers to understand the 'why' of what we're doing"
> "We want to skip an ADR when a decision is limited in scope and time and risk and cost, or is already covered elsewhere"
> （スコープ・期間・リスク・コストが限定的な決定、あるいは既に他所に書かれている決定は、ADR を書かない）

除外されるものとして具体的に挙がっているのは: アーキテクチャに関わらないもの／リスクが小さく自己完結し単一の開発者で閉じるもの／既に他所に文書化されているもの／一時的なもの（回避策・PoC・実験）。

同リファレンスは、書くかどうかの判断に **"How urgent and how important is the AD? Does it have to be made now, or can it wait until more is known?"**（その決定は今しなければならないのか、もっと分かってからでよいのか）という問いも置いている。

### Fowler との関係について

Martin Fowler の Software Architecture Guide には、Ralph Johnson の有名な定義がある。

> "Architecture is about the important stuff. Whatever that is."

同ページは、**開発者が「重要なもの」＝制御を失うと深刻な問題を起こしうる要素を見分け、それを良い状態に保つこと**をアーキテクチャの仕事として説明している。また、内部品質と変更速度の関係を明言している。

> "High internal quality leads to faster delivery of new features, because there is less cruft to get in the way."
> "Attention to internal quality pays off in weeks not months."

**確認できなかったこと:** 「アーキテクチャとは**変更が高くつく決定**である」という趣旨の定式（しばしば Fowler や Booch に帰される）の**逐語は、今回参照した Fowler の公開ページ上に見つけられなかった**。原典とされる "Who Needs an Architect?"（IEEE Software, 2003）は PDF でのみ公開されており、この環境では本文を抽出できなかった。**この定式を Fowler の言葉として引用するのは、現時点では根拠が足りない。**

### 出典

- Michael Nygard, "Documenting Architecture Decisions"（2011, 原典） — https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- ADR 実務の集約リファレンス — https://github.com/joelparkerhenderson/architecture-decision-record
- Martin Fowler, Software Architecture Guide — https://martinfowler.com/architecture/
- Martin Fowler, "Who Needs an Architect?" IEEE Software 2003（**本文未確認**） — https://martinfowler.com/ieeeSoftware/whoNeedsArchitect.pdf

### このリポジトリへの含意

- この組織の `## 決定ログ` の4条件は、**Nygard の対象領域とほぼ重なっている**。特に4つ目（理由を知らない担当が将来元に戻してしまいそうなもの）は、原典の危機感そのものである。**この部分は確立した実務と整合しており、削るべきではない。**
- 一方で、**このリポジトリには「記録しない」側の基準が無い。** 実務側には明示的にある。移せる候補:
  - スコープ・期間・リスク・コストが限定的な決定
  - 単一ファイルに閉じ、巻き戻しが容易な決定
  - 既に他所（規約・要件定義・設計文書）に書かれている決定
  - 一時的なもの（回避策・実験・プレビュー専用の処理）
- **superseded の扱いは既に実装されている**（決定ログ索引の「置き換え済み → T-0XX」）。原典と同じ設計なので、変えない。
- 分量の目安「1〜2ページ」は、実測で問題になっている文書量（1タスクで1,367行）に対する直接の反証である。

---

## 5. Definition of Ready / Definition of Done と「一方通行の扉」

### 分かったこと（DoR / DoD）

**Definition of Done は Scrum Guide に定義がある。**

> "The Definition of Done is a formal description of the state of the Increment when it meets the quality measures required for the product."

**Definition of Ready は、2020年版 Scrum Guide に存在しない。** 語として出てこない。つまり **DoR は Scrum の規定ではなく、その外側で広まった実務慣行**である。この区別は重要で、「Scrum が DoR を要求している」という前提は誤りである。

Agile Alliance の用語集による DoR の定義:

> "The team makes explicit and visible the criteria (generally based on the INVEST matrix) that a user story must meet prior to being accepted into the upcoming iteration."
> （チームは、ユーザーストーリーが次のイテレーションに受け入れられる前に満たすべき基準を、明示的かつ可視にする。基準は一般に INVEST に基づく）

挙げられている便益は2つ:

> "Avoids beginning work on features that do not have clearly defined completion criteria, which usually translates into costly back-and-forth discussion or rework"
> （完了条件が明確に定義されていない機能に着手することを避ける。それは通常、高くつく往復の議論や手戻りに化ける）

および、不明瞭な要求を**押し返す**ための明示的な合意になること。

INVEST の各項目は Independent / Negotiable / Valuable / Estimable / Small。Scrum.org の解説では、受け入れ条件（acceptance criteria）が明文化されていることが期待され、それが無いと「開発者が作業の範囲や、どうテストして検証するかを本当には理解できない」とされている。

### 確認できなかったこと（重要）

**「参照すべき資料・入口が示されていること」を DoR の項目として挙げる一次情報は、確認できなかった。** Agile Alliance の定義にも、INVEST にも、その項目は無い。確認できたのは「**完了条件・受け入れ条件が明示されていること**」までである。

したがって、この組織の「参照すべき成果物が実在すること」という着手前条件は、**確立した実務の標準項目ではなく、このリポジトリ独自の拡張**として位置づけるべきである（後述のとおり、実測上は最も効きそうな項目ではあるが、権威づけには使えない）。

また Scrum.org のコミュニティでは、DoR を厳格な**通過門（stage gate）ではなくガイドライン**として扱うべきという見方があるとされる。**着手前条件を増やすこと自体にもコストがある**という認識は、実務側にも存在する。

### 分かったこと（一方通行の扉 / 両開きの扉）

**Jeff Bezos の 2015年株主書簡**が原典である。

> "Some decisions are consequential and irreversible or nearly irreversible – one-way doors – and these decisions must be made methodically, carefully, slowly, with great deliberation and consultation."
> "But most decisions aren't like that – they are changeable, reversible – they're two-way doors. If you've made a suboptimal Type 2 decision, you don't have to live with the consequences for that long."

そして、**この組織が今まさに陥っている形**が名指しされている。

> "As organizations get larger, there seems to be a tendency to use the heavy-weight Type 1 decision-making process on most decisions, including many Type 2 decisions. The end result of this is slowness, unthoughtful risk aversion, failure to experiment sufficiently, and consequently diminished invention."
> （組織が大きくなるにつれ、重量級の Type 1 の意思決定プロセスを、多くの Type 2 の決定を含むほとんどの決定に適用する傾向が現れるようだ。その結果は、遅さ、考えの浅いリスク回避、実験の不足、そして結果としての発明の減少である）

Type 2 の決定は "can and should be made quickly by high judgment individuals or small groups"（判断力のある個人か小さなグループが速く下すべき）とされる。

**2016年株主書簡**（"High-Velocity Decision Making"）が運用面を足している。

> "Many decisions are reversible, two-way doors. Those decisions can use a light-weight process."
> "Most decisions should probably be made with somewhere around 70% of the information you wish you had."
> "Use the phrase 'disagree and commit.' This phrase will save a lot of time."

**訂正が1点ある。** 本調査の依頼は「1997年・2015年の株主書簡」としていたが、**1997年の書簡には一方通行の扉・両開きの扉・Type 1 / Type 2・可逆／不可逆のいずれの語も出てこない**ことを確認した。1997年の書簡は長期思考と大胆な投資判断についてのもので（"We will make bold rather than timid investment decisions where we see a sufficient probability of gaining market leadership advantages."）、意思決定の重さの切り分けは **2015年に導入され、2016年に運用規則が足された**ものである。

### 出典

- Scrum Guide 2020（Definition of Done） — https://scrumguides.org/scrum-guide.html
- Agile Alliance Glossary, "Definition of Ready" — https://agilealliance.org/glossary/definition-of-ready/
- Scrum.org, "Walking Through a Definition of Ready" — https://www.scrum.org/resources/blog/walking-through-definition-ready
- Amazon 2015 Letter to Shareholders（SEC EDGAR 原本） — https://www.sec.gov/Archives/edgar/data/1018724/000119312516530910/d168744dex991.htm
- Amazon 2016 Letter to Shareholders — https://www.aboutamazon.com/news/company-news/2016-letter-to-shareholders
- Amazon 1997 Letter to Shareholders（Type 1/2 の記述が**無い**ことの確認先） — https://www.sec.gov/Archives/edgar/data/1018724/000119312513151836/d511111dex991.htm

### このリポジトリへの含意

- **`CLAUDE.md` の「不可逆な設計判断 🔒」は、Bezos の Type 1（一方通行の扉）そのものである。** 元素量換算、per serving をソートキーにしない、導出値を保存しない、URL の `/ja/` `/en/` — いずれも「後から変えると全件再計算・全 URL 変更・法務やり直し」と書かれており、**不可逆性が判定基準として既に言語化されている。** ここに重い工程をかけるのは実務と整合する。
- **問題は、それ以外にも同じ重さをかけていることである。** Bezos が名指しした「Type 1 のプロセスを Type 2 の決定に適用する」失敗の形と一致する。**症状の記述（遅さ、考えの浅いリスク回避、実験の不足）も、実測された症状と一致している。**
- DoR については、**「完了条件が二値で判定できる形になっていること」は実務の標準であり、この組織の規約は既にそれを持っている**（`## 完了条件` の機械検査）。これは維持する根拠がある。
- 一方、**API 往復339回のうち約140回が「探す・読む」だった問題に対して、「参照すべき資料の入口が示されていること」を着手前条件に足す案は、一次情報による裏づけを持たない。** 実務の権威ではなく、**このリポジトリの実測データ**を根拠に提案すべきである。

---

## 6. 確立した実務に共通する軸は何か

### 規模を軸にしている実務は、見つからなかった

**明言する。今回一次情報に当たれた範囲で、変更の行数・ファイル数・差分の大きさを工程の重さの軸にしている実務は一つも無かった。**

行数が出てきたのは1箇所だけである — Google の「小さい変更はおおむね200行まで」。しかし**これはレビューを受けるかどうかの閾値ではない。** Google は全変更にレビューを課しており、200行は**1回のレビューの単位を小さく保て**という指示である。方向が逆で、「小さいから工程を省く」ではなく「工程を回しやすいように小さく切れ」である。

**したがって、「258行だから軽く」「1,399行だから重い」という発想は、確立した実務の中に根拠を持たない。**

### 共通していた軸は4つ

| # | 軸 | 誰が使っているか | 判定の形 |
| --- | --- | --- | --- |
| 1 | **不可逆性 / 巻き戻しコスト** | Bezos（Type 1 / Type 2）、Nygard（構造・依存・インタフェースに効くか）、ADR 実務（「スコープ・期間・リスク・コストが限定的なら書かない」）、pergram の 🔒 | 間違えたとき、取り消せるか。取り消しにいくら掛かるか |
| 2 | **曖昧さ / 代替案の実在** | Ubl（問題の複雑さ・解の複雑さ）、ADR（トレードオフが無いなら書かない）、Ubl のアンチパターン（実装手順書になる＝書かなくてよかった） | 解が一意に定まるか。真剣に検討した対案があるか |
| 3 | **リスク＝影響 × 発生可能性** | ISO/IEC/IEEE 29119（全テストに義務づけ） | 壊れたとき何が起きるか × どれくらい壊れやすいか。**相対評価**で、テストの量と種類の両方を決める |
| 4 | **変更の種類（振る舞いか構造か）** | Kent Beck（structure / behavior）、Google のレビュー種別（グリーンフィールド／バグ修正／自動生成） | 外から見える振る舞いが変わるか |

### もう一つの発見 — 工程ごとに軸が違う

**「タスクの重さ」を1つの数字やクラスで決めている実務は、見つからなかった。** 代わりに、**工程ごとに別の問いを立てている。**

| 工程 | 何で決めるか |
| --- | --- |
| 設計文書 | **曖昧さ**（代替案が実在するか）。要否の二値ではなく、ミニ設計文書という中間段がある |
| レビュー | **原則として全件やる。** 深さではなく**観点**を変更の種別で変え、自動化で負荷を下げる |
| テスト | **リスク**（影響 × 発生可能性）。工数の配分も、使う技法も変える |
| 決定の記録 | **不可逆性**（将来の担当が理由を知らずに元に戻しうるか） |

**この組織が「1タスク＝1つの重さ」で全工程を一括に決めていることが、実務との最大の乖離である。** 設計は不要だがテストは厚くすべきタスク（例: 低曖昧・高リスクな単価計算の修正）や、設計は要るがテストは既存の通過で足りるタスク（例: 構造だけの整理）が、実務では普通に存在する。

### 逆方向の注意点

調査の中で、**「軽くする」方向に一方的に倒すことを戒める記述も複数あった。** 併記しておく。

- Google は**全変更にレビューを要求する**。省くのではなく、単位を小さくし観点を絞り自動化する
- 29119 は、High-High のリスクに Low-Low の9倍の工数を割くことも否定している。**重い側にも上限がある**
- DoR を厳格な通過門にすることには、実務側にも懐疑がある。**着手前条件を増やすこと自体にコストがある**
- Fowler は、内部品質への投資は "pays off in weeks not months"（数か月ではなく数週間で回収される）と述べている。**整理を後回しにする判断も、無条件には支持されていない**

---

## 7. 確認できなかったこと（一覧）

推測で埋めていない箇所を、ここにまとめる。

| # | 確認できなかったもの | 理由 |
| --- | --- | --- |
| 1 | ISO/IEC/IEEE 29119-1:2022 の用語定義（risk / risk level / risk exposure / risk-based testing）の**逐語** | ISO Online Browsing Platform が 403。公開プレビュー PDF は本文抽出不可。本文は有償 |
| 2 | 『Tidy First?』の**各章の本文・章タイトルの逐語**、および経済性（オプション価値・DCF）の章が提示する具体的な判断規則 | O'Reilly が 403、著者 Substack の該当記事は有料購読者限定、第三者掲載サイトは停止中。確認できたのは公式紹介文・Part 構成・著者サイトの要約まで |
| 3 | Martin Fowler の「**アーキテクチャとは変更が高くつく決定である**」の逐語 | martinfowler.com/architecture/ 上に見当たらず、原典 "Who Needs an Architect?" は PDF のみで本文抽出不可。**この定式を Fowler の言葉として引用する根拠は、現時点では無い** |
| 4 | 「**参照すべき資料・入口が示されていること**」を Definition of Ready の項目として挙げる一次情報 | Agile Alliance の定義にも INVEST にも該当項目が無い。確認できたのは「完了条件・受け入れ条件が明示されていること」まで |
| 5 | Google の "**major project**"（設計文書を要求する対象）の規模の定義 | 『Software Engineering at Google』第10章にも Ubl の記事にも、規模による定義は存在しない。**存在しないことが確認できた**と言ってよい |

なお、依頼にあった「Bezos の1997年株主書簡における一方通行の扉」は、**1997年の書簡には存在しないことを確認した**（§5 参照）。該当するのは 2015年（導入）と 2016年（運用規則）である。

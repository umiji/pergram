# X のアルゴリズム — 一次調査の結果

**調査日: 2026-09-04 / 調査者: org-design-T-044 / 対象タスク: T-044**

---

## 0. この文書の位置づけ

### なぜ作ったか

`X_growth_design.md`（T-031）の露出モデルは、**X のアルゴリズムを一度も調べずに組まれている。**
根拠は自アカウントの 17imp / 16imp の2件と、二次情報のブログ記事だけだった。
14日の KGI はリプライ由来の流入が主戦場であり、**その向きが逆なら計画全体が空振りする。**

### 何を出典として認めたか

| 種別 | 扱い |
|---|---|
| **一次情報** | X（xai-org）が公開している推薦アルゴリズムのソースコードそのもの。**定数・条件式・フィルタの並び順を直接読んだ。** 本書ではこれを「一次」と書く |
| **二次情報** | 個人ブログ・SaaS のマーケ記事。**数字が一次と食い違ったときは一次を採る。** 一次に対応する記述が無い論点だけ、二次のまま採る |
| **推測** | **本書には書かない。** 一次でも二次でも裏が取れなかった論点は「裏が取れなかった」と明示して空欄で残す |

### 一次情報の所在

| | |
|---|---|
| リポジトリ | `xai-org/x-algorithm` — https://github.com/xai-org/x-algorithm |
| 説明 | "Algorithm powering the For You feed on X"（Apache-2.0） |
| 公開開始 | 2026-01-19（GitHub API の `created_at`） |
| 読んだ時点 | **commit `9b0dc31` / 2026-09-04T00:37:40Z**（`main` の HEAD）。以下のリンクはすべてこの commit に固定してある |
| 更新頻度 | ほぼ毎日 `Open-source X Recommendation Algorithm` という commit が入る |

**リポジトリ自身が「本番の既定値を cron でコードへ書き戻している」と明言している** — つまり `param.rs` の
`default` は本番値である。出典: [README.md — Experiments and Configuration](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/README.md)

> "we run cron scripts that set the defaults in this repository's code to be the primary production values, for example in `home-mixer/params/param.rs`"

**2023年の `twitter/the-algorithm` は別物である。** そちらの最終更新は 2025-09-08 で、しかも公開されている
重みの `default` は**全部 0.0**（本番値は伏せられている）。
出典: https://github.com/twitter/the-algorithm/blob/main/home-mixer/server/src/main/scala/com/twitter/home_mixer/param/HomeGlobalParams.scala

**世に流通している「会話150倍・リプ27倍・RT20倍・ブックマーク10倍」は、この 0.0 のファイルからは出てこない。**
出所は後述（§1.4）。

---

## 1. エンゲージメントの重み

### 1.1 仕組み — 重みは「回数」ではなく「確率」に掛かる

For You の並び順は、**閲覧者ひとりひとりについて**次の式で決まる。

```
Final Score = Σ ( weight_i × P(action_i) )
```

`P(action_i)` は「**この閲覧者がこの投稿に対してその行動を取る確率**」の予測値であって、
投稿に付いた実際のいいね数・リプ数ではない。

出典: [README.md — Scoring and Ranking](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/README.md)
および [`home-mixer/scorers/ranking_scorer.rs`](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/home-mixer/scorers/ranking_scorer.rs)

X 自身がコード内のコメントでこの誤読に釘を刺している
（[`home-mixer/params/param.rs` 285〜310行](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/home-mixer/params/param.rs)）:

> Each weight multiplies the *predicted* probability of that action (P(favorite), P(repost), …) …
> the weights do not multiply raw engagement counts. One common misinterpretation is that you can
> read these weight ratios as count equivalences

**運用上の意味**: 「リプ1件はいいね10件ぶん」という換算は成立しない。
重みが教えてくれるのは**どの行動を取らせる投稿を作るべきか**であって、行動の交換レートではない。

### 1.2 重みの実数（一次・本番既定値）

出典はすべて [`home-mixer/params/param.rs`](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/home-mixer/params/param.rs)。
一覧の完全性は [`ranking_scorer.rs` の `applied_weights_map()`](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/home-mixer/scorers/ranking_scorer.rs) で確認した。

| 行動 | パラメータ名 | 重み | いいね比 |
|---|---|---|---|
| **リンクをコピーして共有** | `share_via_copy_link` | **20.0** | **40倍** |
| 相互フォロー相手の投稿へのリプ | `reply` + `bidirectional_follow_reply_weight_boost` | **5.0 + 15.0 = 20.0** | 40倍 |
| リプライ | `reply` | **5.0** | 10倍 |
| 引用 | `quote` | **5.0** | 10倍 |
| DM で共有 | `share_via_dm` | 5.0 | 10倍 |
| **著者をフォロー** | `follow_author` | **4.0** | **8倍** |
| 共有（メニュー） | `share` | 2.0 | 4倍 |
| リポスト | `retweet` | **1.0** | **2倍** |
| **いいね** | `favorite` | **0.5** | 1倍（基準） |
| 投稿をクリック | `click` | 0.4 | 0.8倍 |
| リンクを開く | `open_link` | 0.2 | 0.4倍 |
| 動画を開く | `video_open` | 0.07 | |
| 滞在（dwell） | `dwell` | 0.05 | |
| 画像を開く | `photo_expand` | 0.05 | |
| 引用先クリック | `quoted_click` | 0.05 | |
| 未読の投稿 | `post_unexplored` | 0.02（**フォロー中の投稿のみ**） | |
| 滞在時間（連続値） | `cont_dwell_time` | 0.004 | |
| **プロフィールをクリック** | `profile_click` | **0.0** | **0倍** |
| 動画の質の高い視聴 | `vqv` | 0.0 | 0倍 |
| 滞在しなかった | `not_dwelled` | **-0.02** | |
| 著者をブロック | `block_author` | **-31.2** | |
| 興味がない | `not_interested` | **-43.2** | |
| 著者をミュート | `mute_author` | **-58.8** | |
| 通報 | `report` | **-234.0** | |

**ブックマーク（保存）はこの一覧に存在しない。** 予測対象の行動としても、重みとしても無い。
README の行動一覧も `favorite / reply / repost / quote / share / share via DM / share via copy link` で、
ブックマークを含まない。2023年版のコードには `home_mixer_model_weight_bookmark` が存在したが、
**2026年版の重み一覧からは消えている。**

### 1.3 この節から出る、運用に効く3つの事実

| # | 事実 | どこに効くか |
|---|---|---|
| **W-1** | **最も重い正の行動は「リンクをコピーして人に送る」（20.0）である。**「保存」ではない | `X_growth_design.md` §5.4 |
| **W-2** | **プロフィールクリックの重みは 0.0 である。** 押されても**次の露出は1ミリも増えない** | §2.4 / §6.6 の判定指標 |
| **W-3** | **相互フォローの相手の投稿に対しては、閲覧者がリプする確率の重みが 5.0 → 20.0（4倍）になる。** つまり**相互フォローの相手のフィードで、自分の投稿が有利になる**（重みが掛かるのは「相手が自分にリプする確率」の側である。向きを間違えないこと） | 新規（§2.7 として追加） |

**W-2 について誤読しないこと。** プロフィールクリックは pergram の**流入の導線としては依然として正しい**
（プロフィール → 固定ポスト → LP）。無価値になったのは「アルゴリズム上の見返り」であって、
**事業上の変換ではない。** ただし「プロフィールクリック率を上げれば露出が増える」という因果は**存在しない**。

### 1.4 二次情報との突き合わせ

| 二次情報の主張 | 一次情報 | 判定 |
|---|---|---|
| 会話（返信→著者が返信）**150倍** | 2026年版の予測行動一覧に `reply_engaged_by_author` は**存在しない**。2023年版には存在したが `default = 0.0` | **採らない** |
| リプライ **27倍** | `reply` 5.0 ÷ `favorite` 0.5 = **10倍** | **10倍へ訂正** |
| リポスト **20倍** | `retweet` 1.0 ÷ `favorite` 0.5 = **2倍** | **2倍へ訂正。10分の1である** |
| ブックマーク **10倍** | **重みそのものが存在しない** | **採らない** |

出所の特定: 二次情報の一つ https://www.autotweet.io/statistics/x-twitter-algorithm-statistics は、
これらの数字に `Source: X open-source ranker · 2023 release` と自ら注記している。
**2023年版のコードの `default` は全部 0.0 なので、この数字はコードから読めるものではない。**
2023年当時のコミュニティ推計が、3年ぶんの更新を挟まずに 2026年の記事へ流れ込んでいる。

---

## 2. 初速 — 「最初の30〜60分」は一次情報では確認できなかった

### 2.1 裏が取れなかったこと

**「最初の30分が最終的な到達の70%を決める」「30〜60分のエンゲージメント速度で配信量が決まる」**
に対応する定数・条件式は、`xai-org/x-algorithm` の中に**見つからなかった。**
`param.rs` を `velocity` / `engagement_rate` / `initial` / `first_` で検索しても該当が無い。

二次情報の側も、この主張にだけ `Source: Industry consensus · 2026`（＝業界の通説）と注記しており、
**コード由来だとは主張していない**（同上 autotweet.io）。

**結論: この数字は本設計の根拠に使わない。**

### 2.2 一次情報にある「時間の窓」は、別の数字である

代わりに、時間に関する条件式は次の4つが実在した。

| # | 窓 | 値 | 出典 |
|---|---|---|---|
| T-1 | **新規著者ブーストが効く投稿の年齢** | **24時間**（`ColdStartMaxPostAgeSecs = 86400`） | [`param.rs`](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/home-mixer/params/param.rs) |
| T-2 | **新規著者ブーストが切れる表示回数** | **ホーム表示 1,000回**（`ColdStartImpressionThreshold = 1000`） | 同上 |
| T-3 | For You の候補から落ちる投稿の年齢 | **48時間**（`AgeFilter`） | [README.md — Filtering](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/README.md) |
| T-4 | 新規投稿がすぐ推薦対象になれる理由 | 埋め込みがハッシュベースで、語彙表の更新を待たない | [README.md — Key Design Decisions 3](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/README.md) |

**運用上の意味は「30分で決まる」の逆である。**
@pergram_jp は1投稿あたり17imp なので、T-2（1,000表示）には**まず到達しない**。
つまりブーストを失う原因は表示回数ではなく**時間**だけであり、**窓は24時間まるごと残っている。**
投稿後30分で数字が動かなくても、その投稿はまだ終わっていない。

---

## 3. フォロワーが少なくても露出が出る経路

### 3.1 一次情報にある唯一の明示的な経路 — 新規著者ブースト

[`home-mixer/scorers/author_cold_start.rs`](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/home-mixer/scorers/author_cold_start.rs) に、
**フォロワーの少ない著者の投稿をフィードの上位へ持ち上げる処理が実在する。**

適格条件（`cold_start_base_eligible` と `apply_cold_start` の `filter` 節をそのまま読んだもの）:

| # | 条件 | 定数 / 関数 | @pergram_jp（フォロワー16）は |
|---|---|---|---|
| C-1 | **著者のフォロワー数が 1,000 以下** | `ColdStartFollowerCap = 1000` | **満たす** |
| C-2 | **その投稿のホーム表示回数が 1,000 未満** | `ColdStartImpressionThreshold = 1000` | **満たす**（17imp） |
| C-3 | **リプライではない**（`in_reply_to_tweet_id.is_none()`） | `cold_start_base_eligible` | 自前ポストのみ **満たす** |
| C-4 | **リポストではない**（`retweeted_tweet_id.is_none()`） | `cold_start_base_eligible` | 満たす |
| C-5 | その閲覧者への素点が、素点のある候補の上位85%に入っている | `LowImpressionsMaxPositionRatio = 0.85` | 不明 |
| **C-6** | **🔴 閲覧者の実験群と、著者のバケットが噛み合っている** | `cold_start_corpus_eligible` | **不明**（下記） |
| **C-7** | **投稿が24時間以内** | `ColdStartMaxPostAgeSecs = 86400` | **Treatment 群の閲覧者にしか掛からない**（下記） |

**C-6 — これは実験中の機能である。** `cold_start_corpus_eligible` は次のとおり。

| 閲覧者の群（`ViewerArm`） | 著者に要求されること |
|---|---|
| `Holdout` | 著者のバケットは問わない（候補が Phoenix MoE 由来でなければよい） |
| `Control` | **著者が `AuthorCorpus::Control` に入っていること** |
| `Treatment` | **著者が `AuthorCorpus::Treatment` に入っていること** |

著者のバケットは `AuthorRulesEvaluator` が `AuthorIsControl` / `AuthorIsTreatment` で決める。
**あるアカウントがどれに入っているかを、外から知る手段は無い。**

**C-7 — 24時間の窓は全員には掛からない。** `cold_start_freshness_eligible` は
`if arm != ViewerArm::Treatment { return true; }` で始まる。
**Holdout / Control の閲覧者に対しては、投稿の年齢を一切見ない**（それでも §2.2 T-3 の
`AgeFilter` 48時間は前段で効く）。

**効果**: 条件を満たした候補のうち1件が、そのリクエストの**15〜16番目のスロット相当の点数まで引き上げられる**
（`ColdStartSlotMin = 15` / `ColdStartSlotMax = 16`）。スイッチ自体は既定で有効（`EnableViewerColdStart = true`）。

**これは「フォロワーがいないから配信されない」という前提を、一次情報が正面から否定している。**
X は**フォロワー1,000人以下の著者を優遇する仕組みを持っている。**

**⚠ ただし「仕組みがある」と「それが自分に適用されている」は別である。**
C-6 のとおり、これは実験中の機能であり、**適用されているかどうかは観測できない。**
`X_growth_design.md` §10 U-8 では、これを原因の候補の3つ目として明示した。

### 3.2 ただし、この経路はリプライには効かない

C-4 / C-5 のとおり、**リプライとリポストはブーストの対象外である。**
そして、それとは別に、より強い制限が前段にある。

### 3.3 🔴 最重要 — 他人へのリプライは、For You フィードに一切出ない

[`home-mixer/filters/oon_retweet_reply_filter.rs`](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/home-mixer/filters/oon_retweet_reply_filter.rs) の本体は次の1行に尽きる。

```rust
(c.in_network == Some(false) && (is_retweet || is_reply))
    || (is_reply && c.ancestors.is_empty())
```

**「閲覧者がフォローしていない相手（out-of-network）のリプライとリポストは、点数を付ける前に候補から捨てられる。」**
README の Filtering 節にも `OONRetweetReplyFilter` として同じことが書いてある。

**したがって、リプライの表示回数は次の1経路だけから来る。**

```
元投稿のリプ欄を開いた人 ＋ 自分のフォロワーのフィード（こちらも割引される）
```

`OonWeightFactor = 0.75`。README:

> **Out-of-Network Discount**: posts from accounts the viewer does not follow are multiplied by a factor
> below 1, **as are replies and reposts from accounts the viewer does follow.**

つまり**フォロワーのフィードに出るときですら、リプライは 0.75 倍される。**

**この事実は T-031 の骨格（露出は他人のスレッドから借りる）を否定しない。** リプ欄を開いた人に読まれる、
という経路は実在する。**否定されるのは「リプは自前ポストより広く配信される」という暗黙の前提のほうである。**
自前ポストには §3.1 のブーストがあり、リプライには無い。

### 3.4 リプ欄の中での並び順 — 12万フォロワーが分水嶺である

[`grox/flows/reply_spam/task_filter.py`](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/grox/flows/reply_spam/task_filter.py) に、
リプライに対して**どの処理が走るか**を決める閾値が3つ、定数として書かれている。

| クラス | 定数 | 値 | 走る条件 |
|---|---|---|---|
| `TaskReplyRankingFilter` | `FOLLOWER_COUNT_THRESHOLD_FOR_REPLY_RANKING` | **120,000** | **元投稿または直接の親の著者のフォロワーが 12万を「超える」とき**だけ、Grok によるリプライの採点が走る。12万以下は `low_blast_radius` として**スキップされる** |
| `TaskSpamFilter` | `FOLLOWER_COUNT_THRESHOLD_FOR_SPAM_DETECTION` | **120,000** | 逆に、両方が **12万以下**のときだけリプライのスパム判定が走る |
| `TaskCoordinatedSpamFilter` | `FOLLOWER_COUNT_THRESHOLD_FOR_SPAM_DETECTION` | **5,000** | **まず `len(ancestors) >= 2`（返信への返信）であること。** それを通ったうえで元投稿の著者が **5,000以上**のときだけ協調スパム判定が走る。**順番が重要。**詳細は §4.3 |

採点のプロンプトには `large_account_follower_threshold` として **100,000** が渡される
（呼び出し側は
[`classifier_reply_ranking.py`](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/grox/flows/reply_spam/classifier_reply_ranking.py)
の `reply_scoring_system_prompt(100_000)`。受け取り側は
[`prompts.py`](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/grox/flows/reply_spam/prompts.py)）。
**プロンプト本文（`.j2`）は「ゲームされるのを防ぐため」意図的に非公開である**と README に書かれているので、
**何が高く採点されるかは一次情報では読めない。**

**運用上の意味 — ここが本調査の中心である。**

| 相手のフォロワー | **一次情報から言えること** | ⚠ ここから先は推論 |
|---|---|---|
| **12万超** | **Grok がこちらのリプを1件ずつ採点し、その結果を Manhattan へ書き出す**（`PlanReplyRanking` の `task_write_reply_ranking_manhattan`） | 採点があるなら**中身の質が順位に効く**はず。**ただし「書き出された点がリプ欄の並び順になる」経路はリポジトリに含まれない**（§11 P-3）。**早さが効くかどうかも分からない** |
| **12万以下** | **採点は走らない**（`low_blast_radius`）。代わりに**スパム判定が走る**（`TaskSpamFilter`） | 順位を決めるモデルが無い以上、**こちらから順位を制御する手段が無い。**かつ**文面の重複が直接の危険になる**（§4.2） |

**この表の左列だけが一次情報である。** 右列は「採点が走るなら、その点は使われているはずだ」という
推論であり、**裏は取れていない**（§7 X-3 / §11 P-3）。

**それでも露出層の軸を12万へ移す判断は成立する。** 判断に必要なのは
「12万超のスレッドでだけ、こちらのリプが個別に評価される対象になる」という**左列の事実だけ**であり、
その点がどう順位へ変換されるかを知る必要は無いからである。

---

## 4. ペナルティ側

### 4.1 「シャドウバン」の正体 — 推薦面だけから外される

可視性フィルタの規則は2段構えで並んでいる
（[`visibility-filtering/rules/registry.rs`](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/visibility-filtering/rules/registry.rs) の
`wired_rule_order_matches_pre_migration_sequence` テストが、実際の評価順を列挙している）。

| 段 | 名前 | 規則数 | 適用先 |
|---|---|---|---|
| 基本 | `TimelineHome` | **28** | **すべての投稿**（フォロワーのフィードを含む） |
| 追加 | `TimelineHomeRecommendations` | 基本の28 **＋ 26 = 54** | **フォローしていない相手へ推薦するときだけ** |

追加の26に含まれる、この運用に関係するもの:

- `DoNotAmplifyOonDropRule` — 安全ラベル `DO_NOT_AMPLIFY`
- `DoNotAmplifyNonFollowerRule` — 同上（非フォロワー向け）
- `SpamHighRecallDropRule` / `SpamHighRecallUserLabelRule` — 安全ラベル `SPAM_HIGH_RECALL`
- `AbusiveHighRecallRule`
- `MaliciousUrlOonDropRule`

対応は [`visibility-filtering/rules/tweet_rules.rs`](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/visibility-filtering/rules/tweet_rules.rs) の
`"DoNotAmplifyOonDropRule" => SafetyLabelType::DO_NOT_AMPLIFY` などで確認できる。

**「シャドウバン」と呼ばれているものの実体はこれである。**
フォロワーには見えるが、フォローしていない人の For You には出なくなる。
README:

> A further set of rules applies **only when the post is a recommendation from an account the viewer does not follow**,
> and those rules can only drop … The same post is allowed to a follower.

（件数は `registry.rs` の当該テストが列挙している名前を数えたもの。**2026-09-04 のレビューで 27 → 28 に訂正した。**）

**@pergram_jp にとっては「一部が減る」ではなく「全部が消える」に等しい。**
フォロワーが16人なので、露出はほぼ全量が推薦面から来ている。

なお `SpamTweetLabelRule`（安全ラベル `SPAM`）は**基本の27の側にある** — こちらが付くと
**フォロワーのフィードからも落ちる。**

**最初に drop と答えた規則で評価は打ち切られる**（README）。複数のラベルが付いていても、原因は1つしか見えない。

### 4.2 リプライの文面の重複は、日本語について専用の検出がある

[`botmaker-rules/scarecrow/bot/BBQDuplicateTextRepliesProd.bot`](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/botmaker-rules/scarecrow/bot/BBQDuplicateTextRepliesProd.bot)

このルールは、次の2つのバッチジョブが作った「同じ本文のリプライの塊」に対して
`COPYPASTA_SPAM` ラベルを貼る。

```
jobName == "bbq_duplicate_text_unigrams_replies" ||
jobName == "bbq_duplicate_text_characters_replies_cjk"
```

**`_cjk` — 日本語・中国語・韓国語には、文字単位で重複を見る専用のジョブがある。**
英語の単語単位の判定なら逃げられる程度の書き換えが、**日本語では文字単位で捕まる。**

ラベルの適用から除外されるのは、テストユーザー・**PageRank の高いユーザー**・**灰色バッジのユーザー**だけである
（`IsHighPageRankUser` / `IsUserGrayVerified`）。**@pergram_jp はどれにも当たらない。**

**運用上の意味**: `X_growth_design.md` §4.2 の「同じ文面を複数の相手へ貼らない」は、
**推測ではなく一次情報で裏が取れた。** しかも日本語では判定が厳しい側にある。
**テンプレは骨格としてのみ使い、本文は毎回書き直す。**

### 4.3 協調スパム判定の引き金は「深さ2以上」であって、相手の大きさではない

`TaskCoordinatedSpamFilter._eligible_with_post` は**2つの条件を順番に見る。順番が重要である。**

```python
if len(post.ancestors) < 2:          # ← 先に評価される
    ...  reason="one_level_deep";  return False
root_user_follower_count = post.ancestors[0].user.follower_count or 0
if root_user_follower_count < cls.FOLLOWER_COUNT_THRESHOLD_FOR_SPAM_DETECTION:  # 5000
    ...  reason="low_blast_radius"; return False
```

**したがって引き金は「相手が大きいこと」ではなく「深さ2以上であること」である。**
元投稿へ直接付けたリプは `ancestors` が1件しかないので、**この判定は一度も走らない。**
相手のフォロワー数（5,000以上）は、深さ条件を通った**後に**掛かる第2の条件にすぎない。

**深さ2以上とは、実務では「他人のリプへ返すとき」である。**
高 PageRank ユーザーと灰色バッジのユーザーはこの判定から除外されるが、**このアカウントはどちらでもない。**

**運用上の意味**: 会話を続けること自体は必要である（`X_growth_design.md` §9-10）。
守るのは「自分に返ってきたリプにだけ返す」「同じスレッドで3往復を超えたら移す」
「深さ2以上のリプでこそ文面を使い回さない」の3つ（同 §4.2）。

### 4.4 通報・ブロックの重みを恐れすぎないこと

`report = -234.0` は「通報1件がいいね468件を打ち消す」という意味ではない（§1.1）。
X 自身がコード内コメントで、この誤読と「大量通報で到達を潰せる」という誤解の両方を否定している。

> 2. For an account to count in the algorithms recommendation system, it must take place on a post served
> in Home Timeline. Directly navigating to a post (i.e., coordinating via groupchat) has no ranking impact.

**ただし、通報が起点になって §4.1 の安全ラベルが付く経路は別に存在する**
（`abuse-enforcement-service/` と `agatha/`。
`agatha` は「いいね数に対するブロック・通報・スパム通報の比」でアカウントを採点する — README の Content Understanding 節）。
**ランキングの重みと、可視性のラベルは別系統である。恐れるべきは後者。**

---

## 5. ツリー（連投）の本数

### 5.1 二次情報が食い違っている

| 出典 | 主張 |
|---|---|
| T-044 の申し送り | 3〜5投稿のツリーは単発比 **+40〜60%** |
| https://www.autotweet.io/statistics/x-twitter-algorithm-statistics | 5〜9投稿のツリーは単発比 **約3倍**、注記は `Source: X open-source ranker + observed data · 2026` |

**本数の範囲も倍率も一致しない。** 一致しない2つの二次情報は、どちらも根拠にならない。

### 5.2 一次情報が言っていること

**ツリーの2投稿目以降は、技術的にはリプライである**（`in_reply_to_tweet_id` が入る）。したがって §3.3 がそのまま効く。

| # | 事実 | 出典 |
|---|---|---|
| **TH-1** | **2投稿目以降は、フォローしていない人の For You に一切出ない**（`OONRetweetReplyFilter`） | §3.3 |
| **TH-2** | **2投稿目以降は、新規著者ブーストの対象外**（`cold_start_base_eligible` が `in_reply_to_tweet_id.is_none()` を要求） | §3.1 C-4 |
| **TH-3** | フォロワーのフィードに出るときも 0.75 倍される（`OonWeightFactor`、リプライにも適用） | §3.3 |
| **TH-4** | `DedupConversationFilter` が同じ会話の枝を畳む | README |
| **TH-5** | 相互フォローのリプ重みブースト（+15.0）は、**リプライには適用されない**（`bidirectional_boost_eligible` が `in_reply_to_tweet_id.is_none()` を要求） | [`ranking_scorer.rs`](https://github.com/xai-org/x-algorithm/blob/9b0dc319691b76088266d0d2b48faf22d2b8a82a/home-mixer/scorers/ranking_scorer.rs) |

**本数を増やしても、増えた投稿そのものは新しい配信面を1つも獲得しない。**

ツリーが理屈のうえで効きうるのは、1投稿目への**滞在時間**（`dwell` 0.05 / `cont_dwell_time` 0.004）と
**投稿クリック**（`click` 0.4）を通じてだけである。**いずれも正の重みの中では小さい側にある**（最大は 20.0）。

### 5.3 判定

**ツリーは2投稿（本体＋リンク）を維持する。3〜5本へ増やさない。**

理由: (1) 二次情報が互いに矛盾している (2) 一次情報は「増やした投稿は配信面を得ない」ことを示している
(3) 増やせば1本あたりの手作業が増え、**1日60〜90分という制約を直接圧迫する**。

**ただし「観測の結果として伸びたら増やす」という道は閉じない。** 一次情報が言えるのは
「アルゴリズムがツリーを優遇する仕掛けは無い」までであって、「読者がツリーを好まない」ではない。

---

## 6. 保存（ブックマーク）の扱い

### 6.1 判定

`X_growth_design.md` §5.4 の「**保存は KGI への寄与が低い**」という結論は**正しい。**
ただし理由は書かれているものより強い。

**ブックマークは、For You のランキングに使われる行動の一覧に存在しない**（§1.2）。
寄与が「低い」のではなく、**ランキング上の寄与はゼロである。**

申し送りにあった「ブックマークの重み10倍」は、2023年版に存在した `home_mixer_model_weight_bookmark`
（`default = 0.0`）に由来する推計と考えられ、**2026年版には該当するパラメータが無い。**

### 6.2 ただし §5.4 の「保存」列は、置き換えるべきである

**最も重い正の行動は `share_via_copy_link = 20.0` — 投稿のリンクをコピーして誰かに送る行動である。**
いいねの40倍で、全行動中の最大値。次が DM 共有（5.0）と共有メニュー（2.0）。

**「後で見返したくなる投稿」と「人に送りたくなる投稿」は、作り方がほとんど同じである。**
どちらも「数え上げ・レンジ・単位の定義を表の形で置く」で作れる。
**同じ手間で、重み0の行動ではなく重み20.0の行動を取りにいける。**

---

## 7. 一次情報で裏が取れなかった論点（明示）

**以下は推測で埋めていない。設計の根拠に使わない。**

| # | 論点 | 状況 |
|---|---|---|
| **X-1** | **「最初の30〜60分」の初速が配信量を決める** | 対応する定数・条件式が見つからない。二次情報の側も「業界の通説」と自認している |
| **X-2** | **ツリー3〜5本が単発比 +40〜60%** | 二次情報どうしが矛盾（+40〜60% vs 約3倍）。一次情報には該当なし |
| **X-3** | **リプ欄の中で「早い順」が有利かどうか** | 12万以下のスレッドではリプの採点が走らないことまでは分かったが、**では何で並ぶのかは公開されていない** |
| **X-4** | **12万超のスレッドで、Grok が何を高く採点するか** | プロンプト（`.j2`）は「ゲーム防止のため」意図的に非公開と README に明記 |
| **X-5** | **シャドウバンの実務的な閾値**（1日何件のリプで危ないか） | **数値の閾値は公開されていない。** 分かったのは「何をすると何のラベルが付くか」までで、「何件で付くか」ではない |
| **X-6** | **「500フォロワーで50リプ」が「1万フォロワーで20いいね」を上回る** | 重みが確率に掛かる（§1.1）以上、この形の比較は一次情報では表現できない |
| **X-7** | **ゼロフォロワーが10日で56万インプ**（indiehackers） | 個人の申告であり、検証手段が無い。**ただし §3.1 の新規著者ブーストは、この種の話に実在する仕組みの裏付けを与える** |
| **X-8** | **X の検索演算子 `since_time:` / `until_time:` が最新タブで効くか** | X の検索は本リポジトリの対象外（For You フィードのみ）。**config.yaml で実測済みなのは `min_faves:` / `min_retweets:` / `min_replies:` / `lang:` / `-filter:replies` だけ。`from:` も未実測** |

**X-5 は運用に直結するので補足する。** 数値の閾値が無い以上、`X_growth_design.md` §4.2 の
「1日12件を超えない」という自主上限は、**根拠が無いまま置かれた安全弁である。** それでよい。
一次情報が代わりに教えてくれたのは、**件数より文面の重複のほうが直接の危険**だということである（§4.2）。

---

## 8. `X_growth_design.md` へ反映したこと

| # | 反映先 | 内容 |
|---|---|---|
| 1 | §2.2 | 露出層リプの選び方の軸を「**投稿がもう伸びたか**」から「**相手のフォロワーが12万を超えるか**」へ変更 |
| 2 | §2.6（新設） | 相互フォローの価値（重み+15.0）と、自前ポストが新規著者ブーストの窓の中にいること |
| 3 | §4.3 | 検索式を全面的に書き換え。**watchlist 式 / 発見式 / 窓の探索式**の3本立てへ |
| 4 | §4.2 | 文面の重複に一次情報の裏付けを追記（CJK 専用ジョブ）。1スレッド1件の上限を追加 |
| 5 | §5.4 | 「保存」列を「**コピーして送られる**」列へ置き換え |
| 6 | §5.8（新設） | ツリーは2投稿を維持する判定 |
| 7 | §10 | U-8〜U-11 を追加（裏が取れなかった論点のうち、設計を動かしうるもの） |
| 8 | §11 | `watchlist` を新語として登録 |

**2026-09-04 のレビュー（T-044 往復1回目）で直した点**

| # | 何を直したか |
|---|---|
| 1 | **協調スパム判定の適用条件の誤読**（本書 §4.3 / design §2.2 §4.2）。引き金は「相手が5,000以上」ではなく **`len(ancestors) >= 2`**。design 側は「1スレッド1件」の根拠をこの判定に置いていたが、**元投稿への直リプでは一度も走らない。**根拠を運用上の理由へ書き換え、**本当の引き金（返信への返信）に対する注意を design §4.2 へ新設した** |
| 2 | **リプ欄の並び順が中身で決まる、という推論を事実と分離**（本書 §3.4 / design §2.2）。一次情報が示すのは「採点が走る」ことまでで、**採点結果が並び順になる経路はリポジトリに無い**（§11 P-3）。**軸を12万へ移す結論は左列の事実だけで支持できるので変えていない** |
| 3 | **新規著者ブーストの実験群の条件が落ちていた**（本書 §3.1 C-6 / C-7、design §2.6）。適格性は閲覧者の群と著者のバケットに依存し、**24時間の窓は Treatment 群にしか掛からない。**これにより design §10 U-8 に**第三の可能性（そもそも適用されていない）**を追加した |
| 4 | **可視性規則の件数**（本書 §4.1）。`TimelineHome` は 27 → **28**、合計 **54** |
| 5 | **「経過が短い順に打つ」が未検証の前提であることを明示**（design §4.3 / §3.2 / §8-N、§10 U-12 を新設）。§7 X-3 を根拠として使ってしまっていた |
| 6 | `large_account_follower_threshold = 100000` の出典（本書 §3.4）と、W-3 の向き（本書 §1.3） |

---

## 9. 採用しなかった案と却下理由

| 案 | なぜ却下したか |
|---|---|
| **A. `min_faves:` を単純に下げる（50 → 10）だけで済ませる** | `min_faves` は「相手の大きさ × 経過時間」の積でしか動かない。値をいくつにしても、**大きいアカウントの投稿直後**だけを取り出せない。軸そのものを変える必要がある（§3.4） |
| **B. `min_faves:` を捨てて素の検索語だけにする** | config.yaml に実測済みの制約がある — 最新タブに素の検索語だけを渡すと、まだ伸びていない小さい投稿ばかりが返る。**露出層としては使えない**（それは意図層である） |
| **C. `since_time:` で「直近30分」を機械的に切る** | この演算子が最新タブで効くかを**実測していない**（X-8）。効かない場合、その文字列の検索になって結果が壊れる。**未実測の演算子を日次運用の中心に置かない** |
| **D. 露出をリプライから自前ポストへ全面的に戻す** | §3.1 のブーストは実在するが、**@pergram_jp の実測は17imp である。** 仕組みがあることと、それが効いていることは別。**設計の骨格を1本の調査でひっくり返さない**（PO 判断事項として §10 U-8 に残した） |
| **E. リプライの送信を自動化して件数を稼ぐ** | `.claude/rules/pergram-compliance.md` と `rules.md` に反する。**アルゴリズム上の有利は、法令順守と規約順守に劣後する。** かつ §4.2 の重複検出に最短で当たる打ち手でもある |
| **F. ブックマークを狙う投稿設計を残す** | ランキング上の寄与がゼロであることが一次情報で確定した（§6.1）。**同じ作り方で重み20.0 の行動を狙えるので、狙う先を変えるほうが安い** |
| **G. プロフィールクリック率を露出の指標として使い続ける** | 重み 0.0（§1.2）。**ただし流入の導線としては正しいので、指標としては残した**。変えたのは「これを上げれば露出が増える」という因果の記述だけ |

---

## 10. 法令順守の確認

**本書のどの提案も、`CLAUDE.md` の禁止事項 N-01〜N-10 と
`.claude/rules/pergram-compliance.md` に触れない。** 確認した点:

- watchlist は**投稿を読む相手の一覧**であって、症状・体調の情報を一切扱わない（N-01 / N-05）
- リプライの内容に関する提案は**していない**。変えたのは「誰のスレッドへ打つか」だけで、
  成分の機能に言及する文章はホワイトリスト方式のまま
- **リプ・いいね・フォローの自動化は提案していない**（§9-E で明示的に却下した）
- アルゴリズム上有利になる打ち手であっても、**法令・規約に触れるものは採らない**

---

## 11. この設計が依拠している前提（崩れたら無効になる）

| # | 前提 |
|---|---|
| P-1 | **`param.rs` の `default` が本番値である。** README の記述に依拠している。X が cron を止めれば崩れる |
| P-2 | **読んだのは commit `9b0dc31`（2026-09-04）である。** このリポジトリはほぼ毎日更新される。**14日の運用期間中に定数が変わりうる。** 特に `ColdStartFollowerCap = 1000` と `FOLLOWER_COUNT_THRESHOLD_FOR_REPLY_RANKING = 120000` は本設計の中心なので、**Day7 のゲートで再確認する** |
| P-3 | **公開されているのは For You フィードの部分だけである。** 検索・トレンド・通知・リプ欄の実際の並び順の serving は含まれない。§3.4 で分かったのは「採点が走るかどうか」までで、「その点がどう順位になるか」ではない |
| P-4 | **フォロワー数の判定は `from:` 演算子と手作業の確認に依存する。** 検索演算子でフォロワー数を絞ることはできない（config.yaml で実測済み） |

---

## 12. 新しく定義した語

| 語 | 意味 |
|---|---|
| **watchlist** | **フォロワー12万超であることを人が確認済みの、日本語のアカウントの一覧。** 露出層リプの相手をここから選ぶ。検索演算子ではフォロワー数を絞れないため、`from:` の列挙で代用する。作成と更新は週1回の別作業（`X_growth_design.md` §4.3） |
| **新規著者ブースト**（cold start boost） | フォロワー1,000人以下の著者の、24時間以内・ホーム表示1,000未満の**自前ポスト**を、For You の15〜16番目のスロット相当まで引き上げる処理（§3.1） |
| **推薦面**（out-of-network / OON） | フォローしていない人のフィードへ出る面。**@pergram_jp の露出はほぼ全量がここから来る。**「シャドウバン」とはこの面だけから外されることを指す（§4.1） |

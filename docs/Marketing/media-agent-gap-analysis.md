# .media-agent 機構の課題抽出と対策設計

作成日: 2026-09-03 / 担当: `org-design-T-032`（AIエンジニア役）/ タスク: [T-032](../tasks/T-032.md)

**この文書が答えるのは 1 つだけである — 「投稿を作って・通して・出して・測る経路が、いま実在するか」。**
どういう投稿を打つべきかは扱わない（それは T-031 の領分）。

---

## 0. 対象範囲

| | |
|---|---|
| **カバーする** | `.media-agent/x/pergram-jp/` の設定と、`media-agent` CLI（実体 `~/.local/bin/media-agent.exe` / 編集可能インストールの実体は `C:\Users\kaiki\Workspace\03_Dev\media-agent-bmad\src\media_agent`）の投稿経路・計測経路。Buffer 連携。`.claude/commands/media-*.md` の呼び出し層 |
| **カバーしない** | 投稿の中身・型の設計（T-031）。X のアルゴリズム論。LP 側の改修。`media-agent` 本体の実装そのもの（**このリポジトリ外のプロジェクトである**） |
| **確認手段の制約** | `post` / `run` / `research` / `x` 系は**実行していない**（AI 生成のコストと、捨てアカウント凍結のリスクを避けるため / T-032 禁止事項）。したがって「生成がどんな文を吐くか」は未確認であり、この文書の判定はすべて**コードと設定と読み取り系コマンドの出力**に基づく |

### 前提・制約（崩れたらこの設計は無効になる）

1. **Day1 = 2026-09-03、Day7 ゲート = 9/9、終端 = 9/16。** 対策に使える時間は 3 日程度しかない
2. **手作業は 1 日 60〜90 分確保できる。** 完全自動化は目的ではない
3. **`media-agent` 本体はこのリポジトリの外にある。** 本体を変更する対策は、このタスク台帳の管理外で行われ、再インストールと回帰の責任も外にある
4. `publisher.connector: buffer` / `publisher.buffer.schedule: draft` / `policy.actions.post.mode: approval` のまま（`mode show` = draft）
5. Buffer の API には**投稿の削除・更新の mutation が無い**（[x-drafts-2026-09-03.md](x-drafts-2026-09-03.md)）。出す前に確定させるしかない

---

## 1. 機構の現況マップ

### 1.1 各段が何によって実行されるか

| 段 | 実行主体 | 実体（ファイル） | 人手に落ちている箇所 | 今の状態 |
|---|---|---|---|---|
| **収集** | Google News コネクタ（10 クエリ） | `connectors/google_news.py` / `research_cmd.py` | なし | **Source 0 件**（`status`） |
| **生成** | Claude Code CLI を `subprocess` で 3 回起動 | `agents/content.py` の `_generate` / `providers/claude_code.py` | なし。**手書き本文を入れる口が無い** | 未実行 |
| **評価** | (1) 禁止表現の機械検査 (2) 重複判定 (3) LLM 採点（候補ごとに 1 回） | `agents/content.py` の `_screen` / `core/rules.py` / `core/memory/` | なし | (1) は**実質無効**（G-05）、(2) は**記憶 0 件で無効**（G-11） |
| **承認** | PolicyEngine が承認キューへ積む | `core/policy/engine.py` / `agents/publisher.py` L130-140 | **出口が無い**。`approval list` で見るだけ | 承認待ち 0 件 |
| **配信** | Buffer GraphQL `createPost`（`saveToDraft: true`） | `connectors/buffer.py` | **Buffer の画面で公開操作**。ツリーも人が手で繋ぐ | 送信済み 9 件（すべて DB の外） |
| **計測 (a)** | X 読み取り → `performance` → `report` | `cli/commands/x_cmd.py` の `x metrics` / `agents/analytics.py` の `MetricsIngest` | なし | **performance 0 件 / report 空** |
| **計測 (b)** | Buffer の送信済み一覧を読んで**表示するだけ** | `cli/commands/queue_cmd.py` の `queue metrics` | 人が画面を読む | 9 件・imp 合計 73・**click 全件 0**・like は全件取得不可 |

### 1.2 いま通っている線と、切れている線

```
                        ┌──────────────────────────────────────┐
収集 ─▶ 生成 ─▶ 評価 ─▶ │ 承認 ─✕(出口なし)─▶ 配信            │ ─▶ Buffer(下書き)
0件     未実行  実質無効 └──────────────────────────────────────┘        │
                                                                         │ 人が画面で公開
  ┌────────────── 手書き本文 ─✕(入口なし)──────────────────────┘         ▼
  │                                                                   X に出る(9件)
  │ 9/3 の 4 件はここを迂回して BufferConnector を直接叩いて登録した     │
  │                                                                    │
計測(a) x metrics ─▶ performance ─▶ report : Post 行が 0 なので永久に空 ─┘
計測(b) queue metrics ─▶ 画面に出すだけ（DB へ入らない / 型と結びつかない）
```

**要点は 2 つ。**

- **入口（手書き本文）と出口（承認済みを配信）の両方が塞がっている。** どちらか一方ではない
- **配信と計測が同じ ID で繋がっていない。** `Post` に外部 ID の列が無く（`core/domain/entities.py` の `Post`）、Buffer が返す `buffer:<id>` は `agents/publisher.py` の `_record_success` で**捨てられている**

### 1.3 実行して確認した出力（要約。全文は付録 A）

| コマンド | 結果 |
|---|---|
| `media-agent doctor -a x/pergram-jp` | 全 7 項目 PASS（DB schema v5） |
| `media-agent doctor`（アカウント省略） | **FAIL 3 件**（旧レイアウトを見に行く。G-16） |
| `media-agent status -a x/pergram-jp` | Source 0 / Content Memory 0 / Task 0 / **Post 0** |
| `media-agent queue list` | draft 0 / queued 0 / failed 0 |
| `media-agent approval list` | 承認待ち 0 |
| `media-agent report` | 投稿済み 0 / 指標あり 0。「`x metrics` で取り込めます」と表示 |
| `media-agent playbook list` | 採用済み 7 本（使用中 `unit-price`）/ 提案 0 |
| `media-agent mode show` | `draft` |
| `media-agent env check` | 必須 3 キーすべて設定済み |
| `media-agent queue channels` | チャンネル 1 件・スロット表は全曜日 3 枠（08 時台 / 12 時前後 / 18 時前後） |
| `media-agent queue metrics --limit 20` | **送信済み 9 件**。imp 合計 73 / like は全件取得不可 / **click 全件 0** |
| SQLite 直読み | `post` 0 / `performance` 0 / `memory_entry` 0 / `x_observation` **24** / `x_trend` 0 |

---

## 2. 課題の一覧

深刻度の基準はこう置いた。**Blocker = 14 日の KGI を追う経路そのものが成立しない。Major = 成立はするが判断を誤る。Minor = 手間が増える。**

### G-01 ｜ 手書き本文を正規の経路へ入れる口が無い ── Blocker

- **事象**: `post` / `run` は必ず LLM が本文を生成する。既に人が確定させた本文を候補として登録できない
- **根拠**: `media-agent post --help` / `run --help` に本文を渡す引数が無い（`--persona` `--playbook` `--dry-run` `--allow-empty-history` のみ）。`core/runtime/workflow.py` L82-97 は `research → content → publisher` の固定順で、`content` を飛ばす分岐が無い。`cli/commands/post_cmd.py` の末尾は「このコマンドは投稿を行いません。送信は `media-agent run` の経路だけです。」
- **KGI への影響**: PO が承認した文面を、1 日 2 本の上限・重複判定・禁止表現の検査・DB 記録のいずれも通せない。9/3 の 4 件は `BufferConnector` を直接呼ぶスクリプトで登録した（[x-drafts-2026-09-03.md](x-drafts-2026-09-03.md) の「登録の経路について」）

### G-02 ｜ 承認された投稿を配信する口が無い（承認キューが行き止まり） ── Blocker

- **事象**: `policy.actions.post.mode: approval` のとき、`run` は承認キューへ積んで `status=queued` にして終わる。そこから先へ進めるコマンドが**存在しない**
- **根拠**: `agents/publisher.py` L130-140（APPROVAL なら `enqueue_approval` して return）。CLI 全体に承認を通すコマンドが無い（`grep -rn "approve" src/media_agent` のヒットは `core/initializer.py:60` の雛形ファイル名 `"media-approve.md"` だけ）。`approval` サブコマンドは `list` のみ。既存 Post を再生成せずに配信するコマンドも無い
- **KGI への影響**: **現在の設定では、正規の経路から 1 件も配信できない。** `.claude/commands/media-approve.md` は「承認・却下は利用者が決める」と書くが、**利用者が承認しても機構側に承認する手段が無い**

### G-03 ｜ 配信済みの投稿が DB に 1 行も無く、`report` が構造的に空 ── Blocker

- **事象**: X に既に 9 件出ているが、`post` テーブルは 0 行。`report` の集計は永久に空のまま
- **根拠**: `media-agent status` / `queue list` / `report` がすべて 0。SQLite 直読みで `post` 0 行・`performance` 0 行。一方 `queue metrics` は Buffer 側で送信済み 9 件を返す。`core/reporting.py` L184-185 — 集計は `list_posts(status=PUBLISHED)` と `list_performance()` の突き合わせである
- **KGI への影響**: [X_kgi_2weeks.md](X_kgi_2weeks.md) §9 が前提にする「playbook 別の効果測定」が成立しない。**申し送りの「データが溜まっていない可能性」は、可能性ではなく確定した事実である**

### G-04 ｜ Day7 ゲートの判定指標を出す経路が存在しない ── Blocker

- **事象**: §9 は「判定指標はインプレッションではなく**プロフィールクリック率**」と決めているが、その値をどこからも取れない
- **根拠**: `core/domain/entities.py` の `Performance` は `impressions / likes / replies / reposts` の 4 つだけ。`core/reporting.py` の `EffectRow` が持つのは `average_impressions` と `average_likes` のみ（`report_cmd.py` の表示列も 2 列）。Buffer 側は `clicks`（リンククリック）を返すが**プロフィールクリックではない**うえ、`queue metrics` は表示するだけで保存しない
- **KGI への影響**: **Day7 で「落とす型」を決める基準が計算できない。** 指標の置き換えが要る（§4・PO 判断事項）

### G-05 ｜ 禁止表現の機械検査が事実上効いていない ── Blocker（法令）

- **事象**: `rules.md` の「## 禁止表現」に並ぶ 13 語（効く / 効果 / 改善 / 高品質 / 人気No.1 / 安心 / 話題の / 選ばれる / 実感 / あなたは / 不足しています / 欠乏 / 水増し / 中身がスカスカ / 損してる）が、**1 語も検査に使われていない**
- **根拠**: `core/rules.py` の `BrandRules.parse` は、対象見出しの下の**箇条書き（`- ` で始まる行）だけ**を拾う（`_BULLET` 正規表現）。`rules.md` の「## 禁止表現」節は箇条書きではなく素の行の羅列である。実際にパーサへ通して検証した:

```
phrases: 18   ← すべて「## 禁止事項」節の長文ルール
'この成分は効果があります' -> None
'中身がスカスカ'           -> None
'高品質なプロテイン'       -> None
'あなたは不足しています'   -> None
```

  拾えている 18 件も「症状・不調・悩みを起点にした投稿をする（N-01）」のような**文章そのもの**なので、生成文に部分一致することは事実上ない
- **KGI への影響**: KGI ではなく法令。**薬機法・景表法に対する機械的な砦が、現在ゼロである。** `CLAUDE.md` の N-02 の担保が LLM の自己申告だけに乗っている

### G-06 ｜ 画像を添付する経路が無い ── Blocker

- **事象**: 投稿に画像を付けられない
- **根拠**: `connectors/buffer.py` 全体に `image` / `media` / `attachment` / `photo` の語が 1 つも無い（grep 0 件）。`createPost` に渡すフィールドは `text / channelId / schedulingType / mode`（および `dueAt` / `saveToDraft`）のみ。`agents/publisher.py` が組む payload も `post_id / run_id / content / topic` だけ
- **KGI への影響**: `strategy.md` の「**比較画面の画像を 1 枚目に添える前提で本文を書く**」が実現できない。[X_eyecatch_image_method.md](X_eyecatch_image_method.md) の画像戦術は、配信経路が無いまま置かれている

### G-07 ｜ ツリー投稿の経路が無い ── Blocker

- **事象**: 連続投稿（1 投稿目 → 返信で 2 投稿目）を作れない
- **根拠**: `createPost` は単発投稿を作る mutation で、返信先を指定するフィールドが無い（`connectors/buffer.py` の `_CREATE_POST`）。9/3 の 4 件は独立した下書きとして並んでいる（[x-drafts-2026-09-03.md](x-drafts-2026-09-03.md) の「Buffer 側の制約」）
- **KGI への影響**: `strategy.md` の「**1 投稿目に URL を貼らない。リンクはツリーの 2 投稿目に置く**」を守るには、配信時刻に人が X の画面で返信をぶら下げるしかない。1 日 2 本なら 1 日 2 回、指定時刻に人が張り付く

### G-08 ｜ 生成文の長さを制御する仕組みが無い ── Major

- **事象**: X の重み付き 280 を超える本文が、そのまま Buffer へ送られうる
- **根拠**: `media_agent` のソース全体に `280` が 0 件。`agents/content.py` の `build_generation_prompt` に長さの制約が無く、`_screen` にも長さの検査が無い。`.media-agent/` 配下（`strategy.md` / `rules.md` / `playbooks/*.md`）にも文字数の記述が 0 件
- **補足**: playbook 7 本には**例文そのものが無い**（T-030 の組み替えで削除済み）。したがって「例文 2 本が 280 字超」という既知の問題は消えているが、**長さの手本も消えた**
- **KGI への影響**: 9/3 の 4 件は人が手で重み付き換算した（再計算して 277 / 107 / 275 / 72 と一致）。**この計算を毎回人がやる前提になっている**

### G-09 ｜ `--dry-run` で見た文面と、実際に配信される文面が別物 ── Major

- **事象**: `run --dry-run` で確認してから `run` で配信する手順を踏むと、**確認したものとは違う本文が出る**
- **根拠**: `core/runtime/workflow.py` L86-90 — dry-run は Post を永続化せずに終了する。次に `run` を叩くと `ContentAgent` が LLM を呼び直し、別の候補を作る。`.claude/commands/media-run.md` はこの 2 段手順を正規の作法として書いている
- **KGI への影響**: 人の承認が形骸化する。PO が読んだ文面が出る保証が無い

### G-10 ｜ 指標の経路が 2 系統に割れていて、片方しか型と結びつかない ── Major

- **事象**: Buffer 側の指標（**リンククリックを含む**）は表示されるだけで保存されず、型別集計に入らない
- **根拠**: `cli/commands/queue_cmd.py` の `queue metrics` は `connector.fetch_sent_posts()` の結果を console に流すだけ（DB への書き込みが無い）。一方 `report` が読むのは `x metrics` が書いた `performance` テーブルだけ
- **KGI への影響**: **KGI（サイト流入）の先行指標そのものである click が、型別の判断に使えない。** `connectors/buffer.py` のコメント自身が「`clicks` は X の画面から読めない値で、KGI の先行指標そのものである」と書いている

### G-11 ｜ Content Memory が空で、重複判定が働かない ── Major

- **事象**: 既に X へ出した 9 件が記憶に無く、生成が同じ話を繰り返しても検出されない
- **根拠**: `media-agent memory status` が 0 件（取り込み 0 / 自身の投稿 0）。`agents/content.py` の `_screen` の重複判定は `ContentMemory.check` に依存する
- **緩和策の存在**: `media-agent memory import --file <csv>`（列は `content` 必須、`url` / `posted_at` 任意。`core/memory/csv_import.py`）で流し込める。**ただしこれは `memory_entry` を作るだけで `post` 行は作らない** ので、G-03 は解消しない

### G-12 ｜ 型別測定に必要な本数を、単一 active playbook では確保できない ── Major

- **事象**: playbook は 1 本しか「採用中」にできず、切り替えは実行のたびに `--playbook` を渡す運用になる
- **根拠**: `core/config/schema.py` L65 — `PlaybookSettings.active: str | None`（単数）。`config.yaml` のコメントに「ペルソナと違い曜日で切り替えません（日替わりにすると効果を測れないため）」。`playbook list` は採用済み 7 本
- **KGI への影響**: 14 日 × 2 本 = 28 投稿。§9 は 4 型で 1 型 7 本という前提で「7 本では中央値も安定しない」と書いていた。**いま型は 7 本あり、1 型 4 本になる。** 判定はさらに困難になっている（型の本数は T-031 の領分だが、機構側の制約としてここに記録する）

### G-13 ｜ `X_kgi_2weeks.md` §9 が参照する playbook ID が実在しない ── Major

- **事象**: §9 の表は `spread` / `content-rate` / `question` / `build-in-public` を挙げるが、実在するのは `beauty-premium` / `build-in-public` / `not-comparable` / `ranking-doubt` / `trivia` / `unit-price` / `whats-inside`
- **根拠**: `media-agent playbook list` の出力。`core/playbooks.py` の `select_playbook` は存在しない ID を**黙って無視せず終了コード 2 で落とす**ので、`--playbook spread` は必ず失敗する
- **併発**: `X_kgi_2weeks.md` L165-166 の「含有率 60% と 90% で単価が 1.5 倍」が実データ（33%〜93.6% / 2.8 倍）と食い違ったまま。**`.media-agent/` 側は既に修正済み**（`60%` / `1.5倍` は `.media-agent/` に 0 件）。つまり**戦略文書と、生成が実際に読む設定が食い違っている**

### G-14 ｜ 型別の流入計測（短縮パス）が未実装で、登録済みの下書きは UTM 直書き ── Major

- **事象**: 決定ログでは「X の流入計測は UTM ではなく短縮パス `pergram.site/x/<型>` 経由。`_redirects` で 302」と確定している（`docs/decisions-index.md` の「計測 / X運用」・T-027）。実装は未着手で、9/3 に登録した下書きは `?utm_source=x&utm_medium=social&utm_campaign=soy` を直書きしている
- **根拠**: `dist/_redirects` の中身は `/  /ja/  302` の 1 行のみ。`docs/task-list-pergram.csv` の T-027 は「未着手」。[x-drafts-2026-09-03.md](x-drafts-2026-09-03.md) のツリー 2 投稿目の URL
- **KGI への影響**: 型別の GA4 流入が測れない。加えて UTM 直書きは本文長を食う

### G-15 ｜ `content.posts_per_day` が実装で参照されていない（死に設定） ── Minor

- **根拠**: `grep -rn posts_per_day src/media_agent` のヒットは `core/config/schema.py:71`（宣言）だけ。実効の上限は `policy.actions.post.max_per_day: 2` のみ（`core/policy/engine.py` の `_rate_limit_reason`）
- **併発**: `strategy.md` は「1 日 3 件まで（`content.posts_per_day` と同じ）」と書いている。**値も違い（config は 2）、参照先も効かない。** 生成 AI はこの行を読む

### G-16 ｜ `doctor` をアカウント指定なしで叩くと FAIL 3 件 ── Minor

- **根拠**: `media-agent doctor` は旧レイアウト（`.media-agent/config.yaml`）を見に行き FAIL 3 件・終了コード 1。`-a x/pergram-jp` を付けると全 PASS。`accounts` は 1 件しか返さないのに自動解決しない
- **影響**: 日次点検の最初のコマンドが誤った赤を出す。示された手順に従って `media-agent init` を実行してしまうと**設定が上書きされうる**

### G-17 ｜ リプライ（T1/T2）の候補生成を支援する口が無い ── Minor（ただし工数の主因）

- **根拠**: `ActionType.REPLY` は enum に存在する（`core/domain/enums.py:70`）が、reply を生成・実行する Agent も CLI も Connector も無い（grep のヒットは `queue_cmd.py` の表示ラベルだけ）。[X_kgi_2weeks.md](X_kgi_2weeks.md) の C-2 が「リプライ・引用リポストは 100% 手作業」と明記している
- **支援できる範囲**: 対象の発見までは `media-agent x search` が担える（観測 24 件が `x_observation` に入っている）。ただし `x_reader.pacing` は 1 実行 8 リクエスト / 1 日 30 リクエストが上限で、`x metrics` と枠を共有する
- **KGI への影響**: T1 を 1 日 8〜12 件打つ計画は、対象探索も本文作成も全部手作業。**60〜90 分の大半をここが食う**

### G-18 ｜ 生成 1 回あたり LLM を 6 回起動する ── Minor

- **根拠**: `candidates_per_run: 3` × 生成 1 回 + 候補ごとの評価 1 回 = 6。`providers/claude_code.py` は毎回 `claude --print --output-format json --json-schema ...` を `subprocess` で起動する
- **影響**: 1 日 2 本なら 12 回 / 日。定額プランの枠を消費する

### G-19 ｜ Buffer の likes が全件取得できない ── 未確認

- **事象**: `queue metrics` の 9 件すべてで like が欠損。impressions / reposts / replies / clicks は値が入る
- **未確認である理由**: 原因の切り分けには Buffer の GraphQL を追加で叩く必要があり、本タスクの実行範囲を超える。プラン制限か、指標種別名の不一致か、非同期更新の遅延かは**判定していない**

### G-20 ｜ `Post.scheduled_at` が Buffer へ渡らない ── Minor

- **根拠**: `connectors/buffer.py` の `publish` は `payload["scheduled_at"]` を読んで `dueAt` に変換する実装を持つが、`agents/publisher.py` の `_publish` が組む payload に `scheduled_at` が入っていない
- **影響**: 正規の経路では時刻を指定した配信ができず、Buffer のスロット表任せになる。9/3 の登録で時刻を指定できたのは、直接呼び出しスクリプトだったからである

---

## 3. 対策

**このリポジトリ内で閉じるもの（R-xx）と、`media-agent` 本体の変更を要するもの（B-xx）を分けてある。**
工数は S = 1 時間以内 / M = 半日 / L = 1 日以上。

### 3.1 このリポジトリ内で閉じる対策

| ID | 対策 | 対応する課題 | 工数 | 変更が及ぶ範囲 | 副作用 |
|---|---|---|---|---|---|
| **R-01** | **投稿台帳**を作る。1 投稿 1 行で、型 / 読み手 / 本文 / リンク / 予定時刻 / Buffer の投稿 ID / 状態を持つ | G-01 G-03 G-10 | S | 新規 `docs/Marketing/x-post-ledger.csv` | 人が書く欄が増える。**書き忘れると測れなくなる** |
| **R-02** | **下書き検査**スクリプト。台帳の 1 件に対し、禁止表現（`rules.md` の「## 禁止表現」を素の行として読む）・重み付き 280・リンク本数・網羅語・1 日 2 本・台帳内の重複を検査する | G-05 G-08 | M | 新規 `scripts/x/`（`npm test` に載せる） | **PolicyEngine の代替ではなく二重化**。両者の判定がずれる可能性を受け入れる |
| **R-03** | **下書き登録**スクリプト。検査を通ったものだけ Buffer GraphQL で `saveToDraft: true` 登録し、Buffer の投稿 ID を台帳へ書き戻す。9/3 に使った直接呼び出しを正規化する | G-01 G-20 | M | 新規 `scripts/x/` | Buffer は削除・更新の mutation を持たない。**誤登録は画面でしか消せない**ので、検査を必ず先に通す設計にする |
| **R-04** | **型別集計**スクリプト。Buffer の送信済み一覧（text / sentAt / impressions / clicks / reposts / replies）を取り、台帳と本文ハッシュで突き合わせて型別・読み手別に集計する | G-03 G-04 G-10 | M | 新規 `scripts/x/` と出力 `docs/Marketing/x-metrics-<date>.csv` | **`media-agent report` は 14 日間使わない**ことになる。二重に見に行かない運用規律が要る |
| **R-05** | `/x/<型>` の 302 を `_redirects` へ出す（**T-027 をそのまま実行**）。台帳のリンク列は短縮パスだけを許す | G-14 | S | `src/build/build.js`（既存タスクの範囲） | 9/3 に登録済みの 4 件は UTM のまま。**Day1 分だけ計測方式が違う** |
| **R-06** | `rules.md` の「## 禁止表現」節を箇条書き（`- `）に直す | G-05 | S | `.media-agent/x/pergram-jp/rules.md` | **13 語が生成の除外条件として効き始める。** 既存の言い回しが弾かれて生成が通らなくなる可能性がある（「効果」は普通名詞としても出る） |
| **R-07** | `rules.md` に「1 投稿は X の重み付き換算で 280 以内」を明記し、`strategy.md` の「1 日 3 件まで」を「1 日 2 件（`policy.actions.post.max_per_day` と同じ）」へ直す | G-08 G-15 | S | `.media-agent/x/pergram-jp/{rules,strategy}.md` | なし |
| **R-08** | 既出 9 件と台帳から `content` 列の CSV を作り `media-agent memory import` で取り込む | G-11 | S | 新規 CSV（一時） | 重複判定が効き始め、似た話題の生成が落ちるようになる |
| **R-09** | `X_kgi_2weeks.md` §9 の playbook ID と含有率の数字を実データへ揃える | G-13 | S | `docs/Marketing/X_kgi_2weeks.md` | T-031 が同じ領域を触るなら順序調整が要る |
| **R-10** | 日次点検のコマンドを `-a x/pergram-jp` 付きで手順書へ固定する | G-16 | S | `.claude/commands/media-*.md` | なし |

### 3.2 `media-agent` 本体（このリポジトリ外）の変更を要する対策

| ID | 対策 | 対応する課題 | 工数 | 副作用 |
|---|---|---|---|---|
| **B-01** | `media-agent post --from-file <path>` — 手書き本文を候補として受け取り、禁止表現・重複・PolicyEngine を通して `Post` を作る | G-01 | M | 生成を通さない Post が増え、`intent` / `score` が空になる |
| **B-02** | `media-agent approval approve <id>` と `media-agent queue publish <post_id>` — 承認キューの出口と、**再生成しない配信** | G-02 G-09 | M | 「Grant 無しで publish は型として書けない」という設計（AD-6）を壊さない実装が要る |
| **B-03** | `Post` に `external_id`（`buffer:<id>`）を持たせ、`_record_success` が `location` を捨てないようにする | G-03 G-10 | S | DB スキーマ v6。既存行は NULL |
| **B-04** | `queue metrics` の結果を `performance` へ保存し、`Performance` に `clicks` を足す。`report` に click 列を出す | G-04 G-10 | M | 同上。指標の出所が 2 つになるので、どちらが書いたかを持つ必要がある |
| **B-05** | `build_generation_prompt` に重み付き 280 の制約を書き、`_screen` に長さ検査を足す | G-08 | S | 長い候補が落ちて候補数が減る |
| **B-06** | `BrandRules.parse` が箇条書き以外（1 行 1 語）も拾えるようにする | G-05 | S | R-06 の代替。**どちらか一方でよい** |
| **B-07** | `createPost` に画像添付を足す | G-06 | M | **Buffer の API が対応しているか未確認** |
| **B-08** | ツリー投稿 | G-07 | L | **Buffer の API に該当 mutation があるか未確認。無ければ実現不能** |
| **B-09** | publisher の payload に `scheduled_at` を渡す | G-20 | S | なし |
| **B-10** | `doctor` がアカウント 1 件なら自動解決する | G-16 | S | なし |

> **14 日という期限では、B-xx に依存する計画を立てないことを推奨する。** 本体は別プロジェクトであり、変更・再インストール・回帰の責任がこのタスク台帳の外にある。**B-xx は Day14 以降の宿題として置く。**

---

## 4. 最小構成の提案 — Day1〜Day3 に入れるべき手当て

**選定の基準**: (a) 入れないと 14 日が終わるまでに取り返せないもの、(b) 法令リスクを下げるもの、(c) 所要が短いもの。この順で並べた。

| 順 | 日 | 手当て | 所要 | この順にする理由 |
|---|---|---|---|---|
| **1** | Day1（9/3） | **R-06 + R-07**（`rules.md` の禁止表現を箇条書きへ、280 と 1 日 2 件を明記） | 15 分 | **法令の砦がいまゼロである**（G-05）。修正は文書の 1 行整形だけで、失敗しても壊れるものが無い。**いちばん安く、いちばん効く** |
| **2** | Day1（9/3） | **R-01**（投稿台帳を作り、既に Buffer にある 4 件と既出 9 件を記入） | 30 分 | 以降の全対策がこの上に乗る。**今日の 4 件は今日出る。出たあとに台帳を作ると本文が回収できない** |
| **3** | Day1（9/3） | **旧 4 件の手動削除**（`publish.buffer.com` の画面） | 5 分 | 時刻なしの旧 4 件が残っており、重複配信の事故になる。**API から消せないので人しかできない** |
| **4** | Day2（9/4） | **R-02 + R-03**（下書き検査 → Buffer 登録） | 半日 | 9/4 以降の毎日の登録がここに乗る。**60〜90 分の手作業を「書く」へ寄せられる唯一の手当て**。検査を登録の前に置くのは、Buffer が削除も更新もできないため |
| **5** | Day2（9/4） | **R-05**（`/x/<型>` の 302 = T-027） | 1〜2 時間 | 9/4 分の投稿から短縮パスを使える。**Day1 分には間に合わない**ので、その 1 日は UTM のままと割り切る |
| **6** | Day3（9/5） | **R-04**（Buffer の送信済み指標を型別に集計） | 半日 | **Day7 ゲート（9/9）の 2 日前までに動いている必要がある。** 動かして数字が出ることを確認する時間を確保するため Day3 に置く |
| **7** | Day3（9/5） | **R-08**（`memory import`） | 30 分 | AI 生成を再開する場合の重複防止。**再開しないなら不要**なので最後 |

**Day1〜Day3 でやらないと決めたもの**: B-xx すべて（本体変更）、R-09（文書の整合。判断を誤らせるが今週の配信は止めない）、R-10。

### 4.1 この最小構成でも解けない 2 つ

- **画像（G-06）とツリー（G-07）は、手当てをしても機構では解けない。** 配信時刻に人が X の画面で操作する前提を、運用計画（T-031 / T-030）の側で受け入れる必要がある
- **Day7 ゲートの判定指標（G-04）。** プロフィールクリック率は取れない。**Buffer が返すリンククリック数（投稿あたり）へ置き換えることを提案する** — KGI（サイト流入）との距離が近く、`clicks` は実際に取得できている。**これは PO 判断事項**

---

## 5. やらない方がよいこと

| やらないこと | 理由 |
|---|---|
| **`policy.actions.post.mode` を `auto` にする** | 承認の出口が無い（G-02）ことの回避策としてこれを選ぶと、**承認が外れた状態で LLM 生成文が直接 Buffer へ流れる**。しかも禁止表現の機械検査も効いていない（G-05）ので、**法令に対する砦が二重に外れる**。回避策ではなく事故である |
| **Day7 前に `mode set live` にする** | Buffer の API には削除も更新も無い。`live` で出したものは取り消せない。**下書き + 人の目視という現在の形が、いま唯一の安全弁である** |
| **リプライ・いいね・リポストの自動化** | [X_post_strategy.md](X_post_strategy.md) L115-117 のとおりシャドウバン・凍結のリスク。加えて `media-agent` は投稿系の X 直接アクセスを**設計上持っていない**ので、実装するなら規約違反側の経路を自作することになる |
| **`x_search.enabled: true` にして `research` のたびにブラウザ経路を動かす** | `x_reader.pacing` は 1 日 30 リクエスト。research が枠を食うと、日次で必要な `x metrics` が実行できなくなる。**探索と計測が同じ財布を使っている** |
| **X の API を直接使う** | 2026-02 から従量課金。URL を含む投稿は 1 件 $0.200（`connectors/buffer.py` 冒頭）。Buffer 経由なら X 側の課金は発生しない |
| **`media-agent.db` へ直接 INSERT して `report` を埋める** | schema v5 は本体側の資産で、本体の更新で壊れる。**壊れたことに気づけないまま「型別に測れているつもり」になる**のが最悪の結末である |
| **AI に数字を書かせたまま出す** | `strategy.md` / playbook の数字は一度ずれている（G-13）。数字は台帳の側で確定させ、生成には「この数字を使え」と渡す |
| **`media-agent init` を実行する** | `doctor` が FAIL を出す（G-16）のを直そうとして踏みやすい。**設定を上書きしうる** |

---

## 6. タスク化の素案

**CSV には書かない。** オーケストレーターが登録する際の素案である。

| 仮ID | タスク名 | 目的（1 行） | 完了条件の案 | 依存 |
|---|---|---|---|---|
| a | rules.md の禁止表現を機械が読める形へ直す | 薬機法・景表法の機械的な砦を回復する | `BrandRules.parse` の返す語数が 18 から 31 以上になり、「効果」「中身がスカスカ」「あなたは」を含む文字列で `violation()` が非 None を返す（検証スクリプトの出力を証拠にする） | 無し |
| b | strategy.md の投稿本数と長さの記述を実装に合わせる | 生成が読む設定と実装の食い違いを消す | `strategy.md` に「1 日 2 件」「重み付き 280 以内」が記載され、`content.posts_per_day` への言及が消えている | 無し |
| c | 投稿台帳を作り、9/3 までの投稿と登録済み下書きを記入する | 測定の正典をこのリポジトリ内に置く | `docs/Marketing/x-post-ledger.csv` に、Buffer の送信済み 9 件と登録済み下書き 4 件の全行が入っている | 無し |
| d | 下書き検査スクリプト | 出す前に機械が止める | 禁止表現・重み付き 280 超・リンク 2 本以上・網羅語・同日 3 本目・台帳内重複のそれぞれで、検査が非ゼロ終了する単体テストが通る | a, c |
| e | 下書き登録スクリプト | 手書き本文を Buffer へ入れる経路を正規化する | 検査を通った台帳の 1 行を `saveToDraft: true` で登録し、Buffer の投稿 ID が台帳へ書き戻される。検査に落ちた行では**登録の呼び出しが起きない**ことをテストで示す | d |
| f | X 流入を型別に測る導線を作る（**既存の T-027**） | 型別の GA4 流入を測れるようにする | `npm run build` の出力 `dist/_redirects` に型ごとの 302 行が含まれる（T-027 の完了条件をそのまま） | 無し |
| g | Buffer の送信済み指標を型別に集計する | Day7 ゲートの判定材料を作る | Buffer の送信済み一覧と台帳を突き合わせ、型別の投稿数 / 表示回数 / クリック数 / クリック率が CSV へ出る。未照合の件数が 0 でないときは件数として出す（0 で埋めない） | c |
| h | Content Memory へ既出投稿を取り込む | 生成の重複判定を機能させる | `media-agent memory status` が 13 件以上を返す | c |
| i | X_kgi_2weeks.md の playbook ID と含有率の数字を実データへ揃える | 戦略文書と設定の食い違いを消す | §9 の表の playbook ID が `playbook list` の出力と一致し、含有率が 33%〜93.6% / 2.8 倍になっている | 無し（T-031 と順序調整） |
| j | **[PO 判断待ち]** Day7 ゲートの判定指標を置き換える | 取れない指標で判定しようとするのを止める | `X_kgi_2weeks.md` §9 の判定指標が、実際に取得できる指標へ書き換わっている | g |
| k | **[本体側・Day14 以降]** media-agent に本文投入口と承認の出口を足す | 迂回運用を正規の経路へ戻す | `media-agent post --from-file` と `approval approve` が存在し、PolicyEngine を通って配信される | 無し（このリポジトリ外） |

**並列に走れる単位**: a / b / c / f / i は互いに独立で同時に走れる（触るファイルが重ならない）。d は a と c の後。e は d の後。g は c の後。**a・b・i は `.media-agent/` と `docs/Marketing/` を触るので、T-031 と同時に走らせない。**

---

## 7. 採用しなかった案と、その理由

### 案 A ｜ `media-agent.db` の `post` テーブルへ直接行を入れて `report` を成立させる
- **利点**: `report` / `x metrics` / `x learn` の既存資産をそのまま使える。追加のスクリプトが最小
- **欠点**: 他プロジェクトが所有する DB スキーマ（v5）へ外から書く。本体のマイグレーションで壊れる
- **却下の理由**: **壊れても例外が出ず、「型別に測れているつもり」のまま数字だけが空になる。** G-03 とまったく同じ失敗を、より気づきにくい形で再生産する

### 案 B ｜ `policy.actions.post.mode` を `auto` にして `run` を 1 日 2 回回す
- **利点**: 今日から自動で回る。追加実装ゼロ
- **欠点**: 承認が外れる。禁止表現の検査も効いていない
- **却下の理由**: **N-02 に対する砦が同時に 2 つ外れる。** 機能要件より法令が優先する（`CLAUDE.md`）

### 案 C ｜ 本体（`media-agent-bmad`）に B-01 / B-02 を実装してから運用を始める
- **利点**: 迂回運用が要らない。PolicyEngine を通る本来の姿になる
- **欠点**: 本体はこのリポジトリの外。変更・再インストール・回帰の責任が台帳の外にある
- **却下の理由**: **Day1 が今日である。** 本体の改修が終わるまで配信が止まると、14 日のうち何日かを丸ごと失う。**Day14 以降の宿題（タスク k）として残す**

### 案 D ｜ Buffer をやめて X API を直接叩く
- **利点**: 画像・ツリー・削除・時刻指定がすべて公式に可能
- **欠点**: 従量課金（URL を含む投稿 1 件 $0.200）。実装は L
- **却下の理由**: 費用と工数が、14 日で回収できる見込みに対して大きすぎる

### 案 E ｜ 計測の正典を `media-agent` の DB 側に置いたまま、そこへ寄せる
- **利点**: 道具が 1 つで済む。`x learn` による型の抽象化まで一本で繋がる
- **欠点**: `Post` 行を作る口が無く（G-01 / G-02）、`clicks` も入らない（G-10）
- **却下の理由**: **`report` を成立させるには案 A か案 C のどちらかが要る。** 両方が却下された以上、正典は移すしかない

### この文書が提案する決定

> **14 日間に限り、測定の正典を `media-agent` の DB ではなく、このリポジトリ内の投稿台帳と Buffer の送信済み指標に置く。**
> `media-agent` は「生成の相談相手」と「X の観測（`x search` / `x learn`）」として使い、**配信と計測の主経路からは外す。**
> Day14 以降に本体側へ本文投入口と承認の出口が入った時点で、正典を戻すかどうかを再判断する。

---

## 8. 未解決の不確実性

| # | 内容 | なぜ未確認か |
|---|---|---|
| U-1 | Buffer が likes を返さない理由（G-19） | 切り分けに Buffer GraphQL の追加呼び出しが要り、本タスクの範囲を超える |
| U-2 | Buffer の API に画像添付（B-07）とツリー（B-08）の手段があるか | `connectors/buffer.py` が実装していないだけなのか、API 自体に無いのかを区別していない。**B-08 が不可能なら、ツリーは恒久的に人手である** |
| U-3 | `x metrics` が `own_handle` のプロフィールから表示回数を確実に取れるか | **`x` 系の実行が禁止されているため未検証。** `x_observation` の 24 件はすべて検索経由で、`pergram` を含む author の観測は 0 件 |
| U-4 | 生成 AI が実際にどんな本文を吐くか（長さ・禁止語の踏み方） | `post` / `run` の実行が禁止されているため未検証 |
| U-5 | `MEDIA_AGENT_ACCOUNT` が `.env.local` に設定されているか | `.env.local` の読み取りがツールの実行許可で拒否された。`-a` の省略可否に影響する |

---

## 9. この設計で新しく定義した語

| 語 | 意味 |
|---|---|
| **投稿台帳（post ledger）** | このリポジトリ内に置く、X へ出す投稿 1 件 1 行の記録。型（playbook）・読み手（persona）・本文・リンク・予定時刻・Buffer の投稿 ID・状態を持つ。**14 日間の測定の正典**であり、`media-agent` の DB とは別物 |
| **本文投入口** | 人が確定させた本文を、検査を通したうえで配信キューへ入れる経路。いま存在しないもの（G-01） |
| **下書き検査** | 配信前に本文へかける機械的な検査の総称。禁止表現・重み付き文字数・リンク本数・網羅語・1 日の本数・重複の 6 つ |
| **重み付き 280** | X の文字数上限の数え方。CJK は 1 文字 2、URL は一律 23 として数えた合計が 280 以内 |

---

## 付録 A ｜ 実行したコマンドと出力（根拠）

すべて読み取り系のみ。`post` / `run` / `research` / `x` 系は実行していない。

```
$ media-agent doctor -a x/pergram-jp
[PASS] 作業領域 / 設定ファイル / 戦略とルール / データベース (schema v5)
[PASS] AI Provider (`claude` を PATH 上に確認) / Connector (有効: google_news) / .gitignore 保護
すべての項目に通過しました。                                     → 終了コード 0

$ media-agent doctor            （アカウント指定なし）
[FAIL] 設定ファイル / 戦略とルール / データベース                 → 終了コード 1

$ media-agent status -a x/pergram-jp --limit 20
Source: 0 件  (最終収集: -) / Content Memory: 0 件
直近の Task (0 件) / 直近の Post (0 件)

$ media-agent queue list -a x/pergram-jp
Queue: 0 件   draft: 0 / queued: 0 / failed: 0

$ media-agent approval list -a x/pergram-jp
承認待ち: 0 件

$ media-agent memory status -a x/pergram-jp
Content Memory: 0 件   取り込み (CSV): 0 件 / 自身の投稿: 0 件

$ media-agent report -a x/pergram-jp
投稿済み: 0 件 / 指標あり: 0 件
ペルソナ別 (まだありません) / playbook 別 (まだありません)
指標が 1 件も取り込まれていません。`media-agent x metrics` で取り込めます。

$ media-agent task list -a x/pergram-jp      → Task: 0 件
$ media-agent mode show -a x/pergram-jp      → 現在の段階: draft
$ media-agent env check -a x/pergram-jp      → 必須 3 キーすべて設定済み（値は表示されない）

$ media-agent playbook list -a x/pergram-jp
採用済み (7 件): beauty-premium / build-in-public / not-comparable / ranking-doubt
                 / trivia / unit-price ← 使用中 / whats-inside
提案（未採用 / 0 件）

$ media-agent queue channels -a x/pergram-jp
Buffer のチャンネル: 1 件   6a84f788ccaf649a67d210e2  twitter  pergram_jp <- 投稿先
タイムゾーン: Asia/Tokyo / スロット表: 全曜日 3 枠（08 時台・12 時前後・18 時前後）

$ media-agent queue metrics -a x/pergram-jp --limit 20
送信済み投稿: 9 件（2026-08-19 〜 2026-09-03）
合計: imp=73  like=-  rt=0  reply=3  click=0
    ※ 9 件すべてで like が欠損。click は全件 0
```

SQLite 直読み（`.media-agent/x/pergram-jp/data/media-agent.db`）:

```
schema_version = 5
action_log 0 / approval_queue 0 / decision 0 / memory_entry 0 / memory_trigram 0
performance 0 / post 0 / project 0 / source 0 / task 0
x_observation 24（すべて route=browser・2026-09-02 収集・impressions の欠損 0 件）
x_observation_annotation 0 / x_trend 0
    ※ author_handle に pergram を含む観測は 0 件
```

禁止表現パーサの実測（G-05 の根拠）:

```
$ python -c "from media_agent.core.rules import BrandRules; ..."
phrases: 18        ← すべて「## 禁止事項」節の長文。「## 禁止表現」節の 13 語は 1 つも入らない
'この成分は効果があります' -> None
'中身がスカスカ'           -> None
'高品質なプロテイン'       -> None
'あなたは不足しています'   -> None
```

登録済み下書きの重み付き長（G-08 の根拠。人が手計算した値と一致）:

```
[1] 277  朝1 型A / [2] 107  朝2 ツリー / [3] 275  夜1 型B / [4] 72  夜2 ツリー
```

## 付録 B ｜ 根拠として参照したファイル

| 場所 | 参照した箇所 |
|---|---|
| `C:\Users\kaiki\Workspace\03_Dev\media-agent-bmad\src\media_agent\core\runtime\workflow.py` | L82-97（固定 3 段の実行順、dry-run の打ち切り） |
| 同 `agents\publisher.py` | L130-140（APPROVAL の行き止まり）、`_record_success`（`location` を捨てる） |
| 同 `agents\content.py` | `build_generation_prompt`（長さ制約なし）、`_screen`（禁止表現 → 重複 → LLM 採点） |
| 同 `core\rules.py` | `_BULLET` と `FORBIDDEN_HEADINGS`（箇条書きしか拾わない） |
| 同 `core\domain\entities.py` | `Post`（外部 ID の列なし）、`Performance`（4 指標のみ） |
| 同 `core\reporting.py` | L178-192（`PUBLISHED` と `performance` の突き合わせ、平均 imp と平均 like だけ） |
| 同 `connectors\buffer.py` | 冒頭の設計注記、`SCHEDULES`、`_CREATE_POST`、`fetch_sent_posts` |
| 同 `agents\analytics.py` | `MetricsIngest`（本文ハッシュ照合。Buffer は X の投稿 ID を返さない） |
| 同 `core\config\schema.py` | L65（`playbooks.active` は単数）、L71（`posts_per_day` は宣言のみ） |
| 同 `cli\commands\queue_cmd.py` | `queue metrics`（表示のみ・保存しない） |
| `.media-agent/x/pergram-jp/config.yaml` | policy / publisher / x_reader の各節 |
| `.media-agent/x/pergram-jp/strategy.md` `rules.md` | 投稿方針・禁止表現節・使う型 |
| `docs/Marketing/x-drafts-2026-09-03.md` | 「登録の経路について」「Buffer 側の制約」 |
| `docs/Marketing/X_kgi_2weeks.md` | §9（型の効果の測り方）、C-2、L165-166 |
| `docs/decisions-index.md` | 「計測 / X運用」節（T-027・2026-09-02） |
| `dist/_redirects` | 現在 1 行のみ |

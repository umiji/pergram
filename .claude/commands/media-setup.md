---
description: 対話でこのプロジェクトの Media Agent を設定し、doctor が通る状態まで持っていく
---

# セットアップ（対話）

このプロジェクトで Media Agent を使えるようにする。**1 項目ずつ決めて、決まった
そばから CLI で反映する。** config.yaml を直接編集してはいけない — 検証を通らない
値が書き込まれるうえ、設定意図を書いたコメントが消える。

**このコマンドは投稿しない。** 最後まで進めても段階は `test`（ローカルに記録する
だけ）のままで終わる。実配信への切替は人が行う操作であり、ここには含まれない。

## 前提

- 対象アカウントを最初に確認する。以降のすべてのコマンドに `--account <media>/<name>`
  を付ける（例: `x/pergram-jp`）。分からなければ `media-agent accounts` で一覧を出し、
  どれを設定するのか利用者に聞く
- 作業領域がまだ無ければ `media-agent init --account <media>/<name>` を実行する

## 手順

### 1. 現状を機械可読で読む

```
media-agent doctor --json --account <media>/<name>
```

`results` の `status` が `WARN` / `FAIL` の項目が「まだ決まっていないこと」の一覧に
なっている。**これを上から 1 つずつ片付ける。** 別途チェックリストを作る必要はない。

### 2. 秘匿値の置き場を用意する

```
media-agent env init --account <media>/<name>
media-agent env check --account <media>/<name>
```

`env init` は `.env.local` に**キー名だけ**を書き足す。**値は利用者本人が書く。**
利用者に「`.env.local` を開いて値を入れてください」と依頼し、入れ終わったら
`env check` で設定済みかどうかだけ確かめる。**API キーや Cookie の中身を
聞き出したり、ファイルから読み取って画面に出したりしてはいけない。**

### 3. 設定を 1 項目ずつ決める

WARN / FAIL の内容を自然言語で 1 つずつ利用者に聞き、答えを反映する。

```
media-agent config show --account <media>/<name>
media-agent config set connectors.rss.feeds '["https://example.com/feed"]' --account <media>/<name>
media-agent config set content.posts_per_day 3 --account <media>/<name>
media-agent config unset content.similarity_threshold --account <media>/<name>
```

- 値は JSON として読めればその型になる（`true` / `3` / `["a","b"]`）。
  文字列として入れたい数字は `'"3"'` のように引用符を重ねる
- リストは `config show --json` で読んで、要素を足した配列を丸ごと書き戻す
- 検証に落ちたときは終了コード 2 で**何も書かれていない**。値を直して打ち直す

### 4. 戦略・ルール・ペルソナを書く

`strategy.md` と `rules.md` は設定項目ではなく本文なので、対話で内容を固めてから
ファイルに直接書く。置き場所は `media-agent config show` が出す設定ファイルと
同じディレクトリ（`.media-agent/<media>/<name>/`）。

- `strategy.md` — 何のアカウントで、誰に、何を届けるのか
- `rules.md` — 書いてはいけないこと、口調、禁止表現
- `personas/<id>.md` — 曜日ごとに読み手を変えるなら。使わないなら飛ばしてよい

書いたら `content.personas.schedule` を `config set` で割り当てる。

### 5. 通ったことを確認して終わる

```
media-agent doctor --account <media>/<name>
media-agent mode show --account <media>/<name>
```

FAIL が 0 件になったら完了。**段階は `test` のまま終える。**

最後に利用者へこう伝える。

- いまは `test`（ローカルに記録するだけ・外部に何も出ない）であること
- 生成を試すには `/media-draft`、動作の確認には `/media-status` が使えること
- 外部に出す段階へ上げるかどうかは人が決める操作であり、必要になったら
  `media-agent mode show` で選択肢を確認したうえで利用者自身が切り替えること

## やってはいけないこと

- config.yaml / `.env.local` を直接書き換えること（CLI を通す。`.env.local` は人が書く）
- 秘匿値の中身を読み取る・表示する・要約すること
- 段階を `test` より外に出す操作を、利用者に頼まれていないのに実行すること
- `media-agent run` や `media-agent post` をこの流れの中で実行すること

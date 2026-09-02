---
description: 承認待ちの投稿を確認し、配信するかを判断する。
argument-hint: "[アカウント (例 x/pergram-jp)]"
---

# 承認待ちの確認

対象アカウント: `$ARGUMENTS`

`policy.actions.post.mode` が `approval` のとき、生成された投稿は配信されずに
承認待ちとして溜まる。ここではその中身を確認する。

## 手順

1. アカウントが指定されていなければ、一覧を出して選んでもらう。

   ```bash
   media-agent accounts
   ```

2. 承認待ちを一覧する。

   ```bash
   media-agent approval list --account <アカウント>
   ```

3. 判断材料として、生成の経緯を読む。

   ```bash
   media-agent task list --account <アカウント>
   ```

4. 投稿先が Buffer の下書き（`publisher.buffer.schedule: draft`）に設定されている場合は、
   publish.buffer.com の画面でも実物を確認できることを伝える。下書きは**公開されない**。

## 報告のしかた

- 承認待ちの本文を**全文そのまま**見せる。要約しない。
- 禁止表現に触れていないか、`rules.md` の内容と照らして気づいた点があれば添える。
- 承認・却下は利用者が決めることであり、**こちらで判断して進めないこと。**

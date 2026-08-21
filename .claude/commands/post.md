---
description: pergram の X 投稿文を作る（単発かツリーかは自動判断）
argument-hint: "[テーマ / ネタ / 相談]"
---

Skill ツールで `x-post` を呼び、その手順に従って投稿文を作る。

- モード: post
- 入力: $ARGUMENTS

`npm run x:facts` と `npm run x:feed` を先に実行し、下書きは `npm run x:lint` に
通してから提示すること。error が残った文章を出さない。

🔒 このコマンドでは画像を作らない。必要そうなときは「`/image` で作れます」と
1行添えるだけにする。

---
description: X 投稿のアイキャッチ（16:9）を作る
argument-hint: "[投稿文 / 構図の指定]"
---

Skill ツールで `x-post` を呼び、`reference/image.md` の手順で画像を作る。

- モード: image
- 入力: $ARGUMENTS

構図（rank / focus / split / steps）を投稿文のフックから選び、`npm run x:card` で
生成する。🔒 生成モデルで作らない。実データが無い構図は作らない。

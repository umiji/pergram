# -*- coding: utf-8 -*-
"""`.claude/scripts/org-tokens.py` の集計を検査する（T-074 の受け入れテスト）。

**会話記録は、モデルの1回の応答を複数行に分けて書く。** 文・思考・道具呼び出しが
別々の行になり、どの行も同じ `requestId` を持つ。同じ `requestId` の行は
`input_tokens` / `cache_read_input_tokens` / `cache_creation` を**まったく同じ値**で
持ち、伸びるのは `output_tokens` だけで**最後の行が完全な値**である
（実際の会話記録 5,653 件の応答で、この不変条件が破れる例は 0 件だった）。

したがって行を1行ずつ足し込むと、**往復の数もトークン量も過大になる**
（実測で往復 1.95倍 / トークン 1.87倍）。ここで固定するのは、その束ねが
効いていることだけである。**束ねを外せば、このファイルのテストは赤になる。**

固定の会話記録（`tests/fixtures/org_tokens/`）だけで判定する。実際の
`~/.claude/projects/` 配下の記録には依存しない —— 依存させると、記録が増える
たびに期待値が動いて壊れる。実データで判定する完了条件（3・4・5）は、
`docs/tasks/T-074.md` の `## 証拠` に確認コマンドとして置く。

実行:
    python tests/org_tokens.test.py

`npm test` の対象（`tests/**/*.test.js`）には入らない。Python の単体テストなので、
Node のテストランナーからは走らない（`tests/org_decisions.test.py` と同じ扱い）。
"""

import importlib.util
import json
import os
import re
import shutil
import tempfile
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(REPO_ROOT, ".claude", "scripts", "org-tokens.py")
FIXTURES = os.path.join(REPO_ROOT, "tests", "fixtures", "org_tokens")

# 会話記録の置き場は <base>/<プロジェクト名>/<セッションID>.jsonl。
SESSION = "fixture-session"


def load_script():
    """ハイフンを含む名前なので、通常の import では読めない。"""
    spec = importlib.util.spec_from_file_location("org_tokens", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


org = load_script()


# --------------------------------------------------------------------------
# 固定の会話記録を一時ディレクトリへ展開する
# --------------------------------------------------------------------------

def place(src: str, dst: str, root: str) -> None:
    """fixture を写す。`cwd` だけは一時ディレクトリの実パスに差し替える。

    `find_sessions` は記録の中の `cwd` とリポジトリのルートを突き合わせて
    対象を選ぶので、ここだけは固定値にできない。Windows のパスは `\\` を
    含むため、JSON として正しくなるように `json.dumps` で埋める。
    """
    with open(src, encoding="utf-8") as f:
        text = f.read()
    text = text.replace('"{{CWD}}"', json.dumps(root))
    with open(dst, "w", encoding="utf-8", newline="") as f:
        f.write(text)


class LedgerCase(unittest.TestCase):
    """fixture を読ませて台帳を作り、その中身を見る。"""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.mkdtemp()
        root = os.path.join(cls._tmp, "repo")
        base = os.path.join(cls._tmp, "transcripts")
        subagents = os.path.join(base, "proj", SESSION, "subagents")
        os.makedirs(os.path.join(root, "docs"))
        os.makedirs(subagents)

        place(os.path.join(FIXTURES, "session-main.jsonl"),
              os.path.join(base, "proj", SESSION + ".jsonl"), root)
        for name in sorted(os.listdir(os.path.join(FIXTURES, "subagents"))):
            place(os.path.join(FIXTURES, "subagents", name),
                  os.path.join(subagents, name), root)

        org.update(root, base)
        cls.rows = org.read_ledger(org.ledger_path(root))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls._tmp, ignore_errors=True)

    # --- 読み出しの補助 ---

    def pick(self, **where) -> list:
        return [r for r in self.rows
                if all(r[k] == v for k, v in where.items())]

    def one(self, **where) -> dict:
        hits = self.pick(**where)
        self.assertEqual(len(hits), 1,
                         "台帳の行が1つに定まらない: %r → %d行" % (where, len(hits)))
        return hits[0]

    def totals(self, rows: list) -> dict:
        return {k: sum(r[k] for r in rows) for k in org.KINDS + ["合計"]}

    def roundtrips(self, rows: list) -> set:
        """往復を数えている列の合計値の候補。

        **列名は実装が決めてよい**（T-074 の「判断してよい範囲」: `返答回数` を
        差し替えても列を足してもよい）。名前を決め打ちにすると、正しい実装を
        名前の違いだけで落としてしまう。そこで「費目でも合計でもない数値列」を
        往復の候補として全部見て、期待値がそのどれかに一致することを求める。
        """
        columns = [c for c in org.NUMERIC if c not in org.KINDS and c != "合計"]
        self.assertTrue(columns, "往復を数える数値列が台帳に1つも無い")
        return {sum(r[c] for r in rows) for c in columns}

    def assertRoundtrips(self, expected: int, rows: list, note: str = "") -> None:
        got = self.roundtrips(rows)
        self.assertIn(expected, got,
                      "往復 %d を数えている列が無い（候補: %s）%s"
                      % (expected, sorted(got), note))


# --------------------------------------------------------------------------
# 担当エージェントの記録
# --------------------------------------------------------------------------

class TestBundleByRequestId(LedgerCase):
    """**このタスクの肝。** agent-alpha は `req_A` が3行 + `req_B` が1行の計4行。

        行ごと（いまの実装）      入力 15 / 出力 270 / 書込 1,500 / 読出 5,000 / 4回
        応答ごと（あるべき姿）    入力  7 / 出力 268 / 書込   500 / 読出 3,000 / 2回
    """

    def alpha(self) -> dict:
        return self.one(記録元="agent-alpha")

    def test_同じ応答の3行を1往復として数える(self):
        self.assertRoundtrips(2, [self.alpha()], "（行を数えると 4 になる）")

    def test_入力とキャッシュは応答ごとに1回だけ数える(self):
        row = self.alpha()
        self.assertEqual(row["入力"], 7, "3行ぶん重複して足していないか（素だと 15）")
        self.assertEqual(row["キャッシュ読出"], 3000, "素だと 5,000")
        self.assertEqual(row["キャッシュ書込"], 500, "素だと 1,500")

    def test_出力は最後の行の値を採る(self):
        row = self.alpha()
        # req_A は 1 → 1 → 218 と伸び、218 が完全な値。足すと 220 になる。
        self.assertEqual(row["出力"], 268,
                         "最後の行 218 と req_B の 50。足し込むと 270、"
                         "最初の行を採ると 51 になる")

    def test_合計は4費目の和のまま(self):
        row = self.alpha()
        self.assertEqual(row["合計"], sum(row[k] for k in org.KINDS))
        self.assertEqual(row["合計"], 3775)

    def test_壊れた行があっても集計は止まらない(self):
        """fixture には JSON として読めない行を1行混ぜてある。

        記録は書き込みの途中で読まれることがあり、それは正常な出来事である。
        """
        self.assertEqual(self.alpha()["タスクID"], "T-074")


class TestWithoutRequestId(LedgerCase):
    """`requestId` を持たない返答が実在する。

    2026-09-13 時点のこのリポジトリの会話記録では、usage を持つ 12,000 行あまりの
    うち 3 行が `requestId` を持たなかった。**作り話の入力ではない。**

    束ねる鍵が無い行を1つにまとめると、**別々の往復が消える**。鍵が無いなら
    束ねない、が安全側である。agent-beta はその2行だけを持つ。
    """

    def beta(self) -> dict:
        return self.one(記録元="agent-beta")

    def test_requestId_が無い行どうしは束ねない(self):
        self.assertRoundtrips(2, [self.beta()])

    def test_requestId_が無い行のトークンは素直に足す(self):
        row = self.beta()
        self.assertEqual((row["入力"], row["出力"], row["キャッシュ読出"]),
                         (10, 20, 200))


# --------------------------------------------------------------------------
# メインセッション（オーケストレーター）
# --------------------------------------------------------------------------

class TestMainSession(LedgerCase):
    """メインセッションもタスク別に分けたうえで束ねる。"""

    def main_rows(self) -> list:
        return self.pick(記録元=org.MAIN_SOURCE)

    def test_タスクごとの行でも応答単位で束ねる(self):
        # req_M1 は2行（出力 2 → 40）。T-101 の行はこれだけ。
        row = self.one(記録元=org.MAIN_SOURCE, タスクID="T-101")
        self.assertEqual((row["入力"], row["出力"],
                          row["キャッシュ書込"], row["キャッシュ読出"]),
                         (6, 40, 100, 800),
                         "行ごとに足すと (12, 42, 200, 1600) になる")
        self.assertRoundtrips(1, [row])

    def test_1行だけの応答はそのまま数える(self):
        row = self.one(記録元=org.MAIN_SOURCE, タスクID="T-102")
        self.assertEqual((row["入力"], row["出力"],
                          row["キャッシュ書込"], row["キャッシュ読出"]),
                         (2, 30, 0, 900))
        self.assertRoundtrips(1, [row])

    def test_応答の途中でタスクIDが変わっても二重に数えない(self):
        """req_M4 は2行あり、1行目の本文に T-103、2行目に T-104 が出てくる。

        **どちらのタスクに付けるかは実装が決めてよい。** 許されないのは、
        1つの応答を2つに割って `入力` と `キャッシュ` を二重に数えることである
        （それがこのタスクで直している不具合そのものの形）。
        """
        rows = [r for r in self.main_rows() if r["タスクID"] in ("T-103", "T-104")]
        self.assertTrue(rows, "T-103 / T-104 の行が1つも無い")
        got = self.totals(rows)
        self.assertEqual((got["入力"], got["出力"],
                          got["キャッシュ書込"], got["キャッシュ読出"]),
                         (8, 60, 200, 700),
                         "割って数えると (16, 63, 400, 1400) になる")
        self.assertRoundtrips(1, rows)

    def test_メインセッション全体の合計(self):
        got = self.totals(self.main_rows())
        self.assertEqual((got["入力"], got["出力"],
                          got["キャッシュ書込"], got["キャッシュ読出"]),
                         (17, 137, 300, 2450),
                         "行ごとに足すと (31, 142, 600, 3950) になる")
        self.assertRoundtrips(4, self.main_rows(), "（行を数えると 6 になる）")


# --------------------------------------------------------------------------
# タスクIDの拾い方
# --------------------------------------------------------------------------

SHORT_TASK_ID = re.compile(r"^T-\d{1,2}$")


class TestTaskId(LedgerCase):
    """台帳のタスクIDは3桁（`T-074`）である。`T-07` のような断片を拾わない。"""

    def test_3桁未満のタスクIDは台帳に現れない(self):
        """fixture の本文に `T-07 の続き。` が入っている。

        いまの実装は `T-\\d+` で拾うので `T-07` という行ができ、実際の台帳にも
        8行ある（完了条件4）。**断片をどう扱うかは実装が決めてよい**
        （タスク不明に寄せる / 直前のタスクのままにする）。ここで禁じるのは、
        **3桁でないIDが台帳へ書かれること**だけである。
        """
        bad = sorted({r["タスクID"] for r in self.rows
                      if SHORT_TASK_ID.match(r["タスクID"])})
        self.assertEqual(bad, [], "3桁でないタスクIDが台帳に入っている")

    def test_3桁のタスクIDは従来どおり拾う(self):
        found = {r["タスクID"] for r in self.rows}
        self.assertIn("T-074", found, "担当エージェントの指示文から拾えていない")
        self.assertIn("T-075", found)
        self.assertIn("T-101", found, "メインセッションの本文から拾えていない")


# --------------------------------------------------------------------------
# 台帳そのもの
# --------------------------------------------------------------------------

class TestLedgerShape(LedgerCase):
    """列が壊れると、フックが毎回書き換えるこの台帳が読めなくなる。"""

    def test_必要な列がそろっている(self):
        for column in ["タスクID", "担当", "モデル", "セッションID", "記録元", "最終更新"]:
            self.assertIn(column, org.COLUMNS)
        for kind in org.KINDS:
            self.assertIn(kind, org.COLUMNS)
        self.assertIn("合計", org.COLUMNS)

    def test_担当は記録から取れている(self):
        self.assertEqual(self.one(記録元="agent-alpha")["担当"], "org-implementation")
        self.assertEqual(self.one(記録元="agent-beta")["担当"], "org-review")
        self.assertEqual({r["担当"] for r in self.pick(記録元=org.MAIN_SOURCE)},
                         {org.ORCHESTRATOR})

    def test_どの行も合計が4費目の和になっている(self):
        for row in self.rows:
            self.assertEqual(row["合計"], sum(row[k] for k in org.KINDS),
                             "合計が費目の和と合わない: %r" % row["記録元"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

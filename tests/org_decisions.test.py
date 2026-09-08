# -*- coding: utf-8 -*-
"""`.claude/scripts/org-decisions.py` の「上書き対象」の解決を検査する。

**この索引だけが、決定が失効したことを伝える手段である**（`.claude/rules/org-task-ledger.md`）。
指し先を取り違えると、担当エージェントは失効した決定に従い、生きている決定を無視する。
ここで固定するのは、その取り違えが起きないことだけである。

実行:
    python tests/org_decisions.test.py

`npm test` の対象（`tests/**/*.test.js`）には入らない。Python の単体テストなので、
Node のテストランナーからは走らない。
"""

import importlib.util
import os
import sys
import tempfile
import unittest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(REPO_ROOT, ".claude", "scripts", "org-decisions.py")


def load_script():
    """ハイフンを含む名前なので、通常の import では読めない。"""
    spec = importlib.util.spec_from_file_location("org_decisions", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


org = load_script()


def task_file(decisions_body: str) -> str:
    return "# T-XXX: 検査用\n\n## 決定ログ\n{}\n\n## 作業ログ\n".format(decisions_body)


class SupersedeCase(unittest.TestCase):
    """一時ディレクトリに docs/tasks/ を作り、実物と同じ経路で読ませる。"""

    def resolve(self, files: dict):
        """{タスクID: 決定ログ本文} を渡すと、(要約 -> 状態, 警告) を返す。"""
        with tempfile.TemporaryDirectory() as root:
            d = os.path.join(root, "docs", "tasks")
            os.makedirs(d)
            for task_id, body in files.items():
                with open(os.path.join(d, task_id + ".md"), "w", encoding="utf-8") as f:
                    f.write(task_file(body))
            warn = []
            decisions = org.collect(root, warn)
            org.apply_supersede(decisions, warn)
            return {d_["要約"]: d_["状態"] for d_ in decisions}, warn


SAME_DAY_TWO = """
### 2026-09-03 露出の主経路を自前ポストからリプライへ移す
- 対象: X運用 / 露出の調達
- 決定: 露出はリプライから借りる

### 2026-09-03 リプライ本文に URL を貼らない
- 対象: X運用 / リプライ
- 決定: 相手が聞いた場合を除き貼らない

### 2026-09-03 副次指標の内訳を組み直す
- 対象: X運用 / KGI の内訳
- 決定: KGI 300 は据え置く
"""


class TestSupersedeAmongSameDayDecisions(SupersedeCase):

    def test_括弧で対象を書けば_その決定だけが失効する(self):
        state, warn = self.resolve({
            "T-001": SAME_DAY_TWO,
            "T-002": """
### 2026-09-04 露出層リプの選定軸を移す
- 対象: X運用 / 露出の調達 / リプライ
- 決定: フォロワー12万超で選ぶ
- 上書き対象: T-001 2026-09-03（`X運用 / 露出の調達` のうち、露出層リプの探し方を定めた部分）
""",
        })
        self.assertEqual(state["露出の主経路を自前ポストからリプライへ移す"],
                         org.SUPERSEDED.format("T-002"))
        self.assertEqual(state["リプライ本文に URL を貼らない"], org.ACTIVE)
        self.assertEqual(state["副次指標の内訳を組み直す"], org.ACTIVE)
        self.assertEqual(warn, [])

    def test_括弧に要約を書いても指せる(self):
        state, warn = self.resolve({
            "T-001": SAME_DAY_TWO,
            "T-002": """
### 2026-09-04 URL の扱いを変える
- 対象: X運用 / リプライ
- 決定: 常に貼る
- 上書き対象: T-001 2026-09-03（リプライ本文に URL を貼らない）
""",
        })
        self.assertEqual(state["リプライ本文に URL を貼らない"],
                         org.SUPERSEDED.format("T-002"))
        self.assertEqual(state["露出の主経路を自前ポストからリプライへ移す"], org.ACTIVE)
        self.assertEqual(state["副次指標の内訳を組み直す"], org.ACTIVE)
        self.assertEqual(warn, [])

    def test_括弧が複数行にまたがっても読める(self):
        state, warn = self.resolve({
            "T-001": SAME_DAY_TWO,
            "T-002": """
### 2026-09-04 URL の扱いを変える
- 対象: X運用 / リプライ
- 決定: 常に貼る
- 上書き対象: T-001 2026-09-03（リプライ本文に URL を貼らない決定のうち、
  相手が聞いた場合の扱いを除く部分）
- 出典: セッション内の判断、成果物なし
""",
        })
        self.assertEqual(state["リプライ本文に URL を貼らない"],
                         org.SUPERSEDED.format("T-002"))
        self.assertEqual(state["露出の主経路を自前ポストからリプライへ移す"], org.ACTIVE)
        self.assertEqual(state["副次指標の内訳を組み直す"], org.ACTIVE)
        self.assertEqual(warn, [])

    def test_指し先が一意に定まらないときは_どれも失効させずに警告する(self):
        state, warn = self.resolve({
            "T-001": SAME_DAY_TWO,
            "T-002": """
### 2026-09-04 なにかを変える
- 対象: X運用
- 決定: なにか
- 上書き対象: T-001 2026-09-03
""",
        })
        self.assertEqual(state["露出の主経路を自前ポストからリプライへ移す"], org.ACTIVE)
        self.assertEqual(state["副次指標の内訳を組み直す"], org.ACTIVE)
        self.assertEqual(state["リプライ本文に URL を貼らない"], org.ACTIVE)
        self.assertEqual(state["副次指標の内訳を組み直す"], org.ACTIVE)
        self.assertEqual(len(warn), 1)
        self.assertIn("T-001 2026-09-03", warn[0])
        self.assertIn("3 件", warn[0])

    def test_括弧の中身がどの決定とも一致しなければ_失効させずに警告する(self):
        state, warn = self.resolve({
            "T-001": SAME_DAY_TWO,
            "T-002": """
### 2026-09-04 なにかを変える
- 対象: X運用
- 決定: なにか
- 上書き対象: T-001 2026-09-03（存在しない対象の話）
""",
        })
        self.assertEqual(state["露出の主経路を自前ポストからリプライへ移す"], org.ACTIVE)
        self.assertEqual(state["副次指標の内訳を組み直す"], org.ACTIVE)
        self.assertEqual(state["リプライ本文に URL を貼らない"], org.ACTIVE)
        self.assertEqual(state["副次指標の内訳を組み直す"], org.ACTIVE)
        self.assertEqual(len(warn), 1)

    def test_より長く一致した対象が勝つ(self):
        """対象が入れ子（`A / B` と `A / B / C`）のとき、指した側だけを失効させる。"""
        state, warn = self.resolve({
            "T-001": """
### 2026-09-03 型を絞る
- 対象: X運用 / 投稿の型
- 決定: 6本にする

### 2026-09-03 粉量の12通りは使わない
- 対象: X運用 / 投稿の型 / データの正しさ
- 決定: 使わない

### 2026-09-03 会話型は露出型と同じ指標で比較しない
- 対象: X運用 / 型の効果測定
- 決定: 比較しない
""",
            "T-002": """
### 2026-09-04 粉量の扱いを戻す
- 対象: X運用 / 投稿の型 / データの正しさ
- 決定: 条件付きで使う
- 上書き対象: T-001 2026-09-03（`X運用 / 投稿の型 / データの正しさ`）
""",
        })
        self.assertEqual(state["粉量の12通りは使わない"], org.SUPERSEDED.format("T-002"))
        self.assertEqual(state["型を絞る"], org.ACTIVE)
        self.assertEqual(state["会話型は露出型と同じ指標で比較しない"], org.ACTIVE)
        self.assertEqual(warn, [])


    def test_同じだけ一致する候補が複数あれば_どれも失効させずに警告する(self):
        """**同じ日に同じ `対象` の決定が2件あると起きる。**特殊な入力ではない。

        ここで黙って1件を選ぶことは、このスクリプトが直した不具合そのものの形である。
        """
        state, warn = self.resolve({
            "T-001": """
### 2026-09-03 リプライ本文に URL を貼らない
- 対象: X運用 / リプライ
- 決定: 相手が聞いた場合を除き貼らない

### 2026-09-03 リプライは1日12件を超えない
- 対象: X運用 / リプライ
- 決定: 12件を上限にする
""",
            "T-002": """
### 2026-09-04 リプライの扱いを変える
- 対象: X運用 / リプライ
- 決定: 変える
- 上書き対象: T-001 2026-09-03（X運用 / リプライ）
""",
        })
        self.assertEqual(state["リプライ本文に URL を貼らない"], org.ACTIVE)
        self.assertEqual(state["リプライは1日12件を超えない"], org.ACTIVE)
        self.assertEqual(len(warn), 1)
        self.assertIn("同じだけ一致する", warn[0])


class TestBackwardCompatibility(SupersedeCase):
    """**過去の決定ログは書き換えない規約なので、旧来の書き方は読めなければならない。**"""

    def test_同じ日の決定が1件だけなら_括弧なしで従来どおり失効する(self):
        state, warn = self.resolve({
            "T-001": """
### 2026-05-10 認証ライブラリを A にする
- 対象: 認証
- 決定: A を使う
""",
            "T-002": """
### 2026-06-01 認証ライブラリを B へ移す
- 対象: 認証
- 決定: B を使う
- 上書き対象: T-001 2026-05-10
""",
        })
        self.assertEqual(state["認証ライブラリを A にする"], org.SUPERSEDED.format("T-002"))
        self.assertEqual(warn, [])

    def test_複数の指し先を区切って書ける(self):
        state, warn = self.resolve({
            "T-001": """
### 2026-05-10 決定あ
- 対象: 認証
- 決定: あ
""",
            "T-002": """
### 2026-05-11 決定い
- 対象: 認証
- 決定: い
""",
            "T-003": """
### 2026-06-01 両方を置き換える
- 対象: 認証
- 決定: う
- 上書き対象: T-001 2026-05-10 / T-002 2026-05-11
""",
        })
        self.assertEqual(state["決定あ"], org.SUPERSEDED.format("T-003"))
        self.assertEqual(state["決定い"], org.SUPERSEDED.format("T-003"))
        self.assertEqual(warn, [])

    def test_指し先が存在しなければ従来どおり警告する(self):
        state, warn = self.resolve({
            "T-002": """
### 2026-06-01 置き換える
- 対象: 認証
- 決定: う
- 上書き対象: T-001 2026-05-10
""",
        })
        self.assertEqual(len(warn), 1)
        self.assertIn("見つからない", warn[0])

    def test_書式が読めなければ従来どおり警告する(self):
        state, warn = self.resolve({
            "T-002": """
### 2026-06-01 置き換える
- 対象: 認証
- 決定: う
- 上書き対象: 前のやつ
""",
        })
        self.assertEqual(len(warn), 1)
        self.assertIn("読めない", warn[0])


if __name__ == "__main__":
    unittest.main(verbosity=2)

/**
 * スタイルの不変条件。
 *
 * 🔒 未定義のカスタムプロパティを使わない。
 *    CSS は未定義の `var(--x)` を「宣言ごと無効」として黙って捨てる（invalid at
 *    computed-value time）。エラーも警告も出ない。`padding: var(--space-5)` は
 *    padding が 0 になるだけで、崩れて初めて気付く。
 *    実際に `--space-5` が定義されないまま使われ、製品カードの余白が
 *    スマホでだけ消えていた（PC は 900px 以上の指定で上書きされていたので気付けなかった）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const STYLE_DIR = 'src/styles';
const SOURCE_DIRS = ['src/styles', 'src/templates', 'src/assets'];

async function collectFiles(dir, extensions) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectFiles(full, extensions);
      return extensions.includes(path.extname(entry.name)) ? [full] : [];
    }),
  );
  return nested.flat();
}

async function readAll(files) {
  const contents = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  return files.map((file, i) => ({ file, text: contents[i] }));
}

test('🔒 未定義のカスタムプロパティを参照しない', async () => {
  const defined = new Set();
  for (const { text } of await readAll(await collectFiles(STYLE_DIR, ['.css']))) {
    for (const [, name] of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(name);
  }

  const sourceFiles = (
    await Promise.all(SOURCE_DIRS.map((dir) => collectFiles(dir, ['.css', '.js'])))
  ).flat();

  const missing = new Set();
  for (const { file, text } of await readAll(sourceFiles)) {
    // 第2引数はフォールバック。var(--x, 1px) は未定義でも壊れないので見逃す
    for (const [, name, next] of text.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
      if (next === ')' && !defined.has(name)) missing.add(`${file}: ${name}`);
    }
  }

  assert.deepEqual(
    [...missing],
    [],
    `tokens.css に無いカスタムプロパティを参照しています。宣言ごと捨てられます:\n${[...missing].join(
      '\n',
    )}`,
  );
});

/**
 * 🔒 hidden 属性を作者スタイルで勝たせておく。
 *
 * ブラウザ既定の [hidden]{display:none} は UA スタイルなので、`.p-item { display: grid }`
 * のような作者スタイルに詳細度と無関係に負ける。初期表示の件数絞り・「さらに表示」・
 * 絞り込み・他ストアの開閉はすべて hidden の付け外しで動くため、この1行が消えると
 * 全部まとめて無効になる。HTML には hidden が付いたままなので原因が見えない。
 */
test('🔒 [hidden] を作者スタイルで打ち消せないようにしてある', async () => {
  // コメント内にも [hidden]{display:none} と書いてあるので、先に落としてから探す
  const css = (await readFile(path.join(STYLE_DIR, 'products.css'), 'utf8')).replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const rule = css.match(/\[hidden\][^{]*\{[^}]*\}/);

  assert.ok(rule, 'products.css に [hidden] のルールがありません');
  assert.match(
    rule[0],
    /display:\s*none\s*!important/,
    '[hidden] は display:none !important でないと .p-item の display に負けます',
  );
});

/**
 * 🔒 リスト表示の --list-min は、列幅・溝・左右余白の合計を下回ってはならない。
 *
 * .p-list[data-view='list'] は角丸のために overflow:hidden を持つ。行のグリッドが
 * 自分の幅からはみ出すと、横スクロールされず**切り取られる** — 右端の
 * 「最安ストア」列が画面から消え、しかもエラーは出ない。
 * 列を1本足した / 幅を広げたときに気付けるよう、合計をここで検算する。
 */
test('🔒 リスト表示の min-width が列の合計を下回らない', async () => {
  const [tokensCss, productsCss] = await Promise.all([
    readFile(path.join(STYLE_DIR, 'tokens.css'), 'utf8'),
    readFile(path.join(STYLE_DIR, 'products.css'), 'utf8'),
  ]);

  const tokens = new Map(
    [...tokensCss.matchAll(/(--space-\d+):\s*(\d+)px/g)].map(([, name, px]) => [name, px]),
  );

  /** 宣言を取り出し、var(--space-n) を実数に置き換えて px の並びにする */
  function pxValues(name) {
    const declaration = productsCss.match(new RegExp(`${name}:\\s*([^;]+);`));
    assert.ok(declaration, `${name} の宣言が見つかりません`);
    const resolved = declaration[1].replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, token) => {
      const px = tokens.get(token);
      assert.ok(px, `${token} が tokens.css にありません`);
      return `${px}px`;
    });
    // minmax(160px, 2fr) は下限の 160px を取る。これ以上は縮まない
    return [...resolved.replace(/minmax\(\s*(\d+)px[^)]*\)/g, '$1px').matchAll(/(\d+)px/g)].map(
      ([, px]) => Number(px),
    );
  }

  const columns = pxValues('--list-cols');
  const gap = pxValues('--list-gap');
  const padding = pxValues('--list-pad');
  const [min] = pxValues('--list-min');

  // gap / padding は 1値なら上下左右共通、2値なら「縦 横」
  const columnGap = gap.length === 1 ? gap[0] : gap[1];
  const paddingX = padding.length === 1 ? padding[0] : padding[1];

  const required =
    columns.reduce((sum, w) => sum + w, 0) + columnGap * (columns.length - 1) + paddingX * 2;

  assert.ok(
    min >= required,
    `--list-min: ${min}px は狭すぎます。列 ${columns.length} 本には ${required}px 必要で、` +
      `足りないと右端の列が overflow:hidden に切り取られます`,
  );
});

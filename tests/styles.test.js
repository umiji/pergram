/**
 * スタイルの不変条件。
 *
 * ⚠️ このファイルの末尾に T-017（ボタンのコントラスト比が WCAG 2.2 AA を下回っている）の
 *    受け入れテストがある。**実装済み（8 件すべて GREEN）。** 一時的な skip は外してある。
 *    ここが落ちたら、ボタンの色が WCAG 2.2 AA を割ったということである。
 *    しきい値を下げて通さない。src/styles/tokens.css の色の側で直すこと。
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

/* ==========================================================================
   T-017 の受け入れテスト — ボタンのコントラスト比（WCAG 2.2 AA）

   docs/tasks/T-017.md §完了条件 を二値で判定できる形に落としてある。
   実装より先に書かれ、RED（主CTA 3.56:1 / 従CTA の境界 1.23:1）を確認してから
   T-017 の実装が入った。以後はこれが回帰テストとして効く。

   === 判定の根拠（しきい値の出所）===
   - 文字 4.5:1 … WCAG 2.2 SC 1.4.3 Contrast (Minimum)。ボタンの文言は本文相当である。
     🔒 T-017 の禁止事項より、文字を大きくして緩和基準 3:1 へ逃げる解き方は採らない。
   - 非テキスト 3:1 … WCAG 2.2 SC 1.4.11 Non-text Contrast。「押せる操作である」ことを
     示す面または境界が、隣接するページ背景と 3:1 以上あること。
   - 相対輝度と比の式は WCAG 2.x の定義そのまま（下の relativeLuminance / contrastRatio）。
     式の実装が正しいことは「完了条件3」のテストが黒白 21:1 等で自己検査している。

   === 色の出所 ===
   🔒 色の唯一の出所は src/styles/tokens.css である。ここでは CSS の var() を
      tokens.css から解決して実際の RGB にしてから測る。依存パッケージは足さない
      （このリポジトリは依存ゼロで動く。CSS パーサも色ライブラリも入れない）。

   === 測っていないもの（範囲外。判断はオーケストレーターへ）===
   - `.btn--quiet:hover` の文字（`var(--signal)` を `--paper` の上に置く。変更前 3.41:1）。
     T-017 の完了条件が名指ししていないので**アサーションにしていない**。
     ここを 4.5:1 にすると --signal を主CTA の要求より更に暗くする必要があり、
     T-017 の停止条件（橙系を保てるか）に踏み込むため、テスト側では決めない。
   - `products.css` の `.btn--ghost`（変更前の境界 1.23:1 で `.btn--quiet` と同じ問題）。
     products.css は T-017 の変更範囲に入っていないのでアサーションにしていない。
     `--line` を直す解き方なら道連れで直り、lp.css 側だけに新トークンを足す解き方なら
     残る。どちらを採ったかは実装の報告で分かるようにしてほしい。
   ========================================================================== */

/** WCAG 2.2 SC 1.4.3（文字）。ボタンの文言は本文相当 */
const TEXT_CONTRAST_MIN = 4.5;
/** WCAG 2.2 SC 1.4.11（非テキスト）。「押せる」ことを示す面・境界 */
const NON_TEXT_CONTRAST_MIN = 3;
/** ページ背景。body { background: var(--paper) }（site.css / lp.css） */
const PAGE_BACKGROUND_TOKEN = '--paper';

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 色として解釈しうるトークンを1つ取り出す。border ショートハンドからも拾える */
const COLOR_PATTERN =
  /var\(\s*--[\w-]+\s*\)|#[0-9a-f]{3}\b|#[0-9a-f]{4}\b|#[0-9a-f]{6}\b|#[0-9a-f]{8}\b|rgba?\([^)]*\)|\btransparent\b/i;

/** CSS の色を [r, g, b, a] にする。r/g/b は 0-255、a は 0-1 */
function parseColor(value) {
  const text = String(value).trim();
  if (/^transparent$/i.test(text)) return [0, 0, 0, 0];

  const hex = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      const channels = [...digits].map((d) => parseInt(d + d, 16));
      return [channels[0], channels[1], channels[2], channels.length === 4 ? channels[3] / 255 : 1];
    }
    if (digits.length === 6 || digits.length === 8) {
      const channels = digits.match(/../g).map((pair) => parseInt(pair, 16));
      return [channels[0], channels[1], channels[2], channels.length === 4 ? channels[3] / 255 : 1];
    }
  }

  const fn = /^rgba?\(([^)]*)\)$/i.exec(text);
  if (fn) {
    const parts = fn[1].split(/[,\s/]+/).filter(Boolean);
    const channel = (part) =>
      part.endsWith('%') ? (Number.parseFloat(part) / 100) * 255 : Number.parseFloat(part);
    if (parts.length >= 3) {
      const alphaPart = parts[3];
      const alpha =
        alphaPart === undefined
          ? 1
          : alphaPart.endsWith('%')
            ? Number.parseFloat(alphaPart) / 100
            : Number.parseFloat(alphaPart);
      return [channel(parts[0]), channel(parts[1]), channel(parts[2]), alpha];
    }
  }

  throw new Error(
    `コントラスト検査が解釈できない色です: "${value}"。` +
      '#rgb / #rrggbb / rgb() / rgba() / transparent のいずれかで書くか、' +
      'tests/styles.test.js の parseColor を対応させてください',
  );
}

/** 半透明の色を背景の上に重ねて不透明にする（アルファ合成） */
function composite(foreground, background) {
  const alpha = foreground[3];
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
    1,
  ];
}

/** WCAG 2.x の相対輝度 */
function relativeLuminance([r, g, b]) {
  const linear = (channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.x のコントラスト比。1〜21 を返す */
function contrastRatio(a, b) {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** tokens.css の :root 宣言を name -> value で読む */
function readTokens(css) {
  const tokens = new Map();
  for (const [, name, value] of stripComments(css).matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
    tokens.set(name, value.trim());
  }
  return tokens;
}

/** var(--x) を tokens.css の値で置き換える。入れ子も辿る */
function resolveVars(value, tokens, depth = 0) {
  if (depth > 10) throw new Error(`var() の参照が循環しています: ${value}`);
  const reference = /var\(\s*(--[\w-]+)\s*\)/.exec(value);
  if (!reference) return value.trim();
  const resolved = tokens.get(reference[1]);
  assert.ok(resolved !== undefined, `${reference[1]} が tokens.css にありません`);
  return resolveVars(value.replace(reference[0], resolved), tokens, depth + 1);
}

/**
 * 指定セレクタと**完全に一致する**ルールの宣言を、記述順に重ねて返す。
 * `[^{}]+\{[^{}]*\}` は @media のような入れ子の外枠には一致しないので、
 * 中身のルールだけが素直に拾える。
 */
function declarationsFor(css, selector) {
  const declarations = new Map();
  for (const [, selectorText, body] of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorText.split(',').some((one) => one.trim() === selector)) continue;
    for (const declaration of body.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon > 0) {
        declarations.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
      }
    }
  }
  return declarations;
}

const pickColor = (value) => (value ? (COLOR_PATTERN.exec(value) || [null])[0] : null);

/**
 * ボタンの実効色を出す。selectors はカスケード順（`.btn` → `.btn--signal` → `:hover`）。
 * - fill   … 面。ページ背景の上に合成済み
 * - text   … 文字。面の上に合成済み
 * - border … 境界。ページ背景の上に合成済み（無ければ null）
 */
function buttonColors(css, tokens, selectors, page) {
  const declarations = new Map();
  for (const selector of selectors) {
    for (const [property, value] of declarationsFor(css, selector)) declarations.set(property, value);
  }
  if (declarations.size === 0) return null;

  const resolve = (raw) => parseColor(resolveVars(raw, tokens));

  const rawFill = pickColor(declarations.get('background') ?? declarations.get('background-color'));
  const fill = rawFill ? composite(resolve(rawFill), page) : page;

  const rawText = pickColor(declarations.get('color'));
  const text = rawText ? composite(resolve(rawText), fill) : null;

  const rawBorder = pickColor(declarations.get('border-color') ?? declarations.get('border'));
  const borderColor = rawBorder ? resolve(rawBorder) : null;
  // border: none / 幅 0 は境界が無いのと同じ
  const hasBorderWidth = !/^\s*(none|0)\b/.test(declarations.get('border') ?? '1px');
  const border = borderColor && hasBorderWidth ? composite(borderColor, page) : null;

  return { fill, text, border, declarations };
}

const round2 = (value) => Math.round(value * 100) / 100;

async function loadStyle(file) {
  return readFile(path.join(STYLE_DIR, file), 'utf8');
}

async function loadContext() {
  const tokens = readTokens(await loadStyle('tokens.css'));
  const page = parseColor(resolveVars(`var(${PAGE_BACKGROUND_TOKEN})`, tokens));
  const [lp, products] = await Promise.all([loadStyle('lp.css'), loadStyle('products.css')]);
  return { tokens, page, sheets: { 'lp.css': lp, 'products.css': products } };
}

/* ---- 完了条件1: 主CTA の文字 -------------------------------------------- */

test('🔒 完了条件1: 主CTA (.btn--signal) の文字が背景に対して 4.5:1 以上', async () => {
  const { tokens, page, sheets } = await loadContext();
  const failures = [];

  for (const [file, css] of Object.entries(sheets)) {
    for (const state of ['', ':hover']) {
      const selectors = state
        ? ['.btn', '.btn--signal', '.btn--signal:hover']
        : ['.btn', '.btn--signal'];
      const colors = buttonColors(css, tokens, selectors, page);
      if (!colors || !colors.text) continue;

      const ratio = contrastRatio(colors.text, colors.fill);
      if (ratio < TEXT_CONTRAST_MIN) {
        failures.push(`${file} .btn--signal${state}: ${round2(ratio)}:1`);
      }
    }
  }

  assert.deepEqual(
    failures,
    [],
    '主CTA の文字が WCAG 2.2 AA（SC 1.4.3）の 4.5:1 を下回っています。\n' +
      `${failures.join('\n')}\n` +
      '🔒 src/styles/tokens.css の色（--signal / --signal-hover）で解くこと。' +
      'コンポーネントへ色を直書きしない。文字を大きくして 3:1 の緩和基準へ逃げない',
  );
});

/* ---- 完了条件1b: 従CTA が「押せる」と分かること -------------------------- */

test('🔒 完了条件1b: 従CTA の面か境界がページ背景に対して 3:1 以上', async () => {
  const { tokens, page, sheets } = await loadContext();

  // 🔒 .btn--subtle は「使う場合はそれも」（T-017 §完了条件1b）。
  //    テンプレートに現れて初めて検査対象にする。
  const templates = await readAll(await collectFiles('src/templates', ['.js']));
  const markup = templates.map(({ text }) => text).join('\n');
  const targets = ['.btn--quiet', ...(markup.includes('btn--subtle') ? ['.btn--subtle'] : [])];

  const failures = [];
  for (const target of targets) {
    const colors = buttonColors(sheets['lp.css'], tokens, ['.btn', target], page);
    assert.ok(colors, `lp.css に ${target} のルールがありません`);

    const fillRatio = contrastRatio(colors.fill, page);
    const borderRatio = colors.border ? contrastRatio(colors.border, page) : 1;
    const best = Math.max(fillRatio, borderRatio);

    if (best < NON_TEXT_CONTRAST_MIN) {
      failures.push(
        `${target}: 面 ${round2(fillRatio)}:1 / 境界 ${round2(borderRatio)}:1 ` +
          `（良い方でも ${round2(best)}:1）`,
      );
    }
  }

  assert.deepEqual(
    failures,
    [],
    '従CTA に「押せる操作である」ことを示す手掛かりが無い（WCAG 2.2 SC 1.4.11 の 3:1 未満）。\n' +
      `${failures.join('\n')}\n` +
      '面か境界のどちらかがページ背景 (--paper) に対して 3:1 以上あること。' +
      '🔒 主従は逆転させない（待機リストが主、ベータ版が従）。色は tokens.css で定義する',
  );
});

test('完了条件1b: 従CTA (.btn--quiet) の文字が自分の面に対して 4.5:1 以上', async () => {
  const { tokens, page, sheets } = await loadContext();
  const colors = buttonColors(sheets['lp.css'], tokens, ['.btn', '.btn--quiet'], page);

  assert.ok(colors?.text, 'lp.css の .btn--quiet に color の宣言がありません');
  const ratio = contrastRatio(colors.text, colors.fill);

  assert.ok(
    ratio >= TEXT_CONTRAST_MIN,
    `.btn--quiet の文字が ${round2(ratio)}:1 です。従を「押せる」ようにするために面を足すなら、` +
      'その面の上で文字が 4.5:1 を保つこと（面を濃くして文字が読めなくなる直し方を防ぐ）',
  );
});

/* ---- 完了条件3: 変更前の色を入れると落ちること -------------------------- */

test('完了条件3: コントラスト比の計算が、変更前の色を実際に落とせる', () => {
  // 式そのものの自己検査。WCAG の既知の値と一致しなければ、上の判定は信用できない
  assert.equal(round2(contrastRatio(parseColor('#000'), parseColor('#fff'))), 21);
  assert.equal(round2(contrastRatio(parseColor('#fff'), parseColor('#fff'))), 1);
  assert.equal(round2(contrastRatio(parseColor('#777'), parseColor('#fff'))), 4.48);

  // 半透明の合成も同じ経路で効いていること
  const opaque = composite(parseColor('rgba(0, 0, 0, 0.5)'), parseColor('#fff'));
  assert.deepEqual(opaque.map(Math.round), [128, 128, 128, 1]);

  // T-010 のレビュー R-010-1 が測った変更前の値。ここが 4.5 / 3 を超えたら
  // 「元の色でも通ってしまう」ことになり、完了条件1・1b のテストは無意味になる
  const before = {
    signal: contrastRatio(parseColor('#ffffff'), parseColor('#ea580c')),
    quietBorder: contrastRatio(
      composite(parseColor('rgba(22, 24, 29, 0.1)'), parseColor('#fafaf9')),
      parseColor('#fafaf9'),
    ),
  };

  assert.equal(round2(before.signal), 3.56, '変更前の主CTA は 3.56:1（T-017 §目的の「約 3.6」）');
  assert.equal(round2(before.quietBorder), 1.23, '変更前の従CTA の境界は 1.23:1（同「約 1.25」）');

  assert.ok(before.signal < TEXT_CONTRAST_MIN, '変更前の主CTA は 4.5:1 を下回るはず');
  assert.ok(before.quietBorder < NON_TEXT_CONTRAST_MIN, '変更前の従CTA の境界は 3:1 を下回るはず');
});

/* ---- 完了条件6: 他のボタンが悪化していないこと -------------------------- */

/**
 * 変更前（T-017 着手前）の実測値を小数第2位で切り捨てたもの。
 * `npm test` を通しながら測った値であり、推定値ではない。
 *
 * 意図的に入れていないもの:
 * - `.btn--signal` の**文字** … 完了条件1 が上げる対象なので下限を置く意味がない
 * - `.btn--quiet` / `.btn--subtle` の面・境界 … 完了条件1b で上げる対象
 * - `.btn--quiet` の**文字** … 面を足す直し方だと下がりうる。専用のテストで 4.5:1 を見ている
 */
const CONTRAST_BASELINE = [
  { file: 'lp.css', selector: '.btn--dark', measure: 'text', min: 17.09 },
  { file: 'lp.css', selector: '.btn--dark', measure: 'fill', min: 17.09 },
  { file: 'lp.css', selector: '.btn--subtle', measure: 'text', min: 3.35 },
  { file: 'lp.css', selector: '.btn--signal', measure: 'fill', min: 3.4 },
  { file: 'products.css', selector: '.btn--dark', measure: 'text', min: 17.85 },
  { file: 'products.css', selector: '.btn--dark', measure: 'fill', min: 17.09 },
  { file: 'products.css', selector: '.btn--ghost', measure: 'text', min: 17.09 },
  { file: 'products.css', selector: '.btn--signal', measure: 'fill', min: 3.4 },
];

test('完了条件6: 他の .btn--* のコントラスト比が変更前より悪化していない', async () => {
  const { tokens, page, sheets } = await loadContext();
  const regressions = [];

  for (const { file, selector, measure, min } of CONTRAST_BASELINE) {
    const colors = buttonColors(sheets[file], tokens, ['.btn', selector], page);
    assert.ok(colors, `${file} に ${selector} のルールがありません`);

    const ratio =
      measure === 'text'
        ? contrastRatio(colors.text, colors.fill)
        : contrastRatio(colors.fill, page);

    if (round2(ratio) < min) {
      regressions.push(`${file} ${selector} の${measure === 'text' ? '文字' : '面'}: ` +
        `${round2(ratio)}:1（変更前は ${min}:1）`);
    }
  }

  assert.deepEqual(
    regressions,
    [],
    '主CTA・従CTA を直した副作用で、他のボタンのコントラスト比が下がっています。\n' +
      `${regressions.join('\n')}\n` +
      '共有トークン（--ink / --signal / --line 等）を動かすと他のボタンへ波及します',
  );
});

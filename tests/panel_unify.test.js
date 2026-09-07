/**
 * T-053 の受け入れテスト。「製品一覧の面の統一と、要望フォームの文言修正」。
 *
 * docs/tasks/T-053.md の ## 完了条件 のうち、**機械的に判定できるもの**だけを
 * 二値の検査へ落としてある。**実装より先に書いてあるので、未実装のうちは落ちるのが正しい。**
 *
 * ────────────────────────────────────────────────────────────────────────
 * === 目印は指示と設計書の側が決めている ===
 *
 * このファイルは自分で名前を決めない。見ているのは次の2つに書かれた値だけである。
 *
 *   docs/tasks/T-053.md ## 完了条件      … 文言の literal（A-1 / A-2 / A-3）
 *   docs/design/design.md「面の体系と字送りの階層（2026-09-08 / T-053）」🔒
 *                                        … トークン名（§2.1）・字送り T1–T6（§3）・
 *                                          クラス名 `.request-flow__thanks`（§7 / §10）・
 *                                          翻訳キー `request.surveyThanks`（§7）
 *
 * === CSS は「トークンが在ること」だけを見ても意味がない ===
 * `--panel-*` を tokens.css へ足しても、コンポーネント側の直書きが残っていれば
 * 画面は1ミリも揃わない。**足したか（B-1）と、消したか（B-2）の両方を見る。**
 * 設計書 §2.4「これに伴って消すもの」が、B-1 / B-2 の判定はそこで行えると書いている。
 *
 * === セレクタは完全一致でしか見ない ===
 * `.waitlist-band .request-band__inner`（LP で器の面を白へ抜く指定）のような
 * **文脈付きの上書きは対象外**である。lp.css の 🔒 に理由が書かれており、
 * 面の体系の話とは別の判断で入っている。ここで巻き込むと、設計書が
 * 「支配しないもの」と書いた範囲まで動かすことになる。
 *
 * === 見た目そのものはここでは判定しない ===
 * B-3（ボタンの配置）/ B-6（フォーカスリングの見え方）/ B-6b（礼の文が画面内に見える）/
 * B-7（横溢れ）/ B-8（LP の目視）は**スクリーンショットで判定する**（T-053 ## テスト方法）。
 * 書けないものを無理にテストにしない。特に B-6b は A-2 の文字列検査を通しても
 * 落ちうるので、**A-2 が通ったことを B-6b の証拠にしないこと。**
 * ────────────────────────────────────────────────────────────────────────
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { loadTranslator } from '../src/lib/i18n.js';
import { productsPage } from '../src/templates/products.js';
import { lpPage, ROADMAP_NUTRIENTS } from '../src/templates/lp.js';
import { requestCta, requestFlow } from '../src/templates/request.js';
import { makeRows, market } from './fixtures.js';
import { DomEvent, runLpScript } from './mini_dom.js';

const t = await loadTranslator('ja');
const rows = makeRows();
const categories = JSON.parse(await readFile('config/categories.json', 'utf8'));
const category = categories.protein;
const MARKETS = JSON.parse(await readFile('config/markets.json', 'utf8'));

const STYLE_DIR = 'src/styles';
const DIST_DIR = 'dist';
const SCRIPT = 'src/assets/request.js';

const HERO_ROWS = 3;
const BETA_PATH = '/ja/protein/';
const WAITLIST_PATH = '/ja/#waitlist';

/* ---- 完了条件が名指ししている文字列 ------------------------------------ */

/** A-1 / A-2。礼の文（PO 指示の1文目） */
const THANKS_1 = 'リクエストありがとうございます。';
/** A-1。依頼の文（PO 指示の2文目） */
const THANKS_2 = 'もしよければ任意で詳しくご要望をお聞かせください。';
/** A-2。この文言より**前**に礼の文が出ること */
const SURVEY_HEADING = 'どの成分・製品を追加しますか';
/** A-3。dist / 描画結果から消えること */
const RETIRED_LEDE = '回答は任意です。リクエストはすでに受け取りました。';

/** 設計書 §7 / §10 が決めた翻訳キーとクラス名 */
const THANKS_KEY = 'request.surveyThanks';
const RETIRED_KEY = 'request.surveyLede';
const THANKS_CLASS = '.request-flow__thanks';

/** 設計書 §2.1 が決めた面のトークン。値の出所はこれだけになる */
const PANEL_TOKENS = [
  '--panel-bg',
  '--panel-border',
  '--panel-radius',
  '--panel-pad',
  '--panel-call-bg',
  '--panel-call-border',
];

/** 設計書 §2.4。この4つの面は角丸・背景・枠線・余白を直書きしない */
const PANEL_SELECTORS = ['.explainer', '.request-band__inner', '.request-flow__step'];
/** 面の幾何を決めるプロパティ。ここに literal が残っていたら統一されていない */
const PANEL_PROPERTIES = ['padding', 'background', 'background-color', 'border', 'border-radius'];

const nutrients = [
  { id: 'protein', count: rows.length },
  ...ROADMAP_NUTRIENTS.map((id) => ({ id, count: 0 })),
];

/* ---- 描画ヘルパ -------------------------------------------------------- */

function renderProducts() {
  return productsPage({
    t,
    locale: 'ja',
    market,
    rows,
    nutrientId: 'protein',
    nutrientName: 'タンパク質',
    updatedAt: '2026-08-06',
    targetIntake: 60,
    category,
    nutrients,
    disclosureKey: MARKETS.JP.disclosureKey,
    waitlistPath: WAITLIST_PATH,
    gaMeasurementId: null,
  });
}

function renderLp() {
  return lpPage({
    t,
    locale: 'ja',
    currency: MARKETS.JP.currency,
    displayUnit: 'g',
    topRows: rows.slice(0, HERO_ROWS),
    totalCount: rows.length,
    nutrientName: 'タンパク質',
    disclosureKey: MARKETS.JP.disclosureKey,
    betaPath: BETA_PATH,
    gaMeasurementId: null,
    support: market.support,
  });
}

/**
 * 完了条件は `dist/` に対して書かれている。ビルド前でも走らねばならないので、
 * **同じ検査を描画結果に対して行い、`dist/` が既にあるときはそちらにも重ねる**
 * （tests/request_unify.test.js と同じ扱い）。
 */
async function htmlSources(distPath, rendered) {
  const sources = [{ name: `描画結果（${distPath} 相当）`, html: rendered }];
  try {
    sources.push({ name: distPath, html: await readFile(distPath, 'utf8') });
  } catch {
    // ビルド前。描画結果だけで判定する
  }
  return sources;
}

async function distHtmlFiles(dir = DIST_DIR) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // ビルド前
  }
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return distHtmlFiles(full);
      return full.endsWith('.html') ? [full] : [];
    }),
  );
  return nested.flat();
}

/* ---- CSS の解析ヘルパ -------------------------------------------------- */

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

async function collectCss(dir = STYLE_DIR) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectCss(full);
      if (!full.endsWith('.css')) return [];
      return [{ file: full, text: stripComments(await readFile(full, 'utf8')) }];
    }),
  );
  return nested.flat();
}

const CSS_FILES = await collectCss();
const TOKENS_CSS = CSS_FILES.find(({ file }) => file.endsWith('tokens.css'));
assert.ok(TOKENS_CSS, 'src/styles/tokens.css が見つかりません');

/** :root の宣言を name -> value で読む（tests/styles.test.js と同じ読み方） */
function readTokens(css) {
  const tokens = new Map();
  for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
    tokens.set(name, value.trim());
  }
  return tokens;
}

const TOKENS = readTokens(TOKENS_CSS.text);

/** var(--x) を tokens.css の値で置き換える。入れ子も辿る */
function resolveVars(value, depth = 0) {
  if (depth > 10) throw new Error(`var() の参照が循環しています: ${value}`);
  const reference = /var\(\s*(--[\w-]+)\s*\)/.exec(value);
  if (!reference) return value.replace(/\s+/g, ' ').trim();
  const resolved = TOKENS.get(reference[1]);
  assert.ok(resolved !== undefined, `${reference[1]} が tokens.css にありません`);
  return resolveVars(value.replace(reference[0], resolved), depth + 1);
}

/**
 * セレクタと**完全に一致する**ルールの宣言を、記述順にすべて拾う。
 * `[^{}]+\{[^{}]*\}` は @media の外枠には一致しないので、中身のルールが素直に拾える
 * （tests/styles.test.js の同名ヘルパと同じ理屈。あちらは Map に畳むが、
 *  ここは**メディアクエリ側の上書きも1件ずつ見たい**ので配列で返す）。
 *
 * @returns {Array<{ file: string, property: string, value: string }>}
 */
function declarationsOf(selector) {
  const found = [];
  for (const { file, text } of CSS_FILES) {
    for (const [, selectorText, body] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selectorText.split(',').some((one) => one.trim() === selector)) continue;
      for (const declaration of body.split(';')) {
        const colon = declaration.indexOf(':');
        if (colon <= 0) continue;
        found.push({
          file,
          property: declaration.slice(0, colon).trim(),
          value: declaration.slice(colon + 1).trim(),
        });
      }
    }
  }
  return found;
}

/** そのセレクタで最後に効く値。無ければ null */
function effectiveValue(selector, property) {
  const hits = declarationsOf(selector).filter((one) => one.property === property);
  return hits.length ? hits[hits.length - 1].value : null;
}

/* ======================================================================
 * A 群 — 文言
 * ==================================================================== */

test('A-1 ja に礼の文言のキーがあり、礼と依頼の2文を含む', async () => {
  const ja = JSON.parse(await readFile('locales/ja.json', 'utf8'));

  assert.ok(
    THANKS_KEY in ja,
    `locales/ja.json に ${THANKS_KEY} がありません（キー名は design.md §7 が決めている）`,
  );
  const value = ja[THANKS_KEY];
  assert.ok(value.includes(THANKS_1), `${THANKS_KEY} に「${THANKS_1}」が含まれていません`);
  assert.ok(value.includes(THANKS_2), `${THANKS_KEY} に「${THANKS_2}」が含まれていません`);
  assert.ok(
    value.indexOf(THANKS_1) < value.indexOf(THANKS_2),
    '礼より先に依頼が来ています。PO の指示は「礼と依頼の順」',
  );
});

test('A-4 en にも同じキーがある（キー集合の一致は render.test.js が見ている）', async () => {
  const en = JSON.parse(await readFile('locales/en.json', 'utf8'));
  assert.ok(THANKS_KEY in en, `locales/en.json に ${THANKS_KEY} がありません`);
  assert.ok(String(en[THANKS_KEY]).trim().length > 0, `${THANKS_KEY}(en) が空です`);
});

test('A-2 製品一覧で、礼の文がアンケートの見出しより前に出る', async () => {
  for (const { name, html } of await htmlSources('dist/ja/protein/index.html', renderProducts())) {
    const thanks = html.indexOf(THANKS_1);
    const heading = html.indexOf(SURVEY_HEADING);
    assert.ok(thanks >= 0, `${name}: 礼の文「${THANKS_1}」がありません`);
    assert.ok(heading >= 0, `${name}: アンケートの見出しがありません`);
    assert.ok(
      thanks < heading,
      `${name}: 礼の文が見出しより後ろにあります（${thanks} > ${heading}）`,
    );
  }
});

test('A-2 LP でも、礼の文がアンケートの見出しより前に出る', async () => {
  for (const { name, html } of await htmlSources('dist/ja/index.html', renderLp())) {
    const thanks = html.indexOf(THANKS_1);
    const heading = html.indexOf(SURVEY_HEADING);
    assert.ok(thanks >= 0, `${name}: 礼の文「${THANKS_1}」がありません`);
    assert.ok(heading >= 0, `${name}: アンケートの見出しがありません`);
    assert.ok(
      thanks < heading,
      `${name}: 礼の文が見出しより後ろにあります（${thanks} > ${heading}）`,
    );
  }
});

test('A-3 免責の一文が、描画結果にも dist にも1回も出ない', async () => {
  const sources = [
    { name: '描画結果（製品一覧）', html: renderProducts() },
    { name: '描画結果（LP）', html: renderLp() },
  ];
  for (const file of await distHtmlFiles()) {
    sources.push({ name: file, html: await readFile(file, 'utf8') });
  }

  for (const { name, html } of sources) {
    const count = html.split(RETIRED_LEDE).length - 1;
    assert.equal(count, 0, `${name}: 「${RETIRED_LEDE}」が ${count} 回残っています`);
  }
});

test('A-3 免責のキーそのものが ja / en から消えている', async () => {
  // 🔒 値だけ書き換えてキーを残すと、別の担当が同じ位置へ免責文を書き戻せる
  //    （T-053 決定ログ「礼の文は新キーを見出しより前に置き、surveyLede は削除する」）
  for (const locale of ['ja', 'en']) {
    const dict = JSON.parse(await readFile(`locales/${locale}.json`, 'utf8'));
    assert.ok(
      !(RETIRED_KEY in dict),
      `locales/${locale}.json に ${RETIRED_KEY} が残っています（キーごと消す）`,
    );
  }
});

/* ======================================================================
 * B 群 — 面の統一（機械的に判定できるぶん）
 * ==================================================================== */

test('B-1 面のトークンが tokens.css に定義されている', () => {
  const missing = PANEL_TOKENS.filter((name) => !TOKENS.has(name));
  assert.deepEqual(
    missing,
    [],
    `tokens.css に足りない面のトークン: ${missing.join(', ')}（design.md §2.1）`,
  );
});

test('B-1 面の角丸は --radius（14px）へ揃っている', () => {
  // 🔒 T-053 決定ログ「面の角丸は 16px ではなく 14px へ揃える」。
  //    --radius-lg（16px）は全画面シート専用として残す
  assert.ok(TOKENS.has('--panel-radius'), '--panel-radius がありません');
  assert.equal(
    resolveVars(TOKENS.get('--panel-radius')),
    resolveVars('var(--radius)'),
    '--panel-radius が --radius（14px）と違う値です',
  );
});

test('B-2 面のコンポーネントが角丸・背景・枠線・余白を直書きしていない', () => {
  const offenders = [];
  for (const selector of PANEL_SELECTORS) {
    for (const { file, property, value } of declarationsOf(selector)) {
      if (!PANEL_PROPERTIES.includes(property)) continue;
      // 値が --panel-* の参照だけで出来ていること。literal も他トークンも許さない
      const rest = value.replace(/var\(\s*--panel-[\w-]*\s*\)/g, '').trim();
      if (rest !== '') offenders.push(`${file}: ${selector} { ${property}: ${value} }`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    '面の値がコンポーネント側に直書きされています。' +
      '出所は --panel-* だけにする（design.md §2.4「消すもの」）:\n' +
      offenders.join('\n'),
  );
});

test('B-2 面の幾何がトークン経由で実際に指定されている（消しただけにしない）', () => {
  for (const selector of PANEL_SELECTORS) {
    for (const property of ['padding', 'background', 'border', 'border-radius']) {
      const value = effectiveValue(selector, property);
      assert.ok(
        value && /var\(\s*--panel-[\w-]*\s*\)/.test(value),
        `${selector} の ${property} が --panel-* から来ていません（現在: ${value}）`,
      );
    }
  }
});

test('B-1 注記（.notice）は面を持たない', () => {
  // 役割 C。箱に入った定型文は「読み飛ばしてよい欄」に見える（design.md §1）
  for (const property of ['background', 'background-color', 'border-radius']) {
    assert.equal(
      effectiveValue('.notice', property),
      null,
      `.notice に ${property} が残っています。注記は箱にしない（design.md §1 / §2.3）`,
    );
  }
  const padding = effectiveValue('.notice', 'padding');
  assert.ok(
    padding === null || resolveVars(padding) === '0',
    `.notice の padding が ${padding} です。注記は箱にしない（padding 0）`,
  );
});

/* ---- B-4 字送りの階層（design.md §3 の T1 / T2 / T3）-------------------- */

test('B-4 T1: 段の見出しは常に --size-md（画面幅で変えない）', () => {
  const sizes = declarationsOf('.request-flow__heading').filter(
    (one) => one.property === 'font-size',
  );
  assert.ok(sizes.length > 0, '.request-flow__heading に font-size がありません');
  for (const { file, value } of sizes) {
    assert.equal(
      resolveVars(value),
      resolveVars('var(--size-md)'),
      `${file}: 段の見出しの大きさが T1 と違います（${value}）。` +
        '段ごと・画面幅ごとに見出しの大きさが変わらないことが B-4 の中身',
    );
  }
});

test('B-4 T2: 完了表示が面のラベルと同じ字送りになっている', () => {
  // .explainer__label が T2 の既存の代表。.request-flow__done を同じ値へ揃える
  const expected = {
    'font-size': resolveVars('var(--size-sm)'),
    'font-weight': '700',
    color: resolveVars('var(--signal)'),
  };
  for (const selector of ['.explainer__label', '.request-flow__done']) {
    for (const [property, want] of Object.entries(expected)) {
      const value = effectiveValue(selector, property);
      assert.ok(value !== null, `${selector} に ${property} がありません（T2）`);
      assert.equal(
        resolveVars(value),
        want,
        `${selector} の ${property} が T2 と違います（${value}）。` +
          '受け取ったことを示す色は画面内で1つにする（design.md §3）',
      );
    }
  }
});

test('B-4 T3: 本文・リードの字送りが揃っている', () => {
  const wantSize = resolveVars('var(--size-sm)');
  const wantColor = resolveVars('var(--muted-strong)');

  for (const selector of [
    '.explainer__body',
    '.notice',
    '.request-band__lede',
    '.request-flow__lede',
    THANKS_CLASS,
  ]) {
    const size = effectiveValue(selector, 'font-size');
    const color = effectiveValue(selector, 'color');
    assert.ok(size !== null, `${selector} に font-size がありません（T3）`);
    assert.ok(color !== null, `${selector} に color がありません（T3）`);
    assert.equal(resolveVars(size), wantSize, `${selector} の font-size が T3 と違います（${size}）`);
    assert.equal(resolveVars(color), wantColor, `${selector} の color が T3 と違います（${color}）`);

    // 行送りは宣言されているものだけ見る（design.md §3 の変更点表に載るのは .notice）
    const lineHeight = effectiveValue(selector, 'line-height');
    if (lineHeight !== null) {
      assert.equal(lineHeight, '1.8', `${selector} の line-height が T3（1.8）と違います`);
    }
  }
});

/* ---- B-5 空の器 -------------------------------------------------------- */

function page() {
  return `${requestCta(t, { location: 'products_request_top' })}
${requestCta(t, { location: 'products_request_bottom' })}
${requestFlow(t, { support: market.support })}`;
}

async function clickRequest() {
  const dom = await runLpScript(page(), { scriptPath: SCRIPT });
  const step = (kind) => dom.body.querySelector(`[data-request-step="${kind}"]`);
  dom.body.querySelectorAll('[data-request-cta]')[0].dispatchEvent(new DomEvent('click'));
  await dom.flush();
  return { dom, step };
}

test('B-5 アンケートを飛ばすと、段そのものが畳まれる（空の器が残らない）', async () => {
  const { dom, step } = await clickRequest();

  dom.body.querySelector('[data-request-skip="survey"]').dispatchEvent(new DomEvent('click'));
  await dom.flush();

  assert.equal(
    step('survey').hidden,
    true,
    '飛ばしたアンケートの段が器ごと畳まれていません（枠だけのカードが画面に残る）',
  );
  // ⚠️ 既存テスト「飛ばした段でもフォームは畳まれ、次の段が開く」を壊さないこと
  assert.equal(
    dom.body.querySelector('[data-request-survey]').hidden,
    true,
    'フォームの hidden は維持する（T-053 決定ログ）',
  );
  assert.equal(step('email').hidden, false, 'メールの段が開いていません');
});

test('B-5 回答を送った段は器が残り、完了文言が読める', async () => {
  const { dom, step } = await clickRequest();

  const form = dom.body.querySelector('[data-request-survey]');
  form.querySelector('input[name="nutrients"][value="creatine"]').checked = true;
  form.dispatchEvent(new DomEvent('submit'));
  await dom.flush();

  assert.equal(
    step('survey').hidden,
    false,
    '送った段まで畳んでいます。完了文言を出す段は器を残す（T-053 決定ログ）',
  );
  const done = step('survey').querySelector('.request-flow__done');
  assert.equal(done.hidden, false, '完了文言が出ていません');
  assert.equal(done.textContent.trim(), t('request.surveyDone'));
});

test('B-5 先頭の段の余白を :first-child に持たせていない', () => {
  // 先頭の段を畳むと :first-child は構造上そこに残るので、2番目の段が余白を失う。
  // 余白は器（.request-flow）の側が持つ（design.md §5「併せて必要な変更」）
  for (const selector of [
    '.request-flow__step:first-child',
    '.waitlist-band .request-flow__step:first-child',
  ]) {
    const value = effectiveValue(selector, 'margin-top');
    assert.ok(
      value === null || resolveVars(value) === '0',
      `${selector} が margin-top: ${value} を持っています。` +
        '先頭の段を畳むと、この余白は誰にも渡らない',
    );
  }
});

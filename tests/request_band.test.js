/**
 * T-061 の単体テスト（実装担当が書く分）。
 *
 * 帯（`.request-band`）は **PO に3回差し戻されている**（T-053 → T-057 → T-061）。
 * 3回とも「値は合っているが要素同士の関係が壊れている」という同じ形だった。
 * ここで見張るのは**関係と出所**である。幅ごとの実測値は受け入れテスト（Chrome + CDP）の担当。
 *
 * 🔒 帯と面の幾何を決める値は `src/styles/site.css` ひとつ。
 *    この 🔒 は T-051 → T-053 → T-057 と3回破られている（完了条件 B-6）。
 * 🔒 `data-cta` と `aria-controls` の値を変えない。GA4 の前後比較が切れる。
 * 🔒 押下数・人数を画面に出さない（N-03 / 景表法）。
 * 🔒 注記を消さない。⚠️ 置き場は 2026-09-08 に PO がテキスト列（左列）へ移した。
 *    それ以前は「行動列のボタンの直下」だった。**右列へ戻さないこと。**
 *
 * 設計は docs/design/design.md §4（2026-09-08 / T-061 で全面改訂・2列）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadTranslator } from '../src/lib/i18n.js';
import { requestCta, requestFlow } from '../src/templates/request.js';
import { market } from './fixtures.js';
import { DomEvent, Element, parseFragment, runLpScript } from './mini_dom.js';

const tJa = await loadTranslator('ja');
const tEn = await loadTranslator('en');

const SCRIPT = 'src/assets/request.js';
const PAGE_ID = 'ja:protein';

/** 改行の差（CRLF）でセレクタの照合が落ちないよう正規化して読む */
const readCss = async (path) => (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
/** コメントを外した CSS。宣言だけを見るときはこちら（コメントに書いた 🔒 の文が引っかかる） */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const siteCss = await readCss('src/styles/site.css');
const lpCss = await readCss('src/styles/lp.css');
const productsCss = await readCss('src/styles/products.css');
const tokensCss = await readCss('src/styles/tokens.css');

function tree(html) {
  const root = new Element('div');
  for (const node of parseFragment(html)) root.appendChild(node);
  return root;
}

const band = (t = tJa) => tree(requestCta(t, { location: 'products_request_top' }));

/** 文書順の添字。前後関係はこれで比べる */
function order(root) {
  return root.querySelectorAll('*');
}
function at(root, selector) {
  const list = order(root);
  const el = root.querySelector(selector);
  assert.ok(el, `${selector} が無い`);
  return list.indexOf(el);
}

/** CSS の宣言ブロックを雑に取り出す（`{}` の入れ子は @container の1段だけ想定） */
function blockOf(css, selector) {
  const index = css.indexOf(selector);
  if (index < 0) return null;
  const open = css.indexOf('{', index);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

/* ====================================================================== */
/* 構図 — 2列の箱（完了条件 B-1a の構造側）                                */
/* ====================================================================== */

test('帯は版面 → 2つの箱（テキスト列 / 行動列）の入れ子になっている', () => {
  const root = band();
  const layout = root.querySelector('.request-band__layout');
  assert.ok(layout, '.request-band__layout が無い');
  assert.equal(layout.parentNode.classList.contains('request-band__inner'), true);

  const text = root.querySelector('.request-band__text');
  const action = root.querySelector('.request-band__action');
  assert.ok(text && action, '列の箱（__text / __action）が無い');
  assert.equal(text.parentNode, layout, 'テキスト列が版面の直下にない');
  assert.equal(action.parentNode, layout, '行動列が版面の直下にない');
});

test('🔒 テキスト列は主文・副文・受領・注記を持ち、行動列はボタンだけを持つ', () => {
  const root = band();
  const classesOf = (selector) =>
    root.querySelector(selector).children.map((el) => el.getAttribute('class').split(' ')[0]);

  assert.deepEqual(classesOf('.request-band__text'), [
    'request-band__lede',
    'request-band__sub',
    'request-band__received',
    'request-band__note',
  ]);
  // 行動列はボタンのみ
  assert.deepEqual(classesOf('.request-band__action'), ['btn']);
});

test('🔒 注記はテキスト列の中にあり、主文・副文に続く', () => {
  const root = band();
  const text = root.querySelector('.request-band__text');
  const note = root.querySelector('.request-band__note');
  assert.equal(note.parentNode, text, '注記がテキスト列の中にない');
});

test('🔒 B-4b DOM 順を CSS で入れ替えていない（order / *-reverse を使わない）', () => {
  const scoped = stripComments(siteCss)
    .split('\n')
    .filter((line) => /(^|[\s;{])order\s*:|-reverse\b/.test(line));
  assert.deepEqual(scoped, [], `site.css に order / *-reverse がある: ${scoped.join(' / ')}`);
});

/* ====================================================================== */
/* 完了フィードバックの器（完了条件 C-1 / C-5）                             */
/* ====================================================================== */

test('🔒 C-5 受領メッセージの器は空・hidden で出る（JS が動かなくても壊れない）', () => {
  const received = band().querySelector('[data-request-received]');
  assert.ok(received, '受領メッセージの器が無い');
  assert.equal(received.hidden, true, '器が最初から見えている');
  assert.equal(received.textContent.trim(), '', '文言が HTML に埋まっている（読み上げが飛ぶ）');
  assert.equal(received.getAttribute('role'), 'status', 'role="status" が無い');
  assert.equal(
    received.getAttribute('data-message'),
    tJa('request.receivedMessage'),
    '押下時に書き込む文言が data-message に無い',
  );
});

test('🔒 C-2 受領の文言に数字が入らない（押下数・人数の表示にしない）', () => {
  for (const t of [tJa, tEn]) {
    for (const key of ['request.receivedMessage', 'request.received', 'request.micro']) {
      assert.equal(/\d/.test(t(key)), false, `${key} に数字がある: ${t(key)}`);
    }
  }
});

/* ====================================================================== */
/* 計測の連続性（🔒 変えない値）                                           */
/* ====================================================================== */

test('🔒 data-cta と aria-controls の値を変えていない（GA4 の前後比較）', () => {
  const root = tree(requestCta(tJa, { location: 'products_request_top' }));
  const button = root.querySelector('[data-request-cta]');
  assert.equal(button.getAttribute('data-cta'), 'products_request_top');
  assert.equal(button.getAttribute('aria-controls'), 'request-step-survey');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

/* ====================================================================== */
/* 文言（完了条件 A 群）                                                    */
/* ====================================================================== */

test('完了条件 A-7 無償の第1段階と有償の支援段が別の語を名乗る', () => {
  for (const [name, t] of [['ja', tJa], ['en', tEn]]) {
    const free = [t('request.cta'), t('request.headerCta'), t('request.headerCtaShort')];
    const paid = [t('request.supportHeading'), t('lp.support.buttonText')];
    const word = name === 'ja' ? '応援' : /support/i;
    const has = (s) => (typeof word === 'string' ? s.includes(word) : word.test(s));

    for (const label of free) assert.ok(has(label), `${name}: 無償側が語を名乗っていない: ${label}`);
    for (const label of paid) {
      assert.equal(has(label), false, `${name}: 有償側が無償側と同じ語を使っている: ${label}`);
    }
  }
});

test('🔒 A-4 「優先的に対応」を書かない（順位を約束する事実が無い）', () => {
  for (const t of [tJa, tEn]) {
    for (const key of ['request.receivedMessage', 'request.micro', 'request.sub', 'request.lede']) {
      assert.equal(/優先/.test(t(key)), false, `${key} が優先順位を約束している: ${t(key)}`);
    }
  }
});

test('🔒 帯の文の1区切りは 17 文字以内（主文は 13 文字以内）', () => {
  // design.md §4.8。320px で中身が使えるのは 254px。--size-sm 12.5px → 20 文字が限界
  const limits = {
    'request.lede': 13,
    'request.sub': 17,
    'request.micro': 17,
    'request.note': 17,
    'request.receivedMessage': 17,
  };
  for (const [key, limit] of Object.entries(limits)) {
    for (const chunk of tJa(key).split(/[、。！？]/).filter(Boolean)) {
      assert.ok(
        chunk.length <= limit,
        `${key} の1区切りが ${limit} 文字を超えている（${chunk.length}）: ${chunk}`,
      );
    }
  }
});

/* ====================================================================== */
/* CSS の出所（完了条件 B-6）と幾何の 🔒                                    */
/* ====================================================================== */

const GEOMETRY = /(^|[\s;{])(padding|margin|gap|row-gap|column-gap|grid-template-[a-z]+|border-radius|max-width)\s*:/;

test('🔒 B-6 帯の幾何を決める宣言が products.css / lp.css に無い', () => {
  for (const [name, css] of [['products.css', productsCss], ['lp.css', lpCss]]) {
    // `.request-band` を含むセレクタのブロックだけを取り出して見る
    const blocks = [
      ...stripComments(css).matchAll(/([^{}]*\.request-band[^{}]*)\{([^{}]*)\}/g),
    ];
    for (const [, selector, body] of blocks) {
      assert.equal(
        GEOMETRY.test(body),
        false,
        `${name} に帯の幾何の宣言がある（site.css が唯一の出所）: ${selector.trim()} { ${body.trim()} }`,
      );
    }
  }
});

test('🔒 帯の版面と切り替え点が site.css / tokens.css にある', () => {
  assert.match(tokensCss, /--band-max:\s*54rem/, 'tokens.css に --band-max が無い');
  assert.match(tokensCss, /--band-cta-max:\s*26rem/, '--band-cta-max を改名・変更している');

  const layout = blockOf(siteCss, '.request-band__layout {');
  assert.ok(layout, '.request-band__layout が site.css に無い');
  assert.match(layout, /max-width:\s*var\(--band-max\)/, '版面の上限が無い（B-1d）');
  assert.match(layout, /margin-inline:\s*auto/, '版面を中央へ寄せていない（B-1d）');

  assert.match(
    siteCss,
    /@container request-band \(min-width: 50rem\)/,
    '2列の切り替え点（帯の幅 50rem）が無い',
  );
  // 面の余白（§1 の @media 900px）は帯の面も含むので、見るのは**版面**の名前だけにする。
  // 列の切り替えが @media にあると、LP と製品一覧で分岐が割れる（design.md §4.7）
  assert.equal(
    /@media[^{]*\{[^}]*\.request-band__layout/.test(stripComments(siteCss).replace(/\n/g, ' ')),
    false,
    '🔒 画面幅（@media）で帯の列を切り替えている（design.md §4.7）',
  );
});

test('🔒 2列は垂直中央揃え・両端配置（space-between）・ボタンは文字幅', () => {
  const start = siteCss.indexOf('@container request-band (min-width: 50rem)');
  const twoCol = siteCss.slice(start, siteCss.indexOf('\n}\n', siteCss.indexOf('.request-band__button', start)));

  assert.match(twoCol, /align-items:\s*center/, '🔒 垂直中央揃えでない');
  assert.match(twoCol, /justify-content:\s*space-between/, '🔒 両端配置（space-between）でない');
  assert.match(twoCol, /width:\s*max-content/, '右列のボタンが文字幅でない');
});

test('🔒 6要素は同じ箱（width: 100% / max-width: --band-cta-max）を共有する', () => {
  const selector =
    '.request-band__lede,\n.request-band__sub,\n.request-band__micro,\n' +
    '.request-band__received,\n.request-band__button,\n.request-band__note {';
  const body = blockOf(siteCss, selector);
  assert.ok(body, '6要素の共通規則が無い（ここが列の中の軸そのもの。design.md §4.13）');
  assert.match(body, /width:\s*100%/);
  assert.match(body, /max-width:\s*var\(--band-cta-max\)/);
});

test('🔒 字送り: 主文は T1、マイクロコピーと注記は同じ T4', () => {
  const lede = blockOf(siteCss, '.request-band__lede {');
  assert.match(lede, /font-size:\s*var\(--size-md\)/, '主文が T1（18px）でない');
  assert.match(lede, /font-weight:\s*700/);
  assert.match(lede, /color:\s*var\(--ink\)/);

  const t4 = blockOf(siteCss, '.request-band__micro,\n.request-band__note {');
  assert.ok(t4, 'マイクロコピーと注記が同じ規則になっていない（片方だけ弱めない）');
  assert.match(t4, /font-size:\s*var\(--size-sm\)/);
  assert.match(t4, /color:\s*var\(--muted-weak\)/);
});

test('🔒 句読点折り返しは対で置く（帯の5つの文すべて）', () => {
  for (const selector of [
    '.request-band__lede {',
    '.request-band__sub {',
    '.request-band__micro,\n.request-band__note {',
    '.request-band__received {',
  ]) {
    const body = blockOf(siteCss, selector);
    assert.match(body, /word-break:\s*keep-all/, `${selector} に keep-all が無い`);
    assert.match(body, /overflow-wrap:\s*break-word/, `${selector} に overflow-wrap が無い`);
  }
});

test('🔒 C-4 受領の動きは不透明度だけ。reduced-motion の打ち消しを2つ目に書かない', () => {
  const received = blockOf(siteCss, '.request-band__received {');
  assert.match(received, /animation:\s*request-band-receipt 160ms/);
  // prefers-reduced-motion のブロックの**中**に帯の名前が出てこないことを見る
  for (const [, body] of stripComments(siteCss).matchAll(
    /@media[^{]*prefers-reduced-motion[^{]*\{([\s\S]*?)\n\}/g,
  )) {
    assert.equal(
      /request-band/.test(body),
      false,
      '🔒 打ち消しを帯へ個別に書いている（site.css 末尾の全称セレクタが効く）',
    );
  }
  assert.match(siteCss, /@keyframes request-band-receipt \{\s*from \{\s*opacity: 0;/);
});

/* ====================================================================== */
/* 挙動（完了条件 C-1 / C-3）                                              */
/* ====================================================================== */

function page() {
  return `${requestCta(tJa, { location: 'products_request_top' })}
${requestCta(tJa, { location: 'products_request_bottom' })}
${requestFlow(tJa, { support: market.support, page: PAGE_ID })}`;
}

async function clickFirst() {
  const dom = await runLpScript(page(), { scriptPath: SCRIPT });
  const button = dom.body.querySelectorAll('[data-request-cta]')[0];
  button.dispatchEvent(new DomEvent('click'));
  await dom.flush();
  return { dom, button };
}

test('C-1 押下の直後に受領メッセージが出て、注記と入れ替わる', async () => {
  const { dom } = await clickFirst();
  const bandEl = dom.body.querySelector('.request-band');
  const received = bandEl.querySelector('[data-request-received]');
  const note = bandEl.querySelector('[data-request-note]');

  assert.equal(received.hidden, false, '受領メッセージが出ていない');
  assert.equal(received.textContent, tJa('request.receivedMessage'), 'JS が文言を書き込んでいない');
  assert.equal(note.hidden, true, '🔒 注記と入れ替わっていない（帯が伸びる）');
});

test('🔒 C-3 押し直しても受領メッセージを書き直さない（role="status" が2度読む）', async () => {
  const { dom, button } = await clickFirst();
  const received = dom.body.querySelector('.request-band [data-request-received]');
  received.textContent = 'SENTINEL';

  button.dispatchEvent(new DomEvent('click'));
  await dom.flush();

  assert.equal(received.textContent, 'SENTINEL', '押し直しで受領メッセージを書き直している');
  assert.equal(received.hidden, false);
});

/**
 * 🔒 上下2つの帯は**同じ1つの意思表示**を出す口である（押下は1件しか数えない）。
 * 片方だけ受領の姿になると、下まで読んだ人には「まだ押していない帯」に見える。
 * 既存の `ctas.forEach(markReceived)` がこれを担っており、**片方だけに絞らないこと。**
 */
test('🔒 上下2つの帯が同時に受領の姿になる', async () => {
  const { dom } = await clickFirst();
  const bands = dom.body.querySelectorAll('.request-band');
  assert.equal(bands.length, 2, '帯が2つでない');

  for (const one of bands) {
    assert.equal(one.querySelector('[data-request-received]').hidden, false, '受領が出ていない帯がある');
    assert.equal(one.querySelector('[data-request-note]').hidden, true, '注記が残っている帯がある');
  }
});

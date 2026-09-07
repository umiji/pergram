/**
 * T-050 の受け入れテスト。「β版ページに要望ボタンを置き、待機リストを段階化する」。
 *
 * docs/tasks/T-050.md の ## 完了条件 1〜6 を、二値で判定できる形へ落としてある。
 * 完了条件 7（`npm test`）と 8（`npm run build`）はコマンドの実行そのものなので、
 * ここでは扱わない。
 *
 * **実装より先に書いてあるので、未実装のうちは落ちるのが正しい。**
 *
 * ⚠️ `tests/hero_ranking.test.js` の2件は T-050 の着手前から落ちている（T-049）。
 *    このタスクとは無関係なので、区別できるようファイルを分けてある。
 *
 * ────────────────────────────────────────────────────────────────────────
 * === この受け入れテストが固定する契約（実装が満たすべき目印） ===
 *
 * 完了条件は「要望ボタン」「段階」といった言葉で書かれているが、機械が判定するには
 * それらを HTML の上で名指しできなければならない。そこで**目印だけ**を決める。
 * 目印以外（タグ・クラス・CSS・文言の細部・GA4 のイベント名）は実装の裁量である
 * （T-050 ## 判断してよい範囲）。
 *
 *   1. 要望ボタン … `data-request-cta` 属性を持つ要素。製品一覧ページに **2つ**。
 *      それぞれ `data-cta` も持ち、値は互いに異なる（完了条件3。GA4 の location 用）
 *   2. 段階     … `data-request-step="survey" | "email" | "support"` を持つ要素。
 *      初期状態では `hidden` 属性が付いており、文書順で survey → email → support。
 *      置き場は製品一覧ページでも LP でもよい（T-050 は実装方式を実装側の裁量にしている）
 *      ので、**両方を描画して、段階を持っている側**を探して検査する
 *   3. 待機リストの案内 … 既存の `.waitlist-banner`。`[data-waitlist-banner]` でも可
 *
 * === 「絞り込みブロックの近傍」を「絞り込みパネルの中」と読まない ===
 * 絞り込みパネル（`[data-filter-panel]`）は SP では初期状態で閉じたシートである。
 * そこへ入れると SP で要望ボタンが見えない。よってここでは
 * **片方が製品リストより前、もう片方が製品リストより後**（＝2箇所に分かれている）
 * とだけ判定し、パネルの内か外かは実装に委ねる。
 *
 * === 押下後の遷移はブラウザ相当の実行を必要としない ===
 * 完了条件5 は「押すまで表示されない」と「順序」である。どちらも出力される DOM の
 * 構造と属性で判定できる（T-050 ## テスト方法「実環境確認: 不要」）。
 * ────────────────────────────────────────────────────────────────────────
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadTranslator } from '../src/lib/i18n.js';
import { productsPage } from '../src/templates/products.js';
import { lpPage, ROADMAP_NUTRIENTS } from '../src/templates/lp.js';
import { makeRows, market } from './fixtures.js';
import { Element, parseFragment } from './mini_dom.js';

const tJa = await loadTranslator('ja');
const tEn = await loadTranslator('en');
const rows = makeRows();
const categories = JSON.parse(await readFile('config/categories.json', 'utf8'));
const category = categories.protein;
const MARKETS = JSON.parse(await readFile('config/markets.json', 'utf8'));

const jaLocale = JSON.parse(await readFile('locales/ja.json', 'utf8'));
const enLocale = JSON.parse(await readFile('locales/en.json', 'utf8'));

const HERO_ROWS = 3;
const BETA_PATH = '/ja/protein/';
const WAITLIST_PATH = '/ja/#waitlist';

const nutrients = [
  { id: 'protein', count: rows.length },
  ...ROADMAP_NUTRIENTS.map((id) => ({ id, count: 0 })),
];

/* ---- 描画ヘルパ -------------------------------------------------------- */

function renderProducts({ t = tJa, locale = 'ja', nutrientName = 'タンパク質', ...overrides } = {}) {
  const mk = locale === 'en' ? MARKETS.US : MARKETS.JP;
  return productsPage({
    t,
    locale,
    market: locale === 'en' ? mk : market,
    rows,
    nutrientId: 'protein',
    nutrientName,
    updatedAt: '2026-08-06',
    targetIntake: 60,
    category,
    nutrients,
    disclosureKey: mk.disclosureKey,
    waitlistPath: WAITLIST_PATH,
    gaMeasurementId: null,
    ...overrides,
  });
}

function renderLp({ t = tJa, locale = 'ja', nutrientName = 'タンパク質' } = {}) {
  const mk = locale === 'en' ? MARKETS.US : MARKETS.JP;
  return lpPage({
    t,
    locale,
    currency: mk.currency,
    displayUnit: 'g',
    topRows: rows.slice(0, HERO_ROWS),
    totalCount: rows.length,
    nutrientName,
    disclosureKey: mk.disclosureKey,
    betaPath: BETA_PATH,
    gaMeasurementId: null,
    support: market.support,
  });
}

/* ---- 解析ヘルパ -------------------------------------------------------- */

function tree(html) {
  const root = new Element('div');
  for (const node of parseFragment(html)) root.appendChild(node);
  return root;
}

/** 文書順に並べた全要素。位置の前後はこの配列の添字で比べる */
function docOrder(root) {
  return root.querySelectorAll('*');
}

function positionOf(order, el) {
  const index = order.indexOf(el);
  assert.ok(index >= 0, '要素が文書順の配列に見つからない');
  return index;
}

function text(el) {
  return el.textContent.replace(/\s+/g, ' ').trim();
}

/** el から数えて `levels` 段までの祖先（el 自身を含む） */
function ancestors(el, levels = 3) {
  const out = [];
  let node = el;
  for (let i = 0; node && i <= levels; i += 1) {
    out.push(node);
    node = node.parentNode;
  }
  return out;
}

function requestButtons(root) {
  return root.querySelectorAll('[data-request-cta]');
}

/** 段階を持っているページ（製品一覧 or LP）を探す */
function stageHost() {
  const candidates = [
    { name: '製品一覧ページ', root: tree(renderProducts()) },
    { name: 'LP', root: tree(renderLp()) },
  ];
  const hit = candidates.find((one) => one.root.querySelectorAll('[data-request-step]').length > 0);
  assert.ok(
    hit,
    'data-request-step を持つ要素が製品一覧ページにも LP にも無い。' +
      '段階（アンケート / メール / 支援）を機械可読な目印付きで出力すること',
  );
  return hit;
}

/* ====================================================================== */
/* 完了条件1: ヒーローのラベルが差し替わっている                            */
/* ====================================================================== */

test('完了条件1 ja のヒーローのラベルが「価格情報・順位はサンプル」と名乗る', () => {
  for (const key of ['lp.hero.cardTitle', 'lp.hero.cardTitleShort']) {
    const value = jaLocale[key];
    assert.ok(typeof value === 'string' && value.length > 0, `${key} が locales/ja.json に無い`);

    assert.ok(!/sample/i.test(value), `${key} に英字の Sample が残っている: ${value}`);
    assert.ok(value.includes('サンプル'), `${key} が「サンプル」と名乗っていない: ${value}`);
    assert.ok(value.includes('価格'), `${key} が価格情報に触れていない: ${value}`);
    assert.ok(value.includes('順位'), `${key} が順位に触れていない: ${value}`);
  }

  // 差し込み値を落とすと描画が壊れる。旧文言が持っていた置換子は残す
  assert.ok(jaLocale['lp.hero.cardTitle'].includes('{unit}'));
  assert.ok(jaLocale['lp.hero.cardTitle'].includes('{nutrient}'));
  assert.ok(jaLocale['lp.hero.cardTitleShort'].includes('{unit}'));
});

test('完了条件1 en のヒーローのラベルも対応する文言になっている', () => {
  for (const key of ['lp.hero.cardTitle', 'lp.hero.cardTitleShort']) {
    const value = enLocale[key];
    assert.ok(typeof value === 'string' && value.length > 0, `${key} が locales/en.json に無い`);

    const lower = value.toLowerCase();
    assert.ok(!lower.includes('(sample)'), `${key} に (Sample) が残っている: ${value}`);
    assert.ok(lower.includes('sample'), `${key} がサンプルである旨を名乗っていない: ${value}`);
    assert.ok(lower.includes('pric'), `${key} が価格情報に触れていない: ${value}`);
    assert.ok(lower.includes('rank'), `${key} が順位に触れていない: ${value}`);
  }

  assert.ok(enLocale['lp.hero.cardTitle'].includes('{unit}'));
  assert.ok(enLocale['lp.hero.cardTitleShort'].includes('{unit}'));
});

test('完了条件1 描画された LP に （Sample） が出てこない', () => {
  for (const locale of ['ja', 'en']) {
    const html = renderLp({ t: locale === 'en' ? tEn : tJa, locale, nutrientName: locale === 'en' ? 'Protein' : 'タンパク質' });
    assert.ok(!/（Sample）/.test(html), `${locale} の LP に （Sample） が残っている`);
    assert.ok(!/\(Sample\)/i.test(html), `${locale} の LP に (Sample) が残っている`);
  }
});

/* ====================================================================== */
/* 完了条件2: 待機リストの案内が製品リストより前                            */
/* ====================================================================== */

test('完了条件2 待機リストの案内が製品リストより前に出力されている', () => {
  const root = tree(renderProducts());
  const order = docOrder(root);

  const banner = root.querySelector('.waitlist-banner, [data-waitlist-banner]');
  assert.ok(banner, '待機リストの案内ブロックが見つからない');

  const list = root.querySelector('#products');
  assert.ok(list, '製品リスト（#products）が見つからない');

  assert.ok(
    positionOf(order, banner) < positionOf(order, list),
    '待機リストの案内が製品リストより後ろに出力されている',
  );
  assert.equal(banner.closest('#products'), null, '待機リストの案内が製品リストの中にある');
});

/* ====================================================================== */
/* 完了条件3: 要望ボタンが2箇所、data-cta の値が互いに異なる                 */
/* ====================================================================== */

test('完了条件3 要望ボタンが2箇所（リストの前と後ろ）に出力されている', () => {
  const root = tree(renderProducts());
  const order = docOrder(root);
  const buttons = requestButtons(root);

  assert.equal(buttons.length, 2, `要望ボタン（data-request-cta）が2つでない: ${buttons.length}個`);

  const list = root.querySelector('#products');
  assert.ok(list, '製品リスト（#products）が見つからない');
  const listStart = positionOf(order, list);
  const items = list.querySelectorAll('.p-item, li');
  const listEnd = items.length === 0 ? listStart : positionOf(order, items[items.length - 1]);

  const positions = buttons.map((el) => positionOf(order, el)).sort((a, b) => a - b);
  assert.ok(positions[0] < listStart, '要望ボタンの1つが製品リストより前に出ていない（絞り込み側）');
  assert.ok(positions[1] > listEnd, '要望ボタンの1つが製品リストの末尾より後ろに出ていない');
});

test('完了条件3 要望ボタンの data-cta の値が互いに異なる', () => {
  const root = tree(renderProducts());
  const buttons = requestButtons(root);
  assert.equal(buttons.length, 2, '要望ボタンが2つでないので data-cta を比較できない');

  const values = buttons.map((el) => el.getAttribute('data-cta'));
  for (const value of values) {
    assert.ok(value && value.trim().length > 0, '要望ボタンに data-cta が付いていない');
  }
  assert.notEqual(values[0], values[1], `data-cta の値が同じで押された位置を分離できない: ${values[0]}`);
});

/* ====================================================================== */
/* 完了条件4: ボタンの文言と、登録が不要である旨の注記                       */
/* ====================================================================== */

test('完了条件4 要望ボタンが「他の成分・製品追加をリクエスト」の旨を名乗る', () => {
  const buttons = requestButtons(tree(renderProducts()));
  assert.ok(buttons.length > 0, '要望ボタンが見つからない');

  for (const button of buttons) {
    const label = text(button);
    assert.ok(/リクエスト/.test(label), `ボタンが「リクエスト」と名乗っていない: ${label}`);
    assert.ok(/追加/.test(label), `ボタンが「追加」に触れていない: ${label}`);
    assert.ok(/成分|製品/.test(label), `ボタンが成分・製品に触れていない: ${label}`);
  }
});

test('完了条件4 要望ボタンの近傍に、登録が不要である旨の注記が出ている', () => {
  const buttons = requestButtons(tree(renderProducts()));
  assert.ok(buttons.length > 0, '要望ボタンが見つからない');

  const needsRegistration = /登録|メールアドレス|メール/;
  const notNeeded = /不要|要りません|いりません|なしで/;

  for (const button of buttons) {
    const near = ancestors(button, 3).map(text);
    const hit = near.some((one) => needsRegistration.test(one) && notNeeded.test(one));
    assert.ok(
      hit,
      `要望ボタンの近傍（祖先3段以内）に「登録は不要」の旨の注記が無い: ${text(button)}`,
    );
  }
});

test('完了条件4 en の製品一覧にも要望ボタンが2つ出る', () => {
  const root = tree(renderProducts({ t: tEn, locale: 'en', nutrientName: 'Protein' }));
  const buttons = requestButtons(root);
  assert.equal(buttons.length, 2, `en の要望ボタンが2つでない: ${buttons.length}個`);

  for (const button of buttons) {
    const label = text(button).toLowerCase();
    assert.ok(/request/.test(label), `en のボタンが request と名乗っていない: ${label}`);
    assert.ok(/nutrient|product|ingredient/.test(label), `en のボタンが対象に触れていない: ${label}`);
  }
});

/* ====================================================================== */
/* 完了条件5: 段階が正しい順で開く                                          */
/* ====================================================================== */

test('完了条件5 アンケートとメールの段が、初期状態では表示されない', () => {
  const { name, root } = stageHost();
  const steps = root.querySelectorAll('[data-request-step]');

  for (const kind of ['survey', 'email']) {
    const step = root.querySelector(`[data-request-step="${kind}"]`);
    assert.ok(step, `${name} に ${kind} の段が無い`);
    assert.ok(step.hidden, `${kind} の段が初期状態で hidden になっていない`);
  }

  // 目印の値は survey / email / support の3つだけ。綴り違いを黙って通さない
  for (const step of steps) {
    const kind = step.getAttribute('data-request-step');
    assert.ok(
      ['survey', 'email', 'support'].includes(kind),
      `data-request-step の値が想定外: ${kind}`,
    );
  }
});

test('完了条件5 段の順序が アンケート → メール → 支援 である', () => {
  const { root } = stageHost();
  const order = docOrder(root);

  const survey = root.querySelector('[data-request-step="survey"]');
  const email = root.querySelector('[data-request-step="email"]');
  const support = root.querySelector('[data-request-step="support"]');
  assert.ok(survey && email && support, '3つの段（survey / email / support）が揃っていない');

  assert.ok(
    positionOf(order, survey) < positionOf(order, email),
    'アンケートの段がメールの段より後ろにある',
  );
  assert.ok(
    positionOf(order, email) < positionOf(order, support),
    'メールの段が支援の案内より後ろにある',
  );
});

test('完了条件5 支援の案内の段が、初期状態では表示されない', () => {
  const { name, root } = stageHost();
  const support = root.querySelector('[data-request-step="support"]');
  assert.ok(support, `${name} に support（支援の案内）の段が無い`);
  assert.ok(support.hidden, 'support の段が初期状態で hidden になっていない');
});

test('完了条件5 製品一覧のメール入力欄は、段の中にあり初期状態では隠れている', () => {
  // メール入力欄が1つも無い状態でも「隠れている」は真になってしまう。
  // 段そのものが存在することを先に確かめて、素通りを防ぐ
  const host = stageHost();
  assert.ok(
    host.root.querySelector('[data-request-step="email"]'),
    'メールアドレスの段が無い',
  );

  const root = tree(renderProducts());
  const emails = root.querySelectorAll('input[type="email"], input[name="email"]');

  for (const input of emails) {
    const step = input.closest('[data-request-step]');
    assert.ok(step, '製品一覧のメール入力欄が、段（data-request-step）の外に置かれている');
    assert.ok(step.hidden, 'メール入力欄を含む段が初期状態で hidden になっていない');
  }
});

test('完了条件5 要望ボタン自身は初期状態から押せる', () => {
  const buttons = requestButtons(tree(renderProducts()));
  assert.ok(buttons.length > 0, '要望ボタンが見つからない');

  for (const button of buttons) {
    assert.ok(!button.hidden, '要望ボタンが hidden になっている');
    assert.ok(!button.disabled, '要望ボタンが disabled になっている');
    assert.equal(
      button.closest('[data-request-step]'),
      null,
      '要望ボタンが段の中に入っている（押す前から隠れてしまう）',
    );
  }
});

/* ====================================================================== */
/* 完了条件6: 押下数を画面に描画しない                                      */
/* ====================================================================== */

/** 「n人がリクエスト」「リクエスト12件」のような、押下数の表示に見える形 */
const COUNT_PHRASES = [
  /\d+\s*(人|件|票|名|回)/,
  /(リクエスト|要望)\s*(数|件数)/,
  /(requests?|votes?|people)\s*(so far|count)/i,
  /\d+\s*(requests?|votes?|people)/i,
];

test('完了条件6 要望ボタンの周辺に押下数が描画されていない', () => {
  for (const locale of ['ja', 'en']) {
    const root = tree(
      renderProducts({
        t: locale === 'en' ? tEn : tJa,
        locale,
        nutrientName: locale === 'en' ? 'Protein' : 'タンパク質',
      }),
    );
    const buttons = requestButtons(root);
    assert.ok(buttons.length > 0, `${locale} の要望ボタンが見つからない`);

    for (const button of buttons) {
      assert.ok(!/\d/.test(text(button)), `ボタンの文言に数値がある: ${text(button)}`);

      for (const node of ancestors(button, 2)) {
        const near = text(node);
        for (const pattern of COUNT_PHRASES) {
          assert.ok(
            !pattern.test(near),
            `要望ボタンの周辺に押下数らしき表示がある（${pattern}）: ${near}`,
          );
        }
        for (const [name, value] of Object.entries(node.attributes)) {
          assert.ok(
            !(/count|total|votes/.test(name) && /^\d+$/.test(String(value).trim())),
            `要望ボタンの周辺に押下数の属性がある: ${name}="${value}"`,
          );
        }
      }
    }
  }
});

test('完了条件6 押下数を差し込むための文言が locale に存在しない', () => {
  for (const [name, dict] of [
    ['ja', jaLocale],
    ['en', enLocale],
  ]) {
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value !== 'string') continue;
      if (!/リクエスト|要望|request/i.test(value)) continue;
      assert.ok(
        !/\{(count|total|n|votes)\}/i.test(value),
        `${name}.json の ${key} が押下数を差し込む形になっている: ${value}`,
      );
    }
  }
});

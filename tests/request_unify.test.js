/**
 * T-051 の受け入れテスト。「要望導線の表記統一と、LP の段構造化・匿名シグナルの保存」。
 *
 * docs/tasks/T-051.md の ## 完了条件 1〜10 を、二値で判定できる形へ落としてある。
 * 完了条件 11（`npm test`）と 12（`npm run build`）はコマンドの実行そのものなので扱わない。
 *
 * **実装より先に書いてあるので、未実装のうちは落ちるのが正しい。**
 *
 * ────────────────────────────────────────────────────────────────────────
 * === 目印は指示の側が決めている（T-051 ## 目印） ===
 *
 * T-050 では「受け入れテストが目印を決めるのか、実装が決めるのか読み取れない」という
 * 指摘が出た。今回は指示書の `## 目印（実装とテストの共通の契約 — 変えない）` が
 * 固定しているので、**このファイルはそこに書かれた値だけを見る。**
 *
 *   第1段階のボタン    `data-request-cta`（`data-cta` に位置の名前）
 *   段の器            `data-request-step="survey" | "email" | "support"`
 *   エンドポイント     POST /api/request-signal
 *   送信本文          `{ "id": "<UUID v4>" }` のみ
 *   成功応答          204 No Content
 *   localStorage      `pergram.request_signal_id`
 *   D1 のテーブル      `request_signal (id TEXT PRIMARY KEY, created_at TEXT NOT NULL)`
 *
 * クラス名・要素の入れ子・CSS・GA4 のイベント名は実装の裁量なので見ない
 * （T-051 ## 判断してよい範囲）。例外は完了条件4が名指ししている `class="toolbar"` と、
 * 完了条件6が名指ししている `waitlist--step1` の2つで、どちらも指示書の本文にある文字列。
 *
 * === 「ヘッダの CTA」と「本文の要望ボタン」を取り違えない ===
 * 完了条件2（本文）と3（ヘッダ）は**別の文言**を要求している。LP のヘッダの CTA が
 * 第1段階のボタンそのものになる実装もありうるので、`data-request-cta` を数えるときは
 * **`<header>` の中にあるものを本文から外す。**
 *
 * === 完了条件は dist に対して書かれているが、テストは描画結果でも判定する ===
 * 完了条件は「`npm run build` の出力（`dist/`）に対して機械的に判定できること」と
 * 書かれている。ただしテストはビルド前でも走らねばならないので、**同じ検査を
 * テンプレートの描画結果に対して行い、`dist/` が既にあるときはそちらにも重ねて行う。**
 * ────────────────────────────────────────────────────────────────────────
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import { loadTranslator } from '../src/lib/i18n.js';
import { productsPage } from '../src/templates/products.js';
import { lpPage, ROADMAP_NUTRIENTS } from '../src/templates/lp.js';
import worker from '../worker/index.js';
import { makeRows, market } from './fixtures.js';
import { DomEvent, Element, parseFragment, runLpScript } from './mini_dom.js';

const tJa = await loadTranslator('ja');
const tEn = await loadTranslator('en');
const rows = makeRows();
const categories = JSON.parse(await readFile('config/categories.json', 'utf8'));
const category = categories.protein;
const MARKETS = JSON.parse(await readFile('config/markets.json', 'utf8'));

const HERO_ROWS = 3;
const BETA_PATH = '/ja/protein/';
const WAITLIST_PATH = '/ja/#waitlist';

/** 第1段階の挙動を持つスクリプト（T-051 ## 変更範囲 / ## 申し送り） */
const REQUEST_SCRIPT = 'src/assets/request.js';

/* ---- 完了条件が名指ししている文字列 ------------------------------------ */

/** 完了条件1。製品一覧から消えていること */
const RETIRED_LABEL = 'リリース通知を受け取る';
/** 完了条件2。LP・製品一覧の本文の要望ボタン */
const BODY_CTA_LABEL = '成分・製品の追加をリクエスト';
/** 完了条件3。LP・製品一覧のヘッダの CTA */
const HEAD_CTA_LABEL = '機能追加リクエスト';
/** 完了条件3。短縮表記を出す場合も、この語で始めること */
const HEAD_CTA_PREFIX = '機能追加';
/** 完了条件6。LP の旧・メールアドレス先行フォーム */
const RETIRED_FORM_CLASS = 'waitlist--step1';

/** 完了条件7 / 8 / 10 */
const SIGNAL_ENDPOINT = '/api/request-signal';
const SIGNAL_STORAGE_KEY = 'pergram.request_signal_id';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAMPLE_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

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
    waitlistPath: locale === 'en' ? '/en/#waitlist' : WAITLIST_PATH,
    gaMeasurementId: null,
    ...overrides,
  });
}

function renderLp({ t = tJa, locale = 'ja', nutrientName = 'タンパク質', ...overrides } = {}) {
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
    betaPath: locale === 'en' ? '/en/protein/' : BETA_PATH,
    gaMeasurementId: null,
    support: locale === 'en' ? mk.support : market.support,
    ...overrides,
  });
}

/**
 * 完了条件は `dist/` に対して書かれている。ビルド前でも判定できるように描画結果を使い、
 * `dist/` が既にあるときは同じ検査をそちらにも重ねる。
 *
 * @param {string} distPath
 * @param {string} rendered
 * @returns {Promise<Array<{ name: string, html: string }>>}
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

function norm(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

/**
 * ボタン・リンクの「文言」の候補。
 *
 * 幅で出し分ける実装（`<span class="u-desktop">` / `u-mobile`）では、要素の
 * textContent が連結された文字列になる。**入れ子の作りは実装の裁量**なので、
 * 要素そのものの文言と、中の span の文言を**どれか1つが一致すればよい**として扱う。
 */
function labelVariants(el) {
  return [norm(el.textContent), ...el.querySelectorAll('span').map((one) => norm(one.textContent))]
    .filter(Boolean);
}

/** 本文（＝ヘッダの外）にある第1段階のボタン */
function bodyRequestCtas(root) {
  return root.querySelectorAll('[data-request-cta]').filter((el) => el.closest('header') === null);
}

/**
 * ヘッダの CTA の候補。
 *
 * ワードマーク（そのロケールのトップへ戻るリンク）と、ナビの中のアンカーと、
 * β版への導線（`data-cta="header_beta"`。tests/lp_cta.test.js が綴りを固定している）を
 * 除いた残りが CTA である。
 */
function headerCtaLabels(root, locale) {
  const header = root.querySelector('header');
  assert.ok(header, '<header> が見つからない');

  return header
    .querySelectorAll('a, button')
    .filter((el) => el.closest('nav') === null)
    .filter((el) => el.getAttribute('href') !== `/${locale}/`)
    .filter((el) => el.getAttribute('data-cta') !== 'header_beta')
    .flatMap(labelVariants);
}

/** ヘッダの CTA のうち、期待した文言を名乗っている要素 */
function headerCtaNamed(root, locale, label) {
  const header = root.querySelector('header');
  assert.ok(header, '<header> が見つからない');
  return header
    .querySelectorAll('a, button')
    .find((el) => labelVariants(el).includes(label));
}

/* ====================================================================== */
/* 完了条件1: 製品一覧から「リリース通知を受け取る」が消えている            */
/* ====================================================================== */

test('完了条件1 製品一覧に「リリース通知を受け取る」が1回も出てこない', async () => {
  for (const source of await htmlSources('dist/ja/protein/index.html', renderProducts())) {
    const hits = source.html.split(RETIRED_LABEL).length - 1;
    assert.equal(
      hits,
      0,
      `${source.name} に「${RETIRED_LABEL}」が ${hits} 回出ている。` +
        '製品一覧に意思表示の入口を2つ並べない（重い対価の側を消す）',
    );
  }
});

test('完了条件1 待機リストの案内ブロックが製品一覧から出力されない', () => {
  const root = tree(renderProducts());
  // 🔒 要素そのものを assert.equal の引数にしない。落ちたときに親をたどって
  //    ページ全体を文字列化しようとし、ヒープを食い潰す（真偽値で比べる）
  assert.ok(
    root.querySelector('.waitlist-banner, [data-waitlist-banner]') === null,
    '待機リストの案内（waitlist-banner）が残っている。T-051 ## 変更範囲 で削除と決まっている',
  );
});

/* ====================================================================== */
/* 完了条件2: 本文の要望ボタンの文言が LP・製品一覧で同じ                   */
/* ====================================================================== */

test('完了条件2 製品一覧の本文の要望ボタンが「成分・製品の追加をリクエスト」である', () => {
  const buttons = bodyRequestCtas(tree(renderProducts()));
  assert.ok(buttons.length > 0, '製品一覧の本文に data-request-cta のボタンが無い');

  for (const button of buttons) {
    assert.ok(
      labelVariants(button).includes(BODY_CTA_LABEL),
      `製品一覧のボタンの文言が「${BODY_CTA_LABEL}」でない: ${labelVariants(button).join(' / ')}`,
    );
  }
});

test('完了条件2 LP の本文の要望ボタンが「成分・製品の追加をリクエスト」である', () => {
  const buttons = bodyRequestCtas(tree(renderLp()));
  assert.ok(buttons.length > 0, 'LP の本文に data-request-cta のボタンが無い');

  for (const button of buttons) {
    assert.ok(
      labelVariants(button).includes(BODY_CTA_LABEL),
      `LP のボタンの文言が「${BODY_CTA_LABEL}」でない: ${labelVariants(button).join(' / ')}`,
    );
  }
});

test('完了条件2 LP と製品一覧の本文の要望ボタンが同じ文言である（en でも揃える）', () => {
  const labelsOf = (html) =>
    new Set(bodyRequestCtas(tree(html)).flatMap(labelVariants));

  const lp = labelsOf(renderLp({ t: tEn, locale: 'en', nutrientName: 'Protein' }));
  const products = labelsOf(renderProducts({ t: tEn, locale: 'en', nutrientName: 'Protein' }));

  assert.ok(lp.size > 0, 'en の LP に本文の要望ボタンが無い');
  assert.ok(products.size > 0, 'en の製品一覧に本文の要望ボタンが無い');
  assert.ok(
    [...lp].some((label) => products.has(label)),
    `en で LP と製品一覧の要望ボタンの文言が違う: LP=${[...lp].join(' / ')} / ` +
      `製品一覧=${[...products].join(' / ')}`,
  );
});

/* ====================================================================== */
/* 完了条件3: ヘッダの CTA の文言が LP・製品一覧で同じ                      */
/* ====================================================================== */

/**
 * ページごとに期待する「どのページか」。⚠️ T-051 では送信本文は `{ id }` だけだった。
 * **PO 判断で `page` が足された**（T-058、2026-09-08）。**戻さないこと。**
 * 🔒 上の帯か下の帯かは入れない。位置は GA4 の data-cta が持つ。
 */
for (const [name, render, expectedPage] of [
  ['製品一覧', () => renderProducts(), 'ja:protein'],
  ['LP', () => renderLp(), 'ja:lp'],
]) {
  test(`完了条件3 ${name}のヘッダの CTA が「機能追加リクエスト」である`, () => {
    const root = tree(render());
    const labels = headerCtaLabels(root, 'ja');
    assert.ok(
      labels.includes(HEAD_CTA_LABEL),
      `${name}のヘッダの CTA が「${HEAD_CTA_LABEL}」でない: ${labels.join(' / ') || '（CTA が無い）'}`,
    );
  });

  test(`完了条件3 ${name}のヘッダの短縮表記も同じ語で始まる`, () => {
    const root = tree(render());
    const cta = headerCtaNamed(root, 'ja', HEAD_CTA_LABEL);
    assert.ok(cta, `${name}のヘッダに「${HEAD_CTA_LABEL}」の CTA が無い`);

    for (const variant of labelVariants(cta)) {
      assert.ok(
        variant.startsWith(HEAD_CTA_PREFIX),
        `${name}のヘッダの CTA に「${HEAD_CTA_PREFIX}」で始まらない表記がある: ${variant}`,
      );
    }
  });
}

test('完了条件3 en でも LP と製品一覧のヘッダの CTA の文言が揃っている', () => {
  const lp = new Set(headerCtaLabels(tree(renderLp({ t: tEn, locale: 'en', nutrientName: 'Protein' })), 'en'));
  const products = new Set(
    headerCtaLabels(tree(renderProducts({ t: tEn, locale: 'en', nutrientName: 'Protein' })), 'en'),
  );

  assert.ok(lp.size > 0, 'en の LP のヘッダに CTA が無い');
  assert.ok(products.size > 0, 'en の製品一覧のヘッダに CTA が無い');
  assert.ok(
    [...lp].some((label) => products.has(label)),
    `en で LP と製品一覧のヘッダの CTA の文言が違う: LP=${[...lp].join(' / ')} / ` +
      `製品一覧=${[...products].join(' / ')}`,
  );
});

/* ====================================================================== */
/* 完了条件4: 要望の導線がツールバーより前にある                            */
/* ====================================================================== */

test('完了条件4 製品一覧の最初の data-request-cta が class="toolbar" より前に出る', async () => {
  for (const source of await htmlSources('dist/ja/protein/index.html', renderProducts())) {
    const cta = source.html.indexOf('data-request-cta');
    const toolbar = source.html.indexOf('class="toolbar"');

    assert.ok(cta >= 0, `${source.name} に data-request-cta が無い`);
    assert.ok(toolbar >= 0, `${source.name} に class="toolbar" が無い`);
    assert.ok(
      cta < toolbar,
      `${source.name}: 要望の導線がツールバーより後ろにある（cta=${cta} / toolbar=${toolbar}）。` +
        '操作の道具より後ろに置くと、絞り込みを触りに来た人の視線の外へ落ちる',
    );
  }
});

/* ====================================================================== */
/* 完了条件5: LP に第1段階のボタンと3段がある                               */
/* ====================================================================== */

test('完了条件5 LP に第1段階のボタン（data-request-cta）がある', () => {
  const root = tree(renderLp());
  assert.ok(
    root.querySelectorAll('[data-request-cta]').length > 0,
    'LP に data-request-cta のボタンが無い。LP だけ重いままなら、下げた対価は届かない',
  );
});

test('完了条件5 LP に survey / email / support の3段がこの文書順で存在する', () => {
  const root = tree(renderLp());
  const order = docOrder(root);

  const steps = ['survey', 'email', 'support'].map((kind) => {
    const el = root.querySelector(`[data-request-step="${kind}"]`);
    assert.ok(el, `LP に ${kind} の段（data-request-step="${kind}"）が無い`);
    return { kind, at: positionOf(order, el) };
  });

  for (let i = 1; i < steps.length; i += 1) {
    assert.ok(
      steps[i - 1].at < steps[i].at,
      `LP の段の順序が違う: ${steps[i - 1].kind} が ${steps[i].kind} より後ろにある`,
    );
  }
});

test('完了条件5 LP の3段とも初期状態は hidden である', () => {
  const root = tree(renderLp());
  for (const kind of ['survey', 'email', 'support']) {
    const step = root.querySelector(`[data-request-step="${kind}"]`);
    assert.ok(step, `LP に ${kind} の段が無い`);
    assert.ok(step.hidden, `LP の ${kind} の段が初期状態で hidden になっていない`);
  }
});

test('完了条件5 LP の段の値は survey / email / support の3つだけである', () => {
  const root = tree(renderLp());
  for (const step of root.querySelectorAll('[data-request-step]')) {
    const kind = step.getAttribute('data-request-step');
    assert.ok(
      ['survey', 'email', 'support'].includes(kind),
      `data-request-step の値が想定外: ${kind}`,
    );
  }
});

test('完了条件5 LP の第1段階のボタンは段の中に無い（押す前から隠れない）', () => {
  const root = tree(renderLp());
  const buttons = root.querySelectorAll('[data-request-cta]');
  assert.ok(buttons.length > 0, 'LP に data-request-cta のボタンが無い');

  for (const button of buttons) {
    assert.ok(
      button.closest('[data-request-step]') === null,
      'LP の第1段階のボタンが段の中に入っている（押す前から隠れてしまう）',
    );
    assert.ok(!button.hidden, 'LP の第1段階のボタンが hidden になっている');
    assert.ok(!button.disabled, 'LP の第1段階のボタンが disabled になっている');
  }
});

/* ====================================================================== */
/* 完了条件6: 旧・メールアドレス先行フォームが出力されない                  */
/* ====================================================================== */

test('完了条件6 LP に旧・メールアドレス先行フォーム（waitlist--step1）が出力されない', async () => {
  for (const locale of ['ja', 'en']) {
    const html = renderLp({
      t: locale === 'en' ? tEn : tJa,
      locale,
      nutrientName: locale === 'en' ? 'Protein' : 'タンパク質',
    });
    assert.ok(
      !html.includes(RETIRED_FORM_CLASS),
      `${locale} の LP に ${RETIRED_FORM_CLASS} が残っている。段構造へ完全に置き換える（併存させない）`,
    );
  }

  for (const source of await htmlSources('dist/ja/index.html', renderLp())) {
    assert.ok(
      !source.html.includes(RETIRED_FORM_CLASS),
      `${source.name} に ${RETIRED_FORM_CLASS} が残っている`,
    );
  }
});

test('完了条件6 LP のメールアドレス入力欄は email の段の中にあり、初期状態では隠れている', () => {
  const root = tree(renderLp());
  const emailStep = root.querySelector('[data-request-step="email"]');
  assert.ok(emailStep, 'LP に email の段が無い');

  const inputs = root.querySelectorAll('input[type="email"], input[name="email"]');
  assert.ok(inputs.length > 0, 'LP にメールアドレスの入力欄が無い');

  for (const input of inputs) {
    const step = input.closest('[data-request-step]');
    assert.ok(step, 'LP のメールアドレス入力欄が段（data-request-step）の外に置かれている');
    assert.equal(
      step.getAttribute('data-request-step'),
      'email',
      'LP のメールアドレス入力欄が email 以外の段にある',
    );
    assert.ok(step.hidden, 'メールアドレス入力欄を含む段が初期状態で hidden になっていない');
  }
});

/* ====================================================================== */
/* 完了条件7: 第1段階の押下で匿名シグナルが飛ぶ                             */
/* ====================================================================== */

/** 第1段階のボタンを1つ押したところまで進める */
async function clickFirstStage(html, options = {}) {
  const dom = await runLpScript(html, { scriptPath: REQUEST_SCRIPT, ...options });
  const buttons = dom.body
    .querySelectorAll('[data-request-cta]')
    .filter((el) => el.closest('header') === null);
  assert.ok(buttons.length > 0, '本文に第1段階のボタン（data-request-cta）が無い');

  buttons[0].dispatchEvent(new DomEvent('click'));
  await dom.flush();

  return {
    dom,
    button: buttons[0],
    signals: dom.fetchCalls.filter((call) => call.url.includes(SIGNAL_ENDPOINT)),
    step: (kind) => dom.body.querySelector(`[data-request-step="${kind}"]`),
  };
}

/**
 * ページごとに期待する「どのページか」。⚠️ T-051 では送信本文は `{ id }` だけだった。
 * **PO 判断で `page` が足された**（T-058、2026-09-08）。**戻さないこと。**
 * 🔒 上の帯か下の帯かは入れない。位置は GA4 の data-cta が持つ。
 */
for (const [name, render, expectedPage] of [
  ['製品一覧', () => renderProducts(), 'ja:protein'],
  ['LP', () => renderLp(), 'ja:lp'],
]) {
  test(`完了条件7 ${name}の第1段階の押下で POST ${SIGNAL_ENDPOINT} が1回だけ飛ぶ`, async () => {
    const { signals } = await clickFirstStage(render());

    assert.equal(signals.length, 1, `${name}: 匿名シグナルの送信が ${signals.length} 回`);
    assert.equal(signals[0].method, 'POST', `${name}: メソッドが ${signals[0].method}`);
  });

  test(`完了条件7 ${name}の送信本文が { "id": "<UUID v4>", "page": "${expectedPage}" } だけである`, async () => {
    const { signals } = await clickFirstStage(render());
    assert.equal(signals.length, 1, `${name}: 匿名シグナルが送られていない`);

    const { body } = signals[0];
    assert.ok(body && typeof body === 'object', `${name}: 送信本文が JSON のオブジェクトでない`);
    assert.deepEqual(
      Object.keys(body).sort(),
      ['id', 'page'],
      `🔒 ${name}: 送信本文のキーが {id, page} でない: ${Object.keys(body).join(' / ')}。` +
        'IP・User-Agent・リファラ・成分・自由記述・ページ内の位置を入れない',
    );
    assert.match(String(body.id), UUID_V4, `${name}: id が UUID v4 の形式でない: ${body.id}`);
    assert.equal(body.page, expectedPage, `${name}: どのページで押されたかが違う`);
  });

  test(`完了条件7 ${name}の押下で段が開く（送信の結果を待たずに開く）`, async () => {
    const { step } = await clickFirstStage(render());
    assert.equal(step('survey').hidden, false, `${name}: アンケートの段が開いていない`);
  });

  test(`完了条件7 ${name}の送信した id が localStorage へ残る`, async () => {
    const { dom, signals } = await clickFirstStage(render());
    assert.equal(signals.length, 1, `${name}: 匿名シグナルが送られていない`);

    assert.equal(
      dom.storageData.get(SIGNAL_STORAGE_KEY),
      signals[0].body.id,
      `${name}: localStorage の ${SIGNAL_STORAGE_KEY} が送信した id と一致しない`,
    );
  });

  test(`完了条件7 ${name}の送信に失敗しても段は開く（導線を止めない）`, async () => {
    const { step, dom } = await clickFirstStage(render(), { respond: () => ({ reject: true }) });

    assert.equal(
      step('survey').hidden,
      false,
      `${name}: 送信に失敗したら段が開かない。シグナルの保存は計測の都合であって、ユーザーの用ではない`,
    );
    assert.equal(dom.navigations.length, 0, `🔒 ${name}: 別ページへ飛んでいる`);
  });
}

/* ====================================================================== */
/* 完了条件8: 同じブラウザの2回目以降は送らない                             */
/* ====================================================================== */

/**
 * ページごとに期待する「どのページか」。⚠️ T-051 では送信本文は `{ id }` だけだった。
 * **PO 判断で `page` が足された**（T-058、2026-09-08）。**戻さないこと。**
 * 🔒 上の帯か下の帯かは入れない。位置は GA4 の data-cta が持つ。
 */
for (const [name, render, expectedPage] of [
  ['製品一覧', () => renderProducts(), 'ja:protein'],
  ['LP', () => renderLp(), 'ja:lp'],
]) {
  test(`完了条件8 ${name}: localStorage に id があれば POST しない`, async () => {
    const { signals } = await clickFirstStage(render(), {
      storage: { [SIGNAL_STORAGE_KEY]: SAMPLE_UUID },
    });

    assert.equal(
      signals.length,
      0,
      `${name}: 2回目の押下でも送信している。「何人が意思表示したか」に近い数字にならない`,
    );
  });

  test(`完了条件8 ${name}: 2回目でも段は開く`, async () => {
    const { step } = await clickFirstStage(render(), {
      storage: { [SIGNAL_STORAGE_KEY]: SAMPLE_UUID },
    });

    assert.equal(step('survey').hidden, false, `${name}: 2回目の押下で段が開かない`);
  });

  test(`完了条件8 ${name}: 既にある id を書き換えない`, async () => {
    const { dom } = await clickFirstStage(render(), {
      storage: { [SIGNAL_STORAGE_KEY]: SAMPLE_UUID },
    });

    assert.equal(
      dom.storageData.get(SIGNAL_STORAGE_KEY),
      SAMPLE_UUID,
      `${name}: 保存済みの id を書き換えている`,
    );
  });
}

test('完了条件8 同じページで2回押しても送信は1回だけ', async () => {
  const dom = await runLpScript(renderProducts(), { scriptPath: REQUEST_SCRIPT });
  const buttons = dom.body
    .querySelectorAll('[data-request-cta]')
    .filter((el) => el.closest('header') === null);
  assert.ok(buttons.length > 0, '本文に第1段階のボタンが無い');

  for (const button of buttons) {
    button.dispatchEvent(new DomEvent('click'));
    await dom.flush();
  }
  buttons[0].dispatchEvent(new DomEvent('click'));
  await dom.flush();

  const signals = dom.fetchCalls.filter((call) => call.url.includes(SIGNAL_ENDPOINT));
  assert.equal(signals.length, 1, `同じページ内で ${signals.length} 回送信している`);
});

/* ====================================================================== */
/* 完了条件9: D1 のテーブルは id と created_at の2列だけ                    */
/* ====================================================================== */

/** `CREATE TABLE ... ( ... )` の中身を列の一覧へ落とす。コメントは落とす */
function parseColumns(inner) {
  return inner
    .split('\n')
    .map((line) => line.replace(/--.*/, '').trim())
    .filter(Boolean)
    .join(' ')
    .split(',')
    .map((one) => one.trim())
    .filter(Boolean)
    .map((one) => ({ name: one.split(/\s+/)[0].toLowerCase(), definition: one }));
}

function requestSignalBlock(sql) {
  const match = sql.match(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+request_signal\s*\(([\s\S]*?)\)\s*;/i);
  return match ? parseColumns(match[1]) : null;
}

test('完了条件9 worker/schema.sql に request_signal テーブルがある', async () => {
  const schema = await readFile('worker/schema.sql', 'utf8');
  assert.ok(
    requestSignalBlock(schema),
    'worker/schema.sql に request_signal テーブルの定義が無い',
  );
});

/**
 * ⚠️ T-051 ではここが `['id', 'created_at']` だった。**PO 判断で `page`（どのページで
 * 押されたか）が1つ足された**（T-058、2026-09-08）。**戻さないこと。**
 * 🔒 それでも列はこの3つで打ち止めである。IP・User-Agent・リファラ・成分・自由記述・
 *    ページ内の位置を足すのは、改めて PO 判断を要する。
 */
const REQUEST_SIGNAL_COLUMNS = ['id', 'created_at', 'page'];

test('完了条件9 request_signal の列は id と created_at と page の3つだけである', async () => {
  const columns = requestSignalBlock(await readFile('worker/schema.sql', 'utf8'));
  assert.ok(columns, 'worker/schema.sql に request_signal テーブルの定義が無い');

  assert.deepEqual(
    columns.map((one) => one.name),
    REQUEST_SIGNAL_COLUMNS,
    '🔒 匿名シグナルのテーブルに UUID と日時と page 以外の列を作らない。' +
      '個人を識別できるものを何も持たないことが、この行の存在理由である',
  );
  assert.match(columns[0].definition, /TEXT\s+PRIMARY KEY/i, 'id が TEXT PRIMARY KEY でない');
  assert.match(columns[1].definition, /TEXT\s+NOT NULL/i, 'created_at が TEXT NOT NULL でない');
  assert.ok(
    !/NOT NULL/i.test(columns[2].definition),
    '🔒 page に NOT NULL を付けない。移行前に入った行の page は NULL のままである',
  );
});

test('完了条件9 同じ内容の移行 SQL が worker/migrations/ にある', async () => {
  const dir = 'worker/migrations';
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql'));

  const found = [];
  for (const file of files) {
    const sql = await readFile(`${dir}/${file}`, 'utf8');
    const columns = requestSignalBlock(sql);
    if (columns) found.push({ file, columns });
  }

  assert.ok(
    found.length > 0,
    `${dir} に request_signal を作る移行 SQL が無い。` +
      'CREATE TABLE IF NOT EXISTS は稼働中の DB に効かないので、移行 SQL を別に置く',
  );
  // ⚠️ テーブルを作る移行 SQL は T-051 のもの1本で、そこには page が無い。
  //    page は後から ALTER TABLE で足す（worker/migrations/2026-09-08_request_signal_page.sql）。
  //    **既に流したファイルを書き換えると、流し済みの DB と食い違う。**
  for (const { file, columns } of found) {
    assert.deepEqual(
      columns.map((one) => one.name),
      ['id', 'created_at'],
      `${file}: テーブルを作る移行 SQL の列が T-051 の時点の姿と違う`,
    );
  }

  const alters = [];
  for (const file of files) {
    const sql = (await readFile(`${dir}/${file}`, 'utf8'))
      .split('\n')
      .map((line) => line.replace(/--.*/, ''))
      .join('\n');
    for (const [, table, column] of sql.matchAll(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/gi)) {
      if (table.toLowerCase() === 'request_signal') alters.push(column.toLowerCase());
    }
  }
  assert.deepEqual(
    ['id', 'created_at', ...alters],
    REQUEST_SIGNAL_COLUMNS,
    '移行 SQL を全部流した後の姿が worker/schema.sql と食い違っている',
  );
});

test('🔒 完了条件9 既存の waitlist テーブルの定義を変えていない', async () => {
  const schema = await readFile('worker/schema.sql', 'utf8');
  const block = schema.match(/CREATE TABLE IF NOT EXISTS waitlist\s*\(([\s\S]*?)\n\);/i);
  assert.ok(block, 'worker/schema.sql に waitlist テーブルの定義が見つからない');

  assert.deepEqual(
    parseColumns(block[1]).map((one) => one.name),
    ['email', 'nutrients', 'channel', 'nutrients_other', 'requests', 'created_at'],
    '🔒 既存の waitlist テーブルの構造を変えない。email が主キーであり、SQLite では後から変えられない',
  );
});

/* ====================================================================== */
/* 完了条件10: /api/request-signal のバリデーション                        */
/* ====================================================================== */

/**
 * D1 と静的アセットの偽物。実行された SQL とバインド値を記録する。
 * tests/worker.test.js と同じ作りだが、テストファイルは import すると
 * 中のテストごと走ってしまうので共有せず写してある。
 */
function makeEnv() {
  const writes = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async run() {
                writes.push({ sql, args });
                return { success: true };
              },
            };
          },
        };
      },
    },
    ASSETS: {
      async fetch() {
        return new Response('asset', { status: 200 });
      },
    },
  };
  return { env, writes };
}

/** @param {string | undefined} bodyText */
function signalRequest(bodyText) {
  return new Request(`https://pergram.example${SIGNAL_ENDPOINT}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (test-agent)',
      'CF-Connecting-IP': '203.0.113.7',
      Referer: 'https://pergram.example/ja/protein/',
    },
    body: bodyText,
  });
}

/** 送信本文。⚠️ T-058 から `page` は必須である（無い本文は 400 で捨てる） */
const SAMPLE_PAGE = 'ja:protein';
const signalBody = (over = {}) => JSON.stringify({ id: SAMPLE_UUID, page: SAMPLE_PAGE, ...over });

test('完了条件10 正しい UUID なら 204 を返し、本文を返さない', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(signalRequest(signalBody()), env);

  assert.equal(res.status, 204, `成功応答が ${res.status} です（204 No Content であるべき）`);
  assert.equal(await res.text(), '', '204 なのに本文を返している');
});

test('完了条件10 保存するのは id と日時と page の3つだけである', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(signalRequest(signalBody()), env);

  assert.equal(writes.length, 1, `保存が ${writes.length} 回です`);
  assert.equal(
    writes[0].args.length,
    3,
    `🔒 保存の引数が ${writes[0].args.length} 個。UUID と日時と page 以外を保存しない`,
  );
  assert.equal(writes[0].args[0], SAMPLE_UUID);
  assert.ok(writes[0].args.includes(SAMPLE_PAGE), 'page が保存されていません');

  // 🔒 要求ヘッダから拾ったものが混ざっていないか。page は本文から来た語彙であって、
  //    リファラ（/ja/protein/ というパスそのもの）ではない
  const dumped = JSON.stringify(writes[0].args);
  for (const leak of ['Mozilla', '203.0.113.7', '/ja/protein/']) {
    assert.ok(
      !dumped.includes(leak),
      `🔒 保存の引数に「${leak}」が混ざっている。IP・User-Agent・リファラを入れない`,
    );
  }
});

for (const [name, bodyText] of [
  ['UUID の形式でない id', signalBody({ id: 'not-a-uuid' })],
  ['空文字の id', signalBody({ id: '' })],
  ['id が文字列でない', signalBody({ id: 12345 })],
  ['id と page 以外のキーが混ざっている', signalBody({ ua: 'Mozilla/5.0' })],
  ['id が無い', JSON.stringify({ page: SAMPLE_PAGE })],
  ['page が無い', JSON.stringify({ id: SAMPLE_UUID })],
  ['page がパスそのもの', signalBody({ page: '/ja/protein/' })],
  ['空のオブジェクト', JSON.stringify({})],
  ['壊れた JSON', '{'],
  ['本文なし', undefined],
]) {
  test(`完了条件10 ${name} は 400 で、DB に触らない`, async () => {
    const { env, writes } = makeEnv();
    const res = await worker.fetch(signalRequest(bodyText), env);

    assert.equal(res.status, 400, `${name}: 応答が ${res.status} です`);
    assert.equal(writes.length, 0, `${name}: DB に書き込んでいます`);
  });
}

/**
 * LP のファーストビュー（ヘッダ＋ヒーロー）の CTA 導線。T-010 の受け入れテストとして
 * 書かれ、2026-09-02 に T-020 でヒーローの部分だけ書き換えた。
 *
 * === 2026-09-02（T-020）PO の指示でヒーローをβ版1本にした ===
 * それまで（T-010）は「ヒーローの主CTAは待機リスト（btn--signal）、β版は従」だった。
 * PO が見せ方の実験として、**ヒーローからは待機リストのボタンを外し、β版の導線だけを
 * 残して面を強くする**と決めた。したがって次が現在の不変条件である。
 *
 *   - ヒーローに `data-cta="hero_waitlist"` の要素は **出力されない**（CSS で隠すのではない）
 *   - ヒーローの `data-cta="hero_beta"` は残り、押せる
 *   - **待機リストへの導線はヘッダ（header_waitlist）とページ下部のフォームに残る。**
 *     ヒーローから消えても登録の受け皿は消えていない。ここは弱めずに固定する
 *   - ヘッダの主従は T-010 のまま（待機リストが btn--signal、β版が従）
 *
 * 🔒 `data-cta` の値の綴り（hero_beta / hero_waitlist / header_beta / header_waitlist）は
 *    GA4 の `cta_click` のパラメータである。変えると変更前後の比較ができなくなるので、
 *    ここで値そのものを固定する（回帰テスト）。**hero_waitlist は「要素が出なくなった」
 *    のであって「別の値へ付け替えた」のではない。** 綴りを他へ流用しない。
 * 🔒 ベータ版の導線は消さない。押せる状態が残っていることをここで固定する。
 *
 * ⚠️ **同じ不変条件を tests/render.test.js（「ベータ版への導線はヘッダとヒーローの両方に出る」）
 *    も持っている。片方だけ直すともう片方で必ず落ちる。両方を同時に直すこと。**
 *
 * 見え方（折り返し・面積・視線移動）は自動テストでは判定できないため、目視確認は
 * docs/tasks/T-010.md / T-020.md の ## 証拠 に切り出してある。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadTranslator } from '../src/lib/i18n.js';
import { lpPage } from '../src/templates/lp.js';
import { hero, siteHeader } from '../src/templates/lp/hero.js';
import { makeRows, market } from './fixtures.js';

const tJa = await loadTranslator('ja');
const tEn = await loadTranslator('en');
const rows = makeRows();

const HERO_ROWS = 3;
const BETA_PATH = '/ja/protein/';
const WAITLIST_HREF = '#waitlist';
const NUTRIENT_NAME = 'タンパク質';

/**
 * 🔒 GA4 の `cta_click` が読む値。綴りは変更前と同一でなければならない。
 *    （LP には別途 `features_banner` があるが、これはファーストビューの外なので対象外）
 */
const HEADER_CTAS = ['header_beta', 'header_waitlist'];
const HERO_CTAS = ['hero_beta'];
const FIRST_VIEW_CTAS = [...HEADER_CTAS, ...HERO_CTAS];

/**
 * 🔒 2026-09-02（T-020）に**要素ごと出力しなくなった** data-cta。
 *    綴りは GA4 の履歴と突き合わせるために予約したままにする。他の要素へ付け替えない。
 *    これ以降 `cta_click` の内訳から hero_waitlist が消えるのは仕様である。
 */
const RETIRED_CTAS = ['hero_waitlist'];

/**
 * design/service.md §7 と ad-lp.md §1 の禁止語。
 * tests/render.test.js の BANNED_WORDS と同一。テストファイルは import すると
 * 中のテストごと走ってしまうので、共有せず写してある。
 */
const BANNED_WORDS = [
  '効く',
  '効果',
  '改善',
  '高品質',
  'おすすめ',
  '人気No.1',
  '安心',
  '話題の',
  '選ばれる',
  '実感',
];

/* ---- 描画ヘルパ -------------------------------------------------------- */

function renderHeader(t = tJa, locale = 'ja') {
  return siteHeader(t, { locale, betaPath: BETA_PATH });
}

function renderHero(t = tJa, locale = 'ja') {
  return hero({
    t,
    locale,
    currency: market.currency,
    displayUnit: 'g',
    topRows: rows.slice(0, HERO_ROWS),
    totalCount: rows.length,
    nutrientName: NUTRIENT_NAME,
    betaPath: BETA_PATH,
  });
}

/**
 * 🔒 locale（表示言語）と market（出す店舗・参照値・免責文）は別の軸である。
 *    en の LP に disclosure.jp を渡すと、免責文のキーが en.json に無く落ちる。
 *    ロケールごとに対応する市場の免責キーを渡す。
 */
const MARKETS = JSON.parse(await readFile('config/markets.json', 'utf8'));
const MARKET_OF_LOCALE = { ja: MARKETS.JP, en: MARKETS.US };

function renderLp(t = tJa, locale = 'ja') {
  const mk = MARKET_OF_LOCALE[locale];
  return lpPage({
    t,
    locale,
    currency: mk.currency,
    displayUnit: 'g',
    topRows: rows.slice(0, HERO_ROWS),
    totalCount: rows.length,
    nutrientName: NUTRIENT_NAME,
    disclosureKey: mk.disclosureKey,
    betaPath: BETA_PATH,
    gaMeasurementId: null,
    support: market.support,
  });
}

/* ---- 解析ヘルパ -------------------------------------------------------- */

/** `data-cta` の付いた要素を、タグ名・属性・クラス・href・表示テキストに分解する */
function ctaElements(html) {
  const re = /<(a|button)\b([^>]*\bdata-cta="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g;
  return [...html.matchAll(re)].map((m) => {
    const [, tag, attrs, name, inner] = m;
    return {
      tag,
      name,
      attrs,
      classes: (attrs.match(/\bclass="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean),
      href: attrs.match(/\bhref="([^"]*)"/)?.[1] ?? null,
      text: inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    };
  });
}

function ctaNamesOf(html) {
  return ctaElements(html)
    .map((el) => el.name)
    .sort();
}

function ctaByName(html, name) {
  const found = ctaElements(html).filter((el) => el.name === name);
  assert.equal(found.length, 1, `data-cta="${name}" の要素が ${found.length} 件です（1件であるべき）`);
  return found[0];
}

/** HTML 断片の中で `btn--signal` を持つ要素の数。CSS 文字列は拾わない */
function signalCount(html) {
  return [...html.matchAll(/\bclass="[^"]*\bbtn--signal\b[^"]*"/g)].length;
}

/* ---- 完了条件3: data-cta の回帰 ---------------------------------------- */

test('🔒 data-cta の値が変更前と同一である（GA4 の cta_click の比較可能性）', () => {
  assert.deepEqual(ctaNamesOf(renderHeader()), [...HEADER_CTAS].sort());
  assert.deepEqual(ctaNamesOf(renderHero()), [...HERO_CTAS].sort());
});

test('🔒 LP 全体でファーストビューの3値がそれぞれ1度だけ出力される', () => {
  const html = renderLp();
  for (const name of FIRST_VIEW_CTAS) {
    const hits = [...html.matchAll(new RegExp(`data-cta="${name}"`, 'g'))].length;
    assert.equal(hits, 1, `data-cta="${name}" が ${hits} 件です（1件であるべき）`);
  }
});

/* ---- T-020: ヒーローの待機リストボタンは出力しない -------------------- */

test('🔒 ヒーローに hero_waitlist の要素が出力されない（CSS で隠すのではなく出さない）', () => {
  const heroHtml = renderHero();
  const lpHtml = renderLp();
  for (const name of RETIRED_CTAS) {
    assert.ok(
      !heroHtml.includes(`data-cta="${name}"`),
      `ヒーローに data-cta="${name}" が残っています。隠すのではなく出力しないこと`,
    );
    assert.equal(
      [...lpHtml.matchAll(new RegExp(`data-cta="${name}"`, 'g'))].length,
      0,
      `LP 全体に data-cta="${name}" が残っています`,
    );
  }
});

test('🔒 ヒーローから消えても待機リストの受け皿は残っている（ヘッダとページ下部フォーム）', () => {
  assert.equal(ctaByName(renderHeader(), 'header_waitlist').href, WAITLIST_HREF);
  const html = renderLp();
  // ページ下部の待機リストフォームの送信ボタン。ここが登録の受け皿である
  assert.ok(
    /<button type="submit"[^>]*>/.test(html),
    'ページ下部の待機リストフォームの送信ボタンがありません',
  );
  assert.ok(html.includes('id="waitlist"'), '待機リストのアンカー先がありません');
});

/* ---- ヘッダの主従は T-010 のまま（待機リストが主） --------------------- */

test('ヘッダで btn--signal が付くのは待機リスト側だけ', () => {
  for (const el of ctaElements(renderHeader())) {
    if (el.classes.includes('btn--signal')) {
      assert.ok(
        el.name.endsWith('_waitlist'),
        `ヘッダ: btn--signal が ${el.name} に付いています。ヘッダの主CTAは待機リスト側であるべきです`,
      );
    }
  }
});

test('ベータ版の導線に btn--signal が付いていない（signal は待機リストの色である）', () => {
  assert.ok(!ctaByName(renderHeader(), 'header_beta').classes.includes('btn--signal'));
  assert.ok(!ctaByName(renderHero(), 'hero_beta').classes.includes('btn--signal'));
});

/* ---- T-020: ヒーローの唯一のCTAはβ版であり、面が強い ------------------ */

test('ヒーローのCTAはβ版の1つだけである', () => {
  const html = renderHero();
  const names = ctaNamesOf(html);
  assert.deepEqual(names, ['hero_beta'], `ヒーローの CTA が ${names.join(' / ')} です`);
});

test('ヒーローのβ版ボタンが、ヘッダのβ版ボタンとは異なる面（クラス）である', () => {
  // 完了条件7。「目立つ」の見え方そのものは自動テストで判定できないため、
  // ここで固定するのは「ヒーローとヘッダで面の指定が違うこと」までとする。
  const heroBeta = ctaByName(renderHero(), 'hero_beta');
  const headerBeta = ctaByName(renderHeader(), 'header_beta');
  const modifiers = (el) => el.classes.filter((c) => c.startsWith('btn--')).sort();
  assert.notDeepEqual(
    modifiers(heroBeta),
    modifiers(headerBeta),
    'ヒーローとヘッダのβ版ボタンが同じ面です。ヒーロー側だけトーンを変えること',
  );
  // 透明な面のままだとヒーローで目立たない。ヒーロー側は塗りのある面を当てる
  assert.ok(
    !modifiers(heroBeta).includes('btn--quiet'),
    'ヒーローのβ版ボタンがヘッダと同じ btn--quiet（透明な面）です',
  );
});

test('ヒーローに btn--signal は無い（待機リストのボタンが無いため）', () => {
  const html = renderHero();
  assert.equal(
    signalCount(html),
    0,
    `ヒーロー内の btn--signal が ${signalCount(html)} 件です。ヒーローに待機リストのボタンは無い`,
  );
});

test('ヘッダの主CTAがベータ版より弱くない（待機リストが btn--subtle でベータ版が btn--signal ではない）', () => {
  const html = renderHeader();
  const beta = ctaByName(html, 'header_beta');
  const waitlist = ctaByName(html, 'header_waitlist');
  assert.ok(
    !(beta.classes.includes('btn--signal') && waitlist.classes.includes('btn--subtle')),
    'ヘッダでベータ版が主CTAになっています',
  );
});

test('ヒーローのβ版ボタンの文言が PO の指定どおりである（ja）', () => {
  // 2026-09-02（T-020）PO 指定の文言。`{nutrient}` の置換では成分名「タンパク質」に
  // なってしまうため、この1文だけ locales 側で literal にしてある（hero.js のコメント参照）。
  assert.equal(
    ctaByName(renderHero(), 'hero_beta').text,
    'プロテインの最安ランキングを見る（β版）',
  );
});

/* ---- 完了条件2: ベータ版の導線が残っており押せる ---------------------- */

test('🔒 ベータ版の導線が残っており、押せる', () => {
  for (const [region, html, name] of [
    ['ヘッダ', renderHeader(), 'header_beta'],
    ['ヒーロー', renderHero(), 'hero_beta'],
  ]) {
    const el = ctaByName(html, name);
    assert.equal(el.tag, 'a', `${region}: ベータ版の導線がリンクではありません`);
    assert.equal(el.href, BETA_PATH, `${region}: ベータ版のリンク先が ${el.href} です`);
    assert.ok(el.text.length > 0, `${region}: ベータ版のラベルが空です`);
    assert.ok(!/\bhidden\b/.test(el.attrs), `${region}: ベータ版の導線が hidden です`);
    assert.ok(
      !/aria-disabled="true"/.test(el.attrs),
      `${region}: ベータ版の導線が aria-disabled です`,
    );
    assert.ok(
      !/display:\s*none/.test(el.attrs),
      `${region}: ベータ版の導線が display:none で消されています`,
    );
  }
});

test('🔒 ベータ版の導線は en でも残っている', () => {
  const html = renderHeader(tEn, 'en') + renderHero(tEn, 'en');
  for (const name of ['header_beta', 'hero_beta']) {
    const el = ctaByName(html, name);
    assert.equal(el.href, BETA_PATH);
    assert.ok(el.text.length > 0, `en: ${name} のラベルが空です`);
  }
});

/* ---- 完了条件5: 禁止語 -------------------------------------------------- */

test('🔒 禁止語が LP の出力に含まれていない', () => {
  const html = renderLp();
  for (const banned of BANNED_WORDS) {
    assert.ok(!html.includes(banned), `禁止語「${banned}」が LP の出力に含まれています`);
  }
});

test('🔒 禁止語が CTA のラベルに含まれていない', () => {
  const labels = [...ctaElements(renderHeader()), ...ctaElements(renderHero())].map(
    (el) => `${el.name}: ${el.text}`,
  );
  for (const label of labels) {
    for (const banned of BANNED_WORDS) {
      assert.ok(!label.includes(banned), `禁止語「${banned}」が CTA のラベルにあります（${label}）`);
    }
  }
});

/* ---- 完了条件6: 未定義の翻訳キーが無い -------------------------------- */

test('🔒 ja / en の両方で LP が未定義キーなしに描画できる', () => {
  // loadTranslator は未定義キーで throw する。両ロケールを描画できることが
  // 「locales/*.json に未定義キーが無い」ことの機械的な証拠になる。
  for (const [locale, t] of [
    ['ja', tJa],
    ['en', tEn],
  ]) {
    const html = renderLp(t, locale);
    for (const name of FIRST_VIEW_CTAS) {
      assert.ok(html.includes(`data-cta="${name}"`), `${locale}: ${name} が出力にありません`);
    }
  }
});

test('🔒 CTA のラベルが ja / en の両方で空でない', () => {
  for (const [locale, t] of [
    ['ja', tJa],
    ['en', tEn],
  ]) {
    const html = renderHeader(t, locale) + renderHero(t, locale);
    for (const name of FIRST_VIEW_CTAS) {
      const el = ctaByName(html, name);
      assert.ok(el.text.length > 0, `${locale}: ${name} のラベルが空です`);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTranslator } from '../src/lib/i18n.js';
import { rankingPage } from '../src/templates/ranking.js';
import { lpPage } from '../src/templates/lp.js';
import { makeRows, market } from './fixtures.js';

const t = await loadTranslator('ja');
const rows = makeRows();

/** design/service.md §7 と ad-lp.md §1 の禁止語 */
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

function renderRanking() {
  return rankingPage({
    t,
    locale: 'ja',
    market,
    rows,
    nutrientName: 'タンパク質',
    updatedAt: '2026-08-06',
    targetIntake: 60,
    displayUnit: 'g',
    disclosureKey: market.disclosureKey,
    gaMeasurementId: null,
  });
}

function renderLp() {
  return lpPage({
    t,
    locale: 'ja',
    currency: market.currency,
    displayUnit: 'g',
    topRows: rows.slice(0, 5),
    totalCount: rows.length,
    rulerRows: rows,
    filters: [],
    disclosureKey: market.disclosureKey,
    gaMeasurementId: null,
  });
}

/* ---- ランキングページ ------------------------------------------------ */

test('ランキングは ol でマークアップされる', () => {
  const html = renderRanking();
  assert.match(html, /<ol class="ranking">/);
  assert.equal((html.match(/<li class="ranking__item">/g) ?? []).length, rows.length);
});

test('🔒 表示順は単価の昇順になっている', () => {
  const html = renderRanking();
  const costs = [...html.matchAll(/class="cost__value">¥([\d,.]+)</g)].map((m) =>
    Number.parseFloat(m[1].replace(/,/g, '')),
  );
  assert.equal(costs.length, rows.length);
  assert.deepEqual(costs, [...costs].sort((a, b) => a - b));
});

test('主指標に単位と基準が添えられている', () => {
  const html = renderRanking();
  assert.match(html, /<span class="cost__unit">\/g<\/span>/);
});

test('免責と広告表示が常時出ている', () => {
  const html = renderRanking();
  assert.ok(html.includes('本サイトはアフィリエイト広告を利用しています'));
  assert.ok(html.includes('順位は表示中の指標のみで決定され、報酬額は影響しません'));
  assert.ok(html.includes('医療上の助言を行うものではありません'));
});

test('アフィリエイトリンクに rel が付いている', () => {
  const html = renderRanking();
  assert.match(html, /rel="nofollow sponsored noopener"/);
});

test('🔒 merchant ボタンは market 設定にある販売元だけ', () => {
  const html = renderRanking();
  assert.ok(html.includes('楽天で見る'));
  assert.ok(!html.includes('data-merchant="amazon_us"'));
});

test('禁止語が入っていない', () => {
  const html = renderRanking();
  for (const word of BANNED_WORDS) {
    assert.ok(!html.includes(word), `ランキングページに禁止語「${word}」が含まれています`);
  }
});

test('lang 属性が locale になっている', () => {
  assert.match(renderRanking(), /<html lang="ja">/);
});

/* ---- LP -------------------------------------------------------------- */

test('LP は5セクション構成', () => {
  const html = renderLp();
  // ヒーロー + lp-section 3つ + 免責フッター
  assert.equal((html.match(/class="lp-section"/g) ?? []).length, 3);
  assert.ok(html.includes('class="lp-hero"'));
  assert.ok(html.includes('class="disclosure"'));
});

test('🔒 LP にアフィリエイトリンクを置かない', () => {
  const html = renderLp();
  assert.ok(!html.includes('sponsored'));
  assert.ok(!html.includes('merchant-button'));
});

test('LP のヒーローは実データの上位5件', () => {
  const html = renderLp();
  assert.equal((html.match(/class="lp-row"/g) ?? []).length, 5);
  assert.ok(html.includes('残り1製品'));
});

test('H1 はタグラインと同義の疑問文', () => {
  const html = renderLp();
  assert.ok(html.includes('タンパク質1gあたり、いくら払ってる?'));
});

test('入力項目は3つまで。年齢・性別・体調を取らない', () => {
  const html = renderLp();
  assert.equal((html.match(/<fieldset/g) ?? []).length, 2);
  assert.equal((html.match(/<input type="email"/g) ?? []).length, 1);
  for (const banned of ['年齢', '性別', '体調', '生年', '身長', '体重']) {
    assert.ok(!html.includes(`name="${banned}"`));
  }
});

test('LP に禁止語が入っていない', () => {
  const html = renderLp();
  for (const word of BANNED_WORDS) {
    assert.ok(!html.includes(word), `LP に禁止語「${word}」が含まれています`);
  }
});

test('LP のフォームは同一ページ内で完了状態に切り替わる', () => {
  const html = renderLp();
  assert.ok(html.includes('class="waitlist__done"'));
  assert.ok(!html.includes('action='));
});

test('物差しは対数スケールであることを明記する', () => {
  const html = renderLp();
  assert.ok(html.includes('対数スケール'));
  assert.equal((html.match(/class="ruler__dot"/g) ?? []).length, rows.length);
});

test('免責と参照値の出典が常時表示される', () => {
  const html = renderLp();
  assert.ok(html.includes('日本人の食事摂取基準(2025年版)'));
  assert.ok(html.includes('医療上の助言を行うものではありません'));
  assert.ok(html.includes('アフィリエイト広告を利用する予定です'));
});

/* ---- 翻訳キー -------------------------------------------------------- */

test('未定義の翻訳キーはビルドを失敗させる', () => {
  assert.throws(() => t('does.not.exist'), /翻訳キーが ja.json にありません/);
});

test('プレースホルダに値がなければ失敗させる', () => {
  assert.throws(() => t('ranking.subtitle', { nutrient: 'タンパク質' }), /プレースホルダ/);
});

test('en の翻訳キーが ja と同じ集合である', async () => {
  const { readFile } = await import('node:fs/promises');
  const ja = JSON.parse(await readFile('locales/ja.json', 'utf8'));
  const en = JSON.parse(await readFile('locales/en.json', 'utf8'));

  // 免責は翻訳ではなく市場ごとの差し替えなので、対応を求めない
  const comparable = (dict) => Object.keys(dict).filter((k) => !k.startsWith('disclosure.')).sort();
  assert.deepEqual(comparable(en), comparable(ja));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { loadTranslator } from '../src/lib/i18n.js';
import { productsPage } from '../src/templates/products.js';
import { lpPage, ROADMAP_NUTRIENTS } from '../src/templates/lp.js';
import { makeRows, market } from './fixtures.js';

const t = await loadTranslator('ja');
const rows = makeRows();
const categories = JSON.parse(await readFile('config/categories.json', 'utf8'));
const category = categories.protein;

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

const nutrients = [
  { id: 'protein', count: rows.length },
  ...ROADMAP_NUTRIENTS.map((id) => ({ id, count: 0 })),
];

function renderProducts(overrides = {}) {
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
    disclosureKey: market.disclosureKey,
    waitlistPath: '/ja/#waitlist',
    gaMeasurementId: null,
    ...overrides,
  });
}

const HERO_ROWS = 3;

function renderLp(overrides = {}) {
  return lpPage({
    t,
    locale: 'ja',
    currency: market.currency,
    displayUnit: 'g',
    topRows: rows.slice(0, HERO_ROWS),
    totalCount: rows.length,
    nutrientName: 'タンパク質',
    updatedAt: '2026-08-06',
    disclosureKey: market.disclosureKey,
    betaPath: '/ja/protein/',
    gaMeasurementId: null,
    ...overrides,
  });
}

/* ---- 製品一覧ページ --------------------------------------------------- */

test('一覧は ol でマークアップされる', () => {
  const html = renderProducts();
  assert.match(html, /<ol class="p-list"/);
  assert.equal((html.match(/<li class="p-item/g) ?? []).length, rows.length);
});

test('🔒 表示順は単価の昇順になっている', () => {
  const html = renderProducts();
  const costs = [...html.matchAll(/class="cost__value">¥([\d,.]+)</g)].map((m) =>
    Number.parseFloat(m[1].replace(/,/g, '')),
  );
  assert.equal(costs.length, rows.length);
  assert.deepEqual(costs, [...costs].sort((a, b) => a - b));
});

test('🔒 並び替えのセレクトを置かない。切り替えられるのは副指標だけ', () => {
  const html = renderProducts();
  assert.ok(!html.includes('data-sort'));
  for (const banned of ['価格が安い順', '含有率が高い順', 'レビュー評価が高い順']) {
    assert.ok(!html.includes(banned), `並び替えの選択肢「${banned}」が残っています`);
  }
  // 副指標のセレクトは categories.json の secondaryMetrics ぶんだけ出る
  const select = html.match(/<select id="secondary-metric"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(select, '副指標のセレクトがありません');
  assert.equal(
    (select[1].match(/<option/g) ?? []).length,
    category.secondaryMetrics.length,
  );
});

test('🔒 レビューの星評価とレビュー件数を出さない', () => {
  const html = renderProducts();
  assert.ok(!html.includes('★'));
  assert.ok(!html.includes('レビュー'));
  assert.ok(!/rating/i.test(html));
});

test('主指標に単位と基準が添えられている', () => {
  const html = renderProducts();
  assert.match(html, /<span class="cost__unit">\/g<\/span>/);
  assert.ok(html.includes('タンパク質1gあたり'));
});

test('🔒 最安を色だけで示さない。順位番号とテキストを併記する', () => {
  const html = renderProducts();
  assert.ok(html.includes('class="p-item__rank num">1</span>'));
  assert.ok(html.includes('1gあたり最安'));
  // 最安バッジは先頭の1件だけ
  assert.equal((html.match(/class="p-item__best"/g) ?? []).length, 1);
});

test('免責と広告表示が常時出ている', () => {
  const html = renderProducts();
  assert.ok(html.includes('本サイトはアフィリエイト広告を利用しています'));
  assert.ok(html.includes('順位は表示中の指標のみで決定され、報酬額は影響しません'));
  assert.ok(html.includes('医療上の助言を行うものではありません'));
  assert.ok(html.includes('ラベル表示に基づきます'));
  // 折りたたまない
  assert.ok(!html.includes('<details'));
});

test('アフィリエイトリンクに rel が付いている', () => {
  const html = renderProducts();
  const links = html.match(/<a class="merchant-button[^>]*>/g) ?? [];
  assert.ok(links.length > 0);
  for (const link of links) {
    assert.match(link, /rel="nofollow sponsored noopener"/);
  }
});

test('🔒 merchant ボタンは market 設定にある販売元だけ', () => {
  const html = renderProducts();
  assert.ok(html.includes('楽天で見る'));
  assert.ok(!html.includes('data-merchant="amazon_us"'));
});

test('🔒 他ストアの価格は table + scope で組む', () => {
  const html = renderProducts();
  assert.match(html, /<table class="offers">/);
  assert.match(html, /<th scope="col">/);
  assert.match(html, /<th scope="row">/);
  // 販売元が1件しかない製品には開閉ボタンを出さない
  const toggles = (html.match(/class="p-item__toggle"/g) ?? []).length;
  const multi = rows.filter((r) => r.snapshotsByMerchant.size > 1).length;
  assert.equal(toggles, multi);
});

test('副指標は categories.json の secondaryMetrics を回して全部描画される', () => {
  const html = renderProducts();
  for (const metric of category.secondaryMetrics) {
    assert.ok(
      html.includes(`data-metric="${metric}"`),
      `副指標 ${metric} が描画されていません`,
    );
  }
});

test('絞り込みは fieldset + legend で組む', () => {
  const html = renderProducts();
  assert.ok((html.match(/<fieldset class="filters__group">/g) ?? []).length >= 5);
  assert.ok((html.match(/<legend class="filters__legend">/g) ?? []).length >= 5);
});

test('該当が0件のファセットは押せない状態で件数0を出す', () => {
  const html = renderProducts();
  // フィクスチャに rice の製品はない
  assert.match(html, /value="rice" disabled/);
  // whey_wpi は2件ある
  assert.match(html, /value="whey_wpi"(?! disabled)/);
});

test('Waitlist への導線は LP が存在するときだけ出る', () => {
  assert.ok(renderProducts().includes('/ja/#waitlist'));
  const without = renderProducts({ waitlistPath: null });
  // ワードマークの href は常に /ja/ なので、判定は #waitlist の有無で行う
  assert.ok(!without.includes('#waitlist'));
  assert.ok(!without.includes('waitlist-banner'));
});

test('製品が0件のときはダミーを出さずに未登録と伝える', () => {
  const html = renderProducts({ rows: [] });
  assert.ok(html.includes('この成分はまだ登録されていません'));
  assert.ok(!html.includes('<li class="p-item'));
});

test('禁止語が入っていない', () => {
  const html = renderProducts();
  for (const word of BANNED_WORDS) {
    assert.ok(!html.includes(word), `製品一覧ページに禁止語「${word}」が含まれています`);
  }
});

test('lang 属性が locale になっている', () => {
  assert.match(renderProducts(), /<html lang="ja">/);
});

/* ---- LP -------------------------------------------------------------- */

test('LP はヒーロー + 3セクション + 待機リスト + フッタで構成される', () => {
  const html = renderLp();
  assert.ok(html.includes('class="hero"'));
  for (const id of ['features', 'howitworks', 'roadmap', 'waitlist']) {
    assert.ok(html.includes(`id="${id}"`), `セクション #${id} がありません`);
  }
  assert.ok(html.includes('class="site-foot"'));
});

test('🔒 LP にアフィリエイトリンクを置かない', () => {
  const html = renderLp();
  assert.ok(!html.includes('sponsored'));
  assert.ok(!html.includes('merchant-button'));
});

test('ベータ版への導線はヘッダとヒーローの両方に出る', () => {
  const html = renderLp();
  assert.equal((html.match(/href="\/ja\/protein\/"/g) ?? []).length, 2);
  assert.ok(html.includes('ベータ版を使ってみる'));
  assert.ok(html.includes('ベータ版でタンパク質の一覧を見る'));
  // 主 CTA は Waitlist のまま。ベータ導線は btn--quiet で一段弱くする
  assert.ok(html.includes('class="btn btn--signal btn--block" href="#waitlist"'));
});

test('製品一覧がまだ無いときはベータ版の導線を出さない', () => {
  const html = renderLp({ betaPath: null });
  assert.ok(!html.includes('/ja/protein/'));
  assert.ok(!html.includes('ベータ版'));
});

test('🔒 ヒーローのランキングは実データで、ol でマークアップされる', () => {
  const html = renderLp();
  assert.match(html, /<ol class="rank-list">/);
  assert.equal((html.match(/<li class="rank-row/g) ?? []).length, HERO_ROWS);
  for (const row of rows.slice(0, HERO_ROWS)) {
    assert.ok(html.includes(row.name), `${row.name} がヒーローに出ていません`);
  }
});

test('🔒 実データが無いときはランキングカードを出さないが、LP の他は全部出る', () => {
  const html = renderLp({ topRows: [], totalCount: 0 });
  // 禁止されているのはダミーの数字であって、LP を出さないことではない
  assert.ok(!html.includes('rank-list'));
  assert.ok(!html.includes('rank-row'));
  // Waitlist を測るのが LP の仕事。ここが消えたら検証フェーズが成立しない
  for (const id of ['features', 'howitworks', 'roadmap', 'waitlist']) {
    assert.ok(html.includes(`id="${id}"`), `セクション #${id} がありません`);
  }
  assert.ok(html.includes('class="hero"'));
  assert.ok(html.includes('href="#waitlist"'));
  // 2カラムのまま右半分が空くのを避ける
  assert.ok(html.includes('hero__grid--solo'));
});

test('🔒 ヒーローの並び順は単価の昇順', () => {
  const html = renderLp();
  const costs = [...html.matchAll(/class="cost__value">¥([\d,.]+)</g)].map((m) =>
    Number.parseFloat(m[1].replace(/,/g, '')),
  );
  assert.equal(costs.length, HERO_ROWS);
  assert.deepEqual(costs, [...costs].sort((a, b) => a - b));
});

test('主指標に単位が添えられている', () => {
  const html = renderLp();
  assert.match(html, /<span class="cost__unit">\/g<\/span>/);
});

test('掲載件数は実データの件数で、丸めない', () => {
  const html = renderLp();
  assert.ok(html.includes(`現在タンパク質${rows.length}製品を毎日追跡中`));
});

test('🔒 ワードマークはタグラインとセットで出る', () => {
  const html = renderLp();
  assert.ok(html.includes('1gあたり、いくら払ってる?'));
  assert.ok(!html.includes('Pergram'));
  assert.ok(!html.includes('PerGram'));
});

test('🔒 製品画像がない行は空白にせず代替表現を出す', () => {
  const html = renderLp();
  // フィクスチャに画像 URL はないので、全行が代替表現になる
  assert.equal((html.match(/class="thumb thumb--empty"/g) ?? []).length >= HERO_ROWS, true);
  assert.ok(html.includes('aria-label="商品画像なし"'));
});

test('🔒 説明用の例は実在の製品ではないと明記する', () => {
  const html = renderLp();
  assert.ok(html.includes('実在の製品ではありません'));
});

test('説明用の例の単価は価格と含有量から導出される', () => {
  const html = renderLp();
  // 製品A ¥3,000 / 含有 600g → ¥5.0/g、製品B ¥3,800 / 含有 900g → ¥4.2/g
  assert.ok(html.includes('¥5.0'));
  assert.ok(html.includes('¥4.2'));
  assert.ok(html.includes('約16%'));
});

test('🔒 入力項目は3つまで。年齢・性別・体調を取らない', () => {
  const html = renderLp();
  assert.equal((html.match(/<fieldset/g) ?? []).length, 2);
  assert.equal((html.match(/<input type="email"/g) ?? []).length, 1);
  for (const banned of ['年齢', '性別', '体調', '生年', '身長', '体重']) {
    assert.ok(!html.includes(`name="${banned}"`));
  }
});

test('🔒 見たい成分は複数選択、普段の購入先は単一選択', () => {
  const html = renderLp();
  assert.ok(html.includes('type="checkbox" name="nutrients"'));
  assert.ok(html.includes('type="radio" name="channel"'));
  assert.ok(!html.includes('type="checkbox" name="channel"'));
});

test('LP に禁止語が入っていない', () => {
  const html = renderLp();
  for (const word of BANNED_WORDS) {
    assert.ok(!html.includes(word), `LP に禁止語「${word}」が含まれています`);
  }
});

test('🔒 LP のフォームは同一ページ内で完了状態に切り替わる', () => {
  const html = renderLp();
  assert.ok(html.includes('class="waitlist__done"'));
  assert.ok(!html.includes('action='));
});

test('🔒 免責と参照値の出典が常時表示される', () => {
  const html = renderLp();
  assert.ok(html.includes('日本人の食事摂取基準(2025年版)'));
  assert.ok(html.includes('医療上の助言を行うものではありません'));
  assert.ok(html.includes('アフィリエイト広告を利用する予定です'));
  assert.ok(html.includes('ラベル表示に基づきます'));
  // 折りたたまない
  assert.ok(!html.includes('<details'));
});

/* ---- 翻訳キー -------------------------------------------------------- */

test('未定義の翻訳キーはビルドを失敗させる', () => {
  assert.throws(() => t('does.not.exist'), /翻訳キーが ja.json にありません/);
});

test('プレースホルダに値がなければ失敗させる', () => {
  assert.throws(() => t('ranking.subtitle', { nutrient: 'タンパク質' }), /プレースホルダ/);
});

test('en の翻訳キーが ja と同じ集合である', async () => {
  const ja = JSON.parse(await readFile('locales/ja.json', 'utf8'));
  const en = JSON.parse(await readFile('locales/en.json', 'utf8'));

  // 免責は翻訳ではなく市場ごとの差し替えなので、対応を求めない
  const comparable = (dict) => Object.keys(dict).filter((k) => !k.startsWith('disclosure.')).sort();
  assert.deepEqual(comparable(en), comparable(ja));
});

/* ---- カテゴリ設定 ---------------------------------------------------- */

test('🔒 カテゴリ固有の分岐は categories.json に閉じている', async () => {
  for (const [id, conf] of Object.entries(categories)) {
    if (id.startsWith('_')) continue;
    assert.ok(Array.isArray(conf.secondaryMetrics), `${id}: secondaryMetrics がありません`);
    assert.ok(Array.isArray(conf.facets), `${id}: facets がありません`);
    assert.ok(conf.unitCostRange && conf.priceRange, `${id}: レンジ設定がありません`);
    assert.ok('explainerKey' in conf, `${id}: explainerKey が未定義です`);
    if (conf.explainerKey) t(conf.explainerKey);
    for (const facet of conf.facets) {
      t(`filters.${facet.id}`);
      for (const key of facet.keys) t(`attr.${key}`);
    }
  }
});

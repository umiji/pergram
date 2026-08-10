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

const NUTRIENT_NAME = 'タンパク質';

function renderProducts(overrides = {}) {
  return productsPage({
    t,
    locale: 'ja',
    market,
    rows,
    nutrientId: 'protein',
    nutrientName: NUTRIENT_NAME,
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

/**
 * 🔒 絞り込みの初期状態は、どの製品も除外してはならない。
 *
 * スライダーの上限は config/categories.json に固定値で入っていて、実データの最大を
 * 下回ると「操作していないのに製品が消える」。実際に価格の上限 20,000円 に対して
 * ¥39,980 の1位が消え、初期表示が 2〜13位になった。
 * 上限は掲載中の行から導く（🔒 導出値を二重に持たない）。
 */
test('🔒 絞り込みの初期値がどの製品も除外しない', () => {
  // config の上限（価格 20,000 / 単価 12）を超える行を混ぜる
  const over = rows.map((row, i) =>
    i === 0 ? { ...row, price: 42980, costPerNutrientUnit: 18.4 } : row,
  );
  const html = renderProducts({ rows: over });

  const sliderValue = (id) =>
    Number(html.match(new RegExp(`id="${id}"[\\s\\S]*?value="([\\d.]+)"`))[1]);
  const itemValues = (attr) =>
    [...html.matchAll(new RegExp(`data-${attr}="([\\d.]+)"`, 'g'))].map((m) => Number(m[1]));

  const priceMax = Math.max(...itemValues('price'));
  const unitCostMax = Math.max(...itemValues('unit-cost'));

  assert.ok(
    sliderValue('price') >= priceMax,
    `価格スライダーの初期値 ${sliderValue('price')} が最高価格 ${priceMax} 未満です。操作なしで製品が消えます`,
  );
  assert.ok(
    sliderValue('unit-cost') >= unitCostMax,
    `単価スライダーの初期値 ${sliderValue('unit-cost')} が最高単価 ${unitCostMax} 未満です。操作なしで製品が消えます`,
  );
});

const HERO_ROWS = 3;

function renderLp(overrides = {}) {
  return lpPage({
    t,
    locale: 'ja',
    currency: market.currency,
    displayUnit: 'g',
    topRows: rows.slice(0, HERO_ROWS),
    totalCount: rows.length,
    nutrientName: NUTRIENT_NAME,
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

// 文面は言い換わるので t() 経由で見る。見張るのは「出ているか」であって字面ではない。
test('免責が常時出ている', () => {
  const html = renderProducts();
  assert.ok(html.includes(t('disclosure.jp.medical')), '医療に関する免責がありません');
  assert.ok(t('disclosure.jp.dataSource').length > 0, '数値の出所を書いた文面が空です');
  assert.ok(html.includes(t('disclosure.jp.dataSource')), '数値の出所の表示がありません');
  // 折りたたまない
  assert.ok(!html.includes('<details'));
});

// 🔒 アフィリエイトを利用している。書かないとステマ規制に触れる。
// 折りたたまず常時出す。market に紐づく（locale ではない）。
test('🔒 アフィリエイトの広告表示を常時出す', () => {
  const products = renderProducts();
  assert.ok(products.includes('アフィリエイトリンクを含みます'), '製品一覧の広告表示がありません');
  assert.ok(products.includes('アフィリエイト広告を利用'), '製品一覧フッタの開示がありません');
  assert.ok(renderLp().includes('アフィリエイト広告を利用'), 'LP フッタの開示がありません');
  // 折りたたまない
  assert.ok(!products.includes('<details'));
});

// 報酬額で順位が動くと比較そのものが嘘になる。開示文でもそれを明言する。
test('🔒 広告表示は「報酬は順位に影響しない」と明言する', () => {
  for (const html of [renderProducts(), renderLp()]) {
    assert.ok(html.includes('報酬額は影響しません'), '報酬が順位に影響しない旨がありません');
  }
});

// sponsored は報酬付きリンクを表す。報酬を受けている以上、付けないと事実と違う。
test('🔒 外部リンクに rel="nofollow sponsored noopener" が付いている', () => {
  const html = renderProducts();
  const links = html.match(/<a class="merchant-button[^>]*>/g) ?? [];
  assert.ok(links.length > 0);
  for (const link of links) {
    assert.match(link, /rel="nofollow sponsored noopener"/);
  }
});

test('リスト表示用のテーブルヘッダーが出力される', () => {
  const html = renderProducts();
  assert.match(html, /<div class="p-list-header"/);
  assert.ok(html.includes('順位'));
  assert.ok(html.includes('製品'));
  assert.ok(html.includes('1gあたり価格'));
  assert.ok(html.includes('内容量'));
  assert.ok(html.includes('タンパク質量'));
  assert.ok(html.includes('商品価格'));
  assert.ok(html.includes('送料'));
  assert.ok(html.includes('最安ストア'));
});

// 文言そのものは locales の担当。ここで見るのは
// カード用・リスト用の両方のラベルとアクセス注記が揃っていることだけ。
test('購入ボタンにカード用・リスト用のラベルとアクセス注記が付いている', () => {
  const html = renderProducts();
  assert.ok(html.includes(t('merchant.viewShop')));
  assert.ok(html.includes(t('merchant.viewBestShop')));
  assert.ok(html.includes(t('merchant.accessNotice', { merchant: t('merchant.rakuten') })));
});

// 広告表示を戻したあとも、順位を決めるのは単価だけであること。
test('🔒 広告表示があっても並び順は単価の昇順のまま', () => {
  const html = renderProducts();
  const costs = [...html.matchAll(/class="cost__value">¥([\d,.]+)</g)].map((m) =>
    Number.parseFloat(m[1].replace(/,/g, '')),
  );
  assert.deepEqual(costs, [...costs].sort((a, b) => a - b));
  // 報酬率・PR・スポンサー枠のような、価格以外で順位を動かす手掛かりを置かない
  for (const banned of ['報酬率', 'PR枠', 'スポンサー', 'おすすめ順', '広告枠']) {
    assert.ok(!html.includes(banned), `順位を歪める表示「${banned}」があります`);
  }
});

/* ---- 送料 ------------------------------------------------------------- */

// 表示価格に送料が乗るのかどうかは、比べるときに必要な事実。
// ただし取れるのは「込み / 別」の2値だけで、金額は取れない。
test('送料込みか送料別かを商品価格の横に出す', () => {
  const html = renderProducts();
  const count = (needle) => html.split(needle).length - 1;

  // fixtures は 送料込み2件 / 送料別2件 / 判別できず2件
  assert.equal(count('送料無料'), 2);
  assert.equal(count('送料別'), 2);
});

test('🔒 送料が判別できない製品には送料の表記を出さない', () => {
  const unknown = rows.filter((row) => row.postageIncluded === null);
  assert.equal(unknown.length, 2, 'fixtures に送料不明の製品が無くなっています');

  const html = renderProducts({ rows: unknown });

  // 一覧の列見出しは製品の事実ではないので「送料」の語を持つ。
  // 見てはいけないのは製品行のほうなので、<ol> の中だけを取り出して確かめる。
  const list = html.slice(html.indexOf('<ol class="p-list"'), html.indexOf('</ol>'));
  assert.ok(list.length > 0, '製品一覧が描画されていません');
  assert.ok(!list.includes('class="p-item__postage"'), '判別できていない送料を書いています');
  for (const label of [t('products.postage.included'), t('products.postage.excluded')]) {
    assert.ok(!list.includes(label), `判別できていない送料「${label}」を書いています`);
  }
});

// 🔒 送料の金額は取れない。単価は常に商品価格だけで出す。
test('🔒 送料の有無で主指標は変わらない', () => {
  const withPostage = renderProducts();
  const withoutPostage = renderProducts({
    rows: rows.map((row) => ({ ...row, postageIncluded: null })),
  });
  const costs = (html) => [...html.matchAll(/class="cost__value">([^<]+)</g)].map((m) => m[1]);

  assert.deepEqual(costs(withPostage), costs(withoutPostage));
});

// 製品一覧と LP のヒーローが別の場所を見ていると、片方だけ画像が出ない状態になる。
// 参照先は product.image_url ひとつに固定する。
test('製品画像は一覧と LP のヒーローで同じ場所から読む', () => {
  const url = 'https://thumbnail.image.rakuten.co.jp/@0_mall/example/p1.jpg';
  for (const html of [renderProducts(), renderLp()]) {
    assert.ok(html.includes(`<img class="thumb" src="${url}"`));
  }
});

test('画像の無い製品は代替表現に落ちる', () => {
  const html = renderProducts();
  assert.ok(html.includes('thumb thumb--empty'));
});

// 文言ではなく data-merchant で見る。ラベルを変えても防御が効いたままになる。
test('🔒 merchant ボタンは market 設定にある販売元だけ', () => {
  const html = renderProducts();
  const linked = [
    ...html.matchAll(/<a class="merchant-button[^>]*data-merchant="([^"]+)"/g),
  ].map((m) => m[1]);

  assert.ok(linked.length > 0, '購入リンクが1件もありません');
  for (const merchant of new Set(linked)) {
    assert.ok(
      market.merchants.includes(merchant),
      `market 設定に無い販売元 ${merchant} にリンクしています`,
    );
  }
  assert.ok(!html.includes('data-merchant="amazon_us"'));
});

// 🔒 価格を取得していない販売元の欄に、それらしい金額を作って置かない。
test('🔒 価格が無い販売元は金額を出さずプレースホルダにする', () => {
  const html = renderProducts();
  const placeholders = html.match(/<tr data-placeholder="true">[\s\S]*?<\/tr>/g) ?? [];
  assert.ok(placeholders.length > 0, '表示例の行が1つもありません');

  for (const tr of placeholders) {
    const text = tr.replace(/<[^>]*>/g, '');
    assert.ok(!/[0-9]/.test(text), `表示例の行に金額らしき数字が入っています: ${text}`);
    assert.ok(!tr.includes('href='), '価格が無い販売元にリンクを張っています');
  }
});

// 表示例であることを画面で明示しないと、取得済みの価格と見分けがつかない。
test('🔒 他ストアの欄が表示例であることをページに明示する', () => {
  assert.ok(renderProducts().includes(t('products.betaNoData')));
});

test('🔒 他ストアの価格は table + scope で組む', () => {
  const html = renderProducts();
  assert.match(html, /<table class="offers">/);
  assert.match(html, /<th scope="col">/);
  assert.match(html, /<th scope="row"/);
  // 🔴 β版は表示例の行を必ず足すので、開閉ボタンは全製品に出る。
  //    実データが揃って item.js の PLACEHOLDER_MERCHANTS を消したら、
  //    「販売元が1件しかない製品には出さない」に戻すこと。
  const toggles = (html.match(/class="p-item__toggle"/g) ?? []).length;
  assert.equal(toggles, rows.length);
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

// 利用しているのに「誘導を行わない」と書くと、開示文と真っ向から矛盾する。
test('🔒 アフィリエイトを利用している以上「誘導を行わない」と書かない', () => {
  for (const html of [renderLp(), renderProducts()]) {
    assert.ok(!html.includes('アフィリエイト誘導を行わない'));
    assert.ok(!html.includes('アフィリエイト広告を利用する予定'));
  }
});

test('ベータ版への導線はヘッダとヒーローの両方に出る', () => {
  const html = renderLp();
  assert.equal((html.match(/href="\/ja\/protein\/"/g) ?? []).length, 2);
  // 文言は言い換わる。見張るのは「ヘッダとヒーローの両方から辿れるか」
  assert.ok(html.includes(t('lp.nav.beta')), 'ヘッダのベータ導線がありません');
  assert.ok(
    html.includes(t('lp.hero.beta', { nutrient: NUTRIENT_NAME })),
    'ヒーローのベータ導線がありません',
  );
  // 2026-08-10 に主従を入れ替えた。ヒーローの主 CTA は製品一覧、Waitlist は一段弱い面。
  // 見張るのは「どちらが強いか」だけ。class 名の綴りではなく主従の関係を固定する。
  const heroBeta = html.match(/<a class="btn ([^"]*)hero__beta"/);
  const heroWaitlist = html.match(/<a class="btn ([^"]*)hero__waitlist"/);
  assert.ok(heroBeta, 'ヒーローの製品一覧ボタンがありません');
  assert.ok(heroWaitlist, 'ヒーローの Waitlist ボタンがありません');
  assert.ok(heroBeta[1].includes('btn--signal'), 'ヒーローの主 CTA は製品一覧である');
  assert.ok(!heroWaitlist[1].includes('btn--signal'), 'Waitlist を主 CTA と同じ強さにしない');
  // Waitlist 本体のフォーム側 CTA は主のまま
  assert.ok(html.includes('<button type="submit" class="btn btn--signal btn--block">'));
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

// 掲載件数は出しても出さなくてもよい。出すなら実データの件数と一致していなければならない。
// モックにあった「68製品」のような丸めた数字が紛れ込むのをここで止める。
// 件数の表示そのものを消しても検査は生きる（LP のどこに書いても拾う）。
test('掲載件数を出すなら実データの件数で、丸めない', () => {
  const html = renderLp();
  const shown = [...html.matchAll(/(\d[\d,]*)\s*製品/g)].map((m) => Number(m[1].replace(/,/g, '')));
  for (const count of shown) {
    assert.equal(
      count,
      rows.length,
      `LP の掲載件数 ${count} が実データの件数 ${rows.length} と合っていません`,
    );
  }
});

test('🔒 ワードマークはタグラインとセットで出る', () => {
  const html = renderLp();
  assert.ok(html.includes('1gあたり、いくら払ってる?'));
  assert.ok(!html.includes('Pergram'));
  assert.ok(!html.includes('PerGram'));
});

test('🔒 製品画像がない行は空白にせず代替表現を出す', () => {
  const html = renderLp();

  // 期待値はフィクスチャから導く。画像を持つ製品が増えても件数を書き換えずに済む
  const heroRows = rows.slice(0, HERO_ROWS);
  const withoutImage = heroRows.filter((row) => !row.product.image_url);
  assert.ok(withoutImage.length > 0, 'fixtures に画像なしの製品が無くなっています');

  const empties = (html.match(/class="thumb thumb--empty"/g) ?? []).length;
  assert.ok(
    empties >= withoutImage.length,
    `画像なし ${withoutImage.length} 件に対し代替表現が ${empties} 件しかありません`,
  );
  assert.ok(html.includes(`aria-label="${t('lp.hero.noImage')}"`));
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
  assert.ok(html.includes(t('disclosure.jp.medical')), '医療に関する免責がありません');
  assert.ok(html.includes(t('disclosure.jp.dataSource')), '数値の出所の表示がありません');

  // 🔒 参照値（RDA / UL）を出すなら、必ず出典を添える。
  //    今は LP に参照値そのものを出していないので出典行も無くてよい。
  //    出し始めた時点でここが発火する。
  const showsReferenceValue = html.includes(t('reference.none')) || /data-reference-value/.test(html);
  if (showsReferenceValue) {
    assert.ok(
      t('disclosure.jp.referenceSource').length > 0 &&
        html.includes(t('disclosure.jp.referenceSource')),
      '参照値を出しているのに出典がありません',
    );
  }

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

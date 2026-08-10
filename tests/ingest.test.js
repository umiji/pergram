/**
 * 下書き → 公開データへの取り込み。
 *
 * 🔒 保存してよい独立変数は serving_size_g / servings_per_unit / amount_elemental の3つだけ。
 *    含有率・100gあたり含有量・1食あたり価格は導出値なので保存しない（CLAUDE.md）。
 *    二重に持つと片方だけ更新され、必ず矛盾する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { toRecords } from '../scripts/ingest_draft.js';

/** 収集スクリプトが吐く下書き1行の形 */
const row = (over = {}) => ({
  product_id: 'rakuten:shop:item1',
  item_name: 'ホエイプロテイン 1kg プレーン',
  shop_name: 'テスト店',
  price: 3980,
  currency: 'JPY',
  url: 'https://hb.afl.rakuten.co.jp/hgc/xxxx/',
  is_affiliate: true,
  image_url: 'https://thumbnail.image.rakuten.co.jp/@0_mall/shop/i.jpg',
  fetched_at: '2026-08-09',
  net_weight_g: 1000,
  net_weight_ambiguous: false,
  protein_per_100g: 80,
  serving_size_g: 30,
  protein_per_serving_g: 24,
  label_basis: 'serving',
  label_ambiguous: false,
  brand: 'テストブランド',
  excluded_reason: null,
  ...over,
});

test('読み取れた行は4つの表に展開される', () => {
  const got = toRecords([row()]);

  assert.equal(got.products.length, 1);
  assert.equal(got.productI18n.length, 1);
  assert.equal(got.nutrientContents.length, 1);
  assert.equal(got.priceSnapshots.length, 1);
  assert.equal(got.skipped.length, 0);
});

test('購入リンクにはアフィリエイト URL がそのまま渡る', () => {
  const got = toRecords([row()]);

  assert.equal(got.priceSnapshots[0].url, 'https://hb.afl.rakuten.co.jp/hgc/xxxx/');
  assert.equal(got.priceSnapshots[0].merchant, 'rakuten');
});

// 送料は販売元ごとに違う。製品ではなく価格スナップショットに紐づく。
test('送料が価格に含まれるかどうかは価格スナップショットへ渡る', () => {
  assert.equal(toRecords([row({ postage_included: true })]).priceSnapshots[0].postage_included, true);
  assert.equal(toRecords([row({ postage_included: false })]).priceSnapshots[0].postage_included, false);
});

test('🔒 下書きに送料の記載が無ければ null。送料無料と決めつけない', () => {
  // row() は postage_included を持たない（送料対応より前に作った下書き）
  assert.equal(toRecords([row()]).priceSnapshots[0].postage_included, null);
});

// 説明文は店舗が書いた宣伝文。読み取りの材料として下書きには置くが、
// 🔒 公開データには持ち込まない（転載になる。N-08 と同じ理由）。
test('🔒 商品説明文を公開データに持ち込まない', () => {
  const got = toRecords([row({ item_caption: '【栄養成分表示】たんぱく質 24.0g / 送料無料 大人気!' })]);

  const published = JSON.stringify([got.products, got.productI18n, got.nutrientContents, got.priceSnapshots]);
  assert.ok(!published.includes('大人気'), '説明文が公開データに入っています');
  assert.ok(!published.includes('item_caption'), '説明文の項目が公開データに入っています');
});

test('🔒 導出値を products に保存しない', () => {
  const got = toRecords([row()]);
  const product = got.products[0];

  for (const derived of ['net_weight_g', 'protein_per_100g', 'content_ratio', 'price', 'cost_per_g']) {
    assert.equal(product[derived], undefined, `導出値「${derived}」が保存されています`);
  }
  // 保存してよいのはこの3つ（＋メタ情報）
  assert.equal(product.serving_size_g, 30);
  assert.ok(product.servings_per_unit > 0);
  assert.equal(got.nutrientContents[0].amount_elemental, 24);
});

test('🔒 比較に使うのは amount_elemental。単位は g で揃える', () => {
  const got = toRecords([row()]);

  assert.equal(got.nutrientContents[0].unit, 'g');
  assert.equal(got.nutrientContents[0].nutrient_id, 'protein');
  // プロテインは塩形態がないため換算係数 1。ラベル量と元素量が一致する
  assert.equal(got.nutrientContents[0].amount_labeled, 24);
});

test('除外理由が書かれた行は取り込まない', () => {
  const got = toRecords([row({ excluded_reason: 'ブレンド品' })]);

  assert.equal(got.products.length, 0);
  assert.deepEqual(got.skipped, [{ product_id: 'rakuten:shop:item1', reason: 'ブレンド品' }]);
});

test('🔒 含有量が読めなかった行は取り込まず、理由を残す', () => {
  const got = toRecords([
    row({ protein_per_100g: null, protein_per_serving_g: null, serving_size_g: null }),
  ]);

  assert.equal(got.products.length, 0);
  assert.equal(got.skipped[0].reason, 'protein_content_unreadable');
});

test('🔒 内容量が読めなかった行は取り込まない', () => {
  const got = toRecords([row({ net_weight_g: null })]);

  assert.equal(got.products.length, 0);
  assert.equal(got.skipped[0].reason, 'net_weight_unreadable');
});

test('1食量が読めていない行は confidence を下げる', () => {
  const got = toRecords([row({ serving_size_g: null, protein_per_serving_g: null })]);

  assert.equal(got.products[0].confidence, 'medium');
  assert.equal(got.products[0].serving_size, null);
});

/* ---- 同一商品のまとめ ------------------------------------------------- */

// 楽天は同じ商品を複数の店舗が出している。実データでは同じザバス231gが4件並んだ。
// ⚠️ 名寄せキー（requirements.md Q-07）はまだ決めていない。これはモック用の力技で、
//    「内容量と含有率が一致すれば同じ商品」とみなしているだけ。2つ目のソースを足す前に
//    Q-07 を確定させ、この処理は捨てること。
test('同一商品が複数の店舗から出ていたら最安の1件だけ残す', () => {
  const got = toRecords([
    row({ product_id: 'rakuten:shopA:x', price: 4200 }),
    row({ product_id: 'rakuten:shopB:x', price: 3980 }),
    row({ product_id: 'rakuten:shopC:x', price: 4500 }),
  ]);

  assert.equal(got.products.length, 1);
  assert.equal(got.products[0].id, 'rakuten:shopB:x');
  assert.equal(got.priceSnapshots.length, 1);
  assert.equal(got.priceSnapshots[0].price, 3980);
});

test('内容量か含有率が違えば別の商品として残す', () => {
  const got = toRecords([
    row({ product_id: 'a', net_weight_g: 1000 }),
    row({ product_id: 'b', net_weight_g: 3000 }),
    // 同じ1kgでも含有率が違えば中身が違う
    row({ product_id: 'c', net_weight_g: 1000, protein_per_100g: 70, protein_per_serving_g: 21 }),
  ]);

  assert.deepEqual(got.products.map((p) => p.id).sort(), ['a', 'b', 'c']);
});

// 力技なので誤って別商品をまとめる可能性がある。黙って消さず、必ず報告する。
test('まとめて落とした出品を報告する', () => {
  const got = toRecords([
    row({ product_id: 'rakuten:shopA:x', price: 4200 }),
    row({ product_id: 'rakuten:shopB:x', price: 3980 }),
  ]);

  assert.deepEqual(got.merged, [{ kept: 'rakuten:shopB:x', dropped: ['rakuten:shopA:x'] }]);
});

test('複数行のうち読めたものだけが通る', () => {
  const got = toRecords([
    row({ product_id: 'a' }),
    row({ product_id: 'b', protein_per_100g: null, protein_per_serving_g: null, serving_size_g: null }),
    // a と同じ内容量・含有率にすると同一商品としてまとめられるので、別商品にしておく
    row({ product_id: 'c', net_weight_g: 3000 }),
  ]);

  assert.deepEqual(got.products.map((p) => p.id), ['a', 'c']);
  assert.deepEqual(got.skipped.map((s) => s.product_id), ['b']);
});

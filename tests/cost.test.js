import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRow,
  contentPer100g,
  contentRatioPercent,
  costPerNutrientUnit,
  costPerServing,
  costPerTargetIntake,
  netWeightG,
  pickBestPrice,
  premiumGap,
  sortByUnitCost,
  totalNutrientAmount,
} from '../src/lib/cost.js';

const proteinNutrient = { id: 'protein', canonical_unit: 'g', category: 'protein' };
const zincNutrient = { id: 'zinc', canonical_unit: 'mg', category: 'mineral' };

// 3kg / 1食30g / 1食あたりタンパク質 24g（含有率80%）
const product = { id: 'p1', brand: 'A', serving_size_g: 30, servings_per_unit: 100 };
const content = { product_id: 'p1', nutrient_id: 'protein', amount_elemental: 24 };

test('内容量は導出値として求まる', () => {
  assert.equal(netWeightG(product), 3000);
});

test('1容器あたりの有効成分総量', () => {
  assert.equal(totalNutrientAmount(product, content), 2400);
});

test('主指標は有効成分1単位あたりの価格', () => {
  // ¥7,200 / 2,400g = ¥3/g
  assert.equal(costPerNutrientUnit(7200, product, content), 3);
});

test('1食あたり価格は補助指標として求まる', () => {
  assert.equal(costPerServing(7200, product), 72);
});

test('100gあたり含有量と含有率', () => {
  assert.equal(contentPer100g(product, content), 80);
  assert.equal(contentRatioPercent(product, content, proteinNutrient), 80);
});

test('単位が g でない成分では含有率を出さない', () => {
  const zincProduct = { id: 'z1', serving_size_g: 1, servings_per_unit: 60 };
  const zincContent = { amount_elemental: 15 };
  assert.equal(contentRatioPercent(zincProduct, zincContent, zincNutrient), null);
  assert.equal(contentPer100g(zincProduct, zincContent), 1500);
});

test('目標摂取量あたりの価格', () => {
  assert.equal(costPerTargetIntake(3, 60), 180);
});

test('分母が 0 や欠損なら null を返し、推定で埋めない', () => {
  assert.equal(costPerNutrientUnit(1000, { serving_size_g: 30, servings_per_unit: 0 }, content), null);
  assert.equal(costPerNutrientUnit(1000, product, { amount_elemental: 0 }), null);
  assert.equal(netWeightG({ serving_size_g: 30 }), null);
  assert.equal(contentPer100g({ serving_size_g: 0 }, content), null);
  assert.equal(costPerTargetIntake(null, 60), null);
});

test('🔒 serving の定義が違っても単価は変わらない', () => {
  // 同じ中身（3kg・含有率80%・¥7,200）を、1食30g と 1食60g で表記した2製品
  const a = { id: 'a', serving_size_g: 30, servings_per_unit: 100 };
  const aContent = { amount_elemental: 24 };
  const b = { id: 'b', serving_size_g: 60, servings_per_unit: 50 };
  const bContent = { amount_elemental: 48 };

  // 1食あたり価格は2倍の差に見える
  assert.equal(costPerServing(7200, a), 72);
  assert.equal(costPerServing(7200, b), 144);

  // 主指標は一致する。だから per serving をソートキーにしてはならない
  assert.equal(costPerNutrientUnit(7200, a, aContent), costPerNutrientUnit(7200, b, bContent));
});

test('🔒 並び順は単価の昇順のみで決まる', () => {
  const rows = [
    { product: { id: 'c' }, costPerNutrientUnit: 4.1, rating: 4.9 },
    { product: { id: 'a' }, costPerNutrientUnit: 3.2, rating: 3.1 },
    { product: { id: 'b' }, costPerNutrientUnit: 3.5, rating: 5.0 },
  ];
  assert.deepEqual(
    sortByUnitCost(rows).map((r) => r.product.id),
    ['a', 'b', 'c'],
  );
});

test('同単価のときは製品 ID で決定的に並ぶ', () => {
  const rows = [
    { product: { id: 'b' }, costPerNutrientUnit: 3 },
    { product: { id: 'a' }, costPerNutrientUnit: 3 },
  ];
  assert.deepEqual(
    sortByUnitCost(rows).map((r) => r.product.id),
    ['a', 'b'],
  );
});

test('🔒 表示する merchant は market 設定だけで決まる', () => {
  const snapshots = [
    { merchant: 'rakuten', price: 7200, in_stock: true },
    { merchant: 'amazon_us', price: 3000, in_stock: true },
  ];
  const best = pickBestPrice(snapshots, ['rakuten', 'amazon_jp', 'iherb']);
  assert.equal(best.merchant, 'rakuten');
  assert.equal(best.price, 7200);
});

test('在庫ありを優先し、なければ在庫なしから最安を返す', () => {
  const snapshots = [
    { merchant: 'rakuten', price: 5000, in_stock: false },
    { merchant: 'iherb', price: 7000, in_stock: true },
  ];
  assert.equal(pickBestPrice(snapshots, ['rakuten', 'iherb']).merchant, 'iherb');

  const allOut = [{ merchant: 'rakuten', price: 5000, in_stock: false }];
  assert.equal(pickBestPrice(allOut, ['rakuten']).price, 5000);
});

test('市場に merchant がなければ価格なし', () => {
  assert.equal(pickBestPrice([{ merchant: 'amazon_us', price: 10, in_stock: true }], ['rakuten']), null);
});

test('buildRow は価格が取れない製品を null にする', () => {
  const row = buildRow({
    product,
    content,
    nutrient: proteinNutrient,
    snapshots: [],
    market: { merchants: ['rakuten'] },
    targetIntake: 60,
  });
  assert.equal(row, null);
});

test('buildRow が導出値を揃える', () => {
  const row = buildRow({
    product,
    content,
    nutrient: proteinNutrient,
    snapshots: [
      { merchant: 'rakuten', price: 7200, currency: 'JPY', in_stock: true, url: 'https://example.test' },
    ],
    market: { merchants: ['rakuten', 'iherb'] },
    targetIntake: 60,
  });
  assert.equal(row.costPerNutrientUnit, 3);
  assert.equal(row.costPerServing, 72);
  assert.equal(row.costPerTargetIntake, 180);
  assert.equal(row.contentRatioPercent, 80);
  assert.equal(row.netWeightG, 3000);
});

// 🔒 送料の金額は取れない。取れているのは「込み / 別」の2値だけなので、
//    単価に足し込むと根拠のない数字になる。表示のためだけに運ぶ。
test('🔒 送料は表示用に運ぶだけで、単価にも並び順にも混ぜない', () => {
  const snapshot = (over) => ({
    merchant: 'rakuten',
    price: 7200,
    currency: 'JPY',
    in_stock: true,
    url: 'https://example.test',
    ...over,
  });
  const build = (over) =>
    buildRow({
      product,
      content,
      nutrient: proteinNutrient,
      snapshots: [snapshot(over)],
      market: { merchants: ['rakuten'] },
      targetIntake: 60,
    });

  assert.equal(build({ postage_included: false }).postageIncluded, false);
  assert.equal(build({ postage_included: true }).postageIncluded, true);
  // 記載が無ければ null。送料無料と決めつけない
  assert.equal(build({}).postageIncluded, null);
  // 送料の有無で単価は動かない
  assert.equal(build({ postage_included: false }).costPerNutrientUnit, 3);
  assert.equal(build({ postage_included: true }).costPerNutrientUnit, 3);
});

test('プレミアム幅は最安どうしの差', () => {
  const all = [{ costPerNutrientUnit: 3 }, { costPerNutrientUnit: 5 }, { costPerNutrientUnit: 4 }];
  const filtered = [{ costPerNutrientUnit: 4 }, { costPerNutrientUnit: 5 }];
  assert.equal(premiumGap(all, filtered), 1);
  assert.equal(premiumGap(all, []), null);
});

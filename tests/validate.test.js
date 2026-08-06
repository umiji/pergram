import test from 'node:test';
import assert from 'node:assert/strict';

import { hasBlockingIssue, validateDataset } from '../src/lib/validate.js';

const nutrients = [
  { id: 'protein', canonical_unit: 'g', category: 'protein', has_reference_value: true },
  { id: 'zinc', canonical_unit: 'mg', category: 'mineral', has_reference_value: true },
];

const okProduct = { id: 'p1', brand: 'A', serving_size_g: 30, servings_per_unit: 100 };
const okContent = { product_id: 'p1', nutrient_id: 'protein', amount_elemental: 24 };

const codesOf = (issues) => issues.map((i) => i.code);

test('正常なデータでは指摘が出ない', () => {
  const issues = validateDataset({
    products: [okProduct],
    nutrientContents: [okContent],
    nutrients,
  });
  assert.deepEqual(issues, []);
  assert.equal(hasBlockingIssue(issues), false);
});

test('V-01 有効成分量が1食量を超えたら error', () => {
  const issues = validateDataset({
    products: [{ id: 'p1', serving_size_g: 30, servings_per_unit: 100 }],
    nutrientContents: [{ product_id: 'p1', nutrient_id: 'protein', amount_elemental: 45 }],
    nutrients,
  });
  assert.ok(codesOf(issues).includes('V-01'));
  assert.equal(hasBlockingIssue(issues), true);
});

test('V-02 含有率がレンジ外なら review', () => {
  const issues = validateDataset({
    products: [{ id: 'p1', serving_size_g: 100, servings_per_unit: 10 }],
    nutrientContents: [{ product_id: 'p1', nutrient_id: 'protein', amount_elemental: 5 }],
    nutrients,
  });
  const v2 = issues.find((i) => i.code === 'V-02');
  assert.ok(v2);
  assert.equal(v2.severity, 'review');
});

test('V-03 耐容上限量を大きく超えたら review', () => {
  const issues = validateDataset({
    products: [{ id: 'z1', serving_size_g: 1, servings_per_unit: 60 }],
    nutrientContents: [{ product_id: 'z1', nutrient_id: 'zinc', amount_elemental: 500 }],
    nutrients,
    referenceValues: [{ nutrient_id: 'zinc', region: 'JP', ul: 40 }],
  });
  assert.ok(codesOf(issues).includes('V-03'));
});

test('V-04 桁の取り違えを検出する', () => {
  // 1食30g に対して 24000（mg を g として入力した想定）
  const issues = validateDataset({
    products: [{ id: 'p1', serving_size_g: 30, servings_per_unit: 100 }],
    nutrientContents: [{ product_id: 'p1', nutrient_id: 'protein', amount_elemental: 24000 }],
    nutrients,
  });
  assert.ok(codesOf(issues).includes('V-04'));
  assert.equal(hasBlockingIssue(issues), true);
});

test('V-04 内容量が想定レンジ外なら review', () => {
  const issues = validateDataset({
    products: [{ id: 'p1', serving_size_g: 30, servings_per_unit: 2000 }],
    nutrientContents: [okContent],
    nutrients,
  });
  assert.ok(codesOf(issues).includes('V-04'));
});

test('V-05 ブランド内で含有率が大きく外れる製品を洗い出す', () => {
  const products = [
    { id: 'a1', brand: 'A', serving_size_g: 100, servings_per_unit: 10 },
    { id: 'a2', brand: 'A', serving_size_g: 100, servings_per_unit: 10 },
    { id: 'a3', brand: 'A', serving_size_g: 100, servings_per_unit: 10 },
    { id: 'a4', brand: 'A', serving_size_g: 100, servings_per_unit: 10 },
  ];
  const contents = [
    { product_id: 'a1', nutrient_id: 'protein', amount_elemental: 80 },
    { product_id: 'a2', nutrient_id: 'protein', amount_elemental: 78 },
    { product_id: 'a3', nutrient_id: 'protein', amount_elemental: 81 },
    { product_id: 'a4', nutrient_id: 'protein', amount_elemental: 20 },
  ];
  const issues = validateDataset({ products, nutrientContents: contents, nutrients });
  const v5 = issues.filter((i) => i.code === 'V-05');
  assert.equal(v5.length, 1);
  assert.equal(v5[0].productId, 'a4');
});

test('V-06 価格が大きく動いたら review', () => {
  const issues = validateDataset({
    products: [okProduct],
    nutrientContents: [okContent],
    nutrients,
    priceSnapshots: [{ product_id: 'p1', merchant: 'rakuten', price: 2000 }],
    previousPriceSnapshots: [{ product_id: 'p1', merchant: 'rakuten', price: 7200 }],
  });
  assert.ok(codesOf(issues).includes('V-06'));
});

test('通常の値動きは指摘しない', () => {
  const issues = validateDataset({
    products: [okProduct],
    nutrientContents: [okContent],
    nutrients,
    priceSnapshots: [{ product_id: 'p1', merchant: 'rakuten', price: 6800 }],
    previousPriceSnapshots: [{ product_id: 'p1', merchant: 'rakuten', price: 7200 }],
  });
  assert.deepEqual(issues, []);
});

test('存在しない製品・成分への参照は error', () => {
  const issues = validateDataset({
    products: [],
    nutrientContents: [{ product_id: 'ghost', nutrient_id: 'protein', amount_elemental: 24 }],
    nutrients,
  });
  assert.ok(codesOf(issues).includes('V-00'));
  assert.equal(hasBlockingIssue(issues), true);
});

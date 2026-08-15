import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyProteinType,
  normalizeProtein,
  parseNetWeightFromName,
  toPer100g,
} from '../src/lib/normalize_protein.js';
import { contentPer100g, costPerNutrientUnit } from '../src/lib/cost.js';

test('3通りの表記が同じ中間形式に落ちる', () => {
  const fromServing = toPer100g({ proteinPerServingG: 24, servingSizeG: 30 });
  const fromPer100g = toPer100g({ proteinPer100g: 80 });
  const fromRatio = toPer100g({ contentRatioPercent: 80 });
  assert.equal(fromServing, 80);
  assert.equal(fromPer100g, 80);
  assert.equal(fromRatio, 80);
});

test('読み取れなければ null。推定しない', () => {
  assert.equal(toPer100g({}), null);
  assert.equal(toPer100g({ proteinPerServingG: 24 }), null);
});

test('1食表記から正規形を作る', () => {
  const r = normalizeProtein({
    netWeightG: 3000,
    servingSizeG: 30,
    proteinPerServingG: 24,
  });
  assert.equal(r.ok, true);
  assert.equal(r.serving_size_g, 30);
  assert.equal(r.servings_per_unit, 100);
  assert.equal(r.amount_elemental, 24);
  assert.equal(r.per100g, 80);
});

test('1食量がないラベルは 100g を1食とする正規形に倒れる', () => {
  const r = normalizeProtein({ netWeightG: 1000, proteinPer100g: 71 });
  assert.equal(r.ok, true);
  assert.equal(r.serving_size_g, 100);
  assert.equal(r.servings_per_unit, 10);
  assert.equal(r.amount_elemental, 71);
});

test('1食量の有無で単価が変わらない', () => {
  // 同じ製品（1kg・含有率71%・¥3,000）を、1食30g 表記と 100g 表記で取り込む
  const withServing = normalizeProtein({
    netWeightG: 1000,
    servingSizeG: 30,
    proteinPerServingG: 21.3,
  });
  const withoutServing = normalizeProtein({ netWeightG: 1000, proteinPer100g: 71 });

  const a = costPerNutrientUnit(3000, withServing, { amount_elemental: withServing.amount_elemental });
  const b = costPerNutrientUnit(3000, withoutServing, {
    amount_elemental: withoutServing.amount_elemental,
  });
  assert.ok(Math.abs(a - b) < 1e-9);
});

test('正規形は cost.js の導出と整合する', () => {
  const r = normalizeProtein({ netWeightG: 3000, servingSizeG: 30, proteinPerServingG: 24 });
  assert.equal(contentPer100g(r, { amount_elemental: r.amount_elemental }), 80);
});

test('含有率がレンジ外なら取り込まない', () => {
  const r = normalizeProtein({ netWeightG: 1000, proteinPer100g: 120 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'protein_ratio_out_of_range');
});

test('内容量が読めなければ取り込まない', () => {
  const r = normalizeProtein({ proteinPer100g: 80 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'net_weight_unreadable');
});

test('商品名から内容量を取り出す', () => {
  assert.equal(parseNetWeightFromName('ホエイプロテイン 3kg プレーン').valueG, 3000);
  assert.equal(parseNetWeightFromName('WPC 1000g チョコ').valueG, 1000);
  assert.equal(parseNetWeightFromName('プロテイン 1,000g').valueG, 1000);
  assert.equal(parseNetWeightFromName('プロテイン　３ｋｇ').valueG, 3000);
  assert.equal(parseNetWeightFromName('ホエイ 1.5kg').valueG, 1500);
});

test('掛け算表記を内容量に反映する', () => {
  assert.equal(parseNetWeightFromName('プロテイン 1kg×3袋').valueG, 3000);
  assert.equal(parseNetWeightFromName('プロテイン 500g 2個セット').valueG, 1000);
});

test('異なる重量が複数あるときは曖昧として人間に回す', () => {
  const r = parseNetWeightFromName('プロテイン 3kg + シェイカー 500g 付き');
  assert.equal(r.valueG, null);
  assert.equal(r.ambiguous, true);
});

test('内容量が書かれていなければ null', () => {
  const r = parseNetWeightFromName('ホエイプロテイン プレーン');
  assert.equal(r.valueG, null);
  assert.equal(r.ambiguous, false);
});

test('単位でない g を拾わない', () => {
  assert.equal(parseNetWeightFromName('100 grams of gold').valueG, null);
});

/* ---- product_type 判定 ------------------------------------------------- */

test('商品名からホエイ・ソイを判定する', () => {
  assert.equal(classifyProteinType('ザバス ホエイプロテイン100 リッチショコラ 980g'), 'whey_wpc');
  assert.equal(classifyProteinType('WPI ホエイプロテインアイソレート 1kg'), 'whey_wpi');
  assert.equal(classifyProteinType('無添加 ソイプロテイン きなこ味 1kg'), 'soy');
  assert.equal(classifyProteinType('大豆プロテイン 900g'), 'soy');
});

test('ホエイ・ソイどちらとも読めなければ null（カゼイン等は未対応）', () => {
  assert.equal(classifyProteinType('カゼインプロテイン 1kg'), null);
  assert.equal(classifyProteinType('プロテイン 1kg'), null);
  assert.equal(classifyProteinType(null), null);
});

test('🔒 ソイとホエイが両方読めるブレンド品は判定不能として null', () => {
  assert.equal(classifyProteinType('ホエイ&ソイ ミックスプロテイン 1kg'), null);
});

/**
 * テスト専用のサンプルデータ。
 *
 * 🔒 これは data/ に入れてはならない。LP のヒーローに出してよいのは実データだけ。
 *    ここにあるのはテンプレートの描画を検証するためだけのもの。
 */

import { buildRow, sortByUnitCost } from '../src/lib/cost.js';

export const nutrient = {
  id: 'protein',
  canonical_unit: 'g',
  category: 'protein',
  has_reference_value: true,
};

export const market = {
  merchants: ['rakuten', 'amazon_jp', 'iherb'],
  referenceRegion: 'JP',
  disclosureKey: 'disclosure.jp',
  currency: 'JPY',
  claimSource: 'nutrient_function_food',
};

const specs = [
  { id: 'p1', brand: 'ブランドA', ratio: 78, weight: 3000, price: 7800, attrs: ['third_party_cert'] },
  { id: 'p2', brand: 'ブランドB', ratio: 71, weight: 3000, price: 7400, attrs: [] },
  { id: 'p3', brand: 'ブランドC', ratio: 82, weight: 1000, price: 3600, attrs: ['third_party_cert'] },
  { id: 'p4', brand: 'ブランドD', ratio: 75, weight: 1000, price: 3900, attrs: [] },
  { id: 'p5', brand: 'ブランドE', ratio: 90, weight: 1000, price: 5200, attrs: ['organic_cert'] },
  { id: 'p6', brand: 'ブランドF', ratio: 68, weight: 5000, price: 11800, attrs: [] },
];

export function makeRows({ targetIntake = 60 } = {}) {
  const rows = [];
  for (const spec of specs) {
    const product = {
      id: spec.id,
      brand: spec.brand,
      form: 'powder',
      serving_size_g: 30,
      servings_per_unit: spec.weight / 30,
      flavor: 'プレーン',
      confidence: 'high',
      source_url: `https://example.test/${spec.id}`,
      verified_at: '2026-08-06',
    };
    const content = {
      product_id: spec.id,
      nutrient_id: 'protein',
      amount_elemental: (30 * spec.ratio) / 100,
    };
    const snapshots = [
      {
        product_id: spec.id,
        merchant: 'rakuten',
        price: spec.price,
        currency: 'JPY',
        url: `https://example.test/${spec.id}?m=rakuten`,
        in_stock: true,
        fetched_at: '2026-08-06',
      },
    ];

    const row = buildRow({ product, content, nutrient, snapshots, market, targetIntake });
    row.name = `${spec.brand} ホエイプロテイン`;
    row.attributeKeys = spec.attrs;
    row.snapshotsByMerchant = new Map(snapshots.map((s) => [s.merchant, s]));
    rows.push(row);
  }
  return sortByUnitCost(rows);
}

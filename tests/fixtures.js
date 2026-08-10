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

/**
 * `others` は楽天以外の販売元。同一製品が複数の EC に出ているケースを再現する。
 * 主指標も表示順も最安のスナップショットで決まるので、必ず楽天より高い値にしてある。
 *
 * `postage` は送料が価格に含まれるか。true = 送料込み / false = 送料別 /
 * 未指定 = 判別できなかった（画面には何も出さない）。3通りすべてを含めてある。
 */
const specs = [
  {
    id: 'p1',
    brand: 'ブランドA',
    ratio: 78,
    weight: 3000,
    price: 7800,
    attrs: ['third_party_cert', 'whey_wpc'],
    postage: true,
    image: 'https://thumbnail.image.rakuten.co.jp/@0_mall/example/p1.jpg',
    others: [{ merchant: 'amazon_jp', price: 8200 }, { merchant: 'iherb', price: 8600 }],
  },
  {
    id: 'p2',
    brand: 'ブランドB',
    ratio: 71,
    weight: 3000,
    price: 7400,
    attrs: ['whey_wpc'],
    postage: false,
    others: [{ merchant: 'amazon_jp', price: 7900 }],
  },
  {
    id: 'p3',
    brand: 'ブランドC',
    ratio: 82,
    weight: 1000,
    price: 3600,
    attrs: ['third_party_cert', 'whey_wpi'],
    postage: true,
    others: [{ merchant: 'amazon_jp', price: 3850 }, { merchant: 'iherb', price: 4100 }],
  },
  { id: 'p4', brand: 'ブランドD', ratio: 75, weight: 1000, price: 3900, attrs: ['soy'], others: [] },
  {
    id: 'p5',
    brand: 'ブランドE',
    ratio: 90,
    weight: 1000,
    price: 5200,
    attrs: ['organic_cert', 'whey_wpi', 'grass_fed'],
    postage: false,
    others: [{ merchant: 'iherb', price: 5600 }],
  },
  { id: 'p6', brand: 'ブランドF', ratio: 68, weight: 5000, price: 11800, attrs: ['casein'], others: [] },
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
      // 画像は任意。無い製品は代替表現に落ちる（design.md §6）
      image_url: spec.image ?? null,
      confidence: 'high',
      source_url: `https://example.test/${spec.id}`,
      verified_at: '2026-08-06',
    };
    const content = {
      product_id: spec.id,
      nutrient_id: 'protein',
      amount_elemental: (30 * spec.ratio) / 100,
    };
    const snapshot = (merchant, price, postageIncluded = null) => ({
      product_id: spec.id,
      merchant,
      price,
      currency: 'JPY',
      url: `https://example.test/${spec.id}?m=${merchant}`,
      in_stock: true,
      fetched_at: '2026-08-06',
      postage_included: postageIncluded,
    });

    const snapshots = [
      snapshot('rakuten', spec.price, spec.postage ?? null),
      ...(spec.others ?? []).map((o) => snapshot(o.merchant, o.price)),
    ];

    const row = buildRow({ product, content, nutrient, snapshots, market, targetIntake });
    row.name = `${spec.brand} ホエイプロテイン`;
    row.attributeKeys = spec.attrs;
    row.snapshotsByMerchant = new Map(snapshots.map((s) => [s.merchant, s]));
    rows.push(row);
  }
  return sortByUnitCost(rows);
}

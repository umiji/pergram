/**
 * 抽出値のバリデーション。requirements.md §7.3
 *
 * 異常値は捨てず、人間レビューキューへ回す。
 * severity: 'error'  … 公開してはならない
 *           'review' … 公開前に人間が確認する
 */

import { contentPer100g, netWeightG } from './cost.js';

/** 成分ごとの妥当な 100gあたり含有量レンジ。単位は canonical_unit / 100g。 */
export const CONTENT_RANGE = {
  protein: { min: 15, max: 100 },
  creatine: { min: 50, max: 100 },
  _default: { min: 0, max: Number.POSITIVE_INFINITY },
};

/** 前回価格からの変化がこの倍率を超えたらレビュー */
export const PRICE_DELTA_THRESHOLD = 0.5;

const issue = (code, severity, productId, message, detail) => ({
  code,
  severity,
  productId,
  message,
  ...(detail === undefined ? {} : { detail }),
});

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * V-01 単位変換の整合性
 * 有効成分量が1食量を超えることはありえない（単位が g の成分のみ判定可能）。
 */
function checkUnitConsistency(product, content, nutrient) {
  if (nutrient?.canonical_unit !== 'g') return [];
  if (!(content.amount_elemental > 0) || !(product.serving_size_g > 0)) return [];
  if (content.amount_elemental > product.serving_size_g) {
    return [
      issue(
        'V-01',
        'error',
        product.id,
        '有効成分量が1食量を超えています。単位の取り違えの可能性があります。',
        { amount_elemental: content.amount_elemental, serving_size_g: product.serving_size_g },
      ),
    ];
  }
  return [];
}

/** V-02 元素量換算後の値が妥当レンジか */
function checkRange(product, content, nutrient) {
  const per100g = contentPer100g(product, content);
  if (per100g === null) {
    return [issue('V-02', 'error', product.id, '100gあたり含有量が導出できません。')];
  }
  const range = CONTENT_RANGE[nutrient.id] ?? CONTENT_RANGE._default;
  if (per100g < range.min || per100g > range.max) {
    return [
      issue('V-02', 'review', product.id, '100gあたり含有量が想定レンジ外です。', {
        per100g,
        range,
      }),
    ];
  }
  return [];
}

/** V-03 UL との照合。大幅超過は抽出ミスを疑う */
function checkUpperLimit(product, content, nutrient, referenceValues) {
  const ref = referenceValues.find(
    (r) => r.nutrient_id === nutrient.id && r.region === 'JP' && r.ul > 0,
  );
  if (!ref) return [];
  if (content.amount_elemental > ref.ul * 10) {
    return [
      issue('V-03', 'review', product.id, '1食あたり含有量が耐容上限量を大きく超えています。', {
        amount_elemental: content.amount_elemental,
        ul: ref.ul,
      }),
    ];
  }
  return [];
}

/** V-04 桁数チェック（1000倍 / 1000分の1 の取り違え） */
function checkMagnitude(product, content, nutrient) {
  const per100g = contentPer100g(product, content);
  if (per100g === null) return [];
  if (nutrient.canonical_unit === 'g' && per100g > 100) {
    return [
      issue('V-04', 'error', product.id, '100gあたり含有量が100gを超えています。桁の取り違えの可能性があります。', {
        per100g,
      }),
    ];
  }
  const weight = netWeightG(product);
  if (weight !== null && (weight < 50 || weight > 30000)) {
    return [
      issue('V-04', 'review', product.id, '内容量が想定レンジ外です。', { netWeightG: weight }),
    ];
  }
  return [];
}

/** V-05 同一ブランド内の一貫性。中央値から大きく外れる製品を洗い出す */
function checkBrandConsistency(rowsByBrand) {
  const issues = [];
  for (const [brand, rows] of rowsByBrand) {
    if (rows.length < 3) continue;
    const med = median(rows.map((r) => r.per100g));
    if (!(med > 0)) continue;
    for (const r of rows) {
      const ratio = r.per100g / med;
      if (ratio > 2 || ratio < 0.5) {
        issues.push(
          issue('V-05', 'review', r.productId, 'ブランド内の他製品と含有率が大きく異なります。', {
            brand,
            per100g: r.per100g,
            brandMedian: med,
          }),
        );
      }
    }
  }
  return issues;
}

/** V-06 前回スナップショットとの差分が閾値超ならレビュー */
function checkPriceDelta(current, previous) {
  const issues = [];
  const prevByKey = new Map(
    (previous ?? []).map((s) => [`${s.product_id}:${s.merchant}`, s]),
  );
  for (const s of current ?? []) {
    const prev = prevByKey.get(`${s.product_id}:${s.merchant}`);
    if (!prev || !(prev.price > 0) || !(s.price > 0)) continue;
    const delta = Math.abs(s.price - prev.price) / prev.price;
    if (delta > PRICE_DELTA_THRESHOLD) {
      issues.push(
        issue('V-06', 'review', s.product_id, '前回取得時から価格が大きく変化しています。', {
          merchant: s.merchant,
          previous: prev.price,
          current: s.price,
          delta,
        }),
      );
    }
  }
  return issues;
}

/**
 * データセット全体を検査する。
 * @returns {Array} issues
 */
export function validateDataset({
  products = [],
  nutrientContents = [],
  nutrients = [],
  priceSnapshots = [],
  previousPriceSnapshots = [],
  referenceValues = [],
}) {
  const issues = [];
  const productById = new Map(products.map((p) => [p.id, p]));
  const nutrientById = new Map(nutrients.map((n) => [n.id, n]));
  const rowsByBrand = new Map();

  for (const content of nutrientContents) {
    const product = productById.get(content.product_id);
    if (!product) {
      issues.push(
        issue('V-00', 'error', content.product_id, '存在しない製品を参照しています。'),
      );
      continue;
    }
    const nutrient = nutrientById.get(content.nutrient_id);
    if (!nutrient) {
      issues.push(issue('V-00', 'error', product.id, '存在しない成分を参照しています。'));
      continue;
    }

    issues.push(...checkUnitConsistency(product, content, nutrient));
    issues.push(...checkRange(product, content, nutrient));
    issues.push(...checkUpperLimit(product, content, nutrient, referenceValues));
    issues.push(...checkMagnitude(product, content, nutrient));

    const per100g = contentPer100g(product, content);
    if (per100g !== null && product.brand) {
      const key = `${nutrient.id}::${product.brand}`;
      if (!rowsByBrand.has(key)) rowsByBrand.set(key, []);
      rowsByBrand.get(key).push({ productId: product.id, per100g });
    }
  }

  issues.push(...checkBrandConsistency(rowsByBrand));
  issues.push(...checkPriceDelta(priceSnapshots, previousPriceSnapshots));

  return issues;
}

/** 公開してよいか。error が1件でもあれば false */
export function hasBlockingIssue(issues) {
  return issues.some((i) => i.severity === 'error');
}

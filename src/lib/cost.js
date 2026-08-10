/**
 * 導出値の計算。requirements.md §4.2
 *
 * 🔒 このファイルが導出計算の唯一の置き場。
 *    含有率・100gあたり含有量・1食あたり価格・単価を DB に保存してはならない。
 *    保存する独立変数は serving_size_g / servings_per_unit / amount_elemental の3つだけ。
 *
 * 🔒 per serving をソートキーにしない。
 *    serving はメーカーが任意に定義した単位であり、製品を横断して比較できない。
 *    並び順を決めるのは常に costPerNutrientUnit。
 *
 * 値が求まらない場合は必ず null を返す。0 や推定値で埋めない。
 */

/** 正の有限数か */
const isPositive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** 割り算。分母が正でなければ null */
function divide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !isPositive(denominator)) return null;
  return numerator / denominator;
}

/**
 * 内容量(g)。ラベルに書かれていても保存しない導出値。
 * net_weight_g = serving_size_g × servings_per_unit
 */
export function netWeightG(product) {
  if (!isPositive(product?.serving_size_g)) return null;
  if (!isPositive(product?.servings_per_unit)) return null;
  return product.serving_size_g * product.servings_per_unit;
}

/**
 * 1容器あたりの有効成分総量。単位は nutrient.canonical_unit。
 * total = amount_elemental × servings_per_unit
 */
export function totalNutrientAmount(product, content) {
  if (!isPositive(content?.amount_elemental)) return null;
  if (!isPositive(product?.servings_per_unit)) return null;
  return content.amount_elemental * product.servings_per_unit;
}

/**
 * 🔒 主指標。有効成分1単位あたりの価格。
 * cost = price / (amount_elemental × servings_per_unit)
 */
export function costPerNutrientUnit(price, product, content) {
  return divide(price, totalNutrientAmount(product, content));
}

/**
 * 補助表示。1食あたりの価格。
 * ソートキーにしてはならない。
 */
export function costPerServing(price, product) {
  return divide(price, product?.servings_per_unit);
}

/**
 * 目標摂取量あたりの価格（1日あたり）。
 * targetIntake は nutrient.canonical_unit で与える。
 */
export function costPerTargetIntake(costPerUnit, targetIntake) {
  if (costPerUnit === null || !Number.isFinite(costPerUnit)) return null;
  if (!isPositive(targetIntake)) return null;
  return costPerUnit * targetIntake;
}

/**
 * 100g あたりの含有量。単位は nutrient.canonical_unit / 100g。
 * requirements.md §4.2 の「中間形式」と同じ量。
 */
export function contentPer100g(product, content) {
  if (!isPositive(content?.amount_elemental)) return null;
  if (!isPositive(product?.serving_size_g)) return null;
  return (content.amount_elemental / product.serving_size_g) * 100;
}

/**
 * 含有率 (%)。成分の単位が g のときのみ定義される。
 * mg / mcg 成分では含有率を出さない（null）。桁が意味を失うため。
 */
export function contentRatioPercent(product, content, nutrient) {
  if (nutrient?.canonical_unit !== 'g') return null;
  return contentPer100g(product, content);
}

/**
 * 耐容上限量に対する割合 (%)。UL がなければ null。
 */
export function ulPercentage(amountPerDay, referenceValue) {
  if (!Number.isFinite(amountPerDay)) return null;
  if (!isPositive(referenceValue?.ul)) return null;
  return (amountPerDay / referenceValue.ul) * 100;
}

/**
 * その市場で実際に買える最安のスナップショットを1つ選ぶ。
 * 🔒 merchant の対象は market 設定の配列で決まる。locale では決まらない。
 * 在庫ありを優先し、在庫ありが1件もなければ在庫なしから最安を返す（価格は出すが在庫状態を併記する）。
 */
export function pickBestPrice(snapshots, marketMerchants) {
  const allowed = new Set(marketMerchants ?? []);
  const candidates = (snapshots ?? []).filter(
    (s) => allowed.has(s.merchant) && isPositive(s.price),
  );
  if (candidates.length === 0) return null;

  const inStock = candidates.filter((s) => s.in_stock);
  const pool = inStock.length > 0 ? inStock : candidates;
  return pool.reduce((best, s) => (s.price < best.price ? s : best));
}

/**
 * 表示用の1行を組み立てる。指標はすべてここで導出する。
 * 価格が取れない製品は null を返し、呼び出し側で除外する。
 */
export function buildRow({ product, content, nutrient, snapshots, market, targetIntake }) {
  const best = pickBestPrice(snapshots, market?.merchants);
  if (best === null) return null;

  const costPerUnit = costPerNutrientUnit(best.price, product, content);
  if (costPerUnit === null) return null;

  return {
    product,
    content,
    nutrient,
    price: best.price,
    currency: best.currency,
    merchant: best.merchant,
    url: best.url,
    inStock: best.in_stock,
    fetchedAt: best.fetched_at,
    // 🔒 送料は「込み / 別」の2値しか取れない。金額が無いので単価には足さない。
    //    判別できないものは null のままにして、画面には何も出さない。
    postageIncluded: best.postage_included ?? null,

    // 導出値。保存しない。
    costPerNutrientUnit: costPerUnit,
    costPerServing: costPerServing(best.price, product),
    costPerTargetIntake: costPerTargetIntake(costPerUnit, targetIntake),
    contentPer100g: contentPer100g(product, content),
    contentRatioPercent: contentRatioPercent(product, content, nutrient),
    netWeightG: netWeightG(product),
    totalNutrientAmount: totalNutrientAmount(product, content),
  };
}

/**
 * 🔒 並び順は常に有効成分1単位あたりの価格の昇順。
 *    第2キーは決定性のための製品 ID のみ。品質・評価・報酬額を順位に混ぜない。
 */
export function sortByUnitCost(rows) {
  return [...rows].sort((a, b) => {
    if (a.costPerNutrientUnit !== b.costPerNutrientUnit) {
      return a.costPerNutrientUnit - b.costPerNutrientUnit;
    }
    return a.product.id < b.product.id ? -1 : a.product.id > b.product.id ? 1 : 0;
  });
}

/**
 * プレミアム幅。requirements.md §4.5
 * premium_gap = min(cost | フィルタあり) − min(cost | フィルタなし)
 * 事実の提示であり、優劣の判断ではない。
 */
export function premiumGap(allRows, filteredRows) {
  if (allRows.length === 0 || filteredRows.length === 0) return null;
  const baseline = Math.min(...allRows.map((r) => r.costPerNutrientUnit));
  const filtered = Math.min(...filteredRows.map((r) => r.costPerNutrientUnit));
  return filtered - baseline;
}

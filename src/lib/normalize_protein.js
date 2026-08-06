/**
 * プロテインのラベル表記ゆれを正規形に落とす。requirements.md §4.2
 *
 * 🔒 これが唯一のカテゴリ固有処理。DB の問題ではなくパイプラインの問題なので、
 *    カテゴリ固有テーブルを作らずここで吸収する。
 *
 * ラベルの書き方は3通り混在する:
 *   1. 「1食30gあたり タンパク質24g」
 *   2. 「100gあたり タンパク質80g」
 *   3. 「タンパク質含有率 71%」
 *
 * 中間形式は 100gあたりg（＝含有率と同値）。1食量に依存しないため。
 * 出力は保存してよい3変数のみ。
 */

/** プロテイン粉末として妥当な含有率レンジ (%)。外れたら人間レビューへ。 */
export const PROTEIN_RATIO_RANGE = { min: 15, max: 100 };

/** 全角英数字・記号を半角へ */
function toHalfWidth(s) {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．]/g, '.')
    .replace(/[，]/g, ',')
    .replace(/[　]/g, ' ');
}

/**
 * 商品名から内容量(g)を取り出す。
 *
 * 「3kg」「1,000g」「500g×2袋」などに対応する。
 * 複数の異なる重量が読み取れた場合は曖昧として null を返し、人間レビューへ回す。
 * 推測で1つを選ばない。
 */
export function parseNetWeightFromName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    return { valueG: null, ambiguous: false, matches: [] };
  }
  const text = toHalfWidth(name).replace(/,/g, '');

  // 数値 + 単位。直後が英字の場合は単位ではないので除外する（例: "gold"）
  const re = /(\d+(?:\.\d+)?)\s*(kg|g)(?![a-zA-Z])/gi;
  const matches = [];
  for (const m of text.matchAll(re)) {
    const value = Number.parseFloat(m[1]);
    const grams = m[2].toLowerCase() === 'kg' ? value * 1000 : value;
    // 明らかに内容量ではない桁を捨てる（1食あたりの表記や成分量を拾わないため）
    if (grams >= 100 && grams <= 50000) {
      matches.push({ raw: m[0], grams, index: m.index });
    }
  }
  if (matches.length === 0) return { valueG: null, ambiguous: false, matches: [] };

  // 「×2袋」「2個セット」などの掛け算を検出する
  let multiplier = 1;
  const mult =
    text.match(/[×xX*]\s*(\d+)\s*(?:袋|個|パック|セット|本)/) ??
    text.match(/(\d+)\s*(?:袋|個|パック|本)\s*セット/);
  if (mult) {
    const n = Number.parseInt(mult[1], 10);
    if (Number.isFinite(n) && n > 1 && n <= 24) multiplier = n;
  }

  const distinct = [...new Set(matches.map((m) => m.grams))];
  if (distinct.length > 1) {
    return { valueG: null, ambiguous: true, matches };
  }
  return { valueG: distinct[0] * multiplier, ambiguous: false, matches, multiplier };
}

/**
 * どの表記からでも 100gあたりg（中間形式）を求める。
 * 求まらなければ null。推定しない。
 */
export function toPer100g({ proteinPer100g, contentRatioPercent, proteinPerServingG, servingSizeG }) {
  if (Number.isFinite(proteinPer100g) && proteinPer100g > 0) return proteinPer100g;
  if (Number.isFinite(contentRatioPercent) && contentRatioPercent > 0) return contentRatioPercent;
  if (
    Number.isFinite(proteinPerServingG) &&
    proteinPerServingG > 0 &&
    Number.isFinite(servingSizeG) &&
    servingSizeG > 0
  ) {
    return (proteinPerServingG / servingSizeG) * 100;
  }
  return null;
}

/**
 * ラベルの読み取り結果を、保存してよい3変数に落とす。
 *
 * @returns {{ok: true, serving_size_g, servings_per_unit, amount_elemental, per100g}}
 *        | {ok: false, reason: string}
 */
export function normalizeProtein(input) {
  const {
    netWeightG,
    servingSizeG,
    servingsPerUnit,
    proteinPerServingG,
    proteinPer100g,
    contentRatioPercent,
  } = input ?? {};

  const per100g = toPer100g({
    proteinPer100g,
    contentRatioPercent,
    proteinPerServingG,
    servingSizeG,
  });
  if (per100g === null) {
    return { ok: false, reason: 'protein_content_unreadable' };
  }
  if (per100g < PROTEIN_RATIO_RANGE.min || per100g > PROTEIN_RATIO_RANGE.max) {
    return { ok: false, reason: 'protein_ratio_out_of_range', per100g };
  }

  // 1食量。ラベルにない場合は 100g を1食とみなす正規形に倒す。
  // こうしても単価は変わらない（amount_elemental × servings_per_unit が保存される）。
  const serving = Number.isFinite(servingSizeG) && servingSizeG > 0 ? servingSizeG : 100;

  let servings = servingsPerUnit;
  if (!(Number.isFinite(servings) && servings > 0)) {
    if (!(Number.isFinite(netWeightG) && netWeightG > 0)) {
      return { ok: false, reason: 'net_weight_unreadable' };
    }
    servings = netWeightG / serving;
  }

  const amountElemental = (serving * per100g) / 100;

  return {
    ok: true,
    serving_size_g: serving,
    servings_per_unit: servings,
    amount_elemental: amountElemental,
    per100g,
  };
}

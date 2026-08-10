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

/** 1食量として妥当なレンジ (g)。付属スプーン1〜3杯を想定する。 */
export const SERVING_SIZE_RANGE = { min: 5, max: 120 };

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

/* ------------------------------------------------------------------ *
 * 商品説明文（楽天 itemCaption）からの栄養成分表示の読み取り
 *
 * 含有量を返す EC API は存在しないため、説明文に貼られたラベルの
 * 転記から拾う。**拾えないものは推測で埋めず null を返す。**
 * 誤った値を1件通すと単価が狂い、順位が狂い、比較そのものが嘘になる。
 * ------------------------------------------------------------------ */

const PROTEIN_TOKEN = '(?:たんぱく質|タンパク質|蛋白質|たん白質|蛋白)';

/** 基準表記から数値までの許容距離（文字）。離れすぎた数値は別の項目とみなす */
const BASIS_WINDOW = 160;

/** 複数の候補が読めたときに同じ値とみなす幅（100gあたりg） */
const CANDIDATE_TOLERANCE = 1;

/** 「100gあたり」「製品100g当たり」「1食(30g)あたり」がどこに書かれているかを拾う */
function findBases(text) {
  const bases = [];
  for (const m of text.matchAll(/(?:製品|標準|粉末)?\s*100\s*g\s*(?:当たり|あたり|中)/g)) {
    bases.push({ type: 'per100g', index: m.index });
  }
  for (const m of text.matchAll(/[(（]?\s*(\d{1,4}(?:\.\d+)?)\s*g\s*[)）]?\s*(?:当たり|あたり)/g)) {
    const grams = Number(m[1]);
    if (grams === 100) continue; // 上で拾っている
    if (grams < SERVING_SIZE_RANGE.min || grams > SERVING_SIZE_RANGE.max) continue;
    bases.push({ type: 'serving', grams, index: m.index });
  }
  return bases.sort((a, b) => a.index - b.index);
}

/** 直前にある基準表記。無ければ null（基準の書かれていない数値は採らない） */
function basisFor(bases, index) {
  let found = null;
  for (const base of bases) {
    if (base.index < index && index - base.index <= BASIS_WINDOW) found = base;
  }
  return found;
}

/**
 * g の直後に続く「あたり」「当たり」「中」は、その数値が**基準**であって値ではない印。
 *
 * 🔒 「アミノ酸組成(タンパク質100gあたり)」「たん白質100g中(g)」の 100 を含有量として
 *    読むと、含有率100%の製品として単価が下振れし、最安として先頭に並ぶ。
 *    プロテイン粉末に含有率100%は存在しない。
 */
const NOT_A_BASIS = '(?!\\s*[)）]?\\s*(?:中|あたり|当たり))';

/**
 * 「たんぱく質 24.2g」。脂質・炭水化物・エネルギーは成分名で弾かれる。
 *
 * 🔒 「たんぱく質 24.0g/80.0g」のように1つの成分に値が2つ並ぶのは、
 *    「1食あたり／100gあたり」の2列表を1行に潰した書き方。直前の基準表記だけでは
 *    どちらの値がどちらの基準か決められない。`multiValued` を立てて読み取りを捨てる。
 *    ただし「24.0g(30g中)」のような基準の注記は2つ目の値ではないので除く。
 */
function findProteinGrams(text) {
  const secondValue = `\\s*[/／(（、･・]\\s*\\d+(?:\\.\\d+)?\\s*g${NOT_A_BASIS}`;
  const re = new RegExp(
    `${PROTEIN_TOKEN}\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)\\s*g${NOT_A_BASIS}(${secondValue})?`,
    'g',
  );
  return [...text.matchAll(re)].map((m) => ({
    grams: Number(m[1]),
    index: m.index,
    multiValued: m[2] !== undefined,
  }));
}

/**
 * 「たんぱく質含有率 71%」。含有率は 100gあたりg と同値。
 *
 * 🔒 「たんぱく質 20%OFF」の 20 を含有率として読むと、含有率20%の製品として
 *    単価が4倍に狂う。割引の文脈が続くものは採らない。
 *
 * 🔒 100% も採らない。「ホエイたんぱく質100%」は原材料がホエイであることの表示であって
 *    含有率ではない。粉末は水分・灰分・脂質・糖質を必ず含むため含有率100%は存在せず、
 *    読んでしまうと単価が実際の 1/1.3 前後に下振れして順位が狂う。
 *
 * 🔒 「81.9%（製品無水あたり）」のような無水換算・乾物換算も採らない。水分を除いた
 *    換算値であって、袋に入っている製品そのままの含有率（この例では 77.9%）ではない。
 *    5%ほど過大評価することになり、単価が実際より安く出る。
 */
function findRatios(text) {
  const anhydrous = '(\\s*[（(]?\\s*(?:製品)?\\s*(?:無水|乾物|乾燥))?';
  const re = new RegExp(
    `${PROTEIN_TOKEN}\\s*(?:含有[量率]|含量|含有)?\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)\\s*[%％]\\s*(OFF|off|Off|オフ|引き|引|割引)?${anhydrous}`,
    'g',
  );
  return [...text.matchAll(re)]
    .filter((m) => m[2] === undefined && m[3] === undefined)
    .map((m) => Number(m[1]))
    .filter((ratio) => ratio < PROTEIN_RATIO_RANGE.max);
}

/** 100gあたり表記 > 1食あたり表記 > 含有率表記 の順に信用する */
const BASIS_PRIORITY = { per100g: 0, serving: 1, ratio: 2 };

/**
 * 商品説明文から 100gあたりg・1食量・1食あたりgを読み取る。
 *
 * @returns {{per100g: number|null, servingSizeG: number|null,
 *            proteinPerServingG: number|null, basis: string|null, ambiguous: boolean}}
 */
export function extractProteinFromCaption(caption) {
  const empty = {
    per100g: null,
    servingSizeG: null,
    proteinPerServingG: null,
    basis: null,
    ambiguous: false,
  };
  if (typeof caption !== 'string' || caption.length === 0) return empty;

  const text = toHalfWidth(caption).replace(/,/g, '');
  const bases = findBases(text);
  const servingSizeG = bases.find((b) => b.type === 'serving')?.grams ?? null;

  const candidates = [];
  for (const protein of findProteinGrams(text)) {
    // 1つの成分に値が2つ並ぶ表記。どちらの基準の値か決められないので何も返さない。
    if (protein.multiValued) return { ...empty, ambiguous: true };
    const base = basisFor(bases, protein.index);
    if (base === null) continue;
    if (base.type === 'per100g') {
      candidates.push({ per100g: protein.grams, basis: 'per100g' });
    } else {
      candidates.push({
        per100g: (protein.grams / base.grams) * 100,
        basis: 'serving',
        servingSizeG: base.grams,
        proteinPerServingG: protein.grams,
      });
    }
  }
  for (const ratio of findRatios(text)) {
    candidates.push({ per100g: ratio, basis: 'ratio' });
  }

  if (candidates.length === 0) return { ...empty, servingSizeG };

  // 食い違う値が読めたのは、複数製品のセット品か転記ミス。どちらも人間が見るべきもの。
  const values = candidates.map((c) => c.per100g);
  if (Math.max(...values) - Math.min(...values) > CANDIDATE_TOLERANCE) {
    return { ...empty, ambiguous: true };
  }

  const chosen = [...candidates].sort(
    (a, b) => BASIS_PRIORITY[a.basis] - BASIS_PRIORITY[b.basis],
  )[0];

  if (chosen.per100g < PROTEIN_RATIO_RANGE.min || chosen.per100g > PROTEIN_RATIO_RANGE.max) {
    return { ...empty, servingSizeG };
  }

  return {
    per100g: chosen.per100g,
    servingSizeG: chosen.servingSizeG ?? servingSizeG,
    proteinPerServingG: chosen.proteinPerServingG ?? null,
    basis: chosen.basis,
    ambiguous: false,
  };
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

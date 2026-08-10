/**
 * 掲載中の製品の「見せ方」だけを1ファイルにまとめて上書きする。
 *
 * 直したいのはブランドと商品名だけなのに、その2つは products.json と
 * product_i18n.json に分かれており、しかも `npm run ingest` のたびに生成し直される。
 * 手直しを別ファイルに逃がすことで、取り込みをやり直しても消えないようにする。
 *
 * 🔒 上書きしてよいのは DISPLAY_FIELDS の表示用の文言だけ。
 *    価格・含有量・内容量・1食量はここから触れない。触れると
 *    「並び順を決めるのは常に有効成分1単位あたりの価格」という原則を手で捻じ曲げられる。
 */

/** 🔒 上書きしてよい項目。増やすときは単価と並び順に影響しないか確かめる */
export const DISPLAY_FIELDS = ['brand', 'name_ja', 'name_en'];

const LOCALE_FIELD = { ja: 'name_ja', en: 'name_en' };

/**
 * @param {{products: object[], productI18n: object[]}} data
 * @param {Array<{product_id: string, brand?: string, name_ja?: string, name_en?: string}>} overrides
 */
export function applyDisplayOverrides(data, overrides) {
  const list = Array.isArray(overrides) ? overrides : [];
  if (list.length === 0) return data;

  const byId = new Map();
  for (const entry of list) {
    if (typeof entry?.product_id !== 'string') continue;
    // 🔒 ホワイトリスト外は捨てる。スプレッドで丸ごと混ぜない。
    const picked = {};
    for (const field of DISPLAY_FIELDS) {
      if (entry[field] !== undefined && entry[field] !== null && entry[field] !== '') {
        picked[field] = entry[field];
      }
    }
    byId.set(entry.product_id, picked);
  }

  const products = data.products.map((product) => {
    const over = byId.get(product.id);
    return over?.brand === undefined ? product : { ...product, brand: over.brand };
  });

  const productI18n = data.productI18n.map((row) => {
    const name = byId.get(row.product_id)?.[LOCALE_FIELD[row.locale]];
    return name === undefined ? row : { ...row, name };
  });

  return { ...data, products, productI18n };
}

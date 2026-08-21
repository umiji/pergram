/**
 * X 運用スクリプトが使う実データの読み込み。
 *
 * 🔒 導出計算はここに書かない。単価も含有率も src/lib/cost.js の buildRow が出す。
 *    ここがやるのは data/ を読んで並べることだけ。
 *
 * 🔒 実データが無ければ空配列を返す。呼び出し側は件数を確かめてから使うこと。
 *    ダミーの順位を SNS に流さない（design.md §7 禁止⑧）。
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { buildRow, sortByUnitCost } from '../src/lib/cost.js';

const DATA = 'data';
const CONFIG = 'config';
const readJson = async (dir, name) => JSON.parse(await readFile(path.join(dir, name), 'utf8'));

/**
 * タンパク質の行を単価の昇順で返す。
 * @param {{marketId?: string}} [options]
 */
export async function loadProteinRows({ marketId = 'JP' } = {}) {
  const markets = await readJson(CONFIG, 'markets.json');
  const market = markets[marketId];

  const products = await readJson(DATA, 'products.json');
  const contents = await readJson(DATA, 'nutrient_contents.json');
  const snapshots = await readJson(DATA, 'price_snapshots.json');
  const i18n = await readJson(DATA, 'product_i18n.json');
  const nutrient = (await readJson(DATA, 'nutrients.json')).find((n) => n.id === 'protein');
  const nutrientName =
    (await readJson(DATA, 'nutrient_i18n.json')).find(
      (r) => r.nutrient_id === 'protein' && r.locale === 'ja',
    )?.name ?? 'protein';

  const names = new Map(i18n.filter((r) => r.locale === 'ja').map((r) => [r.product_id, r.name]));
  const byProduct = new Map(products.map((p) => [p.id, p]));

  const rows = sortByUnitCost(
    contents
      .filter((c) => c.nutrient_id === 'protein')
      .map((c) =>
        buildRow({
          product: byProduct.get(c.product_id),
          content: c,
          nutrient,
          snapshots: snapshots.filter((s) => s.product_id === c.product_id),
          market,
        }),
      )
      .filter(Boolean),
  );

  return { rows, names, market, snapshots, nutrient, nutrientName };
}

/** 表示用の製品名。長すぎる楽天の商品名を切る。切ったことが分かるよう … を付ける */
export function shortName(name, max = 30) {
  const chars = [...String(name ?? '')];
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max).join('')}…`;
}

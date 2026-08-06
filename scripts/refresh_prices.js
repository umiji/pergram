#!/usr/bin/env node
/**
 * 既存製品の価格を取り直す。差別化の3本柱のうち「鮮度」を担う処理。
 *
 *   RAKUTEN_APP_ID=xxxx node scripts/refresh_prices.js
 *
 * 成分データ（月次）とは別に日次で回す。GitHub Actions から実行して JSON をコミットする。
 * 前回スナップショットとの差分が大きい行は V-06 でレビュー対象になる。
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { validateDataset } from '../src/lib/validate.js';

const ENDPOINT = 'https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601';
const REQUEST_INTERVAL_MS = 1100;
const DATA = 'data';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = async (name) => JSON.parse(await readFile(path.join(DATA, name), 'utf8'));

async function fetchByItemCode(appId, itemCode) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('applicationId', appId);
  url.searchParams.set('itemCode', itemCode);

  const res = await fetch(url, { headers: { 'User-Agent': 'pergram/0.1 (price refresh)' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`楽天 API が ${res.status} を返しました`);

  const json = await res.json();
  const item = json.Items?.[0]?.Item ?? json.Items?.[0];
  return item ?? null;
}

async function main() {
  const appId = process.env.RAKUTEN_APP_ID;
  if (!appId) {
    console.error('RAKUTEN_APP_ID が未設定です。');
    process.exit(1);
  }

  const products = await readJson('products.json');
  const previous = await readJson('price_snapshots.json');
  const fetchedAt = new Date().toISOString().slice(0, 10);

  const rakutenProducts = products.filter((p) => p.id.startsWith('rakuten:'));
  const snapshots = [];
  let missing = 0;

  for (const [index, product] of rakutenProducts.entries()) {
    const itemCode = product.id.slice('rakuten:'.length);
    const item = await fetchByItemCode(appId, itemCode);

    if (!item) {
      // 取得できなかった製品は前回価格を残す。空欄にしない（design/service.md §6）
      const last = previous.find((s) => s.product_id === product.id && s.merchant === 'rakuten');
      if (last) snapshots.push({ ...last, in_stock: false });
      missing += 1;
    } else {
      snapshots.push({
        product_id: product.id,
        merchant: 'rakuten',
        price: item.itemPrice,
        currency: 'JPY',
        url: item.itemUrl,
        in_stock: item.availability === 1,
        fetched_at: fetchedAt,
      });
    }

    if (index < rakutenProducts.length - 1) await sleep(REQUEST_INTERVAL_MS);
  }

  const issues = validateDataset({
    products,
    nutrientContents: await readJson('nutrient_contents.json'),
    nutrients: await readJson('nutrients.json'),
    priceSnapshots: snapshots,
    previousPriceSnapshots: previous,
    referenceValues: await readJson('reference_values.json'),
  });

  await writeFile(
    path.join(DATA, 'price_snapshots.json'),
    `${JSON.stringify(snapshots, null, 2)}\n`,
    'utf8',
  );
  await mkdir(path.join(DATA, '_review'), { recursive: true });
  await writeFile(
    path.join(DATA, '_review', 'price_issues.json'),
    `${JSON.stringify(issues, null, 2)}\n`,
    'utf8',
  );

  console.log(`更新 ${snapshots.length} 件 / 取得できず ${missing} 件`);
  console.log(`要レビュー ${issues.filter((i) => i.code === 'V-06').length} 件（価格の急変）`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * 既存製品の価格を取り直す。差別化の3本柱のうち「鮮度」を担う処理。
 *
 *   npm run prices:refresh
 *
 * 成分データ（月次）とは別に日次で回す。GitHub Actions から実行して JSON をコミットする。
 * 前回スナップショットとの差分が大きい行は V-06 でレビュー対象になる。
 *
 * 🔒 この処理は下書きを経由せず、公開中の price_snapshots.json を直接上書きする。
 *    購入リンク（アフィリエイト URL）と送料区分を落とさないこと。落とすと、
 *    画面のリンクが素の URL に変わり、送料表示が消える。
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateDataset } from '../src/lib/validate.js';
import {
  apiHeaders,
  buildApiUrl,
  describeApiFailure,
  pickBuyUrl,
  pickPostageIncluded,
  readCredentials,
} from './rakuten_api.js';

const REQUEST_INTERVAL_MS = 1100;
const DATA = 'data';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = async (name) => JSON.parse(await readFile(path.join(DATA, name), 'utf8'));

/** 商品コード1件の問い合わせ URL。エンドポイントと認証は rakuten_api.js が唯一の出所 */
export function buildItemUrl({ appId, accessKey, affiliateId, itemCode }) {
  return buildApiUrl({ appId, accessKey, affiliateId, params: { itemCode } });
}

/**
 * 🔒 アフィリエイト ID が無いまま走らせると、掲載中の全製品の購入リンクが
 *    素の商品 URL に置き換わる。収集と違って下書きで止まらないので、警告ではなく止める。
 */
export function resolveCredentials(env) {
  return readCredentials(env, { requireAffiliate: true });
}

/**
 * 取り直した1件を価格スナップショットに落とす。
 *
 * 🔒 送料区分は販売元ごとに違うので価格側に付く。取り直しのたびに消すと、
 *    画面から送料表示が消え、次の収集でまた出る、という揺れ方をする。
 */
export function toSnapshot({ item, productId, fetchedAt }) {
  return {
    product_id: productId,
    merchant: 'rakuten',
    price: item.itemPrice,
    currency: 'JPY',
    postage_included: pickPostageIncluded(item),
    url: pickBuyUrl(item).url,
    in_stock: item.availability === 1,
    fetched_at: fetchedAt,
  };
}

async function fetchByItemCode({ appId, accessKey, affiliateId, appUrl, itemCode }) {
  const url = buildItemUrl({ appId, accessKey, affiliateId, itemCode });

  const res = await fetch(url, { headers: apiHeaders({ appUrl, purpose: 'price refresh' }) });
  if (res.status === 404) return null;
  if (!res.ok) {
    // 🔒 手がかりを足すだけ。リトライもフォールバックもしない。失敗は失敗のまま落とす。
    const body = await res.text();
    const hint = describeApiFailure({ status: res.status, body, appUrl });
    throw new Error(
      `楽天 API が ${res.status} を返しました: ${body}${hint ? `\n\n心当たり: ${hint}` : ''}`,
    );
  }

  const json = await res.json();
  const item = json.Items?.[0]?.Item ?? json.Items?.[0];
  return item ?? null;
}

async function main() {
  const credentials = resolveCredentials(process.env);

  const products = await readJson('products.json');
  const previous = await readJson('price_snapshots.json');
  const fetchedAt = new Date().toISOString().slice(0, 10);

  const rakutenProducts = products.filter((p) => p.id.startsWith('rakuten:'));
  const snapshots = [];
  let missing = 0;

  for (const [index, product] of rakutenProducts.entries()) {
    const itemCode = product.id.slice('rakuten:'.length);
    const item = await fetchByItemCode({ ...credentials, itemCode });

    if (!item) {
      // 取得できなかった製品は前回の行をそのまま残す。空欄にしない（design/service.md §6）。
      // 🔒 購入リンクと送料区分も前回のまま引き継ぐ。
      const last = previous.find((s) => s.product_id === product.id && s.merchant === 'rakuten');
      if (last) snapshots.push({ ...last, in_stock: false });
      missing += 1;
    } else {
      snapshots.push(toSnapshot({ item, productId: product.id, fetchedAt }));
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

  const affiliateCount = snapshots.filter((s) => s.url?.includes('hb.afl.rakuten.co.jp')).length;
  console.log(`更新 ${snapshots.length} 件 / 取得できず ${missing} 件`);
  console.log(`アフィリエイト ${affiliateCount} 件 — 残りは素の商品 URL`);
  console.log(`送料 判別 ${snapshots.filter((s) => s.postage_included !== null).length} 件`);
  console.log(`要レビュー ${issues.filter((i) => i.code === 'V-06').length} 件（価格の急変）`);
}

// テストから buildItemUrl / toSnapshot を読むため、直接実行されたときだけ走らせる。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

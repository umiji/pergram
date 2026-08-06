#!/usr/bin/env node
/**
 * 楽天商品検索 API から製品の下書きを作る。
 *
 *   RAKUTEN_APP_ID=xxxx node scripts/collect_rakuten.js --keyword プロテイン --pages 4
 *
 * 出力は data/_drafts/rakuten_<日付>.json。**そのままでは公開データにならない。**
 * タンパク質含有量はラベル情報であり商品名からは読めないため、下書きの
 * `protein_per_100g` を人間が埋めてから scripts/ingest_draft.js に渡す。
 *
 * 🔒 製品 ID は `rakuten:<itemCode>` という取得元スコープ付きの暫定キー。
 *    複数ソースをまたぐ名寄せキー（requirements.md Q-07）はまだ決めていない。
 *    このプロトタイプは楽天単一ソースなので名寄せが発生しない。
 *    DSLD や Amazon を足す前に Q-07 を確定させること。
 *
 * レート制限: 1秒に1リクエストを超えない。利用規約と robots.txt を必ず確認する。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';

import { parseNetWeightFromName } from '../src/lib/normalize_protein.js';

const ENDPOINT = 'https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601';
const REQUEST_INTERVAL_MS = 1100;
const HITS_PER_PAGE = 30;

/** 初版データセットの絞り込み。validation-plan.md 段1 🔒 */
const EXCLUDE_PATTERNS = [
  /バー(?!ジン)/, // プロテインバー
  /シェイカー/,
  /ドリンク/,
  /ゼリー/,
  /クッキー/,
  /チップス/,
  /お試し/,
  /サンプル/,
  /福袋/,
  /訳あり/,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function shouldExclude(itemName) {
  return EXCLUDE_PATTERNS.some((re) => re.test(itemName));
}

async function fetchPage({ appId, keyword, page }) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('applicationId', appId);
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('hits', String(HITS_PER_PAGE));
  url.searchParams.set('page', String(page));
  url.searchParams.set('sort', '+itemPrice');
  url.searchParams.set('availability', '1');

  const res = await fetch(url, { headers: { 'User-Agent': 'pergram/0.1 (data collection)' } });
  if (!res.ok) {
    throw new Error(`楽天 API が ${res.status} を返しました: ${await res.text()}`);
  }
  return res.json();
}

function toDraftRow(item, fetchedAt) {
  const netWeight = parseNetWeightFromName(item.itemName);
  return {
    // --- 自動取得 ---
    product_id: `rakuten:${item.itemCode}`,
    item_name: item.itemName,
    shop_name: item.shopName,
    price: item.itemPrice,
    currency: 'JPY',
    url: item.itemUrl,
    review_average: item.reviewAverage,
    review_count: item.reviewCount,
    fetched_at: fetchedAt,

    // --- 自動抽出（要確認） ---
    net_weight_g: netWeight.valueG,
    net_weight_ambiguous: netWeight.ambiguous,

    // --- ここから人間が埋める ---
    // 商品名からは読めない。商品ページの栄養成分表示を見て記入する。
    brand: null,
    flavor: null,
    protein_per_100g: null, // 100gあたりタンパク質g（＝含有率）
    serving_size_g: null, // ラベルに1食量があれば記入。なければ null のままでよい
    protein_per_serving_g: null, // 1食あたり表記のみのラベルはこちらに記入
    excluded_reason: null, // 対象外にする場合は理由を書く（ブレンド品・カプセル等）
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      keyword: { type: 'string', default: 'ホエイプロテイン' },
      pages: { type: 'string', default: '3' },
      out: { type: 'string' },
    },
  });

  const appId = process.env.RAKUTEN_APP_ID;
  if (!appId) {
    console.error('RAKUTEN_APP_ID が未設定です。https://webservice.rakuten.co.jp/ で取得してください。');
    process.exit(1);
  }

  const pages = Number.parseInt(values.pages, 10);
  const fetchedAt = new Date().toISOString().slice(0, 10);
  const rows = [];
  const seen = new Set();
  let excluded = 0;

  for (let page = 1; page <= pages; page += 1) {
    const json = await fetchPage({ appId, keyword: values.keyword, page });
    const items = (json.Items ?? []).map((wrapper) => wrapper.Item ?? wrapper);
    if (items.length === 0) break;

    for (const item of items) {
      if (!item?.itemCode || seen.has(item.itemCode)) continue;
      seen.add(item.itemCode);
      if (shouldExclude(item.itemName)) {
        excluded += 1;
        continue;
      }
      rows.push(toDraftRow(item, fetchedAt));
    }

    process.stderr.write(`page ${page}/${pages} — 累計 ${rows.length} 件\n`);
    if (page < pages) await sleep(REQUEST_INTERVAL_MS);
  }

  const outPath =
    values.out ?? path.join('data', '_drafts', `rakuten_${values.keyword}_${fetchedAt}.json`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');

  const withWeight = rows.filter((r) => r.net_weight_g !== null).length;
  const ambiguous = rows.filter((r) => r.net_weight_ambiguous).length;

  console.log(`書き出し: ${outPath}`);
  console.log(`  取得        ${rows.length} 件（除外 ${excluded} 件）`);
  console.log(`  内容量 自動  ${withWeight} 件`);
  console.log(`  内容量 曖昧  ${ambiguous} 件 — 商品ページで確認して net_weight_g に記入`);
  console.log(`  含有量 未入力 ${rows.length} 件 — 全件 protein_per_100g の記入が必要`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

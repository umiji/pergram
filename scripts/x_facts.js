#!/usr/bin/env node
/**
 * 投稿文に書いてよい「今の事実」を data/ と設定から出す。
 *
 *   node scripts/x_facts.js
 *   node scripts/x_facts.js --top 10 --json
 *
 * 🔒 X の投稿に数字を書くときは、必ずここに出た値だけを使う。
 *    記憶や前回の投稿から数字を写さない。価格は毎日動くので、古い数字は
 *    そのまま景表法上の問題（有利誤認）になる。
 *
 * 🔒 実データが無い項目は出さない。ここに出ない数字は投稿にも書かない。
 */

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';

import { crawlPolicy } from '../src/build/crawl.js';
import { formatCurrency, formatPercent } from '../src/lib/format.js';
import { SITE_ORIGIN } from '../src/lib/site.js';
import { loadProteinRows, shortName } from './x_dataset.js';

const { values } = parseArgs({
  options: {
    top: { type: 'string', default: '5' },
    json: { type: 'boolean', default: false },
  },
});

const config = JSON.parse(await readFile(path.join('config', 'x.json'), 'utf8'));
const { rows, names, snapshots } = await loadProteinRows();

/** 価格を実際に持っている販売元。ここに無いストアを「対応している」と書かない */
const realMerchants = [...new Set(snapshots.map((s) => s.merchant))].sort();
const fetchedAt = snapshots.map((s) => s.fetched_at).filter(Boolean).sort();

/** β版の暫定措置が残っているか。残っている間は「全ストア対応」と書けない */
const itemSource = await readFile(path.join('src', 'templates', 'products', 'item.js'), 'utf8');
const placeholders = (itemSource.match(/const PLACEHOLDER_MERCHANTS = \[([^\]]*)\]/)?.[1] ?? '')
  .split(',')
  .map((s) => s.trim().replace(/['"]/g, ''))
  .filter(Boolean);

const policy = crawlPolicy({ lpPath: config.landingPath, productsPath: config.productsPath });
const blocked = policy.blocked.some((p) => config.productsPath.startsWith(p));

const top = rows.slice(0, Number.parseInt(values.top, 10) || 5).map((row, i) => ({
  rank: i + 1,
  productId: row.product.id,
  name: names.get(row.product.id) ?? row.product.id,
  unitCost: row.costPerNutrientUnit,
  unitCostLabel: `${formatCurrency(row.costPerNutrientUnit, { locale: 'ja', currency: 'JPY' })} / タンパク質1g`,
  ratioPercent: row.contentRatioPercent,
  price: row.price,
  merchant: row.merchant,
  netWeightG: row.netWeightG,
  // 🔒 行ごとの取得日。投稿に日付を書くならここから引く（全体の期間で代用しない）
  fetchedAt: row.fetchedAt ?? null,
}));

const facts = {
  listedProducts: rows.length,
  nutrients: ['protein'],
  top,
  realMerchants,
  priceFetchedFrom: fetchedAt[0] ?? null,
  priceFetchedTo: fetchedAt.at(-1) ?? null,
  landingUrl: new URL(config.landingPath, SITE_ORIGIN).href,
  productsUrl: new URL(config.productsPath, SITE_ORIGIN).href,
  beta: {
    placeholderMerchants: placeholders,
    productsPageCrawlBlocked: blocked,
  },
};

if (values.json) {
  console.log(JSON.stringify(facts, null, 2));
  process.exit(0);
}

console.log('── いま書いてよい数字 ──');
console.log(`掲載製品（価格が取れている行）: ${facts.listedProducts} 件`);
console.log(`対応成分: ${facts.nutrients.join(' / ')}`);
console.log(`価格の取得日: ${facts.priceFetchedFrom ?? '不明'} 〜 ${facts.priceFetchedTo ?? '不明'}`);
console.log(`実データのある販売元: ${realMerchants.join(' / ') || 'なし'}`);
console.log(`LP: ${facts.landingUrl}`);
console.log(`製品一覧: ${facts.productsUrl}`);

console.log('\n── タンパク質1gあたりが安い順 ──');
for (const row of top) {
  const ratio = row.ratioPercent === null ? '含有率不明' : `含有率 ${formatPercent(row.ratioPercent, { locale: 'ja' })}`;
  const price = formatCurrency(row.price, { locale: 'ja', currency: 'JPY' });
  const weight = row.netWeightG === null ? '' : ` / ${row.netWeightG >= 1000 ? `${row.netWeightG / 1000}kg` : `${row.netWeightG}g`}`;
  console.log(
    `${row.rank}. ${row.unitCostLabel} — ${shortName(row.name, 30)}（${ratio}${weight} / ${price} / ${row.merchant} / 取得 ${row.fetchedAt ?? '不明'}）`,
  );
}

console.log('\n── 書いてはいけないこと（β版の暫定措置） ──');
if (placeholders.length > 0) {
  console.log(`・楽天以外の価格欄は表示例（${placeholders.join(' / ')}）。「全ECサイト対応」「Amazonの価格も見られる」と書かない`);
}
if (blocked) {
  console.log(`・製品一覧 ${config.productsPath} は robots.txt で塞いでいる。検索流入は前提にしない（Xからの直リンクは動く）`);
}
console.log('・順位は成分1gあたりの価格だけで決まる。「編集部のおすすめ」の類を書かない（N-03）');
console.log('・成分の働き・体感に触れない（N-02）。書けるのは含有量・単価・出典・更新日だけ');

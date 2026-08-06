#!/usr/bin/env node
/**
 * 人間が埋めた下書きを、公開データ（data/*.json）に取り込む。
 *
 *   node scripts/ingest_draft.js data/_drafts/rakuten_ホエイプロテイン_2026-08-06.json
 *
 * 取り込み時に normalize_protein() を通し、保存してよい3変数だけを書き出す。
 * バリデーションで error が出た行は取り込まず、レビューキューに残す。
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { normalizeProtein } from '../src/lib/normalize_protein.js';
import { validateDataset, hasBlockingIssue } from '../src/lib/validate.js';

const DATA_DIR = 'data';
const NUTRIENT_ID = 'protein';

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const writeJson = async (p, v) => writeFile(p, `${JSON.stringify(v, null, 2)}\n`, 'utf8');

async function main() {
  const draftPath = process.argv[2];
  if (!draftPath) {
    console.error('使い方: node scripts/ingest_draft.js <下書きJSON>');
    process.exit(1);
  }

  const draft = await readJson(draftPath);
  const nutrients = await readJson(path.join(DATA_DIR, 'nutrients.json'));
  const previousPrices = await readJson(path.join(DATA_DIR, 'price_snapshots.json'));

  const products = [];
  const productI18n = [];
  const nutrientContents = [];
  const priceSnapshots = [];
  const skipped = [];

  for (const row of draft) {
    if (row.excluded_reason) {
      skipped.push({ product_id: row.product_id, reason: row.excluded_reason });
      continue;
    }

    const normalized = normalizeProtein({
      netWeightG: row.net_weight_g,
      servingSizeG: row.serving_size_g,
      proteinPerServingG: row.protein_per_serving_g,
      proteinPer100g: row.protein_per_100g,
    });
    if (!normalized.ok) {
      skipped.push({ product_id: row.product_id, reason: normalized.reason });
      continue;
    }

    products.push({
      id: row.product_id,
      brand: row.brand ?? null,
      manufacturer: row.brand ?? null,
      form: 'powder',
      // 🔒 保存する独立変数はこの2つ。net_weight_g は導出値なので保存しない。
      serving_size_g: normalized.serving_size_g,
      servings_per_unit: normalized.servings_per_unit,
      serving_size: row.serving_size_g ? `${row.serving_size_g}g` : null,
      flavor: row.flavor ?? null,
      jan_code: null,
      source_type: 'manual',
      source_url: row.url,
      verified_at: row.fetched_at,
      confidence: row.serving_size_g ? 'high' : 'medium',
    });

    productI18n.push({
      product_id: row.product_id,
      locale: 'ja',
      name: row.item_name,
      description_source_url: row.url,
    });

    nutrientContents.push({
      product_id: row.product_id,
      nutrient_id: NUTRIENT_ID,
      salt_form_id: null,
      amount_labeled: row.protein_per_serving_g ?? normalized.amount_elemental,
      unit: 'g',
      // 🔒 比較に使うのは常にこちら。プロテインは塩形態がないため換算係数は 1。
      amount_elemental: normalized.amount_elemental,
    });

    priceSnapshots.push({
      product_id: row.product_id,
      merchant: 'rakuten',
      price: row.price,
      currency: row.currency ?? 'JPY',
      url: row.url,
      in_stock: true,
      fetched_at: row.fetched_at,
    });
  }

  const issues = validateDataset({
    products,
    nutrientContents,
    nutrients,
    priceSnapshots,
    previousPriceSnapshots: previousPrices,
  });

  const blocking = issues.filter((i) => i.severity === 'error');
  const blockedIds = new Set(blocking.map((i) => i.productId));

  const keep = (list) => list.filter((r) => !blockedIds.has(r.product_id ?? r.id));

  await writeJson(path.join(DATA_DIR, 'products.json'), keep(products));
  await writeJson(path.join(DATA_DIR, 'product_i18n.json'), keep(productI18n));
  await writeJson(path.join(DATA_DIR, 'nutrient_contents.json'), keep(nutrientContents));
  await writeJson(path.join(DATA_DIR, 'price_snapshots.json'), keep(priceSnapshots));

  await mkdir(path.join(DATA_DIR, '_review'), { recursive: true });
  await writeJson(path.join(DATA_DIR, '_review', 'issues.json'), issues);
  await writeJson(path.join(DATA_DIR, '_review', 'skipped.json'), skipped);

  console.log(`取り込み  ${keep(products).length} 件`);
  console.log(`下書きから除外 ${skipped.length} 件（data/_review/skipped.json）`);
  console.log(`error   ${blocking.length} 件 — 取り込まず保留`);
  console.log(`review  ${issues.filter((i) => i.severity === 'review').length} 件 — 公開前に確認`);

  if (hasBlockingIssue(issues)) {
    console.log('\ndata/_review/issues.json を確認して下書きを直し、再実行してください。');
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

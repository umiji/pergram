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
import { pathToFileURL } from 'node:url';

import { classifyProteinType, normalizeProtein } from '../src/lib/normalize_protein.js';
import { validateDataset, hasBlockingIssue } from '../src/lib/validate.js';

const DATA_DIR = 'data';
const NUTRIENT_ID = 'protein';

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const writeJson = async (p, v) => writeFile(p, `${JSON.stringify(v, null, 2)}\n`, 'utf8');

/**
 * 既存の行に今回の下書き由来の行を upsert する。
 *
 * 🔒 以前は下書き1本ぶんで data/*.json を丸ごと上書きしていたため、
 *    ソイの下書きだけを ingest すると既存のホエイが全部消えていた。
 *    キーが一致する行だけ今回の内容に差し替え、それ以外の既存行はそのまま残す。
 * ⚠️ 削除は行わない。下書きから漏れた（＝今回対象にしなかった）既存行を
 *    自動で消す仕組みが無いため、製品を本当に取り下げるときは手で消すこと。
 */
function upsertBy(existing, incoming, keyFn) {
  const byKey = new Map(existing.map((row) => [keyFn(row), row]));
  for (const row of incoming) byKey.set(keyFn(row), row);
  return [...byKey.values()];
}

/**
 * 同じ商品とみなすためのキー。
 *
 * ⚠️ **モックアップ用の力技。名寄せキー（requirements.md Q-07）はまだ決めていない。**
 *    楽天は同じ商品を複数の店舗が出すため、そのまま並べると同じ製品が何行も出る。
 *    ここでは「内容量と含有率が一致すれば同じ商品」とみなして最安の1件だけ残す。
 *
 *    別ブランドの同スペック品を誤ってまとめる可能性がある。黙って消さないよう、
 *    落とした出品は merged として必ず返す。
 *    🔒 2つ目のソース（Yahoo! / iHerb 等）を足す前に Q-07 を確定させ、この処理は捨てる。
 */
function sameProductKey(normalized) {
  const netWeightG = Math.round(normalized.serving_size_g * normalized.servings_per_unit);
  const ratio = (normalized.amount_elemental / normalized.serving_size_g).toFixed(4);
  return `${netWeightG}|${ratio}`;
}

/**
 * 読み取れた行を同一商品ごとにまとめ、最安の1件だけ残す。
 * 同額なら先に現れたほうを残す（並びを決定的にするため）。
 */
function keepCheapestOfSameProduct(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    const current = groups.get(candidate.key);
    if (current === undefined) {
      groups.set(candidate.key, [candidate]);
    } else {
      current.push(candidate);
    }
  }

  const kept = [];
  const merged = [];
  for (const group of groups.values()) {
    const cheapest = group.reduce((best, c) => (c.row.price < best.row.price ? c : best));
    kept.push(cheapest);
    if (group.length > 1) {
      merged.push({
        kept: cheapest.row.product_id,
        dropped: group.filter((c) => c !== cheapest).map((c) => c.row.product_id),
      });
    }
  }
  return { kept, merged };
}

/**
 * 下書きの各行を、保存してよい形の4つの表に展開する。
 *
 * 🔒 保存する独立変数は serving_size_g / servings_per_unit / amount_elemental の3つだけ。
 *    含有率・100gあたり含有量・1食あたり価格は導出値なので書かない。
 * 🔒 読めなかった行は推測で埋めず skipped に落とす。
 */
export function toRecords(draft) {
  const products = [];
  const productI18n = [];
  const nutrientContents = [];
  const priceSnapshots = [];
  const productAttributes = [];
  const skipped = [];
  const candidates = [];

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

    candidates.push({ row, normalized, key: sameProductKey(normalized) });
  }

  const { kept, merged } = keepCheapestOfSameProduct(candidates);

  for (const { row, normalized } of kept) {
    products.push({
      id: row.product_id,
      brand: row.brand ?? null,
      manufacturer: row.brand ?? null,
      form: 'powder',
      // 🔒 保存する独立変数はこの2つ。net_weight_g は導出値なので保存しない。
      serving_size_g: normalized.serving_size_g,
      servings_per_unit: normalized.servings_per_unit,
      serving_size: row.serving_size_g ? `${row.serving_size_g}g` : null,
      image_url: row.image_url ?? null,
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
      // 送料込みか送料別か。🔒 金額は取れないので単価には足さない。表示だけに使う
      postage_included: row.postage_included ?? null,
      // 収集時にアフィリエイト URL が取れていればそれが購入リンクになる。
      // 取れていない店舗は素の商品 URL のまま（広告表示は「含みます」で正しい）。
      url: row.url,
      in_stock: true,
      fetched_at: row.fetched_at,
    });

    // product_type facet。判定できない商品名は何も足さない（絞り込みに出ないだけで公開は止めない）。
    const productType = classifyProteinType(row.item_name);
    if (productType) {
      productAttributes.push({ product_id: row.product_id, key: productType });
    }
  }

  return { products, productI18n, nutrientContents, priceSnapshots, productAttributes, skipped, merged };
}

async function main() {
  const draftPath = process.argv[2];
  if (!draftPath) {
    console.error('使い方: node scripts/ingest_draft.js <下書きJSON>');
    process.exit(1);
  }

  const draft = await readJson(draftPath);
  const nutrients = await readJson(path.join(DATA_DIR, 'nutrients.json'));
  const existingProducts = await readJson(path.join(DATA_DIR, 'products.json'));
  const existingProductI18n = await readJson(path.join(DATA_DIR, 'product_i18n.json'));
  const existingNutrientContents = await readJson(path.join(DATA_DIR, 'nutrient_contents.json'));
  const existingPriceSnapshots = await readJson(path.join(DATA_DIR, 'price_snapshots.json'));
  const existingProductAttributes = await readJson(path.join(DATA_DIR, 'product_attributes.json'));

  const {
    products: newProducts,
    productI18n: newProductI18n,
    nutrientContents: newNutrientContents,
    priceSnapshots: newPriceSnapshots,
    productAttributes: newProductAttributes,
    skipped,
    merged,
  } = toRecords(draft);

  // 既存データに今回の下書き分を upsert してから、マージ後の全体でバリデーションする。
  // 🔒 V-05（ブランド内の含有率外れ値）等はカタログ全体を見て初めて判定できるため、
  //    今回の下書き分だけを検証すると見落とす。
  const products = upsertBy(existingProducts, newProducts, (r) => r.id);
  const productI18n = upsertBy(existingProductI18n, newProductI18n, (r) => `${r.product_id}:${r.locale}`);
  const nutrientContents = upsertBy(
    existingNutrientContents,
    newNutrientContents,
    (r) => `${r.product_id}:${r.nutrient_id}`,
  );
  const priceSnapshots = upsertBy(
    existingPriceSnapshots,
    newPriceSnapshots,
    (r) => `${r.product_id}:${r.merchant}`,
  );
  const productAttributes = upsertBy(
    existingProductAttributes,
    newProductAttributes,
    (r) => `${r.product_id}:${r.key}`,
  );

  const issues = validateDataset({
    products,
    nutrientContents,
    nutrients,
    priceSnapshots,
    previousPriceSnapshots: existingPriceSnapshots,
  });

  const blocking = issues.filter((i) => i.severity === 'error');
  const blockedIds = new Set(blocking.map((i) => i.productId));

  const keep = (list) => list.filter((r) => !blockedIds.has(r.product_id ?? r.id));

  await writeJson(path.join(DATA_DIR, 'products.json'), keep(products));
  await writeJson(path.join(DATA_DIR, 'product_i18n.json'), keep(productI18n));
  await writeJson(path.join(DATA_DIR, 'nutrient_contents.json'), keep(nutrientContents));
  await writeJson(path.join(DATA_DIR, 'price_snapshots.json'), keep(priceSnapshots));
  await writeJson(path.join(DATA_DIR, 'product_attributes.json'), keep(productAttributes));

  await mkdir(path.join(DATA_DIR, '_review'), { recursive: true });
  await writeJson(path.join(DATA_DIR, '_review', 'issues.json'), issues);
  await writeJson(path.join(DATA_DIR, '_review', 'skipped.json'), skipped);
  await writeJson(path.join(DATA_DIR, '_review', 'merged.json'), merged);

  const newIds = new Set(newProducts.map((r) => r.id));
  const newKept = keep(products).filter((r) => newIds.has(r.id));
  console.log(`今回の下書きから取り込み ${newKept.length} 件`);
  console.log(`カタログ全体      ${keep(products).length} 件`);
  console.log(
    `product_type 判定 ${productAttributes.length} 件 — ホエイ・ソイのみ対応（casein/pea/rice は未実装）`,
  );
  console.log(`下書きから除外 ${skipped.length} 件（data/_review/skipped.json）`);
  console.log(
    `同一商品としてまとめ ${merged.flatMap((m) => m.dropped).length} 件 — ` +
      '⚠️ 内容量と含有率が一致すれば同じ商品とみなす力技（data/_review/merged.json）',
  );
  console.log(`error   ${blocking.length} 件 — 取り込まず保留`);
  console.log(`review  ${issues.filter((i) => i.severity === 'review').length} 件 — 公開前に確認`);

  if (hasBlockingIssue(issues)) {
    console.log('\ndata/_review/issues.json を確認して下書きを直し、再実行してください。');
  }
}

// テストから toRecords を読むため、直接実行されたときだけ走らせる。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

#!/usr/bin/env node
/**
 * 静的サイトのビルド。dist/ を生成する。
 *
 *   node src/build/build.js [--strict]
 *
 * 🔒 URL は最初から /ja/ のサブパス。後付けは全 URL 変更 = SEO 大損。
 * 🔒 /ja/ と /en/ は翻訳関係にない。掲載製品・参照値・免責文がすべて異なる。
 *    成分ランキングページに hreflang を相互指定しない。
 * 🔒 LP のヒーローは実データのみ。製品が足りなければ LP を出力しない。
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildRow, sortByUnitCost } from '../lib/cost.js';
import { loadTranslator } from '../lib/i18n.js';
import { rankingPage } from '../templates/ranking.js';
import { lpPage } from '../templates/lp.js';

const DIST = 'dist';
const DATA = 'data';
const CONFIG = 'config';

/** LP を公開してよい最小製品数。これを下回るなら「市販N製品」と名乗れない */
const MIN_LP_PRODUCTS = 20;
/** ヒーローに出す件数 */
const HERO_ROWS = 5;

const strict = process.argv.includes('--strict');
const readJson = async (...p) => JSON.parse(await readFile(path.join(...p), 'utf8'));

async function emit(relPath, html) {
  const full = path.join(DIST, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, html, 'utf8');
}

/** 製品ごとの表示行を組み立てる */
function buildRows({ nutrientId, market, targetIntake, locale, data }) {
  const nutrient = data.nutrients.find((n) => n.id === nutrientId);
  if (!nutrient) throw new Error(`成分が見つかりません: ${nutrientId}`);

  const contents = data.nutrientContents.filter((c) => c.nutrient_id === nutrientId);
  const productById = new Map(data.products.map((p) => [p.id, p]));

  const namesByProduct = new Map(
    data.productI18n.filter((r) => r.locale === locale).map((r) => [r.product_id, r.name]),
  );

  const snapshotsByProduct = new Map();
  for (const snapshot of data.priceSnapshots) {
    if (!snapshotsByProduct.has(snapshot.product_id)) snapshotsByProduct.set(snapshot.product_id, []);
    snapshotsByProduct.get(snapshot.product_id).push(snapshot);
  }

  const attributesByProduct = new Map();
  for (const attr of data.productAttributes) {
    if (!attributesByProduct.has(attr.product_id)) attributesByProduct.set(attr.product_id, []);
    attributesByProduct.get(attr.product_id).push(attr);
  }

  const rows = [];
  for (const content of contents) {
    const product = productById.get(content.product_id);
    if (!product) continue;

    const snapshots = snapshotsByProduct.get(product.id) ?? [];
    const row = buildRow({ product, content, nutrient, snapshots, market, targetIntake });
    if (row === null) continue;

    row.name = namesByProduct.get(product.id) ?? product.id;
    row.attributeKeys = (attributesByProduct.get(product.id) ?? []).map((a) => a.key);
    row.snapshotsByMerchant = new Map(
      snapshots.filter((s) => market.merchants.includes(s.merchant)).map((s) => [s.merchant, s]),
    );
    rows.push(row);
  }

  // 🔒 並び順は主指標のみ
  return { rows: sortByUnitCost(rows), nutrient };
}

/** 翻訳のあるファセットだけを物差しのチップにする */
function resolveFilters(rows, t) {
  const keys = [...new Set(rows.flatMap((r) => r.attributeKeys))];
  const filters = [];
  for (const key of keys) {
    try {
      filters.push({ key, label: t(`attribute.${key}`) });
    } catch {
      process.stderr.write(`スキップ: attribute.${key} の翻訳がないためチップに出しません\n`);
    }
  }
  return filters;
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const data = {
    nutrients: await readJson(DATA, 'nutrients.json'),
    nutrientI18n: await readJson(DATA, 'nutrient_i18n.json'),
    products: await readJson(DATA, 'products.json'),
    productI18n: await readJson(DATA, 'product_i18n.json'),
    nutrientContents: await readJson(DATA, 'nutrient_contents.json'),
    productAttributes: await readJson(DATA, 'product_attributes.json'),
    priceSnapshots: await readJson(DATA, 'price_snapshots.json'),
    referenceValues: await readJson(DATA, 'reference_values.json'),
  };

  const markets = await readJson(CONFIG, 'markets.json');
  const categories = await readJson(CONFIG, 'categories.json');
  const gaMeasurementId = process.env.GA4_MEASUREMENT_ID ?? null;

  // 現時点で公開するのは locale=ja / market=JP のみ。
  // /en/ は P8。URL 構造と翻訳キーは先に用意してある。
  const locale = 'ja';
  const marketId = 'JP';
  const market = markets[marketId];
  const t = await loadTranslator(locale);

  const nutrientId = 'protein';
  const category = categories[nutrientId];
  const targetIntake = category.targetIntake.default;

  const nutrientName =
    data.nutrientI18n.find((r) => r.nutrient_id === nutrientId && r.locale === locale)?.name ??
    nutrientId;

  const { rows } = buildRows({ nutrientId, market, targetIntake, locale, data });

  const updatedAt =
    data.priceSnapshots.map((s) => s.fetched_at).sort().at(-1) ??
    new Date().toISOString().slice(0, 10);

  // --- 成分ランキング -------------------------------------------------
  await emit(
    path.join(locale, nutrientId, 'index.html'),
    rankingPage({
      t,
      locale,
      market,
      rows,
      nutrientName,
      updatedAt,
      targetIntake,
      displayUnit: category.displayUnit,
      disclosureKey: market.disclosureKey,
      gaMeasurementId,
    }),
  );

  // --- LP -------------------------------------------------------------
  // 🔒 ダミーを入れない。実データが足りないなら出力しない。
  let lpEmitted = false;
  if (rows.length >= MIN_LP_PRODUCTS) {
    await emit(
      path.join(locale, 'lp', 'index.html'),
      lpPage({
        t,
        locale,
        currency: market.currency,
        displayUnit: category.displayUnit,
        topRows: rows.slice(0, HERO_ROWS),
        totalCount: rows.length,
        rulerRows: rows,
        filters: resolveFilters(rows, t),
        disclosureKey: market.disclosureKey,
        gaMeasurementId,
      }),
    );
    lpEmitted = true;
  }

  // --- ルートのリダイレクトと配信設定 ---------------------------------
  await emit(
    'index.html',
    `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=/ja/${nutrientId}/">
<link rel="canonical" href="/ja/${nutrientId}/">
<title>pergram</title>
</head>
<body><a href="/ja/${nutrientId}/">/ja/${nutrientId}/</a></body>
</html>
`,
  );
  await writeFile(path.join(DIST, '_redirects'), `/  /ja/${nutrientId}/  302\n`, 'utf8');

  // 検証段階ではインデックスさせない。広告の審査と計測だけに使う。
  await writeFile(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');

  // --- アセット --------------------------------------------------------
  await mkdir(path.join(DIST, 'assets'), { recursive: true });
  await cp('src/styles/tokens.css', path.join(DIST, 'assets', 'tokens.css'));
  await cp('src/styles/site.css', path.join(DIST, 'assets', 'site.css'));
  await cp('src/styles/lp.css', path.join(DIST, 'assets', 'lp.css'));
  await cp('src/assets/lp.js', path.join(DIST, 'assets', 'lp.js'));

  // --- 結果 ------------------------------------------------------------
  console.log(`ランキング  /ja/${nutrientId}/  — ${rows.length} 製品`);
  if (lpEmitted) {
    console.log(`LP          /ja/lp/`);
  } else {
    console.log(
      `LP          未出力 — 実データが ${rows.length} 件しかありません（最低 ${MIN_LP_PRODUCTS} 件）。`,
    );
    console.log(`            ヒーローにダミーを置かない決まりのため、データを揃えてから再ビルドしてください。`);
    if (strict) process.exit(1);
  }
  if (!gaMeasurementId) {
    console.log('GA4         未設定 — GA4_MEASUREMENT_ID を渡すと計測タグが入ります。');
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

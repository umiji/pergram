#!/usr/bin/env node
/**
 * 静的サイトのビルド。dist/ を生成する。
 *
 *   node src/build/build.js [--strict]
 *
 * 🔒 URL は最初から /ja/ のサブパス。後付けは全 URL 変更 = SEO 大損。
 *    /ja/           … LP（トップページ）
 *    /ja/protein/   … 製品一覧
 * 🔒 /ja/ と /en/ は翻訳関係にない。掲載製品・参照値・免責文がすべて異なる。
 *    成分ランキングページに hreflang を相互指定しない。
 * 🔒 LP のヒーローは実データのみ。足りなければ**ランキングカードを出さない**。
 *    禁止されているのはダミーの数字であって、LP を出さないことではない
 *    （design.md §7 禁止⑧ / ad-lp.md）。LP は常に出力する。
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildRow, sortByUnitCost } from '../lib/cost.js';
import { loadTranslator } from '../lib/i18n.js';
import { productsPage } from '../templates/products.js';
import { lpPage, ROADMAP_NUTRIENTS } from '../templates/lp.js';

const DIST = 'dist';
const DATA = 'data';
const CONFIG = 'config';

/**
 * ヒーローにランキングカードを出してよい最小製品数。
 * これを下回るなら「市販N製品」と名乗れないのでカードを出さない。
 * 🔒 LP そのものは件数に関わらず出力する。Waitlist を測れなくなるため。
 */
const MIN_HERO_PRODUCTS = 20;
/** ヒーローのランキングカードに出す件数 */
const HERO_ROWS = 3;

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

  // 🔒 ダミーを入れない。実データが足りないならヒーローのカードを出さない。
  //    LP 自体は常に出力する（Waitlist の登録を測るのがこのページの仕事）。
  const heroReady = rows.length >= MIN_HERO_PRODUCTS;
  // LP はロケールのトップページ。ヘッダのワードマークの飛び先（/ja/）と一致させる
  const lpPath = `/${locale}/`;
  const productsPath = `/${locale}/${nutrientId}/`;

  // 絞り込みの成分欄。掲載中の成分と、ロードマップ上の成分（件数0）を並べる
  const nutrients = [
    { id: nutrientId, count: rows.length },
    ...ROADMAP_NUTRIENTS.filter((id) => id !== nutrientId).map((id) => ({ id, count: 0 })),
  ];

  // --- 製品一覧 -------------------------------------------------------
  await emit(
    path.join(locale, nutrientId, 'index.html'),
    productsPage({
      t,
      locale,
      market,
      rows,
      nutrientId,
      nutrientName,
      updatedAt,
      targetIntake,
      category,
      nutrients,
      disclosureKey: market.disclosureKey,
      waitlistPath: `${lpPath}#waitlist`,
      gaMeasurementId,
    }),
  );

  // --- LP（ロケールのトップページ） -----------------------------------
  {
    await emit(
      path.join(locale, 'index.html'),
      lpPage({
        t,
        locale,
        currency: market.currency,
        displayUnit: category.displayUnit,
        topRows: heroReady ? rows.slice(0, HERO_ROWS) : [],
        totalCount: rows.length,
        nutrientName,
        updatedAt,
        disclosureKey: market.disclosureKey,
        betaPath: productsPath,
        gaMeasurementId,
      }),
    );
  }

  // --- ルートのリダイレクトと配信設定 ---------------------------------
  // ルートは既定のロケールのトップ（= LP）へ送る。
  // _redirects が効かない配信先でも動くよう meta refresh も置く。
  await emit(
    'index.html',
    `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${lpPath}">
<link rel="canonical" href="${lpPath}">
<title>pergram</title>
</head>
<body><a href="${lpPath}">${lpPath}</a></body>
</html>
`,
  );
  await writeFile(path.join(DIST, '_redirects'), `/  ${lpPath}  302\n`, 'utf8');

  // 検証段階ではインデックスさせない。広告の審査と計測だけに使う。
  await writeFile(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');

  // Cloudflare Pages のレスポンスヘッダ。
  // script-src に 'unsafe-inline' が要るのは GA4 の初期化スニペットがインライン
  // だから（layout.js）。静的ビルドなのでリクエストごとの nonce を発行できない。
  // self-host（design.md §8 未達）が済めば fonts.* の許可は外せる。
  await writeFile(
    path.join(DIST, '_headers'),
    `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://www.google-analytics.com; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'
`,
    'utf8',
  );

  // --- アセット --------------------------------------------------------
  await mkdir(path.join(DIST, 'assets'), { recursive: true });
  await cp('src/styles/tokens.css', path.join(DIST, 'assets', 'tokens.css'));
  await cp('src/styles/site.css', path.join(DIST, 'assets', 'site.css'));
  await cp('src/styles/lp.css', path.join(DIST, 'assets', 'lp.css'));
  await cp('src/styles/products.css', path.join(DIST, 'assets', 'products.css'));
  await cp('src/assets/lp.js', path.join(DIST, 'assets', 'lp.js'));
  await cp('src/assets/products.js', path.join(DIST, 'assets', 'products.js'));

  // --- 結果 ------------------------------------------------------------
  console.log(`LP          ${lpPath}`);
  console.log(`製品一覧    ${productsPath}  — ${rows.length} 製品`);
  if (!heroReady) {
    console.log(
      `            ヒーローのランキングカードは未出力 — 実データが ${rows.length} 件しかありません（最低 ${MIN_HERO_PRODUCTS} 件）。`,
    );
    console.log(`            ダミーを置かない決まりのため、データを揃えると自動でカードが出ます。`);
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

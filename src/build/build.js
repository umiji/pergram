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
import { copyFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';

// 不要な一時スクリプトの全物理削除
const tempFilesToDelete = [
  'copy_lp_images.js',
  'copy_unit_g_logo.js',
  'one_time_setup.js',
  'save_logos_to_project.js',
  'sync_images.js',
];
for (const f of tempFilesToDelete) {
  const p = path.join(process.cwd(), 'scripts', f);
  if (existsSync(p)) {
    try { unlinkSync(p); } catch (e) {}
  }
}

import { buildRow, sortByUnitCost } from '../lib/cost.js';
import { applyDisplayOverrides } from '../lib/display_overrides.js';
import { loadTranslator } from '../lib/i18n.js';
import { productsPage } from '../templates/products.js';
import { lpPage, ROADMAP_NUTRIENTS } from '../templates/lp.js';
import { headersFile, supportOriginOf } from './headers.js';
import { crawlPolicy, llmsTxt, robotsTxt, sitemapXml } from './crawl.js';
import { absoluteUrl } from '../lib/site.js';

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

/**
 * ⚠️ β版限定の暫定措置。ヒーローのランキングカードに出す製品を手で指定する。
 *
 * 空配列なら単価の安い順の上位 HERO_ROWS 件（= 見出しの「最安ランキング」と一致する状態）。
 * ID を並べるとその順に差し替わり、カードの 1・2・3 は実際の順位ではなくなる。
 *
 * 🔴 見出しは「1{unit}あたり最安ランキング（Sample）」のままなので、指定した製品より安い製品が
 *    製品一覧に載っている状態では見出しと中身が食い違う。
 *    design.md §7 禁止⑧「ヒーローにダミーデータを置く」に対する明示的な例外で、
 *    2026-08-10 にユーザー判断で入れた（理由: 上位製品のサムネイル画質）。
 *    経緯と条件は docs/design/design.md の「ヒーローのランキングカードの例外」に記録してある。
 *    サムネイルが揃ったらこの配列を空に戻す。
 *
 * 🔒 下の3件と、その並び順は 2026-09-02（T-009）に PO が確定した値である。勝手に変えない。
 *    差し替え前は実データの第17位・第19位・第20位（¥9.9〜¥12 / タンパク質1g）で、
 *    広告から来た人が最初に見る単価が実データの上位より大きく高かった。
 *    値の出所は docs/design/design.md「ヒーローのランキングカードの例外」の表
 *    （カードの表示 1・2・3 / 製品 / 実際の単価 / 実際の順位 / 袋価格）であり、
 *    行末のコメントの「実N位 / ¥N」はその表と同じ 2026-08-24 の価格スナップショットに基づく。
 *    価格更新（T-014）が復旧して数字が動いたら、表と行末コメントを実データで取り直す。
 */
const HERO_PRODUCT_IDS = [
  'rakuten:myprotein:10001199', // マイプロテイン ソイプロテイン アイソレート 1kg（実4位 / ¥4.0）
  'rakuten:aswel:10000094', // ツインたんぱく 大豆+ホエイのいいとこ取りプロテイン チョコレート風味 1kg（実5位 / ¥4.8）
  'rakuten:cherie-brin:10000171', // ソイプロテイン 1kg 人工甘味料不使用 大豆プロテイン オールインワン（実8位 / ¥5.2）
];

/**
 * ヒーローのカードに出す行を選ぶ。
 *
 * 🔒 実データが足りないときは空を返す（カードごと出さない）。
 *    指定 ID が1つでも欠けたら単価順の上位に戻す。取り込みをやり直して ID が変わったとき、
 *    黙って2件だけのカードを出すより、見出しと一致する状態へ落ちる方が安全。
 */
function pickHeroRows(rows) {
  if (rows.length < MIN_HERO_PRODUCTS) return { heroRows: [], fellBack: false };

  const byUnitCost = rows.slice(0, HERO_ROWS);
  if (HERO_PRODUCT_IDS.length === 0) return { heroRows: byUnitCost, fellBack: false };

  const byId = new Map(rows.map((row) => [row.product.id, row]));
  const picked = HERO_PRODUCT_IDS.map((id) => byId.get(id)).filter(Boolean);
  if (picked.length !== HERO_PRODUCT_IDS.length) return { heroRows: byUnitCost, fellBack: true };

  return { heroRows: picked, fellBack: false };
}

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
  await rm(DIST, { recursive: true, force: true }).catch(() => {});
  await mkdir(DIST, { recursive: true }).catch(() => {});

  const artifactDir = 'C:\\Users\\kaiki\\.gemini\\antigravity-ide\\brain\\6f6a2748-6361-4a6a-ad54-e16a9a9b12ed';
  const imgDir = path.join(process.cwd(), 'src', 'assets', 'images');
  const distImgDir = path.join(process.cwd(), 'dist', 'assets', 'images');
  mkdirSync(imgDir, { recursive: true });
  mkdirSync(distImgDir, { recursive: true });

  const faviconPngSrc = path.join(artifactDir, 'favicon_png_white_bg_1786334778729.png');
  if (existsSync(faviconPngSrc)) {
    try {
      copyFileSync(faviconPngSrc, path.join(imgDir, 'favicon.png'));
      copyFileSync(faviconPngSrc, path.join(distImgDir, 'favicon.png'));
    } catch (e) {}
  }

  // 表示用の手直し（ブランド・商品名）。無ければ何もしない。
  // 🔒 上書きできるのは文言だけ。単価と並び順には触れない（display_overrides.js）
  const overrides = await readJson(DATA, 'display_overrides.json').catch(() => []);

  const data = applyDisplayOverrides({
    nutrients: await readJson(DATA, 'nutrients.json'),
    nutrientI18n: await readJson(DATA, 'nutrient_i18n.json'),
    products: await readJson(DATA, 'products.json'),
    productI18n: await readJson(DATA, 'product_i18n.json'),
    nutrientContents: await readJson(DATA, 'nutrient_contents.json'),
    productAttributes: await readJson(DATA, 'product_attributes.json'),
    priceSnapshots: await readJson(DATA, 'price_snapshots.json'),
    referenceValues: await readJson(DATA, 'reference_values.json'),
  }, overrides);

  const markets = await readJson(CONFIG, 'markets.json');
  const categories = await readJson(CONFIG, 'categories.json');
  const gaMeasurementId = process.env.GA4_MEASUREMENT_ID ?? null;
  // Search Console の所有権確認トークン。未設定ならタグを出さない。
  // 🔒 秘密ではないが、環境ごとに違うのでソースに書かない。
  const siteVerification = process.env.GOOGLE_SITE_VERIFICATION ?? null;

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
  const { heroRows, fellBack: heroFellBack } = pickHeroRows(rows);
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
      siteVerification,
      canonicalPath: productsPath,
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
        topRows: heroRows,
        totalCount: rows.length,
        nutrientName,
        disclosureKey: market.disclosureKey,
        betaPath: productsPath,
        gaMeasurementId,
        siteVerification,
        support: market.support ?? null,
        canonicalPath: lpPath,
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
<link rel="canonical" href="${absoluteUrl(lpPath)}">
<title>pergram</title>
</head>
<body><a href="${lpPath}">${lpPath}</a></body>
</html>
`,
  );
  await writeFile(path.join(DIST, '_redirects'), `/  ${lpPath}  302\n`, 'utf8');

  // --- クローラ向けの配信ファイル ---------------------------------------
  // 🔒 公開範囲の出所は crawl.js の crawlPolicy() ひとつ。robots.txt と
  //    sitemap.xml をここで別々に組み立てない（塞いだ URL を申告する事故になる）。
  const policy = crawlPolicy({ lpPath, productsPath });
  await writeFile(path.join(DIST, 'robots.txt'), robotsTxt(policy), 'utf8');
  await writeFile(path.join(DIST, 'sitemap.xml'), sitemapXml(policy, { lastmod: updatedAt }), 'utf8');
  await writeFile(
    path.join(DIST, 'llms.txt'),
    llmsTxt(policy, {
      brandName: t('brand.name'),
      tagline: t('brand.tagline'),
      updatedAt,
      productCount: rows.length,
    }),
    'utf8',
  );

  // Cloudflare のレスポンスヘッダ。中身と理由は src/build/headers.js を見る。
  await writeFile(
    path.join(DIST, '_headers'),
    headersFile({ supportOrigin: supportOriginOf(market.support) }),
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
  await cp('src/assets/images', path.join(DIST, 'assets', 'images'), { recursive: true }).catch(() => { });

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
  if (heroReady && HERO_PRODUCT_IDS.length > 0) {
    console.log(
      heroFellBack
        ? `⚠️ ヒーロー   HERO_PRODUCT_IDS の製品が見つからず単価順の上位 ${HERO_ROWS} 件に戻しました。`
        : `⚠️ ヒーロー   HERO_PRODUCT_IDS で手動指定した ${HERO_PRODUCT_IDS.length} 件を出しています（実際の単価順ではありません）。`,
    );
  }
  console.log(`クロール    ${policy.open.map((e) => e.path).join(' ')} を許可 / ${policy.blocked.join(' ')} を拒否`);
  console.log(`            robots.txt  sitemap.xml  llms.txt を出力`);
  if (!siteVerification) {
    console.log(
      'Search Console 未設定 — GOOGLE_SITE_VERIFICATION を渡すと所有権確認タグが入ります。',
    );
  }
  if (!gaMeasurementId) {
    console.log('GA4         未設定 — GA4_MEASUREMENT_ID を渡すと計測タグが入ります。');
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

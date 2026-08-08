#!/usr/bin/env node
/**
 * 楽天商品検索 API から製品の下書きを作る。
 *
 *   RAKUTEN_APP_ID=xxxx node scripts/collect_rakuten.js --keyword プロテイン --pages 4
 *
 * 出力は data/_drafts/rakuten_<日付>.json。**そのままでは公開データにならない。**
 *
 * タンパク質含有量を返す EC API は存在しない。商品説明文（itemCaption）に貼られた
 * 栄養成分表示から読み取りを試み、**読めた分だけ**下書きに入れる。
 * 読めなかった行は `protein_per_100g` が null のまま残るので、人間が商品ページを
 * 見て埋めてから scripts/ingest_draft.js に渡す。🔒 推測で埋めない。
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
import { pathToFileURL } from 'node:url';

import { extractProteinFromCaption, parseNetWeightFromName } from '../src/lib/normalize_protein.js';

/**
 * 🔒 2026-02-10 の認証基盤刷新でドメインと認証方式が変わった。
 *    旧 `app.rakuten.co.jp/services/api/` + 19桁の applicationId 単独では 400 になる。
 *    現行は openapi ドメイン + UUID の applicationId + accessKey + Referer ヘッダ。
 */
const ENDPOINT = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601';
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

/**
 * 検索 URL を組む。
 * 🔒 `sort=+itemPrice` は API から取ってくる順序であって、掲載順ではない。
 *    掲載順は取り込み後に有効成分1単位あたりの価格で決まる。
 * affiliateId を渡すと、返ってくる itemUrl / affiliateUrl がアフィリエイト URL になる。
 */
export function buildSearchUrl({ appId, accessKey, affiliateId, keyword, page }) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('applicationId', appId);
  url.searchParams.set('accessKey', accessKey);
  if (affiliateId) url.searchParams.set('affiliateId', affiliateId);
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('hits', String(HITS_PER_PAGE));
  url.searchParams.set('page', String(page));
  url.searchParams.set('sort', '+itemPrice');
  url.searchParams.set('availability', '1');
  url.searchParams.set('format', 'json');
  return url;
}

async function fetchPage({ appId, accessKey, affiliateId, appUrl, keyword, page }) {
  const url = buildSearchUrl({ appId, accessKey, affiliateId, keyword, page });

  // 🔒 Referer が無いと 403 REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING。
  //    楽天に登録したアプリ URL を送る。
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'pergram/0.1 (data collection)',
      Referer: appUrl,
      Origin: new URL(appUrl).origin,
    },
  });
  if (!res.ok) {
    throw new Error(`楽天 API が ${res.status} を返しました: ${await res.text()}`);
  }
  return res.json();
}

/**
 * 画像 URL。API は複数サイズを返すが、一覧のサムネイルは 76px なので medium で足りる。
 * 🔒 画像の利用条件は取得元の規約に従う（design.md §4.1 の要確認事項）。
 */
function pickImageUrl(item) {
  const urls = item.mediumImageUrls ?? item.smallImageUrls ?? [];
  const first = urls[0];
  const url = typeof first === 'string' ? first : first?.imageUrl;
  // 楽天は末尾に `?_ex=128x128` のようなサイズ指定を付けて返す
  return typeof url === 'string' && url.length > 0 ? url.replace(/\?_ex=\d+x\d+$/, '') : null;
}

/**
 * 購入リンク。affiliateId を渡していればアフィリエイト URL が返る。
 * 参加していない店舗では返らないので、その場合は素の商品 URL を使う。
 * 🔒 報酬率（affiliateRate）は読まない。下書きに無ければ「報酬の高い順」を作れない。
 */
function pickBuyUrl(item) {
  const affiliate = typeof item.affiliateUrl === 'string' ? item.affiliateUrl.trim() : '';
  return affiliate.length > 0 ? { url: affiliate, isAffiliate: true } : { url: item.itemUrl, isAffiliate: false };
}

export function toDraftRow(item, fetchedAt) {
  const netWeight = parseNetWeightFromName(item.itemName);
  const label = extractProteinFromCaption(item.itemCaption);
  const buy = pickBuyUrl(item);

  return {
    // --- 自動取得 ---
    product_id: `rakuten:${item.itemCode}`,
    item_name: item.itemName,
    shop_name: item.shopName,
    price: item.itemPrice,
    currency: 'JPY',
    url: buy.url,
    is_affiliate: buy.isAffiliate,
    image_url: pickImageUrl(item),
    fetched_at: fetchedAt,

    // --- 自動抽出（要確認） ---
    net_weight_g: netWeight.valueG,
    net_weight_ambiguous: netWeight.ambiguous,
    // 商品説明文に貼られた栄養成分表示から読み取る。読めなければ null のまま人間へ回る。
    protein_per_100g: label.per100g, // 100gあたりタンパク質g（＝含有率）
    serving_size_g: label.servingSizeG, // 1食量。無いと1食=100g扱いになり副指標がずれる
    protein_per_serving_g: label.proteinPerServingG,
    label_basis: label.basis, // どの表記から読んだか。null なら人間の入力待ち
    label_ambiguous: label.ambiguous, // 食い違う値が読めた。必ず人間が見る

    // --- ここから人間が埋める ---
    brand: null, // API は店舗名しか返さない。商品名から判別して記入する
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

  // 🔒 2026-02-10 の刷新以降、この3つが揃わないと 400 / 403 になる。
  const appId = process.env.RAKUTEN_APP_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  const appUrl = process.env.RAKUTEN_APP_URL;
  const missing = [
    !appId && 'RAKUTEN_APP_ID（UUID 形式）',
    !accessKey && 'RAKUTEN_ACCESS_KEY',
    !appUrl && 'RAKUTEN_APP_URL（Referer に使う。楽天に登録したアプリ URL）',
  ].filter(Boolean);
  if (missing.length > 0) {
    console.error(`未設定: ${missing.join(' / ')}`);
    console.error('https://webservice.rakuten.co.jp/ のアプリ情報から取得してください。');
    process.exit(1);
  }

  // 🔒 アフィリエイトを利用する。未設定のまま集めると素の URL になり、
  //    広告表示（「アフィリエイトリンクを含みます」）と食い違う。
  const affiliateId = process.env.RAKUTEN_AFFILIATE_ID;
  if (!affiliateId) {
    console.error('RAKUTEN_AFFILIATE_ID が未設定です。素の商品 URL で収集します。');
  }

  const pages = Number.parseInt(values.pages, 10);
  const fetchedAt = new Date().toISOString().slice(0, 10);
  const rows = [];
  const seen = new Set();
  let excluded = 0;

  for (let page = 1; page <= pages; page += 1) {
    const json = await fetchPage({ appId, accessKey, affiliateId, appUrl, keyword: values.keyword, page });
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

  const count = (fn) => rows.filter(fn).length;
  const withContent = count((r) => r.protein_per_100g !== null);
  const needContent = rows.length - withContent;

  console.log(`書き出し: ${outPath}`);
  console.log(`  取得        ${rows.length} 件（除外 ${excluded} 件）`);
  console.log(`  内容量 自動  ${count((r) => r.net_weight_g !== null)} 件`);
  console.log(`  内容量 曖昧  ${count((r) => r.net_weight_ambiguous)} 件 — 商品ページで確認して net_weight_g に記入`);
  console.log(`  画像 自動    ${count((r) => r.image_url !== null)} 件`);
  console.log(`  アフィリエイト ${count((r) => r.is_affiliate)} 件 — 残りは素の商品 URL`);
  console.log(`  含有量 自動  ${withContent} 件 — 説明文の栄養成分表示から読み取り`);
  console.log(`  含有量 曖昧  ${count((r) => r.label_ambiguous)} 件 — 食い違う値。必ず商品ページで確認する`);
  console.log(`  含有量 要入力 ${needContent} 件 — protein_per_100g を商品ページを見て記入`);
  console.log(`  ブランド 要入力 ${rows.length} 件 — API は店舗名しか返さない`);

  if (rows.length > 0) {
    const rate = Math.round((withContent / rows.length) * 100);
    console.log(`\n説明文から含有量を読み取れた割合: ${rate}%`);
  }
}

// テストから toDraftRow / buildSearchUrl を読むため、直接実行されたときだけ走らせる。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

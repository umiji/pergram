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
import { apiHeaders, buildApiUrl, pickBuyUrl, pickPostageIncluded, readCredentials } from './rakuten_api.js';

const REQUEST_INTERVAL_MS = 1100;
const HITS_PER_PAGE = 30;

/**
 * 検索の下限価格（円）。
 *
 * 小容量品・トライアル品を母集団から外す。カテゴリによって妥当な額が違うので、
 * buildSearchUrl の引数で上書きできるようにしてある（プロテイン以外で 3000 は妥当でない）。
 */
const MIN_PRICE_JPY = 3000;

/**
 * 取得順。🔒 これは「API から何を取ってくるか」であって掲載順ではない。
 *    掲載順は取り込み後に有効成分1単位あたりの価格だけで決まる。
 *
 * 価格の安い順（`+itemPrice`）は使わない。下限価格のすぐ真上の帯に張り付くためで、
 * minPrice 1500 で取り直したとき41件すべてが 1,510〜1,600円の小容量品になった。
 * 1,500円と3,000円の間に何千件もあるので、ページを重ねても主力商品帯へ届かない。
 *
 * 🔒 `+affiliateRate` / `-affiliateRate` は使わない。掲載順と無関係でも、
 *    母集団そのものが報酬の高い商品に偏る。
 */
const SORT = 'standard';

/** 初版データセットの絞り込み。validation-plan.md 段1 🔒 */
const EXCLUDE_PATTERNS = [
  /バー(?!ジン)/, // プロテインバー
  /シェイカー/,
  /ドリンク/,
  /ゼリー/,
  /クッキー/,
  /チップス/,
  /お試し/,
  /トライアル/,
  /サンプル/,
  /福袋/,
  /訳あり/,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function shouldExclude(itemName) {
  return EXCLUDE_PATTERNS.some((re) => re.test(itemName));
}

/**
 * 検索 URL を組む。
 * 🔒 `sort=+itemPrice` は API から取ってくる順序であって、掲載順ではない。
 *    掲載順は取り込み後に有効成分1単位あたりの価格で決まる。
 * affiliateId を渡すと、返ってくる itemUrl / affiliateUrl がアフィリエイト URL になる。
 */
export function buildSearchUrl({ appId, accessKey, affiliateId, keyword, page, minPrice = MIN_PRICE_JPY }) {
  return buildApiUrl({
    appId,
    accessKey,
    affiliateId,
    params: {
      keyword,
      hits: HITS_PER_PAGE,
      page,
      minPrice,
      sort: SORT,
      availability: 1,
    },
  });
}

async function fetchPage({ appId, accessKey, affiliateId, appUrl, keyword, page }) {
  const url = buildSearchUrl({ appId, accessKey, affiliateId, keyword, page });

  const res = await fetch(url, { headers: apiHeaders({ appUrl, purpose: 'data collection' }) });
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
    // 送料込みか送料別か。金額は取れないので2値だけ。判別できなければ null
    postage_included: pickPostageIncluded(item),
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

    // --- 読み取りの材料（後処理用） ---
    // 正規表現で拾えるのは説明文の一部だけ。読めなかった行を後から埋め直せるよう、
    // 元の説明文をそのまま持たせる。
    // 🔒 置くのは下書き（data/_drafts、.gitignore 済み）まで。公開データには入れない。
    item_caption: typeof item.itemCaption === 'string' && item.itemCaption.length > 0 ? item.itemCaption : null,

    // --- ここから人間が埋める ---
    brand: null, // API は店舗名しか返さない。商品名から判別して記入する
    excluded_reason: null, // 対象外にする場合は理由を書く（ブレンド品・カプセル等）
  };
}

/**
 * 引数を解く。名前付き（`--keyword X --pages 4`）が本則。
 *
 * Windows PowerShell 経由の `npm run collect:rakuten -- --keyword X --pages 4` は
 * フラグ名だけが落ちて値が位置引数として届くため、位置引数でも受ける。
 * 取りこぼすと既定のキーワードで黙って収集してしまう。
 */
export function resolveOptions(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      keyword: { type: 'string' },
      pages: { type: 'string' },
      out: { type: 'string' },
    },
  });

  // 名前付きで埋まっていない枠を、位置引数が [キーワード, ページ数] の順に埋める。
  // 🔒 余った位置引数は黙って捨てない。何を指したかったのか決められないため止める。
  const slots = [];
  if (values.keyword === undefined) slots.push('keyword');
  if (values.pages === undefined) slots.push('pages');
  if (positionals.length > slots.length) {
    throw new Error(`引数が多すぎます: ${positionals.join(' ')}`);
  }
  const filled = Object.fromEntries(positionals.map((v, i) => [slots[i], v]));

  const keyword = values.keyword ?? filled.keyword ?? 'ホエイプロテイン';
  const rawPages = values.pages ?? filled.pages ?? '3';
  const pages = Number.parseInt(rawPages, 10);
  if (!Number.isFinite(pages) || pages < 1) {
    throw new Error(`ページ数として読めません: ${rawPages}`);
  }

  return { keyword, pages, out: values.out };
}

async function main() {
  const options = resolveOptions(process.argv.slice(2));

  // 🔒 2026-02-10 の刷新以降、appId / accessKey / appUrl が揃わないと 400 / 403 になる。
  let appId;
  let accessKey;
  let appUrl;
  let affiliateId;
  try {
    ({ appId, accessKey, appUrl, affiliateId } = readCredentials(process.env));
  } catch (err) {
    console.error(err.message);
    console.error('https://webservice.rakuten.co.jp/ のアプリ情報から取得してください。');
    process.exit(1);
  }

  // 🔒 アフィリエイトを利用する。未設定のまま集めると素の URL になり、
  //    広告表示（「アフィリエイトリンクを含みます」）と食い違う。
  //    収集は下書きで止まるので警告に留める（価格更新は公開データを上書きするので止める）。
  if (!affiliateId) {
    console.error('RAKUTEN_AFFILIATE_ID が未設定です。素の商品 URL で収集します。');
  }

  const { keyword, pages } = options;
  const fetchedAt = new Date().toISOString().slice(0, 10);
  const rows = [];
  const seen = new Set();
  let excluded = 0;

  for (let page = 1; page <= pages; page += 1) {
    const json = await fetchPage({ appId, accessKey, affiliateId, appUrl, keyword, page });
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
    options.out ?? path.join('data', '_drafts', `rakuten_${keyword}_${fetchedAt}.json`);
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
  console.log(`  送料 判別    ${count((r) => r.postage_included !== null)} 件 — 込み / 別のみ。金額は取れない`);
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

/**
 * 楽天商品検索 API の呼び出し口。
 *
 * 🔒 エンドポイント・認証・レスポンスの読み方はここ一箇所に置く。
 *    収集（collect_rakuten.js）と価格更新（refresh_prices.js）が別々に持つと、
 *    片方だけ直したときにもう片方が古いまま残る。2026-02-10 の認証基盤刷新で
 *    実際にそれが起きた（収集は移行済み、価格更新は旧エンドポイントのまま）。
 */

import { SITE_ORIGIN } from '../src/lib/site.js';

/**
 * 🔒 2026-02-10 の認証基盤刷新でドメインと認証方式が変わった。
 *    旧 `app.rakuten.co.jp/services/api/` + 19桁の applicationId 単独では 400 になる。
 *    現行は openapi ドメイン + UUID の applicationId + accessKey + Referer ヘッダ。
 *
 * 🔒 **版（末尾の日付）は楽天が予告して廃止する。** 廃止されると認証もリファラ審査も
 *    通ったうえで 400 `API Configuration not found` が返る。認証情報が正しくても返るので
 *    「キーが失効した」ように見えるが、実際は版が消えている。版だけを差し替えれば直る。
 *    2026-08-17 に 20220601 が廃止され、日次の価格更新が7日間止まった。
 */
export const ENDPOINT = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401';

/**
 * 問い合わせ URL を組む。
 *
 * affiliateId を渡すと、返ってくる affiliateUrl がアフィリエイト URL になる。
 * 🔒 報酬率（affiliateRate）は検索条件にも使わないし、読みもしない。
 */
export function buildApiUrl({ appId, accessKey, affiliateId, params = {} }) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('applicationId', appId);
  url.searchParams.set('accessKey', accessKey);
  if (affiliateId) url.searchParams.set('affiliateId', affiliateId);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set('format', 'json');
  return url;
}

/**
 * 🔒 Referer が無いと 403 REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING。
 *    楽天に登録したアプリ URL を送る。
 */
export function apiHeaders({ appUrl, purpose }) {
  return {
    'User-Agent': `pergram/0.1 (${purpose})`,
    Referer: appUrl,
    Origin: new URL(appUrl).origin,
  };
}

/**
 * 失敗した応答から、直す場所の当たりを付ける。**握り潰さない。**
 * 呼び出し側は投げるエラーにこの一言を足すだけで、失敗はそのまま失敗として落ちる。
 *
 * 🔒 このワークフローは、まったく違う原因で2度止まっている。
 *    2026-08-17 は版の廃止（400）、2026-08-25 は Referer の不一致（403）。
 *    どちらも「認証情報が失効した」ように見えるのに、直す場所が別なので、
 *    応答の見分け方をコード側に固定する。
 *
 * 🔒 手がかりに認証情報の実値を混ぜない（App URL も含む）。GitHub Actions の
 *    ログにそのまま出る。一致するか否かだけを言い、値は言わない。
 *
 * @param {{status: number, body: string, appUrl?: string}} args
 * @returns {string} 心当たりが無ければ空文字
 */
export function describeApiFailure({ status, body, appUrl }) {
  const text = typeof body === 'string' ? body : '';

  if (status === 400 && text.includes('API Configuration not found')) {
    return (
      'API の版（エンドポイント末尾の日付）が廃止されている疑いが濃い。' +
      '認証もリファラ審査も通ったうえで返るため、キーが失効したように見える。' +
      'scripts/rakuten_api.js の ENDPOINT の版を差し替える（2026-08-17 に 20220601 が廃止された前例あり）。'
    );
  }

  if (text.includes('REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING')) {
    return (
      'REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING — Referer が送られていない。' +
      'RAKUTEN_APP_URL が空でないか確認する。値が届いたうえで拒否される' +
      'HTTP_REFERRER_NOT_ALLOWED とは別のエラーである。'
    );
  }

  if (text.includes('HTTP_REFERRER_NOT_ALLOWED')) {
    return (
      'HTTP_REFERRER_NOT_ALLOWED — Referer に載せた RAKUTEN_APP_URL が、' +
      '楽天デベロッパー画面に登録したアプリ URL と一致していない。' +
      'Referer が届いていない場合（REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING）とは別で、' +
      '届いたうえで拒否されている。ドメインを移したのに RAKUTEN_APP_URL を' +
      '更新していないときに起きる。' +
      refererOriginNote(appUrl)
    );
  }

  return '';
}

/** 送った Referer が正規ドメインかどうかだけを言う。値そのものは言わない。 */
function refererOriginNote(appUrl) {
  const canonicalHost = new URL(SITE_ORIGIN).hostname;
  let sentHost = null;
  try {
    sentHost = new URL(appUrl).hostname;
  } catch {
    return '送信した Referer が URL として読めなかった。RAKUTEN_APP_URL の形式を確認する。';
  }

  return sentHost === canonicalHost
    ? '送信した Referer のホストは、このサイトの正規ドメインと一致している。' +
        'その場合は楽天デベロッパー画面のアプリ URL 側を確認する。'
    : `送信した Referer のホストは、このサイトの正規ドメイン（${canonicalHost}）と一致していない。` +
        'GitHub Environment `pergram-dev` の RAKUTEN_APP_URL が古い可能性が高い。';
}

/**
 * 購入リンク。affiliateId を渡していればアフィリエイト URL が返る。
 * 参加していない店舗では返らないので、その場合は素の商品 URL を使う。
 * 🔒 報酬率（affiliateRate）は読まない。持たなければ「報酬の高い順」を作れない。
 */
export function pickBuyUrl(item) {
  const affiliate = typeof item.affiliateUrl === 'string' ? item.affiliateUrl.trim() : '';
  return affiliate.length > 0
    ? { url: affiliate, isAffiliate: true }
    : { url: item.itemUrl, isAffiliate: false };
}

/**
 * 送料が商品価格に含まれるか。
 *
 * 🔒 送料の**金額**は API から取れない。取れるのは含むか否かの2値だけ。
 *    `postageFlag` は 0 = 送料込み / 1 = 送料別（楽天商品検索 API）。
 *    判別できないものは null にして、画面には何も出さない。送料無料と決めつけない。
 */
export function pickPostageIncluded(item) {
  const flag = item.postageFlag;
  if (flag === null || flag === undefined || flag === '') return null;
  const value = Number(flag);
  if (value === 0) return true;
  if (value === 1) return false;
  return null;
}

/**
 * 認証情報を環境変数から取り出す。欠けていれば何が足りないかを名指しして止める。
 *
 * @param {Record<string, string|undefined>} env
 * @param {{requireAffiliate: boolean}} options
 *   🔒 価格更新は公開中の購入リンクを上書きするため、アフィリエイト ID の欠落を
 *      警告で済ませられない（素の URL で全上書きしてしまう）。
 */
export function readCredentials(env, { requireAffiliate = false } = {}) {
  const appId = env.RAKUTEN_APP_ID;
  const accessKey = env.RAKUTEN_ACCESS_KEY;
  const appUrl = env.RAKUTEN_APP_URL;
  const affiliateId = env.RAKUTEN_AFFILIATE_ID;

  const missing = [
    !appId && 'RAKUTEN_APP_ID（UUID 形式）',
    !accessKey && 'RAKUTEN_ACCESS_KEY',
    !appUrl && 'RAKUTEN_APP_URL（Referer に使う。楽天に登録したアプリ URL）',
    requireAffiliate && !affiliateId && 'RAKUTEN_AFFILIATE_ID',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`未設定: ${missing.join(' / ')}`);
  }
  return { appId, accessKey, appUrl, affiliateId: affiliateId || null };
}

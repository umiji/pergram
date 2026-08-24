/**
 * 楽天商品検索 API の呼び出し口。
 *
 * 🔒 エンドポイント・認証・レスポンスの読み方はここ一箇所に置く。
 *    収集（collect_rakuten.js）と価格更新（refresh_prices.js）が別々に持つと、
 *    片方だけ直したときにもう片方が古いまま残る。2026-02-10 の認証基盤刷新で
 *    実際にそれが起きた（収集は移行済み、価格更新は旧エンドポイントのまま）。
 */

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

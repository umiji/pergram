/**
 * Cloudflare のレスポンスヘッダ（Workers の静的アセットが dist/_headers を読む）。
 *
 * 🔒 外部から読み込むものを足したら、必ずここに許可を書く。忘れるとブラウザが
 *    黙ってブロックし、画面には何も出ない（エラーはコンソールにしか出ない）。
 * 🔒 許可するオリジンは設定から受け取る。ドメインを2箇所に書かない。
 */

/**
 * 外部オリジンを1つ足した値を作る。null なら元のまま。
 * @param {string} base
 * @param {string | null} origin
 */
function withOrigin(base, origin) {
  return origin ? `${base} ${origin}` : base;
}

/**
 * 計測ビーコンの送信先（fetch / sendBeacon / XHR）。
 *
 * 🔒 `img-src` が `https:` を許しているせいで、ピクセルで送るタグだけは動く。
 *    落ちるのは fetch / beacon で送るものだけなので、「広告タグは発火しているのに
 *    GA4 だけ空」という紛らわしい壊れ方をする。画面には一切出ない。
 * 🔒 `https://*.analytics.google.com` は `analytics.google.com` 自身にマッチしない
 *    （ワイルドカードはラベルを1つ埋める指定であって、0個は埋められない）。
 *    GA4 の `page_view` が飛ぶ先はまさにその `analytics.google.com` なので、
 *    ワイルドカードだけ書いて済ませると全計測が落ちたままになる。完全一致で必ず書く。
 * 🔒 `https:` や `*` で塞がない。必要なホストだけを列挙する。
 */
const MEASUREMENT_CONNECT_SRC = [
  'https://analytics.google.com',
  'https://*.analytics.google.com',
  'https://www.google-analytics.com',
  'https://*.google-analytics.com',
  'https://*.googletagmanager.com',
  'https://www.google.com',
  // 🔒 裸のホスト。`https://www.google.com` は `www.` 付きにしかマッチしない。
  //    Google 広告のコンバージョン計測が `https://google.com/ccm/form-data/...` へ送る。
  'https://google.com',
  'https://www.googleadservices.com',
  // `googleads.g.doubleclick.net` / `stats.g.doubleclick.net`
  'https://*.g.doubleclick.net',
  // 🔒 上のワイルドカードにマッチしない。`ad.doubleclick.net` には `.g.` の階層が無く、
  //    `*` はラベルを1つ埋める指定なので `g` の位置を飛ばせない。
  //    `*.doubleclick.net` へまとめない — 必要のないサブドメインまで開く。
  'https://ad.doubleclick.net',
];

/**
 * 計測スクリプトの配信元。
 *
 * 🔒 **`connect-src` を直すと、その先で `script-src` が落ちる。** ビーコンが通るように
 *    なって初めて処理が次の段階へ進み、そこで新しい違反が露出する。ホストを列挙して
 *    照合するだけでは尽きたと判定できない。**足したら必ずブラウザで実測して違反0件を確かめる。**
 */
const MEASUREMENT_SCRIPT_SRC = [
  // gtag.js 本体
  'https://www.googletagmanager.com',
  // Cloudflare Web Analytics のビーコン。Cloudflare が応答に注入するため HTML に現れない
  'https://static.cloudflareinsights.com',
  // 🔒 Google 広告のリマーケティングタグは、このホストから
  //    `/pagead/viewthroughconversion/<id>/` を **スクリプトとして読み込む**。
  //    同じホストを `connect-src` の `https://*.g.doubleclick.net` で許可済みだが、
  //    **ディレクティブが違うので script の読み込みには効かない。**
  //    ここを「connect-src にあるから重複」と読んで消すと、広告の計測だけが静かに落ちる。
  'https://googleads.g.doubleclick.net',
];

/**
 * Content-Security-Policy の値。
 *
 * - `script-src` に `'unsafe-inline'` が要るのは GA4 の初期化スニペットが
 *   インラインだから（src/templates/layout.js）。静的ビルドなのでリクエストごとの
 *   nonce を発行できない。
 * - `style-src` の `'unsafe-inline'` は支援ウィジェットが実行時に `<style>` を
 *   差し込むため。フォントの self-host（design.md §8 未達）が済めば
 *   `fonts.googleapis.com` の許可は外せる。
 * - 支援ウィジェット（Codoc）は script / stylesheet / API 取得の3経路を使う。
 *   決済は iframe ではなく別ウィンドウなので `frame-src` は要らない。
 * - 🔒 支援ウィジェットを出す市場だけ `script-src` に `'unsafe-eval'` を足す。
 *   Codoc の `cms-core.js` は Vue のテンプレートコンパイラ入りビルドで、
 *   埋め込み要素のテンプレートを `new Function(...)` で描画関数に変換する。
 *   これが CSP に阻まれると Vue は例外を握り潰して描画関数を空関数に差し替えるため、
 *   **スクリプトの取得も API 通信も成功しているのに、要素だけが空になる**。
 *   本番ビルドの Vue は警告を出さないので、コンソールにも痕跡が残らない。
 *   支援設定が無い市場（US）には付けない。緩めるのは理由のある側だけにする。
 *
 * @param {{ supportOrigin?: string | null }} options
 */
export function contentSecurityPolicy({ supportOrigin = null } = {}) {
  const scriptKeywords = supportOrigin
    ? `'self' 'unsafe-inline' 'unsafe-eval'`
    : `'self' 'unsafe-inline'`;
  const scriptSrc = ['script-src', scriptKeywords, ...MEASUREMENT_SCRIPT_SRC].join(' ');

  return [
    `default-src 'self'`,
    withOrigin(scriptSrc, supportOrigin),
    withOrigin(`style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, supportOrigin),
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: https:`,
    withOrigin([`connect-src 'self'`, ...MEASUREMENT_CONNECT_SRC].join(' '), supportOrigin),
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
  ].join('; ');
}

/** dist/_headers の中身。 */
export function headersFile({ supportOrigin = null } = {}) {
  return `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: ${contentSecurityPolicy({ supportOrigin })}
`;
}

/**
 * 支援ウィジェットの読み込み元オリジン。設定が無ければ null。
 * @param {{ scriptSrc: string } | null | undefined} support
 */
export function supportOriginOf(support) {
  return support ? new URL(support.scriptSrc).origin : null;
}

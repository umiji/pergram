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
  const scriptSrc = supportOrigin
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com`
    : `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com`;

  return [
    `default-src 'self'`,
    withOrigin(scriptSrc, supportOrigin),
    withOrigin(`style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, supportOrigin),
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: https:`,
    withOrigin(`connect-src 'self' https://www.google-analytics.com`, supportOrigin),
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

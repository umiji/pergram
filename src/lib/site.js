/**
 * サイトの絶対 URL と OGP 画像。
 *
 * 🔒 ドメインの唯一の出所。ここ以外に本番 URL を書かない。
 *    canonical / og:url / og:image はいずれも**絶対 URL でなければ無視される**
 *    （SNS のクローラは相対パスを解決しない）。相対パスで書くと、タグは
 *    入っているのにサムネイルだけ出ない状態になり、画面上は何の異常も見えない。
 *
 * 配信先を変えるときは SITE_ORIGIN 環境変数で上書きできる（プレビュー用）。
 */

/** 本番の配信元。docs/ops/deploy.md の Workers 配信先と同じ値に保つ。 */
export const SITE_ORIGIN = process.env.SITE_ORIGIN ?? 'https://pergram.pergram-official.workers.dev';

/**
 * OGP 画像。
 *
 * 🔒 SVG は使えない。X / Facebook / LINE / Slack はいずれも OGP 画像の SVG を
 *    描画しない。サイト内の <img> は SVG のままでよいが、OGP だけは別に
 *    ラスタ画像（PNG / JPEG）を置く。
 * 🔒 width / height は実ファイルの寸法と一致させる。食い違うと初回シェア時に
 *    レイアウトが崩れる。tests/render.test.js が実ファイルと突き合わせている。
 */
export const OG_IMAGE = {
  path: '/assets/images/pergram_logo_ogp.jpg',
  type: 'image/jpeg',
  width: 1024,
  height: 1024,
};

/** OGP の og:locale。表示言語の指定であって market ではない。 */
const OG_LOCALES = { ja: 'ja_JP', en: 'en_US' };

/**
 * サイト内のパスを絶対 URL にする。
 * @param {string} relPath 先頭が / のパス
 */
export function absoluteUrl(relPath) {
  return new URL(relPath, SITE_ORIGIN).href;
}

/**
 * @param {string} locale
 */
export function ogLocale(locale) {
  return OG_LOCALES[locale] ?? OG_LOCALES.ja;
}

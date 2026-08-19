/**
 * 構造化データ（JSON-LD）。検索エンジンと LLM に「このページが何か」を機械可読で渡す。
 *
 * 🔒 aggregateRating / review を入れない（N-08）。レビューは扱わない。
 * 🔒 独自スコアを表す型（Rating 等）を入れない（N-03）。順位は単価の昇順という事実だけ。
 * 🔒 成分の働きを説明する文字列を入れない（N-02）。
 * 🔒 ドメインは src/lib/site.js から受け取る。ここに書かない。
 */

import { SITE_ORIGIN, absoluteUrl } from './site.js';

/** サイト全体を指す @id。ページをまたいで同じ実体を指すために固定する */
export const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;
export const WEBSITE_ID = `${SITE_ORIGIN}/#website`;

/**
 * JSON-LD を `<script>` に埋め込める文字列にする。
 *
 * 🔒 `<` と `&` をエスケープする。製品名に `</script>` が入っていなくても、
 *    `<` を含む文字列があるだけで HTML パーサはそこでスクリプトを打ち切る。
 *    JSON としては `<` も `<` と同じ意味なので、値は壊れない。
 *
 * @param {object[]} objects 空配列なら空文字を返す
 */
export function jsonLdScript(objects) {
  const items = objects.filter(Boolean);
  if (items.length === 0) return '';

  const payload = JSON.stringify(items.length === 1 ? items[0] : items)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');

  return `<script type="application/ld+json">${payload}</script>`;
}

/**
 * 運営者。ワードマークとタグラインは必ずセットという規則をここでも守る。
 * @param {{ name: string, tagline: string, logoPath: string }} opts
 */
export function organization({ name, tagline, logoPath }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name,
    url: SITE_ORIGIN,
    slogan: tagline,
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl(logoPath),
    },
  };
}

/**
 * サイト本体。
 * @param {{ name: string, description: string, locale: string, lpPath: string }} opts
 */
export function webSite({ name, description, locale, lpPath }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name,
    url: absoluteUrl(lpPath),
    description,
    inLanguage: locale,
    publisher: { '@id': ORGANIZATION_ID },
  };
}

/**
 * パンくず。階層をクローラに明示する。
 * @param {{ name: string, path: string }[]} trail 先頭がトップ
 */
export function breadcrumbList(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: entry.name,
      item: absoluteUrl(entry.path),
    })),
  };
}

/**
 * 並び順そのものを機械可読にする。
 *
 * 🔒 `itemListOrder` は Ascending 固定。単価の昇順であることが順位の全てで、
 *    それ以外の根拠を持たせない（N-03）。
 * 🔒 呼び出し側が渡す names は**実際に描画した順**でなければならない。
 *    表示と構造化データがずれると、機械には後者が事実として読まれる。
 *
 * @param {{ name: string, names: string[], pagePath: string }} opts
 */
export function itemList({ name, names, pagePath }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url: absoluteUrl(pagePath),
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: names.length,
    itemListElement: names.map((itemName, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: itemName,
    })),
  };
}

import { escapeHtml } from '../lib/i18n.js';
import { OG_IMAGE, absoluteUrl, ogLocale } from '../lib/site.js';

/**
 * 全ページ共通の外枠。
 *
 * 🔒 lang は locale、免責は market。この2つを取り違えない。
 *    日本在住者が英語 UI で見ていても、適用されるのは日本の規制。
 */
/**
 * meta タグおよび <title> 用のエスケープ関数。
 * 🔒 <br> や改行コードが <title> や og:title に混入することを防ぐ。
 */
export function cleanMetaText(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>|\n/gi, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\s+/g, ' ')
    .trim();
}

export function layout({
  locale,
  title,
  description,
  bodyClass = '',
  head = '',
  content,
  gaMeasurementId,
  canonicalPath,
  siteName = '',
  ogImageAlt = '',
}) {
  const metaTitle = cleanMetaText(title);
  const metaDesc = cleanMetaText(description);
  // 🔒 canonical / og:url / og:image はすべて絶対 URL。相対パスは SNS 側で解決されない
  const pageUrl = canonicalPath ? absoluteUrl(canonicalPath) : null;
  const ogImageUrl = absoluteUrl(OG_IMAGE.path);

  const ga = gaMeasurementId
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(gaMeasurementId)}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  // 個人識別情報を送らない。メールアドレスをイベントパラメータに含めない
  gtag('config', ${JSON.stringify(gaMeasurementId)});
</script>`
    : '';

  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${metaTitle}</title>
<meta name="description" content="${metaDesc}">
<link rel="icon" type="image/svg+xml" href="/assets/images/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/images/favicon.png">
<link rel="apple-touch-icon" href="/assets/images/favicon.png">
${pageUrl ? `<link rel="canonical" href="${escapeHtml(pageUrl)}">` : ''}
<meta property="og:title" content="${metaTitle}">
<meta property="og:description" content="${metaDesc}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${escapeHtml(ogLocale(locale))}">
${siteName ? `<meta property="og:site_name" content="${cleanMetaText(siteName)}">` : ''}
${pageUrl ? `<meta property="og:url" content="${escapeHtml(pageUrl)}">` : ''}
<meta property="og:image" content="${escapeHtml(ogImageUrl)}">
<meta property="og:image:type" content="${escapeHtml(OG_IMAGE.type)}">
<meta property="og:image:width" content="${OG_IMAGE.width}">
<meta property="og:image:height" content="${OG_IMAGE.height}">
${ogImageAlt ? `<meta property="og:image:alt" content="${cleanMetaText(ogImageAlt)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap">
<link rel="stylesheet" href="/assets/tokens.css">
<link rel="stylesheet" href="/assets/site.css">
${head}
${ga}
</head>
<body class="${escapeHtml(bodyClass)}">
${content}
</body>
</html>
`;
}

/**
 * ワードマーク。
 * 🔒 初回接触（LP・OGP・広告）ではタグラインと必ずセットで出す。
 *    `-gram` が Instagram / Telegram の連想を呼ぶため、単体では SNS アプリに見える。
 */
export function wordmark(t, { withTagline = false, href = '/', as = 'a' } = {}) {
  const brandName = escapeHtml(t('brand.name'));
  const inner = `<img class="brand__logo-img" src="/assets/images/pergram_logo.svg" alt="${brandName}" width="140" height="30">${
    withTagline ? `<span class="brand__tagline">${escapeHtml(t('brand.tagline'))}</span>` : ''
  }`;

  if (as === 'div') return `<div class="brand">${inner}</div>`;
  return `<a class="brand" href="${escapeHtml(href)}">${inner}</a>`;
}

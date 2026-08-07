import { escapeHtml } from '../lib/i18n.js';

/**
 * 全ページ共通の外枠。
 *
 * 🔒 lang は locale、免責は market。この2つを取り違えない。
 *    日本在住者が英語 UI で見ていても、適用されるのは日本の規制。
 */
export function layout({
  locale,
  title,
  description,
  bodyClass = '',
  head = '',
  content,
  gaMeasurementId,
  canonicalPath,
}) {
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
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${canonicalPath ? `<link rel="canonical" href="${escapeHtml(canonicalPath)}">` : ''}
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
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
  const inner = `<span class="brand__name">${escapeHtml(t('brand.name'))}</span>${
    withTagline ? `<span class="brand__tagline">${escapeHtml(t('brand.tagline'))}</span>` : ''
  }`;

  if (as === 'div') return `<div class="brand">${inner}</div>`;
  return `<a class="brand" href="${escapeHtml(href)}">${inner}</a>`;
}

/**
 * 成分ごとの製品一覧ページ（/{locale}/{nutrient}/）。
 * 構成は docs/design/Product_page_pc_mock / _sp_mock の Claude Design 版を移植したもの。
 *
 * 🔒 一覧は <ol>。順位が意味を持つので div で組まない。
 * 🔒 並び順は有効成分1単位あたりの価格の昇順で固定。
 *    ユーザーが操作できるのは絞り込みと、副指標の表示切替と、カード/リストの見た目だけ。
 * 🔒 レビュー星評価・レビュー件数は扱わない（N-08）。
 * 🔒 独自の総合スコアを作らない（N-03）。順位は計算結果だけで決まる。
 */

import { escapeHtml } from '../lib/i18n.js';
import { layout } from './layout.js';
import { filters } from './products/filters.js';
import { productItem } from './products/item.js';
import { affiliateNotice, appHeader, explainer, pageHead } from './products/head.js';

/** 初期表示する件数。残りは hidden のまま描画し、ボタンで開く */
const PAGE_SIZE = 24;

function productList(rows, ctx) {
  const baseline = rows.length === 0 ? null : rows[0].costPerNutrientUnit;

  const items = rows
    .map((row, i) => {
      const html = productItem(row, i, { ...ctx, baseline });
      return i < PAGE_SIZE ? html : html.replace('<li class="p-item', '<li hidden data-overflow class="p-item');
    })
    .join('\n');

  return `<ol class="p-list" id="products" data-view="card" data-metric="${escapeHtml(
    ctx.secondaryMetrics[0] ?? '',
  )}">${items}</ol>`;
}

export function productsPage(ctx) {
  const {
    t,
    locale,
    market,
    rows,
    nutrientId,
    nutrientName,
    updatedAt,
    category,
    gaMeasurementId,
    waitlistPath,
    nutrients,
  } = ctx;

  const displayUnit = category.displayUnit;
  const secondaryMetrics = category.secondaryMetrics ?? [];
  const inner = {
    ...ctx,
    displayUnit,
    secondaryMetrics,
    currency: market.currency,
    activeNutrientId: nutrientId,
  };

  const hidden = Math.max(0, rows.length - PAGE_SIZE);

  const body =
    rows.length === 0
      ? `<p class="empty-state">${escapeHtml(t('products.notRegistered'))}</p>`
      : `${productList(rows, inner)}
    <p class="p-list__empty" hidden>
      ${escapeHtml(t('products.empty'))}
      <button class="link-button" type="button" data-filter-reset>${escapeHtml(
        t('products.emptyReset'),
      )}</button>
    </p>
    ${
      hidden === 0
        ? ''
        : `<div class="p-list__more">
      <button class="btn btn--ghost" type="button" data-show-more>${escapeHtml(
        t('products.more', { count: hidden }),
      )}</button>
    </div>`
    }`;

  const waitlistBanner = waitlistPath
    ? `<aside class="waitlist-banner">
    <p>${escapeHtml(t('products.waitlistNote'))}</p>
    <a class="btn btn--signal" href="${escapeHtml(waitlistPath)}">${escapeHtml(
      t('products.waitlistCta'),
    )}</a>
  </aside>`
    : '';

  const content = `<a class="skip-link" href="#products">${escapeHtml(t('products.skipToList'))}</a>
${appHeader({ t, locale, waitlistPath })}

<div class="app-shell">
  <div class="app-shell__filters" data-filter-panel>
    <div class="app-shell__scrim" data-filter-close></div>
    ${filters(inner)}
  </div>

  <main class="app-main">
    ${pageHead(inner)}
    ${explainer({ t, explainerKey: category.explainerKey })}
    ${affiliateNotice({ t, nutrientName, displayUnit })}
    ${body}
    ${waitlistBanner}
  </main>
</div>

<footer class="site-foot">
  <div class="site-foot__inner">
    <div class="site-foot__brand">
      <p class="site-foot__wordmark">${escapeHtml(t('brand.name'))}</p>
      <p class="site-foot__about">${escapeHtml(t('lp.foot.about'))}</p>
      <p class="site-foot__copy">${escapeHtml(t('lp.foot.copyright'))}</p>
    </div>
    <div class="site-foot__legal">
      <p class="site-foot__heading">${escapeHtml(t('lp.section5.heading'))}</p>
      <ul class="site-foot__list">
        <li>${escapeHtml(t('lp.section5.item2'))}</li>
        <li>${escapeHtml(t('lp.section5.item3'))}</li>
        <li>${escapeHtml(t('lp.section5.item4'))}</li>
      </ul>
      <p class="disclosure__line">${escapeHtml(t(`${ctx.disclosureKey}.dataSource`))}</p>
      <p class="disclosure__line">${escapeHtml(t(`${ctx.disclosureKey}.affiliate`))}</p>
      <p class="disclosure__line">${escapeHtml(t(`${ctx.disclosureKey}.medical`))}</p>
    </div>
  </div>
</footer>

<script src="/assets/products.js" defer></script>`;

  return layout({
    locale,
    title: `${t('products.title', { nutrient: nutrientName, unit: displayUnit })} — ${t('brand.name')}`,
    description: t('ranking.subtitle', { nutrient: nutrientName, unit: displayUnit }),
    bodyClass: 'app-body',
    content,
    gaMeasurementId,
    head: `<link rel="stylesheet" href="/assets/products.css">
<meta name="theme-color" content="#FAFAF7">`,
  });
}

export { PAGE_SIZE };

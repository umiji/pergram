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
import { layout, wordmark } from './layout.js';
import { filters } from './products/filters.js';
import { productItem } from './products/item.js';
import { affiliateNotice, appHeader, explainer, pageHead, toolbar } from './products/head.js';

/**
 * 初期表示する件数。残りも HTML には出しておき、hidden で伏せる。
 * 検索エンジンには全件見えるし、JS が無くても上位 PAGE_SIZE 件は読める。
 */
const PAGE_SIZE = 10;

/** 「さらに表示」1回で増える件数。実際の増分は残り件数との小さい方 */
const PAGE_STEP = 20;

function productList(rows, ctx) {
  const baseline = rows.length === 0 ? null : rows[0].costPerNutrientUnit;

  const items = rows
    .map((row, i) => {
      const html = productItem(row, i, { ...ctx, baseline });
      return i < PAGE_SIZE ? html : html.replace('<li class="p-item', '<li hidden data-overflow class="p-item');
    })
    .join('\n');

  const { t, displayUnit } = ctx;
  const headerHtml = `<div class="p-list-header" aria-hidden="true">
  <div class="p-list-header__cell p-list-header__cell--rank">${escapeHtml(t('products.table.rank'))}</div>
  <div class="p-list-header__cell p-list-header__cell--product">${escapeHtml(t('products.table.product'))}</div>
  <div class="p-list-header__cell p-list-header__cell--cost">${escapeHtml(t('products.table.unitCost', { unit: displayUnit }))}</div>
  <div class="p-list-header__cell p-list-header__cell--weight">${escapeHtml(t('products.table.netWeight'))}</div>
  <div class="p-list-header__cell p-list-header__cell--nutrient-weight">${escapeHtml(t('products.table.nutrientAmount'))}</div>
  <div class="p-list-header__cell p-list-header__cell--price">${escapeHtml(t('products.table.price'))}</div>
  <div class="p-list-header__cell p-list-header__cell--postage">${escapeHtml(t('products.table.postage'))}</div>
  <div class="p-list-header__cell p-list-header__cell--shop">${escapeHtml(t('products.table.shop'))}</div>
</div>`;

  return `<div class="p-list-wrapper">${headerHtml}<ol class="p-list" id="products" data-view="card" data-nutrient="${escapeHtml(ctx.nutrientId)}" data-page-size="${PAGE_SIZE}" data-metric="${escapeHtml(
    ctx.secondaryMetrics[0] ?? '',
  )}">${items}</ol></div>`;
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
      <button class="btn btn--ghost" type="button" data-show-more data-step="${PAGE_STEP}">${escapeHtml(
        t('products.more'),
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
    ${toolbar(inner)}
    ${body}
    ${waitlistBanner}
  </main>
</div>

<footer class="site-foot">
  <div class="site-foot__inner">
    <div class="site-foot__brand">
      <div class="site-foot__wordmark">${wordmark(t, { href: `/${locale}/` })}</div>
      <p class="site-foot__about">${escapeHtml(t('lp.foot.about'))}</p>
    </div>
    <div class="site-foot__legal">
      ${t(`${ctx.disclosureKey}.affiliate`) ? `<p class="disclosure__line">${escapeHtml(t(`${ctx.disclosureKey}.affiliate`))}</p>` : ''}
      ${t(`${ctx.disclosureKey}.dataSource`) ? `<p class="disclosure__line">${escapeHtml(t(`${ctx.disclosureKey}.dataSource`))}</p>` : ''}
      ${t(`${ctx.disclosureKey}.medical`) ? `<p class="disclosure__line">${escapeHtml(t(`${ctx.disclosureKey}.medical`))}</p>` : ''}
    </div>
  </div>
  <div class="site-foot__bottom">
    <p class="site-foot__copy">${escapeHtml(t('lp.foot.copyright'))}</p>
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
    canonicalPath: ctx.canonicalPath ?? null,
    siteName: t('brand.name'),
    ogImageAlt: `${t('brand.name')} — ${t('brand.tagline')}`,
    head: `<link rel="stylesheet" href="/assets/products.css">
<meta name="theme-color" content="#FAFAF7">`,
  });
}

export { PAGE_SIZE };

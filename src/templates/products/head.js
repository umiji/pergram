/**
 * 商品一覧ページのヘッダ・見出し・ツールバー・解説・広告表示。
 *
 * 🔒 並び順は主指標で固定。ツールバーで切り替えられるのは
 *    「副指標として何を出すか」と「カード / リスト」だけ。
 *    製品価格順・含有率順・レビュー順のセレクトは置かない
 *    （requirements: 並び順を決めるのは常に有効成分1単位あたりの価格）。
 * 🔒 広告表示は locale ではなく market に紐づく。常時表示し、折りたたまない。
 */

import { escapeHtml } from '../../lib/i18n.js';
import { formatDate } from '../../lib/format.js';
import { wordmark } from '../layout.js';

/** アイコンは操作の記号だけ。効能・推薦を連想させる形を置かない */
const iconSearch = `<svg viewBox="0 0 26 26" fill="none" aria-hidden="true" focusable="false">
  <circle cx="11" cy="11" r="7.5" stroke="currentColor" stroke-width="2"/>
  <line x1="16.3" y1="16.3" x2="22" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const iconFilter = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
  <line x1="3" y1="7" x2="21" y2="7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="3" y1="17" x2="21" y2="17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="9" cy="7" r="2.4" fill="var(--surface)" stroke="var(--signal)" stroke-width="1.8"/>
  <circle cx="15" cy="12" r="2.4" fill="var(--surface)" stroke="var(--signal)" stroke-width="1.8"/>
  <circle cx="7" cy="17" r="2.4" fill="var(--surface)" stroke="var(--signal)" stroke-width="1.8"/>
</svg>`;

const iconCard = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
  <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.7"/>
  <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.7"/>
  <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.7"/>
  <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.7"/>
</svg>`;

const iconList = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
  <line x1="2.5" y1="5" x2="17.5" y2="5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
  <line x1="2.5" y1="10" x2="17.5" y2="10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
  <line x1="2.5" y1="15" x2="17.5" y2="15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
</svg>`;

const iconInfo = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
  <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.6"/>
  <line x1="10" y1="9" x2="10" y2="14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="10" cy="6.2" r="1" fill="currentColor"/>
</svg>`;

/**
 * サイト共通のヘッダ。
 * 検証期間中は Waitlist へ戻す導線をここに残す（LP から来た人が予約せずに離脱しないように）。
 */
export function appHeader({ t, locale, waitlistPath }) {
  const waitlist = waitlistPath
    ? `<a class="btn btn--signal app-head__cta" href="${escapeHtml(waitlistPath)}">
      ${escapeHtml(t('products.waitlistCta'))}
    </a>`
    : '';

  return `<header class="app-head">
  <div class="app-head__inner">
    ${wordmark(t, { href: `/${locale}/` })}
    <div class="app-head__search">
      <span class="app-head__search-icon">${iconSearch}</span>
      <label class="u-visually-hidden" for="product-search">${escapeHtml(t('products.searchLabel'))}</label>
      <input id="product-search" type="search" autocomplete="off"
        placeholder="${escapeHtml(t('products.searchPlaceholder'))}" data-product-search>
    </div>
    ${waitlist}
  </div>
</header>`;
}

export function toolbar(ctx) {
  const { t } = ctx;

  const viewButton = (value, label, icon, pressed) =>
    `<button class="viewswitch__btn" type="button" data-view-set="${value}" aria-pressed="${pressed}">
      <span class="viewswitch__icon">${icon}</span>
      <span class="viewswitch__label">${escapeHtml(label)}</span>
    </button>`;

  return `<div class="toolbar">
    <button class="toolbar__filter" type="button" data-filter-open aria-controls="filters" aria-expanded="false">
      <span class="toolbar__filter-icon">${iconFilter}</span>
      <span>${escapeHtml(t('filters.heading'))}</span>
      <span class="toolbar__filter-count num" data-active-count hidden>0</span>
    </button>

    <div class="viewswitch" role="group" aria-label="${escapeHtml(t('products.viewLabel'))}">
      ${viewButton('card', t('products.view.card'), iconCard, 'true')}
      ${viewButton('list', t('products.view.list'), iconList, 'false')}
    </div>
  </div>`;
}

/**
 * ページ見出し。
 *
 * 掲載件数は出さない。絞り込みの結果件数は絞り込みシートの適用ボタンが持っていて、
 * 見出しに置くと「掲載数」なのか「表示中の数」なのか読み手に判別できない
 * （初期表示を上位10件に絞っているので、必ず食い違う）。
 */
export function pageHead(ctx) {
  const { t, locale, nutrientName, displayUnit, updatedAt } = ctx;

  const updated = formatDate(updatedAt, { locale });

  return `<div class="page-head">
  <div class="page-head__titles">
    <h1>${escapeHtml(t('products.title', { nutrient: nutrientName, unit: displayUnit }))}</h1>
    ${
      updated === null
        ? ''
        : `<p class="page-head__meta">${escapeHtml(t('products.updatedAt', { date: updated }))}</p>`
    }
  </div>
</div>`;
}

/**
 * 単価の出し方。
 *
 * 🔒 成分の働き・体内での挙動は書かない。書いてよいのは価格を含有量で割るという
 *    計算方法だけ。文言は locales の固定文で、コードから組み立てない。
 *    定型文を持たない成分では explainerKey が null になり、何も表示しない。
 */
export function explainer({ t, explainerKey }) {
  if (!explainerKey) return '';
  return `<section class="explainer" aria-labelledby="explainer-title">
  <p class="explainer__label" id="explainer-title">${escapeHtml(t('products.explainerLabel'))}</p>
  <p class="explainer__body">${escapeHtml(t(explainerKey))}</p>
</section>`;
}

/**
 * 広告表示。market に紐づく。常時表示する。
 * 🔴 β版のあいだは、他ストアの欄が表示例であることをここに続けて書く。
 *    実データが揃ったら products.betaNoData の行ごと消す。
 */
export function affiliateNotice({ t, nutrientName, displayUnit }) {
  const affiliateText = t('products.affiliate', { nutrient: nutrientName, unit: displayUnit });
  const betaText = t('products.betaNoData');

  return `<p class="notice">
  <span class="notice__icon">${iconInfo}</span>
  <span>${escapeHtml(affiliateText)}${
    betaText ? `<span class="notice__beta">${escapeHtml(betaText)}</span>` : ''
  }</span>
</p>`;
}


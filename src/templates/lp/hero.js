/**
 * LP のヘッダとヒーロー。
 *
 * 🔒 ヒーローのランキングは実データだけ。ダミーを入れない。
 *    件数が足りないときは build.js が LP 自体を出力しない。
 * 🔒 ワードマークは初回接触なのでタグラインと必ずセットで出す。
 */

import { escapeHtml } from '../../lib/i18n.js';
import { formatCurrency, formatDate, formatPercent } from '../../lib/format.js';
import { wordmark } from '../layout.js';
import { packageThumb } from './parts.js';

/** ヘッダのアンカー。順序がそのままナビの並び */
const NAV_SECTIONS = ['features', 'howitworks', 'roadmap'];

export function siteHeader(t, { locale }) {
  const links = NAV_SECTIONS.map(
    (id) => `<a href="#${id}">${escapeHtml(t(`lp.nav.${id}`))}</a>`,
  ).join('\n      ');

  return `<header class="site-head">
  <div class="site-head__inner">
    ${wordmark(t, { href: `/${locale}/` })}
    <nav class="site-nav" aria-label="${escapeHtml(t('lp.nav.label'))}">
      ${links}
    </nav>
    <a class="btn btn--dark" href="#waitlist">
      <span class="u-desktop">${escapeHtml(t('lp.nav.cta'))}</span>
      <span class="u-mobile">${escapeHtml(t('lp.nav.ctaShort'))}</span>
    </a>
  </div>
</header>`;
}

/**
 * ランキングカードの1行。
 * 主指標（1単位あたりの価格）が行内で最も強い要素になる。
 */
function rankRow(row, index, { t, locale, currency, displayUnit }) {
  const isTop = index === 0;
  const cost = formatCurrency(row.costPerNutrientUnit, { locale, currency });
  const pack = formatCurrency(row.price, { locale, currency });
  const ratio = formatPercent(row.contentRatioPercent, { locale });

  // 含有率が定義されない成分（mg / mcg）ではブランド名だけを出す
  const sub = [row.product.brand, ratio].filter(Boolean).join(' ／ ');

  return `<li class="rank-row${isTop ? ' rank-row--top' : ''}" data-product-id="${escapeHtml(row.product.id)}">
  <span class="rank-row__num num" aria-hidden="true">${index + 1}</span>
  ${packageThumb({
    imageUrl: row.imageUrl,
    brand: row.product.brand,
    noImageLabel: t('lp.hero.noImage'),
  })}
  <span class="rank-row__body">
    <span class="rank-row__name">${escapeHtml(row.name)}</span>
    <span class="rank-row__sub">${escapeHtml(sub)}</span>
  </span>
  <span class="rank-row__metrics">
    <span class="cost"><span class="cost__value">${escapeHtml(cost)}</span><span class="cost__unit">${escapeHtml(
      t('unit.perNutrientUnit', { unit: displayUnit }),
    )}</span></span>
    <span class="rank-row__pack num">${escapeHtml(t('lp.hero.pack', { amount: pack }))}</span>
  </span>
</li>`;
}

/**
 * ヒーローのランキングカード。
 * 🔒 順位は ol でマークアップする。div で組まない。
 */
function rankCard(ctx) {
  const { t, locale, currency, displayUnit, topRows, totalCount, nutrientName, updatedAt } = ctx;

  const rows = topRows
    .map((row, i) => rankRow(row, i, { t, locale, currency, displayUnit }))
    .join('\n');

  return `<div class="rank-card">
  <div class="rank-card__head">
    <h2 class="rank-card__title">
      <span class="u-desktop">${escapeHtml(
        t('lp.hero.cardTitle', { unit: displayUnit, nutrient: nutrientName }),
      )}</span>
      <span class="u-mobile">${escapeHtml(t('lp.hero.cardTitleShort', { unit: displayUnit }))}</span>
    </h2>
    <span class="rank-card__updated num">${escapeHtml(
      t('lp.hero.updated', { date: formatDate(updatedAt, { locale }) ?? updatedAt }),
    )}</span>
  </div>

  <ol class="rank-list">
${rows}
  </ol>

  <p class="rank-card__foot">${escapeHtml(
    t('lp.hero.tracking', { nutrient: nutrientName, count: totalCount }),
  )}</p>
</div>`;
}

export function hero(ctx) {
  const { t } = ctx;

  return `<section class="hero">
  <div class="hero__grid">
    <div class="hero__copy">
      <p class="hero__tagline">${escapeHtml(t('brand.tagline'))}</p>
      <h1>${escapeHtml(t('lp.h1'))}</h1>
      <p class="hero__lede">${escapeHtml(t('lp.lede'))}</p>
      <a class="btn btn--signal btn--block" href="#waitlist">${escapeHtml(t('lp.cta'))}</a>
      <p class="hero__note">${escapeHtml(t('lp.ctaNote'))}</p>
    </div>
    ${rankCard(ctx)}
  </div>
</section>`;
}

export { NAV_SECTIONS };

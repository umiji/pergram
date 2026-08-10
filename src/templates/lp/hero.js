/**
 * LP のヘッダとヒーロー。
 *
 * 🔒 ヒーローに出す数値は実データだけ。価格・単価をここで作らない。
 *    件数が足りないときは build.js がカードを渡さず（topRows が空）、LP 自体は出力する。
 * ⚠️ どの製品を出すかは build.js の HERO_PRODUCT_IDS が決める。β版のあいだは
 *    手動指定が入っており、行番号は実際の順位と一致しない（design.md の例外を参照）。
 * 🔒 ワードマークは初回接触なのでタグラインと必ずセットで出す。
 */

import { escapeHtml } from '../../lib/i18n.js';
import { formatCurrency, formatPercent } from '../../lib/format.js';
import { wordmark } from '../layout.js';
import { packageThumb } from './parts.js';

/** ヘッダのアンカー。順序がそのままナビの並び */
const NAV_SECTIONS = ['features', 'howitworks', 'roadmap'];

/**
 * @param {object} opts
 * @param {string} opts.locale
 * @param {string|null} [opts.betaPath] 公開済みの製品一覧ページ。null なら導線を出さない
 */
export function siteHeader(t, { locale, betaPath = null }) {
  const links = NAV_SECTIONS.map(
    (id) => `<a href="#${id}">${escapeHtml(t(`lp.nav.${id}`))}</a>`,
  ).join('\n      ');

  const beta = betaPath
    ? `<a class="btn btn--signal" href="${escapeHtml(betaPath)}">
      <span class="u-desktop">${escapeHtml(t('lp.nav.beta'))}</span>
      <span class="u-mobile">${escapeHtml(t('lp.nav.betaShort'))}</span>
    </a>`
    : '';

  return `<header class="site-head">
  <div class="site-head__inner">
    ${wordmark(t, { href: `/${locale}/` })}
    <nav class="site-nav" aria-label="${escapeHtml(t('lp.nav.label'))}">
      ${links}
    </nav>
    <div class="site-head__actions">
      ${beta}
      <a class="btn btn--subtle" href="#waitlist">
        <span class="u-desktop">${escapeHtml(t('lp.nav.cta'))}</span>
        <span class="u-mobile">${escapeHtml(t('lp.nav.ctaShort'))}</span>
      </a>
    </div>
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
    imageUrl: row.product.image_url,
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
 *
 * 🔒 順位は ol でマークアップする。div で組まない。
 * 🔒 ここに出す製品・価格は実データだけ。存在しない製品や作った数字は置かない
 *    （design.md §7 禁止⑧）。禁止されているのは「嘘の数字を置くこと」であって
 *    「LP を出さないこと」ではない。実データが無いときはカードごと出さず、LP 自体は必ず出す。
 * ⚠️ 並べる順番だけは build.js の HERO_PRODUCT_IDS で手動指定できる状態にしてある。
 *    指定中は行番号が実際の順位と食い違う。design.md の例外の記録を参照。
 */
function rankCard(ctx) {
  const { t, locale, currency, displayUnit, topRows, nutrientName } = ctx;

  if (!topRows || topRows.length === 0) return '';

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
  </div>

  <ol class="rank-list">
${rows}
  </ol>
</div>`;
}

export function hero(ctx) {
  const { t, betaPath, nutrientName } = ctx;

  const card = rankCard(ctx);

  const beta = betaPath
    ? `<a class="btn btn--signal btn--block hero__beta" href="${escapeHtml(betaPath)}" data-cta="hero_beta">${escapeHtml(
        t('lp.hero.beta', { nutrient: nutrientName }),
      )}</a>`
    : '';

  // カードが無いときは 2 カラムに割らない。左半分だけ埋まった空白の面になる
  return `<section class="hero">
  <div class="hero__grid${card ? '' : ' hero__grid--solo'}">
    <div class="hero__copy">
      <p class="hero__tagline">${escapeHtml(t('brand.tagline'))}</p>
      <h1>${escapeHtml(t('lp.h1'))}</h1>
      <p class="hero__lede">${escapeHtml(t('lp.lede'))}</p>
      <div class="hero__actions">
        ${beta}
        <a class="btn btn--subtle btn--block hero__waitlist" href="#waitlist" data-cta="hero_waitlist">${escapeHtml(t('lp.cta'))}</a>
        <p class="hero__note">${escapeHtml(t('lp.ctaNote'))}</p>
      </div>
    </div>
    ${card}
  </div>
</section>`;
}

export { NAV_SECTIONS };

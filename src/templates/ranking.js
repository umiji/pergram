/**
 * 成分ランキングページ。design/service.md §5.1
 *
 * 🔒 ランキングは <ol>。順位は意味を持つので div で組まない。
 * 🔒 並び順は主指標のみで決まる。per serving・レビュー・報酬額は順位に影響しない。
 */

import { escapeHtml } from '../lib/i18n.js';
import { formatCurrency, formatDate, formatPercent, formatWeight } from '../lib/format.js';
import { layout, wordmark } from './layout.js';

function attrChips(row, { t, locale }) {
  const chips = [];

  const ratio = formatPercent(row.contentRatioPercent, { locale });
  if (ratio !== null) {
    chips.push(`${escapeHtml(t('metric.content_ratio'))} ${escapeHtml(ratio)}`);
  }

  const weight = formatWeight(row.netWeightG, { locale });
  if (weight !== null) {
    chips.push(escapeHtml(t('product.netWeight', { amount: weight })));
  }

  if (row.product.flavor) {
    chips.push(escapeHtml(row.product.flavor));
  }

  // 事実のみ。「吸収が良い」等の評価語は入れない
  chips.push(escapeHtml(t(`product.form.${row.product.form}`)));

  // 🔒 低信頼は色だけでなくテキストで示す。推定値では埋めない
  if (row.product.confidence === 'low' || row.product.confidence === 'medium') {
    chips.push(
      `<span class="badge badge--review">▲ ${escapeHtml(
        t(`product.confidence.${row.product.confidence}`),
      )}</span>`,
    );
  }

  return chips.map((c) => `<span>${c}</span>`).join('');
}

/**
 * 🔒 merchant ボタンは market 設定の配列を回して描画する。
 *    UI 側に if (locale === 'en') を書かない。
 */
function merchantButtons(row, { t, market, snapshotsByMerchant }) {
  return market.merchants
    .map((merchant) => {
      const snapshot = snapshotsByMerchant.get(merchant);
      if (!snapshot) return '';
      const label = t('merchant.viewAt', { merchant: t(`merchant.${merchant}`) });
      return `<a class="merchant-button" href="${escapeHtml(snapshot.url)}"
        rel="nofollow sponsored noopener" target="_blank"
        data-merchant="${escapeHtml(merchant)}">${escapeHtml(label)}</a>`;
    })
    .join('');
}

function rankingItem(row, index, ctx) {
  const { t, locale, market } = ctx;
  const currency = market.currency;

  const primary = formatCurrency(row.costPerNutrientUnit, { locale, currency });
  const unitSuffix = t('unit.perNutrientUnit', { unit: ctx.displayUnit });

  const perDay = formatCurrency(row.costPerTargetIntake, { locale, currency });
  const perServing = formatCurrency(row.costPerServing, { locale, currency });

  const secondary = [
    perDay === null ? null : `${perDay}${t('unit.perDay')}`,
    perServing === null ? null : `${perServing}${t('unit.perServing')}`,
  ]
    .filter(Boolean)
    .join('　');

  const stock = row.inStock
    ? ''
    : `<span class="badge badge--warn">▲ ${escapeHtml(t('merchant.outOfStock'))}</span>`;

  return `<li class="ranking__item">
  <span class="ranking__rank" aria-label="${escapeHtml(t('ranking.rank'))}">${index + 1}</span>
  <div>
    <p class="ranking__name">${escapeHtml(row.name)}</p>
    <div class="ranking__attrs">${attrChips(row, ctx)}${stock}</div>
  </div>
  <div class="ranking__metrics">
    <span class="cost">
      <span class="cost__value">${escapeHtml(primary)}</span><span class="cost__unit">${escapeHtml(unitSuffix)}</span>
    </span>
    <span class="cost-secondary">${escapeHtml(secondary)}</span>
  </div>
  <div class="merchants">${merchantButtons(row, ctx)}</div>
</li>`;
}

export function rankingPage(ctx) {
  const { t, locale, rows, nutrientName, updatedAt, targetIntake, displayUnit, gaMeasurementId } =
    ctx;

  const subtitle = t('ranking.subtitle', { nutrient: nutrientName, unit: displayUnit });

  const body =
    rows.length === 0
      ? `<p class="empty-state">${escapeHtml(t('ranking.notRegistered'))}</p>`
      : `<ol class="ranking">${rows
          .map((row, i) => rankingItem(row, i, { ...ctx, snapshotsByMerchant: row.snapshotsByMerchant }))
          .join('\n')}</ol>`;

  const content = `<a class="skip-link" href="#ranking">${escapeHtml(t('nav.skipToRanking'))}</a>
<div class="wrap">
  <header style="padding-top:var(--space-6)">${wordmark(t, { href: `/${locale}/` })}</header>

  <div class="page-head">
    <div class="page-head__row">
      <h1>${escapeHtml(nutrientName)}</h1>
      <p class="page-head__meta num">${escapeHtml(
        t('ranking.updatedAt', { date: formatDate(updatedAt, { locale }) ?? '—' }),
      )}　${escapeHtml(t('ranking.productCount', { count: rows.length }))}</p>
    </div>
    <p class="page-head__subtitle">${escapeHtml(subtitle)}</p>
    <p class="page-head__subtitle num">${escapeHtml(
      t('ranking.targetIntake'),
    )} ${escapeHtml(String(targetIntake))}${escapeHtml(
      t('ranking.targetIntakeUnit', { unit: displayUnit }),
    )}</p>
  </div>

  <main id="ranking">${body}</main>

  <footer class="disclosure">
    <p>${escapeHtml(t(`${ctx.disclosureKey}.dataSource`))}</p>
    <p>${escapeHtml(t(`${ctx.disclosureKey}.affiliate`))}</p>
    <p>${escapeHtml(t(`${ctx.disclosureKey}.medical`))}</p>
  </footer>
</div>`;

  return layout({
    locale,
    title: `${nutrientName} — ${t('brand.name')}`,
    description: subtitle,
    content,
    gaMeasurementId,
  });
}

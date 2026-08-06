/**
 * 検証用ランディングページ。design/ad-lp.md
 *
 * 🔒 このページの仕事は「答えの一部を出して、続きを予約させる」ことだけ。
 * 🔒 アフィリエイトリンクを置かない（広告審査でアフィリエイトサイト判定を避ける）。
 * 🔒 ヒーローの製品は実データ。ダミーを入れない。ここで嘘をつくと全部が崩れる。
 */

import { escapeHtml } from '../lib/i18n.js';
import { formatCurrency, formatPercent } from '../lib/format.js';
import { layout, wordmark } from './layout.js';

const NUTRIENT_CHIPS = ['protein', 'creatine', 'eaa_bcaa', 'hmb', 'iron_zinc', 'vitamins', 'other'];
const CHANNEL_CHIPS = ['rakuten', 'amazon', 'iherb', 'myprotein', 'store'];

function heroRows(rows, { t, locale, currency, displayUnit }) {
  return rows
    .map((row, i) => {
      const cost = formatCurrency(row.costPerNutrientUnit, { locale, currency });
      const ratio = formatPercent(row.contentRatioPercent, { locale });
      const attrs = [ratio === null ? null : `${t('metric.content_ratio')} ${ratio}`, row.product.brand]
        .filter(Boolean)
        .join(' / ');

      return `<li class="lp-row" data-product-id="${escapeHtml(row.product.id)}">
  <span class="lp-row__rank num">${i + 1}</span>
  <div>
    <p class="lp-row__name">${escapeHtml(row.name)}</p>
    <p class="lp-row__attrs">${escapeHtml(attrs)}</p>
  </div>
  <span class="cost"><span class="cost__value">${escapeHtml(cost)}</span><span class="cost__unit">${escapeHtml(
    t('unit.perNutrientUnit', { unit: displayUnit }),
  )}</span></span>
</li>`;
    })
    .join('\n');
}

function chips(name, keys, prefix, t, { multiple }) {
  return keys
    .map(
      (key) => `<label class="chip">
  <input type="${multiple ? 'checkbox' : 'radio'}" name="${escapeHtml(name)}" value="${escapeHtml(key)}">
  <span>${escapeHtml(t(`${prefix}.${key}`))}</span>
</label>`,
    )
    .join('');
}

/** コストの物差し。対数スケールであることを軸に明記する */
function costRuler(rows, { t, locale, currency, filters }) {
  const costs = rows.map((r) => r.costPerNutrientUnit);
  const min = Math.min(...costs);
  const max = Math.max(...costs);

  const dots = rows
    .map((row) => {
      const attrs = escapeHtml(JSON.stringify(row.attributeKeys ?? []));
      return `<button type="button" class="ruler__dot"
      data-cost="${row.costPerNutrientUnit}"
      data-attrs="${attrs}"
      aria-label="${escapeHtml(row.name)}"></button>`;
    })
    .join('');

  // 翻訳のあるファセットだけを出す。キー名をそのまま画面に出さない
  const filterChips = filters
    .map(
      ({ key, label }) =>
        `<button type="button" class="chip chip--button" data-filter="${escapeHtml(
          key,
        )}">${escapeHtml(label)}</button>`,
    )
    .join('');

  return `<section class="lp-section" id="ruler">
  <h2>${escapeHtml(t('lp.section3.heading'))}</h2>
  <div class="ruler" data-min="${min}" data-max="${max}"
       data-locale="${escapeHtml(locale)}" data-currency="${escapeHtml(currency)}">
    <div class="ruler__axis">
      <span class="ruler__label">${escapeHtml(t('lp.section3.axisLow'))}</span>
      <div class="ruler__track">${dots}</div>
      <span class="ruler__label">${escapeHtml(t('lp.section3.axisHigh'))}</span>
    </div>
    <p class="ruler__note">${escapeHtml(t('lp.section3.axisNote'))}　${escapeHtml(
      formatCurrency(min, { locale, currency }),
    )} – ${escapeHtml(formatCurrency(max, { locale, currency }))}</p>
    ${filterChips ? `<div class="ruler__filters">${filterChips}</div>` : ''}
    <p class="ruler__gap num"
       data-empty-text="${escapeHtml(t('lp.section3.noProduct'))}"
       data-gap-template="${escapeHtml(t('lp.section3.gap', { amount: '{amount}' }))}"></p>
  </div>
</section>`;
}

export function lpPage(ctx) {
  const {
    t,
    locale,
    currency,
    displayUnit,
    topRows,
    totalCount,
    rulerRows,
    filters,
    disclosureKey,
    gaMeasurementId,
  } = ctx;

  const remaining = totalCount - topRows.length;

  const content = `<div class="wrap lp">

<!-- ① ヒーロー。ファーストビューで完結させる -->
<header class="lp-head">
  ${wordmark(t, { withTagline: true, href: `/${locale}/` })}
</header>

<section class="lp-hero">
  <h1>${escapeHtml(t('lp.h1'))}</h1>
  <p class="lp-lede">${escapeHtml(t('lp.lede', { count: totalCount }))}</p>

  <ol class="lp-table">
${heroRows(topRows, { t, locale, currency, displayUnit })}
  </ol>

  <p class="lp-rest">${escapeHtml(t('lp.rest', { count: remaining }))}</p>
  <p class="lp-rest">${escapeHtml(t('lp.freshness'))}</p>

  <a class="cta" href="#waitlist">${escapeHtml(t('lp.cta'))}</a>
</section>

<!-- ② なぜ「値段」だけでは比べられないのか -->
<section class="lp-section">
  <h2>${escapeHtml(t('lp.section2.heading'))}</h2>
  <div class="compare">
    <div class="compare__item">
      <p class="compare__label">${escapeHtml(t('lp.section2.oxide'))}</p>
      <p class="compare__sub num">${escapeHtml(t('lp.section2.oxideElemental'))}</p>
      <div class="compare__bar" style="width:100%"></div>
    </div>
    <div class="compare__item">
      <p class="compare__label">${escapeHtml(t('lp.section2.glycinate'))}</p>
      <p class="compare__sub num">${escapeHtml(t('lp.section2.glycinateElemental'))}</p>
      <div class="compare__bar" style="width:16.7%"></div>
    </div>
  </div>
  <p class="lp-body">${escapeHtml(t('lp.section2.body'))}</p>
</section>

<!-- ③ コストの物差し -->
${costRuler(rulerRows, { t, locale, currency, filters })}

<!-- ④ メール登録 -->
<section class="lp-section" id="waitlist">
  <h2>${escapeHtml(t('lp.form.heading'))}</h2>
  <form class="waitlist" novalidate
        data-error-email="${escapeHtml(t('lp.form.errorEmail'))}"
        data-error-send="${escapeHtml(t('lp.form.errorSend'))}">
    <label class="field">
      <span class="field__label">${escapeHtml(t('lp.form.email'))}</span>
      <input type="email" name="email" autocomplete="email" required>
    </label>

    <fieldset class="field">
      <legend class="field__label">${escapeHtml(t('lp.form.nutrients'))}</legend>
      <div class="chips">${chips('nutrients', NUTRIENT_CHIPS, 'nutrient', t, { multiple: true })}</div>
    </fieldset>

    <fieldset class="field">
      <legend class="field__label">${escapeHtml(t('lp.form.channel'))}</legend>
      <div class="chips">${chips('channel', CHANNEL_CHIPS, 'channel', t, { multiple: false })}</div>
    </fieldset>

    <p class="form-error" role="alert" hidden></p>
    <button type="submit" class="cta">${escapeHtml(t('lp.form.submit'))}</button>
    <p class="lp-note">${escapeHtml(t('lp.form.note'))}</p>
  </form>
  <p class="waitlist__done" role="status" hidden>${escapeHtml(t('lp.form.done'))}</p>
</section>

<!-- ⑤ このサイトがやらないこと -->
<footer class="disclosure">
  <h2 class="disclosure__heading">${escapeHtml(t('lp.section5.heading'))}</h2>
  <ul>
    <li>${escapeHtml(t('lp.section5.item1'))}</li>
    <li>${escapeHtml(t('lp.section5.item2'))}</li>
    <li>${escapeHtml(t('lp.section5.item3'))}</li>
    <li>${escapeHtml(t('lp.section5.item4'))}</li>
  </ul>
  <p>${escapeHtml(t(`${disclosureKey}.dataSource`))}</p>
  <p>${escapeHtml(t(`${disclosureKey}.referenceSource`))}</p>
  <p>${escapeHtml(t(`${disclosureKey}.medical`))}</p>
  <p>${escapeHtml(t(`${disclosureKey}.affiliatePlanned`))}</p>
</footer>

</div>
<script src="/assets/lp.js" defer></script>`;

  return layout({
    locale,
    title: `${t('lp.h1')} — ${t('brand.name')}`,
    description: t('lp.lede', { count: totalCount }),
    bodyClass: 'lp-body-root',
    content,
    gaMeasurementId,
    head: `<link rel="stylesheet" href="/assets/lp.css">
<meta property="og:image" content="/assets/ogp.png">`,
  });
}

export { NUTRIENT_CHIPS, CHANNEL_CHIPS };

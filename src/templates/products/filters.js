/**
 * 絞り込み。PC では左の固定サイドバー、SP では下から出るシートとして同じ DOM を使う。
 *
 * 🔒 カテゴリ差は config/categories.json の facets を回して吸収する。
 *    ここに「プロテインなら WPI/WPC を出す」のような分岐を書かない。
 * 🔒 グループは fieldset + legend。見出しだけの div で組むと読み上げで関係が消える。
 *
 * 件数は実データから数える。該当0件の選択肢も枠として出すが、
 * 「0」と明示して押せなくする。件数を書かずに空の枠だけ出すと嘘になる。
 */

import { escapeHtml } from '../../lib/i18n.js';
import { formatCurrency } from '../../lib/format.js';

/** 選択肢1つ。count が 0 なら disabled にして淡くする */
function option({ type, name, value, label, count, checked = false, disabled = false }) {
  const attrs = [
    `type="${type}"`,
    `name="${escapeHtml(name)}"`,
    `value="${escapeHtml(value)}"`,
    checked ? 'checked' : '',
    disabled ? 'disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `<li>
  <label class="filters__opt${disabled ? ' filters__opt--empty' : ''}">
    <input ${attrs}>
    <span class="filters__opt-label">${escapeHtml(label)}</span>
    <span class="filters__opt-count num">${count}</span>
  </label>
</li>`;
}

function group({ legend, body, hint = '' }) {
  return `<fieldset class="filters__group">
  <legend class="filters__legend">${escapeHtml(legend)}</legend>
  ${hint ? `<p class="filters__hint">${escapeHtml(hint)}</p>` : ''}
  ${body}
</fieldset>`;
}

/** 成分。ここだけは単一選択（1ページ1成分なので、選ぶ = 別ページへ移る） */
function nutrientGroup({ t, locale, nutrients, activeNutrientId }) {
  const items = nutrients
    .map((n) =>
      option({
        type: 'radio',
        name: 'nutrient',
        value: n.id,
        label: t(`nutrient.${n.id}`),
        count: n.count,
        checked: n.id === activeNutrientId,
        disabled: n.count === 0,
      }),
    )
    .join('\n');

  return group({
    legend: t('filters.nutrient'),
    hint: t('filters.nutrientAvailable'),
    body: `<div class="filters__search">
    <label class="u-visually-hidden" for="nutrient-search">${escapeHtml(t('filters.nutrientSearch'))}</label>
    <input id="nutrient-search" type="search" placeholder="${escapeHtml(t('filters.nutrientSearch'))}" data-filter-search="nutrient">
  </div>
  <ul class="filters__opts">${items}</ul>`,
  });
}

/** facets は config を回すだけ。チップ表示とチェックボックス表示を style で選ぶ */
function facetGroup(facet, { t, counts }) {
  const items = facet.keys.map((key) => ({
    key,
    label: t(`attr.${key}`),
    count: counts.get(key) ?? 0,
  }));

  if (facet.style === 'chip') {
    const chips = items
      .map(
        ({ key, label, count }) => `<li>
  <label class="filters__chip${count === 0 ? ' filters__chip--empty' : ''}">
    <input type="checkbox" name="attr" value="${escapeHtml(key)}"${count === 0 ? ' disabled' : ''}>
    <span>${escapeHtml(label)}</span>
    <span class="num">${count}</span>
  </label>
</li>`,
      )
      .join('\n');
    return group({
      legend: t(`filters.${facet.id}`),
      body: `<ul class="filters__chips">${chips}</ul>`,
    });
  }

  const opts = items
    .map(({ key, label, count }) =>
      option({
        type: 'checkbox',
        name: 'attr',
        value: key,
        label,
        count,
        disabled: count === 0,
      }),
    )
    .join('\n');
  return group({ legend: t(`filters.${facet.id}`), body: `<ul class="filters__opts">${opts}</ul>` });
}

/**
 * スライダー。上限だけを動かす。下限は常に最小値（「これ以下」という読み方で足りる）。
 *
 * 表示文字列は Intl が組み立てる。テンプレートだけ data 属性で渡し、
 * クライアント側でも同じ locale / currency / 桁数で書式化する。
 * 「¥」を JS で文字列連結すると US 市場で位置が狂う。
 */
function rangeGroup({ id, legend, range, value, valueLabel, template, digits }) {
  return `<fieldset class="filters__group">
  <div class="filters__range-head">
    <legend class="filters__legend">${escapeHtml(legend)}</legend>
    <output class="filters__range-value num" for="${escapeHtml(id)}" id="${escapeHtml(id)}-out"
      data-range-out="${escapeHtml(id)}"
      data-template="${escapeHtml(template)}"
      data-digits="${digits}">${escapeHtml(valueLabel)}</output>
  </div>
  <input class="filters__range" type="range" id="${escapeHtml(id)}"
    name="${escapeHtml(id)}"
    min="${range.min}" max="${range.max}" step="${range.step}" value="${value}">
</fieldset>`;
}

/**
 * スライダーの上限を、掲載中の行が必ず収まるところまで押し上げる。
 *
 * 🔒 上限を config/categories.json の固定値のままにしない。掲載データは取り込みのたびに
 *    変わるので、固定値はいずれ実データの最大を下回る。初期値は上限そのものなので、
 *    そのとき**操作していないのに製品が消える**（価格上限 20,000円 に対して ¥39,980 の
 *    1位が消え、初期表示が 2〜13位になった実例がある）。
 *    config が持つのは目盛りの下限と刻み幅、そして上限の**下限値**だけ。
 */
function rangeCovering(range, rows, pick) {
  const values = rows.map(pick).filter((v) => Number.isFinite(v));
  if (values.length === 0) return range;

  // 刻みの切りのいいところまで切り上げる。端数のままだと最高値の行が閾値を超える
  const ceiling = Math.ceil(Math.max(...values) / range.step) * range.step;
  return { ...range, max: Math.max(range.max, ceiling) };
}

export function filters(ctx) {
  const {
    t,
    locale,
    currency,
    displayUnit,
    market,
    category,
    rows,
    nutrients,
    activeNutrientId,
  } = ctx;

  // 件数は実データから数える
  const attrCounts = new Map();
  for (const row of rows) {
    for (const key of row.attributeKeys ?? []) {
      attrCounts.set(key, (attrCounts.get(key) ?? 0) + 1);
    }
  }

  const merchantCounts = new Map();
  const brandCounts = new Map();
  for (const row of rows) {
    for (const merchant of row.snapshotsByMerchant.keys()) {
      merchantCounts.set(merchant, (merchantCounts.get(merchant) ?? 0) + 1);
    }
    const brand = row.product.brand;
    if (brand) brandCounts.set(brand, (brandCounts.get(brand) ?? 0) + 1);
  }

  const facetGroups = (category.facets ?? [])
    .map((facet) => facetGroup(facet, { t, counts: attrCounts }))
    .join('\n');

  const merchantOpts = market.merchants
    .map((merchant) =>
      option({
        type: 'checkbox',
        name: 'merchant',
        value: merchant,
        label: t(`merchant.${merchant}`),
        count: merchantCounts.get(merchant) ?? 0,
        disabled: (merchantCounts.get(merchant) ?? 0) === 0,
      }),
    )
    .join('\n');

  // メーカーは件数の多い順。全件を描画したうえで、先頭以外を hidden で畳む。
  // 描画しないと「すべてのメーカーを見る」が押しても何も起きないボタンになる。
  const BRAND_VISIBLE = 8;
  const brands = [...brandCounts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const brandOpts =
    brands.length === 0
      ? `<li><p class="filters__hint">${escapeHtml(t('filters.noneYet'))}</p></li>`
      : brands
          .map(([brand, count], i) => {
            const li = option({
              type: 'checkbox',
              name: 'brand',
              value: brand,
              label: brand,
              count,
            });
            return i < BRAND_VISIBLE ? li : li.replace('<li>', '<li hidden data-filter-overflow>');
          })
          .join('\n');

  const brandMore =
    brands.length > BRAND_VISIBLE
      ? `<button class="filters__more" type="button" data-filter-more>${escapeHtml(
          t('filters.brandAll', { count: brands.length }),
        )}</button>`
      : '';

  const unitCostRange = rangeCovering(category.unitCostRange, rows, (r) => r.costPerNutrientUnit);
  const priceRange = rangeCovering(category.priceRange, rows, (r) => r.price);
  const unitCostLabel = t('filters.rangeUpTo', {
    max: formatCurrency(unitCostRange.max, { locale, currency, fractionDigits: 1 }) ?? '',
  });
  const priceLabel = t('filters.rangeUpTo', {
    max: formatCurrency(priceRange.max, { locale, currency, fractionDigits: 0 }) ?? '',
  });

  return `<form class="filters" id="filters" aria-labelledby="filters-title"
  data-locale="${escapeHtml(locale)}" data-currency="${escapeHtml(currency)}"
  data-count-template="${escapeHtml(t('filters.apply', { count: '{count}' }))}">
  <div class="filters__head">
    <div>
      <p class="filters__title" id="filters-title">${escapeHtml(t('filters.heading'))}</p>
      <p class="filters__beta-notice" style="font-size: 11px; color: var(--warn); margin: 2px 0 0; font-weight: 600;">※ イメージのみ、フィルタは出来ません</p>
    </div>
    <div class="filters__head-actions">
      <button class="filters__reset" type="reset">${escapeHtml(t('filters.reset'))}</button>
      <button class="filters__close" type="button" data-filter-close aria-label="${escapeHtml(
        t('filters.close'),
      )}"></button>
    </div>
  </div>

  <div class="filters__scroll">
    ${nutrientGroup({ t, locale, nutrients, activeNutrientId })}
    ${facetGroups}
    ${rangeGroup({
      id: 'unit-cost',
      legend: t('filters.unitCost', { unit: displayUnit }),
      range: unitCostRange,
      value: unitCostRange.max,
      valueLabel: unitCostLabel,
      template: t('filters.rangeUpTo', { max: '{max}' }),
      digits: 1,
    })}
    ${rangeGroup({
      id: 'price',
      legend: t('filters.price'),
      range: priceRange,
      value: priceRange.max,
      valueLabel: priceLabel,
      template: t('filters.rangeUpTo', { max: '{max}' }),
      digits: 0,
    })}
    ${group({ legend: t('filters.merchant'), body: `<ul class="filters__opts">${merchantOpts}</ul>` })}
    ${group({
      legend: t('filters.brand'),
      body: `<ul class="filters__opts" data-filter-list="brand">${brandOpts}</ul>${brandMore}`,
    })}
  </div>

  <div class="filters__foot">
    <button class="btn btn--signal btn--block" type="button" data-filter-close>
      ${escapeHtml(t('filters.apply', { count: rows.length }))}
    </button>
  </div>
</form>`;
}

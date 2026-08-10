/**
 * 製品一覧の1件。docs/design/design.md §4.1
 *
 * カードビューとリストビューは**同じマークアップ**を CSS のグリッドだけで組み替える。
 * 2つ描き分けると同じ製品名が DOM に2回出て、行数も倍になる。
 *
 * 🔒 行内で最も強い要素は主指標（有効成分1単位あたりの価格）。
 *    製品価格・含有率・1食あたりが主指標より目立ってはならない。
 * 🔒 レビュー星評価とレビュー件数は出さない（N-08）。
 *    製品の確からしさは confidence と価格取得日で示す。
 * 🔒 最安を色だけで示さない。順位番号とテキストを必ず併記する。
 */

import { escapeHtml } from '../../lib/i18n.js';
import { costPerNutrientUnit } from '../../lib/cost.js';
import { formatCurrency, formatDate, formatPercent, formatWeight } from '../../lib/format.js';
import { packageThumb } from '../lp/parts.js';

/**
 * 🔴 β版の暫定措置。楽天以外の EC サイトの価格をまだ取得していないため、
 *    他ストアの欄は「行だけある表示例」として出す。
 *    🔒 金額を推定して埋めない。実データが無い欄はプレースホルダの文字を出す。
 *    実データが入ったらこの2つの定数ごと消し、market.merchants を回すだけに戻す。
 */
const PLACEHOLDER_MERCHANTS = ['amazon_jp', 'rakuten', 'yahoo', 'official'];
const PLACEHOLDER_UNIT_COST = '¥X';
const PLACEHOLDER_PRICE = '¥XXXX';

/** 最安との差。事実の提示であり優劣の判断ではない */
function deltaLabel(row, baseline, { t, locale }) {
  if (baseline === null || row.costPerNutrientUnit <= baseline) return t('products.deltaBase');
  const percent = ((row.costPerNutrientUnit - baseline) / baseline) * 100;
  return t('products.delta', { percent: formatPercent(percent, { locale }) });
}

/**
 * 副指標。config/categories.json の secondaryMetrics を回すだけにする。
 * 全部を静的に出力し、表示中の1つ以外を CSS で隠す。
 */
function secondaryFacts(row, { t, locale, currency, displayUnit, secondaryMetrics }) {
  const value = {
    content_ratio: () => {
      const ratio = formatPercent(row.contentRatioPercent, { locale });
      return ratio === null ? null : `${t('metric.content_ratio')} ${ratio}`;
    },
    cost_per_serving: () => {
      const cost = formatCurrency(row.costPerServing, { locale, currency });
      return cost === null ? null : `${t('metric.cost_per_serving')} ${cost}`;
    },
    cost_per_day: () => {
      const cost = formatCurrency(row.costPerTargetIntake, { locale, currency });
      return cost === null ? null : `${t('metric.cost_per_day')} ${cost}`;
    },
    ul_percentage: () => {
      const share = formatPercent(row.ulPercentage, { locale });
      return share === null ? null : `${t('metric.ul_percentage')} ${share}`;
    },
  };

  const swappable = secondaryMetrics
    .map((metric) => {
      const text = value[metric]?.();
      if (!text) return '';
      return `<span class="p-item__fact" data-metric="${escapeHtml(metric)}">${escapeHtml(text)}</span>`;
    })
    .join('');

  return swappable;
}

/**
 * 他ストアの価格。
 * 🔒 表は table + scope。div で組まない。
 * 🔒 merchant は market 設定の配列を回す。UI に locale の分岐を書かない。
 */
function offersTable(row, { t, locale, currency, displayUnit, market, id }) {
  const targetMerchants = ['amazon_jp', 'rakuten', 'yahoo', 'official'];
  const otherMerchants = targetMerchants.filter((m) => m !== row.merchant);

  const rows = otherMerchants
    .map((merchant) => {
      const snapshot = row.snapshotsByMerchant?.get(merchant) ?? null;
      return {
        merchant,
        snapshot,
        unitCost:
          snapshot === null ? null : costPerNutrientUnit(snapshot.price, row.product, row.content),
      };
    })
    // 実データのある行が先。プレースホルダは単価が無いので自然に後ろへ落ちる
    .sort((a, b) => (a.unitCost ?? Infinity) - (b.unitCost ?? Infinity));

  const unitSuffix = t('unit.perNutrientUnit', { unit: displayUnit });
  const viewLabel = escapeHtml(t('products.offers.view'));

  const body = rows
    .map(({ merchant, snapshot, unitCost }) => {
      const name = escapeHtml(t(`merchant.${merchant}`));

      // 🔒 実データが無い販売元。金額を作らず、リンクも張らない
      if (snapshot === null) {
        return `<tr data-placeholder="true">
        <th scope="row" class="offers__merchant">${name}</th>
        <td class="num offers__unit">${PLACEHOLDER_UNIT_COST}<span class="unit-sub">${escapeHtml(unitSuffix)}</span></td>
        <td class="num offers__price">${PLACEHOLDER_PRICE}</td>
        <td class="offers__action"><span class="merchant-button merchant-button--quiet merchant-button--disabled"
          aria-disabled="true">${viewLabel}</span></td>
      </tr>`;
      }

      const unit = formatCurrency(unitCost, { locale, currency });
      const price = formatCurrency(snapshot.price, { locale, currency });
      const stock = snapshot.in_stock
        ? ''
        : ` <span class="badge badge--warn">▲ ${escapeHtml(t('merchant.outOfStock'))}</span>`;
      return `<tr>
        <th scope="row" class="offers__merchant">${name}${stock}</th>
        <td class="num offers__unit">${escapeHtml(unit ?? '—')}<span class="unit-sub">${escapeHtml(unitSuffix)}</span></td>
        <td class="num offers__price">${escapeHtml(price ?? '—')}</td>
        <td class="offers__action"><a class="merchant-button merchant-button--quiet" href="${escapeHtml(snapshot.url)}"
          rel="nofollow sponsored noopener" target="_blank"
          data-merchant="${escapeHtml(merchant)}">${viewLabel}</a></td>
      </tr>`;
    })
    .join('\n');

  return {
    count: rows.length,
    html: `<div class="p-item__offers" id="${escapeHtml(id)}" hidden>
  <div class="offers-card">
    <p class="offers__heading">${escapeHtml(t('products.offersHeading', { count: rows.length }))}</p>
    <table class="offers">
      <thead>
        <tr>
          <th scope="col">${escapeHtml(t('products.offers.merchant'))}</th>
          <th scope="col">${escapeHtml(t('products.offers.unitCost', { unit: displayUnit }))}</th>
          <th scope="col">${escapeHtml(t('products.offers.price'))}</th>
          <th scope="col"><span class="u-visually-hidden">${escapeHtml(t('products.offers.action'))}</span></th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>
</div>`,
  };
}

export function productItem(row, index, ctx) {
  const { t, locale, currency, displayUnit, market, baseline } = ctx;
  const isBest = index === 0;
  const offersId = `offers-${row.product.id}`;

  const primary = formatCurrency(row.costPerNutrientUnit, { locale, currency });
  const unitSuffix = t('unit.perNutrientUnit', { unit: displayUnit });
  const price = formatCurrency(row.price, { locale, currency });
  const pack = formatWeight(row.netWeightG, { locale });
  const nutrientWeight = formatWeight(row.totalNutrientAmount, { locale });
  const fetched = formatDate(row.fetchedAt, { locale });
  const merchantName = t(`merchant.${row.merchant}`);

  // 送料は「込み / 別」の2値だけで、判別できなければ何も出さない（🔒 推測で埋めない）。
  // カード表示では商品価格の下に、リスト表示では送料の列に出るが、
  // 描くのはこの1箇所だけ。置き場所は products.css のグリッドが決める。
  const postage =
    row.postageIncluded === null || row.postageIncluded === undefined
      ? ''
      : `<span class="p-item__postage">${escapeHtml(
          t(row.postageIncluded ? 'products.postage.included' : 'products.postage.excluded'),
        )}</span>`;

  const badges = [];
  if (!row.inStock) {
    badges.push(`<span class="badge badge--warn">▲ ${escapeHtml(t('merchant.outOfStock'))}</span>`);
  }

  const offers = offersTable(row, { t, locale, currency, displayUnit, market, id: offersId });

  const toggle =
    offers.count <= 1
      ? ''
      : `<button class="p-item__toggle" type="button" aria-expanded="false" aria-controls="${escapeHtml(offersId)}">
      <span>${escapeHtml(t('products.offersToggle', { count: offers.count }))}</span>
      <span class="p-item__chevron" aria-hidden="true"></span>
    </button>`;

  const noticeText = escapeHtml(t('merchant.accessNotice', { merchant: merchantName }));

  const bestLink = `<a class="merchant-button" href="${escapeHtml(row.url)}"
      rel="nofollow sponsored noopener" target="_blank"
      data-merchant="${escapeHtml(row.merchant)}">
      <span class="merchant-button__label merchant-button__label--card">${escapeHtml(t('merchant.viewBestShop'))}</span>
      <span class="merchant-button__label merchant-button__label--list">${escapeHtml(t('merchant.viewShop'))}</span>
      <span class="merchant-notice">${noticeText}</span>
    </a>`;

  // data-* は絞り込みが読む。導出値はここで確定させ、クライアントで再計算しない
  const data = [
    `data-rank="${index + 1}"`,
    `data-unit-cost="${row.costPerNutrientUnit}"`,
    `data-price="${row.price}"`,
    `data-merchant="${escapeHtml(row.merchant)}"`,
    `data-brand="${escapeHtml(row.product.brand ?? '')}"`,
    `data-attrs="${escapeHtml((row.attributeKeys ?? []).join(' '))}"`,
    `data-name="${escapeHtml(`${row.name} ${row.product.brand ?? ''}`.toLowerCase())}"`,
  ].join(' ');

  const tagsHtml = badges.length > 0 ? `<p class="p-item__tags">${badges.join('')}</p>` : '';

  return `<li class="p-item${isBest ? ' p-item--best' : ''}" ${data}>
  <div class="p-item__media">
    <p class="p-item__flags">
      <span class="p-item__rank num">${index + 1}</span>
      ${
        isBest
          ? `<span class="p-item__best">${escapeHtml(t('products.best', { unit: displayUnit }))}</span>`
          : ''
      }
    </p>
    ${packageThumb({
      imageUrl: row.product.image_url,
      brand: row.product.brand,
      noImageLabel: t('lp.hero.noImage'),
    })}
  </div>

  <div class="p-item__body">
    ${tagsHtml}
    <p class="p-item__brand">${escapeHtml(row.product.brand ?? '')}</p>
    <h2 class="p-item__name">${escapeHtml(row.name)}</h2>
    <p class="p-item__facts">${secondaryFacts(row, ctx)}</p>
  </div>

  <div class="p-item__cost">
    <p class="p-item__cost-label">${escapeHtml(
      t('metric.cost_per_nutrient_unit', { nutrient: ctx.nutrientName, unit: displayUnit }),
    )}</p>
    <p class="cost">
      <span class="cost__value">${escapeHtml(primary)}</span><span class="cost__unit">${escapeHtml(unitSuffix)}</span>
    </p>
    <p class="p-item__delta">${escapeHtml(deltaLabel(row, baseline, { t, locale }))}</p>
  </div>

  <div class="p-item__weight">
    <span class="p-item__weight-val">${pack === null ? '—' : escapeHtml(pack)}</span>
  </div>

  <div class="p-item__nutrient-weight">
    <span class="p-item__nutrient-weight-val">${nutrientWeight === null ? '—' : escapeHtml(nutrientWeight)}</span>
  </div>

  <div class="p-item__price">
    <p class="p-item__price-main">
      <span class="num">${escapeHtml(price ?? '—')}</span>
      <span class="p-item__price-pack"> / ${pack === null ? '—' : escapeHtml(pack)}</span>
    </p>
    <p class="p-item__price-sub">
      ${postage}<span class="p-item__price-merchant">${postage ? ' ・ ' : ''}${escapeHtml(
        t('products.bestMerchant', { merchant: merchantName }),
      )}</span>
    </p>
  </div>

  <div class="p-item__actions">
    ${bestLink}
    ${toggle}
  </div>

  ${offers.html}
</li>`;
}

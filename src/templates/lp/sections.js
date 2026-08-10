/**
 * LP の本文セクション。特徴 / 単価の出し方 / ロードマップ。
 *
 * 🔒 事実だけを書き、優劣を述べない。「だからこちらを選ぶべき」と書かない。
 * 🔒 独自の総合スコア・おすすめ度を作らない。
 */

import { escapeHtml } from '../../lib/i18n.js';
import { formatCurrency, formatPercent, formatWeight } from '../../lib/format.js';
import {
  eyebrow,
  iconArrowDown,
  iconArrowRight,
  iconClock,
  iconSearch,
  iconSorted,
  packageThumb,
} from './parts.js';

/** 課題と、それに対して pergram が何をするか。3枚とも同じ構造 */
const FEATURE_CARDS = [
  { n: 1, icon: iconSearch },
  { n: 2, icon: iconClock },
  { n: 3, icon: iconSorted },
];

/** ロードマップとフォームで出す成分。順序を1箇所で決める */
export const ROADMAP_NUTRIENTS = [
  'creatine',
  'eaa_bcaa',
  'hmb',
  'vitamins',
  'iron_zinc',
  'multivitamin',
];

/**
 * 「袋の値段」と「1gあたり」で順位が入れ替わることを示す例。
 *
 * 🔒 実在の製品ではない。導出値はここで計算し、文言に数字を直書きしない。
 *    ヒーロー（実データ）と混同されないよう、セクション末尾に注記を出す。
 */
const EXAMPLE = {
  netWeightG: 1000,
  a: { price: 3000, ratioPercent: 60 },
  b: { price: 3800, ratioPercent: 90 },
};

function exampleFigures({ locale, currency }) {
  const derive = ({ price, ratioPercent }) => {
    const nutrientG = (EXAMPLE.netWeightG * ratioPercent) / 100;
    return { price, ratioPercent, nutrientG, unitCost: price / nutrientG };
  };

  const a = derive(EXAMPLE.a);
  const b = derive(EXAMPLE.b);

  const money = (v) => formatCurrency(v, { locale, currency });
  const weight = (g) => formatWeight(g, { locale });
  const percent = (v) => formatPercent(v, { locale });

  return {
    a,
    b,
    money,
    weight,
    percent,
    netWeight: weight(EXAMPLE.netWeightG),
    priceDiff: money(b.price - a.price),
    // 単価の下げ幅。A を基準にした割合
    savingPercent: percent(Math.round(((a.unitCost - b.unitCost) / a.unitCost) * 100)),
  };
}

/** 比較バー。長さは金額の比そのもので、装飾ではない */
function compareBar({ label, value, widthPercent, isLead, noImageLabel, initial, imageUrl }) {
  return `<div class="cmp-row">
  ${packageThumb({ imageUrl: imageUrl ?? null, initial, noImageLabel })}
  <div class="cmp-row__body">
    <div class="cmp-row__head">
      <span class="cmp-row__label">${escapeHtml(label)}</span>
      <span class="cmp-row__value num${isLead ? ' cmp-row__value--lead' : ''}">${value}</span>
    </div>
    <div class="cmp-bar"><span class="cmp-bar__fill${
      isLead ? ' cmp-bar__fill--lead' : ''
    }" style="width:${widthPercent}%"></span></div>
  </div>
</div>`;
}

/** ¥4.2/g のような主指標。単位を小さく添える */
function unitCostValue(amount, unit) {
  return `${escapeHtml(amount)}<span class="cmp-row__unit">/${escapeHtml(unit)}</span>`;
}

export function features(t) {
  const cards = FEATURE_CARDS.map(
    ({ n, icon }) => `<article class="feature">
  ${icon}
  <p class="feature__label">${escapeHtml(t('lp.features.problemLabel'))}</p>
  <p class="feature__problem">${escapeHtml(t(`lp.features.problem${n}`))}</p>
  <hr class="feature__rule">
  <p class="feature__label feature__label--signal">${escapeHtml(t('lp.features.solutionLabel'))}</p>
  <p class="feature__solution">${escapeHtml(t(`lp.features.solution${n}`))}</p>
</article>`,
  ).join('\n');

  return `<section class="section" id="features">
  ${eyebrow(t('lp.features.eyebrow'))}
  <h2>${escapeHtml(t('lp.features.heading'))}</h2>
  <div class="feature-grid">
${cards}
  </div>

  <div class="banner">
    <p class="banner__text">${escapeHtml(t('lp.features.bannerText'))}</p>
    <a class="btn btn--signal" href="#waitlist">${escapeHtml(t('lp.features.bannerCta'))}</a>
  </div>
</section>`;
}

export function howItWorks(t, { locale, currency, displayUnit }) {
  const f = exampleFigures({ locale, currency });
  const noImageLabel = t('lp.hero.noImage');
  const labelA = t('lp.how.labelA');
  const labelB = t('lp.how.labelB');
  const imageA = '/assets/images/protein_a.jpg';
  const imageB = '/assets/images/protein_b.jpg';

  // 袋の値段: 高いほうを 100% とし、比をそのまま幅にする
  const packWidth = (price) => Math.round((price / Math.max(f.a.price, f.b.price)) * 1000) / 10;
  // 1単位あたり: 高いほうを 100% とする。短い棒が安い
  const unitWidth = (cost) => Math.round((cost / Math.max(f.a.unitCost, f.b.unitCost)) * 1000) / 10;

  return `<section class="section" id="howitworks">
  ${eyebrow(t('lp.how.eyebrow'))}
  <h2>${escapeHtml(t('lp.how.heading'))}</h2>
  <p class="section__lede">${escapeHtml(t('lp.how.lede'))}</p>

  <div class="flip">
    <div class="flip__panel">
      <div class="flip__head">
        <span class="flip__label">${escapeHtml(t('lp.how.beforeLabel'))}</span>
        <span class="tag tag--warn">${escapeHtml(t('lp.how.beforeBadge'))}</span>
      </div>
      <p class="flip__sub">${escapeHtml(t('lp.how.beforeSub'))}</p>

      ${compareBar({
        label: t('lp.how.netWeight', { label: labelA, amount: f.netWeight }),
        value: escapeHtml(f.money(f.a.price)),
        widthPercent: packWidth(f.a.price),
        isLead: true,
        initial: 'A',
        imageUrl: imageA,
        noImageLabel,
      })}
      ${compareBar({
        label: t('lp.how.netWeight', { label: labelB, amount: f.netWeight }),
        value: escapeHtml(f.money(f.b.price)),
        widthPercent: packWidth(f.b.price),
        isLead: false,
        initial: 'B',
        imageUrl: imageB,
        noImageLabel,
      })}

      <p class="flip__note">${escapeHtml(
        t('lp.how.beforeNote', {
          ratioA: f.percent(f.a.ratioPercent),
          ratioB: f.percent(f.b.ratioPercent),
        }),
      )}</p>
    </div>

    <div class="flip__divider">
      <span class="flip__divider-label">${escapeHtml(t('lp.how.divider'))}</span>
      <span class="u-desktop">${iconArrowRight}</span>
      <span class="u-mobile">${iconArrowDown}</span>
    </div>

    <div class="flip__panel flip__panel--after">
      <div class="flip__head">
        <span class="flip__label flip__label--signal">${escapeHtml(t('lp.how.afterLabel'))}</span>
        <span class="tag tag--verified">${escapeHtml(t('lp.how.afterBadge'))}</span>
      </div>
      <p class="flip__sub">${escapeHtml(t('lp.how.afterSub'))}</p>

      ${compareBar({
        label: t('lp.how.effective', { label: labelA, amount: f.weight(f.a.nutrientG) }),
        value: unitCostValue(f.money(f.a.unitCost), displayUnit),
        widthPercent: unitWidth(f.a.unitCost),
        isLead: false,
        initial: 'A',
        imageUrl: imageA,
        noImageLabel,
      })}
      ${compareBar({
        label: t('lp.how.effective', { label: labelB, amount: f.weight(f.b.nutrientG) }),
        value: unitCostValue(f.money(f.b.unitCost), displayUnit),
        widthPercent: unitWidth(f.b.unitCost),
        isLead: true,
        initial: 'B',
        imageUrl: imageB,
        noImageLabel,
      })}

      <p class="flip__note">${escapeHtml(
        t('lp.how.afterNote', { diff: f.priceDiff, percent: f.savingPercent }),
      )}</p>
    </div>
  </div>

  <p class="section__footnote">${escapeHtml(t('lp.how.exampleNote'))}</p>
</section>`;
}

export function roadmap(t) {
  const chips = ROADMAP_NUTRIENTS.map(
    (key) => `<li class="pill">${escapeHtml(t(`nutrient.${key}`))}</li>`,
  ).join('\n        ');

  return `<section class="section" id="roadmap">
  ${eyebrow(t('lp.roadmap.eyebrow'))}
  <h2>${escapeHtml(t('lp.roadmap.heading'))}</h2>
  <p class="section__lede">${escapeHtml(t('lp.roadmap.lede'))}</p>

  <div class="roadmap-grid">
    <div class="roadmap-card">
      <span class="roadmap-card__tag">${escapeHtml(t('lp.roadmap.feat1Tag'))}</span>
      <h3>${escapeHtml(t('lp.roadmap.feat1Title'))}</h3>
      <p>${escapeHtml(t('lp.roadmap.feat1Desc'))}</p>
    </div>
    <div class="roadmap-card">
      <span class="roadmap-card__tag">${escapeHtml(t('lp.roadmap.feat2Tag'))}</span>
      <h3>${escapeHtml(t('lp.roadmap.feat2Title'))}</h3>
      <p>${escapeHtml(t('lp.roadmap.feat2Desc'))}</p>
      <ul class="pill-list" style="margin-top:var(--space-3)">
        ${chips}
      </ul>
    </div>
    <div class="roadmap-card">
      <span class="roadmap-card__tag">${escapeHtml(t('lp.roadmap.feat3Tag'))}</span>
      <h3>${escapeHtml(t('lp.roadmap.feat3Title'))}</h3>
      <p>${escapeHtml(t('lp.roadmap.feat3Desc'))}</p>
    </div>
  </div>
</section>`;
}

/**
 * 検証用ランディングページ。docs/design/design.md
 * 構成は LP_mockup/ の Claude Design 版をそのまま移植している。
 *
 * 🔒 このページの仕事は「答えの一部を出して、続きを予約させる」ことだけ。
 * 🔒 アフィリエイトリンクを置かない（広告審査でアフィリエイトサイト判定を避ける）。
 * 🔒 ヒーローの製品は実データ。ダミーを入れない。ここで嘘をつくと全部が崩れる。
 */

import { escapeHtml } from '../lib/i18n.js';
import { layout } from './layout.js';
import { hero, siteHeader } from './lp/hero.js';
import { features, howItWorks, roadmap, ROADMAP_NUTRIENTS } from './lp/sections.js';
import { siteFooter, waitlist, CHANNEL_CHIPS } from './lp/form.js';
import { supportScript } from './lp/support.js';

export function lpPage(ctx) {
  const {
    t,
    locale,
    currency,
    displayUnit,
    topRows,
    totalCount,
    nutrientName,
    disclosureKey,
    gaMeasurementId,
    betaPath = null,
    support = null,
  } = ctx;

  const content = `${siteHeader(t, { locale, betaPath })}

<main class="lp">
${hero({ t, locale, currency, displayUnit, topRows, totalCount, nutrientName, betaPath })}

${features(t)}

${howItWorks(t, { locale, currency, displayUnit })}

${roadmap(t)}

${waitlist(t, { support })}
</main>

${siteFooter(t, { disclosureKey })}

<script src="/assets/lp.js" defer></script>
${supportScript(support)}`;

  return layout({
    locale,
    title: `${t('lp.metaTitle')} — ${t('brand.name')}`,
    description: t('lp.lede'),
    bodyClass: 'lp-body-root',
    content,
    gaMeasurementId,
    head: `<link rel="stylesheet" href="/assets/lp.css">
<meta property="og:image" content="/assets/ogp.png">
<meta name="theme-color" content="${escapeHtml('#FAFAF7')}">`,
  });
}

export { ROADMAP_NUTRIENTS, CHANNEL_CHIPS };

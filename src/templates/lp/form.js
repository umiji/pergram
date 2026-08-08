/**
 * 待機リストのフォームとフッタ。
 *
 * 🔒 入力は3つまで。年齢・性別・体調は取らない（要配慮個人情報であり、必要もない）。
 * 🔒 「見たい成分」はメールアドレスの直下に置く。ここが検証の主目的。
 * 🔒 送信後は同一ページ内で完了状態に切り替える。別ページに飛ばさない。
 * 🔒 免責は常時表示。折りたたまない。
 */

import { escapeHtml } from '../../lib/i18n.js';
import { wordmark } from '../layout.js';
import { optionChips } from './parts.js';
import { ROADMAP_NUTRIENTS } from './sections.js';

/** 普段の購入先。🔒 単一選択（design.md §4.3） */
const CHANNEL_CHIPS = ['rakuten', 'amazon', 'iherb', 'myprotein', 'store'];

export function waitlist(t) {
  return `<section class="waitlist-band" id="waitlist">
  <div class="waitlist-band__inner">
    <h2 class="waitlist-band__heading">${escapeHtml(t('lp.form.heading'))}</h2>
    <p class="waitlist-band__lede">${escapeHtml(t('lp.form.lede'))}</p>

    <form class="waitlist" novalidate
          data-error-email="${escapeHtml(t('lp.form.errorEmail'))}"
          data-error-send="${escapeHtml(t('lp.form.errorSend'))}">
      <label class="field">
        <span class="field__label">${escapeHtml(t('lp.form.email'))}</span>
        <input type="email" name="email" autocomplete="email" required
               placeholder="${escapeHtml(t('lp.form.emailPlaceholder'))}">
      </label>

      <fieldset class="field">
        <legend class="field__label">${escapeHtml(t('lp.form.nutrients'))}</legend>
        <div class="check-grid">
${optionChips({
  name: 'nutrients',
  keys: ROADMAP_NUTRIENTS,
  prefix: 'nutrient',
  t,
  multiple: true,
  className: 'check',
})}
        </div>
      </fieldset>

      <fieldset class="field">
        <legend class="field__label">${escapeHtml(t('lp.form.channel'))}</legend>
        <div class="pill-choices">
${optionChips({
  name: 'channel',
  keys: CHANNEL_CHIPS,
  prefix: 'channel',
  t,
  multiple: false,
  className: 'pill-choice',
})}
        </div>
      </fieldset>

      <p class="form-error" role="alert" hidden></p>
      <button type="submit" class="btn btn--signal btn--block">${escapeHtml(
        t('lp.form.submit'),
      )}</button>
      <p class="form-note">${escapeHtml(t('lp.form.note'))}</p>
    </form>

    <p class="waitlist__done" role="status" tabindex="-1" hidden>${escapeHtml(
      t('lp.form.done'),
    )}</p>
  </div>
</section>`;
}

export function siteFooter(t, { disclosureKey }) {
  return `<footer class="site-foot">
  <div class="site-foot__inner">
    <div class="site-foot__about">
      ${wordmark(t, { withTagline: true, as: 'div' })}
      <p class="site-foot__text">${escapeHtml(t('lp.foot.about'))}</p>
      <p class="site-foot__copyright">${escapeHtml(t('lp.foot.copyright'))}</p>
    </div>

    <div class="disclosure">
      <h2 class="disclosure__heading">${escapeHtml(t('lp.section5.heading'))}</h2>
      <ul class="disclosure__list">
        <li>${escapeHtml(t('lp.section5.item1'))}</li>
        <li>${escapeHtml(t('lp.section5.item2'))}</li>
        <li>${escapeHtml(t('lp.section5.item3'))}</li>
        <li>${escapeHtml(t('lp.section5.item4'))}</li>
      </ul>
      <p class="disclosure__fine">${escapeHtml(t(`${disclosureKey}.dataSource`))}</p>
      <p class="disclosure__fine">${escapeHtml(t(`${disclosureKey}.referenceSource`))}</p>
      <p class="disclosure__fine">${escapeHtml(t(`${disclosureKey}.affiliate`))}</p>
      <p class="disclosure__fine">${escapeHtml(t(`${disclosureKey}.medical`))}</p>
    </div>
  </div>
</footer>`;
}

export { CHANNEL_CHIPS };

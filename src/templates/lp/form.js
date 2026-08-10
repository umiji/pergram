/**
 * 待機リストのフォームとフッタ。
 *
 * 🔒 入力は3つまで。年齢・性別・体調は取らない（要配慮個人情報であり、必要もない）。
 * 🔒 「見たい成分」はメールアドレスの直下に置く。ここが検証の主目的。
 * 🔒 送信後は同一ページ内で完了状態に切り替える。別ページに飛ばさない。
 * 🔒 免責は常時表示。折りたたまない。
 */

import { escapeHtml } from '../../lib/i18n.js';
import {
  CHANNEL_CHIPS,
  NUTRIENTS_OTHER_MAX,
  REQUESTS_MAX,
  ROADMAP_NUTRIENTS,
} from '../../lib/waitlist_fields.js';
import { wordmark } from '../layout.js';
import { optionChips } from './parts.js';

/**
 * 自由記述の1行入力。
 *
 * 🔒 N-01 / N-05。自由記述は症状や服薬の書き込み口になりうる。
 *    ラベルと placeholder で書いてよいものを限定し、注記でも明示する。
 *    最終的な防波堤は worker 側の長さ制限と、保存列を増やさないこと。
 */
function freeText({ name, label, placeholder, maxLength, multiline = false }) {
  const attrs = `name="${escapeHtml(name)}" maxlength="${maxLength}" placeholder="${escapeHtml(placeholder)}"`;
  const control = multiline
    ? `<textarea class="field__textarea" rows="3" ${attrs}></textarea>`
    : `<input class="field__text" type="text" ${attrs}>`;

  return `<label class="field">
        <span class="field__label">${escapeHtml(label)}</span>
        ${control}
      </label>`;
}

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

      ${freeText({
        name: 'nutrients_other',
        label: t('lp.form.nutrientsOther'),
        placeholder: t('lp.form.nutrientsOtherPlaceholder'),
        maxLength: NUTRIENTS_OTHER_MAX,
      })}

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

      ${freeText({
        name: 'requests',
        label: t('lp.form.requests'),
        placeholder: t('lp.form.requestsPlaceholder'),
        maxLength: REQUESTS_MAX,
        multiline: true,
      })}
      <p class="form-note form-note--caution">${escapeHtml(t('lp.form.freeTextNote'))}</p>

      <p class="form-error" role="alert" hidden></p>
      <button type="submit" class="btn btn--signal btn--block">${escapeHtml(
        t('lp.form.submit'),
      )}</button>
      <p class="form-note">${escapeHtml(t('lp.form.note'))}</p>
      <p class="form-note">${escapeHtml(t('lp.form.noteUse'))}</p>
      <p class="form-note">${escapeHtml(t('lp.form.noteRelease'))}</p>
    </form>

    <p class="waitlist__done" role="status" tabindex="-1" hidden>${escapeHtml(
      t('lp.form.done'),
    )}</p>
  </div>
</section>`;
}

export function siteFooter(t, { disclosureKey }) {
  const affiliate = t(`${disclosureKey}.affiliate`);
  const dataSource = t(`${disclosureKey}.dataSource`);
  const medical = t(`${disclosureKey}.medical`);

  return `<footer class="site-foot">
  <div class="site-foot__inner">
    <div class="site-foot__about">
      ${wordmark(t, { withTagline: true, as: 'div' })}
      <p class="site-foot__text">${escapeHtml(t('lp.foot.about'))}</p>
    </div>

    <div class="disclosure">
      ${affiliate ? `<p class="disclosure__fine">${escapeHtml(affiliate)}</p>` : ''}
      ${dataSource ? `<p class="disclosure__fine">${escapeHtml(dataSource)}</p>` : ''}
      ${medical ? `<p class="disclosure__fine">${escapeHtml(medical)}</p>` : ''}
    </div>
  </div>
  <div class="site-foot__bottom">
    <p class="site-foot__copyright">${escapeHtml(t('lp.foot.copyright'))}</p>
  </div>
</footer>`;
}

export { CHANNEL_CHIPS };

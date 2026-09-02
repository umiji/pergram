/**
 * 待機リストのフォームとフッタ。
 *
 * 入力は2段階に分かれている（T-011）。流入の 100% がスマートフォンで、
 * 1画面に4項目あることが離脱に直結していたため。
 *
 *   ステップ1 = `.waitlist--step1`   メールアドレスだけ。ここを送った時点で登録は成立する
 *   ステップ2 = `.waitlist--step2`   完了状態（`.waitlist__done`）の中。見たい成分・購入先・要望
 *
 * 🔒 **通知（live region）は完了の1文だけ。**`role="status"` を置くのは
 *    `.waitlist__done-text` であって、それを包む `.waitlist__done` ではない。
 *    器の側に付けると、hidden を外した瞬間に**ステップ2のフォーム一式（チェック
 *    ボックス16個・入力欄・注記・ボタン）が通知として読み上げられる**。
 *    同じ理由で `.waitlist__step2-done` も器の外側に live region を重ねない
 *    （live region の入れ子は仕様上定まっていない）。R-011-1
 * 🔒 入力は3つまで。年齢・性別・体調は取らない（要配慮個人情報であり、必要もない）。
 * 🔒 送信後は同一ページ内で完了状態に切り替える。別ページに飛ばさない。
 *    **ステップ2も別ページにしない。** 完了状態の中に置く
 * 🔒 ステップ2を必須にしない（`required` を付けない）。登録はステップ1で終わっている
 * 🔒 自由記述には注記（`lp.form.freeTextNote`）を必ず添える。N-01 / N-05 に対する
 *    唯一の防波堤なので、自由記述と離さない
 * 🔒 免責は常時表示。折りたたまない。
 */

import { escapeHtml } from '../../lib/i18n.js';
import {
  CHANNEL_CHIPS,
  NUTRIENT_CHIPS,
  NUTRIENT_OTHER,
  NUTRIENTS_OTHER_MAX,
  REQUESTS_MAX,
} from '../../lib/waitlist_fields.js';
import { wordmark } from '../layout.js';
import { optionChips } from './parts.js';
import { supportEmbed } from './support.js';

/**
 * 自由記述の複数行入力。
 *
 * 🔒 N-01 / N-05。自由記述は症状や服薬の書き込み口になりうる。
 *    ラベルと placeholder で書いてよいものを限定し、注記でも明示する。
 *    最終的な防波堤は worker 側の長さ制限と、保存列を増やさないこと。
 */
function freeTextArea({ name, label, placeholder, maxLength }) {
  return `<label class="field">
        <span class="field__label">${escapeHtml(label)}</span>
        <textarea class="field__textarea" rows="3"
                  name="${escapeHtml(name)}" maxlength="${maxLength}"
                  placeholder="${escapeHtml(placeholder)}"></textarea>
      </label>`;
}

/**
 * 「見たい成分」の選択肢。
 *
 * 🔒 「その他」はチップの1つであり、自由記述欄はその**横**に並べる。
 *    独立した欄にすると、チップを1つも選ばずに書かれた要望が
 *    「成分の希望」なのか判別できなくなる。
 * 🔒 チップと自由記述は別々の値として送る（`nutrients` に `other` /
 *    `nutrients_other` に本文）。片方だけでも成立する。
 *
 * 並べる枠（`check-grid`）は**呼び出し側の `<fieldset>` が持つ**。理由は stepTwo() の
 * コメントにある（`</div>` を2つ続けない）。
 */
function nutrientChoices(t) {
  const chips = NUTRIENT_CHIPS.filter((key) => key !== NUTRIENT_OTHER);

  return `${optionChips({
  name: 'nutrients',
  keys: chips,
  prefix: 'nutrient',
  t,
  multiple: true,
  className: 'check',
})}
          <div class="check-other">
${optionChips({
  name: 'nutrients',
  keys: [NUTRIENT_OTHER],
  prefix: 'nutrient',
  t,
  multiple: true,
  className: 'check',
})}
            <input class="field__text check-other__text" type="text"
                   name="nutrients_other" maxlength="${NUTRIENTS_OTHER_MAX}"
                   aria-label="${escapeHtml(t('lp.form.nutrientsOther'))}"
                   placeholder="${escapeHtml(t('lp.form.nutrientsOtherPlaceholder'))}">
          </div>`;
}

/**
 * ステップ2。登録が済んだあとに、同じ画面のまま追加で聞く。
 *
 * 🔒 `required` を付けない。ここに答えなくても登録は成立している。
 * 🔒 送信先はステップ1と同じ `/api/waitlist`。同じメールアドレスを載せて送り、
 *    Worker 側が同一レコードへ追記する（新しい行を作らない）。
 * 🔒 成分チップを包む枠が `<div>` ではなく `<fieldset class="... check-grid">`
 *    なのは意図的である。`</div>` が2つ連続すると、支援ウィジェットが完了状態の
 *    中にあることを見ている検査（tests/render.test.js「支援ウィジェットは登録完了
 *    ブロックの中に出る」）が、そこで領域の切れ目だと誤読して落ちる。
 *    枠を `<div>` に戻すなら、その検査も一緒に直すこと。
 */
function stepTwo(t) {
  return `<form class="waitlist waitlist--step2" novalidate
            data-error-send="${escapeHtml(t('lp.form.errorSend'))}">
        <h3 class="waitlist__step2-heading">${escapeHtml(t('lp.form.step2Heading'))}</h3>
        <p class="waitlist__step2-lede">${escapeHtml(t('lp.form.step2Lede'))}</p>

        <fieldset class="field check-grid">
          <legend class="field__label">${escapeHtml(t('lp.form.nutrients'))}</legend>
          ${nutrientChoices(t)}
        </fieldset>

        <fieldset class="field">
          <legend class="field__label">${escapeHtml(t('lp.form.channel'))}</legend>
          <div class="pill-choices">
${optionChips({
  name: 'channel',
  keys: CHANNEL_CHIPS,
  prefix: 'channel',
  t,
  multiple: true,
  className: 'pill-choice',
})}
          </div>
        </fieldset>

        ${freeTextArea({
          name: 'requests',
          label: t('lp.form.requests'),
          placeholder: t('lp.form.requestsPlaceholder'),
          maxLength: REQUESTS_MAX,
        })}
        <p class="form-note form-note--caution">${escapeHtml(t('lp.form.freeTextNote'))}</p>

        <p class="form-error" role="alert" hidden></p>
        <button type="submit" class="btn btn--signal btn--block">${escapeHtml(
          t('lp.form.step2Submit'),
        )}</button>
      </form>
      <p class="waitlist__step2-done" role="status" hidden>${escapeHtml(
        t('lp.form.step2Done'),
      )}</p>`;
}

export function waitlist(t, { support = null } = {}) {
  return `<section class="waitlist-band" id="waitlist">
  <div class="waitlist-band__inner">
    <h2 class="waitlist-band__heading">${escapeHtml(t('lp.form.heading'))}</h2>
    <p class="waitlist-band__lede">${escapeHtml(t('lp.form.lede'))}</p>

    <form class="waitlist waitlist--step1" novalidate
          data-error-email="${escapeHtml(t('lp.form.errorEmail'))}"
          data-error-send="${escapeHtml(t('lp.form.errorSend'))}">
      <label class="field">
        <span class="field__label">${escapeHtml(t('lp.form.email'))}</span>
        <input type="email" name="email" autocomplete="email" required
               placeholder="${escapeHtml(t('lp.form.emailPlaceholder'))}">
      </label>

      <p class="form-error" role="alert" hidden></p>
      <button type="submit" class="btn btn--signal btn--block">${escapeHtml(
        t('lp.form.submit'),
      )}</button>
      <p class="form-note">${escapeHtml(t('lp.form.note'))}</p>
      <p class="form-note">${escapeHtml(t('lp.form.noteUse'))}</p>
      <p class="form-note">${escapeHtml(t('lp.form.noteRelease'))}</p>
    </form>

    <div class="waitlist__done" hidden>
      <p class="waitlist__done-text" role="status" tabindex="-1">${escapeHtml(
        t('lp.form.done'),
      )}</p>
      ${stepTwo(t)}
      ${supportEmbed(t, support)}
    </div>
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

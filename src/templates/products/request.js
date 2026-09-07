/**
 * 製品一覧に置く「他の成分・製品の追加をリクエスト」の導線と、その後段（T-050）。
 *
 * 広告で連れてきた人に**メールアドレスという重い対価**をいきなり求めていたため、
 * 待機リストの登録が 0 件だった。ここでは意思表示を1クリックまで下げ、
 * メールアドレスはその後段（任意）に置く。
 *
 * 🔒 段の順序は 要望 → アンケート → メール → 支援。並べ替えない（T-050 決定ログ）。
 * 🔒 押下数を画面に描画しない。景表法の「人気」表示になり、禁止語の規約にも触れる。
 *    フィードバックは**押した本人のボタンの状態**だけ（src/assets/request.js）。
 * 🔒 リクエストの数を並び順に使わない（N-03）。並び順は常に有効成分1単位あたりの価格。
 * 🔒 第1段階の計測は GA4 のイベントだけで行う。サーバに列を足さない。
 *    保存に回るのはメールアドレスの段を送ったときだけで、列は既存の6つのまま。
 * 🔒 意思表示はサービス単位。成分ごとのボタンを作らない（T-050 決定ログ）。
 *    成分の内訳は、押した人にだけ開くアンケート（任意）で取る。
 * 🔒 支援ウィジェットは1ページに1つ（src/templates/lp/support.js の理由と同じ）。
 *    このページで出すのはここ1箇所だけにする。
 */

import { escapeHtml } from '../../lib/i18n.js';
import { optionChips } from '../lp/parts.js';
import { supportEmbed } from '../lp/support.js';
import {
  CHANNEL_CHIPS,
  NUTRIENT_CHIPS,
  NUTRIENT_OTHER,
  NUTRIENTS_OTHER_MAX,
  REQUESTS_MAX,
} from '../../lib/waitlist_fields.js';

/** 段（アンケート / メール / 支援）を包む器の id。ボタンの aria-controls が指す */
export const REQUEST_FLOW_ID = 'request-flow';

/**
 * 要望ボタン。リストの前と後ろの2箇所に置く。
 *
 * 🔒 `data-cta` の値を2つで違えておく。GA4 の `location` がこれで、
 *    どちらの位置から押されたかを分けて数えられなくなる。
 * 🔒 注記（「登録は不要」）をボタンから離さない。**対価が要らないことが
 *    押せる理由そのもの**なので、離すと押下率の意味が変わる。
 *
 * @param {(key: string, params?: object) => string} t
 * @param {{ location: string }} options `location` は GA4 に送る位置の名前
 */
export function requestCta(t, { location }) {
  return `<section class="request-band">
  <div class="request-band__inner">
    <p class="request-band__lede">${escapeHtml(t('products.request.lede'))}</p>
    <button class="btn btn--signal request-band__button" type="button"
      data-request-cta data-cta="${escapeHtml(location)}"
      aria-controls="${REQUEST_FLOW_ID}" aria-expanded="false"
      data-label-received="${escapeHtml(t('products.request.received'))}">${escapeHtml(
        t('products.request.cta'),
      )}</button>
    <p class="request-band__note">${escapeHtml(t('products.request.note'))}</p>
  </div>
</section>`;
}

/**
 * 「見たい成分」の選択肢。「その他」はチップの1つで、自由記述欄はその横に並べる
 * （LP のフォームと同じ形。理由は src/templates/lp/form.js のコメント）。
 */
function nutrientChoices(t) {
  const chips = NUTRIENT_CHIPS.filter((key) => key !== NUTRIENT_OTHER);

  return `${optionChips({
    name: 'nutrients',
    keys: chips,
    prefix: 'nutrient',
    t,
    multiple: true,
    className: 'request-chip',
  })}
      <div class="request-chip-other">
${optionChips({
  name: 'nutrients',
  keys: [NUTRIENT_OTHER],
  prefix: 'nutrient',
  t,
  multiple: true,
  className: 'request-chip',
})}
        <input class="request-form__text" type="text"
               name="nutrients_other" maxlength="${NUTRIENTS_OTHER_MAX}"
               aria-label="${escapeHtml(t('lp.form.nutrientsOther'))}"
               placeholder="${escapeHtml(t('lp.form.nutrientsOtherPlaceholder'))}">
      </div>`;
}

/** 段の器。初期状態は必ず hidden。開けるのは src/assets/request.js だけ */
function step(kind, body) {
  return `<div class="request-flow__step" data-request-step="${kind}" hidden>
${body}
  </div>`;
}

/**
 * アンケートの段。回答は任意で、送らずに次へ進める。
 *
 * 🔒 `required` を付けない。リクエストはボタンを押した時点で受け取っている。
 * 🔒 自由記述には注記（`lp.form.freeTextNote`）を必ず添える。N-01 / N-05 に対する
 *    唯一の防波堤なので、自由記述と離さない。
 */
function surveyStep(t) {
  return step(
    'survey',
    `    <form class="request-form" data-request-survey novalidate>
      <h2 class="request-flow__heading" tabindex="-1">${escapeHtml(t('products.request.surveyHeading'))}</h2>
      <p class="request-flow__lede">${escapeHtml(t('products.request.surveyLede'))}</p>

      <fieldset class="request-form__group">
        <legend class="request-form__legend">${escapeHtml(t('lp.form.nutrients'))}</legend>
        ${nutrientChoices(t)}
      </fieldset>

      <fieldset class="request-form__group">
        <legend class="request-form__legend">${escapeHtml(t('lp.form.channel'))}</legend>
        <div class="request-chips">
${optionChips({
  name: 'channel',
  keys: CHANNEL_CHIPS,
  prefix: 'channel',
  t,
  multiple: true,
  className: 'request-chip',
})}
        </div>
      </fieldset>

      <label class="request-form__field">
        <span class="request-form__legend">${escapeHtml(t('lp.form.requests'))}</span>
        <textarea class="request-form__textarea" rows="3" name="requests" maxlength="${REQUESTS_MAX}"
                  placeholder="${escapeHtml(t('lp.form.requestsPlaceholder'))}"></textarea>
      </label>
      <p class="request-form__note request-form__note--caution">${escapeHtml(
        t('lp.form.freeTextNote'),
      )}</p>

      <div class="request-form__actions">
        <button class="btn btn--signal" type="submit">${escapeHtml(
          t('products.request.surveySubmit'),
        )}</button>
        <button class="link-button" type="button" data-request-skip="survey">${escapeHtml(
          t('products.request.surveySkip'),
        )}</button>
      </div>
    </form>
    <p class="request-flow__done" role="status" hidden>${escapeHtml(
      t('products.request.surveyDone'),
    )}</p>`,
  );
}

/**
 * メールアドレスの段。
 *
 * 🔒 保存する列は増やさない。送るのは既存の待機リストと同じ6列の範囲だけで、
 *    アンケートの回答もこの送信に相乗りする（メールアドレスが無ければ保存しない）。
 * 🔒 `required` を付けない。ここを飛ばしても次へ進める。
 * 🔒 送信後に別ページへ飛ばさない。同じ画面で完了状態に切り替える。
 */
function emailStep(t) {
  return step(
    'email',
    `    <form class="request-form" data-request-email novalidate
          data-error-email="${escapeHtml(t('lp.form.errorEmail'))}"
          data-error-send="${escapeHtml(t('lp.form.errorSend'))}">
      <h2 class="request-flow__heading" tabindex="-1">${escapeHtml(t('products.request.emailHeading'))}</h2>
      <p class="request-flow__lede">${escapeHtml(t('products.request.emailLede'))}</p>

      <label class="request-form__field">
        <span class="request-form__legend">${escapeHtml(t('lp.form.email'))}</span>
        <input type="email" name="email" autocomplete="email"
               placeholder="${escapeHtml(t('lp.form.emailPlaceholder'))}">
      </label>

      <p class="request-form__error" role="alert" hidden></p>

      <div class="request-form__actions">
        <button class="btn btn--signal" type="submit">${escapeHtml(
          t('products.request.emailSubmit'),
        )}</button>
        <button class="link-button" type="button" data-request-skip="email">${escapeHtml(
          t('products.request.emailSkip'),
        )}</button>
      </div>

      <p class="request-form__note">${escapeHtml(t('lp.form.note'))}</p>
      <p class="request-form__note">${escapeHtml(t('lp.form.noteUse'))}</p>
      <p class="request-form__note">${escapeHtml(t('lp.form.noteRelease'))}</p>
    </form>
    <p class="request-flow__done" role="status" hidden>${escapeHtml(
      t('products.request.emailDone'),
    )}</p>`,
  );
}

/**
 * 支援の段。
 *
 * 🔒 出し分けは条件分岐ではなくデータで。`support` を持たない市場（US）では
 *    段ごと出さない。金額も文言も Codoc 側が持つので、ここで作らない。
 */
function supportStep(t, support) {
  if (!support) return '';

  return step(
    'support',
    `    <h2 class="request-flow__heading" tabindex="-1">${escapeHtml(t('products.request.supportHeading'))}</h2>
    <p class="request-flow__lede">${escapeHtml(t('products.request.supportLede'))}</p>
    ${supportEmbed(t, support)}`,
  );
}

/**
 * 段の一式。文書順が到達順（アンケート → メール → 支援）そのものである。
 *
 * @param {(key: string, params?: object) => string} t
 * @param {{ support?: object | null }} options
 */
export function requestFlow(t, { support = null } = {}) {
  return `<section class="request-flow" id="${REQUEST_FLOW_ID}" data-request-flow>
${surveyStep(t)}
${emailStep(t)}
${supportStep(t, support)}
</section>`;
}

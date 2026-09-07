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

import { escapeAttribute, escapeHtml } from '../lib/i18n.js';
import { optionChips } from './lp/parts.js';
import { supportEmbed } from './lp/support.js';
import {
  CHANNEL_CHIPS,
  NUTRIENT_CHIPS,
  NUTRIENT_OTHER,
  NUTRIENTS_OTHER_MAX,
  REQUESTS_MAX,
} from '../lib/waitlist_fields.js';

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
    <p class="request-band__lede">${escapeHtml(t('request.lede'))}</p>
    <button class="btn btn--signal request-band__button" type="button"
      data-request-cta data-cta="${escapeHtml(location)}"
      aria-controls="${REQUEST_FLOW_ID}" aria-expanded="false"
      data-label-received="${escapeHtml(t('request.received'))}">${escapeHtml(
        t('request.cta'),
      )}</button>
    <p class="request-band__note">${escapeHtml(t('request.note'))}</p>
  </div>
</section>`;
}

/**
 * 「見たい成分」の選択肢。
 *
 * 🔒 「その他」はチップの1つであり、自由記述欄はその**横**に並べる。独立した欄にすると、
 *    チップを1つも選ばずに書かれた要望が「成分の希望」なのか判別できなくなる。
 * ⚠️ まとめる枠のクラス名は `check-other` で固定する。LP の旧フォームから引き継いだ名前で、
 *    「その他チップと自由記述が同じ枠にある」ことを見張る唯一の検査
 *    （tests/render.test.js「「その他」は成分チップの1つで、自由記述欄がその横に並ぶ」）が
 *    この綴りを見ている。**周りの request-* に合わせて改名すると、その検査が黙って落ちる。**
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
      <div class="check-other">
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

/**
 * 段の見出しの階層。
 *
 * 🔒 製品一覧では段が h1（ページ見出し）の直下に来るので h2、
 *    LP では帯の見出し（h2）の下に入るので h3 になる。**入れ子が狂うと
 *    見出しで飛ばして読む人が「どこの話か」を辿れなくなる**（WCAG 1.3.1）。
 * ⚠️ タグは変わるがクラス名（`request-flow__heading`）は変えない。
 *    src/assets/request.js が開いた段の見出しへフォーカスを移すときに使う。
 */
const DEFAULT_HEADING_LEVEL = 2;

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
function surveyStep(t, level) {
  return step(
    'survey',
    `    <form class="request-form" data-request-survey novalidate>
      <h${level} class="request-flow__heading" tabindex="-1">${escapeHtml(t('request.surveyHeading'))}</h${level}>
      <p class="request-flow__lede">${escapeHtml(t('request.surveyLede'))}</p>

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
        <button type="submit" class="btn btn--signal">${escapeHtml(
          t('request.surveySubmit'),
        )}</button>
        <button class="link-button" type="button" data-request-skip="survey">${escapeHtml(
          t('request.surveySkip'),
        )}</button>
      </div>
    </form>
    <p class="request-flow__done" role="status" hidden
       data-request-done="${escapeAttribute(t('request.surveyDone'))}"></p>`,
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
function emailStep(t, level) {
  return step(
    'email',
    `    <form class="request-form" data-request-email novalidate
          data-error-email="${escapeHtml(t('lp.form.errorEmail'))}"
          data-error-send="${escapeHtml(t('lp.form.errorSend'))}">
      <h${level} class="request-flow__heading" tabindex="-1">${escapeHtml(t('request.emailHeading'))}</h${level}>
      <p class="request-flow__lede">${escapeHtml(t('request.emailLede'))}</p>

      <label class="request-form__field">
        <span class="request-form__legend">${escapeHtml(t('lp.form.email'))}</span>
        <input type="email" name="email" autocomplete="email"
               placeholder="${escapeHtml(t('lp.form.emailPlaceholder'))}">
      </label>

      <p class="request-form__error" role="alert" hidden></p>

      <div class="request-form__actions">
        <button type="submit" class="btn btn--signal">${escapeHtml(
          t('request.emailSubmit'),
        )}</button>
        <button class="link-button" type="button" data-request-skip="email">${escapeHtml(
          t('request.emailSkip'),
        )}</button>
      </div>

      <p class="request-form__note">${escapeHtml(t('lp.form.note'))}</p>
      <p class="request-form__note">${escapeHtml(t('lp.form.noteUse'))}</p>
      <p class="request-form__note">${escapeHtml(t('lp.form.noteRelease'))}</p>
    </form>
    <p class="request-flow__done" role="status" hidden
       data-request-done="${escapeAttribute(t('request.emailDone'))}"></p>`,
  );
}

/**
 * 支援の段。
 *
 * 🔒 出し分けは条件分岐ではなくデータで。`support` を持たない市場（US）では
 *    段ごと出さない。金額も文言も Codoc 側が持つので、ここで作らない。
 */
function supportStep(t, support, level) {
  if (!support) return '';

  return step(
    'support',
    `    <h${level} class="request-flow__heading" tabindex="-1">${escapeHtml(t('request.supportHeading'))}</h${level}>
    <p class="request-flow__lede">${escapeHtml(t('request.supportLede'))}</p>
    ${supportEmbed(t, support)}`,
  );
}

/**
 * 段の一式。文書順が到達順（アンケート → メール → 支援）そのものである。
 *
 * @param {(key: string, params?: object) => string} t
 * @param {{ support?: object | null, headingLevel?: number }} options
 *   `headingLevel` は段の見出しのタグ。ページの見出しの深さに合わせる
 */
export function requestFlow(t, { support = null, headingLevel = DEFAULT_HEADING_LEVEL } = {}) {
  const level = headingLevel;
  return `<section class="request-flow" id="${REQUEST_FLOW_ID}" data-request-flow>
${surveyStep(t, level)}
${emailStep(t, level)}
${supportStep(t, support, level)}
</section>`;
}

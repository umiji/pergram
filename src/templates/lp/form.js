/**
 * LP の要望の導線と、フッタ。
 *
 * === 2026-09-07（T-051）でメールアドレス先行フォームを段構造へ置き換えた ===
 * それまで（T-011）は「ステップ1でメールアドレスだけ送る → 完了状態の中で
 * ステップ2を聞く」という形だった。**広告の着地点である LP が、いきなり
 * メールアドレスという重い対価を求めていたため、登録が 0 件だった。**
 * PO 判断で、製品一覧と同じ段構造（要望 → アンケート → メール → 支援）へ
 * **完全に置き換えた**（併存させない）。
 *
 * 🔒 **段の描画は製品一覧と共用する**（src/templates/request.js）。ここで作り直さない。
 *    2箇所に同じ形を持つと、片方だけ直された状態が必ず生まれる。
 *    それが T-051 を起こした「同じ意思表示を指す言葉が画面ごとに違う」の原因である。
 * 🔒 `id="waitlist"` を外さない。**ヘッダの CTA（`#waitlist`）と、製品一覧のヘッダの
 *    CTA（`/{locale}/#waitlist`）の着地点である。** 綴りは GA4 の `header_waitlist` と
 *    揃えて据え置いてあり、変えると変更前後の比較ができなくなる（T-047）。
 * 🔒 免責は常時表示。折りたたまない。
 */

import { escapeHtml } from '../../lib/i18n.js';
import { CHANNEL_CHIPS } from '../../lib/waitlist_fields.js';
import { wordmark } from '../layout.js';
import { requestCta, requestFlow } from '../request.js';

/**
 * 要望の導線ひとそろい。見出し → 第1段階のボタン → 段（初期状態は全て hidden）。
 *
 * 🔒 第1段階のボタンを段の中に入れない。押す前から隠れてしまう。
 * 🔒 `data-cta` は LP 専用の値にする。GA4 の `location` がこれで、
 *    製品一覧の上下2箇所（products_request_top / _bottom）と分けて数える。
 *
 * @param {(key: string, params?: object) => string} t
 * @param {{ support?: object | null }} options
 */
export function waitlist(t, { support = null } = {}) {
  return `<section class="waitlist-band" id="waitlist">
  <div class="waitlist-band__inner">
    <h2 class="waitlist-band__heading">${escapeHtml(t('lp.form.heading'))}</h2>
    ${requestCta(t, { location: 'lp_request' })}
    ${requestFlow(t, { support })}
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

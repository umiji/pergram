/**
 * 待機リストの登録完了後に出す任意支援（Codoc）の埋め込み。
 *
 * 設定の出所は `config/markets.json` の `support` ひとつ。市場ごとの有無で決まり、
 * テンプレート側に `if (locale === ...)` を書かない。US は `support: null` なので
 * 何も出ない。
 *
 * 🔒 **1ページに1つしか置けない。** Codoc の `cms-core.js` は
 *    `.codoc-entries` の各要素から id を読んだあと、
 *    `el: "#codoc-entry-" + code` という ID セレクタで mount 先を引き直す。
 *    ID セレクタは文書内の最初の1つしか返さないため、同じ id を2箇所に置くと
 *    後ろ側は空のまま死ぬ（HTML としても id の重複は不正）。
 *    2箇所に出したくなったら Codoc 側で2つ目の entry を発行すること。
 * 🔒 出すのは登録完了後の画面だけ。LP 本体に決済導線を混ぜない。
 * 🔒 金額・支援の文言は Codoc 側が持つ。pergram の UI で金額を作らない。
 * 🔒 CSP の許可が要る。オリジンの出所は `scriptSrc`（src/build/headers.js が読む）。
 *    許可を忘れるとブラウザにブロックされ、画面には何も出ない。
 */

import { escapeHtml } from '../../lib/i18n.js';

/** 支援ウィジェットの読み込みタグ。body の末尾に1つだけ置く。 */
export function supportScript(support) {
  if (!support) return '';

  return `<script src="${escapeHtml(support.scriptSrc)}" data-css="${escapeHtml(
    support.theme,
  )}" data-usercode="${escapeHtml(support.userCode)}" charset="UTF-8" defer></script>`;
}

/** 支援ウィジェットの描画先。`data-without-body` で記事本文は出さない。 */
export function supportEmbed(t, support) {
  if (!support) return '';

  return `<div id="codoc-entry-${escapeHtml(support.entryCode)}" class="codoc-entries"
           data-without-body="1"
           data-support-message="${escapeHtml(t('lp.support.message'))}"></div>`;
}

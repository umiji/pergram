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
 *    `script-src` の `'unsafe-eval'` も要る（Codoc の Vue が実行時にテンプレートを
 *    コンパイルする）。無いと**何のエラーも出さずに要素だけが空になる**。
 *
 * 見た目は Codoc 管理画面の「追加CSS」が作る。**この項目はリポジトリの外にある**ので、
 * 内容の控えを docs/design/codoc-widget.css に置いてある。tokens.css の値を変えたら
 * こちらも直し、Codoc 管理画面に貼り直すこと。
 */

import { escapeAttribute, escapeHtml } from '../../lib/i18n.js';

/**
 * 支援ウィジェットの読み込みタグ。body の末尾に1つだけ置く。
 *
 * 🔒 `data-lang` を必ず付ける。省くと Codoc はブラウザの言語設定で表示言語を
 *    決めるので、日本語以外のブラウザではボタンが "Tip"、金額を決める
 *    ポップアップも英語になる。表示言語は locale の担当なので market から
 *    引かない（Codoc が解釈するのは ja / en のみ）。
 */
export function supportScript(support, { locale }) {
  if (!support) return '';

  return `<script src="${escapeHtml(support.scriptSrc)}" data-css="${escapeHtml(
    support.theme,
  )}" data-usercode="${escapeHtml(
    support.userCode,
  )}" data-lang="${escapeHtml(locale)}" charset="UTF-8" defer></script>`;
}

/**
 * 支援ウィジェットの描画先。`data-without-body` で記事本文は出さない。
 *
 * 支援メッセージは Codoc が**テキストノードとして**描画する（innerHTML では
 * ない）。`<br>` を入れると文字列 "<br>" がそのまま画面に出るので、改行は
 * 改行のまま属性に残す。見た目の改行は Codoc 管理画面の追加 CSS
 * （`.codoc-support-title { white-space: pre-line }`）が作る。
 */
export function supportEmbed(t, support) {
  if (!support) return '';

  return `<div id="codoc-entry-${escapeHtml(support.entryCode)}" class="codoc-entries"
           data-without-body="1"
           data-support-button-text="${escapeAttribute(t('lp.support.buttonText'))}"
           data-support-message="${escapeAttribute(t('lp.support.message'))}"></div>`;
}

/**
 * LP の計測。フレームワークを使わない。
 * 計測要件は docs/research/validation-plan.md §7 と design.md §12。
 *
 * 🔒 GA4 に個人識別情報を送らない。メールアドレスをイベントパラメータに含めない。
 *
 * === 2026-09-07（T-051）で待機リストの操作をここから外した ===
 * LP のメールアドレス先行フォーム（`.waitlist--step1` / `.waitlist__done` /
 * `.waitlist--step2`）は段構造へ置き換わり、**段を動かすのは
 * `src/assets/request.js`（LP と製品一覧で共用）になった。**
 * ⚠️ フォームの送信をここへ戻さないこと。同じ導線を2つのスクリプトが
 *    別々の前提で動かすことになる。ここに残すのは流入・スクロール・
 *    デモへの接触・`data-cta` の押下という**LP 固有の計測だけ**である。
 */
(function () {
  'use strict';

  /** 送信中の状態を明示するための待ち時間の上限（ms） */
  var REQUEST_TIMEOUT_MS = 10000;

  function track(name, params) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, params || {});
    }
  }

  /* ---- 流入 ---------------------------------------------------------- */

  var query = new URLSearchParams(window.location.search);
  track('lp_view', {
    source: query.get('utm_source') || '(direct)',
    keyword: query.get('utm_term') || '(none)',
  });

  /* ---- スクロール深度 ------------------------------------------------- */

  var depthsSeen = {};
  function onScroll() {
    var scrolled = window.scrollY + window.innerHeight;
    var height = document.body.scrollHeight;
    if (height <= 0) return;
    var percent = Math.round((scrolled / height) * 100);
    [25, 50, 75, 100].forEach(function (mark) {
      if (percent >= mark && !depthsSeen[mark]) {
        depthsSeen[mark] = true;
        track('scroll_depth', { percent: mark });
      }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- デモ的な要素に触れたか ----------------------------------------- */

  // ヒーローのランキング行。価値が伝わったかの中間指標
  document.querySelectorAll('.rank-row').forEach(function (row) {
    row.addEventListener('click', function () {
      track('demo_interact', { nutrient_id: 'protein', action: 'row_tap' });
    });
  });

  // 「袋の値段 → 1gあたり」の図が画面に入ったか
  var flip = document.querySelector('.flip');
  if (flip && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          track('demo_interact', { nutrient_id: 'protein', action: 'flip_view' });
          observer.disconnect();
        });
      },
      { threshold: 0.5 },
    );
    observer.observe(flip);
  }

  /* ---- CTA ------------------------------------------------------------ */

  // どの CTA から動いたかを分ける。文言ではなく位置で数える。
  //
  // 🔒 **第1段階のボタン（data-request-cta）はここで数えない。**
  //    そちらは src/assets/request.js が `request_click` を送っており、`location` にも
  //    同じ data-cta の値が入る。両方を付けると **LP だけ同じ押下が2件**（cta_click と
  //    request_click）になり、このスクリプトを読まない製品一覧と件数が揃わない。
  //    画面ごとに数え方が違うと、ファネルの離脱率が読めなくなる。
  document.querySelectorAll('[data-cta]').forEach(function (el) {
    if (el.hasAttribute('data-request-cta')) return;
    el.addEventListener('click', function () {
      track('cta_click', { location: el.getAttribute('data-cta') });
    });
  });

})();

/**
 * LP のインタラクション。フレームワークを使わない。
 * 計測要件は docs/research/validation-plan.md §7 と design.md §12。
 *
 * 🔒 GA4 に個人識別情報を送らない。メールアドレスをイベントパラメータに含めない。
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

  // どの CTA から動いたかを分ける。文言ではなく位置で数える
  document.querySelectorAll('[data-cta]').forEach(function (el) {
    el.addEventListener('click', function () {
      track('cta_click', { location: el.getAttribute('data-cta') });
    });
  });

  /* ---- 待機リスト ----------------------------------------------------- */

  var form = document.querySelector('.waitlist');
  if (!form) return;

  var emailInput = form.querySelector('input[name="email"]');
  var errorEl = form.querySelector('.form-error');
  var doneEl = document.querySelector('.waitlist__done');
  var button = form.querySelector('button[type="submit"]');
  var started = false;

  emailInput.addEventListener('focus', function () {
    if (started) return;
    started = true;
    track('waitlist_start', {});
  });

  // 「その他」の自由記述に書いたのにチップを選び忘れる、を防ぐ。
  // 逆（チップを外したら本文を消す）はやらない — 書いたものを勝手に捨てない。
  var otherText = form.querySelector('[name="nutrients_other"]');
  var otherCheck = form.querySelector('input[name="nutrients"][value="other"]');
  if (otherText && otherCheck) {
    otherText.addEventListener('input', function () {
      if (otherText.value.trim() !== '') otherCheck.checked = true;
    });
    otherCheck.addEventListener('change', function () {
      if (otherCheck.checked) otherText.focus();
    });
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  /** 自由記述。空欄は null にして、送信本文に空文字を混ぜない */
  function fieldValue(name) {
    var el = form.querySelector('[name="' + name + '"]');
    if (!el) return null;
    var value = el.value.trim();
    return value === '' ? null : value;
  }

  function checkedValues(name) {
    return Array.prototype.slice
      .call(form.querySelectorAll('input[name="' + name + '"]:checked'))
      .map(function (input) {
        return input.value;
      });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorEl.hidden = true;

    var email = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError(form.dataset.errorEmail);
      emailInput.focus();
      return;
    }

    var nutrients = checkedValues('nutrients');
    // 購入先は掛け持ちが普通なので複数選択。1つに丸めない
    var channels = checkedValues('channel');
    var nutrientsOther = fieldValue('nutrients_other');
    var requests = fieldValue('requests');

    button.disabled = true;

    // ネットワークが返らないまま押せない状態が続くのを避ける
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller
      ? window.setTimeout(function () {
          controller.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;

    fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        nutrients: nutrients,
        channel: channels,
        nutrients_other: nutrientsOther,
        requests: requests,
      }),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        if (!res.ok) throw new Error('request_failed');
        // 🔒 メールアドレスは送らない。選択内容のみ。
        //    自由記述は**本文を送らない**。書かれたかどうかだけを数える
        //    （症状や固有名詞が GA4 に流れる経路を作らない）。
        track('waitlist_submit', {
          selected_nutrients: nutrients.join(','),
          purchase_channel: channels.join(',') || '(none)',
          has_nutrients_other: nutrientsOther ? 1 : 0,
          has_requests: requests ? 1 : 0,
        });
        form.hidden = true;
        doneEl.hidden = false;
        doneEl.focus();
      })
      .catch(function () {
        button.disabled = false;
        showError(form.dataset.errorSend);
      })
      .finally(function () {
        if (timer !== null) window.clearTimeout(timer);
      });
  });
})();

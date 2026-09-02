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

  /*
   * 2段階（T-011）。
   *   ステップ1 … メールアドレスだけ。**ここを送った時点で登録は成立する**
   *   ステップ2 … 完了状態の中。見たい成分・購入先・要望。任意
   *
   * 🔒 ステップ2はステップ1と同じメールアドレスを載せて同じ `/api/waitlist` へ送る。
   *    Worker が同一レコードへ追記する（新しい行を作らない）。
   * 🔒 到達（waitlist_step2_view）と送信（waitlist_step2_submit）を**別のイベント**で
   *    数える。同じ名前にすると到達率が出せない。
   */

  var stepOne = document.querySelector('.waitlist--step1');
  if (!stepOne) return;

  var emailInput = stepOne.querySelector('input[name="email"]');
  var doneEl = document.querySelector('.waitlist__done');
  /*
   * 🔒 完了の知らせの1文。**フォーカスを当てるのはここであって、
   *    これを包む .waitlist__done ではない。** 器の側を focus すると、
   *    支援技術がその中身（ステップ2のフォーム一式）をまるごと読み上げる。R-011-1
   */
  var doneText = doneEl ? doneEl.querySelector('.waitlist__done-text') : null;
  var stepTwo = doneEl ? doneEl.querySelector('.waitlist--step2') : null;
  var stepTwoDone = doneEl ? doneEl.querySelector('.waitlist__step2-done') : null;
  var started = false;
  /** ステップ1で登録できたメールアドレス。ステップ2の追記先を指す */
  var registeredEmail = null;

  emailInput.addEventListener('focus', function () {
    if (started) return;
    started = true;
    track('waitlist_start', {});
  });

  // 「その他」の自由記述に書いたのにチップを選び忘れる、を防ぐ。
  // 逆（チップを外したら本文を消す）はやらない — 書いたものを勝手に捨てない。
  var otherText = stepTwo && stepTwo.querySelector('[name="nutrients_other"]');
  var otherCheck = stepTwo && stepTwo.querySelector('input[name="nutrients"][value="other"]');
  if (otherText && otherCheck) {
    otherText.addEventListener('input', function () {
      if (otherText.value.trim() !== '') otherCheck.checked = true;
    });
    otherCheck.addEventListener('change', function () {
      if (otherCheck.checked) otherText.focus();
    });
  }

  function showError(form, message) {
    var errorEl = form.querySelector('.form-error');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError(form) {
    var errorEl = form.querySelector('.form-error');
    if (errorEl) errorEl.hidden = true;
  }

  function submitButton(form) {
    return form.querySelector('button[type="submit"]');
  }

  /** 自由記述。空欄は null にして、送信本文に空文字を混ぜない */
  function fieldValue(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    if (!el) return null;
    var value = el.value.trim();
    return value === '' ? null : value;
  }

  function checkedValues(form, name) {
    return Array.prototype.slice
      .call(form.querySelectorAll('input[name="' + name + '"]:checked'))
      .map(function (input) {
        return input.value;
      });
  }

  /**
   * 待機リストへの送信。ステップ1もステップ2もここを通る。
   * ネットワークが返らないまま押せない状態が続くのを避けるため、時間で打ち切る。
   */
  function postWaitlist(payload) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller
      ? window.setTimeout(function () {
          controller.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;

    return fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        if (!res.ok) throw new Error('request_failed');
        return res;
      })
      .finally(function () {
        if (timer !== null) window.clearTimeout(timer);
      });
  }

  stepOne.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError(stepOne);

    var email = emailInput.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError(stepOne, stepOne.dataset.errorEmail);
      emailInput.focus();
      return;
    }

    var button = submitButton(stepOne);
    if (button) button.disabled = true;

    // 🔒 送るのはメールアドレスだけ。ステップ2の項目は空で上書きしない
    //    （Worker 側も空では既存の回答を消さない）。
    postWaitlist({ email: email })
      .then(function () {
        registeredEmail = email;
        // 🔒 メールアドレスは送らない。登録できたという事実だけを数える。
        track('waitlist_submit', {});
        stepOne.hidden = true;
        doneEl.hidden = false;
        (doneText || doneEl).focus();
        // 到達。ここを分母にしてステップ2の回答率を出す
        if (stepTwo) track('waitlist_step2_view', {});
      })
      .catch(function () {
        if (button) button.disabled = false;
        showError(stepOne, stepOne.dataset.errorSend);
      });
  });

  if (!stepTwo) return;

  stepTwo.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError(stepTwo);
    if (!registeredEmail) return;

    var nutrients = checkedValues(stepTwo, 'nutrients');
    // 購入先は掛け持ちが普通なので複数選択。1つに丸めない
    var channels = checkedValues(stepTwo, 'channel');
    var nutrientsOther = fieldValue(stepTwo, 'nutrients_other');
    var requests = fieldValue(stepTwo, 'requests');

    var button = submitButton(stepTwo);
    if (button) button.disabled = true;

    postWaitlist({
      // 🔒 ステップ1と同じメールアドレス。これが同一レコードへの追記の鍵になる
      email: registeredEmail,
      nutrients: nutrients,
      channel: channels,
      nutrients_other: nutrientsOther,
      requests: requests,
    })
      .then(function () {
        // 🔒 メールアドレスは送らない。選択内容のみ。
        //    自由記述は**本文を送らない**。書かれたかどうかだけを数える
        //    （症状や固有名詞が GA4 に流れる経路を作らない）。
        track('waitlist_step2_submit', {
          selected_nutrients: nutrients.join(',') || '(none)',
          purchase_channel: channels.join(',') || '(none)',
          has_nutrients_other: nutrientsOther ? 1 : 0,
          has_requests: requests ? 1 : 0,
        });
        stepTwo.hidden = true;
        if (stepTwoDone) stepTwoDone.hidden = false;
      })
      .catch(function () {
        if (button) button.disabled = false;
        showError(stepTwo, stepTwo.dataset.errorSend);
      });
  });
})();

/**
 * 製品一覧の「他の成分・製品の追加をリクエスト」の段階（T-050）。依存パッケージなし。
 *
 * 段は 要望 → アンケート → メール → 支援 の順に開く。開くまでは HTML 側で
 * hidden が付いている（src/templates/products/request.js）。
 *
 * 🔒 押下数を画面に描画しない。ボタンの状態を「受け取りました」に変えるだけで、
 *    数も順位も出さない（景表法の「人気」表示・N-03）。
 * 🔒 GA4 に個人識別情報を送らない。**メールアドレスをイベントパラメータに含めない。**
 * 🔒 自由記述の**本文**を GA4 へ送らない。書かれたかどうか（0 / 1）だけを数える。
 * 🔒 サーバへ送るのは既存の待機リストと同じ6列の範囲だけ。列を足さない。
 *    アンケートの回答は、メールアドレスの段を送ったときに相乗りする
 *    （メールアドレスが無ければ保存しない。保存の鍵がそれしかない）。
 * 🔒 送信後に別ページへ飛ばさない。同じ画面で完了状態に切り替える。
 */
(() => {
  'use strict';

  /** 送信中の状態を明示するための待ち時間の上限（ms）。src/assets/lp.js と同じ */
  const REQUEST_TIMEOUT_MS = 10000;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /** GA4 送信の共通ガード。gtag 未ロード時は何もしない */
  function track(name, params) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, params || {});
    }
  }

  const flow = document.querySelector('[data-request-flow]');
  const ctas = Array.from(document.querySelectorAll('[data-request-cta]'));
  if (!flow || ctas.length === 0) return;

  const steps = {
    survey: flow.querySelector('[data-request-step="survey"]'),
    email: flow.querySelector('[data-request-step="email"]'),
    support: flow.querySelector('[data-request-step="support"]'),
  };

  const surveyForm = flow.querySelector('[data-request-survey]');
  const emailForm = flow.querySelector('[data-request-email]');

  /** アンケートの回答。メールアドレスの段を送るまでは画面の中にだけ置く */
  let answers = null;

  /* ---- 段の開閉 ------------------------------------------------------- */

  function reducedMotion() {
    return typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  }

  function bringIntoView(el) {
    if (!el || typeof el.scrollIntoView !== 'function') return;
    el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  /**
   * 段を開く。開いた段の見出しへフォーカスを移す。
   * 見出しを持たない段（支援）では段そのものを見せるだけにする。
   */
  function openStep(kind, { focus = true } = {}) {
    const step = steps[kind];
    if (!step) return false;

    const wasHidden = step.hidden;
    step.hidden = false;
    if (!focus) return wasHidden;

    const heading = step.querySelector('.request-flow__heading');
    bringIntoView(heading || step);
    if (heading && typeof heading.focus === 'function') heading.focus();
    return wasHidden;
  }

  /** 段の中のフォームを完了状態に切り替える。フォームを隠し、完了の1文を出す */
  function finishStep(kind) {
    const step = steps[kind];
    if (!step) return;
    const form = step.querySelector('.request-form');
    const done = step.querySelector('.request-flow__done');
    if (form) form.hidden = true;
    if (done) done.hidden = false;
  }

  /* ---- 第1段階: 要望ボタン -------------------------------------------- */

  /**
   * 押した本人へのフィードバック。
   * 🔒 ここで数を出さない。出した瞬間に「人気」の表示になる。
   */
  function markReceived(button) {
    const received = button.dataset.labelReceived;
    if (received) button.textContent = received;
    button.classList.add('is-received');
    button.setAttribute('aria-expanded', 'true');
  }

  ctas.forEach((button) => {
    button.addEventListener('click', () => {
      // 位置（絞り込みの近く / リストの末尾）を分けて数える。文言では分けない
      track('request_click', { location: button.dataset.cta || '(none)' });
      ctas.forEach(markReceived);

      const opened = openStep('survey');
      if (opened) track('request_survey_view', {});
    });
  });

  /* ---- 第2段階: アンケート（任意） ------------------------------------ */

  function checkedValues(form, name) {
    return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map(
      (input) => input.value,
    );
  }

  /** 自由記述。空欄は null にして、送信本文に空文字を混ぜない */
  function fieldValue(form, name) {
    const el = form.querySelector(`[name="${name}"]`);
    if (!el) return null;
    const value = el.value.trim();
    return value === '' ? null : value;
  }

  function toEmailStep() {
    const opened = openStep('email');
    if (opened) track('request_email_view', {});
  }

  function toSupportStep() {
    const opened = openStep('support');
    if (opened) track('request_support_view', {});
  }

  if (surveyForm) {
    // 「その他」に書いたのにチップを選び忘れる、を防ぐ（LP のフォームと同じ）。
    // 逆（チップを外したら本文を消す）はやらない — 書いたものを勝手に捨てない
    const otherText = surveyForm.querySelector('[name="nutrients_other"]');
    const otherCheck = surveyForm.querySelector('input[name="nutrients"][value="other"]');
    if (otherText && otherCheck) {
      otherText.addEventListener('input', () => {
        if (otherText.value.trim() !== '') otherCheck.checked = true;
      });
      otherCheck.addEventListener('change', () => {
        if (otherCheck.checked) otherText.focus();
      });
    }

    surveyForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const nutrients = checkedValues(surveyForm, 'nutrients');
      const channel = checkedValues(surveyForm, 'channel');
      const nutrientsOther = fieldValue(surveyForm, 'nutrients_other');
      const requests = fieldValue(surveyForm, 'requests');
      answers = { nutrients, channel, nutrients_other: nutrientsOther, requests };

      // 🔒 自由記述は**本文を送らない**。書かれたかどうかだけを数える
      //    （症状や固有名詞が GA4 に流れる経路を作らない）
      track('request_survey_submit', {
        selected_nutrients: nutrients.join(',') || '(none)',
        purchase_channel: channel.join(',') || '(none)',
        has_nutrients_other: nutrientsOther ? 1 : 0,
        has_requests: requests ? 1 : 0,
      });

      finishStep('survey');
      toEmailStep();
    });
  }

  /* ---- 第3段階: メールアドレス（任意） -------------------------------- */

  function showError(form, message) {
    const errorEl = form.querySelector('.request-form__error');
    if (!errorEl || !message) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError(form) {
    const errorEl = form.querySelector('.request-form__error');
    if (errorEl) errorEl.hidden = true;
  }

  /** 待機リストへの送信。応答が返らないまま押せない状態が続くのを時間で打ち切る */
  function postWaitlist(payload) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
      ? window.setTimeout(() => {
          controller.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;

    return fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    })
      .then((res) => {
        if (!res.ok) throw new Error('request_failed');
        return res;
      })
      .finally(() => {
        if (timer !== null) window.clearTimeout(timer);
      });
  }

  if (emailForm) {
    emailForm.addEventListener('submit', (event) => {
      event.preventDefault();
      clearError(emailForm);

      const input = emailForm.querySelector('input[type="email"]');
      const email = input ? input.value.trim() : '';
      if (!EMAIL_RE.test(email)) {
        showError(emailForm, emailForm.dataset.errorEmail);
        if (input) input.focus();
        return;
      }

      const button = emailForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;

      // 🔒 保存に回るのはこの6列の範囲だけ。アンケートに答えていなければ
      //    メールアドレスだけを送る（Worker は空で既存の回答を上書きしない）
      const payload = { email };
      if (answers) {
        payload.nutrients = answers.nutrients;
        payload.channel = answers.channel;
        payload.nutrients_other = answers.nutrients_other;
        payload.requests = answers.requests;
      }

      postWaitlist(payload)
        .then(() => {
          // 🔒 メールアドレスは送らない。登録できたという事実だけを数える
          track('request_email_submit', {});
          finishStep('email');
          toSupportStep();
        })
        .catch(() => {
          if (button) button.disabled = false;
          showError(emailForm, emailForm.dataset.errorSend);
        });
    });
  }

  /* ---- 段を飛ばす ------------------------------------------------------ */

  document.querySelectorAll('[data-request-skip]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.dataset.requestSkip;
      track(kind === 'survey' ? 'request_survey_skip' : 'request_email_skip', {});
      finishStep(kind);
      if (kind === 'survey') toEmailStep();
      else toSupportStep();
    });
  });
})();

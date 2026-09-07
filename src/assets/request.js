/**
 * 「成分・製品の追加をリクエスト」の段階（T-050 / T-051）。依存パッケージなし。
 *
 * **LP（/{locale}/）と製品一覧（/{locale}/{nutrient}/）の両方で動く。**
 * 段は 要望 → アンケート → メール → 支援 の順に開く。開くまでは HTML 側で
 * hidden が付いている（src/templates/request.js）。
 *
 * 🔒 押下数を画面に描画しない。ボタンの状態を「受け取りました」に変えるだけで、
 *    数も順位も出さない（景表法の「人気」表示・N-03）。
 * 🔒 GA4 に個人識別情報を送らない。**メールアドレスをイベントパラメータに含めない。**
 * 🔒 自由記述の**本文**を GA4 へ送らない。書かれたかどうか（0 / 1）だけを数える。
 * 🔒 待機リスト（/api/waitlist）へ送るのは既存の6列の範囲だけ。列を足さない。
 *    アンケートの回答は、メールアドレスの段を送ったときに相乗りする
 *    （メールアドレスが無ければ保存しない。保存の鍵がそれしかない）。
 * 🔒 送信後に別ページへ飛ばさない。同じ画面で完了状態に切り替える。
 * 🔒 匿名シグナル（/api/request-signal）が失敗しても**段は必ず開く**。
 *    保存は計測の都合であって、ユーザーの用ではない。
 */
(() => {
  'use strict';

  /** 送信中の状態を明示するための待ち時間の上限（ms）。src/assets/lp.js と同じ */
  const REQUEST_TIMEOUT_MS = 10000;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---- 匿名シグナル（T-051） ------------------------------------------ */

  /** 第1段階の押下を1行だけ残す受け口。持つのは UUID と日時だけ */
  const SIGNAL_ENDPOINT = '/api/request-signal';

  /**
   * ブラウザごとの識別子の置き場。
   * 🔒 **ここに入るのはこのブラウザが作った UUID だけ。** メールアドレス・回答・
   *    閲覧履歴を入れない。localStorage はサーバへ送られないが、共用端末では
   *    次の利用者にも読める。
   */
  const SIGNAL_STORAGE_KEY = 'pergram.request_signal_id';

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

  /**
   * 段の中のフォームを畳む。**完了文言は出さない。**
   * 飛ばした（`data-request-skip`）ときはこちらを使う。
   */
  function collapseStep(kind) {
    const step = steps[kind];
    if (!step) return;
    const form = step.querySelector('.request-form');
    if (form) form.hidden = true;
  }

  /**
   * 段の中のフォームを完了状態に切り替える。フォームを畳み、完了の1文を出す。
   *
   * 🔒 **実際に送った段でしか呼ばない。** 飛ばした段で呼ぶと
   *    「登録しました。掲載したらお知らせします。」のような、**サービスが保持して
   *    いないデータを保持していると断言する文**が出る（pergram-ui-copy「事実のみを書く」）。
   * ⚠️ 文言は HTML に埋めず `data-request-done` から**ここで書き込む**。
   *    `role="status"` は**中身が変化したときに読み上げられる**ので、最初から
   *    文字が入ったまま hidden を外すだけでは、支援技術に伝わらないことがある。
   */
  function finishStep(kind) {
    const step = steps[kind];
    if (!step) return;
    collapseStep(kind);
    const done = step.querySelector('.request-flow__done');
    if (!done) return;
    done.textContent = done.dataset.requestDone || '';
    done.hidden = false;
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

  /* ---- 匿名シグナル: ブラウザごとに1行だけ残す（T-051） ---------------- */

  /**
   * localStorage は使えないことがある（プライベートモード、Cookie 拒否、
   * 容量超過）。**触るだけで例外が飛ぶ**ので、読み書きの両方を包む。
   * 読めなければ「まだ送っていない」、書けなければ「次も送る」で先へ進む。
   */
  function readSignalId() {
    try {
      return window.localStorage.getItem(SIGNAL_STORAGE_KEY);
    } catch (err) {
      return null;
    }
  }

  function writeSignalId(id) {
    try {
      window.localStorage.setItem(SIGNAL_STORAGE_KEY, id);
    } catch (err) {
      /* 保存できなくても導線は止めない */
    }
  }

  /**
   * 匿名の識別子。`crypto.randomUUID()` が無い環境では**作らない**。
   *
   * 🔒 独自の疑似乱数で代用しない。衝突すればサーバ側で1行に潰れ、
   *    「何人が意思表示したか」が静かに目減りする。**送らないほうがまだ読める**
   *    （GA4 の request_click が残っており、こちらは 0 件になるだけ）。
   */
  function newSignalId() {
    return window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : null;
  }

  /** 同じページで2回以上送らないための鍵。ボタンは2箇所にある */
  let signalSent = false;

  /**
   * 第1段階の押下をサーバへ1行残す。
   *
   * 🔒 **応答を待たない。失敗しても握り潰す。** 段の開閉はこの結果に依存しない。
   * 🔒 送るのは `{ id }` だけ。押された場所・成分・自由記述を混ぜない
   *    （押された場所の区別は GA4 の location が持つ）。
   * 🔒 送信前に id を保存する。**送信後にすると、応答が返らなかった回が
   *    次回に別の UUID で数え直され、同じブラウザが2人に見える。**
   *    取りこぼす側（控えめな数字）へ倒すのが正しい。
   */
  function sendRequestSignal() {
    if (signalSent) return;
    signalSent = true;

    // このブラウザは既に数えられている。2回目以降は送らない（段は開く）
    if (readSignalId()) return;

    const id = newSignalId();
    if (!id) return;
    writeSignalId(id);

    // `.catch()` が拾うのは**拒否されたときだけ**である。fetch を持たない環境や
    // 引数を受け付けない環境では**その場で投げる**ので、同期の側も包む
    try {
      fetch(SIGNAL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
        keepalive: true,
      }).catch(() => {
        /* 計測の都合。ユーザーには何も見せない */
      });
    } catch (err) {
      /* 同上。導線は既に開いている */
    }
  }

  ctas.forEach((button) => {
    button.addEventListener('click', () => {
      // 位置（絞り込みの近く / リストの末尾 / LP）を分けて数える。文言では分けない
      track('request_click', { location: button.dataset.cta || '(none)' });
      ctas.forEach(markReceived);

      // 🔒 **段を開くのが先。** 匿名シグナルの保存は計測の都合であって
      //    ユーザーの用ではない（T-051 ## 判断してよい範囲）。送信の側で
      //    例外が出ても導線が止まらないよう、順序で担保しておく
      const opened = openStep('survey');
      if (opened) track('request_survey_view', {});

      sendRequestSignal();
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
          // 🔒 **この名前を消さない。** docs/ops/google-ads-first-campaign.md (0-4) で
          //    Google 広告のコンバージョンとしてインポート済みの名前である。送る箇所が
          //    無くなっても広告側はエラーにならず、**0 件のまま静かに記録され続ける**
          //    （T-047 と同じ壊れ方）。request_email_submit とは別に、名前の連続性の
          //    ためだけに残す。パラメータは持たせない（個人識別情報を載せる隙を作らない）。
          track('waitlist_submit', {});
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
      // 🔒 完了文言を出さない。飛ばした段では**何も起きていない**
      collapseStep(kind);
      if (kind === 'survey') toEmailStep();
      else toSupportStep();
    });
  });
})();

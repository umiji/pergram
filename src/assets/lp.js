/**
 * LP のインタラクション。design/ad-lp.md §5「JS は物差しのインタラクションのみ」
 * フレームワークを使わない。計測は research/validation-plan.md §7。
 *
 * 🔒 GA4 に個人識別情報を送らない。メールアドレスをイベントパラメータに含めない。
 */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /* ---- ランキング行のタップ ------------------------------------------- */

  document.querySelectorAll('.lp-row').forEach(function (row) {
    row.addEventListener('click', function () {
      track('demo_interact', { nutrient_id: 'protein', action: 'row_tap' });
    });
  });

  /* ---- コストの物差し ------------------------------------------------- */

  var ruler = document.querySelector('.ruler');
  if (ruler) {
    var track_ = ruler.querySelector('.ruler__track');
    var dots = Array.prototype.slice.call(ruler.querySelectorAll('.ruler__dot'));
    var gapEl = ruler.querySelector('.ruler__gap');
    var min = parseFloat(ruler.dataset.min);
    var max = parseFloat(ruler.dataset.max);
    var activeFilters = [];

    // 🔒 数値は Intl で書式化する。文字列連結で組み立てない
    var money = new Intl.NumberFormat(ruler.dataset.locale, {
      style: 'currency',
      currency: ruler.dataset.currency,
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      signDisplay: 'always',
    });

    // 対数スケールで配置する。線形だと外れ値で潰れる
    function positionOf(cost) {
      if (!(max > min)) return 50;
      var ratio = (Math.log(cost) - Math.log(min)) / (Math.log(max) - Math.log(min));
      return 2 + ratio * 96; // 端のドットが切れないよう内側に寄せる
    }

    dots.forEach(function (dot) {
      dot.style.left = positionOf(parseFloat(dot.dataset.cost)) + '%';
      if (!reduceMotion) dot.style.transition = 'opacity 160ms ease';
    });

    function matches(dot) {
      if (activeFilters.length === 0) return true;
      var attrs = JSON.parse(dot.dataset.attrs || '[]');
      return activeFilters.every(function (f) {
        return attrs.indexOf(f) !== -1;
      });
    }

    function apply() {
      var visibleCosts = [];
      dots.forEach(function (dot) {
        var ok = matches(dot);
        dot.classList.toggle('is-dimmed', !ok);
        if (ok) visibleCosts.push(parseFloat(dot.dataset.cost));
      });

      if (visibleCosts.length === 0) {
        gapEl.textContent = gapEl.dataset.emptyText;
        return;
      }
      if (activeFilters.length === 0) {
        gapEl.textContent = '';
        return;
      }
      var filteredMin = Math.min.apply(null, visibleCosts);
      var gap = filteredMin - min;
      gapEl.textContent = gapEl.dataset.gapTemplate.replace('{amount}', money.format(gap));
    }

    ruler.querySelectorAll('[data-filter]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var key = chip.dataset.filter;
        var index = activeFilters.indexOf(key);
        if (index === -1) activeFilters.push(key);
        else activeFilters.splice(index, 1);
        chip.classList.toggle('is-active', index === -1);
        apply();
        track('ruler_filter', { filter_key: key });
      });
    });
  }

  /* ---- 待機リスト ----------------------------------------------------- */

  var form = document.querySelector('.waitlist');
  if (!form) return;

  var emailInput = form.querySelector('input[name="email"]');
  var errorEl = form.querySelector('.form-error');
  var doneEl = document.querySelector('.waitlist__done');
  var started = false;

  emailInput.addEventListener('focus', function () {
    if (started) return;
    started = true;
    track('waitlist_start', {});
  });

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
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

    var nutrients = Array.prototype.slice
      .call(form.querySelectorAll('input[name="nutrients"]:checked'))
      .map(function (i) {
        return i.value;
      });
    var channelInput = form.querySelector('input[name="channel"]:checked');
    var channel = channelInput ? channelInput.value : null;

    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, nutrients: nutrients, channel: channel }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('request_failed');
        // 🔒 メールアドレスは送らない。選択内容のみ
        track('waitlist_submit', {
          selected_nutrients: nutrients.join(','),
          purchase_channel: channel || '(none)',
        });
        form.hidden = true;
        doneEl.hidden = false;
        doneEl.focus();
      })
      .catch(function () {
        button.disabled = false;
        showError(form.dataset.errorSend);
      });
  });
})();

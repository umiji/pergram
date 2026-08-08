/**
 * 製品一覧ページの操作。依存パッケージなし。
 *
 * 🔒 並び替えはしない。並び順はビルド時に主指標で確定していて、行は絶対に動かない。
 *    だから絞り込みは hidden の付け外しだけで済み、再描画も差分計算も要らない。
 * 🔒 個人情報を localStorage にも置かない。状態は URL にだけ持つ。
 *    URL に持つと共有でき、戻るボタンが効き、再読み込みでも消えない。
 */
(() => {
  'use strict';

  const list = document.querySelector('.p-list');
  const form = document.querySelector('.filters');
  if (!list || !form) return;

  const items = Array.from(list.querySelectorAll('.p-item'));
  const panel = document.querySelector('[data-filter-panel]');
  const openBtn = document.querySelector('[data-filter-open]');
  const searchInput = document.querySelector('[data-product-search]');
  const countEl = document.querySelector('[data-result-count]');
  const activeCountEl = document.querySelector('[data-active-count]');
  const emptyEl = document.querySelector('.p-list__empty');
  const moreWrap = document.querySelector('.p-list__more');
  const applyBtn = form.querySelector('.filters__foot .btn');

  const locale = form.dataset.locale || 'ja';
  const currency = form.dataset.currency || 'JPY';

  /** 上限まで表示しているか。「さらに表示」を押すと true になる */
  let revealed = false;

  /* ---- 書式 --------------------------------------------------------- */

  const CURRENCY_SYMBOL = { JPY: '¥', USD: '$' };

  function money(value, digits) {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).formatToParts(value);
    const symbol = CURRENCY_SYMBOL[currency];
    return parts.map((p) => (p.type === 'currency' && symbol ? symbol : p.value)).join('');
  }

  /* ---- 状態 --------------------------------------------------------- */

  function readState() {
    const checked = (name) =>
      Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => el.value);
    const range = (id) => {
      const el = form.querySelector(`#${id}`);
      return el ? { value: Number(el.value), max: Number(el.max) } : null;
    };
    return {
      attrs: checked('attr'),
      merchants: checked('merchant'),
      brands: checked('brand'),
      unitCost: range('unit-cost'),
      price: range('price'),
      query: (searchInput?.value ?? '').trim().toLowerCase(),
      view: list.dataset.view,
      metric: list.dataset.metric,
    };
  }

  /** 実際に絞り込んでいる条件の数。0 ならバッジを出さない */
  function activeCount(state) {
    let n = state.attrs.length + state.merchants.length + state.brands.length;
    if (state.query) n += 1;
    if (state.unitCost && state.unitCost.value < state.unitCost.max) n += 1;
    if (state.price && state.price.value < state.price.max) n += 1;
    return n;
  }

  function matches(item, state) {
    if (state.query && !(item.dataset.name || '').includes(state.query)) return false;

    if (state.attrs.length > 0) {
      const own = (item.dataset.attrs || '').split(' ').filter(Boolean);
      // すべての条件を満たすものだけ残す（AND）。OR にすると絞るほど増えて意味が反転する
      if (!state.attrs.every((key) => own.includes(key))) return false;
    }

    if (state.merchants.length > 0 && !state.merchants.includes(item.dataset.merchant)) return false;
    if (state.brands.length > 0 && !state.brands.includes(item.dataset.brand)) return false;

    if (state.unitCost && Number(item.dataset.unitCost) > state.unitCost.value) return false;
    if (state.price && Number(item.dataset.price) > state.price.value) return false;

    return true;
  }

  function apply() {
    const state = readState();
    let shown = 0;

    for (const item of items) {
      const ok = matches(item, state);
      if (ok) shown += 1;
      // 上限を開いていないうちは、条件に合っていても overflow 分は伏せたまま
      const overflow = item.hasAttribute('data-overflow') && !revealed;
      item.hidden = !ok || overflow;
    }

    if (countEl) {
      const template = countEl.dataset.countTemplate;
      countEl.textContent = template
        ? template.replace('{count}', String(shown))
        : String(shown);
    }

    if (applyBtn) {
      const template = form.dataset.countTemplate;
      if (template) applyBtn.textContent = template.replace('{count}', String(shown));
    }

    const n = activeCount(state);
    if (activeCountEl) {
      activeCountEl.textContent = String(n);
      activeCountEl.hidden = n === 0;
    }

    if (emptyEl) emptyEl.hidden = shown > 0;
    if (moreWrap) moreWrap.hidden = revealed || shown === 0;

    syncUrl(state);
  }

  /* ---- URL 同期 ----------------------------------------------------- */

  function syncUrl(state) {
    const params = new URLSearchParams();
    if (state.attrs.length) params.set('a', state.attrs.join(','));
    if (state.merchants.length) params.set('s', state.merchants.join(','));
    if (state.brands.length) params.set('b', state.brands.join(','));
    if (state.query) params.set('q', state.query);
    if (state.unitCost && state.unitCost.value < state.unitCost.max) {
      params.set('u', String(state.unitCost.value));
    }
    if (state.price && state.price.value < state.price.max) {
      params.set('p', String(state.price.value));
    }
    if (state.view !== 'card') params.set('view', state.view);
    if (state.metric && state.metric !== defaultMetric) params.set('m', state.metric);

    const query = params.toString();
    history.replaceState(null, '', query ? `?${query}${location.hash}` : location.pathname + location.hash);
  }

  const defaultMetric = list.dataset.metric;

  function restoreFromUrl() {
    const params = new URLSearchParams(location.search);
    const setChecked = (name, raw) => {
      if (!raw) return;
      const wanted = new Set(raw.split(','));
      form.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
        if (wanted.has(el.value) && !el.disabled) el.checked = true;
      });
    };
    setChecked('attr', params.get('a'));
    setChecked('merchant', params.get('s'));
    setChecked('brand', params.get('b'));

    const setRange = (id, raw) => {
      if (!raw) return;
      const el = form.querySelector(`#${id}`);
      if (el) el.value = raw;
    };
    setRange('unit-cost', params.get('u'));
    setRange('price', params.get('p'));

    if (params.get('q') && searchInput) searchInput.value = params.get('q');
    if (params.get('view') === 'list') setView('list');
    if (params.get('m')) setMetric(params.get('m'));

    updateRangeOutputs();
  }

  /* ---- 表示の切替 --------------------------------------------------- */

  function setView(view) {
    list.dataset.view = view;
    document.querySelectorAll('[data-view-set]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.viewSet === view));
    });
  }

  function setMetric(metric) {
    const select = document.querySelector('[data-metric-select]');
    if (select && Array.from(select.options).some((o) => o.value === metric)) {
      select.value = metric;
      list.dataset.metric = metric;
    }
  }

  function updateRangeOutputs() {
    form.querySelectorAll('[data-range-out]').forEach((out) => {
      const input = form.querySelector(`#${out.dataset.rangeOut}`);
      if (!input) return;
      const digits = Number(out.dataset.digits) || 0;
      out.textContent = (out.dataset.template || '{max}').replace(
        '{max}',
        money(Number(input.value), digits),
      );
    });
  }

  /* ---- シート（SP） -------------------------------------------------- */

  const isSheet = () => window.matchMedia('(max-width: 899px)').matches;
  let lastFocused = null;

  function openSheet() {
    if (!panel) return;
    lastFocused = document.activeElement;
    panel.setAttribute('data-open', '');
    openBtn?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    form.querySelector('.filters__close')?.focus();
  }

  function closeSheet() {
    if (!panel) return;
    panel.removeAttribute('data-open');
    openBtn?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (lastFocused instanceof HTMLElement) lastFocused.focus();
  }

  /* ---- 配線 --------------------------------------------------------- */

  form.addEventListener('change', () => {
    updateRangeOutputs();
    apply();
  });
  form.addEventListener('input', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'range') {
      updateRangeOutputs();
      apply();
    }
  });

  // reset は値が戻る前に発火する。次のフレームで読み直す
  form.addEventListener('reset', () => {
    requestAnimationFrame(() => {
      updateRangeOutputs();
      apply();
    });
  });

  searchInput?.addEventListener('input', apply);

  document.querySelectorAll('[data-filter-open]').forEach((btn) => {
    btn.addEventListener('click', openSheet);
  });
  document.querySelectorAll('[data-filter-close]').forEach((btn) => {
    btn.addEventListener('click', closeSheet);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel?.hasAttribute('data-open')) closeSheet();
  });

  document.querySelectorAll('[data-view-set]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setView(btn.dataset.viewSet);
      apply();
    });
  });

  document.querySelector('[data-metric-select]')?.addEventListener('change', (e) => {
    list.dataset.metric = e.target.value;
    apply();
  });

  document.querySelector('[data-filter-reset]')?.addEventListener('click', () => {
    form.reset();
    if (searchInput) searchInput.value = '';
    requestAnimationFrame(() => {
      updateRangeOutputs();
      apply();
    });
  });

  document.querySelector('[data-show-more]')?.addEventListener('click', () => {
    revealed = true;
    apply();
  });

  form.querySelector('[data-filter-more]')?.addEventListener('click', (e) => {
    form.querySelectorAll('[data-filter-overflow]').forEach((li) => {
      li.hidden = false;
    });
    e.currentTarget.remove();
  });

  // 他ストアの価格。開閉は aria-expanded と hidden の対で持つ
  list.addEventListener('click', (e) => {
    const toggle = e.target.closest('.p-item__toggle');
    if (!toggle) return;
    const target = document.getElementById(toggle.getAttribute('aria-controls'));
    if (!target) return;
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    target.hidden = open;
  });

  // シートを閉じたまま PC 幅へ移ったとき、body のスクロール固定を残さない
  window.addEventListener('resize', () => {
    if (!isSheet() && document.body.style.overflow === 'hidden') {
      document.body.style.overflow = '';
    }
  });

  restoreFromUrl();
  apply();
})();

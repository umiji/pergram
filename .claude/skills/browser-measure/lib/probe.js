/**
 * ページの中で走る測定関数。
 *
 * ⚠️ **この関数は文字列化してページへ送られる。** モジュールスコープの値を掴んではならない
 *    （import したものも、上で定義した定数も使えない）。すべて関数の中で完結させる。
 */

/**
 * @param {string[]} selectors 測る CSS セレクタ
 * @param {{ lines?: boolean, text?: boolean, styles?: string[], maxMatches?: number }} opts
 */
export function probe(selectors, opts) {
  const options = opts || {};
  const maxMatches = options.maxMatches || 10;
  const round = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

  const isVisible = (el) => {
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) return false;
    }
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
    if (Number(cs.opacity) === 0) return false;
    if (el.closest('[hidden]')) return false;
    return true;
  };

  // 行ごとの実文字列を取り出す。孤立行（最終行が1〜2文字）の検出に使う。
  // 文字を1つずつ Range で囲んで矩形の上端で束ねる。重いので文字数に上限を置く。
  const lineTexts = (el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const range = document.createRange();
    const lines = [];
    let current = null;
    let seen = 0;
    let node = walker.nextNode();
    let truncated = false;
    while (node) {
      const value = node.nodeValue || '';
      for (let i = 0; i < value.length; i++) {
        if (seen >= 800) { truncated = true; break; }
        seen++;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const top = Math.round(rect.top * 10) / 10;
        if (!current || Math.abs(current.top - top) > 1) {
          current = { top, text: '', left: rect.left, right: rect.right };
          lines.push(current);
        }
        current.text += value[i];
        if (rect.left < current.left) current.left = rect.left;
        if (rect.right > current.right) current.right = rect.right;
      }
      if (truncated) break;
      node = walker.nextNode();
    }
    return {
      truncated,
      lines: lines.map((l) => {
        const text = l.text.trim();
        return { text, chars: [...text].length, left: round(l.left), right: round(l.right), width: round(l.right - l.left) };
      }),
    };
  };

  const measureOne = (el, selector, index, count) => {
    const r = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    // 「箱」ではなく「インク」の寸法。中身（テキスト）が実際に占めている矩形。
    // ⚠️ 段落や見出しの box の幅は親が決めるので、**書体が入れ替わっても変わらない。**
    //    書体の効きを見るにはこちらを見る（T-057 の「約16%細く出る」はインクの話である）。
    const inkRange = document.createRange();
    inkRange.selectNodeContents(el);
    const ink = inkRange.getBoundingClientRect();
    const out = {
      selector,
      index,
      count,
      tag: el.tagName.toLowerCase(),
      // 位置（ビューポート座標と、文書座標の両方）
      x: round(r.x),
      y: round(r.y),
      pageX: round(r.x + window.scrollX),
      pageY: round(r.y + window.scrollY),
      left: round(r.left),
      top: round(r.top),
      right: round(r.right),
      bottom: round(r.bottom),
      // 寸法
      width: round(r.width),
      height: round(r.height),
      // 中身が実際に占める寸法（書体の効きはここに出る）
      inkWidth: round(ink.width),
      inkHeight: round(ink.height),
      inkLeft: round(ink.left),
      inkRight: round(ink.right),
      // 溢れの判定材料
      scrollWidth: el.scrollWidth,
      scrollHeight: el.scrollHeight,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
      overflowX: el.scrollWidth > el.clientWidth + 0.5,
      overflowY: el.scrollHeight > el.clientHeight + 0.5,
      // 可視かどうか
      visible: isVisible(el),
      display: cs.display,
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      fontFamily: cs.fontFamily,
    };

    if (options.text) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      out.text = t.length > 200 ? t.slice(0, 200) + '…' : t;
      out.textChars = [...t].length;
    }
    if (options.lines) {
      const l = lineTexts(el);
      out.lineCount = l.lines.length;
      out.lines = l.lines;
      out.lastLineChars = l.lines.length ? l.lines[l.lines.length - 1].chars : 0;
      if (l.truncated) out.linesTruncated = true;
    }
    if (options.styles && options.styles.length) {
      out.styles = {};
      for (const prop of options.styles) out.styles[prop] = cs.getPropertyValue(prop);
    }
    return out;
  };

  const elements = [];
  const missing = [];
  for (const selector of selectors) {
    let found;
    try {
      found = document.querySelectorAll(selector);
    } catch (err) {
      missing.push({ selector, reason: 'セレクタとして読めません: ' + err.message });
      continue;
    }
    if (found.length === 0) {
      missing.push({ selector, reason: '一致する要素がありません' });
      continue;
    }
    const limit = Math.min(found.length, maxMatches);
    for (let i = 0; i < limit; i++) elements.push(measureOne(found[i], selector, i, found.length));
  }

  const de = document.documentElement;
  return {
    document: {
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      scrollHeight: de.scrollHeight,
      clientHeight: de.clientHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      overflowX: de.scrollWidth > de.clientWidth + 0.5,
      title: document.title,
    },
    fonts: {
      status: document.fonts ? document.fonts.status : 'unsupported',
      loaded: document.fonts ? document.fonts.size : null,
    },
    elements,
    missing,
  };
}

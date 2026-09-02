/**
 * ブラウザ無しで `src/assets/lp.js` を実行するための最小の DOM。
 *
 * このリポジトリは**依存パッケージを持たない**方針なので、jsdom を入れずに必要な範囲だけを
 * 自前で用意する。目的は「GA4 へ何が送られたか」「/api/waitlist へ何回・どんな本文を
 * 送ったか」「別ページへ飛んでいないか」を機械的に見ることであって、ブラウザの再現ではない。
 *
 * ⚠️ ここはテストの**道具**であって、判定そのものではない。実装が新しい DOM API を使って
 *    このファイルが足りなくなったら、**足りない API をここへ足してよい**。
 *    足りないときは分かりやすい例外を投げる作りにしてある。
 *    （テスト側の assert を緩めるのは別の話であって、それは駄目）
 */

import { readFile } from 'node:fs/promises';
import { setImmediate as immediate } from 'node:timers/promises';
import vm from 'node:vm';

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

function decodeEntities(value) {
  return String(value).replace(/&(#?\w+);/g, (whole, name) => ENTITIES[name] ?? whole);
}

/* ---- イベント ---------------------------------------------------------- */

export class DomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles !== false;
    this.cancelable = options.cancelable !== false;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this._stopped = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this._stopped = true;
  }

  stopImmediatePropagation() {
    this._stopped = true;
  }
}

class Listenable {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(type, handler) {
    if (typeof handler !== 'function') return;
    const list = this._listeners.get(type) ?? [];
    list.push(handler);
    this._listeners.set(type, list);
  }

  removeEventListener(type, handler) {
    const list = this._listeners.get(type) ?? [];
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
  }

  _fire(event) {
    event.currentTarget = this;
    for (const handler of (this._listeners.get(event.type) ?? []).slice()) {
      handler.call(this, event);
      if (event._stopped) break;
    }
  }
}

/* ---- ノード ------------------------------------------------------------ */

class TextNode {
  constructor(data) {
    this.nodeType = 3;
    this.data = data;
    this.parentNode = null;
  }

  get textContent() {
    return this.data;
  }
}

export class Element extends Listenable {
  constructor(tagName, attrs = {}) {
    super();
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this._attrs = { ...attrs };
    this.childNodes = [];
    this.parentNode = null;
    this.style = {};
    this._value = null;
    this._checked = 'checked' in this._attrs;
    this.scrollHeight = 0;
  }

  /* 属性 */

  getAttribute(name) {
    const value = this._attrs[String(name).toLowerCase()];
    return value === undefined ? null : value;
  }

  setAttribute(name, value) {
    this._attrs[String(name).toLowerCase()] = String(value);
  }

  hasAttribute(name) {
    return String(name).toLowerCase() in this._attrs;
  }

  removeAttribute(name) {
    delete this._attrs[String(name).toLowerCase()];
  }

  get attributes() {
    return { ...this._attrs };
  }

  get id() {
    return this.getAttribute('id') ?? '';
  }

  get className() {
    return this.getAttribute('class') ?? '';
  }

  set className(value) {
    this.setAttribute('class', value);
  }

  get classList() {
    const owner = this;
    const tokens = () => owner.className.split(/\s+/).filter(Boolean);
    const write = (list) => owner.setAttribute('class', [...new Set(list)].join(' '));
    return {
      contains: (name) => tokens().includes(name),
      add: (...names) => write([...tokens(), ...names]),
      remove: (...names) => write(tokens().filter((token) => !names.includes(token))),
      toggle: (name, force) => {
        const has = tokens().includes(name);
        const next = force === undefined ? !has : Boolean(force);
        if (next) write([...tokens(), name]);
        else write(tokens().filter((token) => token !== name));
        return next;
      },
      get length() {
        return tokens().length;
      },
    };
  }

  get dataset() {
    const out = {};
    for (const [key, value] of Object.entries(this._attrs)) {
      if (!key.startsWith('data-')) continue;
      out[key.slice(5).replace(/-([a-z])/g, (_match, char) => char.toUpperCase())] = value;
    }
    return out;
  }

  /* 真偽値の属性 */

  get hidden() {
    return this.hasAttribute('hidden');
  }

  set hidden(value) {
    if (value) this.setAttribute('hidden', '');
    else this.removeAttribute('hidden');
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(value) {
    if (value) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }

  get required() {
    return this.hasAttribute('required');
  }

  /* 入力値 */

  get value() {
    if (this._value !== null) return this._value;
    if (this.tagName === 'TEXTAREA') return this.textContent;
    return this.getAttribute('value') ?? '';
  }

  set value(next) {
    this._value = String(next);
  }

  get checked() {
    return this._checked;
  }

  set checked(next) {
    this._checked = Boolean(next);
  }

  get name() {
    return this.getAttribute('name') ?? '';
  }

  get type() {
    return this.getAttribute('type') ?? (this.tagName === 'TEXTAREA' ? 'textarea' : '');
  }

  /* 木構造 */

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  get children() {
    return this.childNodes.filter((node) => node.nodeType === 1);
  }

  get firstElementChild() {
    return this.children[0] ?? null;
  }

  get textContent() {
    return this.childNodes
      .map((node) => (node.nodeType === 3 ? node.data : node.textContent))
      .join('');
  }

  set textContent(text) {
    this.childNodes = [];
    this.appendChild(new TextNode(String(text)));
  }

  set innerHTML(html) {
    this.childNodes = [];
    for (const node of parseFragment(String(html))) this.appendChild(node);
  }

  get innerHTML() {
    return this.childNodes.map(serialize).join('');
  }

  get outerHTML() {
    return serialize(this);
  }

  insertAdjacentHTML(position, html) {
    const nodes = parseFragment(String(html));
    if (position === 'beforeend') {
      for (const node of nodes) this.appendChild(node);
      return;
    }
    if (position === 'afterbegin') {
      for (const node of nodes.reverse()) {
        node.parentNode = this;
        this.childNodes.unshift(node);
      }
      return;
    }
    throw new Error(`mini_dom: insertAdjacentHTML("${position}") は未対応です`);
  }

  /* 検索 */

  matches(selector) {
    return matchesSelector(this, selector);
  }

  closest(selector) {
    let node = this;
    while (node && node.nodeType === 1) {
      if (node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    const found = [];
    for (const el of descendants(this)) {
      if (matchesSelector(el, selector)) found.push(el);
    }
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  /* 操作 */

  focus() {
    const doc = ownerDocument(this);
    if (doc) doc.activeElement = this;
    this.dispatchEvent(new DomEvent('focus', { bubbles: false }));
  }

  blur() {}

  scrollIntoView() {}

  click() {
    this.dispatchEvent(new DomEvent('click'));
  }

  reset() {
    for (const el of descendants(this)) {
      el._value = null;
      el._checked = 'checked' in el._attrs;
    }
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    const path = [];
    let node = this;
    while (node) {
      path.push(node);
      node = node.parentNode;
    }
    const root = path[path.length - 1];
    if (event.bubbles && root && root._document) {
      path.push(root._document);
      if (root._document._window) path.push(root._document._window);
    }
    for (const target of path) {
      target._fire(event);
      if (event._stopped || !event.bubbles) break;
    }
    return !event.defaultPrevented;
  }
}

function ownerDocument(el) {
  let node = el;
  while (node.parentNode) node = node.parentNode;
  return node._document ?? null;
}

function* descendants(el) {
  for (const child of el.childNodes) {
    if (child.nodeType !== 1) continue;
    yield child;
    yield* descendants(child);
  }
}

function serialize(node) {
  if (node.nodeType === 3) return node.data;
  const tag = node.tagName.toLowerCase();
  const attrs = Object.entries(node._attrs)
    .map(([key, value]) => (value === '' ? ` ${key}` : ` ${key}="${value}"`))
    .join('');
  if (VOID_TAGS.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${node.childNodes.map(serialize).join('')}</${tag}>`;
}

/* ---- HTML の読み取り --------------------------------------------------- */

const TAG_RE =
  /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>`]+))?)*)\s*(\/?)>/g;

const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g;

function parseAttrs(source) {
  const attrs = {};
  let match;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(source))) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

/** HTML 断片をノードの配列にする。テンプレートが出す範囲だけを読めればよい */
export function parseFragment(html) {
  const holder = new Element('template');
  const stack = [holder];
  let last = 0;
  let match;
  TAG_RE.lastIndex = 0;

  const addText = (text) => {
    if (text.trim() === '') return;
    stack[stack.length - 1].appendChild(new TextNode(decodeEntities(text)));
  };

  while ((match = TAG_RE.exec(html))) {
    if (match.index > last) addText(html.slice(last, match.index));
    last = TAG_RE.lastIndex;
    if (match[0].startsWith('<!--')) continue;

    if (match[1]) {
      const name = match[1].toUpperCase();
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tagName === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const tag = match[2];
    const el = new Element(tag, parseAttrs(match[3] ?? ''));
    stack[stack.length - 1].appendChild(el);
    if (!VOID_TAGS.has(tag.toLowerCase()) && match[4] !== '/') stack.push(el);
  }
  if (last < html.length) addText(html.slice(last));

  return holder.childNodes.map((node) => {
    node.parentNode = null;
    return node;
  });
}

/* ---- セレクタ ---------------------------------------------------------- */

function tokenizeCompound(compound) {
  const tokens = [];
  let i = 0;
  while (i < compound.length) {
    const char = compound[i];
    if (char === '.' || char === '#' || char === ':') {
      let j = i + 1;
      while (j < compound.length && /[\w-]/.test(compound[j])) j += 1;
      tokens.push(compound.slice(i, j));
      i = j;
    } else if (char === '[') {
      const end = compound.indexOf(']', i);
      if (end < 0) throw new Error(`mini_dom: 属性セレクタが閉じていません: ${compound}`);
      tokens.push(compound.slice(i, end + 1));
      i = end + 1;
    } else {
      let j = i;
      while (j < compound.length && /[\w*-]/.test(compound[j])) j += 1;
      if (j === i) throw new Error(`mini_dom: 解釈できないセレクタです: ${compound}`);
      tokens.push(compound.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

function matchToken(el, token) {
  if (token === '*') return true;
  if (token.startsWith('.')) return el.classList.contains(token.slice(1));
  if (token.startsWith('#')) return el.id === token.slice(1);
  if (token.startsWith(':')) {
    if (token === ':checked') return el.checked === true;
    if (token === ':disabled') return el.disabled === true;
    if (token === ':required') return el.required === true;
    throw new Error(`mini_dom: 未対応の擬似クラスです: ${token}`);
  }
  if (token.startsWith('[')) {
    const body = token.slice(1, -1);
    const parsed = body.match(/^([\w:-]+)(?:([~^$*|]?=)\s*"?([^"]*)"?)?$/);
    if (!parsed) throw new Error(`mini_dom: 解釈できない属性セレクタです: ${token}`);
    const [, name, operator, expected] = parsed;
    if (!el.hasAttribute(name)) return false;
    if (!operator) return true;
    const actual = el.getAttribute(name) ?? '';
    if (operator === '=') return actual === expected;
    if (operator === '^=') return actual.startsWith(expected);
    if (operator === '$=') return actual.endsWith(expected);
    if (operator === '*=') return actual.includes(expected);
    if (operator === '~=') return actual.split(/\s+/).includes(expected);
    throw new Error(`mini_dom: 未対応の属性演算子です: ${operator}`);
  }
  return el.tagName === token.toUpperCase();
}

function matchCompound(el, compound) {
  return tokenizeCompound(compound).every((token) => matchToken(el, token));
}

function splitGroup(group) {
  const parts = [];
  let buffer = '';
  let depth = 0;
  for (const char of group.replace(/>/g, ' > ')) {
    if (char === '[') depth += 1;
    if (char === ']') depth -= 1;
    if (depth === 0 && /\s/.test(char)) {
      if (buffer) parts.push(buffer);
      buffer = '';
      continue;
    }
    buffer += char;
  }
  if (buffer) parts.push(buffer);
  return parts;
}

export function matchesSelector(el, selector) {
  return String(selector)
    .split(',')
    .map((one) => one.trim())
    .filter(Boolean)
    .some((group) => {
      const parts = splitGroup(group);
      let node = el;
      let i = parts.length - 1;
      if (!matchCompound(node, parts[i])) return false;
      i -= 1;

      let childCombinator = false;
      while (i >= 0) {
        if (parts[i] === '>') {
          childCombinator = true;
          i -= 1;
          continue;
        }
        let ancestor = node.parentNode;
        let matched = false;
        while (ancestor && ancestor.nodeType === 1) {
          if (matchCompound(ancestor, parts[i])) {
            node = ancestor;
            matched = true;
            break;
          }
          if (childCombinator) break;
          ancestor = ancestor.parentNode;
        }
        if (!matched) return false;
        childCombinator = false;
        i -= 1;
      }
      return true;
    });
}

/* ---- window / document ------------------------------------------------- */

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * `src/assets/lp.js` を最小の DOM の上で実行する。
 *
 * @param {string} html  `<body>` の中身として読ませる HTML
 * @param {object} [options]
 * @param {string} [options.search]   window.location.search
 * @param {(call: object, index: number) => object} [options.respond]
 *        fetch の応答を決める。`{ ok, status, body, reject }` を返す
 * @param {string} [options.scriptPath] 実行するスクリプト。既定は本番と同じ `src/assets/lp.js`
 */
export async function runLpScript(html, options = {}) {
  const {
    search = '',
    respond = () => ({ ok: true, status: 200, body: { ok: true } }),
    scriptPath = 'src/assets/lp.js',
  } = options;

  const body = new Element('body');
  for (const node of parseFragment(html)) body.appendChild(node);
  body.scrollHeight = 1200;

  const gtagCalls = [];
  const fetchCalls = [];
  const navigations = [];
  const timers = [];
  const observers = [];

  const documentObj = Object.assign(new Listenable(), {
    nodeType: 9,
    body,
    documentElement: body,
    activeElement: null,
    querySelector: (selector) => body.querySelector(selector),
    querySelectorAll: (selector) => body.querySelectorAll(selector),
    getElementById: (id) => body.querySelector(`#${id}`),
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => new TextNode(String(text)),
  });
  documentObj.dispatchEvent = (event) => {
    documentObj._fire(event);
    return !event.defaultPrevented;
  };
  body._document = documentObj;

  const location = {
    origin: 'https://pergram.example',
    pathname: '/ja/',
    search,
    hash: '',
    assign: (url) => navigations.push({ kind: 'assign', url: String(url) }),
    replace: (url) => navigations.push({ kind: 'replace', url: String(url) }),
    reload: () => navigations.push({ kind: 'reload', url: null }),
  };
  let href = 'https://pergram.example/ja/';
  Object.defineProperty(location, 'href', {
    get: () => href,
    set: (value) => {
      href = String(value);
      navigations.push({ kind: 'href', url: String(value) });
    },
    enumerable: true,
  });

  class FakeIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      observers.push(this);
    }

    observe(target) {
      this.targets.push(target);
    }

    unobserve() {}

    disconnect() {
      this.targets = [];
    }

    /** テストから交差を起こす */
    trigger(target) {
      this.callback([{ isIntersecting: true, target }], this);
    }
  }

  class FakeFormData {
    constructor(form) {
      this._entries = [];
      if (!form) return;
      for (const el of form.querySelectorAll('input,textarea,select')) {
        if (!el.name) continue;
        if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) continue;
        this._entries.push([el.name, el.value]);
      }
    }

    get(name) {
      const hit = this._entries.find(([key]) => key === name);
      return hit ? hit[1] : null;
    }

    getAll(name) {
      return this._entries.filter(([key]) => key === name).map(([, value]) => value);
    }

    append(name, value) {
      this._entries.push([name, String(value)]);
    }

    entries() {
      return this._entries[Symbol.iterator]();
    }
  }

  let timerId = 0;
  const sandbox = Object.assign(new Listenable(), {
    document: documentObj,
    location,
    navigator: { userAgent: 'mini_dom', language: 'ja' },
    console,
    URL,
    URLSearchParams,
    AbortController,
    FormData: FakeFormData,
    IntersectionObserver: FakeIntersectionObserver,
    scrollY: 0,
    pageYOffset: 0,
    innerHeight: 600,
    innerWidth: 375,
    dataLayer: [],
    gtag: (...args) => {
      gtagCalls.push(args);
    },
    fetch: (url, init) => {
      const call = {
        url: String(url),
        init,
        method: (init && init.method) || 'GET',
        body: init && typeof init.body === 'string' ? safeJson(init.body) : null,
      };
      fetchCalls.push(call);
      const result = respond(call, fetchCalls.length) ?? {};
      if (result.reject) return Promise.reject(new Error('network'));
      return Promise.resolve({
        ok: result.ok !== false,
        status: result.status ?? 200,
        json: async () => result.body ?? { ok: true },
        text: async () => JSON.stringify(result.body ?? { ok: true }),
      });
    },
    setTimeout: (fn, delay = 0) => {
      timerId += 1;
      timers.push({ id: timerId, fn, delay });
      return timerId;
    },
    clearTimeout: (id) => {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => {
      timerId += 1;
      timers.push({ id: timerId, fn, delay: 0 });
      return timerId;
    },
    cancelAnimationFrame: () => {},
    queueMicrotask,
    scrollTo: () => {},
    matchMedia: (query) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.dispatchEvent = (event) => {
    sandbox._fire(event);
    return !event.defaultPrevented;
  };
  documentObj._window = sandbox;

  vm.createContext(sandbox);
  const source = await readFile(scriptPath, 'utf8');
  vm.runInContext(source, sandbox, { filename: scriptPath });

  /**
   * 保留中の処理を進める。
   *
   * 🔒 遅延 5000ms 以上のタイマーは動かさない。送信のタイムアウト（10 秒）は
   *    「応答が返らなかったとき」の経路であり、通常の送信でこれを走らせると
   *    abort が混ざって検査の意味が変わる。
   */
  async function flush(rounds = 4) {
    for (let i = 0; i < rounds; i += 1) {
      await immediate();
      for (const timer of timers.filter((one) => one.delay < 5000)) {
        sandbox.clearTimeout(timer.id);
        timer.fn();
      }
      await immediate();
    }
  }

  return {
    window: sandbox,
    document: documentObj,
    body,
    gtagCalls,
    fetchCalls,
    navigations,
    timers,
    observers,
    flush,
    /** GA4 に送られたイベント名（送った順） */
    eventNames: () => gtagCalls.filter((call) => call[0] === 'event').map((call) => call[1]),
    /** GA4 に送られたイベントを `{ name, params }` で取り出す */
    events: () =>
      gtagCalls
        .filter((call) => call[0] === 'event')
        .map((call) => ({ name: call[1], params: call[2] ?? {} })),
  };
}

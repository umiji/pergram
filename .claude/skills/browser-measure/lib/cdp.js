/**
 * 依存パッケージなしの DevTools Protocol クライアント。
 *
 * Node 22 は `WebSocket` を標準で持つ。pergram は依存パッケージゼロの方針なので、
 * ここに `ws` などを持ち込まない（package.json に手を入れない）。
 *
 * フラットモード（`Target.attachToTarget` の `flatten: true`）だけを使う。
 * 1本の WebSocket に `sessionId` を添えて送り分けるので、接続は常に1本で済む。
 */

/** 送ったコマンドの返事を待つ既定の上限（ミリ秒） */
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;

export class CdpClient {
  #ws;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Map();
  #closed = false;
  #closeReason = null;

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener('message', (ev) => this.#onMessage(ev.data));
    ws.addEventListener('close', () => this.#onClose('WebSocket が閉じられました'));
    ws.addEventListener('error', () => this.#onClose('WebSocket でエラーが発生しました'));
  }

  /**
   * ブラウザの WebSocket エンドポイントへ繋ぐ。
   * @param {string} wsUrl `ws://127.0.0.1:<port>/devtools/browser/<id>`
   */
  static async connect(wsUrl, { timeoutMs = 10_000 } = {}) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`WebSocket の接続が ${timeoutMs}ms で開きませんでした: ${wsUrl}`)), timeoutMs);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`WebSocket へ接続できませんでした: ${wsUrl}`)); }, { once: true });
    });
    return new CdpClient(ws);
  }

  #onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch {
      return; // 読めないフレームは無視する。プロトコル外のものが混じっても止めない
    }

    if (msg.id !== undefined) {
      const waiting = this.#pending.get(msg.id);
      if (!waiting) return;
      this.#pending.delete(msg.id);
      if (msg.error) {
        waiting.reject(new Error(`CDP ${waiting.method} が失敗しました: ${msg.error.message ?? JSON.stringify(msg.error)}`));
      } else {
        waiting.resolve(msg.result ?? {});
      }
      return;
    }

    if (msg.method) {
      for (const fn of this.#listeners.get(msg.method) ?? []) fn(msg.params ?? {}, msg.sessionId);
    }
  }

  #onClose(reason) {
    if (this.#closed) return;
    this.#closed = true;
    this.#closeReason = reason;
    for (const waiting of this.#pending.values()) {
      waiting.reject(new Error(`${reason}（${waiting.method} の返事を待っている最中）`));
    }
    this.#pending.clear();
  }

  /** イベントの購読。戻り値を呼ぶと解除できる */
  on(method, fn) {
    const list = this.#listeners.get(method) ?? [];
    list.push(fn);
    this.#listeners.set(method, list);
    return () => {
      const current = this.#listeners.get(method) ?? [];
      const at = current.indexOf(fn);
      if (at !== -1) current.splice(at, 1);
    };
  }

  /** イベントを1回だけ待つ */
  once(method, { timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`CDP イベント ${method} が ${timeoutMs}ms 以内に来ませんでした`));
      }, timeoutMs);
      const off = this.on(method, (params) => {
        clearTimeout(timer);
        off();
        resolve(params);
      });
    });
  }

  /** コマンドを送って返事を待つ */
  send(method, params = {}, sessionId = undefined, { timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
    if (this.#closed) return Promise.reject(new Error(`${this.#closeReason}。${method} は送れません`));

    const id = this.#nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP ${method} が ${timeoutMs}ms 以内に返事をしませんでした`));
      }, timeoutMs);

      this.#pending.set(id, {
        method,
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });

      try {
        this.#ws.send(JSON.stringify(payload));
      } catch (err) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(err);
      }
    });
  }

  close() {
    try { this.#ws.close(); } catch { /* 既に閉じている */ }
  }
}

/**
 * 新しいタブを作り、フラットモードで attach して sessionId を返す。
 * @returns {Promise<{ targetId: string, sessionId: string }>}
 */
export async function openPage(client, url = 'about:blank') {
  const { targetId } = await client.send('Target.createTarget', { url });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
  return { targetId, sessionId };
}

/**
 * ページ側で式を評価する。Promise を返す式は解決を待つ。
 * 例外が起きたら握りつぶさずに投げる（黙って 0 を返さない）。
 */
export async function evaluate(client, sessionId, expression) {
  const result = await client.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true, allowUnsafeEvalBlockedByCSP: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    const d = result.exceptionDetails;
    const text = d.exception?.description ?? d.text ?? 'ページ内でエラーが起きました';
    throw new Error(`ページ内の評価に失敗しました: ${text}`);
  }
  return result.result?.value;
}

/**
 * 測定のためだけの静的配信。127.0.0.1 の空きポートに bind する。
 *
 * 🔒 **`file://` で開いてはならない。**
 *    出力される HTML は CSS と JS を `/assets/...` という**ルート絶対パス**で読む。
 *    `file://` で開くとドライブのルートを指すため CSS が当たらないが、
 *    **エラーにはならない。** 素の HTML が「読めるが崩れた見た目」で表示され、
 *    そのまま測ると**レイアウトの観測が丸ごと誤る**。
 *    このスキルが自前でサーバを立てているのは、その事故を構造的に起こせなくするためである。
 *
 * ⚠️ `scripts/serve.js`（製品側）とほぼ同じ処理を持つが、**意図的に別実装である。**
 *    測定の道具が製品コードの都合で壊れないようにしてある。DRY のために統合しない。
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/** URL のパスをルート配下の実ファイルへ解決する。ルート外を指すなら null（パストラバーサル対策） */
async function resolveFile(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = path.resolve(root, '.' + path.posix.normalize(decoded));
  const rootAbs = path.resolve(root);
  if (candidate !== rootAbs && !candidate.startsWith(rootAbs + path.sep)) return null;

  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      const index = path.join(candidate, 'index.html');
      await stat(index);
      return index;
    }
    return candidate;
  } catch {
    return null;
  }
}

/**
 * @param {string} root 配信するディレクトリ（`.preview` / `dist` など）
 * @param {number} port 0 なら OS が空きポートを選ぶ
 * @returns {Promise<{ port: number, origin: string, close: () => Promise<void> }>}
 */
export function serve(root, port = 0) {
  const server = createServer(async (req, res) => {
    // ボタンを実際に押して状態を作れるように、API は成功だけ返すスタブにする。
    // 測るのはレイアウトであって、サーバの応答内容ではない。
    if (req.method === 'POST' && (req.url ?? '').startsWith('/api/')) {
      req.resume();
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    const file = await resolveFile(root, req.url ?? '/');
    if (file === null) {
      res.writeHead(404, { 'Content-Type': MIME['.txt'] });
      res.end('404\n');
      return;
    }

    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': MIME['.txt'] });
      res.end(`500 ${err.code ?? 'read_failed'}\n`);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => {
      const actual = server.address().port;
      resolve({
        port: actual,
        origin: `http://${HOST}:${actual}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

/**
 * 確認用の静的配信。依存パッケージなし。
 *
 * HTML は `/assets/...` というルート絶対パスでアセットを参照する。
 * 本番（Cloudflare Workers がルートとして配信する）ではこれが正しいので、
 * file:// で開かずにルートを持つサーバから配る。
 *
 * ⚠️ 127.0.0.1 にだけ bind する。プレビューはサンプルデータであり、外に出さない。
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  // sitemap.xml。text/xml だと一部のクローラが読み飛ばす
  '.xml': 'application/xml; charset=utf-8',
};

/**
 * URL のパスをルート配下の実ファイルに解決する。
 * ルートの外を指す場合は null を返す（パストラバーサル対策）。
 */
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
 * @param {string} root  配信するディレクトリ
 * @param {number} port  0 を渡すと空きポートを OS が選ぶ
 * @returns {Promise<{ port: number, close: () => Promise<void> }>}
 */
export function serve(root, port = 4173) {
  const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url && req.url.startsWith('/api/waitlist')) {
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
        // 編集しながら見るのでキャッシュさせない
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
      resolve({
        port: server.address().port,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

export { HOST };

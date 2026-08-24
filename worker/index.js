/**
 * Worker の入り口。届いたリクエストをここで振り分ける。
 *
 * 🔒 wrangler.toml の `run_worker_first` により、**静的ファイルを含む全要求がここを通る**。
 *    旧ドメインからの恒久転送を効かせるためで、以前の「API のパスだけが届く」
 *    前提ではなくなっている。該当するファイルがあるパスは env.ASSETS へ渡す。
 *
 * ルートを足すときはここに1行足す。ファイルを置いた場所が URL になる仕組みではない。
 */

import { handleWaitlist } from './waitlist.js';

const ROUTES = {
  '/api/waitlist': { POST: handleWaitlist },
};

/**
 * 恒久転送の行き先。
 * 🔒 src/lib/site.js の SITE_ORIGIN と同じ値に保つ。
 *    ずれると canonical と転送先が食い違い、検索エンジンから見て自己矛盾する。
 *    tests/worker.test.js が両者を突き合わせている。
 */
const CANONICAL_ORIGIN = 'https://pergram.site';

/**
 * 旧本番ドメイン。pergram.site へ移す前に公開していた URL。
 *
 * 🔒 **ホスト名を完全一致で持つ。`.workers.dev` で終わるかどうかで判定しない。**
 *    プレビュー（pergram-preview）も workers.dev 配下にいるため、
 *    末尾一致にするとプレビューまで本番へ飛ばしてしまう。
 */
const LEGACY_HOSTS = new Set(['pergram.pergram-official.workers.dev']);

export default {
  /**
   * @param {Request} request
   * @param {{ DB: D1Database, ASSETS: Fetcher }} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    // 旧ドメインに来た要求は、パスとクエリを保ったまま新ドメインへ恒久転送する。
    // 同じ内容が2つのドメインに出続けるのを止める。canonical だけでは弱い。
    //
    // 🔒 閲覧は 301、それ以外のメソッドは 308。**301 はブラウザが POST を GET に
    //    作り替える**ため、旧ドメインに残ったフォームからの待機リスト登録が
    //    エラーも出さずに消える。308 はメソッドと本文を保ったまま転送する。
    if (LEGACY_HOSTS.has(url.hostname)) {
      const isRead = request.method === 'GET' || request.method === 'HEAD';
      return Response.redirect(
        new URL(url.pathname + url.search, CANONICAL_ORIGIN).href,
        isRead ? 301 : 308,
      );
    }

    const { pathname } = url;
    const route = ROUTES[pathname];

    if (!route) {
      // API でないなら静的ファイルの担当。存在しなければ 404 を返してくれる。
      return env.ASSETS.fetch(request);
    }

    const handler = route[request.method];
    if (!handler) {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          Allow: Object.keys(route).join(', '),
        },
      });
    }

    return handler(request, env);
  },
};

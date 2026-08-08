/**
 * Worker の入り口。届いたリクエストをここで振り分ける。
 *
 * 静的ファイル（dist/ の中身）は Workers 側が先に探して返すので、
 * ここに来るのは「該当するファイルが無かったパス」だけ。
 * つまり API のパスと、存在しないページの2種類。
 *
 * ルートを足すときはここに1行足す。ファイルを置いた場所が URL になる仕組みではない。
 */

import { handleWaitlist } from './waitlist.js';

const ROUTES = {
  '/api/waitlist': { POST: handleWaitlist },
};

export default {
  /**
   * @param {Request} request
   * @param {{ DB: D1Database, ASSETS: Fetcher }} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
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

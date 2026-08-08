/**
 * 待機リストの登録。Cloudflare Pages Functions のアダプタ。
 *
 * 判断は src/lib/waitlist.js に置く。ここは HTTP との変換だけを行い、
 * Vercel 側（api/waitlist.js）と挙動が食い違わないようにする。
 *
 * env には Pages の環境変数と D1 の束縛（DB）が入る。
 */

import { handleSubmission } from '../../src/lib/waitlist.js';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { status, body } = await handleSubmission(payload, env);
  return json(body, status);
}

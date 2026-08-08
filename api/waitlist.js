/**
 * 待機リストの登録。Vercel Functions のアダプタ。
 *
 * 判断は src/lib/waitlist.js に置く。ここは HTTP との変換だけを行い、
 * Cloudflare 側（functions/api/waitlist.js）と挙動が食い違わないようにする。
 *
 * Vercel には D1 が無いので、保存先は Google スプレッドシートだけになる。
 * GOOGLE_SHEETS_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY を
 * 設定していないと 500（not_configured）を返す。
 *
 * レスポンスは Node の素の API で書く。res.status().json() のヘルパに依存すると
 * ランタイムの差で壊れる。
 */

import { handleSubmission } from '../src/lib/waitlist.js';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/** Vercel は Content-Type: application/json のとき body を解析済みにする */
async function readPayload(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body !== 'string') return req.body;
    return JSON.parse(req.body);
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }

  let payload;
  try {
    payload = await readPayload(req);
  } catch {
    return send(res, 400, { error: 'invalid_json' });
  }

  const { status, body } = await handleSubmission(payload, process.env);
  return send(res, status, body);
}

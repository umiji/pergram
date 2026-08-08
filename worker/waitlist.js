/**
 * 待機リストの登録。
 *
 * 🔒 サーバが保持してよいのは requirements.md §3.4 と validation-plan.md §6 の範囲だけ。
 *    年齢・性別・体調・服薬情報は受け取らないし、送られてきても保存しない。
 *    保存先の列は worker/schema.sql にあるものが全て。列を足さない。
 * 🔒 GA4 への送信はクライアント側で行い、メールアドレスを含めない。
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;

/**
 * 受け付ける選択肢。想定外の値は保存しない。
 * LP のチップと対応する（src/templates/lp/sections.js の ROADMAP_NUTRIENTS）。
 * protein / other は LP から外したが、過去の登録が残っているので受け付け続ける。
 */
const ALLOWED_NUTRIENTS = new Set([
  'protein',
  'creatine',
  'eaa_bcaa',
  'hmb',
  'iron_zinc',
  'vitamins',
  'multivitamin',
  'other',
]);
const ALLOWED_CHANNELS = new Set(['rakuten', 'amazon', 'iherb', 'myprotein', 'store']);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * POST /api/waitlist
 *
 * @param {Request} request
 * @param {{ DB: D1Database }} env
 * @returns {Promise<Response>}
 */
export async function handleWaitlist(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  if (!EMAIL_RE.test(email) || email.length > EMAIL_MAX_LENGTH) {
    return json({ error: 'invalid_email' }, 400);
  }

  const nutrients = Array.isArray(payload.nutrients)
    ? payload.nutrients.filter((n) => ALLOWED_NUTRIENTS.has(n))
    : [];
  const channel = ALLOWED_CHANNELS.has(payload.channel) ? payload.channel : null;

  try {
    // 同じメールアドレスの再送信は上書きする（重複行を作らない）
    await env.DB.prepare(
      `INSERT INTO waitlist (email, nutrients, channel, created_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(email) DO UPDATE SET
         nutrients = excluded.nutrients,
         channel   = excluded.channel`,
    )
      .bind(email, nutrients.join(','), channel, new Date().toISOString())
      .run();
  } catch (err) {
    // 🔒 応答に原因を書かない（メールアドレスや DB の構造が漏れる）。
    //    詳細はサーバ側のログにだけ残す。
    console.error('waitlist insert failed', err);
    return json({ error: 'storage_unavailable' }, 503);
  }

  return json({ ok: true });
}

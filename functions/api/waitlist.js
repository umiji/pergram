/**
 * 待機リストの登録。Cloudflare Pages Functions。
 *
 * 🔒 サーバが保持してよいのは requirements.md §3.4 と validation-plan.md §6 の範囲だけ。
 *    年齢・性別・体調・服薬情報は受け取らないし、送られてきても保存しない。
 * 🔒 GA4 への送信はクライアント側で行い、メールアドレスを含めない。
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 受け付ける選択肢。想定外の値は保存しない */
const ALLOWED_NUTRIENTS = new Set([
  'protein',
  'creatine',
  'eaa_bcaa',
  'hmb',
  'iron_zinc',
  'vitamins',
  'other',
]);
const ALLOWED_CHANNELS = new Set(['rakuten', 'amazon', 'iherb', 'myprotein', 'store']);

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

  const email = typeof payload.email === 'string' ? payload.email.trim() : '';
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: 'invalid_email' }, 400);
  }

  const nutrients = Array.isArray(payload.nutrients)
    ? payload.nutrients.filter((n) => ALLOWED_NUTRIENTS.has(n))
    : [];
  const channel = ALLOWED_CHANNELS.has(payload.channel) ? payload.channel : null;

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

  return json({ ok: true });
}

/**
 * 待機リストの登録。
 *
 * 🔒 サーバが保持してよいのは requirements.md §3.4 と validation-plan.md §6 の範囲だけ。
 *    年齢・性別・体調・服薬情報は受け取らないし、送られてきても保存しない。
 *    保存先の列は worker/schema.sql にあるものが全て。ここを増やすときは
 *    schema.sql・移行 SQL・tests/worker.test.js の3つを必ず揃える。
 * 🔒 N-01 / N-05。自由記述は症状や服薬の書き込み口になりうる。
 *    フォーム側でラベルと注記により限定し、ここでは長さで切る。
 *    **中身を解釈して弾こうとしない** — 誤検知で正当な要望を捨てるほうが害が大きい。
 *    書かれた症状を「保存しない」ことは保証できないので、フォームの注記が
 *    最初で最大の防波堤である点を忘れないこと。
 * 🔒 GA4 への送信はクライアント側で行い、メールアドレスを含めない。
 */

import {
  ALLOWED_CHANNELS,
  ALLOWED_NUTRIENTS,
  EMAIL_MAX_LENGTH,
  NUTRIENTS_OTHER_MAX,
  REQUESTS_MAX,
} from '../src/lib/waitlist_fields.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 選択肢。許可リストに無い値は捨て、重複は畳む。
 *
 * 単一の文字列も受ける。ブラウザにキャッシュされた旧版の LP が
 * `channel` を文字列で送ってくる間、黙って捨てないため。
 *
 * @param {unknown} value
 * @param {Set<string>} allowed
 * @returns {string[]}
 */
function allowedValues(value, allowed) {
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.filter((item) => allowed.has(item)))];
}

/** 自由記述。文字列でなければ捨て、長すぎれば切る。空文字は null にして列を汚さない */
function freeText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed === '' ? null : trimmed;
}

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

  const nutrients = allowedValues(payload.nutrients, ALLOWED_NUTRIENTS);
  const channels = allowedValues(payload.channel, ALLOWED_CHANNELS);
  const nutrientsOther = freeText(payload.nutrients_other, NUTRIENTS_OTHER_MAX);
  const requests = freeText(payload.requests, REQUESTS_MAX);

  try {
    // 同じメールアドレスの再送信は上書きする（重複行を作らない）
    await env.DB.prepare(
      `INSERT INTO waitlist (email, nutrients, channel, nutrients_other, requests, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(email) DO UPDATE SET
         nutrients       = excluded.nutrients,
         channel         = excluded.channel,
         nutrients_other = excluded.nutrients_other,
         requests        = excluded.requests`,
    )
      .bind(
        email,
        nutrients.join(','),
        channels.join(','),
        nutrientsOther,
        requests,
        new Date().toISOString(),
      )
      .run();
  } catch (err) {
    // 🔒 応答に原因を書かない（メールアドレスや DB の構造が漏れる）。
    //    詳細はサーバ側のログにだけ残す。
    console.error('waitlist insert failed', err);
    return json({ error: 'storage_unavailable' }, 503);
  }

  return json({ ok: true });
}

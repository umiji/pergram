/**
 * 要望の第1段階（1クリックの意思表示）を、匿名の1行として D1 に残す受け口。
 *
 * === なぜサーバに残すのか（T-051 / PO 判断） ===
 * T-050 では「第1段階の計測は GA4 のイベントだけで行い、サーバに列を足さない」と
 * 決めていた。**その決定は PO 判断で上書きされている。** GA4 は CSP の設定ミスで
 * 全滅した実績があり（T-047）、**計測が自分の手の中に無いと、0 件が「押されなかった」
 * のか「数えられなかった」のか読めない。**
 *
 * === この行が持つのは UUID と日時の2つだけである 🔒 ===
 * IP・User-Agent・リファラ・押された場所・成分・自由記述を**入れない**。
 * 個人を識別できるものを何も持たないことが、この行の存在理由である。
 * 押された場所の区別は GA4 の `location` が持つ（`request_click`）。
 * 列を足したくなったら、それは別の設計判断なので必ず PO へ上げること。
 *
 * === 既存の waitlist テーブルには触らない 🔒 ===
 * `waitlist` は `email` が主キーで、SQLite では後から変えられない。
 * **メールアドレス無しの行は物理的に入らない**ので、別テーブルにしてある。
 *
 * 重複はブラウザ側（localStorage の `pergram.request_signal_id`）で抑える。
 * ここでは主キーの衝突を握りつぶすだけで、送り直しをエラーにしない。
 */

/**
 * 受け取ってよい id の形。`crypto.randomUUID()` が返す UUID v4 だけを通す。
 *
 * 🔒 前後の空白を落として救わない。**形の合わない値は捨てる。**
 *    ここは利用者の入力欄ではなくスクリプトが作った識別子の受け口なので、
 *    形が違う時点で「こちらの想定していない何か」である。
 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const problem = (status) => new Response(null, { status });

/**
 * POST /api/request-signal
 *
 * @param {Request} request
 * @param {{ DB: D1Database }} env
 * @returns {Promise<Response>} 成功は 204 No Content（本文を返さない）
 */
export async function handleRequestSignal(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return problem(400);
  }

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return problem(400);
  }

  // 🔒 キーが `id` 1つだけであることまで見る。余計な情報を保存経路に近づけない。
  //    多い分を黙って捨てると、送っている側は「保存された」と思い込む。
  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== 'id') return problem(400);
  if (typeof payload.id !== 'string' || !UUID_V4.test(payload.id)) return problem(400);

  try {
    // 同じ id の2度目は無視する。ブラウザが送り直したときに 500 を返すと、
    // 「送れなかった」のか「既に入っている」のかが観測側から区別できなくなる。
    await env.DB.prepare(
      'INSERT OR IGNORE INTO request_signal (id, created_at) VALUES (?1, ?2)',
    )
      .bind(payload.id, new Date().toISOString())
      .run();
  } catch (err) {
    // 🔒 応答に原因を書かない（DB の構造が漏れる）。詳細はサーバ側のログにだけ残す。
    console.error('request_signal insert failed', err);
    return problem(503);
  }

  return problem(204);
}

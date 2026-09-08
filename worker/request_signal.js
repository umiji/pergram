/**
 * 要望の第1段階（1クリックの意思表示）を、匿名の1行として D1 に残す受け口。
 *
 * === なぜサーバに残すのか（T-051 / PO 判断） ===
 * T-050 では「第1段階の計測は GA4 のイベントだけで行い、サーバに列を足さない」と
 * 決めていた。**その決定は PO 判断で上書きされている。** GA4 は CSP の設定ミスで
 * 全滅した実績があり（T-047）、**計測が自分の手の中に無いと、0 件が「押されなかった」
 * のか「数えられなかった」のか読めない。**
 *
 * === この行が持つのは UUID と日時と「どのページか」の3つだけである 🔒 ===
 * ⚠️ **T-051 では「UUID と日時の2つだけ」と書いてあった。その決定は PO 判断で
 *    上書きされている（T-058、2026-09-08）。** どのページからの要望が多いかは、
 *    次に掲載する成分を決める材料そのものであり、GA4 は CSP の設定ミスで全滅した
 *    実績がある（T-047）ため、サーバ側にも残す。
 *    **`page` 列を「規約違反だから」と削らないこと。**
 * IP・User-Agent・リファラ・成分・自由記述は今も**入れない**。
 * 個人を識別できるものを何も持たないことが、この行の存在理由である。
 * **ページ内の位置（上の帯 / 下の帯）も入れない。** 記録するのは「どのページか」
 *    までで、位置の区別は GA4 の `location` が持つ（`request_click` の `data-cta`）。
 * 列をこれ以上足したくなったら、それは別の設計判断なので必ず PO へ上げること。
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

/**
 * 受け取ってよい page の形。`<locale>:<ページの識別子>`（`ja:lp` / `ja:protein` /
 * `en:creatine`）。作っているのは src/templates/request.js の `requestPageId()`。
 *
 * 🔒 id と同じく、前後の空白を落として救わない。**形の合わない値は捨てる。**
 * 🔒 URL のパスをそのまま受けない。パスは将来変わるうえ、クエリや断片を混ぜて
 *    送られると「どのページか」以上のものが入りうる。語彙を閉じて受ける。
 */
const PAGE_ID = /^[a-z]{2}:[a-z0-9-]{1,40}$/;

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

  // 🔒 キー集合が `{id, page}` ちょうどであることまで見る。余計な情報を保存経路に
  //    近づけない。多い分を黙って捨てると、送っている側は「保存された」と思い込む。
  // 🔒 `page` は任意項目にしない。無い行が混ざると「どのページからの要望が多いか」が
  //    数えられず、この列を足した目的（T-058）が果たせない。
  const keys = Object.keys(payload);
  if (keys.length !== 2 || !keys.includes('id') || !keys.includes('page')) return problem(400);
  if (typeof payload.id !== 'string' || !UUID_V4.test(payload.id)) return problem(400);
  if (typeof payload.page !== 'string' || !PAGE_ID.test(payload.page)) return problem(400);

  try {
    // 同じ id の2度目は無視する。ブラウザが送り直したときに 500 を返すと、
    // 「送れなかった」のか「既に入っている」のかが観測側から区別できなくなる。
    await env.DB.prepare(
      'INSERT OR IGNORE INTO request_signal (id, created_at, page) VALUES (?1, ?2, ?3)',
    )
      .bind(payload.id, new Date().toISOString(), payload.page)
      .run();
  } catch (err) {
    // 🔒 応答に原因を書かない（DB の構造が漏れる）。詳細はサーバ側のログにだけ残す。
    console.error('request_signal insert failed', err);
    return problem(503);
  }

  return problem(204);
}

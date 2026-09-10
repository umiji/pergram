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
 *
 * === 匿名の行を引き取って1行にまとめる（T-072 / PO 指摘 2026-09-09）🔒 ===
 * アンケートに匿名で答えた人（`/api/request-survey` が `id` だけの行を作る）が、
 * 続けてメールアドレスを登録すると、**以前は行が2つに分かれていた。**
 * しかも回答4項目が両方の行に入るので、「クレアチンを見たい人」を数えると
 * **同じ人を2回数えていた**（docs/research/validation-plan.md の判定に直接効く）。
 *
 *   直し方: **メールアドレスが送られた時点で、匿名の行の回答を引き取り、
 *            匿名の行を消してから、メールアドレスの行へ書く。**
 *
 * 🔒 **`id` 列へは何も書かない。**まとめるとは「`id` を捨てて `email` にする」ことである。
 *    1行が両方を持てたら、**それまで匿名だったボタン押下の1行1行がメールアドレスへ
 *    紐づく**（`request_signal` が3列しか持たない理由が丸ごと崩れる）。
 *    表の `CHECK (id IS NULL OR email IS NULL)` が最後の砦。**外して1行にするのは解ではない。**
 * 🔒 **消してから書く。**順序が逆だと `email TEXT UNIQUE` に当たって落ちる
 *    （先にメールアドレスだけ登録していた人が、あとから匿名で答えた場合）。
 *    2文は `batch()` で流す —— D1 の batch は1トランザクションなので、
 *    「消したのに書けなかった」で回答が消えることがない。
 * 🔒 **識別子は任意項目である。**`crypto.randomUUID()` を持たないブラウザには無い。
 *    無い・null・形が壊れている、のどれでも**登録は通す**（400 にしない）。
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
 * メールの段が添えてくる匿名の識別子の**本文でのキー名**（T-072）。
 *
 * 🔒 **保存列の `id` とは別の名前にしてある。**この値は「どの匿名の行を引き取るか」を
 *    指すだけで、**`id` 列へは決して書かれない。**キー名を `id` にすると、
 *    受け取った値をそのまま `id` 列へ入れる実装へ自然に手が伸びる
 *    （その瞬間に匿名の押下がメールアドレスへ紐づく）。**`id` へ改名しないこと。**
 */
const SIGNAL_ID_KEY = 'signal_id';

/**
 * 受け取ってよい識別子の形。`crypto.randomUUID()` が返す UUID v4 だけ。
 * `request_signal.id` / `worker/request_survey.js` と同じ規則である。
 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 匿名の識別子。**任意項目**なので、無い・null・形が壊れているときは黙って null にする。
 * 🔒 ここで 400 を返さない。識別子を作れない環境の人が待機リストに載れなくなる。
 *
 * @param {unknown} value
 * @returns {string | null}
 */
function signalId(value) {
  return typeof value === 'string' && UUID_V4.test(value) ? value : null;
}

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
 * 引き取る匿名の行（アンケートだけ答えた行）を1つ引く。無ければ null。
 *
 * 🔒 **引けなくても登録は止めない。** まとめるのは記録の都合であって、
 *    利用者の用は「待機リストに載ること」である。ここで落ちれば行が2つ残るが、
 *    それは集計の劣化であって、登録できない障害より軽い。
 *
 * @param {{ DB: D1Database }} env
 * @param {string} id 匿名の識別子（UUID v4 と確認済みのもの）
 * @returns {Promise<{nutrients: string|null, channel: string|null,
 *   nutrients_other: string|null, requests: string|null, created_at: string} | null>}
 */
async function findAnonymousRow(env, id) {
  try {
    const row = await env.DB.prepare(
      `SELECT nutrients, channel, nutrients_other, requests, created_at
         FROM waitlist
        WHERE id = ?1`,
    )
      .bind(id)
      .first();
    return row ?? null;
  } catch (err) {
    // 🔒 応答に原因を書かない。詳細はサーバ側のログにだけ残す
    console.error('waitlist anonymous lookup failed', err);
    return null;
  }
}

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

  // 🔒 `null` や配列は `JSON.parse` を通ってしまう。**ここで弾かないと、
  //    この下の `payload.email` が例外になって 500 になる**（R-3。
  //    `worker/request_survey.js` は同じ形で先に弾いている）。
  //    400 は「送り方が違う」、500 は「サーバが壊れた」であって、意味が別である。
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
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

  // この人が先に匿名でアンケートへ答えていれば、その行を引き取って1行にまとめる（T-072）。
  // 識別子が無い・壊れている人はここが null になり、今までどおりの登録だけが走る。
  const carriedId = signalId(payload[SIGNAL_ID_KEY]);
  const carried = carriedId ? await findAnonymousRow(env, carriedId) : null;

  try {
    // 同じメールアドレスの2度目以降は**同じ行へ追記する**（重複行を作らない）。
    //
    // 🔒 空で上書きしない。フォームは2段階（T-011）で、ステップ1はメールアドレスだけを
    //    送る。素直に excluded で上書きすると、ステップ2に答えたあとで誰かが同じ
    //    メールアドレスをもう一度ステップ1から送った瞬間に、集めた回答が消える。
    //    **「送られてきた値が空なら、今ある値を残す」**が正しい。
    //    値を消す UI は無いので、これで失われる操作は存在しない。
    const upsert = env.DB.prepare(
      `INSERT INTO waitlist (email, nutrients, channel, nutrients_other, requests, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(email) DO UPDATE SET
         nutrients       = COALESCE(NULLIF(excluded.nutrients, ''), waitlist.nutrients),
         channel         = COALESCE(NULLIF(excluded.channel, ''), waitlist.channel),
         nutrients_other = COALESCE(excluded.nutrients_other, waitlist.nutrients_other),
         requests        = COALESCE(excluded.requests, waitlist.requests)`,
    ).bind(
      // 引き取った匿名の行の回答は**既定値として**使う。送られてきた値を優先し、
      // 空のときだけ入れる。向きは上の ON CONFLICT と同じである。
      // 🔒 「匿名の行を常に優先」にしない —— 同じ送信で回答を書き換えられなくなる。
      email,
      nutrients.length > 0 ? nutrients.join(',') : (carried?.nutrients ?? ''),
      channels.length > 0 ? channels.join(',') : (carried?.channel ?? ''),
      nutrientsOther ?? carried?.nutrients_other ?? null,
      requests ?? carried?.requests ?? null,
      // 🔒 引き取った行の日時をそのまま使う。**最初に答えた日時**を後ろへずらさない
      //    （回答率の分母と突き合わせる時刻がずれる。worker/request_survey.js と同じ理由）
      carried?.created_at ?? new Date().toISOString(),
    );

    if (carried) {
      // 🔒 **匿名の行を消してから、メールアドレスの行へ書く。**
      //    - `id` 列へは何も書かない。まとめるとは「id を捨てて email にする」ことである
      //    - 順序が逆だと、先にメールアドレスだけ登録していた人のところで
      //      `email TEXT UNIQUE` に当たって落ちる
      //    - batch は D1 の1トランザクション。「消したのに書けなかった」で回答が消えない
      await env.DB.batch([
        env.DB.prepare('DELETE FROM waitlist WHERE id = ?1').bind(carriedId),
        upsert,
      ]);
    } else {
      await upsert.run();
    }
  } catch (err) {
    // 🔒 応答に原因を書かない（メールアドレスや DB の構造が漏れる）。
    //    詳細はサーバ側のログにだけ残す。
    console.error('waitlist insert failed', err);
    return json({ error: 'storage_unavailable' }, 503);
  }

  return json({ ok: true });
}

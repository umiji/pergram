/**
 * 要望の第2段階（成分アンケート）の回答を、**匿名のまま**1行として D1 に残す受け口。
 *
 * === なぜこの受け口が要るのか（T-070 / PO 報告） ===
 * アンケートの回答は、以前は**メールアドレスの段を送ったときに `waitlist` へ
 * 相乗りする**だけだった。`waitlist` は `email` が主キーなので、
 * **メールアドレスを入れなかった人の回答は1文字も残らなかった。**
 *
 *   ボタンを押す           → request_signal に1行（id / created_at / page）
 *   アンケートに答える     → **何も残らない**        ← ここを直した
 *   メールアドレスを入れる → waitlist に1行（回答も相乗り。今までどおり）
 *
 * 捨てていたのは「次に何を載せるか」を決める情報そのものであり、
 * docs/research/validation-plan.md の「成分アンケート回答率」の分子でもある。
 *
 * === この行が持つのは6つだけである 🔒 ===
 * 識別子 / 成分 / 購入先 / その他の成分 / 要望 / 日時。
 * **メールアドレスを入れない。入れた瞬間に匿名でなくなる。**
 * IP・User-Agent・リファラも入れない。**ページ内の位置（上の帯 / 下の帯）も入れない**
 * （位置は GA4 の location = `data-cta` が持つ）。
 * 「どのページか」も持たない —— 同じ id の行が `request_signal` にあり、
 * そちらの `page` と突き合わせられる。二重に持てば必ずずれる。
 * 列を足したくなったら、それは別の設計判断なので必ず PO へ上げること。
 *
 * === 検証の厳しさは worker/request_signal.js に合わせてある 🔒 ===
 * キー集合が**ちょうど一致**しなければ 400 で捨てる。多い分を黙って捨てると、
 * 送っている側は「保存された」と思い込む。id は UUID v4 の形だけを通し、
 * 前後の空白を落として救わない（スクリプトが作った識別子の受け口であって、
 * 利用者の入力欄ではない）。
 *
 * === ただし自由記述と選択肢は「捨てない」側へ倒す 🔒 ===
 * 自由記述は**長さで切るだけ。中身を解釈して弾かない**（N-01 / N-05。
 * 誤検知で正当な要望を捨てるほうが害が大きい）。選択肢は許可リストに無い値を
 * 落とすが、**そのために本文ごと 400 にはしない** —— 一緒に送られてきた
 * 自由記述まで巻き添えで消えるためである。このファイルは「回答が捨てられている」
 * ことを直すために在る。
 *
 * === 検証の道具を worker/waitlist.js と共有していないのは意図的である 🔒 ===
 * `allowedValues` / `freeText` / `UUID_V4` は、それぞれ `worker/waitlist.js` と
 * `worker/request_signal.js` にも同じものがある。**共通化していないのは、
 * 稼働中の受け口の挙動を、別の受け口の都合で動かさないためである。**
 * ここを直せばあちらも変わる形にすると、待機リストの登録（メールアドレスを
 * 預かっている経路）が、匿名の経路の修正に巻き込まれる。
 * まとめたくなったら、まず T-070 の決定ログを読むこと。
 */

import {
  ALLOWED_CHANNELS,
  ALLOWED_NUTRIENTS,
  NUTRIENTS_OTHER_MAX,
  REQUESTS_MAX,
} from '../src/lib/waitlist_fields.js';

/**
 * 受け取ってよい id の形。`crypto.randomUUID()` が返す UUID v4 だけを通す。
 * `request_signal.id` と同じ値であり、同じ規則で検証する。
 *
 * 🔒 前後の空白を落として救わない。**形の合わない値は捨てる。**
 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 本文が持ってよいキー。**この集合ちょうどでなければ 400。**
 * `created_at` はサーバが打つので本文には無い。
 * 🔒 `email` も `page` も `location` もここに無い。増やすのは PO 判断。
 */
const PAYLOAD_KEYS = ['id', 'nutrients', 'channel', 'nutrients_other', 'requests'];

const problem = (status) => new Response(null, { status });

/**
 * 選択肢。許可リストに無い値は捨て、重複は畳む。
 * 単一の文字列も受ける（配列でないことを理由に本文ごと捨てない）。
 *
 * @param {unknown} value
 * @param {Set<string>} allowed
 * @returns {string[]}
 */
function allowedValues(value, allowed) {
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.filter((item) => allowed.has(item)))];
}

/**
 * 自由記述。文字列でなければ捨て、長すぎれば**切る**。空文字は null にして列を汚さない。
 * 🔒 弾かない。中身も見ない（N-01 / N-05）。
 *
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string | null}
 */
function freeText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed === '' ? null : trimmed;
}

/**
 * POST /api/request-survey
 *
 * @param {Request} request
 * @param {{ DB: D1Database }} env
 * @returns {Promise<Response>} 成功は 204 No Content（本文を返さない）
 */
export async function handleRequestSurvey(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return problem(400);
  }

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return problem(400);
  }

  // 🔒 キー集合がちょうど一致することまで見る（worker/request_signal.js と同じ厳しさ）。
  //    余計な情報を保存経路に近づけない。**足りない側も通さない** —— 任意項目にすると、
  //    送り側の書き換えでキーが1つ消えても誰も気づかないまま列が空になる。
  const keys = Object.keys(payload);
  if (keys.length !== PAYLOAD_KEYS.length || !PAYLOAD_KEYS.every((key) => keys.includes(key))) {
    return problem(400);
  }
  if (typeof payload.id !== 'string' || !UUID_V4.test(payload.id)) return problem(400);

  const nutrients = allowedValues(payload.nutrients, ALLOWED_NUTRIENTS);
  const channels = allowedValues(payload.channel, ALLOWED_CHANNELS);
  const nutrientsOther = freeText(payload.nutrients_other, NUTRIENTS_OTHER_MAX);
  const requests = freeText(payload.requests, REQUESTS_MAX);

  try {
    // 同じブラウザ（同じ id）の2度目以降は**同じ行へ書き足す**。行は増えない。
    //
    // 🔒 空で上書きしない。**器が開いたまま何も書かずに送られた回**で、
    //    前に集めた回答が消えるのを防ぐ（worker/waitlist.js と同じ COALESCE 方式）。
    //    回答を消す UI は無いので、これで失われる操作は存在しない。
    //    `INSERT OR REPLACE` はこの性質を持てないので採らなかった（T-070 決定ログ）。
    // 🔒 `created_at` を更新しない。**最初に答えた日時**のまま置く。
    //    回答率の分母（request_survey_view）と突き合わせる時刻がずれる。
    await env.DB.prepare(
      `INSERT INTO request_survey (id, nutrients, channel, nutrients_other, requests, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(id) DO UPDATE SET
         nutrients       = COALESCE(NULLIF(excluded.nutrients, ''), request_survey.nutrients),
         channel         = COALESCE(NULLIF(excluded.channel, ''), request_survey.channel),
         nutrients_other = COALESCE(excluded.nutrients_other, request_survey.nutrients_other),
         requests        = COALESCE(excluded.requests, request_survey.requests)`,
    )
      .bind(
        payload.id,
        nutrients.join(','),
        channels.join(','),
        nutrientsOther,
        requests,
        new Date().toISOString(),
      )
      .run();
  } catch (err) {
    // 🔒 応答に原因を書かない（DB の構造が漏れる）。詳細はサーバ側のログにだけ残す。
    console.error('request_survey insert failed', err);
    return problem(503);
  }

  return problem(204);
}

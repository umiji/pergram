/**
 * T-050 の単体テスト（実装担当が書く分）。
 *
 * 受け入れテスト（tests/request_flow.test.js）は**出力された DOM の構造と属性**だけを見る。
 * 「押したら実際に段が開くか」「何が GA4 とサーバへ飛ぶか」はそこでは検査されないので、
 * ここでブラウザ相当の実行（tests/mini_dom.js）に載せて確かめる。
 *
 * 🔒 押下数を画面に描画しない。フィードバックはボタンの状態変化だけ。
 * 🔒 GA4 にメールアドレスを送らない。
 * 🔒 自由記述の**本文**を GA4 へ送らない。書かれたかどうか（0 / 1）だけ。
 * 🔒 送信後に別ページへ飛ばさない。
 * 🔒 サーバへ送るのは既存の待機リストと同じ6列の範囲だけ。
 *
 * === 2026-09-07 / T-051: 第1段階でも1回だけサーバへ送るようになった ===
 * T-050 では「第1段階の計測は GA4 のイベントだけ」だったが、**PO 判断でこれは
 * 上書きされた**（GA4 は CSP で全滅した実績があり、計測が自分の手の中に無いと
 * 0 件の意味が読めない。T-051 ## 申し送り 4）。押下で `POST /api/request-signal` へ
 * 匿名の UUID を1行残す。**ブラウザごとに1回だけ**（`localStorage`）。
 *
 * したがって `dom.fetchCalls` には**2種類の宛先が混ざる**。件数を数えるときは
 * 必ず宛先で分けること（`waitlistCalls()` / `signalCalls()`）。**全体の件数で
 * 「送っていない」を判定すると、匿名シグナルを数えてしまい意味が変わる。**
 * 匿名シグナルそのものの検査は tests/request_unify.test.js が持っている。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTranslator } from '../src/lib/i18n.js';
import { requestCta, requestFlow } from '../src/templates/request.js';
import { market } from './fixtures.js';
import { DomEvent, runLpScript } from './mini_dom.js';

const t = await loadTranslator('ja');

const SCRIPT = 'src/assets/request.js';
const TEST_EMAIL = 'request@example.com';

/** 待機リストの受け口。ここへ飛ぶのはメールアドレスの段を送ったときだけ */
const WAITLIST_ENDPOINT = '/api/waitlist';
/** 匿名シグナルの受け口。第1段階の押下で1回だけ（T-051） */
const SIGNAL_ENDPOINT = '/api/request-signal';

const waitlistCalls = (dom) => dom.fetchCalls.filter((call) => call.url.includes(WAITLIST_ENDPOINT));
const signalCalls = (dom) => dom.fetchCalls.filter((call) => call.url.includes(SIGNAL_ENDPOINT));

/** 自由記述の本文が GA4 へ漏れていないかを見るための目印 */
const SENTINEL = 'ZZQ';
const NUTRIENTS_OTHER_INPUT = `テスト用の成分名${SENTINEL}`;
const REQUESTS_INPUT = `テスト用のご要望${SENTINEL}`;

/** 保存してよい列（created_at はサーバが打つ）。ここに無い名前を送らない */
const ALLOWED_PAYLOAD_KEYS = new Set([
  'email',
  'nutrients',
  'channel',
  'nutrients_other',
  'requests',
]);

function page() {
  return `${requestCta(t, { location: 'products_request_top' })}
${requestCta(t, { location: 'products_request_bottom' })}
${requestFlow(t, { support: market.support })}`;
}

async function boot(options = {}) {
  const dom = await runLpScript(page(), { scriptPath: SCRIPT, ...options });
  const step = (kind) => dom.body.querySelector(`[data-request-step="${kind}"]`);
  return { dom, step };
}

/** 要望ボタンを押したところまで進める */
async function clickRequest(options = {}, which = 0) {
  const state = await boot(options);
  const buttons = state.dom.body.querySelectorAll('[data-request-cta]');
  assert.equal(buttons.length, 2, '要望ボタンが2つではありません');

  buttons[which].dispatchEvent(new DomEvent('click'));
  await state.dom.flush();
  return { ...state, buttons, button: buttons[which] };
}

/** アンケートに答えて送るところまで進める */
async function submitSurvey(options = {}) {
  const state = await clickRequest(options);
  const form = state.dom.body.querySelector('[data-request-survey]');
  assert.ok(form, 'アンケートのフォームがありません');

  form.querySelector('input[name="nutrients"][value="creatine"]').checked = true;
  form.querySelector('input[name="channel"][value="rakuten"]').checked = true;
  form.querySelector('[name="nutrients_other"]').value = NUTRIENTS_OTHER_INPUT;
  form.querySelector('[name="requests"]').value = REQUESTS_INPUT;

  const submit = new DomEvent('submit');
  form.dispatchEvent(submit);
  await state.dom.flush();
  return { ...state, surveyForm: form, surveySubmit: submit };
}

/** メールアドレスまで送るところまで進める */
async function submitEmail(options = {}, email = TEST_EMAIL) {
  const state = await submitSurvey(options);
  const form = state.dom.body.querySelector('[data-request-email]');
  assert.ok(form, 'メールアドレスのフォームがありません');

  form.querySelector('input[type="email"]').value = email;
  const submit = new DomEvent('submit');
  form.dispatchEvent(submit);
  await state.dom.flush();
  return { ...state, emailForm: form, emailSubmit: submit };
}

/* ---- 第1段階: 要望ボタン ---------------------------------------------- */

test('要望ボタンを押すとアンケートの段だけが開く（メールと支援は閉じたまま）', async () => {
  const { step } = await clickRequest();

  assert.equal(step('survey').hidden, false, 'アンケートの段が開いていません');
  assert.equal(step('email').hidden, true, 'メールの段が先に開いています');
  assert.equal(step('support').hidden, true, '支援の段が先に開いています');
});

test('押す前はどの段も閉じている（スクリプトが勝手に開かない）', async () => {
  const { step } = await boot();

  for (const kind of ['survey', 'email', 'support']) {
    assert.equal(step(kind).hidden, true, `${kind} の段が押す前から開いています`);
  }
});

test('押下は位置つきで GA4 へ送られる。リストの前と後ろで location が変わる', async () => {
  const top = await clickRequest({}, 0);
  const bottom = await clickRequest({}, 1);

  const locationOf = (state) => {
    const hit = state.dom.events().find((e) => e.params.location);
    assert.ok(hit, '位置つきのイベントが送られていません');
    return hit.params.location;
  };

  assert.equal(locationOf(top), 'products_request_top');
  assert.equal(locationOf(bottom), 'products_request_bottom');
});

test('🔒 押下後のフィードバックに数値が出ない（押下数を描画しない）', async () => {
  const { buttons } = await clickRequest();

  for (const button of buttons) {
    assert.ok(
      !/\d/.test(button.textContent),
      `ボタンの文言に数値が出ています: ${button.textContent}`,
    );
    assert.equal(button.getAttribute('aria-expanded'), 'true', '開いたことが伝わっていません');
  }
});

test('🔒 要望ボタンを押しただけでは待機リストへ送らない（飛ぶのは匿名シグナルだけ）', async () => {
  const { dom } = await clickRequest();

  assert.equal(
    waitlistCalls(dom).length,
    0,
    `第1段階でメールアドレスの受け口へ ${waitlistCalls(dom).length} 回送っています`,
  );
  assert.equal(signalCalls(dom).length, 1, '匿名シグナルが1回送られていません（T-051 完了条件7）');
});

/* ---- 第2段階: アンケート ---------------------------------------------- */

test('アンケートを送るとメールの段が開き、アンケートは完了状態になる', async () => {
  const { step, surveyForm, surveySubmit, dom } = await submitSurvey();

  assert.ok(surveySubmit.defaultPrevented, '🔒 送信で既定の遷移が止まっていません');
  assert.equal(dom.navigations.length, 0, '🔒 送信後に別ページへ飛んでいます');
  assert.equal(surveyForm.hidden, true, 'アンケートのフォームが残っています');
  assert.equal(step('email').hidden, false, 'メールの段が開いていません');
  assert.equal(step('support').hidden, true, '支援の段が先に開いています');
});

test('🔒 アンケートの送信は待機リストへ飛ばさない（メールアドレスが無いと保存できない）', async () => {
  const { dom } = await submitSurvey();

  assert.equal(
    waitlistCalls(dom).length,
    0,
    `アンケートだけで ${waitlistCalls(dom).length} 回送信しています`,
  );
});

test('🔒 アンケートの GA4 イベントに自由記述の本文が乗らない（有無だけ）', async () => {
  const { dom } = await submitSurvey();

  const hit = dom.events().find((e) => 'has_requests' in e.params);
  assert.ok(hit, '自由記述の有無を数えるイベントがありません');
  assert.equal(hit.params.has_requests, 1);
  assert.equal(hit.params.has_nutrients_other, 1);
  assert.ok(hit.params.selected_nutrients.includes('creatine'), '選択した成分が乗っていません');
  assert.ok(hit.params.purchase_channel.includes('rakuten'), '購入先が乗っていません');

  const sent = JSON.stringify(dom.gtagCalls);
  assert.ok(!sent.includes(SENTINEL), `自由記述の本文が GA4 へ流れています: ${SENTINEL}`);
});

test('アンケートを飛ばしてもメールの段へ進める', async () => {
  const { dom, step } = await clickRequest();
  const skip = dom.body.querySelector('[data-request-skip="survey"]');
  assert.ok(skip, 'アンケートを飛ばす操作がありません');

  skip.dispatchEvent(new DomEvent('click'));
  await dom.flush();

  assert.equal(step('email').hidden, false, 'メールの段が開いていません');
  assert.equal(waitlistCalls(dom).length, 0, '飛ばしたのに待機リストへ送信しています');
});

/* ---- 第3段階: メールアドレス ------------------------------------------- */

test('メールアドレスを送ると /api/waitlist へ POST され、支援の段が開く', async () => {
  const { dom, step, emailForm, emailSubmit } = await submitEmail();

  assert.equal(waitlistCalls(dom).length, 1, `送信が ${waitlistCalls(dom).length} 回です`);
  const [call] = waitlistCalls(dom);
  assert.equal(call.method, 'POST');
  assert.ok(call.url.startsWith(WAITLIST_ENDPOINT), `送信先が ${call.url} です`);
  assert.equal(call.body.email, TEST_EMAIL);

  assert.ok(emailSubmit.defaultPrevented, '🔒 送信で既定の遷移が止まっていません');
  assert.equal(dom.navigations.length, 0, '🔒 送信後に別ページへ飛んでいます');
  assert.equal(emailForm.hidden, true, 'メールのフォームが残っています');
  assert.equal(step('support').hidden, false, '支援の段が開いていません');
});

test('🔒 送信本文は保存してよい列の範囲だけ。アンケートの回答が同じ送信に相乗りする', async () => {
  const { dom } = await submitEmail();
  const { body } = waitlistCalls(dom)[0];

  for (const key of Object.keys(body)) {
    assert.ok(ALLOWED_PAYLOAD_KEYS.has(key), `保存対象外の項目を送っています: ${key}`);
  }
  assert.ok(body.nutrients.includes('creatine'), '見たい成分が送られていません');
  assert.ok(body.channel.includes('rakuten'), '購入先が送られていません');
  assert.equal(body.nutrients_other, NUTRIENTS_OTHER_INPUT);
  assert.equal(body.requests, REQUESTS_INPUT);
});

test('🔒 GA4 にメールアドレスを送らない', async () => {
  const { dom } = await submitEmail();

  assert.ok(
    !JSON.stringify(dom.gtagCalls).includes(TEST_EMAIL),
    'GA4 のイベントにメールアドレスが載っています',
  );
});

test('メールアドレスの形が正しくなければ送らず、直し方を文で出す', async () => {
  const { dom, step } = await submitEmail({}, 'not-an-email');
  const error = dom.body.querySelector('.request-form__error');

  assert.equal(waitlistCalls(dom).length, 0, '不正なメールアドレスを送信しています');
  assert.ok(error && !error.hidden, 'エラー文が出ていません');
  assert.ok(error.textContent.trim().length > 0, '🔒 エラーを色だけで示しています');
  assert.equal(step('support').hidden, true, '送れていないのに支援の段が開いています');
});

test('送信に失敗したら完了状態にせず、押し直せる', async () => {
  const { dom, step, emailForm } = await submitEmail({ respond: () => ({ reject: true }) });
  const error = dom.body.querySelector('.request-form__error');
  const button = emailForm.querySelector('button[type="submit"]');

  assert.equal(emailForm.hidden, false, '失敗したのにフォームが隠れています');
  assert.equal(step('support').hidden, true, '失敗したのに次の段が開いています');
  assert.ok(error && !error.hidden, 'エラー文が出ていません');
  assert.equal(button.disabled, false, '失敗したままボタンが押せません');
  assert.equal(dom.navigations.length, 0, '🔒 別ページへ飛んでいます');
});

test('メールアドレスを入れずに支援の段まで進める', async () => {
  const { dom, step } = await submitSurvey();
  const skip = dom.body.querySelector('[data-request-skip="email"]');
  assert.ok(skip, 'メールアドレスを飛ばす操作がありません');

  skip.dispatchEvent(new DomEvent('click'));
  await dom.flush();

  assert.equal(step('support').hidden, false, '支援の段が開いていません');
  assert.equal(waitlistCalls(dom).length, 0, '飛ばしたのに待機リストへ送信しています');
});

/* ---- 計測の分離 -------------------------------------------------------- */

test('段への到達が、それぞれ別のイベント名で数えられる', async () => {
  const { dom } = await submitEmail();
  const names = dom.eventNames();

  assert.equal(new Set(names).size, names.length, `同じイベント名が重複しています: ${names}`);
  assert.equal(names.length, 6, `到達と送信の内訳が6件ではありません: ${names}`);
});

test('支援の設定が無い市場では、支援の段が無くても壊れない', async () => {
  const html = `${requestCta(t, { location: 'products_request_top' })}
${requestFlow(t, { support: null })}`;
  const dom = await runLpScript(html, { scriptPath: SCRIPT });

  dom.body.querySelector('[data-request-cta]').dispatchEvent(new DomEvent('click'));
  await dom.flush();

  assert.equal(dom.body.querySelector('[data-request-step="support"]'), null);
  assert.equal(dom.body.querySelector('[data-request-step="survey"]').hidden, false);

  const skip = dom.body.querySelector('[data-request-skip="email"]');
  skip.dispatchEvent(new DomEvent('click'));
  await dom.flush();
  assert.equal(dom.navigations.length, 0, '支援の段が無いときに別ページへ飛んでいます');
});

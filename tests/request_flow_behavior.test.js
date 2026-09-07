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

/**
 * 通しで進んだときに出る GA4 のイベント名を**名指しで**固定する。
 *
 * 2026-09-07 / T-051 レビュー: もとは件数（6件）だけを見ていたが、
 * **広告のコンバージョン `waitlist_submit` が消えても件数の期待値を直せば通ってしまう。**
 * 名前の一覧で固定して、消えたことが必ず落ちるようにした（件数の検査は含意される）。
 */
const FULL_FLOW_EVENTS = [
  'request_click',
  'request_survey_view',
  'request_survey_submit',
  'request_email_view',
  'request_email_submit',
  'waitlist_submit',
  'request_support_view',
];

test('段への到達が、それぞれ別のイベント名で数えられる', async () => {
  const { dom } = await submitEmail();
  const names = dom.eventNames();

  assert.equal(new Set(names).size, names.length, `同じイベント名が重複しています: ${names}`);
  assert.deepEqual(
    [...names].sort(),
    [...FULL_FLOW_EVENTS].sort(),
    `到達と送信の内訳が変わっています: ${names}`,
  );
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

/* ---- 飛ばした段に完了文言を出さない（T-051 レビュー R-051-2） ----------- */

/**
 * 🔒 **やっていないことの完了文言を出さない。**
 *
 * 「メールアドレスを入れずに進む」を押しただけで
 * 「登録しました。掲載したらお知らせします。」（`request.emailDone`）が出ていた。
 * `/api/waitlist` へは1件も送っていないので、**サービスが保持していないデータを
 * 保持していると利用者へ断言していた**（`.claude/rules/pergram-ui-copy.md`
 * 「事実のみを書く」違反）。飛ばした段はフォームを畳むだけにする。
 */
const doneOf = (dom, kind) =>
  dom.body.querySelector(`[data-request-step="${kind}"] .request-flow__done`);

test('🔒 アンケートを飛ばしたとき、回答したという完了文言を出さない', async () => {
  const { dom } = await clickRequest();
  const skip = dom.body.querySelector('[data-request-skip="survey"]');

  skip.dispatchEvent(new DomEvent('click'));
  await dom.flush();

  const done = doneOf(dom, 'survey');
  assert.ok(done, 'アンケートの段に完了文言の器がありません');
  assert.equal(done.hidden, true, '飛ばしたのに回答の完了文言が出ています');
  assert.equal(done.textContent.trim(), '', '飛ばしたのに回答の完了文言が読める状態です');
});

test('🔒 メールアドレスを飛ばしたとき、登録したという完了文言を出さない', async () => {
  const { dom } = await submitSurvey();
  const skip = dom.body.querySelector('[data-request-skip="email"]');

  skip.dispatchEvent(new DomEvent('click'));
  await dom.flush();

  const done = doneOf(dom, 'email');
  assert.ok(done, 'メールの段に完了文言の器がありません');
  assert.equal(done.hidden, true, '送っていないのに登録の完了文言が出ています');
  assert.ok(
    !dom.body.textContent.includes(t('request.emailDone')),
    `送っていないのに「${t('request.emailDone')}」が画面に出ています`,
  );
});

test('飛ばした段でもフォームは畳まれ、次の段が開く', async () => {
  const { dom, step } = await clickRequest();

  dom.body.querySelector('[data-request-skip="survey"]').dispatchEvent(new DomEvent('click'));
  await dom.flush();

  assert.equal(
    dom.body.querySelector('[data-request-survey]').hidden,
    true,
    '飛ばしたのにアンケートのフォームが残っています',
  );
  assert.equal(step('email').hidden, false, 'メールの段が開いていません');
});

/* ---- 押し直しても空の器が復活しない（T-053 レビュー R-053-1 / 完了条件 B-5b） -- */

/**
 * 🔒 **決着の付いた段は、要望ボタンを押し直しても開き直さない。**
 *
 * 飛ばしたアンケートの段は器ごと畳まれている（完了条件 B-5）。押し直したときに
 * `hidden` を外すだけだと、**フォームも完了文言も隠れたままの段が枠だけの空箱として
 * 復活する**（実ブラウザで高さ 50px の空箱を確認）。PO が指摘した「空の箱」そのものが
 * 2クリックで戻る。
 *
 * 🔒 あわせて `request_survey_view` を**1閲覧につき1回**に保つ。この名前は
 *    docs/research/validation-plan.md の「成分アンケート回答率」の**分母**であり、
 *    飛ばした人だけが二重に数えられると回答率が実際より低く出て、
 *    広告の撤退判定を誤らせる。
 */
const countEvent = (dom, name) => dom.eventNames().filter((n) => n === name).length;

/** アンケートを飛ばしたあと、要望ボタンをもう一度押す */
async function skipSurveyThenClickAgain() {
  const state = await clickRequest();
  state.dom.body.querySelector('[data-request-skip="survey"]').dispatchEvent(new DomEvent('click'));
  await state.dom.flush();

  state.buttons[0].dispatchEvent(new DomEvent('click'));
  await state.dom.flush();
  return state;
}

test('🔒 アンケートを飛ばした後に押し直しても、空の段が開き直さない', async () => {
  const { step } = await skipSurveyThenClickAgain();

  assert.equal(step('survey').hidden, true, '飛ばしたアンケートの段が空箱のまま復活しています');
});

test('🔒 アンケートを飛ばした後に押し直しても request_survey_view は1回だけ', async () => {
  const { dom } = await skipSurveyThenClickAgain();

  assert.equal(
    countEvent(dom, 'request_survey_view'),
    1,
    '成分アンケート回答率の分母が二重に数えられています',
  );
});

test('押し直しても、飛ばした後に開いたメールの段は開いたまま', async () => {
  const { step } = await skipSurveyThenClickAgain();

  assert.equal(step('email').hidden, false, '押し直しでメールの段が閉じています');
});

test('🔒 回答を送った後に押し直しても、完了文言が消えず二重に数えない', async () => {
  const { dom, step, buttons } = await submitSurvey();

  buttons[0].dispatchEvent(new DomEvent('click'));
  await dom.flush();

  assert.equal(step('survey').hidden, false, '押し直しで回答の完了文言ごと段が消えています');
  assert.equal(doneOf(dom, 'survey').hidden, false, '押し直しで完了文言が隠れています');
  assert.equal(
    countEvent(dom, 'request_survey_view'),
    1,
    'request_survey_view が二重に数えられています',
  );
});

test('実際に送った段には完了文言が出る（飛ばした場合と区別が付く）', async () => {
  const { dom } = await submitEmail();

  const surveyDone = doneOf(dom, 'survey');
  const emailDone = doneOf(dom, 'email');
  assert.equal(surveyDone.hidden, false, '回答を送ったのに完了文言が出ていません');
  assert.equal(surveyDone.textContent.trim(), t('request.surveyDone'));
  assert.equal(emailDone.hidden, false, '登録できたのに完了文言が出ていません');
  assert.equal(emailDone.textContent.trim(), t('request.emailDone'));
});

/* ---- 広告のコンバージョン（T-051 レビュー R-051-1） -------------------- */

/**
 * 🔒 **`waitlist_submit` を消さない。**
 *
 * この名前は `docs/ops/google-ads-first-campaign.md` (0-4) で
 * **Google 広告のコンバージョンとしてインポート済み**である。送る箇所が消えると、
 * 広告側のコンバージョンは**エラーにならず 0 件のまま静かに記録され続ける**
 * （T-047 と同じ壊れ方）。`request_email_submit` とは別に、名前の連続性のためだけに残す。
 */
test('🔒 メールアドレスの登録が成功したとき waitlist_submit を送る（広告のコンバージョン）', async () => {
  const { dom } = await submitEmail();

  assert.ok(
    dom.eventNames().includes('waitlist_submit'),
    `waitlist_submit が送られていません: ${dom.eventNames()}`,
  );
});

test('🔒 waitlist_submit に個人識別情報を載せない', async () => {
  const { dom } = await submitEmail();
  const call = dom.gtagCalls.find((c) => c[1] === 'waitlist_submit');

  assert.ok(call, 'waitlist_submit が送られていません');
  assert.ok(
    !JSON.stringify(call).includes(TEST_EMAIL),
    'waitlist_submit にメールアドレスが載っています',
  );
});

test('🔒 メールアドレスを飛ばしたときは waitlist_submit を送らない', async () => {
  const { dom } = await submitSurvey();
  dom.body.querySelector('[data-request-skip="email"]').dispatchEvent(new DomEvent('click'));
  await dom.flush();

  assert.ok(
    !dom.eventNames().includes('waitlist_submit'),
    '登録していないのに広告のコンバージョンを送っています',
  );
});

test('🔒 送信に失敗したときは waitlist_submit を送らない', async () => {
  const { dom } = await submitEmail({ respond: () => ({ reject: true }) });

  assert.ok(
    !dom.eventNames().includes('waitlist_submit'),
    '保存できていないのに広告のコンバージョンを送っています',
  );
});

/* ---- 第1段階の目印と順序（T-051 レビュー R-051-8 / R-051-12） ---------- */

/**
 * 🔒 `aria-controls` は**実際に開閉する要素**を指す。
 *
 * もとは段全体を包む器（`#request-flow`）を指していたが、その器は常に可視で、
 * `aria-expanded` が false から true に変わっても何も変わらない。
 * 支援技術に対して**不正確な状態を宣言していた**（WAI-ARIA / WCAG 4.1.2）。
 */
test('🔒 要望ボタンの aria-controls が、押す前は閉じている要素を指す', async () => {
  const { dom, button } = await boot().then(async (state) => {
    const btn = state.dom.body.querySelectorAll('[data-request-cta]')[0];
    return { ...state, button: btn };
  });

  const id = button.getAttribute('aria-controls');
  assert.ok(id, '要望ボタンに aria-controls がありません');
  const target = dom.body.querySelector(`#${id}`);
  assert.ok(target, `aria-controls="${id}" の指す要素がありません`);
  assert.equal(target.hidden, true, 'aria-expanded="false" なのに指す先が見えています');
  assert.equal(button.getAttribute('aria-expanded'), 'false');

  button.dispatchEvent(new DomEvent('click'));
  await dom.flush();

  assert.equal(target.hidden, false, '押したのに aria-controls の指す先が閉じたままです');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
});

/**
 * 🔒 **段を開くことは、匿名シグナルの送信より先に済ませる。**
 *
 * シグナルの保存は計測の都合であって、利用者の用ではない。送信の側で例外が出ても
 * 導線を止めてはならない（T-051 ## 判断してよい範囲「ただし段は必ず開くこと」）。
 * 順序で担保しておくと、`fetch` が同期的に投げる環境でも段は開く。
 */
test('🔒 匿名シグナルの送信が同期的に失敗しても、段は開く', async () => {
  const dom = await runLpScript(page(), {
    scriptPath: SCRIPT,
    respond: () => {
      throw new Error('fetch is unavailable');
    },
  });

  dom.body.querySelector('[data-request-cta]').dispatchEvent(new DomEvent('click'));
  await dom.flush();

  assert.equal(
    dom.body.querySelector('[data-request-step="survey"]').hidden,
    false,
    '送信が失敗したせいで段が開いていません',
  );
});

/* ---- LP と製品一覧で同じ操作を同じ数え方にする（R-051-7） -------------- */

/**
 * 🔒 **同じ押下を2つの名前で数えない。**
 *
 * LP だけは `src/assets/lp.js` も読み込まれる。そちらは `[data-cta]` を持つ要素すべてに
 * `cta_click` を付けるので、要望ボタン（`data-request-cta` かつ `data-cta`）を押すと
 * **LP では `cta_click` と `request_click` の2件、製品一覧では `request_click` の1件**が
 * 出ていた。同じ操作の件数が画面によって変わると、ファネルの離脱率が読めない。
 *
 * 位置の情報は失われない。`request_click` の `location` が同じ `data-cta` の値を持つ。
 */
const LP_SCRIPT = 'src/assets/lp.js';

/** ヘッダの CTA。第1段階のボタンではないので、これは今までどおり cta_click で数える */
const HEADER_CTA = '<a href="#waitlist" data-cta="header_waitlist">機能追加リクエスト</a>';

const ctaClicks = (dom) => dom.gtagCalls.filter((call) => call[1] === 'cta_click');

test('🔒 LP でも要望ボタンの押下は request_click ひとつだけで数える', async () => {
  const dom = await runLpScript(`${HEADER_CTA}\n${page()}`, { scriptPath: LP_SCRIPT });

  dom.body.querySelector('[data-request-cta]').dispatchEvent(new DomEvent('click'));
  await dom.flush();

  assert.equal(
    ctaClicks(dom).length,
    0,
    `要望ボタンで cta_click が ${ctaClicks(dom).length} 件出ています（製品一覧では 0 件）`,
  );
});

test('🔒 第1段階のボタンでない CTA は今までどおり cta_click で数える（計測の連続性）', async () => {
  const dom = await runLpScript(`${HEADER_CTA}\n${page()}`, { scriptPath: LP_SCRIPT });

  dom.body.querySelector('[data-cta="header_waitlist"]').dispatchEvent(new DomEvent('click'));
  await dom.flush();

  assert.deepEqual(
    ctaClicks(dom).map((call) => call[2].location),
    ['header_waitlist'],
    'ヘッダの CTA の cta_click が消えています。T-047 の前後比較ができなくなる',
  );
});

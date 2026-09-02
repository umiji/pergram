/**
 * T-011 の受け入れテスト。待機リストのフォームを2段階にする。
 *
 * 完了条件（docs/tasks/T-011.md §完了条件）を二値で判定できる形に落としてある。
 * 実装より先に書いてあるので、**未実装のうちは落ちるのが正しい**。
 *
 * === このテストが固定する契約 ===
 * - ステップ1 = `.waitlist__done` の**外**にあるフォーム。入力欄はメールアドレス1つだけ
 * - ステップ2 = `.waitlist__done` の**中**にあるフォーム（禁止事項「ステップ2は完了状態の
 *   中に置く」より）。見たい成分チップ・自由記述・購入先チップ・ご要望がここに入る
 * - ステップ2の送信は、ステップ1と同じメールアドレスを載せて `/api/waitlist` 系の
 *   パスへ送る（同一レコードへの追記のため）
 *
 * === GA4 のイベント名は綴りを固定しない ===
 * 完了条件4は「到達数と送信数が**別々に**数えられること」であって、特定の綴りではない。
 * ここでは「ステップ2に到達した時点で、それまでに無かったイベントが1つ増えること」
 * 「ステップ2を送信した時点で、さらに別のイベントが増えること」を判定する。
 * 綴りの決定は実装の裁量に残す（GA4 管理画面への登録は T-007 の領分）。
 *
 * 🔒 保存列は6つ（email / nutrients / channel / nutrients_other / requests / created_at）。
 *    2段階化は入力の分割であって、取得項目の追加ではない。
 * 🔒 送信後に別ページへ飛ばさない。
 * 🔒 GA4 に自由記述の**本文**を送らない。書かれたかどうか（0/1）だけ。
 *
 * ⚠️ tests/render.test.js / tests/lp_cta.test.js には触らない（T-020 が同じ期間に触る）。
 *    ブラウザ相当の実行は tests/mini_dom.js が担う（依存パッケージは増やさない）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import { loadTranslator } from '../src/lib/i18n.js';
import { waitlist } from '../src/templates/lp/form.js';
import {
  CHANNEL_CHIPS,
  NUTRIENT_CHIPS,
  REQUESTS_MAX,
} from '../src/lib/waitlist_fields.js';
import worker from '../worker/index.js';
import { DomEvent, Element, parseFragment, runLpScript } from './mini_dom.js';

const tJa = await loadTranslator('ja');
const tEn = await loadTranslator('en');

/** 🔒 保存してよい列。ここが増えたら要件が変わったということ */
const STORED_COLUMNS = ['email', 'nutrients', 'channel', 'nutrients_other', 'requests', 'created_at'];

/** フォームの入力欄として許される name。created_at は入力ではない */
const ALLOWED_FIELD_NAMES = new Set(['email', 'nutrients', 'channel', 'nutrients_other', 'requests']);

/** 🔒 取ってはいけない項目。名前で入り込んでいないかを見る */
const FORBIDDEN_FIELD_NAMES = [
  'age', 'birth', 'birthday', 'sex', 'gender', 'condition', 'symptom',
  'medication', 'medicine', 'height', 'weight', 'disease', 'health',
];

/**
 * design/service.md §7 と ad-lp.md §1 の禁止語。
 * tests/render.test.js の BANNED_WORDS と同一。テストファイルは import すると
 * 中のテストごと走ってしまうので、共有せず写してある。
 */
const BANNED_WORDS = [
  '効く',
  '効果',
  '改善',
  '高品質',
  'おすすめ',
  '人気No.1',
  '安心',
  '話題の',
  '選ばれる',
  '実感',
];

/** 自由記述の本文が GA4 へ漏れていないかを見るための目印 */
const SENTINEL = 'ZZQ';
const NUTRIENTS_OTHER_INPUT = `テスト用の成分名${SENTINEL}`;
const REQUESTS_INPUT = `テスト用のご要望${SENTINEL}`;
const TEST_EMAIL = 'step2@example.com';

/* ---- 描画とツリー ------------------------------------------------------ */

function renderWaitlist(t = tJa) {
  return waitlist(t, { support: null });
}

function tree(html) {
  const root = new Element('div');
  for (const node of parseFragment(html)) root.appendChild(node);
  return root;
}

function isInside(el, ancestor) {
  if (!ancestor) return false;
  let node = el;
  while (node) {
    if (node === ancestor) return true;
    node = node.parentNode;
  }
  return false;
}

function doneRegion(root) {
  const done = root.querySelector('.waitlist__done');
  assert.ok(done, '完了状態（.waitlist__done）が見つかりません');
  return done;
}

/** ステップ1 = 完了状態の外にあるフォーム */
function stepOneForm(root) {
  const done = root.querySelector('.waitlist__done');
  const form = root.querySelectorAll('form').find((one) => !isInside(one, done));
  assert.ok(form, 'ステップ1のフォームが見つかりません');
  return form;
}

/** ステップ2 = 完了状態の中にあるフォーム。無ければ未実装 */
function stepTwoForm(root, { required = true } = {}) {
  const form = doneRegion(root).querySelector('form');
  if (required) {
    assert.ok(
      form,
      'ステップ2のフォームが .waitlist__done の中にありません。' +
        'ステップ2は完了状態の中に置く（別ページへ飛ばさない）',
    );
  }
  return form;
}

/** 利用者が値を入れる欄。送信ボタンや hidden は数えない */
function inputControls(scope) {
  return scope
    .querySelectorAll('input,textarea,select')
    .filter((el) => !['submit', 'button', 'reset', 'hidden'].includes(el.type));
}

function fieldNames(scope) {
  return [...new Set(inputControls(scope).map((el) => el.name).filter(Boolean))];
}

function chipValues(scope, name) {
  return scope.querySelectorAll(`input[name="${name}"]`).map((el) => el.getAttribute('value'));
}

/* ======================================================================== */
/* 完了条件1: ステップ1の入力欄はメールアドレス1つだけ                      */
/* ======================================================================== */

// ⚠️ T-011（待機リストフォームの2段階化）は実装が未着手である。
//    下の PENDING を付けた 11 件は、実装が入るまで必ず落ちる受け入れテストであり、
//    main の CI を赤にしたままにしないために一時的に skip してある。
//
// 🔒 T-011 の実装担当へ: 着手したら **まず PENDING を外して RED を確認する**こと。
//    RED を見ずに実装を始めると、テストが何を要求しているのかを取り違える。
//    実装が終わった時点で PENDING の定義ごと削除する。
//
//    skip を付けたのはオーケストレーターであり、テストの中身は一切変えていない
//    （アサーションの削除も緩和もしていない）。経緯は docs/tasks/T-011.md の申し送り。
const PENDING = { skip: 'T-011 実装待ち。実装担当は着手時にこの skip を外すこと' };

test('完了条件1: ステップ1の入力欄がメールアドレス1つだけである', PENDING, () => {
  const root = tree(renderWaitlist());
  const controls = inputControls(stepOneForm(root));

  assert.deepEqual(
    controls.map((el) => el.name),
    ['email'],
    `ステップ1の入力欄が ${controls.map((el) => el.name || '(無名)').join(' / ')} です。` +
      'メールアドレス1つだけにする',
  );
  assert.equal(controls[0].getAttribute('type'), 'email');
});

test('完了条件1: 見たい成分・購入先・自由記述はステップ1に残っていない', PENDING, () => {
  const root = tree(renderWaitlist());
  const stepOne = stepOneForm(root);

  for (const name of ['nutrients', 'channel', 'nutrients_other', 'requests']) {
    assert.equal(
      stepOne.querySelectorAll(`[name="${name}"]`).length,
      0,
      `ステップ1に ${name} が残っています。ステップ2（完了状態の中）へ移す`,
    );
  }
});

/* ======================================================================== */
/* 完了条件5: 自由記述の注記がステップ2にある                               */
/* ======================================================================== */

test('完了条件5: 🔒 自由記述の注記（lp.form.freeTextNote）がステップ2にある', PENDING, () => {
  for (const [locale, t] of [
    ['ja', tJa],
    ['en', tEn],
  ]) {
    const root = tree(renderWaitlist(t));
    const note = t('lp.form.freeTextNote');
    assert.ok(
      doneRegion(root).textContent.includes(note),
      `${locale}: 自由記述の注記がステップ2にありません。` +
        'N-01 / N-05 に対する唯一の防波堤なので、自由記述と一緒に移す',
    );
  }
});

test('完了条件5: 🔒 注記は自由記述と同じ側にある（本文だけ移して注記を置き去りにしない）', PENDING, () => {
  const root = tree(renderWaitlist());
  const done = doneRegion(root);
  const freeTextFields = done.querySelectorAll('[name="nutrients_other"],[name="requests"]');

  assert.ok(
    freeTextFields.length >= 2,
    'ステップ2に自由記述（nutrients_other / requests）がありません',
  );
  assert.ok(
    done.textContent.includes(tJa('lp.form.freeTextNote')),
    '自由記述がステップ2にあるのに注記がありません',
  );
});

/* ======================================================================== */
/* ステップ2の中身と、そこに置いてはいけないもの                            */
/* ======================================================================== */

test('ステップ2に、見たい成分・購入先・自由記述の3項目が揃っている', PENDING, () => {
  const root = tree(renderWaitlist());
  const step2 = stepTwoForm(root);

  assert.deepEqual(
    chipValues(step2, 'nutrients'),
    NUTRIENT_CHIPS,
    '🔒 見たい成分のチップと並びは src/lib/waitlist_fields.js が唯一の出所',
  );
  assert.deepEqual(
    chipValues(step2, 'channel'),
    CHANNEL_CHIPS,
    '🔒 購入先のチップと並びは src/lib/waitlist_fields.js が唯一の出所',
  );
  assert.ok(step2.querySelector('[name="nutrients_other"]'), 'ステップ2に nutrients_other がありません');
  assert.ok(step2.querySelector('[name="requests"]'), 'ステップ2に requests がありません');
});

test('🔒 ステップ2を必須にしない（required を付けない）', PENDING, () => {
  const root = tree(renderWaitlist());
  const step2 = stepTwoForm(root);
  const required = inputControls(step2).filter((el) => el.required);

  assert.deepEqual(
    required.map((el) => el.name),
    [],
    'ステップ2の入力が必須になっています。ステップ1の送信時点で登録は成立している',
  );
});

test('🔒 入力欄の name が保存列の範囲を超えていない（列を増やさない）', () => {
  const root = tree(renderWaitlist());
  for (const name of fieldNames(root)) {
    assert.ok(
      ALLOWED_FIELD_NAMES.has(name),
      `入力欄 "${name}" は保存列にありません。取得項目を増やさない`,
    );
  }
});

test('🔒 年齢・性別・体調・服薬を取る入力欄が無い', () => {
  const html = renderWaitlist().toLowerCase();
  for (const forbidden of FORBIDDEN_FIELD_NAMES) {
    assert.ok(
      !html.includes(`name="${forbidden}"`),
      `要配慮な項目 "${forbidden}" の入力欄があります`,
    );
  }
});

test('🔒 どのフォームも別ページへ送信しない（action / target を持たない）', () => {
  const root = tree(renderWaitlist());
  for (const form of root.querySelectorAll('form')) {
    assert.ok(
      !form.hasAttribute('action'),
      `フォームに action="${form.getAttribute('action')}" が付いています。同一ページ内で完結させる`,
    );
    assert.ok(!form.hasAttribute('target'), 'フォームに target が付いています');
  }
});

test('🔒 自由記述の maxlength は waitlist_fields.js の値と一致する', () => {
  const root = tree(renderWaitlist());
  const requests = root.querySelector('[name="requests"]');
  assert.ok(requests, '自由記述（requests）が見つかりません');
  assert.equal(
    Number(requests.getAttribute('maxlength')),
    REQUESTS_MAX,
    '画面の maxlength と Worker の切り詰めが食い違うと「入力できたのに保存されない」になる',
  );
});

/* ======================================================================== */
/* 完了条件7: 禁止語                                                        */
/* ======================================================================== */

test('完了条件7: 🔒 禁止語が待機リストの出力に含まれていない', () => {
  for (const [locale, t] of [
    ['ja', tJa],
    ['en', tEn],
  ]) {
    const html = renderWaitlist(t);
    for (const banned of BANNED_WORDS) {
      assert.ok(!html.includes(banned), `${locale}: 禁止語「${banned}」が待機リストの出力にあります`);
    }
  }
});

/* ======================================================================== */
/* ブラウザ相当の実行（src/assets/lp.js）                                    */
/* ======================================================================== */

/** ステップ1だけを送る。到達したところで止める */
async function runStepOne(options = {}) {
  const dom = await runLpScript(renderWaitlist(), options);
  const stepOne = stepOneForm(dom.body);
  const email = stepOne.querySelector('input[name="email"]');
  assert.ok(email, 'ステップ1にメールアドレスの入力欄がありません');

  email.focus();
  email.value = TEST_EMAIL;

  const beforeSubmit = dom.events().length;
  const submit = new DomEvent('submit');
  stepOne.dispatchEvent(submit);
  await dom.flush();

  return { dom, stepOne, submit, beforeSubmit, afterStepOne: dom.events().length };
}

/** ステップ2まで送る */
async function runStepTwo(options = {}) {
  const state = await runStepOne(options);
  const { dom } = state;
  const step2 = stepTwoForm(dom.body);

  const chip = step2.querySelector('input[name="nutrients"][value="creatine"]');
  assert.ok(chip, 'ステップ2に creatine のチップがありません');
  chip.checked = true;

  const channel = step2.querySelector('input[name="channel"][value="rakuten"]');
  assert.ok(channel, 'ステップ2に rakuten のチップがありません');
  channel.checked = true;

  step2.querySelector('[name="nutrients_other"]').value = NUTRIENTS_OTHER_INPUT;
  step2.querySelector('[name="requests"]').value = REQUESTS_INPUT;

  const submit = new DomEvent('submit');
  step2.dispatchEvent(submit);
  await dom.flush();

  return { ...state, step2, stepTwoSubmit: submit, afterStepTwo: dom.events().length };
}

test('完了条件2: ステップ1の送信だけで /api/waitlist へ登録が飛ぶ（ステップ2に進まなくてよい）', async () => {
  const { dom, stepOne, submit } = await runStepOne();

  assert.equal(dom.fetchCalls.length, 1, `送信が ${dom.fetchCalls.length} 回です（1回であるべき）`);
  const [call] = dom.fetchCalls;
  assert.equal(call.method, 'POST');
  assert.ok(call.url.startsWith('/api/waitlist'), `送信先が ${call.url} です`);
  assert.equal(call.body.email, TEST_EMAIL);

  assert.ok(submit.defaultPrevented, '🔒 送信で既定の遷移が止まっていません');
  assert.equal(dom.navigations.length, 0, '🔒 送信後に別ページへ飛んでいます');
  assert.equal(stepOne.hidden, true, 'ステップ1のフォームが隠れていません');
  assert.equal(doneRegion(dom.body).hidden, false, '完了状態が表示されていません');
});

test('完了条件2: 送信に失敗したときは完了状態に切り替えない', async () => {
  const { dom, stepOne } = await runStepOne({ respond: () => ({ reject: true }) });

  assert.equal(stepOne.hidden, false, '失敗したのにフォームが隠れています');
  assert.equal(doneRegion(dom.body).hidden, true, '失敗したのに完了状態が出ています');
  assert.equal(dom.navigations.length, 0, '🔒 別ページへ飛んでいます');
});

test('完了条件3: ステップ2の送信が、ステップ1と同じメールアドレスを載せて飛ぶ', PENDING, async () => {
  const { dom, stepTwoSubmit } = await runStepTwo();

  assert.equal(dom.fetchCalls.length, 2, `送信が ${dom.fetchCalls.length} 回です（2回であるべき）`);
  const [first, second] = dom.fetchCalls;

  assert.ok(second.url.startsWith('/api/waitlist'), `ステップ2の送信先が ${second.url} です`);
  assert.equal(second.method, 'POST');
  assert.equal(
    second.body.email,
    first.body.email,
    '🔒 ステップ2が別のメールアドレスで飛んでいます。同一レコードへの追記にならない',
  );
  assert.ok(stepTwoSubmit.defaultPrevented, '🔒 ステップ2の送信で既定の遷移が止まっていません');
  assert.equal(dom.navigations.length, 0, '🔒 ステップ2の送信後に別ページへ飛んでいます');
});

test('完了条件3: ステップ2の送信に、入力した3項目が載っている', PENDING, async () => {
  const { dom } = await runStepTwo();
  const body = dom.fetchCalls[1].body;

  const nutrients = Array.isArray(body.nutrients) ? body.nutrients : [body.nutrients];
  const channel = Array.isArray(body.channel) ? body.channel : [body.channel];
  assert.ok(nutrients.includes('creatine'), `見たい成分が送られていません（${JSON.stringify(body.nutrients)}）`);
  assert.ok(channel.includes('rakuten'), `購入先が送られていません（${JSON.stringify(body.channel)}）`);
  assert.equal(body.nutrients_other, NUTRIENTS_OTHER_INPUT);
  assert.equal(body.requests, REQUESTS_INPUT);
});

test('完了条件4: ステップ2への到達が、それまでに無い GA4 イベントとして送られる', PENDING, async () => {
  const { dom, beforeSubmit, afterStepOne } = await runStepOne();
  const events = dom.events();

  const before = new Set(events.slice(0, beforeSubmit).map((one) => one.name));
  // ステップ1の成功そのものを表す waitlist_submit は「到達」ではない
  before.add('waitlist_submit');
  const reached = events
    .slice(beforeSubmit, afterStepOne)
    .map((one) => one.name)
    .filter((name) => !before.has(name));

  assert.ok(
    reached.length > 0,
    'ステップ2に到達したことを表す GA4 イベントがありません。' +
      '到達数と送信数を別々に数えられるようにする（完了条件4）',
  );
  assert.equal(
    new Set(reached).size,
    reached.length,
    `到達のイベントが重複して送られています（${reached.join(' / ')}）`,
  );
});

test('完了条件4: ステップ2の送信が、到達とは別の GA4 イベントとして送られる', PENDING, async () => {
  const { dom, afterStepOne, afterStepTwo } = await runStepTwo();
  const events = dom.events();

  const seenBefore = new Set(events.slice(0, afterStepOne).map((one) => one.name));
  const sent = events
    .slice(afterStepOne, afterStepTwo)
    .map((one) => one.name)
    .filter((name) => !seenBefore.has(name));

  assert.ok(
    sent.length > 0,
    'ステップ2の送信を表す GA4 イベントがありません（到達と同じ名前では数を分けられない）',
  );
});

test('完了条件4: 🔒 GA4 に自由記述の本文とメールアドレスを送らない（0/1 だけ）', PENDING, async () => {
  const { dom, afterStepOne } = await runStepTwo();
  const events = dom.events();

  for (const { name, params } of events) {
    const dumped = JSON.stringify(params);
    assert.ok(
      !dumped.includes(SENTINEL),
      `GA4 イベント ${name} に自由記述の本文が含まれています: ${dumped}`,
    );
    assert.ok(!dumped.includes(TEST_EMAIL), `GA4 イベント ${name} にメールアドレスが含まれています`);
  }

  const flags = events
    .slice(afterStepOne)
    .flatMap(({ params }) => Object.values(params))
    .filter((value) => value === 0 || value === 1);
  assert.ok(
    flags.includes(1),
    '自由記述が「書かれたかどうか」の 0/1 で数えられていません' +
      '（既存の has_nutrients_other / has_requests と同じ形にする）',
  );
});

// ステップ1だけの経路でも見る（回帰の見張り。ステップ2の実装前から通っていること）
test('🔒 GA4 にメールアドレスを送らない（ステップ1の経路）', async () => {
  const { dom } = await runStepOne();
  for (const { name, params } of dom.events()) {
    assert.ok(
      !JSON.stringify(params).includes(TEST_EMAIL),
      `GA4 イベント ${name} にメールアドレスが含まれています`,
    );
  }
});

/* ======================================================================== */
/* Worker 側: 同一レコードへの追記と、列が増えていないこと                   */
/* ======================================================================== */

/**
 * D1 と静的アセットの偽物。実行された SQL とバインド値を記録する。
 * tests/worker.test.js と同じ組み立て方（テストファイルは import すると
 * 中のテストごと走ってしまうので、共有せず写してある）。
 */
function makeEnv() {
  const writes = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async run() {
                writes.push({ sql, args });
                return { success: true };
              },
            };
          },
        };
      },
    },
    ASSETS: {
      async fetch() {
        return new Response('asset', { status: 200 });
      },
    },
  };
  return { env, writes };
}

const post = (body, path = '/api/waitlist') =>
  new Request(`https://pergram.example${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** 既存の行を狙う書き込みか（新しい行を作らないか） */
function targetsExistingRow(sql) {
  const flat = sql.replace(/\s+/g, ' ').trim().toUpperCase();
  return /ON CONFLICT\s*\(\s*EMAIL\s*\)/.test(flat) || /^UPDATE\s+WAITLIST\b.*WHERE.*EMAIL/.test(flat);
}

test('完了条件2: メールアドレスだけの送信でレコードが作られる', async () => {
  const { env, writes } = makeEnv();
  const res = await worker.fetch(post({ email: TEST_EMAIL }), env);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(writes.length, 1, 'ステップ1の送信でレコードが作られていません');
  assert.equal(writes[0].args.length, STORED_COLUMNS.length, '🔒 保存列が6つではありません');
  assert.equal(writes[0].args[0], TEST_EMAIL);
});

test('完了条件3: 🔒 ステップ2の送信は既存の行を狙う（新しい行を作らない）', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(post({ email: TEST_EMAIL }), env);
  await worker.fetch(
    post({
      email: TEST_EMAIL,
      nutrients: ['creatine'],
      channel: ['rakuten'],
      nutrients_other: NUTRIENTS_OTHER_INPUT,
      requests: REQUESTS_INPUT,
    }),
    env,
  );

  assert.equal(writes.length, 2, `書き込みが ${writes.length} 回です（2回であるべき）`);
  const second = writes[1];
  assert.ok(
    targetsExistingRow(second.sql),
    '🔒 ステップ2の書き込みが既存の行を狙っていません（email をキーにした UPSERT か UPDATE であること）',
  );
  assert.ok(
    second.args.includes(TEST_EMAIL),
    'ステップ2の書き込みにメールアドレスがバインドされていません',
  );
});

test('完了条件3: ステップ2で送った3項目が保存の引数に載る', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(
    post({
      email: TEST_EMAIL,
      nutrients: ['creatine', 'hmb'],
      channel: ['rakuten'],
      nutrients_other: NUTRIENTS_OTHER_INPUT,
      requests: REQUESTS_INPUT,
    }),
    env,
  );

  const dumped = JSON.stringify(writes[0].args);
  for (const expected of ['creatine,hmb', 'rakuten', NUTRIENTS_OTHER_INPUT, REQUESTS_INPUT]) {
    assert.ok(dumped.includes(expected), `保存の引数に ${expected} がありません`);
  }
});

test('🔒 スキーマの waitlist テーブルの列が6つのままである', async () => {
  const schema = await readFile('worker/schema.sql', 'utf8');
  const block = schema.match(/CREATE TABLE IF NOT EXISTS waitlist\s*\(([\s\S]*?)\n\);/i);
  assert.ok(block, 'worker/schema.sql に waitlist テーブルの定義が見つかりません');

  const columns = block[1]
    .split('\n')
    .map((line) => line.replace(/--.*/, '').trim())
    .filter(Boolean)
    .map((line) => line.split(/[\s(,]/)[0].toLowerCase())
    .filter((name) => /^[a-z_]+$/.test(name) && !['primary', 'unique', 'foreign', 'check'].includes(name));

  assert.deepEqual(columns, STORED_COLUMNS, '🔒 保存列が変わっています');
});

test('🔒 移行 SQL が保存列の外に列を足していない', async () => {
  const dir = 'worker/migrations';
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql'));
  for (const file of files) {
    // コメント行に書かれた説明（「ADD COLUMN IF NOT EXISTS は無い」など）を拾わない
    const sql = (await readFile(`${dir}/${file}`, 'utf8'))
      .split('\n')
      .map((line) => line.replace(/--.*/, ''))
      .join('\n');
    for (const [, column] of sql.matchAll(/ADD COLUMN\s+([\w]+)/gi)) {
      assert.ok(
        STORED_COLUMNS.includes(column.toLowerCase()),
        `${file}: 保存列にない列 "${column}" を足しています`,
      );
    }
  }
});

/**
 * T-070 / R-1 の単体テスト — **送りきれなかったアンケートの回答を落とさない。**
 *
 * === なぜ要るのか（レビュー R-1 とオーケストレーターの裁定、2026-09-08） ===
 * アンケートの段は送信後に `settled` になり、開き直せない（T-053 B-5b）。
 * つまり撃ちっぱなしで失敗すると、**そのページ内に再送の機会が一切なく、
 * 回答がそのまま失われる。** T-062 が押下について直したのと同じ壊れ方で、
 * ここで失われるのは押下の数ではなく**回答そのもの**である。
 *
 * === 出荷箱（outbox）方式 ===
 * 送る前に localStorage へ控え、**受領できた時点で消す。**
 * 🔒 控えは永続的な記録ではない。受領・恒久的な拒否（4xx）のどちらかで必ず消える。
 * 🔒 通信断と 5xx では消さない。次の訪問で送り直す
 *    （移行前にコードが出た窓では 503 が返る。docs/ops/deploy.md §3）。
 * 🔒 控えの中身をコードで解釈しない（N-01 / N-05）。形を整えるのは、受け口が
 *    キー集合ちょうど一致でしか受け取らないためであって、検閲ではない。
 * 🔒 控えにメールアドレスを入れない。この経路は匿名である。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTranslator } from '../src/lib/i18n.js';
import { requestCta, requestFlow } from '../src/templates/request.js';
import { market } from './fixtures.js';
import { DomEvent, runLpScript } from './mini_dom.js';

const SCRIPT = 'src/assets/request.js';
const SURVEY_PATH = '/api/request-survey';
const SIGNAL_STORAGE_KEY = 'pergram.request_signal_id';
const SIGNAL_ACK_KEY = 'pergram.request_signal_ack';
const OUTBOX_KEY = 'pergram.request_survey_outbox';

const BROWSER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const PAGE_ID = 'ja:protein';
const REQUESTS_INPUT = '送料込みで並べたい';

const t = await loadTranslator('ja');

const page = () => `${requestCta(t, { location: 'products_request_top' })}
${requestFlow(t, { support: market.support, page: PAGE_ID })}`;

const surveyCalls = (dom) => dom.fetchCalls.filter((call) => call.url.includes(SURVEY_PATH));

/** 押して答えて送るところまで進める。受領済みのブラウザなので押下は飛ばない */
async function answerOnce({ respond, storage = {} } = {}) {
  const dom = await runLpScript(page(), {
    scriptPath: SCRIPT,
    storage: { [SIGNAL_STORAGE_KEY]: BROWSER_ID, [SIGNAL_ACK_KEY]: BROWSER_ID, ...storage },
    respond,
  });

  dom.body.querySelectorAll('[data-request-cta]')[0].dispatchEvent(new DomEvent('click'));
  await dom.flush();

  const form = dom.body.querySelector('[data-request-survey]');
  form.querySelector('input[name="nutrients"][value="creatine"]').checked = true;
  form.querySelector('[name="requests"]').value = REQUESTS_INPUT;
  form.dispatchEvent(new DomEvent('submit'));
  await dom.flush();

  return dom;
}

/** 1つ目の DOM の localStorage を引き継いで、次の訪問を始める（読み込むだけ） */
async function revisit(previous, { respond } = {}) {
  const dom = await runLpScript(page(), {
    scriptPath: SCRIPT,
    storage: Object.fromEntries(previous.storageData),
    respond,
  });
  await dom.flush();
  return dom;
}

const failed = () => ({ ok: false, status: 503 });
const received = () => ({ ok: true, status: 204 });

/* ---- 控える・送り直す ------------------------------------------------ */

test('送信に失敗した回答は控えに残り、次の訪問で送り直される', async () => {
  const first = await answerOnce({ respond: failed });
  assert.ok(
    first.storageData.get(OUTBOX_KEY),
    '🔒 送れなかった回答が控えられていない。そのページ内に再送の機会は無く、回答は失われる',
  );

  const second = await revisit(first, { respond: received });
  const calls = surveyCalls(second);
  assert.equal(calls.length, 1, '🔒 次の訪問で送り直していない');
  assert.equal(calls[0].body.id, BROWSER_ID, '押下と違う識別子で送り直している');
  assert.deepEqual(calls[0].body.nutrients, ['creatine']);
  assert.equal(calls[0].body.requests, REQUESTS_INPUT, '控えた回答の中身が変わっている');
  assert.deepEqual(
    Object.keys(calls[0].body).sort(),
    ['channel', 'id', 'nutrients', 'nutrients_other', 'requests'],
    '🔒 送り直しの本文のキーが契約と違う。受け口はちょうど一致でしか受け取らない',
  );
});

test('受領できたら控えは消え、次の訪問では何も送らない', async () => {
  const first = await answerOnce({ respond: received });
  assert.equal(
    first.storageData.get(OUTBOX_KEY),
    undefined,
    '🔒 受領できたのに控えが残っている。控えを永続的な記録にしない',
  );

  const second = await revisit(first, { respond: received });
  assert.equal(surveyCalls(second).length, 0, '受領済みの回答をもう一度送っている');
});

test('送り直しが受領されたら控えは消える', async () => {
  const first = await answerOnce({ respond: failed });
  const second = await revisit(first, { respond: received });

  assert.equal(
    second.storageData.get(OUTBOX_KEY),
    undefined,
    '🔒 送り直しが通ったのに控えが残っている',
  );
});

/* ---- 消してよいのは受領と恒久的な拒否だけ ---------------------------- */

test('通信が切れたときは控えを消さない', async () => {
  const dom = await answerOnce({ respond: () => ({ reject: true }) });

  assert.ok(
    dom.storageData.get(OUTBOX_KEY),
    '🔒 通信断で控えを捨てている。次の訪問で送り直せば入る回答である',
  );
});

test('503 でも控えを消さない（移行前のデプロイの窓で失われる）', async () => {
  const dom = await answerOnce({ respond: failed });

  assert.ok(dom.storageData.get(OUTBOX_KEY), '🔒 5xx で控えを捨てている');
});

test('400 なら控えを消す（同じ本文は何度送っても通らない）', async () => {
  const first = await answerOnce({ respond: () => ({ ok: false, status: 400 }) });
  assert.equal(
    first.storageData.get(OUTBOX_KEY),
    undefined,
    '受け付けられない本文を抱え続けると、訪問のたびに無駄な送信が走る',
  );

  const second = await revisit(first, { respond: received });
  assert.equal(surveyCalls(second).length, 0);
});

/* ---- 壊れた控え ------------------------------------------------------- */

test('読めない控えは消して、何も送らない', async () => {
  const dom = await runLpScript(page(), {
    scriptPath: SCRIPT,
    storage: { [SIGNAL_STORAGE_KEY]: BROWSER_ID, [OUTBOX_KEY]: '{壊れた' },
    respond: received,
  });
  await dom.flush();

  assert.equal(surveyCalls(dom).length, 0, '読めない控えを投げている');
  assert.equal(dom.storageData.get(OUTBOX_KEY), undefined, '読めない控えを抱え続けている');
});

test('識別子を持たない控えは消して、何も送らない', async () => {
  const dom = await runLpScript(page(), {
    scriptPath: SCRIPT,
    storage: { [OUTBOX_KEY]: JSON.stringify({ nutrients: ['creatine'] }) },
    respond: received,
  });
  await dom.flush();

  assert.equal(surveyCalls(dom).length, 0);
  assert.equal(dom.storageData.get(OUTBOX_KEY), undefined);
});

test('形の崩れた控えはキー集合を揃えて送る（中身は解釈しない）', async () => {
  const dom = await runLpScript(page(), {
    scriptPath: SCRIPT,
    storage: {
      [OUTBOX_KEY]: JSON.stringify({ id: BROWSER_ID, requests: REQUESTS_INPUT }),
    },
    respond: received,
  });
  await dom.flush();

  const calls = surveyCalls(dom);
  assert.equal(calls.length, 1);
  assert.deepEqual(
    Object.keys(calls[0].body).sort(),
    ['channel', 'id', 'nutrients', 'nutrients_other', 'requests'],
    '🔒 キーが足りない控えをそのまま投げている。受け口は 400 で捨て、永久に通らない',
  );
  assert.equal(calls[0].body.requests, REQUESTS_INPUT, '🔒 自由記述の中身に手を入れている');
  assert.deepEqual(calls[0].body.nutrients, []);
  assert.equal(calls[0].body.nutrients_other, null);
});

/* ---- 🔒 控えにメールアドレスを入れない -------------------------------- */

test('🔒 メールアドレスの段まで進めても、控えにメールアドレスが入らない', async () => {
  const dom = await answerOnce({ respond: failed });

  const emailForm = dom.body.querySelector('[data-request-email]');
  emailForm.querySelector('input[type="email"]').value = 'request@example.com';
  emailForm.dispatchEvent(new DomEvent('submit'));
  await dom.flush();

  const outbox = dom.storageData.get(OUTBOX_KEY) || '';
  assert.ok(!outbox.includes('request@example.com'), '🔒 控えにメールアドレスが混ざっている');
  assert.ok(!/mail/i.test(outbox), '🔒 控えがメールアドレスの器を持っている');
  for (const [key, value] of dom.storageData) {
    assert.ok(
      !String(value).includes('request@example.com'),
      `🔒 localStorage の ${key} にメールアドレスが入っている`,
    );
  }
});

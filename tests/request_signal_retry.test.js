/**
 * T-062 の受け入れテスト（実装担当が実装より先に書いた分）。
 * 「一度でも送信に失敗したブラウザが、二度と押下を記録できない」の修正を固定する。
 *
 * === 何が壊れていたか ===
 * `sendRequestSignal()` は識別子を **送信の前** に localStorage へ書き、次からは
 * 「書いてあるなら送らない」と判定していた。最初の1回が失敗（400 / 503 / 通信断）した
 * ブラウザは、以後 何度押しても1行も残さない。**画面の反応は成功時と同じ**なので、
 * 押した人にも運用側にも失敗が伝わらない。
 *
 * === この修正の契約 ===
 *   識別子      `pergram.request_signal_id`   送信の**前**に保存する（従来どおり）
 *   受領の確認  `pergram.request_signal_ack`  サーバが受け取った応答を見てから保存する
 *
 * 送るかどうかは「識別子があるか」ではなく **「受領の確認が取れているか」** で決める。
 *
 * 🔒 送り直しは**必ず同じ識別子**で行う。新しい UUID を作ると、同じブラウザが
 *    2人に見える（受け口は `INSERT OR IGNORE` なので、同じ id なら行は増えない）。
 * 🔒 識別子の保存を送信の後へ動かさない。応答が返らなかった回が次回に別の UUID で
 *    数え直され、やはり同じブラウザが2人になる（T-051 の 🔒 の理由）。
 * 🔒 送信の成否をユーザーへ見せない。**成否によらずアンケートの段は必ず開く。**
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadTranslator } from '../src/lib/i18n.js';
import { requestCta, requestFlow } from '../src/templates/request.js';
import { market } from './fixtures.js';
import { DomEvent, runLpScript } from './mini_dom.js';

const t = await loadTranslator('ja');

const SCRIPT = 'src/assets/request.js';
const SIGNAL_ENDPOINT = '/api/request-signal';

/** 識別子の置き場。**既存のブラウザが持っている鍵なので名前を変えない** */
const SIGNAL_STORAGE_KEY = 'pergram.request_signal_id';
/** 受領の確認の置き場（T-062 で足した） */
const SIGNAL_ACK_KEY = 'pergram.request_signal_ack';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 「PO の手元のブラウザ」— 既に識別子だけを持っている状態を作るための値 */
const EXISTING_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const PAGE_ID = 'ja:protein';

function page() {
  return `${requestCta(t, { location: 'products_request_top' })}
${requestCta(t, { location: 'products_request_bottom' })}
${requestFlow(t, { support: market.support, page: PAGE_ID })}`;
}

const signalCalls = (dom) => dom.fetchCalls.filter((call) => call.url.includes(SIGNAL_ENDPOINT));

/**
 * 要望ボタンを1つ押したところまで進める。
 *
 * @param {object} [options] runLpScript へ渡す（`storage` / `respond`）
 * @param {(dom: object) => void} [options.beforeClick] 押す直前に環境をいじる
 */
async function click({ beforeClick, ...options } = {}) {
  const dom = await runLpScript(page(), { scriptPath: SCRIPT, ...options });
  if (beforeClick) beforeClick(dom);

  const buttons = dom.body.querySelectorAll('[data-request-cta]');
  assert.ok(buttons.length > 0, '要望ボタンが無い');
  buttons[0].dispatchEvent(new DomEvent('click'));
  await dom.flush();

  return {
    dom,
    signals: signalCalls(dom),
    survey: dom.body.querySelector('[data-request-step="survey"]'),
  };
}

/** 受け口が 400 を返す（T-058 のデプロイの窓で実際に起きた形） */
const rejects400 = { respond: () => ({ ok: false, status: 400 }) };
/** 通信そのものが切れる */
const networkDown = { respond: () => ({ reject: true }) };
/** 受け口が受け取った（本番は 204 No Content） */
const accepts204 = { respond: () => ({ ok: true, status: 204 }) };

/* ====================================================================== */
/* A-1: 確認が取れていないブラウザは、次の押下で送り直す                     */
/* ====================================================================== */

test('A-1 識別子はあるが受領の確認が無いブラウザは、次の押下で送り直す', async () => {
  const { signals } = await click({
    storage: { [SIGNAL_STORAGE_KEY]: EXISTING_UUID },
    ...accepts204,
  });

  assert.equal(
    signals.length,
    1,
    '識別子だけを持つブラウザ（PO の手元がこの状態）が送り直していない。' +
      '一度失敗したブラウザは永久に1行も残せないままになる',
  );
});

test('A-1 400 で失敗した回は受領の確認を残さないので、次の押下でまた送る', async () => {
  const first = await click(rejects400);
  assert.equal(first.signals.length, 1, '初回の押下で送っていない');
  assert.equal(
    first.dom.storageData.get(SIGNAL_ACK_KEY),
    undefined,
    '400 を受け取ったのに受領の確認を保存している',
  );

  // 同じブラウザの次の閲覧。localStorage の中身を引き継ぐ
  const second = await click({
    storage: Object.fromEntries(first.dom.storageData),
    ...accepts204,
  });
  assert.equal(second.signals.length, 1, '失敗した次の押下で送り直していない');
});

test('A-1 通信が切れた回も受領の確認を残さない', async () => {
  const { dom, signals } = await click(networkDown);

  assert.equal(signals.length, 1, '押下で送っていない');
  assert.equal(
    dom.storageData.get(SIGNAL_ACK_KEY),
    undefined,
    '送信が拒否されたのに受領の確認を保存している',
  );
});

/* ====================================================================== */
/* A-2: 確認が取れたブラウザは、以後 送らない                               */
/* ====================================================================== */

test('A-2 受領の確認があるブラウザは押しても送らない', async () => {
  const { signals } = await click({
    storage: { [SIGNAL_STORAGE_KEY]: EXISTING_UUID, [SIGNAL_ACK_KEY]: EXISTING_UUID },
    ...accepts204,
  });

  assert.equal(
    signals.length,
    0,
    '🔒 確認の取れたブラウザが送り直している。同じブラウザが何人にも見える',
  );
});

test('A-2 成功した押下の後は受領の確認が残り、次の閲覧では送らない', async () => {
  const first = await click(accepts204);
  assert.equal(first.signals.length, 1, '初回の押下で送っていない');

  const id = first.signals[0].body.id;
  assert.match(String(id), UUID_V4, 'id が UUID v4 でない');
  assert.equal(
    first.dom.storageData.get(SIGNAL_ACK_KEY),
    id,
    '🔒 受領の確認は「どの識別子が受け取られたか」で残す。' +
      '別の識別子に振り替わったときに古い確認で黙らせないため',
  );

  const second = await click({
    storage: Object.fromEntries(first.dom.storageData),
    ...accepts204,
  });
  assert.equal(second.signals.length, 0, '確認が取れているのに次の閲覧でも送っている');
});

/* ====================================================================== */
/* A-3: 送り直しで新しい識別子を作らない                                    */
/* ====================================================================== */

test('A-3 送り直しは保存済みと同じ識別子で行う', async () => {
  const { dom, signals } = await click({
    storage: { [SIGNAL_STORAGE_KEY]: EXISTING_UUID },
    ...accepts204,
  });

  assert.equal(signals.length, 1, '送り直していない');
  assert.equal(
    signals[0].body.id,
    EXISTING_UUID,
    '🔒 送り直しで新しい識別子を作っている。1つのブラウザが生涯に持つ識別子は1つだけ',
  );
  assert.equal(
    dom.storageData.get(SIGNAL_STORAGE_KEY),
    EXISTING_UUID,
    '🔒 保存済みの識別子を書き換えている',
  );
});

test('A-3 送り直しの本文も { id, page } ちょうどである', async () => {
  const { signals } = await click({
    storage: { [SIGNAL_STORAGE_KEY]: EXISTING_UUID },
    ...accepts204,
  });

  assert.deepEqual(
    Object.keys(signals[0].body).sort(),
    ['id', 'page'],
    '🔒 送信本文のキーが {id, page} でない。受け口はキー集合ちょうど一致で 400 にする',
  );
  assert.equal(signals[0].body.page, PAGE_ID, 'どのページで押されたかが違う');
});

test('A-3 識別子は送信の前に保存する（応答が返らなくても残る）', async () => {
  const { dom, signals } = await click(networkDown);

  assert.equal(signals.length, 1, '押下で送っていない');
  assert.equal(
    dom.storageData.get(SIGNAL_STORAGE_KEY),
    signals[0].body.id,
    '🔒 識別子の保存が送信の後になっている。応答が返らなかった回が次回に別の UUID で' +
      '数え直され、同じブラウザが2人に見える',
  );
});

/* ====================================================================== */
/* A-4: localStorage が例外を投げる環境で導線が止まらない                   */
/* ====================================================================== */

/** プライベートモード等。**触るだけで投げる** */
function breakStorage(dom) {
  dom.window.localStorage = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('SecurityError');
    },
    removeItem() {
      throw new Error('SecurityError');
    },
  };
}

test('A-4 localStorage が例外を投げてもアンケートの段は開く', async () => {
  const { survey, dom } = await click({ beforeClick: breakStorage, ...accepts204 });

  assert.equal(survey.hidden, false, 'localStorage が使えないと段が開かない');
  assert.equal(dom.navigations.length, 0, '🔒 別ページへ飛んでいる');
});

test('A-4 localStorage が例外を投げても押下は送られる', async () => {
  const { signals } = await click({ beforeClick: breakStorage, ...accepts204 });

  assert.equal(signals.length, 1, 'localStorage が使えないと押下を1行も残せない');
});

/* ====================================================================== */
/* A-5: crypto.randomUUID() が無い環境で独自の疑似乱数を作らない            */
/* ====================================================================== */

test('A-5 randomUUID が無い環境では送らない（独自の疑似乱数を作らない）', async () => {
  const { signals, survey } = await click({
    beforeClick: (dom) => {
      dom.window.crypto = undefined;
    },
    ...accepts204,
  });

  assert.equal(
    signals.length,
    0,
    '🔒 randomUUID が無い環境で識別子を自作している。衝突すればサーバ側で1行に潰れ、' +
      '「何人が意思表示したか」が静かに目減りする',
  );
  assert.equal(survey.hidden, false, '識別子を作れないと段が開かない');
});

test('A-5 randomUUID が無くても、保存済みの識別子があれば送り直せる', async () => {
  const { signals } = await click({
    storage: { [SIGNAL_STORAGE_KEY]: EXISTING_UUID },
    beforeClick: (dom) => {
      dom.window.crypto = undefined;
    },
    ...accepts204,
  });

  assert.equal(signals.length, 1, '保存済みの識別子があるのに送り直していない');
  assert.equal(signals[0].body.id, EXISTING_UUID, '保存済みと違う識別子を送っている');
});

/* ====================================================================== */
/* 導線は送信の結果に依存しない（既存 🔒 の回帰）                           */
/* ====================================================================== */

for (const [name, options] of [
  ['400 が返っても', rejects400],
  ['通信が切れても', networkDown],
  ['受け取られても', accepts204],
]) {
  test(`${name}アンケートの段は必ず開く`, async () => {
    const { survey } = await click({
      storage: { [SIGNAL_STORAGE_KEY]: EXISTING_UUID },
      ...options,
    });
    assert.equal(survey.hidden, false, `${name}段が開かない`);
  });
}

test('同じページで2回押しても送信は1回だけ（送り直しの場合も）', async () => {
  const dom = await runLpScript(page(), {
    scriptPath: SCRIPT,
    storage: { [SIGNAL_STORAGE_KEY]: EXISTING_UUID },
    ...rejects400,
  });

  for (const button of dom.body.querySelectorAll('[data-request-cta]')) {
    button.dispatchEvent(new DomEvent('click'));
    await dom.flush();
  }

  assert.equal(signalCalls(dom).length, 1, '同じページ内で複数回送っている');
});

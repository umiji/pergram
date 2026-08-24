/**
 * Worker の振り分けと待機リストの受け口。
 *
 * D1 は差し替えて、**何が保存されるか**を機械的に検査する。
 * 🔒 保存してよいのは email / nutrients / channel / nutrients_other / requests /
 *    created_at の6つだけ。年齢・性別・体調・服薬は送られてきても保存しない。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUESTS_MAX } from '../src/lib/waitlist_fields.js';
import { SITE_ORIGIN } from '../src/lib/site.js';

import worker from '../worker/index.js';

/**
 * D1 と静的アセットの偽物。実行された SQL とバインド値を記録する。
 * @param {{ failWrite?: boolean }} [options]
 */
function makeEnv({ failWrite = false } = {}) {
  const writes = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async run() {
                if (failWrite) throw new Error('D1_ERROR: connection lost');
                writes.push({ sql, args });
                return { success: true };
              },
            };
          },
        };
      },
    },
    ASSETS: {
      async fetch(request) {
        return new Response('asset', { status: 200, headers: { 'x-from': new URL(request.url).pathname } });
      },
    },
  };
  return { env, writes };
}

const post = (body) =>
  new Request('https://pergram.example/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** 保存列の数。増やすときは schema.sql と worker/migrations/ を必ず揃える */
const STORED_COLUMNS = 6;

test('待機リストの登録は 200 を返し、決まった数の値だけを保存する', async () => {
  const { env, writes } = makeEnv();
  const res = await worker.fetch(
    post({
      email: 'a@example.com',
      nutrients: ['creatine'],
      channel: ['yahoo', 'rakuten'],
      nutrients_other: 'グルタミン',
      requests: '送料込みで並べたい',
    }),
    env,
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].args.length, STORED_COLUMNS);
  assert.deepEqual(writes[0].args.slice(0, 5), [
    'a@example.com',
    'creatine',
    // 購入先も複数選択。成分と同じくカンマ区切りの1列に収める（列は増やさない）
    'yahoo,rakuten',
    'グルタミン',
    '送料込みで並べたい',
  ]);
});

// 配信済みの LP がブラウザにキャッシュされている間、channel は文字列で届く。
// 黙って捨てると「登録できたのに購入先だけ空」になる。
test('購入先が単一の文字列で届いても受け取る', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(post({ email: 'a@example.com', channel: 'yahoo' }), env);

  assert.equal(writes[0].args[2], 'yahoo');
});

test('同じ選択肢を2度送っても1度しか保存しない', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(
    post({
      email: 'a@example.com',
      nutrients: ['creatine', 'creatine'],
      channel: ['yahoo', 'yahoo', 'rakuten'],
    }),
    env,
  );

  assert.equal(writes[0].args[1], 'creatine');
  assert.equal(writes[0].args[2], 'yahoo,rakuten');
});

test('自由記述は空欄なら null で保存し、上限を超えたら切る', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(
    post({ email: 'a@example.com', nutrients_other: '   ', requests: 'あ'.repeat(REQUESTS_MAX + 50) }),
    env,
  );

  const [, , , nutrientsOther, requests] = writes[0].args;
  assert.equal(nutrientsOther, null, '空白だけの入力は null にする');
  assert.equal(requests.length, REQUESTS_MAX);
});

test('🔒 年齢・体調など許可していない項目は保存しない', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(
    post({ email: 'a@example.com', age: 30, sex: 'male', condition: '疲れやすい', medication: 'なし' }),
    env,
  );

  // 最後は created_at のタイムスタンプ。時計から作られる文字列に部分一致をかけると、
  // 秒が 30 の瞬間に年齢「30」と一致して落ちる。検査するのは入力由来の列に限る。
  const args = writes[0].args;
  const createdAt = args[args.length - 1];

  const stored = JSON.stringify(args.slice(0, -1));
  for (const leaked of ['30', 'male', '疲れやすい', 'なし']) {
    assert.ok(!stored.includes(leaked), `保存してはいけない値「${leaked}」がバインドされています`);
  }
  // 列が増えていないことを見る。最後が時刻であることも確かめる
  assert.equal(args.length, STORED_COLUMNS);
  assert.match(createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('🔒 許可リストにない成分と購入先は落とす', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(
    post({
      email: 'a@example.com',
      nutrients: ['creatine', 'aga_hair', 'hmb'],
      channel: ['unknown_shop', 'rakuten'],
    }),
    env,
  );

  assert.equal(writes[0].args[1], 'creatine,hmb');
  assert.equal(writes[0].args[2], 'rakuten');
});

test('不正なメールアドレスは 400 で、DB に触らない', async () => {
  for (const email of ['nope', '', 'a@b', `${'x'.repeat(250)}@example.com`]) {
    const { env, writes } = makeEnv();
    const res = await worker.fetch(post({ email }), env);
    assert.equal(res.status, 400, `${email} が弾かれていません`);
    assert.equal(writes.length, 0);
  }
});

test('壊れた JSON は 400', async () => {
  const { env } = makeEnv();
  const req = new Request('https://pergram.example/api/waitlist', { method: 'POST', body: '{' });
  assert.equal((await worker.fetch(req, env)).status, 400);
});

test('🔒 保存に失敗しても応答に原因を書かない', async () => {
  const { env } = makeEnv({ failWrite: true });
  const res = await worker.fetch(post({ email: 'a@example.com' }), env);

  assert.equal(res.status, 503);
  const body = await res.text();
  assert.ok(!body.includes('a@example.com'));
  assert.ok(!body.includes('D1_ERROR'));
});

test('POST 以外は 405 を返し、許可メソッドを伝える', async () => {
  const { env, writes } = makeEnv();
  const res = await worker.fetch(new Request('https://pergram.example/api/waitlist'), env);

  assert.equal(res.status, 405);
  assert.equal(res.headers.get('Allow'), 'POST');
  assert.equal(writes.length, 0);
});

test('API 以外のパスは静的ファイルの担当に渡す', async () => {
  const { env } = makeEnv();
  for (const path of ['/', '/ja/', '/ja/protein/', '/assets/lp.css']) {
    const res = await worker.fetch(new Request(`https://pergram.example${path}`), env);
    assert.equal(res.headers.get('x-from'), path, `${path} が静的側に渡っていません`);
  }
});

const LEGACY_ORIGIN = 'https://pergram.pergram-official.workers.dev';

test('旧ドメインへの要求はパスとクエリを保ったまま新ドメインへ 301 で転送する', async () => {
  const { env } = makeEnv();
  const cases = [
    ['/', '/'],
    ['/ja/', '/ja/'],
    ['/ja/protein/', '/ja/protein/'],
    ['/ja/protein/?type=whey', '/ja/protein/?type=whey'],
    ['/assets/lp.css', '/assets/lp.css'],
  ];

  for (const [from, to] of cases) {
    const res = await worker.fetch(new Request(`${LEGACY_ORIGIN}${from}`), env);
    assert.equal(res.status, 301, `${from} が恒久転送になっていません`);
    assert.equal(res.headers.get('Location'), `${SITE_ORIGIN}${to}`);
  }
});

test('🔒 転送先は SITE_ORIGIN と一致する（canonical と食い違わせない）', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(new Request(`${LEGACY_ORIGIN}/ja/`), env);

  assert.equal(new URL(res.headers.get('Location')).origin, SITE_ORIGIN);
});

test('🔒 プレビューの workers.dev は転送しない（末尾一致で巻き込まない）', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(
    new Request('https://pergram-preview.pergram-official.workers.dev/ja/'),
    env,
  );

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-from'), '/ja/');
});

test('🔒 旧ドメインへの POST は 308 で転送する（301 だと GET に化けて登録が消える）', async () => {
  const { env, writes } = makeEnv();
  const res = await worker.fetch(
    new Request(`${LEGACY_ORIGIN}/api/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.com', nutrients: ['creatine'] }),
    }),
    env,
  );

  assert.equal(res.status, 308);
  assert.equal(res.headers.get('Location'), `${SITE_ORIGIN}/api/waitlist`);
  assert.equal(writes.length, 0);
});

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

/* ---- 匿名シグナル（T-051） -------------------------------------------- */

/*
 * 第1段階の押下を D1 に1行だけ残す受け口。GA4 が CSP で全滅した実績があり（T-047）、
 * 計測が自分の手の中に無いと 0 件の意味が読めないため、PO 判断で足された。
 *
 * 🔒 保存するのは UUID と日時と「どのページか」の3つだけ。IP・User-Agent・リファラ・
 *    成分・自由記述・ページ内の位置を入れない。**個人を識別できるものを何も持たない
 *    ことが、この行の存在理由である。**
 * ⚠️ T-051 の時点では「UUID と日時の2つだけ」だった。**`page` は PO 判断で足された
 *    （T-058、2026-09-08）。** 下の検査もそれに合わせて 3 つになっている。
 * 🔒 既存の waitlist テーブルには触らない（email が主キーで、匿名の行は入らない）。
 */

const SIGNAL_PATH = '/api/request-signal';
const SIGNAL_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
/** 送信本文に必ず載る「どのページか」。形は src/templates/request.js の requestPageId() */
const SIGNAL_PAGE = 'ja:protein';
const signalBody = (over = {}) => JSON.stringify({ id: SIGNAL_ID, page: SIGNAL_PAGE, ...over });

const postSignal = (bodyText) =>
  new Request(`https://pergram.example${SIGNAL_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyText,
  });

test('匿名シグナルは 204 を返し、本文を持たない', async () => {
  const { env } = makeEnv();
  const res = await worker.fetch(postSignal(signalBody()), env);

  assert.equal(res.status, 204);
  assert.equal(await res.text(), '');
});

test('🔒 匿名シグナルが保存するのは UUID と日時と page の3つだけである', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(postSignal(signalBody()), env);

  assert.equal(writes.length, 1);
  assert.deepEqual(
    writes[0].args.length,
    3,
    '🔒 保存する値は id / created_at / page の3つだけ（T-058 で page が1つ足された）',
  );
  assert.equal(writes[0].args[0], SIGNAL_ID);
  assert.match(
    writes[0].args[1],
    /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/,
    'created_at が ISO 8601 の文字列ではありません',
  );
});

test('🔒 匿名シグナルの保存先は request_signal テーブルだけである（waitlist に触らない）', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(postSignal(signalBody()), env);

  const sql = writes[0].sql.replace(/\s+/g, ' ').toUpperCase();
  assert.ok(sql.includes('REQUEST_SIGNAL'), `保存先が request_signal ではありません: ${writes[0].sql}`);
  assert.ok(!sql.includes('WAITLIST'), '🔒 匿名シグナルが waitlist テーブルへ書き込んでいます');
});

test('同じ id を2度送っても行は増えない（重複を無視する）', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(postSignal(signalBody()), env);
  const res = await worker.fetch(postSignal(signalBody()), env);

  // 主キーの衝突でエラーを返さない。ブラウザ側の再送が 500 として観測されると、
  // 「送れなかった」のか「既に入っている」のか区別できなくなる
  assert.equal(res.status, 204, `2度目の応答が ${res.status} です`);
  const sql = writes[1].sql.replace(/\s+/g, ' ').toUpperCase();
  assert.ok(
    /INSERT\s+OR\s+IGNORE/.test(sql) || /ON CONFLICT[^)]*\)?\s*DO NOTHING/.test(sql),
    `重複を無視する書き方になっていません: ${writes[1].sql}`,
  );
});

test('匿名シグナルの id が UUID v4 でなければ 400 で、DB に触らない', async () => {
  for (const body of [
    signalBody({ id: 'not-a-uuid' }),
    signalBody({ id: '' }),
    signalBody({ id: 12345 }),
    signalBody({ id: `${SIGNAL_ID} ` }),
    JSON.stringify({}),
    '{',
  ]) {
    const { env, writes } = makeEnv();
    const res = await worker.fetch(postSignal(body), env);
    assert.equal(res.status, 400, `${body} が弾かれていません`);
    assert.equal(writes.length, 0, `${body} で DB に書き込んでいます`);
  }
});

test('🔒 id と page 以外のキーが混ざっていたら 400（余計な情報を保存経路に近づけない）', async () => {
  const { env, writes } = makeEnv();
  const res = await worker.fetch(
    postSignal(signalBody({ ua: 'Mozilla/5.0', referrer: 'https://example.com/' })),
    env,
  );

  assert.equal(res.status, 400);
  assert.equal(writes.length, 0);
});

test('🔒 匿名シグナルの保存に失敗しても応答に原因を書かない', async () => {
  const { env } = makeEnv({ failWrite: true });
  const res = await worker.fetch(postSignal(signalBody()), env);

  assert.equal(res.status, 503);
  const body = await res.text();
  assert.ok(!body.includes('D1_ERROR'), '応答に DB のエラーが漏れています');
  assert.ok(!body.includes(SIGNAL_ID), '応答に id が漏れています');
});

test('匿名シグナルのパスは POST 以外を 405 で返す', async () => {
  const { env, writes } = makeEnv();
  const res = await worker.fetch(new Request(`https://pergram.example${SIGNAL_PATH}`), env);

  assert.equal(res.status, 405);
  assert.equal(res.headers.get('Allow'), 'POST');
  assert.equal(writes.length, 0);
});

/* ---- 匿名シグナルの `page` 列（T-058） --------------------------------- */

/*
 * 「どのページで押されたか」を1列だけ足す（PO 判断 2026-09-08、T-058 決定ログ）。
 *
 * 🔒 足すのはここまで。IP・User-Agent・リファラ・成分・自由記述・**ページ内の位置**は
 *    入れない。位置（上の帯 / 下の帯）は GA4 の data-cta が持つ。
 * 🔒 `page` は任意項目ではない。無ければ目的（どのページからの要望が多いか）を
 *    果たさないので 400 で捨てる。
 */

test('匿名シグナルは id と page を受け取り、3つの値を保存する', async () => {
  const { env, writes } = makeEnv();
  const res = await worker.fetch(
    postSignal(JSON.stringify({ id: SIGNAL_ID, page: SIGNAL_PAGE })),
    env,
  );

  assert.equal(res.status, 204);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].args.length, 3, '🔒 保存する値は id / created_at / page の3つだけ');
  assert.ok(
    writes[0].args.includes(SIGNAL_PAGE),
    `page が保存されていません: ${JSON.stringify(writes[0].args)}`,
  );
  const sql = writes[0].sql.replace(/\s+/g, ' ').toUpperCase();
  assert.ok(sql.includes('PAGE'), `page 列へ書いていません: ${writes[0].sql}`);
  assert.ok(!sql.includes('WAITLIST'), '🔒 匿名シグナルが waitlist テーブルへ書き込んでいます');
});

test('page の形が合わない匿名シグナルは 400 で、DB に触らない', async () => {
  const bad = [
    'ja',                       // 区切りが無い
    'ja:',                      // ページ側が空
    ':protein',                 // 言語側が空
    '/ja/protein/',             // パスをそのまま送っている
    'JA:protein',               // 大文字
    'ja:Protein',               // 大文字
    'jpn:lp',                   // 言語が2文字でない
    `${SIGNAL_PAGE} `,          // 🔒 前後の空白を落として救わない
    ` ${SIGNAL_PAGE}`,
    `ja:${'a'.repeat(41)}`,     // 41文字は長すぎる
    'ja:プロテイン',             // 非 ASCII
    'ja:pro tein',              // 空白入り
    '',
    12345,
    null,
  ];

  for (const page of bad) {
    const { env, writes } = makeEnv();
    const res = await worker.fetch(postSignal(JSON.stringify({ id: SIGNAL_ID, page })), env);
    assert.equal(res.status, 400, `page=${JSON.stringify(page)} が弾かれていません`);
    assert.equal(writes.length, 0, `page=${JSON.stringify(page)} で DB に書き込んでいます`);
  }
});

test('page の形が合っていれば通る（境界と実在の識別子）', async () => {
  for (const page of ['ja:lp', 'en:lp', 'ja:protein', 'en:creatine', 'ja:a', `ja:${'a'.repeat(40)}`, 'ja:vitamin-d3']) {
    const { env, writes } = makeEnv();
    const res = await worker.fetch(postSignal(JSON.stringify({ id: SIGNAL_ID, page })), env);
    assert.equal(res.status, 204, `page=${page} が通りません`);
    assert.equal(writes.length, 1);
  }
});

test('🔒 キー集合が {id, page} ちょうどでなければ 400（余分なキーを黙って無視しない）', async () => {
  for (const body of [
    { id: SIGNAL_ID, page: SIGNAL_PAGE, ua: 'Mozilla/5.0' },
    { id: SIGNAL_ID, page: SIGNAL_PAGE, referrer: 'https://example.com/' },
    { id: SIGNAL_ID, page: SIGNAL_PAGE, location: 'products_request_top' },
    { id: SIGNAL_ID, page: SIGNAL_PAGE, email: 'a@example.com' },
  ]) {
    const { env, writes } = makeEnv();
    const res = await worker.fetch(postSignal(JSON.stringify(body)), env);
    assert.equal(res.status, 400, `${JSON.stringify(body)} が弾かれていません`);
    assert.equal(writes.length, 0, `${JSON.stringify(body)} で DB に書き込んでいます`);
  }
});

test('🔒 page の無い匿名シグナルは 400（任意項目にしない）', async () => {
  const { env, writes } = makeEnv();
  const res = await worker.fetch(postSignal(JSON.stringify({ id: SIGNAL_ID })), env);

  assert.equal(res.status, 400, 'page の無い本文が通っています');
  assert.equal(writes.length, 0);
});

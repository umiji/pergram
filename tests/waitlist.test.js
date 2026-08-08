import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import {
  SHEET_HEADER,
  sanitizeSubmission,
  sheetsConfig,
  toSheetRow,
} from '../src/lib/waitlist.js';
import { onRequestPost } from '../functions/api/waitlist.js';
import vercelHandler from '../api/waitlist.js';

/* ---- テスト用の秘密鍵と env ------------------------------------------- */

const keyPair = await crypto.subtle.generateKey(
  {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify'],
);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----\\n${pkcs8
  .toString('base64')
  .replace(/(.{64})/g, '$1\\n')}\\n-----END PRIVATE KEY-----\\n`;

/** サービスアカウントごとにトークンを使い回すので、テストごとに別の宛先にする */
let serviceAccountSeq = 0;

function makeEnv({
  withDb = true,
  withSheets = true,
  existingEmails = [],
  failSheets = false,
  tab = null,
} = {}) {
  const calls = { d1: [], sheets: [] };

  const env = {
    ...(withDb
      ? {
          DB: {
            prepare: (sql) => ({
              bind: (...args) => ({
                run: async () => {
                  calls.d1.push({ sql, args });
                  return { success: true };
                },
              }),
            }),
          },
        }
      : {}),
    ...(withSheets
      ? {
          GOOGLE_SHEETS_ID: 'sheet-id',
          GOOGLE_SERVICE_ACCOUNT_EMAIL: `bot-${(serviceAccountSeq += 1)}@pergram.iam.gserviceaccount.com`,
          GOOGLE_PRIVATE_KEY: PRIVATE_KEY,
          ...(tab ? { GOOGLE_SHEETS_TAB: tab } : {}),
        }
      : {}),
  };

  const fetchStub = async (url, init = {}) => {
    const href = String(url);
    if (href.startsWith('https://oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'token-123', expires_in: 3600 });
    }
    if (failSheets) return new Response('nope', { status: 403 });

    const body = init.body ? JSON.parse(init.body) : null;
    calls.sheets.push({ href, method: init.method ?? 'GET', body });

    if (href.includes(':append')) return Response.json({ updates: {} });
    if ((init.method ?? 'GET') === 'PUT') return Response.json({ updatedCells: 2 });
    // 空のシートは values ごと返ってこない
    if (existingEmails.length === 0) return Response.json({ majorDimension: 'COLUMNS' });
    return Response.json({ majorDimension: 'COLUMNS', values: [['email', ...existingEmails]] });
  };

  return { env, calls, fetchStub };
}

const withFetch = async (fetchStub, run) => {
  const original = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
};

/** Cloudflare Pages Functions 経由で1件送る */
const post = async (payload, options) => {
  const { env, calls, fetchStub } = makeEnv(options);
  return withFetch(fetchStub, async () => {
    const request = new Request('https://pergram.example/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const res = await onRequestPost({ request, env });
    return { res, status: res.status, body: await res.json(), calls };
  });
};

/** Vercel Functions 経由で1件送る。body の解析済み / 未解析の両方を試せる */
const postVercel = async (payload, { parsedBody = true, method = 'POST', ...options } = {}) => {
  const { env, calls, fetchStub } = makeEnv(options);
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);

  const req = Object.assign(Readable.from(parsedBody ? [] : [Buffer.from(raw)]), {
    method,
    headers: { 'content-type': 'application/json' },
    body: parsedBody ? JSON.parse(raw) : undefined,
  });

  const res = {
    statusCode: 0,
    headers: {},
    payload: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(text) {
      this.payload = text;
    },
  };

  // Vercel 側は process.env から読む
  const saved = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    if (typeof value === 'string') process.env[key] = value;
  }

  try {
    await withFetch(fetchStub, () => vercelHandler(req, res));
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  return { res, status: res.statusCode, body: JSON.parse(res.payload), calls };
};

/* ---- 入力の検証 ------------------------------------------------------- */

test('保存する列はメール・成分・購入先・登録日時の4つだけ', () => {
  const record = sanitizeSubmission({
    email: 'a@example.com',
    nutrients: ['creatine'],
    channel: 'rakuten',
    // 🔒 送られてきても保存しない
    age: 34,
    sex: 'male',
    medications: 'x',
  });
  assert.deepEqual(Object.keys(record).sort(), ['channel', 'created_at', 'email', 'nutrients']);
  assert.deepEqual(SHEET_HEADER, ['email', 'nutrients', 'channel', 'created_at']);
});

test('許可リストにない成分・購入先は落とす', () => {
  const record = sanitizeSubmission({
    email: 'a@example.com',
    nutrients: ['creatine', 'minoxidil', 'hmb'],
    channel: 'yahoo',
  });
  assert.deepEqual(record.nutrients, ['creatine', 'hmb']);
  assert.equal(record.channel, null);
});

test('不正なメールアドレスは null', () => {
  assert.equal(sanitizeSubmission({ email: 'not-an-email' }), null);
  assert.equal(sanitizeSubmission({ email: `${'a'.repeat(250)}@example.com` }), null);
  assert.equal(sanitizeSubmission(null), null);
});

test('行はヘッダと同じ並び。未選択の購入先は空文字', () => {
  const record = sanitizeSubmission(
    { email: 'a@example.com', nutrients: ['hmb', 'creatine'] },
    new Date('2026-08-08T00:00:00.000Z'),
  );
  assert.deepEqual(toSheetRow(record), [
    'a@example.com',
    'hmb,creatine',
    '',
    '2026-08-08T00:00:00.000Z',
  ]);
});

test('環境変数が欠けていればスプレッドシートには書かない', () => {
  assert.equal(sheetsConfig({ GOOGLE_SHEETS_ID: 'x' }), null);
  assert.equal(
    sheetsConfig({
      GOOGLE_SHEETS_ID: 'x',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'a@b.iam.gserviceaccount.com',
      GOOGLE_PRIVATE_KEY: 'k',
    }).tab,
    'waitlist',
  );
});

/* ---- 転記 ------------------------------------------------------------- */

test('新規は D1 とスプレッドシートの両方に書く', async () => {
  const { status, body, calls } = await post(
    { email: 'new@example.com', nutrients: ['creatine'], channel: 'amazon' },
    { existingEmails: ['old@example.com'] },
  );

  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(calls.d1.length, 1);

  const append = calls.sheets.find((call) => call.href.includes(':append'));
  assert.ok(append, 'append が呼ばれていない');
  assert.deepEqual(append.body.values, [
    ['new@example.com', 'creatine', 'amazon', calls.d1[0].args[3]],
  ]);
  // 🔒 USER_ENTERED だと `=` 始まりの入力が数式になる
  assert.ok(append.href.includes('valueInputOption=RAW'));
});

test('空のシートには見出し行を先に置く', async () => {
  const { calls } = await post({ email: 'new@example.com' }, { existingEmails: [] });
  const append = calls.sheets.find((call) => call.href.includes(':append'));
  assert.deepEqual(append.body.values[0], SHEET_HEADER);
});

test('既存のメールアドレスは行を書き換える。登録日時は最初のまま', async () => {
  const { calls } = await post(
    { email: 'b@example.com', nutrients: ['hmb'], channel: 'iherb' },
    { existingEmails: ['a@example.com', 'b@example.com'] },
  );

  const append = calls.sheets.find((call) => call.href.includes(':append'));
  assert.equal(append, undefined, '重複行を作ってはいけない');

  const update = calls.sheets.find((call) => call.method === 'PUT');
  // 見出し行 + a@ + b@ で3行目
  assert.equal(update.body.range, "'waitlist'!B3:C3");
  assert.deepEqual(update.body.values, [['hmb', 'iherb']]);
});

test('空白を含むシート名は A1 記法で引用する', async () => {
  const { calls } = await post(
    { email: 'b@example.com' },
    { tab: 'waiting list', existingEmails: ['b@example.com'] },
  );
  const update = calls.sheets.find((call) => call.method === 'PUT');
  assert.equal(update.body.range, "'waiting list'!B2:C2");
});

/* ---- 失敗したとき ----------------------------------------------------- */

test('スプレッドシートに書けなくても D1 に書けていれば登録は成立する', async () => {
  const { status, body, calls } = await post({ email: 'a@example.com' }, { failSheets: true });
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(calls.d1.length, 1);
});

test('D1 が無くてもスプレッドシートに書けていれば成立する', async () => {
  const { status, body, calls } = await post({ email: 'a@example.com' }, { withDb: false });
  assert.equal(status, 200);
  assert.equal(calls.d1.length, 0);
  assert.deepEqual(body, { ok: true });
});

test('全ての保存先で失敗したら 500', async () => {
  const { status, body } = await post({ email: 'a@example.com' }, { withDb: false, failSheets: true });
  assert.equal(status, 500);
  assert.deepEqual(body, { error: 'storage_failed' });
});

test('保存先が1つも設定されていなければ 500', async () => {
  const { status, body } = await post(
    { email: 'a@example.com' },
    { withDb: false, withSheets: false },
  );
  assert.equal(status, 500);
  assert.deepEqual(body, { error: 'not_configured' });
});

test('不正なメールアドレスならどこにも書かない', async () => {
  const { status, body, calls } = await post({ email: 'nope' });
  assert.equal(status, 400);
  assert.deepEqual(body, { error: 'invalid_email' });
  assert.equal(calls.d1.length, 0);
  assert.equal(calls.sheets.length, 0);
});

/* ---- Vercel アダプタ --------------------------------------------------- */

test('Vercel でもスプレッドシートに転記する', async () => {
  const { status, body, calls } = await postVercel(
    { email: 'new@example.com', nutrients: ['hmb'], channel: 'rakuten' },
    { withDb: false, existingEmails: ['old@example.com'] },
  );

  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });
  const append = calls.sheets.find((call) => call.href.includes(':append'));
  assert.deepEqual(append.body.values[0].slice(0, 3), ['new@example.com', 'hmb', 'rakuten']);
});

test('Vercel は body が未解析でも読む', async () => {
  const { status, calls } = await postVercel(
    { email: 'new@example.com' },
    { withDb: false, parsedBody: false, existingEmails: ['old@example.com'] },
  );
  assert.equal(status, 200);
  assert.ok(calls.sheets.some((call) => call.href.includes(':append')));
});

test('Vercel でも壊れた JSON は 400', async () => {
  const { status, body } = await postVercel('{"email":', { withDb: false, parsedBody: false });
  assert.equal(status, 400);
  assert.deepEqual(body, { error: 'invalid_json' });
});

test('Vercel は POST 以外を受け付けない', async () => {
  const { status, body, res, calls } = await postVercel(
    { email: 'a@example.com' },
    { method: 'GET', withDb: false },
  );
  assert.equal(status, 405);
  assert.deepEqual(body, { error: 'method_not_allowed' });
  assert.equal(res.headers.allow, 'POST');
  assert.equal(calls.sheets.length, 0);
});

test('Vercel は D1 の束縛を持たない。設定が無ければ 500', async () => {
  const { status, body } = await postVercel(
    { email: 'a@example.com' },
    { withDb: false, withSheets: false },
  );
  assert.equal(status, 500);
  assert.deepEqual(body, { error: 'not_configured' });
});

test('DB という名前の環境変数を D1 と取り違えない', async () => {
  const { env, fetchStub } = makeEnv({ withDb: false, withSheets: false });
  env.DB = 'postgres://example';
  const { handleSubmission } = await import('../src/lib/waitlist.js');
  const result = await withFetch(fetchStub, () =>
    handleSubmission({ email: 'a@example.com' }, env),
  );
  assert.deepEqual(result, { status: 500, body: { error: 'not_configured' } });
});

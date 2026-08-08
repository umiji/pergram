/**
 * 待機リストの登録。Cloudflare Pages Functions。
 *
 * 保存先は2つ。どちらも任意で、環境変数が揃っているものにだけ書く。
 *   - Cloudflare D1（`env.DB`）
 *   - Google スプレッドシート（サービスアカウント）
 * 片方が失敗しても、もう片方に書けていれば登録は成立させる。
 *
 * 🔒 サーバが保持してよいのは requirements.md §3.4 と validation-plan.md §6 の範囲だけ。
 *    年齢・性別・体調・服薬情報は受け取らないし、送られてきても保存しない。
 *    スプレッドシートに転記する列も D1 と同じ4つに限る。
 * 🔒 GA4 への送信はクライアント側で行い、メールアドレスを含めない。
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 受け付ける選択肢。想定外の値は保存しない。
 * LP のチップと対応する（src/templates/lp/sections.js の ROADMAP_NUTRIENTS）。
 * protein / other は LP から外したが、過去の登録が残っているので受け付け続ける。
 */
const ALLOWED_NUTRIENTS = new Set([
  'protein',
  'creatine',
  'eaa_bcaa',
  'hmb',
  'iron_zinc',
  'vitamins',
  'multivitamin',
  'other',
]);
const ALLOWED_CHANNELS = new Set(['rakuten', 'amazon', 'iherb', 'myprotein', 'store']);

/**
 * スプレッドシートの列順。D1 の waitlist テーブルと同じ並びにする。
 * 🔒 順序を変えると既存行とずれる。足すときは末尾にだけ足す。
 */
export const SHEET_HEADER = ['email', 'nutrients', 'channel', 'created_at'];

const SHEET_TAB_DEFAULT = 'waitlist';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/* ---- 入力の検証 ------------------------------------------------------- */

/**
 * 受け取った JSON から保存してよい値だけを取り出す。
 * 不正なメールアドレスなら null を返す。
 */
export function sanitizeSubmission(payload, now = new Date()) {
  const source = payload && typeof payload === 'object' ? payload : {};

  const email = typeof source.email === 'string' ? source.email.trim() : '';
  if (!EMAIL_RE.test(email) || email.length > 254) return null;

  const nutrients = Array.isArray(source.nutrients)
    ? source.nutrients.filter((n) => ALLOWED_NUTRIENTS.has(n))
    : [];
  const channel = ALLOWED_CHANNELS.has(source.channel) ? source.channel : null;

  return { email, nutrients, channel, created_at: now.toISOString() };
}

/** SHEET_HEADER の順に並べた1行。 */
export function toSheetRow(record) {
  return [record.email, record.nutrients.join(','), record.channel ?? '', record.created_at];
}

/* ---- Google 認証 ------------------------------------------------------ */

const base64url = (bytes) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const encodeJson = (value) => base64url(new TextEncoder().encode(JSON.stringify(value)));

/**
 * サービスアカウントの秘密鍵（PEM）を DER に戻す。
 * 環境変数に貼ると改行が `\n` の2文字になることがあるので戻す。
 */
export function pemToPkcs8(pem) {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----[A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// アクセストークンは isolate 内で使い回す。毎リクエスト取り直さない
const tokenCache = new Map();

async function mintAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: SHEETS_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson(claim)}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64url(new Uint8Array(signature))}`,
    }),
  });
  if (!res.ok) {
    throw new Error(`token_request_failed status=${res.status}`);
  }
  const body = await res.json();
  return { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
}

async function accessToken(clientEmail, privateKey) {
  const cached = tokenCache.get(clientEmail);
  // 期限ちょうどに使うと転送中に切れるので60秒手前で捨てる
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

  const minted = await mintAccessToken(clientEmail, privateKey);
  tokenCache.set(clientEmail, minted);
  return minted.token;
}

/* ---- スプレッドシートへの転記 ----------------------------------------- */

/** A1 記法のシート名。空白や `'` を含む名前でも壊れないように引用する。 */
const quoteTab = (tab) => `'${tab.replace(/'/g, "''")}'`;

/** 設定が揃っていなければ null。揃っていれば転記に必要な値一式。 */
export function sheetsConfig(env) {
  const spreadsheetId = env.GOOGLE_SHEETS_ID;
  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GOOGLE_PRIVATE_KEY;
  if (!spreadsheetId || !clientEmail || !privateKey) return null;
  return {
    spreadsheetId,
    clientEmail,
    privateKey,
    tab: env.GOOGLE_SHEETS_TAB || SHEET_TAB_DEFAULT,
  };
}

async function sheetsFetch(config, token, path, init = {}) {
  const res = await fetch(`${SHEETS_API}/${encodeURIComponent(config.spreadsheetId)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`sheets_request_failed status=${res.status} path=${path}`);
  }
  return res.json();
}

/**
 * 1件を転記する。同じメールアドレスの再送信は既存行を書き換える（重複行を作らない）。
 *
 * valueInputOption は必ず RAW。USER_ENTERED にすると `=` で始まる入力が数式として
 * 評価される。
 */
export async function upsertToSheet(config, record) {
  const token = await accessToken(config.clientEmail, config.privateKey);
  const tab = quoteTab(config.tab);
  const lastColumn = String.fromCharCode(65 + SHEET_HEADER.length - 1); // 'D'

  const existing = await sheetsFetch(
    config,
    token,
    `/values/${encodeURIComponent(`${tab}!A:A`)}?majorDimension=COLUMNS`,
  );
  const emails = existing.values?.[0] ?? [];
  const index = emails.indexOf(record.email);

  if (index >= 0) {
    // created_at は最初の登録日のまま残す（D1 の ON CONFLICT と同じ扱い）
    const row = index + 1;
    const range = `${tab}!B${row}:C${row}`;
    await sheetsFetch(
      config,
      token,
      `/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: 'PUT',
        body: JSON.stringify({
          range,
          majorDimension: 'ROWS',
          values: [[record.nutrients.join(','), record.channel ?? '']],
        }),
      },
    );
    return 'updated';
  }

  // 空のシートに書くときだけ見出し行を付ける
  const values = emails.length === 0 ? [SHEET_HEADER, toSheetRow(record)] : [toSheetRow(record)];
  const range = `${tab}!A:${lastColumn}`;
  await sheetsFetch(
    config,
    token,
    `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ range, majorDimension: 'ROWS', values }) },
  );
  return 'appended';
}

/* ---- D1 --------------------------------------------------------------- */

async function upsertToD1(db, record) {
  // 同じメールアドレスの再送信は上書きする（重複行を作らない）
  await db
    .prepare(
      `INSERT INTO waitlist (email, nutrients, channel, created_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(email) DO UPDATE SET
       nutrients = excluded.nutrients,
       channel   = excluded.channel`,
    )
    .bind(record.email, record.nutrients.join(','), record.channel, record.created_at)
    .run();
}

/* ---- ハンドラ --------------------------------------------------------- */

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const record = sanitizeSubmission(payload);
  if (!record) return json({ error: 'invalid_email' }, 400);

  const sheets = sheetsConfig(env);
  const targets = [];
  if (env.DB) targets.push({ name: 'd1', run: () => upsertToD1(env.DB, record) });
  if (sheets) targets.push({ name: 'sheets', run: () => upsertToSheet(sheets, record) });

  if (targets.length === 0) {
    console.error('waitlist: 保存先が設定されていない（DB / GOOGLE_SHEETS_* のいずれも無い）');
    return json({ error: 'not_configured' }, 500);
  }

  const results = await Promise.allSettled(targets.map((target) => target.run()));
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`waitlist: ${targets[i].name} への保存に失敗`, result.reason);
    }
  });

  // 1つでも書けていれば登録は成立している。全滅したときだけ失敗を返す
  if (results.every((result) => result.status === 'rejected')) {
    return json({ error: 'storage_failed' }, 500);
  }
  return json({ ok: true });
}

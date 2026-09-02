/**
 * 楽天 API が返す失敗の読み方。
 *
 * 🔒 このプロジェクトは同じワークフローを、まったく違う原因で2度止めている。
 *    2026-08-17 は版の廃止（400）、2026-08-25 は Referer の不一致（403）。
 *    どちらも「認証情報が失効した」ように見えるが、直す場所が別である。
 *    応答から原因の当たりを機械的に付け、失敗ログに一緒に出す。
 *
 * 🔒 手がかりの文面に認証情報の実値（App URL を含む）を混ぜないこと。
 *    GitHub Actions のログに出るため、値そのものは出さず、一致するか否かだけを言う。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { describeApiFailure } from '../scripts/rakuten_api.js';
import { SITE_ORIGIN } from '../src/lib/site.js';

const CANONICAL_APP_URL = `${SITE_ORIGIN}/`;
const STALE_APP_URL = 'https://pergram.pergram-official.workers.dev/';

const referrerNotAllowed = JSON.stringify({
  errors: { errorCode: 403, errorMessage: 'HTTP_REFERRER_NOT_ALLOWED' },
});
const referrerMissing = JSON.stringify({
  errors: { errorCode: 403, errorMessage: 'REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING' },
});
const configurationNotFound = JSON.stringify({
  error_description: 'API Configuration not found',
  error: 'wrong_parameter',
});

/* ---- 原因の切り分け --------------------------------------------------- */

// 2026-08-17 の7連続失敗。版が廃止されると認証もリファラ審査も通ったうえで 400 が返る。
test('400 API Configuration not found は版の廃止として案内する', () => {
  const hint = describeApiFailure({
    status: 400,
    body: configurationNotFound,
    appUrl: CANONICAL_APP_URL,
  });

  assert.match(hint, /版/);
  assert.match(hint, /ENDPOINT/);
  // 版の廃止に Referer は関係ない。混ぜると探す場所が増える。
  assert.doesNotMatch(hint, /Referer/);
});

// 2026-08-25 からの失敗。値は届いているが、登録されたアプリ URL と一致していない。
test('403 HTTP_REFERRER_NOT_ALLOWED は Referer の不一致として案内する', () => {
  const hint = describeApiFailure({
    status: 403,
    body: referrerNotAllowed,
    appUrl: CANONICAL_APP_URL,
  });

  assert.match(hint, /RAKUTEN_APP_URL/);
  assert.match(hint, /HTTP_REFERRER_NOT_ALLOWED/);
  // 版の廃止（400）と取り違えると、直す場所を間違える。
  assert.doesNotMatch(hint, /ENDPOINT/);
});

// Referer が届いていない場合は別のエラーコードになる。直す場所も違う（送信側の欠落）。
test('403 REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING は不一致と区別する', () => {
  const hint = describeApiFailure({
    status: 403,
    body: referrerMissing,
    appUrl: CANONICAL_APP_URL,
  });

  assert.match(hint, /^REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING/);
  assert.match(hint, /別のエラー/);
});

/* ---- Referer が正規ドメインと一致しているか --------------------------- */

// 2026-08-24 のドメイン移転で、GitHub 側の RAKUTEN_APP_URL だけが旧ドメインのまま残った。
// 「送った値が正規ドメインかどうか」が分かれば、直す先が GitHub 側か楽天側かが決まる。
test('送った Referer が旧ドメインなら、正規ドメインと違うことを言う', () => {
  const hint = describeApiFailure({ status: 403, body: referrerNotAllowed, appUrl: STALE_APP_URL });

  assert.match(hint, /正規ドメイン（[^）]*）と一致していない/);
  assert.match(hint, new RegExp(new URL(SITE_ORIGIN).hostname));
});

test('送った Referer が正規ドメインなら、楽天側の登録を疑う向きに案内する', () => {
  const hint = describeApiFailure({
    status: 403,
    body: referrerNotAllowed,
    appUrl: CANONICAL_APP_URL,
  });

  assert.match(hint, /正規ドメインと一致している/);
  assert.doesNotMatch(hint, /正規ドメイン（[^）]*）と一致していない/);
});

test('appUrl が読めない値でも落ちない', () => {
  for (const appUrl of [undefined, '', 'not a url']) {
    const hint = describeApiFailure({ status: 403, body: referrerNotAllowed, appUrl });
    assert.match(hint, /HTTP_REFERRER_NOT_ALLOWED/);
  }
});

/* ---- 秘密を漏らさない ------------------------------------------------- */

// 🔒 手がかりは GitHub Actions のログにそのまま出る。Environment secret の値を
//    書き戻すと、マスクの当てが外れた瞬間に平文で残る。
test('🔒 手がかりに App URL の値そのものを含めない', () => {
  for (const appUrl of [CANONICAL_APP_URL, STALE_APP_URL]) {
    const hint = describeApiFailure({ status: 403, body: referrerNotAllowed, appUrl });

    assert.ok(!hint.includes(appUrl), '送信した App URL の値が手がかりに混ざっています');
    assert.ok(
      !hint.includes(new URL(appUrl).hostname),
      '送信した App URL のホストが手がかりに混ざっています',
    );
  }
});

/* ---- 握り潰さない ----------------------------------------------------- */

// 🔒 手がかりはあくまで補助。心当たりが無い応答に説明を作らない。
test('見覚えのない応答には手がかりを作らない', () => {
  assert.equal(describeApiFailure({ status: 500, body: 'Internal Server Error', appUrl: '' }), '');
  assert.equal(describeApiFailure({ status: 429, body: '{}', appUrl: '' }), '');
});

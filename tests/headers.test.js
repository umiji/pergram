/**
 * 配信ヘッダの不変条件。
 *
 * 🔒 CSP は外部読み込みを黙って殺す。許可を書き忘れると、ブラウザのコンソール
 *    以外どこにも痕跡が残らないまま「画面に何も出ない」だけになる。
 *    外部オリジンを使う設定を足したら、必ずここが発火するようにしておく。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { contentSecurityPolicy, headersFile, supportOriginOf } from '../src/build/headers.js';

const markets = JSON.parse(await readFile('config/markets.json', 'utf8'));

/** CSP の1ディレクティブを取り出す */
function directive(csp, name) {
  const found = csp.split('; ').find((part) => part.startsWith(`${name} `));
  assert.ok(found, `${name} がありません`);
  return found;
}

test('支援ウィジェットのオリジンは scriptSrc から導く', () => {
  assert.equal(
    supportOriginOf({ scriptSrc: 'https://codoc.jp/js/cms.js' }),
    'https://codoc.jp',
  );
  assert.equal(supportOriginOf(null), null);
  assert.equal(supportOriginOf(undefined), null);
});

test('🔒 支援ウィジェットを出す市場では CSP がその3経路を許可する', () => {
  const origin = supportOriginOf(markets.JP.support);
  assert.ok(origin, 'JP の支援設定がありません');

  const csp = contentSecurityPolicy({ supportOrigin: origin });

  // script: cms.js が cms-core.js を追加で読む
  assert.ok(directive(csp, 'script-src').includes(origin), 'script-src に許可がありません');
  // style: paywall.css とテーマ CSS を <link> で差し込む
  assert.ok(directive(csp, 'style-src').includes(origin), 'style-src に許可がありません');
  // connect: 記事本文などを API から取得する
  assert.ok(directive(csp, 'connect-src').includes(origin), 'connect-src に許可がありません');
});

// 🔒 これが無いと支援ウィジェットは「読み込みも通信も成功したのに画面が空」になる。
//    Codoc の cms-core.js は Vue のテンプレートコンパイラ入りビルドで、
//    テンプレートを `new Function(...)` で関数化する。CSP に 'unsafe-eval' が
//    無いとその生成が失敗するが、Vue は例外を握り潰して描画関数を空関数に
//    差し替えるため、mount は成功したように見えたまま何も描かれない。
//    本番ビルドの Vue は警告も出さないので、コンソールにも痕跡が残らない。
test("🔒 支援ウィジェットを出す市場では script-src に 'unsafe-eval' がある", () => {
  const origin = supportOriginOf(markets.JP.support);
  assert.ok(origin, 'JP の支援設定がありません');

  const csp = contentSecurityPolicy({ supportOrigin: origin });
  assert.ok(
    directive(csp, 'script-src').includes("'unsafe-eval'"),
    "script-src に 'unsafe-eval' がありません",
  );
});

test('支援ウィジェットを出さない市場では外部オリジンが増えない', () => {
  assert.equal(markets.US.support, null);

  const withSupport = contentSecurityPolicy({ supportOrigin: 'https://example.test' });
  const without = contentSecurityPolicy({ supportOrigin: null });

  assert.ok(!without.includes('example.test'));
  assert.ok(withSupport.length > without.length);
});

// 🔒 緩めるのは支援ウィジェットを出す市場だけ。理由が無い市場まで道連れにしない
test("🔒 支援ウィジェットを出さない市場では 'unsafe-eval' を許可しない", () => {
  const csp = contentSecurityPolicy({ supportOrigin: null });
  assert.ok(!csp.includes("'unsafe-eval'"), "'unsafe-eval' が無条件に付いています");
});

// 🔒 既定の締め方を緩めない。ここが緩むと XSS の被害が一段深くなる
test('🔒 CSP の既定は self のまま、埋め込みも object も禁止', () => {
  const csp = contentSecurityPolicy({ supportOrigin: 'https://codoc.jp' });
  assert.ok(csp.startsWith("default-src 'self'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(csp.includes("base-uri 'self'"));
  assert.ok(csp.includes("form-action 'self'"));
});

test('_headers に主要なセキュリティヘッダが揃っている', () => {
  const text = headersFile({ supportOrigin: null });
  for (const header of [
    'X-Content-Type-Options: nosniff',
    'X-Frame-Options: DENY',
    'Referrer-Policy: strict-origin-when-cross-origin',
    'Strict-Transport-Security:',
    'Content-Security-Policy:',
  ]) {
    assert.ok(text.includes(header), `${header} がありません`);
  }
  assert.ok(text.startsWith('/*\n'), 'すべてのパスに当たる指定になっていません');
});

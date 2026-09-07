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

// ---------------------------------------------------------------------------
// T-047 受け入れテスト — 計測ビーコンの送信先を CSP が許可していること
// ---------------------------------------------------------------------------

/**
 * CSP の1ディレクティブの source 一覧。
 * 部分一致で判定すると `https://analytics.google.com.evil.test` のような
 * 別ホストでも通ってしまうため、必ずトークンの完全一致で判定する。
 */
function sources(csp, name) {
  return directive(csp, name).split(' ').slice(1);
}

// 🔒 GA4（gtag.js）は計測を analytics.google.com/g/collect へ fetch / beacon で送る。
//    ここが漏れると、タグの読み込みは成功して画面は完全に正常に見えるのに、
//    page_view を含む全イベントが送信の一歩手前で捨てられる。痕跡はコンソールだけ。
//    ワイルドカードは1ラベルしか埋めないので `https://*.analytics.google.com` は
//    `analytics.google.com` 自身にマッチしない。完全一致で必ず書くこと。
const MEASUREMENT_CONNECT_SRC = [
  'https://analytics.google.com',
  'https://www.google-analytics.com',
  'https://*.analytics.google.com',
  'https://*.google-analytics.com',
  'https://*.googletagmanager.com',
  'https://www.google.com',
  'https://www.googleadservices.com',
  // `googleads.g.doubleclick.net` / `stats.g.doubleclick.net` が使う
  'https://*.g.doubleclick.net',
  // 🔒 裸のホスト。`https://www.google.com` は `www.` 付きにしかマッチしない。
  //    Google 広告のコンバージョン計測が `https://google.com/ccm/form-data/...` へ送る。
  'https://google.com',
  // 🔒 `https://*.g.doubleclick.net` にマッチしない（`ad.doubleclick.net` には
  //    `.g.` の階層が無い）。リマーケティングが `ad.doubleclick.net/ccm/s/collect` へ送る。
  'https://ad.doubleclick.net',
];

test('🔒 connect-src が GA4 と広告タグの送信先をすべて許可する', () => {
  for (const supportOrigin of [null, supportOriginOf(markets.JP.support)]) {
    const allowed = sources(contentSecurityPolicy({ supportOrigin }), 'connect-src');
    for (const host of MEASUREMENT_CONNECT_SRC) {
      assert.ok(
        allowed.includes(host),
        `connect-src に ${host} がありません（supportOrigin=${supportOrigin}）`,
      );
    }
  }
});

// 🔒 全許可で塞ぐのは禁止。必要なホストだけを列挙する
test('🔒 connect-src をスキーム全許可・ワイルドカード単独で塞がない', () => {
  for (const supportOrigin of [null, supportOriginOf(markets.JP.support)]) {
    const allowed = sources(contentSecurityPolicy({ supportOrigin }), 'connect-src');
    // `https://*.doubleclick.net` は `ad.doubleclick.net` と `*.g.doubleclick.net` を
    // 1本にまとめたくなる書き方だが、必要のないサブドメインまで開く。個別に列挙する
    for (const wildcard of ['https:', '*', 'https://*', 'http:', 'https://*.doubleclick.net']) {
      assert.ok(
        !allowed.includes(wildcard),
        `connect-src に ${wildcard} があります（必要なホストだけを列挙する）`,
      );
    }
  }
});

// Cloudflare Web Analytics のビーコン。script-src 側で落ちていた
test('🔒 script-src が Cloudflare Insights のビーコンを許可する', () => {
  for (const supportOrigin of [null, supportOriginOf(markets.JP.support)]) {
    const allowed = sources(contentSecurityPolicy({ supportOrigin }), 'script-src');
    assert.ok(
      allowed.includes('https://static.cloudflareinsights.com'),
      `script-src に https://static.cloudflareinsights.com がありません（supportOrigin=${supportOrigin}）`,
    );
  }
});

// 回帰: 計測ホストを足しても、支援ウィジェットの出し分けは従来どおり
test('🔒 回帰: 支援ウィジェットのオリジンは3経路に付き、出さない市場には付かない', () => {
  const origin = supportOriginOf(markets.JP.support);
  assert.ok(origin, 'JP の支援設定がありません');

  const withSupport = contentSecurityPolicy({ supportOrigin: origin });
  const without = contentSecurityPolicy({ supportOrigin: null });

  for (const name of ['script-src', 'style-src', 'connect-src']) {
    assert.ok(
      sources(withSupport, name).includes(origin),
      `${name} に ${origin} がありません`,
    );
    assert.ok(
      !sources(without, name).includes(origin),
      `supportOrigin が null なのに ${name} に ${origin} が付いています`,
    );
  }
  assert.ok(!without.includes(origin), `supportOrigin が null なのに ${origin} が CSP に出ています`);
});

// dist/_headers に載る値は contentSecurityPolicy() の結果そのものであること。
// ここが乖離すると、テストは通るのに配信されるヘッダだけが古いという事故になる
test('🔒 _headers の Content-Security-Policy が CSP 本体と一致する', () => {
  for (const supportOrigin of [null, supportOriginOf(markets.JP.support)]) {
    const line = headersFile({ supportOrigin })
      .split('\n')
      .map((row) => row.trim())
      .find((row) => row.startsWith('Content-Security-Policy:'));
    assert.ok(line, 'Content-Security-Policy の行がありません');
    assert.equal(line, `Content-Security-Policy: ${contentSecurityPolicy({ supportOrigin })}`);
  }
});

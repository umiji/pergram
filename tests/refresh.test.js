/**
 * 既存製品の価格の取り直し。
 *
 * 🔒 この処理は「すでに公開しているデータを上書きする」。収集と違って、
 *    間違えたときに下書きで止まらず、そのまま画面に出る。
 *    購入リンク（アフィリエイト）と送料区分を落とさないことを固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildItemUrl, resolveCredentials, toSnapshot } from '../scripts/refresh_prices.js';

const APP_ID = 'dc5bdc72-0000-0000-0000-000000000000';
const ACCESS_KEY = 'pk_testkey';
const AFFILIATE_ID = '11111111.22222222.33333333.44444444';
const APP_URL = 'https://pergram.example/';

const env = (over = {}) => ({
  RAKUTEN_APP_ID: APP_ID,
  RAKUTEN_ACCESS_KEY: ACCESS_KEY,
  RAKUTEN_APP_URL: APP_URL,
  RAKUTEN_AFFILIATE_ID: AFFILIATE_ID,
  ...over,
});

/** API が返す1件の最小形 */
const item = (over = {}) => ({
  itemCode: 'shop:item1',
  itemPrice: 3980,
  itemUrl: 'https://item.rakuten.co.jp/shop/item1/',
  availability: 1,
  postageFlag: 0,
  ...over,
});

/* ---- 認証 ------------------------------------------------------------- */

// 2026-02-10 の認証基盤刷新で、ドメイン・ID 形式・必須パラメータがすべて変わった。
// 収集側だけ直してこちらが旧エンドポイントのまま残ると、走らせても 400 で1件も更新できない。
test('🔒 新しい認証基盤のエンドポイントに applicationId と accessKey を載せる', () => {
  const url = buildItemUrl({
    appId: APP_ID,
    accessKey: ACCESS_KEY,
    affiliateId: AFFILIATE_ID,
    itemCode: 'shop:item1',
  });

  assert.equal(url.origin, 'https://openapi.rakuten.co.jp');
  assert.ok(url.pathname.startsWith('/ichibams/api/IchibaItem/Search/'), url.pathname);
  assert.equal(url.searchParams.get('applicationId'), APP_ID);
  assert.equal(url.searchParams.get('accessKey'), ACCESS_KEY);
  assert.equal(url.searchParams.get('itemCode'), 'shop:item1');
});

// 🔒 affiliateId を渡さないと API はアフィリエイト URL を返さない。
//    その状態で1回走らせると、掲載中の全製品の購入リンクが素の URL に置き換わる。
test('🔒 アフィリエイト ID を必ず問い合わせに載せる', () => {
  const url = buildItemUrl({
    appId: APP_ID,
    accessKey: ACCESS_KEY,
    affiliateId: AFFILIATE_ID,
    itemCode: 'shop:item1',
  });

  assert.equal(url.searchParams.get('affiliateId'), AFFILIATE_ID);
});

// 🔒 収集は素の URL でも下書きが残るだけだが、更新は公開中のリンクを壊す。
//    未設定なら走らせない。警告では足りない。
test('🔒 アフィリエイト ID が未設定なら実行させない', () => {
  assert.throws(() => resolveCredentials(env({ RAKUTEN_AFFILIATE_ID: undefined })), /AFFILIATE/);
  assert.throws(() => resolveCredentials(env({ RAKUTEN_AFFILIATE_ID: '' })), /AFFILIATE/);
});

test('🔒 認証情報が欠けていたら、何が足りないかを名指しして止める', () => {
  assert.throws(() => resolveCredentials(env({ RAKUTEN_ACCESS_KEY: undefined })), /ACCESS_KEY/);
  assert.throws(() => resolveCredentials(env({ RAKUTEN_APP_URL: undefined })), /APP_URL/);
});

test('揃っていれば認証情報を返す', () => {
  const got = resolveCredentials(env());

  assert.equal(got.appId, APP_ID);
  assert.equal(got.accessKey, ACCESS_KEY);
  assert.equal(got.appUrl, APP_URL);
  assert.equal(got.affiliateId, AFFILIATE_ID);
});

/* ---- スナップショット ------------------------------------------------- */

test('🔒 購入リンクをアフィリエイト URL のまま保つ', () => {
  const affiliateUrl = 'https://hb.afl.rakuten.co.jp/hgc/xxxx/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop%2Fitem1%2F';

  const got = toSnapshot({
    item: item({ affiliateUrl }),
    productId: 'rakuten:shop:item1',
    fetchedAt: '2026-08-10',
  });

  assert.equal(got.url, affiliateUrl);
});

test('アフィリエイト URL が返らない店舗は素の商品 URL にする', () => {
  for (const over of [{}, { affiliateUrl: '' }, { affiliateUrl: null }]) {
    const got = toSnapshot({
      item: item(over),
      productId: 'rakuten:shop:item1',
      fetchedAt: '2026-08-10',
    });

    assert.equal(got.url, 'https://item.rakuten.co.jp/shop/item1/');
  }
});

// 送料区分は価格側に付く（販売元ごとに違うため）。価格を取り直すたびに消えると、
// 画面から送料表示が消え、次の更新でまた出る、という揺れ方をする。
test('🔒 送料区分を取り直した価格に引き継ぐ', () => {
  const snapshot = (postageFlag) =>
    toSnapshot({
      item: item({ postageFlag }),
      productId: 'rakuten:shop:item1',
      fetchedAt: '2026-08-10',
    });

  assert.equal(snapshot(0).postage_included, true);
  assert.equal(snapshot(1).postage_included, false);
});

test('🔒 送料区分が返らなければ null。送料無料と決めつけない', () => {
  for (const over of [{}, { postageFlag: null }, { postageFlag: 'unknown' }]) {
    const got = toSnapshot({
      item: { ...item(), postageFlag: undefined, ...over },
      productId: 'rakuten:shop:item1',
      fetchedAt: '2026-08-10',
    });

    assert.equal(got.postage_included, null);
  }
});

test('価格・在庫・取得日を取り直す', () => {
  const got = toSnapshot({
    item: item({ itemPrice: 4200, availability: 0 }),
    productId: 'rakuten:shop:item1',
    fetchedAt: '2026-08-10',
  });

  assert.equal(got.product_id, 'rakuten:shop:item1');
  assert.equal(got.merchant, 'rakuten');
  assert.equal(got.price, 4200);
  assert.equal(got.currency, 'JPY');
  assert.equal(got.in_stock, false);
  assert.equal(got.fetched_at, '2026-08-10');
});

// 🔒 報酬率を価格データに残すと「報酬の高い順」を作れてしまう。
test('🔒 報酬率をスナップショットに残さない', () => {
  const got = toSnapshot({
    item: item({ affiliateRate: 8.0 }),
    productId: 'rakuten:shop:item1',
    fetchedAt: '2026-08-10',
  });

  for (const key of Object.keys(got)) {
    assert.ok(!/rate|reward|commission|報酬/i.test(key), `報酬に関する項目「${key}」が残っています`);
  }
});

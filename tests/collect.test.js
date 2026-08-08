/**
 * 楽天商品検索 API からの下書き作り。
 *
 * 🔒 アフィリエイトは利用する。ただし順位に影響させない。
 *    報酬率を下書きに残すと「報酬の高い順」を作れてしまうので、そもそも取らない。
 *    並び順を決めるのは常に有効成分1単位あたりの価格（requirements.md）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSearchUrl, toDraftRow } from '../scripts/collect_rakuten.js';

const APP_ID = '1000000000000000000';
const AFFILIATE_ID = '11111111.22222222.33333333.44444444';

/** API が返す1件の最小形。実際のレスポンスから必要な項目だけ抜いたもの */
const item = (over = {}) => ({
  itemCode: 'shop:item1',
  itemName: 'ホエイプロテイン 1kg プレーン',
  shopName: 'テスト店',
  itemPrice: 3980,
  itemUrl: 'https://item.rakuten.co.jp/shop/item1/',
  itemCaption: '【栄養成分表示】1食(30g)あたり エネルギー 117kcal、たんぱく質 24.0g、脂質 1.5g',
  mediumImageUrls: [{ imageUrl: 'https://thumbnail.image.rakuten.co.jp/@0_mall/shop/i.jpg?_ex=128x128' }],
  ...over,
});

/* ---- 検索 URL --------------------------------------------------------- */

test('アフィリエイト ID を渡すと検索 URL に載る', () => {
  const url = buildSearchUrl({ appId: APP_ID, affiliateId: AFFILIATE_ID, keyword: 'プロテイン', page: 1 });

  assert.equal(url.searchParams.get('affiliateId'), AFFILIATE_ID);
  assert.equal(url.searchParams.get('applicationId'), APP_ID);
});

test('アフィリエイト ID が無いときは affiliateId を付けない', () => {
  const url = buildSearchUrl({ appId: APP_ID, affiliateId: null, keyword: 'プロテイン', page: 1 });

  assert.ok(!url.searchParams.has('affiliateId'));
});

/* ---- 下書きの行 ------------------------------------------------------- */

test('購入リンクにはアフィリエイト URL を使う', () => {
  const row = toDraftRow(
    item({ affiliateUrl: 'https://hb.afl.rakuten.co.jp/hgc/xxxx/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop%2Fitem1%2F' }),
    '2026-08-09',
  );

  assert.equal(row.url, 'https://hb.afl.rakuten.co.jp/hgc/xxxx/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop%2Fitem1%2F');
  assert.equal(row.is_affiliate, true);
});

test('アフィリエイト URL が返らない店舗は素の商品 URL にする', () => {
  for (const over of [{}, { affiliateUrl: '' }, { affiliateUrl: null }]) {
    const row = toDraftRow(item(over), '2026-08-09');

    assert.equal(row.url, 'https://item.rakuten.co.jp/shop/item1/');
    assert.equal(row.is_affiliate, false);
  }
});

test('🔒 報酬率を下書きに残さない。報酬順という並びを作れないようにする', () => {
  const row = toDraftRow(item({ affiliateRate: 8.0, affiliateUrl: 'https://hb.afl.rakuten.co.jp/hgc/xxxx/' }), '2026-08-09');

  for (const key of Object.keys(row)) {
    assert.ok(!/rate|reward|commission|報酬/i.test(key), `報酬に関する項目「${key}」が下書きに残っています`);
  }
});

test('自動取得と自動抽出が下書きに入る', () => {
  const row = toDraftRow(item(), '2026-08-09');

  assert.equal(row.product_id, 'rakuten:shop:item1');
  assert.equal(row.price, 3980);
  assert.equal(row.shop_name, 'テスト店');
  assert.equal(row.fetched_at, '2026-08-09');
  // サイズ指定は落として保存する
  assert.equal(row.image_url, 'https://thumbnail.image.rakuten.co.jp/@0_mall/shop/i.jpg');
  // 商品名から内容量、説明文から含有量
  assert.equal(row.net_weight_g, 1000);
  assert.equal(row.serving_size_g, 30);
  assert.equal(row.protein_per_serving_g, 24.0);
  // 🔒 ブランドは自動化していない。推測で埋めない
  assert.equal(row.brand, null);
});

test('🔒 説明文から読めなければ含有量は null のまま人間に回る', () => {
  const row = toDraftRow(item({ itemCaption: '大人気のプロテインです。送料無料。' }), '2026-08-09');

  assert.equal(row.protein_per_100g, null);
  assert.equal(row.label_basis, null);
});

/**
 * 楽天商品検索 API からの下書き作り。
 *
 * 🔒 アフィリエイトは利用する。ただし順位に影響させない。
 *    報酬率を下書きに残すと「報酬の高い順」を作れてしまうので、そもそも取らない。
 *    並び順を決めるのは常に有効成分1単位あたりの価格（requirements.md）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSearchUrl,
  resolveOptions,
  shouldExclude,
  toDraftRow,
} from '../scripts/collect_rakuten.js';

const APP_ID = 'dc5bdc72-0000-0000-0000-000000000000';
const ACCESS_KEY = 'pk_testkey';
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

/* ---- 引数 ------------------------------------------------------------- */

// Windows PowerShell 経由の `npm run collect:rakuten -- --keyword X --pages 4` は
// `--keyword` `--pages` というフラグ名だけが落ち、値だけが位置引数として届く。
// 値を取りこぼすと既定のキーワードで収集してしまうので、位置引数でも受ける。
test('位置引数だけでもキーワードとページ数を受け取る', () => {
  const got = resolveOptions(['ホエイプロテイン', '4']);

  assert.equal(got.keyword, 'ホエイプロテイン');
  assert.equal(got.pages, 4);
});

test('名前付きの引数が本則', () => {
  const got = resolveOptions(['--keyword', 'ソイプロテイン', '--pages', '2']);

  assert.equal(got.keyword, 'ソイプロテイン');
  assert.equal(got.pages, 2);
});

// 🔒 余った位置引数を黙って捨てると、指定したつもりの条件で収集していないことに気付けない。
test('🔒 名前付きと位置引数が食い違ったら止める', () => {
  assert.throws(() => resolveOptions(['--keyword', 'ソイプロテイン', 'ホエイプロテイン']), /ページ数/);
  assert.throws(() => resolveOptions(['プロテイン', '4', '余分']), /引数が多すぎます/);
});

test('引数が無ければ既定値', () => {
  const got = resolveOptions([]);

  assert.equal(got.keyword, 'ホエイプロテイン');
  assert.equal(got.pages, 3);
});

test('🔒 ページ数が数値として読めなければ止める', () => {
  assert.throws(() => resolveOptions(['プロテイン', 'たくさん']), /ページ数/);
  assert.throws(() => resolveOptions(['--pages', '0']), /ページ数/);
});

/* ---- 検索 URL --------------------------------------------------------- */

// 2026-02-10 の認証基盤刷新で、ドメイン・ID 形式・必須パラメータがすべて変わった。
// 旧 app.rakuten.co.jp / 19桁の applicationId 単独では 400 になる。
test('🔒 新しい認証基盤のエンドポイントに applicationId と accessKey を載せる', () => {
  const url = buildSearchUrl({ appId: APP_ID, accessKey: ACCESS_KEY, keyword: 'プロテイン', page: 1 });

  assert.equal(url.origin, 'https://openapi.rakuten.co.jp');
  assert.ok(url.pathname.startsWith('/ichibams/api/IchibaItem/Search/'), url.pathname);
  assert.equal(url.searchParams.get('applicationId'), APP_ID);
  assert.equal(url.searchParams.get('accessKey'), ACCESS_KEY);
});

test('アフィリエイト ID を渡すと検索 URL に載る', () => {
  const url = buildSearchUrl({ appId: APP_ID, accessKey: ACCESS_KEY, affiliateId: AFFILIATE_ID, keyword: 'プロテイン', page: 1 });

  assert.equal(url.searchParams.get('affiliateId'), AFFILIATE_ID);
});

test('アフィリエイト ID が無いときは affiliateId を付けない', () => {
  const url = buildSearchUrl({ appId: APP_ID, accessKey: ACCESS_KEY, affiliateId: null, keyword: 'プロテイン', page: 1 });

  assert.ok(!url.searchParams.has('affiliateId'));
});

// 価格の安い順で取ると、下限価格のすぐ真上の帯に張り付く。
// minPrice 1500 で取り直したとき、41件すべてが 1,510〜1,600円 の小容量品だった。
// 比較したい 1kg・3kg 帯には、ページを何枚めくっても到達しない。
test('🔒 売れ筋順で取る。価格の安い順では主力商品帯に届かない', () => {
  const url = buildSearchUrl({ appId: APP_ID, accessKey: ACCESS_KEY, keyword: 'プロテイン', page: 1 });

  assert.equal(url.searchParams.get('sort'), 'standard');
});

// 🔒 sort は「API から何を取ってくるか」であって掲載順ではない。
//    それでも報酬率で取ると、母集団そのものが報酬の高い商品に偏る。
test('🔒 報酬率で並べて取らない', () => {
  const url = buildSearchUrl({ appId: APP_ID, accessKey: ACCESS_KEY, keyword: 'プロテイン', page: 1 });

  assert.ok(!/affiliateRate/i.test(url.href), `報酬率が検索条件に入っています: ${url.href}`);
});

test('🔒 下限価格で小容量品の帯を検索から外す', () => {
  const url = buildSearchUrl({ appId: APP_ID, accessKey: ACCESS_KEY, keyword: 'プロテイン', page: 1 });

  assert.equal(url.searchParams.get('minPrice'), '3000');
});

test('下限価格はカテゴリごとに変えられる', () => {
  const url = buildSearchUrl({ appId: APP_ID, accessKey: ACCESS_KEY, keyword: 'クレアチン', page: 1, minPrice: 800 });

  assert.equal(url.searchParams.get('minPrice'), '800');
});

/* ---- 除外 ------------------------------------------------------------- */

test('🔒 トライアル品は商品名で除外する', () => {
  for (const name of [
    '明治 ザバス ホエイプロテイン100 ショコラ トライアル 1コ',
    'ザバス マッスルエリート ココア味 お試し',
    'ホエイプロテイン サンプル 3食分',
  ]) {
    assert.equal(shouldExclude(name), true, `除外されていません: ${name}`);
  }
});

test('通常の製品は除外しない', () => {
  assert.equal(shouldExclude('ホエイプロテイン 1kg プレーン'), false);
  assert.equal(shouldExclude('WPI ホエイプロテインアイソレート 3kg'), false);
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

// 送料の金額は API から取れない。取れるのは「価格に含むか否か」の2値だけ。
// postageFlag: 0 = 送料込み / 1 = 送料別（楽天商品検索 API のドキュメント）
test('送料が価格に含まれるかどうかを下書きに残す', () => {
  assert.equal(toDraftRow(item({ postageFlag: 0 }), '2026-08-09').postage_included, true);
  assert.equal(toDraftRow(item({ postageFlag: 1 }), '2026-08-09').postage_included, false);
});

test('🔒 送料区分が返らなければ null。送料無料と決めつけない', () => {
  for (const over of [{}, { postageFlag: null }, { postageFlag: 'unknown' }]) {
    assert.equal(toDraftRow(item(over), '2026-08-09').postage_included, null);
  }
});

// 自動読み取りは説明文の一部しか拾えない。読めなかった行を後から機械にも人にも
// 回せるよう、元の説明文をそのまま下書きに残す。🔒 残すのは下書き（_drafts）まで。
test('商品説明文をそのまま下書きに残す', () => {
  const row = toDraftRow(item(), '2026-08-09');

  assert.equal(
    row.item_caption,
    '【栄養成分表示】1食(30g)あたり エネルギー 117kcal、たんぱく質 24.0g、脂質 1.5g',
  );
});

test('説明文が無い商品では null にする', () => {
  for (const over of [{ itemCaption: undefined }, { itemCaption: null }, { itemCaption: '' }]) {
    assert.equal(toDraftRow(item(over), '2026-08-09').item_caption, null);
  }
});

test('🔒 説明文から読めなければ含有量は null のまま人間に回る', () => {
  const row = toDraftRow(item({ itemCaption: '大人気のプロテインです。送料無料。' }), '2026-08-09');

  assert.equal(row.protein_per_100g, null);
  assert.equal(row.label_basis, null);
});

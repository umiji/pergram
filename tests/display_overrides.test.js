/**
 * 掲載中の製品の「見せ方」だけを1ファイルにまとめて上書きする仕組み。
 *
 * モックアップでは、楽天のページタイトルをそのまま出すと販促文と検索用の語で読めない。
 * 手で直したいのはブランドと商品名だけなのに、その2つは products.json と
 * product_i18n.json に分かれていて、しかも取り込みのたびに生成し直される。
 *
 * 🔒 上書きしてよいのは表示用の文言だけ。価格・含有量・並び順に関わる項目は
 *    ここから触れない。触れると「単価の安い順」という並びを手で捻じ曲げられる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DISPLAY_FIELDS, applyDisplayOverrides } from '../src/lib/display_overrides.js';

const data = () => ({
  products: [
    { id: 'rakuten:a', brand: null, serving_size_g: 30 },
    { id: 'rakuten:b', brand: 'ザバス', serving_size_g: 28 },
  ],
  productI18n: [
    { product_id: 'rakuten:a', locale: 'ja', name: 'コスパ最強 10kg 送料無料 筋トレ' },
    { product_id: 'rakuten:a', locale: 'en', name: 'Cheap 10kg Free Shipping' },
    { product_id: 'rakuten:b', locale: 'ja', name: 'ザバス ホエイ100 700g' },
  ],
});

test('ブランドを埋める', () => {
  const got = applyDisplayOverrides(data(), [{ product_id: 'rakuten:a', brand: '箱プロ' }]);

  assert.equal(got.products.find((p) => p.id === 'rakuten:a').brand, '箱プロ');
});

test('商品名を差し替える', () => {
  const got = applyDisplayOverrides(data(), [
    { product_id: 'rakuten:a', name_ja: 'ホエイプロテイン プレーン 10kg', name_en: 'Whey Protein Plain 10kg' },
  ]);

  const ja = got.productI18n.find((r) => r.product_id === 'rakuten:a' && r.locale === 'ja');
  const en = got.productI18n.find((r) => r.product_id === 'rakuten:a' && r.locale === 'en');
  assert.equal(ja.name, 'ホエイプロテイン プレーン 10kg');
  assert.equal(en.name, 'Whey Protein Plain 10kg');
});

test('書かなかった項目は元の値を残す', () => {
  const got = applyDisplayOverrides(data(), [{ product_id: 'rakuten:b', brand: 'SAVAS' }]);

  assert.equal(got.productI18n.find((r) => r.product_id === 'rakuten:b').name, 'ザバス ホエイ100 700g');
});

// 🔒 単価と並び順は有効成分1単位あたりの価格だけで決まる。
//    表示用のファイルから内容量や1食量を書き換えられると、その原則が崩れる。
test('🔒 表示以外の項目は上書きさせない', () => {
  const got = applyDisplayOverrides(data(), [
    { product_id: 'rakuten:a', brand: '箱プロ', serving_size_g: 1, price: 1, amount_elemental: 9999 },
  ]);

  const product = got.products.find((p) => p.id === 'rakuten:a');
  assert.equal(product.serving_size_g, 30);
  assert.equal(product.price, undefined);
  assert.equal(product.amount_elemental, undefined);
  assert.deepEqual(DISPLAY_FIELDS, ['brand', 'name_ja', 'name_en']);
});

test('掲載していない製品の指定は黙って無視する', () => {
  const got = applyDisplayOverrides(data(), [{ product_id: 'rakuten:zzz', brand: '架空' }]);

  assert.equal(got.products.length, 2);
  assert.equal(got.productI18n.length, 3);
});

test('元のデータを書き換えない', () => {
  const original = data();
  applyDisplayOverrides(original, [{ product_id: 'rakuten:a', brand: '箱プロ', name_ja: '別の名前' }]);

  assert.equal(original.products[0].brand, null);
  assert.equal(original.productI18n[0].name, 'コスパ最強 10kg 送料無料 筋トレ');
});

test('上書きファイルが空でもそのまま通す', () => {
  for (const overrides of [[], null, undefined]) {
    const got = applyDisplayOverrides(data(), overrides);
    assert.equal(got.products.length, 2);
  }
});

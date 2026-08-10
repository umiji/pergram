/**
 * 商品説明文（楽天 itemCaption）からの栄養成分表示の読み取り。
 *
 * 🔒 読めなかったものを推測で埋めない。読めなければ null を返し、人間の入力に回す。
 *    誤った値を1件通すと単価が狂い、順位が狂い、比較そのものが嘘になる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { extractProteinFromCaption } from '../src/lib/normalize_protein.js';

// 「1食(30g)あたり／100gあたり」の2列表を1行に潰した書き方。
// たんぱく質の値も「24.0g/80.0g」と2つ並ぶが、直前にある基準は 100gあたり なので
// 24.0 を「100gあたり24g」と読んでしまう。含有率が 80% → 24% になり単価が3倍以上狂う。
// 🔒 どちらの基準の値か決められない以上、読まない。
test('🔒 2つの基準を併記した表から、片方の値だけを拾わない', () => {
  const caption =
    '栄養成分表示 1食(30g)あたり／100gあたり エネルギー 117kcal/390kcal たんぱく質 24.0g/80.0g';

  const got = extractProteinFromCaption(caption);

  assert.equal(got.per100g, null);
  assert.equal(got.basis, null);
  assert.equal(got.ambiguous, true);
});

test('🔒 括弧で2つ目の値を併記した表記も読まない', () => {
  const caption = '【栄養成分表示】1食(30g)あたり たんぱく質 24.0g（80.0g）';

  const got = extractProteinFromCaption(caption);

  assert.equal(got.per100g, null);
  assert.equal(got.ambiguous, true);
});

// 「アミノ酸組成(タンパク質100gあたり)」の "100g" は基準の書き方であって含有量ではない。
// これを値として読むと含有率100%の製品として単価が下振れし、最安として先頭に並ぶ。
// 🔒 プロテイン粉末に含有率100%は存在しない。
test('🔒 アミノ酸組成の基準表記「タンパク質100gあたり」を含有量として読まない', () => {
  const caption =
    '栄養成分表示 100gあたり エネルギー 402kcal たんぱく質(乾物換算) 76.19g(80.61g) ' +
    '脂質 5.97g 炭水化物 9.79g ■【アミノ酸組成(タンパク質100gあたり)(mg)】 バリン ：5449 イソロイシン ：5952';

  const got = extractProteinFromCaption(caption);

  assert.notEqual(got.per100g, 100, '基準表記の 100g を含有量として読んでいます');
  assert.equal(got.per100g, null);
});

// 「たん白質100g中（g）」も同じ。アミノ酸の内訳表の見出しであって含有量ではない。
test('🔒 アミノ酸内訳の見出し「たん白質100g中」を含有量として読まない', () => {
  const caption =
    '栄養成分表示 100gあたり エネルギー 400kcal 脂質 6.0g 炭水化物 8.0g ' +
    'アミノ酸組成 たん白質100g中（g）必須アミノ酸 ヒスチジン 1.7 イソロイシン 5.9 ロイシン 10.3';

  const got = extractProteinFromCaption(caption);

  assert.notEqual(got.per100g, 100, '基準表記の 100g を含有量として読んでいます');
  assert.equal(got.per100g, null);
});

// 「ホエイたんぱく質100%」は原材料がホエイであることの表示。含有率ではない。
// 含有率として読むと単価が実際の 1/1.3 前後に下振れし、順位が狂う。
test('🔒 原材料表示「ホエイたんぱく質100%」を含有率として読まない', () => {
  for (const caption of [
    '【タンパク質高配合】1食あたりたんぱく質23g ホエイたんぱく質100％ アミノ酸スコア100',
    '原材料は乳たんぱく質100%。余計なものは入れていません',
    'たん白質100%のシンプル設計',
  ]) {
    const got = extractProteinFromCaption(caption);
    assert.equal(got.per100g, null, `「${caption}」から 100% を含有率として読んでいます`);
  }
});

// 「81.9%（製品無水あたり）」は水分を除いた換算値で、製品そのままの含有率（77.9%）ではない。
// 無水換算を含有率として読むと含有量を5%ほど過大評価し、単価が実際より安く出る。
test('🔒 無水換算・乾物換算の含有率を製品の含有率として読まない', () => {
  for (const caption of [
    'タンパク質含有率 81.9%（製品無水あたり）の吸収の良いハイスペックプロテイン',
    'たんぱく質含有率 82.1%(乾物換算)',
    'たん白質含有率 80.0% 乾燥重量あたり',
  ]) {
    const got = extractProteinFromCaption(caption);
    assert.equal(got.per100g, null, `「${caption}」から無水換算値を読んでいます`);
  }
});

// 値が1つだけなら、これまでどおり読める（上の防御で潰していないことの確認）
test('基準が2つ書かれていても、値が1つずつ対応していれば読む', () => {
  const caption = '100gあたり たんぱく質 80.0g ／ 1食(30g)あたり たんぱく質 24.0g';

  const got = extractProteinFromCaption(caption);

  assert.equal(got.per100g, 80);
  assert.equal(got.ambiguous, false);
});

// 全角パーセントはラベルの転記でよく混ざる。読めないと取りこぼしになる。
test('全角パーセントの含有率も読む', () => {
  const got = extractProteinFromCaption('■高品質ホエイ たんぱく質含有率 71％ ■内容量 3kg');

  assert.equal(got.basis, 'ratio');
  assert.equal(got.per100g, 71);
});

// 「20%OFF」の 20 を含有率として読むと、含有率20%の製品として単価が4倍に狂う。
test('🔒 割引率を含有率として読まない', () => {
  for (const caption of [
    '【期間限定】たんぱく質 20%OFF セール中！ホエイプロテイン 1kg',
    'タンパク質 30％オフ キャンペーン',
    'たんぱく質 25%引き',
  ]) {
    const got = extractProteinFromCaption(caption);
    assert.equal(got.per100g, null, `「${caption}」から割引率を読んでいます`);
  }
});

test('1食あたり表記から100gあたりに直す', () => {
  const caption =
    '【栄養成分表示】1食(30g)あたり エネルギー 117kcal、たんぱく質 24.2g、脂質 1.5g、炭水化物 1.9g';

  const got = extractProteinFromCaption(caption);

  assert.equal(got.basis, 'serving');
  assert.equal(got.servingSizeG, 30);
  assert.equal(got.proteinPerServingG, 24.2);
  assert.ok(Math.abs(got.per100g - 80.67) < 0.01);
});

test('100gあたり表記をそのまま読む', () => {
  const caption = '栄養成分表示(100gあたり)：エネルギー 390kcal たんぱく質 80.7g 脂質 5.4g';

  const got = extractProteinFromCaption(caption);

  assert.equal(got.basis, 'per100g');
  assert.equal(got.per100g, 80.7);
  assert.equal(got.servingSizeG, null);
});

test('含有率表記を100gあたりgとして読む', () => {
  const caption = '■高品質ホエイ たんぱく質含有率 71% ■内容量 3kg';

  const got = extractProteinFromCaption(caption);

  assert.equal(got.basis, 'ratio');
  assert.equal(got.per100g, 71);
});

test('全角の数字と単位を読む', () => {
  const caption = '栄養成分表示　１食（３０ｇ）あたり　たんぱく質　２４．０ｇ';

  const got = extractProteinFromCaption(caption);

  assert.equal(got.servingSizeG, 30);
  assert.equal(got.proteinPerServingG, 24);
  assert.equal(got.per100g, 80);
});

test('表記ゆれ（蛋白質・タンパク質）を読む', () => {
  for (const token of ['蛋白質', 'タンパク質', 'たん白質']) {
    const got = extractProteinFromCaption(`製品100g当たり ${token} 76.5g`);
    assert.equal(got.per100g, 76.5, token);
  }
});

test('脂質・炭水化物・エネルギーを取り違えない', () => {
  const caption = '100gあたり エネルギー 402kcal 脂質 5.4g 炭水化物 5.1g たんぱく質 76.5g';

  const got = extractProteinFromCaption(caption);

  assert.equal(got.per100g, 76.5);
});

test('1食あたりと100gあたりが両方あり整合するなら100gあたりを採る', () => {
  const caption =
    '栄養成分表示 100gあたり たんぱく質 80.0g ／ 1食(30g)あたり たんぱく質 24.0g';

  const got = extractProteinFromCaption(caption);

  assert.equal(got.basis, 'per100g');
  assert.equal(got.per100g, 80);
  assert.equal(got.servingSizeG, 30);
});

test('食い違う値が読めたら ambiguous にして何も返さない', () => {
  const caption = '100gあたり たんぱく質 80.0g ／ 製品100g当たり たんぱく質 60.0g';

  const got = extractProteinFromCaption(caption);

  assert.equal(got.ambiguous, true);
  assert.equal(got.per100g, null);
});

test('想定レンジ外の値は返さず人間の入力に回す', () => {
  const caption = '100gあたり たんぱく質 5.0g';

  const got = extractProteinFromCaption(caption);

  assert.equal(got.per100g, null);
  assert.equal(got.ambiguous, false);
});

test('基準の書かれていない数値は採らない', () => {
  const caption = 'たんぱく質 24.2g 配合の本格ホエイプロテイン';

  const got = extractProteinFromCaption(caption);

  assert.equal(got.per100g, null);
});

test('栄養成分表示が無い説明文では何も返さない', () => {
  for (const caption of ['送料無料 大容量3kg 選べるフレーバー', '', null, undefined]) {
    const got = extractProteinFromCaption(caption);
    assert.equal(got.per100g, null);
    assert.equal(got.servingSizeG, null);
    assert.equal(got.ambiguous, false);
  }
});

test('1食量だけ読めて含有量が読めない場合は1食量だけ返す', () => {
  const caption = '1食(30g)あたり エネルギー 117kcal 脂質 1.5g';

  const got = extractProteinFromCaption(caption);

  assert.equal(got.servingSizeG, 30);
  assert.equal(got.per100g, null);
});

test('1食量として非現実的な値は採らない', () => {
  const caption = '1袋(1000g)あたり たんぱく質 800g';

  const got = extractProteinFromCaption(caption);

  assert.equal(got.servingSizeG, null);
  assert.equal(got.per100g, null);
});

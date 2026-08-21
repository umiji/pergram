/**
 * X 投稿文の機械チェック。
 *
 * 🔒 投稿は取り消せない。文字数超過と禁止語は、押した後では直せない。
 *    ここが落とせなかったものは、そのまま公開アカウントから出ていく。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  POST_LIMIT,
  WEIGHTED_LIMIT,
  hasError,
  lintPost,
  lintThread,
  postLength,
  splitDraft,
} from '../src/lib/x_post.js';

const codes = (issues) => issues.map((i) => i.code);

test('日本語は1文字が加重2。140文字がちょうど上限の 280 になる', () => {
  const text = 'あ'.repeat(POST_LIMIT);

  const { chars, weighted } = postLength(text);

  assert.equal(chars, 140);
  assert.equal(weighted, WEIGHTED_LIMIT);
  assert.equal(hasError(lintPost(text)), false);
});

test('半角英数は加重1。同じ140文字でも加重は半分', () => {
  assert.equal(postLength('a'.repeat(140)).weighted, 140);
});

// t.co が長さを固定するので、実際の URL がどれだけ長くても 23 文字として数えられる。
// 素の length で数えると、長い URL の投稿だけが投稿時に弾かれる。
test('🔒 URL は実際の長さに関わらず 23 文字として数える', () => {
  const short = postLength('https://a.jp/');
  const long = postLength(`https://pergram.example/ja/protein/?${'q'.repeat(300)}`);

  assert.equal(short.chars, 23);
  assert.equal(long.chars, 23);
  assert.equal(long.weighted, 23);
});

test('絵文字は加重2で数える', () => {
  assert.equal(postLength('🏋').weighted, 2);
});

test('140文字を超えたら error。超過分を示す', () => {
  const issues = lintPost('あ'.repeat(141));

  assert.ok(codes(issues).includes('length.chars'));
  assert.match(issues[0].message, /超過 1/);
});

test('🔒 CLAUDE.md の禁止語を通さない', () => {
  for (const word of ['効果', '改善', 'おすすめ', '安心', '実感', '高品質', '話題の']) {
    assert.ok(
      codes(lintPost(`このプロテインは${word}です`)).some((c) => c.startsWith('copy.')),
      `「${word}」が素通りしている`,
    );
  }
});

test('🔒 「ツール」と呼ばない。「サービス」と呼ぶ', () => {
  assert.ok(codes(lintPost('比較ツールを作りました')).includes('voice.tool'));
  assert.equal(hasError(lintPost('比較できるWebサービスです')), false);
});

test('🔒 ブランド表記は全て小文字。Pergram を通さない', () => {
  assert.ok(codes(lintPost('Pergram を公開しました')).includes('brand.case'));
  assert.equal(hasError(lintPost('pergram を公開しました')), false);
});

test('🔒 成分の効能・診断的表現・除外文脈を通さない（N-02 / N-07 / N-09）', () => {
  assert.ok(codes(lintPost('筋肥大に必要な量')).includes('n02.claim'));
  assert.ok(codes(lintPost('あなたはタンパク質が不足しています')).includes('n07.diagnose'));
  assert.ok(codes(lintPost('薄毛が気になる人へ')).includes('n09.aga'));
});

test('ハッシュタグは2個まで。3個でスパム判定に寄る', () => {
  assert.equal(hasError(lintPost('本文 #筋トレ #プロテイン')), false);
  assert.ok(codes(lintPost('本文 #筋トレ #プロテイン #コスパ')).includes('hashtag.count'));
});

test('URL の中の # をハッシュタグと数えない', () => {
  assert.equal(hasError(lintPost('本文 https://example.com/a#b#c#d #筋トレ')), false);
});

test('金額に基準が付いていなければ警告する', () => {
  assert.ok(codes(lintPost('最安は¥9.9でした')).includes('number.basis'));
  assert.equal(
    codes(lintPost('最安は¥9.9 / タンパク質1gでした')).includes('number.basis'),
    false,
  );
});

// アルゴリズム対策。1投稿目に URL を置くと表示が伸びない。
// docs/Marketing/X_post_strategy.md §4
test('🔒 ツリーの1投稿目に URL を置かない', () => {
  const issues = lintThread(['本文 https://example.com/', '2投稿目 https://example.com/']);

  assert.ok(codes(issues).includes('url.firstPost'));
  assert.equal(issues.find((i) => i.code === 'url.firstPost').post, 1);
});

test('単発の投稿では URL を置いてよい', () => {
  assert.equal(hasError(lintThread(['本文 https://example.com/'])), false);
});

test('ツリーなのに2投稿目に URL が無ければ error（誘導にならない）', () => {
  assert.ok(codes(lintThread(['本文', '補足だけ'])).includes('thread.noUrl'));
});

test('下書きは --- の行で投稿ごとに割れる', () => {
  assert.deepEqual(splitDraft('1つ目\n\n---\n2つ目\n'), ['1つ目', '2つ目']);
});

test('画像の中の文言も同じチェックに掛けられる（長さ以外）', () => {
  const issues = lintPost('効果を実感できるツール');

  assert.ok(codes(issues).includes('copy.kouka'));
  assert.ok(codes(issues).includes('voice.tool'));
});

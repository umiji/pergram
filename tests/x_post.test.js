/**
 * X 投稿文の機械チェック。
 *
 * 🔒 投稿は取り消せない。文字数超過と禁止語は、押した後では直せない。
 *    ここが落とせなかったものは、そのまま公開アカウントから出ていく。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FOLD_LINES,
  POST_LIMIT,
  WEIGHTED_LIMIT,
  hasError,
  lintPost,
  lintThread,
  postLength,
  splitDraft,
  timelineLayout,
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

/* ── タイムラインでの見え方 ── */

// 最後の1つだけ伏せる型は、どこで「さらに表示」に切れるかが分かって初めて設計できる。
// 目視で数えると、伏せたつもりの行が見えていたり、見せたい行が隠れていたりする。
test('🔒 折りたたみの位置を出す。伏せた行と見える行を取り違えない', () => {
  const post = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '答えはこれ'].join('\n');

  const layout = timelineLayout(post);

  assert.equal(layout.lineCount, 11);
  assert.equal(layout.folded, true);
  assert.equal(layout.visible.length, FOLD_LINES);
  assert.deepEqual(layout.hidden, ['答えはこれ']);
});

test('9行以内は全端末で全文。折りたたみは無い', () => {
  const layout = timelineLayout(Array.from({ length: 9 }, (_, i) => `行${i}`).join('\n'));

  assert.equal(layout.folded, false);
  assert.deepEqual(layout.hidden, []);
});

test('折りたたみが起きたら warn で位置を知らせる（error にはしない。意図的な引きもあるため）', () => {
  const issues = lintPost(['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', '伏せた行'].join('\n'));
  const fold = issues.find((i) => i.code === 'layout.fold');

  assert.equal(fold.severity, 'warn');
  assert.match(fold.message, /伏せた行/);
});

// 1行目が折り返すとフックが2行に割れて、指が止まらない。
test('1行目が長すぎたら warn。スマホは20〜25文字で折り返す', () => {
  const issues = lintPost(`${'あ'.repeat(30)}\n2行目`);

  assert.ok(issues.some((i) => i.code === 'layout.firstLine'));
  assert.equal(lintPost(`${'あ'.repeat(20)}\n2行目`).some((i) => i.code === 'layout.firstLine'), false);
});

test('長い行の位置を返す（箇条書きが折り返していないか見る）', () => {
  const layout = timelineLayout(`短い\n${'あ'.repeat(40)}`);

  assert.deepEqual(layout.longLines, [1]);
});

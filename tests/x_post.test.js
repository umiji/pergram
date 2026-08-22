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

test('クリフハンガー型のツリーは、2投稿目に URL が無くても通る', () => {
  // 以前は「2投稿目に URL が無ければ error」にしていたが、それは誘導のためのツリーしか
  // 想定していなかった。クリフハンガー型の2投稿目は答えであって URL ではない。
  const issues = lintThread([
    '「大容量＝お得」だと思ってた。\n\nところが、比較してみると👇',
    'タンパク質1gあたりで並べ直すと、順位が入れ替わります。',
  ]);

  assert.equal(hasError(issues), false, JSON.stringify(issues));
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

// 🔒 ステマ感は「毎回どこかで自分の宣伝に着地する」ことから出る。
//    誘導の言い回しは2投稿目の仕事で、単発と1投稿目に混ざるとその回が告知になる。
test('🔒 単発と1投稿目の誘導文句を warn で拾う', () => {
  const draft = 'ECの「安い順」は最安を教えてくれません。\n詳しくはこちら。';

  const solo = lintPost(draft).find((i) => i.code === 'promo.cta');
  const first = lintPost(draft, { position: 1 }).find((i) => i.code === 'promo.cta');

  assert.equal(solo.severity, 'warn');
  assert.match(solo.message, /詳しくは/);
  assert.ok(first, '1投稿目でも拾う');
});

test('ツリーの2投稿目は誘導のために置く場所なので、そこでは拾わない', () => {
  const issues = lintPost('一覧はこちら https://example.test/ja/ 登録不要です。', { position: 2 });

  assert.equal(issues.some((i) => i.code === 'promo.cta'), false);
});

test('「作りました」「公開しました」も誘導として拾う（告知は毎回しない）', () => {
  for (const line of ['比較できるサービスを作りました。', 'β版を公開しました。', 'よければ使ってみてください。']) {
    assert.ok(
      lintPost(line).some((i) => i.code === 'promo.cta'),
      `拾えていない: ${line}`,
    );
  }
});

test('事実だけの投稿は誘導として拾わない', () => {
  const issues = lintPost('ホエイはチーズを作るときに出る乳清が原料です。\n主産物ではありません。');

  assert.equal(issues.some((i) => i.code === 'promo.cta'), false);
});

// 🔒 人格。「企業アカウントだけど、中の人が普通に喋っている」から外れたら落とす
test('🔒 企業の定型文は error', () => {
  for (const line of [
    '当社独自のデータ分析により算出しました。',
    'このたび新サービスをローンチしました。',
    '是非ともご利用くださいませ。',
  ]) {
    const issue = lintPost(line).find((i) => i.code === 'voice.corporate');
    assert.ok(issue, `拾えていない: ${line}`);
    assert.equal(issue.severity, 'error');
  }
});

test('🔒 優劣の推奨は error', () => {
  for (const line of ['絶対買ったほうがいい。', 'これは買うべき。']) {
    const issue = lintPost(line).find((i) => i.code === 'voice.recommend');
    assert.ok(issue, `拾えていない: ${line}`);
    assert.equal(issue.severity, 'error');
  }
});

test('テンションで押す書き方は warn', () => {
  const issue = lintPost('これガチで神です。').find((i) => i.code === 'voice.hype');

  assert.equal(issue.severity, 'warn');
});

// 🔒 価格は毎日動く。取得日が古いまま「今日の」と書くと有利誤認になる
test('🔒 「今日の最安」は取得日の確認を促す warn', () => {
  assert.ok(lintPost('今日の最安はこれ。').some((i) => i.code === 'voice.today'));
  assert.ok(lintPost('今日の1g単価を見ていた。').some((i) => i.code === 'voice.today'));
  assert.equal(lintPost('1g単価を見ていた。').some((i) => i.code === 'voice.today'), false);
});

// ○ 列の口調は素通りする。人格の側を機械が邪魔しない
test('中の人が普通に喋っている文は素通りする', () => {
  const draft = 'これ、意外でした。\n\n普通に考えるとAなんですが、データを見るとBでした。\n\nみなさんはどうですか？';

  assert.deepEqual(lintPost(draft), []);
});

test('ツリーは3段まで。4段目から warn', () => {
  const post = 'プロテインの単価の話。';

  assert.equal(lintThread([post, post, post]).some((i) => i.code === 'thread.length'), false);
  assert.ok(lintThread([post, post, post, post]).some((i) => i.code === 'thread.length'));
});

// 🔒 一応公式アカウント。本文はラフでよいが、読者への問いかけだけは敬語にする
test('🔒 読者への問いかけが敬語でなければ warn', () => {
  assert.ok(lintPost('みんなはどこで決めてる？').some((i) => i.code === 'voice.casualQuestion'));
  assert.ok(lintPost('どっち派？').some((i) => i.code === 'voice.casualQuestion'));

  for (const ok of ['みなさんはどこで決めていますか？', 'みなさんはどうですか？', 'これ、気になりませんか？']) {
    assert.equal(
      lintPost(ok).some((i) => i.code === 'voice.casualQuestion'),
      false,
      `敬語なのに拾われた: ${ok}`,
    );
  }
});

// 🔒 AI っぽい文章。対句・倒置・抽象名詞・余韻の語尾
test('🔒 ポエムになっている書き方を warn で拾う', () => {
  for (const line of [
    '比べてるのは値段じゃなくて、何を買っているかだった。',
    'つまり単価の問題ではなく、単位の問題だった。',
    '結局、基準が2つあるということです。',
    '順位が変わるだけな気がする。',
  ]) {
    assert.ok(lintPost(line).some((i) => i.code === 'voice.poem'), `拾えていない: ${line}`);
  }
});

test('普通に喋っている結論はポエム判定しない', () => {
  const plain = '値段だけ見ても比較にならないので、結局そこまで全部見ないといけない。';

  assert.equal(lintPost(plain).some((i) => i.code === 'voice.poem'), false);
});

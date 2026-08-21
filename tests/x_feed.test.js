/**
 * 過去投稿フィードの読み取りと重複判定。
 *
 * 🔒 フィードは外部サービスが吐く。RSS 2.0 でも Atom でも、本文が description でも
 *    content:encoded でも読めなければ「過去投稿が無い」ことになり、重複チェックが
 *    黙って素通りする。落ちるのではなく素通りするので、気づけるのはテストだけ。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRICE_TOPICS,
  SIMILAR_THRESHOLD,
  TOPIC_LEXICON,
  mostSimilar,
  normalizeForCompare,
  parseFeed,
  similarity,
  priceBalance,
  topicCounts,
  unusedTopics,
} from '../src/lib/x_feed.js';

const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>pergram の投稿</title>
  <item>
    <title>古い方</title>
    <description>セール前に電卓を叩くのをやめた</description>
    <link>https://x.com/pergram/status/1</link>
    <pubDate>Mon, 04 Aug 2026 09:00:00 GMT</pubDate>
  </item>
  <item>
    <title>新しい方</title>
    <description><![CDATA[<p>タンパク質1gあたりの価格で並べ替える</p><br>含有率で割る]]></description>
    <link>https://x.com/pergram/status/2</link>
    <pubDate>Wed, 19 Aug 2026 09:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

test('RSS 2.0 を読み、新しい順に並べる', () => {
  const items = parseFeed(rss);

  assert.equal(items.length, 2);
  assert.equal(items[0].title, '新しい方');
  assert.equal(items[0].publishedAt, '2026-08-19T09:00:00.000Z');
  assert.equal(items[0].link, 'https://x.com/pergram/status/2');
});

test('CDATA と HTML タグを落として本文にする。<br> と </p> は改行にする', () => {
  const [latest] = parseFeed(rss);

  assert.equal(latest.text, 'タンパク質1gあたりの価格で並べ替える\n\n含有率で割る');
});

test('Atom も同じ形で読める', () => {
  const atom = `<?xml version="1.0"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title>投稿</title>
      <link rel="alternate" href="https://x.com/pergram/status/9"/>
      <published>2026-08-20T00:00:00Z</published>
      <content type="html">&lt;p&gt;袋の値段では順位は出ない&lt;/p&gt;</content>
    </entry>
  </feed>`;

  const [item] = parseFeed(atom);

  assert.equal(item.text, '袋の値段では順位は出ない');
  assert.equal(item.link, 'https://x.com/pergram/status/9');
  assert.equal(item.publishedAt, '2026-08-20T00:00:00.000Z');
});

// 二重エスケープされた HTML（&amp;lt;p&amp;gt;）は、実体を戻した後にもう一度タグが現れる。
// 1回しか落とさないと本文に "<p>" がそのまま残り、重複判定が狂う。
test('二重にエスケープされたタグも落とす', () => {
  const feed = `<rss><channel><item><description>&amp;lt;p&amp;gt;本文&amp;lt;/p&amp;gt;</description></item></channel></rss>`;

  assert.equal(parseFeed(feed)[0].text, '本文');
});

test('日付が無い item でも落ちない。並びの最後に置く', () => {
  const feed = `<rss><channel>
    <item><description>日付なし</description></item>
    <item><description>日付あり</description><pubDate>Wed, 19 Aug 2026 09:00:00 GMT</pubDate></item>
  </channel></rss>`;

  const items = parseFeed(feed);

  assert.equal(items[0].text, '日付あり');
  assert.equal(items[1].publishedAt, null);
});

test('item が1件も無いフィードは空配列。例外にしない', () => {
  assert.deepEqual(parseFeed('<rss><channel><title>空</title></channel></rss>'), []);
});

test('比較用の正規化は URL・記号・空白を落とす', () => {
  assert.equal(normalizeForCompare('電卓、やめた！ https://x.com/a #筋トレ'), '電卓やめた筋トレ');
});

test('同じ文の近さは 1。無関係な文は閾値を下回る', () => {
  assert.equal(similarity('タンパク質1gあたりの価格', 'タンパク質1gあたりの価格'), 1);
  assert.ok(similarity('タンパク質1gあたりの価格', '今日は雨が降っています') < SIMILAR_THRESHOLD);
});

// 言い回しを変えただけの投稿は「別の切り口」ではない。ここで拾えないと同じ話が続く。
test('🔒 言い回しだけ変えた投稿は近いと判定する', () => {
  const score = similarity(
    'セールのたびに電卓を叩くのをやめた。タンパク質1gあたりで比べる。',
    'セールのたびに電卓を叩くのはやめた。タンパク質1gあたりで比べている。',
  );

  assert.ok(score >= SIMILAR_THRESHOLD, `近さ ${score} が閾値を下回った`);
});

test('近い過去投稿を近い順に返す', () => {
  const items = parseFeed(rss);

  const [first] = mostSimilar('電卓を叩くのをやめた話', items);

  assert.match(first.item.text, /電卓/);
});

test('直近で話したトピックと、まだ話していないトピックを数える', () => {
  const items = parseFeed(rss);

  const counts = new Map(topicCounts(items));

  assert.equal(counts.get('単価の出し方'), 1);
  assert.ok(unusedTopics(items).includes('買い物の実務'));
});

// 以前はトピック一覧が13項目とも価格の言い換えで、どれを選んでも単価の話になった。
// 「毎回同じことを言っている」状態は、この一覧が痩せることから始まる。
test('🔒 トピック一覧の過半数が価格の話にならないようにする', () => {
  const all = Object.keys(TOPIC_LEXICON).length;

  assert.ok(all >= 8, `トピックが ${all} 個しかない`);
  assert.ok(PRICE_TOPICS.length * 2 < all, '価格系のトピックが多すぎる');
});

test('価格の話に偏っていたら数で示す', () => {
  const price = { text: 'タンパク質1gあたりの単価で並べています' };
  const other = { text: '栄養成分表示の基準が2つ書いてあるときの読み方' };

  assert.equal(priceBalance([price, price, price]).heavy, true);
  assert.equal(priceBalance([price, other, other]).heavy, false);
  assert.equal(priceBalance([]).heavy, false);
});

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
  ANNOUNCE_TYPE,
  POST_TYPES,
  PRICE_TOPICS,
  SELF_TOPICS,
  SELF_TYPES,
  SIMILAR_THRESHOLD,
  TOPIC_FAMILIES,
  TOPIC_LEXICON,
  familyCounts,
  familyOf,
  linkBalance,
  mostSimilar,
  nextTopics,
  normalizeForCompare,
  parseFeed,
  selfBalance,
  similarity,
  priceBalance,
  topicCounts,
  typeBalance,
  typeOf,
  nextTypes,
  untypedCount,
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
  assert.ok(unusedTopics(items).includes('買い方の実務'));
});

// 一覧が痩せると、アカウントが1つの話しかしなくなる。最初の版は13項目すべてが
// 価格の言い換えで、どれを選んでも単価の話になった。次の版は「うちのデータ」「うちの作業」
// が半分を占め、どれを選んでもサービスの紹介に着地した（読み手からは宣伝に見える）。
test('🔒 ジャンル一覧が価格にも自社にも偏らないようにする', () => {
  const all = Object.keys(TOPIC_LEXICON).length;

  assert.ok(all >= 16, `ジャンルが ${all} 個しかない`);
  assert.ok(PRICE_TOPICS.length * 4 < all, '価格系のジャンルが多すぎる');
  assert.ok(SELF_TOPICS.length * 4 < all, '自社の話のジャンルが多すぎる');
});

test('🔒 すべてのジャンルがどれかの族に属している', () => {
  const orphans = Object.keys(TOPIC_LEXICON).filter((topic) => familyOf(topic) === 'その他');

  assert.deepEqual(orphans, [], `族に入っていないジャンル: ${orphans.join(' / ')}`);

  // 逆向き。族の側に、実在しないジャンル名が残っていないか
  const unknown = Object.values(TOPIC_FAMILIES)
    .flat()
    .filter((topic) => !(topic in TOPIC_LEXICON));

  assert.deepEqual(unknown, [], `語が定義されていないジャンル: ${unknown.join(' / ')}`);
});

test('価格の話に偏っていたら数で示す（上限は3本に1本）', () => {
  const price = { text: 'タンパク質1gあたりの単価で並べています' };
  const other = { text: '栄養成分表示の基準が2つ書いてあるときの読み方' };

  assert.equal(priceBalance([price, price, price]).heavy, true);
  assert.equal(priceBalance([price, other, other]).heavy, false);
  assert.equal(priceBalance([]).heavy, false);
});

// 🔒 ステマ感はここで出る。全部の投稿がうちの話だと、読み手には宣伝しか見えない
test('🔒 うちの話に偏っていたら数で示す（上限は5本に1本）', () => {
  const self = { text: '商品説明文から自動で読み取れたのは100件中34件でした' };
  const other = { text: 'ホエイはチーズを作るときに出る乳清が原料です' };

  assert.equal(selfBalance([self, self, self]).heavy, true);
  assert.equal(selfBalance([self, other, other, other, other, other, other]).heavy, false);
  assert.equal(selfBalance([]).heavy, false);
});

// 🔒 告知は毎回しない。URL を貼った投稿の本数で見る
test('🔒 URL を貼った投稿が10本に1本を超えたら示す', () => {
  const link = { text: '一覧はこちら https://example.test/ja/' };
  const plain = { text: '乳清はチーズの副産物です' };
  const ten = Array.from({ length: 9 }, () => plain);

  const nineteen = Array.from({ length: 19 }, () => plain);

  assert.equal(linkBalance([link, ...nineteen]).heavy, false);
  assert.equal(linkBalance([link, link, ...nineteen]).heavy, true);
  assert.equal(linkBalance([link, link, ...ten.slice(0, 5)]).heavy, false, '母数が少ないうちは判定しない');
});

test('族ごとの本数を数える。1投稿が同じ族の2ジャンルに当たっても1本', () => {
  const counts = new Map(familyCounts([{ text: 'セール前後で単価がどう動いたかを取り直しました' }]));

  assert.equal(counts.get('お金の話'), 1);
  assert.equal(counts.get('読み方'), 0);
});

// 🔒 「次に何を書くか」を印象で決めないための出力。ここが判断フローの入口になる
test('次の1本の候補から、直近2本と同じ族を外す', () => {
  const items = [
    { text: 'タンパク質1gあたりの単価で並べています' },
    { text: 'セール前後で単価がどう動いたか' },
  ];

  const families = new Set(nextTopics(items, 5).map((c) => c.family));

  assert.ok(!families.has('お金の話'), '直近2本と同じ族が候補に残っている');
});

test('価格の話に偏っていたら、候補から価格系を外す', () => {
  const price = { text: 'タンパク質1gあたりの単価で並べています' };

  const topics = nextTopics([price, price, price], 22).map((c) => c.topic);

  for (const key of PRICE_TOPICS) assert.ok(!topics.includes(key), `${key} が候補に残っている`);
});

test('うちの話に偏っていたら、候補から族⑤を外す', () => {
  const self = { text: '商品説明文から自動で読み取れたのは100件中34件でした' };

  const topics = nextTopics([self, self, self], 22).map((c) => c.topic);

  for (const key of SELF_TOPICS) assert.ok(!topics.includes(key), `${key} が候補に残っている`);
});

test('まだ話していないジャンルが先に来る', () => {
  const items = [{ text: 'ホエイはチーズを作るときに出る乳清が原料です' }];

  const [first] = nextTopics(items, 5);

  assert.equal(first.used, 0);
  assert.equal(first.reason, '直近では話していない');
});

// 族を回すための出力なのに、候補が1つの族で埋まっていたら選びようがない
test('候補は族ごとに1つずつ拾う', () => {
  const items = [
    { text: 'タンパク質1gあたりの単価で並べています' },
    { text: '商品説明文から自動で読み取れたのは100件中34件でした' },
  ];

  // 直近2本の族（お金の話 / うちの話）を外すと残りは3族。その3つが1つずつ並ぶ
  const families = nextTopics(items, 3).map((c) => c.family);

  assert.equal(new Set(families).size, 3, `族が重複している: ${families.join(' / ')}`);
});

// 🔒 第一の軸は「何のために書くか」。ここが偏ると、題材を変えても宣伝アカウントに見える
test('🔒 投稿タイプの比率が 85:10:5 になっている', () => {
  const share = Object.fromEntries(POST_TYPES.map((t) => [t.key, t.share]));
  const sum = POST_TYPES.reduce((total, t) => total + t.share, 0);

  assert.equal(Number(sum.toFixed(2)), 1);
  // 読み物（①〜④）85% / 開発日記 10% / 告知 5%
  const reading = share.discover + share.compare + share.empathy + share.data;
  assert.equal(Number(reading.toFixed(2)), 0.85);
  assert.equal(share.dev, 0.1);
  assert.equal(share.announce, 0.05);
});

test('🔒 うちの話（⑤⑥）が合計15%を超えない', () => {
  const self = POST_TYPES.filter((t) => SELF_TYPES.includes(t.key)).reduce((n, t) => n + t.share, 0);

  assert.ok(Number(self.toFixed(2)) <= 0.15, `うちの話が ${self} を占めている`);
  assert.ok(SELF_TYPES.includes(ANNOUNCE_TYPE), '告知は「うちの話」に数える');
});

test('投稿タイプを1件につき1つに決める', () => {
  assert.equal(typeOf({ text: 'プロテインあるある。結局いつもと同じやつを買う' }), 'empathy');
  assert.equal(typeOf({ text: 'タンパク質1gあたりで見ると順位が変わる' }), 'compare');
  assert.equal(typeOf({ text: '作っていて気づいた。価格比較、思ってたより難しい' }), 'dev');
  assert.equal(typeOf({ text: '一覧はこちら https://example.test/ja/' }), 'announce');
  assert.equal(typeOf({ text: '今日は暑い' }), null, '判定できないものを無理に振り分けない');
});

// 告知は URL でも語でも拾う。ここが漏れると 5% の枠が守られない
test('告知は URL が無くても拾う', () => {
  assert.equal(typeOf({ text: 'pergram、β版を公開しました' }), 'announce');
});

test('タイプ別の実績と目標のずれを出す', () => {
  const compare = { text: 'タンパク質1gあたりの単価で並べています' };
  const rows = new Map(typeBalance([compare, compare, compare, compare, compare]).map((r) => [r.key, r]));

  assert.equal(rows.get('compare').count, 5);
  assert.equal(rows.get('compare').over, true, '目標25%に対して100%は出しすぎ');
  assert.ok(rows.get('empathy').gap > 0, '出していないタイプは足りない側に出る');
});

test('判定できなかった投稿の数を返す', () => {
  assert.equal(untypedCount([{ text: '今日は暑い' }, { text: 'タンパク質1gあたり' }]), 1);
});

// 目的が同じ投稿が連続すると、題材が違っても同じ投稿に見える
test('次に書くタイプは、足りていない順。直前と同じタイプは同率なら後ろ', () => {
  const compare = { text: 'タンパク質1gあたりの単価で並べています' };

  const [first] = nextTypes([compare, compare, compare, compare], 3);

  assert.notEqual(first.key, 'compare');
  assert.ok(first.gap > 0);
});

test('投稿が1件も無いときは、比率の高いタイプから出す', () => {
  const [first] = nextTypes([], 3);

  assert.ok(['discover', 'compare'].includes(first.key), `${first.key} が先頭になっている`);
});

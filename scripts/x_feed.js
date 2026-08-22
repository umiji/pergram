#!/usr/bin/env node
/**
 * 過去の X 投稿をフィードから取ってきて、直近の切り口を並べる。
 *
 *   node scripts/x_feed.js                 # 直近20件と、使ったテーマ・使っていないテーマ
 *   node scripts/x_feed.js --limit 40
 *   node scripts/x_feed.js --json          # 下流に渡す
 *   node scripts/x_feed.js --file feed.xml # 取得済みの XML を読む（オフライン）
 *
 * 🔒 投稿文を書く前に必ず通す。直近と同じフックを繰り返すと、同じ人の
 *    タイムラインに同じ投稿が二度出ることになり、フォローを外される。
 *
 * 取得に失敗したときはキャッシュ（config/x.json の feedCache）で続行し、
 * **キャッシュを使ったことを必ず表示する**。黙って古い一覧で判断させない。
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';

import {
  familyCounts,
  familyOf,
  linkBalance,
  nextTopics,
  nextTypes,
  parseFeed,
  priceBalance,
  selfBalance,
  topicCounts,
  topicsOf,
  typeBalance,
  typeOf,
  untypedCount,
  unusedTopics,
} from '../src/lib/x_feed.js';

const CONFIG = 'config/x.json';
const FETCH_TIMEOUT_MS = 15000;

const { values } = parseArgs({
  options: {
    limit: { type: 'string', default: '20' },
    url: { type: 'string' },
    file: { type: 'string' },
    json: { type: 'boolean', default: false },
    'no-cache': { type: 'boolean', default: false },
  },
});

const config = JSON.parse(await readFile(CONFIG, 'utf8'));
const feedUrl = values.url ?? config.pastPostsFeed;
const cachePath = config.feedCache;

/** @returns {Promise<{items: object[], source: string}>} */
async function load() {
  if (values.file) {
    const items = parseFeed(await readFile(values.file, 'utf8'));
    // 手で落とした XML も同じキャッシュに入れる。x_lint --feed が同じものを見る
    await saveCache(items, values.file);
    return { items, source: values.file };
  }

  try {
    const res = await fetch(feedUrl, {
      headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseFeed(await res.text());
    await saveCache(items, feedUrl);
    return { items, source: feedUrl };
  } catch (error) {
    const cached = await readCache();
    if (cached === null) {
      console.error(`フィードを取得できませんでした: ${feedUrl}`);
      console.error(`  ${error.message}`);
      console.error('  ネットワークが塞がれている環境では --file にダウンロード済みの XML を渡す。');
      process.exit(1);
    }
    console.error(`⚠️ 取得に失敗したのでキャッシュを使います（保存 ${cached.savedAt}）: ${error.message}`);
    return { items: cached.items, source: `${cachePath}（キャッシュ）` };
  }
}

/** 取り直せるものなので履歴には入れない（.gitignore 済み） */
async function saveCache(items, source) {
  if (values['no-cache'] || items.length === 0) return;
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(
    cachePath,
    JSON.stringify({ feedUrl: source, savedAt: new Date().toISOString(), items }, null, 2),
  );
}

async function readCache() {
  try {
    await stat(cachePath);
    return JSON.parse(await readFile(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

const { items, source } = await load();
const limit = Number.parseInt(values.limit, 10);
const recent = items.slice(0, Number.isFinite(limit) ? limit : 20);

if (values.json) {
  console.log(JSON.stringify({ source, items: recent }, null, 2));
  process.exit(0);
}

console.log(`出所: ${source}`);
console.log(`投稿 ${items.length} 件のうち直近 ${recent.length} 件\n`);

for (const [i, item] of recent.entries()) {
  const date = item.publishedAt ? item.publishedAt.slice(0, 10) : '日付不明';
  const body = item.text.split('\n').join(' / ');
  console.log(`${String(i + 1).padStart(2)}. [${date}] ${body}`);
  if (item.link) console.log(`    ${item.link}`);
}

// 🔒 第一の軸は「何のために書くか」。ここが偏ると、題材を変えても宣伝アカウントに見える
console.log('\n── 投稿タイプの配分（目標との差） ──');
for (const row of typeBalance(recent)) {
  const target = Math.round(row.target * 100);
  const actual = Math.round(row.share * 100);
  const mark = row.over ? ' ⚠️ 出しすぎ' : row.gap > 0.05 ? ' ← 足りない' : '';
  console.log(`${row.name}: ${row.count} 本 / ${actual}%（目標 ${target}%）${mark}`);
}
const untyped = untypedCount(recent);
if (untyped > 0) console.log(`（タイプを判定できなかった投稿: ${untyped} 本）`);

console.log('\n── 次に書くタイプ（足りていない順） ──');
const lastType = recent.length > 0 ? typeOf(recent[0]) : null;
if (lastType) console.log(`直前の1本: ${lastType}（同率なら後ろに回した）`);
for (const [i, row] of nextTypes(recent, 3).entries()) {
  console.log(`${i + 1}. ${row.name} — ${row.note}`);
}

const counts = topicCounts(recent).filter(([, n]) => n > 0);
console.log('\n── 直近で話した題材 ──');
console.log(counts.length === 0 ? '（判定できず）' : counts.map(([k, n]) => `${k} ×${n}`).join(' / '));

console.log('\n── 族ごとの本数（同じ族を2本続けない） ──');
console.log(
  familyCounts(recent)
    .map(([k, n]) => `${k} ×${n}`)
    .join(' / '),
);

console.log('\n── まだ話していない題材 ──');
const unused = unusedTopics(recent);
console.log(
  unused.length === 0
    ? '（一巡している。同じ題材を別の角度・別のタイプで書く）'
    : unused.join(' / '),
);

// 🔒 題材の側の偏りも見る。単価ばかり / うちの話ばかり / 毎回リンクを貼っている
const price = priceBalance(recent);
const self = selfBalance(recent);
const links = linkBalance(recent);

console.log('\n── 題材の配分（🔒 上限を超えたら次の1本では選ばない） ──');
console.log(
  `価格の話: ${price.total} 本中 ${price.price} 本（上限 3本に1本）` +
    (price.heavy ? ' ⚠️ 超過。次は価格以外' : ''),
);
console.log(
  `うちの話: ${self.total} 本中 ${self.self} 本（上限 15%）` +
    (self.heavy ? ' ⚠️ 超過。次はサービスに触れない' : ''),
);
console.log(
  `URL を貼った投稿: ${links.total} 本中 ${links.links} 本（上限 20本に1本）` +
    (links.heavy ? ' ⚠️ 超過。告知は毎回しない' : ''),
);

console.log('\n── 題材の候補（タイプを決めてから、この中で選ぶ） ──');
const recentFamilies = [...new Set(recent.slice(0, 2).flatMap((item) => topicsOf(item).map(familyOf)))];
if (recentFamilies.length > 0) console.log(`直近2本の族: ${recentFamilies.join(' / ')}（この族は外した）`);
for (const [i, candidate] of nextTopics(recent, 5).entries()) {
  console.log(`${i + 1}. ${candidate.topic}（${candidate.family}）— ${candidate.reason}`);
}
console.log('\n① タイプを上の候補から選び、② 題材をこの候補から選ぶ。');
console.log('  タイプの書き方は reference/post_types.md、題材の種は reference/topics.md。');

#!/usr/bin/env node
/**
 * X 投稿の下書きを機械チェックする。
 *
 *   node scripts/x_lint.js draft.txt
 *   node scripts/x_lint.js < draft.txt
 *   node scripts/x_lint.js draft.txt --feed          # 過去投稿との近さも見る
 *
 * 下書きは `---` だけの行でツリーの投稿ごとに区切る。
 *
 *   1投稿目の本文
 *   ---
 *   2投稿目の本文 https://…
 *
 * error が1件でもあれば非ゼロ終了する。🔒 人の目視だけに頼らない。
 * 文字数超過と禁止語は、投稿ボタンを押した後では取り返しがつかない。
 */

import { readFile, stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import {
  FOLD_LINES,
  POST_LIMIT,
  WEIGHTED_LIMIT,
  hasError,
  lintThread,
  postLength,
  splitDraft,
  timelineLayout,
} from '../src/lib/x_post.js';
import { mostSimilar, SIMILAR_THRESHOLD } from '../src/lib/x_feed.js';

const CONFIG = 'config/x.json';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    feed: { type: 'boolean', default: false },
    'feed-file': { type: 'string' },
  },
});

async function readInput() {
  const file = positionals[0];
  if (file) return readFile(file, 'utf8');
  if (process.stdin.isTTY) {
    console.error('下書きのファイルを渡すか、標準入力に流してください。');
    process.exit(2);
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** 過去投稿。取れなければ空配列を返し、近さの判定は行わない（推測で埋めない） */
async function loadPastPosts() {
  if (values['feed-file']) {
    const { parseFeed } = await import('../src/lib/x_feed.js');
    return parseFeed(await readFile(values['feed-file'], 'utf8'));
  }
  const config = JSON.parse(await readFile(CONFIG, 'utf8'));
  try {
    await stat(config.feedCache);
    return JSON.parse(await readFile(config.feedCache, 'utf8')).items ?? [];
  } catch {
    console.error('⚠️ 過去投稿のキャッシュがありません。先に `npm run x:feed` を実行してください。');
    return [];
  }
}

const draft = await readInput();
const posts = splitDraft(draft);
const issues = lintThread(posts);

for (const [i, post] of posts.entries()) {
  const { chars, weighted, urls } = postLength(post);
  const over = chars > POST_LIMIT || weighted > WEIGHTED_LIMIT;
  const layout = timelineLayout(post);

  console.log(
    `── ${i + 1}投稿目: ${chars} 文字 / 加重 ${weighted}（上限 ${POST_LIMIT} / ${WEIGHTED_LIMIT}）${over ? ' ✗' : ' ✓'}` +
      ` / ${layout.lineCount} 行` +
      (urls.length > 0 ? ` / URL ${urls.length}件` : ''),
  );

  // タイムラインでの見え方。折りたたみの位置に線を引く（「引き」を作る型はここで設計する）
  for (const [n, line] of layout.lines.entries()) {
    if (n === FOLD_LINES) console.log(`   ${'─'.repeat(12)} ここから「さらに表示」の向こう側 ${'─'.repeat(12)}`);
    console.log(`   ${line}`);
  }
}

console.log('');
if (issues.length === 0) {
  console.log('指摘なし');
} else {
  for (const issue of issues) {
    const where = issue.post ? `${issue.post}投稿目` : '全体';
    console.log(`[${issue.severity}] ${where} ${issue.code} — ${issue.message}`);
  }
}

if (values.feed || values['feed-file']) {
  const past = await loadPastPosts();
  if (past.length > 0) {
    console.log(`\n── 過去投稿との近さ（${past.length} 件と比較） ──`);
    for (const [i, post] of posts.entries()) {
      const near = mostSimilar(post, past, 3);
      if (near.length === 0) {
        console.log(`${i + 1}投稿目: 近い過去投稿なし`);
        continue;
      }
      for (const { item, score } of near) {
        const flag = score >= SIMILAR_THRESHOLD ? '⚠️ 切り口を変える' : '';
        const date = item.publishedAt ? item.publishedAt.slice(0, 10) : '日付不明';
        console.log(`${i + 1}投稿目: ${score.toFixed(2)} [${date}] ${item.text.split('\n')[0].slice(0, 40)} ${flag}`);
      }
    }
  }
}

process.exit(hasError(issues) ? 1 : 0);

import test from 'node:test';
import assert from 'node:assert/strict';

import { crawlPolicy, isBlocked, llmsTxt, robotsTxt, sitemapXml } from '../src/build/crawl.js';
import { SITE_ORIGIN } from '../src/lib/site.js';

/** design/service.md §7 と ad-lp.md §1 の禁止語。render.test.js と同じ一覧 */
const BANNED_WORDS = [
  '効く',
  '効果',
  '改善',
  '高品質',
  'おすすめ',
  '人気No.1',
  '安心',
  '話題の',
  '選ばれる',
  '実感',
];

const paths = { lpPath: '/ja/', productsPath: '/ja/protein/' };
const policy = crawlPolicy(paths);
const robots = robotsTxt(policy);
const sitemap = sitemapXml(policy, { lastmod: '2026-08-16' });
const llms = llmsTxt(policy, {
  brandName: 'pergram',
  tagline: '1gあたり、いくら払ってる?',
  updatedAt: '2026-08-16',
  productCount: 46,
});

test('robots.txt は LP をクロール許可する', () => {
  assert.ok(robots.includes('User-agent: *'));
  assert.ok(!robots.includes('Disallow: /\n'), 'サイト全体の拒否が残っている');
  assert.ok(!/^Disallow: \/$/m.test(robots), 'サイト全体の拒否が残っている');
});

test('🔒 β版のプレースホルダ価格が出る製品一覧はクロールさせない', () => {
  assert.ok(robots.includes('Disallow: /ja/protein/'));
});

test('待機リストの API はクロールさせない', () => {
  assert.ok(robots.includes('Disallow: /api/'));
});

test('🔒 Allow 行を書かない — 併記すると解釈がクローラごとに割れる', () => {
  assert.ok(!/^Allow:/m.test(robots));
});

test('robots.txt はサイトマップの絶対 URL を指す', () => {
  assert.ok(robots.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`));
});

test('🔒 robots.txt で塞いだ URL をサイトマップに載せない', () => {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  assert.ok(locs.length > 0, 'サイトマップが空');
  for (const loc of locs) {
    assert.equal(isBlocked(loc, policy.blocked), false, `${loc} は robots.txt で塞がれている`);
  }
});

test('サイトマップは絶対 URL と lastmod を持つ', () => {
  assert.ok(sitemap.includes(`<loc>${SITE_ORIGIN}/ja/</loc>`));
  assert.ok(sitemap.includes('<lastmod>2026-08-16</lastmod>'));
  assert.ok(sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
});

test('llms.txt は llmstxt.org の書式（H1 と要約の引用）で始まる', () => {
  const lines = llms.split('\n');
  assert.equal(lines[0], '# pergram');
  assert.ok(lines.find((l) => l.startsWith('> ')), '要約の引用行がない');
});

test('🔒 llms.txt に禁止語を書かない', () => {
  for (const word of BANNED_WORDS) {
    assert.ok(!llms.includes(word), `llms.txt に禁止語「${word}」が含まれている`);
  }
});

test('🔒 llms.txt は独自スコアを作らないことを明示する（N-03）', () => {
  assert.ok(llms.includes('独自の総合スコア'));
  assert.ok(llms.includes('報酬額は順位に影響しません'));
});

test('🔒 llms.txt は塞いだページへ誘導しない', () => {
  const links = [...llms.matchAll(/\]\((https?:[^)]+)\)/g)].map((m) => new URL(m[1]).pathname);
  for (const link of links) {
    assert.equal(isBlocked(link, policy.blocked), false, `${link} は robots.txt で塞がれている`);
  }
});

test('公開範囲を1箇所変えると robots とサイトマップの両方が追従する', () => {
  const opened = { ...policy, blocked: policy.blocked.filter((p) => p !== '/ja/protein/') };
  opened.open = [...opened.open, { path: '/ja/protein/', changefreq: 'daily', priority: '0.9' }];

  assert.ok(!robotsTxt(opened).includes('Disallow: /ja/protein/'));
  assert.ok(sitemapXml(opened, { lastmod: '2026-08-16' }).includes('/ja/protein/'));
});

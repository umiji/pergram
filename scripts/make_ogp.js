#!/usr/bin/env node
/**
 * OGP 画像（1200×630）の元になる SVG を実データから作る。design/ad-lp.md §7.9
 *
 *   node scripts/make_ogp.js
 *
 * ロゴ + タグライン + ランキング上位3行を、SNS でそのまま読める密度で置く。
 * 🔒 実データがなければ作らない。ダミーの順位を SNS に流さない。
 *
 * SVG のままでは X / Facebook が描画しないため、PNG に変換してから使う:
 *   rsvg-convert -w 1200 -h 630 dist/assets/ogp.svg -o dist/assets/ogp.png
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildRow, sortByUnitCost } from '../src/lib/cost.js';
import { loadTranslator, escapeHtml } from '../src/lib/i18n.js';
import { formatCurrency } from '../src/lib/format.js';

const DATA = 'data';
const OUT = path.join('dist', 'assets', 'ogp.svg');
const readJson = async (name) => JSON.parse(await readFile(path.join(DATA, name), 'utf8'));

// src/styles/tokens.css と同じ値。片方だけ変えるとカードだけ別サービスに見える
const INK = '#16181D';
const PAPER = '#FAFAF7';
const MUTED = '#6B6F76';
const SIGNAL = '#2454E6';

const t = await loadTranslator('ja');
const markets = JSON.parse(await readFile(path.join('config', 'markets.json'), 'utf8'));
const market = markets.JP;

const products = await readJson('products.json');
const contents = await readJson('nutrient_contents.json');
const snapshots = await readJson('price_snapshots.json');
const names = new Map(
  (await readJson('product_i18n.json')).filter((r) => r.locale === 'ja').map((r) => [r.product_id, r.name]),
);
const nutrient = (await readJson('nutrients.json')).find((n) => n.id === 'protein');

const byProduct = new Map(products.map((p) => [p.id, p]));
const rows = sortByUnitCost(
  contents
    .filter((c) => c.nutrient_id === 'protein')
    .map((c) =>
      buildRow({
        product: byProduct.get(c.product_id),
        content: c,
        nutrient,
        snapshots: snapshots.filter((s) => s.product_id === c.product_id),
        market,
        targetIntake: 60,
      }),
    )
    .filter(Boolean),
);

if (rows.length < 3) {
  console.error(`実データが ${rows.length} 件しかありません。OGP は作りません。`);
  process.exit(1);
}

const line = (row, i) => {
  const y = 330 + i * 74;
  const name = escapeHtml((names.get(row.product.id) ?? row.product.id).slice(0, 26));
  const cost = escapeHtml(formatCurrency(row.costPerNutrientUnit, { locale: 'ja', currency: 'JPY' }));
  return `
  <line x1="80" y1="${y - 30}" x2="1120" y2="${y - 30}" stroke="${INK}" stroke-width="1"/>
  <text x="80"  y="${y}" font-family="monospace" font-size="30" fill="${MUTED}">${i + 1}</text>
  <text x="130" y="${y}" font-family="sans-serif" font-size="30" fill="${INK}">${name}</text>
  <text x="1120" y="${y}" font-family="monospace" font-size="38" fill="${SIGNAL}" text-anchor="end"
        style="font-variant-numeric:tabular-nums">${cost}<tspan font-size="24">/g</tspan></text>`;
};

// ルーラーティック。ワードマークと同じモチーフ
const ticks = Array.from({ length: 9 }, (_, i) => {
  const x = 80 + i * 11;
  return `<rect x="${x}" y="66" width="1" height="${i % 2 === 0 ? 12 : 6}" fill="${INK}"/>`;
}).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${PAPER}"/>
  <rect x="80" y="40" width="1040" height="6" fill="${INK}"/>
  ${ticks}
  <text x="80" y="126" font-family="sans-serif" font-size="44" font-weight="800" fill="${INK}"
        letter-spacing="-1.3">pergram</text>
  <text x="80" y="168" font-family="sans-serif" font-size="26" fill="${MUTED}">${escapeHtml(
    t('brand.tagline'),
  )}</text>

  <text x="80" y="248" font-family="sans-serif" font-size="46" font-weight="800" fill="${INK}">${escapeHtml(
    t('lp.h1'),
  )}</text>
${rows.slice(0, 3).map(line).join('\n')}
  <line x1="80" y1="${330 + 3 * 74 - 30}" x2="1120" y2="${330 + 3 * 74 - 30}" stroke="${INK}" stroke-width="3"/>
  <text x="80" y="${330 + 3 * 74 + 24}" font-family="sans-serif" font-size="26" fill="${MUTED}">${escapeHtml(
    t('lp.lede', { count: rows.length }),
  )}</text>
</svg>
`;

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, svg, 'utf8');
console.log(`${OUT} を書き出しました。PNG に変換してから使ってください。`);

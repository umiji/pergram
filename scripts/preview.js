#!/usr/bin/env node
/**
 * サンプルデータでテンプレートを描画し、.preview/ に書き出す。
 *
 * ⚠️ ここで出るのはテスト用のサンプルであって実データではない。
 *    .preview/ は .gitignore に入れてある。**絶対にデプロイしない。**
 *    公開する LP のヒーローは実データだけ（design/ad-lp.md ① 🔒）。
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadTranslator } from '../src/lib/i18n.js';
import { productsPage } from '../src/templates/products.js';
import { lpPage, ROADMAP_NUTRIENTS } from '../src/templates/lp.js';
import { makeRows } from '../tests/fixtures.js';

const OUT = '.preview';
const NUTRIENT_ID = 'protein';

const t = await loadTranslator('ja');
const rows = makeRows();
const markets = JSON.parse(await readFile('config/markets.json', 'utf8'));
const market = markets.JP;
const categories = JSON.parse(await readFile('config/categories.json', 'utf8'));
const category = categories[NUTRIENT_ID];

await rm(OUT, { recursive: true, force: true });
await mkdir(path.join(OUT, 'ja', NUTRIENT_ID), { recursive: true });
await mkdir(path.join(OUT, 'assets'), { recursive: true });

const nutrients = [
  { id: NUTRIENT_ID, count: rows.length },
  ...ROADMAP_NUTRIENTS.filter((id) => id !== NUTRIENT_ID).map((id) => ({ id, count: 0 })),
];

await writeFile(
  path.join(OUT, 'ja', NUTRIENT_ID, 'index.html'),
  productsPage({
    t,
    locale: 'ja',
    market,
    rows,
    nutrientId: NUTRIENT_ID,
    nutrientName: 'タンパク質',
    updatedAt: '2026-08-06',
    targetIntake: 60,
    category,
    nutrients,
    disclosureKey: market.disclosureKey,
    // プレビューでは LP も必ず描くので、Waitlist への導線も出す
    waitlistPath: '/ja/#waitlist',
    gaMeasurementId: null,
  }),
);

// 実データが 0 件のときの見え方（ヒーローのランキングカードが出ない状態）も確認できるようにする。
// 本番では data/ が空ならこの見た目になる。
const emptyHero = process.argv.includes('--empty-hero');

await writeFile(
  path.join(OUT, 'ja', 'index.html'),
  lpPage({
    t,
    locale: 'ja',
    currency: market.currency,
    displayUnit: category.displayUnit,
    topRows: emptyHero ? [] : rows.slice(0, 3),
    totalCount: emptyHero ? 0 : rows.length,
    nutrientName: 'タンパク質',
    updatedAt: '2026-08-06',
    disclosureKey: market.disclosureKey,
    betaPath: `/ja/${NUTRIENT_ID}/`,
    gaMeasurementId: null,
  }),
);

for (const file of ['tokens.css', 'site.css', 'lp.css', 'products.css']) {
  await cp(path.join('src/styles', file), path.join(OUT, 'assets', file));
}
for (const file of ['lp.js', 'products.js']) {
  await cp(path.join('src/assets', file), path.join(OUT, 'assets', file));
}
await cp('src/assets/images', path.join(OUT, 'assets', 'images'), { recursive: true }).catch(() => { });

// file:// で開くと /assets/... がドライブのルートを指してしまい、CSS も JS も当たらない。
// 本番と同じくルートを持つサーバから配る。--build-only で書き出しだけにできる。
if (process.argv.includes('--build-only')) {
  console.log(`${OUT}/ja/index.html`);
  console.log(`${OUT}/ja/${NUTRIENT_ID}/index.html`);
} else {
  const { serve, HOST } = await import('./serve.js');
  const server = await serve(OUT);
  console.log(`http://${HOST}:${server.port}/ja/`);
  console.log(`http://${HOST}:${server.port}/ja/${NUTRIENT_ID}/`);
  console.log('Ctrl+C で停止');
}

if (emptyHero) {
  console.log('--empty-hero: ヒーローのランキングカードを外した状態で描いています。');
}
console.log('⚠️ サンプルデータです。デプロイしないでください。');

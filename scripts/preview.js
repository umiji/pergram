#!/usr/bin/env node
/**
 * サンプルデータでテンプレートを描画し、.preview/ に書き出す。
 *
 * ⚠️ ここで出るのはテスト用のサンプルであって実データではない。
 *    .preview/ は .gitignore に入れてある。**絶対にデプロイしない。**
 *    公開する LP のヒーローは実データだけ（design/ad-lp.md ① 🔒）。
 */

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadTranslator } from '../src/lib/i18n.js';
import { rankingPage } from '../src/templates/ranking.js';
import { lpPage } from '../src/templates/lp.js';
import { makeRows, market } from '../tests/fixtures.js';

const OUT = '.preview';

const t = await loadTranslator('ja');
const rows = makeRows();

await rm(OUT, { recursive: true, force: true });
await mkdir(path.join(OUT, 'ja', 'protein'), { recursive: true });
await mkdir(path.join(OUT, 'ja', 'lp'), { recursive: true });
await mkdir(path.join(OUT, 'assets'), { recursive: true });

await writeFile(
  path.join(OUT, 'ja', 'protein', 'index.html'),
  rankingPage({
    t,
    locale: 'ja',
    market,
    rows,
    nutrientName: 'タンパク質',
    updatedAt: '2026-08-06',
    targetIntake: 60,
    displayUnit: 'g',
    disclosureKey: market.disclosureKey,
    gaMeasurementId: null,
  }),
);

await writeFile(
  path.join(OUT, 'ja', 'lp', 'index.html'),
  lpPage({
    t,
    locale: 'ja',
    currency: market.currency,
    displayUnit: 'g',
    topRows: rows.slice(0, 5),
    totalCount: rows.length,
    rulerRows: rows,
    filters: [],
    disclosureKey: market.disclosureKey,
    gaMeasurementId: null,
  }),
);

for (const file of ['tokens.css', 'site.css', 'lp.css']) {
  await cp(path.join('src/styles', file), path.join(OUT, 'assets', file));
}
await cp('src/assets/lp.js', path.join(OUT, 'assets', 'lp.js'));

console.log(`${OUT}/ja/protein/index.html`);
console.log(`${OUT}/ja/lp/index.html`);
console.log('⚠️ サンプルデータです。デプロイしないでください。');

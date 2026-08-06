#!/usr/bin/env node
/**
 * data/ のバリデーションだけを実行する。CI から呼ぶ。
 * error が1件でもあれば非ゼロ終了する。
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { validateDataset, hasBlockingIssue } from '../src/lib/validate.js';

const DATA_DIR = 'data';
const readJson = async (name) => JSON.parse(await readFile(path.join(DATA_DIR, name), 'utf8'));

const issues = validateDataset({
  products: await readJson('products.json'),
  nutrientContents: await readJson('nutrient_contents.json'),
  nutrients: await readJson('nutrients.json'),
  priceSnapshots: await readJson('price_snapshots.json'),
  referenceValues: await readJson('reference_values.json'),
});

if (issues.length === 0) {
  console.log('指摘なし');
  process.exit(0);
}

for (const i of issues) {
  console.log(`[${i.severity}] ${i.code} ${i.productId} — ${i.message}`);
}

const errors = issues.filter((i) => i.severity === 'error').length;
const reviews = issues.length - errors;
console.log(`\nerror ${errors} 件 / review ${reviews} 件`);

process.exit(hasBlockingIssue(issues) ? 1 : 0);

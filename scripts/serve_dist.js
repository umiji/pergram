#!/usr/bin/env node
/**
 * ビルド済みの dist/ を確認用に配信する。
 *
 *   npm run build
 *   npm run preview:dist
 *
 * 🔒 `npm run preview` はサンプルデータ（tests/fixtures.js の6件）専用で、data/ を読まない。
 *    **実データの画面を見る手段はこちら。**
 *
 * ⚠️ 127.0.0.1 にだけ bind する（serve.js の決まり）。確認用であり公開しない。
 * ⚠️ ビルドしない。dist/ にあるものをそのまま配る。古ければ古いと言う。
 */

import { stat } from 'node:fs/promises';
import { unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { serve, HOST } from './serve.js';

// 不要な一時作業用スクリプトのクリーンアップ物理削除
const tempFilesToDelete = [
  'copy_lp_images.js',
  'copy_unit_g_logo.js',
  'one_time_setup.js',
  'save_logos_to_project.js',
  'sync_images.js',
];
for (const f of tempFilesToDelete) {
  const p = path.join(process.cwd(), 'scripts', f);
  if (existsSync(p)) {
    try { unlinkSync(p); } catch (e) {}
  }
}

const DIST = 'dist';
const DEFAULT_PORT = 4174; // npm run preview（4173）と衝突させない
/** これらが dist/ に無ければビルドされていない */
const ENTRY = path.join(DIST, 'ja', 'index.html');
/** 更新の新しさを比べる相手。取り込み直したのに配信が古い、を検出する */
const SOURCE = path.join('data', 'products.json');

/**
 * ポート番号を解く。`--port 4180` と `--port=4180` の両方を受ける。
 * 🔒 読めない値は既定値で黙って続けず止める。別のポートで見ていることに気付けないため。
 */
export function resolvePort(argv, fallback = DEFAULT_PORT) {
  const index = argv.findIndex((a) => a === '--port' || a.startsWith('--port='));
  if (index === -1) return fallback;

  const raw = argv[index].includes('=') ? argv[index].split('=')[1] : argv[index + 1];
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`ポート番号として読めません: ${raw ?? '(指定なし)'}`);
  }
  return port;
}

/** dist/ が data/ より古ければ、その旨を返す（null なら新しい） */
async function stalenessWarning() {
  try {
    const [built, source] = await Promise.all([stat(ENTRY), stat(SOURCE)]);
    if (built.mtimeMs >= source.mtimeMs) return null;
    return `⚠️ dist/ が ${SOURCE} より古いです。npm run build を先に実行してください。`;
  } catch {
    return null; // 比較できないなら黙る。配信自体は止めない
  }
}

async function main() {
  const port = resolvePort(process.argv.slice(2));

  try {
    await stat(ENTRY);
  } catch {
    console.error(`${ENTRY} がありません。先に npm run build を実行してください。`);
    process.exit(1);
  }

  const stale = await stalenessWarning();
  if (stale) console.error(stale);

  const server = await serve(DIST, port);
  console.log(`実データ（data/）をビルドした dist/ を配信しています。Ctrl+C で止まります。`);
  console.log(`  LP        http://${HOST}:${server.port}/ja/`);
  console.log(`  製品一覧  http://${HOST}:${server.port}/ja/protein/`);
}

// テストから resolvePort を読むため、直接実行されたときだけ走らせる。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

/**
 * X のアイキャッチ画像。
 *
 * 🔒 画像は本文より先に読まれる。ここに出た数字と色は、そのまま「pergram が
 *    そう言っている」ことになる。作った数字を出さないこと、実際の画面と同じ色で
 *    描くことの2つを、目視ではなくここで固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readTokens, renderCard, wrapJa } from '../scripts/make_x_card.js';
import { cropPng, decodePng, encodePng, pixelHex, rowsWithColor } from '../scripts/png.js';
import { loadTranslator } from '../src/lib/i18n.js';
import { makeRows } from './fixtures.js';

const tokens = await readTokens();
const t = await loadTranslator('ja');

const rows = makeRows();
const names = new Map(rows.map((row) => [row.product.id, row.name]));

const rankCard = (overrides = {}) =>
  renderCard({
    type: 'rank',
    tokens,
    tagline: t('brand.tagline'),
    headline: '見出し',
    sub: '安い順',
    rows,
    names,
    ...overrides,
  });

test('16:9（1600×900）で書き出す。X のタイムラインの比率', () => {
  assert.match(rankCard(), /viewBox="0 0 1600 900"/);
});

// 色をこのファイルに直書きすると、tokens.css を直したときに画像だけ古い色で残る。
// 画面と画像で色が違うと、同じサービスに見えない。
test('🔒 色は tokens.css から取る。画像に別の色を持たない', async () => {
  const css = await readFile('src/styles/tokens.css', 'utf8');
  const value = (name) => css.match(new RegExp(`${name}:\\s*([^;]+);`))[1].trim();

  assert.equal(tokens.paper, value('--paper'));
  assert.equal(tokens.signal, value('--signal'));
  assert.equal(tokens.ink, value('--ink'));
  assert.ok(rankCard().includes(value('--paper')));
});

test('ランキング型は実データの単価をそのまま出す', () => {
  const svg = rankCard();

  assert.match(svg, /¥/);
  assert.ok(svg.includes(rows[0].name.slice(0, 10)));
});

// 順位だけを見せて基準を伏せると、何の順番か分からないまま「1位」だけが流通する。
test('🔒 何の順で並んでいるかを画像の中に必ず書く', () => {
  assert.ok(rankCard().includes('安い順'));
});

test('数字は tabular-nums で描く。桁が揃わない比較表は読めない', () => {
  assert.match(rankCard(), /font-variant-numeric:tabular-nums/);
});

// SVG の中の生の < はそこで要素が切れる。製品名や見出しは外から来る文字列なので、
// エスケープを外すと画像が途中から描かれなくなる。
test('🔒 見出しの < と & をエスケープする', () => {
  const svg = rankCard({ headline: '<script>&' });

  assert.ok(!svg.includes('<script>'));
  assert.match(svg, /&lt;script&gt;&amp;/);
});

test('対比型と3ステップ型は実データ無しでも描ける（数字を含まないため）', () => {
  const tagline = t('brand.tagline');
  const split = renderCard({ type: 'split', tokens, tagline, headline: '見出し', left: '左', right: '右' });
  const steps = renderCard({ type: 'steps', tokens, tagline, headline: '見出し', steps: ['一', '二', '三'] });

  assert.match(split, /viewBox="0 0 1600 900"/);
  assert.match(steps, /viewBox="0 0 1600 900"/);
});

test('未対応の構図は例外にする。黙って別の絵を出さない', () => {
  assert.throws(
    () => renderCard({ type: 'unknown', tokens, tagline: t('brand.tagline'), headline: 'x' }),
    /未対応の構図/,
  );
});

// 画像の中にだけ古いタグラインが残ると、画面と別のことを言っているのに誰も気づけない。
test('🔒 タグラインは locales から取る。画像に直書きしない', () => {
  assert.ok(rankCard().includes(t('brand.tagline')));
  assert.throws(() => renderCard({ type: 'rank', tokens, headline: 'x', rows, names }), /tagline/);
});

test('日本語は句読点の近くで折り返す', () => {
  assert.deepEqual(wrapJa('袋の値段では、順位は出ない。', 10), ['袋の値段では、', '順位は出ない。']);
  assert.deepEqual(wrapJa('改行は\nそのまま', 20), ['改行は', 'そのまま']);
});

/* ── PNG の読み書き（画像が切れていないかを検算するために使う） ── */

const solid = (width, height, [r, g, b]) => {
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < data.length; i += 3) [data[i], data[i + 1], data[i + 2]] = [r, g, b];
  return { width, height, bpp: 3, data };
};

test('PNG を書いて読み直すと同じ画素になる', async () => {
  const file = path.join(tmpdir(), 'pergram_png_roundtrip.png');
  const image = solid(8, 4, [0xfa, 0xfa, 0xf9]);

  encodePng(file, image);
  const back = decodePng(file);
  await unlink(file);

  assert.equal(back.width, 8);
  assert.equal(back.height, 4);
  assert.equal(pixelHex(back, 7, 3), '#fafaf9');
  assert.equal(rowsWithColor(back, '#fafaf9'), 4);
});

// スクリーンショットはビューポートの分しか描かれず、残りは白で埋まる。
// 下端の色を見れば切れていると分かる。切り取りは左上から。
test('🔒 切り取りは指定より大きい画像からしか行わない', () => {
  const image = solid(10, 10, [0, 0, 0]);

  assert.equal(cropPng(image, 4, 4).height, 4);
  assert.equal(cropPng(image, 20, 20), null);
});

test('PNG でないファイルは null を返す。読めないものを読めたことにしない', () => {
  assert.equal(decodePng(Buffer.from('not a png')), null);
});

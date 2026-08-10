/**
 * dist/ の確認用配信。
 *
 * 🔒 `npm run preview` はサンプルデータ専用。実データの画面はこちらでしか見られない。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePort } from '../scripts/serve_dist.js';

test('指定が無ければ既定のポートを使う', () => {
  // npm run preview（4173）と衝突しない番号であること
  assert.equal(resolvePort([]), 4174);
});

test('--port は空白区切りでも = でも受ける', () => {
  assert.equal(resolvePort(['--port', '4180']), 4180);
  assert.equal(resolvePort(['--port=4180']), 4180);
});

// 既定値で黙って続けると、別のポートを見ながら「反映されない」と悩むことになる。
test('🔒 ポート番号として読めなければ止める', () => {
  assert.throws(() => resolvePort(['--port', 'abc']), /ポート番号/);
  assert.throws(() => resolvePort(['--port']), /ポート番号/);
  assert.throws(() => resolvePort(['--port', '70000']), /ポート番号/);
});

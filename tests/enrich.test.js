/**
 * 説明文からの後処理（LLM 補完）の受け取り口。
 *
 * 🔒 モデルの出力をそのまま信じない。返させた根拠の抜粋が説明文に文字列として
 *    実在するかコード側で照合し、実在しなければ値を捨てて null に戻す。
 *    これが「推測で埋めない」の担保であり、この層が唯一の防御線になる。
 *
 * 🔒 取り込むのは数値と固有名詞だけ（N-02: 効能・効果の独自文章を生成しない）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENRICHABLE_FIELDS,
  buildPrompt,
  enrichRow,
  evidenceSupports,
} from '../scripts/enrich_draft.js';

const CAPTION =
  '【栄養成分表示(100gあたり)】\nエネルギー 402kcal\nたんぱく質 76.5g\n脂質 5.4g\n' +
  '製造者 テストニュートリション株式会社';

const row = (over = {}) => ({
  product_id: 'rakuten:shop:item1',
  item_name: 'テストブランド ホエイプロテイン 1kg',
  item_caption: CAPTION,
  protein_per_100g: null,
  brand: null,
  ...over,
});

/* ---- 根拠の照合 ------------------------------------------------------- */

test('根拠の抜粋が説明文に実在すれば支持されたとみなす', () => {
  assert.equal(evidenceSupports(CAPTION, 'たんぱく質 76.5g'), true);
});

// 🔒 モデルは説明文に無い文を平気で作る。作られた根拠を通すと、値も作り話になる。
test('🔒 説明文に無い根拠は支持されたとみなさない', () => {
  assert.equal(evidenceSupports(CAPTION, 'たんぱく質 88.0g'), false);
  assert.equal(evidenceSupports(CAPTION, 'タンパク質含有率 76.5%'), false);
});

// 改行や全角空白の違いだけで落とすと、実在する根拠まで捨てることになる。
// 空白の詰め方だけは吸収する。それ以外の文字は一切変換しない。
test('空白の詰め方の違いは吸収する', () => {
  assert.equal(evidenceSupports(CAPTION, 'たんぱく質　76.5g'), true);
  assert.equal(evidenceSupports(CAPTION, 'エネルギー 402kcal たんぱく質 76.5g'), true);
});

test('根拠が空なら支持されたとみなさない', () => {
  for (const evidence of ['', null, undefined, '   ']) {
    assert.equal(evidenceSupports(CAPTION, evidence), false);
  }
});

/* ---- 値の受け取り ----------------------------------------------------- */

test('根拠が実在すれば含有率を受け取る', () => {
  const got = enrichRow(row(), { protein_per_100g: 76.5, protein_evidence: 'たんぱく質 76.5g' });

  assert.equal(got.row.protein_per_100g, 76.5);
  assert.deepEqual(got.rejected, []);
});

test('🔒 根拠が説明文に無ければ値を捨てて null のままにする', () => {
  const got = enrichRow(row(), { protein_per_100g: 88.0, protein_evidence: 'たんぱく質 88.0g' });

  assert.equal(got.row.protein_per_100g, null);
  assert.equal(got.rejected.length, 1);
  assert.match(got.rejected[0].reason, /根拠/);
});

// 根拠として説明文の別の箇所を貼れば、どんな数値でも通ってしまう。
// 🔒 根拠の中に値そのものが書かれていることまで確かめる。
test('🔒 根拠の中に値そのものが無ければ受け取らない', () => {
  const got = enrichRow(row(), { protein_per_100g: 76.5, protein_evidence: 'エネルギー 402kcal' });

  assert.equal(got.row.protein_per_100g, null);
  assert.match(got.rejected[0].reason, /値/);
});

test('🔒 想定レンジ外の含有率は受け取らない', () => {
  const caption = '【栄養成分表示(100gあたり)】たんぱく質 5.0g';
  const got = enrichRow(row({ item_caption: caption }), {
    protein_per_100g: 5.0,
    protein_evidence: 'たんぱく質 5.0g',
  });

  assert.equal(got.row.protein_per_100g, null);
  assert.match(got.rejected[0].reason, /範囲/);
});

// 🔒 人が商品ページを見て入れた値のほうが確かなので、後処理で塗り替えない。
test('🔒 すでに埋まっている値を上書きしない', () => {
  const got = enrichRow(row({ protein_per_100g: 80.0 }), {
    protein_per_100g: 76.5,
    protein_evidence: 'たんぱく質 76.5g',
  });

  assert.equal(got.row.protein_per_100g, 80.0);
});

test('ブランドは商品名か説明文に実在する場合だけ受け取る', () => {
  const ok = enrichRow(row(), { brand: 'テストブランド', brand_evidence: 'テストブランド ホエイプロテイン' });
  assert.equal(ok.row.brand, 'テストブランド');

  const ng = enrichRow(row(), { brand: '架空ブランド', brand_evidence: '架空ブランド ホエイプロテイン' });
  assert.equal(ng.row.brand, null);
});

/* ---- 取り込む項目の限定 ----------------------------------------------- */

// 🔒 N-02。効能・効果の文章をモデルに書かせて画面に載せる経路を作らない。
test('🔒 ホワイトリスト外の項目は取り込まない', () => {
  const got = enrichRow(row(), {
    protein_per_100g: 76.5,
    protein_evidence: 'たんぱく質 76.5g',
    description: '筋肉の成長をサポートします',
    summary: '吸収の良いプロテインです',
  });

  assert.equal(got.row.description, undefined);
  assert.equal(got.row.summary, undefined);
  assert.deepEqual(ENRICHABLE_FIELDS, ['protein_per_100g', 'brand']);
});

// 🔒 元の行を書き換えず、新しい行を返す。
test('元の行を書き換えない', () => {
  const original = row();
  enrichRow(original, { protein_per_100g: 76.5, protein_evidence: 'たんぱく質 76.5g' });

  assert.equal(original.protein_per_100g, null);
});

/* ---- プロンプト ------------------------------------------------------- */

// 🔒 出力させるのは数値と固有名詞だけ。読めなければ null を返させる。
test('🔒 プロンプトは根拠の抜粋を必ず返させ、読めなければ null と答えさせる', () => {
  const prompt = buildPrompt(row());

  assert.match(prompt, /null/);
  assert.match(prompt, /そのまま|原文|抜粋/);
  assert.ok(prompt.includes(CAPTION), '説明文がプロンプトに入っていません');
});

test('🔒 プロンプトは効能・効果を書かせない', () => {
  const prompt = buildPrompt(row());

  assert.match(prompt, /効能|効果/, '効能・効果を書かせない指示が入っていません');
});

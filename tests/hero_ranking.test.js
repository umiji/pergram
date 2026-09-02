/**
 * T-009 の受け入れテスト — ヒーローのランキングカードに出す3件。
 *
 * 完了条件 1・2・3・5 を二値で判定する。実データでビルドした dist/ を見る点が
 * tests/render.test.js（fixtures によるテンプレート単体の検証）との違いで、
 * 「指定した ID が実データに実在し、その順で出ているか」はここでしか分からない。
 *
 * 🔒 期待値は docs/tasks/T-009.md の「判断してよい範囲」に PO が確定させた3件が出所。
 *    このファイルで数字を作らない。3件の入れ替え・並び替えもここでは決めない。
 *
 * ⚠️ このテストは `node src/build/build.js` を実行し dist/ を作り直す。
 *    dist/ はビルド生成物なので作り直して問題ないが、他のテストは dist/ を読まない前提。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

/**
 * PO が確定させた掲載3件（docs/tasks/T-009.md「判断してよい範囲」）。
 * 配列の順がそのままカードの 1・2・3 になる。
 *
 * - unitCost / rank … 2026-08-24 時点の価格スナップショットから導かれる実値。
 *   価格更新（T-014）が復旧すると動きうる。動いたら design.md と T-009 の表も直す必要がある。
 * - displayCost / displayPack … 画面に出る書式済みの文字列。
 */
const HERO_EXPECTED = [
  {
    id: 'rakuten:myprotein:10001199',
    nameFragment: 'マイプロテイン ソイプロテイン アイソレート',
    unitCost: 3.9889,
    rank: 4,
    displayCost: '¥4.0',
    displayPack: '¥3,590',
  },
  {
    id: 'rakuten:aswel:10000094',
    nameFragment: 'ツインたんぱく',
    unitCost: 4.7848,
    rank: 5,
    displayCost: '¥4.8',
    displayPack: '¥3,780',
  },
  {
    id: 'rakuten:cherie-brin:10000171',
    nameFragment: 'ソイプロテイン 1kg 人工甘味料不使用',
    unitCost: 5.22,
    rank: 8,
    displayCost: '¥5.2',
    displayPack: '¥3,480',
  },
];

/**
 * 差し替え前の3件（実17位・19位・20位）。
 * 完了後にこれらが LP・`HERO_PRODUCT_IDS`・design.md の例外の表に残っていてはならない。
 */
const OLD_HERO = [
  { id: 'rakuten:kanedestore:10013364', nameFragment: 'アクアホエイプロテイン' },
  { id: 'rakuten:grong:10000788', nameFragment: 'ホエイプロテイン アイソレート WPI プレーン' },
  { id: 'rakuten:kyomo:10000507', nameFragment: 'マックスロード' },
];

const DESIGN_DOC = 'docs/design/design.md';
const HERO_EXCEPTION_HEADING = '## ヒーローのランキングカードの例外';

/* ---- ビルドを1回だけ走らせる ------------------------------------------ */

const buildStdout = execFileSync(
  process.execPath,
  ['--env-file-if-exists=.env.local', 'src/build/build.js'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
);
/** 空白の入り方に依存しないよう、比較は空白を落としてから行う */
const buildLog = buildStdout.replace(/\s+/g, '');

const buildSource = await readFile('src/build/build.js', 'utf8');
const lpHtml = await readFile('dist/ja/index.html', 'utf8');
const productsHtml = await readFile('dist/ja/protein/index.html', 'utf8');
const designDoc = await readFile(DESIGN_DOC, 'utf8');

/** LP のヒーロー（`<section class="hero">` の中）だけを切り出す */
function heroSection() {
  const start = lpHtml.indexOf('<section class="hero">');
  assert.notEqual(start, -1, 'LP に `<section class="hero">` がありません');
  const end = lpHtml.indexOf('</section>', start);
  assert.notEqual(end, -1, 'ヒーローの `</section>` が見つかりません');
  return lpHtml.slice(start, end);
}

/** ヒーローの1行（`<li>` 1つ分）を製品IDで切り出す */
function heroRowOf(id) {
  const hero = heroSection();
  const at = hero.indexOf(`data-product-id="${id}"`);
  if (at === -1) return null;
  const end = hero.indexOf('</li>', at);
  return hero.slice(at, end === -1 ? undefined : end);
}

/** 製品一覧（実データ・単価の昇順）から、その製品の順位と単価を読む */
function productsRowOf(id) {
  const at = productsHtml.indexOf(`data-product-id="${id}"`);
  if (at === -1) return null;
  const li = productsHtml.slice(productsHtml.lastIndexOf('<li ', at), productsHtml.indexOf('>', at));
  return {
    rank: Number(li.match(/data-rank="(\d+)"/)?.[1]),
    unitCost: Number(li.match(/data-unit-cost="([\d.]+)"/)?.[1]),
    price: Number(li.match(/data-price="([\d.]+)"/)?.[1]),
  };
}

/** design.md の「ヒーローのランキングカードの例外」の節だけを切り出す */
function heroExceptionSection() {
  const start = designDoc.indexOf(HERO_EXCEPTION_HEADING);
  assert.notEqual(
    start,
    -1,
    `${DESIGN_DOC} に「${HERO_EXCEPTION_HEADING}」の節がありません。` +
      '手動指定を続ける以上、例外の記録は削除しない（T-009 禁止事項）',
  );
  const next = designDoc.indexOf('\n## ', start + 1);
  return designDoc.slice(start, next === -1 ? undefined : next);
}

/**
 * 🔒 禁止語の出所は tests/render.test.js の BANNED_WORDS ひとつ。
 *    同じ一覧を2箇所に持つと片方だけ増えるので、ここでは読み取って使う。
 *    （T-010 が同じ期間に render.test.js を触るため、このファイルからは変更しない）
 */
async function bannedWords() {
  const src = await readFile('tests/render.test.js', 'utf8');
  const body = src.match(/const BANNED_WORDS = \[([\s\S]*?)\];/)?.[1];
  assert.ok(body, 'tests/render.test.js から BANNED_WORDS を読み取れませんでした');
  const words = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(words.length >= 10, `BANNED_WORDS の読み取り結果が少なすぎます: ${words.length} 件`);
  return words;
}

/* ---- 完了条件1: HERO_PRODUCT_IDS と、ビルドの警告出力 ------------------ */

test('完了条件1: HERO_PRODUCT_IDS が PO の確定した3件をこの順で持つ', () => {
  const body = buildSource.match(/const HERO_PRODUCT_IDS = \[([\s\S]*?)\];/)?.[1];
  assert.ok(body, 'src/build/build.js の HERO_PRODUCT_IDS の定義が読み取れません');

  const declared = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    declared,
    HERO_EXPECTED.map((p) => p.id),
    'HERO_PRODUCT_IDS が T-009 で確定した3件（と並び順）と一致しません',
  );
});

test('完了条件1: 手動指定は維持され、ビルドが警告を出力する', () => {
  assert.ok(
    buildLog.includes('⚠️ヒーローHERO_PRODUCT_IDSで手動指定した3件を出しています'),
    `ビルド出力に手動指定の警告がありません:\n${buildStdout}`,
  );
  // 🔒 ID が1つでも実データに無いと単価順へ落ちる。落ちた状態を「合格」にしない
  assert.ok(
    !buildLog.includes('HERO_PRODUCT_IDSの製品が見つからず単価順の上位'),
    `指定した ID が実データに見つからず、単価順の上位3件へフォールバックしています:\n${buildStdout}`,
  );
});

/* ---- 完了条件2: ビルド後の /ja/ のヒーローの中身 ----------------------- */

test('完了条件2: /ja/ のヒーローに確定した3件が確定した順で出る', () => {
  const ids = [...heroSection().matchAll(/data-product-id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    ids,
    HERO_EXPECTED.map((p) => p.id),
    'ヒーローに出ている製品、またはその並び順が T-009 の確定内容と違います',
  );
});

test('完了条件2: ヒーローの各行が、その製品の実データの単価と袋価格を出している', () => {
  for (const expected of HERO_EXPECTED) {
    const row = heroRowOf(expected.id);
    assert.ok(row, `ヒーローに ${expected.id} の行がありません`);
    assert.ok(
      row.includes(expected.nameFragment),
      `${expected.id} の行に製品名「${expected.nameFragment}」が出ていません`,
    );
    assert.ok(
      row.includes(expected.displayCost),
      `${expected.id} の行の単価が ${expected.displayCost} ではありません`,
    );
    assert.ok(
      row.includes(expected.displayPack),
      `${expected.id} の行の袋価格が ${expected.displayPack} ではありません`,
    );
  }
});

test('完了条件2: 差し替え前の3件が LP に残っていない', () => {
  for (const old of OLD_HERO) {
    assert.ok(!lpHtml.includes(old.id), `LP に差し替え前の製品 ${old.id} が残っています`);
  }
});

/**
 * 🔒 T-009 禁止事項。手動指定中は表示順が単価順と一致しないので、
 *    ItemList で「この順が順位である」と機械に断言してはならない。
 */
test('🔒 LP のヒーローに ItemList の構造化データを付けない', () => {
  assert.ok(!lpHtml.includes('ItemList'), 'LP に ItemList の構造化データが入っています');
});

/* ---- 実データ側の裏取り ------------------------------------------------ */

/**
 * PO が確定した3件の「実際の順位・単価」が、いま手元の実データと一致するかを見る。
 *
 * これが落ちたときはヒーローの実装ではなく**価格データが動いた**ということ。
 * design.md の例外の表と T-009 の表を実データで確認し直す必要がある（T-014 が価格更新を復旧させる）。
 */
test('T-009 が記録した順位・単価が、いまの実データと一致する', () => {
  for (const expected of HERO_EXPECTED) {
    const actual = productsRowOf(expected.id);
    assert.ok(actual, `製品一覧に ${expected.id} がありません`);
    assert.equal(
      actual.rank,
      expected.rank,
      `${expected.id} の実際の順位が ${expected.rank} 位から ${actual.rank} 位へ動いています` +
        '（価格データが変わった可能性。design.md と T-009 の表を確認すること）',
    );
    assert.equal(
      Number(actual.unitCost.toFixed(4)),
      expected.unitCost,
      `${expected.id} の実際の単価が ${expected.unitCost} から動いています`,
    );
  }
});

/* ---- 完了条件3: design.md の例外の表 ---------------------------------- */

test('完了条件3: design.md の例外の表が新しい3件の実際の単価と順位になっている', () => {
  const section = heroExceptionSection();

  for (const expected of HERO_EXPECTED) {
    const line = section
      .split('\n')
      .find((l) => l.includes(expected.nameFragment) || l.includes(expected.id));
    assert.ok(
      line,
      `${DESIGN_DOC} の例外の節に「${expected.nameFragment}」の行がありません`,
    );

    // 桁区切りのカンマは書き方に幅があるので落としてから見る
    const normalized = line.replace(/,/g, '');
    const cost = expected.displayCost.replace('¥', '');
    assert.ok(
      normalized.includes(cost),
      `「${expected.nameFragment}」の行に実際の単価 ${cost} が書かれていません: ${line}`,
    );

    // 単価（例 4.0）を取り除いてから、実際の順位が独立した数として出ているかを見る
    const withoutCost = normalized.split(cost).join(' ');
    assert.match(
      withoutCost,
      new RegExp(`(?<!\\d)${expected.rank}(?!\\d)`),
      `「${expected.nameFragment}」の行に実際の順位 ${expected.rank} が書かれていません: ${line}`,
    );
  }
});

test('完了条件3: design.md の例外の節に古い表が残っていない', () => {
  const section = heroExceptionSection();
  for (const old of OLD_HERO) {
    assert.ok(
      !section.includes(old.nameFragment),
      `${DESIGN_DOC} の例外の節に差し替え前の製品「${old.nameFragment}」が残っています`,
    );
  }
});

/* ---- 完了条件5: 禁止語 ------------------------------------------------- */

/**
 * 対象は LP（/ja/）だけにしてある。
 * 製品一覧（/ja/protein/）には実在の商品名「プロテイン効果 森永ココア味」が載っており
 * 禁止語「効果」を含む。T-009 の変更範囲の外なので、ここでは判定しない。
 */
test('完了条件5: 🔒 LP の出力に禁止語が含まれていない', async () => {
  for (const word of await bannedWords()) {
    assert.ok(!lpHtml.includes(word), `LP に禁止語「${word}」が含まれています`);
  }
});

/**
 * LP が集める入力の不変条件と、待機リストの受け口（Worker）。
 *
 * === もとは T-011 の受け入れテストだった（2026-09-07 / T-051 で作り替えた） ===
 * T-011 は LP の待機リストを「メールアドレス先行の2段階フォーム」にする作業で、
 * このファイルはその受け入れテストだった。**T-051 の完了条件6でそのフォーム
 * （`waitlist--step1`）が出力されなくなり、LP は段構造（要望 → アンケート →
 * メール → 支援）へ完全に置き換わった**（PO 判断。T-051 ## 申し送り 3）。
 *
 * したがって「ステップ1 / ステップ2」という区分はもう存在しない。**入力そのものの
 * 不変条件（取得項目を増やさない・必須にしない・注記を離さない・別ページへ飛ばさない）
 * だけを残し、置き場をこう読み替えてある。**
 *
 *   旧 ステップ1（メールアドレスだけ） → `[data-request-step="email"]` の中のフォーム
 *   旧 ステップ2（成分・購入先・要望）  → `[data-request-step="survey"]` の中のフォーム
 *   旧 `.waitlist__done`               → `[data-request-flow]`（段の器）
 *
 * === 段の「挙動」はここでは見ない ===
 * 押下で段が開くか、何が GA4 とサーバへ飛ぶかは tests/request_flow_behavior.test.js が
 * 持っている（`src/assets/request.js` を実行する）。**このファイルが持っていた
 * `src/assets/lp.js` を駆動する検査は、そちらへ移った分として削除した**（T-051）。
 *
 * 🔒 保存列は6つ（email / nutrients / channel / nutrients_other / requests / created_at）。
 *    段構造化は入力の分割であって、取得項目の追加ではない。
 * 🔒 送信後に別ページへ飛ばさない。
 * 🔒 自由記述の注記（`lp.form.freeTextNote`）を自由記述から離さない（N-01 / N-05）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

import { loadTranslator } from '../src/lib/i18n.js';
import { lpPage } from '../src/templates/lp.js';
import {
  CHANNEL_CHIPS,
  NUTRIENT_CHIPS,
  REQUESTS_MAX,
} from '../src/lib/waitlist_fields.js';
import worker from '../worker/index.js';
import { Element, parseFragment } from './mini_dom.js';
import { makeRows } from './fixtures.js';

const tJa = await loadTranslator('ja');
const tEn = await loadTranslator('en');
const rows = makeRows();
const MARKETS = JSON.parse(await readFile('config/markets.json', 'utf8'));

/** 🔒 保存してよい列。ここが増えたら要件が変わったということ */
const STORED_COLUMNS = ['email', 'nutrients', 'channel', 'nutrients_other', 'requests', 'created_at'];

/** フォームの入力欄として許される name。created_at は入力ではない */
const ALLOWED_FIELD_NAMES = new Set(['email', 'nutrients', 'channel', 'nutrients_other', 'requests']);

/** 🔒 取ってはいけない項目。名前で入り込んでいないかを見る */
const FORBIDDEN_FIELD_NAMES = [
  'age', 'birth', 'birthday', 'sex', 'gender', 'condition', 'symptom',
  'medication', 'medicine', 'height', 'weight', 'disease', 'health',
];

/**
 * design/service.md §7 と ad-lp.md §1 の禁止語。
 * tests/render.test.js の BANNED_WORDS と同一。テストファイルは import すると
 * 中のテストごと走ってしまうので、共有せず写してある。
 */
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

/** 自由記述の本文が GA4 へ漏れていないかを見るための目印 */
const SENTINEL = 'ZZQ';
const NUTRIENTS_OTHER_INPUT = `テスト用の成分名${SENTINEL}`;
const REQUESTS_INPUT = `テスト用のご要望${SENTINEL}`;
const TEST_EMAIL = 'step2@example.com';

/* ---- 描画とツリー ------------------------------------------------------ */

/**
 * LP を丸ごと描いて、その中の要望の導線を見る。
 *
 * 🔒 部品（`waitlist()` など）を直接呼ばない。**LP と製品一覧で段の描画を共用するか
 *    別々に持つかは実装の裁量**（T-051 ## 判断してよい範囲）なので、置き場を固定すると
 *    実装の選び方を縛ることになる。ページとして出た結果だけを見る。
 */
function renderWaitlist(t = tJa, locale = 'ja') {
  const mk = locale === 'en' ? MARKETS.US : MARKETS.JP;
  return lpPage({
    t,
    locale,
    currency: mk.currency,
    displayUnit: 'g',
    topRows: rows.slice(0, 3),
    totalCount: rows.length,
    nutrientName: locale === 'en' ? 'Protein' : 'タンパク質',
    disclosureKey: mk.disclosureKey,
    betaPath: `/${locale}/protein/`,
    gaMeasurementId: null,
    support: null,
  });
}

function tree(html) {
  const root = new Element('div');
  for (const node of parseFragment(html)) root.appendChild(node);
  return root;
}

/** 段の器。ここから外に要望の入力欄が漏れていないかも見る */
function flowRegion(root) {
  const flow = root.querySelector('[data-request-flow]');
  assert.ok(flow, '段の器（[data-request-flow]）が見つかりません');
  return flow;
}

/** 段の中のフォーム。無ければ未実装 */
function stepForm(root, kind) {
  const step = root.querySelector(`[data-request-step="${kind}"]`);
  assert.ok(step, `${kind} の段（[data-request-step="${kind}"]）がありません`);
  const form = step.querySelector('form');
  assert.ok(form, `${kind} の段にフォームがありません`);
  return form;
}

/** 旧ステップ1 = メールアドレスの段 */
function emailForm(root) {
  return stepForm(root, 'email');
}

/** 旧ステップ2 = アンケートの段 */
function surveyForm(root) {
  return stepForm(root, 'survey');
}

/** 利用者が値を入れる欄。送信ボタンや hidden は数えない */
function inputControls(scope) {
  return scope
    .querySelectorAll('input,textarea,select')
    .filter((el) => !['submit', 'button', 'reset', 'hidden'].includes(el.type));
}

function fieldNames(scope) {
  return [...new Set(inputControls(scope).map((el) => el.name).filter(Boolean))];
}

function chipValues(scope, name) {
  return scope.querySelectorAll(`input[name="${name}"]`).map((el) => el.getAttribute('value'));
}

/* ======================================================================== */
/* メールアドレスの段の入力欄はメールアドレス1つだけ                        */
/* ======================================================================== */

test('メールアドレスの段の入力欄がメールアドレス1つだけである', () => {
  const root = tree(renderWaitlist());
  const controls = inputControls(emailForm(root));

  assert.deepEqual(
    controls.map((el) => el.name),
    ['email'],
    `メールアドレスの段の入力欄が ${controls.map((el) => el.name || '(無名)').join(' / ')} です。` +
      'メールアドレス1つだけにする',
  );
  assert.equal(controls[0].getAttribute('type'), 'email');
});

test('見たい成分・購入先・自由記述はメールアドレスの段に残っていない', () => {
  const root = tree(renderWaitlist());
  const step = emailForm(root);

  for (const name of ['nutrients', 'channel', 'nutrients_other', 'requests']) {
    assert.equal(
      step.querySelectorAll(`[name="${name}"]`).length,
      0,
      `メールアドレスの段に ${name} が残っています。アンケートの段へ移す`,
    );
  }
});

/* ======================================================================== */
/* 🔒 自由記述の注記を、自由記述から離さない（N-01 / N-05）                  */
/* ======================================================================== */

test('🔒 自由記述の注記（lp.form.freeTextNote）が段の中にある', () => {
  for (const [locale, t] of [
    ['ja', tJa],
    ['en', tEn],
  ]) {
    const root = tree(renderWaitlist(t, locale));
    const note = t('lp.form.freeTextNote');
    assert.ok(
      flowRegion(root).textContent.includes(note),
      `${locale}: 自由記述の注記が段の中にありません。` +
        'N-01 / N-05 に対する唯一の防波堤なので、自由記述と一緒に移す',
    );
  }
});

test('🔒 注記は自由記述と同じ段にある（本文だけ移して注記を置き去りにしない）', () => {
  const root = tree(renderWaitlist());
  const survey = surveyForm(root);
  const freeTextFields = survey.querySelectorAll('[name="nutrients_other"],[name="requests"]');

  assert.ok(
    freeTextFields.length >= 2,
    'アンケートの段に自由記述（nutrients_other / requests）がありません',
  );
  assert.ok(
    survey.textContent.includes(tJa('lp.form.freeTextNote')),
    '自由記述がアンケートの段にあるのに注記がありません',
  );
});

/* ======================================================================== */
/* アンケートの段の中身と、そこに置いてはいけないもの                       */
/* ======================================================================== */

test('アンケートの段に、見たい成分・購入先・自由記述の3項目が揃っている', () => {
  const root = tree(renderWaitlist());
  const step2 = surveyForm(root);

  assert.deepEqual(
    chipValues(step2, 'nutrients'),
    NUTRIENT_CHIPS,
    '🔒 見たい成分のチップと並びは src/lib/waitlist_fields.js が唯一の出所',
  );
  assert.deepEqual(
    chipValues(step2, 'channel'),
    CHANNEL_CHIPS,
    '🔒 購入先のチップと並びは src/lib/waitlist_fields.js が唯一の出所',
  );
  assert.ok(step2.querySelector('[name="nutrients_other"]'), 'アンケートの段に nutrients_other がありません');
  assert.ok(step2.querySelector('[name="requests"]'), 'アンケートの段に requests がありません');
});

test('🔒 アンケートの段を必須にしない（required を付けない）', () => {
  const root = tree(renderWaitlist());
  const step2 = surveyForm(root);
  const required = inputControls(step2).filter((el) => el.required);

  assert.deepEqual(
    required.map((el) => el.name),
    [],
    'アンケートの入力が必須になっています。要望はボタンを押した時点で受け取っている',
  );
});

test('🔒 入力欄の name が保存列の範囲を超えていない（列を増やさない）', () => {
  const root = tree(renderWaitlist());
  for (const name of fieldNames(root)) {
    assert.ok(
      ALLOWED_FIELD_NAMES.has(name),
      `入力欄 "${name}" は保存列にありません。取得項目を増やさない`,
    );
  }
});

test('🔒 年齢・性別・体調・服薬を取る入力欄が無い', () => {
  const html = renderWaitlist().toLowerCase();
  for (const forbidden of FORBIDDEN_FIELD_NAMES) {
    assert.ok(
      !html.includes(`name="${forbidden}"`),
      `要配慮な項目 "${forbidden}" の入力欄があります`,
    );
  }
});

test('🔒 どのフォームも別ページへ送信しない（action / target を持たない）', () => {
  const root = tree(renderWaitlist());
  for (const form of root.querySelectorAll('form')) {
    assert.ok(
      !form.hasAttribute('action'),
      `フォームに action="${form.getAttribute('action')}" が付いています。同一ページ内で完結させる`,
    );
    assert.ok(!form.hasAttribute('target'), 'フォームに target が付いています');
  }
});

test('🔒 自由記述の maxlength は waitlist_fields.js の値と一致する', () => {
  const root = tree(renderWaitlist());
  const requests = root.querySelector('[name="requests"]');
  assert.ok(requests, '自由記述（requests）が見つかりません');
  assert.equal(
    Number(requests.getAttribute('maxlength')),
    REQUESTS_MAX,
    '画面の maxlength と Worker の切り詰めが食い違うと「入力できたのに保存されない」になる',
  );
});

/* ======================================================================== */
/* 禁止語                                                                   */
/* ======================================================================== */

test('🔒 禁止語が要望の導線の出力に含まれていない', () => {
  for (const [locale, t] of [
    ['ja', tJa],
    ['en', tEn],
  ]) {
    const html = flowRegion(tree(renderWaitlist(t, locale))).outerHTML;
    for (const banned of BANNED_WORDS) {
      assert.ok(!html.includes(banned), `${locale}: 禁止語「${banned}」が要望の導線の出力にあります`);
    }
  }
});

/* ======================================================================== */
/* ブラウザ相当の実行は tests/request_flow_behavior.test.js が持つ            */
/* ======================================================================== */
/*
 * もとはここに `src/assets/lp.js` を駆動する検査が7件あった（ステップ1の送信・
 * 失敗時の扱い・ステップ2の送信・GA4 のイベントの分離・自由記述とメールアドレスを
 * GA4 へ送らないこと）。**T-051 で LP が段構造へ置き換わり、段を動かすのは
 * `src/assets/request.js` になった**ため、同じ検査は
 * tests/request_flow_behavior.test.js（段の挙動・送信本文・GA4）と
 * tests/request_unify.test.js（匿名シグナル）へ移した。
 *
 * ⚠️ ここへ戻さないこと。同じ挙動を2つのファイルが別々の前提で見張ることになる。
 */

/* ======================================================================== */
/* Worker 側: 同一レコードへの追記と、列が増えていないこと                   */
/* ======================================================================== */

/**
 * D1 と静的アセットの偽物。実行された SQL とバインド値を記録する。
 * tests/worker.test.js と同じ組み立て方（テストファイルは import すると
 * 中のテストごと走ってしまうので、共有せず写してある）。
 */
function makeEnv() {
  const writes = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async run() {
                writes.push({ sql, args });
                return { success: true };
              },
            };
          },
        };
      },
    },
    ASSETS: {
      async fetch() {
        return new Response('asset', { status: 200 });
      },
    },
  };
  return { env, writes };
}

const post = (body, path = '/api/waitlist') =>
  new Request(`https://pergram.example${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** 既存の行を狙う書き込みか（新しい行を作らないか） */
function targetsExistingRow(sql) {
  const flat = sql.replace(/\s+/g, ' ').trim().toUpperCase();
  return /ON CONFLICT\s*\(\s*EMAIL\s*\)/.test(flat) || /^UPDATE\s+WAITLIST\b.*WHERE.*EMAIL/.test(flat);
}

test('メールアドレスだけの送信でレコードが作られる', async () => {
  const { env, writes } = makeEnv();
  const res = await worker.fetch(post({ email: TEST_EMAIL }), env);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(writes.length, 1, 'ステップ1の送信でレコードが作られていません');
  assert.equal(writes[0].args.length, STORED_COLUMNS.length, '🔒 保存列が6つではありません');
  assert.equal(writes[0].args[0], TEST_EMAIL);
});

test('🔒 アンケートを相乗りさせた送信は既存の行を狙う（新しい行を作らない）', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(post({ email: TEST_EMAIL }), env);
  await worker.fetch(
    post({
      email: TEST_EMAIL,
      nutrients: ['creatine'],
      channel: ['rakuten'],
      nutrients_other: NUTRIENTS_OTHER_INPUT,
      requests: REQUESTS_INPUT,
    }),
    env,
  );

  assert.equal(writes.length, 2, `書き込みが ${writes.length} 回です（2回であるべき）`);
  const second = writes[1];
  assert.ok(
    targetsExistingRow(second.sql),
    '🔒 ステップ2の書き込みが既存の行を狙っていません（email をキーにした UPSERT か UPDATE であること）',
  );
  assert.ok(
    second.args.includes(TEST_EMAIL),
    'ステップ2の書き込みにメールアドレスがバインドされていません',
  );
});

test('アンケートの3項目が保存の引数に載る', async () => {
  const { env, writes } = makeEnv();
  await worker.fetch(
    post({
      email: TEST_EMAIL,
      nutrients: ['creatine', 'hmb'],
      channel: ['rakuten'],
      nutrients_other: NUTRIENTS_OTHER_INPUT,
      requests: REQUESTS_INPUT,
    }),
    env,
  );

  const dumped = JSON.stringify(writes[0].args);
  for (const expected of ['creatine,hmb', 'rakuten', NUTRIENTS_OTHER_INPUT, REQUESTS_INPUT]) {
    assert.ok(dumped.includes(expected), `保存の引数に ${expected} がありません`);
  }
});

test('🔒 スキーマの waitlist テーブルの列が6つのままである', async () => {
  const schema = await readFile('worker/schema.sql', 'utf8');
  const block = schema.match(/CREATE TABLE IF NOT EXISTS waitlist\s*\(([\s\S]*?)\n\);/i);
  assert.ok(block, 'worker/schema.sql に waitlist テーブルの定義が見つかりません');

  const columns = block[1]
    .split('\n')
    .map((line) => line.replace(/--.*/, '').trim())
    .filter(Boolean)
    .map((line) => line.split(/[\s(,]/)[0].toLowerCase())
    .filter((name) => /^[a-z_]+$/.test(name) && !['primary', 'unique', 'foreign', 'check'].includes(name));

  assert.deepEqual(columns, STORED_COLUMNS, '🔒 保存列が変わっています');
});

/**
 * 表ごとに「足してよい列」。**ここに無い名前を移行 SQL で足さない。**
 * ⚠️ `request_signal.page` は PO 判断で足された（T-058、2026-09-08）。
 *    それ以前は request_signal に足せる列は無かった。**戻さないこと。**
 * 🔒 `waitlist` 側は今も6列で打ち止めである（T-058 でも足していない）。
 */
const ALLOWED_ADDED_COLUMNS = {
  waitlist: STORED_COLUMNS,
  request_signal: ['page'],
};

test('🔒 移行 SQL が保存列の外に列を足していない', async () => {
  const dir = 'worker/migrations';
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql'));
  for (const file of files) {
    // コメント行に書かれた説明（「ADD COLUMN IF NOT EXISTS は無い」など）を拾わない
    const sql = (await readFile(`${dir}/${file}`, 'utf8'))
      .split('\n')
      .map((line) => line.replace(/--.*/, ''))
      .join('\n');
    for (const [, table, column] of sql.matchAll(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/gi)) {
      const allowed = ALLOWED_ADDED_COLUMNS[table.toLowerCase()];
      assert.ok(allowed, `${file}: 想定していない表 "${table}" に列を足しています`);
      assert.ok(
        allowed.includes(column.toLowerCase()),
        `${file}: ${table} の保存列にない列 "${column}" を足しています`,
      );
    }
    assert.equal(
      (sql.match(/ADD COLUMN/gi) || []).length,
      (sql.match(/ALTER TABLE\s+\w+\s+ADD COLUMN/gi) || []).length,
      `${file}: どの表への ADD COLUMN か読み取れない行があります`,
    );
  }
});

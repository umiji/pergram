#!/usr/bin/env node
/**
 * 下書きの読み残しを、商品説明文から後処理で埋める。**下書き→下書き**。
 *
 * 正規表現（normalize_protein.js）で拾えるのは説明文の一部だけで、
 * 実データ100件のうち含有量を自動で読めたのは34件だった。残りは説明文に
 * 書いてあるのに書き方が揃わず読めていない。そこをモデルに読ませる。
 *
 * ── この処理が守る約束 ─────────────────────────────────
 *
 * 🔒 N-04（ユーザーリクエストパスで LLM を呼ぶ）を避けるため、独立したスクリプトに
 *    隔離する。ビルドにも Worker にも組み込まない。人が明示的に走らせる。
 *
 * 🔒 N-02（効能・効果の独自文章を生成する）を避けるため、受け取るのは数値と
 *    固有名詞だけ。ENRICHABLE_FIELDS 以外は取り込まない。
 *
 * 🔒 モデルの出力をそのまま信じない。根拠の抜粋を必ず返させ、それが説明文に
 *    文字列として実在するかコード側で照合する。実在しなければ値を捨てて null に戻す。
 *    これが「推測で埋めない」の担保であり、この層が唯一の防御線になる。
 *
 * ── 現状 ───────────────────────────────────────────
 *
 * 検証層のみ実装済み。モデルの呼び出し口（callModel）は未接続で、
 * enrichRows に外から渡す形にしてある。接続する前に、この層のテストが
 * 通り続けることを確認すること（tests/enrich.test.js）。
 */

import { PROTEIN_RATIO_RANGE } from '../src/lib/normalize_protein.js';

/** 🔒 モデルから受け取ってよい項目。増やすときは N-02 に触れないか確かめる */
export const ENRICHABLE_FIELDS = ['protein_per_100g', 'brand'];

/** 空白の詰め方だけを揃える。それ以外の文字は一切変換しない */
const collapseSpace = (s) => s.replace(/[\s　]+/g, ' ').trim();

/**
 * 根拠の抜粋が原文に文字列として実在するか。
 *
 * 🔒 モデルは説明文に無い文を平気で作る。作られた根拠を通せば値も作り話になる。
 *    実在の判定は「空白の詰め方を揃えたうえでの部分一致」までしか緩めない。
 */
export function evidenceSupports(source, evidence) {
  if (typeof source !== 'string' || typeof evidence !== 'string') return false;
  const needle = collapseSpace(evidence);
  if (needle.length === 0) return false;
  return collapseSpace(source).includes(needle);
}

/** 値そのものが根拠の中に書かれているか。別の箇所の抜粋で数値を通させない */
function evidenceStatesNumber(evidence, value) {
  const collapsed = collapseSpace(evidence);
  // 76.5 は「76.5」とも「76.50」とも書かれうる。末尾の 0 と小数点の有無を吸収する。
  const digits = String(value).replace(/\.0+$/, '');
  return collapsed.includes(digits);
}

/**
 * モデルの回答1件を下書きの行に反映する。
 *
 * @returns {{row: object, rejected: Array<{field: string, reason: string}>}}
 *   🔒 捨てた値は必ず rejected で報告する。黙って捨てると、読めなかったのか
 *      弾かれたのか分からなくなり、次に何を直せばよいか決められない。
 */
export function enrichRow(row, suggestion) {
  const rejected = [];
  const accepted = {};

  const reject = (field, reason) => rejected.push({ field, reason });

  const protein = suggestion?.protein_per_100g;
  if (protein !== undefined && protein !== null) {
    // 🔒 人が商品ページを見て入れた値のほうが確か。後処理で塗り替えない。
    if (row.protein_per_100g !== null && row.protein_per_100g !== undefined) {
      reject('protein_per_100g', 'すでに値が入っているため上書きしない');
    } else if (!Number.isFinite(protein)) {
      reject('protein_per_100g', '数値として読めない');
    } else if (!evidenceSupports(row.item_caption, suggestion.protein_evidence)) {
      reject('protein_per_100g', '根拠の抜粋が説明文に実在しない');
    } else if (!evidenceStatesNumber(suggestion.protein_evidence, protein)) {
      reject('protein_per_100g', '根拠の中に値そのものが書かれていない');
    } else if (protein < PROTEIN_RATIO_RANGE.min || protein > PROTEIN_RATIO_RANGE.max) {
      reject('protein_per_100g', `含有率が想定の範囲外（${PROTEIN_RATIO_RANGE.min}〜${PROTEIN_RATIO_RANGE.max}%）`);
    } else {
      accepted.protein_per_100g = protein;
    }
  }

  const brand = suggestion?.brand;
  if (brand !== undefined && brand !== null && brand !== '') {
    // ブランドは商品名にも説明文にも書かれうる。どちらかに実在すればよい。
    const source = `${row.item_name ?? ''}\n${row.item_caption ?? ''}`;
    if (row.brand !== null && row.brand !== undefined) {
      reject('brand', 'すでに値が入っているため上書きしない');
    } else if (!evidenceSupports(source, suggestion.brand_evidence)) {
      reject('brand', '根拠の抜粋が商品名にも説明文にも実在しない');
    } else if (!evidenceSupports(source, brand)) {
      reject('brand', 'ブランド名が商品名にも説明文にも実在しない');
    } else {
      accepted.brand = brand;
    }
  }

  // 🔒 ホワイトリスト外は捨てる。スプレッドで丸ごと混ぜない。
  return { row: { ...row, ...accepted }, rejected };
}

/**
 * モデルに渡す指示。
 *
 * 🔒 出力させるのは数値と固有名詞だけ。読めなければ null を返させる。
 *    「たぶん80%くらい」を許すと、単価が狂った行が黙って混ざる。
 */
export function buildPrompt(row) {
  return [
    'あなたは商品説明文の転記係です。以下の説明文に**書かれていることだけ**を抜き出してください。',
    '',
    '取り出す項目:',
    '1. protein_per_100g — 製品100gあたりのたんぱく質量（g）。含有率(%)と同じ値です。',
    '   - 1食あたりの表記しかない場合は、1食量で割って100gあたりに直してください。',
    '   - 「無水換算」「乾物換算」の値は**使わないでください**。製品そのままの値だけです。',
    '   - 「ホエイたんぱく質100%」は原材料の表示であって含有率ではありません。',
    '2. brand — ブランド名（固有名詞）。店舗名ではありません。',
    '',
    '規則:',
    '- 説明文に書かれていない項目は null にしてください。推測で埋めないでください。',
    '- 各項目について、根拠となる箇所を説明文から**そのまま**（原文のまま）抜粋して返してください。',
    '  言い換えたり要約したりしないでください。照合できず値を捨てることになります。',
    '- 🔒 効能・効果・おすすめ・品質の良し悪しを書かないでください。事実の転記だけを行ってください。',
    '',
    'JSON だけを返してください:',
    '{"protein_per_100g": number|null, "protein_evidence": string|null,',
    ' "brand": string|null, "brand_evidence": string|null}',
    '',
    `商品名: ${row.item_name ?? ''}`,
    '',
    '説明文:',
    row.item_caption ?? '',
  ].join('\n');
}

/**
 * 下書き全体に後処理をかける。
 *
 * @param {object[]} rows
 * @param {(prompt: string) => Promise<object>} callModel
 *   モデルの呼び出し口。🔒 まだ接続していない。テストでは偽の関数を渡す。
 */
export async function enrichRows(rows, callModel) {
  const out = [];
  const rejected = [];

  for (const row of rows) {
    // 読めている行と、材料の無い行には触らない
    if (row.protein_per_100g !== null || typeof row.item_caption !== 'string') {
      out.push(row);
      continue;
    }
    const suggestion = await callModel(buildPrompt(row));
    const result = enrichRow(row, suggestion);
    out.push(result.row);
    for (const r of result.rejected) rejected.push({ product_id: row.product_id, ...r });
  }

  return { rows: out, rejected };
}

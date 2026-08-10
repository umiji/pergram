/**
 * LP の共通パーツ。アイコン・製品サムネイル・チップ。
 *
 * 🔒 使ってはいけないビジュアル: 葉・植物・カプセル・錠剤・筋肉・ハート・
 *    体のシルエット・チェックマーク・人物写真。いずれも効能または推薦を連想させる。
 *    ここに置くのは「探す」「時間」「並び順」といった操作の記号だけ。
 */

import { escapeHtml } from '../../lib/i18n.js';

const SIGNAL = 'var(--signal)';

/** 探す — 全体を見渡せていない、という課題に対応する */
export const iconSearch = `<svg class="icon" width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
  <circle cx="11" cy="11" r="7.5" stroke="${SIGNAL}" stroke-width="1.8"/>
  <line x1="16.3" y1="16.3" x2="22" y2="22" stroke="${SIGNAL}" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

/** 時間 — 価格が古い、という課題に対応する */
export const iconClock = `<svg class="icon" width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
  <circle cx="13" cy="13" r="9.5" stroke="${SIGNAL}" stroke-width="1.8"/>
  <line x1="13" y1="13" x2="13" y2="7" stroke="${SIGNAL}" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="13" y1="13" x2="17" y2="14.5" stroke="${SIGNAL}" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

/**
 * 並び順 — 順位の決まり方、という課題に対応する。
 * モックはここに「回転した四角 + チェックマーク」を置いていたが、
 * チェックマークは推薦の記号なので降順に並んだ棒に差し替えている。
 */
export const iconSorted = `<svg class="icon" width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
  <line x1="4" y1="7" x2="22" y2="7" stroke="${SIGNAL}" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="4" y1="13" x2="16" y2="13" stroke="${SIGNAL}" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="4" y1="19" x2="10" y2="19" stroke="${SIGNAL}" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

/** 「含有量で割る」の矢印。横組み（PC）と縦組み（SP）で向きが変わる */
export const iconArrowRight = `<svg class="icon" width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
  <line x1="3" y1="11" x2="18" y2="11" stroke="${SIGNAL}" stroke-width="1.8" stroke-linecap="round"/>
  <polyline points="12.5,5.5 18,11 12.5,16.5" stroke="${SIGNAL}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export const iconArrowDown = `<svg class="icon" width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
  <line x1="11" y1="4" x2="11" y2="18" stroke="${SIGNAL}" stroke-width="1.8" stroke-linecap="round"/>
  <polyline points="5.5,12.5 11,18 16.5,12.5" stroke="${SIGNAL}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/**
 * 製品パッケージのサムネイル。
 *
 * 🔒 画像が存在しない製品は必ずある。欠損が「壊れている」ように見えてはならない
 *    （design.md §6）。URL がなければブランドの頭文字を出す。空白にしない。
 * 🔒 画像の縦横比・背景色はメーカーごとにバラバラ。object-fit: contain で揃える。
 */
export function packageThumb({ imageUrl, brand, noImageLabel, initial }) {
  if (imageUrl) {
    return `<img class="thumb" src="${escapeHtml(imageUrl)}" alt="" width="76" height="76" loading="lazy" decoding="async">`;
  }
  const letter = initial ?? String(brand ?? '').trim().slice(0, 1);
  return `<span class="thumb thumb--empty" role="img" aria-label="${escapeHtml(noImageLabel)}">
  <span aria-hidden="true">${escapeHtml(letter)}</span>
</span>`;
}

/** セクションの目印。見出しの上に置く短いラベル */
export function eyebrow(text) {
  return `<p class="eyebrow">${escapeHtml(text)}</p>`;
}

/**
 * フォームの選択肢。
 * 「見たい成分」も「普段の購入先」も複数選択（design.md §4.3）。
 * 単一選択が要る箇所は今のところ無い。要るようになったら `multiple: false` を渡す。
 */
export function optionChips({ name, keys, prefix, t, multiple, className }) {
  return keys
    .map(
      (key) => `<label class="${escapeHtml(className)}">
  <input type="${multiple ? 'checkbox' : 'radio'}" name="${escapeHtml(name)}" value="${escapeHtml(key)}">
  <span>${escapeHtml(t(`${prefix}.${key}`))}</span>
</label>`,
    )
    .join('\n');
}

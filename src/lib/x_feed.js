/**
 * 過去投稿フィード（RSS / Atom）の読み取りと、下書きとの重複判定。
 *
 * 🔒 直近の投稿と切り口が被っていないかを、印象ではなく文字列で確かめるために置く。
 *    フィードは外部サービスが吐くものなので、RSS 2.0 と Atom のどちらで来ても、
 *    本文が description でも content:encoded でも読めるようにしてある。
 *
 * 🔒 読めなかったものを推測で埋めない。本文が取れない item は text: '' のまま返し、
 *    重複判定から外す。作り話の「過去投稿」と突き合わせても意味がない。
 */

/** 数値文字参照と主要な名前付き実体だけを戻す。フィードは HTML を二重にエスケープしてくる */
function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * タグを落として本文だけにする。改行になるタグだけ改行として残す。
 *
 * ⚠️ フィード生成サービスは HTML を二重にエスケープしてくることがある
 *    （`&amp;lt;p&amp;gt;`）。1周しか回さないと本文に `<p>` が文字列として残り、
 *    重複判定がその分だけ狂う。落ちないので気づけない。
 */
function toPlainText(html) {
  let text = String(html ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

  // 実体を戻してからタグを落とす。二重エスケープは1周目で1段だけ戻るので、2周する
  for (let pass = 0; pass < 2; pass += 1) {
    text = decodeEntities(text)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '');
  }

  return text
    .replace(/[ \t　]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 最初に見つかった要素の中身。名前空間付き（content:encoded 等）も拾う */
function pickTag(xml, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  return xml.match(re)?.[1] ?? null;
}

/** Atom の <link href="..."/> と RSS の <link>...</link> の両方 */
function pickLink(xml) {
  const href = xml.match(/<link[^>]*\srel=["']alternate["'][^>]*\shref=["']([^"']+)["']/i);
  if (href) return decodeEntities(href[1]);
  const plain = pickTag(xml, 'link');
  if (plain && plain.trim() !== '') return decodeEntities(plain.trim());
  const anyHref = xml.match(/<link[^>]*\shref=["']([^"']+)["']/i);
  return anyHref ? decodeEntities(anyHref[1]) : null;
}

function pickDate(xml) {
  const raw =
    pickTag(xml, 'pubDate') ??
    pickTag(xml, 'published') ??
    pickTag(xml, 'updated') ??
    pickTag(xml, 'dc:date');
  if (raw === null) return null;
  const at = new Date(decodeEntities(raw).trim());
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/**
 * フィード本文を投稿の配列にする。新しい順に並べ替える。
 *
 * @param {string} xml
 * @returns {Array<{text: string, title: string, link: string|null, publishedAt: string|null}>}
 */
export function parseFeed(xml) {
  const source = String(xml ?? '');
  const blocks = [
    ...source.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...source.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  ].map((m) => m[1]);

  const items = blocks.map((block) => {
    const title = toPlainText(pickTag(block, 'title') ?? '');
    // 本文の在り処はフィード生成側によって違う。長い方が投稿の全文であることが多い
    const bodies = ['content:encoded', 'description', 'summary', 'content']
      .map((name) => toPlainText(pickTag(block, name) ?? ''))
      .filter((t) => t !== '');
    const text = bodies.sort((a, b) => b.length - a.length)[0] ?? title;

    return {
      title,
      text: text.length >= title.length ? text : title,
      link: pickLink(block),
      publishedAt: pickDate(block),
    };
  });

  return items.sort((a, b) => {
    if (a.publishedAt === b.publishedAt) return 0;
    if (a.publishedAt === null) return 1;
    if (b.publishedAt === null) return -1;
    return a.publishedAt < b.publishedAt ? 1 : -1;
  });
}

/**
 * 比較用の正規化。URL・記号・空白・ハッシュタグの # を落とし、全角英数を半角にする。
 * 「同じことを言っているか」だけを見たいので、飾りは全部落とす。
 */
export function normalizeForCompare(text) {
  return String(text ?? '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[!-/:-@[-`{-~、。・「」『』（）【】…—ー〜！？：；、，．＃#＠@]/g, '');
}

const bigrams = (text) => {
  const chars = [...normalizeForCompare(text)];
  const set = new Set();
  for (let i = 0; i < chars.length - 1; i += 1) set.add(chars[i] + chars[i + 1]);
  return set;
};

/**
 * 2つの文の近さ。文字 bigram の Jaccard 係数（0〜1）。
 * 語の切り出しに辞書が要らないので、日本語でも依存パッケージ無しで出せる。
 */
export function similarity(a, b) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** 近いと見なす閾値。これを超えたら切り口を変える */
export const SIMILAR_THRESHOLD = 0.35;

/**
 * 下書きに近い過去投稿を近い順に返す。
 * @param {string} draft
 * @param {Array<{text: string}>} items
 */
export function mostSimilar(draft, items, limit = 3) {
  return (items ?? [])
    .map((item) => ({ item, score: similarity(draft, item.text) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * 切り口の棚卸しに使う語。docs/Marketing/X_post_strategy.md §2 の語彙が出所。
 * 「まだ使っていない角度」を機械的に出すためだけのもので、投稿文の語彙集ではない。
 */
export const THEME_LEXICON = {
  電卓: /電卓|計算がめんどう|手計算/,
  セール: /セール|プライムデー|ブラックフライデー|ゾロ目|スーパーセール/,
  含有率: /含有率|タンパク質量|実質/,
  WPI_WPC: /WPI|WPC|ホエイ|カゼイン|ソイ/,
  値上げ: /値上げ|高騰|価格改定|円安/,
  ランキング: /ランキング|1位|順位|上位|比較しました|全計算/,
  中立性: /中立|報酬|アフィリエイト|順位に影響/,
  内容量の罠: /kgで|大容量|袋の(価格|値段)|パッケージ(価格|の値段)/,
  更新頻度: /毎日|更新|取り直し|最新の価格/,
  フレーバー: /フレーバー|味|プレーン|チョコ/,
  送料: /送料/,
  β版: /β|ベータ|beta|検証中|Waitlist|待機リスト/,
  使い方: /登録不要|無料|ブックマーク|使い方|絞り込み/,
};

/**
 * 直近の投稿で使われたテーマの回数。多い順。
 * @param {Array<{text: string}>} items
 */
export function themeCounts(items) {
  const counts = new Map(Object.keys(THEME_LEXICON).map((key) => [key, 0]));
  for (const item of items ?? []) {
    for (const [key, pattern] of Object.entries(THEME_LEXICON)) {
      if (pattern.test(item.text ?? '')) counts.set(key, counts.get(key) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** 直近の投稿に一度も出てこなかったテーマ */
export const unusedThemes = (items) =>
  themeCounts(items)
    .filter(([, count]) => count === 0)
    .map(([key]) => key);

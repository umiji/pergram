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
 * トピックの棚卸しに使う語。**族（family）→ トピック**の2段で持つ。
 *
 * 🔒 **ここが痩せると、アカウントが1つの話しかしなくなる。**
 *    最初は13項目すべてが価格の言い換えで、どれを選んでも単価の話になった。
 *    次に12項目へ広げたが、半分が「うちのデータ」「うちの作業」の話だったため、
 *    今度は**どれを選んでもサービスの話に着地する**（読み手からは宣伝に見える）。
 *
 *    そこで族を分け、**価格系（お金の話の一部）と自社系（うちの話）に上限を持たせた**。
 *    上限は `priceBalance` / `selfBalance` が数で出し、`nextTopics` が候補から外す。
 *    増やすときは「価格でも自社でもない」族に足す。ネタの具体例は
 *    .claude/skills/x-post/reference/topics.md。
 *
 *    読み手はコスパ重視のトレーニーで、**うちのサービスの話より業界の話の方が読まれる。**
 *    線は1本だけ: pergram の視点（数字・単位・比較・出典）が入っていれば題材は何でもよい。
 */
export const TOPIC_LEXICON = {
  // Ⅰ お金の話 — 読み手の財布に直接効く
  単価の出し方: /1\s?[gｇ]あたり|単価|含有率で割|袋の(値段|価格)|実質|per\s?gram/i,
  価格の動き: /セール|プライムデー|ゾロ目|スーパーセール|取得日|取り直|値動き/,
  相場と値上げ: /値上げ|高騰|相場|原料価格|乳価|輸入単価|円安|関税|需給|価格改定|GLP-1/,
  セールの仕組み: /ポイント(還元|倍|付与)|クーポン|買い回り|還元率|定期購入|サブスク|送料無料ライン/,
  買い方の実務: /送料|免税|個人輸入|まとめ買い|小分け|開封|使い切|賞味期限/,

  // Ⅱ 読み方 — ラベルと数字のリテラシー。プロテインを買う人全員に当てはまる
  表示の読み方: /栄養成分表示|100\s?[gｇ]あたり|1食あたり|無水|乾物|アミノ酸組成|原材料(名|表示)|表記ゆれ|基準は/,
  単位と換算: /元素量|酸化マグネシウム|キレート|換算|mcg|μg|IU|ポンド|オンス|スクープ/i,
  数字の読み方: /母数|回答者|n\s?=|アンケート|調査|平均と中央値|統計|割合の/,
  単位価格という考え方: /ユニットプライス|単位価格|棚|スーパーの|条例|ISO\s?21041|100\s?mlあたり/,

  // Ⅲ 業界と製品 — 買っている本人が理由を知らないまま払っている話
  製品の種類と製法: /WPI|WPC|WPH|ホエイ|ソイ|カゼイン|ピープロテイン|EAA|BCAA|製法|イオン交換|加水分解|フレーバー/i,
  原料と生産: /チーズ|副産物|乳清|生乳|乳業|生産国|工場|OEM|ロット/,
  歴史: /かつて|昔は|年代に|もともと|発売当時|の由来|始まりは/,
  業界の動き: /新製品|リニューアル|終売|自主回収|参入|撤退|出荷量|シェア/,
  規制と表示制度: /食品表示法|景品表示法|措置命令|栄養機能食品|機能性表示|届出|規格基準|消費者庁|食事摂取基準/,
  海外事情: /海外|アメリカ|米国|欧州|iHerb|現地価格|ドル建て|為替/i,

  // Ⅳ 生活と現場 — 共感で会話が起きる。🔒 効能に一歩で届くので事実だけ
  保管と扱い: /ダマ|溶け残|湿気|固ま|保管|シェイカー|計量|詰め替え/,
  買う場所: /ドラッグストア|コストコ|業務スーパー|ドンキ|店頭|実店舗|量販/,
  用語の話: /とは何か|の意味|略して|呼び方|用語|言い換える/,
  失敗談: /間違え|やらかし|勘違い|見落と|踏んだ|買い直/,

  // Ⅴ うちの話（🔒 上限あり）— ここだけで回すと宣伝アカウントになる
  作る側の裏話: /API|検索結果|商品名から|絞り込|除外|読み取|自動で読|件中|件のうち|人力|手入力|下書き|名寄せ|JAN/,
  サービスの方針: /報酬|アフィリエイト|中立|順位は|保存しない|受け付けない|スコアを作ら|レビュー(の星|は使)/,
  これから: /待機リスト|次に(増やす|対応)|対応予定|β版|ベータ版/,
};

/**
 * 族。**同じ族を2本続けない**ための単位で、トピックより粗く見る。
 * トピックを変えても族が同じだと、読み手には同じ話をしているように見える。
 */
export const TOPIC_FAMILIES = {
  お金の話: ['単価の出し方', '価格の動き', '相場と値上げ', 'セールの仕組み', '買い方の実務'],
  読み方: ['表示の読み方', '単位と換算', '数字の読み方', '単位価格という考え方'],
  業界と製品: ['製品の種類と製法', '原料と生産', '歴史', '業界の動き', '規制と表示制度', '海外事情'],
  生活と現場: ['保管と扱い', '買う場所', '用語の話', '失敗談'],
  うちの話: ['作る側の裏話', 'サービスの方針', 'これから'],
};

/** トピック → 族。族に入れ忘れたトピックは 'その他' になる（テストで落とす） */
export const familyOf = (topic) =>
  Object.entries(TOPIC_FAMILIES).find(([, list]) => list.includes(topic))?.[0] ?? 'その他';

/** 🔒 価格の話に寄っているかを見るためのトピック。3本に1本まで */
export const PRICE_TOPICS = ['単価の出し方', '価格の動き'];

/**
 * 🔒 うちの話。**5本に1本まで。**
 *
 *    サービスの話は「毎回どこかで自分の宣伝に着地する」形になりやすく、
 *    読み手からはステルスマーケティングに見える。告知は毎回しなくてよい。
 */
export const SELF_TOPICS = TOPIC_FAMILIES.うちの話;

/** 上限。分母は `x:feed` が見る直近の本数 */
export const PRICE_MAX_RATIO = 1 / 3;
export const SELF_MAX_RATIO = 1 / 5;
/** 🔒 URL を貼る（＝告知になる）投稿の上限。10本に1本 */
export const LINK_MAX_RATIO = 1 / 10;

const textOf = (item) => String(item?.text ?? '');

/** 投稿1件に当たるトピック。1件が複数に当たることはある */
export const topicsOf = (item) =>
  Object.entries(TOPIC_LEXICON)
    .filter(([, pattern]) => pattern.test(textOf(item)))
    .map(([key]) => key);

/**
 * 直近の投稿で使われたトピックの回数。多い順。
 * @param {Array<{text: string}>} items
 */
export function topicCounts(items) {
  const counts = new Map(Object.keys(TOPIC_LEXICON).map((key) => [key, 0]));
  for (const item of items ?? []) {
    for (const key of topicsOf(item)) counts.set(key, counts.get(key) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** 族ごとの回数。多い順 */
export function familyCounts(items) {
  const counts = new Map(Object.keys(TOPIC_FAMILIES).map((key) => [key, 0]));
  for (const item of items ?? []) {
    const families = new Set(topicsOf(item).map(familyOf));
    for (const family of families) {
      if (counts.has(family)) counts.set(family, counts.get(family) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** 指定のトピック群に当たった投稿の割合を数える */
function balanceOf(items, topics, maxRatio) {
  const list = items ?? [];
  const hit = list.filter((item) => topics.some((key) => TOPIC_LEXICON[key].test(textOf(item)))).length;
  const total = list.length;
  const ratio = total === 0 ? 0 : hit / total;
  return { hit, total, ratio, maxRatio, heavy: total >= 3 && ratio > maxRatio };
}

/**
 * 価格の話に何本使ったか。
 *
 * 🔒 単価はサービスの中心だが、**それしか言わないアカウントは飽きられる**。
 *    ミュート（-58.8）は同じ話の繰り返しで踏む。3本に1本を超えたら偏り。
 *
 * @param {Array<{text: string}>} items
 */
export function priceBalance(items) {
  const { hit, total, ratio, heavy } = balanceOf(items, PRICE_TOPICS, PRICE_MAX_RATIO);
  return { price: hit, total, ratio, heavy };
}

/**
 * うちの話に何本使ったか。
 *
 * 🔒 **ステマ感はここで出る。**サービスの話が5本に1本を超えると、
 *    読み手には「毎回宣伝している」ように見える。告知は毎回しなくてよい。
 *
 * @param {Array<{text: string}>} items
 */
export function selfBalance(items) {
  const { hit, total, ratio, heavy } = balanceOf(items, SELF_TOPICS, SELF_MAX_RATIO);
  return { self: hit, total, ratio, heavy };
}

/**
 * URL を貼った投稿（＝サイトへの誘導）が何本あったか。10本に1本まで。
 * @param {Array<{text: string}>} items
 */
export function linkBalance(items) {
  const list = items ?? [];
  const links = list.filter((item) => /https?:\/\/\S+/.test(textOf(item))).length;
  const total = list.length;
  const ratio = total === 0 ? 0 : links / total;
  return { links, total, ratio, heavy: total >= 5 && ratio > LINK_MAX_RATIO };
}

/**
 * 🔒 **次の1本にどのトピックを選ぶかを、印象ではなく直近の実績から出す。**
 *
 * 落とす順は skill 側（reference/persona.md ④）と同じ:
 *   1. 直近2本と同じ族を外す（トピックを変えても族が同じなら同じ話に見える）
 *   2. 価格系が 1/3 を超えていたら価格系を外す
 *   3. 自社系が 1/5 を超えていたら自社系を外す
 *   4. 残りを「直近で使っていない順 → 族が薄い順」に並べる
 *
 * 全部外れたときは 1 を緩める（族の重複より、価格・自社への偏りを避ける方を優先する）。
 *
 * @param {Array<{text: string}>} items 直近の投稿（新しい順）
 * @param {number} limit 返す候補数
 * @returns {Array<{topic: string, family: string, used: number, reason: string}>}
 */
export function nextTopics(items, limit = 5) {
  const list = items ?? [];
  const counts = new Map(topicCounts(list));
  const familyUse = new Map(familyCounts(list));
  const recentFamilies = new Set(list.slice(0, 2).flatMap((item) => topicsOf(item).map(familyOf)));
  const priceHeavy = priceBalance(list).heavy;
  const selfHeavy = selfBalance(list).heavy;

  const rank = (topics) =>
    topics
      .map((topic) => ({
        topic,
        family: familyOf(topic),
        used: counts.get(topic) ?? 0,
        reason:
          (counts.get(topic) ?? 0) === 0
            ? '直近では話していない'
            : `直近 ${counts.get(topic)} 本で触れている。角度と型を変える`,
      }))
      .sort(
        (a, b) =>
          a.used - b.used ||
          (familyUse.get(a.family) ?? 0) - (familyUse.get(b.family) ?? 0) ||
          a.topic.localeCompare(b.topic, 'ja'),
      );

  // 🔒 候補を族ごとに1つずつ拾う。並べ替えただけだと同じ族が上位を埋め、
  //    「族を回す」ための出力なのに選択肢が1つの族に見える
  const spread = (ranked) => {
    const byFamily = new Map();
    for (const candidate of ranked) {
      if (!byFamily.has(candidate.family)) byFamily.set(candidate.family, []);
      byFamily.get(candidate.family).push(candidate);
    }
    const out = [];
    while (out.length < limit && [...byFamily.values()].some((list) => list.length > 0)) {
      for (const list of byFamily.values()) {
        if (out.length >= limit) break;
        const next = list.shift();
        if (next) out.push(next);
      }
    }
    return out;
  };

  const allowed = Object.keys(TOPIC_LEXICON).filter((topic) => {
    if (priceHeavy && PRICE_TOPICS.includes(topic)) return false;
    if (selfHeavy && SELF_TOPICS.includes(topic)) return false;
    return true;
  });

  const fresh = allowed.filter((topic) => !recentFamilies.has(familyOf(topic)));
  return spread(rank(fresh.length > 0 ? fresh : allowed));
}

/** 直近の投稿に一度も出てこなかったトピック。ここから次の1本を選ぶ */
export const unusedTopics = (items) =>
  topicCounts(items)
    .filter(([, count]) => count === 0)
    .map(([key]) => key);

/**
 * X 投稿文の機械チェック。CLAUDE.md「コピーの規則」/ docs/Marketing/X_post_strategy.md
 *
 * 🔒 ここが持つのは「機械が判定できる規則」だけ。文章を作るのは
 *    .claude/skills/x-post/ の仕事で、このファイルは出来上がった文を落とすためにある。
 *    判定を2箇所に持たない。skill 側に禁止語の一覧を書き写さない。
 *
 * 🔒 X の文字数は「見た目の文字数」ではない。日本語1文字は2、URL は長さに関わらず
 *    23 として数えられる（t.co で固定長に短縮されるため）。素の length で数えると
 *    URL 付きの投稿だけが必ず溢れる。
 */

/** 運用上の上限。日本語の投稿はここで止める（= 加重 280 と同じ） */
export const POST_LIMIT = 140;

/** X 側の実装上の上限。加重後の値で数える */
export const WEIGHTED_LIMIT = 280;

/** t.co 短縮後の固定長。URL の実際の長さは数えられない */
export const URL_LENGTH = 23;

/** 本文中の URL。全角空白と引用符でも切る */
export const URL_PATTERN = /https?:\/\/[^\s　"'<>]+/g;

/**
 * 加重 1 で数える符号位置の範囲（twitter-text の設定と同じ）。
 * ここに入らない文字はすべて加重 2。日本語・絵文字は加重 2 になる。
 */
const WEIGHT_ONE_RANGES = [
  [0, 4351],
  [8192, 8205],
  [8400, 8447],
  [65024, 65039],
];

const weightOf = (codePoint) =>
  WEIGHT_ONE_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi) ? 1 : 2;

/**
 * 投稿1件の長さ。
 *
 * `chars` は人が数える文字数（URL は 23 文字として数える）、
 * `weighted` は X が実際に使う加重長で、上限は 280。
 *
 * ⚠️ ZWJ で繋いだ絵文字（👨‍👩‍👧 等）は X 側では1文字だが、ここでは構成要素ごとに
 *    数えるため多めに出る。多く見積もる方向の誤差なので投稿が弾かれることはない。
 *
 * @param {string} text
 */
export function postLength(text) {
  const source = String(text ?? '');
  const urls = source.match(URL_PATTERN) ?? [];
  const rest = source.replace(URL_PATTERN, '');

  let weighted = urls.length * URL_LENGTH;
  for (const ch of rest) weighted += weightOf(ch.codePointAt(0));

  return {
    chars: [...rest].length + urls.length * URL_LENGTH,
    weighted,
    urls,
  };
}

/** URL を取り除いた本文。ハッシュタグや記号の判定を URL の中身で汚さない */
export const stripUrls = (text) => String(text ?? '').replace(URL_PATTERN, ' ');

/**
 * 🔒 禁止語。CLAUDE.md「コピーの規則」と N-02 / N-03 / N-07 / N-09 / N-10 が出所。
 *    増やすときは CLAUDE.md 側を先に直す。ここだけ増やすと規則が二重になる。
 */
export const BANNED = [
  // コピーの規則（景表法・薬機法に直結する語）
  { code: 'copy.kiku', pattern: /効く|効きます/, hint: '成分の働きを書かない（N-02）' },
  { code: 'copy.kouka', pattern: /効果/, hint: '成分の働きを書かない（N-02）' },
  { code: 'copy.kaizen', pattern: /改善/, hint: '事実だけを書く' },
  { code: 'copy.hinshitsu', pattern: /高品質/, hint: '優劣を述べない' },
  { code: 'copy.osusume', pattern: /おすすめ|オススメ|お勧め/, hint: '優劣を述べない' },
  { code: 'copy.ninki', pattern: /人気No\.?1|人気ナンバー(ワン|1)/, hint: '優劣を述べない' },
  { code: 'copy.anshin', pattern: /安心/, hint: '事実だけを書く' },
  { code: 'copy.wadai', pattern: /話題の/, hint: '事実だけを書く' },
  { code: 'copy.erabareru', pattern: /選ばれ(る|て)/, hint: '優劣を述べない' },
  { code: 'copy.jikkan', pattern: /実感/, hint: '体感を語らない（N-02）' },

  // 呼び方（この skill の運用ルール）
  { code: 'voice.tool', pattern: /ツール/, hint: '「サービス」または「Webサービス」と呼ぶ' },
  { code: 'voice.indie', pattern: /個人開発|一人で作/, hint: '公式アカウントとして書く' },

  // 🔒 ブランド表記
  { code: 'brand.case', pattern: /Pergram|PerGram|PERGRAM|pergram(?=[a-z])/, hint: 'pergram（全て小文字）' },

  // 人格（reference/voice.md の × 列）。企業アカウントの定型文で書かない
  { code: 'voice.corporate', pattern: /当社|弊社|このたび|ローンチ|ご利用ください|くださいませ|いただければ幸い|皆様|お客様/, hint: '中の人が普通に喋る。企業の定型文にしない' },
  { code: 'voice.recommend', pattern: /絶対[^。\n]{0,10}(買|選|使)|買ったほうがいい|買うべき/, hint: '優劣を断定しない。事実を置いて判断は読み手に渡す' },

  // 🔒 やってはいけないこと
  { code: 'n02.claim', pattern: /筋肥大|免疫|疲労回復|脂肪燃焼|痩せ|やせ|美肌|代謝が/, hint: 'N-02 成分の効能を書かない' },
  { code: 'n03.score', pattern: /総合スコア|品質スコア|独自スコア|点満点/, hint: 'N-03 独自スコアを作らない' },
  { code: 'n07.diagnose', pattern: /あなた[はに][^。]{0,24}(不足|欠乏|足りて)/, hint: 'N-07 診断的表現を書かない' },
  { code: 'n09.aga', pattern: /AGA|育毛|薄毛|抜け毛/, hint: 'N-09 育毛の文脈で成分を扱わない' },
  { code: 'n10.beauty', pattern: /妊活|バストアップ|美容医療|アンチエイジング/, hint: 'N-10 その文脈で成分を扱わない' },
];

/**
 * 断定を避けたい語。error にはしない（戦略文書の例文が使っている）が、
 * 出典を添えられないなら書き換える。
 */
export const SUSPECT = [
  { code: 'claim.superlative', pattern: /最強|神コスパ|圧倒的|ナンバー(ワン|1)|No\.?1|ベスト/, hint: '「最安」は事実。順位の断定は計算結果に限る' },
  // 人格（reference/voice.md の △ 列）。詳しい友達であって、テンションの高い人ではない
  { code: 'voice.hype', pattern: /ガチで|やばい|やばすぎ|ｗｗ|www|うおお|神です|バズ/, hint: '淡々と。テンションで押さない' },
  { code: 'voice.today', pattern: /今日の(最安|1\s?[gｇ]単価|価格)|本日の/, hint: '🔒 価格の取得日が今日でないなら「今日の」と書かない（x:facts の取得日を見る）' },
  // 🔒 AI っぽい文章。対句・倒置・抽象名詞・余韻の語尾でごまかしていないか
  //    （reference/voice.md「AI slop の型」）。拾えるのは形だけなので、残りは人が見る
  { code: 'voice.poem', pattern: /(じゃなくて|ではなく)、[^。\n]{0,24}だった|という(こと|話)(です|だ)?。|な気がする/, hint: 'ポエムになっている。口で言うならどう言うかに置き換える' },
  { code: 'claim.absorb', pattern: /吸収(が|率|力)/, hint: '成分の性質を語らない（N-02）' },
  { code: 'claim.symptom', pattern: /症状|不調|悩み/, hint: 'N-01 症状の文脈に入らない' },
];

/**
 * 🔒 誘導の言い回し。**単発と1投稿目に入ると、その投稿は告知になる。**
 *
 *    サービスの話は5本に1本・URL は10本に1本までで、**残りは告知しない**
 *    （`src/lib/x_feed.js` の `SELF_MAX_RATIO` / `LINK_MAX_RATIO`）。
 *    毎回どこかで自分の宣伝に着地する投稿は、読み手からはステルスマーケティングに見える。
 *    ツリーの2投稿目は誘導のために置く場所なので、ここでは見ない。
 */
export const PROMO_PATTERN =
  /詳しくは|チェックして|覗いて|使ってみて|見てみて|作りました|作ってます|作っています|公開しました|リリースしました|(ぜひ|よければ|よかったら)[^。]{0,14}(使|見|試|どうぞ)/;

/**
 * タイムラインで折りたたまれる行。
 *
 * ブラウザは「140文字以下かつ10行以下なら全文、11行目以降は『さらに表示』の向こう側」。
 * スマホアプリは仕様変更が続いていて、10行前後で折りたたまれるという報告もある。
 * ⚠️ 端末とバージョンで違うので、**9行以内なら全端末で全文**、それを超えたら
 *    「隠れる前提で組む」の2択で扱う。行数を厳密に当てにいかない。
 */
export const FOLD_LINES = 10;

/**
 * 1行に収まる文字数の目安。スマホで 20〜25文字（iPhone は 22 前後）。
 * 1行目がこれを超えると、フックが2行に割れて読み飛ばされる。
 */
export const LINE_CHARS = 25;

/**
 * タイムラインでどう見えるか。
 *
 * 🔒 「引き」を作る型（最後の1つだけ伏せる、オチを2投稿目に置く）は、
 *    どこで切れるかが分かって初めて設計できる。切れる位置を目視で当てない。
 *
 * @param {string} text
 */
export function timelineLayout(text) {
  const lines = String(text ?? '').split('\n');
  const folded = lines.length > FOLD_LINES;

  return {
    lines,
    lineCount: lines.length,
    /** 折りたたまれるか。ブラウザで 11 行目以降が隠れる */
    folded,
    /** 「さらに表示」を押す前に見える行 */
    visible: folded ? lines.slice(0, FOLD_LINES) : lines,
    /** 押さないと見えない行 */
    hidden: folded ? lines.slice(FOLD_LINES) : [],
    /** 折り返しが起きる長い行（0 始まりの行番号） */
    longLines: lines
      .map((line, i) => ({ i, over: [...line].length > LINE_CHARS }))
      .filter(({ over }) => over)
      .map(({ i }) => i),
  };
}

const HASHTAG_PATTERN = /(?:^|[\s　])[#＃][^\s　#＃]+/g;

/** スキーム無しのドメイン。X は自動リンクし、23 文字として数える */
const BARE_DOMAIN_PATTERN = /(?:^|[\s　（(])((?:[\w-]+\.)+(?:site|com|jp|dev|io|net|org))(?=[/\s　)）]|$)/;

/** 金額らしき表記 */
const MONEY_PATTERN = /[¥￥]\s?\d|\d+\s?円/;
/** 単価であることが読み取れる書き方 */
const BASIS_PATTERN = /\/\s?[gｇ]\b|\/[^\n]{0,10}1\s?[gｇ]|1\s?[gｇ]あたり|あたり|per\s?g/i;

/**
 * 投稿1件を機械チェックする。
 *
 * @param {string} text
 * @param {{position?: number, isTail?: boolean}} [options]
 *   position は1始まり。ツリーの1投稿目に URL があると error になる。
 *   isTail はツリーの最後の投稿。誘導の言い回しはそこだけ許す。
 * @returns {Array<{severity: 'error'|'warn', code: string, message: string}>}
 */
export function lintPost(text, options = {}) {
  const source = String(text ?? '');
  const issues = [];
  const add = (severity, code, message) => issues.push({ severity, code, message });

  const { chars, weighted, urls } = postLength(source);
  if (chars > POST_LIMIT) {
    add('error', 'length.chars', `${chars} 文字。${POST_LIMIT} 文字以内に収める（超過 ${chars - POST_LIMIT}）`);
  }
  if (weighted > WEIGHTED_LIMIT) {
    add('error', 'length.weighted', `加重 ${weighted}。X の上限は ${WEIGHTED_LIMIT}`);
  }
  if (source.trim() === '') add('error', 'length.empty', '本文が空');

  const body = stripUrls(source);

  for (const { code, pattern, hint } of BANNED) {
    const hit = body.match(pattern);
    if (hit) add('error', code, `禁止語「${hit[0]}」— ${hint}`);
  }
  for (const { code, pattern, hint } of SUSPECT) {
    const hit = body.match(pattern);
    if (hit) add('warn', code, `要検討「${hit[0]}」— ${hint}`);
  }

  // 🔒 誘導はツリーの後ろの投稿の仕事。単発と1投稿目に混ざると、毎回宣伝しているように見える
  if (!options.isTail) {
    const promo = body.match(PROMO_PATTERN);
    if (promo) {
      add(
        'warn',
        'promo.cta',
        `誘導の言い回し「${promo[0]}」— 告知は毎回しない。誘導するならツリーの最後の投稿に置き、しないなら落とす`,
      );
    }
  }

  // 🔒 一応公式アカウントなので、読者への問いかけだけは敬語にする。
  //    本文はラフでよい（reference/voice.md「読み手への問いかけ・呼びかけは敬語」）
  //
  // ⚠️ **フックの独り言まで敬語にしない。**「これ普通に売っていいの？」のような
  //    1行目の自問は、敬語にした瞬間に指が止まらなくなる（reference/formats.md 型H）。
  //    読者への問いと見なすのは「最終行の問い」か「読者を指す語を含む問い」だけ。
  const lines = body.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  for (const [i, asking] of lines.entries()) {
    if (!/[?？]\s*$/.test(asking)) continue;
    const toReader = i === lines.length - 1 || /みんな|みなさん|皆さん|あなた|どっち派|どちら派/.test(asking);
    if (!toReader) continue;
    if (/(ます|ません|ました|です|でした|でしょう|ましょう)(か)?[?？]\s*$/.test(asking)) continue;
    add(
      'warn',
      'voice.casualQuestion',
      `問いかけ「${asking}」が敬語になっていない。読者への問いは「みなさんは〜していますか？」の形にする`,
    );
  }

  const hashtags = body.match(HASHTAG_PATTERN) ?? [];
  if (hashtags.length > 2) {
    add('error', 'hashtag.count', `ハッシュタグ ${hashtags.length} 個。2個までに減らす（スパム判定）`);
  }

  if (MONEY_PATTERN.test(body) && !BASIS_PATTERN.test(body)) {
    add('warn', 'number.basis', '金額に基準が付いていない。「¥9.9」ではなく「¥9.9 / タンパク質1g」と書く');
  }

  const bare = body.match(BARE_DOMAIN_PATTERN);
  if (bare) {
    add('warn', 'url.bare', `「${bare[1]}」は X がリンクにして 23 文字として数える。意図した URL か確かめる`);
  }

  const layout = timelineLayout(source);
  if ([...layout.lines[0]].length > LINE_CHARS) {
    add(
      'warn',
      'layout.firstLine',
      `1行目が ${[...layout.lines[0]].length} 文字。スマホでは ${LINE_CHARS} 文字前後で折り返すので、フックが2行に割れる`,
    );
  }
  if (layout.folded) {
    add(
      'warn',
      'layout.fold',
      `${layout.lineCount} 行。${FOLD_LINES + 1}行目以降は「さらに表示」の向こう側になる（隠れるのは「${layout.hidden[0]}」から）。意図した位置か確かめる`,
    );
  }

  const position = options.position ?? null;
  if (position === 1 && urls.length > 0) {
    add('error', 'url.firstPost', '1投稿目に URL を置かない。URL はツリーの2投稿目（自分のリプ欄）に置く');
  }

  return issues;
}

/** 下書きを `---` の行で投稿ごとに割る */
export function splitDraft(text) {
  return String(text ?? '')
    .split(/^\s*-{3,}\s*$/m)
    .map((part) => part.replace(/^\n+|\n+$/g, ''))
    .filter((part) => part.trim() !== '');
}

/**
 * ツリー全体の構造チェック。
 *
 * @param {string[]} posts
 * @returns {Array<{severity: 'error'|'warn', code: string, message: string, post: number|null}>}
 */
export function lintThread(posts) {
  const list = Array.isArray(posts) ? posts : [];
  const issues = [];

  if (list.length === 0) {
    return [{ severity: 'error', code: 'thread.empty', message: '投稿が1件もない', post: null }];
  }
  if (list.length > 3) {
    issues.push({
      severity: 'warn',
      code: 'thread.length',
      message: `${list.length} 投稿。ツリーは3段までに収める（1気になる → 2なるほど → 3だから pergram か）`,
      post: null,
    });
  }

  // 🔒 ツリーは「文字数超過による分割」ではない。1投稿目は引きとして設計する。
  //    以前は「2投稿目に URL が無ければ error」にしていたが、それは誘導のための
  //    ツリーしか想定していなかった。クリフハンガー型の2投稿目は答えであって URL ではない。
  if (list.length > 1) {
    const last = list[list.length - 1];
    if (last.trim() === '') {
      issues.push({ severity: 'error', code: 'thread.emptyTail', message: '最後の投稿が空', post: list.length });
    }
  }

  for (const [i, post] of list.entries()) {
    for (const issue of lintPost(post, {
      position: list.length > 1 ? i + 1 : null,
      isTail: list.length > 1 && i === list.length - 1,
    })) {
      issues.push({ ...issue, post: i + 1 });
    }
  }

  return issues;
}

/** error が1件でもあるか */
export const hasError = (issues) => issues.some((i) => i.severity === 'error');

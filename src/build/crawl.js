/**
 * クローラ向けの配信ファイル。robots.txt / sitemap.xml / llms.txt の3つ。
 *
 * 🔒 公開範囲の唯一の出所は crawlPolicy()。3ファイルすべてをここから導く。
 *    別々に書くと「robots.txt で塞いだ URL をサイトマップに載せる」という
 *    自己矛盾が静かに起きる。検索エンジンは矛盾を報告してくれないので、
 *    気づくのは順位が落ちた後になる。tests/crawl.test.js が固定している。
 *
 * 🔒 llms.txt に成分の働きの説明を書かない（N-02）。独自スコアも書かない（N-03）。
 *    ここに書いてよいのは「どう計算しているか」であって「何に良いか」ではない。
 */

import { SITE_ORIGIN, absoluteUrl } from '../lib/site.js';

/**
 * 公開範囲。
 *
 * ⚠️ β版のあいだ製品一覧を塞いでいるのは、他ストアの価格欄が
 *    `¥X` / `¥XXXX` のプレースホルダだから（src/templates/products/item.js）。
 *    実データが入って PLACEHOLDER_MERCHANTS を消したら、blocked から外して
 *    open に移す。それだけでサイトマップにも robots.txt にも同時に反映される。
 *
 * @param {{ lpPath: string, productsPath: string }} paths
 */
export function crawlPolicy({ lpPath, productsPath }) {
  return {
    /** クロールもインデックスもさせるページ */
    open: [{ path: lpPath, changefreq: 'daily', priority: '1.0' }],
    /** クロールさせないパスの接頭辞 */
    blocked: [
      productsPath,
      '/api/', // 待機リストの受け口。クロールする意味がない
    ],
  };
}

/**
 * robots.txt。
 *
 * 🔒 `Allow: /` を書かない。robots.txt の既定は「Disallow に書かれていなければ許可」で、
 *    Allow と Disallow を併記すると「最長一致が勝つ」実装と「先に書いた方が勝つ」実装で
 *    結果が割れる。Disallow だけ並べれば解釈は1つに定まる。
 *
 * 🔒 AI クローラを個別に列挙しない。`User-agent: *` は GPTBot / ClaudeBot /
 *    PerplexityBot / Google-Extended / CCBot などすべてに適用される。
 *    エージェントごとに群を作ると公開範囲が二重管理になり、片方だけ更新されて必ずずれる。
 *    許可が意図的であることはコメントで残す。
 */
export function robotsTxt(policy) {
  const blocked = policy.blocked.map((p) => `Disallow: ${p}`).join('\n');

  return `# pergram — このファイルは自動生成です。src/build/crawl.js を編集してください。
#
# AI クローラ（GPTBot / ClaudeBot / PerplexityBot / OAI-SearchBot /
# Google-Extended / CCBot / Applebot-Extended 等）は意図的にすべて許可しています。
# 下の User-agent: * が全クローラに適用されるため、個別の記述は不要です。
# 🔒 ここを塞ぐと LLM の回答内に pergram が出てこなくなります。

User-agent: *
${blocked}

Sitemap: ${absoluteUrl('/sitemap.xml')}
`;
}

/**
 * sitemap.xml。
 *
 * 🔒 blocked のパスは絶対に載せない。robots.txt で塞いだ URL をサイトマップで
 *    申告するのは自己矛盾で、Search Console が警告を出す。
 *
 * @param {ReturnType<typeof crawlPolicy>} policy
 * @param {{ lastmod: string }} opts lastmod は YYYY-MM-DD
 */
export function sitemapXml(policy, { lastmod }) {
  const entries = policy.open
    .filter((e) => !isBlocked(e.path, policy.blocked))
    .map(
      (e) => `  <url>
    <loc>${absoluteUrl(e.path)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

/** パスが塞がれた接頭辞のどれかに該当するか */
export function isBlocked(pathname, blocked) {
  return blocked.some((prefix) => pathname.startsWith(prefix));
}

/**
 * llms.txt（https://llmstxt.org の書式）。
 *
 * LLM がサイトを読むときの入り口。HTML を舐めるより先にここを読ませて、
 * **単価の定義と順位の決め方**を正確に持ち帰らせるのが目的。
 * pergram が引用される価値があるとすれば数字そのものではなく「どう揃えたか」なので、
 * ここに書くのは方法論だけでよい。
 *
 * 🔒 禁止語（効く / 効果 / 改善 / 高品質 / おすすめ / 人気No.1 / 安心 /
 *    話題の / 選ばれる / 実感）を使わない。tests/crawl.test.js が検査する。
 * 🔒 成分が体にどう働くかを書かない（N-02）。書いてよいのは計算方法だけ。
 *
 * @param {ReturnType<typeof crawlPolicy>} policy
 * @param {{ brandName: string, tagline: string, updatedAt: string, productCount: number }} opts
 */
export function llmsTxt(policy, { brandName, tagline, updatedAt, productCount }) {
  const lp = policy.open[0];

  return `# ${brandName}

> ${tagline} — サプリメントを「有効成分1単位あたりの価格」に統一して並べる日本語のサイトです。袋やボトルの値段ではなく、中身の成分1gあたりでいくら払っているかを比べます。

同じ1kgのプロテインでも、タンパク質の含有率が違えば1gあたりの単価は変わります。${brandName} は製品価格と成分の含有量から単価を計算し、その昇順だけで製品を並べます。

## 単価の定義

- 並び順を決めるのは常に**有効成分1単位あたりの価格**です（例: タンパク質1gあたり ¥3.2）。
- 1食あたり・1粒あたりの価格は補助的に添えるだけで、並び順には使いません。1食の量はメーカーが任意に決めた単位で、製品をまたいで比べられないためです。
- ミネラルのように塩の形で配合される成分は、ラベル記載量ではなく**元素量**に換算してから比べます（例: 酸化マグネシウム500mg に含まれるマグネシウムは約300mg、グリシン酸マグネシウム500mg では約50mg）。
- 保存しているのは「1食あたりの量」「1容器あたりの食数」「元素量」の3つだけです。含有率や100gあたりの含有量、1食あたりの価格は、そのつど計算した導出値であって保存値ではありません。

## 順位の決め方

- 順位は単価の昇順だけで決まります。**独自の総合スコアや品質スコア、加重平均のランキングは作りません。**
- アフィリエイトリンクを使っていますが、報酬額は順位に影響しません。報酬率はデータとして保存していないため、報酬の高い順に並べることが構造上できません。
- レビューの星評価や件数は扱いません。

## 扱わないこと

- 成分が体にどう働くかについての、独自に書き起こした文章はありません。成分の働きに触れる場合は、栄養機能食品の規格基準の定型文、消費者庁の機能性表示食品の届出表示、厚生労働省「日本人の食事摂取基準」の数値のいずれかをそのまま引くだけです。
- 症状・不調・体調の入力は受け付けません。個別の助言も行いません。
- 育毛・薄毛・妊活・美容医療の文脈で成分を扱いません。

## ページ

- [${brandName}](${absoluteUrl(lp.path)}): 単価比較の考え方と、プロテインの単価ランキングの一部。

## 状態

プロテイン1成分のβ版です。掲載 ${productCount} 製品、価格の最終取得日は ${updatedAt} です。製品一覧ページは他ストアの価格欄が未取得のためクロール対象から外しています。

配信元: ${SITE_ORIGIN}
`;
}

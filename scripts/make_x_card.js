#!/usr/bin/env node
/**
 * X のアイキャッチ（16:9 / 1600×900）を SVG で作る。
 * docs/Marketing/X_eyecatch_image_method.md の4構図をコードにしたもの。
 *
 *   node scripts/make_x_card.js --type rank  --headline "袋の値段では順位が出ない"
 *   node scripts/make_x_card.js --type focus --headline "3kgで安い、は本当か" --rank 1
 *   node scripts/make_x_card.js --type split --headline "選び方を変えるだけ" \
 *        --left "袋の価格で選ぶ" --right "タンパク質1gあたりで選ぶ"
 *   node scripts/make_x_card.js --type steps --headline "失敗しない見方" \
 *        --steps "袋の値段を見ない|含有率を見る|1gあたりで比べる"
 *
 * 🔒 生成モデルは使わない。実際の UI と同じトークン（src/styles/tokens.css）で
 *    描くので、画像と画面の見た目がずれない。色をこのファイルに直書きしない。
 *
 * 🔒 数字を作らない。rank / focus は data/ の実データからしか描かない。
 *    実データが無ければ画像を作らずに落とす（design.md §7 禁止⑧）。
 *
 * 🔒 文言は src/lib/x_post.js の禁止語チェックを通す。画像の中の文字にも
 *    景表法・薬機法は同じようにかかる。
 *
 * X は SVG を受け付けない。--png を付けると rsvg-convert / ImageMagick /
 * Chrome のうち見つかったもので PNG に変換する。どれも無ければ、一緒に書き出す
 * HTML をブラウザで開いて 1600×900 で撮る。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { cropPng, decodePng, encodePng, pixelHex, rowsWithColor } from './png.js';
import { escapeAttribute, loadTranslator } from '../src/lib/i18n.js';
import { formatCurrency, formatPercent } from '../src/lib/format.js';
import { lintPost } from '../src/lib/x_post.js';
import { loadProteinRows, shortName } from './x_dataset.js';

const WIDTH = 1600;
const HEIGHT = 900;
const MARGIN = 96;
const TOKENS = path.join('src', 'styles', 'tokens.css');

/**
 * 色は tokens.css から読む。🔒 ここに16進数を書かない。
 * 片方だけ変えると、画像だけ別サービスの色になる。
 */
export async function readTokens(file = TOKENS) {
  const css = await readFile(file, 'utf8');
  const map = new Map();
  for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(name, value.trim());
  }
  const need = (name) => {
    const value = map.get(name);
    if (value === undefined) throw new Error(`tokens.css に ${name} がありません`);
    return value;
  };
  return {
    ink: need('--ink'),
    paper: need('--paper'),
    surface: need('--surface'),
    signal: need('--signal'),
    band: need('--signal-band'),
    edge: need('--signal-edge'),
    muted: need('--muted-weak'),
    line: need('--line'),
    panel: need('--fill-panel'),
    radius: Number.parseInt(need('--radius'), 10),
  };
}

const FONT = "'Noto Sans JP','Hiragino Sans',system-ui,sans-serif";
const NUM = 'font-variant-numeric:tabular-nums';

/** 日本語の折り返し。句読点の直後を優先して切る */
export function wrapJa(text, maxChars) {
  const chars = [...String(text ?? '')];
  const lines = [];
  let line = '';
  for (const ch of chars) {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    line += ch;
    const breakable = /[、。！？]/.test(ch);
    if ([...line].length >= maxChars || (breakable && [...line].length >= maxChars - 6)) {
      lines.push(line);
      line = '';
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

const text = (value, { x, y, size, weight = 400, fill, anchor = 'start', extra = '' }) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" ${extra}>${escapeAttribute(value)}</text>`;

const block = (lines, { x, y, size, lineHeight, ...rest }) =>
  lines.map((line, i) => text(line, { x, y: y + i * lineHeight, size, ...rest })).join('\n  ');

/**
 * ワードマークとルーラーティック。OGP と同じモチーフ。
 * 🔒 タグラインは locales から渡す。画像の中にだけ別の文言が残る事故を防ぐ。
 */
function chrome(tk, { note, tagline }) {
  const ticks = Array.from({ length: 9 }, (_, i) => {
    const x = MARGIN + i * 14;
    return `<rect x="${x}" y="${MARGIN - 30}" width="2" height="${i % 2 === 0 ? 16 : 8}" fill="${tk.ink}"/>`;
  }).join('');

  return `
  <rect x="${MARGIN}" y="${MARGIN - 46}" width="${WIDTH - MARGIN * 2}" height="8" fill="${tk.ink}"/>
  ${ticks}
  ${text('pergram', { x: MARGIN, y: HEIGHT - MARGIN + 10, size: 40, weight: 800, fill: tk.ink, extra: 'letter-spacing="-1.2"' })}
  ${text(tagline, { x: MARGIN + 240, y: HEIGHT - MARGIN + 8, size: 26, fill: tk.muted })}
  ${note ? text(note, { x: WIDTH - MARGIN, y: HEIGHT - MARGIN + 8, size: 24, fill: tk.muted, anchor: 'end', extra: `style="${NUM}"` }) : ''}`;
}

/** 単価。¥1.9 と /g を別の大きさで置く */
function unitCost(value, { x, y, size, fill, anchor = 'end' }) {
  const label = formatCurrency(value, { locale: 'ja', currency: 'JPY' });
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="800" fill="${fill}" text-anchor="${anchor}" style="${NUM}">${escapeAttribute(label)}<tspan font-size="${Math.round(size * 0.45)}" font-weight="700">/g</tspan></text>`;
}

/* ── 構図 ─────────────────────────────────────────── */

/** ランキング型。実データの上位3行をそのまま出す */
function rankCard(tk, { headline, sub, rows, names, note, tagline }) {
  const head = wrapJa(headline, 22).slice(0, 2);
  const top = rows.slice(0, 3);
  const rowH = 118;
  const top0 = head.length > 1 ? 372 : 330;

  const lines = top.map((row, i) => {
    const y = top0 + i * (rowH + 14);
    const first = i === 0;
    const badgeX = MARGIN + 52;
    const ratio = row.contentRatioPercent === null ? '' : `含有率 ${formatPercent(row.contentRatioPercent, { locale: 'ja' })}`;
    return `
  <rect x="${MARGIN}" y="${y}" width="${WIDTH - MARGIN * 2}" height="${rowH}" rx="${tk.radius}"
        fill="${first ? tk.band : tk.surface}" stroke="${first ? tk.edge : tk.line}" stroke-width="${first ? 2 : 1}"/>
  <circle cx="${badgeX}" cy="${y + rowH / 2}" r="26" fill="${first ? tk.signal : tk.panel}"/>
  ${text(String(i + 1), { x: badgeX, y: y + rowH / 2 + 11, size: 30, weight: 800, fill: first ? tk.surface : tk.ink, anchor: 'middle', extra: `style="${NUM}"` })}
  ${text(shortName(names.get(row.product.id) ?? row.product.id, 26), { x: badgeX + 52, y: y + rowH / 2 - 4, size: 30, weight: 700, fill: tk.ink })}
  ${ratio ? text(ratio, { x: badgeX + 52, y: y + rowH / 2 + 32, size: 24, fill: tk.muted, extra: `style="${NUM}"` }) : ''}
  ${unitCost(row.costPerNutrientUnit, { x: WIDTH - MARGIN - 32, y: y + rowH / 2 + 18, size: 58, fill: first ? tk.signal : tk.ink })}`;
  });

  return `
  ${block(head, { x: MARGIN, y: 216, size: 62, weight: 800, fill: tk.ink, lineHeight: 82 })}
  ${text(sub, { x: MARGIN, y: 216 + head.length * 82 - 10, size: 28, fill: tk.muted })}
  ${lines.join('\n')}
  ${chrome(tk, { note, tagline })}`;
}

/** 1商品フォーカス型。左に見出し、右に製品カード1枚 */
function focusCard(tk, { headline, row, names, note, tagline }) {
  const head = wrapJa(headline, 11).slice(0, 4);
  const cardX = 880;
  const cardY = 210;
  const cardW = WIDTH - MARGIN - cardX;
  const cardH = 470;
  const ratio = row.contentRatioPercent === null ? null : formatPercent(row.contentRatioPercent, { locale: 'ja' });
  const price = formatCurrency(row.price, { locale: 'ja', currency: 'JPY' });
  const weight = row.netWeightG === null ? null : `${row.netWeightG >= 1000 ? row.netWeightG / 1000 : row.netWeightG}${row.netWeightG >= 1000 ? 'kg' : 'g'}`;
  const meta = [ratio ? `含有率 ${ratio}` : null, weight, `袋 ${price}`].filter(Boolean).join('　/　');

  return `
  ${block(head, { x: MARGIN, y: 300, size: 68, weight: 800, fill: tk.ink, lineHeight: 92 })}
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="${tk.surface}" stroke="${tk.line}"/>
  ${block(wrapJa(shortName(names.get(row.product.id) ?? row.product.id, 40), 20).slice(0, 2), { x: cardX + 40, y: cardY + 64, size: 28, weight: 700, fill: tk.ink, lineHeight: 40 })}
  <rect x="${cardX + 40}" y="${cardY + 140}" width="${cardW - 80}" height="180" rx="${tk.radius}" fill="${tk.band}" stroke="${tk.edge}" stroke-width="2"/>
  ${text('タンパク質1gあたり', { x: cardX + 72, y: cardY + 190, size: 26, weight: 700, fill: tk.muted })}
  ${unitCost(row.costPerNutrientUnit, { x: cardX + cardW - 72, y: cardY + 290, size: 92, fill: tk.signal })}
  ${text(meta, { x: cardX + 40, y: cardY + 380, size: 26, fill: tk.muted, extra: `style="${NUM}"` })}
  ${text('順位はこの単価だけで決まります', { x: cardX + 40, y: cardY + 424, size: 22, fill: tk.muted })}
  ${chrome(tk, { note, tagline })}`;
}

/** 二分割対比型。数字を含まないので実データが無くても描ける */
function splitCard(tk, { headline, left, right, note, tagline }) {
  const leftLines = wrapJa(left, 14).slice(0, 4);
  const rightLines = wrapJa(right, 14).slice(0, 4);
  const panelY = 300;
  // 余白は行数で決める。空の下半分を残さない
  const panelH = 152 + Math.max(leftLines.length, rightLines.length) * 58 + 48;
  const panelW = (WIDTH - MARGIN * 2 - 48) / 2;
  const rightX = MARGIN + panelW + 48;

  return `
  ${block(wrapJa(headline, 26).slice(0, 1), { x: MARGIN, y: 232, size: 60, weight: 800, fill: tk.ink, lineHeight: 80 })}
  <rect x="${MARGIN}" y="${panelY}" width="${panelW}" height="${panelH}" rx="16" fill="${tk.panel}" stroke="${tk.line}"/>
  ${text('✕　これまで', { x: MARGIN + 40, y: panelY + 72, size: 28, weight: 700, fill: tk.muted })}
  ${block(leftLines, { x: MARGIN + 40, y: panelY + 152, size: 40, weight: 700, fill: tk.ink, lineHeight: 58 })}
  <rect x="${rightX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="16" fill="${tk.surface}" stroke="${tk.signal}" stroke-width="3"/>
  ${text('○　pergram', { x: rightX + 40, y: panelY + 72, size: 28, weight: 700, fill: tk.signal })}
  ${block(rightLines, { x: rightX + 40, y: panelY + 152, size: 40, weight: 700, fill: tk.ink, lineHeight: 58 })}
  ${chrome(tk, { note, tagline })}`;
}

/** 3ステップ型。図解。ここも数字を含まない */
function stepsCard(tk, { headline, steps, note, tagline }) {
  const wrapped = steps.slice(0, 3).map((step) => wrapJa(step, 10).slice(0, 4));
  const cardY = 300;
  const cardH = 160 + Math.max(...wrapped.map((lines) => lines.length)) * 52 + 48;
  const gap = 40;
  const cardW = (WIDTH - MARGIN * 2 - gap * 2) / 3;

  const cards = wrapped.map((lines, i) => {
    const x = MARGIN + i * (cardW + gap);
    return `
  <rect x="${x}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="${tk.surface}" stroke="${tk.line}"/>
  <circle cx="${x + 44}" cy="${cardY + 60}" r="24" fill="${i === 2 ? tk.signal : tk.panel}"/>
  ${text(String(i + 1), { x: x + 44, y: cardY + 70, size: 28, weight: 800, fill: i === 2 ? tk.surface : tk.ink, anchor: 'middle', extra: `style="${NUM}"` })}
  ${block(lines, { x: x + 32, y: cardY + 160, size: 36, weight: 700, fill: tk.ink, lineHeight: 52 })}`;
  });

  return `
  ${block(wrapJa(headline, 26).slice(0, 1), { x: MARGIN, y: 232, size: 60, weight: 800, fill: tk.ink, lineHeight: 80 })}
  ${cards.join('\n')}
  ${chrome(tk, { note, tagline })}`;
}

/**
 * 1枚分の SVG を組み立てる。
 * @param {{type: string, tokens: object}} spec
 */
export function renderCard(spec) {
  const tk = spec.tokens;
  if (!spec.tagline) throw new Error('tagline を渡してください（locales の brand.tagline）');
  const body = {
    rank: rankCard,
    focus: focusCard,
    split: splitCard,
    steps: stepsCard,
  }[spec.type];
  if (body === undefined) throw new Error(`未対応の構図: ${spec.type}`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${tk.paper}"/>
  ${body(tk, spec)}
</svg>
`;
}

/**
 * 手で撮るとき用の器。ブラウザで開いて 1600×900 で撮れば PNG になる。
 * 書体はサイトと同じ Noto Sans JP を読むが、取れなければ端末の既定に落ちる
 * （字形が変わるだけで、寸法と配置は変わらない）。
 */
const htmlWrapper = (svg) =>
  `<!doctype html><meta charset="utf-8"><title>pergram X card</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;800&display=swap" rel="stylesheet">
<style>html,body{margin:0;padding:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}svg{display:block}</style>
${svg}`;

/**
 * 見つかった変換器で PNG にする。無ければ null を返す（黙って諦めない）。
 * @param {string} paper 紙の色。書けた画像の下端がこの色でなければ切れていると判断する
 */
function toPng(svgPath, htmlPath, pngPath, paper) {
  const converters = [
    ['rsvg-convert', ['-w', String(WIDTH), '-h', String(HEIGHT), svgPath, '-o', pngPath]],
    ['magick', [svgPath, '-resize', `${WIDTH}x${HEIGHT}`, pngPath]],
    ['convert', [svgPath, '-resize', `${WIDTH}x${HEIGHT}`, pngPath]],
  ];
  for (const [bin, args] of converters) {
    const run = spawnSync(bin, args, { stdio: 'ignore' });
    if (!run.error && run.status === 0 && verify(pngPath, paper)) return bin;
  }

  const chrome = findChrome();
  if (chrome === null) return null;

  // ⚠️ --window-size は「ウィンドウ」の寸法で、実際に描かれるのはツールバー分を
  //    引いたビューポートだけ（この環境では 85px 前後）。足りない分は白で埋められ、
  //    **寸法は 1600×900 のまま下だけが白い**画像になる。JPEG の圧縮ノイズと違って
  //    パッと見では気づけないので、ビューポートを測って窓を広げ、撮った後に切る。
  const inset = Math.max(0, HEIGHT - measureViewport(chrome));
  const url = new URL(htmlPath, `file://${process.cwd()}/`).href;
  if (!shoot(chrome, url, pngPath, HEIGHT + inset)) return null;

  const shot = decodePng(pngPath);
  const cropped = cropPng(shot, WIDTH, HEIGHT);
  if (cropped === null) return null;
  encodePng(pngPath, cropped);

  // 🔒 下端が紙の色でなければ切れている。切れた画像を「できました」と言わない。
  return verify(pngPath, paper) ? chrome : null;
}

function verify(pngPath, paper) {
  const image = decodePng(pngPath);
  if (image === null) return true; // 読めない形式なら判定しない
  return (
    image.width === WIDTH &&
    image.height === HEIGHT &&
    pixelHex(image, 4, HEIGHT - 4) === paper.toLowerCase()
  );
}

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  return (
    ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'].find(
      (bin) => spawnSync('which', [bin], { stdio: 'ignore' }).status === 0,
    ) ?? null
  );
}

function shoot(chrome, url, pngPath, windowHeight) {
  // root で動く環境（コンテナ・CI）ではサンドボックスを外さないと起動しない。
  // 開くのは自分で書き出したローカルファイルだけなので、ここに限っては許す。
  for (const extra of [[], ['--no-sandbox']]) {
    const run = spawnSync(chrome, [
      ...extra,
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${WIDTH},${windowHeight}`,
      `--screenshot=${pngPath}`,
      url,
    ], { stdio: 'ignore' });
    if (!run.error && run.status === 0) return true;
  }
  return false;
}

/**
 * 実際に描画される高さを1枚撮って数える。
 *
 * ⚠️ body の背景色はビューポート全体に伝播する（CSS の背景の伝播）ので、
 *    body を塗ると必ず全面が塗られて測れない。html に別の色を置いて伝播を止め、
 *    100vh の要素の方を数える。
 */
function measureViewport(chrome) {
  const mark = '#123456';
  const probeHtml = path.join(tmpdir(), 'pergram_x_probe.html');
  const probePng = path.join(tmpdir(), 'pergram_x_probe.png');
  writeFileSync(
    probeHtml,
    `<!doctype html><meta charset="utf-8"><style>html{background:#abcdef}body{margin:0}div{height:100vh;background:${mark}}</style><div></div>`,
  );
  if (!shoot(chrome, `file://${probeHtml}`, probePng, HEIGHT)) return HEIGHT;
  const image = decodePng(probePng);
  if (image === null) return HEIGHT;
  const painted = rowsWithColor(image, mark);
  return painted === 0 ? HEIGHT : painted;
}

/* ── CLI ─────────────────────────────────────────── */

async function main() {
  const { values } = parseArgs({
    options: {
      type: { type: 'string', default: 'rank' },
      headline: { type: 'string' },
      left: { type: 'string' },
      right: { type: 'string' },
      steps: { type: 'string' },
      sub: { type: 'string' },
      rank: { type: 'string', default: '1' },
      out: { type: 'string' },
      png: { type: 'boolean', default: false },
    },
  });

  if (!values.headline) {
    console.error('--headline は必須です。画像の中の見出しになります。');
    process.exit(2);
  }

  /** 🔒 画像の中の文言も禁止語チェックを通す */
  const copy = [values.headline, values.left, values.right, values.steps].filter(Boolean).join('\n');
  const issues = lintPost(copy).filter((i) => i.severity === 'error' && !i.code.startsWith('length.'));
  if (issues.length > 0) {
    for (const issue of issues) console.error(`[error] ${issue.code} — ${issue.message}`);
    console.error('画像は作りませんでした。文言を直してください。');
    process.exit(1);
  }

  const tokens = await readTokens();
  const t = await loadTranslator('ja');
  const spec = {
    tagline: t('brand.tagline'),
    type: values.type,
    tokens,
    headline: values.headline,
  };

  if (values.type === 'rank' || values.type === 'focus') {
    const { rows, names, snapshots, nutrient, nutrientName } = await loadProteinRows();
    const need = values.type === 'rank' ? 3 : 1;
    if (rows.length < need) {
      console.error(`実データが ${rows.length} 件しかありません。${values.type} の画像は作りません。`);
      process.exit(1);
    }
    const fetchedAt = snapshots.map((s) => s.fetched_at).filter(Boolean).sort().at(-1) ?? null;
    spec.rows = rows;
    spec.names = names;
    spec.row = rows[Math.max(1, Number.parseInt(values.rank, 10) || 1) - 1] ?? rows[0];
    spec.note = fetchedAt ? `価格取得 ${fetchedAt}　/　掲載 ${rows.length} 製品` : `掲載 ${rows.length} 製品`;
    // 🔒 何の順で並んでいるかを画像の中に必ず書く。順位だけを見せて基準を伏せない。
    //    文言は locales から取る（画像にだけ別の言い方が残らないように）
    spec.sub =
      values.sub ?? t('ranking.subtitle', { nutrient: nutrientName, unit: nutrient.canonical_unit });
  } else if (values.type === 'split') {
    if (!values.left || !values.right) {
      console.error('--left と --right を渡してください。');
      process.exit(2);
    }
    spec.left = values.left;
    spec.right = values.right;
  } else if (values.type === 'steps') {
    const steps = (values.steps ?? '').split('|').map((s) => s.trim()).filter(Boolean);
    if (steps.length < 3) {
      console.error('--steps は "1つ目|2つ目|3つ目" の形で3つ渡してください。');
      process.exit(2);
    }
    spec.steps = steps;
  }

  const svg = renderCard(spec);
  const out = values.out ?? path.join('dist', 'assets', `x_card_${values.type}.svg`);
  const html = out.replace(/\.svg$/, '.html');
  const png = out.replace(/\.svg$/, '.png');

  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, svg, 'utf8');
  await writeFile(html, htmlWrapper(svg), 'utf8');
  console.log(`${out} と ${html} を書き出しました（${WIDTH}×${HEIGHT}）。`);

  if (values.png) {
    const used = toPng(out, html, png, tokens.paper);
    if (used) console.log(`${png} を書き出しました（${used}）。`);
    else {
      console.error('PNG の変換器が見つかりません（rsvg-convert / ImageMagick / Chrome）。');
      console.error(`${html} をブラウザで開き、1600×900 で撮ってください。X は SVG を受け付けません。`);
      process.exit(1);
    }
  }
}

// テストから renderCard / wrapJa を読むため、直接実行されたときだけ走らせる。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

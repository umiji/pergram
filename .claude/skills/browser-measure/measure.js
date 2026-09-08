#!/usr/bin/env node
/**
 * 幅ごとのレイアウトを実測して JSON で返す。**引数だけを変えて使う。**
 *
 *   node .claude/skills/browser-measure/measure.js \
 *     --root .preview --path /ja/protein/ \
 *     --widths 375,768,1440 \
 *     --select .request-band --select .request-band__lede
 *
 * 手順と注意書きは同じディレクトリの SKILL.md にある。
 * **動かなくなったら、タスクの指示文へ手順を書き写さずに、このファイルを直すこと。**
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { launchChrome } from './lib/chrome.js';
import { CdpClient, evaluate, openPage } from './lib/cdp.js';
import { serve } from './lib/serve.js';
import { probe } from './lib/probe.js';

/** 幅だけ指定されたときの縦。実測に縦はほぼ効かないが、折り返しの判断に高さは要る */
const DEFAULT_HEIGHT = 900;
/** この幅未満は「モバイル」として扱う（meta viewport を効かせる） */
const DEFAULT_MOBILE_BELOW = 768;

const USAGE = `使い方:
  node .claude/skills/browser-measure/measure.js --select <CSSセレクタ> [オプション]

測る対象（どちらか）
  --root <dir>          静的ファイルのルート。既定 .preview。内部で 127.0.0.1 に配信する
  --path </ja/protein/> --root 配下のパス。既定 /ja/protein/
  --url <URL>           既に立っているサーバを測る（--root を使わない）

測る内容
  --select <selector>   何度でも指定できる。カンマ区切りも可
  --widths 375,768,1440 CSS ピクセルの幅。既定 375,768,1440
  --height <px>         既定 ${DEFAULT_HEIGHT}
  --mobile auto|always|never  meta viewport を効かせるか。既定 auto（幅 < ${DEFAULT_MOBILE_BELOW} で on）
  --lines               行ごとの実文字列・行数・最終行の文字数も返す（孤立行の検査用）
  --text                要素の文字列も返す
  --styles a,b,c        指定した CSS プロパティの計算値も返す
  --max-matches <n>     同じセレクタで返す最大件数。既定 10

状態を作る
  --click <selector>    測る前に押す（押下後の姿を測る）
  --force-hover <sel>   :hover を強制する（CSS.forcePseudoState）
  --init-script <file>  ページの読み込み前に走らせる JS のファイル
                        （.preview は GA4 が構成されず dataLayer が空。gtag のスタブはここで差し込む）

出力
  --font-diff           document.fonts.ready を待つ前と後の両方を測って差を出す
  --shot-dir <dir>      幅ごとに PNG を書き出す
  --out <file>          JSON をファイルへ書く（既定は標準出力）
  --compact             1行の JSON にする
`;

function parseArgs(argv) {
  const opts = {
    root: '.preview',
    urlPath: '/ja/protein/',
    url: null,
    selectors: [],
    widths: [375, 768, 1440],
    height: DEFAULT_HEIGHT,
    mobile: 'auto',
    lines: false,
    text: false,
    styles: [],
    maxMatches: 10,
    click: null,
    forceHover: null,
    initScript: null,
    fontDiff: false,
    shotDir: null,
    out: null,
    compact: false,
  };

  const next = (i) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${argv[i]} に値がありません`);
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--help': case '-h': console.log(USAGE); process.exit(0); break;
      case '--root': opts.root = next(i); i++; break;
      case '--path': opts.urlPath = next(i); i++; break;
      case '--url': opts.url = next(i); i++; break;
      case '--select': case '-s': opts.selectors.push(...next(i).split(',').map((x) => x.trim()).filter(Boolean)); i++; break;
      case '--widths': case '-w':
        opts.widths = next(i).split(',').map((x) => Number.parseInt(x.trim(), 10));
        i++;
        if (opts.widths.some((w) => !Number.isInteger(w) || w <= 0)) throw new Error('--widths は正の整数のカンマ区切りで指定してください');
        break;
      case '--height': opts.height = Number.parseInt(next(i), 10); i++; break;
      case '--mobile': opts.mobile = next(i); i++;
        if (!['auto', 'always', 'never'].includes(opts.mobile)) throw new Error('--mobile は auto / always / never のいずれかです');
        break;
      case '--lines': opts.lines = true; break;
      case '--text': opts.text = true; break;
      case '--styles': opts.styles = next(i).split(',').map((x) => x.trim()).filter(Boolean); i++; break;
      case '--max-matches': opts.maxMatches = Number.parseInt(next(i), 10); i++; break;
      case '--click': opts.click = next(i); i++; break;
      case '--force-hover': opts.forceHover = next(i); i++; break;
      case '--init-script': opts.initScript = next(i); i++; break;
      case '--font-diff': opts.fontDiff = true; break;
      case '--shot-dir': opts.shotDir = next(i); i++; break;
      case '--out': opts.out = next(i); i++; break;
      case '--compact': opts.compact = true; break;
      default: throw new Error(`知らないオプションです: ${a}\n\n${USAGE}`);
    }
  }

  if (opts.selectors.length === 0) throw new Error(`--select が1つも指定されていません。\n\n${USAGE}`);
  if (!Number.isInteger(opts.height) || opts.height <= 0) throw new Error('--height は正の整数です');

  // ⚠️ Git Bash（MSYS2）は `/ja/protein/` のような引数を **Windows のパスへ勝手に書き換える**。
  //    `C:/Program Files/Git/ja/protein/` になり、繋げた URL が壊れる。
  //    黙って別の場所を測るより、ここで止めて理由を言う。
  if (!opts.url && (/^[A-Za-z]:[\\/]/.test(opts.urlPath) || opts.urlPath.includes('\\'))) {
    throw new Error(
      `--path にサイト内の絶対パスではない値が来ています: ${opts.urlPath}\n` +
        '  Git Bash が /ja/protein/ を Windows のパスへ書き換えたと思われます。\n' +
        '  対処: 先頭に MSYS_NO_PATHCONV=1 を付けて実行する（例 MSYS_NO_PATHCONV=1 node ... --path /ja/protein/）',
    );
  }
  if (!opts.url && !opts.urlPath.startsWith('/')) opts.urlPath = '/' + opts.urlPath;
  return opts;
}

const probeExpression = (selectors, probeOpts) =>
  `(${probe.toString()})(${JSON.stringify(selectors)}, ${JSON.stringify(probeOpts)})`;

/** レイアウトが落ち着くのを待つ。フレームを2回またぐ */
const SETTLE = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))';

async function forceHover(client, sessionId, selector) {
  const { root } = await client.send('DOM.getDocument', { depth: -1 }, sessionId);
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector }, sessionId);
  if (!nodeId) throw new Error(`--force-hover の対象が見つかりません: ${selector}`);
  await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] }, sessionId);
}

async function run(opts) {
  const server = opts.url ? null : await serve(opts.root);
  const url = opts.url ?? `${server.origin}${opts.urlPath}`;

  let chrome = null;
  try {
    chrome = await launchChrome();
    const client = await CdpClient.connect(chrome.browserWsUrl);
    const { sessionId } = await openPage(client);

    await client.send('Page.enable', {}, sessionId);
    await client.send('Runtime.enable', {}, sessionId);
    await client.send('DOM.enable', {}, sessionId);
    await client.send('CSS.enable', {}, sessionId);

    if (opts.initScript) {
      const source = await readFile(opts.initScript, 'utf8');
      await client.send('Page.addScriptToEvaluateOnNewDocument', { source }, sessionId);
    }

    const probeOpts = { lines: opts.lines, text: opts.text, styles: opts.styles, maxMatches: opts.maxMatches };
    const expression = probeExpression(opts.selectors, probeOpts);
    // font-diff の比較は「同じ測り方の前後」でなければ意味が無いので、opts をそのまま使う
    const beforeExpression = expression;

    if (opts.shotDir) await mkdir(opts.shotDir, { recursive: true });

    const measurements = [];
    for (const width of opts.widths) {
      const mobile = opts.mobile === 'always' || (opts.mobile === 'auto' && width < DEFAULT_MOBILE_BELOW);
      await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: opts.height,
        // 🔒 mobile: true でないと meta viewport が無視される。
        //    --window-size で幅を作るのが誤りなのはこれが理由（実機と違う姿を測ってしまう）
        deviceScaleFactor: mobile ? 2 : 1,
        mobile,
      }, sessionId);

      const domReady = client.once('Page.domContentEventFired', { timeoutMs: 30_000 });
      const loaded = client.once('Page.loadEventFired', { timeoutMs: 30_000 });
      await client.send('Page.navigate', { url }, sessionId);

      let beforeFontsReady = null;
      if (opts.fontDiff) {
        await domReady;
        // ⚠️ ここは **わざと** document.fonts.ready を待っていない。
        //    「待たないとどれだけ細く出るか」を実測で見せるための測定である。
        beforeFontsReady = await evaluate(client, sessionId, beforeExpression);
      } else {
        await domReady;
      }

      await loaded.catch(() => {}); // load が来ない作りのページでも測定は続ける
      // 🔒 ここが本題。書体が入れ替わる前に測ると文字幅が細く出る（T-057 で実際に誤った）
      await evaluate(client, sessionId, 'document.fonts.ready.then(() => true)');
      await evaluate(client, sessionId, SETTLE);

      if (opts.forceHover) await forceHover(client, sessionId, opts.forceHover);
      if (opts.click) {
        const clicked = await evaluate(client, sessionId, `(() => { const el = document.querySelector(${JSON.stringify(opts.click)}); if (!el) return false; el.click(); return true; })()`);
        if (!clicked) throw new Error(`--click の対象が見つかりません: ${opts.click}`);
        await evaluate(client, sessionId, SETTLE);
      }

      const after = await evaluate(client, sessionId, expression);

      const entry = { width, height: opts.height, mobile, deviceScaleFactor: mobile ? 2 : 1, ...after };

      if (beforeFontsReady) {
        entry.fontsStatusBefore = beforeFontsReady.fonts?.status ?? null;
        entry.fontsStatusAfter = after.fonts?.status ?? null;
        entry.elementsBeforeFontsReady = beforeFontsReady.elements;
        entry.fontDiff = after.elements.map((el, i) => {
          const b = beforeFontsReady.elements[i];
          if (!b || b.selector !== el.selector || b.index !== el.index) return { selector: el.selector, index: el.index, note: '前後で要素が一致しませんでした' };
          const pct = (a, c) => (c ? Math.round(((a - c) / c) * 1000) / 10 : null);
          return {
            selector: el.selector,
            index: el.index,
            inkWidthBefore: b.inkWidth,
            inkWidthAfter: el.inkWidth,
            inkWidthDeltaPct: pct(el.inkWidth, b.inkWidth),
            widthBefore: b.width,
            widthAfter: el.width,
            heightBefore: b.height,
            heightAfter: el.height,
            lineCountBefore: b.lineCount ?? null,
            lineCountAfter: el.lineCount ?? null,
            changed: b.inkWidth !== el.inkWidth || b.width !== el.width || b.height !== el.height,
          };
        });
        entry.fontsReadyChanged = entry.fontDiff.some((d) => d.changed);
      }

      if (opts.shotDir) {
        const { data } = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
        const file = path.join(opts.shotDir, `w${width}.png`);
        await writeFile(file, Buffer.from(data, 'base64'));
        entry.screenshot = file;
      }

      measurements.push(entry);
    }

    client.close();

    return {
      url,
      root: opts.url ? null : path.resolve(opts.root),
      chrome: chrome.chromePath,
      selectors: opts.selectors,
      options: { height: opts.height, mobile: opts.mobile, lines: opts.lines, fontDiff: opts.fontDiff, click: opts.click, forceHover: opts.forceHover, initScript: opts.initScript },
      measuredAt: new Date().toISOString(),
      measurements,
    };
  } finally {
    if (chrome) await chrome.close();
    if (server) await server.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const report = await run(opts);

  const json = opts.compact ? JSON.stringify(report) : JSON.stringify(report, null, 2);
  if (opts.out) {
    await mkdir(path.dirname(path.resolve(opts.out)), { recursive: true });
    await writeFile(opts.out, json + '\n', 'utf8');
    console.error(`書き出しました: ${opts.out}`);
  } else {
    process.stdout.write(json + '\n');
  }

  // 一致しなかったセレクタは、測れたことにしない。**黙って空で成功しない**
  const missing = report.measurements.flatMap((m) => (m.missing ?? []).map((x) => `幅 ${m.width}: ${x.selector} — ${x.reason}`));
  if (missing.length) {
    console.error('測れなかったセレクタがあります:\n  ' + missing.join('\n  '));
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(`測定に失敗しました: ${err.message}`);
  process.exit(1);
});

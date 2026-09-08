/**
 * Chrome をヘッドレスで起動し、DevTools Protocol のエンドポイントを返す。
 *
 * 🔒 ここに書いてある起動オプションは、どれも「動いた」という実測の結果である。
 *    きれいに見えるからという理由で変えない。
 *
 * - **旧 `--headless` を使う。`--headless=new` にしない。**
 *   一部のシェルで Chrome が **終了コード 21** で即死する（T-057 の設計担当の環境）。
 * - **`--user-data-dir` は絶対パスで渡す。** 相対パスだと同じく起動に失敗する。
 * - **`--remote-debugging-port=0`** で OS に空きポートを選ばせ、
 *   Chrome が `<user-data-dir>/DevToolsActivePort` へ書いた実ポートを読む。
 *   固定ポートは、前回の Chrome が残っていると黙って別プロセスへ繋がる。
 * - **`--window-size` で幅を作らない。** meta viewport が無視され、
 *   デスクトップのレイアウトが狭い窓に切れて写るだけになる（実機と違う）。
 *   幅は CDP の `Emulation.setDeviceMetricsOverride` で作る。
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** DevToolsActivePort が現れるまで待つ上限（ミリ秒） */
const STARTUP_TIMEOUT_MS = 30_000;
/** 起動待ちのポーリング間隔（ミリ秒） */
const POLL_INTERVAL_MS = 100;

/** 環境変数 CHROME_PATH が最優先。次に、この環境で実在が確認できている場所を順に見る */
function chromeCandidates() {
  const local = process.env.LOCALAPPDATA ?? '';
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  return [
    process.env.CHROME_PATH,
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
}

export function resolveChromePath() {
  for (const candidate of chromeCandidates()) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    'Chrome の実行ファイルが見つかりません。CHROME_PATH に絶対パスを入れて再実行してください。\n' +
      `探した場所:\n  ${chromeCandidates().join('\n  ')}`,
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Chrome を起動する。
 * @returns {Promise<{ browserWsUrl: string, port: number, chromePath: string, close: () => Promise<void> }>}
 */
export async function launchChrome({ chromePath = null, userDataDir = null, extraArgs = [] } = {}) {
  const binary = chromePath ?? resolveChromePath();

  // 絶対パスであることが起動条件。呼び出し側が相対で渡してきても直す
  const ownDir = userDataDir === null;
  const dir = path.resolve(userDataDir ?? (await mkdtemp(path.join(os.tmpdir(), 'browser-measure-'))));
  const portFile = path.join(dir, 'DevToolsActivePort');
  await rm(portFile, { force: true }); // 前回の残骸を読まない

  const args = [
    '--headless', // 🔒 旧 headless。`=new` にしない（終了コード 21 で落ちる環境がある）
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${dir}`,
    ...extraArgs,
    'about:blank',
  ];

  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c.toString(); if (stderr.length > 8000) stderr = stderr.slice(-8000); });
  child.stdout.on('data', () => {});

  /** @type {{ code: number|null, signal: string|null }|null} */
  let exited = null;
  child.on('exit', (code, signal) => { exited = { code, signal }; });

  let spawnError = null;
  child.on('error', (err) => { spawnError = err; });

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let endpoint = null;
  while (Date.now() < deadline) {
    if (spawnError) {
      throw new Error(`Chrome を起動できませんでした（${binary}）: ${spawnError.message}`);
    }
    // 🔒 起動に失敗したら黙って続けない。終了コードを添えて止める
    if (exited) {
      throw new Error(
        `Chrome が起動直後に終了しました。終了コード ${exited.code}` +
          (exited.signal ? ` / シグナル ${exited.signal}` : '') +
          `\n  実行ファイル: ${binary}` +
          `\n  user-data-dir: ${dir}` +
          (exited.code === 21
            ? '\n  ⚠️ 終了コード 21 は --headless=new で出る既知の症状です。旧 --headless を使っているか確認してください。'
            : '') +
          (stderr ? `\n  stderr:\n${stderr.split('\n').slice(-15).join('\n')}` : ''),
      );
    }
    try {
      const raw = await readFile(portFile, 'utf8');
      const [portLine, pathLine] = raw.split('\n');
      const port = Number.parseInt(portLine, 10);
      if (Number.isInteger(port) && port > 0 && pathLine) {
        endpoint = { port, browserWsUrl: `ws://127.0.0.1:${port}${pathLine.trim()}` };
        break;
      }
    } catch {
      // まだ書かれていない
    }
    await sleep(POLL_INTERVAL_MS);
  }

  if (!endpoint) {
    child.kill();
    throw new Error(
      `Chrome の DevTools ポートが ${STARTUP_TIMEOUT_MS}ms 以内に開きませんでした。\n` +
        `  実行ファイル: ${binary}\n  user-data-dir: ${dir}` +
        (stderr ? `\n  stderr:\n${stderr.split('\n').slice(-15).join('\n')}` : ''),
    );
  }

  const close = async () => {
    if (!exited) {
      child.kill();
      // 落ちるのを少しだけ待つ。待ち切れなくても user-data-dir は消しにいく
      for (let i = 0; i < 20 && !exited; i++) await sleep(50);
      if (!exited) child.kill('SIGKILL');
    }
    if (ownDir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  };

  return { ...endpoint, chromePath: binary, userDataDir: dir, close };
}

/**
 * 翻訳キーの解決。requirements.md §9
 *
 * 🔒 文言のハードコードを禁止する。未定義キーはビルドを失敗させる。
 *    「あとで翻訳する」を許すと必ず英語版にだけ日本語が残る。
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const LOCALES_DIR = 'locales';

export async function loadTranslator(locale) {
  const file = path.join(LOCALES_DIR, `${locale}.json`);
  const dict = JSON.parse(await readFile(file, 'utf8'));

  /**
   * @param {string} key   翻訳キー
   * @param {object} params `{name}` を差し替える値
   */
  return function t(key, params = {}) {
    const template = dict[key];
    if (template === undefined) {
      throw new Error(`翻訳キーが ${locale}.json にありません: ${key}`);
    }
    return template.replace(/\{(\w+)\}/g, (match, name) => {
      if (!(name in params)) {
        throw new Error(`翻訳キー ${key} のプレースホルダ {${name}} に値がありません`);
      }
      return String(params[name]);
    });
  };
}

/** HTML エスケープ。テンプレートに値を差し込む前に必ず通す。 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

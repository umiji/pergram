/**
 * PNG の最小限の読み書き。依存パッケージ無しで、書き出した画像を検算するために置く。
 *
 * 扱うのは 8bit の RGB / RGBA だけ。Chrome の `--screenshot` と、ここで書く画像が
 * どちらもそれなので足りる。それ以外が来たら null を返し、**判定しない**
 * （読めないものを読めたことにしない）。
 *
 * 🔒 これは検算用であって画像処理ライブラリではない。拡大縮小も色変換も足さない。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const dLeft = Math.abs(estimate - left);
  const dUp = Math.abs(estimate - up);
  const dUpLeft = Math.abs(estimate - upLeft);
  if (dLeft <= dUp && dLeft <= dUpLeft) return left;
  return dUp <= dUpLeft ? up : upLeft;
}

/**
 * PNG を画素の並びに戻す。
 * @returns {{width: number, height: number, bpp: number, data: Buffer}|null}
 */
export function decodePng(source) {
  const buffer = Buffer.isBuffer(source) ? source : readFileSync(source);
  if (buffer.length < 26 || !buffer.subarray(0, 8).equals(SIGNATURE)) return null;

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const depth = buffer[24];
  const colorType = buffer[25];
  const interlace = buffer[28];
  if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) return null;

  const chunks = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') break;
  }
  if (chunks.length === 0) return null;

  let raw;
  try {
    raw = inflateSync(Buffer.concat(chunks));
  } catch {
    return null;
  }

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  if (raw.length < (stride + 1) * height) return null;

  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const from = y * (stride + 1) + 1;
    const to = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? data[to + x - bpp] : 0;
      const up = y > 0 ? data[to - stride + x] : 0;
      const upLeft = x >= bpp && y > 0 ? data[to - stride + x - bpp] : 0;
      const prediction =
        filter === 1 ? left
        : filter === 2 ? up
        : filter === 3 ? (left + up) >> 1
        : filter === 4 ? paeth(left, up, upLeft)
        : 0;
      data[to + x] = (raw[from + x] + prediction) & 0xff;
    }
  }

  return { width, height, bpp, data };
}

/** 画素の並びを PNG にする。フィルタは使わない（大きさより読みやすさを取る） */
export function encodePng(file, { width, height, bpp, data }) {
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const chunk = (type, payload) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(payload.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([head, body, tail]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = bpp === 4 ? 6 : 2;

  writeFileSync(
    file,
    Buffer.concat([
      SIGNATURE,
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

/** 左上を原点に切り取る。はみ出す指定は null（黙って縮めない） */
export function cropPng(image, width, height) {
  if (image === null || image.width < width || image.height < height) return null;
  const stride = image.width * image.bpp;
  const out = Buffer.alloc(width * image.bpp * height);
  for (let y = 0; y < height; y += 1) {
    image.data.copy(out, y * width * image.bpp, y * stride, y * stride + width * image.bpp);
  }
  return { width, height, bpp: image.bpp, data: out };
}

/** 画素1つの色を `#rrggbb` で返す */
export function pixelHex(image, x, y) {
  const at = y * image.width * image.bpp + x * image.bpp;
  return `#${[image.data[at], image.data[at + 1], image.data[at + 2]]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** その色で塗られている行の数。ビューポートの高さを測るのに使う */
export function rowsWithColor(image, hex) {
  let count = 0;
  for (let y = 0; y < image.height; y += 1) if (pixelHex(image, 0, y) === hex.toLowerCase()) count += 1;
  return count;
}

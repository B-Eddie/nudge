import { deflateSync } from "node:zlib";
const table = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1; return n >>> 0; });
const crc = bytes => { let c = ~0; for (const b of bytes) c = table[(c ^ b) & 255] ^ c >>> 8; return ~c >>> 0; };
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4);
  return out;
}
/** An uninterlaced 8-bit RGBA PNG. */
export function png(rgba, width, height) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width); head.writeUInt32BE(height, 4); head.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(rows, y * (width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
export const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

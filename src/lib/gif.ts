/** A small animated-GIF encoder: one shared palette, whole frames, loops forever. */

export interface GifFrame { pixels: Uint8ClampedArray; delayMs: number }

interface Box { colors: [number, number][]; weight: number }
const channel = (code: number, shift: number) => (code >> shift) & 31;

/** Median cut over 15-bit colour, weighted by how often each colour is used. */
export function buildPalette(frames: readonly GifFrame[], max = 256): { palette: number[]; lookup: Uint8Array } {
  const counts = new Uint32Array(32768);
  // True colours, so flat areas keep their exact shade.
  const sums = new Float64Array(32768 * 3);
  for (const { pixels } of frames) for (let i = 0; i < pixels.length; i += 4) {
    const code = (pixels[i] >> 3) << 10 | (pixels[i + 1] >> 3) << 5 | pixels[i + 2] >> 3;
    counts[code]++;
    for (let c = 0; c < 3; c++) sums[code * 3 + c] += pixels[i + c];
  }
  const colors: [number, number][] = [];
  counts.forEach((count, code) => { if (count) colors.push([code, count]); });
  const box = (list: [number, number][]): Box => ({ colors: list, weight: list.reduce((sum, c) => sum + c[1], 0) });
  const spread = (b: Box) => [10, 5, 0].map(shift => {
    let low = 31, high = 0;
    for (const [code] of b.colors) { const v = channel(code, shift); low = Math.min(low, v); high = Math.max(high, v); }
    return { shift, range: high - low };
  }).sort((a, c) => c.range - a.range)[0];
  const boxes: Box[] = colors.length ? [box(colors)] : [];
  while (boxes.length < max) {
    let best = -1, score = 0;
    boxes.forEach((b, i) => {
      // Range first, so a small bright eye survives a large plain sky.
      const s = b.colors.length < 2 ? 0 : spread(b).range * Math.cbrt(b.weight);
      if (s > score) { score = s; best = i; }
    });
    if (best < 0) break;
    const { shift } = spread(boxes[best]);
    const sorted = boxes[best].colors.slice().sort((a, b) => channel(a[0], shift) - channel(b[0], shift));
    let passed = 0, cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) { passed += sorted[i][1]; cut = i + 1; if (passed >= boxes[best].weight / 2) break; }
    boxes.splice(best, 1, box(sorted.slice(0, cut)), box(sorted.slice(cut)));
  }
  const lookup = new Uint8Array(32768);
  const palette: number[] = [];
  boxes.forEach((b, index) => {
    const mean = [0, 1, 2].map(c => Math.round(b.colors.reduce((sum, [code]) => sum + sums[code * 3 + c], 0) / b.weight));
    palette.push(...mean);
    for (const [code] of b.colors) lookup[code] = index;
  });
  while (palette.length < 768) palette.push(0);
  return { palette, lookup };
}

/** GIF's variable-width LZW. */
export function lzw(indices: Uint8Array, minCode = 8): number[] {
  const out: number[] = [];
  let bits = 0, held = 0;
  const clear = 1 << minCode, end = clear + 1;
  let size = minCode + 1, next = end + 1;
  let table = new Map<number, number>();
  const emit = (code: number) => {
    held |= code << bits;
    bits += size;
    while (bits >= 8) { out.push(held & 255); held >>>= 8; bits -= 8; }
  };
  emit(clear);
  if (!indices.length) { emit(end); if (bits) out.push(held & 255); return out; }
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const key = prefix << 8 | indices[i];
    const known = table.get(key);
    if (known !== undefined) { prefix = known; continue; }
    emit(prefix);
    if (next === 4096) {
      emit(clear);
      table = new Map(); size = minCode + 1; next = end + 1;
    } else {
      if (next === 1 << size) size++;
      table.set(key, next++);
    }
    prefix = indices[i];
  }
  emit(prefix);
  emit(end);
  if (bits) out.push(held & 255);
  return out;
}

const WIDTH_LIMIT = 65535;
export function encodeGif(frames: readonly GifFrame[], width: number, height: number, scale = 1): Uint8Array<ArrayBuffer> {
  if (!frames.length || width * scale > WIDTH_LIMIT) throw new Error("Nothing to animate");
  const W = width * scale, H = height * scale;
  const { palette, lookup } = buildPalette(frames);
  const chunks: ArrayLike<number>[] = [];
  const word = (n: number) => [n & 255, n >> 8 & 255];
  const text = (s: string) => [...s].map(c => c.charCodeAt(0));
  chunks.push([...text("GIF89a"), ...word(W), ...word(H), 0xf7, 0, 0], palette,
    [0x21, 0xff, 11, ...text("NETSCAPE2.0"), 3, 1, 0, 0, 0]);
  for (const { pixels, delayMs } of frames) {
    const indices = new Uint8Array(W * H);
    for (let y = 0; y < height; y++) {
      const row = y * scale * W;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        indices.fill(lookup[(pixels[i] >> 3) << 10 | (pixels[i + 1] >> 3) << 5 | pixels[i + 2] >> 3], row + x * scale, row + (x + 1) * scale);
      }
      for (let r = 1; r < scale; r++) indices.copyWithin(row + r * W, row, row + W);
    }
    chunks.push([0x21, 0xf9, 4, 4, ...word(Math.round(delayMs / 10)), 0, 0, 0x2c, 0, 0, 0, 0, ...word(W), ...word(H), 0, 8]);
    const data = lzw(indices);
    for (let i = 0; i < data.length; i += 255) {
      const part = data.slice(i, i + 255);
      chunks.push([part.length], part);
    }
    chunks.push([0]);
  }
  chunks.push([0x3b]);
  const result = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  let at = 0;
  for (const c of chunks) { result.set(c, at); at += c.length; }
  return result;
}

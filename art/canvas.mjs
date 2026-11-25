/** Pets are drawn in a 64×64 space. The canvas is larger, so a raised arm, a bounce or a
 * tall tower has somewhere to go. Every method takes drawing coordinates; `px` is the raster. */
export const N = 80, OX = 8, OY = 14;
export class Layer {
  constructor() { this.px = new Array(N * N).fill(null); }
  get(x, y) { x += OX; y += OY; return x < 0 || y < 0 || x >= N || y >= N ? null : this.px[y * N + x]; }
  set(x, y, c) { x += OX; y += OY; if (x >= 0 && y >= 0 && x < N && y < N) this.px[y * N + x] = c; return this; }
  fill(test, c) { for (let y = -OY; y < N - OY; y++) for (let x = -OX; x < N - OX; x++) if (test(x, y)) this.set(x, y, c); return this; }
  /** `p` above 2 makes the ellipse boxier. */
  oval(cx, cy, rx, ry, c, p = 2) { return this.fill((x, y) => Math.abs((x - cx) / rx) ** p + Math.abs((y - cy) / ry) ** p <= 1, c); }
  rect(x, y, w, h, c) { return this.fill((a, b) => a >= x && b >= y && a < x + w && b < y + h, c); }
  poly(points, c) {
    return this.fill((x, y) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }, c);
  }
  /** A rounded limb through the given points. */
  limb(points, r, c) {
    return this.fill((x, y) => points.some((a, i) => {
      const b = points[i + 1] ?? a;
      const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
      const t = l ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l)) : 0;
      return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) <= r;
    }), c);
  }
  stamp(x, y, rows, palette) {
    rows.trim().split("\n").forEach((row, j) => [...row.trim()].forEach((k, i) => { if (palette[k]) this.set(x + i, y + j, palette[k]); }));
    return this;
  }
  /** Recolours existing pixels only. */
  tint(paint, from = null) {
    const over = new Layer(); paint(over);
    over.px.forEach((c, i) => { if (c && this.px[i] && (!from || from.includes(this.px[i]))) this.px[i] = c; });
    return this;
  }
  /** One flat step of shade along the lower right of a shape. */
  shade(from, to, dx = 2, dy = 2) {
    const before = this.px.slice();
    const solid = (x, y) => (x += OX) >= 0 && (y += OY) >= 0 && x < N && y < N && before[y * N + x];
    return this.fill((x, y) => before[(y + OY) * N + x + OX] === from && !solid(x + dx, y + dy), to);
  }
  /** Drops lone pixels that stick out of a curve. */
  trim() {
    const before = this.px.slice();
    const solid = (x, y) => (x += OX) >= 0 && (y += OY) >= 0 && x < N && y < N && before[y * N + x] ? 1 : 0;
    return this.fill((x, y) => solid(x, y) && solid(x - 1, y) + solid(x + 1, y) + solid(x, y - 1) + solid(x, y + 1) <= 1, null);
  }
  outline(c) {
    this.trim();
    const before = this.px.slice();
    const solid = (x, y) => (x += OX) >= 0 && (y += OY) >= 0 && x < N && y < N && before[y * N + x];
    return this.fill((x, y) => !before[(y + OY) * N + x + OX] && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)), c);
  }
  over(other) { other.px.forEach((c, i) => { if (c) this.px[i] = c; }); return this; }
  shift(dx, dy) {
    const before = this.px.slice();
    this.px.fill(null);
    before.forEach((c, i) => { if (c) this.set(i % N - OX + dx, Math.floor(i / N) - OY + dy, c); });
    return this;
  }
  /** Leans a head by sliding whole columns, which keeps every pixel square. */
  lean(cx, slope) {
    const before = this.px.slice();
    this.px.fill(null);
    before.forEach((c, i) => { const x = i % N - OX; if (c) this.set(x, Math.floor(i / N) - OY + Math.round((x - cx) * slope), c); });
    return this;
  }
  bounds() {
    let x0 = N, y0 = N, x1 = -N, y1 = -N;
    this.px.forEach((c, i) => { if (!c) return; const x = i % N - OX, y = Math.floor(i / N) - OY; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
    return x1 === -N ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  }
}

import { Layer, N, OX, OY } from "./canvas.mjs";
/** A smooth closed contour, on the raster, through a few points; indices in `sharp` stay corners. */
export function curve(pts, sharp = []) {
  const out = [], n = pts.length, corner = new Set(sharp);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const t1 = corner.has(i) ? [0, 0] : [(p2[0] - p0[0]) / 2, (p2[1] - p0[1]) / 2], t2 = corner.has((i + 1) % n) ? [0, 0] : [(p3[0] - p1[0]) / 2, (p3[1] - p1[1]) / 2];
    for (let k = 0; k < 12; k++) {
      const t = k / 12, a = 2 * t ** 3 - 3 * t * t + 1, b = t ** 3 - 2 * t * t + t, c = -2 * t ** 3 + 3 * t * t, d = t ** 3 - t * t;
      out.push([0, 1].map(q => a * p1[q] + b * t1[q] + c * p2[q] + d * t2[q]));
    }
  }
  return out.map(([x, y]) => [x + OX, y + OY]);
}
export function maskOf(poly) {
  const m = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let q = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [a, b] = poly[i], [c, d] = poly[j]; if ((b > y + .5) !== (d > y + .5) && x + .5 < (c - a) * (y + .5 - b) / (d - b) + a) q = !q; }
    if (q) m[y * N + x] = 1;
  }
  return m;
}
const noise = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233 + 37.7) * 43758.5453; return v - Math.floor(v); };
/** Paints a mask as a rounded, furry form lit from the upper left. `ramp` runs line, then dark to light. */
export function form(layer, m, ramp, { grain = .18, dir = [0, 1], out = true, bias = 0, soft = 7 } = {}) {
  const L = layer.px, was = L.slice(), D = new Float32Array(N * N);
  const on = (a, x, y) => x >= 0 && y >= 0 && x < N && y < N && a[y * N + x];
  for (let i = 0; i < N * N; i++) if (m[i]) {
    let d = soft; const x = i % N, y = i / N | 0;
    for (let b = -soft; b <= soft; b++) for (let a = -soft; a <= soft; a++) if (!on(m, x + a, y + b)) d = Math.min(d, Math.hypot(a, b));
    D[i] = Math.sqrt(1 - (1 - d / soft) ** 2) * soft;
  }
  const B = D.map((_, i) => { let t = 0; const x = i % N, y = i / N | 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) t += on(D, x + a, y + b) || 0; return t / 25; });
  for (let i = 0; i < N * N; i++) if (m[i]) {
    const x = i % N, y = i / N | 0, g = (a, b) => B[Math.max(0, Math.min(N - 1, y + b)) * N + Math.max(0, Math.min(N - 1, x + a))];
    const nx = -(g(1, 0) - g(-1, 0)) / 2, ny = -(g(0, 1) - g(0, -1)) / 2, z = 1.1, l = (nx * -.45 + ny * -.75 + z * .55) / Math.hypot(nx, ny, z);
    const u = Math.floor((x * dir[1] - y * dir[0]) / 1.6), v = Math.floor((x * dir[0] + y * dir[1]) / 2) + (u % 3);
    const t = Math.max(0, Math.min(.999, .5 + l * .42 + bias + (noise(u, v) - .5) * grain * .55));
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]], edge = out && sides.some(([a, b]) => !on(m, x + a, y + b));
    const rim = edge && sides.some(([a, b]) => !on(m, x + a, y + b) && !on(was, x + a, y + b));
    L[i] = edge ? ramp[rim ? 0 : 1] : ramp[1 + Math.floor(t * (ramp.length - 1))];
  }
  return m;
}
export const part = (L, pts, ramp, o = {}) => form(L, maskOf(curve(pts, o.sharp)), ramp, o);
export function inside(L, m, pts, ramp, o = {}) { const q = maskOf(curve(pts, o.sharp)); for (let i = 0; i < q.length; i++) q[i] &= m[i]; return form(L, q, ramp, { out: false, ...o }); }
/** A thick rounded limb. */
export const limb = (L, pts, r, ramp, o = {}) => form(L, Uint8Array.from(new Layer().limb(pts, r, 1).px, v => v ? 1 : 0), ramp, o);
export function line(L, a, b, c, d, col) { const n = Math.max(Math.abs(c - a), Math.abs(d - b)) || 1; for (let i = 0; i <= n; i++) L.set(Math.round(a + (c - a) * i / n), Math.round(b + (d - b) * i / n), col); }

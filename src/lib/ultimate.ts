/** Do-Nothing Expansions. Everything is drawn on a small canvas and enlarged whole, so the
 * spectacle is made of the same pixels as the pet. Two soft flashes at most, well apart. */
import type { CompanionId } from "../types/appearance";
import { EXPANSION, TECHNIQUES } from "./napjutsu";
import { scatter } from "./tantrum";

export const ULTIMATE_MS = 6400;
const CHARGE = 1200, OPEN = 1750, STRIKE = 2900, FINISH = 4450, CLOSE = 5000;
export interface UltimateScene { character: CompanionId; width: number; height: number; pet: { x: number; y: number }; target: { x: number; y: number; width: number; height: number } }
type Ctx = CanvasRenderingContext2D;

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const span = (t: number, from: number, to: number) => clamp((t - from) / (to - from));
const out = (t: number) => 1 - (1 - t) ** 3;
const back = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const box = (c: Ctx, x: number, y: number, w: number, h: number) => c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
/** A filled disc made of whole rows. */
function disc(c: Ctx, x: number, y: number, r: number, squashY = 1) {
  const ry = r * squashY;
  for (let dy = -Math.floor(ry); dy <= ry; dy++) { const half = Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)) * r; box(c, x - half, y + dy, half * 2, 1); }
}
/** A stroke that swells in the middle, like a brush or a blade. */
function slash(c: Ctx, x0: number, y0: number, x1: number, y1: number, width: number, bend = 0) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const t = i / n, w = Math.max(1, width * Math.sin(Math.PI * t));
    box(c, x0 + (x1 - x0) * t + Math.sin(Math.PI * t) * bend - w / 2, y0 + (y1 - y0) * t - w / 2, w, w);
  }
}
function bolt(c: Ctx, x0: number, y0: number, x1: number, y1: number, seed: number, width = 2) {
  let x = x0, y = y0;
  for (let i = 1; i <= 7; i++) {
    const t = i / 7, jag = i === 7 ? 0 : 14, nx = x0 + (x1 - x0) * t + (scatter(seed + i) - .5) * jag, ny = y0 + (y1 - y0) * t + (scatter(seed + i + 40) - .5) * jag;
    const n = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y)));
    for (let k = 0; k <= n; k++) box(c, x + (nx - x) * k / n, y + (ny - y) * k / n, width, width);
    x = nx; y = ny;
  }
}
function text(c: Ctx, words: string, x: number, y: number, size: number, width: number) {
  let px = size;
  do { c.font = `700 ${px}px "PPNeueBit-Bold", "NeueBit", monospace`; } while (c.measureText(words).width > width && --px > 8);
  c.textAlign = "center"; c.fillText(words, Math.round(x), Math.round(y), width); c.textAlign = "left";
}

/** Flame-like energy around the pet, rising in hard little squares. */
function aura(c: Ctx, s: UltimateScene, t: number, strength: number) {
  const { power, glow } = TECHNIQUES[s.character];
  for (let i = 0; i < 70 * strength; i++) {
    const life = (t / (520 + scatter(i) * 420) + scatter(i + 7)) % 1, side = (scatter(i + 13) - .5) * 2;
    const x = s.pet.x + side * 26 * (1 - life * .45) + Math.sin(t / 140 + i) * 2, y = s.pet.y + 22 - life * (52 + scatter(i + 3) * 26) * strength;
    const size = (1 - life) * (3.5 + scatter(i + 5) * 4);
    c.fillStyle = life < .35 ? glow : power; c.globalAlpha = (1 - life) * .9;
    box(c, x - size / 2, y - size / 2, size, size * 1.5);
  }
  c.globalAlpha = 1;
}
function gather(c: Ctx, s: UltimateScene, t: number) {
  const { power, glow } = TECHNIQUES[s.character];
  for (let i = 0; i < 80; i++) {
    const life = (t / 620 + scatter(i)) % 1, a = scatter(i + 50) * Math.PI * 2 + life * 1.2, r = (1 - life) * (70 + scatter(i + 9) * 130);
    c.fillStyle = i % 4 ? power : glow; c.globalAlpha = life * .9;
    const x = s.pet.x + Math.cos(a) * r, y = s.pet.y + Math.sin(a) * r * .8;
    slash(c, x, y, x + Math.cos(a) * 9 * life, y + Math.sin(a) * 9 * life, 2);
  }
  c.globalAlpha = 1;
}

/* ---- four places to be ---- */
function moonShrine(c: Ctx, s: UltimateScene, t: number) {
  const { width: W, height: H } = s, cx = s.target.x + s.target.width / 2, r = Math.min(W, H) * .33, cy = H * .44;
  ["#0c0a22", "#130f33", "#1b1546", "#261c5a", "#33246b"].forEach((f, i) => { c.fillStyle = f; box(c, 0, i * H / 5, W, H / 5 + 1); });
  for (let i = 0; i < 90; i++) { c.fillStyle = (t / 300 + i) % 5 < 1 ? "#ffffff" : "#8f86d8"; box(c, scatter(i) * W, scatter(i + 200) * H * .8, i % 9 ? 1 : 2, i % 9 ? 1 : 2); }
  // The moon is an eye, and it is opening.
  const open = back(span(t, OPEN, STRIKE));
  c.fillStyle = "#4b3d8c"; disc(c, cx, cy, r * 1.14); c.fillStyle = "#e9c94f"; disc(c, cx, cy, r); c.fillStyle = "#f7e58f"; disc(c, cx - r * .07, cy - r * .07, r * .9);
  c.fillStyle = "#d9b23c"; for (const [x, y, k] of [[-.5, -.3, .12], [.48, .3, .16], [-.35, .5, .09], [.45, -.42, .08]]) disc(c, cx + r * x, cy + r * y, r * k);
  c.fillStyle = "#0a0718"; const pupil = r * (.08 + .62 * clamp(open)); for (let dy = -Math.floor(r * .86); dy <= r * .86; dy++) { const half = Math.sqrt(1 - (dy / (r * .87)) ** 2) * pupil; box(c, cx - half, cy + dy, half * 2, 1); }
  c.fillStyle = "#ffffff"; disc(c, cx - pupil * .35, cy - r * .42, r * .09);
  // A shrine made of scratching posts and cat trees.
  const rise = out(span(t, OPEN, STRIKE - 300)), base = H + (1 - rise) * 90;
  const post = (x: number, h: number) => { c.fillStyle = "#1a0f16"; box(c, x - 6, base - h, 13, h); for (let y = 0; y < h; y += 4) { c.fillStyle = y % 8 ? "#a9793f" : "#c8975a"; box(c, x - 5, base - h + y, 11, 3); } };
  const gate = Math.min(W * .3, 120);
  for (const side of [-1, 1]) { post(cx + side * gate, H * .52); c.fillStyle = "#241432"; box(c, cx + side * gate * 1.5 - 26, base - H * .26, 52, 7); post(cx + side * gate * 1.5, H * .25); c.fillStyle = "#5b3a78"; box(c, cx + side * gate * 1.5 - 24, base - H * .26 + 1, 48, 3); }
  for (const [y, w, f] of [[.53, 1.32, "#7a2540"], [.45, 1.12, "#5f1b33"]] as const) { c.fillStyle = "#17060e"; box(c, cx - gate * w - 1, base - H * y - 1, gate * w * 2 + 2, 11); c.fillStyle = f; box(c, cx - gate * w, base - H * y, gate * w * 2, 8); c.fillStyle = "#a8435f"; box(c, cx - gate * w, base - H * y, gate * w * 2, 2); }
  for (let i = -2; i <= 2; i++) { const sw = Math.sin(t / 400 + i) * 3; c.fillStyle = "#d8c7a0"; box(c, cx + i * gate * .4, base - H * .44, 1, 14); c.fillStyle = "#e0564b"; disc(c, cx + i * gate * .4 + sw, base - H * .44 + 17, 4); }
  // Nine lives, nine cuts.
  for (let i = 0; i < 9; i++) {
    const at = STRIKE + i * 150, p = span(t, at, at + 110), gone = span(t, at + 110, at + 520);
    if (p <= 0 || gone >= 1) continue;
    const a = (i % 2 ? .6 : -.6) + (scatter(i + 2) - .5) * .7, l = s.target.width * .62, mx = cx + (scatter(i + 30) - .5) * s.target.width * .5, my = s.target.y + s.target.height * (.2 + scatter(i + 60) * .6);
    const x0 = mx - Math.cos(a) * l, y0 = my - Math.sin(a) * l, x1 = x0 + Math.cos(a) * l * 2 * out(p), y1 = y0 + Math.sin(a) * l * 2 * out(p);
    c.fillStyle = "#2b1f6b"; slash(c, x0, y0 + 3, x1, y1 + 3, 12 * (1 - gone), 10);
    c.fillStyle = "#f4dc6a"; slash(c, x0, y0, x1, y1, 8 * (1 - gone), 10); c.fillStyle = "#ffffff"; slash(c, x0, y0, x1, y1, 4 * (1 - gone), 10);
  }
}
function bamvoid(c: Ctx, s: UltimateScene, t: number) {
  const { width: W, height: H } = s, cx = s.target.x + s.target.width / 2;
  c.fillStyle = "#070908"; box(c, 0, 0, W, H);
  // Brushed rings falling away forever.
  for (let i = 0; i < 9; i++) {
    const z = (i / 9 + t / 3600) % 1, r = 8 + z * z * Math.max(W, H) * .75;
    c.globalAlpha = Math.min(1, z * 3) * (1 - z) * .9; c.fillStyle = i % 2 ? "#d8e6d4" : "#3f7a4c";
    for (let k = 0; k < 120; k++) { if (scatter(k + i * 31) < .2) continue; const a = k / 120 * Math.PI * 2 + i + t / 5000; box(c, cx + Math.cos(a) * r, H * .46 + Math.sin(a) * r * .62, 1 + z * 4 * scatter(k), 1 + z * 2); }
  }
  c.globalAlpha = 1;
  const stalk = (x: number, top: number, w: number, dark: string, mid: string, light: string) => {
    for (let y = H; y > top; y -= 1) { c.fillStyle = mid; box(c, x - w / 2, y, w, 1); }
    c.fillStyle = light; box(c, x - w / 2 + 1, top, Math.max(1, w * .22), H - top); c.fillStyle = dark; box(c, x + w / 2 - Math.max(1, w * .25), top, Math.max(1, w * .25), H - top);
    for (let y = H; y > top; y -= Math.max(9, w * 3)) { c.fillStyle = dark; box(c, x - w / 2 - 1, y, w + 2, 1); c.fillStyle = light; box(c, x - w / 2, y - 1, w, 1); }
    c.fillStyle = light; for (let i = 0; i < w; i++) box(c, x - w / 2 + i / 2, top - i, w - i, 1);
  };
  for (let i = 0; i < 24; i++) { const x = (i + .5) / 24 * W + (scatter(i) - .5) * 10; stalk(x, H * (1.1 - out(span(t, OPEN + i * 18, STRIKE)) * (.65 + scatter(i + 4) * .5)), 4 + scatter(i) * 3, "#0e1a11", "#16261a", "#223a28"); }
  // Something very large opens its eyes.
  const wake = back(span(t, OPEN + 350, STRIKE)), look = Math.sin(t / 700) * 5, shutEyes = span(t, FINISH + 150, FINISH + 350);
  if (wake > .02) for (const side of [-1, 1]) {
    const ex = cx + side * W * .17, ey = H * .38, rx = W * .085, ry = H * .13 * clamp(wake, 0, 1.15) * (1 - shutEyes);
    if (ry < 1) continue;
    c.fillStyle = "#1b2a1f"; for (let i = 0; i < 20; i++) disc(c, ex + side * i * .9, ey + i * 1.3, rx * 1.45 - i * .4, 1.12);
    c.fillStyle = "#000000"; for (let i = 0; i < 20; i++) disc(c, ex + side * i * .9, ey + i * 1.3, rx * 1.36 - i * .4, 1.12);
    c.fillStyle = "#55b565"; disc(c, ex, ey, rx, ry / rx); c.fillStyle = "#e6ffe0"; disc(c, ex, ey, rx * .86, ry / rx * 1.0);
    c.fillStyle = "#070908"; disc(c, ex + look, ey, Math.min(rx * .42, ry * .8)); c.fillStyle = "#ffffff"; disc(c, ex + look - rx * .14, ey - Math.min(rx, ry) * .28, rx * .13);
  }
  // Spears come up through the window, a row at a time.
  for (let i = 0; i < 18; i++) {
    const at = STRIKE + (i * 83) % 1250, p = span(t, at, at + 170);
    if (p <= 0) continue;
    const x = s.target.x + (i + .5) / 18 * s.target.width + (scatter(i + 9) - .5) * 8, top = H - (H - s.target.y + 8 + scatter(i + 5) * 46) * back(p);
    stalk(x, top, 9 + scatter(i + 3) * 5, "#2d6b3a", "#55b565", "#b7f7b4");
    if (p < 1) { c.fillStyle = "#e6ffe0"; for (let k = 0; k < 6; k++) box(c, x + (scatter(k + i) - .5) * 40 * p, top + (scatter(k + i + 9) - .5) * 30, 2, 2); }
  }
  for (let i = 0; i < 40; i++) { const f = (t / (1900 + scatter(i) * 1600) + scatter(i + 2)) % 1; c.fillStyle = i % 3 ? "#7fe08a" : "#e6ffe0"; box(c, scatter(i + 80) * W + Math.sin(t / 500 + i) * 12, f * H, 4, 2); box(c, scatter(i + 80) * W + Math.sin(t / 500 + i) * 12 + 2, f * H + 2, 3, 1); }
}
function citrusGarden(c: Ctx, s: UltimateScene, t: number) {
  const { width: W, height: H } = s, horizon = H * .6, cx = s.target.x + s.target.width / 2;
  ["#12303f", "#1c4a56", "#2c6a6e", "#5a8f80", "#a8b98c", "#f0d79a"].forEach((f, i) => { c.fillStyle = f; box(c, 0, i * horizon / 6, W, horizon / 6 + 1); });
  // A yuzu the size of the sun, coming down very slowly.
  const r = Math.min(W, H) * .25, cy = H * (.1 + .2 * out(span(t, OPEN, FINISH)));
  c.fillStyle = "#f9e6a8"; c.globalAlpha = .35; disc(c, cx, cy, r * 1.3); c.globalAlpha = 1;
  c.fillStyle = "#d1811f"; disc(c, cx + 1, cy + 2, r); c.fillStyle = "#f3b13f"; disc(c, cx, cy, r); c.fillStyle = "#fbd474"; disc(c, cx - r * .16, cy - r * .18, r * .68);
  for (let i = 0; i < 46; i++) { const a = scatter(i) * 6.28, d = Math.sqrt(scatter(i + 8)) * r * .9; c.fillStyle = "#dd9a30"; box(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1, 1); }
  c.fillStyle = "#3d7a3a"; box(c, cx - 2, cy - r - 5, 4, 7); slash(c, cx, cy - r - 3, cx + r * .5, cy - r - 12, 9, 0);
  ["#8fbcae", "#4f98a0", "#2f7a8a", "#1e5d72", "#123f55"].forEach((f, i) => { c.fillStyle = f; box(c, 0, horizon + i * (H - horizon) / 5, W, (H - horizon) / 5 + 1); });
  for (let i = 0; i < 46; i++) { const y = horizon + 2 + scatter(i) * (H - horizon), w = 6 + scatter(i + 3) * 26 * ((y - horizon) / (H - horizon) + .3); c.fillStyle = Math.abs(y % 7) < 3 ? "#f9dd94" : "#bfe3dd"; c.globalAlpha = .55; box(c, (scatter(i + 5) * (W + 60) + t / (60 + scatter(i) * 60)) % (W + 60) - 30, y, w, 1); }
  c.globalAlpha = 1;
  for (let i = 0; i < 9; i++) { const x = (scatter(i + 90) * W + t / 90) % W, y = horizon + 10 + scatter(i + 91) * (H - horizon - 20), b = Math.sin(t / 500 + i) * 1.5; c.fillStyle = "#123f55"; box(c, x - 6, y + 5 + b, 13, 1); c.fillStyle = "#e79f2b"; disc(c, x, y + b, 6); c.fillStyle = "#fbd474"; disc(c, x - 1, y - 1 + b, 3); }
  for (let i = 0; i < 30; i++) { const f = (t / (2600 + scatter(i) * 2000) + scatter(i + 11)) % 1; c.globalAlpha = (1 - f) * .28; c.fillStyle = "#ffffff"; disc(c, scatter(i + 21) * W + Math.sin(t / 700 + i) * 8, horizon + 20 - f * 70, 3 + f * 9); }
  c.globalAlpha = 1;
  // Nothing happens. Then one drop.
  const fall = span(t, STRIKE, FINISH - 350), hit = horizon + (H - horizon) * .32, dropY = cy + r + (hit - cy - r) * fall * fall;
  if (fall > 0 && fall < 1) { c.fillStyle = "#fff0c0"; disc(c, cx, dropY, 3); box(c, cx - 1, dropY - 8, 2, 7); }
  const wave = span(t, FINISH - 350, CLOSE);
  for (let i = 0; i < 6; i++) { const p = clamp(wave * 1.7 - i * .12); if (p <= 0 || p >= 1) continue; c.fillStyle = i % 2 ? "#ffffff" : "#f6bb45"; c.globalAlpha = 1 - p; const rx = p * W * .9; for (let k = 0; k < 260; k++) { const a = k / 260 * 6.283; box(c, cx + Math.cos(a) * rx, hit + Math.sin(a) * rx * .34, 4 * (1 - p) + 1, 3 * (1 - p) + 1); } }
  c.globalAlpha = 1;
  if (wave > 0 && wave < .7) for (let i = 0; i < 34; i++) { const side = scatter(i) - .5, up = Math.sin(Math.PI * clamp(wave * 1.5)) * (60 + scatter(i + 7) * H * .45); c.fillStyle = i % 3 ? "#bfe3dd" : "#ffffff"; box(c, cx + side * W * .5 * wave * 2, hit - up, 3, 6 + scatter(i) * 12); }
}
function shellPerfection(c: Ctx, s: UltimateScene, t: number) {
  const { width: W, height: H } = s, cx = s.target.x + s.target.width / 2, cy = s.target.y + s.target.height / 2;
  ["#0d0206", "#17040b", "#230611", "#330919", "#470d22"].forEach((f, i) => { c.fillStyle = f; box(c, 0, i * H / 5, W, H / 5 + 1); });
  // A spiral shell the size of the sky, turning.
  for (let i = 0; i < 1300; i++) { const a = i * .046 + t / 2600, r = Math.exp(i * .0041) * 3.2; if (r > Math.max(W, H) * .8) break; c.fillStyle = i % 68 < 5 ? "#ff8d7a" : i % 68 < 34 ? "#7c1a30" : "#a52a3e"; const w = 1.5 + r * .05; box(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r * .72, w, w); }
  // Tide, in bands.
  for (let i = 0; i < 5; i++) { const y = H * (.78 + i * .06) + Math.sin(t / 420 + i) * 3 - out(span(t, OPEN, STRIKE)) * 8; c.fillStyle = ["#6e1228", "#8d1c32", "#ad2a3c", "#7c152b", "#4b0b1c"][i]; for (let x = 0; x < W; x += 4) box(c, x, y + Math.sin(x / 13 + t / 260 + i * 2) * 4, 4, H); c.fillStyle = "#ff9d8c"; for (let x = 0; x < W; x += 4) if (scatter(x + i * 71) < .4) box(c, x, y + Math.sin(x / 13 + t / 260 + i * 2) * 4 - 1, 4, 1); }
  // Two colossal claws.
  const enter = out(span(t, OPEN + 500, STRIKE + 200)), squeeze = span(t, FINISH - 130, FINISH), k = Math.min(H / 170, 2);
  for (const side of [-1, 1]) {
    const tremble = enter === 1 && squeeze === 0 ? Math.sin(t / 34) * 1.5 : 0, pull = span(t, FINISH - 600, FINISH - 130) * (1 - squeeze) * 16;
    const tip = (1 - enter) * W * .7 + (1 - squeeze) * Math.min(W * .13, 70) + pull + tremble, at = (q: number) => cx + side * (tip + q * 96 * k);
    const open = .12 + (1 - squeeze) * .5;
    // Each finger is a tapering hook from wrist to tip; outline first, then colour.
    const finger = (tilt: number) => Array.from({ length: 60 }, (_, i) => { const q = i / 59; return { x: at(q), y: cy + tilt * (Math.sin(q * 2.5) * 34 * k * open * 1.6 + q * 14 * k), r: (2 + Math.sin(Math.min(1, q * 1.15) * 1.6) * 19) * k * .95 }; });
    const upper = finger(-1), lower = finger(1), palm = { x: at(1.22), y: cy, r: 42 * k };
    c.fillStyle = "#1c0208"; for (const d of [...upper, ...lower, palm]) disc(c, d.x, d.y, d.r + 2.5);
    c.fillStyle = "#7a1626"; disc(c, palm.x, palm.y, palm.r); for (const d of lower) disc(c, d.x, d.y, d.r);
    c.fillStyle = "#a82636"; for (const d of lower) disc(c, d.x, d.y - d.r * .16, d.r * .8);
    c.fillStyle = "#1c0208"; for (const d of upper) disc(c, d.x, d.y + 1.5, d.r + 1);
    c.fillStyle = "#9c1f30"; for (const d of upper) disc(c, d.x, d.y, d.r);
    c.fillStyle = "#cc3540"; disc(c, palm.x, palm.y - palm.r * .12, palm.r * .84); for (const d of upper) disc(c, d.x, d.y - d.r * .14, d.r * .82);
    c.fillStyle = "#ff7d72"; for (const d of upper) if (d.r > 7) disc(c, d.x, d.y - d.r * .52, d.r * .24);
    c.fillStyle = "#ffd9d0"; upper.forEach((d, i) => { if (i % 13 === 6 && d.r > 6) disc(c, d.x, d.y - d.r * .6, 2); });
    // Teeth along the inside edge.
    c.fillStyle = "#ffd9d0"; for (const [f, tilt] of [[upper, 1], [lower, -1]] as const) f.forEach((d, i) => { if (i % 6 === 3 && i > 4 && i < 44) disc(c, d.x, d.y + tilt * d.r * .86, 3 * k); });
  }
  // Black-cored lightning while they hold.
  if (t > STRIKE && t < FINISH + 300) for (let i = 0; i < 6; i++) { const beat = Math.floor(t / 90) + i * 17; if (scatter(beat) < .35) continue; const a = scatter(beat + 3) * 6.28, l = 60 + scatter(beat + 5) * 120; c.fillStyle = "#ff4a5e"; bolt(c, cx, cy, cx + Math.cos(a) * l * 1.6, cy + Math.sin(a) * l, beat, 4); c.fillStyle = "#12010a"; bolt(c, cx + 1, cy + 1, cx + Math.cos(a) * l * 1.6, cy + Math.sin(a) * l, beat, 2); }
  if (squeeze > 0) { const p = span(t, FINISH, FINISH + 420); c.fillStyle = "#ffd9d0"; for (let i = 0; i < 26; i++) { const a = i / 26 * 6.283 + scatter(i), r0 = p * 40 + 10, r1 = p * Math.max(W, H) * .7 * (.5 + scatter(i + 3) * .5); if (p < 1) slash(c, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, 6 * (1 - p)); } }
}
const PLACES: Record<CompanionId, typeof moonShrine> = { cat: moonShrine, panda: bamvoid, capybara: citrusGarden, crab: shellPerfection };

/** What's left on the window afterwards. Wipes itself off. */
function aftermath(c: Ctx, s: UltimateScene, t: number) {
  const fade = 1 - span(t, CLOSE + 500, ULTIMATE_MS), { power, glow } = TECHNIQUES[s.character], cx = s.target.x + s.target.width / 2, cy = s.target.y + s.target.height * .45;
  c.globalAlpha = fade;
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + scatter(i) * .5, l = (30 + scatter(i + 3) * 60); c.fillStyle = "#1a1420"; bolt(c, cx, cy, cx + Math.cos(a) * l * 1.5, cy + Math.sin(a) * l, i * 13, 2); c.fillStyle = i % 2 ? power : glow; bolt(c, cx, cy + 1, cx + Math.cos(a) * l, cy + Math.sin(a) * l * .7, i * 13, 1); }
  for (let i = 0; i < 40; i++) { const f = span(t, CLOSE - 200, ULTIMATE_MS); c.fillStyle = i % 3 ? power : glow; box(c, s.target.x + scatter(i) * s.target.width, s.target.y + scatter(i + 9) * s.target.height + f * f * 60, 2, 2); }
  c.globalAlpha = 1;
}

/** Everything behind the pet, `t` ms in. Leaves the canvas clear outside the expansion. */
export function drawUltimate(c: Ctx, scene: UltimateScene, t: number): void {
  // The pet can be standing outside the window; power enters at the nearest edge.
  const from = { x: clamp(scene.pet.x, 0, scene.width), y: clamp(scene.pet.y, 0, scene.height) }, s = { ...scene, pet: from };
  const { width: W, height: H, pet } = s, tech = TECHNIQUES[s.character];
  c.imageSmoothingEnabled = false; c.globalAlpha = 1;
  if (t < 0 || t >= ULTIMATE_MS) return;
  // The room goes dim while power gathers.
  const dim = t < CHARGE ? out(t / CHARGE) * .55 : t < OPEN ? .55 + span(t, CHARGE, OPEN) * .25 : t < CLOSE ? .8 : .8 * (1 - span(t, CLOSE, CLOSE + 500));
  c.fillStyle = "#05040a"; c.globalAlpha = dim; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
  if (t < OPEN) gather(c, s, t);

  const far = Math.hypot(Math.max(pet.x, W - pet.x), Math.max(pet.y, H - pet.y)) + 20;
  const radius = t < CLOSE ? out(span(t, OPEN - 250, OPEN + 450)) * far : (1 - out(span(t, CLOSE, CLOSE + 450))) * far;
  if (radius > 1) {
    c.save();
    const shake = t > FINISH && t < FINISH + 450 ? (1 - span(t, FINISH, FINISH + 450)) * 6 : 0;
    c.beginPath(); c.arc(pet.x, pet.y, radius, 0, 6.2832); c.clip();
    c.translate(Math.round((scatter(Math.floor(t / 40)) - .5) * shake * 2), Math.round((scatter(Math.floor(t / 40) + 9) - .5) * shake * 2));
    PLACES[s.character](c, s, t);
    c.restore();
    // A burning rim where the two places meet.
    if (radius < far * .97) for (let k = 0; k < 200; k++) { const a = k / 200 * 6.2832, j = scatter(k + Math.floor(t / 60)) * 10; c.fillStyle = k % 3 ? tech.power : tech.glow; box(c, pet.x + Math.cos(a) * (radius + j - 3), pet.y + Math.sin(a) * (radius + j - 3), 3 + j / 4, 3 + j / 4); }
  }
  if (t >= CLOSE - 100) aftermath(c, s, t);

  // Title, cut across the screen on a brush stroke.
  const inn = out(span(t, OPEN + 200, OPEN + 480)), gone = span(t, STRIKE - 60, STRIKE + 160);
  if (inn > 0 && gone < 1) {
    const y = H * .22, w = W * .94;
    c.globalAlpha = 1 - gone; c.fillStyle = "#08060c";
    for (let i = -17; i <= 17; i++) { const rough = scatter(i + 60) * 26; box(c, W / 2 - w / 2 * inn + rough, y + i, w * inn - rough - scatter(i + 99) * 30, 1); }
    c.fillStyle = tech.power; box(c, W / 2 - w / 2 * inn, y - 20, w * inn * .7, 2); box(c, W / 2 - w * inn * .2, y + 19, w * inn * .7, 2);
    if (inn > .75) { c.fillStyle = tech.glow; const middle = Math.max(W * .24, Math.min(W * .76, s.target.x + s.target.width / 2)), room = Math.min(middle, W - middle) * 1.8; text(c, EXPANSION, middle, y - 4, 13, room); c.fillStyle = "#ffffff"; text(c, tech.name, middle, y + 14, 24, room); }
    c.globalAlpha = 1;
  }
  aura(c, scene, t, t < CHARGE ? .25 + .75 * t / CHARGE : t < CLOSE ? 1 : Math.max(.05, 1 - span(t, CLOSE, CLOSE + 700)));
  // Two flashes, brief and not full white, nearly three seconds apart.
  const flash = Math.max(1 - span(t, OPEN - 200, OPEN), 0) * (t >= OPEN - 200 ? 1 : 0) + Math.max(1 - span(t, FINISH, FINISH + 200), 0) * (t >= FINISH ? 1 : 0);
  if (flash > 0) { c.globalAlpha = flash * .6; c.fillStyle = tech.glow; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
}

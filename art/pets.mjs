/**
 * The companions, on one 64×64 grid. Real animals, real bulk: proportions follow published
 * measurements, and only the heads are enlarged. Each carries its own break timer:
 * feature(energy) runs from 5 (rested) to 1 (worn out).
 */
import { Layer } from "./canvas.mjs";
import { curve, form, inside, limb, line, maskOf, part } from "./form.mjs";

export const POSES = ["idle", "blink", "happy", "delighted", "curious", "lifted", "yawn", "sleep", "walkA", "walkB", "stretch", "groom", "focus", "read", "music", "play"];
export const ENERGIES = [1, 2, 3, 4, 5];
const C = 32;
const flip = p => p.map(([x, y]) => [64 - x, y]);
const both = [p => p, flip];
const SHUT = new Set(["blink", "delighted", "yawn", "sleep", "stretch", "groom", "music"]);
const PROPS = { ink: "#2c2a33", metal: "#8d97a8", dim: "#69738a", paper: "#f3ead6", rule: "#c9b998", cover: "#4f7a8c", pad: "#4a4d5c", shell: "#e6dfd0", key: "#e0a63c", red: "#d9614c" };
const shut = new Set(["blink", "delighted", "yawn", "sleep", "stretch", "groom", "music"]);
const walking = pose => pose === "walkA" || pose === "walkB";

/* ---- shared props, drawn facing the pet ---- */
const laptop = (cx, y) => new Layer().rect(cx - 11, y, 23, 13, PROPS.metal).rect(cx - 11, y + 11, 23, 2, PROPS.dim)
  .rect(cx - 13, y + 13, 27, 2, PROPS.dim).oval(cx, y + 5.5, 1.8, 1.8, "#e3e8ee").outline(PROPS.ink);
function book(cx, y) {
  const l = new Layer().poly([[cx - 11.5, y - .5], [cx + .5, y + 2.5], [cx + .5, y + 14.5], [cx - 11.5, y + 11.5]], PROPS.cover)
    .poly([[cx + .5, y + 2.5], [cx + 12.5, y - .5], [cx + 12.5, y + 11.5], [cx + .5, y + 14.5]], PROPS.cover);
  l.fill((x, b) => l.get(x, b) && (!l.get(x, b - 1) || !l.get(x, b - 2)), PROPS.paper);
  for (let i = 3; i < 15; i++) if (l.get(cx, y + i)) l.set(cx, y + i, "#3a5e6e");
  return l.rect(cx - 8, y + 6, 4, 1, "#86aab8").outline(PROPS.ink);
}
const controller = (cx, y) => new Layer().oval(cx - 5, y + 4, 4, 4, PROPS.shell).oval(cx + 5, y + 4, 4, 4, PROPS.shell).rect(cx - 5, y + 1, 11, 5, PROPS.shell)
  .rect(cx - 7, y + 3, 3, 1, PROPS.ink).rect(cx - 6, y + 2, 1, 3, PROPS.ink).set(cx + 5, y + 4, PROPS.key).set(cx + 6, y + 2, PROPS.red).outline(PROPS.ink);
/** A band over the crown and a cup over each side. */
function headphones(left, right, top, cupY, color) {
  const l = new Layer(), cx = (left + right) / 2, rx = (right - left) / 2;
  l.fill((x, y) => { const d = ((x - cx) / (rx + 1)) ** 2 + ((y - cupY) / (cupY - top + 1)) ** 2, e = ((x - cx) / (rx - 1)) ** 2 + ((y - cupY) / (cupY - top - 1)) ** 2; return y <= cupY && d <= 1 && e > 1; }, PROPS.pad);
  return l.oval(left, cupY + 1, 3, 4.5, color, 2.6).oval(right, cupY + 1, 3, 4.5, color, 2.6).outline(PROPS.ink);
}


/** The bed from the first drawings: pillow, red blanket, wooden legs. */
function bed(body) {
  body.rect(3, 57, 58, 5, "#7b1a1f").rect(3, 57, 58, 1, "#9a2a2c").rect(3, 57, 14, 5, "#e9e6df").rect(3, 57, 14, 1, "#ffffff")
    .rect(2, 61, 60, 2, "#8a5a2e").rect(4, 63, 4, 1, "#5f3c1d").rect(56, 63, 4, 1, "#5f3c1d").rect(2, 62, 60, 1, "#6b4522");
}
/** A mouth that has given up, in place of a resting one. */
let tired = false;
const FLAT = "..kkkkk..\n.k.....k.";

/* ---- faces ---- */
const MOUTH = { open: ".kkkkk.\nkrrrrrk\n.krrrk.\n..kkk..", yawn: "..kkkk..\n.krrrrk.\nkrrrrrrk\nkrrpprrk\n.kpppk..\n..kkk...", o: ".kk.\nkrrk\nkrrk\n.kk.", grin: "k.......k\nkkrrrrrkk\n.krpppk..\n..kkkk..." };
const say = (h, kind, x, y, ink) => h.stamp(Math.round(x - MOUTH[kind].split("\n")[0].length / 2), y, MOUTH[kind], { k: ink, r: "#6d2630", p: "#d9807c" });
const lidded = (h, x, y, pose, c) => h.stamp(x, y, ["delighted", "stretch", "music"].includes(pose) ? ".kkkk.\nk....k" : "k....k\n.kkkk.", { k: c });
const propFor = (pose, cx, y) => pose === "focus" ? laptop(cx, y) : pose === "read" ? book(cx - 1, y - 2) : pose === "play" ? controller(cx - 1, y + 1) : null;
/** Shoulder to wrist for the pets that sit up, viewer's left then right. */
function reach(pose) {
  const L = (...p) => p, R = (...p) => flip(p);
  switch (pose) {
    case "delighted": return [L([17, 40], [10, 33]), R([17, 40], [10, 33])];
    case "stretch": return [L([16, 40], [9, 32], [9, 19]), R([16, 40], [9, 32], [9, 19])];
    case "lifted": return [L([17, 40], [10, 47]), R([17, 40], [10, 47])];
    case "yawn": return [null, R([16, 42], [15, 37], [21, 33])];
    case "groom": return [null, R([16, 42], [14, 36], [19, 29])];
    case "focus": return [L([16, 40], [17, 50]), R([16, 40], [17, 50])];
    case "read": case "play": return [L([16, 40], [18, 47]), R([16, 40], [18, 47])];
    default: return [null, null];
  }
}
const paw = (points, r, ramp, sock) => {
  const l = new Layer(), m = limb(l, points, r, ramp, { grain: .2, soft: 5 });
  if (sock) { const [x, y] = points.at(-1); const q = Uint8Array.from(new Layer().oval(x, y, r + .7, r + .7, 1).px, (v, i) => v && m[i] ? 1 : 0); form(l, q, sock, { out: false, grain: .1, soft: 4 }); }
  return l;
};
const eye = (x, y, w, h, extra) => ({ x, y, width: w, height: h, ...extra });
const headMove = pose => ({ curious: [0, -1], lifted: [0, -2], stretch: [0, -1], focus: [0, 1], read: [0, 1], walkB: [0, -1], groom: [1, 1] }[pose] ?? [0, 0]);
/** Moves and tilts a finished head together with its eyes. */
function settle(head, eyes, pose, cx, [dx, dy]) {
  const slope = pose === "curious" ? .1 : pose === "groom" ? -.07 : 0;
  if (slope) head.lean(cx, slope);
  head.shift(dx, dy);
  return eyes.map(e => ({ ...e, x: e.x + dx, y: e.y + dy + Math.round((e.x + e.width / 2 - cx) * slope) }));
}

/* ---- panda: a barrel with a bamboo stalk it eats down as you work ---- */
const PW = ["#8b867e", "#c9c3b9", "#e6e1d8", "#f5f2ec", "#ffffff"], PK = ["#060608", "#0f0f13", "#191920", "#25252d", "#33333d"];
function pandaHead(pose) {
  const h = new Layer();
  for (const f of both) part(h, f([[12, 12], [13, 6], [18, 3], [23, 6], [23, 11], [17, 16]]), PK, { grain: .2, soft: 6 });
  part(h, [[22, 7], [32, 5.5], [42, 7], [49, 13], [52, 21], [50, 28], [43, 34], [32, 36], [21, 34], [14, 28], [12, 21], [15, 13]], PW, { grain: .2, soft: 13 });
  for (const f of both) part(h, f([[22, 15], [26, 16], [27, 20], [24, 24], [20, 25.5], [18, 22], [19, 18]]), PK, { out: false, grain: .1, soft: 6 });
  part(h, [[26, 23], [32, 21.5], [38, 23], [40, 28], [37, 32], [32, 33], [27, 32], [24, 28]], PW, { out: false, grain: .1, soft: 8, bias: .12 });
  h.stamp(29, 23, ".kkkk.\nkKKkkk\n.kkkk.\n..kk..", { k: "#101014", K: "#4a4a55" });
  const kind = { happy: "open", delighted: "grin", yawn: "yawn", lifted: "o" }[pose];
  if (kind) say(h, kind, 32, 27, "#2a2628"); else if (tired) h.stamp(28, 28, FLAT, { k: "#2a2628" }); else h.stamp(27, 27, "....kk....\nk...kk...k\n.kkk..kkk.", { k: "#2a2628" });
  if (SHUT.has(pose)) { lidded(h, 20, 19, pose, "#d8d2c8"); lidded(h, 38, 19, pose, "#d8d2c8"); }
  return [h, [22, 39].map(x => eye(x, 18, 4, 4, { pupil: "#020203", highlight: true, shine: "#ffffff", lid: PK[3], line: "#d8d2c8" }))];
}
function panda(pose) {
  const body = new Layer(), asleep = pose === "sleep", step = pose === "walkA" ? 1 : pose === "walkB" ? -1 : 0;
  let left = null, right = null;
  const walk = pose.startsWith("walk");
  if (walk) {
    // On all fours, shoulders high, rolling from side to side.
    const s = step * 4;
    for (const [x, d] of [[14, -s], [37, s]]) limb(body, [[x + 3, 46], [x + 3 + d, 57]], 5, PK, { grain: .2, soft: 5, bias: -.1 });
    const b = part(body, [[4, 42], [7, 33], [16, 28], [28, 26], [41, 27], [50, 33], [52, 43], [48, 52], [30, 55], [12, 54], [5, 49]], PW, { grain: .22, dir: [.9, .4], soft: 13 });
    inside(body, b, [[33, 20], [47, 22], [54, 36], [50, 58], [35, 58], [32, 40]], PK, { grain: .25, soft: 9 });
    part(body, [[2, 40], [5, 36.5], [8.5, 39], [7, 43.5], [3, 44]], PW, { soft: 4 });
    [left, right] = [[5, s], [38, -s]].map(([x, d]) => { const l = new Layer(); limb(l, [[x + 6, 45], [x + 6 + d, 56.3]], 5.6, PK, { grain: .25, soft: 6 }); return l; });
  } else if (asleep) {
    bed(body);
    const b = part(body, [[8, 43.5], [20, 36.5], [44, 35.5], [57, 40.5], [61, 49.5], [56, 57], [12, 57], [5, 51.5]], PW, { grain: .22, soft: 11 });
    inside(body, b, [[26, 36], [38, 36], [41, 64], [27, 64]], PK, { grain: .25, soft: 8 });
    left = new Layer(); part(left, [[42, 49.5], [50, 47.5], [58, 50.5], [59, 55.5], [46, 57], [41, 54.5]], PK, { grain: .2, soft: 6 });
  } else {
    const b = part(body, [[20, 27], [32, 25], [44, 27], [53, 36], [57, 47], [54, 57], [44, 61], [20, 61], [10, 57], [7, 47], [11, 36]], PW, { grain: .22, soft: 12 });
    inside(body, b, [[8, 22], [56, 22], [57, 36], [47, 38], [32, 36.5], [17, 38], [7, 36]], PK, { grain: .25, soft: 10 });
    both.forEach((f, i) => {
      const dy = pose === "lifted" ? 1 : step === (i ? -1 : 1) ? -3 : 0, o = p => f(p.map(([x, y]) => [x, y + dy]));
      part(body, o([[8, 50], [17, 48], [25, 52], [26, 58], [21, 61.5], [9, 61.5], [4, 57]]), PK, { grain: .25, soft: 8 });
      part(body, o([[9.5, 53.5], [14, 52], [18, 55], [17, 59], [11, 60], [8, 57]]), ["#1b1b20", "#4b4644", "#5d5654", "#6f6662"], { out: false, soft: 5 });
    });
    const points = reach(pose);
    [left, right] = both.map((f, i) => {
      if (points[i]) return paw(points[i], 5.4, PK);
      const l = new Layer(); part(l, f([[13, 30], [20, 31], [24, 38], [25, 46], [21, 51], [14, 51], [8, 47], [7, 39]]), PK, { grain: .25, soft: 9 }); return l;
    });
  }
  const [head, raw] = pandaHead(pose), eyes = settle(head, raw, pose, C, walk ? [11, 7 + (step < 0 ? -1 : 0)] : asleep ? [-9, 20] : headMove(pose));
  const prop = pose === "music" ? headphones(13, 51, 4, 20, "#d9614c") : propFor(pose, C, 43);
  return { body, head, leftPaw: left, rightPaw: right, prop, eyes };
}
/** Five segments, eaten from the top. The leaves go first. */
function bamboo(energy, pose) {
  if (pose.startsWith("walk")) {
    // Carried along its back.
    const l = new Layer(), G = ["#2d4a22", "#4b7a35", "#679a45", "#85b85a", "#a8d278"];
    limb(l, [[4, 27], [4 + energy * 6, 25]], 2.4, G, { grain: .05, soft: 4 });
    for (let i = 1; i < energy; i++) line(l, 4 + i * 6, 24, 4 + i * 6, 29, G[0]);
    return l;
  }
  const l = new Layer(), G = ["#2d4a22", "#4b7a35", "#679a45", "#85b85a", "#a8d278"], top = 61 - energy * 11.4;
  limb(l, [[58, top + 2], [58, 60]], 2.6, G, { grain: .05, soft: 4 });
  for (let i = 0; i < energy; i++) { const y = Math.round(61 - i * 11.4) - 1; if (i) { line(l, 55, y, 60, y, G[0]); line(l, 55, y - 1, 60, y - 1, G[4]); } }
  if (energy === 5) for (const p of [[[57, 5], [52, 1], [47, 2], [52, 5]], [[59, 5], [61, 1], [63.5, 2], [62, 6]], [[57, 13], [53, 10], [51, 12], [54, 14.5]]]) part(l, p, G, { sharp: [1, 2], soft: 3 });
  else { const y = Math.round(top); l.set(56, y, G[3]).set(58, y - 1, G[3]).set(60, y, G[3]); line(l, 56, y + 1, 60, y + 1, "#e4efc4"); }
  return l;
}

/* ---- cat: the pupils are the clock, slits to full moons ---- */
const CB = ["#0c0b10", "#19181e", "#25242c", "#33323c", "#474652"], CW = ["#8d8a8e", "#c9c4c0", "#e6e2da", "#f6f3ec", "#fffdf8"], CY = "#cfc95f";
function catHead(pose) {
  const h = new Layer(), pink = ["#5c3a3d", "#7c4c4f", "#a76a69", "#c98c86"];
  for (const f of both) { const e = part(h, f([[13, 19], [12.5, 4], [25, 10]]), CB, { sharp: [0, 1, 2], soft: 5 }); inside(h, e, f([[15.5, 16], [15, 8], [21, 11.5]]), pink, { sharp: [0, 1, 2] }); }
  const m = part(h, [[22, 10], [32, 9], [42, 10], [49, 16], [51, 23], [48, 30], [41, 34], [32, 35.5], [23, 34], [16, 30], [13, 23], [15, 16]], CB, { grain: .22, soft: 12 });
  inside(h, m, [[32, 11], [34.5, 21], [41, 25], [43, 30], [38, 35], [32, 36.5], [26, 35], [21, 30], [23, 25], [29.5, 21]], CW, { sharp: [0], grain: .12, soft: 8 });
  h.stamp(30, 25, "pPPp\n.pp.", { p: "#b8706f", P: "#e0a09a" });
  const kind = { happy: "open", delighted: "grin", yawn: "yawn", lifted: "o" }[pose];
  if (kind) say(h, kind, 32, 28, "#5b3f44"); else if (tired) h.stamp(28, 29, FLAT, { k: "#5b5354" }); else h.stamp(28, 27, "...kk...\nk..kk..k\n.kk..kk.", { k: "#5b5354" });
  for (const [y, d] of [[26, -1], [28, 0], [30, 1]]) { line(h, 20, y, 11, y + d, "#d8d4d0"); line(h, 43, y, 52, y + d, "#d8d4d0"); }
  for (const x of [19, 37]) {
    if (SHUT.has(pose)) lidded(h, x + 1, 19, pose, CY);
    else h.stamp(x - 1, 16, "...dddd...\n..dyyyyd..\n.dyyyyyyd.\ndyyyyyyyyd\ndyyyyyyyyd\n.dyyyyyyd.\n..dyyyyd..\n...dddd...", { d: CB[0], y: CY });
  }
  // A slit when rested; all pupil when worn out.
  const inner = e => ({ 5: { x: 3, y: 0, width: 2, height: 6 }, 4: { x: 3, y: 0, width: 3, height: 6 }, 3: { x: 2, y: 0, width: 4, height: 6 }, 2: { x: 2, y: 0, width: 5, height: 6 }, 1: { x: 1, y: 0, width: 6, height: 6 } }[e]);
  return [h, [19, 37].map((x, i) => eye(x, 17, 8, 6, { inner: inner(5), byEnergy: ENERGIES.map(e => { const p = inner(e); return p.width % 2 && i ? { ...p, x: 8 - p.x - p.width } : p; }), pupil: "#08070b", sclera: CY, highlight: true, shine: "#ffffff", lid: CB[3], line: CY }))];
}
function cat(pose) {
  const body = new Layer(), asleep = pose === "sleep", step = pose === "walkA" ? 1 : pose === "walkB" ? -1 : 0;
  let left = null, right = null;
  const walk = pose.startsWith("walk");
  if (walk) {
    const s = step * 4;
    limb(body, [[9, 41], [3.5, 36], [3, 27], [6, 20]], 2.7, CB, { soft: 4 });
    for (const [x, d] of [[15, -s], [38, s]]) limb(body, [[x + 2, 46], [x + 2 + d, 58]], 3.4, CB, { grain: .2, soft: 5, bias: -.12 });
    const b = part(body, [[6, 41], [9, 34], [18, 31], [32, 30], [43, 31], [50, 36], [51, 44], [46, 51], [30, 53], [13, 52], [7, 48]], CB, { grain: .25, dir: [.9, .4], soft: 12 });
    inside(body, b, [[38, 34], [52, 36], [53, 48], [44, 55], [38, 48]], CW, { grain: .3, soft: 7 });
    [left, right] = [[7, s], [39, -s]].map(([x, d]) => {
      const l = new Layer(), m = limb(l, [[x + 5, 46], [x + 5 + d, 57.6]], 4.1, CB, { grain: .2, soft: 6 });
      inside(l, m, [[x - 8, 55], [x + 20, 55], [x + 20, 63], [x - 8, 63]], CW, { sharp: [0, 1, 2, 3], grain: .1, soft: 5 }); return l;
    });
  } else if (asleep) {
    bed(body);
    part(body, [[8, 43.5], [20, 37.5], [44, 35.5], [57, 40.5], [61, 49.5], [56, 57], [12, 57], [5, 51.5]], CB, { grain: .25, soft: 11 });
    left = new Layer(); const t = limb(left, [[59, 46.5], [57, 53.5], [40, 54.5]], 3, CB, { soft: 4 }); inside(left, t, [[34, 49], [44, 49], [44, 60], [34, 60]], CW, { sharp: [0, 1, 2, 3] });
  } else {
    part(body, pose === "lifted" ? [[46, 49], [53, 52], [55, 58], [51, 61.5], [45, 60], [42, 54]] : [[46, 49], [55, 50], [61, 54], [60, 60], [50, 61.5], [38, 61.5], [38, 56]], CB, { grain: .25, soft: 6 });
    const b = part(body, [[21, 28], [32, 26], [43, 28], [48, 38], [53, 47], [54, 55], [50, 61], [14, 61], [10, 55], [11, 47], [16, 38]], CB, { grain: .25, soft: 13 });
    for (const f of both) part(body, f([[11, 45], [17, 43], [22, 48], [23, 56], [20, 61], [12, 61], [9, 54]]), CB, { grain: .25, soft: 8 });
    inside(body, b, [[23, 29], [41, 29], [43, 37], [39, 47], [32, 52], [25, 47], [21, 37]], CW, { grain: .35, soft: 8 });
    const points = reach(pose);
    [left, right] = [20, 32.5].map((x, i) => {
      if (points[i]) return paw(points[i], 4.4, CB, CW);
      const l = new Layer(), up = step === (i ? -1 : 1) ? -3 : 0;
      const m = part(l, [[x, 42], [x + 11, 42], [x + 11.5, 50], [x + 12, 58], [x + 9, 61.5], [x + 2, 61.5], [x - .5, 58], [x - .3, 50]].map(([a, b]) => [a, b + (b > 45 ? up : 0)]), CB, { grain: .2, soft: 7 });
      inside(l, m, [[x - 2, 53 + up], [x + 14, 53 + up], [x + 14, 63], [x - 2, 63]], CW, { sharp: [0, 1, 2, 3], grain: .1, soft: 6, bias: .06 });
      for (const d of [3.5, 7.5]) { const X = Math.round(x + d); l.set(X, 59 + up, CW[0]).set(X, 60 + up, CW[0]); }
      return l;
    });
    if (points[0] || points[1]) for (const f of both) part(body, f([[14, 56], [20, 54], [26, 57], [26, 61.5], [14, 61.5]]), CW, { soft: 5, grain: .1 });
  }
  const [head, raw] = catHead(pose), eyes = settle(head, raw, pose, C, walk ? [10, 8 + (step < 0 ? -1 : 0)] : asleep ? [-9, 20] : headMove(pose));
  const prop = pose === "music" ? headphones(14, 50, 7, 21, "#d8b24a") : propFor(pose, C, 43);
  return { body, head, leftPaw: left, rightPaw: right, prop, eyes };
}

/* ---- capybara: a tower of yuzu, one lost for every stretch you skip a break ---- */
const CF = ["#352012", "#58391f", "#76502f", "#93683e", "#b18656"], CD = ["#1f120b", "#33200f", "#4a301b", "#5f4128", "#755337"];
function capybara(pose) {
  const body = new Layer(), head = new Layer(), asleep = pose === "sleep", s = pose === "walkA" ? 4 : pose === "walkB" ? -4 : 0, drop = asleep ? 2 : pose === "lifted" ? -3 : 0;
  const sh = p => p.map(([x, y]) => [x, Math.min(asleep ? 57 : 61.5, y + drop)]);
  if (asleep) bed(body);
  if (!asleep) for (const x of [17 - s, 41 + s]) part(body, sh([[x, 50], [x + 8, 50], [x + 8, 57], [x + 9, 61.5], [x - 1, 61.5], [x, 56]]), CD, { soft: 5 });
  part(body, sh([[2.5, 46], [5, 37], [12, 31], [22, 28], [34, 28], [45, 30], [51, 38], [51, 49], [45, 55], [32, 57.5], [16, 57], [7, 54]]), CF, { grain: .3, dir: [.95, .3], soft: 15 });
  const leg = (pts, hoof) => { const l = new Layer(); part(l, pts, CF, { grain: .35, soft: 8, out: false }); const b = l.bounds(); if (b && hoof) for (let x = b.x; x < b.x + b.width; x++) { if (l.get(x, 61)) l.set(x, 61, CD[0]); if (l.get(x, 60) && (x - b.x) % 4 !== 3) l.set(x, 60, CD[2]); } return l; };
  let left = null, right = null;
  if (asleep) { left = new Layer(); part(left, [[42, 53], [50, 52], [56, 54], [56, 57.5], [42, 57.5]], CD, { soft: 4 }); }
  else {
    left = leg(sh([[4, 47], [10, 43], [17, 47], [18 + s / 2, 54], [14.5 + s, 61.5], [4 + s, 61.5], [4 + s / 2, 55]]), pose !== "lifted");
    // A front foot comes up, the way they step out of the water.
    if (pose === "delighted") right = leg([[35, 46], [43, 45], [47, 49], [52, 53], [53, 57], [48, 58.5], [43, 56], [37, 54]], false);
    else if (pose === "groom") right = leg([[35, 46], [43, 45], [49, 46], [55, 44], [57, 48], [52, 52], [44, 54], [37, 54]], false);
    else if (pose === "focus" || pose === "read" || pose === "play") right = paw([[34, 46], [35, 53]], 4.6, CF, CD);
    else right = leg(sh([[35, 46], [43, 45], [46, 52], [46 - s / 2, 57], [46 - s, 61.5], [35 - s, 61.5], [35 - s / 2, 56]]), pose !== "lifted");
  }
  part(head, [[33, 22], [33, 17], [36, 14], [40, 15.5], [40.5, 20], [37, 23]], CD, { soft: 4 });
  const h = part(head, [[33, 24], [38, 19], [46, 17.5], [54, 19], [60, 22], [62.5, 28], [62.5, 36], [59, 41], [51, 43.5], [42, 44], [35, 42], [31, 34]], CF, { grain: .25, dir: [.95, .3], soft: 13 });
  part(head, [[42, 19.5], [42, 15.5], [45, 13.5], [48, 15.5], [47.5, 19]], CD, { soft: 4 });
  inside(head, h, [[56, 20], [63, 23], [64, 38], [58, 43], [54, 39], [54, 27]], CD, { grain: .2, soft: 8, bias: .1 });
  head.stamp(59, 26, "kk.\n.kk", { k: "#0d0704" });
  const kind = { delighted: "grin", yawn: "yawn", lifted: "o" }[pose];
  if (kind) say(head, kind, 55, 36, "#1f120b");
  else if (tired) { line(head, 50, 38, 60, 39, "#1f120b"); line(head, 49, 40, 50, 39, "#1f120b"); }
  else { line(head, 50, 39, 60, 38, "#1f120b"); line(head, 49, pose === "happy" ? 36 : 38, 50, 39, "#1f120b"); if (pose === "happy") head.set(48, 35, "#1f120b"); }
  [[53, 34], [55, 35], [52, 36]].forEach(([x, y]) => head.set(x, y, CD[1]));
  if (SHUT.has(pose)) lidded(head, 42, 26, pose, "#1a0e08"); else if (pose !== "lifted") line(head, 41, 24, 46, 23, CF[1]);
  const dy = headMove(pose)[1];
  const eyes = settle(head, [eye(42, 25, 6, 4, { pupil: "#0f0805", highlight: true, shine: "#ffffff", lid: CF[3], line: "#1a0e08" })], pose === "curious" || pose === "groom" ? "idle" : pose, 46, asleep ? [0, 13] : [0, pose === "stretch" ? -5 : pose === "delighted" ? -3 : dy + (pose === "lifted" ? -1 : 0)]);
  const prop = pose === "music" ? new Layer().limb([[38, 16], [43, 12], [49, 16]], 1.3, PROPS.pad).oval(37, 25, 4, 6, "#7fa07a", 2.6).outline(PROPS.ink) : propFor(pose, 48, 45);
  return { body, head, leftPaw: left, rightPaw: right, prop, eyes };
}
function yuzu(energy, pose) {
  const l = new Layer(), Y = ["#8a5310", "#c9811c", "#e79f2b", "#f6bb45", "#fddd86"], base = (pose === "sleep" ? 2 : pose === "lifted" ? -2 : 0) + 25.5;
  for (let i = 0; i < energy; i++) {
    const cx = 18.5 + [0, 1, -1, 1, 0][i], cy = base - i * 5.3, r = 4.5 - i * .2;
    form(l, Uint8Array.from(new Layer().oval(cx, cy, r, r * .9, 1).px, v => v ? 1 : 0), Y, { grain: .08, soft: 5 });
    if (i === energy - 1) { l.set(Math.round(cx), Math.round(cy - r * .8), "#4b7a35").set(Math.round(cx) + 1, Math.round(cy - r * .8) - 1, "#679a45").set(Math.round(cx) + 2, Math.round(cy - r * .8) - 1, "#679a45"); }
  }
  return l;
}

/* ---- crab: the claw grows until it can barely lift it ---- */
const XR = ["#4a110c", "#86221a", "#b23a22", "#d2552e", "#ec8050"], XP = ["#8f4a2c", "#c98355", "#e3a979", "#f2c9a0", "#fbe3c6"];
/** `s` is the side; `k` the size; (px, py) where the wrist is; `down` droops it. */
function claw(s, k, px, py, down = false) {
  const l = new Layer(), g = p => p.map(([x, y]) => [px + s * (x - 22) * k, py + (down ? -1 : 1) * (y - 31) * k]);
  limb(l, [[32 + s * 17, 39], [32 + s * 24, 37], [px, py + 1]], 3.6, XR, { soft: 5 });
  part(l, g([[16, 21], [14, 14], [15, 8], [19, 5], [20, 11], [22, 18]]), XR, { sharp: [3], soft: 5 });
  part(l, g([[23, 19], [24.5, 13], [24, 7], [28, 10], [30, 16], [29, 22]]), XR, { sharp: [2], soft: 5 });
  const m = part(l, g([[15, 28], [15, 21], [19, 17], [25, 18], [29, 23], [29, 29], [25, 33], [18, 33]]), XR, { grain: .18, soft: 10 });
  inside(l, m, g([[18, 29], [25, 29], [26, 34], [18, 34.5]]), XP, { soft: 4 });
  return l;
}
const wrist = pose => ({ delighted: [23, 27], stretch: [23, 24], lifted: [22, 38], sleep: [22, 45], focus: [22, 44], read: [22, 42], play: [21, 44], groom: [22, 32], yawn: [22, 30], walkA: [22, 33], walkB: [22, 30] }[pose] ?? [22, 31]);
function crab(pose) {
  const body = new Layer(), head = new Layer(), asleep = pose === "sleep", drop = asleep ? 2 : pose === "lifted" ? -3 : 0, step = pose === "walkA" ? 1 : pose === "walkB" ? -1 : 0;
  if (asleep) bed(body); else
  for (const s of [-1, 1]) [[13, 43, 25, 45, 29, 59], [12, 46, 21, 51, 24, 61], [10, 49, 15, 55, 17, 62]].forEach(([a, b, c, d, e, f], i) => {
    const X = v => C + s * v, up = step && (i + (s > 0 ? 1 : 0)) % 2 === (step > 0 ? 0 : 1) ? -3 : 0, end = Math.min(61, f + up - (pose === "lifted" ? 1 : 0));
    const seg = (x1, y1, x2, y2, w1, w2) => { const A = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2, co = Math.cos(A), si = Math.sin(A); part(body, [[x1 + co * w1, y1 + si * w1], [x2 + co * w2, y2 + si * w2], [x2 - co * w2, y2 - si * w2], [x1 - co * w1, y1 - si * w1]], XR, { sharp: [0, 1, 2, 3], grain: .1, soft: 4 }); };
    seg(X(c), d + up, X(e - (pose === "lifted" ? 6 : 0)), end, 2.6, .8); seg(X(a), b + drop / 2, X(c), d + up, 3.2, 2.8);
  });
  const sh = p => p.map(([x, y]) => [x, Math.min(asleep ? 57 : 61.5, y + drop)]);
  const b = part(body, sh([[9, 36], [14, 30], [22, 27], [32, 26], [42, 27], [50, 30], [55, 36], [53, 44], [46, 51], [32, 54], [18, 51], [11, 44]]), XR, { grain: .22, soft: 13 });
  inside(body, b, sh([[17, 47], [32, 49.5], [47, 47], [46, 53], [32, 56], [18, 53]]), XP, { bias: -.08, soft: 7 });
  for (const [x, y] of [[11, 34], [14, 31], [18, 29], [46, 29], [50, 31], [53, 34]]) body.set(x, y + drop, XR[4]);
  for (const [x, y] of [[23, 32], [25, 33], [41, 32], [39, 33], [28, 30], [36, 30], [18, 38], [46, 38]]) body.set(x, y + drop, XR[2]);
  const kind = { happy: "open", delighted: "grin", yawn: "yawn", lifted: "o" }[pose];
  if (kind) say(body, kind, 32, 40 + drop, XR[0]); else if (tired) body.stamp(28, 43 + drop, FLAT, { k: XR[0] }); else { line(body, 28, 43 + drop, 29, 44 + drop, XR[0]); line(body, 29, 44 + drop, 35, 44 + drop, XR[0]); line(body, 35, 44 + drop, 36, 43 + drop, XR[0]); }
  const tilt = pose === "curious" ? 3 : 0, eyes = [26, 36].map((x, i) => {
    const top = 18 + drop + (asleep ? 3 : 0) + (i ? -tilt : tilt);
    part(head, [[x, 29 + drop], [x, top + 3], [x + 3, top + 3], [x + 3, 29 + drop]], XR, { soft: 3 });
    const ball = XR[2]; head.stamp(x - 1, top, ".kkkk.\nkkkkkk\nkkkkkk\nkkkkkk\n.kkkk.", { k: ball });
    if (SHUT.has(pose)) lidded(head, x - 1, top + 2, pose, XR[0]);
    return eye(x - 1, top, 6, 5, { pupil: "#0f0809", highlight: true, shine: "#ffffff", lid: ball, line: XR[0] });
  });
  const [dx, dy] = wrist(pose), prop = pose === "music" ? headphones(22, 42, 11, 20, "#4f7a8c") : propFor(pose, C, 45);
  return { body, head, leftPaw: claw(-1, pose === "groom" ? .85 : .8, C - dx, dy, ["sleep", "lifted"].includes(pose)), rightPaw: null, prop, eyes };
}
const bigClaw = (energy, pose) => {
  const [dx, dy] = wrist(pose), heavy = energy === 1 && ["idle", "blink", "curious", "happy"].includes(pose) ? 4 : ["stretch", "delighted"].includes(pose) ? (5 - energy) * 2 : 0;
  return claw(1, [1.3, 1.18, 1.05, .92, .8][energy - 1], C + dx - (1 - (energy - 1) / 4) * 2.5, dy + heavy, ["sleep", "lifted"].includes(pose));
};

export const PETS = ["crab", "panda", "cat", "capybara"];
const DRAW = { crab, panda, cat, capybara };
/** Where each feature belongs in the stack. The cat's is in its eyes. */
export const FEATURE = { crab: "rightPaw", panda: "behind", cat: null, capybara: "behind" };
const FEATURES = { crab: bigClaw, panda: bamboo, capybara: yuzu };
const LIFT = -2;
export function drawPet(pet, pose, worn = false) {
  tired = worn;
  const d = DRAW[pet](pose), features = ENERGIES.map(e => FEATURES[pet] && !worn ? FEATURES[pet](e, pose) : null);
  tired = false;
  for (const l of [d.body, d.head, d.leftPaw, d.rightPaw, d.prop, ...features]) l?.shift(0, LIFT);
  return { ...d, features, eyes: d.eyes.map(e => ({ ...e, y: e.y + LIFT })) };
}
export const eyesShut = (pet, pose) => SHUT.has(pose);
/** Scowls need somewhere to sit even when the eyes are shut. */
export const keepsBrows = pose => pose === "stretch" || pose === "yawn";
/** The whole animal on one layer, for stills. */
export function whole(pet, pose, energy = 5) {
  const d = drawPet(pet, pose), l = new Layer(), f = d.features[energy - 1];
  if (FEATURE[pet] === "behind" && f) l.over(f);
  l.over(d.body).over(d.head);
  if (!eyesShut(pet, pose)) for (const e of d.eyes) {
    const i = e.byEnergy?.[energy - 1] ?? e.inner, p = i ? { x: e.x + i.x, y: e.y + i.y, width: i.width, height: i.height } : e;
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.width < 4 || p.height < 4 || !((x === 0 || x === p.width - 1) && (y === 0 || y === p.height - 1))) l.set(p.x + x, p.y + y, e.pupil);
    if (e.highlight) for (let x = 0; x < (p.width > 4 ? 2 : 1); x++) l.set(p.x + Math.min(p.width - 1, 1) + x, p.y + 1, e.shine);
  }
  for (const part of [d.prop, d.leftPaw, d.rightPaw, FEATURE[pet] === "rightPaw" ? f : null]) if (part) l.over(part);
  return l;
}

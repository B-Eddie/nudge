import type { PetMotionFrame, PixelOffset } from "./petMotion";
import type { EyeAnchor, PetRect, PetRig } from "./petRig";
import type { Tween } from "./petTransition";
import { WORN, type WornPlace } from "./accessoryArt";
import type { GearId } from "./accessoryArt";

/** Everything is drawn on one grid and enlarged whole, so no pixel is ever split. */
export const LOGICAL_SIZE = 80;
/** Where the 64×64 the pet is drawn in sits on that grid: the rest is headroom for stretching. */
export const INSET = { x: 8, y: 14, size: 64 };
const N = LOGICAL_SIZE;

type Rgba = readonly [number, number, number, number];
export const PART_NAMES = ["body", "head", "leftPaw", "rightPaw", "prop", "feature1", "feature2", "feature3", "feature4", "feature5", "tiredBody", "tiredHead"] as const;
/** One 80×80 RGBA raster per part. Each is complete underneath the parts in front of it. */
export type SpriteParts = Record<(typeof PART_NAMES)[number], Uint8ClampedArray>;
export interface SpriteLayers { rig: PetRig; parts: SpriteParts }

const inside = (x: number, y: number, rect: PetRect) =>
  x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
const bounded = (value: number, limit: number) => Number.isFinite(value) ? Math.max(-limit, Math.min(limit, Math.round(value))) : 0;
const color = (hex: string): Rgba => {
  const value = hex.replace("#", "");
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16), 255];
};

export function prepareSpritePixels(parts: SpriteParts, rig: PetRig): SpriteLayers {
  if (PART_NAMES.some(name => parts[name].length !== N * N * 4)) throw new Error("Pet artwork must be 80×80 RGBA rasters");
  return { rig, parts };
}

function paint(output: Uint8ClampedArray, x: number, y: number, rgba: Rgba) {
  if (x >= 0 && y >= 0 && x < N && y < N && rgba[3]) output.set(rgba, (y * N + x) * 4);
}
function draw(output: Uint8ClampedArray, part: Uint8ClampedArray, offset: PixelOffset) {
  for (let i = 0; i < N * N; i++) {
    if (part[i * 4 + 3]) paint(output, i % N + offset.x, Math.floor(i / N) + offset.y, [part[i * 4], part[i * 4 + 1], part[i * 4 + 2], part[i * 4 + 3]]);
  }
}

function drawEye(output: Uint8ClampedArray, head: Uint8ClampedArray, eye: EyeAnchor, offset: PixelOffset, gaze: PixelOffset, blink: boolean, energy: number) {
  const { bounds } = eye, pupil = eye.byEnergy?.[energy - 1] ?? eye.pupil;
  if (!blink) {
    const dx = offset.x + bounded(gaze.x, 1), dy = offset.y + bounded(gaze.y, 1);
    const ink = color(eye.color);
    for (let y = 0; y < pupil.height; y++) for (let x = 0; x < pupil.width; x++) {
      // Round off a pupil big enough to have corners.
      if (pupil.width >= 4 && pupil.height >= 4 && (x === 0 || x === pupil.width - 1) && (y === 0 || y === pupil.height - 1)) continue;
      const tx = pupil.x + x + dx, ty = pupil.y + y + dy;
      // A pupil never leaves the white of its eye.
      if (!eye.sclera || inside(tx - offset.x, ty - offset.y, bounds)) paint(output, tx, ty, ink);
    }
    if (eye.shine) for (let x = 0; x < (pupil.width > 4 ? 2 : 1); x++) paint(output, pupil.x + Math.min(1, pupil.width - 1) + x + dx, pupil.y + 1 + dy, color(eye.shine));
    return;
  }
  const lid = color(eye.lid), line = color(eye.line);
  if (eye.sclera) {
    const white = color(eye.sclera);
    for (let y = bounds.y; y < bounds.y + bounds.height; y++) for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      const i = (y * N + x) * 4;
      if (head[i + 3] && head[i] === white[0] && head[i + 1] === white[1] && head[i + 2] === white[2]) paint(output, x + offset.x, y + offset.y, lid);
    }
  }
  const middle = bounds.x + (bounds.width - 1) / 2, y = bounds.y + Math.floor(bounds.height / 2);
  for (let i = 0; i < 4; i++) paint(output, Math.round(middle - 1.5) + i + offset.x, y - (i % 3 ? 0 : 1) + offset.y, line);
}

function propDetail(output: Uint8ClampedArray, part: Uint8ClampedArray, rect: PetRect, offset: PixelOffset, motion: PetMotionFrame) {
  const lighten = (x: number, y: number, by: number) => {
    const i = (y * N + x) * 4;
    if (!inside(x, y, rect) || !part[i + 3]) return;
    paint(output, x + offset.x, y + offset.y, [Math.min(255, part[i] + by), Math.min(255, part[i + 1] + by), Math.min(255, part[i + 2] + by), 255]);
  };
  if (motion.pageTurn) {
    const center = rect.x + Math.floor(rect.width / 2);
    for (let y = rect.y + 2; y < rect.y + rect.height - 2; y++) lighten(center + Math.floor((y - rect.y) / 5), y, 34);
  }
  if (motion.screenPulse) for (let x = rect.x + 2; x < Math.min(rect.x + rect.width - 2, rect.x + 6); x++) lighten(x, rect.y + Math.min(3, Math.floor(rect.height / 3)), 26);
}

function drawPhone(output: Uint8ClampedArray, offset: PixelOffset, screenPulse: boolean) {
  const x = INSET.x + 39 + offset.x, y = INSET.y + 38 + offset.y;
  for (let py = 0; py < 15; py++) for (let px = 0; px < 9; px++) {
    if ((py === 0 || py === 14) && (px === 0 || px === 8)) continue;
    const screen = px >= 2 && px <= 6 && py >= 2 && py <= 10;
    paint(output, x + px, y + py, screen ? [164, 197, 177, 255] : [59, 57, 68, 255]);
  }
  const shift = screenPulse ? 1 : 0;
  for (let px = 0; px < 3; px++) paint(output, x + 3 + px, y + 4 + shift, [232, 223, 189, 255]);
  for (let px = 0; px < 2; px++) paint(output, x + 3 + px, y + 7 + shift, [232, 223, 189, 255]);
  paint(output, x + 4, y + 12, [194, 191, 200, 255]);
}

function drawPhoneGrip(output: Uint8ClampedArray, paw: Uint8ClampedArray, pawOffset: PixelOffset, phoneOffset: PixelOffset) {
  // Only a slim thumb or claw overlaps the case, so the screen stays readable.
  for (let y = INSET.y + 42 + phoneOffset.y; y < INSET.y + 47 + phoneOffset.y; y++) for (let x = INSET.x + 39 + phoneOffset.x; x < INSET.x + 41 + phoneOffset.x; x++) {
    const sx = x - pawOffset.x, sy = y - pawOffset.y;
    if (sx < 0 || sy < 0 || sx >= N || sy >= N) continue;
    const i = (sy * N + sx) * 4;
    paint(output, x, y, [paw[i], paw[i + 1], paw[i + 2], paw[i + 3]]);
  }
}

export interface Worn { id: GearId; place: WornPlace }

function drawWorn(output: Uint8ClampedArray, worn: Worn, offset: PixelOffset) {
  const { rows, palette } = WORN[worn.id];
  rows.forEach((row, y) => [...row].forEach((key, x) => {
    if (palette[key]) paint(output, worn.place.left + x + offset.x, worn.place.top + y + offset.y, color(palette[key]));
  }));
}

/** Furrowed brows: steep, heavy and pulled toward the middle of the face. Drawn over the
 * finished eyes, so a cross pet can still look around. */
function drawScowl(output: Uint8ClampedArray, rig: PetRig, offset: PixelOffset) {
  const centers = rig.brows.map(b => b.x + b.width / 2);
  // A pet seen side-on shows one eye and looks to the right.
  const middle = centers.length > 1 ? centers.reduce((a, b) => a + b, 0) / centers.length : Infinity;
  for (const b of rig.brows) {
    const inward = b.x + b.width / 2 < middle ? 1 : -1;
    const width = b.width + 3, outer = inward > 0 ? b.x - 2 : b.x + b.width + 1;
    for (let i = 0; i < width; i++) {
      const x = outer + i * inward + offset.x, y = b.y - 2 + Math.floor(i * 4 / width) + offset.y;
      // A pale edge keeps the brow readable on dark fur.
      const under = (y - 1) * N + x;
      if (under >= 0 && output[under * 4 + 3] && output[under * 4] + output[under * 4 + 1] + output[under * 4 + 2] < 240) {
        paint(output, x, y - 1, [198, 188, 178, 255]);
      }
      paint(output, x, y, [38, 22, 24, 255]);
      paint(output, x, y + 1, [38, 22, 24, 255]);
    }
  }
}

/** How far the head hangs at each energy, 1 to 5. */
const SINK = [3, 2, 1, 0, 0];
/** Rows of eyelid over an eye this tall, at each energy. */
const lidRows = (height: number, energy: number) => energy >= 4 ? 0 : energy === 3 ? Math.ceil(height * .25) : Math.ceil(height * .5);
const BLUE = color("#3f5fd0"), FUMES = color("#4fa35c"), CROSS = color("#5b2a2e");

/** The same signs of wear as the first drawings: heavy lids, bags, blue lines, then crosses. */
function drawWear(output: Uint8ClampedArray, skin: Uint8ClampedArray, rig: PetRig, offset: PixelOffset, energy: number, blink: boolean, pale: number) {
  if (energy >= 4) return;
  // Lids stay on the head, so a round eye never grows corners.
  const onHead = (x: number, y: number, rgba: Rgba) => { if (x >= 0 && y >= 0 && x < N && y < N && skin[(y * N + x) * 4 + 3]) paint(output, x + offset.x, y + offset.y, rgba); };
  for (const eye of rig.eyes) {
    const keepsTime = eye.byEnergy !== null, { bounds } = eye, lid = [...fade(new Uint8ClampedArray(color(eye.lid)), pale)] as unknown as Rgba;
    if (!blink && energy === 1 && !keepsTime) {
      const size = 5, left = Math.round(bounds.x + bounds.width / 2 - size / 2), top = Math.round(bounds.y + bounds.height / 2 - size / 2);
      const bright = (0.3 * lid[0] + .59 * lid[1] + .11 * lid[2]) < 60 ? color("#d9cfc6") : CROSS;
      for (let y = -1; y <= size; y++) for (let x = -1; x <= size; x++) if ((x >= 0 && x < size) || (y >= 0 && y < size)) onHead(left + x, top + y, lid);
      for (let i = 0; i < size; i++) { onHead(left + i, top + i, bright); onHead(left + size - 1 - i, top + i, bright); }
      continue;
    }
    if (!blink) {
      // A pet that tells the time with its eyes keeps more of them showing.
      const rows = keepsTime ? (energy <= 2 ? 1 : 0) : lidRows(bounds.height, energy);
      for (let y = 0; y < rows; y++) for (let x = 0; x < bounds.width; x++) onHead(bounds.x + x, bounds.y + y, lid);
      for (let x = 0; x < bounds.width; x++) if (rows && !keepsTime) onHead(bounds.x + x, bounds.y + rows - 1, [Math.round(lid[0] * .45), Math.round(lid[1] * .45), Math.round(lid[2] * .45), 255]);
    }
    // Bags.
    if (energy <= 2) for (let x = 1; x < bounds.width - 1; x++) {
      const px = bounds.x + x + offset.x, py = bounds.y + bounds.height + 1 + offset.y, i = (py * N + px) * 4;
      if (output[i + 3]) paint(output, px, py, [Math.round(output[i] * .62), Math.round(output[i + 1] * .58), Math.round(output[i + 2] * .7), 255]);
    }
  }
  if (energy > 2) return;
  // Blue lines down the brow.
  const lines = energy === 1 ? 4 : 3, small = rig.head.width < 24, left = small ? INSET.x + 26 : rig.head.x + Math.round(rig.head.width * .62);
  for (let n = 0; n < lines; n++) for (let y = 0, drawn = 0; y < 14 && drawn < (n % 2 ? 4 : 6); y++) {
    const px = left + n * 3 + offset.x, py = small ? rig.head.y + rig.head.height + 1 + y : rig.head.y + 3 + y + offset.y;
    if (py < 0 || py >= N || !output[(py * N + px) * 4 + 3]) continue;
    paint(output, px, py, BLUE); drawn++;
  }
  if (energy > 1) return;
  // Fumes, only where there's room around the pet.
  for (const [x, y] of [[2, 6], [1, 22], [60, 18], [61, 34], [20, 1], [44, 2], [3, 36]]) for (let i = 0; i < 4; i++) {
    const px = INSET.x + x + (i % 2), py = INSET.y + y + i;
    if (px < N && py < N && !output[(py * N + px) * 4 + 3]) paint(output, px, py, FUMES);
  }
}
/** Colour drains a little as the day wears on. */
function fade(output: Uint8ClampedArray, amount: number): Uint8ClampedArray {
  if (!amount) return output;
  for (let i = 0; i < output.length; i += 4) if (output[i + 3]) {
    const grey = output[i] * .3 + output[i + 1] * .59 + output[i + 2] * .11;
    for (let c = 0; c < 3; c++) output[i + c] = Math.round(output[i + c] + (grey - output[i + c]) * amount);
  }
  return output;
}

const FLOOR = INSET.y + 60;
/** Squashes or stretches the finished picture against the floor, whole pixels at a time. */
function squash(source: Uint8ClampedArray, stretch: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.length), wide = 1 + (1 - stretch) * .6;
  for (let y = 0; y < N; y++) {
    const sy = y > FLOOR ? y : Math.round(FLOOR - (FLOOR - y) / stretch);
    if (sy < 0) continue;
    for (let x = 0; x < N; x++) {
      const sx = Math.round((x - (N - 1) / 2) / wide + (N - 1) / 2);
      if (sx < 0 || sx >= N) continue;
      const from = (sy * N + sx) * 4;
      if (source[from + 3]) output.set(source.subarray(from, from + 4), (y * N + x) * 4);
    }
  }
  return output;
}
/** Leans a part sideways: nothing at the floor, `lean` pixels at the top. */
function leaned(part: Uint8ClampedArray, lean: number): Uint8ClampedArray {
  let low = N, high = -1;
  for (let i = 0; i < N * N; i++) if (part[i * 4 + 3]) { low = Math.min(low, i % N); high = Math.max(high, i % N); }
  // Never past the edge of the canvas.
  lean = Math.max(-low, Math.min(N - 1 - high, lean));
  if (Math.abs(lean) < .5) return part;
  const output = new Uint8ClampedArray(part.length);
  for (let i = 0; i < N * N; i++) if (part[i * 4 + 3]) {
    const y = Math.floor(i / N), x = i % N + Math.round(lean * Math.max(0, (INSET.y + 46 - y) / 46));
    if (x >= 0 && x < N) output.set(part.subarray(i * 4, i * 4 + 4), (y * N + x) * 4);
  }
  return output;
}

/** Power shows as burning eyes and a bright edge that won't sit still. */
function empower(output: Uint8ClampedArray, power: { power: string; glow: string }, beat: number) {
  const edge = color(power.power), hot = color(power.glow), before = output.slice();
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && before[(y * N + x) * 4 + 3] > 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (solid(x, y)) continue;
    const near = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
    if (near) paint(output, x, y, (x * 7 + y * 3 + beat) % 5 ? edge : hot);
    else if ((solid(x, y + 2) || solid(x, y + 3)) && (x * 13 + y + beat * 5) % 4 === 0) paint(output, x, y, edge);
  }
}
function empowerEyes(output: Uint8ClampedArray, rig: PetRig, head: PixelOffset, power: { power: string; glow: string }) {
  const edge = color(power.power), hot = color(power.glow);
  for (const b of rig.brows) for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
    const cx = (x - (b.width - 1) / 2) / (b.width / 2), cy = (y - (b.height - 1) / 2) / (b.height / 2);
    if (cx * cx + cy * cy <= 1.05) paint(output, b.x + x + head.x, b.y + y + head.y, cx * cx + cy * cy < .3 ? hot : edge);
  }
}

export interface Life { tween?: Tween | null; stretch?: number; sway?: number; power?: { power: string; glow: string } | null; beat?: number }

export function renderSpritePixels(layers: SpriteLayers, motion: PetMotionFrame,
  gaze: PixelOffset, phone = false, worn: Worn | null = null, mad = false, energy = 5, life: Life = {}): Uint8ClampedArray {
  const { parts, rig } = layers;
  // Asleep is the cure, so it doesn't show the symptoms.
  const resting = rig.asleep;
  const output = new Uint8ClampedArray(N * N * 4);
  const body = { x: bounded(motion.body.x, 1), y: bounded(motion.body.y, 1) };
  const awake = !motion.blink && rig.eyes.length > 0;
  const head = {
    x: body.x + bounded(motion.head.x + (awake ? bounded(gaze.x, 1) : 0), rig.maxHeadOffset),
    y: body.y + bounded(motion.head.y + (awake ? bounded(gaze.y, 1) : 0), rig.maxHeadOffset),
  };
  const attached = (offset: PixelOffset, maximum = 2) => ({
    x: body.x + bounded(offset.x, maximum), y: body.y + bounded(offset.y, maximum),
  });
  const { tween } = life;
  const moved = (offset: PixelOffset, by: PixelOffset | undefined) => by ? { x: offset.x + by.x, y: offset.y + by.y } : offset;
  Object.assign(head, moved(head, tween?.head));
  const prop = moved(attached(motion.prop, 1), tween?.prop);
  const leftPaw = moved(attached(motion.leftPaw, rig.maxPawOffset), tween?.leftPaw);
  const rightPaw = moved(attached(motion.rightPaw, rig.maxPawOffset), tween?.rightPaw);
  const level = Math.max(1, Math.min(5, Math.round(energy) || 5));
  const feature = parts[`feature${level as 1 | 2 | 3 | 4 | 5}`];
  const spent = level <= 2 && !resting;
  if (!resting) head.y += SINK[level - 1];
  draw(output, spent ? parts.tiredBody : parts.body, body);
  draw(output, spent ? parts.tiredHead : parts.head, head);
  for (const eye of rig.eyes) drawEye(output, parts.head, eye, head, gaze, motion.blink, level);
  const pale = resting || level > 2 ? 0 : level === 1 ? .4 : .2;
  fade(output, pale);
  if (rig.feature === "behind") {
    // The timer itself never fades: it slides in behind what's already drawn.
    const timer = new Uint8ClampedArray(N * N * 4);
    draw(timer, leaned(feature, life.sway ?? 0), body);
    for (let i = 0; i < timer.length; i += 4) if (timer[i + 3] && !output[i + 3]) output.set(timer.subarray(i, i + 4), i);
  }
  if (!resting) drawWear(output, spent ? parts.tiredHead : parts.head, rig, head, level, motion.blink, pale);
  if (mad) drawScowl(output, rig, head);
  if (life.power && rig.brows.length) empowerEyes(output, rig, head, life.power);
  // Hats sit over the head but under paws and props, so a raised paw stays in front.
  const neckwear = worn && WORN[worn.id].at === "neck";
  if (worn && !neckwear) drawWorn(output, worn, head);
  draw(output, parts.prop, prop);
  if (rig.prop) propDetail(output, parts.prop, rig.prop, prop, motion);
  draw(output, fade(parts.leftPaw.slice(), pale), leftPaw);
  const right = rig.feature === "rightPaw" ? feature : parts.rightPaw;
  draw(output, fade(right.slice(), pale), rightPaw);
  if (worn && neckwear) drawWorn(output, worn, body);
  if (phone) {
    drawPhone(output, prop, motion.screenPulse);
    drawPhoneGrip(output, right, rightPaw, prop);
  }
  if (life.power) empower(output, life.power, life.beat ?? 0);
  return life.stretch && Math.abs(life.stretch - 1) > .004 ? squash(output, life.stretch) : output;
}

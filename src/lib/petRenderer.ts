import type { PetMotionFrame, PixelOffset } from "./petMotion";
import type { EyeAnchor, PetRect, PetRig } from "./petRig";

/** Logical grid. Rig geometry and motion offsets are calibrated in these units. */
export const LOGICAL_SIZE = 60;

/* Rendering happens on a finer raster of `LOGICAL_SIZE * scale` pixels so the art keeps
 * its detail. All rig rectangles and motion offsets are multiplied by `scale`; at
 * scale 1 the output is identical to the original 60×60 compositor. */

type Rgba = readonly [number, number, number, number];
interface Grid { size: number; scale: number }
interface SpriteLayer { pixels: Uint8ClampedArray; rect: PetRect }
interface PreparedEye {
  anchor: EyeAnchor; bounds: PetRect; shape: Uint8Array; pixels: Uint8ClampedArray; lidColor: Rgba;
}
export interface SpriteLayers {
  rig: PetRig;
  grid: Grid;
  body: SpriteLayer;
  head: SpriteLayer;
  leftPaw: SpriteLayer | null;
  rightPaw: SpriteLayer | null;
  prop: SpriteLayer | null;
  joints: SpriteLayer;
  eyes: PreparedEye[];
}

const inside = (x: number, y: number, rect: PetRect) =>
  x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
const bounded = (value: number, limit: number) => Number.isFinite(value) ? Math.max(-limit, Math.min(limit, Math.round(value))) : 0;
const color = (hex: string): Rgba => {
  const value = hex.replace("#", "");
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16), 255];
};
const scaled = (rect: PetRect, k: number): PetRect =>
  ({ x: rect.x * k, y: rect.y * k, width: rect.width * k, height: rect.height * k });
const times = (offset: PixelOffset, k: number): PixelOffset => ({ x: offset.x * k, y: offset.y * k });

/** Extract once per atlas frame. Exclusive ownership prevents a moved paw or
 * head leaving its former outline behind in the body or another prop layer. */
export function prepareSpritePixels(base: Uint8ClampedArray, rig: PetRig, scale = 1): SpriteLayers {
  const k = Math.max(1, Math.round(scale));
  const N = LOGICAL_SIZE * k;
  const LENGTH = N * N * 4;
  if (base.length !== LENGTH) throw new Error(`Pet artwork must be a ${N}×${N} RGBA raster`);
  const layer = (rect: PetRect): SpriteLayer => ({ pixels: new Uint8ClampedArray(LENGTH), rect: scaled(rect, k) });
  const all: PetRect = { x: 0, y: 0, width: LOGICAL_SIZE, height: LOGICAL_SIZE };
  const head = scaled(rig.head, k);
  const output: SpriteLayers = {
    rig, grid: { size: N, scale: k }, body: layer(all), head: layer(rig.head),
    leftPaw: rig.leftPaw ? layer(rig.leftPaw) : null,
    rightPaw: rig.rightPaw ? layer(rig.rightPaw) : null,
    prop: rig.prop ? layer(rig.prop) : null,
    joints: layer(all), eyes: [],
  };
  const ownership = new Uint8Array(N * N);
  const parts = [output.body, output.head, output.leftPaw, output.rightPaw, output.prop];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const index = (y * N + x) * 4;
    const owner = output.leftPaw && inside(x, y, output.leftPaw.rect) ? output.leftPaw
      : output.rightPaw && inside(x, y, output.rightPaw.rect) ? output.rightPaw
      : output.prop && inside(x, y, output.prop.rect) ? output.prop
      : inside(x, y, head) ? output.head : output.body;
    ownership[y * N + x] = parts.indexOf(owner);
    owner.pixels.set(base.subarray(index, index + 4), index);
  }
  // A rectangular calibration region often intersects another opaque part:
  // the neck, a cheek behind headphones, or an arm crossing a book. Backfill
  // only those *interior* cuts on every side, with the source fur itself. Outer
  // silhouette edges still disappear when moved, so ears/paws never duplicate.
  const joint = new Uint8Array(N * N);
  const maximum = (owner: number) => (owner === 1 ? rig.joints.maxHeadOffset
    : owner === 4 ? 1 : rig.joints.maxPawOffset) * k;
  const someNeighbor = (pixel: number, test: (neighbor: number) => boolean) => {
    const x = pixel % N, y = (pixel - x) / N;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || x + dx < 0 || y + dy < 0 || x + dx >= N || y + dy >= N) continue;
      if (test((y + dy) * N + x + dx)) return true;
    }
    return false;
  };
  for (let pixel = 0; pixel < ownership.length; pixel++) {
    if (!ownership[pixel] || !maximum(ownership[pixel]) || base[pixel * 4 + 3] < 230) continue;
    if (someNeighbor(pixel, neighbor => base[neighbor * 4 + 3] >= 230
      && ownership[neighbor] !== ownership[pixel])) joint[pixel] = 1;
  }
  // A paw can move two logical pixels, requiring that many source rows/columns
  // behind its shoulder. Expand only through opaque pixels of that same part.
  for (let depth = 1; depth < 2 * k; depth++) {
    const previous = joint.slice();
    for (let pixel = 0; pixel < ownership.length; pixel++) {
      const owner = ownership[pixel];
      if (!owner || joint[pixel] || maximum(owner) <= depth || base[pixel * 4 + 3] < 230) continue;
      if (someNeighbor(pixel, neighbor => previous[neighbor] === 1 && ownership[neighbor] === owner)) joint[pixel] = 1;
    }
  }
  for (let pixel = 0; pixel < joint.length; pixel++) {
    if (joint[pixel]) output.joints.pixels.set(base.subarray(pixel * 4, pixel * 4 + 4), pixel * 4);
  }
  output.eyes = rig.eyes.map(anchor => {
    const bounds = scaled(anchor.bounds, k);
    const { width, height, x: left, y: top } = bounds;
    const shape = new Uint8Array(width * height);
    const pixels = new Uint8ClampedArray(shape.length * 4);
    const logicalWidth = anchor.bounds.width, logicalHeight = anchor.bounds.height;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const source = ((top + y) * N + left + x) * 4;
      // Clip to the rounded eye, not its rectangular calibration area. The mask is
      // decided per logical pixel (where the eye bounds were calibrated); the
      // original artwork still supplies each iris/pupil pixel and its shading.
      const lx = Math.floor(x / k), ly = Math.floor(y / k);
      const nx = (lx - (logicalWidth - 1) / 2) / Math.max(.5, logicalWidth / 2);
      const ny = (ly - (logicalHeight - 1) / 2) / Math.max(.5, logicalHeight / 2);
      shape[index] = nx * nx + ny * ny <= 1.08 && base[source + 3] ? 1 : 0;
      pixels.set(base.subarray(source, source + 4), index * 4);
    }
    // Close onto the surrounding fur/patch, rather than turning the eye's
    // entire rectangle black. The most common nearby shade avoids sampling a
    // catchlight or a contrasting cheek at the edge of the calibration area.
    const shades = new Map<string, { count: number; rgba: Rgba }>();
    for (let y = top - 1; y <= top + height; y++) for (let x = left - 1; x <= left + width; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N || inside(x, y, bounds)) continue;
      const source = (y * N + x) * 4;
      if (base[source + 3] < 200) continue;
      const rgba: Rgba = [base[source], base[source + 1], base[source + 2], 255];
      const key = rgba.slice(0, 3).map(channel => Math.round(channel / 32)).join();
      const shade = shades.get(key);
      if (shade) shade.count++;
      else shades.set(key, { count: 1, rgba });
    }
    const surrounding = [...shades.values()].sort((a, b) => b.count - a.count)[0];
    return { anchor, bounds, shape, pixels, lidColor: surrounding?.rgba ?? color(anchor.palette.iris) };
  });
  return output;
}

function paint(output: Uint8ClampedArray, N: number, x: number, y: number, rgba: Rgba) {
  if (x < 0 || y < 0 || x >= N || y >= N || !rgba[3]) return;
  const index = (y * N + x) * 4;
  if (rgba[3] === 255 || !output[index + 3]) {
    output.set(rgba, index); return;
  }
  const alpha = rgba[3] / 255;
  const destinationAlpha = output[index + 3] / 255;
  const blended = alpha + destinationAlpha * (1 - alpha);
  for (let channel = 0; channel < 3; channel++) {
    output[index + channel] = (rgba[channel] * alpha + output[index + channel] * destinationAlpha * (1 - alpha)) / blended;
  }
  output[index + 3] = blended * 255;
}

/** Paints one logical pixel as a k×k block. */
function block(output: Uint8ClampedArray, grid: Grid, x: number, y: number, rgba: Rgba) {
  const k = grid.scale;
  for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) paint(output, grid.size, x * k + dx, y * k + dy, rgba);
}

function draw(output: Uint8ClampedArray, N: number, source: SpriteLayer | null, offset: PixelOffset) {
  if (!source) return;
  const { rect, pixels } = source;
  for (let y = Math.max(0, rect.y); y < Math.min(N, rect.y + rect.height); y++) {
    for (let x = Math.max(0, rect.x); x < Math.min(N, rect.x + rect.width); x++) {
      const index = (y * N + x) * 4;
      if (pixels[index + 3]) paint(output, N, x + offset.x, y + offset.y,
        [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]]);
    }
  }
}

function backfillJoints(output: Uint8ClampedArray, N: number, source: SpriteLayer, offset: PixelOffset) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const sourceIndex = (y * N + x) * 4;
    if (!source.pixels[sourceIndex + 3]) continue;
    const targetX = x + offset.x, targetY = y + offset.y;
    if (targetX < 0 || targetY < 0 || targetX >= N || targetY >= N) continue;
    const target = (targetY * N + targetX) * 4;
    if (output[target + 3] >= 230) continue;
    const foreground: Rgba = [output[target], output[target + 1], output[target + 2], output[target + 3]];
    output.set(source.pixels.subarray(sourceIndex, sourceIndex + 4), target);
    paint(output, N, targetX, targetY, foreground);
  }
}

function drawEye(output: Uint8ClampedArray, grid: Grid, eye: PreparedEye, head: PixelOffset, gaze: PixelOffset, blink: boolean) {
  const { anchor, bounds, pixels, shape } = eye;
  const { size: N, scale: k } = grid;
  const dx = bounded(gaze.x, anchor.maxGazeX) * k;
  const dy = bounded(gaze.y, anchor.maxGazeY) * k;
  if (blink || dx || dy) {
    for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) {
      const index = y * bounds.width + x;
      if (!shape[index]) continue;
      const sx = x - dx, sy = y - dy;
      const source = sy * bounds.width + sx;
      const shifted = sx >= 0 && sy >= 0 && sx < bounds.width && sy < bounds.height && shape[source];
      const rgba: Rgba = blink ? eye.lidColor
        : shifted ? [pixels[source * 4], pixels[source * 4 + 1], pixels[source * 4 + 2], pixels[source * 4 + 3]]
        : [pixels[index * 4], pixels[index * 4 + 1], pixels[index * 4 + 2], pixels[index * 4 + 3]];
      paint(output, N, bounds.x + x + head.x, bounds.y + y + head.y, rgba);
    }
  }
  if (blink) {
    // The closed-lid line is drawn in logical pixels so it reads the same at every scale.
    const lid = color(anchor.palette.pupil);
    const width = anchor.bounds.width, height = anchor.bounds.height;
    for (let x = 1; x < width - 1; x++) {
      const y = Math.floor(height / 2) - (x === 1 || x === width - 2 ? 1 : 0);
      for (let by = 0; by < k; by++) for (let bx = 0; bx < k; bx++) {
        const hx = x * k + bx, hy = y * k + by;
        if (shape[hy * bounds.width + hx]) paint(output, N, bounds.x + hx + head.x, bounds.y + hy + head.y, lid);
      }
    }
    return;
  }
  // A calibrated catchlight that survives reduction. In particular, the curious
  // panda's viewer-right source highlight otherwise disappears at 60px.
  const highlight = color(anchor.palette.highlight);
  const spot = k === 1 ? 1 : Math.max(1, Math.round(k * .75));
  for (let y = 0; y < anchor.highlight.height * spot; y++) for (let x = 0; x < anchor.highlight.width * spot; x++) {
    let localX = anchor.highlight.x * k + x + dx - bounds.x;
    let localY = anchor.highlight.y * k + y + dy - bounds.y;
    if (localX < 0 || localY < 0 || localX >= bounds.width || localY >= bounds.height
      || !shape[localY * bounds.width + localX]) {
      let nearest = -1, distance = Number.POSITIVE_INFINITY;
      for (let candidate = 0; candidate < shape.length; candidate++) {
        if (!shape[candidate]) continue;
        const cx = candidate % bounds.width, cy = Math.floor(candidate / bounds.width);
        const delta = (cx - localX) ** 2 + (cy - localY) ** 2;
        if (delta < distance) { nearest = candidate; distance = delta; }
      }
      if (nearest < 0) continue;
      localX = nearest % bounds.width; localY = Math.floor(nearest / bounds.width);
    }
    paint(output, N, bounds.x + localX + head.x, bounds.y + localY + head.y, highlight);
  }
}

function propDetail(output: Uint8ClampedArray, grid: Grid, source: SpriteLayer | null, offset: PixelOffset, motion: PetMotionFrame) {
  if (!source) return;
  const { size: N, scale: k } = grid;
  const { rect, pixels } = source;
  const logical = scaled(rect, 1 / k);
  // Marks are placed in logical pixels and painted over each k×k block.
  const mark = (lx: number, ly: number, folded: boolean) => {
    for (let by = 0; by < k; by++) for (let bx = 0; bx < k; bx++) {
      const x = lx * k + bx, y = ly * k + by;
      if (!inside(x, y, rect)) continue;
      const index = (y * N + x) * 4;
      if (!pixels[index + 3]) continue;
      const original = [pixels[index], pixels[index + 1], pixels[index + 2]];
      if (folded && Math.max(...original) < 65) continue;
      const increase = folded ? 20 : 12;
      paint(output, N, x + offset.x, y + offset.y,
        [Math.min(255, original[0] + increase), Math.min(255, original[1] + increase), Math.min(255, original[2] + increase), pixels[index + 3]]);
    }
  };
  if (motion.pageTurn) {
    const center = logical.x + Math.floor(logical.width / 2);
    for (let y = logical.y + 2; y < logical.y + logical.height - 2; y++) mark(center + Math.floor((y - logical.y) / 5), y, true);
  }
  if (motion.screenPulse) {
    const y = logical.y + Math.min(3, Math.floor(logical.height / 3));
    for (let x = logical.x + 2; x < Math.min(logical.x + logical.width - 2, logical.x + 6); x++) mark(x, y, false);
  }
}

function drawPhone(output: Uint8ClampedArray, grid: Grid, offset: PixelOffset, screenPulse: boolean) {
  const x = 39 + offset.x, y = 38 + offset.y;
  for (let py = 0; py < 15; py++) for (let px = 0; px < 9; px++) {
    if ((py === 0 || py === 14) && (px === 0 || px === 8)) continue;
    const screen = px >= 2 && px <= 6 && py >= 2 && py <= 10;
    block(output, grid, x + px, y + py, screen ? [164, 197, 177, 255] : [59, 57, 68, 255]);
  }
  const shift = screenPulse ? 1 : 0;
  for (let px = 0; px < 3; px++) block(output, grid, x + 3 + px, y + 4 + shift, [232, 223, 189, 255]);
  for (let px = 0; px < 2; px++) block(output, grid, x + 3 + px, y + 7 + shift, [232, 223, 189, 255]);
  block(output, grid, x + 4, y + 12, [194, 191, 200, 255]);
}

function drawPhoneGrip(output: Uint8ClampedArray, grid: Grid, paw: SpriteLayer | null, pawOffset: PixelOffset, phoneOffset: PixelOffset) {
  if (!paw) return;
  const { size: N, scale: k } = grid;
  const left = (39 + phoneOffset.x) * k, top = (42 + phoneOffset.y) * k;
  const shift = times(pawOffset, k);
  // Only a slim thumb/claw grip can overlap the case. The five-pixel screen
  // stays readable even for the crab's much wider claw, while its original
  // articulated paw still moves beside and in front of the phone's edge.
  for (let y = top; y < top + 5 * k; y++) for (let x = left; x < left + 2 * k; x++) {
    const sourceX = x - shift.x, sourceY = y - shift.y;
    if (sourceX < 0 || sourceY < 0 || sourceX >= N || sourceY >= N
      || !inside(sourceX, sourceY, paw.rect)) continue;
    const source = (sourceY * N + sourceX) * 4;
    paint(output, N, x, y, [paw.pixels[source], paw.pixels[source + 1], paw.pixels[source + 2], paw.pixels[source + 3]]);
  }
}

export function renderSpritePixels(layers: SpriteLayers, motion: PetMotionFrame,
  gaze: PixelOffset, phone = false): Uint8ClampedArray {
  const { grid } = layers;
  const { size: N, scale: k } = grid;
  const output = new Uint8ClampedArray(N * N * 4);
  // Offsets are decided in logical pixels, then applied on the fine raster.
  const body = { x: bounded(motion.body.x, 1), y: bounded(motion.body.y, 1) };
  const awake = !motion.blink && layers.eyes.length > 0;
  const head = {
    x: body.x + bounded(motion.head.x + (awake ? bounded(gaze.x, 1) : 0), layers.rig.joints.maxHeadOffset),
    y: body.y + bounded(motion.head.y + (awake ? bounded(gaze.y, 1) : 0), layers.rig.joints.maxHeadOffset),
  };
  const attached = (offset: PixelOffset, maximum = 2) => ({
    x: body.x + bounded(offset.x, maximum), y: body.y + bounded(offset.y, maximum),
  });
  const prop = attached(motion.prop, 1);
  const leftPaw = attached(motion.leftPaw, layers.rig.joints.maxPawOffset);
  const rightPaw = attached(motion.rightPaw, layers.rig.joints.maxPawOffset);
  draw(output, N, layers.body, times(body, k));
  draw(output, N, layers.head, times(head, k));
  for (const eye of layers.eyes) drawEye(output, grid, eye, times(head, k), gaze, motion.blink);
  draw(output, N, layers.prop, times(prop, k));
  propDetail(output, grid, layers.prop, times(prop, k), motion);
  draw(output, N, layers.leftPaw, times(leftPaw, k));
  draw(output, N, layers.rightPaw, times(rightPaw, k));
  backfillJoints(output, N, layers.joints, times(body, k));
  if (phone) {
    drawPhone(output, grid, prop, motion.screenPulse);
    drawPhoneGrip(output, grid, layers.rightPaw, rightPaw, prop);
  }
  return output;
}

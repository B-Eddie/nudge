import type { PetMotionFrame, PixelOffset } from "./petMotion";
import type { EyeAnchor, PetRect, PetRig } from "./petRig";

const SIZE = 60;
const LENGTH = SIZE * SIZE * 4;
type Rgba = readonly [number, number, number, number];
interface SpriteLayer { pixels: Uint8ClampedArray; rect: PetRect }
interface PreparedEye { anchor: EyeAnchor; shape: Uint8Array; pixels: Uint8ClampedArray; lidColor: Rgba }
export interface SpriteLayers {
  rig: PetRig;
  body: SpriteLayer;
  head: SpriteLayer;
  leftPaw: SpriteLayer | null;
  rightPaw: SpriteLayer | null;
  prop: SpriteLayer | null;
  joints: SpriteLayer;
  eyes: PreparedEye[];
}

const pixelIndex = (x: number, y: number) => (y * SIZE + x) * 4;
const inside = (x: number, y: number, rect: PetRect) =>
  x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
const bounded = (value: number, limit: number) => Number.isFinite(value) ? Math.max(-limit, Math.min(limit, Math.round(value))) : 0;
const color = (hex: string): Rgba => {
  const value = hex.replace("#", "");
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16), 255];
};
const layer = (rect: PetRect): SpriteLayer => ({ pixels: new Uint8ClampedArray(LENGTH), rect });
const all: PetRect = { x: 0, y: 0, width: SIZE, height: SIZE };

/** Extract once per atlas frame. Exclusive ownership prevents a moved paw or
 * head leaving its former outline behind in the body or another prop layer. */
export function prepareSpritePixels(base: Uint8ClampedArray, rig: PetRig): SpriteLayers {
  if (base.length !== LENGTH) throw new Error("Pet artwork must be a 60×60 RGBA raster");
  const output: SpriteLayers = {
    rig, body: layer(all), head: layer(rig.head),
    leftPaw: rig.leftPaw ? layer(rig.leftPaw) : null,
    rightPaw: rig.rightPaw ? layer(rig.rightPaw) : null,
    prop: rig.prop ? layer(rig.prop) : null,
    joints: layer(all), eyes: [],
  };
  const ownership = new Uint8Array(SIZE * SIZE);
  const parts = [output.body, output.head, output.leftPaw, output.rightPaw, output.prop];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const index = pixelIndex(x, y);
    const owner = output.leftPaw && inside(x, y, output.leftPaw.rect) ? output.leftPaw
      : output.rightPaw && inside(x, y, output.rightPaw.rect) ? output.rightPaw
      : output.prop && inside(x, y, output.prop.rect) ? output.prop
      : inside(x, y, rig.head) ? output.head : output.body;
    ownership[y * SIZE + x] = parts.indexOf(owner);
    owner.pixels.set(base.subarray(index, index + 4), index);
  }
  // A rectangular calibration region often intersects another opaque part:
  // the neck, a cheek behind headphones, or an arm crossing a book. Backfill
  // only those *interior* cuts on every side, with the source fur itself. Outer
  // silhouette edges still disappear when moved, so ears/paws never duplicate.
  const joint = new Uint8Array(SIZE * SIZE);
  const maximum = (owner: number) => owner === 1 ? rig.joints.maxHeadOffset
    : owner === 4 ? 1 : rig.joints.maxPawOffset;
  const neighbors = (pixel: number) => {
    const x = pixel % SIZE, y = Math.floor(pixel / SIZE);
    const adjacent: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || x + dx < 0 || y + dy < 0 || x + dx >= SIZE || y + dy >= SIZE) continue;
      adjacent.push((y + dy) * SIZE + x + dx);
    }
    return adjacent;
  };
  for (let pixel = 0; pixel < ownership.length; pixel++) {
    if (!ownership[pixel] || !maximum(ownership[pixel]) || base[pixel * 4 + 3] < 230) continue;
    if (neighbors(pixel).some(neighbor => neighbor >= 0 && base[neighbor * 4 + 3] >= 230
      && ownership[neighbor] !== ownership[pixel])) joint[pixel] = 1;
  }
  // A paw can move two pixels, requiring two source rows/columns behind its
  // shoulder. Expand only through opaque pixels belonging to that same part.
  for (let depth = 1; depth < 2; depth++) {
    const previous = joint.slice();
    for (let pixel = 0; pixel < ownership.length; pixel++) {
      const owner = ownership[pixel];
      if (!owner || joint[pixel] || maximum(owner) <= depth || base[pixel * 4 + 3] < 230) continue;
      if (neighbors(pixel).some(neighbor => neighbor >= 0 && previous[neighbor]
        && ownership[neighbor] === owner)) joint[pixel] = 1;
    }
  }
  for (let pixel = 0; pixel < joint.length; pixel++) {
    if (joint[pixel]) output.joints.pixels.set(base.subarray(pixel * 4, pixel * 4 + 4), pixel * 4);
  }
  output.eyes = rig.eyes.map(anchor => {
    const shape = new Uint8Array(anchor.bounds.width * anchor.bounds.height);
    const pixels = new Uint8ClampedArray(shape.length * 4);
    const { width, height, x: left, y: top } = anchor.bounds;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const source = pixelIndex(left + x, top + y);
      // Clip to the rounded eye, not its rectangular calibration area. The
      // original artwork still supplies each iris/pupil pixel and its shading.
      const nx = (x - (width - 1) / 2) / Math.max(.5, width / 2);
      const ny = (y - (height - 1) / 2) / Math.max(.5, height / 2);
      shape[index] = nx * nx + ny * ny <= 1.08 && base[source + 3] ? 1 : 0;
      pixels.set(base.subarray(source, source + 4), index * 4);
    }
    // Close onto the surrounding fur/patch, rather than turning the eye's
    // entire rectangle black. The most common nearby shade avoids sampling a
    // catchlight or a contrasting cheek at the edge of the calibration area.
    const shades = new Map<string, { count: number; rgba: Rgba }>();
    for (let y = top - 1; y <= top + height; y++) for (let x = left - 1; x <= left + width; x++) {
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || inside(x, y, anchor.bounds)) continue;
      const source = pixelIndex(x, y);
      if (base[source + 3] < 200) continue;
      const rgba: Rgba = [base[source], base[source + 1], base[source + 2], 255];
      const key = rgba.slice(0, 3).map(channel => Math.round(channel / 32)).join();
      const shade = shades.get(key);
      if (shade) shade.count++;
      else shades.set(key, { count: 1, rgba });
    }
    const surrounding = [...shades.values()].sort((a, b) => b.count - a.count)[0];
    return { anchor, shape, pixels, lidColor: surrounding?.rgba ?? color(anchor.palette.iris) };
  });
  return output;
}

function paint(output: Uint8ClampedArray, x: number, y: number, rgba: Rgba) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || !rgba[3]) return;
  const index = pixelIndex(x, y);
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

function draw(output: Uint8ClampedArray, source: SpriteLayer | null, offset: PixelOffset) {
  if (!source) return;
  const { rect, pixels } = source;
  for (let y = Math.max(0, rect.y); y < Math.min(SIZE, rect.y + rect.height); y++) {
    for (let x = Math.max(0, rect.x); x < Math.min(SIZE, rect.x + rect.width); x++) {
      const index = pixelIndex(x, y);
      if (pixels[index + 3]) paint(output, x + offset.x, y + offset.y,
        [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]]);
    }
  }
}

function backfillJoints(output: Uint8ClampedArray, source: SpriteLayer, offset: PixelOffset) {
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const sourceIndex = pixelIndex(x, y);
    if (!source.pixels[sourceIndex + 3]) continue;
    const targetX = x + offset.x, targetY = y + offset.y;
    if (targetX < 0 || targetY < 0 || targetX >= SIZE || targetY >= SIZE) continue;
    const target = pixelIndex(targetX, targetY);
    if (output[target + 3] >= 230) continue;
    const foreground: Rgba = [output[target], output[target + 1], output[target + 2], output[target + 3]];
    output.set(source.pixels.subarray(sourceIndex, sourceIndex + 4), target);
    paint(output, targetX, targetY, foreground);
  }
}

function drawEye(output: Uint8ClampedArray, eye: PreparedEye, head: PixelOffset, gaze: PixelOffset, blink: boolean) {
  const { anchor, pixels, shape } = eye;
  const { bounds } = anchor;
  const dx = bounded(gaze.x, anchor.maxGazeX);
  const dy = bounded(gaze.y, anchor.maxGazeY);
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
      paint(output, bounds.x + x + head.x, bounds.y + y + head.y, rgba);
    }
  }
  if (blink) {
    const lid = color(anchor.palette.pupil);
    for (let x = 1; x < bounds.width - 1; x++) {
      const y = Math.floor(bounds.height / 2) - (x === 1 || x === bounds.width - 2 ? 1 : 0);
      if (shape[y * bounds.width + x]) paint(output, bounds.x + x + head.x, bounds.y + y + head.y, lid);
    }
    return;
  }
  // A calibrated one-pixel catchlight survives nearest-neighbor reduction.
  // In particular, the curious panda's viewer-right source highlight otherwise
  // disappears completely at the 60px display resolution.
  const highlight = color(anchor.palette.highlight);
  for (let y = 0; y < anchor.highlight.height; y++) for (let x = 0; x < anchor.highlight.width; x++) {
    let localX = anchor.highlight.x + x + dx - bounds.x;
    let localY = anchor.highlight.y + y + dy - bounds.y;
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
    paint(output, bounds.x + localX + head.x, bounds.y + localY + head.y, highlight);
  }
}

function propDetail(output: Uint8ClampedArray, source: SpriteLayer | null, offset: PixelOffset, motion: PetMotionFrame) {
  if (!source) return;
  const { rect, pixels } = source;
  const mark = (x: number, y: number, folded: boolean) => {
    if (!inside(x, y, rect)) return;
    const index = pixelIndex(x, y);
    if (!pixels[index + 3]) return;
    const original = [pixels[index], pixels[index + 1], pixels[index + 2]];
    if (folded && Math.max(...original) < 65) return;
    const increase = folded ? 20 : 12;
    paint(output, x + offset.x, y + offset.y,
      [Math.min(255, original[0] + increase), Math.min(255, original[1] + increase), Math.min(255, original[2] + increase), pixels[index + 3]]);
  };
  if (motion.pageTurn) {
    const center = rect.x + Math.floor(rect.width / 2);
    for (let y = rect.y + 2; y < rect.y + rect.height - 2; y++) mark(center + Math.floor((y - rect.y) / 5), y, true);
  }
  if (motion.screenPulse) {
    const y = rect.y + Math.min(3, Math.floor(rect.height / 3));
    for (let x = rect.x + 2; x < Math.min(rect.x + rect.width - 2, rect.x + 6); x++) mark(x, y, false);
  }
}

function drawPhone(output: Uint8ClampedArray, offset: PixelOffset, screenPulse: boolean) {
  const x = 39 + offset.x, y = 38 + offset.y;
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

function drawPhoneGrip(output: Uint8ClampedArray, paw: SpriteLayer | null, pawOffset: PixelOffset, phoneOffset: PixelOffset) {
  if (!paw) return;
  const left = 39 + phoneOffset.x, top = 42 + phoneOffset.y;
  // Only a slim thumb/claw grip can overlap the case. The five-pixel screen
  // stays readable even for the crab's much wider claw, while its original
  // articulated paw still moves beside and in front of the phone's edge.
  for (let y = top; y < top + 5; y++) for (let x = left; x < left + 2; x++) {
    const sourceX = x - pawOffset.x, sourceY = y - pawOffset.y;
    if (sourceX < 0 || sourceY < 0 || sourceX >= SIZE || sourceY >= SIZE
      || !inside(sourceX, sourceY, paw.rect)) continue;
    const source = pixelIndex(sourceX, sourceY);
    paint(output, x, y, [paw.pixels[source], paw.pixels[source + 1], paw.pixels[source + 2], paw.pixels[source + 3]]);
  }
}

export function renderSpritePixels(layers: SpriteLayers, motion: PetMotionFrame,
  gaze: PixelOffset, phone = false): Uint8ClampedArray {
  const output = new Uint8ClampedArray(LENGTH);
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
  draw(output, layers.body, body);
  draw(output, layers.head, head);
  for (const eye of layers.eyes) drawEye(output, eye, head, gaze, motion.blink);
  draw(output, layers.prop, prop);
  propDetail(output, layers.prop, prop, motion);
  draw(output, layers.leftPaw, attached(motion.leftPaw, layers.rig.joints.maxPawOffset));
  draw(output, layers.rightPaw, attached(motion.rightPaw, layers.rig.joints.maxPawOffset));
  backfillJoints(output, layers.joints, body);
  if (phone) {
    drawPhone(output, prop, motion.screenPulse);
    drawPhoneGrip(output, layers.rightPaw, attached(motion.rightPaw, layers.rig.joints.maxPawOffset), prop);
  }
  return output;
}

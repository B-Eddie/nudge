import { describe, expect, it } from "vitest";
import { getPetRig, type PetRect } from "../src/lib/petRig";
import { PET_POSES } from "../src/types/pixelPets";
import type { CompanionId } from "../src/types/appearance";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { framePixels, isolateAtlas } from "../src/lib/spriteAtlas";
import { mirrorWalkingFrame, spritePlacement } from "../src/types/pixelPets";
import { samplePetMotion, petMotionPeriod } from "../src/lib/petMotion";
import { prepareSpritePixels, renderSpritePixels } from "../src/lib/petRenderer";

const characters: CompanionId[] = ["panda", "cat", "red_panda", "capybara", "crab"];
const poses = Object.keys(PET_POSES) as (keyof typeof PET_POSES)[];
function bounded(rect: PetRect, offset = 0) {
  expect(Object.values(rect).every(Number.isInteger)).toBe(true);
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);
  expect(rect.x - offset).toBeGreaterThanOrEqual(0);
  expect(rect.y - offset).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width + offset).toBeLessThanOrEqual(60);
  expect(rect.y + rect.height + offset).toBeLessThanOrEqual(60);
}
function contained(inner: PetRect, outer: PetRect, offsetX = 0, offsetY = 0) {
  expect(inner.x - offsetX).toBeGreaterThanOrEqual(outer.x);
  expect(inner.y - offsetY).toBeGreaterThanOrEqual(outer.y);
  expect(inner.x + inner.width + offsetX).toBeLessThanOrEqual(outer.x + outer.width);
  expect(inner.y + inner.height + offsetY).toBeLessThanOrEqual(outer.y + outer.height);
}

describe("calibrated articulated pet geometry", () => {
  it("keeps all eighty poses and their full motion budget on the 60px canvas", () => {
    for (const character of characters) for (const pose of poses) {
      const rig = getPetRig(character, pose);
      bounded(rig.head, rig.joints.maxHeadOffset);
      for (const paw of [rig.leftPaw, rig.rightPaw]) if (paw) bounded(paw, rig.joints.maxPawOffset);
      if (rig.prop) bounded(rig.prop, 1);
      expect(rig.joints.headOverlap).toBeGreaterThanOrEqual(2);
      expect(rig.joints.headOverlap).toBeLessThan(rig.head.height);
      for (const eye of rig.eyes) {
        bounded(eye.bounds);
        contained(eye.bounds, rig.head);
        contained(eye.pupil, eye.bounds, eye.maxGazeX, eye.maxGazeY);
        contained(eye.highlight, eye.pupil);
        contained(eye.highlight, eye.bounds, eye.maxGazeX, eye.maxGazeY);
      }
    }
  });

  it("never adds tracking pupils to closed or obscured eyes", () => {
    for (const character of characters) for (const pose of ["blink", "delighted", "sleep", "yawn", "stretch", "groom", "music"] as const) {
      expect(getPetRig(character, pose).eyes, `${character}:${pose}`).toEqual([]);
    }
    expect(getPetRig("red_panda", "happy").eyes).toEqual([]);
    for (const character of characters.filter(character => character !== "red_panda")) {
      expect(getPetRig(character, "happy").eyes.length).toBeGreaterThan(0);
    }
  });

  it("repairs the tiny panda curious catchlight without inventing a third eye", () => {
    const rig = getPetRig("panda", "curious");
    expect(rig.eyes).toHaveLength(2);
    expect(rig.eyes[1].highlight).toEqual({ x: 40, y: 23, width: 1, height: 1 });
    expect(rig.eyes[1].palette.highlight).toBe("#fff5da");
    expect(rig.eyes[1].bounds.width).toBe(5);
    expect(rig.eyes[1].bounds.width).toBeLessThan(rig.eyes[0].bounds.width);
    expect(getPetRig("panda", "blink").eyes).toHaveLength(0);
  });

  it("matches visible anatomy and provides separate task props and forepaws", () => {
    for (const pose of ["idle", "curious", "focus", "read", "play", "walkA", "walkB"] as const) {
      expect(getPetRig("capybara", pose).eyes).toHaveLength(1);
    }
    expect(getPetRig("capybara", "lifted").eyes).toHaveLength(2);
    for (const character of characters) for (const pose of ["focus", "read", "play"] as const) {
      const rig = getPetRig(character, pose);
      expect(rig.leftPaw ?? rig.rightPaw).not.toBeNull();
      if (pose !== "focus") {
        expect(rig.leftPaw).not.toBeNull();
        expect(rig.rightPaw).not.toBeNull();
      }
      expect(rig.prop).not.toBeNull();
      expect(rig.prop).not.toEqual(rig.head);
    }
    for (const character of characters) for (const pose of ["sleep", "lifted", "groom", "stretch", "delighted", "music"] as const) {
      expect(getPetRig(character, pose).joints.maxHeadOffset).toBe(0);
    }
  });

  it("keeps typing articulation on visible forepaws instead of seated foot pads", () => {
    const panda = getPetRig("panda", "focus");
    expect(panda.leftPaw).toBeNull();
    expect(panda.rightPaw!.y + panda.rightPaw!.height).toBeLessThanOrEqual(48);
    expect(panda.rightPaw!.x).toBeGreaterThanOrEqual(34);
    expect(panda.prop!.y + panda.prop!.height).toBe(49);
    expect(getPetRig("cat", "focus").rightPaw).toBeNull();
    expect(getPetRig("capybara", "focus").rightPaw).toBeNull();
    expect(getPetRig("red_panda", "focus").leftPaw).toBeNull();
    expect(getPetRig("crab", "focus").leftPaw).toBeNull();
  });
});

/** Decode the actual non-interlaced 8-bit RGBA fixtures, without a new dependency. */
function decodeAtlas(character: CompanionId) {
  const png = readFileSync(new URL(`../src/assets/pets/pixel/${character}.png`, import.meta.url));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0) throw new Error("Unsupported fixture PNG format");
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const scanlines = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const rgba = new Uint8ClampedArray(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = scanlines[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const left = x >= 4 ? rgba[i - 4] : 0, up = y ? rgba[i - stride] : 0;
      const corner = y && x >= 4 ? rgba[i - stride - 4] : 0;
      const estimate = left + up - corner;
      const paeth = Math.abs(estimate - left) <= Math.abs(estimate - up) && Math.abs(estimate - left) <= Math.abs(estimate - corner)
        ? left : Math.abs(estimate - up) <= Math.abs(estimate - corner) ? up : corner;
      const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth : Number.NaN;
      if (Number.isNaN(prediction)) throw new Error("Unsupported fixture PNG filter");
      rgba[i] = (scanlines[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  return { width, height, rgba };
}

function normalizedFixtures() {
  return characters.flatMap(character => {
    const atlas = decodeAtlas(character);
    const { frames, labels } = isolateAtlas(atlas.rgba, atlas.width, atlas.height);
    return poses.map(pose => {
      const frame = frames[PET_POSES[pose]];
      const pixels = framePixels(atlas.rgba, atlas.width, labels, frame);
      const destination = spritePlacement(frame, frames[0]);
      const base = new Uint8ClampedArray(60 * 60 * 4);
      for (let y = 0; y < destination.height; y++) for (let x = 0; x < destination.width; x++) {
        const sourceX = Math.min(frame.width - 1, Math.floor((x + .5) * frame.width / destination.width));
        const sourceY = Math.min(frame.height - 1, Math.floor((y + .5) * frame.height / destination.height));
        const source = (sourceY * frame.width + sourceX) * 4;
        const targetX = mirrorWalkingFrame(character, pose) ? 59 - destination.x - x : destination.x + x;
        base.set(pixels.subarray(source, source + 4), ((destination.y + y) * 60 + targetX) * 4);
      }
      return { character, pose, base };
    });
  });
}

describe("actual eighty-pose raster integration", () => {
  const fixtures = normalizedFixtures();
  it("extracts real artwork for every calibrated layer and animates actual canvas pixels", () => {
    for (const { character, pose, base } of fixtures) {
      const layers = prepareSpritePixels(base, getPetRig(character, pose));
      for (const layer of [layers.head, layers.leftPaw, layers.rightPaw, layers.prop]) if (layer) {
        expect(layer.pixels.some((value, i) => i % 4 === 3 && value > 95), `${character}:${pose}:empty layer`).toBe(true);
      }
      const period = petMotionPeriod(pose, character);
      const neutral = renderSpritePixels(layers, samplePetMotion(pose, 0, character), { x: 0, y: 0 });
      let changed = false;
      for (let step = 1; step < 32 && !changed; step++) {
        const rendered = renderSpritePixels(layers, samplePetMotion(pose, period * step / 32, character), { x: 0, y: 0 });
        changed = rendered.some((value, i) => value !== neutral[i]);
      }
      expect(changed, `${character}:${pose}:static rendered loop`).toBe(true);
    }
  });

  it("does not cut transparent seams through opaque interiors during motion or gaze", () => {
    const failures: { character: CompanionId; pose: keyof typeof PET_POSES; fraction: number; gaze: [number, number]; gaps: [number, number][] }[] = [];
    for (const { character, pose, base } of fixtures) {
      const layers = prepareSpritePixels(base, getPetRig(character, pose));
      const period = petMotionPeriod(pose, character);
      for (const fraction of [.2, .5, .69, .75]) for (const gazeX of [-1, 0, 1]) for (const gazeY of [-1, 0, 1]) {
        const motion = samplePetMotion(pose, period * fraction, character);
        const bodyX = Math.max(-1, Math.min(1, Math.round(motion.body.x)));
        const bodyY = Math.max(-1, Math.min(1, Math.round(motion.body.y)));
        const rendered = renderSpritePixels(layers, motion, { x: gazeX, y: gazeY });
        const gaps: [number, number][] = [];
        for (let y = 2; y < 58; y++) for (let x = 2; x < 58; x++) {
          const target = ((y + bodyY) * 60 + x + bodyX) * 4 + 3;
          // A full radius-two neighborhood is genuinely interior despite the
          // largest limb offset. Four cardinals alone include staircase contour
          // corners that legitimately move during a diagonal head translation.
          let interior = true;
          for (let dy = -2; dy <= 2 && interior; dy++) for (let dx = -2; dx <= 2; dx++) {
            if (base[((y + dy) * 60 + x + dx) * 4 + 3] < 230) { interior = false; break; }
          }
          if (interior && rendered[target] < 96) gaps.push([x, y]);
        }
        if (gaps.length) failures.push({ character, pose, fraction, gaze: [gazeX, gazeY], gaps });
      }
    }
    expect(failures.length, `First interior seam cases: ${JSON.stringify(failures.slice(0, 6))}`).toBe(0);
  });
});

import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { drawPet, PETS, POSES } from "../art/pets.mjs";
import { getPetRig, type PetRect } from "../src/lib/petRig";
import { petMotionPeriod, samplePetMotion } from "../src/lib/petMotion";
import { PART_NAMES, prepareSpritePixels, renderSpritePixels } from "../src/lib/petRenderer";
import { sheetParts } from "../src/lib/petSheet";
import { PET_POSES, type PetPose } from "../src/types/pixelPets";
import type { CompanionId } from "../src/types/appearance";

const characters = PETS as CompanionId[];
const poses = Object.keys(PET_POSES) as PetPose[];
const each = characters.flatMap(character => poses.map(pose => ({ character, pose })));

/** Reads the app's own sheets (unfiltered 8-bit RGBA). */
function sheet(character: CompanionId) {
  const png = readFileSync(new URL(`../src/assets/pets/pixel/${character}.png`, import.meta.url));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), chunks: Buffer[] = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    if (png.toString("ascii", at + 4, at + 8) === "IDAT") chunks.push(png.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const rows = inflateSync(Buffer.concat(chunks)), rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) rgba.set(rows.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4);
  return { rgba, width, height };
}
const sheets = Object.fromEntries(characters.map(c => [c, sheet(c)])) as Record<CompanionId, ReturnType<typeof sheet>>;
const layers = (character: CompanionId, pose: PetPose) =>
  prepareSpritePixels(sheetParts(sheets[character].rgba, sheets[character].width, PET_POSES[pose]), getPetRig(character, pose));
const within = (inner: PetRect, outer: PetRect, margin = 0) =>
  inner.x - margin >= outer.x && inner.y - margin >= outer.y
  && inner.x + inner.width + margin <= outer.x + outer.width && inner.y + inner.height + margin <= outer.y + outer.height;

describe("drawn companions", () => {
  it("ships exactly what the art code draws", () => {
    expect(POSES).toEqual(poses);
    // Drawing everything takes a while; a few poses of each pet catch a stale sheet.
    for (const { character, pose } of each.filter(e => ["idle", "sleep", "walkA", "focus"].includes(e.pose))) {
      const { rgba, width, height } = sheets[character];
      expect([width, height]).toEqual([80 * 16, 80 * 12]);
      const parts = sheetParts(rgba, width, PET_POSES[pose]);
      const art = drawPet(character, pose);
      const worn = drawPet(character, pose, true);
      const drawn = { ...art, tiredBody: worn.body, tiredHead: worn.head, ...Object.fromEntries(art.features.map((f, i) => [`feature${i + 1}`, f])) } as unknown as Record<string, { px: (string | null)[] } | null>;
      for (const name of PART_NAMES) for (let i = 0; i < 6400; i++) {
        const hex = drawn[name]?.px[i], p = parts[name];
        if (hex ? !p[i * 4 + 3] || parseInt(hex.slice(1), 16) !== (p[i * 4] << 16 | p[i * 4 + 1] << 8 | p[i * 4 + 2]) : p[i * 4 + 3]) throw new Error(`${character}:${pose}:${name} is out of date; run npm run art`);
      }
    }
  }, 60_000);
  it("keeps to the house rules: hard pixels and a limited palette", () => {
    for (const character of characters) {
      const { rgba } = sheets[character], colors = new Set<string>();
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i + 3] % 255) throw new Error(`${character} has a half-transparent pixel`);
        if (rgba[i + 3]) colors.add(rgba.subarray(i, i + 3).join());
      }
      // The pet, its props and the inside of its mouth.
      expect(colors.size, character).toBeLessThanOrEqual(70);
    }
  });
  it.each(each)("$character $pose stands on the floor and stays on the canvas however it moves", ({ character, pose }) => {
    const rig = getPetRig(character, pose), art = layers(character, pose);
    expect(rig.head.x - rig.maxHeadOffset).toBeGreaterThanOrEqual(0);
    expect(rig.head.x + rig.head.width + rig.maxHeadOffset).toBeLessThanOrEqual(80);
    let lowest = 0;
    for (const name of PART_NAMES) for (let i = 0; i < 6400; i++) if (art.parts[name][i * 4 + 3]) lowest = Math.max(lowest, Math.floor(i / 80));
    expect(lowest).toBeGreaterThanOrEqual(70); expect(lowest).toBeLessThanOrEqual(77);
    const neutral = renderSpritePixels(art, samplePetMotion(pose, 0, character), { x: 0, y: 0 });
    const period = petMotionPeriod(pose, character);
    expect(Array.from({ length: 31 }, (_, i) => renderSpritePixels(art, samplePetMotion(pose, period * (i + 1) / 32, character), { x: 0, y: 0 }))
      .some(frame => frame.some((v, i) => v !== neutral[i]))).toBe(true);
  });
  it("only looks around with open eyes, and never outside them", () => {
    for (const { character, pose } of each) {
      const rig = getPetRig(character, pose);
      if (["blink", "delighted", "sleep", "yawn", "stretch", "groom", "music"].includes(pose)) expect(rig.eyes, `${character}:${pose}`).toEqual([]);
      for (const eye of rig.eyes) { expect(within(eye.pupil, eye.bounds)).toBe(true); expect(within(eye.bounds, { x: 0, y: 0, width: 80, height: 80 }, 1)).toBe(true); }
    }
    expect(getPetRig("capybara", "idle").eyes).toHaveLength(1);
  });
  it("gives every working pose a prop and a paw to use it with", () => {
    for (const character of characters) for (const pose of ["focus", "read", "play"] as const) {
      const rig = getPetRig(character, pose);
      expect(rig.prop).not.toBeNull();
      expect(rig.leftPaw ?? rig.rightPaw).not.toBeNull();
    }
  });
  it("shows a different body at every energy level, for every pet", () => {
    for (const character of characters) {
      const art = layers(character, "idle");
      const looks = [1, 2, 3, 4, 5].map(e => renderSpritePixels(art, samplePetMotion("idle", 0, character), { x: 0, y: 0 }, false, null, false, e).join());
      expect(new Set(looks).size, character).toBe(5);
    }
  });
  it("is never cut off by the edge of its canvas, resting or mid-change", () => {
    for (const { character, pose } of each) for (const energy of [1, 5]) {
      const art = layers(character, pose), calm = samplePetMotion(pose, 0, character);
      for (const life of [{}, { stretch: 1.03, sway: 2, tween: { head: { x: 0, y: -3 }, leftPaw: { x: 0, y: -2 }, rightPaw: { x: 0, y: -2 }, prop: { x: 0, y: 0 } } }]) {
        const out = renderSpritePixels(art, calm, { x: 0, y: 0 }, false, null, false, energy, life);
        for (let x = 0; x < 80; x++) if (out[x * 4 + 3]) throw new Error(`${character}:${pose}:${energy} touches the top`);
        for (let y = 0; y < 80; y++) if (out[(y * 80) * 4 + 3] || out[(y * 80 + 79) * 4 + 3]) throw new Error(`${character}:${pose}:${energy} touches a side`);
      }
    }
  });
  it("draws four different silhouettes", () => {
    const shapes = characters.map(c => { const a = layers(c, "idle"); return Array.from({ length: 6400 }, (_, i) => PART_NAMES.some(n => a.parts[n][i * 4 + 3])); });
    for (let a = 0; a < characters.length; a++) for (let b = 0; b < a; b++) {
      const both = shapes[a].filter((v, i) => v && shapes[b][i]).length, either = shapes[a].filter((v, i) => v || shapes[b][i]).length;
      expect(both / either, `${characters[a]} and ${characters[b]}`).toBeLessThan(.8);
    }
  });
});

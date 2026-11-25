import { describe, expect, it } from "vitest";
import { samplePetMotion, type PetMotionFrame } from "../src/lib/petMotion";
import { prepareSpritePixels, renderSpritePixels, type SpriteParts } from "../src/lib/petRenderer";
import { sheetParts } from "../src/lib/petSheet";
import type { EyeAnchor, PetRect, PetRig } from "../src/lib/petRig";

type Rgba = [number, number, number, number];
const pixel = (pixels: Uint8ClampedArray, x: number, y: number) => Array.from(pixels.subarray((y * 80 + x) * 4, (y * 80 + x) * 4 + 4));
const raster = (...fills: [PetRect, Rgba][]) => {
  const pixels = new Uint8ClampedArray(25600);
  for (const [r, rgba] of fills) for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) pixels.set(rgba, (y * 80 + x) * 4);
  return pixels;
};
const FUR: Rgba = [190, 150, 110, 255], BODY: Rgba = [160, 120, 80, 255], WHITE: Rgba = [251, 244, 230, 255], PAW: Rgba = [48, 38, 58, 255], PROP: Rgba = [170, 185, 195, 255], INK = [16, 23, 22, 255];
const still = (): PetMotionFrame => samplePetMotion("focus", 0);
const eye = (extra: Partial<EyeAnchor> = {}): EyeAnchor => ({
  bounds: { x: 28, y: 19, width: 5, height: 5 }, pupil: { x: 29, y: 20, width: 2, height: 2 }, color: "#101716",
  byEnergy: null, shine: null, sclera: "#fbf4e6", lid: "#be966e", line: "#101716", ...extra,
});
function fixture(eyes: EyeAnchor[] = []) {
  const rig: PetRig = {
    head: { x: 18, y: 10, width: 25, height: 22 }, leftPaw: { x: 17, y: 35, width: 7, height: 8 }, rightPaw: { x: 37, y: 35, width: 7, height: 8 },
    prop: { x: 25, y: 37, width: 11, height: 12 }, eyes, feature: null, brows: eyes.map(e => e.bounds), asleep: false, maxHeadOffset: 1, maxPawOffset: 2,
  };
  const parts: SpriteParts = {
    body: raster([{ x: 20, y: 26, width: 21, height: 27 }, BODY]),
    head: raster([rig.head, FUR], ...eyes.filter(e => e.sclera).map((e): [PetRect, Rgba] => [e.bounds, WHITE])),
    leftPaw: raster([rig.leftPaw!, PAW]), rightPaw: raster([rig.rightPaw!, PAW]), prop: raster([rig.prop!, PROP]), feature1: raster(), feature2: raster(), feature3: raster(), feature4: raster(), feature5: raster(), tiredBody: raster([{ x: 20, y: 26, width: 21, height: 27 }, BODY]), tiredHead: raster([rig.head, FUR], ...eyes.filter(e => e.sclera).map((e): [PetRect, Rgba] => [e.bounds, WHITE])),
  };
  return prepareSpritePixels(parts, rig);
}

describe("pixel companion compositor", () => {
  it("stacks parts in order and never mutates the artwork", () => {
    const art = fixture(), before = art.parts.head.slice();
    const out = renderSpritePixels(art, still(), { x: 0, y: 0 });
    expect(pixel(out, 25, 28)).toEqual(FUR);
    expect(pixel(out, 22, 36)).toEqual(PAW);
    expect(pixel(out, 30, 40)).toEqual(PROP);
    renderSpritePixels(art, { ...still(), head: { x: 1, y: -1 } }, { x: 1, y: 1 });
    expect(art.parts.head).toEqual(before);
    expect(renderSpritePixels(art, still(), { x: 0, y: 0 })).toEqual(out);
  });
  it("shows the body, not a hole, where a part moved away", () => {
    const out = renderSpritePixels(fixture(), { ...still(), head: { x: 0, y: -1 }, leftPaw: { x: 0, y: 2 } }, { x: 0, y: 0 });
    expect(pixel(out, 25, 31)).toEqual(BODY);
    expect(pixel(out, 21, 35)).toEqual(BODY);
    expect(pixel(out, 18, 35)).toEqual([0, 0, 0, 0]);
    expect(pixel(out, 18, 44)).toEqual(PAW);
  });
  it("looks around inside the eye, and limits wild gaze", () => {
    const art = fixture([eye()]);
    const ahead = renderSpritePixels(art, still(), { x: 0, y: 0 });
    expect(pixel(ahead, 29, 20)).toEqual(INK);
    const right = renderSpritePixels(art, still(), { x: 1, y: 0 });
    // One for the head, one for the pupil.
    expect(pixel(right, 32, 20)).toEqual(INK);
    expect(pixel(right, 30, 20)).toEqual(WHITE);
    expect(renderSpritePixels(art, still(), { x: 900, y: 0 })).toEqual(right);
    const tight = fixture([eye({ pupil: { x: 28, y: 19, width: 5, height: 5 } })]);
    const left = renderSpritePixels(tight, still(), { x: -1, y: 0 });
    expect(pixel(left, 26, 21)).toEqual(FUR);
  });
  it("blinks to the lid colour with a soft line", () => {
    const out = renderSpritePixels(fixture([eye()]), { ...still(), blink: true }, { x: 1, y: 1 });
    expect(pixel(out, 28, 19)).toEqual(FUR);
    expect(pixel(out, 30, 21)).toEqual(INK);
  });
  it("keeps a catchlight with its eye", () => {
    const art = fixture([eye({ sclera: null, shine: "#ffffff" })]);
    for (const x of [-1, 0, 1]) expect(pixel(renderSpritePixels(art, still(), { x, y: 0 }), 30 + x * 2, 21)).toEqual([255, 255, 255, 255]);
  });
  it("tells the time with its body: a feature per energy, and pupils that can grow", () => {
    const art = fixture([eye({ byEnergy: [5, 4, 3, 2, 1].map(width => ({ x: 28, y: 20, width, height: 2 })) })]);
    art.rig.feature = "behind";
    art.parts.feature2 = raster([{ x: 2, y: 2, width: 1, height: 1 }, PAW]);
    const at = (energy: number) => renderSpritePixels(art, still(), { x: 0, y: 0 }, false, null, false, energy);
    expect(pixel(at(2), 2, 2)).toEqual(PAW);
    expect(pixel(at(3), 2, 2)).toEqual([0, 0, 0, 0]);
    expect(pixel(at(5), 30, 20)).toEqual(WHITE);
    // The head has sunk three rows by now.
    expect(Math.max(...pixel(at(1), 30, 24).slice(0, 3))).toBeLessThan(40);
    expect(at(-4)).toEqual(at(1)); expect(at(99)).toEqual(at(5));
  });
  it("looks more tired at every step, and not at all while asleep", () => {
    const art = fixture([eye()]), at = (energy: number) => renderSpritePixels(art, still(), { x: 0, y: 0 }, false, null, false, energy);
    const differs = (a: Uint8ClampedArray) => at(5).reduce((n, v, i) => n + (v !== a[i] ? 1 : 0), 0);
    expect(differs(at(4))).toBe(0);
    expect(differs(at(3))).toBeGreaterThan(0);
    expect(differs(at(2))).toBeGreaterThan(differs(at(3)));
    expect(differs(at(1))).toBeGreaterThan(differs(at(2)));
    art.rig.asleep = true;
    expect(at(1)).toEqual(at(5));
  });
  it("scowls only when mad", () => {
    const art = fixture([eye()]), calm = renderSpritePixels(art, still(), { x: 0, y: 0 });
    const mad = renderSpritePixels(art, still(), { x: 0, y: 0 }, false, null, true);
    expect(mad).not.toEqual(calm);
    for (let i = 0; i < 6400; i++) if (mad[i * 4] !== calm[i * 4]) expect(Math.floor(i / 80)).toBeLessThan(24);
  });
  it("limits page and screen effects to the prop", () => {
    const art = fixture(), plain = renderSpritePixels(art, still(), { x: 0, y: 0 });
    const lit = renderSpritePixels(art, { ...still(), pageTurn: true, screenPulse: true }, { x: 0, y: 0 });
    let changed = 0;
    for (let i = 0; i < 6400; i++) if (lit[i * 4] !== plain[i * 4]) { changed++; expect(pixel(plain, i % 80, Math.floor(i / 80))).toEqual(PROP); }
    expect(changed).toBeGreaterThan(0);
  });
  it("holds a phone without leaking off the canvas or covering its screen", () => {
    const out = renderSpritePixels(fixture(), { ...still(), body: { x: 1000, y: 1000 }, prop: { x: 1000, y: 1000 } }, { x: 1, y: -1 }, true);
    expect(out).toHaveLength(25600);
    expect(pixel(renderSpritePixels(fixture(), still(), { x: 0, y: 0 }, true), 51, 57)).toEqual([164, 197, 177, 255]);
  });
  it("rejects artwork of the wrong size", () => {
    const art = fixture();
    expect(() => prepareSpritePixels({ ...art.parts, head: new Uint8ClampedArray(16) }, art.rig)).toThrow("80×80");
  });
  it("cuts the right column and row out of a sheet", () => {
    const width = 1280, rgba = new Uint8ClampedArray(width * 960 * 4);
    rgba.set([1, 2, 3, 255], ((80 + 4) * width + 3 * 80 + 7) * 4);
    const parts = sheetParts(rgba, width, 3);
    expect(pixel(parts.head, 7, 4)).toEqual([1, 2, 3, 255]);
    expect(parts.body.some(Boolean)).toBe(false);
  });
});

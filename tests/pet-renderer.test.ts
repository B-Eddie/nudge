import { describe, expect, it } from "vitest";
import { samplePetMotion, type PetMotionFrame } from "../src/lib/petMotion";
import { prepareSpritePixels, renderSpritePixels } from "../src/lib/petRenderer";
import type { EyeAnchor, PetRect, PetRig } from "../src/lib/petRig";
import { getPetRig } from "../src/lib/petRig";

type Rgba = [number, number, number, number];
const pixel = (pixels: Uint8ClampedArray, x: number, y: number) => Array.from(pixels.subarray((y * 60 + x) * 4, (y * 60 + x) * 4 + 4));
const rect = (pixels: Uint8ClampedArray, bounds: PetRect, rgba: Rgba) => {
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) pixels.set(rgba, (y * 60 + x) * 4);
  }
};
const still = (): PetMotionFrame => samplePetMotion("focus", 0);
const rig = (eyes: EyeAnchor[] = []): PetRig => ({
  head: { x: 18, y: 10, width: 25, height: 22 },
  leftPaw: { x: 17, y: 35, width: 7, height: 8 },
  rightPaw: { x: 37, y: 35, width: 7, height: 8 },
  prop: { x: 25, y: 37, width: 11, height: 12 }, eyes,
  joints: { headOverlap: 2, maxHeadOffset: 1, maxPawOffset: 2 },
});
const eye = (): EyeAnchor => ({
  bounds: { x: 28, y: 19, width: 5, height: 5 },
  pupil: { x: 30, y: 21, width: 1, height: 1 },
  highlight: { x: 30, y: 20, width: 1, height: 1 },
  palette: { iris: "#d2ba90", pupil: "#101716", highlight: "#fff5da" },
  maxGazeX: 1, maxGazeY: 1,
});
function fixture(eyes: EyeAnchor[] = []) {
  const pixels = new Uint8ClampedArray(60 * 60 * 4), geometry = rig(eyes);
  rect(pixels, { x: 20, y: 28, width: 21, height: 25 }, [160, 120, 80, 255]);
  rect(pixels, geometry.head, [190, 150, 110, 255]);
  rect(pixels, geometry.leftPaw!, [38, 48, 58, 255]);
  rect(pixels, geometry.rightPaw!, [48, 38, 58, 255]);
  rect(pixels, geometry.prop!, [170, 185, 195, 255]);
  for (const anchor of eyes) {
    rect(pixels, anchor.bounds, [210, 186, 144, 255]);
    rect(pixels, anchor.pupil, [16, 23, 22, 255]);
    rect(pixels, anchor.highlight, [255, 245, 218, 255]);
  }
  return { pixels, geometry };
}

describe("pixel companion compositor", () => {
  it("reassembles the exact neutral raster and never mutates cached artwork", () => {
    const { pixels, geometry } = fixture();
    const original = pixels.slice(), layers = prepareSpritePixels(pixels, geometry);
    expect(renderSpritePixels(layers, still(), { x: 0, y: 0 })).toEqual(original);
    const motion = { ...still(), head: { x: 1, y: -1 }, leftPaw: { x: 0, y: 2 } };
    renderSpritePixels(layers, motion, { x: 0, y: 0 });
    expect(pixels).toEqual(original);
    expect(renderSpritePixels(layers, still(), { x: 0, y: 0 })).toEqual(original);
  });

  it("moves one head and paw without leaving a second former outline", () => {
    const { pixels, geometry } = fixture(), layers = prepareSpritePixels(pixels, geometry);
    const motion = { ...still(), head: { x: 1, y: 0 }, leftPaw: { x: 0, y: 2 } };
    const moved = renderSpritePixels(layers, motion, { x: 0, y: 0 });
    expect(pixel(moved, 18, 10)).toEqual([0, 0, 0, 0]);
    expect(pixel(moved, 19, 10)).toEqual([190, 150, 110, 255]);
    expect(pixel(moved, 17, 44)).toEqual([38, 48, 58, 255]);
    // Only interior shoulder joins remain. Exterior edges leave no old paw.
    expect(pixel(layers.joints.pixels, 20, 35)).toEqual([38, 48, 58, 255]);
    expect(pixel(layers.joints.pixels, 17, 35)).toEqual([0, 0, 0, 0]);
    expect(pixel(layers.joints.pixels, 17, 38)).toEqual([0, 0, 0, 0]);
    expect(pixel(layers.joints.pixels, 18, 15)).toEqual([0, 0, 0, 0]);
  });

  it("keeps translucent edges from accumulating opacity at retained fur joints", () => {
    const { pixels, geometry } = fixture();
    rect(pixels, { x: 18, y: 31, width: 1, height: 1 }, [120, 100, 80, 100]);
    const layers = prepareSpritePixels(pixels, geometry);
    expect(pixel(layers.body.pixels, 18, 31)).toEqual([0, 0, 0, 0]);
    expect(pixel(renderSpritePixels(layers, still(), { x: 0, y: 0 }), 18, 31)).toEqual([120, 100, 80, 100]);
  });

  it("fills interior cut lines even when real artwork opacity is252 rather than255", () => {
    const { pixels, geometry } = fixture();
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) pixels[index] = 252;
    const layers = prepareSpritePixels(pixels, geometry);
    // Neutral composition must remain byte-for-byte identical, without double
    // alpha over fur joins. Backfill is used only when an articulated part
    // actually exposes a cut, rather than permanently painting a second head.
    expect(renderSpritePixels(layers, still(), { x: 0, y: 0 })).toEqual(pixels);
    for (const x of [-1, 0, 1]) {
      const moved = renderSpritePixels(layers, { ...still(), head: { x, y: -1 } }, { x: 0, y: 0 });
      for (let shoulderX = 20; shoulderX < 41; shoulderX++) {
        expect(pixel(moved, shoulderX, 31)[3], `neck(${shoulderX},31)`).toBeGreaterThanOrEqual(230);
      }
    }
  });

  it("bridges side cuts where an arm or prop intersects the head, not just the bottom neck row", () => {
    const pixels = new Uint8ClampedArray(60 * 60 * 4);
    rect(pixels, { x: 18, y: 14, width: 27, height: 36 }, [175, 140, 110, 252]);
    const geometry: PetRig = {
      ...rig(), head: { x: 18, y: 14, width: 27, height: 20 }, leftPaw: null,
      rightPaw: { x: 36, y: 25, width: 9, height: 19 }, prop: { x: 22, y: 30, width: 14, height: 18 },
    };
    const layers = prepareSpritePixels(pixels, geometry);
    const shifted = renderSpritePixels(layers, { ...still(), head: { x: 1, y: -1 }, rightPaw: { x: 1, y: 2 } }, { x: 0, y: 0 });
    for (let y = 25; y < 33; y++) expect(pixel(shifted, 36, y)[3], `arm/head(${36},${y})`).toBeGreaterThanOrEqual(230);
    for (let x = 23; x < 35; x++) expect(pixel(shifted, x, 29)[3], `prop/head(${x},29)`).toBeGreaterThanOrEqual(230);
  });

  it("fills diagonal corners beside a head/paw cut when the head looks up and sideways", () => {
    const geometry = getPetRig("panda", "curious"), pixels = new Uint8ClampedArray(60 * 60 * 4);
    rect(pixels, { x: 15, y: 15, width: 36, height: 39 }, [180, 140, 110, 252]);
    const layers = prepareSpritePixels(pixels, geometry);
    // (39,36) is diagonally adjacent to the right-paw corner at(40,37).
    // Four cardinal-neighbor cut detection misses that exposed corner.
    const shifted = renderSpritePixels(layers, samplePetMotion("curious", 0), { x: -1, y: -1 });
    expect(pixel(shifted, 39, 36)[3]).toBeGreaterThanOrEqual(230);
  });

  it("restores the curious panda's missing right-eye catchlight at neutral gaze", () => {
    const anchor: EyeAnchor = {
      ...eye(), bounds: { x: 38, y: 22, width: 5, height: 6 },
      pupil: { x: 39, y: 23, width: 3, height: 4 },
      highlight: { x: 40, y: 23, width: 1, height: 1 },
    };
    const { pixels, geometry } = fixture([anchor]);
    rect(pixels, anchor.highlight, [8, 6, 9, 255]);
    const fixed = renderSpritePixels(prepareSpritePixels(pixels, geometry), still(), { x: 0, y: 0 });
    expect(pixel(fixed, 40, 23)).toEqual([255, 245, 218, 255]);
    // Repair only the catchlight; the surrounding shaded panda eye survives.
    expect(pixel(fixed, 41, 25)).toEqual(pixel(pixels, 41, 25));
  });

  it("retains a bright pixel in both actual curious panda eye bounds for all nine gaze directions", () => {
    const geometry = getPetRig("panda", "curious"), pixels = new Uint8ClampedArray(60 * 60 * 4);
    rect(pixels, geometry.head, [235, 221, 190, 255]);
    for (const anchor of geometry.eyes) rect(pixels, anchor.bounds, [8, 6, 9, 255]);
    const layers = prepareSpritePixels(pixels, geometry);
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
      const rendered = renderSpritePixels(layers, samplePetMotion("curious", 0), { x, y });
      for (const anchor of geometry.eyes) {
        let highlights = 0;
        for (let py = anchor.bounds.y + y; py < anchor.bounds.y + anchor.bounds.height + y; py++) {
          for (let px = anchor.bounds.x + x; px < anchor.bounds.x + anchor.bounds.width + x; px++) {
            if (pixel(rendered, px, py).join() === "255,245,218,255") highlights++;
          }
        }
        expect(highlights, `gaze(${x},${y}) eye${anchor.bounds.x}`).toBeGreaterThan(0);
      }
    }
  });

  it("tracks pupils and their catchlights together, clipped inside the eye's rounded shape", () => {
    const { pixels, geometry } = fixture([eye()]), layers = prepareSpritePixels(pixels, geometry);
    const lookingRight = renderSpritePixels(layers, still(), { x: 1, y: 0 });
    expect(pixel(lookingRight, 32, 21)).toEqual([16, 23, 22, 255]);
    expect(pixel(lookingRight, 32, 20)).toEqual([255, 245, 218, 255]);
    // Corners are outside the rounded eye; they retain their original texture
    // after the one-pixel head shift instead of becoming rectangular patches.
    expect(pixel(lookingRight, 29, 19)).toEqual(pixel(pixels, 28, 19));
    const extreme = renderSpritePixels(layers, still(), { x: 1000, y: -1000 });
    const bounded = renderSpritePixels(layers, still(), { x: 1, y: -1 });
    expect(extreme).toEqual(bounded);
    renderSpritePixels(layers, still(), { x: -1, y: 1 });
    expect(renderSpritePixels(layers, still(), { x: 1, y: 0 })).toEqual(lookingRight);
  });

  it("blinks without a bright catchlight and never opens closed or sleeping eyes for gaze", () => {
    const { pixels, geometry } = fixture([eye()]);
    const blinking = renderSpritePixels(prepareSpritePixels(pixels, geometry), { ...still(), blink: true }, { x: 1, y: 1 });
    expect(pixel(blinking, 30, 20)).toEqual([190, 150, 110, 255]);
    expect(pixel(blinking, 30, 21)).toEqual([16, 23, 22, 255]);
    const closed = fixture(), closedLayers = prepareSpritePixels(closed.pixels, closed.geometry);
    const sleeping = samplePetMotion("sleep", 2500);
    expect(renderSpritePixels(closedLayers, sleeping, { x: -1, y: 1 }))
      .toEqual(renderSpritePixels(closedLayers, sleeping, { x: 0, y: 0 }));
  });

  it("limits page and screen effects to opaque prop pixels", () => {
    const { pixels, geometry } = fixture(), layers = prepareSpritePixels(pixels, geometry);
    const normal = renderSpritePixels(layers, still(), { x: 0, y: 0 });
    const detailed = renderSpritePixels(layers, { ...still(), pageTurn: true, screenPulse: true }, { x: 0, y: 0 });
    let changes = 0;
    for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
      if (pixel(normal, x, y).join() === pixel(detailed, x, y).join()) continue;
      changes++;
      expect(x).toBeGreaterThanOrEqual(geometry.prop!.x);
      expect(x).toBeLessThan(geometry.prop!.x + geometry.prop!.width);
      expect(y).toBeGreaterThanOrEqual(geometry.prop!.y);
      expect(y).toBeLessThan(geometry.prop!.y + geometry.prop!.height);
      expect(pixel(normal, x, y)[3]).toBeGreaterThan(0);
    }
    expect(changes).toBeGreaterThan(0);
  });

  it("draws an optional phone without leaking outside the 60px canvas", () => {
    const { pixels, geometry } = fixture(), layers = prepareSpritePixels(pixels, geometry);
    const motion = { ...still(), body: { x: 1000, y: 1000 }, prop: { x: 1000, y: 1000 } };
    const withPhone = renderSpritePixels(layers, motion, { x: 1, y: -1 }, true);
    expect(withPhone).toHaveLength(60 * 60 * 4);
    for (let coordinate = 0; coordinate < 60; coordinate++) {
      expect(pixel(withPhone, coordinate, 0)[3]).toBe(0);
      expect(pixel(withPhone, coordinate, 59)[3]).toBe(0);
      expect(pixel(withPhone, 0, coordinate)[3]).toBe(0);
      expect(pixel(withPhone, 59, coordinate)[3]).toBe(0);
    }
    expect(pixel(withPhone, 46, 48)[3]).toBe(255);
    expect(() => prepareSpritePixels(new Uint8ClampedArray(16), geometry)).toThrow("60×60");
  });

  it("keeps a phone screen readable in front of the actual crab claw while its tapping grip moves", () => {
    const geometry = getPetRig("crab", "curious"), pixels = new Uint8ClampedArray(60 * 60 * 4);
    rect(pixels, geometry.head, [205, 105, 70, 252]);
    rect(pixels, geometry.rightPaw!, [210, 80, 45, 252]);
    const layers = prepareSpritePixels(pixels, geometry);
    const neutral = renderSpritePixels(layers, samplePetMotion("curious", 0, "crab", true), { x: 0, y: 0 }, true);
    expect(pixel(neutral, 43, 43)).toEqual([164, 197, 177, 255]);
    expect(pixel(neutral, 43, 42)).toEqual([232, 223, 189, 255]);
    const tapping = renderSpritePixels(layers, samplePetMotion("curious", 960, "crab", true), { x: 0, y: 0 }, true);
    expect(pixel(tapping, 43, 43)).toEqual([232, 223, 189, 255]);
    expect(pixel(tapping, 55, 54)[3]).toBeGreaterThan(0);
    expect(pixel(neutral, 55, 54)[3]).toBe(0);
    // The narrow grip can cover the case, never the actual display.
    expect(pixel(tapping, 43, 46)[3]).toBe(255);
  });
});

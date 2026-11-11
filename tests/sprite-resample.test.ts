import { describe, expect, it } from "vitest";
import { resampleFrame, spriteResolution } from "../src/lib/spriteResample";

function solid(width: number, height: number, rgba: [number, number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) pixels.set(rgba, i * 4);
  return pixels;
}
const at = (pixels: Uint8ClampedArray, size: number, x: number, y: number) =>
  Array.from(pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4));

describe("area-filtered sprite reduction", () => {
  it("averages each footprint instead of picking one arbitrary pixel", () => {
    // Alternating black/white columns: nearest-neighbour would give pure black or white.
    const source = new Uint8ClampedArray(4 * 4 * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) source.set(x % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], (y * 4 + x) * 4);
    const out = new Uint8ClampedArray(2 * 2 * 4);
    resampleFrame(source, 4, 4, out, 2, { x: 0, y: 0, width: 2, height: 2 });
    expect(at(out, 2, 0, 0)).toEqual([128, 128, 128, 255]);
  });

  it("produces only fully opaque or fully clear pixels, so there is no halo", () => {
    const source = solid(4, 2, [200, 100, 50, 255]);
    for (let y = 0; y < 2; y++) for (let x = 2; x < 4; x++) source[(y * 4 + x) * 4 + 3] = 0;
    source[(0 * 4 + 1) * 4 + 3] = 0; // left footprint is 3/4 covered, right is empty
    const out = new Uint8ClampedArray(2 * 2 * 4);
    resampleFrame(source, 4, 2, out, 2, { x: 0, y: 0, width: 2, height: 1 });
    expect(at(out, 2, 0, 0)).toEqual([200, 100, 50, 255]);
    expect(at(out, 2, 1, 0)).toEqual([0, 0, 0, 0]);
  });

  it("ignores the pale semi-transparent fringe when a footprint has solid colour", () => {
    const source = new Uint8ClampedArray(2 * 1 * 4);
    source.set([40, 30, 20, 255], 0);
    source.set([250, 245, 240, 140], 4); // light anti-aliasing from the generated sheet
    const out = new Uint8ClampedArray(1 * 1 * 4);
    resampleFrame(source, 2, 1, out, 1, { x: 0, y: 0, width: 1, height: 1 });
    expect(at(out, 1, 0, 0)).toEqual([40, 30, 20, 255]);
  });

  it("mirrors about the whole canvas, matching the walk-pose calibration", () => {
    const source = solid(1, 1, [9, 9, 9, 255]);
    const out = new Uint8ClampedArray(6 * 6 * 4);
    resampleFrame(source, 1, 1, out, 6, { x: 1, y: 0, width: 1, height: 1 }, true);
    expect(at(out, 6, 4, 0)).toEqual([9, 9, 9, 255]);
  });

  it("chooses about two physical pixels per art pixel", () => {
    expect(spriteResolution(120, 2)).toBe(2);
    expect(spriteResolution(180, 2)).toBe(3);
    expect(spriteResolution(60, 2)).toBe(1);
    expect(spriteResolution(120, 1)).toBe(1);
    expect(spriteResolution(120, 3)).toBe(3);
    expect(spriteResolution(120, NaN)).toBe(1);
  });
});

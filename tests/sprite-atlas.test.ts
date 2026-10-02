import { describe, expect, it } from "vitest";
import { framePixels, isolateAtlas } from "../src/lib/spriteAtlas";
import { mirrorWalkingFrame, PIXEL_FRAMES } from "../src/types/pixelPets";
import { petSize } from "../src/types/petSize";

function atlasFixture() {
  const width = 160, height = 160;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const paint = (x: number, y: number, w: number, h: number, red: number) => {
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) rgba.set([red, 80, 50, 255], (py * width + px) * 4);
  };
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) paint(col * 40 + 10, row * 40 + 12, 12, 20, row * 4 + col + 1);
  // A complete ear crosses the nominal cell boundary and must stay with its body.
  paint(14, 36, 4, 7, 1);
  // Detached expression detail is close to the first pose, not part of its neighbor.
  paint(25, 13, 4, 5, 1);
  return { rgba, width, height };
}
describe("isolated sprite artwork", () => {
  it("keeps off-grid artwork and expression details while excluding other frames", () => {
    const { rgba, width, height } = atlasFixture();
    const { frames, labels } = isolateAtlas(rgba, width, height);
    expect(frames).toHaveLength(16);
    expect(frames[0].y + frames[0].height).toBe(43);
    expect(frames[0].components.length).toBeGreaterThan(1);
    for (let i = 0; i < frames.length; i++) {
      const pixels = framePixels(rgba, width, labels, frames[i]);
      const colors = new Set<number>();
      for (let p = 0; p < pixels.length; p += 4) if (pixels[p + 3]) colors.add(pixels[p]);
      expect([...colors]).toEqual([i + 1]);
    }
  });
  it("rejects incomplete atlases instead of sampling random rectangles", () => {
    expect(() => isolateAtlas(new Uint8ClampedArray(160 * 160 * 4), 160, 160)).toThrow("sixteen");
  });
  it("has bounded metadata for all eighty actual poses, including previously clipped ears", () => {
    for (const frames of Object.values(PIXEL_FRAMES)) for (const rect of frames) {
      expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(1254);
      expect(rect.y + rect.height).toBeLessThanOrEqual(1254);
    }
    expect(PIXEL_FRAMES.cat[10].y).toBeLessThan(627);
    expect(PIXEL_FRAMES.cat[13].y).toBeLessThan(940);
    expect(PIXEL_FRAMES.red_panda[7].x).toBeLessThan(940);
  });
});
describe("walking and size", () => {
  it("normalizes the opposite cat and red panda walking steps to one direction", () => {
    for (const character of ["cat", "red_panda"] as const) {
      expect(mirrorWalkingFrame(character, "walkA")).toBe(true);
      expect(mirrorWalkingFrame(character, "walkB")).toBe(false);
      expect(mirrorWalkingFrame(character, "idle")).toBe(false);
    }
    expect(mirrorWalkingFrame("panda", "walkA")).toBe(mirrorWalkingFrame("panda", "walkB"));
    expect(mirrorWalkingFrame("capybara", "walkA")).toBe(false);
  });
  it("defaults legacy settings and clamps invalid character sizes", () => {
    expect(petSize()).toBe(120); expect(petSize(Number.NaN)).toBe(120);
    expect(petSize(20)).toBe(60); expect(petSize(2000)).toBe(180);
    expect(petSize(144)).toBe(144);
  });
});

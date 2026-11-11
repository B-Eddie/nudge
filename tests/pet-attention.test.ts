import { describe, expect, it } from "vitest";
import { petAttentionAt } from "../src/lib/petAttention";

const bounds = { left: 20, top: 40, width: 120, height: 120 };
describe("cursor attention across the desktop", () => {
  it("notices pointers beyond the old 162px boundary and outside the overlay", () => {
    expect(petAttentionAt(-200, 100, bounds)).toEqual({ x: -1, y: 0, near: true, tracking: true });
    expect(petAttentionAt(80, -200, bounds)).toEqual({ x: 0, y: -1, near: true, tracking: true });
    expect(petAttentionAt(-400, 100, bounds)).toEqual({ x: -1, y: 0, near: false, tracking: true });
  });
  it("changes gaze around a distant arc rather than sticking to the same diagonal", () => {
    const above = petAttentionAt(280, -700, bounds);
    const beside = petAttentionAt(880, -100, bounds);
    expect(above).toEqual({ x: .24, y: -.97, near: false, tracking: true });
    expect(beside).toEqual({ x: .97, y: -.24, near: false, tracking: true });
  });
  it("keeps an ample attention radius for small pets and scales up for large pets", () => {
    for (const size of [60, 120, 180]) {
      const rect = { left: 0, top: 0, width: size, height: size };
      const radius = Math.max(360, size * 3);
      expect(petAttentionAt(size / 2 + radius - 1, size / 2, rect).near).toBe(true);
      expect(petAttentionAt(size / 2 + radius + 1, size / 2, rect).near).toBe(false);
    }
  });
  it("ignores missing geometry and invalid cursor coordinates", () => {
    for (const x of [NaN, Infinity]) expect(petAttentionAt(x, 0, bounds).tracking).toBe(false);
    expect(petAttentionAt(0, 0).tracking).toBe(false);
  });
});

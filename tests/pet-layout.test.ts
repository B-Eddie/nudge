import { describe, expect, it } from "vitest";
import { placePetMenu, placePetPopover, resizePetAnchor } from "../src/hooks/usePetLayout";
import { isHelperApp } from "../src/types/appVisibility";

describe("pet popover placement", () => {
  const viewport = { width: 300, height: 300 };
  const menu = { width: 150, height: 140 };
  it("preserves the foot point when a character is resized in either direction", () => {
    for (const oldSize of [60, 120, 180]) for (const size of [60, 120, 180]) {
      const anchor = { left: 180, top: 150, size: oldSize };
      const next = resizePetAnchor(anchor, size);
      expect(next.left + size / 2).toBe(anchor.left + oldSize / 2);
      expect(next.top + size * .9).toBeCloseTo(anchor.top + oldSize * .9);
    }
  });
  it("keeps the three-dot control beside the pet, including at 50% size and either edge", () => {
    for (const size of [60, 120, 180]) {
      const viewport = { width: size + 332, height: Math.max(300, size + 232) };
      for (const left of [0, viewport.width - size]) {
        const p = placePetMenu({ left, top: viewport.height - size, width: size, height: size }, viewport);
        expect(p.left).toBeGreaterThanOrEqual(8);
        expect(p.left + 28).toBeLessThanOrEqual(viewport.width - 8);
        expect(p.top + 24).toBeLessThanOrEqual(viewport.height - 8);
        expect(p.left >= left + size || p.left + 28 <= left).toBe(true);
      }
    }
  });
  it("flips sides when the pet moves from the left edge to the right edge", () => {
    expect(placePetPopover({ left: 0, top: 150, width: 120, height: 120 }, menu, viewport).left).toBe(128);
    expect(placePetPopover({ left: 180, top: 150, width: 120, height: 120 }, menu, viewport).left).toBe(22);
  });
  it("uses vertical room for a pet in the middle and keeps panels inside the canvas", () => {
    const pet = { left: 90, top: 150, width: 120, height: 120 };
    expect(placePetPopover(pet, menu, viewport)).toEqual({ left: 75, top: 8 });
    for (const top of [0, 90, 180]) for (const left of [0, 90, 180]) {
      const p = placePetPopover({ left, top, width: 120, height: 120 }, { width: 226, height: 180 }, viewport);
      expect(p.left).toBeGreaterThanOrEqual(8);
      expect(p.top).toBeGreaterThanOrEqual(8);
      expect(p.left + 226).toBeLessThanOrEqual(292);
      expect(p.top + 180).toBeLessThanOrEqual(292);
    }
  });
  it("keeps a full action menu outside resized pets at corners and the canvas center", () => {
    for (const size of [60, 120, 180]) {
      const viewport = { width: size + 332, height: Math.max(300, size + 232) };
      for (const left of [0, 166, viewport.width - size]) for (const top of [0, viewport.height - size]) {
        const pet = { left, top, width: size, height: size };
        const menu = { width: 150, height: 192 };
        const p = placePetPopover(pet, menu, viewport);
        expect(p.left).toBeGreaterThanOrEqual(8); expect(p.top).toBeGreaterThanOrEqual(8);
        expect(p.left + menu.width).toBeLessThanOrEqual(viewport.width - 8);
        expect(p.top + menu.height).toBeLessThanOrEqual(viewport.height - 8);
        const overlap = Math.max(0, Math.min(left + size, p.left + menu.width) - Math.max(left, p.left))
          * Math.max(0, Math.min(top + size, p.top + menu.height) - Math.max(top, p.top));
        expect(overlap).toBe(0);
      }
    }
  });
});

describe("helper app visibility", () => {
  it("uses native metadata over name heuristics", () => {
    expect(isHelperApp("com.test.app", { name: "Menu Utility", category: "unknown", is_helper: true })).toBe(true);
    expect(isHelperApp("com.test.agent", { name: "Agent", category: "unknown", is_helper: false })).toBe(false);
  });
  it("recognizes legacy helpers without hiding normal apps", () => {
    for (const name of ["Chrome Helper (Renderer)", "Safari Web Content", "Crashpad Handler"]) {
      expect(isHelperApp("com.test.app", { name, category: "unknown" })).toBe(true);
    }
    expect(isHelperApp("com.apple.Safari", { name: "Safari", category: "unknown" })).toBe(false);
  });
});

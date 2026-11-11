// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, normalizeTheme, resolveTheme } from "../src/types/appearance";

let dark = false;
const listeners = new Set<() => void>();
window.matchMedia = ((query: string) => ({
  get matches() { return query.includes("dark") && dark; }, media: query,
  addEventListener: (_: string, fn: () => void) => listeners.add(fn),
  removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
})) as unknown as typeof window.matchMedia;
const flip = (value: boolean) => { dark = value; listeners.forEach(fn => fn()); };
afterEach(() => { applyTheme("bamboo"); flip(false); });

describe("themes", () => {
  it("keeps saved choices and understands Match Mac", () => {
    expect(normalizeTheme("night_garden")).toBe("night_garden");
    expect(normalizeTheme("system")).toBe("system");
    expect(normalizeTheme("mystery")).toBe("bamboo");
    expect(resolveTheme("system", true)).toBe("night_garden");
    expect(resolveTheme("system", false)).toBe("bamboo");
    expect(resolveTheme("bamboo", true)).toBe("bamboo");
  });
  it("follows macOS live when set to Match Mac, and stops when a fixed theme is chosen", () => {
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBe("bamboo");
    flip(true);
    expect(document.documentElement.dataset.theme).toBe("night_garden");
    applyTheme("bamboo");
    flip(false); flip(true);
    expect(document.documentElement.dataset.theme).toBe("bamboo");
    expect(listeners.size).toBe(0);
  });
});

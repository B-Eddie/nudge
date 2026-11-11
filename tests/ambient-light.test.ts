import { describe, expect, it } from "vitest";
import { ambientLightAt } from "../src/hooks/useAmbientLight";

describe("ambient light", () => {
  it.each([[5, "night"], [6, "day"], [17, "day"], [18, "dusk"], [20, "dusk"], [21, "night"], [0, "night"]] as const)(
    "%i:00 is %s", (hour, light) => {
      expect(ambientLightAt(new Date(2026, 10, 10, hour, 30))).toBe(light);
    });
});

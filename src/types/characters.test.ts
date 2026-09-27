import { describe, expect, it } from "vitest";
import { CHARACTERS, normalizeCharacter } from "./characters";

const assets = import.meta.glob("../assets/characters/**/*.png", { eager: true, query: "?url", import: "default" });

describe("character roster", () => {
  it("preserves the original panda for old or unknown settings", () => {
    expect(normalizeCharacter(undefined)).toBe("panda");
    expect(normalizeCharacter("unknown")).toBe("panda");
    expect(CHARACTERS).toHaveLength(4);
  });
  it("ships both frames for every custom pet state and energy bundle", () => {
    for (const { id } of CHARACTERS) {
      if (id === "panda") continue;
      for (const state of ["idle", "computer"]) {
        for (const tier of [1, 2, 3, 4]) {
          for (const frame of [1, 2]) {
            expect(assets[`../assets/characters/${id}/${tier}/${state}/${frame}.png`]).toBeTruthy();
          }
        }
      }
      for (const state of ["sleep", "nudge"]) {
        for (const frame of [1, 2]) {
          expect(assets[`../assets/characters/${id}/${state}/${frame}.png`]).toBeTruthy();
        }
      }
    }
  });
});

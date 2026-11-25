import { describe, expect, it } from "vitest";
import { CAST, canExpand, castAsk, castSays, castThought } from "../src/lib/cast";
import { SIGNATURE, WORN } from "../src/lib/accessoryArt";
import { artWidth } from "../src/lib/pixelArt";
import type { CompanionId } from "../src/types/appearance";

const PETS = Object.keys(CAST) as CompanionId[];

describe("the cast", () => {
  it.each(PETS)("%s has something for every moment, short enough for a bubble", pet => {
    for (const moment of ["snoozed", "rested", "spent"] as const) expect(castSays(pet, moment, .99)).toBeTruthy();
    for (let energy = 1; energy <= 5; energy++) {
      expect(castThought(pet, energy, .99)).toBeTruthy();
      expect(castAsk(pet, energy).length).toBeLessThan(48);
    }
    const lines = [...CAST[pet].fresh, ...CAST[pet].tired, ...CAST[pet].done, ...CAST[pet].snoozed, ...CAST[pet].rested];
    for (const line of lines) expect(line.length, line).toBeLessThan(80);
    expect(CAST[pet].resting("3 minutes")).toContain("3 minutes");
  });
  it("gives every name once", () => {
    expect(new Set(PETS.map(p => CAST[p].name)).size).toBe(PETS.length);
  });
  it.each(PETS)("%s wears its own signature gear, drawn on the pet's grid", pet => {
    const gear = WORN[SIGNATURE[pet]];
    expect(gear.rows.every(row => row.length === artWidth(gear))).toBe(true);
    for (const row of gear.rows) for (const cell of row) if (cell !== ".") expect(gear.palette[cell], `${pet}: ${cell}`).toBeTruthy();
  });
  it.each(Object.keys(WORN))("%s is drawn with even rows and known colours", id => {
    const art = WORN[id as keyof typeof WORN];
    expect(art.rows.every(row => row.length === artWidth(art))).toBe(true);
    for (const row of art.rows) for (const cell of row) if (cell !== ".") expect(art.palette[cell], `${id}: ${cell}`).toBeTruthy();
  });
  it("needs rest energy for a full expansion", () => {
    expect(canExpand(5)).toBe(true);
    expect(canExpand(3)).toBe(true);
    expect(canExpand(2)).toBe(false);
  });
});

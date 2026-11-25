import { describe, expect, it } from "vitest";
import { forgetHistory, newCompanion, readCompanion, unlocked } from "../src/lib/companion";
import { buildPalette, encodeGif, lzw } from "../src/lib/gif";
import { addGrudge, beatGrudge, dropGrudge, facedGrudge, findGrudge, grudgeDue, MAX_GRUDGES, shortLabel, targetOf } from "../src/lib/grudges";
import { placeFrom } from "../src/lib/sites";
import { flight, FLIGHT_MS, tantrumAt, tantrumLength, TANTRUMS, throwTimes, ULTIMATES } from "../src/lib/tantrum";
import { AMMO, SPLATS } from "../src/lib/tantrumArt";
import { napLine, TECHNIQUES } from "../src/lib/napjutsu";
import { drawUltimate, ULTIMATE_MS } from "../src/lib/ultimate";
import { getPetRig } from "../src/lib/petRig";
import { SHEET_POSES } from "../src/web/madSheet";
import type { CompanionId } from "../src/types/appearance";

const PETS = Object.keys(TANTRUMS) as CompanionId[];
const browser = { name: "Zen", category_label: "Productivity" };

describe("tantrums", () => {
  it.each(PETS)("%s throws everything before it is done, and can scowl throughout", pet => {
    const length = tantrumLength(pet);
    expect(length).toBeLessThan(8000);
    expect(throwTimes(pet).length).toBeGreaterThan(0);
    // The native sheet closes after twelve seconds; everything must be over by then.
    expect(Math.max(...throwTimes(pet)) + FLIGHT_MS + 1600 + 1200).toBeLessThan(11_000);
    for (const step of TANTRUMS[pet]) {
      if (!step.calm) expect(getPetRig(pet, step.pose).brows.length, step.pose).toBeGreaterThan(0);
      expect(SHEET_POSES.some(s => s.pose === step.pose && s.mad === !step.calm), step.pose).toBe(true);
    }
    expect(tantrumAt(pet, 0)?.index).toBe(0);
    expect(tantrumAt(pet, length)).toBeNull();
    expect(AMMO[pet] && SPLATS[pet]).toBeTruthy();
  });
  it("lands exactly on target", () => {
    expect(flight({ x: 0, y: 500 }, { x: 300, y: 20 }, 0)).toEqual({ x: 0, y: 500 });
    const end = flight({ x: 0, y: 500 }, { x: 300, y: 20 }, 1);
    expect(end.x).toBeCloseTo(300); expect(end.y).toBeCloseTo(20);
  });
});

describe("Do-Nothing Expansions", () => {
  it.each(PETS)("%s finishes before its sheet closes, in poses it can draw", pet => {
    expect(tantrumLength(pet, true)).toBe(ULTIMATE_MS);
    expect(ULTIMATE_MS).toBeLessThan(11_000);
    for (const step of ULTIMATES[pet]) expect(SHEET_POSES.some(s => s.pose === step.pose), step.pose).toBe(true);
    expect(tantrumAt(pet, ULTIMATE_MS, true)).toBeNull();
    expect(TECHNIQUES[pet].name.length).toBeLessThan(34);
  });
  it.each(PETS)("%s flashes at most twice, well apart", pet => {
    const flashes: number[] = [];
    for (let t = 0; t < ULTIMATE_MS; t += 20) {
      let full = 0;
      const ctx = new Proxy({ globalAlpha: 1 } as Record<string, unknown>, {
        get: (o, k) => k === "fillRect" ? (x: number, y: number, w: number, h: number) => { if (x === 0 && y === 0 && w === 40 && h === 30 && ctx.fillStyle === TECHNIQUES[pet].glow && (o.globalAlpha as number) > .3) full++; }
          : k === "measureText" ? () => ({ width: 1 }) : k in o ? o[k as string] : () => undefined,
        set: (o, k, v) => { o[k as string] = v; return true; },
      }) as unknown as CanvasRenderingContext2D;
      drawUltimate(ctx, { character: pet, width: 40, height: 30, pet: { x: 5, y: 25 }, target: { x: 8, y: 4, width: 28, height: 18 } }, t);
      if (full) flashes.push(t);
    }
    const starts = flashes.filter((t, i) => !i || t - flashes[i - 1] > 60);
    expect(starts).toHaveLength(2);
    expect(starts[1] - starts[0]).toBeGreaterThan(1000);
  });
  it("has something to say at every energy", () => {
    for (let e = 1; e <= 5; e++) expect(napLine(e, .99)).toBeTruthy();
    expect(napLine(99, 0)).toBe(napLine(5, 0));
  });
});

describe("grudges", () => {
  it("names a feed by its site and a document by its title", () => {
    expect(targetOf(placeFrom("Inbox (4) - me - Gmail", true), browser)?.label).toBe("Gmail");
    expect(targetOf(placeFrom("Essay draft - Google Docs", true), browser)).toEqual({ label: "Essay draft", key: "essay draft" });
    expect(targetOf(null, { name: "Xcode", category_label: "Developer Tools" })?.label).toBe("Xcode");
  });
  it("never names anything private", () => {
    expect(targetOf(placeFrom("My Bank - Accounts", true, [{ contains: "My Bank", category: "Private" }]), browser)).toBeNull();
    expect(targetOf(null, { name: "Diary", category_label: "Private" })).toBeNull();
    const grudges = addGrudge([], { label: "Diary", key: "diary" }, 0);
    expect(findGrudge(grudges, null, { name: "Diary", category_label: "Private" })).toBeNull();
  });
  it("recognizes them again, once in a while, and forgives", () => {
    let list = addGrudge([], { label: "Essay draft", key: "essay draft" }, 1000);
    list = addGrudge(list, { label: "Essay draft", key: "essay draft" }, 2000);
    expect(list).toHaveLength(1);
    const found = findGrudge(list, placeFrom("Essay draft v2 - Google Docs", true), browser)!;
    expect(found.label).toBe("Essay draft");
    expect(findGrudge(list, placeFrom("Other - Google Docs", true), browser)).toBeNull();
    expect(grudgeDue(found, 1000 + 60_000)).toBe(false);
    expect(grudgeDue(found, 1000 + 46 * 60_000)).toBe(true);
    expect(facedGrudge(list, "essay draft", 9)[0]).toMatchObject({ faced: 2, lastAt: 9 });
    expect(beatGrudge(list, "Essay draft")[0].beaten).toBe(1);
    expect(dropGrudge(list, "essay draft")).toEqual([]);
  });
  it("stays small and tidy", () => {
    let list = addGrudge([], { label: "0", key: "0" }, 0);
    for (let i = 1; i < 50; i++) list = addGrudge(list, { label: `${i}`, key: `${i}` }, 0);
    expect(list).toHaveLength(MAX_GRUDGES);
    expect(shortLabel("  a   b ")).toBe("a b");
    expect([...shortLabel("🦀".repeat(60))]).toHaveLength(28);
  });
  it("survives a damaged file, and erasing history forgets the names but not the wins", () => {
    const state = readCompanion({ grudges: [{ label: "Taxes", key: "taxes", faced: -3 }, { label: 4 }, null], tantrums: "x", beaten: 5 }, 1000);
    expect(state.grudges).toEqual([{ label: "Taxes", key: "taxes", faced: 0, beaten: 0, lastAt: 0 }]);
    expect(state.tantrums).toBe(0);
    expect(unlocked(state, 1000)).toContain("headband");
    expect(unlocked(newCompanion(1000), 1000)).not.toContain("headband");
    expect(forgetHistory(state)).toMatchObject({ grudges: [], beaten: 5 });
  });
});

/** A plain GIF LZW reader, to check the writer against. */
function unlzw(data: number[], minCode = 8): number[] {
  const clear = 1 << minCode, end = clear + 1, out: number[] = [];
  let size = minCode + 1, bits = 0, held = 0, at = 0, table: number[][] = [], previous: number[] | null = null;
  const reset = () => { table = Array.from({ length: clear + 2 }, (_, i) => i < clear ? [i] : []); size = minCode + 1; previous = null; };
  reset();
  for (;;) {
    while (bits < size) { if (at >= data.length) throw new Error("ran out"); held |= data[at++] << bits; bits += 8; }
    const code = held & (1 << size) - 1;
    held >>>= size; bits -= size;
    if (code === clear) { reset(); continue; }
    if (code === end) return out;
    const entry: number[] = table[code] ?? [...previous!, previous![0]];
    out.push(...entry);
    if (previous && table.length < 4096) { table.push([...previous, entry[0]]); if (table.length === 1 << size && size < 12) size++; }
    previous = entry;
  }
}
describe("GIF encoder", () => {
  it.each([["flat", (_: number) => 7], ["ramp", (i: number) => i % 256], ["noisy", (i: number) => (i * 7919 + (i >> 3) * 31) % 256]])("round-trips %s data past the table limit", (_, at) => {
    const source = Uint8Array.from({ length: 30_000 }, (_, i) => at(i));
    expect(unlzw(lzw(source))).toEqual([...source]);
  });
  it("keeps a flat colour exact and a rare one present", () => {
    const pixels = new Uint8ClampedArray(400 * 4);
    for (let i = 0; i < 400; i++) pixels.set(i === 5 ? [255, 0, 0, 255] : [223, 233, 246, 255], i * 4);
    const { palette, lookup } = buildPalette([{ pixels, delayMs: 80 }]);
    const of = (r: number, g: number, b: number) => { const i = lookup[(r >> 3) << 10 | (g >> 3) << 5 | b >> 3] * 3; return palette.slice(i, i + 3); };
    expect(of(223, 233, 246)).toEqual([223, 233, 246]);
    expect(of(255, 0, 0)).toEqual([255, 0, 0]);
  });
  it("writes a looping file of the right size", () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4).fill(200);
    const gif = encodeGif([{ pixels, delayMs: 80 }, { pixels, delayMs: 80 }], 4, 4, 2);
    const ascii = String.fromCharCode(...gif);
    expect(ascii.startsWith("GIF89a")).toBe(true);
    expect([gif[6], gif[8]]).toEqual([8, 8]);
    expect(ascii).toContain("NETSCAPE2.0");
    expect(gif[gif.length - 1]).toBe(0x3b);
    expect(() => encodeGif([], 4, 4)).toThrow();
  });
});

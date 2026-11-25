import { describe, expect, it } from "vitest";
import { blooms, chooseSpecies, dropsForRest, MAX_DROPS_PER_DAY, SPECIES, stageOf, water } from "../src/lib/garden";
import { bondLevel, care, daysTogether, forgetHistory, newCompanion, newlyFound, nextMilestone, readCompanion, rememberRoutine, rested, unlocked } from "../src/lib/companion";
import { memories } from "../src/lib/memories";
import { daysBefore, letterWeek, slumpHour, writeLetter } from "../src/lib/weeklyLetter";
import { dayKey, type DayRecord } from "../src/components/SummaryPanel";
import type { NudgeRecord } from "../src/lib/reminderPolicy";
import { startFocus } from "../src/lib/focus";

const DAY = 86_400_000;
const now = new Date(2026, 10, 23, 14).getTime();
const half = () => 0.5;

describe("the garden", () => {
  it("plants, grows and blooms, carrying leftover water to a new seed", () => {
    const { plants, events } = water([], 5, now, half);
    expect(events.map(e => e.kind)).toEqual(["planted", "grew", "grew", "bloomed", "planted"]);
    expect(plants.map(stageOf)).toEqual(["bloom", "seed"]);
    expect(blooms(plants)).toBe(1);
  });
  it("offers seasonal and night plants only in their moment", () => {
    const seen = (date: Date) => new Set(Array.from({ length: 200 }, (_, i) => chooseSpecies([], date.getTime(), i / 200)));
    const autumn = seen(new Date(2026, 9, 20, 14)), spring = seen(new Date(2026, 3, 20, 23));
    expect(autumn.has("pumpkin")).toBe(true); expect(autumn.has("blossom")).toBe(false); expect(autumn.has("moonflower")).toBe(false);
    expect(spring.has("blossom")).toBe(true); expect(spring.has("moonflower")).toBe(true); expect(spring.has("snowdrop")).toBe(false);
  });
  it("rewards every finished pause, and longer rest more", () => {
    expect(dropsForRest({ seconds: 20, complete: true, guided: true })).toBe(1);
    expect(dropsForRest({ seconds: 10, complete: false, guided: true })).toBe(0);
    expect(dropsForRest({ seconds: 90, complete: false, guided: false })).toBe(1);
    expect(dropsForRest({ seconds: 300, complete: true, guided: false })).toBe(2);
    expect(dropsForRest({ seconds: 2400, complete: true, guided: false })).toBe(3);
    expect(dropsForRest({ seconds: 15, complete: false, guided: false })).toBe(0);
  });
  it("can't be farmed: water is capped per day and returns the next", () => {
    let s = newCompanion(now);
    for (let i = 0; i < 40; i++) s = rested(s, 1, now, half).state;
    expect(s.plants.reduce((t, p) => t + p.drops, 0)).toBe(MAX_DROPS_PER_DAY);
    expect(rested(s, 1, now + DAY, half).events).toHaveLength(1);
  });
});

describe("the bond", () => {
  it("grows with care up to a daily limit and never shrinks", () => {
    let s = newCompanion(now);
    for (let i = 0; i < 30; i++) s = care(s, "pet", now);
    expect(s.bond).toBe(5);
    expect(care(s, "pet", now + DAY).bond).toBe(6);
    expect(care(s, "pet", now + 90 * DAY).bond).toBeGreaterThan(5);
  });
  it("names each level and its progress", () => {
    expect(bondLevel(0)).toMatchObject({ name: "Grade 4 napper", progress: 0 });
    expect(bondLevel(25).name).toBe("Grade 3 napper");
    expect(bondLevel(9999)).toMatchObject({ name: "Special grade napper", next: null, progress: 1 });
  });
  it("announces each outfit and milestone once", () => {
    let s = newCompanion(now);
    expect(newlyFound(s, now)).toBeNull();
    s = rested(s, 4, now, half).state;
    expect(newlyFound(s, now)).toBe("flower");
    s = { ...s, found: [...s.found, "flower"] };
    expect(newlyFound(s, now)).toBeNull();
    expect(unlocked(s, now)).toEqual(["leaf", "flower"]);
    expect(nextMilestone(s, now)?.id).toBe("break-1");
    expect(nextMilestone({ ...s, milestones: ["break-1"] }, now)?.id).toBe("bloom-1");
  });
  it("counts calendar days together", () => {
    const met = new Date(2026, 10, 22, 23, 59).getTime();
    expect(daysTogether(newCompanion(now, met), new Date(2026, 10, 23, 0, 1).getTime())).toBe(2);
  });
});

describe("the saved document", () => {
  it("round-trips through JSON", () => {
    let s = rested(newCompanion(now), 3, now, half).state;
    s = rememberRoutine(rememberRoutine({ ...s, wearing: "leaf", focus: startFocus("Essay", 25, now), tomorrow: "Email" }, "wrists", now), "wrists", now, "helped");
    expect(readCompanion(JSON.parse(JSON.stringify(s)), now)).toEqual(s);
  });
  it.each([null, undefined, 4, "x", [], {}, { plants: "no", bond: -5, wearing: "crown", focus: { text: 3 }, routines: { a: 1 }, today: [] },
    { plants: [{ species: "weed" }, { species: "daisy" }, null], found: ["nope", "leaf"], metAt: "soon" }])("survives %j", raw => {
    const s = readCompanion(raw, now);
    expect(s.bond).toBeGreaterThanOrEqual(0);
    expect(s.plants.every(p => p.species in SPECIES)).toBe(true);
    expect(s.wearing).toBeNull(); expect(s.focus).toBeNull(); expect(s.metAt).toBe(now);
    expect(care(s, "pet", now).bond).toBe(1);
  });
  it("forgets how days were spent but keeps the garden and friendship", () => {
    let s = rested(newCompanion(now), 3, now, half).state;
    s = { ...rememberRoutine(s, "wrists", now), focus: startFocus("Secret", 25, now), focusLog: [{ text: "Secret", startedAt: now, seconds: 9, outcome: "done" }], tomorrow: "Secret" };
    const cleared = forgetHistory(s);
    expect(JSON.stringify(cleared)).not.toContain("Secret");
    expect(cleared.plants).toEqual(s.plants); expect(cleared.bond).toBe(s.bond);
  });
  it("only remembers things that happened", () => {
    expect(memories(newCompanion(now), [], now)).toEqual([]);
    const s = { ...newCompanion(now, now - 10 * DAY), focusLog: [{ text: "Essay", startedAt: now - DAY, seconds: 900, outcome: "done" as const }] };
    expect(memories(s, [], now).join(" ")).toContain("Essay");
  });
});

describe("the weekly letter", () => {
  const settings = { reminder_interval_mins: 30, wind_down_enabled: false, rhythm_eyes: false };
  const day = (ago: number, extra: Partial<DayRecord> = {}): DayRecord => ({
    date: dayKey(now - ago * DAY), categorySeconds: { Productivity: 4 * 3600 }, breaksTaken: 6, breaksInterrupted: 0, restSeconds: 900, longestStretchSeconds: 3000, ...extra,
  });
  const week = (extra: Partial<DayRecord> = {}) => [1, 2, 3, 4, 5].map(ago => day(ago, extra));
  const write = (history: DayRecord[], more = {}) => writeLetter({ history, focusLog: [], settings, petName: "Biscuit", blooms: 0, now, ...more });

  it("waits for a few real days, and never counts today", () => {
    expect(write([day(0), day(1), day(2)])).toBeNull();
    expect(daysBefore([day(0), day(1), day(7), day(8)], now, 7)).toHaveLength(2);
    expect(write(week())).toMatchObject({ signature: "Biscuit", observation: expect.stringContaining("30 time") });
  });
  it("notices late nights, marathons and sparse pauses, each with a fitting offer", () => {
    const late = Array<number>(24).fill(0); late[0] = 2400;
    expect(write(week({ hourlySeconds: late }))?.apply?.patch).toEqual({ wind_down_enabled: true });
    expect(write(week({ longestStretchSeconds: 9000 }))?.apply?.patch).toEqual({ reminder_interval_mins: 20 });
    expect(write(week({ breaksTaken: 0 }))?.apply?.patch).toEqual({ rhythm_eyes: true });
    expect(write(week({ breaksTaken: 0 }), { settings: { ...settings, rhythm_eyes: true } })?.apply).toBeUndefined();
  });
  it("finds the hour nudges stop landing, only with clear evidence", () => {
    const at = (hour: number, outcome: NudgeRecord["outcome"], n: number) => Array.from({ length: n }, () => ({ hour, outcome }));
    const nudges = [...at(10, "taken", 6), ...at(16, "later", 6)];
    expect(slumpHour(nudges)).not.toBeNull();
    expect(slumpHour([...at(10, "taken", 6), ...at(16, "taken", 6)])).toBeNull();
    expect(slumpHour(at(16, "later", 3))).toBeNull();
    expect(write([day(1, { nudges }), day(2), day(3)])?.observation).toContain("hardly any after");
  });
  it("compares with the week before and offers one letter a week", () => {
    const history = [...week(), ...[8, 9, 10].map(ago => day(ago, { categorySeconds: { Productivity: 8 * 3600 } }))];
    expect(write(history)?.observation).toContain("4h less");
    expect(letterWeek(now)).toBe("2026-11-23");
    expect(letterWeek(now + 6 * DAY)).toBe("2026-11-23");
    expect(letterWeek(now + 7 * DAY)).toBe("2026-11-30");
  });
});

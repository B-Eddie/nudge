import { describe, expect, it } from "vitest";
import { RollingUse, distractionDue, recentDistraction } from "../src/lib/distraction";
import { fromTimeInput, nightKey, toTimeInput, tomorrowMorning, windDownPhase, withinActiveHours } from "../src/lib/schedule";
import { addRecord, allowCategory, cleanText, extendFocus, focusOver, parkThought, recentIntentions, startFocus, tickFocus, toRecord, type FocusSession } from "../src/lib/focus";
import { dueRhythm, newRhythmClock, rhythmsAfterBreak, tickRhythms } from "../src/lib/rhythms";
import { restMinutesFor } from "../src/lib/energy";
import { rankRoutines } from "../src/lib/breakSuggestion";
import { BREAK_ROUTINES, stepAt } from "../src/types/breakRoutines";

const MIN = 60_000;
// Monday 23 November 2026
const at = (hour: number, minute = 0, day = 23) => new Date(2026, 10, day, hour, minute);

describe("distraction in a rolling window", () => {
  it("is not reset by a short glance at something else", () => {
    const use = new RollingUse();
    let now = at(14).getTime();
    for (let i = 0; i < 59 * 60; i++) { use.add(now); now += 1000; }
    expect(distractionDue(recentDistraction(use, 60, now), 60, 0, now)).toBe(false);
    now += 2 * MIN; // Slack
    for (let i = 0; i < 2 * 60; i++) { use.add(now); now += 1000; }
    expect(distractionDue(recentDistraction(use, 60, now), 60, 0, now)).toBe(true);
    expect(distractionDue(recentDistraction(use, 60, now), 60, now - 5 * MIN, now)).toBe(false);
  });
  it("forgets time outside the window and everything after a break", () => {
    const use = new RollingUse();
    const start = at(9).getTime();
    use.add(start, 3600);
    expect(recentDistraction(use, 60, start + 80 * MIN)).toBe(3600);
    expect(recentDistraction(use, 60, start + 100 * MIN)).toBe(0);
    use.clear();
    expect(use.within(start, MIN)).toBe(0);
  });
});

describe("hours of the day", () => {
  const work = { enabled: true, start: 540, end: 1080, weekends: false };
  it("keeps nudges inside active hours and out of weekends", () => {
    expect(withinActiveHours(at(9), work)).toBe(true);
    expect(withinActiveHours(at(18), work)).toBe(false);
    expect(withinActiveHours(at(12, 0, 22), work)).toBe(false); // Sunday
    expect(withinActiveHours(at(3, 0, 22), { ...work, enabled: false })).toBe(true);
  });
  it("treats an overnight shift as belonging to the day it began", () => {
    const night = { enabled: true, start: 22 * 60, end: 6 * 60, weekends: false };
    expect(withinActiveHours(at(23), night)).toBe(true);
    expect(withinActiveHours(at(2, 0, 28), night)).toBe(true);   // Saturday 2 AM, Friday's shift
    expect(withinActiveHours(at(2, 0, 23), night)).toBe(false);  // Monday 2 AM, Sunday's shift
    expect(withinActiveHours(at(12), night)).toBe(false);
  });
  it("winds down before bedtime, through midnight, and lets morning be morning", () => {
    const sleep = { enabled: true, bedtime: 23 * 60 };
    expect([at(22), at(22, 20), at(23), at(1), at(5)].map(d => windDownPhase(d, sleep))).toEqual(["day", "soon", "late", "late", "day"]);
    expect(windDownPhase(at(0, 10), { enabled: true, bedtime: 30 })).toBe("soon");
    expect(windDownPhase(at(1), { enabled: false, bedtime: 60 })).toBe("day");
    expect(nightKey(at(23))).toBe(nightKey(at(1, 0, 24)));
    expect(nightKey(at(23))).not.toBe(nightKey(at(23, 0, 24)));
  });
  it("reads and writes time fields, and finds tomorrow morning", () => {
    expect(toTimeInput(545)).toBe("09:05");
    expect(fromTimeInput("23:30")).toBe(1410);
    for (const bad of ["", "24:00", "9", "12:60"]) expect(fromTimeInput(bad)).toBeNull();
    expect(new Date(tomorrowMorning(at(15).getTime()))).toEqual(at(6, 0, 24));
    expect(new Date(tomorrowMorning(at(2).getTime()))).toEqual(at(6));
  });
});

describe("focus sessions", () => {
  const start = at(10).getTime();
  const run = (session: FocusSession, seconds: number, category: string, distracting: boolean, from: number) => {
    let drifts = 0;
    for (let i = 0; i < seconds; i++) {
      const result = tickFocus(session, { category, distracting, resting: false }, from + i * 1000);
      session = result.session; if (result.drifted) drifts++;
    }
    return { session, drifts };
  };
  it("tolerates a quick look away but notices real drift, once per five minutes", () => {
    const session = startFocus("  Essay\n draft ", 25, start);
    expect(session.text).toBe("Essay draft");
    expect(run(session, 100, "Social Networking", true, start).drifts).toBe(0);
    expect(run(session, 121, "Social Networking", true, start).drifts).toBe(1);
    expect(run(session, 300, "Social Networking", true, start).drifts).toBe(1);
  });
  it("recovers from drift with time on task", () => {
    let { session } = run(startFocus("Essay", 25, start), 100, "Games", true, start);
    ({ session } = run(session, 200, "Productivity", false, start + 100_000));
    expect(session.drift).toBe(0);
    expect(run(session, 60, "Games", true, start + 300_000).drifts).toBe(0);
  });
  it("accepts that a category is part of the task, and counts it", () => {
    const { session, drifts } = run(allowCategory(startFocus("Learn piano", null, start), "Video"), 600, "Video", true, start);
    expect(drifts).toBe(0);
    expect(session.focusedSeconds).toBe(600);
  });
  it("doesn't count rest, ends on time, and can be extended", () => {
    const session = startFocus("Essay", 25, start);
    expect(tickFocus(session, { category: "Games", distracting: true, resting: true }, start).session).toBe(session);
    expect(focusOver(session, start + 25 * MIN)).toBe(true);
    expect(focusOver(extendFocus(session, 10, start + 26 * MIN), start + 35 * MIN)).toBe(false);
    expect(focusOver(startFocus("Open", null, start), start + 999 * MIN)).toBe(false);
  });
  it("parks thoughts and lists recent intentions once each", () => {
    let session = startFocus("Essay", 25, start);
    session = parkThought(parkThought(session, " buy milk "), "   ");
    expect(session.parked).toEqual(["buy milk"]);
    let log = addRecord([], toRecord(session, "done"));
    log = addRecord(log, { ...toRecord(session, "stuck"), text: "Physics" });
    log = addRecord(log, { ...toRecord(session, "done"), text: "ESSAY" });
    expect(recentIntentions(log)).toEqual(["ESSAY", "Physics"]);
    expect(cleanText("🦀".repeat(80))).toBe("🦀".repeat(60));
  });
});

describe("little rhythms", () => {
  const after = (mins: number) => { let c = newRhythmClock(); for (let i = 0; i < mins * 60; i++) c = tickRhythms(c); return c; };
  it("speaks only for rhythms that are on, due, and not about to be covered by a nudge", () => {
    expect(dueRhythm(after(25), ["eyes", "water"], 900)).toBe("eyes");
    expect(dueRhythm(after(25), ["water"], 900)).toBeNull();
    expect(dueRhythm(after(25), ["eyes"], 200)).toBeNull();
  });
  it("lets a break rest the eyes without pretending it was a drink", () => {
    expect(dueRhythm(rhythmsAfterBreak(after(70)), ["eyes", "posture", "water"], 900)).toBe("water");
  });
});

describe("break suggestions", () => {
  const context = { workSeconds: 1800, energy: 4, hour: 14, category: "Developer Tools", memory: {} };
  const rank = (changes: object, id: string) => rankRoutines({ ...context, ...changes }).findIndex(r => r.id === id);
  it("keeps rest short enough to take", () => {
    expect(restMinutesFor(60 * 30, 1)).toBe(6);
    expect(restMinutesFor(60 * 180, 4)).toBe(20);
    expect(restMinutesFor(5, 1)).toBe(1);
  });
  it("has steps that add up and unique ids", () => {
    expect(new Set(BREAK_ROUTINES.map(r => r.id)).size).toBe(BREAK_ROUTINES.length);
    for (const r of BREAK_ROUTINES) expect(r.steps.reduce((t, s) => t + s.seconds, 0)).toBe(r.durationSeconds);
    const breathing = BREAK_ROUTINES.find(r => r.id === "breathing")!;
    expect(stepAt(breathing, 4)).toMatchObject({ index: 1, left: 6, step: { breathe: "out" } });
    expect(stepAt(breathing, 999)).toMatchObject({ index: 11, left: 0 });
  });
  it("fits the moment: move after long work, eyes after video, calm at night", () => {
    expect(rankRoutines({ ...context, workSeconds: 5400 })[0].tags).toContain("move");
    expect(rankRoutines({ ...context, workSeconds: 600, category: "Video" })[0].tags).toContain("eyes");
    expect(rankRoutines({ ...context, workSeconds: 600, hour: 23 })[0].tags).toContain("calm");
    expect(rank({ hour: 23 }, "outside")).toBe(BREAK_ROUTINES.length - 1);
  });
  it("learns what helps and avoids repeating itself", () => {
    const base = rank({}, "listen");
    expect(rank({ memory: { listen: { done: 5, helped: 5, notReally: 0, lastAt: 0 } } }, "listen")).toBeLessThan(base);
    const top = rankRoutines(context)[0].id;
    expect(rankRoutines({ ...context, memory: { [top]: { done: 1, helped: 0, notReally: 0, lastAt: 1 } } })[0].id).not.toBe(top);
  });
});

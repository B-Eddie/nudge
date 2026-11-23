import { describe, expect, it } from "vitest";
import { decide, drowsiness, receptivity, rulesFor, shouldDozeInstead, snoozeActive, STYLE_RULES, unansweredInARow, type Moment, type NudgeRecord } from "../src/lib/reminderPolicy";

const NOW = 1_800_000_000_000, MIN = 60_000;
const moment = (changes: Partial<Moment> = {}): Moment => ({
  now: NOW, dueAt: NOW, idleSeconds: 0, app: "editor", appSince: NOW - 10 * MIN, returnedAt: 0,
  onBreak: false, panelOpen: false, hidden: false, promptOpen: false, quietUntil: 0, offHours: false,
  snooze: null, inCall: false, watching: false, focusing: false, rules: STYLE_RULES.balanced, ...changes,
});
const because = (changes: Partial<Moment>) => decide(moment(changes)).because;

describe("when a nudge may appear", () => {
  it("never interrupts typing, but does not wait forever", () => {
    expect(because({})).toBe("typing");
    expect(decide(moment({ idleSeconds: 6 }))).toEqual({ show: true, because: "pause" });
    expect(because({ dueAt: NOW - 3.9 * MIN })).toBe("typing");
    expect(decide(moment({ dueAt: NOW - 4 * MIN }))).toEqual({ show: true, because: "overdue" });
  });
  it("uses the gap between two apps, after a moment to land", () => {
    expect(because({ appSince: NOW - 3000, idleSeconds: 2 })).toBe("switch");
    expect(because({ appSince: NOW - 500, idleSeconds: 2 })).toBe("typing");
    expect(because({ appSince: NOW - 3000, idleSeconds: 0.2 })).toBe("typing");
  });
  it("waits while someone is away and greets them when they return", () => {
    expect(because({ idleSeconds: 120, dueAt: NOW - 60 * MIN })).toBe("away");
    expect(decide(moment({ returnedAt: NOW - 2000 }))).toEqual({ show: true, because: "return" });
  });
  it("never interrupts a call, however late it is", () => {
    expect(because({ inCall: true, idleSeconds: 8, dueAt: NOW - 180 * MIN })).toBe("call");
  });
  it("gives a video time to end, then still reaches a long watcher who never types", () => {
    expect(because({ watching: true, idleSeconds: 600 })).toBe("watching");
    expect(decide(moment({ watching: true, idleSeconds: 3600, dueAt: NOW - 20 * MIN }))).toEqual({ show: true, because: "overdue" });
  });
  it("respects focus sessions up to a limit", () => {
    expect(because({ focusing: true, idleSeconds: 8 })).toBe("focus");
    expect(because({ focusing: true, idleSeconds: 8, dueAt: NOW - 51 * MIN })).toBe("pause");
  });
  it.each([
    ["break", { onBreak: true }], ["hidden", { hidden: true }], ["panel", { panelOpen: true }], ["prompt", { promptOpen: true }],
    ["quiet", { quietUntil: NOW + 1 }], ["hours", { offHours: true }],
  ] as [string, Partial<Moment>][])("holds for %s even when overdue", (reason, changes) => {
    expect(because({ idleSeconds: 8, dueAt: NOW - 600 * MIN, ...changes })).toBe(reason);
  });
  it("lets a session you started finish through quiet time and off hours, but not a call", () => {
    const rules = { ...STYLE_RULES.balanced, ignoreQuiet: true, ignoreHours: true };
    expect(because({ rules, idleSeconds: 8, quietUntil: NOW + 1, offHours: true })).toBe("pause");
    expect(because({ rules, idleSeconds: 8, inCall: true })).toBe("call");
  });
});

describe("snoozing", () => {
  const at = { now: NOW, app: "editor", appSince: NOW - MIN };
  it("ends at its time", () => {
    expect(snoozeActive({ kind: "until", at: NOW + 1 }, at)).toBe(true);
    expect(snoozeActive({ kind: "until", at: NOW }, at)).toBe(false);
  });
  it("lasts until the task is really left, not just glanced away from", () => {
    const snooze = { kind: "after-task" as const, app: "editor", until: NOW + 30 * MIN };
    expect(snoozeActive(snooze, at)).toBe(true);
    expect(snoozeActive(snooze, { ...at, app: "slack", appSince: NOW - 1000 })).toBe(true);
    expect(snoozeActive(snooze, { ...at, app: "slack", appSince: NOW - 5000 })).toBe(false);
    expect(snoozeActive({ ...snooze, until: NOW }, at)).toBe(false);
  });
});

describe("learning from answers", () => {
  const answers = (outcome: NudgeRecord["outcome"], hour: number, count: number): NudgeRecord[] => Array.from({ length: count }, () => ({ hour, outcome }));
  it("needs enough answers near that hour, and wraps midnight", () => {
    expect(receptivity(answers("later", 16, 4), 16)).toBeNull();
    expect(receptivity([...answers("later", 16, 4), ...answers("taken", 17, 1)], 16)).toBe(0.2);
    expect(receptivity(answers("taken", 23, 5), 0)).toBe(1);
    expect(receptivity(answers("taken", 9, 5), 16)).toBeNull();
  });
  it("is more patient at hours that rarely suit, unless asked to be firm", () => {
    expect(rulesFor("balanced", 0.1).maxWaitMs).toBe(8 * MIN);
    expect(rulesFor("balanced", 0.5).maxWaitMs).toBe(4 * MIN);
    expect(rulesFor("firm", 0)).toEqual(STYLE_RULES.firm);
  });
  it("stops asking after two unanswered cards and lets the pet fall asleep instead", () => {
    const ignored = answers("missed", 10, 2);
    expect(unansweredInARow([...answers("missed", 9, 4), ...answers("taken", 9, 1), ...answers("missed", 9, 1)])).toBe(1);
    expect(shouldDozeInstead("balanced", ignored)).toBe(true);
    expect(shouldDozeInstead("firm", ignored)).toBe(false);
    expect([null, 1, 5, 20].map(m => drowsiness(m === null ? null : NOW - m * MIN, NOW))).toEqual([0, 1, 2, 3]);
  });
});

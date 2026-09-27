import { describe, expect, it } from "vitest";
import { archiveDay, rollOverActivity, resumeAfterRestart, setTrackingPause, type ActivitySnapshot } from "./activityLifecycle";
import { emptySessionStats } from "./components/SummaryPanel";

const start = new Date(2026, 8, 27, 23, 59).getTime();
const next = new Date(2026, 8, 28, 0, 1).getTime();
function snapshot(timeEvents = 3): ActivitySnapshot {
  return {
    timePassed: 63, timeEvents, stats: {
      ...emptySessionStats(start), categorySeconds: { Productivity: 63 },
      breaksTaken: 1, longestStretchSeconds: 63,
    }, paused: false, trackingPaused: false, history: [],
  };
}

describe("activity day rollover", () => {
  it("archives completed work once, starts a fresh local day and resets the energy tier", () => {
    const rolled = rollOverActivity(snapshot(), next);
    expect(rolled.history).toHaveLength(1);
    expect(rolled.history[0].categorySeconds.Productivity).toBe(63);
    expect(rolled.stats.startedAt).toBe(next);
    expect(rolled.timePassed).toBe(0);
    expect(rolled.timeEvents).toBe(1);
    expect(rollOverActivity(rolled, next)).toBe(rolled);
  });
  it("continues an in-progress break over midnight", () => {
    const rolled = rollOverActivity(snapshot(-3), next);
    expect(rolled.timeEvents).toBe(-3);
    expect(rolled.history).toHaveLength(1);
  });
  it("clears an orphaned break after app restart", () => {
    const restored = resumeAfterRestart(snapshot(-3));
    expect(restored.timeEvents).toBe(1);
    expect(restored.timePassed).toBe(0);
    expect(restored.stats.breaksTaken).toBe(1);
    expect(resumeAfterRestart(restored)).toBe(restored);
  });
  it("pauses and resumes without crediting away time to the current stretch", () => {
    const before = snapshot();
    const paused = setTrackingPause(before, true);
    expect(paused.trackingPaused).toBe(true);
    expect(paused.timePassed).toBe(0);
    expect(paused.stats.currentStretchSeconds).toBe(0);
    expect(paused.stats.categorySeconds.Productivity).toBe(63);
    expect(setTrackingPause(paused, true)).toBe(paused);
    expect(setTrackingPause(paused, false).trackingPaused).toBe(false);
  });
  it("keeps no more than 31 history dates and replaces duplicate dates", () => {
    const previous = Array.from({ length: 31 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      categorySeconds: {}, breaksTaken: 0, breaksInterrupted: 0,
      restSeconds: 1, longestStretchSeconds: 0,
    }));
    const archived = archiveDay(previous, snapshot().stats);
    expect(archived).toHaveLength(31);
    expect(archived[archived.length - 1]?.categorySeconds.Productivity).toBe(63);
    expect(archiveDay(archived, snapshot().stats)).toEqual(archived);
  });
});

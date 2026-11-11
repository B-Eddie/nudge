import { describe, expect, it } from "vitest";
import { activityCsv, csvField, exportFileName } from "../src/lib/activityExport";
import { emptySessionStats, dayKey, type DayRecord } from "../src/components/SummaryPanel";

const day = (date: string, categorySeconds: Record<string, number>, extra: Partial<DayRecord> = {}): DayRecord => ({
  date, categorySeconds, breaksTaken: 0, breaksInterrupted: 0, restSeconds: 0, longestStretchSeconds: 0, ...extra,
});

describe("activity CSV export", () => {
  it("writes one row per day with a column for every category ever seen", () => {
    const now = new Date(2026, 10, 10, 12).getTime();
    const stats = { ...emptySessionStats(now), categorySeconds: { Games: 600 }, breaksTaken: 2, restSeconds: 300 };
    const history = [
      day("2026-11-08", { "Developer Tools": 3600 }, { breaksTaken: 1, breaksInterrupted: 1, longestStretchSeconds: 1800 }),
      day("2026-11-09", { "Developer Tools": 90, Music: 30 }),
    ];
    expect(activityCsv(stats, history).trim().split("\n")).toEqual([
      "date,active_minutes,rest_minutes,breaks_taken,breaks_interrupted,longest_stretch_minutes,Developer Tools (minutes),Games (minutes),Music (minutes)",
      "2026-11-08,60,0,1,1,30,60,0,0",
      "2026-11-09,2,0,0,0,0,1.5,0,0.5",
      "2026-11-10,10,5,2,0,0,0,10,0",
    ]);
  });

  it("uses the live session for today instead of a stale archived copy", () => {
    const now = Date.now();
    const stats = { ...emptySessionStats(now), categorySeconds: { Games: 120 } };
    const rows = activityCsv(stats, [day(dayKey(now), { Games: 60 })]).trim().split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain(",2,");
  });

  it("escapes delimiters and neutralises spreadsheet formulas", () => {
    expect(csvField("Social, Video")).toBe('"Social, Video"');
    expect(csvField('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("Plain")).toBe("Plain");
  });

  it("names the file after the local date", () => {
    expect(exportFileName(new Date(2026, 0, 5, 23, 30).getTime())).toBe("nudge-activity-2026-01-05.csv");
  });
});

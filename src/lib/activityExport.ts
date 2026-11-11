import { dayKey, dayRecordFromStats, type DayRecord, type SessionStats } from "../components/SummaryPanel";

const FIXED_COLUMNS = [
  "date",
  "active_minutes",
  "rest_minutes",
  "breaks_taken",
  "breaks_interrupted",
  "longest_stretch_minutes",
] as const;

const minutes = (seconds: number) => (Math.round((seconds / 60) * 10) / 10).toString();

/** Quotes a field when it contains a delimiter, quote or newline (RFC 4180), and
 * neutralises leading formula characters so a spreadsheet never evaluates a label. */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One row per day (archived history plus today), one minutes column per category. */
export function activityCsv(stats: SessionStats, history: DayRecord[]): string {
  const today = dayRecordFromStats(stats);
  const days = [...history.filter((day) => day.date !== today.date), today]
    .sort((a, b) => a.date.localeCompare(b.date));
  const categories = [...new Set(days.flatMap((day) => Object.keys(day.categorySeconds)))].sort();

  const header = [...FIXED_COLUMNS, ...categories.map((c) => `${c} (minutes)`)];
  const rows = days.map((day) => {
    const active = Object.values(day.categorySeconds).reduce((sum, s) => sum + s, 0);
    return [
      day.date,
      minutes(active),
      minutes(day.restSeconds),
      String(day.breaksTaken),
      String(day.breaksInterrupted),
      minutes(day.longestStretchSeconds),
      ...categories.map((c) => minutes(day.categorySeconds[c] ?? 0)),
    ];
  });
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\n") + "\n";
}

export function exportFileName(now = Date.now()): string {
  return `nudge-activity-${dayKey(now)}.csv`;
}

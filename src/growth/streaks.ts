// Break streaks derived from archived DayRecords — no new tracking needed.
import {
  dayKey,
  dayRecordFromStats,
  type DayRecord,
  type SessionStats,
} from "../components/SummaryPanel";

/** Breaks in a day needed for the day to count toward the streak. */
export const STREAK_MIN_BREAKS = 3;

export interface StreakInfo {
  current: number;
  best: number;
}

function qualifies(key: string, byDate: Map<string, DayRecord>): boolean {
  const rec = byDate.get(key);
  return !!rec && rec.breaksTaken >= STREAK_MIN_BREAKS;
}

/**
 * Longest run of qualifying days ending at (and including) endIdx, walking
 * backwards. A single non-qualifying day is forgiven (gap, not counted).
 */
function runLengthEndingAt(
  keys: string[],
  endIdx: number,
  byDate: Map<string, DayRecord>,
): number {
  let length = 0;
  let gapUsed = false;
  for (let i = endIdx; i >= 0; i--) {
    if (qualifies(keys[i], byDate)) {
      length += 1;
    } else if (!gapUsed) {
      gapUsed = true; // one rest day doesn't kill the streak
    } else {
      break;
    }
  }
  return length;
}

export function breakStreak(
  history: DayRecord[],
  stats: SessionStats,
): StreakInfo {
  const byDate = new Map(history.map((rec) => [rec.date, rec]));
  // Today comes from the live session, not the archive.
  const live = dayRecordFromStats(stats);
  byDate.set(live.date, live);

  // Look back over the stored window (history keeps ~31 days).
  const WINDOW = 62;
  const keys: string[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (WINDOW - 1));
  for (let i = 0; i < WINDOW; i++) {
    keys.push(dayKey(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }

  // Today may still be in progress: if it doesn't qualify yet, measure the
  // current streak through yesterday without spending the gap forgiveness.
  let endIdx = keys.length - 1;
  if (!qualifies(keys[endIdx], byDate)) endIdx -= 1;
  const current = endIdx >= 0 ? runLengthEndingAt(keys, endIdx, byDate) : 0;

  let best = current;
  for (let i = 0; i < keys.length; i++) {
    best = Math.max(best, runLengthEndingAt(keys, i, byDate));
  }
  return { current, best };
}

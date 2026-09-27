import type { DayRecord, SessionStats } from "./components/SummaryPanel";
import { dayKey, dayRecordFromStats, emptySessionStats } from "./components/SummaryPanel";

export interface ActivitySnapshot {
  timePassed: number;
  timeEvents: number;
  stats: SessionStats;
  paused: boolean;
  history: DayRecord[];
}

export function archiveDay(history: DayRecord[], stats: SessionStats): DayRecord[] {
  const record = dayRecordFromStats(stats);
  const next = history.filter((rec) => rec.date !== record.date);
  if (Object.keys(record.categorySeconds).length > 0 || record.restSeconds > 0) {
    next.push(record);
  }
  next.sort((a, b) => a.date.localeCompare(b.date));
  return next.slice(-31);
}

/** On a new day, keep a break in progress rather than turning it into work. */
export function rollOverActivity(snapshot: ActivitySnapshot, now: number): ActivitySnapshot {
  if (dayKey(snapshot.stats.startedAt) === dayKey(now)) return snapshot;
  const continuingBreak = snapshot.timeEvents < 0;
  return {
    ...snapshot,
    stats: emptySessionStats(now),
    history: archiveDay(snapshot.history ?? [], snapshot.stats),
    timePassed: 0,
    timeEvents: continuingBreak ? snapshot.timeEvents : 1,
  };
}

/** A break countdown uses a volatile timestamp; after a restart, clear that state
 * rather than leaving the companion asleep forever. The archived stats remain. */
export function resumeAfterRestart(snapshot: ActivitySnapshot): ActivitySnapshot {
  if (snapshot.timeEvents >= 0) return snapshot;
  return { ...snapshot, timeEvents: 1, timePassed: 0 };
}

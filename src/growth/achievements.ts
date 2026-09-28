// Achievements: badges derived from existing stats + history + pet profile.
// The unlocked set persists in localStorage; checks are pure so they can run
// after any event that might complete one.
import {
  dayKey,
  dayRecordFromStats,
  type DayRecord,
  type SessionStats,
} from "../components/SummaryPanel";
import { levelForXp, type PetProfile } from "./pet";
import { breakStreak } from "./streaks";

export interface AchievementContext {
  stats: SessionStats;
  history: DayRecord[];
  pet: PetProfile;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  check: (ctx: AchievementContext) => boolean;
}

function anyDay(
  history: DayRecord[],
  stats: SessionStats,
  pred: (rec: DayRecord) => boolean,
): boolean {
  if (pred(dayRecordFromStats(stats))) return true;
  return history.some(pred);
}

function activeSeconds(rec: DayRecord): number {
  return Object.values(rec.categorySeconds).reduce((sum, s) => sum + s, 0);
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first-rest",
    name: "First Rest",
    desc: "Take your first break",
    check: ({ stats, history }) =>
      anyDay(history, stats, (r) => r.breaksTaken >= 1),
  },
  {
    id: "rest-regular",
    name: "Rest Regular",
    desc: "Take 5 breaks in one day",
    check: ({ stats, history }) =>
      anyDay(history, stats, (r) => r.breaksTaken >= 5),
  },
  {
    id: "marathon",
    name: "Marathon Mind",
    desc: "Work 2 hours without a break",
    check: ({ stats, history }) =>
      anyDay(history, stats, (r) => r.longestStretchSeconds >= 7200),
  },
  {
    id: "streak-3",
    name: "Three-Day Streak",
    desc: "Keep a 3-day break streak",
    check: ({ stats, history }) =>
      breakStreak(history, stats).current >= 3 ||
      breakStreak(history, stats).best >= 3,
  },
  {
    id: "week-warrior",
    name: "Week Warrior",
    desc: "Use your computer 5 of the last 7 days",
    check: ({ stats, history }) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 6);
      const cutoffKey = dayKey(cutoff.getTime());
      const recent = [
        dayRecordFromStats(stats),
        ...history.filter((r) => r.date >= cutoffKey),
      ];
      const activeDays = new Set<string>();
      for (const rec of recent) {
        if (activeSeconds(rec) > 0) activeDays.add(rec.date);
      }
      return activeDays.size >= 5;
    },
  },
  {
    id: "deep-rest",
    name: "Deep Rest",
    desc: "Rest a full hour in one day",
    check: ({ stats, history }) =>
      anyDay(history, stats, (r) => r.restSeconds >= 3600),
  },
  {
    id: "first-focus",
    name: "Deep Work",
    desc: "Complete a focus session",
    check: ({ pet }) => pet.focusSessions >= 1,
  },
  {
    id: "focus-five",
    name: "In the Zone",
    desc: "Complete 5 focus sessions",
    check: ({ pet }) => pet.focusSessions >= 5,
  },
  {
    id: "quest-five",
    name: "Side Quester",
    desc: "Complete 5 break quests",
    check: ({ pet }) => pet.questsDone >= 5,
  },
  {
    id: "level-three",
    name: "Bonded",
    desc: "Reach pet level 3",
    check: ({ pet }) => levelForXp(pet.xp) >= 3,
  },
];

const STORAGE_KEY = "nudge.achievements.v1";

export function loadUnlockedAchievements(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    // Corrupted storage: start fresh.
  }
  return new Set();
}

function saveUnlocked(unlocked: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlocked]));
  } catch {
    // Non-fatal.
  }
}

/** Returns the newly unlocked achievements (and persists them). */
export function checkAchievements(ctx: AchievementContext): AchievementDef[] {
  const unlocked = loadUnlockedAchievements();
  const fresh = ACHIEVEMENTS.filter((def) => {
    if (unlocked.has(def.id)) return false;
    try {
      return def.check(ctx);
    } catch {
      return false;
    }
  });
  if (fresh.length > 0) {
    fresh.forEach((def) => unlocked.add(def.id));
    saveUnlocked(unlocked);
  }
  return fresh;
}

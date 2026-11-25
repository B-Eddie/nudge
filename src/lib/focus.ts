/** Focus sessions: what you said you'd do, how long you meant to, and whether you drifted. */

export type FocusOutcome = "done" | "partly" | "stuck" | "ended";

export interface FocusSession {
  text: string;
  startedAt: number;
  /** null for an open-ended session. */
  endsAt: number | null;
  focusedSeconds: number;
  /** Leaky bucket: fills while distracted, drains while on task. */
  drift: number;
  nextDriftAt: number;
  /** Categories the person said are part of this task. */
  allowed: string[];
  parked: string[];
  /** Something the person said they didn't want to do. */
  dreaded?: boolean;
}

export interface FocusRecord { text: string; startedAt: number; seconds: number; outcome: FocusOutcome }

export const FOCUS_CHOICES: { label: string; minutes: number | null }[] = [
  { label: "15 min", minutes: 15 },
  { label: "25 min", minutes: 25 },
  { label: "45 min", minutes: 45 },
  { label: "60 min", minutes: 60 },
  { label: "Open", minutes: null },
];
export const MAX_FOCUS_TEXT = 60;
export const MAX_PARKED = 20;
const DRIFT_LIMIT = 120;
const DRIFT_REPEAT_MS = 5 * 60_000;
const MAX_RECORDS = 200;

export const cleanText = (text: string, max = MAX_FOCUS_TEXT) =>
  [...text.replace(/\s+/g, " ").trim()].slice(0, max).join("");

export function startFocus(text: string, minutes: number | null, now: number): FocusSession {
  return {
    text: cleanText(text), startedAt: now, endsAt: minutes === null ? null : now + minutes * 60_000,
    focusedSeconds: 0, drift: 0, nextDriftAt: 0, allowed: [], parked: [],
  };
}

export interface FocusTick { category: string; distracting: boolean; resting: boolean }

/** One second of a session. `drifted` is true when it's time to ask. */
export function tickFocus(session: FocusSession, tick: FocusTick, now: number): { session: FocusSession; drifted: boolean } {
  if (tick.resting) return { session, drifted: false };
  const off = tick.distracting && !session.allowed.includes(tick.category);
  const drift = off ? session.drift + 1 : Math.max(0, session.drift - 0.5);
  const drifted = off && drift >= DRIFT_LIMIT && now >= session.nextDriftAt;
  return {
    session: {
      ...session,
      focusedSeconds: session.focusedSeconds + (off ? 0 : 1),
      drift: drifted ? 0 : drift,
      nextDriftAt: drifted ? now + DRIFT_REPEAT_MS : session.nextDriftAt,
    },
    drifted,
  };
}

export const focusOver = (session: FocusSession, now: number) => session.endsAt !== null && now >= session.endsAt;

export function extendFocus(session: FocusSession, minutes: number, now: number): FocusSession {
  return { ...session, endsAt: Math.max(now, session.endsAt ?? now) + minutes * 60_000 };
}

export function allowCategory(session: FocusSession, category: string): FocusSession {
  return session.allowed.includes(category) ? session
    : { ...session, allowed: [...session.allowed, category], drift: 0 };
}

export function parkThought(session: FocusSession, text: string): FocusSession {
  const thought = cleanText(text, 120);
  return !thought || session.parked.length >= MAX_PARKED ? session
    : { ...session, parked: [...session.parked, thought] };
}

export const toRecord = (session: FocusSession, outcome: FocusOutcome): FocusRecord =>
  ({ text: session.text, startedAt: session.startedAt, seconds: session.focusedSeconds, outcome });

export const addRecord = (records: FocusRecord[], record: FocusRecord): FocusRecord[] =>
  [...records, record].slice(-MAX_RECORDS);

/** Recent, distinct intentions, newest first. */
export function recentIntentions(records: FocusRecord[], limit = 4): string[] {
  const seen = new Map<string, string>();
  for (let i = records.length - 1; i >= 0 && seen.size < limit; i--) {
    const key = records[i].text.toLowerCase();
    if (key && !seen.has(key)) seen.set(key, records[i].text);
  }
  return [...seen.values()];
}

export function focusTimeLabel(session: FocusSession, now: number): string {
  if (session.endsAt === null) return `${Math.floor((now - session.startedAt) / 60_000)} min in`;
  const left = Math.ceil((session.endsAt - now) / 60_000);
  return left > 0 ? `${left} min left` : "Time’s up";
}

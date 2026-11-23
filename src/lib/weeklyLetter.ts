/** A short letter about the last seven days: one observation, one suggestion, all local. */
import type { DayRecord } from "../components/SummaryPanel";
import type { FocusRecord } from "./focus";
import type { NudgeRecord } from "./reminderPolicy";
import { dateKey } from "./companion";
import { formatMinuteOfDay } from "./schedule";

export interface LetterSettings { reminder_interval_mins: number; wind_down_enabled: boolean; rhythm_eyes: boolean }
export interface Letter {
  greeting: string;
  observation: string;
  details: string[];
  suggestion: string;
  /** A setting the person can apply with one click. */
  apply?: { label: string; patch: Partial<LetterSettings> };
  signature: string;
}

export const MIN_LETTER_DAYS = 3;
const active = (day: DayRecord) => Object.values(day.categorySeconds).reduce((a, b) => a + b, 0);
const sum = (days: DayRecord[], value: (d: DayRecord) => number) => days.reduce((total, d) => total + value(d), 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
function span(seconds: number): string {
  const minutes = Math.round(seconds / 60), hours = Math.floor(minutes / 60);
  return hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`;
}
const hourName = (hour: number) => formatMinuteOfDay(hour * 60).replace(":00", "");

/** Days within `count` days ending the day before `now`. */
export function daysBefore(history: readonly DayRecord[], now: number, count: number, skip = 0): DayRecord[] {
  const keys = new Set(Array.from({ length: count }, (_, i) => {
    const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - 1 - skip - i);
    return dateKey(d.getTime());
  }));
  return history.filter(day => keys.has(day.date) && active(day) > 0);
}

/** The hour from which most nudges went untaken, if there is a clear one. */
export function slumpHour(nudges: readonly NudgeRecord[]): number | null {
  for (let hour = 12; hour <= 20; hour++) {
    const after = nudges.filter(n => n.hour >= hour), before = nudges.filter(n => n.hour < hour);
    if (after.length < 5 || before.length < 3) continue;
    const rate = (list: NudgeRecord[]) => list.filter(n => n.outcome === "taken").length / list.length;
    if (rate(after) <= 0.3 && rate(before) - rate(after) >= 0.3) return hour;
  }
  return null;
}

export function writeLetter(input: {
  history: readonly DayRecord[]; focusLog: readonly FocusRecord[]; settings: LetterSettings; petName: string; blooms: number; now: number;
}): Letter | null {
  const { history, settings, now } = input;
  const week = daysBefore(history, now, 7), previous = daysBefore(history, now, 7, 7);
  if (week.length < MIN_LETTER_DAYS) return null;

  const screen = sum(week, active) / week.length;
  const before = previous.length >= MIN_LETTER_DAYS ? sum(previous, active) / previous.length : null;
  const breaks = sum(week, d => d.breaksTaken);
  const longest = Math.max(...week.map(d => d.longestStretchSeconds));
  const nudges = week.flatMap(d => d.nudges ?? []);
  const slump = slumpHour(nudges);
  const lateDays = week.filter(d => (d.hourlySeconds ?? []).slice(0, 4).reduce((a, b) => a + b, 0) + (d.hourlySeconds?.[23] ?? 0) > 1800).length;
  const weekStart = now - 7 * 86_400_000;
  const focus = input.focusLog.filter(f => f.startedAt >= weekStart && f.seconds >= 300);
  const finished = focus.filter(f => f.outcome === "done").length;

  let observation: string;
  let suggestion: string;
  let apply: Letter["apply"];
  if (lateDays >= 3) {
    observation = `You were still at the screen late on ${plural(lateDays, "night")} this week.`;
    suggestion = "I could start yawning a little before bedtime, so the evening has an edge.";
    if (!settings.wind_down_enabled) apply = { label: "Turn on wind-down", patch: { wind_down_enabled: true } };
  } else if (slump !== null) {
    observation = `You took most pauses before ${hourName(slump)}, and hardly any after.`;
    suggestion = "Maybe plan one real break in the middle of the afternoon, before you’re out of steam.";
  } else if (longest >= 2 * 3600) {
    observation = `Your longest stretch without a pause was ${span(longest)}.`;
    suggestion = "A nudge a little sooner might catch you before you stiffen up.";
    const sooner = Math.max(20, settings.reminder_interval_mins - 10);
    if (sooner < settings.reminder_interval_mins) apply = { label: `Nudge every ${sooner} min`, patch: { reminder_interval_mins: sooner } };
  } else if (breaks / Math.max(1, sum(week, active) / 3600) < 0.4) {
    observation = `There were ${plural(breaks, "pause")} across ${span(sum(week, active))} of screen time.`;
    suggestion = "Tiny ones count. Twenty seconds for your eyes is a good place to start.";
    if (!settings.rhythm_eyes) apply = { label: "Turn on eye rests", patch: { rhythm_eyes: true } };
  } else if (before !== null && screen < before * 0.85) {
    observation = `You spent about ${span(before - screen)} less per day at the screen than the week before.`;
    suggestion = "Whatever you did with that time, keep some of it.";
  } else {
    observation = `You paused ${plural(breaks, "time")} this week. That’s a steady rhythm.`;
    suggestion = "Nothing to fix. Let’s do it again.";
  }

  const details = [`About ${span(screen)} at the screen on an active day.`];
  if (before !== null && Math.abs(screen - before) >= 900) details[0] = `About ${span(screen)} at the screen on an active day, ${span(Math.abs(screen - before))} ${screen < before ? "less" : "more"} than the week before.`;
  if (focus.length) details.push(`${plural(focus.length, "focus session")}${finished ? `, ${finished} finished` : ""}.`);
  if (input.blooms) details.push(`${plural(input.blooms, "bloom")} in our garden now.`);
  const moods = week.flatMap(d => d.mood ? [d.mood] : []);
  if (moods.length >= 3) details.push(`You called most days ${["rough", "a bit rough", "okay", "good", "great"][Math.round(moods.reduce((a, b) => a + b, 0) / moods.length) - 1]}.`);

  return { greeting: "Dear you,", observation, details, suggestion, apply, signature: input.petName };
}

/** The Monday of this week, used so each week's letter is offered once. */
export function letterWeek(now: number): string {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(d.getTime());
}

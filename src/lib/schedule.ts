/** Times of day are whole minutes after midnight, local time. */

export const DAY_MINUTES = 24 * 60;
const SOON_MINUTES = 45;
const LATE_MINUTES = 5 * 60;

export const minuteOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

export function formatMinuteOfDay(minute: number): string {
  return new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60)
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function toTimeInput(minute: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

export function fromTimeInput(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]), minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export interface ActiveHours { enabled: boolean; start: number; end: number; weekends: boolean }

/** Whether nudges may appear now. Overnight ranges belong to the day they started on. */
export function withinActiveHours(date: Date, hours: ActiveHours): boolean {
  if (!hours.enabled) return true;
  const minute = minuteOfDay(date);
  const overnight = hours.start > hours.end;
  const inside = hours.start === hours.end ? true
    : overnight ? minute >= hours.start || minute < hours.end
    : minute >= hours.start && minute < hours.end;
  if (!inside) return false;
  if (hours.weekends) return true;
  const day = new Date(date);
  if (overnight && minute < hours.end) day.setDate(day.getDate() - 1);
  return day.getDay() !== 0 && day.getDay() !== 6;
}

export type WindDownPhase = "day" | "soon" | "late";

/** "soon" is the 45 minutes before bedtime; "late" is the five hours from it. */
export function windDownPhase(date: Date, windDown: { enabled: boolean; bedtime: number }): WindDownPhase {
  if (!windDown.enabled) return "day";
  const sinceBedtime = (minuteOfDay(date) - windDown.bedtime + DAY_MINUTES) % DAY_MINUTES;
  if (sinceBedtime < LATE_MINUTES) return "late";
  return sinceBedtime >= DAY_MINUTES - SOON_MINUTES ? "soon" : "day";
}

/** One key per night, so "not tonight" still holds after midnight. */
export function nightKey(date: Date): string {
  const night = new Date(date.getTime() - 12 * 3600_000);
  return `${night.getFullYear()}-${night.getMonth() + 1}-${night.getDate()}`;
}

/** 6 AM on the next morning. */
export function tomorrowMorning(now: number): number {
  const date = new Date(now);
  if (date.getHours() >= 6) date.setDate(date.getDate() + 1);
  date.setHours(6, 0, 0, 0);
  return date.getTime();
}

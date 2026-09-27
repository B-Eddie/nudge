import type { Settings } from "./settings";

export type ReminderTone = NonNullable<Settings["reminder_tone"]>;

export function reminderText(tone: ReminderTone, elapsedMinutes: number): string {
  const minutes = Math.max(1, Math.round(elapsedMinutes));
  switch (tone) {
    case "gentle": return `You've been at your desk for ${minutes} minutes. A short break might help.`;
    case "direct": return `${minutes} minutes at your desk. Take a break.`;
    default: return `You've been on for ${minutes} minute${minutes === 1 ? "" : "s"}!`;
  }
}

export function distractionText(tone: ReminderTone, fallback: string): string {
  if (tone === "gentle") return "A little time away from the screen might feel good.";
  if (tone === "direct") return "You've been in this app for a while. Take a break.";
  return fallback;
}

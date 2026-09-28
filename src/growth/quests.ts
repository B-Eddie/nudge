// Break quests: tiny, honest micro-activities suggested while resting.
// Completing one is trust-based (the pet takes your word for it) and earns XP.
export const BREAK_QUESTS: string[] = [
  "Stretch your arms overhead for a minute",
  "Drink a full glass of water",
  "20-20-20: look at something 20 feet away for 20 seconds",
  "Roll your shoulders 10 times",
  "Stand up and walk to another room",
  "Take 5 slow, deep breaths",
  "Unclench your jaw and drop your shoulders",
  "Do 10 squats by your desk",
];

/** Rotate quests by break count so consecutive breaks feel different. */
export function questForBreak(breaksTaken: number): string {
  return BREAK_QUESTS[breaksTaken % BREAK_QUESTS.length];
}

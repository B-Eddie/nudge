/** Napjutsu: the pets are fighters, and the strongest technique is doing nothing. Names are
 * puns on a genre; the moves, pictures and choreography are our own. */
import type { CompanionId } from "../types/appearance";

export const EXPANSION = "Do-Nothing Expansion";
export interface Technique { name: string; calm: string; power: string; glow: string; after: string }
export const TECHNIQUES: Record<CompanionId, Technique> = {
  cat: { name: "Moonevolent Shrine", calm: "#171238", power: "#f4dc6a", glow: "#fff6c2", after: "whatever." },
  panda: { name: "Unlimited Bamvoid", calm: "#0b0d0c", power: "#7fe08a", glow: "#e6ffe0", after: "snack time" },
  capybara: { name: "Chillmera Citrus Garden", calm: "#0c3a44", power: "#f6bb45", glow: "#fff0c0", after: "ahh." },
  crab: { name: "Shell-Embodiment of Perfection", calm: "#26060f", power: "#ff4a5e", glow: "#ffd9d0", after: "perfect" },
};

/** Friendship, as a rank. Same order as the bond levels. */
export const RANKS = ["Grade 4 napper", "Grade 3 napper", "Grade 2 napper", "Grade 1 napper", "Semi-special grade", "Special grade napper"] as const;

const BY_ENERGY: Record<number, string[]> = {
  5: ["rest energy: overflowing", "I could nap through anything right now", "I’ve mastered the art of sitting", "this is me at one percent"],
  4: ["still warming up", "my rest energy is stable", "a true master blinks often"],
  3: ["my rest energy is leaking", "we should train. by lying down", "even the strongest take breaks"],
  2: ["rest energy critical", "I’ve used up my technique", "we are not built for this arc"],
  1: ["nah. I’d nap", "this is my final form. it’s horizontal", "tell my students… I was sleepy"],
};
export function napLine(energy: number, random = Math.random()): string {
  const lines = BY_ENERGY[Math.max(1, Math.min(5, Math.round(energy)))];
  return lines[Math.floor(random * lines.length)];
}
export const RESTED_LINES = ["Rest energy full. We are the strongest.", "Training arc complete.", "Power level: well rested."];
export const REST_START = (minutes: string) => `Training arc: about ${minutes} of rest to full power.`;

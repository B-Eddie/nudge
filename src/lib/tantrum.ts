/** How each pet gets cross on your behalf. Always at the thing on screen, never at you. */
import type { CompanionId } from "../types/appearance";
import type { PetPose } from "../types/pixelPets";

export type TantrumAct = "stand" | "stomp" | "shake" | "lunge" | "loom" | "charge";
export interface TantrumStep {
  pose: PetPose; ms: number; act: TantrumAct;
  shout?: string;
  /** Launches something as the step begins. */
  throws?: boolean;
  /** Some moments land better with a straight face. */
  calm?: boolean;
}

export const TANTRUMS: Record<CompanionId, TantrumStep[]> = {
  crab: [
    { pose: "walkA", ms: 1000, act: "shake", shout: "HEY." },
    { pose: "stretch", ms: 750, act: "loom", throws: true },
    { pose: "yawn", ms: 900, act: "shake", shout: "GRRR" },
    { pose: "stretch", ms: 700, act: "shake", throws: true },
    { pose: "walkB", ms: 600, act: "lunge", throws: true },
    { pose: "idle", ms: 1300, act: "stand", shout: "hmph" },
  ],
  panda: [
    { pose: "idle", ms: 900, act: "stand", shout: "no." },
    { pose: "walkA", ms: 450, act: "stomp" },
    { pose: "walkB", ms: 450, act: "stomp" },
    { pose: "stretch", ms: 750, act: "shake", throws: true, shout: "NO" },
    { pose: "walkA", ms: 450, act: "stomp" },
    { pose: "stretch", ms: 750, act: "shake", throws: true },
    { pose: "yawn", ms: 1000, act: "shake", shout: "WHYYY" },
    { pose: "idle", ms: 1200, act: "stand", shout: "okay. done" },
  ],
  cat: [
    { pose: "idle", ms: 1100, act: "stand", shout: "…" },
    { pose: "walkA", ms: 600, act: "lunge" },
    { pose: "yawn", ms: 1000, act: "shake", shout: "HSSSS" },
    { pose: "stretch", ms: 600, act: "lunge", throws: true },
    { pose: "stretch", ms: 600, act: "lunge", throws: true },
    { pose: "stretch", ms: 600, act: "lunge", throws: true },
    // As if nothing happened.
    { pose: "groom", ms: 1500, act: "stand", calm: true },
  ],
  capybara: [
    { pose: "idle", ms: 2000, act: "stand" },
    { pose: "blink", ms: 350, act: "stand", calm: true },
    { pose: "idle", ms: 1100, act: "stand", shout: "I see." },
    { pose: "curious", ms: 1200, act: "lunge", throws: true },
    { pose: "idle", ms: 1500, act: "stand", shout: "better" },
  ],
};

/** Choreography for a Do-Nothing Expansion, timed to src/lib/ultimate.ts. */
const expansion = (strike: TantrumStep[], after: string): TantrumStep[] => [
  { pose: "idle", ms: 1550, act: "charge" },
  { pose: "stretch", ms: 1350, act: "loom" },
  ...strike,
  { pose: "blink", ms: 700, act: "stand", calm: true },
  { pose: "idle", ms: 750, act: "stand", calm: true, shout: after },
];
export const ULTIMATES: Record<CompanionId, TantrumStep[]> = {
  cat: expansion([{ pose: "stretch", ms: 1550, act: "lunge" }, { pose: "groom", ms: 500, act: "stand", calm: true }], "whatever."),
  panda: expansion([{ pose: "stretch", ms: 1550, act: "stomp" }, { pose: "yawn", ms: 500, act: "shake" }], "snack time"),
  // It does nothing. That is the technique.
  capybara: expansion([{ pose: "blink", ms: 1550, act: "stand", calm: true }, { pose: "idle", ms: 500, act: "stand" }], "ahh."),
  crab: expansion([{ pose: "walkA", ms: 1450, act: "shake" }, { pose: "stretch", ms: 600, act: "loom" }], "perfect"),
};
const stepsOf = (character: CompanionId, ultimate: boolean) => (ultimate ? ULTIMATES : TANTRUMS)[character];

export const tantrumLength = (character: CompanionId, ultimate = false) => stepsOf(character, ultimate).reduce((sum, step) => sum + step.ms, 0);

export interface TantrumFrame { step: TantrumStep; index: number; into: number }
export function tantrumAt(character: CompanionId, elapsedMs: number, ultimate = false): TantrumFrame | null {
  let left = elapsedMs;
  if (left < 0) return null;
  const steps = stepsOf(character, ultimate);
  for (let index = 0; index < steps.length; index++) {
    if (left < steps[index].ms) return { step: steps[index], index, into: left };
    left -= steps[index].ms;
  }
  return null;
}

/** When each throw leaves the paw, and how long it spends in the air. */
export const FLIGHT_MS = 520;
export function throwTimes(character: CompanionId): number[] {
  let at = 0;
  const times: number[] = [];
  for (const step of TANTRUMS[character]) {
    if (step.throws) times.push(at + 150);
    at += step.ms;
  }
  return times;
}

/** Small repeatable offsets for a pose in CSS pixels at the pet's base size. */
export function actOffset(act: TantrumAct, into: number): { x: number; y: number; scale: number } {
  const beat = Math.floor(into / 70) % 2;
  switch (act) {
    case "shake": return { x: beat ? 2 : -2, y: 0, scale: 1 };
    case "stomp": return { x: 0, y: into < 180 ? -6 : 0, scale: 1 };
    case "lunge": return { x: into < 260 ? 9 : 0, y: into < 260 ? -5 : 0, scale: 1 };
    case "charge": return { x: beat && into > 500 ? 1 : 0, y: -Math.min(6, into / 180), scale: 1 };
    case "loom": return { x: 0, y: 0, scale: 1 + Math.min(1, into / 500) * .12 };
    default: return { x: 0, y: 0, scale: 1 };
  }
}
/** A tidy parabola from paw to target, `t` from 0 to 1. */
export function flight(from: { x: number; y: number }, to: { x: number; y: number }, t: number): { x: number; y: number } {
  const lift = Math.max(40, Math.abs(to.x - from.x) * .18);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * lift };
}

/** Steady pseudo-random numbers, so a scene always plays the same way. */
export const scatter = (seed: number) => { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

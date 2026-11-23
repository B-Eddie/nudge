import type { PetPose } from "./pixelPets";

export type BreakTag = "eyes" | "seated" | "move" | "calm" | "connect";
export const BREAK_TAGS: { id: BreakTag; label: string }[] = [
  { id: "eyes", label: "Eyes" },
  { id: "seated", label: "Seated" },
  { id: "move", label: "Move" },
  { id: "calm", label: "Calm" },
  { id: "connect", label: "Connect" },
];

export interface BreakStep {
  seconds: number;
  text: string;
  /** What the companion does alongside you. */
  pose: PetPose;
  breathe?: "in" | "out";
}

export interface BreakRoutine {
  id: string;
  title: string;
  durationSeconds: number;
  description: string;
  instruction: string;
  tags: BreakTag[];
  steps: BreakStep[];
}

const step = (seconds: number, text: string, pose: PetPose): BreakStep => ({ seconds, text, pose });
const routine = (id: string, title: string, description: string, tags: BreakTag[], steps: BreakStep[], instruction = steps[0].text): BreakRoutine =>
  ({ id, title, description, instruction, tags, steps, durationSeconds: steps.reduce((sum, s) => sum + s.seconds, 0) });

const breaths = (count: number): BreakStep[] => Array.from({ length: count }, () => [
  { seconds: 4, text: "Breathe in", pose: "idle" as const, breathe: "in" as const },
  { seconds: 6, text: "And slowly out", pose: "blink" as const, breathe: "out" as const },
]).flat();

export const BREAK_ROUTINES: BreakRoutine[] = [
  routine("far-focus", "Rest your eyes", "Look at something far away.", ["eyes", "seated"], [
    step(20, "Look across the room or out a window. Let your eyes rest on something far away.", "curious"),
  ]),
  routine("shoulders", "Unclench and roll", "Ease your shoulders and hands.", ["seated"], [
    step(15, "Let your shoulders drop away from your ears.", "idle"),
    step(15, "Roll them slowly backwards.", "stretch"),
    step(15, "Open your hands wide, then let them relax.", "groom"),
  ]),
  routine("breathing", "Take a few slow breaths", "A quiet minute at your own pace.", ["calm", "seated"], breaths(6),
    "Breathe comfortably. Let each exhale be a little slower; skip this one if it does not feel right."),
  routine("move", "Stand and stretch", "Get up, move around, maybe refill your water.", ["move"], [
    step(30, "Stand up when you’re ready.", "happy"),
    step(30, "Reach up tall, then let your arms fall.", "stretch"),
    step(30, "Sway or twist gently from side to side.", "stretch"),
    step(30, "Walk a few steps. Refill your water on the way.", "walkA"),
  ]),
  routine("wrists", "Loosen your wrists", "For hands that have typed a lot.", ["seated"], [
    step(10, "Circle your wrists one way.", "groom"),
    step(10, "Now the other way.", "groom"),
    step(10, "Press your palms together, softly.", "idle"),
    step(10, "Shake your hands out.", "delighted"),
  ]),
  routine("neck", "Ease your neck", "Slow and small, no pulling.", ["seated"], [
    step(15, "Let your right ear tip toward your shoulder.", "curious"),
    step(15, "And the left. Only as far as feels good.", "curious"),
    step(15, "Look straight ahead and lengthen the back of your neck.", "idle"),
  ]),
  routine("eyes-closed", "Close your eyes", "Forty seconds of nothing to see.", ["eyes", "calm", "seated"], [
    step(40, "Close your eyes and let your face go soft. I’ll keep the time.", "sleep"),
  ]),
  routine("water", "Get some water", "A short walk with a purpose.", ["move"], [
    step(30, "Leave your desk and head for a glass.", "walkA"),
    step(60, "Drink it somewhere without a screen.", "happy"),
  ]),
  routine("window", "Look out a window", "Notice three things outside.", ["eyes", "calm"], [
    step(20, "Find something moving.", "curious"),
    step(20, "Find a color you haven’t seen today.", "curious"),
    step(20, "Find the farthest thing you can.", "idle"),
  ]),
  routine("listen", "Listen for three sounds", "Nothing to look at, nothing to do.", ["calm", "seated"], [
    step(15, "Notice a sound close to you.", "idle"),
    step(15, "Notice one farther away.", "curious"),
    step(15, "And the quietest one you can find.", "blink"),
  ]),
  routine("hips", "Open your hips", "Undo some of the sitting.", ["move"], [
    step(20, "Stand and hold your chair or desk for balance.", "idle"),
    step(20, "Step one foot back and lean in gently.", "stretch"),
    step(20, "Swap sides.", "stretch"),
  ]),
  routine("tidy", "Put one thing away", "A slightly clearer desk.", ["calm", "move"], [
    step(60, "Pick one thing near you and give it a home.", "groom"),
  ]),
  routine("hello", "Send a hello", "To someone you like.", ["connect"], [
    step(20, "Think of someone who’d smile to hear from you.", "happy"),
    step(70, "Send them a line, or wave at whoever’s nearby.", "delighted"),
  ]),
  routine("outside", "Step outside", "Five minutes of actual weather.", ["move", "calm"], [
    step(60, "Head for the door.", "walkA"),
    step(180, "Walk slowly, or just stand in the light.", "curious"),
    step(60, "Wander back when you’re ready.", "walkB"),
  ]),
];

/** The step in progress, and how many seconds of it remain. */
export function stepAt(routine: BreakRoutine, elapsedSeconds: number): { step: BreakStep; index: number; left: number } {
  let start = 0;
  for (let index = 0; index < routine.steps.length; index++) {
    const step = routine.steps[index];
    if (elapsedSeconds < start + step.seconds || index === routine.steps.length - 1) {
      return { step, index, left: Math.max(0, start + step.seconds - elapsedSeconds) };
    }
    start += step.seconds;
  }
  throw new Error("A routine needs at least one step");
}

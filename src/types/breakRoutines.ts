export interface BreakRoutine {
  id: string;
  title: string;
  durationSeconds: number;
  description: string;
  instruction: string;
}

export const BREAK_ROUTINES: BreakRoutine[] = [
  {
    id: "far-focus",
    title: "Rest your eyes",
    durationSeconds: 20,
    description: "A screen-free moment for your eyes.",
    instruction: "Look across the room or out a window. Let your eyes rest on something far away.",
  },
  {
    id: "shoulders",
    title: "Unclench and roll",
    durationSeconds: 45,
    description: "Ease your shoulders and hands.",
    instruction: "Let your shoulders drop. Roll them slowly backwards, then open and relax your hands.",
  },
  {
    id: "breathing",
    title: "Take a few slow breaths",
    durationSeconds: 60,
    description: "A quiet minute at your own pace.",
    instruction: "Breathe comfortably. Let each exhale be a little slower; skip this one if it does not feel right.",
  },
  {
    id: "move",
    title: "Stand and stretch",
    durationSeconds: 120,
    description: "Get out of your chair for a minute.",
    instruction: "Stand, stretch in a way that feels good, or refill your water. Come back whenever you like.",
  },
];

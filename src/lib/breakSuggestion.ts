import { BREAK_ROUTINES, type BreakRoutine } from "../types/breakRoutines";

export interface RoutineMemory { done: number; helped: number; notReally: number; lastAt: number }
export interface SuggestionContext {
  workSeconds: number;
  energy: number;
  hour: number;
  category?: string;
  memory: Record<string, RoutineMemory>;
}

const SCREEN_HEAVY = ["Video", "Entertainment", "Social Networking", "Games"];
const TYPING_HEAVY = ["Developer Tools", "Productivity", "Messages", "Learning"];

function score(routine: BreakRoutine, c: SuggestionContext, recent: string[]): number {
  const has = (tag: BreakRoutine["tags"][number]) => routine.tags.includes(tag);
  const late = c.hour >= 21 || c.hour < 6;
  let value = 0;
  if (c.workSeconds >= 3600 && has("move")) value += 2.5;
  else if (c.workSeconds >= 1500 && has("move")) value += 1;
  if (c.category && SCREEN_HEAVY.includes(c.category) && has("eyes")) value += 2;
  if (c.category && TYPING_HEAVY.includes(c.category) && (routine.id === "wrists" || routine.id === "shoulders")) value += 1.5;
  if (c.energy <= 2 && has("calm")) value += 1;
  if (late) value += has("calm") ? 2 : has("move") ? -1.5 : 0;
  if (late && routine.id === "outside") value -= 3;
  if (routine.durationSeconds <= 45) value += 0.75;
  if (routine.durationSeconds >= 180) value -= 0.75;
  const memory = c.memory[routine.id];
  if (memory) value += 2 * (memory.helped - memory.notReally) / (memory.helped + memory.notReally + 2);
  const age = recent.indexOf(routine.id);
  if (age >= 0) value -= 3 - age;
  return value;
}

/** Routines best suited to right now first. Ties keep their listed order. */
export function rankRoutines(context: SuggestionContext): BreakRoutine[] {
  const recent = Object.entries(context.memory).filter(([, m]) => m.lastAt > 0)
    .sort((a, b) => b[1].lastAt - a[1].lastAt).slice(0, 3).map(([id]) => id);
  return BREAK_ROUTINES.map((routine, order) => ({ routine, order, value: score(routine, context, recent) }))
    .sort((a, b) => b.value - a.value || a.order - b.order).map(entry => entry.routine);
}

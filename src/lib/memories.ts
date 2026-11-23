/** Things the companion might bring up, drawn only from what really happened. */
import type { DayRecord } from "../components/SummaryPanel";
import { BREAK_ROUTINES } from "../types/breakRoutines";
import { daysTogether, type CompanionState } from "./companion";
import { blooms, SPECIES, stageOf } from "./garden";
import { daysBefore } from "./weeklyLetter";

export function memories(state: CompanionState, history: readonly DayRecord[], now: number): string[] {
  const lines: string[] = [];
  const [yesterday] = daysBefore(history, now, 1);
  if (yesterday?.breaksTaken >= 3) lines.push(`Yesterday you paused ${yesterday.breaksTaken} times. I noticed.`);
  const done = [...state.focusLog].reverse().find(f => f.outcome === "done" && now - f.startedAt < 7 * 86_400_000);
  if (done) lines.push(`Remember finishing “${done.text}”? That was nice.`);
  const stuck = [...state.focusLog].reverse().find(f => f.outcome === "stuck");
  if (stuck && now - stuck.startedAt < 3 * 86_400_000) lines.push(`“${stuck.text}” got sticky last time. Fresh eyes today?`);
  const favorite = Object.entries(state.routines).filter(([, m]) => m.helped >= 2).sort((a, b) => b[1].helped - a[1].helped)[0];
  const routine = favorite && BREAK_ROUTINES.find(r => r.id === favorite[0]);
  if (routine) lines.push(`“${routine.title}” usually helps you. Just saying.`);
  const grown = blooms(state.plants);
  if (grown >= 2) lines.push(`We’ve grown ${grown} blooms together.`);
  const newest = state.plants[state.plants.length - 1];
  if (newest && stageOf(newest) === "bud") lines.push("One more pause and our bud opens.");
  else if (newest && stageOf(newest) === "bloom") lines.push(`I like our ${SPECIES[newest.species].name.toLowerCase()}.`);
  const days = daysTogether(state, now);
  if (days >= 3) lines.push(`Day ${days} together.`);
  return lines;
}

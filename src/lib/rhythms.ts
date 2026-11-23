/** Small optional rhythms, each spoken as one line at a pause, never a card. */

export type RhythmId = "eyes" | "water" | "posture";
export const RHYTHMS: Record<RhythmId, { label: string; everyMins: number; lines: string[] }> = {
  eyes: { label: "Rest my eyes", everyMins: 20, lines: ["Look across the room for twenty seconds?", "Find the farthest thing you can see.", "Blink slowly a few times with me."] },
  posture: { label: "Reset my posture", everyMins: 40, lines: ["Let your shoulders drop.", "Feet flat, jaw loose. Better?", "Sit tall for one slow breath."] },
  water: { label: "Drink some water", everyMins: 60, lines: ["A sip of water?", "Your glass is feeling left out.", "Hydration break. I’ll wait."] },
};
/** A rhythm stays quiet this close to a full nudge. */
const NEAR_NUDGE_SECS = 5 * 60;

export interface RhythmClock { seconds: Record<RhythmId, number> }
export const newRhythmClock = (): RhythmClock => ({ seconds: { eyes: 0, posture: 0, water: 0 } });

export const tickRhythms = (clock: RhythmClock): RhythmClock =>
  ({ seconds: { eyes: clock.seconds.eyes + 1, posture: clock.seconds.posture + 1, water: clock.seconds.water + 1 } });

/** The rhythm that is most overdue, if any is due and no full nudge is close. */
export function dueRhythm(clock: RhythmClock, enabled: readonly RhythmId[], secondsToNudge: number): RhythmId | null {
  if (secondsToNudge < NEAR_NUDGE_SECS) return null;
  let best: RhythmId | null = null, most = 1;
  for (const id of enabled) {
    const due = clock.seconds[id] / (RHYTHMS[id].everyMins * 60);
    if (due >= most) { best = id; most = due; }
  }
  return best;
}
export const resetRhythm = (clock: RhythmClock, id: RhythmId): RhythmClock =>
  ({ seconds: { ...clock.seconds, [id]: 0 } });
/** A real break rests the eyes and the back; water keeps its own time. */
export const rhythmsAfterBreak = (clock: RhythmClock): RhythmClock =>
  ({ seconds: { eyes: 0, posture: 0, water: clock.seconds.water } });

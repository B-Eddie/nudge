/** Energy bars and rest arithmetic shared by the overlay, breaks and tests. */

export const ENERGY_CELLS = 5;

/** A pause longer than this stops being "a pause", so a marathon never asks for an hour. */
export const MAX_REST_MINUTES = 20;

/** Energy bars (1..ENERGY_CELLS) for a tier. Tier 1 is full energy. */
export function energyFromTier(tier: number): number {
  const clamped = Math.min(ENERGY_CELLS, Math.max(1, Math.abs(tier)));
  return ENERGY_CELLS + 1 - clamped;
}

/** Live energy bars while resting. */
export function breakEnergy(startTier: number, progress: number): number {
  const startEnergy = energyFromTier(startTier);
  const p = Math.min(1, Math.max(0, progress));
  return Math.round(startEnergy + p * (ENERGY_CELLS - startEnergy));
}

/** Tier for a break's progress, kept once it ends. Mirrors breakEnergy. */
export function tierFromBreakProgress(startTier: number, progress: number): number {
  return ENERGY_CELLS + 1 - breakEnergy(startTier, progress);
}

/** Tier (1 = full energy) from continuous work time and the reminder interval. */
export function tierFromWorkSeconds(workSeconds: number, intervalMins: number): number {
  const intervalSecs = intervalMins * 60;
  if (intervalSecs <= 0) return 1;
  return Math.min(5, 1 + Math.floor(workSeconds / intervalSecs));
}

/** Minutes of rest that refill energy after this much work. */
export function restMinutesFor(workSeconds: number, tier: number): number {
  const factor = tier < 2 ? 0.2 : 0.4;
  return Math.min(MAX_REST_MINUTES, Math.max(1, Math.round((workSeconds / 60) * factor)));
}

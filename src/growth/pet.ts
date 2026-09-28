// Pet bonding: per-character profile (name, XP, counters) persisted in
// localStorage. The Rust ActivityState drops unknown JSON fields on save, so
// everything new and persistent lives here instead.
import type { CharacterId } from "../assets/characters/manifest";

export interface PetProfile {
  /** Display name; defaults to the character's canonical name. */
  name: string;
  xp: number;
  focusSessions: number;
  questsDone: number;
  fullBreaks: number;
}

export const XP_PER_LEVEL = 100;
export const XP_QUEST_DONE = 15;
export const XP_FULL_BREAK = 10;
export const XP_FOCUS_25 = 50;
export const XP_FOCUS_50 = 100;

const STORAGE_KEY = "nudge.pet.v1";

function defaults(fallbackName: string): PetProfile {
  return {
    name: fallbackName,
    xp: 0,
    focusSessions: 0,
    questsDone: 0,
    fullBreaks: 0,
  };
}

function readAll(): Record<string, PetProfile> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, PetProfile>;
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
    // Corrupted storage: start fresh rather than crash the overlay.
  }
  return {};
}

export function loadPetProfile(
  characterId: CharacterId,
  fallbackName: string,
): PetProfile {
  const found = readAll()[characterId];
  if (found && typeof found.xp === "number") {
    return { ...defaults(fallbackName), ...found };
  }
  return defaults(fallbackName);
}

export function savePetProfile(
  characterId: CharacterId,
  profile: PetProfile,
): void {
  try {
    const all = readAll();
    all[characterId] = profile;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked: non-fatal, the session just won't persist.
  }
}

export function levelForXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
}

/** XP earned toward the next level (0..XP_PER_LEVEL-1). */
export function xpIntoLevel(xp: number): number {
  return Math.max(0, xp) % XP_PER_LEVEL;
}

/**
 * Add XP to a profile in place. Returns the new level when a level-up
 * happened, otherwise null. Pure w.r.t. React: no side effects.
 */
export function grantXp(profile: PetProfile, amount: number): number | null {
  const before = levelForXp(profile.xp);
  profile.xp = Math.max(0, profile.xp + amount);
  const after = levelForXp(profile.xp);
  return after > before ? after : null;
}

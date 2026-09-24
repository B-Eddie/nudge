// Companion roster, per-character themes, and portrait art.
//
// Art lives in src/assets/characters/<id>/*.png (AI-generated pixel portraits
// committed to the repo). The overlay pet sprite bundles in
// src/assets/animation/ are untouched — new art is used for portraits, panel
// headers, the picker, and empty states. Theme tokens here mirror
// design/DESIGN-SYSTEM.md; the CSS in App.css applies them via
// [data-character-theme] on <html> (token swap, not component swap).

const portraitModules = import.meta.glob<string>("./*/*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

const spriteModules = import.meta.glob<string>("../animation/*/*/*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

function portrait(id: string, file: string): string {
  const url = portraitModules[`./${id}/${file}`];
  if (!url) throw new Error(`missing character art: ${id}/${file}`);
  return url;
}

/** First idle frame of a sprite bundle (1 = fresh … 4 = most tired). */
function spritePortrait(bundle: number): string {
  const url = spriteModules[`../animation/${bundle}/idle/1.png`];
  if (!url) throw new Error(`missing sprite portrait: bundle ${bundle}`);
  return url;
}

export type CharacterId = "panda" | "maple" | "puddle";

export interface CharacterThemeTokens {
  accent: string;
  accentDeep: string;
  accentSoft: string;
  accentGlow: string;
}

export interface CharacterAction {
  id: string;
  label: string;
  src: string;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  species: string;
  tagline: string;
  theme: CharacterThemeTokens;
  /** Picker / showcase portrait. */
  portrait: string;
  /** Five portraits, fresh → exhausted (index 0 = full energy). */
  energyPortraits: string[];
  /** Extra situational art (panda only for now). */
  actions: CharacterAction[];
}

// Panda reuses the live sprite bundles for its energy ladder so the portrait
// in panels always matches the pet on screen: tiers 1-2 → bundle 1 (fresh),
// then one bundle per tier down to bundle 4 at tier 5.
const pandaEnergy = [1, 1, 2, 3, 4].map(spritePortrait);

export const CHARACTERS: CharacterDef[] = [
  {
    id: "panda",
    name: "Mochi",
    species: "Panda",
    tagline: "The original grove keeper. Steady, soft, always on your side.",
    theme: {
      accent: "#5F8F4E",
      accentDeep: "#3E6B33",
      accentSoft: "#E2EDD2",
      accentGlow: "rgba(95,143,78,.35)",
    },
    portrait: portrait("panda", "hero.png"),
    energyPortraits: pandaEnergy,
    actions: [
      { id: "sleep", label: "Off to dreamland", src: portrait("panda", "sleep.png") },
      { id: "stretch", label: "Morning stretch", src: portrait("panda", "stretch.png") },
      { id: "tea", label: "Tea break", src: portrait("panda", "tea.png") },
      { id: "celebrate", label: "You did it", src: portrait("panda", "celebrate.png") },
      { id: "focus", label: "Locked in", src: portrait("panda", "focus.png") },
      { id: "nudge", label: "Gentle nudge", src: portrait("panda", "nudge.png") },
    ],
  },
  {
    id: "maple",
    name: "Maple",
    species: "Red panda",
    tagline: "Runs warm and bright. A little dramatic about breaks.",
    theme: {
      accent: "#C4703B",
      accentDeep: "#96502A",
      accentSoft: "#F6E4CC",
      accentGlow: "rgba(196,112,59,.35)",
    },
    portrait: portrait("maple", "energy-1.png"),
    energyPortraits: [1, 2, 3, 4, 5].map((n) =>
      portrait("maple", `energy-${n}.png`),
    ),
    actions: [],
  },
  {
    id: "puddle",
    name: "Puddle",
    species: "Frog",
    tagline: "Believes deeply in naps. Will not be rushed.",
    theme: {
      accent: "#3E9B8F",
      accentDeep: "#2B6E64",
      accentSoft: "#D9EEE8",
      accentGlow: "rgba(62,155,143,.35)",
    },
    portrait: portrait("puddle", "energy-1.png"),
    energyPortraits: [1, 2, 3, 4, 5].map((n) =>
      portrait("puddle", `energy-${n}.png`),
    ),
    actions: [],
  },
];

export const DEFAULT_CHARACTER_ID: CharacterId = "panda";

export function getCharacter(id: string | undefined | null): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

/** Portrait matching the app's energy level (5 = full … 1 = exhausted). */
export function portraitForEnergy(character: CharacterDef, energy: number): string {
  const clamped = Math.min(5, Math.max(1, Math.round(energy)));
  return character.energyPortraits[clamped - 1];
}

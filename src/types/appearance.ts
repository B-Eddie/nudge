import pandaPreview from "../assets/pets/pixel/panda.png";
import catPreview from "../assets/pets/pixel/cat.png";
import redPandaPreview from "../assets/pets/pixel/red_panda.png";
import capybaraPreview from "../assets/pets/pixel/capybara.png";
import crabPreview from "../assets/pets/pixel/crab.png";

export type CompanionId = "panda" | "red_panda" | "cat" | "capybara" | "crab";
/** "system" follows the macOS Light/Dark appearance; the others are fixed. */
export type ThemeId = "system" | "bamboo" | "night_garden";

export interface CompanionOption {
  id: CompanionId;
  name: string;
  description: string;
  preview: string;
}

export const COMPANIONS: CompanionOption[] = [
  {
    id: "crab",
    name: "Crab",
    description: "A curious little desk gardener",
    preview: crabPreview,
  },
  {
    id: "panda",
    name: "Panda",
    description: "Your original calm companion",
    preview: pandaPreview,
  },
  {
    id: "red_panda",
    name: "Red panda",
    description: "Curious, with a busy little tail",
    preview: redPandaPreview,
  },
  {
    id: "cat",
    name: "Tuxedo cat",
    description: "A quiet desk-side presence",
    preview: catPreview,
  },
  {
    id: "capybara",
    name: "Capybara",
    description: "A slow-and-steady friend",
    preview: capybaraPreview,
  },
];

export const THEMES: { id: ThemeId; name: string; description: string }[] = [
  {
    id: "system",
    name: "Match Mac",
    description: "Follows Light and Dark Mode",
  },
  {
    id: "bamboo",
    name: "Light",
    description: "Clean whites and soft sky blue",
  },
  {
    id: "night_garden",
    name: "Dark",
    description: "Cool charcoal and gentle blue",
  },
];

export function normalizeTheme(theme?: string): ThemeId {
  return theme === "night_garden" || theme === "system" ? theme : "bamboo";
}

const darkQuery = () =>
  typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

/** The concrete palette a theme setting shows right now. */
export function resolveTheme(theme: string, systemDark = darkQuery()?.matches ?? false): "bamboo" | "night_garden" {
  const normalized = normalizeTheme(theme);
  if (normalized === "system") return systemDark ? "night_garden" : "bamboo";
  return normalized;
}

let stopFollowingSystem: (() => void) | null = null;

/** Applies a theme; "system" keeps following macOS when the appearance changes. */
export function applyTheme(theme: string): void {
  stopFollowingSystem?.();
  stopFollowingSystem = null;
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(theme);
  if (normalizeTheme(theme) !== "system") return;
  const query = darkQuery();
  if (!query) return;
  const update = () => { root.dataset.theme = resolveTheme("system", query.matches); };
  query.addEventListener("change", update);
  stopFollowingSystem = () => query.removeEventListener("change", update);
}

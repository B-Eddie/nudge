import pandaPreview from "../assets/pets/pixel/panda.png";
import catPreview from "../assets/pets/pixel/cat.png";
import redPandaPreview from "../assets/pets/pixel/red_panda.png";
import capybaraPreview from "../assets/pets/pixel/capybara.png";
import crabPreview from "../assets/pets/pixel/crab.png";

export type CompanionId = "panda" | "red_panda" | "cat" | "capybara" | "crab";
export type ThemeId = "bamboo" | "night_garden";

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
    id: "bamboo",
    name: "Cloud day",
    description: "Clean whites and soft sky blue",
  },
  {
    id: "night_garden",
    name: "Quiet night",
    description: "Cool charcoal and gentle blue",
  },
];

export function normalizeTheme(theme?: string): ThemeId {
  return theme === "night_garden" ? "night_garden" : "bamboo";
}

export function applyTheme(theme: string): void {
  document.documentElement.dataset.theme = normalizeTheme(theme);
}

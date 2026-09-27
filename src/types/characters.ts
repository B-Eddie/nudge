export const CHARACTERS = [
  { id: "panda", name: "Panda", description: "The original companion" },
  { id: "miso", name: "Miso", description: "A curious cat" },
  { id: "puddle", name: "Puddle", description: "A cheerful frog" },
  { id: "pip", name: "Pip", description: "A bright little fox" },
] as const;

export type CharacterId = (typeof CHARACTERS)[number]["id"];
export function normalizeCharacter(value: string | undefined): CharacterId {
  return CHARACTERS.find((character) => character.id === value)?.id ?? "panda";
}

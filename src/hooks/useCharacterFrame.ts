import { useEffect, useState } from "react";
import { normalizeCharacter, type CharacterId } from "../types/characters";

const frameModules = import.meta.glob<string>("../assets/animation/**/*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

const characterModules = import.meta.glob<string>("../assets/characters/**/*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

// Decode every frame once at startup and hold the references so the bitmaps
// stay in the image cache. Swapping `src` between frames then never hits the
// network or the decoder mid-animation, which is what caused visible flicker
// when the character changed states.
const preloadedFrames: HTMLImageElement[] = [];
if (typeof window !== "undefined") {
  for (const url of [...Object.values(frameModules), ...Object.values(characterModules)]) {
    const img = new Image();
    img.src = url;
    img.decode().catch(() => {
      /* decode may reject for cache-evicted images; the src fetch still warms the cache */
    });
    preloadedFrames.push(img);
  }
}

type FrameMap = Record<string, Record<string, string[]>>;
const FRAMES: FrameMap = (() => {
  const map: FrameMap = {};
  const pattern = /animation\/([^/]+)\/([^/]+)\/(\d+)\.png$/;

  Object.entries(frameModules)
    .map(([path, url]) => {
      const match = path.match(pattern);
      return match
        ? { bundle: match[1], category: match[2], index: Number(match[3]), url }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.index - b.index)
    .forEach(({ bundle, category, url }) => {
      ((map[bundle] ??= {})[category] ??= []).push(url);
    });

  return map;
})();

function characterSetFromCategory(categoryLabel: string | undefined): string {
  switch (categoryLabel?.toLowerCase()) {
    case "productivity":
      return "productivity";
    case "developer tools":
      return "computer";
    case "music":
      return "music";
    case "social networking":
      return "social";
    case "games":
    case "entertainment":
    case "video":
      return "idle";
    default:
      return "idle";
  }
}

function resolveFrames(bundle: number, category: string): string[] {
  const byCategory = FRAMES[String(bundle)] ?? FRAMES["1"] ?? {};
  return byCategory[category] ?? byCategory["idle"] ?? [];
}

export function characterFrameUrl(character: CharacterId, state: "idle" | "computer" | "nudge" | "sleep", tier = 1, index = 0): string | undefined {
  if (character === "panda") return undefined;
  const bundle = Math.min(4, Math.max(1, tier));
  const category = state === "nudge" || state === "sleep" ? state : `${bundle}/${state}`;
  return characterModules[`../assets/characters/${character}/${category}/${index % 2 + 1}.png`];
}

// The art ships 4 tiredness bundles for 5 energy tiers (tier 1 = full
// energy, tier 5 = 1/5 energy). Tier number equals bundle number, so the
// tiers outnumber the bundles by one. Map tier -> bundle by shifting down
// one: the fresh bundle covers tiers 1-2, and the most-tired bundle is only
// reached at tier 5 (1/5 energy) instead of never being shown.
function bundleFromTier(tier: number): number {
  return Math.max(1, Math.abs(tier) - 1);
}

function alternateBundleId(
  timeEvents: number,
  messageVisible: boolean,
): "-1" | "0" | null {
  if (timeEvents < 0 && !messageVisible) return "-1";
  if (timeEvents === 0 || messageVisible) return "0";
  return null;
}

const MIN_FRAME_INTERVAL_MS = 300;
const MAX_FRAME_INTERVAL_MS = 800;

export function useCharacterFrame(
  categoryLabel: string | undefined,
  timeEvents: number,
  messageVisible = false,
  character: CharacterId = "panda",
): string | undefined {
  const bundle = alternateBundleId(timeEvents, messageVisible);

  const alt1 = bundle
    ? frameModules[`../assets/animation/${bundle}/1.png`]
    : undefined;
  const alt2 = bundle
    ? frameModules[`../assets/animation/${bundle}/2.png`]
    : undefined;
  const alternates = [alt1, alt2].filter(Boolean) as string[];

  const [altIndex, setAltIndex] = useState(0);

  useEffect(() => {
    setAltIndex(0);
  }, [bundle, messageVisible, character]);

  useEffect(() => {
    if (!bundle || alternates.length < 2) return;
    const id = setInterval(() => {
      setAltIndex((prev) => (prev + 1) % 2);
    }, 500);
    return () => clearInterval(id);
  }, [bundle, alternates.length, character]);

  const category = characterSetFromCategory(categoryLabel);
  const bundleNumber = bundleFromTier(timeEvents);
  const frames = resolveFrames(bundleNumber, category);

  const [index, setIndex] = useState(0);
  const selected = normalizeCharacter(character);

  useEffect(() => {
    setIndex(0);
  }, [category, bundleNumber, selected]);

  useEffect(() => {
    if (bundle || (selected === "panda" && frames.length <= 1)) return;

    const interval =
      MIN_FRAME_INTERVAL_MS +
      Math.random() * (MAX_FRAME_INTERVAL_MS - MIN_FRAME_INTERVAL_MS);

    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % frames.length);
    }, interval);
    return () => clearInterval(id);
  }, [bundle, frames.length, category, bundleNumber, selected]);

  if (selected !== "panda") {
    const state = bundle === "-1" ? "sleep" : bundle === "0" ? "nudge"
      : characterSetFromCategory(categoryLabel) === "computer" ? "computer" : "idle";
    return characterFrameUrl(selected, state, bundleNumber, bundle ? altIndex : index);
  }
  if (bundle) {
    return alternates[altIndex] ?? alternates[0];
  }

  return frames[index] ?? frames[0];
}

import { useEffect, useState } from "react";

const frameModules = import.meta.glob<string>("../assets/animation/**/*.png", {
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
  for (const url of Object.values(frameModules)) {
    const img = new Image();
    img.src = url;
    img.decode().catch(() => {
      /* decode may reject for cache-evicted images; the src fetch still warms the cache */
    });
    preloadedFrames.push(img);
  }
}

type FrameMap = Record<string, Record<string, Record<string, string[]>>>;
type AltMap = Record<string, Record<string, string[]>>;
const { FRAMES, ALTS }: { FRAMES: FrameMap; ALTS: AltMap } = (() => {
  const frames: FrameMap = {};
  const alts: AltMap = {};
  const pattern = /animation\/([^/]+)\/(-?\d+)(?:\/([^/]+))?\/(\d+)\.png$/;

  Object.entries(frameModules)
    .map(([path, url]) => {
      const match = path.match(pattern);
      return match
        ? {
            character: match[1],
            bundle: match[2],
            category: match[3],
            index: Number(match[4]),
            url,
          }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.index - b.index)
    .forEach(({ character, bundle, category, url }) => {
      if (category) {
        (((frames[character] ??= {})[bundle] ??= {})[category] ??= []).push(
          url,
        );
      } else {
        ((alts[character] ??= {})[bundle] ??= []).push(url);
      }
    });

  return { FRAMES: frames, ALTS: alts };
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
      return "gaming";
    case "entertainment":
    case "video":
      return "idle";
    default:
      return "idle";
  }
}

function resolveFrames(
  character: string,
  bundle: number,
  category: string,
): string[] {
  const byBundle =
    FRAMES[character] ?? FRAMES["panda"] ?? {};
  const byCategory = byBundle[String(bundle)] ?? byBundle["1"] ?? {};
  return byCategory[category] ?? byCategory["idle"] ?? [];
}

function resolveAlts(character: string, bundle: "-1" | "0"): string[] {
  return (
    ALTS[character]?.[bundle] ?? ALTS["panda"]?.[bundle] ?? []
  );
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
  characterId = "panda",
): string | undefined {
  const bundle = alternateBundleId(timeEvents, messageVisible);

  const alternates = bundle ? resolveAlts(characterId, bundle) : [];

  const [altIndex, setAltIndex] = useState(0);

  useEffect(() => {
    setAltIndex(0);
  }, [bundle, timeEvents, messageVisible]);

  useEffect(() => {
    if (!bundle || alternates.length < 2) return;
    const id = setInterval(() => {
      setAltIndex((prev) => (prev + 1) % 2);
    }, 500);
    return () => clearInterval(id);
  }, [bundle, alternates.length, timeEvents, messageVisible]);

  const category = characterSetFromCategory(categoryLabel);
  const bundleNumber = bundleFromTier(timeEvents);
  const frames = resolveFrames(characterId, bundleNumber, category);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [category, bundleNumber, characterId]);

  useEffect(() => {
    if (bundle || frames.length <= 1) return;

    const interval =
      MIN_FRAME_INTERVAL_MS +
      Math.random() * (MAX_FRAME_INTERVAL_MS - MIN_FRAME_INTERVAL_MS);

    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % frames.length);
    }, interval);
    return () => clearInterval(id);
  }, [bundle, frames.length, category, bundleNumber]);

  if (bundle) {
    return alternates[altIndex] ?? alternates[0];
  }

  return frames[index] ?? frames[0];
}

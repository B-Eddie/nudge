import { useEffect, useState } from "react";

const frameModules = {
  ...import.meta.glob<string>("../assets/animation/**/*.png", {
    eager: true,
    import: "default",
    query: "?url",
  }),
  ...import.meta.glob<string>("../assets/characters/**/*.svg", {
    eager: true,
    import: "default",
    query: "?url",
  }),
};

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
const FRAMES: FrameMap = (() => {
  const map: FrameMap = {};

  Object.entries(frameModules)
    .map(([path, url]) => {
      const legacy = path.match(
        /animation\/([^/]+)\/(?:([^/]+)\/)?(\d+)\.png$/,
      );
      if (legacy) {
        return {
          character: "panda",
          bundle: legacy[1],
          category: legacy[2] ?? "$special",
          index: Number(legacy[3]),
          url,
        };
      }

      const companion = path.match(
        /characters\/([^/]+)\/([^/]+)\/(?:([^/]+)\/)?(\d+)\.svg$/,
      );
      return companion
        ? {
            character: companion[1],
            bundle: companion[2],
            category: companion[3] ?? "$special",
            index: Number(companion[4]),
            url,
          }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.index - b.index)
    .forEach(({ character, bundle, category, url }) => {
      (((map[character] ??= {})[bundle] ??= {})[category] ??= []).push(url);
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
      return "games";
    case "entertainment":
    case "video":
      // The source bundle has an integrated laptop scene, but no video-specific
      // emote. Reuse the screen-use pose instead of drawing a loose prop.
      return "computer";
    default:
      return "idle";
  }
}

function resolveFrames(
  character: string,
  bundle: string | number,
  category: string,
): string[] {
  const characterFrames = FRAMES[character] ?? FRAMES["crab"] ?? FRAMES["panda"] ?? {};
  const byBundle = characterFrames[String(bundle)];
  const byCategory = byBundle ?? characterFrames["1"] ?? {};
  return byCategory[category] ?? byCategory["idle"] ?? [];
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
  character: string,
  categoryLabel: string | undefined,
  timeEvents: number,
  messageVisible = false,
): string | undefined {
  const bundle = alternateBundleId(timeEvents, messageVisible);

  const alternates = bundle
    ? resolveFrames(character, bundle, "$special")
    : [];

  const [altIndex, setAltIndex] = useState(0);

  useEffect(() => {
    setAltIndex(0);
  }, [character, bundle, timeEvents, messageVisible]);

  useEffect(() => {
    if (!bundle || alternates.length < 2) return;
    const id = setInterval(() => {
      setAltIndex((prev) => (prev + 1) % 2);
    }, 500);
    return () => clearInterval(id);
  }, [character, bundle, alternates.length, timeEvents, messageVisible]);

  const category = characterSetFromCategory(categoryLabel);
  const bundleNumber = bundleFromTier(timeEvents);
  const frames = resolveFrames(character, bundleNumber, category);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [character, category, bundleNumber]);

  useEffect(() => {
    if (bundle || frames.length <= 1) return;

    const interval =
      MIN_FRAME_INTERVAL_MS +
      Math.random() * (MAX_FRAME_INTERVAL_MS - MIN_FRAME_INTERVAL_MS);

    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % frames.length);
    }, interval);
    return () => clearInterval(id);
  }, [bundle, frames.length, character, category, bundleNumber]);

  if (bundle) {
    return alternates[altIndex] ?? alternates[0];
  }

  return frames[index] ?? frames[0];
}

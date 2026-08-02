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
  }, [bundle, timeEvents, messageVisible]);

  useEffect(() => {
    if (!bundle || alternates.length < 2) return;
    const id = setInterval(() => {
      setAltIndex((prev) => (prev + 1) % 2);
    }, 500);
    return () => clearInterval(id);
  }, [bundle, alternates.length, timeEvents, messageVisible]);

  const category = characterSetFromCategory(categoryLabel);
  const tierBundle = timeEvents;
  const frames = resolveFrames(tierBundle, category);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [category, tierBundle]);

  useEffect(() => {
    if (bundle || frames.length <= 1) return;

    const interval =
      MIN_FRAME_INTERVAL_MS +
      Math.random() * (MAX_FRAME_INTERVAL_MS - MIN_FRAME_INTERVAL_MS);

    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % frames.length);
    }, interval);
    return () => clearInterval(id);
  }, [bundle, frames.length, category, tierBundle]);

  if (bundle) {
    return alternates[altIndex] ?? alternates[0];
  }

  return frames[index] ?? frames[0];
}

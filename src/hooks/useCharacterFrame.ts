import { useEffect, useState } from "react";

const frameModules = import.meta.glob<string>("../assets/animation/**/*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

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
    default:
      return "idle";
  }
}

// gets the frames & if doesn't exist then default to 1/idle
function resolveFrames(bundle: number, category: string): string[] {
  const byCategory = FRAMES[String(bundle)] ?? FRAMES["1"] ?? {};
  return byCategory[category] ?? byCategory["idle"] ?? [];
}

// to be used later for random frame timings
const MIN_FRAME_INTERVAL_MS = 300;
const MAX_FRAME_INTERVAL_MS = 800;

export function useCharacterFrame(
  categoryLabel: string | undefined,
  timeEvents: number,
): string | undefined {
  // special check for timeEvents < 0 (sleep) or === 0 (timeevents change)
  if (timeEvents < 0 || timeEvents === 0) {
    const bundle = timeEvents < 0 ? "-1" : "0";
    // Get both frame paths for states
    const alt1 = frameModules[`../assets/animation/${bundle}/1.png`];
    const alt2 = frameModules[`../assets/animation/${bundle}/2.png`];
    const alternates = [alt1, alt2].filter(Boolean) as string[];

    const [altIndex, setAltIndex] = useState(0);

    useEffect(() => {
      setAltIndex(0);
    }, [timeEvents]); // Restart on timeEvents change

    useEffect(() => {
      if (alternates.length < 2) return;
      // Alternate every interval between 2 frames
      const interval = 500;
      const id = setInterval(() => {
        setAltIndex((prev) => (prev + 1) % 2);
      }, interval);
      return () => clearInterval(id);
    }, [alternates.length, timeEvents]);

    return alternates[altIndex] ?? alternates[0];
  }

  const category = characterSetFromCategory(categoryLabel);
  const bundle = timeEvents;
  const frames = resolveFrames(bundle, category);

  const [index, setIndex] = useState(0);

  // Restart animation whenever frame bundle changes
  useEffect(() => {
    setIndex(0);
  }, [category, bundle]);

  // Cycle through the frames on a fixed interval
  useEffect(() => {
    if (frames.length <= 1) return;

    // get a random interval each time
    const interval =
      MIN_FRAME_INTERVAL_MS +
      Math.random() * (MAX_FRAME_INTERVAL_MS - MIN_FRAME_INTERVAL_MS);

    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % frames.length);
    }, interval);
    return () => clearInterval(id);
  }, [frames.length, category, bundle]);

  return frames[index] ?? frames[0];
}
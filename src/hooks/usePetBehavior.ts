import { usePetLife, type PetRequest } from "./usePetLife";
import type { CompanionId } from "../types/appearance";
import { useEffect, useState } from "react";
export type PetActivity = "idle" | "focus" | "read" | "music" | "play" | "social" | "sleep";
export function activityFor(category?: string): PetActivity {
  switch (category) {
    case "Developer Tools": case "Video": case "Entertainment": return "focus";
    case "Productivity": return "read";
    case "Music": return "music";
    case "Games": return "play";
    case "Social Networking": return "social";
    default: return "idle";
  }
}
export function usePetBehavior(category: string | undefined, resting: boolean, interrupted: boolean, reducedMotion: boolean, character: CompanionId = "panda", energy = 5, request?: PetRequest, attended = false) {
  const target = resting ? "sleep" : activityFor(category);
  const [activity, setActivity] = useState<PetActivity>(target);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    if (target === activity) { setTransitioning(false); return; }
    // Ignore short app switches. Put the old prop down before taking out another.
    const notice = setTimeout(() => setTransitioning(true), resting ? 0 : 1800);
    const settle = setTimeout(() => { setActivity(target); setTransitioning(false); }, resting ? 500 : 2700);
    return () => { clearTimeout(notice); clearTimeout(settle); };
  }, [target, activity, resting]);
  const life = usePetLife(activity, interrupted || transitioning, resting, reducedMotion, character, energy, request, attended);
  return { activity, transitioning, ...life };
}

import { useEffect, useState } from "react";
import type { CompanionId } from "../types/appearance";
import { tantrumAt, type TantrumFrame, type TantrumStep } from "../lib/tantrum";

/** Walks through a pet's tantrum, one step at a time. */
export function useTantrum(startedAt: number | null, character: CompanionId, ultimate = false): { step: TantrumStep; index: number } | null {
  const [index, setIndex] = useState<TantrumFrame | null>(null);
  useEffect(() => {
    if (startedAt === null) { setIndex(null); return; }
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      const frame = tantrumAt(character, Math.max(0, Date.now() - startedAt), ultimate);
      setIndex(frame);
      if (frame) timer = setTimeout(next, Math.max(16, frame.step.ms - frame.into));
    };
    next();
    return () => clearTimeout(timer);
  }, [startedAt, character, ultimate]);
  return startedAt === null || !index ? null : { step: index.step, index: index.index };
}

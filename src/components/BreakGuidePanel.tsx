import { useState } from "react";
import { LuEar, LuEye, LuEyeOff, LuFootprints, LuGlassWater, LuHand, LuHeart, LuPackage, LuPersonStanding, LuSunMedium, LuTrees, LuWind, LuX, LuMoveHorizontal } from "react-icons/lu";
import type { IconType } from "react-icons";
import { BREAK_ROUTINES, BREAK_TAGS, type BreakRoutine, type BreakTag } from "../types/breakRoutines";
import { useDialogFocus } from "../hooks/useDialogFocus";
import "./BreakGuidePanel.css";

interface BreakGuidePanelProps {
  onClose: () => void;
  onStart: (routine: BreakRoutine) => void;
  /** Starts an open-ended rest with no routine. */
  onJustRest?: () => void;
  /** Best suited first; the first one is marked. */
  routines?: BreakRoutine[];
}

const ROUTINE_ICONS: Record<string, IconType> = {
  "far-focus": LuEye, shoulders: LuPersonStanding, breathing: LuWind, move: LuFootprints, wrists: LuHand,
  neck: LuMoveHorizontal, "eyes-closed": LuEyeOff, water: LuGlassWater, window: LuSunMedium, listen: LuEar,
  hips: LuPersonStanding, tidy: LuPackage, hello: LuHeart, outside: LuTrees,
};

export function durationLabel(seconds: number): string {
  return seconds < 60 ? `${seconds} sec` : seconds % 60 ? `${(seconds / 60).toFixed(1)} min` : `${seconds / 60} min`;
}

export function BreakGuidePanel({ onClose, onStart, onJustRest, routines }: BreakGuidePanelProps) {
  const dialogRef = useDialogFocus<HTMLElement>(onClose, ".break-guide-close");
  const [tag, setTag] = useState<BreakTag | null>(null);
  const list = (routines ?? BREAK_ROUTINES).filter(routine => !tag || routine.tags.includes(tag));
  return (
    <div className="break-guide-backdrop interactive" onClick={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialogRef}
        className="break-guide-panel"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="break-guide-title"
        aria-describedby="break-guide-intro"
      >
        <header className="break-guide-header">
          <div>
            <span className="break-guide-eyebrow">A pause that fits</span>
            <h2 id="break-guide-title">Choose a small reset</h2>
          </div>
          <button type="button" className="break-guide-close" onClick={onClose} aria-label="Close break ideas">
            <LuX size={17} />
          </button>
        </header>

        <p id="break-guide-intro" className="break-guide-intro">
          Your companion does each one with you. Skip anything that doesn’t feel right.
        </p>

        <div className="break-guide-tags" role="group" aria-label="Show">
          <button type="button" aria-pressed={tag === null} onClick={() => setTag(null)}>All</button>
          {BREAK_TAGS.map(option => (
            <button key={option.id} type="button" aria-pressed={tag === option.id}
              onClick={() => setTag(tag === option.id ? null : option.id)}>{option.label}</button>
          ))}
        </div>

        <div className="break-routine-list">
          {list.map((routine, index) => {
            const Icon = ROUTINE_ICONS[routine.id] ?? LuWind;
            return (
              <button key={routine.id} type="button" className="break-routine-option" onClick={() => onStart(routine)}>
                <span className="break-routine-icon" aria-hidden="true"><Icon size={19} strokeWidth={1.8} /></span>
                <span className="break-routine-copy">
                  <span className="break-routine-title">{routine.title}</span>
                  <span className="break-routine-description">{routines && !tag && index === 0 ? "Suggested for right now" : routine.description}</span>
                </span>
                <span className="break-routine-duration">{durationLabel(routine.durationSeconds)}</span>
              </button>
            );
          })}
        </div>

        <footer className="break-guide-footer">
          <span aria-hidden="true">✳</span> Even a short pause counts.
          {onJustRest && <button type="button" className="break-guide-rest" onClick={onJustRest}>Just rest</button>}
        </footer>
      </section>
    </div>
  );
}

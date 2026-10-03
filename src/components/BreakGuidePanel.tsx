import {
  LuEye,
  LuFootprints,
  LuPersonStanding,
  LuWind,
  LuX,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import { BREAK_ROUTINES, type BreakRoutine } from "../types/breakRoutines";
import { useDialogFocus } from "../hooks/useDialogFocus";
import "./BreakGuidePanel.css";

interface BreakGuidePanelProps {
  onClose: () => void;
  onStart: (routine: BreakRoutine) => void;
}

const ROUTINE_ICONS: Record<string, IconType> = {
  "far-focus": LuEye,
  shoulders: LuPersonStanding,
  breathing: LuWind,
  move: LuFootprints,
};

function durationLabel(seconds: number): string {
  return seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`;
}

export function BreakGuidePanel({ onClose, onStart }: BreakGuidePanelProps) {
  const dialogRef = useDialogFocus<HTMLElement>(onClose, ".break-guide-close");
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
          <button
            type="button"
            className="break-guide-close"
            onClick={onClose}
            aria-label="Close break ideas"
          >
            <LuX size={17} />
          </button>
        </header>

        <p id="break-guide-intro" className="break-guide-intro">
          Pick a pause that feels useful. Your companion will keep you company.
        </p>

        <div className="break-routine-list">
          {BREAK_ROUTINES.map((routine) => {
            const Icon = ROUTINE_ICONS[routine.id];
            return (
              <button
                key={routine.id}
                type="button"
                className="break-routine-option"
                onClick={() => onStart(routine)}
              >
                <span className="break-routine-icon" aria-hidden="true">
                  <Icon size={19} strokeWidth={1.8} />
                </span>
                <span className="break-routine-copy">
                  <span className="break-routine-title">{routine.title}</span>
                  <span className="break-routine-description">
                    {routine.description}
                  </span>
                </span>
                <span className="break-routine-duration">
                  {durationLabel(routine.durationSeconds)}
                </span>
              </button>
            );
          })}
        </div>

        <footer className="break-guide-footer">
          <span aria-hidden="true">✳</span> Even a short pause counts.
        </footer>
      </section>
    </div>
  );
}

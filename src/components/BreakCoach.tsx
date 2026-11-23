import { stepAt, type BreakRoutine } from "../types/breakRoutines";
import "./PetCard.css";

/** Walks through a routine one step at a time while the companion does it too. */
export function BreakCoach({ routine, elapsedSeconds, position, onFinish }: {
  routine: BreakRoutine; elapsedSeconds: number; position: string; onFinish: () => void;
}) {
  const left = Math.min(routine.durationSeconds, Math.max(0, Math.ceil(routine.durationSeconds - elapsedSeconds)));
  const progress = Math.min(100, Math.max(0, elapsedSeconds / routine.durationSeconds * 100));
  const current = stepAt(routine, Math.max(0, elapsedSeconds));
  return (
    <section className={`break-coach break-coach--${position || "bl"} interactive`} data-pet-popover aria-labelledby="break-coach-title">
      <header className="break-coach-header">
        <div>
          <span className="break-coach-eyebrow">Together{routine.steps.length > 1 ? ` · ${current.index + 1} of ${routine.steps.length}` : ""}</span>
          <h2 id="break-coach-title">{routine.title}</h2>
        </div>
        <output className="break-coach-time" aria-label={`${left} seconds remaining`}>
          {left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : `${left}s`}
        </output>
      </header>
      <p className="break-coach-step" aria-live="polite">{current.step.text}</p>
      <div className="break-coach-track" role="progressbar" aria-label="Reset progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <button type="button" className="break-coach-finish interactive" onClick={onFinish}>Finish pause</button>
    </section>
  );
}

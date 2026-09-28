import { useEffect } from "react";
import { LuX, LuTimer } from "react-icons/lu";
import "./FocusPanel.css";

interface FocusPanelProps {
  onStart: (minutes: number) => void;
  onClose: () => void;
}

const OPTIONS = [
  {
    minutes: 25,
    name: "Quick focus",
    desc: "One pomodoro. Reminders stay quiet while you work.",
    xp: 50,
  },
  {
    minutes: 50,
    name: "Deep focus",
    desc: "A full deep-work block. Your pet guards the time.",
    xp: 100,
  },
];

export function FocusPanel({ onStart, onClose }: FocusPanelProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="focus-backdrop interactive"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className="focus-panel" role="dialog" aria-labelledby="focus-title">
        <header className="focus-header">
          <span className="focus-icon" aria-hidden>
            <LuTimer size={20} />
          </span>
          <h2 id="focus-title">Start a focus session</h2>
          <button
            type="button"
            className="focus-close"
            onClick={onClose}
            aria-label="Close focus session picker"
          >
            <LuX size={15} />
          </button>
        </header>
        <p className="focus-hint">
          Pick a length. Nudge holds reminders until the timer ends — finish it
          and your pet earns XP.
        </p>
        <ul className="focus-options">
          {OPTIONS.map((opt) => (
            <li key={opt.minutes}>
              <button
                type="button"
                className="focus-option"
                onClick={() => onStart(opt.minutes)}
              >
                <span className="focus-option-time">{opt.minutes} min</span>
                <span className="focus-option-text">
                  <strong>{opt.name}</strong>
                  <span>{opt.desc}</span>
                </span>
                <span className="focus-option-xp">+{opt.xp} XP</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

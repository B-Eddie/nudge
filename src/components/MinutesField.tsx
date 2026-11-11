import { useEffect, useId, useState } from "react";

interface MinutesFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (minutes: number) => void;
  hint?: string;
  className?: string;
  hintClassName?: string;
}

/** A whole-minutes input that lets you type freely.
 *
 * The value is only clamped once you leave the field (or press Enter), so clearing "30"
 * to type "45" works. Clamping on every keystroke used to turn the empty field into "1",
 * which made the result "145". */
export function MinutesField({ label, value, min, max, onChange, hint, className = "settings-field", hintClassName = "settings-hint" }: MinutesFieldProps) {
  const [text, setText] = useState(String(value));
  const id = useId();
  useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const parsed = Number.parseInt(text, 10);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    setText(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className={className}>
      <label htmlFor={id}>{label}</label>
      <div className="minutes-input">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={text}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={e => setText(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === "Enter") commit();
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const step = e.key === "ArrowUp" ? 1 : -1;
              const next = Math.min(max, Math.max(min, (Number.parseInt(text, 10) || value) + step));
              setText(String(next));
              onChange(next);
            }
          }}
        />
        <span className="minutes-unit" aria-hidden="true">min</span>
      </div>
      {hint && <p id={`${id}-hint`} className={hintClassName}>{hint}</p>}
    </div>
  );
}

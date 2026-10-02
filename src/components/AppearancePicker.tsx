import {
  applyTheme,
  COMPANIONS,
  normalizeTheme,
  THEMES,
  type CompanionId,
  type ThemeId,
} from "../types/appearance";
import "./AppearancePicker.css";
import { PixelPetSprite } from "./PixelPetSprite";
import type { KeyboardEvent } from "react";

function radioKeys(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const current = options.indexOf(document.activeElement as HTMLButtonElement);
  if (current < 0) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
    : (current + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + options.length) % options.length;
  options[next].click();
  options[next].focus({ preventScroll: true });
}

interface CompanionPickerProps {
  value: CompanionId | string;
  onChange: (value: CompanionId) => void;
}

export function CompanionPicker({ value, onChange }: CompanionPickerProps) {
  const selected = COMPANIONS.some(companion => companion.id === value) ? value : "crab";
  return (
    <div className="companion-picker" role="radiogroup" aria-label="Choose a companion" onKeyDown={radioKeys}>
      {COMPANIONS.map((companion) => (
        <button
          key={companion.id}
          type="button"
          role="radio"
          aria-label={`${companion.name}. ${companion.description}`}
          aria-checked={selected === companion.id}
          tabIndex={selected === companion.id ? 0 : -1}
          title={companion.description}
          className={`companion-option${selected === companion.id ? " selected" : ""}`}
          onClick={() => onChange(companion.id)}
        >
          <span className="companion-option-art">
            <PixelPetSprite character={companion.id} />
          </span>
          <span className="companion-option-name">{companion.name}</span>
          <span className="companion-option-description">{companion.description}</span>
        </button>
      ))}
    </div>
  );
}

interface ThemePickerProps {
  value: ThemeId | string;
  onChange: (value: ThemeId) => void;
  previewChanges?: boolean;
}

export function ThemePicker({
  value,
  onChange,
  previewChanges = false,
}: ThemePickerProps) {
  const selected = normalizeTheme(value);

  const choose = (theme: ThemeId) => {
    if (previewChanges) applyTheme(theme);
    onChange(theme);
  };

  return (
    <div className="theme-picker" role="radiogroup" aria-label="Choose an appearance" onKeyDown={radioKeys}>
      {THEMES.map((theme) => (
        <button
          key={theme.id}
          type="button"
          role="radio"
          aria-checked={selected === theme.id}
          tabIndex={selected === theme.id ? 0 : -1}
          className={`theme-option theme-option--${theme.id}${selected === theme.id ? " selected" : ""}`}
          onClick={() => choose(theme.id)}
        >
          <span className="theme-option-swatch" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="theme-option-copy">
            <span className="theme-option-name">{theme.name}</span>
            <span className="theme-option-description">{theme.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

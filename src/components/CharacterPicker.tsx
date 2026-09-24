import type { CSSProperties } from "react";
import { CHARACTERS, type CharacterId } from "../assets/characters/manifest";
import "./CharacterPicker.css";

interface Props {
  value: CharacterId;
  onChange: (id: CharacterId) => void;
}

/** Sticker-style companion picker. Used in onboarding and settings. */
export default function CharacterPicker({ value, onChange }: Props) {
  return (
    <div className="picker-grid" role="radiogroup" aria-label="Choose your companion">
      {CHARACTERS.map((c, i) => {
        const selected = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`picker-card${selected ? " selected" : ""}`}
            style={{ "--tilt": `${i % 2 === 0 ? -2 : 2}deg` } as CSSProperties}
            onClick={() => onChange(c.id)}
          >
            <span className="picker-portrait">
              <img src={c.portrait} alt={`${c.name} the ${c.species}`} draggable={false} />
            </span>
            <span className="picker-name">{c.name}</span>
            <span className="picker-species">{c.species}</span>
            <span
              className="picker-dot"
              style={{ background: c.theme.accent }}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

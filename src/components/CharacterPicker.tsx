import { CHARACTERS, type CharacterId } from "../types/characters";
import { characterFrameUrl } from "../hooks/useCharacterFrame";
import panda from "../assets/animation/1/idle/1.png";
import "./CharacterPicker.css";

interface Props {
  value: CharacterId;
  onChange: (character: CharacterId) => void;
}

export function CharacterPicker({ value, onChange }: Props) {
  return (
    <fieldset className="character-picker">
      <legend>Choose your companion</legend>
      <div className="character-options">
        {CHARACTERS.map((character) => (
          <label className={`character-option ${value === character.id ? "selected" : ""}`} key={character.id}>
            <input
              type="radio"
              name="character"
              value={character.id}
              checked={value === character.id}
              onChange={() => onChange(character.id)}
            />
            <img src={character.id === "panda" ? panda : characterFrameUrl(character.id, "idle")} alt="" />
            <span>{character.name}</span>
            <small>{character.description}</small>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

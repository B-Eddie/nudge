import { PixelPetSprite } from "./PixelPetSprite";
import type { CompanionId } from "../types/appearance";
import { DEFAULT_PET_SIZE, petSize } from "../types/petSize";
import "./PetSizeControl.css";

export function PetSizeControl({ character, value, onChange }: { character: CompanionId; value?: number; onChange: (size: number) => void }) {
  const size = petSize(value);
  const percent = Math.round(size / DEFAULT_PET_SIZE * 100);
  return <section className="pet-size-control" aria-labelledby="pet-size-label">
    <div className="pet-size-heading">
      <label htmlFor="pet-size" id="pet-size-label">Character size</label>
      <output htmlFor="pet-size">{percent}%</output>
      <button type="button" onClick={() => onChange(DEFAULT_PET_SIZE)} disabled={size === DEFAULT_PET_SIZE}>Reset</button>
    </div>
    <div className="pet-size-preview" aria-hidden="true">
      <div style={{ width: size, height: size }}><PixelPetSprite character={character} /></div>
    </div>
    <input id="pet-size" type="range" min={50} max={150} step={10} value={percent}
      aria-valuetext={`${percent} percent`} onChange={e => onChange(Number(e.target.value) / 100 * DEFAULT_PET_SIZE)} />
    <div className="pet-size-scale"><span>Small</span><span>Large</span></div>
    <p className="settings-hint">Preview your companion&apos;s size. Save to apply.</p>
  </section>;
}

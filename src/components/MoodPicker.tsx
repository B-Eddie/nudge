import { PixelArt } from "./PixelArt";
import type { PixelArt as Art } from "../lib/pixelArt";

const FACE_TOP = ["..yyyyyy..", ".yyyyyyyy.", "yyyyyyyyyy", "yykyyyykyy", "yykyyyykyy", "yyyyyyyyyy"];
const MOUTHS = [
  ["yyykkkkyyy", "yykyyyykyy", ".yyyyyyyy.", "..YYYYYY.."],
  ["yyyykkkyyy", "yyykyyyyyy", ".yyyyyyyy.", "..YYYYYY.."],
  ["yyyyyyyyyy", "yyykkkkyyy", ".yyyyyyyy.", "..YYYYYY.."],
  ["yykyyyykyy", "yyykkkkyyy", ".yyyyyyyy.", "..YYYYYY.."],
  ["yykkkkkkyy", "yyykrrkyyy", ".yyykkyyy.", "..YYYYYY.."],
];
const COLORS = [["#d59a94", "#bb7d78"], ["#dfb08c", "#c5946f"], ["#e6cd8a", "#cbb06b"], ["#bcd08d", "#9fb56f"], ["#97c99b", "#79ad7f"]];
export const MOODS = ["Rough", "Meh", "Okay", "Good", "Great"];
const FACES: Art[] = MOUTHS.map((mouth, i) => ({ rows: [...FACE_TOP, ...mouth], palette: { y: COLORS[i][0], Y: COLORS[i][1], k: "#3f342d", r: "#b5555f" } }));

export function MoodPicker({ value, onChange }: { value: number | null; onChange: (mood: number | null) => void }) {
  return <div className="mood-row" role="radiogroup" aria-label="How did today feel?">
    {MOODS.map((label, i) => <button key={label} type="button" role="radio" aria-checked={value === i + 1} onClick={() => onChange(value === i + 1 ? null : i + 1)}>
      <PixelArt art={FACES[i]} scale={3} />{label}
    </button>)}
  </div>;
}

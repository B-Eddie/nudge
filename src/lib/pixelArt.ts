/** Hand-drawn pixel art as text. One character is one pixel; "." and " " are clear. */
export interface PixelArt { rows: string[]; palette: Record<string, string> }
export interface PixelRun { x: number; y: number; width: number; fill: string }

/** Horizontal runs of one color, so a sprite needs few shapes. */
export function pixelRuns(art: PixelArt): PixelRun[] {
  const runs: PixelRun[] = [];
  art.rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const key = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === key) end++;
      const fill = art.palette[key];
      if (fill) runs.push({ x, y, width: end - x, fill });
      x = end;
    }
  });
  return runs;
}
export const artWidth = (art: PixelArt) => Math.max(...art.rows.map(row => row.length));

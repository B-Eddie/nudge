import { useMemo } from "react";
import { artWidth, pixelRuns, type PixelArt as Art } from "../lib/pixelArt";
import { plantArt } from "../lib/plantArt";
import type { SpeciesId, Stage } from "../lib/garden";

/** Crisp SVG from text art, `scale` CSS pixels per art pixel. */
export function PixelArt({ art, scale = 2, className }: { art: Art; scale?: number; className?: string }) {
  const runs = useMemo(() => pixelRuns(art), [art]);
  const width = artWidth(art), height = art.rows.length;
  return <svg className={className} width={width * scale} height={height * scale} viewBox={`0 0 ${width} ${height}`}
    shapeRendering="crispEdges" aria-hidden="true" style={{ display: "block" }}>
    {runs.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.width} height={1} fill={r.fill} />)}
  </svg>;
}

export function PlantArt({ species, stage, scale = 2 }: { species: SpeciesId; stage: Stage; scale?: number }) {
  return <PixelArt art={plantArt(species, stage)} scale={scale} />;
}

/** Area-filtered reduction of high-resolution generated artwork onto the pet's pixel grid.
 *
 * Nearest-neighbour sampling at a ~5:1 reduction keeps one arbitrary source pixel per
 * output pixel, so whiskers, catchlights and fur texture turn into noise. Here every
 * output pixel averages its whole source footprint instead. Two details keep the result
 * crisp pixel art that sits cleanly on any desktop:
 *
 * - Coverage decides opacity, and pixels come out either fully opaque or fully clear.
 *   Partial alpha is what produces a halo against dark or light windows.
 * - Colour comes only from solid source pixels when the footprint has any. The
 *   generated sheets have pale, semi-transparent anti-aliasing around each silhouette,
 *   which otherwise bleeds into a light fringe.
 */

export interface DestinationRect { x: number; y: number; width: number; height: number }

const SOLID = 200;
const COVERAGE = 0.5;

export function resampleFrame(
  source: Uint8ClampedArray, sourceWidth: number, sourceHeight: number,
  output: Uint8ClampedArray, outputSize: number, destination: DestinationRect, mirror = false,
): void {
  if (source.length !== sourceWidth * sourceHeight * 4) throw new Error("Source raster size mismatch");
  if (output.length !== outputSize * outputSize * 4) throw new Error("Output raster size mismatch");
  const scaleX = sourceWidth / destination.width;
  const scaleY = sourceHeight / destination.height;

  for (let dy = 0; dy < destination.height; dy++) {
    const top = dy * scaleY, bottom = top + scaleY;
    const y0 = Math.floor(top), y1 = Math.min(sourceHeight, Math.ceil(bottom));
    const targetY = destination.y + dy;
    if (targetY < 0 || targetY >= outputSize) continue;
    for (let dx = 0; dx < destination.width; dx++) {
      const left = dx * scaleX, right = left + scaleX;
      const x0 = Math.floor(left), x1 = Math.min(sourceWidth, Math.ceil(right));
      let area = 0, alpha = 0;
      let solidWeight = 0, sr = 0, sg = 0, sb = 0;
      let softWeight = 0, wr = 0, wg = 0, wb = 0;
      for (let y = y0; y < y1; y++) {
        const coverY = Math.min(bottom, y + 1) - Math.max(top, y);
        if (coverY <= 0) continue;
        for (let x = x0; x < x1; x++) {
          const cover = (Math.min(right, x + 1) - Math.max(left, x)) * coverY;
          if (cover <= 0) continue;
          const index = (y * sourceWidth + x) * 4;
          const a = source[index + 3];
          area += cover;
          alpha += cover * a;
          if (!a) continue;
          const weight = cover * a;
          if (a >= SOLID) {
            solidWeight += weight;
            sr += source[index] * weight; sg += source[index + 1] * weight; sb += source[index + 2] * weight;
          } else {
            softWeight += weight;
            wr += source[index] * weight; wg += source[index + 1] * weight; wb += source[index + 2] * weight;
          }
        }
      }
      if (!area || alpha / area < COVERAGE * 255) continue;
      // Mirror about the whole canvas (as the walk-pose rig calibration assumes).
      const targetX = mirror ? outputSize - 1 - (destination.x + dx) : destination.x + dx;
      if (targetX < 0 || targetX >= outputSize) continue;
      const target = (targetY * outputSize + targetX) * 4;
      const [weight, r, g, b] = solidWeight ? [solidWeight, sr, sg, sb] : [softWeight, wr, wg, wb];
      output[target] = Math.round(r / weight);
      output[target + 1] = Math.round(g / weight);
      output[target + 2] = Math.round(b / weight);
      output[target + 3] = 255;
    }
  }
}

/** Pixel-grid multiplier so one art pixel lands on about two physical pixels: 120px on a
 * Retina display uses a 120×120 grid, 180px uses 180×180, and the 60px picker uses 60×60. */
export function spriteResolution(displaySize: number, devicePixelRatio = 1): 1 | 2 | 3 {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const ideal = Math.round((displaySize * ratio) / 120);
  return Math.max(1, Math.min(3, ideal)) as 1 | 2 | 3;
}

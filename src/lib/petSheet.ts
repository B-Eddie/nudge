import { LOGICAL_SIZE, PART_NAMES, type SpriteParts } from "./petRenderer";

/** Cuts one pose's parts out of a pet's sheet: a column per pose, a row per part. */
export function sheetParts(rgba: Uint8ClampedArray, width: number, column: number): SpriteParts {
  const N = LOGICAL_SIZE;
  return Object.fromEntries(PART_NAMES.map((name, row) => {
    const part = new Uint8ClampedArray(N * N * 4);
    for (let y = 0; y < N; y++) {
      const from = ((row * N + y) * width + column * N) * 4;
      part.set(rgba.subarray(from, from + N * 4), y * N * 4);
    }
    return [name, part];
  })) as SpriteParts;
}

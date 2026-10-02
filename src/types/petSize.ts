export const DEFAULT_PET_SIZE = 120;
export const MIN_PET_SIZE = 60;
export const MAX_PET_SIZE = 180;
export function petSize(value?: number): number {
  return Math.min(MAX_PET_SIZE, Math.max(MIN_PET_SIZE, Number.isFinite(value) ? value! : DEFAULT_PET_SIZE));
}

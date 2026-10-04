export interface PetAttention { x: number; y: number; near: boolean; tracking?: boolean }

interface PetBounds { left: number; top: number; width: number; height: number }

/** Native cursor x/y use the same top-left logical coordinates as DOM bounds,
 * including negative coordinates when the mouse leaves the overlay window. */
export function petAttentionAt(x: number, y: number, bounds?: PetBounds): PetAttention {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: 0, y: 0, near: false, tracking: false };
  }
  const dx = (x - bounds.left - bounds.width / 2) / (bounds.width * .75);
  const dy = (y - bounds.top - bounds.height / 2) / (bounds.height * .75);
  const direction = (value: number) => Math.round(Math.max(-1, Math.min(1, value)) * 100) / 100;
  return { x: direction(dx), y: direction(dy), near: Math.hypot(dx, dy) < 1.8, tracking: true };
}

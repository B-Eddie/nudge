export interface PetAttention { x: number; y: number; near: boolean; tracking?: boolean }

interface PetBounds { left: number; top: number; width: number; height: number }

/** Native cursor x/y use the same top-left logical coordinates as DOM bounds,
 * including negative coordinates when the mouse leaves the overlay window. */
export function petAttentionAt(x: number, y: number, bounds?: PetBounds): PetAttention {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: 0, y: 0, near: false, tracking: false };
  }
  const dx = x - bounds.left - bounds.width / 2;
  const dy = y - bounds.top - bounds.height / 2;
  const distance = Math.hypot(dx, dy);
  // Normalize the vector together: independently clamping both axes made a
  // distant cursor stick at a diagonal even as it moved around the character.
  const scale = Math.max(distance, Math.max(bounds.width, bounds.height) * .75);
  // Attention extends beyond the transparent overlay; this never captures
  // clicks or counts a stroke unless the pointer is actually over the pet.
  const attentionRadius = Math.max(360, Math.max(bounds.width, bounds.height) * 3);
  const direction = (value: number) => Math.round(Math.max(-1, Math.min(1, value)) * 100) / 100;
  return { x: direction(dx / scale), y: direction(dy / scale), near: distance < attentionRadius, tracking: true };
}

import type { PetPose } from "../types/pixelPets";

/** The order of poses in website/assets/mad/*.webp, and which of them scowl. */
export const SHEET_POSES: { pose: PetPose; mad: boolean }[] = [
  { pose: "idle", mad: true }, { pose: "curious", mad: true }, { pose: "walkA", mad: true }, { pose: "walkB", mad: true },
  { pose: "yawn", mad: true }, { pose: "stretch", mad: true }, { pose: "blink", mad: false }, { pose: "groom", mad: false },
  { pose: "happy", mad: false }, { pose: "delighted", mad: false },
];

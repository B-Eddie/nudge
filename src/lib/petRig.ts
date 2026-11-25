import rigs from "../assets/pets/pixel/rig.json";
import type { CompanionId } from "../types/appearance";
import type { PetPose } from "../types/pixelPets";

/** Measured from the drawn artwork by art/build.mjs, on the pet's 80×80 grid. */
export interface PetRect { x: number; y: number; width: number; height: number }
export interface EyeAnchor {
  bounds: PetRect;
  /** The part that looks around. */
  pupil: PetRect;
  color: string;
  /** Pupils by energy, 1 to 5, for a pet whose eyes keep the time. */
  byEnergy: PetRect[] | null;
  shine: string | null;
  /** White (or yellow) of the eye, painted over with `lid` in a blink. */
  sclera: string | null;
  lid: string;
  line: string;
}
export interface PetRig {
  head: PetRect;
  leftPaw: PetRect | null;
  rightPaw: PetRect | null;
  prop: PetRect | null;
  /** Where the body's own break timer sits in the stack; the cat's is in its eyes. */
  feature: "behind" | "rightPaw" | null;
  /** Empty whenever the eyes are drawn shut. */
  eyes: EyeAnchor[];
  /** Where the eyes are, open or shut, so a scowl has somewhere to sit. */
  brows: PetRect[];
  asleep: boolean;
  maxHeadOffset: 0 | 1;
  maxPawOffset: 0 | 1 | 2;
}

const LOCKED: PetPose[] = ["sleep", "lifted", "groom", "stretch", "delighted", "music"];
const geometry = rigs as Record<CompanionId, Record<PetPose, Omit<PetRig, "asleep" | "maxHeadOffset" | "maxPawOffset">>>;
export function getPetRig(character: CompanionId, pose: PetPose): PetRig {
  return { ...geometry[character][pose], asleep: pose === "sleep", maxHeadOffset: LOCKED.includes(pose) ? 0 : 1, maxPawOffset: pose === "sleep" ? 0 : 2 };
}

import crab from "../assets/pets/pixel/crab.png";
import panda from "../assets/pets/pixel/panda.png";
import cat from "../assets/pets/pixel/cat.png";
import capybara from "../assets/pets/pixel/capybara.png";
import type { CompanionId } from "./appearance";

export const PIXEL_PETS: Record<CompanionId, string> = { crab, panda, cat, capybara };
export const PET_POSES = {
  idle: 0, blink: 1, happy: 2, delighted: 3,
  curious: 4, lifted: 5, yawn: 6, sleep: 7,
  walkA: 8, walkB: 9, stretch: 10, groom: 11,
  focus: 12, read: 13, music: 14, play: 15,
} as const;
export type PetPose = keyof typeof PET_POSES;

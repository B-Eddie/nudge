import crab from "../assets/pets/pixel/crab.png";
import panda from "../assets/pets/pixel/panda.png";
import red_panda from "../assets/pets/pixel/red_panda.png";
import cat from "../assets/pets/pixel/cat.png";
import capybara from "../assets/pets/pixel/capybara.png";
import frames from "../assets/pets/pixel/frames.json";
import type { CompanionId } from "./appearance";

export const PIXEL_PETS: Record<CompanionId, string> = { crab, panda, red_panda, cat, capybara };
export const PET_POSES = {
  idle: 0, blink: 1, happy: 2, delighted: 3,
  curious: 4, lifted: 5, yawn: 6, sleep: 7,
  walkA: 8, walkB: 9, stretch: 10, groom: 11,
  focus: 12, read: 13, music: 14, play: 15,
} as const;
export type PetPose = keyof typeof PET_POSES;
export interface SpriteFrame { x: number; y: number; width: number; height: number }
export const PIXEL_FRAMES: Record<CompanionId, SpriteFrame[]> = frames;

// Every pose shares a floor and a body scale. Short sleeping poses remain short.
export function spritePlacement(frame: SpriteFrame, idle: SpriteFrame): SpriteFrame {
  const scale = Math.min(46 / idle.height, 54 / idle.width, 54 / frame.width, 52 / frame.height);
  const width = Math.round(frame.width * scale);
  const height = Math.round(frame.height * scale);
  return { x: Math.round((60 - width) / 2), y: 54 - height, width, height };
}

// The generated walking artwork has different source orientations. Normalize
// both steps to the same direction before the pet's travel-direction transform.
const WALK_FACING: Record<CompanionId, { walkA: number; walkB: number }> = {
  cat: { walkA: -1, walkB: 1 }, red_panda: { walkA: -1, walkB: 1 },
  panda: { walkA: -1, walkB: -1 }, capybara: { walkA: 1, walkB: 1 },
  crab: { walkA: 1, walkB: 1 },
};
export function mirrorWalkingFrame(character: CompanionId, pose: PetPose): boolean {
  return (pose === "walkA" || pose === "walkB") && WALK_FACING[character][pose] === -1;
}

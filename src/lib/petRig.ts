import type { CompanionId } from "../types/appearance";
import type { PetPose } from "../types/pixelPets";

/** Geometry is calibrated after spritePlacement and walk normalization, on 60×60. */
export interface PetRect { x: number; y: number; width: number; height: number }
export interface EyePalette { iris: string; pupil: string; highlight: string }
export interface EyeAnchor {
  bounds: PetRect;
  pupil: PetRect;
  highlight: PetRect;
  palette: EyePalette;
  maxGazeX: number;
  maxGazeY: number;
}
export interface PetRig {
  head: PetRect;
  leftPaw: PetRect | null;
  rightPaw: PetRect | null;
  prop: PetRect | null;
  eyes: EyeAnchor[];
  joints: { headOverlap: number; maxHeadOffset: 0 | 1; maxPawOffset: 0 | 1 | 2 };
}

const rect = (x: number, y: number, width: number, height: number): PetRect => ({ x, y, width, height });
const palettes: Record<CompanionId, EyePalette> = {
  panda: { iris: "#e7dcc0", pupil: "#101716", highlight: "#fff5da" },
  cat: { iris: "#b4b265", pupil: "#17201b", highlight: "#fff5d4" },
  red_panda: { iris: "#a56d43", pupil: "#261916", highlight: "#fff0d0" },
  capybara: { iris: "#362a24", pupil: "#19171a", highlight: "#fff0dc" },
  crab: { iris: "#30252a", pupil: "#151820", highlight: "#fff0d2" },
};

/** Bounds cover just the visible eye, never the panda patch or a whole cheek. */
function eye(character: CompanionId, x: number, y: number, width: number, height: number, highlightX?: number, highlightY?: number): EyeAnchor {
  const pupilWidth = character === "cat" ? Math.min(2, width - 2) : width - 2;
  const pupil = rect(x + Math.floor((width - pupilWidth) / 2), y + 1, pupilWidth, height - 2);
  return {
    bounds: rect(x, y, width, height), pupil,
    highlight: rect(highlightX ?? pupil.x + Math.min(pupil.width - 1, 1), highlightY ?? pupil.y, 1, 1),
    palette: palettes[character], maxGazeX: 1, maxGazeY: 1,
  };
}

type Geometry = { head: PetRect; leftPaw?: PetRect; rightPaw?: PetRect; prop?: PetRect; eyes?: EyeAnchor[] };
const p = (...values: [number, number, number, number]) => rect(...values);
const e = (character: CompanionId, ...values: [number, number, number, number, number?, number?]) => eye(character, ...values);

/* Rectangles deliberately stop at fur/neck joins. Props and forepaws have their
 * own masks, so typing, turning a page, and controller presses need not bob the
 * complete character. Raised or occluded heads are locked by joint limits. */
const geometry: Record<CompanionId, Record<PetPose, Geometry>> = {
  panda: {
    idle: { head: p(10, 8, 40, 30), leftPaw: p(15, 38, 14, 10), rightPaw: p(34, 39, 9, 9), eyes: [e("panda", 22, 25, 7, 7, 26, 27), e("panda", 36, 26, 5, 6, 38, 27)] },
    blink: { head: p(10, 8, 40, 30), leftPaw: p(15, 38, 14, 10), rightPaw: p(34, 39, 9, 9) },
    happy: { head: p(11, 8, 39, 30), leftPaw: p(15, 37, 12, 8), rightPaw: p(33, 38, 12, 9), eyes: [e("panda", 21, 21, 7, 7), e("panda", 36, 25, 5, 6)] },
    delighted: { head: p(13, 8, 38, 29), leftPaw: p(9, 27, 13, 15), rightPaw: p(40, 29, 13, 14) },
    curious: { head: p(10, 8, 41, 33), leftPaw: p(21, 42, 15, 9), rightPaw: p(40, 37, 7, 11), eyes: [e("panda", 26, 28, 7, 7, 29, 29), e("panda", 38, 22, 5, 6, 40, 23)] },
    lifted: { head: p(13, 7, 37, 26), leftPaw: p(16, 31, 11, 10), rightPaw: p(32, 32, 10, 9), eyes: [e("panda", 21, 17, 6, 6), e("panda", 34, 20, 5, 6)] },
    yawn: { head: p(11, 10, 40, 29), leftPaw: p(19, 40, 12, 11), rightPaw: p(39, 34, 9, 12) },
    sleep: { head: p(9, 21, 33, 31) },
    walkA: { head: p(12, 8, 36, 28), leftPaw: p(12, 36, 10, 8), rightPaw: p(38, 36, 10, 8), eyes: [e("panda", 23, 23, 7, 7), e("panda", 37, 23, 5, 6)] },
    walkB: { head: p(12, 8, 36, 28), leftPaw: p(12, 35, 10, 9), rightPaw: p(39, 36, 9, 8), eyes: [e("panda", 24, 22, 6, 7), e("panda", 37, 22, 5, 6)] },
    stretch: { head: p(14, 8, 35, 27), leftPaw: p(10, 21, 13, 18), rightPaw: p(42, 20, 10, 18) },
    groom: { head: p(12, 11, 38, 29), leftPaw: p(18, 41, 12, 7), rightPaw: p(35, 31, 11, 14) },
    focus: { head: p(12, 10, 37, 29), rightPaw: p(34, 38, 11, 10), prop: p(10, 32, 24, 17), eyes: [e("panda", 18, 26, 6, 7), e("panda", 31, 27, 7, 7)] },
    read: { head: p(12, 10, 37, 28), leftPaw: p(12, 38, 8, 10), rightPaw: p(42, 38, 7, 10), prop: p(18, 34, 24, 17), eyes: [e("panda", 20, 27, 7, 6), e("panda", 33, 28, 6, 6)] },
    music: { head: p(12, 9, 39, 30), leftPaw: p(19, 38, 12, 10), rightPaw: p(39, 38, 8, 10), prop: p(12, 8, 38, 24) },
    play: { head: p(14, 10, 36, 27), leftPaw: p(17, 37, 11, 9), rightPaw: p(42, 38, 6, 8), prop: p(28, 38, 14, 7), eyes: [e("panda", 24, 26, 6, 7), e("panda", 39, 25, 5, 7)] },
  },
  cat: {
    idle: { head: p(18, 8, 33, 30), leftPaw: p(30, 36, 7, 17), rightPaw: p(38, 35, 7, 18), eyes: [e("cat", 29, 25, 6, 7), e("cat", 42, 23, 5, 7)] },
    blink: { head: p(18, 8, 33, 30), leftPaw: p(30, 36, 7, 17), rightPaw: p(38, 35, 7, 18) },
    happy: { head: p(19, 7, 33, 31), leftPaw: p(31, 36, 8, 17), rightPaw: p(40, 36, 7, 17), eyes: [e("cat", 28, 22, 7, 8), e("cat", 40, 21, 6, 7)] },
    delighted: { head: p(19, 7, 34, 28), leftPaw: p(21, 30, 9, 12), rightPaw: p(43, 30, 9, 12) },
    curious: { head: p(12, 2, 38, 39), leftPaw: p(31, 38, 8, 16), rightPaw: p(39, 38, 7, 16), eyes: [e("cat", 29, 24, 7, 8), e("cat", 39, 17, 6, 7)] },
    lifted: { head: p(16, 2, 34, 30), leftPaw: p(20, 29, 8, 10), rightPaw: p(31, 31, 8, 10), eyes: [e("cat", 23, 16, 7, 8), e("cat", 36, 20, 6, 7)] },
    yawn: { head: p(19, 6, 34, 33), leftPaw: p(30, 38, 8, 16), rightPaw: p(40, 38, 7, 16) },
    sleep: { head: p(8, 22, 32, 28) },
    walkA: { head: p(19, 7, 34, 31), leftPaw: p(11, 39, 12, 13), rightPaw: p(35, 37, 12, 17), eyes: [e("cat", 29, 22, 7, 8), e("cat", 42, 22, 5, 7)] },
    walkB: { head: p(20, 7, 34, 31), leftPaw: p(10, 39, 11, 13), rightPaw: p(32, 36, 17, 18), eyes: [e("cat", 33, 23, 7, 7), e("cat", 45, 21, 5, 7)] },
    stretch: { head: p(24, 7, 28, 29), leftPaw: p(18, 5, 13, 20), rightPaw: p(47, 14, 9, 12) },
    groom: { head: p(19, 7, 34, 32), leftPaw: p(30, 38, 8, 16), rightPaw: p(37, 33, 12, 13) },
    focus: { head: p(17, 11, 32, 28), leftPaw: p(24, 43, 9, 6), prop: p(29, 35, 28, 20), eyes: [e("cat", 24, 27, 6, 7), e("cat", 36, 28, 5, 6)] },
    read: { head: p(14, 6, 32, 29), leftPaw: p(11, 42, 8, 8), rightPaw: p(34, 43, 8, 9), prop: p(9, 31, 32, 22), eyes: [e("cat", 18, 23, 6, 7), e("cat", 31, 25, 5, 6)] },
    music: { head: p(15, 8, 38, 29), leftPaw: p(29, 38, 8, 16), rightPaw: p(39, 38, 7, 16), prop: p(10, 9, 44, 24) },
    play: { head: p(18, 7, 31, 27), leftPaw: p(24, 35, 10, 10), rightPaw: p(42, 36, 9, 9), prop: p(31, 35, 14, 9), eyes: [e("cat", 29, 23, 6, 7), e("cat", 41, 22, 5, 6)] },
  },
  red_panda: {
    idle: { head: p(6, 8, 41, 29), leftPaw: p(13, 40, 11, 14), rightPaw: p(26, 40, 9, 14), eyes: [e("red_panda", 16, 24, 6, 7), e("red_panda", 28, 25, 6, 7)] },
    blink: { head: p(8, 10, 39, 27), leftPaw: p(14, 40, 11, 14), rightPaw: p(27, 40, 9, 14) },
    happy: { head: p(15, 8, 37, 29), leftPaw: p(29, 38, 9, 9), rightPaw: p(40, 36, 8, 8) },
    delighted: { head: p(11, 4, 42, 30), leftPaw: p(22, 31, 11, 12), rightPaw: p(41, 23, 11, 15) },
    curious: { head: p(7, 7, 44, 33), leftPaw: p(13, 40, 11, 14), rightPaw: p(25, 41, 10, 13), eyes: [e("red_panda", 18, 23, 6, 7), e("red_panda", 28, 28, 6, 7)] },
    lifted: { head: p(13, 4, 32, 22), leftPaw: p(18, 26, 10, 10), rightPaw: p(32, 26, 9, 10), eyes: [e("red_panda", 21, 16, 5, 5), e("red_panda", 32, 14, 5, 5)] },
    yawn: { head: p(15, 11, 36, 28), leftPaw: p(26, 39, 9, 14), rightPaw: p(36, 33, 11, 11) },
    sleep: { head: p(31, 27, 27, 26) },
    walkA: { head: p(18, 8, 36, 27), leftPaw: p(33, 38, 17, 15), rightPaw: p(17, 38, 10, 14), eyes: [e("red_panda", 34, 23, 6, 7), e("red_panda", 45, 20, 5, 6)] },
    walkB: { head: p(19, 8, 35, 27), leftPaw: p(24, 36, 14, 17), rightPaw: p(36, 37, 14, 16), eyes: [e("red_panda", 34, 22, 6, 7, 37, 26), e("red_panda", 44, 22, 6, 7, 48, 25)] },
    stretch: { head: p(22, 7, 31, 24), leftPaw: p(15, 7, 14, 25), rightPaw: p(43, 15, 10, 16) },
    groom: { head: p(17, 8, 36, 28), leftPaw: p(26, 39, 10, 14), rightPaw: p(38, 31, 11, 14) },
    focus: { head: p(11, 16, 37, 26), rightPaw: p(26, 43, 13, 7), prop: p(4, 38, 26, 16), eyes: [e("red_panda", 18, 32, 5, 6), e("red_panda", 29, 32, 6, 6)] },
    read: { head: p(8, 8, 38, 27), leftPaw: p(9, 39, 9, 10), rightPaw: p(33, 39, 10, 10), prop: p(12, 33, 25, 19), eyes: [e("red_panda", 16, 26, 5, 6), e("red_panda", 28, 25, 6, 6)] },
    music: { head: p(9, 10, 39, 27), leftPaw: p(18, 40, 11, 14), rightPaw: p(30, 40, 9, 14), prop: p(9, 6, 36, 28) },
    play: { head: p(9, 9, 37, 27), leftPaw: p(13, 35, 11, 13), rightPaw: p(28, 36, 11, 12), prop: p(20, 36, 14, 10), eyes: [e("red_panda", 17, 26, 5, 6), e("red_panda", 28, 26, 5, 6)] },
  },
  capybara: {
    idle: { head: p(21, 8, 32, 29), leftPaw: p(24, 34, 9, 20), rightPaw: p(41, 36, 7, 18), eyes: [e("capybara", 31, 18, 5, 6)] },
    blink: { head: p(21, 8, 32, 29), leftPaw: p(24, 34, 9, 20), rightPaw: p(41, 36, 7, 18) },
    happy: { head: p(20, 8, 33, 29), leftPaw: p(24, 35, 9, 19), rightPaw: p(41, 36, 7, 18), eyes: [e("capybara", 30, 18, 5, 6)] },
    delighted: { head: p(21, 8, 33, 26), leftPaw: p(22, 33, 12, 16), rightPaw: p(44, 34, 10, 13) },
    curious: { head: p(15, 5, 36, 31), leftPaw: p(24, 36, 9, 18), rightPaw: p(41, 36, 7, 18), eyes: [e("capybara", 24, 20, 5, 6)] },
    lifted: { head: p(17, 7, 27, 23), leftPaw: p(16, 30, 9, 10), rightPaw: p(37, 30, 8, 10), eyes: [e("capybara", 23, 12, 5, 5), e("capybara", 38, 12, 3, 4)] },
    yawn: { head: p(20, 8, 30, 29), leftPaw: p(24, 37, 10, 17), rightPaw: p(42, 37, 7, 17) },
    sleep: { head: p(28, 23, 29, 31) },
    walkA: { head: p(23, 7, 31, 28), leftPaw: p(20, 36, 11, 18), rightPaw: p(41, 39, 10, 13), eyes: [e("capybara", 34, 16, 5, 6)] },
    walkB: { head: p(22, 7, 32, 29), leftPaw: p(20, 36, 14, 18), rightPaw: p(33, 37, 10, 17), eyes: [e("capybara", 32, 16, 5, 6)] },
    stretch: { head: p(24, 8, 25, 23), leftPaw: p(16, 10, 12, 21), rightPaw: p(43, 9, 8, 22) },
    groom: { head: p(21, 6, 27, 29), leftPaw: p(24, 30, 19, 14), rightPaw: p(44, 38, 7, 15) },
    focus: { head: p(15, 8, 32, 27), leftPaw: p(21, 36, 12, 10), prop: p(22, 29, 34, 21), eyes: [e("capybara", 25, 18, 5, 6)] },
    read: { head: p(17, 8, 32, 28), leftPaw: p(17, 34, 14, 14), rightPaw: p(49, 32, 7, 16), prop: p(27, 28, 28, 20), eyes: [e("capybara", 26, 19, 5, 6)] },
    music: { head: p(18, 8, 32, 27), leftPaw: p(22, 36, 12, 18), rightPaw: p(41, 36, 9, 18), prop: p(13, 6, 38, 25) },
    play: { head: p(18, 8, 31, 25), leftPaw: p(20, 33, 15, 17), rightPaw: p(46, 33, 10, 13), prop: p(31, 30, 19, 14), eyes: [e("capybara", 25, 16, 5, 6)] },
  },
  crab: {
    idle: { head: p(13, 12, 33, 24), leftPaw: p(4, 33, 21, 17), rightPaw: p(37, 34, 20, 16), eyes: [e("crab", 18, 15, 8, 10, 24, 16), e("crab", 35, 15, 8, 10, 40, 16)] },
    blink: { head: p(13, 13, 33, 23), leftPaw: p(4, 33, 21, 17), rightPaw: p(37, 34, 20, 16) },
    happy: { head: p(13, 12, 34, 25), leftPaw: p(4, 34, 21, 17), rightPaw: p(38, 34, 19, 17), eyes: [e("crab", 18, 15, 8, 10), e("crab", 35, 15, 8, 10)] },
    delighted: { head: p(15, 14, 31, 24), leftPaw: p(4, 17, 13, 21), rightPaw: p(45, 20, 12, 18) },
    curious: { head: p(15, 8, 32, 31), leftPaw: p(4, 30, 22, 19), rightPaw: p(37, 36, 20, 18), eyes: [e("crab", 25, 12, 8, 10), e("crab", 38, 21, 8, 10)] },
    lifted: { head: p(19, 20, 26, 21), leftPaw: p(15, 35, 13, 16), rightPaw: p(35, 35, 13, 16), eyes: [e("crab", 24, 21, 5, 8), e("crab", 38, 22, 5, 8)] },
    yawn: { head: p(15, 11, 32, 26), leftPaw: p(4, 37, 19, 15), rightPaw: p(35, 34, 19, 18) },
    sleep: { head: p(18, 24, 32, 21) },
    walkA: { head: p(15, 9, 31, 29), leftPaw: p(5, 30, 21, 17), rightPaw: p(40, 34, 16, 14), eyes: [e("crab", 21, 12, 8, 11), e("crab", 38, 17, 7, 9)] },
    walkB: { head: p(15, 10, 31, 28), leftPaw: p(6, 30, 20, 18), rightPaw: p(40, 35, 15, 13), eyes: [e("crab", 21, 13, 8, 10), e("crab", 38, 17, 7, 9)] },
    stretch: { head: p(15, 18, 31, 21), leftPaw: p(4, 16, 14, 21), rightPaw: p(44, 16, 13, 21) },
    groom: { head: p(18, 11, 30, 30), leftPaw: p(12, 27, 23, 20), rightPaw: p(40, 38, 15, 16) },
    focus: { head: p(13, 12, 32, 28), rightPaw: p(35, 40, 16, 11), prop: p(5, 32, 29, 22), eyes: [e("crab", 18, 16, 7, 10), e("crab", 34, 19, 7, 9)] },
    read: { head: p(13, 12, 32, 24), leftPaw: p(5, 36, 14, 16), rightPaw: p(39, 39, 16, 12), prop: p(9, 30, 33, 23), eyes: [e("crab", 18, 16, 7, 10), e("crab", 34, 17, 7, 10)] },
    music: { head: p(15, 16, 31, 21), leftPaw: p(7, 36, 18, 17), rightPaw: p(39, 35, 16, 18), prop: p(10, 5, 40, 26) },
    play: { head: p(18, 12, 30, 25), leftPaw: p(14, 35, 16, 16), rightPaw: p(39, 35, 15, 16), prop: p(27, 38, 19, 9), eyes: [e("crab", 23, 15, 7, 11), e("crab", 39, 15, 7, 11)] },
  },
};

/** Closed eyes never get pupils. Occluding forepaws/hands stay joined to faces. */
export function getPetRig(character: CompanionId, pose: PetPose): PetRig {
  const calibrated = geometry[character][pose];
  const lockedHead = ["sleep", "lifted", "groom", "stretch", "delighted", "music"].includes(pose);
  return {
    head: calibrated.head,
    leftPaw: calibrated.leftPaw ?? null,
    rightPaw: calibrated.rightPaw ?? null,
    prop: calibrated.prop ?? null,
    eyes: calibrated.eyes ?? [],
    joints: { headOverlap: 3, maxHeadOffset: lockedHead ? 0 : 1, maxPawOffset: pose === "sleep" ? 0 : 2 },
  };
}

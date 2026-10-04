import type { CompanionId } from "../types/appearance";
import type { PetPose } from "../types/pixelPets";

export interface PixelOffset { x: number; y: number }
export interface PetMotionFrame {
  body: PixelOffset;
  head: PixelOffset;
  leftPaw: PixelOffset;
  rightPaw: PixelOffset;
  prop: PixelOffset;
  blink: boolean;
  pageTurn: boolean;
  screenPulse: boolean;
}

// Keep every loop independent of frame rate and the source artwork. A renderer
// can redraw articulated pixel layers without replacing the animal's silhouette.
export const PET_MOTION_PERIOD_MS: Record<PetPose, number> = {
  idle: 6400, blink: 5200, happy: 2800, delighted: 1800,
  curious: 6400, lifted: 3600, yawn: 3600, sleep: 7200,
  walkA: 520, walkB: 520, stretch: 5000, groom: 3200,
  focus: 5400, read: 9200, music: 1680, play: 2640,
};
export const PHONE_MOTION_PERIOD_MS = 4600;

const CHARACTER_TEMPO: Record<CompanionId, number> = {
  panda: 1, red_panda: 1.08, cat: 1.04, capybara: .86, crab: 1.12,
};
const zero = (): PixelOffset => ({ x: 0, y: 0 });
const neutral = (): PetMotionFrame => ({
  body: zero(), head: zero(), leftPaw: zero(), rightPaw: zero(), prop: zero(),
  blink: false, pageTurn: false, screenPulse: false,
});
const oscillate = (time: number, period: number, amplitude = 1) =>
  Math.round(Math.sin(time / period * Math.PI * 2) * amplitude);
const inRange = (time: number, start: number, end: number) => time >= start && time < end;

export function petMotionPeriod(pose: PetPose, character: CompanionId = "panda", phone = false): number {
  return (phone ? PHONE_MOTION_PERIOD_MS : PET_MOTION_PERIOD_MS[pose]) / CHARACTER_TEMPO[character];
}

/** Integer offsets in the 60×60 display canvas; paused clocks may resume at any point. */
export function samplePetMotion(pose: PetPose, elapsedMs: number, character: CompanionId = "panda",
  phone = false, reducedMotion = false): PetMotionFrame {
  const motion = neutral();
  if (reducedMotion) return motion;
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) * CHARACTER_TEMPO[character];
  const period = phone ? PHONE_MOTION_PERIOD_MS : PET_MOTION_PERIOD_MS[pose];
  const time = elapsed % period;

  // A short, infrequent blink rather than replacing a working pose with the
  // unrelated atlas blink pose (which would also erase its book or computer).
  motion.blink = pose === "blink" || (pose !== "sleep" && pose !== "yawn" && inRange(time, period * .78, period * .78 + 120));

  if (phone) {
    // Two scroll/tap bursts with a quiet reading pause between them.
    const tapping = inRange(time, 700, 1350) || inRange(time, 2600, 3150);
    motion.rightPaw.y = tapping && Math.floor(time / 160) % 2 === 0 ? 1 : 0;
    motion.rightPaw.x = tapping && Math.floor(time / 320) % 2 === 1 ? -1 : 0;
    motion.head.y = inRange(time, 700, 1500) ? 1 : 0;
    motion.screenPulse = tapping && motion.rightPaw.y === 1;
    motion.prop.y = inRange(time, 3500, 3800) ? -1 : 0;
    return motion;
  }

  switch (pose) {
    case "focus": {
      // Alternate paws on keys. Lulls let the pet glance at its screen before
      // continuing; a continuous metronome looks mechanical at this scale.
      const typing = inRange(time, 160, 3050) || inRange(time, 3900, 4650);
      const key = Math.floor(time / 130);
      if (typing) {
        motion.leftPaw.y = key % 2 === 0 ? 1 : 0;
        motion.rightPaw.y = key % 2 === 1 ? 1 : 0;
        motion.head.y = Math.floor(time / 780) % 2;
        motion.screenPulse = key % 3 !== 0;
      }
      motion.head.x = inRange(time, 3250, 3700) ? 1 : 0;
      break;
    }
    case "read":
      motion.head.x = inRange(time, 1500, 3200) ? 1 : inRange(time, 4000, 5300) ? -1 : 0;
      motion.pageTurn = inRange(time, 6200, 6680);
      motion.rightPaw.x = motion.pageTurn ? -1 : 0;
      motion.rightPaw.y = motion.pageTurn ? -1 : 0;
      motion.prop.y = inRange(time, 6300, 6500) ? -1 : 0;
      motion.leftPaw.y = inRange(time, 7100, 7400) ? -1 : 0;
      break;
    case "music":
      motion.head.y = inRange(time, 180, 400) || inRange(time, 1000, 1220) ? 1 : 0;
      motion.head.x = oscillate(time, period);
      motion.body.y = inRange(time, 500, 650) || inRange(time, 1320, 1470) ? -1 : 0;
      motion.leftPaw.y = inRange(time, 500, 760) ? -1 : 0;
      motion.rightPaw.y = inRange(time, 1320, 1580) ? -1 : 0;
      break;
    case "play": {
      const playing = inRange(time, 120, 1880);
      const press = Math.floor(time / 220) % 4;
      motion.leftPaw.y = playing && (press === 0 || press === 3) ? 1 : 0;
      motion.rightPaw.y = playing && (press === 1 || press === 2) ? 1 : 0;
      motion.head.y = inRange(time, 2050, 2300) ? -1 : 0;
      motion.prop.x = playing && inRange(time, 1100, 1400) ? 1 : 0;
      motion.screenPulse = playing && press === 2;
      break;
    }
    case "sleep":
      motion.body.y = inRange(time, 1900, 4600) ? -1 : 0;
      motion.head.y = inRange(time, 2500, 4000) ? -1 : 0;
      break;
    case "idle":
    case "blink":
      motion.body.y = inRange(time, 1500, 3100) ? -1 : 0;
      motion.head.y = inRange(time, 1800, 2750) ? -1 : 0;
      motion.leftPaw.y = inRange(time, 4600, 5000) ? -1 : 0;
      break;
    case "curious":
      motion.head.x = inRange(time, 1300, 2450) ? 1 : inRange(time, 3600, 4500) ? -1 : 0;
      motion.head.y = inRange(time, 1450, 2200) ? -1 : 0;
      motion.body.y = inRange(time, 4900, 5800) ? -1 : 0;
      break;
    case "lifted":
      motion.leftPaw.y = inRange(time, 100, 700) ? -1 : 0;
      motion.rightPaw.y = inRange(time, 400, 1050) ? -1 : 0;
      motion.head.x = oscillate(time, period);
      break;
    case "happy":
      motion.head.y = inRange(time, 120, 420) || inRange(time, 800, 1100) ? -1 : 0;
      motion.leftPaw.y = inRange(time, 120, 420) ? -1 : 0;
      motion.rightPaw.y = inRange(time, 800, 1100) ? -1 : 0;
      break;
    case "delighted":
      motion.body.y = inRange(time, 180, 450) || inRange(time, 960, 1170) ? -1 : 0;
      motion.leftPaw.y = inRange(time, 180, 450) ? -1 : 0;
      motion.rightPaw.y = inRange(time, 180, 450) ? -1 : 0;
      motion.head.y = inRange(time, 960, 1170) ? -1 : 0;
      break;
    case "yawn":
      motion.head.y = inRange(time, 300, 1700) ? -1 : 0;
      motion.leftPaw.y = inRange(time, 700, 1900) ? -1 : 0;
      motion.body.y = inRange(time, 2100, 2700) ? 1 : 0;
      break;
    case "stretch":
      motion.head.y = inRange(time, 600, 2100) ? -1 : 0;
      motion.leftPaw.y = inRange(time, 900, 2400) ? -2 : 0;
      motion.rightPaw.y = inRange(time, 1300, 2700) ? -2 : 0;
      motion.body.y = inRange(time, 2600, 2900) ? 1 : 0;
      break;
    case "groom": {
      const brushing = inRange(time, 100, 1850);
      motion.leftPaw.y = brushing ? oscillate(time, 520) : 0;
      motion.leftPaw.x = brushing && Math.floor(time / 260) % 2 === 0 ? 1 : 0;
      motion.head.y = inRange(time, 100, 1850) ? 1 : 0;
      motion.rightPaw.y = inRange(time, 2200, 2500) ? -1 : 0;
      break;
    }
    case "walkA":
    case "walkB":
      motion.body.y = inRange(time, 120, 260) || inRange(time, 380, 490) ? -1 : 0;
      motion.head.y = inRange(time, 160, 240) || inRange(time, 420, 470) ? -1 : 0;
      motion.leftPaw.y = inRange(time, 0, 260) ? -1 : 0;
      motion.rightPaw.y = inRange(time, 260, 520) ? -1 : 0;
      break;
  }
  return motion;
}

/** Getting from one pose to the next: dip, change at the bottom, then travel, overshoot and settle. */
import type { PixelOffset } from "./petMotion";
import type { PetRect, PetRig } from "./petRig";
import type { PetPose } from "../types/pixelPets";

export interface Tween { head: PixelOffset; leftPaw: PixelOffset; rightPaw: PixelOffset; prop: PixelOffset }
export interface TransitionFrame { pose: PetPose; tween: Tween | null; stretch: number }

const DIP_MS = 130, TRAVEL_MS = 380, STEP_MS = 110;
/** How far a prop is lifted from, or lowered to. */
const REACH = 16;

const step = (pose: PetPose) => pose === "walkA" || pose === "walkB";
/** A blink has to stay a blink. */
export function transitionLength(from: PetPose, to: PetPose): number {
  if (from === to || (from === "idle" && to === "blink") || (from === "blink" && to === "idle")) return 0;
  return step(from) && step(to) ? STEP_MS : DIP_MS + TRAVEL_MS;
}

const center = (r: PetRect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const still = (): PixelOffset => ({ x: 0, y: 0 });
function between(from: PetRect | null, to: PetRect | null, share: number, limit: number): PixelOffset {
  if (!from || !to) return still();
  const a = center(from), b = center(to), cap = (v: number) => Math.max(-limit, Math.min(limit, v));
  // `|| 0` so a settled part is at 0, never -0.
  return { x: Math.round(cap(a.x - b.x) * share) || 0, y: Math.round(cap(a.y - b.y) * share) || 0 };
}
/** Eases out, goes a little past, and comes back. */
export const overshoot = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

/** What to draw `elapsed` ms into a change, or null once it has settled. */
export function transitionFrame(from: PetPose, to: PetPose, fromRig: PetRig, toRig: PetRig, elapsed: number): TransitionFrame | null {
  const length = transitionLength(from, to);
  if (elapsed >= length) return null;
  if (step(from) && step(to)) {
    const left = 1 - elapsed / length;
    return { pose: to, stretch: 1 - .03 * Math.sin(Math.PI * left), tween: {
      head: between(fromRig.head, toRig.head, left, 8), leftPaw: between(fromRig.leftPaw, toRig.leftPaw, left, 8),
      rightPaw: between(fromRig.rightPaw, toRig.rightPaw, left, 8), prop: still(),
    } };
  }
  if (elapsed < DIP_MS) {
    const t = elapsed / DIP_MS;
    return { pose: from, stretch: 1 - .1 * t * t, tween: {
      head: { x: 0, y: Math.round(2 * t) }, leftPaw: still(), rightPaw: still(),
      // Put down what it was holding before picking up the next thing.
      prop: { x: 0, y: Math.round(REACH * t * t) },
    } };
  }
  const t = (elapsed - DIP_MS) / TRAVEL_MS, share = 1 - overshoot(t);
  const spring = t < .3 ? .9 + (t / .3) * .13 : t < .65 ? 1.03 - ((t - .3) / .35) * .05 : .98 + ((t - .65) / .35) * .02;
  return { pose: to, stretch: spring, tween: {
    head: between(fromRig.head, toRig.head, share, 14),
    leftPaw: between(fromRig.leftPaw, toRig.leftPaw, share, 16), rightPaw: between(fromRig.rightPaw, toRig.rightPaw, share, 16),
    prop: { x: 0, y: Math.max(0, Math.round(REACH * share)) },
  } };
}

/** A slow lean for tails, stalks and towers: more at the tip than at the root. */
export function sway(elapsed: number, energy: number): number {
  // A tired pet has less swish in it.
  return Math.sin(elapsed / (900 + (5 - energy) * 350)) * (.6 + energy * .28);
}

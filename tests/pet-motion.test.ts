import { describe, expect, it } from "vitest";
import { petMotionPeriod, samplePetMotion, type PetMotionFrame } from "../src/lib/petMotion";
import { PET_POSES, type PetPose } from "../src/types/pixelPets";
import type { CompanionId } from "../src/types/appearance";

const poses = Object.keys(PET_POSES) as PetPose[];
const characters: CompanionId[] = ["panda", "red_panda", "cat", "capybara", "crab"];
const coordinates = (frame: PetMotionFrame) => [frame.body, frame.head, frame.leftPaw, frame.rightPaw, frame.prop];

describe("articulated companion motion", () => {
  it("gives every pose and phone activity a changing, repeatable loop", () => {
    for (const character of characters) {
      for (const pose of poses) {
        const period = petMotionPeriod(pose, character);
        const frames = Array.from({ length: 60 }, (_, i) => samplePetMotion(pose, period * i / 60, character));
        expect(new Set(frames.map(frame => JSON.stringify(frame))).size, `${character}/${pose}`).toBeGreaterThan(1);
        // Resuming at a known clock phase yields the same frame without a timer,
        // random draw or dependence on the number of prior rendered frames.
        expect(samplePetMotion(pose, 837.25, character)).toEqual(samplePetMotion(pose, 837.25 + period * 3, character));
      }
      const period = petMotionPeriod("curious", character, true);
      expect(samplePetMotion("curious", 820, character, true))
        .toEqual(samplePetMotion("curious", 820 + period, character, true));
    }
  });

  it("keeps all articulated pixels within tiny integer movements at every companion tempo", () => {
    const invalid: string[] = [];
    for (const character of characters) {
      for (const pose of poses) {
        for (let time = 0; time < petMotionPeriod(pose, character); time += 47) {
          const frame = samplePetMotion(pose, time, character);
          const bounded = coordinates(frame).every(offset => Number.isInteger(offset.x)
            && Number.isInteger(offset.y) && Math.abs(offset.x) <= 2 && Math.abs(offset.y) <= 2);
          const small = [frame.head, frame.body].every(offset => Math.abs(offset.x) <= 1 && Math.abs(offset.y) <= 1);
          if (!bounded || !small) invalid.push(`${character}/${pose}@${time}: ${JSON.stringify(frame)}`);
        }
      }
    }
    expect(invalid).toEqual([]);
  });

  it("types with alternating paws, then pauses to look at the screen", () => {
    const left = samplePetMotion("focus", 260);
    const right = samplePetMotion("focus", 390);
    expect(left.leftPaw.y).toBe(1); expect(left.rightPaw.y).toBe(0);
    expect(right.leftPaw.y).toBe(0); expect(right.rightPaw.y).toBe(1);
    for (const time of [20, 3200, 3550, 5000]) {
      const frame = samplePetMotion("focus", time);
      expect(frame.leftPaw).toEqual({ x: 0, y: 0 });
      expect(frame.rightPaw).toEqual({ x: 0, y: 0 });
      expect(frame.screenPulse).toBe(false);
    }
    expect(samplePetMotion("focus", 4215).blink).toBe(true);
    expect(samplePetMotion("focus", 4400).blink).toBe(false);
  });

  it("reads before reaching to turn a page, then settles back into reading", () => {
    expect(samplePetMotion("read", 2000).head.x).toBe(1);
    expect(samplePetMotion("read", 4400).head.x).toBe(-1);
    expect(samplePetMotion("read", 6100).pageTurn).toBe(false);
    const turning = samplePetMotion("read", 6400);
    expect(turning.pageTurn).toBe(true);
    expect(turning.rightPaw).toEqual({ x: -1, y: -1 });
    expect(turning.prop.y).toBe(-1);
    expect(samplePetMotion("read", 6680).pageTurn).toBe(false);
    expect(samplePetMotion("read", 7600).rightPaw).toEqual({ x: 0, y: 0 });
  });

  it("scrolls and taps a phone in bursts with quiet gaps", () => {
    const tapping = samplePetMotion("curious", 960, "panda", true);
    expect(tapping.rightPaw.y).toBe(1);
    expect(tapping.screenPulse).toBe(true);
    const reading = samplePetMotion("curious", 2000, "panda", true);
    expect(reading.rightPaw).toEqual({ x: 0, y: 0 });
    expect(reading.screenPulse).toBe(false);
  });

  it("keeps Reduce Motion still and invalid clocks safe", () => {
    for (const pose of poses) {
      const still = samplePetMotion(pose, 2200, "panda", true, true);
      expect(coordinates(still).every(offset => offset.x === 0 && offset.y === 0)).toBe(true);
      expect(still.blink || still.pageTurn || still.screenPulse).toBe(false);
      for (const invalid of [-10, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(samplePetMotion(pose, invalid)).toEqual(samplePetMotion(pose, 0));
      }
    }
  });
});

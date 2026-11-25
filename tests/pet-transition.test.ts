import { describe, expect, it } from "vitest";
import { getPetRig } from "../src/lib/petRig";
import { overshoot, sway, transitionFrame, transitionLength } from "../src/lib/petTransition";

const rig = (pose: Parameters<typeof getPetRig>[1]) => getPetRig("panda", pose);
const at = (from: "idle" | "read" | "walkA", to: "read" | "stretch" | "walkB", ms: number) => transitionFrame(from, to, rig(from), rig(to), ms);

describe("changing pose", () => {
  it("dips in the old pose, then arrives in the new one", () => {
    expect(at("idle", "stretch", 60)).toMatchObject({ pose: "idle" });
    expect(at("idle", "stretch", 60)!.stretch).toBeLessThan(1);
    expect(at("idle", "stretch", 200)).toMatchObject({ pose: "stretch" });
    expect(at("idle", "stretch", transitionLength("idle", "stretch"))).toBeNull();
  });
  it("carries the paws from where they were instead of jumping", () => {
    const start = at("idle", "stretch", 135)!.tween!.leftPaw, end = at("idle", "stretch", 505)!.tween!.leftPaw;
    expect(Math.hypot(start.x, start.y)).toBeGreaterThan(8);
    expect(Math.hypot(end.x, end.y)).toBeLessThanOrEqual(1);
  });
  it("puts one thing down before picking up the next", () => {
    expect(at("read", "stretch", 120)!.tween!.prop.y).toBeGreaterThan(8);
    expect(at("idle", "read", 140)!.tween!.prop.y).toBeGreaterThan(8);
    expect(at("idle", "read", 505)!.tween!.prop.y).toBe(0);
  });
  it("starts and ends without a jump, and goes slightly past on the way", () => {
    expect(overshoot(0)).toBeCloseTo(0); expect(overshoot(1)).toBeCloseTo(1);
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => overshoot(i / 50)))).toBeGreaterThan(1.02);
    expect(at("idle", "stretch", 505)!.stretch).toBeCloseTo(1, 1);
  });
  it("keeps blinks instant and steps quick", () => {
    expect(transitionLength("idle", "blink")).toBe(0);
    expect(transitionLength("blink", "idle")).toBe(0);
    expect(transitionLength("walkA", "walkB")).toBeLessThan(260);
    expect(at("walkA", "walkB", 50)).toMatchObject({ pose: "walkB" });
  });
  it("sways less when tired", () => {
    const reach = (energy: number) => Math.max(...Array.from({ length: 400 }, (_, i) => Math.abs(sway(i * 40, energy))));
    expect(reach(1)).toBeLessThan(reach(5));
  });
});

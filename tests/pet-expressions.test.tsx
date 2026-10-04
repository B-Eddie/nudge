// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePetExpression } from "../src/hooks/usePetExpression";
import { PIXEL_FRAMES, spritePlacement } from "../src/types/pixelPets";
import type { CompanionId } from "../src/types/appearance";
import type { PetActivity } from "../src/hooks/usePetBehavior";

let root: Root;
let host: HTMLDivElement;
let expression: ReturnType<typeof usePetExpression>;
const base = {
  character: "cat" as CompanionId, activity: "idle" as PetActivity,
  outing: "rest" as "rest" | "walk" | "sniff" | "home",
  transitioning: false, hovered: false, dragging: false, petted: 0,
  near: false, busy: false, energy: 5, reducedMotion: false,
};
function Harness(props: Partial<typeof base>) { expression = usePetExpression({ ...base, ...props }); return null; }
const render = (props: Partial<typeof base> = {}) => act(() => root.render(<Harness {...props} />));
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.spyOn(Math, "random").mockReturnValue(0);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("expressive companion behavior", () => {
  it("blinks briefly, then opens its eyes", () => {
    render(); expect(expression.pose).toBe("idle");
    tick(3800); expect(expression.pose).toBe("blink");
    tick(140); expect(expression.pose).toBe("idle");
  });
  it("pets through a smile and delight, then resumes the user's activity", () => {
    render({ activity: "read", petted: 1 }); expect(expression.pose).toBe("happy");
    tick(450); expect(expression.pose).toBe("delighted");
    tick(900); expect(expression.pose).toBe("happy");
    tick(850); expect(expression.pose).toBe("read");
  });
  it("keeps dragging above sleep, reaction, and walking", () => {
    render({ activity: "sleep", petted: 1, dragging: true, outing: "walk" });
    expect(expression.pose).toBe("lifted"); tick(2300); expect(expression.pose).toBe("lifted");
    render({ activity: "sleep" }); expect(expression.pose).toBe("sleep");
  });
  it("alternates actual walking poses and stops the cadence when attention interrupts", () => {
    render({ outing: "walk" }); const first = expression.pose;
    tick(260); expect(expression.pose).not.toBe(first);
    render({ hovered: true }); expect(expression.pose).toBe("curious");
    tick(10000); expect(expression.pose).toBe("curious");
  });
  it("resumes a fresh walking cadence after attention or a menu instead of skipping hidden steps", () => {
    render({ outing: "walk" }); const restingStep = expression.pose;
    tick(260); expect(expression.pose).not.toBe(restingStep);
    render({ outing: "walk", hovered: true }); tick(3500);
    render({ outing: "walk" }); expect(expression.pose).toBe(restingStep);
    tick(259); expect(expression.pose).toBe(restingStep);
    tick(1); expect(expression.pose).not.toBe(restingStep);
    render({ outing: "walk", busy: true }); expect(expression.pose).toBe(restingStep);
    tick(3000); expect(expression.pose).toBe(restingStep);
    render({ outing: "walk" }); tick(260); expect(expression.pose).not.toBe(restingStep);
  });
  it("cancels every expression timer when the companion unmounts", () => {
    render({ outing: "walk", petted: 1 });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    act(() => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
  });
  it("varies idle habits without repeating the last action", () => {
    render(); tick(16000); expect(expression.pose).toBe("groom");
    tick(2600); expect(expression.pose).toBe("idle");
    tick(16000); expect(expression.pose).toBe("stretch");
  });
  it("leaves focused work quiet longer and cleans up a habit when a menu opens", () => {
    render({ activity: "focus" }); tick(41999); expect(expression.pose).toBe("focus");
    tick(1); expect(expression.pose).toBe("groom");
    render({ activity: "focus", busy: true }); expect(expression.pose).toBe("focus");
    tick(120000); expect(expression.pose).toBe("focus");
  });
  it("does not animate automatic expressions with Reduce Motion", () => {
    render({ reducedMotion: true }); tick(120000); expect(expression.pose).toBe("idle");
    render({ reducedMotion: true, petted: 1 }); tick(1000); expect(expression.pose).toBe("happy");
    tick(1200); expect(expression.pose).toBe("idle");
  });
  it("restarts a petting reaction without letting the old timeout dismiss it", () => {
    render({ petted: 1 }); tick(1800); render({ petted: 2 });
    tick(400); expect(expression.reacting).toBe(true);
    tick(1800); expect(expression.reacting).toBe(false);
  });
});

describe("sprite atlas placement", () => {
  it("keeps all 80 poses inside their canvas with a shared floor", () => {
    for (const frames of Object.values(PIXEL_FRAMES)) {
      expect(frames).toHaveLength(16);
      for (const frame of frames) {
        const placed = spritePlacement(frame, frames[0]);
        expect(placed.x).toBeGreaterThanOrEqual(0);
        expect(placed.y).toBeGreaterThanOrEqual(0);
        expect(placed.x + placed.width).toBeLessThanOrEqual(60);
        expect(placed.y + placed.height).toBe(54);
      }
      expect(spritePlacement(frames[7], frames[0]).height).toBeLessThan(spritePlacement(frames[0], frames[0]).height);
    }
  });
});

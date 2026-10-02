// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chooseAdventure, usePetLife, type AdventureKind, type PetRequest } from "../src/hooks/usePetLife";
import type { CompanionId } from "../src/types/appearance";
import type { PetActivity } from "../src/hooks/usePetBehavior";
let root: Root;
let host: HTMLDivElement;
let life: ReturnType<typeof usePetLife>;
const defaults = { activity: "idle" as PetActivity, interrupted: false, attended: false, resting: false, reduced: false, character: "cat" as CompanionId, energy: 5, request: undefined as PetRequest | undefined };
function Harness(props: Partial<typeof defaults>) { const p = { ...defaults, ...props }; life = usePetLife(p.activity, p.interrupted, p.resting, p.reduced, p.character, p.energy, p.request, p.attended); return null; }
const render = (props: Partial<typeof defaults> = {}) => act(() => root.render(<Harness {...props} />));
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.spyOn(Math, "random").mockReturnValue(0);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("companion life", () => {
  it("chooses different hobbies for each personality and remembers recent adventures", () => {
    expect(chooseAdventure("cat", "idle", 5, [])).toBe("ball");
    expect(chooseAdventure("red_panda", "idle", 5, [])).toBe("butterfly");
    expect(chooseAdventure("capybara", "idle", 5, [])).toBe("tea");
    let recent: AdventureKind[] = [];
    for (let i = 0; i < 12; i++) {
      const kind = chooseAdventure("cat", "idle", 5, recent);
      expect(recent).not.toContain(kind);
      recent = [...recent.slice(-2), kind];
    }
  });
  it("keeps noisy play out of focus time and picks restful hobbies when tired", () => {
    for (const random of [0, .2, .5, .8, .999]) {
      vi.mocked(Math.random).mockReturnValue(random);
      expect(["garden", "tea", "stargaze", "leaf", "exercise"]).toContain(chooseAdventure("cat", "focus", 5, []));
      expect(["tea", "nap", "stargaze", "snack"]).toContain(chooseAdventure("red_panda", "idle", 1, []));
    }
  });
  it("varies explicitly requested games without choosing a quiet hobby or the same toy", () => {
    const games: AdventureKind[] = ["ball", "butterfly", "bubbles", "leaf", "peek"];
    for (const random of [0, .3, .7, .999]) {
      vi.mocked(Math.random).mockReturnValue(random);
      const selected = chooseAdventure("cat", "play", 5, ["ball"], games);
      expect(games).toContain(selected); expect(selected).not.toBe("ball");
    }
  });
  it("notices a ball, approaches, plays with varied poses, celebrates and comes home", () => {
    render(); tick(18000); expect(life.adventure?.phase).toBe("notice");
    tick(900); expect(life.outing).toBe("walk");
    tick(3200); expect(life.adventure?.phase).toBe("interact"); expect(life.adventurePose).toBe("play");
    tick(850); expect(life.adventurePose).toBe("delighted");
    tick(5350); expect(life.adventure?.phase).toBe("celebrate");
    tick(1300); expect(life.outing).toBe("home");
    tick(3200); expect(life.adventure).toBeNull();
  });
  it("responds to toy clicks, then resumes its play sequence", () => {
    render({ request: { id: 1, kind: "ball" } }); tick(4100);
    act(() => life.interact()); expect(life.touches).toBe(1); expect(life.adventurePose).toBe("delighted");
    tick(900); expect(life.touches).toBe(1); expect(life.adventurePose).toBe("delighted");
    tick(850); expect(life.adventurePose).toBe("play");
  });
  it("defers a requested treat until the menu closes and cancels all activity when dragged", () => {
    const request: PetRequest = { id: 1, kind: "snack" };
    render({ interrupted: true, request }); tick(10000); expect(life.adventure).toBeNull();
    render({ request }); expect(life.adventure?.kind).toBe("snack");
    tick(4100); expect(life.adventure?.phase).toBe("interact");
    render({ interrupted: true, request }); tick(100000); expect(life.adventure).toBeNull();
    render({ request }); expect(life.adventure).toBeNull();
  });
  it("pauses a story for attention without disappearing or skipping its approach", () => {
    const request: PetRequest = { id: 1, kind: "butterfly" };
    render({ request }); tick(900); tick(1000);
    render({ request, attended: true }); tick(10000);
    expect(life.adventure?.kind).toBe("butterfly"); expect(life.adventure?.phase).toBe("approach");
    render({ request }); tick(2200); expect(life.adventure?.phase).toBe("interact");
  });
  it("allows explicit play during a break, then goes back to sleep", () => {
    render({ resting: true, activity: "sleep", request: { id: 1, kind: "bubbles" } });
    expect(life.adventure?.kind).toBe("bubbles");
    tick(15000); expect(life.adventure).toBeNull(); tick(100000); expect(life.adventure).toBeNull();
  });
  it("keeps Reduce Motion quiet but allows a static explicitly requested treat", () => {
    render({ reduced: true }); tick(100000); expect(life.adventure).toBeNull();
    render({ reduced: true, request: { id: 1, kind: "snack" } });
    expect(life.adventure?.phase).toBe("interact"); expect(life.outing).toBe("sniff");
    tick(5000); expect(life.adventure).toBeNull();
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePetBehavior } from "../src/hooks/usePetBehavior";
import { useCharacterInteraction } from "../src/hooks/useCharacterInteraction";

const bridge = vi.hoisted(() => ({ invoke: vi.fn(), cursor: undefined as undefined | ((event: { payload: object }) => void) }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke: bridge.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn((_name, callback) => { bridge.cursor = callback; return Promise.resolve(() => { bridge.cursor = undefined; }); }) }));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  bridge.invoke.mockResolvedValue(undefined);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); bridge.invoke.mockClear(); });
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("pet behavior", () => {
  let behavior: ReturnType<typeof usePetBehavior>;
  function Harness({ category = "Music", resting = false, interrupted = false, reduced = false }) {
    behavior = usePetBehavior(category, resting, interrupted, reduced); return null;
  }
  it("ignores transient categories and transitions only after settling", () => {
    act(() => root.render(<Harness />));
    act(() => root.render(<Harness category="Developer Tools" />));
    tick(1000);
    act(() => root.render(<Harness />));
    tick(4000);
    expect(behavior.activity).toBe("music"); expect(behavior.transitioning).toBe(false);
    act(() => root.render(<Harness category="Productivity" />));
    tick(1800); expect(behavior.transitioning).toBe(true); expect(behavior.activity).toBe("music");
    tick(900); expect(behavior.activity).toBe("read"); expect(behavior.transitioning).toBe(false);
  });
  it("walks to a flower, sniffs, returns, and cancels immediately for attention", () => {
    act(() => root.render(<Harness />));
    tick(18000); expect(behavior.adventure?.phase).toBe("notice");
    tick(900); expect(behavior.outing).toBe("walk");
    tick(3200); expect(behavior.outing).toBe("sniff");
    tick(4500); expect(behavior.adventure?.phase).toBe("celebrate");
    tick(1300); expect(behavior.outing).toBe("home");
    tick(3200); expect(behavior.outing).toBe("rest");
    tick(18900); expect(behavior.outing).toBe("walk");
    act(() => root.render(<Harness interrupted />));
    tick(90000); expect(behavior.outing).toBe("rest");
  });
  it("does not wander during rest or reduced motion, and is quieter during focus", () => {
    act(() => root.render(<Harness reduced />)); tick(120000); expect(behavior.outing).toBe("rest");
    act(() => root.render(<Harness resting />)); tick(500); expect(behavior.activity).toBe("sleep");
    tick(120000); expect(behavior.outing).toBe("rest");
    act(() => root.render(<Harness category="Developer Tools" />)); tick(2700);
    tick(64000); expect(behavior.outing).toBe("rest");
    tick(1000); expect(behavior.adventure?.phase).toBe("notice");
    tick(900); expect(behavior.outing).toBe("walk");
  });
});

describe("global desktop gestures", () => {
  let interaction: ReturnType<typeof useCharacterInteraction>;
  function Harness({ hidden = false }) { interaction = useCharacterInteraction(false, vi.fn(), undefined, hidden); return <button data-pet-body className="interactive">Pet</button>; }
  async function setup() {
    await act(async () => root.render(<Harness />));
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => host.querySelector("button") });
  }
  function cursor(x: number, pressed: boolean, inside = true) { act(() => bridge.cursor?.({ payload: { x, y: 70, screen_x: x, screen_y: 70, inside, pressed } })); }
  it("pets on release, not on press, without opening the menu", async () => {
    await setup(); cursor(50, true); expect(interaction.petted).toBe(0);
    cursor(50, false); expect(interaction.petted).toBe(1); expect(interaction.barOpen).toBe(false);
  });
  it("captures a drag outside the pet and releases without triggering a click", async () => {
    await setup(); cursor(50, true); cursor(90, true, false);
    expect(interaction.dragging).toBe(true);
    cursor(110, false, false);
    expect(interaction.dragging).toBe(false); expect(interaction.petted).toBe(0);
    expect(bridge.invoke).toHaveBeenCalledWith("pet_drag", expect.objectContaining({ phase: "end" }));
    expect(bridge.invoke).toHaveBeenLastCalledWith("set_click_through", { passThrough: true });
  });
  it("uses desktop coordinates when the webview follows the pointer across displays", async () => {
    await setup(); cursor(50, true);
    act(() => bridge.cursor?.({ payload: { x: 50, y: 70, screen_x: -1450, screen_y: 970, inside: true, pressed: true } }));
    expect(interaction.dragging).toBe(true);
    act(() => bridge.cursor?.({ payload: { x: 50, y: 70, screen_x: -1450, screen_y: 970, inside: true, pressed: false } }));
    expect(interaction.petted).toBe(0);
    expect(bridge.invoke).toHaveBeenCalledWith("pet_drag", expect.objectContaining({ phase: "end" }));
  });
  it("cancels capture when the pet is hidden mid-drag", async () => {
    await setup(); cursor(50, true); cursor(80, true);
    await act(async () => root.render(<Harness hidden />));
    expect(interaction.dragging).toBe(false);
    expect(bridge.invoke).toHaveBeenCalledWith("pet_drag", { phase: "cancel" });
    expect(bridge.invoke).toHaveBeenLastCalledWith("set_click_through", { passThrough: true });
  });
});

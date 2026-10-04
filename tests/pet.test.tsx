// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePetBehavior } from "../src/hooks/usePetBehavior";
import { useCharacterInteraction } from "../src/hooks/useCharacterInteraction";

const bridge = vi.hoisted(() => ({ desktop: true, invoke: vi.fn(), cursor: undefined as undefined | ((event: { payload: object }) => void) }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => bridge.desktop, invoke: bridge.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn((_name, callback) => { bridge.cursor = callback; return Promise.resolve(() => { bridge.cursor = undefined; }); }) }));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  bridge.desktop = true;
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
  function Harness({ hidden = false, panel = false, present = true }) { interaction = useCharacterInteraction(panel, vi.fn(), undefined, hidden); return present ? <button data-pet-body className="interactive">Pet</button> : null; }
  async function setup() {
    await act(async () => root.render(<Harness />));
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => host.querySelector("button") });
    return vi.spyOn(host.querySelector("button")!, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 40, 120, 120));
  }
  function cursor(x: number, pressed: boolean, inside = true) { act(() => bridge.cursor?.({ payload: { x, y: 70, screen_x: x, screen_y: 70, inside, pressed } })); }
  it("pets on release, not on press, without opening the menu", async () => {
    await setup(); cursor(50, true); expect(interaction.petted).toBe(0);
    cursor(50, false); expect(interaction.petted).toBe(1); expect(interaction.barOpen).toBe(false);
  });
  it("does not mistake initial hover or a jump into the pet for a stroke", async () => {
    await setup();
    cursor(130, false);
    expect(interaction.hovered).toBe(true);
    expect(interaction.petted).toBe(0);
    cursor(-400, false, false);
    cursor(130, false);
    expect(interaction.petted).toBe(0);
    cursor(90, false);
    expect(interaction.petted).toBe(0);
  });
  it("recognizes a genuine slow stroke made of small mouse movements", async () => {
    await setup();
    cursor(40, false);
    for (let x = 41; x <= 130; x++) { cursor(x, false); tick(32); }
    expect(interaction.petted).toBe(1);
    expect(interaction.dragging).toBe(false);
    expect(bridge.invoke).not.toHaveBeenCalledWith("pet_drag", expect.anything());
  });
  it("starts a fresh stroke after leaving the pet instead of combining separate visits", async () => {
    await setup();
    cursor(40, false);
    cursor(100, false);
    cursor(200, false, false);
    cursor(130, false);
    cursor(90, false);
    expect(interaction.petted).toBe(0);
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
  it("tracks direction outside the overlay using local coordinates, without engaging a distant cursor", async () => {
    await setup();
    act(() => bridge.cursor?.({ payload: { x: -240, y: -300, screen_x: 1450, screen_y: 970, inside: false, pressed: false } }));
    expect(interaction.attention).toEqual({ x: -1, y: -1, near: false, tracking: true });
    expect(interaction.hovered).toBe(false);
    expect(interaction.petted).toBe(0);
    act(() => bridge.cursor?.({ payload: { x: 420, y: 100, screen_x: -1450, screen_y: -970, inside: false, pressed: false } }));
    expect(interaction.attention).toEqual({ x: 1, y: 0, near: false, tracking: true });
    expect(bridge.invoke).not.toHaveBeenCalledWith("pet_drag", expect.anything());
    expect(bridge.invoke).toHaveBeenLastCalledWith("set_click_through", { passThrough: true });
  });
  it("keeps proportionate gaze at different character sizes and engages only nearby pointers", async () => {
    const bounds = await setup();
    act(() => bridge.cursor?.({ payload: { x: 110, y: 100, inside: true, pressed: false } }));
    expect(interaction.attention).toEqual({ x: .33, y: 0, near: true, tracking: true });
    bounds.mockReturnValue(new DOMRect(20, 40, 180, 180));
    act(() => bridge.cursor?.({ payload: { x: 155, y: 130, inside: true, pressed: false } }));
    expect(interaction.attention).toEqual({ x: .33, y: 0, near: true, tracking: true });
    // Nearness follows the pet, even at the transparent window's edge.
    act(() => bridge.cursor?.({ payload: { x: -20, y: 130, inside: false, pressed: false } }));
    expect(interaction.attention).toEqual({ x: -.96, y: 0, near: true, tracking: true });
    act(() => bridge.cursor?.({ payload: { x: -600, y: 130, inside: false, pressed: false } }));
    expect(interaction.attention).toEqual({ x: -1, y: 0, near: false, tracking: true });
  });
  it.each(["hidden", "panel"] as const)("clears gaze and stops cursor tracking while %s", async flag => {
    await setup(); cursor(140, false);
    expect(interaction.attention.near).toBe(true);
    await act(async () => root.render(<Harness {...{ [flag]: true }} />));
    expect(interaction.attention).toEqual({ x: 0, y: 0, near: false, tracking: false });
    expect(bridge.cursor).toBeUndefined();
  });
  it("distinguishes a centered tracked pointer from a pet that has left the page", async () => {
    await setup();
    act(() => bridge.cursor?.({ payload: { x: 80, y: 100, inside: false, pressed: false } }));
    expect(interaction.attention).toEqual({ x: 0, y: 0, near: true, tracking: true });
    await act(async () => root.render(<Harness present={false} />));
    cursor(140, false, false);
    expect(interaction.attention).toEqual({ x: 0, y: 0, near: false, tracking: false });
  });
  it("keeps native gaze active when another application has focus", async () => {
    await setup(); cursor(-200, false, false);
    act(() => window.dispatchEvent(new Event("blur")));
    expect(interaction.attention).toEqual({ x: -1, y: -.33, near: false, tracking: true });
    cursor(400, false, false);
    expect(interaction.attention.x).toBe(1);
  });
  it.each(["mouseleave", "blur"])("clears browser gaze when the pointer is lost through %s", async event => {
    bridge.desktop = false;
    await setup();
    act(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: 140, clientY: 70 })));
    expect(interaction.attention.near).toBe(true);
    expect(interaction.hovered).toBe(true);
    act(() => (event === "mouseleave" ? document : window).dispatchEvent(new Event(event)));
    expect(interaction.attention).toEqual({ x: 0, y: 0, near: false, tracking: false });
    expect(interaction.hovered).toBe(false);
  });
});

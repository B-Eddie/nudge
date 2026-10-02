// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "../src/components/SettingsPanel";
import type { Settings } from "../src/types/settings";

const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: bridge.invoke }));
vi.mock("../src/components/PixelPetSprite", () => ({ PixelPetSprite: () => <span /> }));
const saved: Settings = {
  monitor_index: 0, reminder_interval_mins: 30, reminder_snooze_mins: 10,
  position: "bottom_left", character: "cat", theme: "bamboo", pause_shortcut: "Cmd+Shift+KeyP",
  app_categories: { "com.test.app": { name: " ", category: "unknown" } },
};
let root: Root, host: HTMLDivElement;
const close = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  close.mockClear(); bridge.invoke.mockReset();
  bridge.invoke.mockImplementation((command: string) => Promise.resolve(
    command === "get_settings" ? structuredClone(saved)
      : command === "get_monitor_options" ? [{ value: 0, label: "Display 1" }]
      : command === "get_app_category_options" ? [{ value: "unknown", label: "Unknown" }] : undefined));
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{ width: 1 }] as unknown as DOMRectList);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text)!;
async function open() { await act(async () => root.render(<SettingsPanel onClose={close} />)); }
function resize(percent: number) {
  const slider = host.querySelector<HTMLInputElement>('#pet-size')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, String(percent));
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Settings character size and keyboard access", () => {
  it("previews a legacy default, resets it, and persists the chosen size only on Save", async () => {
    await open();
    expect(host.querySelector("output")?.textContent).toBe("100%");
    resize(50); expect(host.querySelector("output")?.textContent).toBe("50%");
    act(() => button("Reset").click()); expect(host.querySelector("output")?.textContent).toBe("100%");
    resize(150); expect(host.querySelector("output")?.textContent).toBe("150%");
    expect(bridge.invoke).not.toHaveBeenCalledWith("save_settings", expect.anything());
    await act(async () => button("Save").click());
    expect(bridge.invoke).toHaveBeenCalledWith("save_settings", { settings: expect.objectContaining({ character_size: 180, character: "cat" }) });
    expect(close).toHaveBeenCalledOnce();
  });
  it("discards a resized draft on Cancel", async () => {
    await open(); resize(50);
    act(() => button("Cancel").click());
    expect(bridge.invoke).not.toHaveBeenCalledWith("save_settings", expect.anything());
    expect(saved.character_size).toBeUndefined(); expect(close).toHaveBeenCalledOnce();
  });
  it("focuses Settings, wraps Tab within it, and gives unnamed app rows a readable label", async () => {
    await open();
    const first = host.querySelector<HTMLButtonElement>('[aria-label="Close settings"]')!;
    expect(document.activeElement).toBe(first);
    act(() => first.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(button("Save"));
    act(() => button("Save").dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(first);
    expect(host.querySelector('[aria-label="Category for com.test.app"]')).not.toBeNull();
  });
  it("selects companions with arrow keys and keeps one radio in the Tab order", async () => {
    await open();
    const cat = host.querySelector<HTMLButtonElement>('[role="radio"][aria-label^="Tuxedo"]')!;
    act(() => { cat.focus(); cat.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })); });
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Capybara/);
    expect(document.activeElement?.getAttribute("aria-checked")).toBe("true");
    expect(host.querySelectorAll('.companion-picker [tabindex="0"]')).toHaveLength(1);
  });
  it("keeps a failed save open with a useful error and a retry button", async () => {
    await open(); resize(150);
    bridge.invoke.mockRejectedValueOnce(new Error("Disk full"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => button("Save").click());
    expect(close).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Couldn't save settings");
    expect(button("Save").disabled).toBe(false);
  });
});

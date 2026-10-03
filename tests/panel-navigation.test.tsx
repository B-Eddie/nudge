// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SummaryPanel, emptySessionStats } from "../src/components/SummaryPanel";
import { OnboardingPanel } from "../src/components/OnboardingPanel";
import type { Settings } from "../src/types/settings";
const bridge = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: bridge.invoke }));
vi.mock("../src/components/PixelPetSprite", () => ({ PixelPetSprite: () => <span /> }));
let root: Root, host: HTMLDivElement;
const close = vi.fn();
const settings: Settings = { monitor_index: 0, reminder_interval_mins: 30, reminder_snooze_mins: 10, position: "bottom_left", character: "crab", theme: "bamboo", pause_shortcut: "Cmd+Shift+KeyP", app_categories: { "com.test.app": { name: " ", category: "unknown" } } };
function result(command: string) { return Promise.resolve(command === "get_settings" ? structuredClone(settings) : command === "get_monitor_options" ? [{ value: 0, label: "Display 1" }] : command === "get_app_category_options" ? [{ value: "unknown", label: "Unknown" }] : undefined); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  bridge.invoke.mockReset(); bridge.invoke.mockImplementation(result); close.mockReset();
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{ width: 1 }] as unknown as DOMRectList);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text)!;
const click = async (text: string) => act(async () => button(text).click());
describe("Activity and onboarding keyboard navigation", () => {
  it("navigates report tabs with the keyboard and closes Escape once", async () => {
    await act(async () => root.render(<SummaryPanel stats={{ ...emptySessionStats(), categorySeconds: { Games: 900 } }} history={[]} energy={4} onBreak={false} onClose={close} />));
    const today = host.querySelector<HTMLButtonElement>('#summary-tab-today')!;
    act(() => { today.focus(); today.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })); });
    const week = host.querySelector<HTMLButtonElement>('#summary-tab-week')!;
    expect(document.activeElement).toBe(week); expect(week.getAttribute("aria-selected")).toBe("true");
    expect(host.querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
    expect(host.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby")).toBe(week.id);
    act(() => week.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(close).toHaveBeenCalledOnce();
  });
  it("shows an initial load failure and retries without completing setup", async () => {
    bridge.invoke.mockImplementation((command: string) => command === "get_settings" ? Promise.reject(new Error("Unavailable")) : result(command));
    await act(async () => root.render(<OnboardingPanel onComplete={close} />));
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load your setup");
    bridge.invoke.mockImplementation(result); await click("Try again");
    expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("1");
    expect(close).not.toHaveBeenCalled();
  });
  it("keeps Shift+Tab from the focused step heading inside setup", async () => {
    await act(async () => root.render(<OnboardingPanel onComplete={close} />));
    const heading = host.querySelector<HTMLHeadingElement>('#onboarding-title')!;
    expect(document.activeElement).toBe(heading);
    act(() => heading.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(button("Continue"));
    expect(close).not.toHaveBeenCalled();
  });
  it("commits a recorded shortcut on Escape, allows final review and saves once", async () => {
    await act(async () => root.render(<OnboardingPanel onComplete={close} />));
    for (let i = 0; i < 4; i++) await click("Continue");
    const shortcut = host.querySelector<HTMLButtonElement>('.onboarding-shortcut')!;
    act(() => { shortcut.focus(); shortcut.click(); });
    act(() => shortcut.dispatchEvent(new KeyboardEvent("keydown", { key: "K", code: "KeyK", metaKey: true, shiftKey: true, bubbles: true, cancelable: true })));
    act(() => shortcut.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true })));
    expect(shortcut.getAttribute("aria-pressed")).toBe("false"); expect(shortcut.textContent).toContain("K");
    for (let i = 0; i < 3; i++) await click("Continue");
    expect(button("Back")).toBeDefined(); await click("Back");
    expect(host.querySelector('[aria-label="Category for com.test.app"]')).not.toBeNull();
    await click("Continue"); await click("Get started");
    expect(bridge.invoke).toHaveBeenCalledWith("save_settings", { settings: expect.objectContaining({ onboarding_complete: true, pause_shortcut: "Shift+Cmd+KeyK" }) });
    expect(close).toHaveBeenCalledOnce();
  });
  it("keeps setup and its chosen values available after a failed save", async () => {
    await act(async () => root.render(<OnboardingPanel onComplete={close} />));
    for (let i = 0; i < 7; i++) await click("Continue");
    bridge.invoke.mockRejectedValueOnce(new Error("Disk full"));
    await click("Get started");
    expect(close).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Couldn't save your setup");
    expect(button("Get started").disabled).toBe(false);
    expect(button("Back").disabled).toBe(false);
    await click("Get started");
    expect(close).toHaveBeenCalledOnce();
    expect(bridge.invoke.mock.calls.filter(([command]) => command === "save_settings")).toHaveLength(2);
  });
});

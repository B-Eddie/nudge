// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SummaryPanel, emptySessionStats } from "../src/components/SummaryPanel";
import { OnboardingPanel } from "../src/components/OnboardingPanel";
import { SettingsPanel } from "../src/components/SettingsPanel";
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
/** Sets an input's value the way typing does, so React's onChange fires. */
function setValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
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
  it("explains what nudge reads, and that it stays local, on the welcome step", async () => {
    await act(async () => root.render(<OnboardingPanel onComplete={close} />));
    const note = host.querySelector('[data-testid="onboarding-privacy"]')?.textContent ?? "";
    expect(note).toContain("never records what you type");
    expect(note).toContain("stays on this Mac");
  });
  it("lets a new user skip setup and start with the defaults", async () => {
    await act(async () => root.render(<OnboardingPanel onComplete={close} />));
    await click("Skip setup");
    expect(bridge.invoke).toHaveBeenCalledWith("save_settings", { settings: expect.objectContaining({ onboarding_complete: true }) });
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
  it("walks five short steps, keeps typed minutes, allows going back, and saves once", async () => {
    await act(async () => root.render(<OnboardingPanel onComplete={close} />));
    expect(host.querySelector(".onboarding-progress")?.textContent).toBe("1 / 5");
    for (let i = 0; i < 3; i++) await click("Continue");
    const every = [...host.querySelectorAll("label")].find(l => l.textContent === "Nudge me every")!;
    const input = host.querySelector<HTMLInputElement>(`#${CSS.escape(every.htmlFor)}`)!;
    // Clearing the field must not snap to 1 (which used to turn "45" into "145").
    act(() => { input.focus(); setValue(input, ""); });
    expect(input.value).toBe("");
    act(() => setValue(input, "45"));
    act(() => input.blur());
    expect(input.value).toBe("45");
    await click("Continue");
    expect(host.textContent).toContain("menu bar");
    await click("Back");
    const again = [...host.querySelectorAll("label")].find(l => l.textContent === "Nudge me every")!;
    expect(host.querySelector<HTMLInputElement>(`#${CSS.escape(again.htmlFor)}`)?.value).toBe("45");
    await click("Continue"); await click("Get started");
    expect(bridge.invoke).toHaveBeenCalledWith("save_settings", { settings: expect.objectContaining({ onboarding_complete: true, reminder_interval_mins: 45 }) });
    expect(close).toHaveBeenCalledOnce();
  });
  it("keeps setup and its chosen values available after a failed save", async () => {
    await act(async () => root.render(<OnboardingPanel onComplete={close} />));
    for (let i = 0; i < 4; i++) await click("Continue");
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

describe("Activity export", () => {
  it("exports a CSV of today's activity to Downloads and confirms it", async () => {
    await act(async () => root.render(<SummaryPanel stats={{ ...emptySessionStats(), categorySeconds: { Games: 900 } }} history={[]} energy={4} onBreak={false} onClose={close} />));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close activity report");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Export activity as CSV"]')!.click());
    expect(bridge.invoke).toHaveBeenCalledWith("export_activity_csv", {
      fileName: expect.stringMatching(/^nudge-activity-\d{4}-\d{2}-\d{2}\.csv$/),
      contents: expect.stringContaining("Games (minutes)"),
    });
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Saved to Downloads.");
  });
  it("reports a failed export without closing the panel", async () => {
    bridge.invoke.mockImplementation((command: string) => command === "export_activity_csv" ? Promise.reject(new Error("disk full")) : result(command));
    await act(async () => root.render(<SummaryPanel stats={emptySessionStats()} history={[]} energy={4} onBreak={false} onClose={close} />));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Export activity as CSV"]')!.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Couldn't save the export");
    expect(close).not.toHaveBeenCalled();
  });
});

describe("Settings behaves like a Mac settings window", () => {
  const field = (label: string) => {
    const element = [...host.querySelectorAll("label")].find(l => l.textContent === label)!;
    return host.querySelector<HTMLInputElement>(`#${CSS.escape(element.htmlFor)}`)!;
  };
  const shortcut = () => host.querySelector<HTMLButtonElement>(".settings-shortcut")!;
  const key = (init: KeyboardEventInit) => act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })); });

  it("keeps a shortcut as soon as a valid combo is pressed", async () => {
    await act(async () => root.render(<SettingsPanel onClose={close} />));
    act(() => { shortcut().focus(); shortcut().click(); });
    expect(shortcut().textContent).toContain("Press a new shortcut");
    await key({ key: "Shift" , code: "ShiftLeft", shiftKey: true }); // a lone modifier is not a shortcut
    expect(shortcut().getAttribute("aria-pressed")).toBe("true");
    await key({ key: "k", code: "KeyK", metaKey: true, shiftKey: true });
    expect(shortcut().getAttribute("aria-pressed")).toBe("false");
    expect(shortcut().textContent).toContain("K");
    await click("Save");
    expect(bridge.invoke).toHaveBeenCalledWith("save_settings", { settings: expect.objectContaining({ pause_shortcut: "Shift+Cmd+KeyK" }) });
  });

  it("cancels shortcut recording with Esc and keeps the old one", async () => {
    await act(async () => root.render(<SettingsPanel onClose={close} />));
    act(() => { shortcut().focus(); shortcut().click(); });
    await key({ key: "Escape", code: "Escape" });
    expect(shortcut().getAttribute("aria-pressed")).toBe("false");
    expect(shortcut().textContent).toContain("P");
  });

  it("lets you clear a minutes field and type a new value, clamping only when you leave it", async () => {
    await act(async () => root.render(<SettingsPanel onClose={close} />));
    const input = field("Nudge me every");
    act(() => { input.focus(); setValue(input, ""); });
    act(() => setValue(input, "45"));
    act(() => input.blur());
    expect(input.value).toBe("45");
    act(() => { input.focus(); setValue(input, "9999"); });
    expect(input.value).toBe("999");
    act(() => input.blur());
    expect(input.value).toBe("240");
    act(() => { input.focus(); setValue(input, ""); input.blur(); });
    expect(input.value).toBe("240");
  });

  it("does not throw away edits when you click outside the card", async () => {
    await act(async () => root.render(<SettingsPanel onClose={close} />));
    const backdrop = host.querySelector<HTMLDivElement>(".settings-backdrop")!;
    const input = field("Nudge me every");
    act(() => { input.focus(); setValue(input, "50"); input.blur(); });
    act(() => backdrop.click());
    expect(close).not.toHaveBeenCalled();
    await click("Cancel");
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes on an outside click when nothing changed", async () => {
    await act(async () => root.render(<SettingsPanel onClose={close} />));
    act(() => host.querySelector<HTMLDivElement>(".settings-backdrop")!.click());
    expect(close).toHaveBeenCalledOnce();
  });
});

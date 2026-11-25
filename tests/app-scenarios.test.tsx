// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (event: { payload: unknown }) => void;
const bridge = vi.hoisted(() => ({
  invoke: vi.fn(),
  handlers: new Map<string, Handler>(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: bridge.invoke, isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((name: string, handler: Handler) => {
    bridge.handlers.set(name, handler);
    return Promise.resolve(() => bridge.handlers.delete(name));
  }),
}));
vi.mock("../src/components/LivingPet", () => ({ LivingPet: (p: { category?: string; sign?: string; drowsy?: number; tantrum?: number | null; performing?: string; onPet: () => void }) =>
  <button data-testid="pet" data-pet-body data-category={p.category} data-sign={p.sign} data-drowsy={p.drowsy} data-tantrum={p.tantrum ? "yes" : "no"} data-performing={p.performing} onClick={p.onPet} /> }));

import App from "../src/App";

const settings = {
  monitor_index: 0, reminder_interval_mins: 30, reminder_snooze_mins: 10, position: "bottom_left",
  character: "crab", character_size: 120, theme: "bamboo", pause_shortcut: "Cmd+Shift+KeyP",
  app_categories: {}, onboarding_complete: true, pending_notes: [], auto_idle_break_mins: 5,
  launch_at_login: false, hide_helper_apps: false,
};
const activity = {
  timePassed: 0, timeEvents: 1, paused: false, history: [],
  stats: { startedAt: Date.now(), categorySeconds: {}, breaksTaken: 0, breaksInterrupted: 0, restSeconds: 0, currentStretchSeconds: 0, longestStretchSeconds: 0 },
};
/** What the Mac reports; a five-second pause unless a test says otherwise. */
const mac = { idle_seconds: 8, idle_threshold_seconds: 300, should_auto_break: false, defer_auto_break: false, defer_reason: null as string | null, in_call: false, watching: false, music_playing: false };
const world = { front: null as null | { name: string; bundle_id: string; category: string; category_label: string }, companion: null as unknown, idle: 999, window: null as null | { bundle_id: string; title: string | null; fullscreen: boolean; browser: boolean }, settings: {} as Record<string, unknown> };
function respond(command: string) {
  switch (command) {
    case "get_settings": return Promise.resolve({ ...structuredClone(settings), ...world.settings });
    case "get_window_context": return Promise.resolve(world.window);
    case "perch_on_front_window": return Promise.resolve(true);
    case "get_activity": return Promise.resolve(structuredClone(activity));
    case "get_auto_break_status": return Promise.resolve({ ...mac });
    case "get_seconds_since_last_input": return Promise.resolve(world.idle);
    case "get_companion": return Promise.resolve(structuredClone(world.companion));
    case "erase_activity": return Promise.resolve(structuredClone(activity));
    case "pop_pending_note": return Promise.resolve(null);
    case "get_frontmost_app": return Promise.resolve(world.front);
    case "get_app_category_options": case "get_monitor_options": case "get_pending_notes": return Promise.resolve([]);
    default: return Promise.resolve(undefined);
  }
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.useFakeTimers();
  Object.assign(mac, { idle_seconds: 8, should_auto_break: false, in_call: false, watching: false });
  Object.assign(world, { front: null, companion: null, idle: 999, window: null, settings: {} });
  activity.stats.startedAt = Date.now();
  bridge.handlers.clear();
  bridge.invoke.mockReset();
  bridge.invoke.mockImplementation(respond);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const emit = (name: string, payload?: unknown) => act(async () => {
  bridge.handlers.get(name)?.({ payload });
  await vi.advanceTimersByTimeAsync(0);
});
const reminderPrompt = () => host.querySelector("#reminder-prompt-title");

async function mount() {
  await act(async () => root.render(<App />));
  await flush();
  expect(bridge.handlers.has("tray-action")).toBe(true);
}

describe("menu-bar actions", () => {
  it("holds a reminder during a quiet hour and delivers it once the hour ends", async () => {
    await mount();
    await emit("tray-action", "quiet-hour");
    await emit("show-reminder");
    expect(reminderPrompt()).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60_000 + 1000); });
    expect(reminderPrompt()).not.toBeNull();
  });

  it("delivers a held reminder as soon as nudges are resumed", async () => {
    await mount();
    await emit("tray-action", "quiet-hour");
    await emit("show-reminder");
    expect(reminderPrompt()).toBeNull();
    await emit("tray-action", "resume-nudges");
    expect(reminderPrompt()).not.toBeNull();
  });

  it("shows reminders normally when not quiet", async () => {
    await mount();
    await emit("show-reminder");
    expect(reminderPrompt()).not.toBeNull();
  });

  it("hides and restores the companion", async () => {
    await mount();
    expect(host.querySelector('[data-testid="pet"]')).not.toBeNull();
    await emit("tray-action", "toggle-companion");
    expect(host.querySelector('[data-testid="pet"]')).toBeNull();
    await emit("tray-action", "toggle-companion");
    expect(host.querySelector('[data-testid="pet"]')).not.toBeNull();
  });

  it("opens the settings panel, revealing a hidden companion first", async () => {
    await mount();
    await emit("tray-action", "toggle-companion");
    await emit("tray-action", "settings");
    expect(bridge.invoke).toHaveBeenCalledWith("open_settings");
    expect(host.querySelector('[data-testid="pet"]')).not.toBeNull();
  });
});

const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text)!;
const click = async (text: string) => { await act(async () => button(text).click()); await flush(); };
const pet = () => host.querySelector<HTMLElement>('[data-testid="pet"]')!;
const seconds = async (count: number) => { for (let i = 0; i < count; i++) { await emit("time-passed"); await wait(1000); } };
const saved = () => bridge.invoke.mock.calls.filter(([c]) => c === "save_activity").at(-1)?.[1].activity;
const cardTitle = () => host.querySelector(".pet-card h2")?.textContent;
const MIN = 60_000;

describe("nudges find their moment", () => {
  it("waits out typing and appears at the next pause", async () => {
    mac.idle_seconds = 0;
    await mount();
    await emit("show-reminder");
    await wait(30_000);
    expect(reminderPrompt()).toBeNull();
    mac.idle_seconds = 6;
    await wait(2000);
    expect(reminderPrompt()).not.toBeNull();
  });
  it("holds through a call, however long, then asks", async () => {
    mac.in_call = true;
    await mount();
    await emit("show-reminder");
    await wait(90 * MIN);
    expect(reminderPrompt()).toBeNull();
    mac.in_call = false;
    await wait(2000);
    expect(reminderPrompt()).not.toBeNull();
  });
  it("keeps a nudge that came due while the companion was hidden", async () => {
    await mount();
    await emit("tray-action", "toggle-companion");
    await emit("show-reminder");
    await wait(10_000);
    await emit("tray-action", "toggle-companion");
    await wait(2000);
    expect(reminderPrompt()).not.toBeNull();
  });
  it("asks again after the snooze time and remembers the answer", async () => {
    await mount();
    await emit("show-reminder");
    await click("Not yet");
    expect(reminderPrompt()).toBeNull();
    await wait(9.9 * MIN);
    expect(reminderPrompt()).toBeNull();
    await wait(0.2 * MIN);
    expect(reminderPrompt()).not.toBeNull();
    expect(saved().stats.nudges).toEqual([{ hour: expect.any(Number), outcome: "later" }]);
  });
  it("folds away unanswered, gets sleepy, and wakes to ask when petted", async () => {
    await mount();
    await emit("show-reminder");
    await wait(2 * MIN + 1000);
    expect(reminderPrompt()).toBeNull();
    await wait(10 * MIN); await emit("time-passed");
    expect(pet().dataset.drowsy).toBe("3");
    await act(async () => pet().click());
    expect(reminderPrompt()).not.toBeNull();
  });
});

describe("breaks together", () => {
  it("starts the suggested reset in one click, performs it, and waters the garden", async () => {
    await mount();
    await emit("show-reminder");
    const primary = host.querySelector<HTMLButtonElement>(".reminder-prompt-primary")!;
    await act(async () => primary.click());
    expect(pet().dataset.performing).toBeTruthy();
    await wait(6 * MIN);
    expect(host.querySelector(".break-coach")).toBeNull();
    expect(cardTitle()).toBe("Did that help?");
    await click("Yes");
    await wait(1000);
    const companion = bridge.invoke.mock.calls.filter(([c]) => c === "save_companion").at(-1)?.[1].companion;
    expect(companion.plants).toHaveLength(1);
    expect(companion.breaks).toBe(1);
    expect(Object.values(companion.routines as Record<string, { helped: number }>)[0].helped).toBe(1);
    expect(saved().stats.nudges).toEqual([{ hour: expect.any(Number), outcome: "taken" }]);
  });
  it("credits the minutes already spent away, and doesn't call a full rest interrupted", async () => {
    world.front = { name: "Code", bundle_id: "code", category: "x", category_label: "Developer Tools" };
    await mount();
    await wait(600);
    await seconds(400);
    const before = saved().stats;
    Object.assign(mac, { idle_seconds: 300, should_auto_break: true });
    await wait(10_000);
    mac.should_auto_break = false;
    await wait(6 * MIN); // rests past what was needed
    world.idle = 0; mac.idle_seconds = 0;
    await wait(10_000);
    const after = saved().stats;
    expect(after.breaksTaken).toBe(1);
    expect(after.restSeconds - before.restSeconds).toBeGreaterThanOrEqual(300);
    expect(before.categorySeconds["Developer Tools"] - after.categorySeconds["Developer Tools"]).toBeGreaterThan(280);
    expect(after.breaksInterrupted).toBe(0);
  });
  it("survives one bump of the desk, and offers to resume a break cut short", async () => {
    await mount();
    await seconds(2);
    activity.timePassed = 0;
    await emit("tray-action", "break");
    await click("Just rest");
    await wait(30_000);
    world.idle = 0; await wait(2000); world.idle = 999; await wait(4000);
    expect(host.querySelector(".pet-card")).toBeNull();
    world.idle = 0; await wait(5000);
    expect(cardTitle()).toContain("of rest left");
    await click("Keep resting");
    world.idle = 999;
    await wait(6000);
    expect(saved().stats.breaksTaken).toBe(1);
    expect(saved().stats.breaksInterrupted).toBe(0);
  });
});

describe("focus sessions", () => {
  const setText = (selector: string, value: string) => act(() => {
    const input = host.querySelector<HTMLInputElement>(selector)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  async function begin() {
    await mount();
    await emit("tray-action", "focus");
    setText("#focus-text", "Essay");
    await click("15 min");
    await click("Start");
    await wait(8000);
  }
  it("holds the sign and the nudges, then asks how it went", async () => {
    await begin();
    await emit("time-passed");
    expect(pet().dataset.sign).toBe("Essay");
    await emit("show-reminder");
    await wait(5 * MIN);
    expect(reminderPrompt()).toBeNull();
    await wait(10 * MIN);
    await emit("time-passed");
    await wait(2000);
    expect(cardTitle()).toBe("“Essay”");
    await click("Done");
    await wait(1000);
    const companion = bridge.invoke.mock.calls.filter(([c]) => c === "save_companion").at(-1)?.[1].companion;
    expect(companion.focus).toBeNull();
    expect(companion.focusLog).toMatchObject([{ text: "Essay", outcome: "done" }]);
    // The nudge it held is delivered once the session is over.
    await wait(8000);
    expect(reminderPrompt()).not.toBeNull();
  });
  it("asks about drift, and accepts that it's part of the task", async () => {
    world.front = { name: "Reddit", bundle_id: "reddit", category: "x", category_label: "Social Networking" };
    await begin();
    await seconds(130);
    await wait(16_000);
    expect(host.querySelector(".reminder-prompt-eyebrow")?.textContent).toBe("Still on this?");
    await click("It’s part of this");
    await seconds(200);
    await wait(16_000);
    expect(host.querySelector(".pet-card")).toBeNull();
  });
  it("hands parked thoughts back as notes", async () => {
    await begin();
    await emit("tray-action", "focus");
    setText('[aria-label="Park a thought"]', "buy milk");
    await click("Park");
    await click("Finish");
    await click("Partly");
    expect(bridge.invoke).toHaveBeenCalledWith("add_pending_note", { note: "buy milk" });
  });
  it("resumes a session that was running when nudge quit", async () => {
    world.companion = { version: 1, metAt: 1, focus: { text: "Thesis", startedAt: Date.now() - MIN, endsAt: Date.now() + 20 * MIN, focusedSeconds: 60, drift: 0, nextDriftAt: 0, allowed: [], parked: [] }, greetedOn: "" };
    await mount();
    await wait(100);
    expect(pet().dataset.sign).toBe("Thesis");
  });
});

describe("privacy", () => {
  it("never records what a private app was", async () => {
    world.front = { name: "Diary", bundle_id: "diary", category: "nudge.private", category_label: "Private" };
    await mount();
    await wait(600);
    await seconds(20);
    expect(saved().stats.categorySeconds.Private).toBeUndefined();
    expect(JSON.stringify(saved())).not.toContain("Diary");
    expect(saved().timePassed).toBeGreaterThan(10);
  });
  it("erases history only after a second, explicit click", async () => {
    await mount();
    await emit("tray-action", "settings");
    await click("Erase my history");
    expect(bridge.invoke).not.toHaveBeenCalledWith("erase_activity");
    await click("Erase it all for good?");
    expect(bridge.invoke).toHaveBeenCalledWith("erase_activity");
    expect(bridge.invoke).toHaveBeenCalledWith("replace_companion", { companion: expect.objectContaining({ focusLog: [] }) });
    expect(button("Erased").disabled).toBe(true);
  });
  it("does not overwrite a companion it could not read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    bridge.invoke.mockImplementation((c: string) => c === "get_companion" ? Promise.reject(new Error("no")) : respond(c));
    await mount();
    await act(async () => pet().click());
    await wait(5000);
    expect(bridge.invoke).not.toHaveBeenCalledWith("save_companion", expect.anything());
  });
});

describe("knowing which tab you're on", () => {
  const zen = { name: "Zen", bundle_id: "app.zen-browser.zen", category: "unknown", category_label: "Unknown" };
  const tab = (title: string, more = {}) => ({ bundle_id: zen.bundle_id, title, fullscreen: false, browser: true, ...more });
  const on = (title: string, more = {}) => { world.front = zen; world.window = tab(title, more); world.settings = { ...world.settings, window_titles: true }; };
  const setText = (selector: string, value: string) => act(() => {
    const input = host.querySelector<HTMLInputElement>(selector)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  it("never asks for a title while the setting is off", async () => {
    world.front = zen; world.window = tab("Cats - YouTube");
    await mount(); await wait(10_000);
    expect(bridge.invoke).not.toHaveBeenCalledWith("get_window_context");
    expect(pet().dataset.category).toBe("Unknown");
  });
  it("tells tabs in one browser apart, and saves no titles", async () => {
    on("Essay draft - Google Docs");
    await mount(); await wait(2500);
    expect(pet().dataset.category).toBe("Productivity");
    await seconds(5);
    world.window = tab("Secret cats - YouTube");
    await wait(2500); await seconds(8);
    expect(pet().dataset.category).toBe("Video");
    expect(saved().stats.categorySeconds).toMatchObject({ Productivity: expect.any(Number), Video: expect.any(Number) });
    const written = JSON.stringify(bridge.invoke.mock.calls.filter(([c]) => /save/.test(c)));
    expect(written).not.toContain("Secret cats"); expect(written).not.toContain("Essay draft"); expect(written).not.toContain("YouTube");
  });
  it("ignores a title left over from another app", async () => {
    on("Cats - YouTube");
    world.front = { name: "Code", bundle_id: "code", category: "x", category_label: "Developer Tools" };
    await mount(); await wait(2500);
    expect(pet().dataset.category).toBe("Developer Tools");
  });
  it("records nothing for a tab your rules call private", async () => {
    on("My Bank - Accounts"); world.settings.site_rules = [{ contains: "bank", category: "Private" }];
    await mount(); await wait(2500); await seconds(10);
    expect(saved().stats.categorySeconds.Private).toBeUndefined();
    expect(pet().dataset.category).toBe("Private");
  });
  it("knows a video about your essay is your essay, and one that isn't", async () => {
    on("Photosynthesis in five minutes - YouTube");
    await mount();
    await emit("tray-action", "focus");
    setText("#focus-text", "Photosynthesis essay");
    await click("15 min"); await click("Start");
    await wait(3000); await seconds(200); await wait(16_000);
    expect(host.querySelector(".pet-card")).toBeNull();
    world.window = tab("Funniest cats - YouTube");
    await wait(2500); await seconds(130); await wait(16_000);
    expect(host.querySelector(".reminder-prompt-eyebrow")?.textContent).toBe("YouTube · still on this?");
  });
  it("offers what's in front of you as the thing to focus on", async () => {
    on("Essay draft - Google Docs");
    await mount(); await wait(2500);
    await emit("tray-action", "focus");
    await click("Essay draft");
    expect(host.querySelector<HTMLInputElement>("#focus-text")!.value).toBe("Essay draft");
  });
  it("hands you back your thread after a real break", async () => {
    on("Essay draft - Google Docs");
    world.companion = { version: 1, greetedOn: new Date().toLocaleDateString("en-CA") };
    await mount(); await wait(2500);
    await emit("screen-locked");
    await wait(4 * MIN);
    world.idle = 0;
    const heard = new Set<string>();
    for (let i = 0; i < 60; i++) { await wait(250); heard.add(host.querySelector(".messages-text")?.textContent ?? ""); }
    expect([...heard].join("\n")).toContain("You were in “Essay draft”.");
  });
  it("steps out of a full-screen video and comes back after", async () => {
    on("A film - Netflix", { fullscreen: true }); mac.watching = true;
    await mount(); await wait(12_000);
    expect(host.querySelector('[data-testid="pet"]')).toBeNull();
    mac.watching = false;
    await wait(12_000);
    expect(pet()).not.toBeNull();
  });
  it("hops onto the window in use only when asked to, and not while busy", async () => {
    world.front = zen;
    await mount(); await wait(5000);
    expect(bridge.invoke).not.toHaveBeenCalledWith("perch_on_front_window", expect.anything());
    await act(async () => root.unmount());
    bridge.handlers.clear();
    root = createRoot(host);
    world.settings = { sit_on_windows: true };
    await mount(); await wait(5000);
    expect(bridge.invoke).toHaveBeenCalledWith("perch_on_front_window", expect.objectContaining({ bodySize: expect.any(Number) }));
  });
  it("asks macOS for access only from its button", async () => {
    world.settings = { window_titles: true };
    await mount(); await emit("tray-action", "settings"); await wait(2500);
    expect(bridge.invoke).toHaveBeenCalledWith("get_window_access");
    expect(bridge.invoke).not.toHaveBeenCalledWith("request_window_access");
    bridge.invoke.mockImplementation((c: string) => c === "get_window_access" ? Promise.resolve(false) : respond(c));
    await wait(2500);
    await click("Allow in macOS…");
    expect(bridge.invoke).toHaveBeenCalledWith("request_window_access");
  });
});

describe("mad on your behalf", () => {
  const mad = () => host.querySelector('[data-testid="pet"]')?.getAttribute("data-tantrum") === "yes";
  const saved = () => bridge.invoke.mock.calls.filter(c => c[0] === "save_companion").map(c => (c[1] as { companion: Record<string, unknown> }).companion).at(-1)!;
  const xcode = { name: "Xcode", bundle_id: "com.apple.dt.Xcode", category: "public.app-category.developer-tools", category_label: "Developer Tools" };
  it("throws a tantrum at what's in front, then offers to face it together", async () => {
    world.front = xcode;
    await mount();
    await emit("tray-action", "ugh");
    expect(mad()).toBe(true);
    expect(bridge.invoke).toHaveBeenCalledWith("throw_at_front_window", expect.objectContaining({ character: "crab" }));
    await wait(7000);
    expect(mad()).toBe(false);
    expect(host.textContent).toContain("Expansion complete");
    expect(host.textContent).toContain("Xcode");
    await click("10 minutes, together"); await wait(3000);
    expect(saved().focus).toMatchObject({ text: "Xcode", dreaded: true });
    // Finishing it counts, and is worth showing off.
    await wait(10 * 60_000 + 30_000);
    await click("Done");
    expect(host.textContent).toContain("Xcode is done");
    await wait(3000);
    expect(saved()).toMatchObject({ beaten: 1, focus: null });
  });
  it("expands again, straight after and later on", async () => {
    world.front = xcode;
    await mount();
    const opened = () => bridge.invoke.mock.calls.filter(c => c[0] === "throw_at_front_window").length;
    for (let time = 1; time <= 3; time++) {
      await emit("tray-action", "ugh");
      expect(mad()).toBe(true);
      expect(opened()).toBe(time);
      await wait(6600);
      expect(mad()).toBe(false);
      expect(host.textContent).toContain("Expansion complete");
      if (time === 2) await click("That helped");
    }
  });
  it("throws nothing when asked not to", async () => {
    world.settings = { throw_things: false };
    await mount(); await emit("tray-action", "ugh");
    expect(mad()).toBe(true);
    expect(bridge.invoke).not.toHaveBeenCalledWith("throw_at_front_window", expect.anything());
  });
  it("comes out of hiding first", async () => {
    await mount();
    await emit("tray-action", "toggle-companion");
    await emit("tray-action", "ugh"); await wait(200);
    expect(mad()).toBe(true);
  });
  it("gives back a nudge it interrupted", async () => {
    await mount(); await emit("show-reminder");
    await emit("tray-action", "ugh");
    expect(reminderPrompt()).toBeNull();
    await wait(90_000);
    expect(reminderPrompt()).not.toBeNull();
  });
  it("bristles at what it promised to stay mad at, but not in a call", async () => {
    world.front = xcode;
    world.companion = { version: 1, metAt: 1, greetedOn: "", grudges: [{ label: "Xcode", key: "xcode", faced: 1, beaten: 0, lastAt: 0 }] };
    mac.in_call = true;
    await mount(); await wait(60_000);
    expect(mad()).toBe(false);
    mac.in_call = false;
    await wait(21_000);
    expect(bridge.invoke).toHaveBeenCalledWith("throw_at_front_window", expect.anything());
    expect((saved().grudges as { faced: number }[])[0].faced).toBe(2);
    bridge.invoke.mockClear();
    await wait(20 * 60_000);
    expect(bridge.invoke).not.toHaveBeenCalledWith("throw_at_front_window", expect.anything());
  });
  it("can't expand worn out: it throws a small tantrum and asks to rest first", async () => {
    world.front = xcode;
    Object.assign(activity, { timePassed: 2 * 3600, timeEvents: 5 });
    try {
      await mount();
      await emit("tray-action", "ugh");
      expect(mad()).toBe(true);
      expect(bridge.invoke).toHaveBeenCalledWith("throw_at_front_window", expect.objectContaining({ ultimate: false }));
      await wait(8000);
      expect(host.textContent).toContain("Not enough rest energy");
      await click("Rest first");
      expect(host.textContent).not.toContain("Not enough rest energy");
    } finally { Object.assign(activity, { timePassed: 0, timeEvents: 1 }); }
  });
  it("stops at once for a break", async () => {
    await mount(); await emit("tray-action", "ugh");
    await emit("screen-locked");
    expect(mad()).toBe(false);
  });
});

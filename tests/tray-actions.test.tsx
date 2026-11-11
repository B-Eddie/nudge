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
vi.mock("../src/components/LivingPet", () => ({ LivingPet: () => <span data-testid="pet" /> }));

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
function respond(command: string) {
  switch (command) {
    case "get_settings": return Promise.resolve(structuredClone(settings));
    case "get_activity": return Promise.resolve(structuredClone(activity));
    case "get_auto_break_status": return Promise.resolve({ idle_seconds: 0, idle_threshold_seconds: 300, should_auto_break: false, defer_auto_break: false, defer_reason: null });
    case "pop_pending_note": return Promise.resolve(null);
    case "get_frontmost_app": return Promise.resolve(null);
    case "get_app_category_options": case "get_monitor_options": case "get_pending_notes": return Promise.resolve([]);
    default: return Promise.resolve(undefined);
  }
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
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

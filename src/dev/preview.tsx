/**
 * Dev-only UI preview. Renders any panel or overlay state in a plain browser with the
 * Tauri bridge mocked, so every screen can be reviewed (and screenshotted) in both
 * themes without clicking through the desktop app.
 *
 *   npm run dev → http://localhost:1420/preview.html?view=settings&theme=night_garden
 *
 * Views: settings, summary, summary-empty, onboarding, notes, breaks, menu, reminder,
 * bubble, overlay. Not bundled into the app.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import "../App.css";
import "../components/LivingPet.css";

type Callback = (event: { event: string; payload: unknown; id: number }) => void;
const callbacks = new Map<number, Callback>();
const listeners = new Map<string, number[]>();
let nextId = 1;

const params = new URLSearchParams(location.search);
const view = params.get("view") ?? "settings";
const theme = params.get("theme") ?? "bamboo";
document.documentElement.dataset.theme = theme;
// still=1: settle instantly for screenshots (no entrance animations or transitions).
if (params.get("still")) {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}";
  document.head.append(style);
}

const apps: Record<string, { name: string; category: string; user_override?: boolean; is_helper?: boolean }> = {
  "com.microsoft.VSCode": { name: "Visual Studio Code", category: "public.app-category.developer-tools" },
  "com.apple.Safari": { name: "Safari", category: "public.app-category.productivity" },
  "com.tinyspeck.slackmacgap": { name: "Slack", category: "public.app-category.social-networking", user_override: true },
  "com.spotify.client": { name: "Spotify", category: "public.app-category.music" },
  "com.figma.Desktop": { name: "Figma", category: "public.app-category.graphics-design" },
  "com.apple.Notes": { name: "Notes", category: "public.app-category.productivity" },
  "com.valvesoftware.steam": { name: "Steam", category: "public.app-category.games" },
  "com.apple.WebKit.Helper": { name: "WebKit Helper", category: "unknown", is_helper: true },
};
const settings = {
  monitor_index: 0, reminder_interval_mins: 30, reminder_snooze_mins: 10, position: "bottom_left",
  character: params.get("pet") ?? "red_panda", character_size: 120, theme, pause_shortcut: "Cmd+Option+Shift+KeyP",
  app_categories: apps, onboarding_complete: view !== "onboarding", pending_notes: ["Drink some water", "Text mom back"],
  auto_idle_break_mins: 5, launch_at_login: true, hide_helper_apps: false,
};
const categories = [
  ["unknown", "Unknown"], ["public.app-category.developer-tools", "Developer Tools"],
  ["public.app-category.productivity", "Productivity"], ["public.app-category.social-networking", "Social Networking"],
  ["public.app-category.music", "Music"], ["public.app-category.games", "Games"],
  ["public.app-category.graphics-design", "Graphics & Design"], ["public.app-category.video", "Video"],
].map(([value, label]) => ({ value, label }));

async function invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  switch (cmd) {
    case "plugin:event|listen": {
      const list = listeners.get(args.event as string) ?? [];
      list.push(args.handler as number);
      listeners.set(args.event as string, list);
      return nextId++;
    }
    case "plugin:event|unlisten": return null;
    case "get_settings": return structuredClone(settings);
    case "get_monitor_options": return [{ value: 0, label: "Built-in Retina Display" }, { value: 1, label: "LG UltraFine" }];
    case "get_app_category_options": return categories;
    case "get_pending_notes": return [...settings.pending_notes];
    case "get_activity": return { timePassed: 1240, timeEvents: 2, paused: false, history: [], stats: { startedAt: Date.now() - 5 * 3600e3, categorySeconds: {}, breaksTaken: 0, breaksInterrupted: 0, restSeconds: 0, currentStretchSeconds: 1240, longestStretchSeconds: 2900 } };
    case "get_auto_break_status": return { idle_seconds: 0, idle_threshold_seconds: 300, should_auto_break: false, defer_auto_break: false, defer_reason: null };
    case "get_frontmost_app": return { name: "Visual Studio Code", bundle_id: "com.microsoft.VSCode", category: "public.app-category.developer-tools", category_label: "Developer Tools" };
    case "pop_pending_note": return null;
    default: console.info("[preview] invoke", cmd, args); return null;
  }
}
Object.assign(window, {
  __TAURI_INTERNALS__: {
    invoke,
    transformCallback(callback: Callback) { const id = nextId++; callbacks.set(id, callback); return id; },
    unregisterCallback(id: number) { callbacks.delete(id); },
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
  },
  __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
  /** Fire a backend event from the console, e.g. __emit("show-reminder"). */
  __emit(event: string, payload?: unknown) {
    for (const id of listeners.get(event) ?? []) callbacks.get(id)?.({ event, payload, id });
  },
});

const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() - offset); return d; };
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const stats = {
  startedAt: Date.now() - 6 * 3600e3,
  categorySeconds: (view === "summary-empty" ? {} : { "Developer Tools": 9800, Productivity: 4100, "Social Networking": 2300, Music: 1500, Games: 600 }) as Record<string, number>,
  breaksTaken: view === "summary-empty" ? 0 : 5, breaksInterrupted: view === "summary-empty" ? 0 : 1,
  restSeconds: view === "summary-empty" ? 0 : 1680, currentStretchSeconds: 1240, longestStretchSeconds: 4200,
};
const history = view === "summary-empty" ? [] : [1, 2, 3, 5, 6].map(offset => ({
  date: key(day(offset)), categorySeconds: { "Developer Tools": 6000 + offset * 900, Productivity: 3000, Video: offset * 700 },
  breaksTaken: 4, breaksInterrupted: offset % 2, restSeconds: 1200, longestStretchSeconds: 3600,
}));

async function main() {
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  const noop = () => console.info("[preview] close");
  // `transform` makes this box the containing block for the panels' position: fixed,
  // so they lay out exactly as in the 420×580 settings window (or 460×360 overlay).
  const frame = (child: React.ReactNode) => <div style={{ width: 420, height: Number(params.get("h") ?? 580), position: "relative", overflow: "hidden", transform: "translateZ(0)" }}>{child}</div>;
  const desktop = (child: React.ReactNode) => (
    <div style={{ width: 460, height: 360, position: "relative", overflow: "hidden", transform: "translateZ(0)",
      background: theme === "night_garden" ? "#1f2126" : "linear-gradient(135deg,#dfe7ee,#f4efe6)" }}>{child}</div>
  );
  switch (view) {
    case "settings": {
      const { SettingsPanel } = await import("../components/SettingsPanel");
      root.render(frame(<SettingsPanel onClose={noop} />)); break;
    }
    case "summary": case "summary-empty": {
      const { SummaryPanel } = await import("../components/SummaryPanel");
      root.render(frame(<SummaryPanel stats={stats} history={history} energy={3} onBreak={false} onClose={noop} />)); break;
    }
    case "onboarding": {
      const { OnboardingPanel } = await import("../components/OnboardingPanel");
      root.render(frame(<OnboardingPanel onComplete={noop} />)); break;
    }
    case "notes": {
      const { ReminderNotePanel } = await import("../components/ReminderNotePanel");
      root.render(frame(<ReminderNotePanel onClose={noop} />)); break;
    }
    case "breaks": {
      const { BreakGuidePanel } = await import("../components/BreakGuidePanel");
      root.render(frame(<BreakGuidePanel onClose={noop} onStart={r => console.info("[preview] start", r.id)} />)); break;
    }
    case "menu": {
      const { RadialMenu } = await import("../components/RadialMenu");
      root.render(desktop(<div className="character pos-bl" style={{ position: "absolute", left: 20, bottom: 20, width: 120, height: 120 }}>
        <RadialMenu open position="bl" break={0} onAction={noop} onNote={noop} onClose={noop} />
      </div>)); break;
    }
    default: {
      // Full overlay with the live pet. reminder/bubble trigger their states after load.
      const { default: App } = await import("../App");
      root.render(desktop(<App />));
      setTimeout(() => {
        const emit = (window as unknown as { __emit: (e: string, p?: unknown) => void }).__emit;
        if (view === "reminder") emit("show-reminder");
        if (view === "bubble") emit("tray-action", "quiet-hour");
      }, 600);
    }
  }
}
void main();

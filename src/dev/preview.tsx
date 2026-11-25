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
import manga from "../manga.css?inline";

type Callback = (event: { event: string; payload: unknown; id: number }) => void;
const callbacks = new Map<number, Callback>();
const listeners = new Map<string, number[]>();
let nextId = 1;

const params = new URLSearchParams(location.search);
const view = params.get("view") ?? "settings";
const theme = params.get("theme") ?? "bamboo";
document.documentElement.dataset.theme = theme;
document.documentElement.dataset.pet = params.get("pet") ?? "panda";
// Panels load their own styles lazily here; the print layer has to come after them.
const printLayer = () => { const style = document.createElement("style"); style.textContent = manga; setTimeout(() => document.head.append(style), 300); };
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
  character: params.get("pet") ?? "panda", character_size: 120, theme, pause_shortcut: "Cmd+Option+Shift+KeyP",
  app_categories: apps, onboarding_complete: view !== "onboarding", pending_notes: ["Drink some water", "Text mom back"],
  auto_idle_break_mins: 5, window_titles: true, site_rules: [{ contains: "Quercus", category: "Learning" }, { contains: "My Bank", category: "Private" }], launch_at_login: true, hide_helper_apps: false,
};
const categories = [
  ["unknown", "Unknown"], ["public.app-category.developer-tools", "Developer Tools"],
  ["public.app-category.productivity", "Productivity"], ["public.app-category.social-networking", "Social Networking"],
  ["public.app-category.music", "Music"], ["public.app-category.games", "Games"],
  ["public.app-category.graphics-design", "Graphics & Design"], ["public.app-category.video", "Video"],
].map(([value, label]) => ({ value, label }));

const speciesSample = ["daisy", "tulip", "lavender", "sunflower", "mushroom", "pumpkin", "fern", "cactus", "moonflower", "maple", "strawberry", "bamboo", "blossom", "snowdrop", "tulip", "daisy"];
const companion = {
  version: 1, metAt: Date.now() - 34 * 864e5, bond: Number(params.get("bond") ?? 130), breaks: 64, goodnights: 1,
  plants: params.get("new") ? [] : [...speciesSample.map((species, i) => ({ id: i + 1, species, drops: 4, plantedAt: Date.now() - i * 864e5, bloomedAt: Date.now() - i * 864e5 })), { id: 99, species: "lavender", drops: 3, plantedAt: Date.now(), bloomedAt: null }],
  wearing: params.get("wear") ?? null, found: ["leaf", "flower", "bow_tie", "scarf", "beanie", "straw_hat", "nightcap", "party_hat", "flower_crown"],
  milestones: ["break-1", "bloom-1", "day-7", "break-25", "day-30", "bloom-12"], routines: {},
  focus: view === "sign" || params.get("focus") ? { text: "Finish the intro paragraph", startedAt: Date.now() - 6e5, endsAt: Date.now() + 9e5, focusedSeconds: 540, drift: 0, nextDriftAt: 0, allowed: [], parked: ["Reply to Sam"] } : null,
  focusLog: [{ text: "Physics set 4", startedAt: Date.now() - 36e5, seconds: 1500, outcome: "done" }, { text: "Essay draft", startedAt: Date.now() - 864e5, seconds: 1500, outcome: "partly" }],
  tomorrow: "", greetedOn: new Date().toLocaleDateString("en-CA"), letterOn: "", today: { date: "", counts: {}, drops: 0 },
};

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
    case "get_auto_break_status": return { idle_seconds: 8, idle_threshold_seconds: 300, should_auto_break: false, defer_auto_break: false, defer_reason: null };
    case "get_frontmost_app": return { name: "Visual Studio Code", bundle_id: "com.microsoft.VSCode", category: "public.app-category.developer-tools", category_label: "Developer Tools" };
    case "get_window_access": return params.get("access") === "1";
    case "get_window_context": return { bundle_id: "com.microsoft.VSCode", title: "Essay draft", fullscreen: false, browser: false };
    case "pop_pending_note": return null;
    case "get_companion": return structuredClone(companion);
    case "get_seconds_since_last_input": return 999;
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
  hourlySeconds: view === "summary-empty" ? [] : [0, 0, 0, 0, 0, 0, 0, 900, 2800, 3300, 3000, 1800, 600, 2600, 3100, 900, 0, 0, 0, 0, 0, 0, 0, 0],
  nudges: view === "summary-empty" ? [] : [{ hour: 9, outcome: "taken" as const }, { hour: 11, outcome: "later" as const }, { hour: 14, outcome: "taken" as const }],
  focusSeconds: 2700, focusSessions: 2, mood: null,
};
const history = view === "summary-empty" ? [] : [1, 2, 3, 5, 6].map(offset => ({
  date: key(day(offset)), categorySeconds: { "Developer Tools": 6000 + offset * 900, Productivity: 3000, Video: offset * 700 },
  breaksTaken: 4, breaksInterrupted: offset % 2, restSeconds: 1200, longestStretchSeconds: 7800,
}));

async function main() {
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  const noop = () => console.info("[preview] close");
  // `transform` makes this box the containing block for the panels' position: fixed,
  // so they lay out exactly as in the 420×580 settings window (or 320×400 overlay).
  const frame = (child: React.ReactNode) => <div style={{ width: 420, height: Number(params.get("h") ?? 580), position: "relative", overflow: "hidden", transform: "translateZ(0)" }}>{child}</div>;
  const desktop = (child: React.ReactNode) => (
    <div style={{ width: 320, height: 400, position: "relative", overflow: "hidden", transform: "translateZ(0)",
      background: theme === "night_garden" ? "#1f2126" : "linear-gradient(135deg,#dfe7ee,#f4efe6)" }}>{child}</div>
  );
  switch (view) {
    case "settings": {
      const { SettingsPanel } = await import("../components/SettingsPanel");
      root.render(frame(<SettingsPanel onClose={noop} onErase={async () => {}} />));
      if (params.get("tab")) setTimeout(() => document.querySelector<HTMLButtonElement>(`#settings-tab-${params.get("tab")}`)?.click(), 400);
      break;
    }
    case "summary": case "summary-empty": case "letter": {
      const { SummaryPanel } = await import("../components/SummaryPanel");
      const { writeLetter } = await import("../lib/weeklyLetter");
      const letter = writeLetter({ history, focusLog: [], petName: "Biscuit", blooms: 14, now: Date.now(), settings: { reminder_interval_mins: 30, wind_down_enabled: false, rhythm_eyes: false } });
      root.render(frame(<SummaryPanel stats={stats} history={history} energy={3} onBreak={false} onClose={noop} letter={letter} character="panda"
        initialTab={view === "letter" ? "letter" : params.get("tab") === "week" ? "week" : "today"} onApply={async () => {}} onWrapUp={noop} />)); break;
    }
    case "garden": case "focus": case "wrapup": {
      const { readCompanion } = await import("../lib/companion");
      const state = readCompanion(companion, Date.now());
      const { HomePanel } = await import("../components/HomePanel");
      const { FocusPanel } = await import("../components/FocusPanel");
      const { WrapUpPanel } = await import("../components/WrapUpPanel");
      const shared = { character: settings.character as "cat", petName: "Biscuit", now: params.get("hour") ? new Date().setHours(Number(params.get("hour"))) : Date.now(), onClose: noop };
      root.render(frame(view === "garden" ? <HomePanel {...shared} state={state} initialTab={(params.get("tab") ?? "garden") as "garden"} onWear={noop} onOpen={noop} />
        : view === "focus" ? <FocusPanel {...shared} session={state.focus} log={state.focusLog} accessory={null} onStart={noop} onExtend={noop} onPark={noop} onEnd={noop} />
        : <WrapUpPanel stats={stats} finished={state.focusLog.slice(0, 1)} petName="Biscuit" tomorrow="" onDone={noop} onClose={noop} />)); break;
    }
    case "postcard": {
      const { drawPostcard } = await import("../lib/postcard");
      const { readCompanion } = await import("../lib/companion");
      const canvas = document.createElement("canvas");
      document.body.append(canvas);
      canvas.style.cssText = "position:fixed;inset:0;width:900px";
      await drawPostcard(canvas, { character: settings.character as "cat", accessory: "scarf", petName: "Biscuit", plants: readCompanion(companion, Date.now()).plants, breaks: 64, days: 34, now: params.get("hour") ? new Date().setHours(Number(params.get("hour"))) : Date.now() });
      break;
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
    case "art": {
      const { PlantArt } = await import("../components/PixelArt");
      const { SPECIES_IDS } = await import("../lib/garden");
      root.render(<div style={{ display: "grid", gridTemplateColumns: "repeat(7, 90px)", gap: 8, padding: 12, background: "#dfe9e4" }}>
        {SPECIES_IDS.map(id => <div key={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, font: "10px sans-serif" }}><PlantArt species={id} stage="bloom" scale={4} />{id}</div>)}
        {(["seed", "sprout", "bud"] as const).map(stage => <PlantArt key={stage} species="lavender" stage={stage} scale={4} />)}
      </div>); break;
    }
    case "outfits": {
      const { PixelPetSprite } = await import("../components/PixelPetSprite");
      const { ACCESSORY_IDS } = await import("../lib/companion");
      const { PET_POSES } = await import("../types/pixelPets");
      const only = params.get("wear");
      const pets = ["panda", "cat", "capybara", "crab"] as const;
      const poses = Object.keys(PET_POSES) as (keyof typeof PET_POSES)[];
      root.render(<div style={{ padding: 8, background: "#e8ecef" }}>{only
        ? pets.map(pet => <div key={pet} style={{ display: "flex", flexWrap: "wrap", width: 1000 }}>{poses.map(pose =>
          <div key={pose} style={{ width: 120, height: 120 }}><PixelPetSprite character={pet} pose={pose} accessory={only as "leaf"} /></div>)}</div>)
        : pets.map(pet => <div key={pet} style={{ display: "flex" }}>{ACCESSORY_IDS.map(id =>
          <div key={id} style={{ width: 120, height: 120 }}><PixelPetSprite character={pet} accessory={id} /></div>)}</div>)}</div>); break;
    }
    case "change": {
      // Flips between two poses on a button, to watch the change: &from=idle&to=read
      const { PixelPetSprite } = await import("../components/PixelPetSprite");
      const Flip = () => {
        const [second, flip] = React.useReducer((v: boolean) => !v, false);
        return <button id="flip" onClick={flip} style={{ border: 0, background: "#e8ecef", width: 220, height: 220 }}><PixelPetSprite character={settings.character as "cat"} animated pose={(params.get(second ? "to" : "from") ?? "idle") as "idle"} energy={Number(params.get("energy") ?? 5)} /></button>;
      };
      root.render(<Flip />); break;
    }
    case "tired": {
      const { PixelPetSprite } = await import("../components/PixelPetSprite");
      const pets = ["panda", "cat", "capybara", "crab"] as const;
      root.render(<div style={{ padding: 8, background: "#e8ecef" }}>{pets.map(pet => <div key={pet} style={{ display: "flex" }}>{[5, 4, 3, 2, 1].map(energy =>
        <div key={energy} style={{ width: 200, height: 200 }}><div style={{ transform: "scale(1.6)", transformOrigin: "0 0" }}><PixelPetSprite character={pet} energy={energy} /></div></div>)}</div>)}</div>); break;
    }
    case "poses": {
      const { PixelPetSprite } = await import("../components/PixelPetSprite");
      const { PET_POSES } = await import("../types/pixelPets");
      root.render(<div style={{ padding: 8, background: "#e8ecef" }}>{(["panda", "cat", "capybara", "crab"] as const).map(pet => <div key={pet} style={{ display: "flex", flexWrap: "wrap", width: 1000 }}>{(Object.keys(PET_POSES) as (keyof typeof PET_POSES)[]).map(pose =>
        <div key={pose} style={{ width: 125, height: 125 }}><PixelPetSprite character={pet} pose={pose} energy={4} /></div>)}</div>)}</div>); break;
    }
    case "export": {
      // Every pose as the app draws it, signature gear on, for website/scripts/export-app-pets.mjs.
      const { PixelPetSprite } = await import("../components/PixelPetSprite");
      const { PET_POSES } = await import("../types/pixelPets");
      root.render(<div>{(["panda", "cat", "capybara", "crab"] as const).map(pet => (Object.keys(PET_POSES) as (keyof typeof PET_POSES)[]).map(pose =>
        <div key={pet + pose} data-pet={pet} data-pose={pose} style={{ display: "inline-block", width: 80, height: 80 }}><PixelPetSprite character={pet} pose={pose} /></div>))}</div>); break;
    }
    case "mad": {
      const { PixelPetSprite } = await import("../components/PixelPetSprite");
      const pets = ["panda", "cat", "capybara", "crab"] as const;
      const poses = ["idle", "curious", "lifted", "walkA", "walkB", "stretch", "delighted", "yawn", "play", "read"] as const;
      root.render(<div style={{ padding: 8, background: "#e8ecef" }}>{pets.map(pet => <div key={pet} style={{ display: "flex" }}>{poses.map(pose =>
        <div key={pose} style={{ width: 120, height: 120 }}><PixelPetSprite character={pet} pose={pose} mad /></div>)}</div>)}</div>); break;
    }
    case "gif": {
      const { MadPanel } = await import("../components/MadPanel");
      root.render(frame(<MadPanel kind={params.get("kind") === "won" ? "won" : "mad"} label={params.get("label") ?? "Taxes"} character={settings.character as "cat"} accessory={params.get("wear") as "leaf" | null} petName="Biscuit" onClose={noop} />)); break;
    }
    case "menu": {
      const { RadialMenu } = await import("../components/RadialMenu");
      root.render(desktop(<div className="character pos-bl" style={{ position: "absolute", left: 20, bottom: 20, width: 120, height: 120 }}>
        <RadialMenu open name="Goro" rank="Grade 2 napper" epithet="monk of the second lunch" rest="about 6 minutes, together" expand={{ label: "Unlimited Bamvoid", ready: true }} position="bl" break={0} onAction={noop} onClose={noop} />
      </div>)); break;
    }
    default: {
      // Full overlay with the live pet. reminder/bubble trigger their states after load.
      const { default: App } = await import("../App");
      root.render(desktop(<App />));
      setTimeout(() => {
        const emit = (window as unknown as { __emit: (e: string, p?: unknown) => void }).__emit;
        if (view === "reminder") emit("show-reminder");
        if (view === "openmenu") document.querySelector<HTMLButtonElement>("[data-pet-menu]")?.click();
        if (view === "coach") { emit("show-reminder"); setTimeout(() => document.querySelector<HTMLButtonElement>(".reminder-prompt-primary")?.click(), 800); }
        if (view === "ugh") emit("tray-action", "ugh");
        if (view === "bubble") emit("tray-action", "quiet-hour");
      }, 600);
    }
  }
}
void main().then(printLayer);

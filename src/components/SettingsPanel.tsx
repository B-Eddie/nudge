import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CategoryOption,
  MonitorOption,
  Settings,
} from "../types/settings";
import {
  fetchAppCategoryOptions,
  fetchMonitorOptions,
  formatShortcut,
  POSITION_OPTIONS,
  shortcutFromKeyboardEvent,
} from "../types/settings";
import { isHelperApp } from "../types/appVisibility";
import { PetSizeControl } from "./PetSizeControl";
import { applyTheme, type ThemeId } from "../types/appearance";
import { CompanionPicker, ThemePicker } from "./AppearancePicker";
import { MinutesField } from "./MinutesField";
import "./SettingsPanel.css";
import { PREFERENCE_DEFAULTS } from "../types/settings";
import { fromTimeInput, toTimeInput } from "../lib/schedule";
import { PanelTabs } from "./PanelShell";
import { RULE_CATEGORIES, type SiteRule } from "../lib/sites";
import { LuSearch, LuX } from "react-icons/lu";

type SettingsTab = "companion" | "nudges" | "day" | "apps" | "general";
const TABS: { id: SettingsTab; label: string }[] = [
  { id: "companion", label: "Companion" }, { id: "nudges", label: "Nudges" }, { id: "day", label: "Day" },
  { id: "apps", label: "Apps" }, { id: "general", label: "General" },
];

interface SettingsPanelProps {
  onClose: () => void;
  /** Deletes saved activity and focus history. */
  onErase?: () => Promise<void>;
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div>
      <label className="settings-field settings-toggle">
        <span>{label}</span>
        <input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="settings-toggle-slider" />
      </label>
      {hint && <p className="settings-hint">{hint}</p>}
    </div>
  );
}

function Segment<T extends string>({ label, value, options, onChange, hint }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; hint?: string;
}) {
  return (
    <div className="settings-field">
      <span>{label}</span>
      <div className="settings-segment" role="radiogroup" aria-label={label} onKeyDown={e => {
        if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
        e.preventDefault();
        const current = options.findIndex(o => o.value === value);
        const next = (current + (e.key === "ArrowLeft" ? -1 : 1) + options.length) % options.length;
        onChange(options[next].value);
        e.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
      }}>
        {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1} onClick={() => onChange(option.value)}>{option.label}</button>)}
      </div>
      {hint && <p className="settings-hint">{hint}</p>}
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: number; onChange: (minute: number) => void }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <input type="time" value={toTimeInput(value)} onChange={e => {
        const minute = fromTimeInput(e.target.value);
        if (minute !== null) onChange(minute);
      }} />
    </label>
  );
}

/** Whether macOS lets nudge read titles, rechecked while Settings is open. */
function WindowAccess() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const check = () => void invoke<boolean>("get_window_access").then(ok => { if (!cancelled) setAllowed(!!ok); }).catch(console.error);
    check();
    const id = setInterval(check, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  if (allowed === null) return null;
  if (allowed) return <p className="settings-hint" role="status">Allowed in macOS.</p>;
  return <div className="panel-group">
    <button type="button" className="settings-btn secondary" style={{ alignSelf: "flex-start" }}
      onClick={() => { setAsked(true); void invoke("request_window_access").catch(console.error); }}>Allow in macOS…</button>
    <p className="settings-hint">{asked
      ? "Turn on nudge under Privacy & Security → Accessibility. If it’s already on, such as after an update, remove it there and add it again."
      : "macOS asks once. It calls this Accessibility; nudge only uses it to read the title."}</p>
  </div>;
}

function SiteRules({ rules, onChange }: { rules: SiteRule[]; onChange: (rules: SiteRule[]) => void }) {
  const [contains, setContains] = useState("");
  const [category, setCategory] = useState<string>(RULE_CATEGORIES[0]);
  const add = () => {
    const text = contains.trim();
    if (!text) return;
    onChange([{ contains: text, category }, ...rules.filter(r => r.contains.toLowerCase() !== text.toLowerCase())]);
    setContains("");
  };
  return <div className="panel-group">
    <p className="settings-hint">Titles containing this text count as:</p>
    <div className="panel-row">
      <input className="panel-input" aria-label="Title contains" value={contains} maxLength={60} placeholder="Quercus"
        onChange={e => setContains(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} />
      <select className="settings-app-category" aria-label="Counts as" value={category} onChange={e => setCategory(e.target.value)} style={{ width: 132 }}>
        {RULE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <button type="button" className="settings-btn secondary" onClick={add} disabled={!contains.trim()} style={{ padding: "10px 14px" }}>Add</button>
    </div>
    {rules.length > 0 && <ul className="settings-note-list">{rules.map(rule => <li key={rule.contains} className="settings-note-row">
      <span>{rule.contains} → {rule.category}</span>
      <button type="button" className="settings-note-remove" aria-label={`Remove rule: ${rule.contains}`} onClick={() => onChange(rules.filter(r => r !== rule))}><LuX size={14} /></button>
    </li>)}</ul>}
  </div>;
}

const STYLE_HINTS = {
  gentle: "Waits a long time for a pause, then folds away quickly if you’re busy.",
  balanced: "Waits for a pause. If you don’t answer, your companion dozes off instead of asking again.",
  firm: "Waits briefly and stays until you answer.",
};
const CHAT_HINTS = {
  quiet: "Speaks only for nudges and things you asked for.",
  normal: "A passing thought now and then.",
  chatty: "Thinks out loud a little more often.",
};

export function SettingsPanel({ onClose, onErase }: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>("companion");
  const [erase, setErase] = useState<"idle" | "confirm" | "erasing" | "done" | "failed">("idle");
  const panelRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [monitorOptions, setMonitorOptions] = useState<MonitorOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [appSearch, setAppSearch] = useState("");
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const initialThemeRef = useRef<ThemeId>("bamboo");
  const loadedRef = useRef<string | null>(null);
  const themeLoadedRef = useRef(false);

  useEffect(() => {
    const panel = panelRef.current;
    const previous = document.activeElement as HTMLElement | null;
    panel?.querySelector<HTMLButtonElement>(".settings-close")?.focus({ preventScroll: true });
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !panel) return;
      const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
        .filter(control => control.getClientRects().length > 0 && control.tabIndex >= 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  // Shortcut recorder, as in System Settings: the first valid combo (a key plus at
  // least one modifier) is kept immediately; Esc cancels and keeps the old one.
  useEffect(() => {
    if (!recordingShortcut) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === "Escape") {
        setRecordingShortcut(false);
        return;
      }

      const shortcut = shortcutFromKeyboardEvent(e);
      if (shortcut) {
        setDraft((prev) => (prev ? { ...prev, pause_shortcut: shortcut } : prev));
        setRecordingShortcut(false);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingShortcut]);

  // reset variables at start
  const stopRecordingShortcut = useCallback(() => {
    setRecordingShortcut(false);
  }, []);

  // set setting options
  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    void Promise.all([
      invoke<Settings>("get_settings"),
      fetchMonitorOptions(),
      fetchAppCategoryOptions(),
    ])
      .then(([settings, monitors, categories]) => {
        if (cancelled) return;
        setDraft(settings);
        loadedRef.current = JSON.stringify(settings);
        initialThemeRef.current = settings.theme ?? "bamboo";
        themeLoadedRef.current = true;
        applyTheme(initialThemeRef.current);
        setMonitorOptions(monitors);
        setCategoryOptions(categories);
      })
      .catch((err) => {
        console.error("Failed to load settings:", err);
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedApps = useMemo(() => {
    if (!draft) return [];
    return Object.entries(draft.app_categories).map(([id, entry]) =>
      [id, { ...entry, name: entry.name.trim() || id.trim() || "Unnamed app" }] as const).sort(([, a], [, b]) =>
      a.name.localeCompare(b.name),
    );
  }, [draft]);

  const categoryLabelByValue = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of categoryOptions) {
      map.set(opt.value, opt.label);
    }
    return map;
  }, [categoryOptions]);

  const filteredApps = useMemo(() => {
    const query = appSearch.trim().toLowerCase();
    return sortedApps.filter(([bundleId, entry]) => {
      if (draft?.hide_helper_apps && isHelperApp(bundleId, entry)) return false;
      if (!query) return true;
      const categoryLabel =
        categoryLabelByValue.get(entry.category) ?? entry.category;
      return (
        entry.name.toLowerCase().includes(query) ||
        bundleId.toLowerCase().includes(query) ||
        categoryLabel.toLowerCase().includes(query)
      );
    });
  }, [sortedApps, appSearch, categoryLabelByValue, draft?.hide_helper_apps]);

  const setAppCategory = useCallback((bundleId: string, category: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const entry = prev.app_categories[bundleId];
      if (!entry) return prev;
      return {
        ...prev,
        app_categories: {
          ...prev.app_categories,
          [bundleId]: {
            ...entry,
            category,
            user_override: true,
          },
        },
      };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setSaving(true); // change button states
    setSaveError(null);

    try {
      await invoke("save_settings", { settings: draft });
      applyTheme(draft.theme);
      onClose();
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSaveError("Couldn't save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [draft, onClose]);

  const closeWithoutSaving = () => {
    if (themeLoadedRef.current) applyTheme(initialThemeRef.current);
    onClose();
  };

  const dirty = draft !== null && loadedRef.current !== null && JSON.stringify(draft) !== loadedRef.current;
  // Clicking outside the card closes it only when there is nothing to lose. With
  // unsaved edits, closing takes an explicit Cancel (or Esc).
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !dirty) closeWithoutSaving();
  };

  // Render the panel chrome immediately so opening settings never shows a
  // blank window while the draft loads.
  const pref = <K extends keyof typeof PREFERENCE_DEFAULTS>(key: K) =>
    (draft?.[key] ?? PREFERENCE_DEFAULTS[key]) as (typeof PREFERENCE_DEFAULTS)[K];
  const set = (patch: Partial<Settings>) => setDraft(prev => prev && { ...prev, ...patch });
  const handleErase = async () => {
    if (erase !== "confirm") { setErase("confirm"); return; }
    setErase("erasing");
    try { await onErase?.(); setErase("done"); }
    catch (err) { console.error("Failed to erase history:", err); setErase("failed"); }
  };

  if (!draft) {
    return (
      <div
        className="settings-backdrop interactive"
        onClick={handleBackdropClick}
        role="presentation"
      >
        <div
          className="settings-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
        >
          <header className="settings-header">
            <h2 id="settings-title">Settings</h2>
            <button
              type="button"
              className="settings-close"
              onClick={closeWithoutSaving}
              aria-label="Close settings"
            >
              <LuX size={15} />
            </button>
          </header>
          <div className="settings-body">
            {loadError ? (
              <p className="settings-status error">
                Couldn't load your settings. Close this panel and try again.
              </p>
            ) : (
              <p className="settings-status">Loading settings…</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="settings-backdrop interactive"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="settings-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-header">
          <h2 id="settings-title">Settings</h2>
          <button
            type="button"
            className="settings-close"
            onClick={closeWithoutSaving}
            aria-label="Close settings"
          >
            <LuX size={15} />
          </button>
        </header>

        <div className="settings-tabs">
          <PanelTabs tabs={TABS} value={tab} onChange={setTab} label="Settings sections" idPrefix="settings" />
        </div>

        <div className="settings-body">
          <div className="settings-tab-panel" role="tabpanel" id="settings-panel-companion" aria-labelledby="settings-tab-companion" hidden={tab !== "companion"}>
          <section className="settings-section settings-appearance">
            <h3 className="settings-section-title">Your companion</h3>
            <CompanionPicker
              value={draft.character}
              onChange={(character) => setDraft({ ...draft, character })}
            />
            <label className="settings-field">
              <span>Name</span>
              <input type="text" value={pref("pet_name")} maxLength={20} placeholder="Give it a name"
                onChange={e => set({ pet_name: e.target.value })} />
            </label>
            <PetSizeControl character={draft.character} value={draft.character_size}
              onChange={character_size => setDraft({ ...draft, character_size })} />
            <Segment label="How much it chats" value={pref("chattiness")} hint={CHAT_HINTS[pref("chattiness")]} onChange={chattiness => set({ chattiness })}
              options={[{ value: "quiet", label: "Quiet" }, { value: "normal", label: "Now and then" }, { value: "chatty", label: "Chatty" }]} />
          </section>

          <section className="settings-section settings-appearance">
            <h3 className="settings-section-title">Appearance</h3>
            <ThemePicker
              value={draft.theme}
              previewChanges
              onChange={(theme) => setDraft({ ...draft, theme })}
            />
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">Placement</h3>
            <label className="settings-field">
              <span>Screen position</span>
              <select
                value={draft.position}
                onChange={(e) => setDraft({ ...draft, position: e.target.value })}
              >
                {POSITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {monitorOptions.length > 1 && (
              <label className="settings-field">
                <span>Display</span>
                <select
                  value={draft.monitor_index}
                  onChange={(e) =>
                    setDraft({ ...draft, monitor_index: Number(e.target.value) })
                  }
                >
                  {monitorOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Toggle label="Sit on the window I’m using" hint="Hops up when you switch apps and there’s room. Drag it away and it stays until the next switch."
              checked={pref("sit_on_windows")} onChange={sit_on_windows => set({ sit_on_windows })} />
            <Toggle label="Unleash techniques on my windows" hint="Choose “Expand” from the menu and your pet opens its Do-Nothing Expansion inside the window in front. It never touches the window, skips calls, and follows Reduce Motion."
              checked={pref("throw_things")} onChange={throw_things => set({ throw_things })} />
            <p className="settings-hint">You can also drag your companion anywhere, even onto the top of a window.</p>
          </section>
          </div>

          <div className="settings-tab-panel" role="tabpanel" id="settings-panel-nudges" aria-labelledby="settings-tab-nudges" hidden={tab !== "nudges"}>
          <section className="settings-section">
            <h3 className="settings-section-title">Nudges</h3>
            <MinutesField
              label="Nudge me every"
              value={draft.reminder_interval_mins}
              min={1}
              max={240}
              onChange={(reminder_interval_mins) => setDraft({ ...draft, reminder_interval_mins })}
            />
            <Segment label="How nudges ask" value={pref("nudge_style")} hint={STYLE_HINTS[pref("nudge_style")]} onChange={nudge_style => set({ nudge_style })}
              options={[{ value: "gentle", label: "Gentle" }, { value: "balanced", label: "Balanced" }, { value: "firm", label: "Firm" }]} />
            <MinutesField
              label="When I say “later”, ask again in"
              value={draft.reminder_snooze_mins ?? 10}
              min={1}
              max={90}
              onChange={(reminder_snooze_mins) => setDraft({ ...draft, reminder_snooze_mins })}
            />
            <MinutesField
              label="Count it as a break after I step away for"
              value={draft.auto_idle_break_mins ?? 5}
              min={1}
              max={60}
              hint="No keyboard or mouse for this long. Calls and videos you’re watching don’t count as stepping away."
              onChange={(auto_idle_break_mins) => setDraft({ ...draft, auto_idle_break_mins })}
            />
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">Good timing</h3>
            <Toggle label="Stay quiet during calls" hint="Waits while your microphone or a camera is in use. nudge only sees that they’re on, never what they pick up."
              checked={pref("call_awareness")} onChange={call_awareness => set({ call_awareness })} />
            <MinutesField
              label="Check in after this much scrolling, video or games"
              value={pref("distraction_limit_mins")}
              min={10}
              max={240}
              hint="Added up over a rolling window, so a quick look elsewhere doesn’t start it over."
              onChange={distraction_limit_mins => set({ distraction_limit_mins })}
            />
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">During a pause</h3>
            <Toggle label="Soft sounds" checked={pref("sounds")} onChange={sounds => set({ sounds })} />
            <Toggle label="Read steps aloud" hint="So you can look away from the screen." checked={pref("spoken_breaks")} onChange={spoken_breaks => set({ spoken_breaks })} />
          </section>
          </div>

          <div className="settings-tab-panel" role="tabpanel" id="settings-panel-day" aria-labelledby="settings-tab-day" hidden={tab !== "day"}>
          <section className="settings-section">
            <h3 className="settings-section-title">Little rhythms</h3>
            <p className="settings-hint">A single line at a quiet moment. They skip themselves when a nudge is close.</p>
            <Toggle label="Rest my eyes, every 20 min" checked={pref("rhythm_eyes")} onChange={rhythm_eyes => set({ rhythm_eyes })} />
            <Toggle label="Reset my posture, every 40 min" checked={pref("rhythm_posture")} onChange={rhythm_posture => set({ rhythm_posture })} />
            <Toggle label="Drink some water, every 60 min" checked={pref("rhythm_water")} onChange={rhythm_water => set({ rhythm_water })} />
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">Active hours</h3>
            <Toggle label="Only nudge during certain hours" checked={pref("active_hours_enabled")} onChange={active_hours_enabled => set({ active_hours_enabled })} />
            {pref("active_hours_enabled") && <>
              <div className="settings-times">
                <TimeField label="From" value={pref("active_start")} onChange={active_start => set({ active_start })} />
                <TimeField label="To" value={pref("active_end")} onChange={active_end => set({ active_end })} />
              </div>
              <Toggle label="On weekends too" checked={pref("active_weekends")} onChange={active_weekends => set({ active_weekends })} />
            </>}
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">Wind-down</h3>
            <Toggle label="Get sleepy before bedtime" hint="Your companion starts yawning 45 minutes before, then offers to wrap up the day."
              checked={pref("wind_down_enabled")} onChange={wind_down_enabled => set({ wind_down_enabled })} />
            {pref("wind_down_enabled") && <TimeField label="Bedtime" value={pref("bedtime")} onChange={bedtime => set({ bedtime })} />}
          </section>
          </div>

          <div className="settings-tab-panel" role="tabpanel" id="settings-panel-apps" aria-labelledby="settings-tab-apps" hidden={tab !== "apps"}>
          <section className="settings-section">
            <h3 className="settings-section-title">Tabs and documents</h3>
            <Toggle label="Notice which tab I’m on" hint="Reads the title of the window in front, in any browser or app, so a lecture isn’t mistaken for a distraction. Never the page or its address, and titles aren’t saved. Password managers, private apps and windows marked private are skipped."
              checked={pref("window_titles")} onChange={window_titles => set({ window_titles })} />
            {pref("window_titles") && <>
              <WindowAccess />
              <SiteRules rules={pref("site_rules")} onChange={site_rules => set({ site_rules })} />
              <p className="settings-hint">Not every browser marks private windows. Add a rule with Private for anything you’d rather it never noticed.</p>
            </>}
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">App categories</h3>
            <p className="settings-hint">
              Your companion reacts to what kind of app you’re using. Fix any that
              look wrong; your choices are kept. Time in a private app still
              counts toward your next pause, but is never recorded.
            </p>
            <label className="settings-field settings-toggle">
              <span>Hide helper apps and background processes</span>
              <input
                type="checkbox"
                role="switch"
                checked={draft.hide_helper_apps ?? false}
                onChange={(e) => setDraft({ ...draft, hide_helper_apps: e.target.checked })}
              />
              <span className="settings-toggle-slider" />
            </label>
            {sortedApps.length > 0 && (
              <label className="settings-app-search">
                <LuSearch size={14} aria-hidden />
                <input
                  type="search"
                  value={appSearch}
                  onChange={(e) => setAppSearch(e.target.value)}
                  placeholder="Search apps"
                  aria-label="Search apps"
                />
              </label>
            )}
            {sortedApps.length === 0 ? (
              <p className="settings-hint">No other apps detected yet.</p>
            ) : filteredApps.length === 0 ? (
              <p className="settings-hint">{appSearch ? "No apps match your search." : "No visible apps. Turn off the helper filter to see all processes."}</p>
            ) : (
              <ul className="settings-app-list">
                {filteredApps.map(([bundleId, entry]) => (
                  <li key={bundleId} className="settings-app-row">
                    <span className="settings-app-name" title={bundleId}>
                      {entry.name}
                    </span>
                    <select
                      className="settings-app-category"
                      value={entry.category}
                      onChange={(e) => setAppCategory(bundleId, e.target.value)}
                      aria-label={`Category for ${entry.name}`}
                    >
                      {categoryOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </section>
          </div>

          <div className="settings-tab-panel" role="tabpanel" id="settings-panel-general" aria-labelledby="settings-tab-general" hidden={tab !== "general"}>
          <section className="settings-section">
            <h3 className="settings-section-title">General</h3>
            <div className="settings-field">
              <span id="shortcut-label">Show or hide companion</span>
              <button
                type="button"
                className={`settings-shortcut ${recordingShortcut ? "recording" : ""}`}
                onClick={() => {
                  if (!recordingShortcut) {
                    setRecordingShortcut(true);
                  }
                }}
                onBlur={stopRecordingShortcut}
                aria-labelledby="shortcut-label"
                aria-describedby="shortcut-hint"
                aria-pressed={recordingShortcut}
              >
                {recordingShortcut
                  ? "Press a new shortcut…"
                  : formatShortcut(draft.pause_shortcut)}
              </button>
              <p className="settings-hint" id="shortcut-hint">
                {recordingShortcut
                  ? "Use a key with ⌘, ⌥, ⌃ or ⇧. Press Esc to keep the current one."
                  : "Click to change. Tracking and reminders keep running while it’s hidden."}
              </p>
            </div>

            <label className="settings-field settings-toggle">
              <span>Open nudge at login</span>
              <input
                type="checkbox"
                role="switch"
                checked={draft.launch_at_login ?? false}
                onChange={(e) =>
                  setDraft({ ...draft, launch_at_login: e.target.checked })
                }
              />
              <span className="settings-toggle-slider" />
            </label>
            <Toggle label="Show time to next nudge in the menu bar" checked={pref("menu_bar_timer")} onChange={menu_bar_timer => set({ menu_bar_timer })} />
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">What nudge knows</h3>
            <ul className="settings-knows">
              <li>Which app is in front, and its category</li>
              {pref("window_titles") && <li>The title of the window in front, while it’s in front</li>}
              <li>How long since you typed, clicked or scrolled, never what</li>
              <li>Whether a mic or camera is on, and which apps are playing sound</li>
              <li>Window outlines, so your companion can sit on them</li>
              <li>What you tell it: focus sessions, notes, moods, things to stay mad at</li>
            </ul>
            <p className="settings-hint">All of it stays on this Mac. nudge takes no screenshots, reads no content, and has no account or server.</p>
            <label className="settings-field">
              <span>Keep daily summaries for</span>
              <select value={pref("history_days")} onChange={e => set({ history_days: Number(e.target.value) })}>
                {[...new Set([7, 31, 90, 366, pref("history_days")])].sort((a, b) => a - b).map(days =>
                  <option key={days} value={days}>{days === 366 ? "1 year" : `${days} days`}</option>)}
              </select>
            </label>
            {onErase && <>
              <button type="button" className={`settings-danger${erase === "confirm" ? " confirm" : ""}`} disabled={erase === "erasing" || erase === "done"}
                onClick={() => void handleErase()} onBlur={() => { if (erase === "confirm") setErase("idle"); }}>
                {erase === "confirm" ? "Erase it all for good?" : erase === "erasing" ? "Erasing…" : erase === "done" ? "Erased" : "Erase my history"}
              </button>
              <p className="settings-hint" role={erase === "failed" ? "alert" : undefined}>
                {erase === "failed" ? "Couldn’t erase everything. Please try again." : "Removes activity, focus sessions and moods. Your garden, notes and settings stay."}
              </p>
            </>}
          </section>
          </div>
        </div>

        <footer className="settings-footer">
          {saveError && (
            <p className="settings-error" role="alert">
              {saveError}
            </p>
          )}
          <button
            type="button"
            className="settings-btn secondary"
            onClick={closeWithoutSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="settings-btn primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}

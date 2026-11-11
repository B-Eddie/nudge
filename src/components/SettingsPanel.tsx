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
import { LuSearch, LuX } from "react-icons/lu";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
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

        <div className="settings-body">
          <section className="settings-section settings-appearance">
            <h3 className="settings-section-title">Your companion</h3>
            <CompanionPicker
              value={draft.character}
              onChange={(character) => setDraft({ ...draft, character })}
            />
            <PetSizeControl character={draft.character} value={draft.character_size}
              onChange={character_size => setDraft({ ...draft, character_size })} />
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
            <h3 className="settings-section-title">Reminders</h3>
            <MinutesField
              label="Nudge me every"
              value={draft.reminder_interval_mins}
              min={1}
              max={240}
              onChange={(reminder_interval_mins) => setDraft({ ...draft, reminder_interval_mins })}
            />
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
              hint="No keyboard or mouse for this long. Music and video don’t count as stepping away."
              onChange={(auto_idle_break_mins) => setDraft({ ...draft, auto_idle_break_mins })}
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
            <p className="settings-hint">You can also drag your companion anywhere, even onto the top of a window.</p>
          </section>

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
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">App categories</h3>
            <p className="settings-hint">
              Your companion reacts to what kind of app you’re using. Fix any that
              look wrong; your choices are kept.
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

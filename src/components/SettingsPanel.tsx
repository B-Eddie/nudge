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
  const [pendingShortcut, setPendingShortcut] = useState<string | null>(null);
  const initialThemeRef = useRef<ThemeId>("bamboo");
  const themeLoadedRef = useRef(false);
  const pendingShortcutRef = useRef<string | null>(null);
  pendingShortcutRef.current = pendingShortcut;

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

  // capture key presses - escape closesing settings shortcut
  useEffect(() => {
    if (!recordingShortcut) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === "Escape") {
        const pending = pendingShortcutRef.current;
        if (pending) {
          setDraft((prev) =>
            prev ? { ...prev, pause_shortcut: pending } : prev,
          );
        }
        setRecordingShortcut(false);
        setPendingShortcut(null);
        return;
      }

      const shortcut = shortcutFromKeyboardEvent(e);
      if (shortcut) setPendingShortcut(shortcut);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingShortcut]);

  // reset variables at start
  const stopRecordingShortcut = useCallback(() => {
    setRecordingShortcut(false);
    setPendingShortcut(null);
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

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeWithoutSaving();
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
            <p className="settings-hint">
              Pick who keeps you company. Each one has its own work, rest, and
              energy animations.
            </p>
            <CompanionPicker
              value={draft.character}
              onChange={(character) => setDraft({ ...draft, character })}
            />
            <PetSizeControl character={draft.character} value={draft.character_size}
              onChange={character_size => setDraft({ ...draft, character_size })} />
          </section>

          <section className="settings-section settings-appearance">
            <h3 className="settings-section-title">Appearance</h3>
            <p className="settings-hint">
              Soft paper for daytime or a quiet forest after dark.
            </p>
            <ThemePicker
              value={draft.theme}
              previewChanges
              onChange={(theme) => setDraft({ ...draft, theme })}
            />
          </section>

          <label className="settings-field">
            <span>Monitor</span>
            <select
              value={draft.monitor_index}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  monitor_index: parseInt(e.target.value, 10),
                })
              }
            >
              {monitorOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span>Reminder interval (minutes)</span>
            <input
              type="number"
              min={1}
              value={draft.reminder_interval_mins}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  reminder_interval_mins: Math.max(
                    1,
                    parseInt(e.target.value, 10) || 1,
                  ),
                })
              }
            />
          </label>

          <label className="settings-field">
            <span>Remind me again after (minutes)</span>
            <input
              type="number"
              min={1}
              max={90}
              step={1}
              value={draft.reminder_snooze_mins ?? 10}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  reminder_snooze_mins: Math.min(
                    90,
                    Math.max(1, parseInt(e.target.value, 10) || 1),
                  ),
                })
              }
            />
            <span className="settings-hint">
              Used when you ask Nudge to check back later.
            </span>
          </label>

          <label className="settings-field">
            <span>Start a break after you step away</span>
            <input
              type="number"
              min={1}
              step={1}
              value={draft.auto_idle_break_mins ?? 5}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  auto_idle_break_mins: Math.max(
                    1,
                    parseInt(e.target.value, 10) || 1,
                  ),
                })
              }
              aria-label="Minutes without keyboard or mouse input before an automatic break"
            />
            <span className="settings-hint">
              Minutes without keyboard or mouse input. Nudge waits while music
              or video is playing.
            </span>
          </label>

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

          <div className="settings-field">
            <span>Hide character shortcut</span>
            <button
              type="button"
              className={`settings-shortcut ${recordingShortcut ? "recording" : ""}`}
              onClick={() => {
                if (!recordingShortcut) {
                  setPendingShortcut(null);
                  setRecordingShortcut(true);
                }
              }}
              onBlur={stopRecordingShortcut}
              aria-label="Hide character shortcut"
            >
              {recordingShortcut
                ? pendingShortcut
                  ? formatShortcut(pendingShortcut)
                  : "Hold a key combo…"
                : formatShortcut(draft.pause_shortcut)}
            </button>
            <p className="settings-hint">
              {recordingShortcut
                ? "Hold your new combo, then press Esc to keep it."
                : "Hides only the character; tracking and reminders keep running. Press it again to show the character. Click the box, hold a combo, then press Esc to rebind."}
            </p>
          </div>

          <label className="settings-field settings-toggle">
            <span>Launch at login</span>
            <input
              type="checkbox"
              checked={draft.launch_at_login ?? false}
              onChange={(e) =>
                setDraft({ ...draft, launch_at_login: e.target.checked })
              }
              aria-label="Launch at login"
            />
            <span className="settings-toggle-slider" />
          </label>

          <section className="settings-section">
            <h3 className="settings-section-title">App categories</h3>
            <p className="settings-hint">
              Installed apps are refreshed on every launch and when you open
              Settings. Deleted apps are removed; your category choices are kept.
            </p>
            <button type="button" className="settings-helper-toggle"
              aria-pressed={draft.hide_helper_apps ?? false}
              onClick={() => setDraft({ ...draft, hide_helper_apps: !draft.hide_helper_apps })}>
              {draft.hide_helper_apps ? "✓ " : ""}Hide helper apps & processes
            </button>
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

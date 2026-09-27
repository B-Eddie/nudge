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
import "./SettingsPanel.css";
import { LuSearch, LuX } from "react-icons/lu";

interface SettingsPanelProps {
  onClose: () => void;
  onClearActivity: () => Promise<void>;
  trackingPaused: boolean;
  onToggleTracking: () => void;
}

export function SettingsPanel({ onClose, onClearActivity, trackingPaused, onToggleTracking }: SettingsPanelProps) {
  const [draft, setDraft] = useState<Settings | null>(null);
  const [monitorOptions, setMonitorOptions] = useState<MonitorOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [appSearch, setAppSearch] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [pendingShortcut, setPendingShortcut] = useState<string | null>(null);
  const pendingShortcutRef = useRef<string | null>(null);
  pendingShortcutRef.current = pendingShortcut;

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || recordingShortcut || clearing) return;
      e.preventDefault();
      if (confirmClear) setConfirmClear(false);
      else onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recordingShortcut, clearing, confirmClear, onClose]);

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
    return Object.entries(draft.app_categories).sort(([, a], [, b]) =>
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
    if (!query) return sortedApps;
    return sortedApps.filter(([bundleId, entry]) => {
      const categoryLabel =
        categoryLabelByValue.get(entry.category) ?? entry.category;
      return (
        entry.name.toLowerCase().includes(query) ||
        bundleId.toLowerCase().includes(query) ||
        categoryLabel.toLowerCase().includes(query)
      );
    });
  }, [sortedApps, appSearch, categoryLabelByValue]);

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
    if (!draft || confirmClear || clearing) return;
    setSaving(true); // change button states
    setSaveError(null);

    try {
      await invoke("save_settings", { settings: draft });
      onClose();
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSaveError("Couldn't save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [draft, onClose, confirmClear, clearing]);

  const handleClear = useCallback(async () => {
    if (clearing) return;
    setClearing(true);
    setSaveError(null);
    try {
      await onClearActivity();
      setConfirmClear(false);
    } catch (err) {
      console.error("Failed to clear activity:", err);
      setSaveError("Couldn't clear activity. Please try again.");
    } finally {
      setClearing(false);
    }
  }, [onClearActivity, clearing]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !confirmClear && !clearing) onClose();
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
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
        >
          <header className="settings-header">
            <h2 id="settings-title">Settings</h2>
            <button
              type="button"
              className="settings-close"
              onClick={() => { if (!confirmClear && !clearing) onClose(); }}
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-header">
          <h2 id="settings-title">Settings</h2>
          <button
            type="button"
            className="settings-close"
            onClick={() => { if (!confirmClear && !clearing) onClose(); }}
            aria-label="Close settings"
          >
            <LuX size={15} />
          </button>
        </header>

        <div className="settings-body">
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
              max={240}
              value={draft.reminder_interval_mins}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  reminder_interval_mins: Math.max(
                    1,
                    Math.min(240, parseInt(e.target.value, 10) || 1),
                  ),
                })
              }
            />
          </label>

          <label className="settings-field">
            <span>Reminder tone</span>
            <select
              value={draft.reminder_tone ?? "playful"}
              onChange={(e) => setDraft({ ...draft, reminder_tone: e.target.value as NonNullable<Settings["reminder_tone"]> })}
            >
              <option value="playful">Playful</option>
              <option value="gentle">Gentle</option>
              <option value="direct">Direct</option>
            </select>
          </label>
          <label className="settings-field settings-toggle">
            <span>Only speak for reminders</span>
            <input
              type="checkbox"
              checked={draft.quiet_ambient_phrases ?? false}
              onChange={(e) => setDraft({ ...draft, quiet_ambient_phrases: e.target.checked })}
            />
            <span className="settings-toggle-slider" />
          </label>
          <p className="settings-hint">Turns off idle chatter. Timed reminders and your own notes still appear.</p>

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
            <h3 className="settings-section-title">Your data</h3>
            <p className="settings-hint">Nudge reads the frontmost app name and category to count time by category, plus breaks. It keeps a local list of discovered app names for category settings. Stats and settings stay in files on this Mac; no account or sync. Hiding the pet does not stop tracking. Pause tracking here or quit nudge to stop. To erase history, use the clear button below; this does not delete your settings.</p>
            <button type="button" className="settings-btn secondary" onClick={onToggleTracking} disabled={clearing || confirmClear}>
              {trackingPaused ? "Resume tracking" : "Pause tracking"}
            </button>
            <p className="settings-hint" role="status">{trackingPaused ? "Tracking paused. No activity or break time is being counted." : "Tracking is on."}</p>
            <button type="button" className="settings-btn secondary" onClick={() => setConfirmClear(true)}>
              Clear activity history
            </button>
            {confirmClear && (
              <div role="alertdialog" aria-modal="true" aria-label="Confirm clearing activity history" className="settings-clear-confirm">
                <p>Delete all saved activity history on this Mac? This can't be undone. Tracking restarts from zero.</p>
                <button type="button" className="settings-btn secondary" onClick={() => setConfirmClear(false)}>Keep history</button>
                <button type="button" className="settings-btn danger" disabled={clearing} onClick={() => void handleClear()}>{clearing ? "Clearing…" : "Delete history"}</button>
              </div>
            )}
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">App categories</h3>
            <p className="settings-hint">
              Categories are read from each app&apos;s Info.plist when nudge
              starts.
            </p>
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
              <p className="settings-hint">No apps match your search.</p>
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
            onClick={() => { if (!confirmClear && !clearing) onClose(); }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="settings-btn primary"
            onClick={() => void handleSave()}
            disabled={saving || clearing || confirmClear}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}

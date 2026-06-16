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
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [draft, setDraft] = useState<Settings | null>(null);
  const [monitorOptions, setMonitorOptions] = useState<MonitorOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [appSearch, setAppSearch] = useState("");
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

  // reset variables at start
  const stopRecordingShortcut = useCallback(() => {
    setRecordingShortcut(false);
    setPendingShortcut(null);
  }, []);

  // set setting options
  useEffect(() => {
    void Promise.all([
      invoke<Settings>("get_settings"),
      fetchMonitorOptions(),
      fetchAppCategoryOptions(),
    ]).then(([settings, monitors, categories]) => {
      setDraft(settings);
      setMonitorOptions(monitors);
      setCategoryOptions(categories);
    });
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
    if (!draft) return;
    setSaving(true); // change button states

    try {
      await invoke("save_settings", { settings: draft });
      onClose();
    } finally {
      setSaving(false);
    }
  }, [draft, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!draft) return null;

  return (
    <div
      className="settings-backdrop interactive"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="settings-panel"
        role="dialog"
        aria-labelledby="settings-title"
      >
        <header className="settings-header">
          <h2 id="settings-title">Settings</h2>
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
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
            <span>Pause tracking shortcut</span>
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
              aria-label="Pause tracking shortcut"
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
                : "Hides nudge and makes it click-through, but keeps tracking your activity; press it again to come back. Click the box, hold a combo, then press Esc to rebind."}
            </p>
          </div>

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
          <button
            type="button"
            className="settings-btn secondary"
            onClick={onClose}
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

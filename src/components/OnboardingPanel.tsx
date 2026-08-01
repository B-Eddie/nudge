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
import "./OnboardingPanel.css";

interface OnboardingPanelProps {
  onComplete: () => void;
}

const STEPS = [
  "welcome",
  "position",
  "shortcut",
  "reminder",
  "categories",
  "done",
] as const;

export function OnboardingPanel({ onComplete }: OnboardingPanelProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [monitorOptions, setMonitorOptions] = useState<MonitorOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [recordingShortcut, setRecordingShortcut] = useState(false);
  const [pendingShortcut, setPendingShortcut] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pendingShortcutRef = useRef<string | null>(null);
  pendingShortcutRef.current = pendingShortcut;

  useEffect(() => {
    let cancelled = false;
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
      .catch((err) => console.error("Failed to load onboarding data:", err));
    return () => {
      cancelled = true;
    };
  }, []);

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

  const sortedApps = useMemo(() => {
    if (!draft) return [];
    return Object.entries(draft.app_categories).sort(([, a], [, b]) =>
      a.name.localeCompare(b.name),
    );
  }, [draft]);

  const setAppCategory = useCallback((bundleId: string, category: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const entry = prev.app_categories[bundleId];
      if (!entry) return prev;
      return {
        ...prev,
        app_categories: {
          ...prev.app_categories,
          [bundleId]: { ...entry, category, user_override: true },
        },
      };
    });
  }, []);

  const finish = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      await invoke("save_settings", {
        settings: { ...draft, onboarding_complete: true },
      });
      onComplete();
    } catch (err) {
      console.error("Failed to save onboarding settings:", err);
      setSaveError("Couldn't save your setup. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [draft, onComplete]);

  const next = useCallback(() => {
    if (step >= STEPS.length - 1) {
      void finish();
      return;
    }
    setStep((s) => s + 1);
  }, [step, finish]);

  const back = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  if (!draft) return null;

  const stepId = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="onboarding-backdrop interactive" role="presentation">
      <div className="onboarding-panel" role="dialog" aria-labelledby="onboarding-title">
        <header className="onboarding-header">
          <div>
            <h2 id="onboarding-title">Welcome to nudge</h2>
            <p className="onboarding-progress">
              Step {step + 1} of {STEPS.length}
            </p>
          </div>
        </header>

        <div className="onboarding-body">
          {stepId === "welcome" && (
            <>
              <p className="onboarding-lead">
                Your little companion sits on screen, tracks how you spend time,
                and nudges you to take breaks.
              </p>
              <p className="onboarding-hint">
                Let&apos;s set up a few basics: position, shortcuts, and app
                categories. You can change these anytime in Settings.
              </p>
            </>
          )}

          {stepId === "position" && (
            <>
              <p className="onboarding-hint">
                Where should your character live on screen?
              </p>
              <label className="onboarding-field">
                <span>Screen position</span>
                <select
                  value={draft.position}
                  onChange={(e) =>
                    setDraft({ ...draft, position: e.target.value })
                  }
                >
                  {POSITION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="onboarding-field">
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
            </>
          )}

          {stepId === "shortcut" && (
            <>
              <p className="onboarding-hint">
                Pick a global shortcut to hide the character while nudge keeps
                tracking your activity. Press it again to bring the character
                back.
              </p>
              <div className="onboarding-field">
                <span>Hide character shortcut</span>
                <button
                  type="button"
                  className={`onboarding-shortcut ${recordingShortcut ? "recording" : ""}`}
                  onClick={() => {
                    if (!recordingShortcut) {
                      setPendingShortcut(null);
                      setRecordingShortcut(true);
                    }
                  }}
                  onBlur={() => {
                    setRecordingShortcut(false);
                    setPendingShortcut(null);
                  }}
                >
                  {recordingShortcut
                    ? pendingShortcut
                      ? formatShortcut(pendingShortcut)
                      : "Hold a key combo…"
                    : formatShortcut(draft.pause_shortcut)}
                </button>
                <p className="onboarding-subhint">
                  {recordingShortcut
                    ? "Hold your combo, then press Esc to keep it."
                    : "Click the box, hold a combo, then press Esc."}
                </p>
              </div>
            </>
          )}

          {stepId === "reminder" && (
            <>
              <p className="onboarding-hint">
                How often should nudge remind you to take a break? Your
                character&apos;s energy drains over time between reminders.
              </p>
              <label className="onboarding-field">
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
            </>
          )}

          {stepId === "categories" && (
            <>
              <p className="onboarding-hint">
                Nudge reads each app&apos;s category to pick animations and
                phrases. Adjust any that look wrong. You can fine-tune more
                apps later in Settings.
              </p>
              {sortedApps.length === 0 ? (
                <p className="onboarding-subhint">No other apps detected yet.</p>
              ) : (
                <ul className="onboarding-app-list">
                  {sortedApps.slice(0, 8).map(([bundleId, entry]) => (
                    <li key={bundleId} className="onboarding-app-row">
                      <span className="onboarding-app-name">{entry.name}</span>
                      <select
                        value={entry.category}
                        onChange={(e) =>
                          setAppCategory(bundleId, e.target.value)
                        }
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
              {sortedApps.length > 8 && (
                <p className="onboarding-subhint">
                  +{sortedApps.length - 8} more apps in Settings
                </p>
              )}
            </>
          )}

          {stepId === "done" && (
            <>
              <p className="onboarding-lead">You&apos;re all set!</p>
              <p className="onboarding-hint">
                Click your character to open the menu — take breaks, view
                activity, add reminder notes, or open Settings.
              </p>
            </>
          )}
        </div>

        <footer className="onboarding-footer">
          {saveError && (
            <p className="onboarding-error" role="alert">
              {saveError}
            </p>
          )}
          {step > 0 && !isLast && (
            <button
              type="button"
              className="onboarding-btn secondary"
              onClick={back}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="onboarding-btn primary"
            onClick={next}
            disabled={saving}
          >
            {isLast ? (saving ? "Starting…" : "Get started") : "Continue"}
          </button>
        </footer>
      </div>
    </div>
  );
}

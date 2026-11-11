import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { PiArrowRightBold, PiCheckBold } from "react-icons/pi";
import { useDialogFocus } from "../hooks/useDialogFocus";
import type { Settings } from "../types/settings";
import { CompanionPicker, ThemePicker } from "./AppearancePicker";
import { MinutesField } from "./MinutesField";
import { PixelPetSprite } from "./PixelPetSprite";
import "./OnboardingPanel.css";

interface OnboardingPanelProps {
  onComplete: () => void;
}

// Short on purpose: everything else has a good default and lives in Settings.
const STEPS = ["welcome", "companion", "appearance", "reminder", "done"] as const;

export function OnboardingPanel({ onComplete }: OnboardingPanelProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const panelRef = useDialogFocus<HTMLDivElement>(undefined);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    void invoke<Settings>("get_settings")
      .then((settings) => {
        if (cancelled) return;
        setDraft(settings);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load onboarding data:", err);
        setLoadError("Couldn't load your setup. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const draftLoaded = draft !== null;
  useEffect(() => {
    if (draftLoaded) titleRef.current?.focus({ preventScroll: true });
  }, [step, draftLoaded]);

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

  if (!draft) {
    return (
      <div className="onboarding-backdrop interactive" role="presentation">
        <div ref={panelRef} className="onboarding-panel" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" tabIndex={-1}>
          <header className="onboarding-header">
            <p className="onboarding-eyebrow">A little company</p>
            <h2 id="onboarding-title">Welcome to Nudge</h2>
          </header>
          <div className="onboarding-body">
            {loadError ? (
              <p className="onboarding-error" role="alert">{loadError}</p>
            ) : (
              <p className="onboarding-hint" role="status">Getting your setup ready…</p>
            )}
          </div>
          {loadError && (
            <footer className="onboarding-footer">
              <button type="button" className="onboarding-btn primary" onClick={() => setLoadAttempt(attempt => attempt + 1)}>Try again</button>
            </footer>
          )}
        </div>
      </div>
    );
  }

  const stepId = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="onboarding-backdrop interactive" role="presentation">
      <div ref={panelRef} className="onboarding-panel" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" tabIndex={-1}>
        <header className="onboarding-header">
          <div>
            <div className="onboarding-heading-meta">
              <p className="onboarding-eyebrow">Make yourself at home</p>
              <p className="onboarding-progress">{step + 1} / {STEPS.length}</p>
            </div>
            <h2 ref={titleRef} id="onboarding-title" tabIndex={-1}>
              {stepId === "welcome"
                ? "Welcome to Nudge"
                : stepId === "companion"
                  ? "Choose a companion"
                  : stepId === "appearance"
                    ? "Pick a look"
                    : stepId === "reminder"
                      ? "Find your rhythm"
                      : "Say hello"}
            </h2>
            <div className="onboarding-progress-track" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of ${STEPS.length}`}>
              {STEPS.map((id, index) => <span key={id} className={index <= step ? "complete" : undefined} />)}
            </div>
          </div>
        </header>

        <div className="onboarding-body">
          {stepId === "welcome" && (
            <>
              <div className="onboarding-companion-scene" aria-hidden="true">
                <PixelPetSprite character={draft.character ?? "crab"} pose="happy" displaySize={90} />
                <span>A little company. A better workday.</span>
              </div>
              <p className="onboarding-lead">
                A small companion that lives on your desktop, gets tired as
                your work stretch grows, and nudges you to take a breather.
              </p>
              <p className="onboarding-hint" data-testid="onboarding-privacy">
                To adapt to your work, nudge notices which app is in front and
                how long since you last used the keyboard or mouse. It never
                records what you type or take screenshots, and everything
                stays on this Mac.
              </p>
            </>
          )}

          {stepId === "companion" && (
            <>
              <p className="onboarding-hint">
                Each one codes, reads, listens to music and naps in its own way.
                You can switch any time.
              </p>
              <CompanionPicker
                value={draft.character}
                onChange={(character) => setDraft({ ...draft, character })}
              />
            </>
          )}

          {stepId === "appearance" && (
            <>
              <p className="onboarding-hint">
                For your companion’s menus and panels.
              </p>
              <ThemePicker
                value={draft.theme}
                previewChanges
                onChange={(theme) => setDraft({ ...draft, theme })}
              />
            </>
          )}

          {stepId === "reminder" && (
            <>
              <p className="onboarding-hint">
                Nudges wait for a natural moment, never in the middle of a call
                or a video.
              </p>
              <MinutesField
                className="onboarding-field"
                hintClassName="onboarding-subhint"
                label="Nudge me every"
                value={draft.reminder_interval_mins}
                min={1}
                max={240}
                onChange={(reminder_interval_mins) => setDraft({ ...draft, reminder_interval_mins })}
              />
              <MinutesField
                className="onboarding-field"
                hintClassName="onboarding-subhint"
                label="Count it as a break after I step away for"
                value={draft.auto_idle_break_mins ?? 5}
                min={1}
                max={60}
                onChange={(auto_idle_break_mins) => setDraft({ ...draft, auto_idle_break_mins })}
              />
            </>
          )}

          {stepId === "done" && (
            <>
              <div className="onboarding-companion-scene" aria-hidden="true">
                <PixelPetSprite character={draft.character ?? "crab"} pose="delighted" displaySize={90} />
                <span>Your companion is ready.</span>
              </div>
              <ul className="onboarding-tips">
                <li><strong>Click</strong> your companion for breaks, notes, your day and Settings.</li>
                <li><strong>Drag</strong> it anywhere, even onto the top of a window.</li>
                <li>It also lives in your <strong>menu bar</strong>, where you can quiet it for an hour or quit.</li>
              </ul>
            </>
          )}
        </div>

        <footer className="onboarding-footer">
          {saveError && (
            <p className="onboarding-error" role="alert">
              {saveError}
            </p>
          )}
          {step === 0 && (
            <button
              type="button"
              className="onboarding-btn secondary"
              onClick={() => void finish()}
              disabled={saving}
            >
              Skip setup
            </button>
          )}
          {step > 0 && (
            <button
              type="button"
              className="onboarding-btn secondary"
              onClick={back}
              disabled={saving}
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
            {isLast ? <PiCheckBold size={14} aria-hidden="true" /> : <PiArrowRightBold size={14} aria-hidden="true" />}
          </button>
        </footer>
      </div>
    </div>
  );
}

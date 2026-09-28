import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { SettingsPanel } from "./components/SettingsPanel";
import { OnboardingPanel } from "./components/OnboardingPanel";
import {
  SummaryPanel,
  emptySessionStats,
  dayKey,
  dayRecordFromStats,
  formatDuration,
  type DayRecord,
  type SessionStats,
} from "./components/SummaryPanel";
import "./App.css";
import { useCharacterInteraction } from "./hooks/useCharacterInteraction";
import { useCharacterFrame } from "./hooks/useCharacterFrame";
import { useSettingsShortcut } from "./hooks/useSettingsShortcut";
import { usePauseTrackingShortcut } from "./hooks/usePauseTrackingShortcut";
import type { Settings } from "./types/settings";
import { RadialMenu } from "./components/RadialMenu";
import { ReminderNotePanel } from "./components/ReminderNotePanel";
import { FocusPanel } from "./components/FocusPanel";
import { Toasts, type ToastData } from "./components/Toast";
import {
  loadPetProfile,
  savePetProfile,
  grantXp,
  levelForXp,
  XP_QUEST_DONE,
  XP_FULL_BREAK,
  XP_FOCUS_25,
  XP_FOCUS_50,
  type PetProfile,
} from "./growth/pet";
import { breakStreak } from "./growth/streaks";
import { questForBreak } from "./growth/quests";
import {
  checkAchievements,
  loadUnlockedAchievements,
} from "./growth/achievements";
import {
  getCharacter,
  DEFAULT_CHARACTER_ID,
  type CharacterId,
} from "./assets/characters/manifest";
import {
  pickPhrase,
  pickDistractionNudge,
  isDistractingCategory,
  DISTRACTION_LIMIT_SECS,
  DISTRACTION_NUDGE_REPEAT_SECS,
} from "./types/phrases";
import { LuX } from "react-icons/lu";

const OVERLAY_SUPPRESS_CLASS = "overlay-suppressed";

interface FrontmostApp {
  name: string;
  bundle_id: string | null;
  category: string;
  category_label: string;
}

interface ActivityState {
  timePassed: number;
  timeEvents: number;
  stats: SessionStats;
  paused: boolean;
  history: DayRecord[];
}

interface AutoBreakStatus {
  idle_seconds: number;
  idle_threshold_seconds: number;
  should_auto_break: boolean;
  defer_auto_break: boolean;
  defer_reason: string | null;
}

function archiveDay(history: DayRecord[], stats: SessionStats): DayRecord[] {
  const record = dayRecordFromStats(stats);
  const next = history.filter((rec) => rec.date !== record.date);
  // only keep days that had activity
  if (
    Object.keys(record.categorySeconds).length > 0 ||
    record.restSeconds > 0
  ) {
    next.push(record);
  }
  next.sort((a, b) => a.date.localeCompare(b.date));
  return next.slice(-31); // keep a month of activity
}

const ENERGY_CELLS = 5;

// Energy bars (1..ENERGY_CELLS) for a tier. Tier 1 = full energy
function energyFromTier(tier: number): number {
  const clamped = Math.min(ENERGY_CELLS, Math.max(1, Math.abs(tier)));
  return ENERGY_CELLS + 1 - clamped;
}

// Live energy bars while resting
function breakEnergy(startTier: number, progress: number): number {
  const startEnergy = energyFromTier(startTier);
  const p = Math.min(1, Math.max(0, progress));
  return Math.round(startEnergy + p * (ENERGY_CELLS - startEnergy));
}

// Tier corresponding to break progress, for persisting once the break ends. Mirrors breakEnergy
function tierFromBreakProgress(startTier: number, progress: number): number {
  return ENERGY_CELLS + 1 - breakEnergy(startTier, progress);
}

// Tier (1 = full energy) from continuous work time and reminder interval
function tierFromWorkSeconds(
  workSeconds: number,
  intervalMins: number,
): number {
  const intervalSecs = intervalMins * 60;
  if (intervalSecs <= 0) return 1;
  return Math.min(5, 1 + Math.floor(workSeconds / intervalSecs));
}

// "24:59" style countdown for the focus pill
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [overlaySuppressed, setOverlaySuppressed] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [timeEvents, setTimeEvents] = useState(1); // negative time event means sleeping; 0 means reminder animation (megaphone)
  const [frontmostApp, setFrontmostApp] = useState<FrontmostApp | null>(null);
  const [timePassed, setTimePassed] = useState<number>(0); // in seconds
  const [message, setMessage] = useState("");
  const [characterId, setCharacterId] =
    useState<CharacterId>(DEFAULT_CHARACTER_ID);
  const character = getCharacter(characterId);

  // Per-character theme: swap the accent triad via [data-character-theme]
  // (design/DESIGN-SYSTEM.md — token swap, never component swap).
  useEffect(() => {
    document.documentElement.setAttribute("data-character-theme", characterId);
  }, [characterId]);
  const [displayedMessage, setDisplayedMessage] = useState("");
  const [reminderNotePinned, setReminderNotePinned] = useState(false);
  const label = frontmostApp?.category_label;
  const [position, setPosition] = useState("");
  const [breakTime, setBreakTime] = useState(0);
  const [breakNeeded, setbreakNeeded] = useState(0);
  // Energy tier (1 = full energy) captured when the current break began
  const [breakStartTier, setBreakStartTier] = useState(1);
  // Ticks once per second during a break so the energy meter is live
  const [nowTick, setNowTick] = useState(0);
  const [stats, setStats] = useState<SessionStats>(emptySessionStats);
  const [history, setHistory] = useState<DayRecord[]>([]);
  const [characterHidden, setCharacterHidden] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusSession, setFocusSession] = useState<{
    endsAt: number;
    minutes: number;
  } | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [quest, setQuest] = useState<{ text: string; done: boolean } | null>(
    null,
  );
  const [snooze, setSnooze] = useState<{ until: number; level: 0 | 1 | 2 }>({
    until: 0,
    level: 0,
  });
  const [pet, setPet] = useState<PetProfile | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [unlockedBadges, setUnlockedBadges] = useState<Set<string>>(new Set());
  const panelOpen =
    settingsOpen || summaryOpen || onboardingOpen || noteOpen || focusOpen;
  const overlayHidden = panelOpen || overlaySuppressed;
  const characterSrc = useCharacterFrame(
    label,
    timeEvents,
    displayedMessage !== "" && !overlayHidden,
    characterId,
  );

  // Ensure time-passed is always updated
  const labelRef = useRef(label);
  labelRef.current = label;
  const characterHiddenRef = useRef(characterHidden);
  characterHiddenRef.current = characterHidden;
  const onBreakRef = useRef(false);
  const breakTimeRef = useRef(0);
  const breakNeededRef = useRef(0);
  const breakStartTierRef = useRef(1);
  const reminderRestoreTimeoutRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const suppressReminderUntilRef = useRef(0);
  breakTimeRef.current = breakTime;
  breakNeededRef.current = breakNeeded;
  breakStartTierRef.current = breakStartTier;
  onBreakRef.current = breakTime !== 0;
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;

  const activityRef = useRef<ActivityState>({
    timePassed,
    timeEvents,
    stats,
    paused: characterHidden,
    history,
  });
  activityRef.current = {
    timePassed,
    timeEvents,
    stats,
    paused: characterHidden,
    history,
  };
  const closeBarRef = useRef<() => void>(() => {});
  const reminderIntervalRef = useRef(30);
  const reminderAnimUntilRef = useRef(0);
  const toastIdRef = useRef(0);
  const petLevelRef = useRef(0);
  const petRef = useRef<PetProfile | null>(null);
  petRef.current = pet;
  const focusSessionRef = useRef<{
    endsAt: number;
    minutes: number;
  } | null>(null);
  focusSessionRef.current = focusSession;
  // Continuous seconds on the current frontmost category (resets on category change / break).
  const categoryStretchRef = useRef(0);
  const categoryStretchLabelRef = useRef<string | null>(null);
  // Category-stretch seconds at which we last fired a distraction nudge.
  const lastDistractionNudgeAtRef = useRef(0);

  const [activityHydrated, setActivityHydrated] = useState(false);

  const clearOverlayMessage = useCallback(() => {
    setMessage("");
    setDisplayedMessage("");
    setReminderNotePinned(false);
  }, []);

  const setTransientMessage = useCallback((text: string) => {
    setReminderNotePinned(false);
    setMessage(text);
  }, []);

  const setTransientMessageRef = useRef(setTransientMessage);
  setTransientMessageRef.current = setTransientMessage;

  const clearReminderRestoreTimeout = useCallback(() => {
    if (reminderRestoreTimeoutRef.current !== undefined) {
      clearTimeout(reminderRestoreTimeoutRef.current);
      reminderRestoreTimeoutRef.current = undefined;
    }
  }, []);

  // ---- Growth pass: toasts, pet, snooze, focus, quests ----

  const pushToast = useCallback((title: string, body: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev.slice(-2), { id, title, body }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Snooze cycles 10 min -> 30 min -> off. Frontend-only: it just pushes the
  // existing reminder-suppress timestamp out.
  const cycleSnooze = useCallback(() => {
    const now = Date.now();
    if (snooze.level === 0) {
      const until = now + 10 * 60_000;
      suppressReminderUntilRef.current = until;
      setSnooze({ until, level: 1 });
      setTransientMessage(
        "Reminders snoozed for 10 minutes. Snooze again for 30.",
      );
    } else if (snooze.level === 1) {
      const until = now + 30 * 60_000;
      suppressReminderUntilRef.current = until;
      setSnooze({ until, level: 2 });
      setTransientMessage("Reminders snoozed for 30 minutes.");
    } else {
      suppressReminderUntilRef.current = 0;
      setSnooze({ until: 0, level: 0 });
      setTransientMessage("Reminders are back on.");
    }
  }, [snooze, setTransientMessage]);

  const cancelFocusSession = useCallback(() => {
    if (!focusSessionRef.current) return;
    focusSessionRef.current = null;
    setFocusSession(null);
    suppressReminderUntilRef.current = 0;
    setTransientMessage("Focus session ended early — no XP this time.");
  }, [setTransientMessage]);

  const completeFocusSession = useCallback(() => {
    const session = focusSessionRef.current;
    if (!session) return;
    focusSessionRef.current = null;
    setFocusSession(null);
    // Don't let the megaphone clobber the celebration message.
    suppressReminderUntilRef.current = Date.now() + 6000;
    void invoke("reset_reminder_timer").catch(console.error);
    const xp = session.minutes >= 50 ? XP_FOCUS_50 : XP_FOCUS_25;
    setPet((prev) => {
      if (!prev) return prev;
      const next = { ...prev, focusSessions: prev.focusSessions + 1 };
      grantXp(next, xp);
      return next;
    });
    setTransientMessage(
      `Focus complete — ${session.minutes} minutes well spent. +${xp} XP.`,
    );
    playReminderAnimRef.current();
  }, [setTransientMessage]);

  const completeQuest = useCallback(() => {
    setQuest((prev) => (prev ? { ...prev, done: true } : prev));
    setPet((prev) => {
      if (!prev) return prev;
      const next = { ...prev, questsDone: prev.questsDone + 1 };
      grantXp(next, XP_QUEST_DONE);
      return next;
    });
    const name = petRef.current?.name ?? "your pal";
    setTransientMessage(`Quest complete! +${XP_QUEST_DONE} XP for ${name}.`);
  }, [setTransientMessage]);

  // Megaphone animation for timed reminders and distraction nudges.
  const playReminderAnim = useCallback(() => {
    clearReminderRestoreTimeout();
    setTimeEvents(() => {
      reminderAnimUntilRef.current = Date.now() + 5000;
      reminderRestoreTimeoutRef.current = setTimeout(() => {
        reminderRestoreTimeoutRef.current = undefined;
        if (onBreakRef.current) return;
        if (Date.now() < suppressReminderUntilRef.current) return;
        setTimeEvents(
          tierFromWorkSeconds(
            activityRef.current.timePassed,
            reminderIntervalRef.current,
          ),
        );
      }, 5000);
      return 0;
    });
  }, [clearReminderRestoreTimeout]);

  const playReminderAnimRef = useRef(playReminderAnim);
  playReminderAnimRef.current = playReminderAnim;

  // Don't leave a pending reminder-restore timeout behind on unmount.
  useEffect(
    () => () => clearReminderRestoreTimeout(),
    [clearReminderRestoreTimeout],
  );

  const syncHideOverlay = useCallback(() => {
    document.documentElement.classList.add(OVERLAY_SUPPRESS_CLASS);
    flushSync(() => setOverlaySuppressed(true));
  }, []);

  const syncReleaseOverlay = useCallback(() => {
    document.documentElement.classList.remove(OVERLAY_SUPPRESS_CLASS);
    setOverlaySuppressed(false);
  }, []);

  const beginOpenPanel = useCallback(
    async (markOpen: () => void) => {
      closeBarRef.current();
      clearOverlayMessage();
      syncHideOverlay();
      try {
        await invoke("open_settings");
        markOpen();
      } catch (err) {
        console.error(err);
      } finally {
        syncReleaseOverlay();
      }
    },
    [clearOverlayMessage, syncHideOverlay, syncReleaseOverlay],
  );

  const beginClosePanel = useCallback(
    async (markClosed: () => void) => {
      syncHideOverlay();
      clearOverlayMessage();
      markClosed();
      try {
        await invoke("close_settings");
      } catch (err) {
        console.error(err);
      } finally {
        syncReleaseOverlay();
      }
    },
    [clearOverlayMessage, syncHideOverlay, syncReleaseOverlay],
  );

  const openSettings = useCallback(() => {
    void beginOpenPanel(() => {
      setSummaryOpen(false);
      setSettingsOpen(true);
    });
  }, [beginOpenPanel]);

  const openSummary = useCallback(() => {
    void beginOpenPanel(() => {
      setSettingsOpen(false);
      setSummaryOpen(true);
    });
  }, [beginOpenPanel]);

  const closeSettings = useCallback(() => {
    // Settings can rename the pet — reload the profile.
    setPet(loadPetProfile(characterId, getCharacter(characterId).name));
    void beginClosePanel(() => setSettingsOpen(false));
  }, [beginClosePanel, characterId]);

  const closeSummary = useCallback(() => {
    void beginClosePanel(() => setSummaryOpen(false));
  }, [beginClosePanel]);

  const openReminderNotes = useCallback(() => {
    void beginOpenPanel(() => {
      setSettingsOpen(false);
      setSummaryOpen(false);
      setNoteOpen(true);
    });
  }, [beginOpenPanel]);

  const closeReminderNotes = useCallback(() => {
    void beginClosePanel(() => setNoteOpen(false));
  }, [beginClosePanel]);

  const openOnboarding = useCallback(() => {
    void beginOpenPanel(() => {
      setSettingsOpen(false);
      setSummaryOpen(false);
      setOnboardingOpen(true);
    });
  }, [beginOpenPanel]);

  const openFocus = useCallback(() => {
    void beginOpenPanel(() => {
      setSettingsOpen(false);
      setSummaryOpen(false);
      setFocusOpen(true);
    });
  }, [beginOpenPanel]);

  const closeFocus = useCallback(() => {
    void beginClosePanel(() => setFocusOpen(false));
  }, [beginClosePanel]);

  const startFocusSession = useCallback(
    (minutes: number) => {
      void beginClosePanel(() => setFocusOpen(false));
      const endsAt = Date.now() + minutes * 60_000;
      const session = { endsAt, minutes };
      focusSessionRef.current = session;
      setFocusSession(session);
      setFocusTick(Date.now());
      // Hold all reminders until the timer ends.
      suppressReminderUntilRef.current = endsAt;
      setTransientMessage(
        `${minutes}-minute focus started. ${petRef.current?.name ?? character.name} is guarding your time.`,
      );
    },
    [beginClosePanel, character, setTransientMessage],
  );

  const closeOnboarding = useCallback(() => {
    // Onboarding may have saved a pet name — reload the profile.
    setPet(loadPetProfile(characterId, getCharacter(characterId).name));
    void beginClosePanel(() => setOnboardingOpen(false));
  }, [beginClosePanel, characterId]);

  // First launch: show onboarding once settings are loaded
  useEffect(() => {
    let cancelled = false;
    void invoke<Settings>("get_settings")
      .then((settings) => {
        if (!cancelled && !settings.onboarding_complete) {
          openOnboarding();
        }
      })
      .catch((err) => console.error("Failed to load settings:", err));
    return () => {
      cancelled = true;
    };
  }, [openOnboarding]);

  const pollRate = 500;

  // update values from settings (at initial load and whenever settings are changed)
  useEffect(() => {
    void (async () => {
      const settings = await invoke<Settings>("get_settings");
      reminderIntervalRef.current = settings.reminder_interval_mins;
      setCharacterId(getCharacter(settings.character_id).id);
      switch (settings.position) {
        case "bottom_left":
          setPosition("bl");
          break;
        case "bottom_right":
          setPosition("br");
          break;
        case "top_left":
          setPosition("tl");
          break;
        case "top_right":
          setPosition("tr");
          break;
        default:
          setPosition("bl");
          break;
      }
    })().catch((err) => console.error("Failed to refresh settings:", err));
  }, [settingsOpen, onboardingOpen]);

  // initial activity load - might have saved session data from before
  useEffect(() => {
    void Promise.all([
      invoke<ActivityState>("get_activity"),
      invoke<Settings>("get_settings"),
    ]).then(([saved, settings]) => {
      reminderIntervalRef.current = settings.reminder_interval_mins;
      let savedStats = saved.stats;
      let savedHistory = saved.history ?? [];
      let savedTimePassed = saved.timePassed;
      let savedTimeEvents = saved.timeEvents;

      // archive session reset stats
      if (dayKey(savedStats.startedAt) !== dayKey(Date.now())) {
        savedHistory = archiveDay(savedHistory, savedStats);
        savedStats = emptySessionStats();
        savedTimePassed = 0;
        savedTimeEvents = 1;
      } else if (savedTimePassed > 0 && savedTimeEvents > 0) {
        savedTimeEvents = tierFromWorkSeconds(
          savedTimePassed,
          settings.reminder_interval_mins,
        );
      }

      setTimePassed(savedTimePassed);
      setTimeEvents(savedTimeEvents);
      setStats(savedStats);
      setHistory(savedHistory);
      if (saved.paused) setCharacterHidden(true);
      activityRef.current = {
        ...saved,
        timePassed: savedTimePassed,
        timeEvents: savedTimeEvents,
        stats: savedStats,
        history: savedHistory,
      };
      setActivityHydrated(true);
    }).catch((err) => {
      // Start from a clean slate rather than silently disabling autosave.
      console.error("Failed to load saved activity:", err);
      setActivityHydrated(true);
    });
  }, []);

  // save activity to file
  useEffect(() => {
    if (!activityHydrated) return;
    const id = setInterval(() => {
      void invoke("save_activity", { activity: activityRef.current });
    }, 5000);
    return () => clearInterval(id);
  }, [activityHydrated]);

  // update timePassed + session stats from time-passed event (1 tick = 1s)
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    (async () => {
      const stop = await listen("time-passed", () => {
        // crossed midnight: archive today into history and start a new day.
        // Reset timePassed and timeEvents alongside stats so the energy tier
        // and reminder bubble reflect the fresh day rather than yesterday.
        const current = activityRef.current.stats;
        if (dayKey(current.startedAt) !== dayKey(Date.now())) {
          setHistory((prev) => archiveDay(prev, current));
          setStats(emptySessionStats());
          setTimePassed(0);
          setTimeEvents(1);
          categoryStretchRef.current = 0;
          categoryStretchLabelRef.current = null;
          lastDistractionNudgeAtRef.current = 0;
          return;
        }

        // tracks active work since the last break
        setTimePassed((prev) => {
          const next = onBreakRef.current ? prev : prev + 1;
          if (
            !onBreakRef.current &&
            Date.now() >= reminderAnimUntilRef.current
          ) {
            const expected = tierFromWorkSeconds(
              next,
              reminderIntervalRef.current,
            );
            setTimeEvents((te) => (te < 0 ? te : expected));
          }
          return next;
        });

        if (!onBreakRef.current) {
          const key = labelRef.current ?? "Unknown";
          // Reset continuous-category stretch when the frontmost category changes.
          if (categoryStretchLabelRef.current !== key) {
            categoryStretchLabelRef.current = key;
            categoryStretchRef.current = 0;
            lastDistractionNudgeAtRef.current = 0;
          }
          categoryStretchRef.current += 1;
          const categoryStretch = categoryStretchRef.current;

          if (
            isDistractingCategory(key) &&
            !characterHiddenRef.current &&
            !panelOpenRef.current
          ) {
            const firstNudge =
              lastDistractionNudgeAtRef.current === 0 &&
              categoryStretch >= DISTRACTION_LIMIT_SECS;
            const repeatNudge =
              lastDistractionNudgeAtRef.current > 0 &&
              categoryStretch - lastDistractionNudgeAtRef.current >=
                DISTRACTION_NUDGE_REPEAT_SECS;
            if (firstNudge || repeatNudge) {
              lastDistractionNudgeAtRef.current = categoryStretch;
              setTransientMessageRef.current(
                pickDistractionNudge(key, categoryStretch),
              );
              playReminderAnimRef.current();
            }
          }
        }

        setStats((prev) => {
          if (onBreakRef.current) {
            return { ...prev, restSeconds: prev.restSeconds + 1 };
          }
          const key = labelRef.current ?? "Unknown";
          const stretch = prev.currentStretchSeconds + 1;
          return {
            ...prev,
            categorySeconds: {
              ...prev.categorySeconds,
              [key]: (prev.categorySeconds[key] ?? 0) + 1,
            },
            currentStretchSeconds: stretch,
            longestStretchSeconds: Math.max(
              prev.longestStretchSeconds,
              stretch,
            ),
          };
        });
      });
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Ends the current break. interrupted means the user touched their computer during break (detected by Rust)
  const endBreak = useCallback(
    (interrupted: boolean) => {
      if (breakTimeRef.current === 0) return;

      const timeRested = Date.now() - breakTimeRef.current;
      const restNeededMs = breakNeededRef.current * 60 * 1000;
      const progress =
        restNeededMs > 0 ? Math.min(1, timeRested / restNeededMs) : 1;

      // Recharge consistently with what the meter showed live during the break:
      const finalTier = tierFromBreakProgress(breakStartTierRef.current, progress);

      clearReminderRestoreTimeout();
      // Block the megaphone reminder from clobbering the restored energy tier.
      suppressReminderUntilRef.current = Date.now() + 6000;
      reminderAnimUntilRef.current = 0;
      breakTimeRef.current = 0;
      setTimeEvents(finalTier);

      if (progress >= 1) {
        setTransientMessage("Fully rested. Nicely done.");
      } else {
        setTransientMessage(
          interrupted
            ? "That break ended early — the keyboard missed you."
            : "You didn't rest enough.",
        );
      }

      if (interrupted) {
        setStats((prev) => ({
          ...prev,
          breaksInterrupted: prev.breaksInterrupted + 1,
        }));
      } else if (progress >= 1) {
        // A fully-rested break earns the pet XP.
        setPet((prev) => {
          if (!prev) return prev;
          const next = { ...prev, fullBreaks: prev.fullBreaks + 1 };
          grantXp(next, XP_FULL_BREAK);
          return next;
        });
      }

      setQuest(null);
      setBreakTime(0);
      // Restart the reminder/energy-drain clock
      void invoke("reset_reminder_timer").catch(console.error);
    },
    [clearReminderRestoreTimeout, setTransientMessage],
  );

  const startBreak = useCallback(
    (options?: { auto?: boolean; sleep?: boolean }) => {
      if (breakTimeRef.current !== 0) return;
      // A break and a focus session can't coexist — ending focus first keeps
      // the two side pills from colliding and the XP rules honest.
      if (focusSessionRef.current) cancelFocusSession();
      const { timePassed: workSeconds, timeEvents: events } =
        activityRef.current;
      const minutesWorked = workSeconds / 60;
      const startTier = Math.max(1, Math.abs(events));
      const now = Date.now();

      clearReminderRestoreTimeout();
      suppressReminderUntilRef.current = Date.now() + 5000;

      const factor = events < 2 ? 0.2 : 0.4;
      const restMinutes = Math.max(1, Math.round(minutesWorked * factor));

      breakTimeRef.current = now;
      breakNeededRef.current = restMinutes;
      breakStartTierRef.current = startTier;
      setBreakTime(now);
      setbreakNeeded(restMinutes);
      setBreakStartTier(startTier);

      if (options?.sleep) {
        setTransientMessage("Your Mac is sleeping — I'll keep your break going.");
      } else if (options?.auto) {
        setTransientMessage("Stepping away — catching some rest for you.");
      } else {
        setTransientMessage(
          `You need to rest ${restMinutes} minute${restMinutes === 1 ? "" : "s"} to fully recover`,
        );
      }

      setStats((prev) => ({
        ...prev,
        breaksTaken: prev.breaksTaken + 1,
        currentStretchSeconds: 0,
      }));
      setTimePassed(0);
      setTimeEvents(-startTier);
      categoryStretchRef.current = 0;
      categoryStretchLabelRef.current = null;
      lastDistractionNudgeAtRef.current = 0;
      // Every break gets a small quest; a real break beats a snooze.
      setQuest({
        text: questForBreak(activityRef.current.stats.breaksTaken),
        done: false,
      });
      setSnooze({ until: 0, level: 0 });
      void invoke("reset_reminder_timer").catch(console.error);
    },
    [cancelFocusSession, clearReminderRestoreTimeout, setTransientMessage],
  );

  const handleAction = useCallback(
    (action: string) => {
      switch (action) {
        case "settings":
          syncHideOverlay();
          openSettings();
          break;
        case "break":
          if (focusSessionRef.current) {
            // A real break wins over a focus timer.
            focusSessionRef.current = null;
            setFocusSession(null);
            suppressReminderUntilRef.current = 0;
          }
          startBreak();
          break;
        case "endbreak":
          endBreak(false);
          break;
        case "focus":
          if (onBreakRef.current) {
            setTransientMessage("Rest first — we'll focus after your break.");
            break;
          }
          if (focusSessionRef.current) {
            const remainMs = focusSessionRef.current.endsAt - Date.now();
            setTransientMessage(
              `Already focusing — ${formatCountdown(remainMs)} left.`,
            );
            break;
          }
          syncHideOverlay();
          openFocus();
          break;
        case "endfocus":
          cancelFocusSession();
          break;
        case "snooze":
          cycleSnooze();
          break;
        case "summary":
          syncHideOverlay();
          openSummary();
          break;
      }
    },
    [
      openSettings,
      openSummary,
      openFocus,
      syncHideOverlay,
      endBreak,
      startBreak,
      cancelFocusSession,
      cycleSnooze,
      setTransientMessage,
    ],
  );

  // Auto-break when idle (skipped while audio/video is playing).
  useEffect(() => {
    if (!activityHydrated) return;

    const POLL_MS = 30_000;
    const checkAutoBreak = () => {
      if (breakTimeRef.current !== 0) return;
      if (panelOpenRef.current) return;

      void invoke<AutoBreakStatus>("get_auto_break_status")
        .then((status) => {
          if (status.should_auto_break) {
            startBreak({ auto: true });
          }
        })
        .catch(console.error);
    };

    const id = setInterval(checkAutoBreak, POLL_MS);
    return () => clearInterval(id);
  }, [activityHydrated, startBreak]);

  // Auto-break when the Mac goes to sleep.
  useEffect(() => {
    let cancelled = false;
    let unlistenSleep: (() => void) | undefined;

    void listen("system-will-sleep", () => {
      startBreak({ auto: true, sleep: true });
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlistenSleep = fn;
    });

    return () => {
      cancelled = true;
      unlistenSleep?.();
    };
  }, [startBreak]);

  // While on break, watch for keyboard/mouse activity.
  useEffect(() => {
    if (breakTime === 0) return;
    const GRACE_MS = 5000; // ignore the input that started the break
    const POLL_MS = 2000;
    const REMAIN_MSG_INTERVAL_MS = 20000; // Show minutes/seconds remaining every ___ seconds

    let lastRemainMsgTime = 0;

    const id = setInterval(() => {
      if (Date.now() - breakTime < GRACE_MS) return;
      invoke<number>("get_seconds_since_last_input")
        .then((idleSecs) => {
          if (idleSecs * 1000 < POLL_MS) endBreak(true);
        })
        .catch(console.error);

      // update the "x minutes/seconds remaining" message every 5 seconds.
      const now = Date.now();
      if (now - lastRemainMsgTime >= REMAIN_MSG_INTERVAL_MS) {
        lastRemainMsgTime = now;

        const timeRestedMs = now - breakTime;
        const restNeededMs = breakNeeded * 60 * 1000;
        const remainingMs = restNeededMs - timeRestedMs;
        const remainingMins = Math.ceil(remainingMs / 60000);

        if (remainingMs > 0) {
          if (remainingMs >= 60000) {
            setTransientMessage(
              `${remainingMins} minute${remainingMins !== 1 ? "s" : ""} remaining`,
            );
          } else {
            const remainingSecs = Math.ceil(remainingMs / 1000);
            setTransientMessage(
              `${remainingSecs} second${remainingSecs !== 1 ? "s" : ""} remaining`,
            );
          }
        } else {
          setTransientMessage("You can finish your break now!");
        }
      }
    }, POLL_MS);

    return () => clearInterval(id);
  }, [breakTime, breakNeeded, endBreak, setTransientMessage]);

  // 1s re-render while resting so the energy meter is live
  useEffect(() => {
    if (breakTime === 0) return;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [breakTime]);

  // ---- Growth pass effects ----

  // Load the pet profile for the active character; persist on every change.
  useEffect(() => {
    setPet(loadPetProfile(characterId, getCharacter(characterId).name));
  }, [characterId]);
  useEffect(() => {
    if (pet) savePetProfile(characterId, pet);
  }, [pet, characterId]);

  // Level-up celebration when XP crosses a level boundary.
  useEffect(() => {
    if (!pet) return;
    const level = levelForXp(pet.xp);
    if (petLevelRef.current !== 0 && level > petLevelRef.current) {
      setTransientMessage(
        `${pet.name} reached level ${level}! All that resting paid off.`,
      );
      playReminderAnimRef.current();
      pushToast(
        `${pet.name} leveled up!`,
        `Level ${level} — the bond grows stronger.`,
      );
    }
    petLevelRef.current = level;
  }, [pet, pushToast, setTransientMessage]);

  // Achievement checks: any break count change, pet change, or history
  // archive can complete a badge. checkAchievements only returns fresh ones.
  const breaksTakenCount = stats.breaksTaken;
  useEffect(() => {
    if (!pet || !activityHydrated) return;
    const { stats: liveStats, history: liveHistory } = activityRef.current;
    const fresh = checkAchievements({
      stats: liveStats,
      history: liveHistory,
      pet,
    });
    fresh.forEach((def) =>
      pushToast(`Badge earned: ${def.name}`, def.desc),
    );
  }, [pet, breaksTakenCount, history, activityHydrated, pushToast]);

  // Focus session countdown; completing fires XP + celebration.
  useEffect(() => {
    if (!focusSession) return;
    const id = setInterval(() => {
      const now = Date.now();
      setFocusTick(now);
      if (now >= focusSession.endsAt) {
        clearInterval(id);
        completeFocusSession();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [focusSession, completeFocusSession]);

  // A snooze is wall-clock time: expire the label when it lapses.
  useEffect(() => {
    if (snooze.level === 0) return;
    const id = setInterval(() => {
      if (Date.now() >= snooze.until) setSnooze({ until: 0, level: 0 });
    }, 15000);
    return () => clearInterval(id);
  }, [snooze]);

  // Refresh the badge shelf whenever the summary opens.
  useEffect(() => {
    if (summaryOpen) setUnlockedBadges(loadUnlockedAchievements());
  }, [summaryOpen]);

  const toggleNote = openReminderNotes;

  const { hovered, barOpen, closeBar } = useCharacterInteraction(
    panelOpen,
    handleAction,
    toggleNote,
    characterHidden,
  );

  // The radial menu owns the space around the pet while open — dismiss any
  // speech bubble so the two never collide behind the slices.
  useEffect(() => {
    if (barOpen) clearOverlayMessage();
  }, [barOpen, clearOverlayMessage]);

  const barOpenRef = useRef(barOpen);
  barOpenRef.current = barOpen;

  // Transparent NSPanels can leave stale WebKit layers on some Macs when UI unmounts.
  useEffect(() => {
    void invoke("invalidate_overlay_display").catch(console.error);
  }, [barOpen, overlayHidden, panelOpen]);

  closeBarRef.current = closeBar;
  useSettingsShortcut(settingsOpen, openSettings, closeSettings);

  // Hide-character shortcut: hides only the character until pressed again
  const toggleCharacterHidden = useCallback(() => {
    setCharacterHidden((prev) => {
      if (!prev) {
        closeBar();
        clearOverlayMessage();
      }
      return !prev;
    });
  }, [closeBar, clearOverlayMessage]);
  usePauseTrackingShortcut(toggleCharacterHidden);

  // updating focused app
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      invoke<FrontmostApp | null>("get_frontmost_app")
        .then((app) => {
          if (!cancelled) setFrontmostApp(app);
        })
        .catch(console.error);
    };

    poll();
    const id = setInterval(poll, pollRate);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // reminder time event updates
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    listen("show-reminder", () => {
      // Don't drain energy (or break the sleep animation) while resting
      if (onBreakRef.current) return;
      if (characterHiddenRef.current) return;
      if (Date.now() < suppressReminderUntilRef.current) return;
      const elapsed = activityRef.current.timePassed;
      void invoke<string | null>("pop_pending_note")
        .then((note) => {
          const text = note?.trim();
          if (text) {
            setReminderNotePinned(true);
            setMessage(text);
          } else {
            setReminderNotePinned(false);
            setMessage(
              `You've been on for ${Math.round(elapsed / 60)} minute${Math.round(elapsed / 60) === 1 ? "" : "s"}!`,
            );
          }
        })
        .catch(() => {
          setReminderNotePinned(false);
          setMessage(
            `You've been on for ${Math.round(elapsed / 60)} minute${Math.round(elapsed / 60) === 1 ? "" : "s"}!`,
          );
        });
      playReminderAnimRef.current();
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const clearOverlayMessageRef = useRef(clearOverlayMessage);
  clearOverlayMessageRef.current = clearOverlayMessage;

  // pick phrase helper
  const pickPhraseRef = useRef<() => void>(() => {});
  pickPhraseRef.current = () => {
    if (overlayHidden || characterHidden) {
      clearOverlayMessageRef.current();
      return;
    }
    // Never talk over the open radial menu — it owns the space.
    if (barOpenRef.current) return;
    // Don't don't interrupt a message that is still typing or being shown. instead, wait for the next tick
    if (breakTime !== 0 || displayedMessage !== "" || !label) return;

    // get appropriate phrase based on current state and update the message.
    const tier = Math.min(5, Math.max(1, timeEvents));
    const category = label ?? "Unknown";
    const stretch = categoryStretchRef.current;
    const phrase =
      isDistractingCategory(category) && stretch >= DISTRACTION_LIMIT_SECS
        ? pickDistractionNudge(category, stretch)
        : pickPhrase(tier, category, timePassed);
    setTransientMessageRef.current(phrase);
  };

  // Pick new phrase every delayMs ms; restart delay when a panel opens.
  // The interval id lives outside the async body so the effect cleanup can
  // always clear it — returning a cleanup from an async IIFE leaks intervals.
  useEffect(() => {
    if (overlayHidden || characterHidden) {
      clearOverlayMessageRef.current();
      return;
    }

    let cancelled = false;
    let id: ReturnType<typeof setInterval> | undefined;

    void (async () => {
      const pickPhrase = () => pickPhraseRef.current();
      try {
        const setting = await invoke<Settings>("get_settings");
        if (cancelled) return;
        // delay: +-10% of reminder interval / 4
        const baseDelayMs = (setting.reminder_interval_mins / 4) * 60000;
        const variance = Math.random() * 0.2 - 0.1; // random between +- 10%
        const delayMs = Math.max(
          1000,
          Math.round(baseDelayMs * (1 + variance)),
        );
        pickPhrase();
        id = setInterval(pickPhrase, delayMs);
      } catch (err) {
        console.error("Failed to load settings for phrase timing:", err);
      }
    })();

    return () => {
      cancelled = true;
      if (id !== undefined) clearInterval(id);
    };
  }, [overlayHidden, characterHidden]);

  // typewriter effect; pinned reminder notes stay until dismissed
  useEffect(() => {
    if (!message) {
      setDisplayedMessage("");
      return;
    }

    const charDelayMs = 100;
    const displayDurationMs = 2000;

    setDisplayedMessage("");
    let i = 0;
    let typewriterId: ReturnType<typeof setInterval> | null = null;
    let backspaceId: ReturnType<typeof setInterval> | null = null;
    let hideTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const startBackspace = () => {
      let j = message.length;
      backspaceId = setInterval(() => {
        j -= 1;
        setDisplayedMessage(message.slice(0, j));
        if (j <= 0) {
          clearInterval(backspaceId!);
          setMessage("");
        }
      }, charDelayMs / 2);
    };

    typewriterId = setInterval(() => {
      i += 1;
      setDisplayedMessage(message.slice(0, i));
      if (i >= message.length) {
        clearInterval(typewriterId!);
        if (!reminderNotePinned) {
          hideTimeoutId = setTimeout(startBackspace, displayDurationMs);
        }
      }
    }, charDelayMs);

    return () => {
      if (typewriterId) clearInterval(typewriterId);
      if (hideTimeoutId) clearTimeout(hideTimeoutId);
      if (backspaceId) clearInterval(backspaceId);
    };
  }, [message, reminderNotePinned]);

  const onBreak = breakTime !== 0;
  const energy = onBreak
    ? breakEnergy(
        breakStartTier,
        breakNeeded > 0 ? (nowTick - breakTime) / (breakNeeded * 60 * 1000) : 1,
      )
    : energyFromTier(timeEvents);

  const snoozeLabel =
    snooze.level === 0
      ? "Snooze 10 min"
      : snooze.level === 1
        ? `Snoozed ${Math.max(1, Math.ceil((snooze.until - Date.now()) / 60000))}m — extend`
        : "Snooze off";
  const streak = useMemo(() => breakStreak(history, stats), [history, stats]);

  return (
    <>
      <main
        className={`container ${overlayHidden ? "hidden" : ""}`}
        style={{
          WebkitUserSelect: "none",
          userSelect: "none",
          MozUserSelect: "none",
        }}
      >
        <div
          className={`character interactive pos-${position || "bl"} ${
            hovered ? "hovered" : ""
          }${characterHidden ? " character-hidden" : ""}${
            quest && breakTime !== 0 ? " quest-active" : ""
          }`}
          data-character
        >
          {!overlayHidden && !characterHidden && (
            <RadialMenu
              open={barOpen}
              position={position || "bl"}
              break={breakTime}
              portrait={character.portrait}
              characterName={character.name}
              petName={pet?.name ?? character.name}
              inFocus={focusSession !== null}
              snoozeLabel={snoozeLabel}
            />
          )}
          {displayedMessage !== "" && !overlayHidden && !characterHidden && (
            <p
              id="messages"
              className={`messages interactive${reminderNotePinned ? " messages--pinned" : ""}`}
            >
              {reminderNotePinned && (
                <button
                  type="button"
                  className="messages-close interactive"
                  onClick={clearOverlayMessage}
                  aria-label="Close reminder note"
                >
                  <LuX size={12} />
                </button>
              )}
              <span className="messages-text">{displayedMessage}</span>
            </p>
          )}

          {!barOpen && !overlayHidden && (
            <div id="hoverInfo" style={{ display: "none" }}>
              <p className="hoverInfo-stat">
                <span className="hoverInfo-text">
                  {onBreak
                    ? "zzz"
                    : formatDuration(stats.currentStretchSeconds)}
                </span>
              </p>
              <div className="energy-bars">
                {Array.from({ length: ENERGY_CELLS }).map((_, i) => (
                  <div
                    key={i}
                    className={`energy-bar ${i < energy ? "filled" : "empty"}`}
                  />
                ))}
              </div>
            </div>
          )}

          {!characterHidden && (
            <div className="character-figure">
              {/* No `key` here: remounting the <img> on state changes drops the
                  decoded bitmap and paints a blank frame. Updating `src` on a
                  stable element swaps atomically since frames are predecoded. */}
              <img id="characterMain" src={characterSrc} alt="nudge character" />
              {focusSession && !overlayHidden && (
                <div className="focus-pill interactive">
                  <span className="focus-pill-time">
                    {formatCountdown(focusSession.endsAt - focusTick)}
                  </span>
                  <span className="focus-pill-label">focusing</span>
                  <button
                    type="button"
                    className="focus-pill-stop interactive"
                    onClick={cancelFocusSession}
                    aria-label="End focus session"
                  >
                    ×
                  </button>
                </div>
              )}
              {onBreak && quest && !quest.done && !overlayHidden && (
                <div className="quest-pill interactive">
                  <span className="quest-label">break quest</span>
                  <span className="quest-text">{quest.text}</span>
                  <button
                    type="button"
                    className="quest-done interactive"
                    onClick={completeQuest}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      {onboardingOpen && (
        <OnboardingPanel
          onComplete={closeOnboarding}
          characterId={characterId}
          onCharacterChange={setCharacterId}
        />
      )}
      {settingsOpen && !onboardingOpen && !noteOpen && (
        <SettingsPanel onClose={closeSettings} />
      )}
      {summaryOpen && !settingsOpen && !onboardingOpen && !noteOpen && (
        <SummaryPanel
          stats={stats}
          history={history}
          energy={energy}
          onBreak={onBreak}
          onClose={closeSummary}
          character={character}
          pet={pet}
          streak={streak}
          unlockedBadges={unlockedBadges}
        />
      )}
      {focusOpen &&
        !settingsOpen &&
        !onboardingOpen &&
        !noteOpen &&
        !summaryOpen && (
          <FocusPanel onStart={startFocusSession} onClose={closeFocus} />
        )}
      {noteOpen && !settingsOpen && !onboardingOpen && !summaryOpen && (
        <ReminderNotePanel onClose={closeReminderNotes} />
      )}
      <Toasts toasts={toasts} onDone={dismissToast} />
    </>
  );
}

export default App;

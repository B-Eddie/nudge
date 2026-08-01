import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useState, useEffect, useRef } from "react";
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
import { pickPhrase } from "./types/phrases";
import {
  mergeCategoryOveruseMins,
  pickOverusePhrase,
  type CategoryOveruseMins,
} from "./types/categoryOveruse";
import { LuX } from "react-icons/lu";

const OVERLAY_SUPPRESS_CLASS = "overlay-suppressed";
/** Re-nudge if the user stays on an overused category this long after the first warning. */
const OVERUSE_REPEAT_MS = 15 * 60 * 1000;

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

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [overlaySuppressed, setOverlaySuppressed] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [timeEvents, setTimeEvents] = useState(1); // negative time event means sleeping; 0 means reminder animation (megaphone)
  const [frontmostApp, setFrontmostApp] = useState<FrontmostApp | null>(null);
  const [timePassed, setTimePassed] = useState<number>(0); // in seconds
  const [message, setMessage] = useState("");
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
  // Continuous seconds on the current frontmost category (resets on switch/break)
  const [categoryStretchSeconds, setCategoryStretchSeconds] = useState(0);
  const [categoryLimits, setCategoryLimits] = useState<CategoryOveruseMins>(
    () => mergeCategoryOveruseMins(undefined),
  );
  const panelOpen = settingsOpen || summaryOpen || onboardingOpen || noteOpen;
  const overlayHidden = panelOpen || overlaySuppressed;
  const characterSrc = useCharacterFrame(
    label,
    timeEvents,
    displayedMessage !== "" && !overlayHidden,
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

  const categoryStretchRef = useRef({ category: "", seconds: 0 });
  const categoryLimitsRef = useRef<CategoryOveruseMins>(
    mergeCategoryOveruseMins(undefined),
  );
  const overuseFiredForStretchRef = useRef(false);
  const lastOveruseFireAtRef = useRef(0);
  const fireOveruseNudgeRef = useRef<
    (category: string, stretchSeconds: number) => void
  >(() => {});

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

  const [activityHydrated, setActivityHydrated] = useState(false);

  const clearOverlayMessage = useCallback(() => {
    setMessage("");
    setDisplayedMessage("");
    setReminderNotePinned(false);
  }, []);

  const dismissReminderNote = useCallback(() => {
    setMessage("");
    setDisplayedMessage("");
    setReminderNotePinned(false);
  }, []);

  const setTransientMessage = useCallback((text: string) => {
    setReminderNotePinned(false);
    setMessage(text);
  }, []);

  const clearReminderRestoreTimeout = useCallback(() => {
    if (reminderRestoreTimeoutRef.current !== undefined) {
      clearTimeout(reminderRestoreTimeoutRef.current);
      reminderRestoreTimeoutRef.current = undefined;
    }
  }, []);

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
    void beginClosePanel(() => setSettingsOpen(false));
  }, [beginClosePanel]);

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

  const closeOnboarding = useCallback(() => {
    void beginClosePanel(() => setOnboardingOpen(false));
  }, [beginClosePanel]);

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
      const limits = mergeCategoryOveruseMins(settings.category_overuse_mins);
      categoryLimitsRef.current = limits;
      setCategoryLimits(limits);
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
          categoryStretchRef.current = { category: "", seconds: 0 };
          setCategoryStretchSeconds(0);
          overuseFiredForStretchRef.current = false;
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

        // Continuous time on the current app category — used for overuse nudges
        // (e.g. an hour straight of gaming).
        if (onBreakRef.current) {
          if (categoryStretchRef.current.seconds !== 0) {
            categoryStretchRef.current = { category: "", seconds: 0 };
            setCategoryStretchSeconds(0);
            overuseFiredForStretchRef.current = false;
          }
          return;
        }

        const cat = labelRef.current ?? "Unknown";
        if (cat !== categoryStretchRef.current.category) {
          categoryStretchRef.current = { category: cat, seconds: 1 };
          overuseFiredForStretchRef.current = false;
        } else {
          categoryStretchRef.current.seconds += 1;
        }
        setCategoryStretchSeconds(categoryStretchRef.current.seconds);

        const limitMins = categoryLimitsRef.current[cat] ?? 0;
        if (
          limitMins > 0 &&
          categoryStretchRef.current.seconds >= limitMins * 60 &&
          !characterHiddenRef.current &&
          !panelOpenRef.current &&
          Date.now() >= suppressReminderUntilRef.current
        ) {
          const shouldFire =
            !overuseFiredForStretchRef.current ||
            Date.now() - lastOveruseFireAtRef.current >= OVERUSE_REPEAT_MS;
          if (shouldFire) {
            fireOveruseNudgeRef.current(
              cat,
              categoryStretchRef.current.seconds,
            );
          }
        }
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
        setTransientMessage("You are fully rested!");
      } else {
        setTransientMessage(
          interrupted
            ? "Hey, get off your computer! Your break has ended early."
            : "You didn't rest enough.",
        );
      }

      if (interrupted) {
        setStats((prev) => ({
          ...prev,
          breaksInterrupted: prev.breaksInterrupted + 1,
        }));
      }

      setBreakTime(0);
      // Restart the reminder/energy-drain clock
      void invoke("reset_reminder_timer").catch(console.error);
    },
    [clearReminderRestoreTimeout, setTransientMessage],
  );

  const fireOveruseNudge = useCallback(
    (category: string, stretchSeconds: number) => {
      if (onBreakRef.current || characterHiddenRef.current) return;

      overuseFiredForStretchRef.current = true;
      lastOveruseFireAtRef.current = Date.now();

      const phrase = pickOverusePhrase(category, stretchSeconds);
      // Pin so the user has to acknowledge — this is the assertive "get off that" nudge.
      setReminderNotePinned(true);
      setMessage(phrase);

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
    },
    [clearReminderRestoreTimeout],
  );
  fireOveruseNudgeRef.current = fireOveruseNudge;

  const startBreak = useCallback(
    (options?: { auto?: boolean; sleep?: boolean }) => {
      if (breakTimeRef.current !== 0) return;
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
      categoryStretchRef.current = { category: "", seconds: 0 };
      setCategoryStretchSeconds(0);
      overuseFiredForStretchRef.current = false;
      setBreakTime(now);
      setbreakNeeded(restMinutes);
      setBreakStartTier(startTier);

      if (options?.sleep) {
        setTransientMessage("Your Mac is sleeping — I'll keep your break going.");
      } else if (options?.auto) {
        setTransientMessage("Stepping away — catching some rest for you.");
      } else {
        setTransientMessage(
          `You need to rest ${restMinutes} minutes to fully recover`,
        );
      }

      setStats((prev) => ({
        ...prev,
        breaksTaken: prev.breaksTaken + 1,
        currentStretchSeconds: 0,
      }));
      setTimePassed(0);
      setTimeEvents(-startTier);
      void invoke("reset_reminder_timer").catch(console.error);
    },
    [clearReminderRestoreTimeout, setTransientMessage],
  );

  const handleAction = useCallback(
    (action: string) => {
      switch (action) {
        case "settings":
          syncHideOverlay();
          openSettings();
          break;
        case "break":
          startBreak();
          break;
        case "endbreak":
          endBreak(false);
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
      syncHideOverlay,
      endBreak,
      startBreak,
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

  const toggleNote = openReminderNotes;

  const { hovered, barOpen, closeBar } = useCharacterInteraction(
    panelOpen,
    handleAction,
    toggleNote,
    characterHidden,
  );

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

  const setTransientMessageRef = useRef(setTransientMessage);
  setTransientMessageRef.current = setTransientMessage;
  const clearOverlayMessageRef = useRef(clearOverlayMessage);
  clearOverlayMessageRef.current = clearOverlayMessage;

  // pick phrase helper
  const pickPhraseRef = useRef<() => void>(() => {});
  pickPhraseRef.current = () => {
    if (overlayHidden || characterHidden) {
      clearOverlayMessageRef.current();
      return;
    }
    // Don't don't interrupt a message that is still typing or being shown. instead, wait for the next tick
    if (breakTime !== 0 || displayedMessage !== "" || !label) return;

    // get appropriate phrase based on current state and update the message.
    const tier = Math.min(5, Math.max(1, timeEvents));
    const category = label ?? "Unknown";
    const phrase = pickPhrase(tier, category, timePassed);
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
        {/* debugging: */}
        {/* <p>{timeEvents}</p> */}
        {/* <p>{timePassed}</p> */}
        {/* <p className="app-category">{label ?? "—"}</p> */}
        <div
          className={`character interactive pos-${position || "bl"} ${
            hovered ? "hovered" : ""
          }${characterHidden ? " character-hidden" : ""}`}
          data-character
        >
          {!overlayHidden && !characterHidden && (
            <RadialMenu
              open={barOpen}
              position={position || "bl"}
              break={breakTime}
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
                  onClick={dismissReminderNote}
                  aria-label="Close reminder note"
                >
                  <LuX size={12} />
                </button>
              )}
              <span className="messages-text">{displayedMessage}</span>
            </p>
          )}

          {!barOpen && !overlayHidden && !characterHidden && (
            <div
              id="hoverInfo"
              className={`hover-chip${hovered ? " hover-chip--visible" : ""}`}
              aria-hidden={!hovered}
            >
              <div className="hover-chip-row">
                <span className="hover-chip-time">
                  {onBreak
                    ? "zzz"
                    : formatDuration(stats.currentStretchSeconds)}
                </span>
                <span className="hover-chip-sep" aria-hidden>
                  ·
                </span>
                <span className="hover-chip-category">
                  {onBreak ? "resting" : (label ?? "idle")}
                </span>
              </div>
              {frontmostApp?.name && !onBreak && (
                <p className="hover-chip-app" title={frontmostApp.name}>
                  {frontmostApp.name}
                </p>
              )}
              {!onBreak &&
                categoryStretchSeconds >= 60 &&
                label &&
                (categoryLimits[label] ?? 0) > 0 && (
                  <p className="hover-chip-stretch">
                    {formatDuration(categoryStretchSeconds)} on {label}
                  </p>
                )}
              <div
                className="energy-bars"
                role="img"
                aria-label={`Energy ${energy} of ${ENERGY_CELLS}`}
              >
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
            </div>
          )}
        </div>
      </main>
      {onboardingOpen && <OnboardingPanel onComplete={closeOnboarding} />}
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
        />
      )}
      {noteOpen && !settingsOpen && !onboardingOpen && !summaryOpen && (
        <ReminderNotePanel onClose={closeReminderNotes} />
      )}
    </>
  );
}

export default App;

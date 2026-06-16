import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useState, useEffect, useRef } from "react";
import { SettingsPanel } from "./components/SettingsPanel";
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
import { pickPhrase } from "./types/phrases";

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

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [panelTransitioning, setPanelTransitioning] = useState(false);
  const [timeEvents, setTimeEvents] = useState(1); // negative time event means sleeping; 0 means reminder animation (megaphone)
  const [frontmostApp, setFrontmostApp] = useState<FrontmostApp | null>(null);
  const [timePassed, setTimePassed] = useState<number>(0); // in seconds
  const [message, setMessage] = useState("");
  const [displayedMessage, setDisplayedMessage] = useState("");
  const label = frontmostApp?.category_label;
  const [position, setPosition] = useState("");
  const characterSrc = useCharacterFrame(label, timeEvents);
  const [breakTime, setBreakTime] = useState(0);
  const [breakNeeded, setbreakNeeded] = useState(0);
  // Energy tier (1 = full energy) captured when the current break began
  const [breakStartTier, setBreakStartTier] = useState(1);
  // Ticks once per second during a break so the energy meter is live
  const [nowTick, setNowTick] = useState(0);
  const [stats, setStats] = useState<SessionStats>(emptySessionStats);
  const [history, setHistory] = useState<DayRecord[]>([]);
  const [paused, setPaused] = useState(false);
  const panelOpen = settingsOpen || summaryOpen;
  const overlayHidden = panelOpen || paused || panelTransitioning;

  // Ensure time-passed is always updated
  const labelRef = useRef(label);
  labelRef.current = label;
  const onBreakRef = useRef(false);
  onBreakRef.current = breakTime !== 0;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const activityRef = useRef<ActivityState>({
    timePassed,
    timeEvents,
    stats,
    paused,
    history,
  });
  activityRef.current = { timePassed, timeEvents, stats, paused, history };
  const closeBarRef = useRef<() => void>(() => {});

  const [activityHydrated, setActivityHydrated] = useState(false);

  const beginOpenPanel = useCallback(async (markOpen: () => void) => {
    setPanelTransitioning(true);
    closeBarRef.current();
    try {
      await invoke("open_settings");
      markOpen();
    } catch (err) {
      console.error(err);
    } finally {
      setPanelTransitioning(false);
    }
  }, []);

  const beginClosePanel = useCallback(async (markClosed: () => void) => {
    markClosed();
    setPanelTransitioning(true);
    try {
      await invoke("close_settings");
    } catch (err) {
      console.error(err);
    } finally {
      setPanelTransitioning(false);
    }
  }, []);

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

  const pollRate = 500;

  // update values from settings (at initial load and whenever settings are changed)
  useEffect(() => {
    (async () => {
      const settings = await invoke<Settings>("get_settings");
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
    })();
  }, [settingsOpen]);

  // initial activity load - might have saved session data from before
  useEffect(() => {
    void invoke<ActivityState>("get_activity").then((saved) => {
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
      }

      setTimePassed(savedTimePassed);
      setTimeEvents(savedTimeEvents);
      setStats(savedStats);
      setHistory(savedHistory);
      if (saved.paused) setPaused(true);
      activityRef.current = {
        ...saved,
        timePassed: savedTimePassed,
        timeEvents: savedTimeEvents,
        stats: savedStats,
        history: savedHistory,
      };
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
          return;
        }

        // tracks active work since the last break
        setTimePassed((prev) => (onBreakRef.current ? prev : prev + 1));
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
      const timeRested = Date.now() - breakTime;
      const restNeededMs = breakNeeded * 60 * 1000;
      const progress =
        restNeededMs > 0 ? Math.min(1, timeRested / restNeededMs) : 1;

      // Recharge consistently with what the meter showed live during the break:
      const finalTier = tierFromBreakProgress(breakStartTier, progress);
      setTimeEvents(finalTier);

      if (progress >= 1) {
        setMessage("You are fully rested!");
      } else {
        setMessage(
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
    [breakTime, breakNeeded, breakStartTier],
  );

  const handleAction = useCallback(
    (action: string) => {
      switch (action) {
        case "settings":
          openSettings();
          break;
        case "break": {
          const minutesWorked = timePassed / 60;

          // Start break: set time events, break time, and needed time
          setBreakTime(Date.now());
          const factor = timeEvents < 2 ? 0.2 : 0.4; // short vs long break
          const restMinutes = Math.max(1, Math.round(minutesWorked * factor));

          setbreakNeeded(restMinutes);
          setMessage(
            `You need to rest ${restMinutes} minutes to fully recover`,
          );

          // Remember the energy level
          setBreakStartTier(Math.max(1, Math.abs(timeEvents)));

          setStats((prev) => ({
            ...prev,
            breaksTaken: prev.breaksTaken + 1,
            currentStretchSeconds: 0,
          }));
          // Reset the work clock so "time since last break" starts fresh
          setTimePassed(0);

          setTimeEvents((te) => -Math.abs(te)); // negative time event means sleeping
          break;
        }
        case "endbreak":
          endBreak(false);
          break;
        case "summary":
          openSummary();
          break;
      }
    },
    [openSettings, openSummary, timePassed, timeEvents, endBreak],
  );

  // While on break, watch for keyboard/mouse activity. If the user is doing computer events (clicks) at end the break.
  useEffect(() => {
    if (breakTime === 0) return;
    const GRACE_MS = 5000; // ignore the input that started the break
    const POLL_MS = 2000;
    const REMAIN_MSG_INTERVAL_MS = 20000; // Show minutes/seconds remaining every ___ seconds

    let lastRemainMsgTime = 0;

    const id = setInterval(() => {
      if (pausedRef.current) return;
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
            setMessage(
              `${remainingMins} minute${remainingMins !== 1 ? "s" : ""} remaining`,
            );
          } else {
            const remainingSecs = Math.ceil(remainingMs / 1000);
            setMessage(
              `${remainingSecs} second${remainingSecs !== 1 ? "s" : ""} remaining`,
            );
          }
        } else {
          setMessage("You can finish your break now!");
        }
      }
    }, POLL_MS);

    return () => clearInterval(id);
  }, [breakTime, breakNeeded, endBreak]);

  // 1s re-render while resting so the energy meter is live
  useEffect(() => {
    if (breakTime === 0) return;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [breakTime]);

  const { hovered, barOpen, closeBar } = useCharacterInteraction(
    panelOpen || panelTransitioning,
    handleAction,
  );
  closeBarRef.current = closeBar;
  useSettingsShortcut(settingsOpen, openSettings, closeSettings);

  // Pause shortcut: hides the overlay until shortcut pressed again
  const togglePause = useCallback(() => {
    if (!pausedRef.current) {
      if (settingsOpen || summaryOpen) {
        void beginClosePanel(() => {
          setSettingsOpen(false);
          setSummaryOpen(false);
        });
      }
      closeBar();
      setMessage("");
    }
    setPaused((prev) => !prev);
  }, [settingsOpen, summaryOpen, closeBar, beginClosePanel]);
  usePauseTrackingShortcut(togglePause);

  useEffect(() => {
    if (paused) {
      void invoke("set_click_through", { passThrough: true });
    }
  }, [paused]);

  // updating focused app
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const app = await invoke<FrontmostApp | null>("get_frontmost_app");
      if (!cancelled) setFrontmostApp(app);
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
      // Don't drain energy (or break the sleep animation) while paused or resting
      if (pausedRef.current || onBreakRef.current) return;
      const elapsed = activityRef.current.timePassed;
      setMessage(
        `You've been on for ${Math.round(elapsed / 60)} minute${Math.round(elapsed / 60) === 1 ? "" : "s"}!`,
      );
      setTimeEvents((prev) => {
        const savedTimeEvent = prev;
        setTimeout(() => {
          setTimeEvents(savedTimeEvent + 1);
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

  // pick phrase helper
  const pickPhraseRef = useRef<() => void>(() => {});
  pickPhraseRef.current = () => {
    if (overlayHidden || pausedRef.current) {
      setMessage("");
      return;
    }
    // Don't don't interrupt a message that is still typing or being shown. instead, wait for the next tick
    if (breakTime !== 0 || displayedMessage !== "" || !label) return;

    // get appropriate phrase based on current state and update the message.
    const tier = Math.min(5, Math.max(1, timeEvents));
    const category = label ?? "Unknown";
    const phrase = pickPhrase(tier, category, timePassed);
    setMessage(phrase);
  };

  // Pick new phrase every delayMs ms; restart delay when a panel opens
  useEffect(() => {
    (async () => {
      if (overlayHidden) {
        setMessage("");
        return;
      }

      const pickPhrase = () => pickPhraseRef.current();
      const setting = await invoke<Settings>("get_settings");
      // delay: +-10% of reminder interval / 4
      const baseDelayMs = (setting.reminder_interval_mins / 4) * 60000;
      const variance = Math.random() * 0.2 - 0.1; // random between +- 10%
      const delayMs = Math.max(1000, Math.round(baseDelayMs * (1 + variance))); // Ensure at least 1000ms
      pickPhrase();
      const id = setInterval(pickPhrase, delayMs);
      return () => clearInterval(id);
    })();
  }, [overlayHidden]);

  // typewriter effect, hold 2s, then hide with backspace effect
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
        hideTimeoutId = setTimeout(startBackspace, displayDurationMs);
      }
    }, charDelayMs);

    return () => {
      if (typewriterId) clearInterval(typewriterId);
      if (hideTimeoutId) clearTimeout(hideTimeoutId);
      if (backspaceId) clearInterval(backspaceId);
    };
  }, [message]);

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
          }`}
          data-character
        >
          {barOpen && (
            <RadialMenu position={position || "bl"} break={breakTime} />
          )}
          {displayedMessage !== "" && (
            <p id="messages">
              <span className="messages-text">{displayedMessage}</span>
            </p>
          )}

          <img id="characterMain" src={characterSrc} alt="character image" />
          {!barOpen && (
            <div id="hoverInfo" style={{ display: "none" }}>
              <h1>
                {onBreak
                  ? "zzz"
                  : formatDuration(stats.currentStretchSeconds)}
              </h1>
              <div style={{ display: "flex", flexDirection: "row" }}>
                {Array.from({ length: ENERGY_CELLS }).map((_, i) => (
                  <div
                    key={i}
                    className={i < energy ? "green-box" : "red-box"}
                    style={{
                      width: "16px",
                      height: "16px",
                      marginRight: i !== ENERGY_CELLS - 1 ? "4px" : "0",
                      borderRadius: "3px",
                      border: "1px solid #333",
                      background: i < energy ? "#a2cc3a" : "#f7768e",
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      {settingsOpen && <SettingsPanel onClose={closeSettings} />}
      {summaryOpen && !settingsOpen && (
        <SummaryPanel
          stats={stats}
          history={history}
          energy={energy}
          onBreak={onBreak}
          onClose={closeSummary}
        />
      )}
    </>
  );
}

export default App;

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { LuX } from "react-icons/lu";
import "./App.css";
import "./components/PetCard.css";
import { DEFAULT_HISTORY_DAYS, rollOverActivity, resumeAfterRestart, type ActivitySnapshot } from "./activityLifecycle";
import { BreakCoach } from "./components/BreakCoach";
import { BreakGuidePanel, durationLabel } from "./components/BreakGuidePanel";
import { FocusPanel } from "./components/FocusPanel";
import { HomePanel, type HomeTab } from "./components/HomePanel";
import { LivingPet } from "./components/LivingPet";
import { MadPanel } from "./components/MadPanel";
import { OnboardingPanel } from "./components/OnboardingPanel";
import { PetCard } from "./components/PetCard";
import { RadialMenu } from "./components/RadialMenu";
import { ReminderNotePanel } from "./components/ReminderNotePanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { SummaryPanel, emptySessionStats, formatDuration, type DayRecord, type SessionStats, type SummaryTab } from "./components/SummaryPanel";
import { WrapUpPanel } from "./components/WrapUpPanel";
import { useCharacterInteraction } from "./hooks/useCharacterInteraction";
import { useCompanion } from "./hooks/useCompanion";
import { usePauseTrackingShortcut } from "./hooks/usePauseTrackingShortcut";
import { chooseAdventure, type PetRequest } from "./hooks/usePetLife";
import { usePetLayout } from "./hooks/usePetLayout";
import { useSettingsShortcut } from "./hooks/useSettingsShortcut";
import { useWindowContext } from "./hooks/useWindowContext";
import { useSpeech } from "./hooks/useSpeech";
import { rankRoutines } from "./lib/breakSuggestion";
import { ACCESSORIES, bondLevel, care, dateKey, forgetHistory, newlyFound, nextMilestone, rememberRoutine, rested, unlocked, type AccessoryId, type CompanionState } from "./lib/companion";
import { distractionDue, recentDistraction, RollingUse } from "./lib/distraction";
import { breakEnergy, ENERGY_CELLS, energyFromTier, restMinutesFor, tierFromBreakProgress, tierFromWorkSeconds } from "./lib/energy";
import { addRecord, allowCategory, extendFocus, focusOver, focusTimeLabel, parkThought, startFocus, tickFocus, toRecord, type FocusOutcome, type FocusSession } from "./lib/focus";
import { blooms, dropsForRest, gardenLine, type Plant } from "./lib/garden";
import { addGrudge, againLine, beatGrudge, dropGrudge, facedGrudge, findGrudge, grudgeDue, shortLabel, targetOf, type Target } from "./lib/grudges";
import { napLine } from "./lib/napjutsu";
import { tantrumLength } from "./lib/tantrum";
import type { SceneKind } from "./lib/madScene";
import { memories } from "./lib/memories";
import { decide, drowsiness, holdLabel, receptivity, rulesFor, shouldDozeInstead, showLabel, snoozeActive, STYLE_RULES, type HoldReason, type NudgeOutcome, type PromptRules, type ShowReason, type Snooze } from "./lib/reminderPolicy";
import { dueRhythm, newRhythmClock, resetRhythm, RHYTHMS, rhythmsAfterBreak, tickRhythms, type RhythmId } from "./lib/rhythms";
import { formatMinuteOfDay, nightKey, tomorrowMorning, windDownPhase, withinActiveHours } from "./lib/schedule";
import { onTopic, placeFrom, type Place } from "./lib/sites";
import { siteLine } from "./lib/siteLines";
import { Wandering } from "./lib/wandering";
import { playSound, speak, stopSpeaking } from "./lib/sounds";
import { letterWeek, writeLetter, type Letter } from "./lib/weeklyLetter";
import { applyTheme, knownCompanion, type CompanionId } from "./types/appearance";
import { BREAK_ROUTINES, stepAt, type BreakRoutine } from "./types/breakRoutines";
import { DEFAULT_PET_SIZE, petSize } from "./types/petSize";
import { isDistractingCategory, pickDistractionNudge, pickPhrase, SLEEPY_PHRASES } from "./types/phrases";
import { preferences, type Settings } from "./types/settings";
import { CAST, canExpand, castAsk, castSays, castThought } from "./lib/cast";
import { TECHNIQUES } from "./lib/napjutsu";
import "./manga.css";

const OVERLAY_SUPPRESS_CLASS = "overlay-suppressed";
const FRONT_POLL_MS = 500;
const STATUS_POLL_MS = 10_000;
const PROMPT_POLL_MS = 2_000;
const MINUTE = 60_000;
const PRIVATE_LABEL = "Private";
/** How long "ten minutes, together" lasts, and how long to look at something before bristling. */
const TOGETHER_MINUTES = 10;
const BRISTLE_MS = 12_000;

interface FrontmostApp { name: string; bundle_id: string | null; category: string; category_label: string }
interface PresenceStatus { idle_seconds: number; should_auto_break: boolean; in_call?: boolean; watching?: boolean; music_playing?: boolean }

type PanelId = "settings" | "summary" | "breaks" | "onboarding" | "notes" | "focus" | "garden" | "wrapup" | "mad";

/** Prompts that wait for a good moment, most pressing first. */
const PROMPTS = ["focus-end", "drift", "bedtime", "reminder", "letter", "found"] as const;
type Prompt = (typeof PROMPTS)[number];
type Card =
  | { kind: "reminder"; because: ShowReason | "woken" }
  | { kind: "drift"; allow: string; site: string | null }
  | { kind: "focus-end" | "bedtime" | "letter" }
  | { kind: "found"; accessory: AccessoryId }
  | { kind: "ugh"; target: Target | null }
  | { kind: "won"; label: string }
  | { kind: "helped"; routine: BreakRoutine }
  | { kind: "resume"; minutes: number }
  | { kind: "spent" };
/** Cards that tidy themselves away if nobody answers. */
const CARD_LIFETIME_MS: Partial<Record<Card["kind"], number>> = { helped: 20_000, resume: 25_000, spent: 30_000, drift: 45_000, ugh: 60_000, won: 60_000, letter: 90_000, found: 60_000, bedtime: 180_000, "focus-end": 15 * 60_000 };

const POSITIONS: Record<string, string> = { bottom_left: "bl", bottom_right: "br", top_left: "tl", top_right: "tr", center: "center" };
const formatClockTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
const minutesText = (n: number) => `${n} minute${n === 1 ? "" : "s"}`;

function App() {
  /* ---------- state ---------- */
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [homeTab, setHomeTab] = useState<HomeTab>("garden");
  const [summaryTab, setSummaryTab] = useState<SummaryTab>("today");
  const [overlaySuppressed, setOverlaySuppressed] = useState(false);
  const [timeEvents, setTimeEvents] = useState(1); // energy tier; negative while resting
  const [timePassed, setTimePassed] = useState(0); // active seconds since the last break
  const [frontmostApp, setFrontmostApp] = useState<FrontmostApp | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [hold, setHold] = useState<HoldReason | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [watching, setWatching] = useState(false);
  const [hopping, setHopping] = useState(false);
  const [ignoredAt, setIgnoredAt] = useState<number | null>(null);
  const [breakTime, setBreakTime] = useState(0);
  const [breakNeeded, setBreakNeeded] = useState(0); // minutes
  const [breakStartTier, setBreakStartTier] = useState(1);
  const [breakRoutine, setBreakRoutine] = useState<BreakRoutine | null>(null);
  const [nowTick, setNowTick] = useState(0); // live clock while resting
  const [stats, setStats] = useState<SessionStats>(emptySessionStats);
  const [history, setHistory] = useState<DayRecord[]>([]);
  const [characterHidden, setCharacterHidden] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [focus, setFocusState] = useState<FocusSession | null>(null);
  const [quietUntil, setQuietUntil] = useState(0);
  const [sprout, setSprout] = useState<Plant | null>(null);
  const [petRequest, setPetRequest] = useState<PetRequest>();
  const [tantrum, setTantrum] = useState<number | null>(null);
  const [ultimate, setUltimate] = useState(false);
  const [scene, setScene] = useState<{ kind: SceneKind; label: string }>({ kind: "mad", label: "" });
  const [activityHydrated, setActivityHydrated] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  const companion = useCompanion();
  const speech = useSpeech();
  const prefs = useMemo(() => preferences(settings), [settings]);
  const character: CompanionId = knownCompanion(settings?.character);
  const characterSize = settings ? petSize(settings.character_size) : DEFAULT_PET_SIZE;
  const position = settings ? POSITIONS[settings.position] ?? "bl" : "";
  const petName = prefs.pet_name || CAST[character].name;
  const windowContext = useWindowContext(prefs.window_titles);
  // A title only describes the app it was read from.
  const sameApp = windowContext.bundle_id !== null && windowContext.bundle_id === frontmostApp?.bundle_id;
  const appIsPrivate = frontmostApp?.category_label === PRIVATE_LABEL;
  const place = useMemo<Place | null>(() => sameApp && !appIsPrivate ? placeFrom(windowContext.title, windowContext.browser, prefs.site_rules) : null,
    [sameApp, appIsPrivate, windowContext.title, windowContext.browser, prefs.site_rules]);
  const label = place?.category ?? frontmostApp?.category_label;
  // Full-screen video: step out of the picture until it's over.
  const ducked = watching && sameApp && windowContext.fullscreen;
  const concealed = characterHidden || ducked;
  const onBreak = breakTime !== 0;
  const panelOpen = panel !== null;
  const overlayHidden = panelOpen || overlaySuppressed;
  const windDown = windDownPhase(new Date(), { enabled: prefs.wind_down_enabled, bedtime: prefs.bedtime });

  /* Everything timers and listeners need, always current without re-subscribing. */
  const live = {
    label, place, app: frontmostApp, character, tantrum, onBreak, panelOpen, characterHidden: concealed, card, prefs, quietUntil, ignoredAt, stats, history, petName, windDown,
    timePassed, timeEvents, breakTime, breakNeeded, breakStartTier, breakRoutine, speaking: speech.shown !== "",
    ready: companion.ready,
  };
  const ref = useRef(live);
  ref.current = live;
  const activityRef = useRef<ActivitySnapshot>({ timePassed, timeEvents, stats, paused: characterHidden, history });
  activityRef.current = { timePassed, timeEvents, stats, paused: characterHidden, history };

  const pending = useRef(new Map<Prompt, number>());
  const snooze = useRef<Snooze | null>(null);
  const status = useRef({ idle: 0, inCall: false, watching: false, returnedAt: 0 });
  const front = useRef<{ app: string | null; since: number }>({ app: null, since: Date.now() });
  const promptCheck = useRef(false);
  const suppressReminderUntil = useRef(0);
  const focusRef = useRef<FocusSession | null>(null);
  const focusEndAsked = useRef(false);
  const focusSavedAt = useRef(0);
  const wandering = useRef(new Wandering());
  const lastPlace = useRef<{ place: Place; at: number } | null>(null);
  const placeBeforeBreak = useRef<Place | null>(null);
  const distraction = useRef(new RollingUse());
  const lastDistractionNudge = useRef(0);
  const rhythms = useRef(newRhythmClock());
  const breakWasAuto = useRef(false);
  const inputStreak = useRef(0);
  const lastMomentAt = useRef(0);
  const askedNight = useRef({ soon: "", late: "" });
  const tantrumTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const trayTitle = useRef<string | null>(null);
  const closeBarRef = useRef<() => void>(() => {});
  const lastPetAt = useRef(0);
  const plays = useRef(0);

  const { say, pin, clear } = speech;
  /** Puts a card away unanswered. A finished session still wants its answer, so it asks again. */
  const dropCard = useCallback(() => {
    if (ref.current.card?.kind === "focus-end") focusEndAsked.current = false;
    setCard(null);
  }, []);
  const clearOverlay = useCallback(() => { clear(); dropCard(); }, [clear, dropCard]);
  const setFocus = useCallback((next: FocusSession | null, save = true) => {
    focusRef.current = next;
    setFocusState(next);
    if (save) { focusSavedAt.current = Date.now(); companion.update(s => ({ ...s, focus: next })); }
  }, [companion.update]);

  /* ---------- mad on your behalf ---------- */
  const endTantrum = useCallback(() => {
    clearTimeout(tantrumTimer.current);
    ref.current = { ...ref.current, tantrum: null };
    setTantrum(null);
  }, []);
  useEffect(() => () => clearTimeout(tantrumTimer.current), []);
  /** A few seconds of fury at whatever is in front. Never at the person. */
  const throwTantrum = useCallback((after?: () => void, allOut = false) => {
    const l = ref.current;
    if (l.tantrum !== null || l.onBreak || l.panelOpen || l.characterHidden) return false;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Full power only when asked for, and never over a call or for someone who wants less motion.
    const full = allOut && l.prefs.throw_things && !still && !status.current.inCall;
    const startedAt = Date.now();
    setUltimate(full);
    ref.current = { ...l, tantrum: startedAt };
    clear();
    setIgnoredAt(null);
    setTantrum(startedAt);
    companion.update(s => ({ ...s, tantrums: s.tantrums + 1 }));
    const body = document.querySelector("[data-pet-body]")?.getBoundingClientRect();
    if (l.prefs.throw_things && body && !still) {
      void invoke("throw_at_front_window", { character: l.character, startedAt, petX: body.left + body.width / 2, petY: body.top + body.height * .45, ultimate: full }).catch(console.error);
    }
    clearTimeout(tantrumTimer.current);
    tantrumTimer.current = setTimeout(() => { endTantrum(); if (!ref.current.onBreak && !ref.current.panelOpen && !ref.current.characterHidden) after?.(); }, tantrumLength(l.character, full));
    return true;
  }, [clear, companion.update, endTantrum]);

  /* ---------- panels ---------- */
  const suppressOverlay = useCallback(() => {
    document.documentElement.classList.add(OVERLAY_SUPPRESS_CLASS);
    flushSync(() => setOverlaySuppressed(true));
  }, []);
  const releaseOverlay = useCallback(() => {
    document.documentElement.classList.remove(OVERLAY_SUPPRESS_CLASS);
    setOverlaySuppressed(false);
  }, []);

  const openPanel = useCallback(async (id: PanelId) => {
    closeBarRef.current();
    endTantrum();
    clearOverlay();
    suppressOverlay();
    try {
      await invoke("open_settings");
      flushSync(() => setPanel(id));
    } catch (err) {
      console.error(err);
    } finally {
      releaseOverlay();
    }
  }, [clearOverlay, endTantrum, suppressOverlay, releaseOverlay]);

  const closePanel = useCallback(async (after?: () => void) => {
    suppressOverlay();
    clearOverlay();
    setPanel(null);
    try {
      await invoke("close_settings");
    } catch (err) {
      console.error(err);
    } finally {
      releaseOverlay();
      after?.();
    }
  }, [clearOverlay, suppressOverlay, releaseOverlay]);
  const close = useCallback(() => { void closePanel(); }, [closePanel]);

  const refreshSettings = useCallback(async () => {
    const latest = await invoke<Settings>("get_settings");
    setSettings(latest);
    return latest;
  }, []);

  // Settings are re-read whenever a panel opens or closes, since panels are what change them.
  useEffect(() => {
    let cancelled = false;
    void invoke<Settings>("get_settings").then(latest => {
      if (cancelled) return;
      setSettings(latest);
      if (!ref.current.panelOpen) applyTheme(latest.theme ?? "bamboo");
    }).catch(err => console.error("Failed to refresh settings:", err));
    return () => { cancelled = true; };
  }, [panel]);

  // Each of the cast is printed on its own paper.
  useEffect(() => { document.documentElement.dataset.pet = character; }, [character]);

  // First launch: show onboarding once settings are loaded.
  useEffect(() => {
    let cancelled = false;
    void invoke<Settings>("get_settings").then(latest => {
      if (!cancelled && !latest.onboarding_complete) void openPanel("onboarding");
    }).catch(err => console.error("Failed to load settings:", err));
    return () => { cancelled = true; };
  }, [openPanel]);

  /* ---------- activity: load, save ---------- */
  const restoreActivity = useCallback((snapshot: ActivitySnapshot) => {
    activityRef.current = snapshot;
    setTimePassed(snapshot.timePassed);
    setTimeEvents(snapshot.timeEvents);
    setStats(snapshot.stats);
    setHistory(snapshot.history);
  }, []);

  useEffect(() => {
    void Promise.all([invoke<ActivitySnapshot>("get_activity"), invoke<Settings>("get_settings")]).then(([saved, latest]) => {
      const loaded = preferences(latest);
      const restored = resumeAfterRestart(rollOverActivity(saved, Date.now(), loaded.history_days));
      const tier = restored.timePassed > 0 ? tierFromWorkSeconds(restored.timePassed, loaded.reminder_interval_mins) : restored.timeEvents;
      restoreActivity({ ...restored, timeEvents: tier });
      if (restored.paused) setCharacterHidden(true);
      setActivityHydrated(true);
    }).catch(err => {
      // Do not overwrite unreadable on-disk history with empty stats.
      console.error("Failed to load saved activity; autosave disabled:", err);
      setActivityError("Your saved activity could not be read. Nudge has stopped tracking and will not overwrite it. Restart after checking the activity file, or erase it in Settings → General.");
    });
  }, [restoreActivity]);

  useEffect(() => {
    if (!activityHydrated) return;
    const id = setInterval(() => {
      void invoke("save_activity", { activity: activityRef.current })
        .then(() => setActivityError(null))
        .catch(err => {
          console.error("Failed to save activity:", err);
          setActivityError("Activity could not be saved. Check available disk space; your last saved snapshot remains on disk.");
        });
    }, 5000);
    return () => clearInterval(id);
  }, [activityHydrated]);

  const eraseHistory = useCallback(async () => {
    const empty = await invoke<ActivitySnapshot>("erase_activity");
    restoreActivity({ ...empty, stats: emptySessionStats(), timePassed: 0, timeEvents: 1, history: [] });
    distraction.current.clear();
    wandering.current.clear();
    lastPlace.current = placeBeforeBreak.current = null;
    focusRef.current = null;
    setFocusState(null);
    pending.current.clear();
    await companion.replace(forgetHistory(companion.latest.current));
    setActivityError(null);
    setActivityHydrated(true);
  }, [companion.replace, companion.latest, restoreActivity]);

  // Pick up a focus session that was running when nudge last quit.
  useEffect(() => {
    if (!companion.ready) return;
    const saved = companion.latest.current.focus;
    if (!saved || focusRef.current) return;
    if (saved.endsAt !== null ? Date.now() - saved.endsAt > 30 * MINUTE : Date.now() - saved.startedAt > 12 * 3600_000) {
      companion.update(s => ({ ...s, focus: null, focusLog: addRecord(s.focusLog, toRecord(saved, "ended")) }));
    } else {
      setFocus(saved, false);
    }
  }, [companion.ready, companion.latest, companion.update, setFocus]);

  /* ---------- nudge bookkeeping ---------- */
  const recordNudge = useCallback((outcome: NudgeOutcome) => {
    setStats(prev => ({ ...prev, nudges: [...(prev.nudges ?? []), { hour: new Date().getHours(), outcome }].slice(-100) }));
  }, []);

  const suggestions = useCallback(() => rankRoutines({
    workSeconds: activityRef.current.timePassed,
    energy: energyFromTier(activityRef.current.timeEvents),
    hour: new Date().getHours(),
    category: ref.current.label,
    memory: companion.latest.current.routines,
  }), [companion.latest]);

  /* ---------- breaks ---------- */
  const startBreak = useCallback((options: { auto?: boolean; sleep?: boolean; routine?: BreakRoutine; idleSeconds?: number; resumeMinutes?: number } = {}) => {
    if (ref.current.breakTime !== 0) return;
    const { timePassed: worked, timeEvents: events } = activityRef.current;
    const key = ref.current.label ?? "Unknown";
    // Someone who walked away five minutes ago has been resting since then, not working.
    const away = options.auto ? Math.min(Math.floor(options.idleSeconds ?? 0), worked) : 0;
    const startTier = Math.max(1, Math.abs(events));
    const now = Date.now();
    const startedAt = now - away * 1000;
    const restMinutes = options.routine ? options.routine.durationSeconds / 60
      : options.resumeMinutes ?? restMinutesFor(worked - away, events);

    if (ref.current.card?.kind === "reminder") recordNudge("taken");
    suppressReminderUntil.current = now + 5000;
    pending.current.delete("reminder");
    snooze.current = null;
    setHold(null);
    setIgnoredAt(null);
    endTantrum();
    dropCard();
    breakWasAuto.current = !!options.auto;
    inputStreak.current = 0;
    placeBeforeBreak.current = ref.current.place;
    ref.current = { ...ref.current, breakTime: startedAt, onBreak: true, breakNeeded: restMinutes, breakStartTier: startTier, breakRoutine: options.routine ?? null };
    setBreakTime(startedAt);
    setNowTick(now);
    setBreakNeeded(restMinutes);
    setBreakStartTier(startTier);
    setBreakRoutine(options.routine ?? null);

    if (options.sleep) say("Your Mac is sleeping. I’ll keep your break going.");
    else if (options.auto) say("Stepping away? I’ll rest too.");
    else if (options.resumeMinutes) say("Back to resting.");
    else if (!options.routine) say(CAST[ref.current.character].resting(minutesText(restMinutes)));
    if (!options.auto) playSound("start", ref.current.prefs.sounds);

    setStats(prev => {
      const categorySeconds = { ...prev.categorySeconds };
      const moved = Math.min(away, categorySeconds[key] ?? 0);
      if (moved) categorySeconds[key] -= moved;
      const hourlySeconds = prev.hourlySeconds?.length ? [...prev.hourlySeconds] : prev.hourlySeconds;
      const hour = new Date(now).getHours();
      if (moved && hourlySeconds) hourlySeconds[hour] = Math.max(0, hourlySeconds[hour] - moved);
      return {
        ...prev, categorySeconds, hourlySeconds,
        restSeconds: prev.restSeconds + moved,
        longestStretchSeconds: prev.longestStretchSeconds === prev.currentStretchSeconds
          ? Math.max(0, prev.longestStretchSeconds - moved) : prev.longestStretchSeconds,
        breaksTaken: prev.breaksTaken + (options.resumeMinutes ? 0 : 1),
        breaksInterrupted: Math.max(0, prev.breaksInterrupted - (options.resumeMinutes ? 1 : 0)),
        currentStretchSeconds: 0,
      };
    });
    setTimePassed(0);
    setTimeEvents(-startTier);
    distraction.current.clear();
    lastDistractionNudge.current = 0;
    void invoke("reset_reminder_timer").catch(console.error);
  }, [dropCard, endTantrum, recordNudge, say]);

  /** Ends the current break. `interrupted` means the person came back to the keyboard. */
  const endBreak = useCallback((interrupted: boolean) => {
    const { breakTime: startedAt, breakNeeded: needed, breakStartTier: tier, breakRoutine: routine } = ref.current;
    if (startedAt === 0) return;
    const now = Date.now();
    const restedMs = now - startedAt;
    const neededMs = needed * MINUTE;
    const progress = neededMs > 0 ? Math.min(1, restedMs / neededMs) : 1;

    // Keep the reminder clock from clobbering the restored energy.
    suppressReminderUntil.current = now + 6000;
    ref.current = { ...ref.current, breakTime: 0, onBreak: false, breakRoutine: null };
    rhythms.current = rhythmsAfterBreak(rhythms.current);
    setTimeEvents(tierFromBreakProgress(tier, progress));
    setBreakRoutine(null);
    setBreakTime(0);
    stopSpeaking();
    void invoke("reset_reminder_timer").catch(console.error);

    // Coming back fully rested isn't an interruption.
    if (interrupted && progress < 1) setStats(prev => ({ ...prev, breaksInterrupted: prev.breaksInterrupted + 1 }));

    const drops = dropsForRest({ seconds: restedMs / 1000, complete: progress >= (routine ? 0.5 : 1), guided: !!routine });
    const before = companion.latest.current;
    const result = rested(before, drops, now);
    let next = result.state;
    if (routine && progress >= 0.5) next = rememberRoutine(next, routine.id, now);
    companion.update(() => next);
    const event = result.events.find(e => e.kind === "bloomed") ?? result.events[result.events.length - 1];
    if (event) setSprout(event.plant);
    playSound(event?.kind === "bloomed" ? "bloom" : "end", ref.current.prefs.sounds && (!!event || !interrupted));

    const minutesLeft = Math.ceil((neededMs - restedMs) / MINUTE);
    const task = focusRef.current && !focusOver(focusRef.current, now) ? focusRef.current.text : "";
    // Only worth saying after long enough to have lost the thread, and never for a distraction.
    const left = placeBeforeBreak.current;
    const thread = !task && left?.page && restedMs >= 2 * MINUTE && !isDistractingCategory(left.category ?? "") ? left.page : "";
    const long = restedMs >= 20 * MINUTE ? `Welcome back. That was a real break: ${formatDuration(restedMs / 1000)}.` : "";
    const base = long || (progress >= 1 ? castSays(ref.current.character, "rested")
      : interrupted ? "Short and sweet." : "A little rest goes a long way.");
    say([base, event && gardenLine(event), task && `You were on “${task}”.`, thread && `You were in “${thread.length > 48 ? `${thread.slice(0, 47)}…` : thread}”.`].filter(Boolean).join(" "));

    const answers = routine && next.routines[routine.id];
    if (routine && progress >= 1 && answers && answers.helped + answers.notReally < 4) setCard({ kind: "helped", routine });
    else if (interrupted && !routine && !breakWasAuto.current && minutesLeft >= 1 && restedMs >= 20_000 && progress < 1) setCard({ kind: "resume", minutes: minutesLeft });
  }, [companion.latest, companion.update, say]);

  useEffect(() => {
    if (!sprout) return;
    const id = setTimeout(() => setSprout(null), 9000);
    return () => clearTimeout(id);
  }, [sprout]);

  const startRoutine = useCallback((routine?: BreakRoutine) => {
    if (ref.current.panelOpen) void closePanel(() => startBreak({ routine }));
    else startBreak({ routine });
  }, [closePanel, startBreak]);

  // While on break, watch for keyboard and mouse activity.
  useEffect(() => {
    if (breakTime === 0) return;
    const GRACE_MS = 5000; // ignore the input that started the break
    const POLL_MS = 2000;
    const begun = Date.now();
    let lastRemark = 0;
    const id = setInterval(() => {
      const now = Date.now();
      if (now - begun < GRACE_MS) return;
      if (breakRoutine) {
        if (now - breakTime >= breakRoutine.durationSeconds * 1000) endBreak(false);
        return;
      }
      invoke<number>("get_seconds_since_last_input").then(idle => {
        // One bump of the desk isn't coming back; two checks in a row is.
        inputStreak.current = idle * 1000 < POLL_MS ? inputStreak.current + 1 : 0;
        if (inputStreak.current >= 2) endBreak(true);
      }).catch(console.error);

      if (now - lastRemark >= 60_000 && now - begun > 20_000) {
        lastRemark = now;
        const left = breakNeeded * MINUTE - (now - breakTime);
        say(left <= 0 ? "You can finish your break now!" : left >= MINUTE ? `${minutesText(Math.ceil(left / MINUTE))} remaining` : `${Math.ceil(left / 1000)} seconds remaining`);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [breakTime, breakNeeded, breakRoutine, endBreak, say]);

  // 1s clock while resting so the energy meter and the coach are live.
  useEffect(() => {
    if (breakTime === 0) return;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [breakTime]);

  // Sleeping or locking the Mac is stepping away, without waiting to notice.
  useEffect(() => {
    if (!activityHydrated) return;
    let cancelled = false;
    const stops: (() => void)[] = [];
    const on = (event: string, sleep: boolean) => void listen(event, () => startBreak({ auto: true, sleep }))
      .then(fn => { if (cancelled) fn(); else stops.push(fn); });
    on("system-will-sleep", true);
    on("screen-locked", false);
    return () => { cancelled = true; stops.forEach(stop => stop()); };
  }, [activityHydrated, startBreak]);

  /* ---------- focus sessions ---------- */
  /** Visible to the next check at once, so two prompts can never open over each other. */
  const showCard = useCallback((next: Card) => {
    ref.current = { ...ref.current, card: next };
    setCard(next);
  }, []);

  const beginFocus = useCallback((text: string, minutes: number | null) => {
    focusEndAsked.current = false;
    pending.current.delete("focus-end");
    setFocus(startFocus(text, minutes, Date.now()));
    void closePanel(() => say(minutes === null ? "Let’s begin. I’ll hold the sign." : `${minutes} minutes. I’ll hold the sign.`));
  }, [closePanel, say, setFocus]);

  /** Starting is the worst part, so the pet starts with you. */
  const faceTogether = useCallback((target: Target | null) => {
    focusEndAsked.current = false;
    pending.current.delete("focus-end");
    setCard(null);
    setFocus({ ...startFocus(target?.label ?? "This", TOGETHER_MINUTES, Date.now()), dreaded: true });
    say(`${TOGETHER_MINUTES} minutes. Then we’re allowed to stop.`);
  }, [say, setFocus]);

  const moreFocus = useCallback((minutes: number) => {
    if (!focusRef.current) return;
    focusEndAsked.current = false;
    pending.current.delete("focus-end");
    setFocus(extendFocus(focusRef.current, minutes, Date.now()));
  }, [setFocus]);

  const finishFocus = useCallback((outcome: FocusOutcome) => {
    const session = focusRef.current;
    setCard(null);
    if (!session) return;
    const now = Date.now();
    pending.current.delete("focus-end");
    pending.current.delete("drift");
    focusRef.current = null;
    setFocusState(null);
    companion.update(s => {
      const logged: CompanionState = { ...s, focus: null, focusLog: addRecord(s.focusLog, toRecord(session, outcome)) };
      if (session.dreaded && outcome === "done") { logged.beaten += 1; logged.grudges = beatGrudge(logged.grudges, session.text); }
      return session.focusedSeconds >= 600 ? care(logged, "focus", now) : logged;
    });
    if (session.focusedSeconds >= 60) setStats(prev => ({ ...prev, focusSessions: (prev.focusSessions ?? 0) + 1 }));
    void Promise.all(session.parked.map(note => invoke("add_pending_note", { note }))).catch(console.error);
    const parked = session.parked.length ? ` ${session.parked.length === 1 ? "Your parked thought is" : "Your parked thoughts are"} in Notes.` : "";
    if (outcome === "done") {
      setPetRequest(previous => ({ id: (previous?.id ?? 0) + 1, kind: "bubbles" }));
      playSound("end", ref.current.prefs.sounds);
    }
    say((outcome === "done" ? `Done: “${session.text}”. Well earned.`
      : outcome === "partly" ? "Some of it is more than none of it."
      : outcome === "stuck" ? "Stuck happens. A short walk often loosens it." : "Okay. Sign down.") + parked);
    if (session.dreaded && outcome === "done") showCard({ kind: "won", label: session.text });
    if (outcome === "stuck" && !pending.current.has("reminder")) pending.current.set("reminder", now);
  }, [companion.update, say, showCard]);

  /* ---------- prompts ---------- */
  const rulesForPrompt = useCallback((kind: Prompt): PromptRules => {
    const { prefs: p, history: days, stats: today } = ref.current;
    const answers = [...days.slice(-21).flatMap(d => d.nudges ?? []), ...(today.nudges ?? [])];
    const style = rulesFor(p.nudge_style, receptivity(answers, new Date().getHours()));
    switch (kind) {
      case "focus-end": return { maxWaitMs: MINUTE, watchingMaxWaitMs: MINUTE, focusMaxWaitMs: 0, ignoreQuiet: true, ignoreHours: true };
      case "drift": return { maxWaitMs: 15_000, watchingMaxWaitMs: 15_000, focusMaxWaitMs: 0, ignoreHours: true };
      case "bedtime": return { ...style, focusMaxWaitMs: 30 * MINUTE, ignoreHours: true };
      case "reminder": return style;
      default: return { maxWaitMs: Infinity, watchingMaxWaitMs: Infinity, focusMaxWaitMs: Infinity };
    }
  }, []);

  const present = useCallback(async (kind: Prompt, because: ShowReason) => {
    const { prefs: p, stats: today, label: category } = ref.current;
    pending.current.delete(kind);
    clear();
    switch (kind) {
      case "focus-end": if (focusRef.current) showCard({ kind: "focus-end" }); return;
      case "drift": {
        const site = ref.current.place?.site ?? null;
        if (!focusRef.current || !category) return;
        showCard({ kind, allow: site ?? category, site });
        // The one place it gets cross without being asked: at what interrupted you.
        if (p.chattiness !== "quiet") throwTantrum();
        return;
      }
      case "bedtime": if (ref.current.windDown === "late") showCard({ kind }); return;
      case "letter": companion.update(s => ({ ...s, letterOn: letterWeek(Date.now()) })); showCard({ kind }); return;
      case "found": {
        const accessory = newlyFound(companion.latest.current, Date.now());
        if (!accessory) return;
        companion.update(s => ({ ...s, found: [...s.found, accessory] }));
        showCard({ kind, accessory });
        return;
      }
      case "reminder": {
        setHold(null);
        snooze.current = null;
        const note = (await invoke<string | null>("pop_pending_note"))?.trim();
        if (note) pin(note);
        else if (shouldDozeInstead(p.nudge_style, today.nudges ?? [])) {
          setIgnoredAt(Date.now() - 5 * MINUTE);
          say("Pet me when you’d like a pause.");
        } else {
          showCard({ kind, because });
          playSound("step", p.sounds);
        }
      }
    }
  }, [clear, companion.latest, companion.update, pin, say, showCard, throwTantrum]);

  const readStatus = useCallback(async (): Promise<PresenceStatus> => {
    const latest = await invoke<PresenceStatus>("get_auto_break_status");
    const now = Date.now();
    if (status.current.idle >= 60 && latest.idle_seconds < 12) status.current.returnedAt = now;
    status.current = { ...status.current, idle: latest.idle_seconds, inCall: !!latest.in_call, watching: !!latest.watching };
    setMusicPlaying(!!latest.music_playing);
    setWatching(!!latest.watching);
    return latest;
  }, []);

  const checkPrompts = useCallback(async () => {
    // Ask how a session went before delivering whatever it was holding back.
    if (focusRef.current && !focusEndAsked.current && focusOver(focusRef.current, Date.now())) {
      focusEndAsked.current = true;
      pending.current.set("focus-end", Date.now());
    }
    if (!pending.current.size || promptCheck.current) return;
    promptCheck.current = true;
    try {
      const latest = await readStatus();
      const now = Date.now();
      const p = ref.current.prefs;
      for (const kind of PROMPTS) {
        const dueAt = pending.current.get(kind);
        if (dueAt === undefined) continue;
        if (kind === "drift" && !isDistractingCategory(ref.current.label ?? "")) { pending.current.delete(kind); continue; }
        const decision = decide({
          now, dueAt, idleSeconds: latest.idle_seconds, app: front.current.app, appSince: front.current.since,
          returnedAt: status.current.returnedAt, onBreak: ref.current.onBreak, panelOpen: ref.current.panelOpen,
          hidden: ref.current.characterHidden, promptOpen: ref.current.card !== null, quietUntil: ref.current.quietUntil,
          offHours: !withinActiveHours(new Date(now), { enabled: p.active_hours_enabled, start: p.active_start, end: p.active_end, weekends: p.active_weekends }),
          snooze: kind === "reminder" ? snooze.current : null, inCall: !!latest.in_call, watching: !!latest.watching,
          focusing: focusRef.current !== null && !focusOver(focusRef.current, now), rules: rulesForPrompt(kind),
        });
        if (decision.show) { await present(kind, decision.because); return; }
        if (kind === "reminder") setHold(decision.because);
      }
    } catch (err) {
      console.error("Failed to check whether a prompt is timely:", err);
    } finally {
      promptCheck.current = false;
    }
  }, [present, readStatus, rulesForPrompt]);

  const queue = useCallback((kind: Prompt) => {
    if (!pending.current.has(kind)) pending.current.set(kind, Date.now());
    void checkPrompts();
  }, [checkPrompts]);

  useEffect(() => {
    const id = setInterval(() => void checkPrompts(), PROMPT_POLL_MS);
    return () => clearInterval(id);
  }, [checkPrompts]);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    listen("show-reminder", () => {
      if (ref.current.onBreak || Date.now() < suppressReminderUntil.current) return;
      if (ref.current.card?.kind === "reminder") return;
      queue("reminder");
    }).then(fn => { if (cancelled) fn(); else stop = fn; });
    return () => { cancelled = true; stop?.(); };
  }, [queue]);

  // Unanswered cards tidy themselves away. An ignored nudge makes the pet sleepy instead.
  useEffect(() => {
    if (!card) return;
    const wait = card.kind === "reminder" ? STYLE_RULES[prefs.nudge_style].foldAfterMs : CARD_LIFETIME_MS[card.kind] ?? null;
    if (wait === null) return;
    const id = setTimeout(() => {
      if (card.kind === "focus-end") { finishFocus("ended"); return; }
      setCard(null);
      if (card.kind === "reminder") { recordNudge("missed"); setIgnoredAt(current => current ?? Date.now()); }
    }, wait);
    return () => clearTimeout(id);
  }, [card, prefs.nudge_style, recordNudge, finishFocus]);

  const later = useCallback((next: Snooze, reply: string) => {
    snooze.current = next;
    pending.current.set("reminder", Date.now());
    recordNudge("later");
    setIgnoredAt(null);
    setCard(null);
    say(reply);
  }, [recordNudge, say]);

  /* ---------- small moments ---------- */
  const letter = useMemo<Letter | null>(() => panel !== "summary" ? null : writeLetter({
    history, focusLog: companion.state.focusLog, petName, blooms: blooms(companion.state.plants), now: Date.now(),
    settings: { reminder_interval_mins: prefs.reminder_interval_mins, wind_down_enabled: prefs.wind_down_enabled, rhythm_eyes: prefs.rhythm_eyes },
    // The letter is written when the panel opens and stays put while it's being read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [panel]);

  const smallMoments = useCallback(() => {
    const l = ref.current;
    if (!l.ready || l.onBreak || l.panelOpen || l.characterHidden || l.card || l.speaking) return;
    const now = Date.now(), date = new Date(now), state = companion.latest.current;
    const { idle, inCall, watching } = status.current;
    if (inCall || watching || idle > 30 || now < l.quietUntil) return;
    const focusing = focusRef.current !== null && !focusOver(focusRef.current, now);

    if (state.greetedOn !== dateKey(now) && date.getHours() >= 4) {
      const first = state.greetedOn === "";
      companion.update(s => ({ ...care(s, "hello", now), greetedOn: dateKey(now), tomorrow: "" }));
      if (state.tomorrow) pin(`First thing today: ${state.tomorrow}`);
      else if (first) say(l.prefs.pet_name ? `Hi! I’m ${l.petName}. Rest with me and we’ll grow a garden.` : CAST[l.character].hello);
      else say(pick(date.getHours() < 12 ? ["Good morning.", "Morning! Ready when you are.", "Oh good, you’re here."] : ["Hello again.", "There you are.", "Good to see you."]));
      return;
    }
    if (focusing || l.tantrum !== null) return;
    // Something it promised to stay mad at.
    const grudge = l.prefs.chattiness === "quiet" ? null : findGrudge(state.grudges, l.place, l.app);
    if (grudge && grudgeDue(grudge, now) && now - front.current.since >= BRISTLE_MS) {
      companion.update(s => ({ ...s, grudges: facedGrudge(s.grudges, grudge.key, now) }));
      throwTantrum(() => say(againLine()));
      return;
    }
    if (l.windDown === "soon" && askedNight.current.soon !== nightKey(date)) {
      askedNight.current.soon = nightKey(date);
      say(`Getting sleepy. Bedtime’s at ${formatMinuteOfDay(l.prefs.bedtime)}.`);
      return;
    }
    if (l.windDown === "late" && askedNight.current.late !== nightKey(date)) {
      askedNight.current.late = nightKey(date);
      queue("bedtime");
      return;
    }
    const secondsToNudge = Math.max(0, l.prefs.reminder_interval_mins * 60 - activityRef.current.timePassed);
    const on = (["eyes", "posture", "water"] as RhythmId[]).filter(id => l.prefs[`rhythm_${id}`]);
    const rhythm = dueRhythm(rhythms.current, on, secondsToNudge);
    if (rhythm && idle >= 3) {
      rhythms.current = resetRhythm(rhythms.current, rhythm);
      say(pick(RHYTHMS[rhythm].lines));
      return;
    }
    if (now - lastMomentAt.current < 3 * MINUTE) return;
    const milestone = nextMilestone(state, now);
    if (milestone) {
      lastMomentAt.current = now;
      companion.update(s => ({ ...s, milestones: [...s.milestones, milestone.id] }));
      say(`${milestone.text}!`);
    } else if (newlyFound(state, now)) {
      lastMomentAt.current = now;
      queue("found");
    } else if (state.letterOn !== letterWeek(now) && date.getHours() >= 8 && !pending.current.has("letter")) {
      lastMomentAt.current = now;
      const ready = writeLetter({ history: l.history, focusLog: state.focusLog, petName: l.petName, blooms: 0, now, settings: l.prefs });
      if (ready) queue("letter");
    }
  }, [companion.latest, companion.update, pin, queue, say, throwTantrum]);

  // Presence every few seconds: automatic breaks, music, and small moments.
  useEffect(() => {
    if (!activityHydrated) return;
    const id = setInterval(() => {
      void readStatus().then(latest => {
        if (latest.should_auto_break && !ref.current.onBreak && !ref.current.panelOpen) startBreak({ auto: true, idleSeconds: latest.idle_seconds });
        else smallMoments();
      }).catch(console.error);
    }, STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [activityHydrated, readStatus, smallMoments, startBreak]);

  /* ---------- the one-second clock ---------- */
  useEffect(() => {
    if (!activityHydrated) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void listen("time-passed", () => {
      const now = Date.now();
      // Crossed midnight: archive today and start a fresh day.
      const rolled = rollOverActivity(activityRef.current, now, ref.current.prefs.history_days ?? DEFAULT_HISTORY_DAYS);
      if (rolled !== activityRef.current) { restoreActivity(rolled); distraction.current.clear(); return; }

      const resting = ref.current.onBreak;
      const key = ref.current.label ?? "Unknown";
      const distracting = isDistractingCategory(key);
      const session = focusRef.current;
      let focused = false;
      if (session) {
        if (!focusOver(session, now) && status.current.idle < 120) {
          // A video about your essay is your essay.
          const here = ref.current.place;
          const related = !!here && onTopic(session.text, here.page);
          const ticked = tickFocus(session, { category: here?.site ?? key, distracting: distracting && !related, resting }, now);
          focused = ticked.session.focusedSeconds > session.focusedSeconds;
          focusRef.current = ticked.session;
          if (now - focusSavedAt.current > 30_000) setFocus(ticked.session);
          if (ticked.drifted) queue("drift");
        }
      }
      if (!resting) {
        setTimePassed(prev => {
          const next = prev + 1;
          setTimeEvents(tier => tier < 0 ? tier : tierFromWorkSeconds(next, ref.current.prefs.reminder_interval_mins));
          return next;
        });
        rhythms.current = tickRhythms(rhythms.current);
        const site = ref.current.place?.site;
        if (site && distracting) {
          const visits = wandering.current.visit(site, now);
          const l = ref.current;
          if (visits && l.prefs.chattiness !== "quiet" && !l.card && !l.panelOpen && !l.characterHidden && !l.speaking && now >= l.quietUntil && !status.current.inCall && !session) {
            say(`Visit number ${visits} to ${site} today.`);
          }
        }
        if (distracting) {
          distraction.current.add(now);
          const limit = ref.current.prefs.distraction_limit_mins;
          const recent = recentDistraction(distraction.current, limit, now);
          const l = ref.current;
          if (distractionDue(recent, limit, lastDistractionNudge.current, now) && !l.characterHidden && !l.panelOpen && !l.card
            && !session && now >= l.quietUntil && !status.current.inCall) {
            lastDistractionNudge.current = now;
            say(pickDistractionNudge(key, recent));
          }
        }
      }
      setStats(prev => {
        if (resting) return { ...prev, restSeconds: prev.restSeconds + 1 };
        const stretch = prev.currentStretchSeconds + 1;
        const next = { ...prev, currentStretchSeconds: stretch, longestStretchSeconds: Math.max(prev.longestStretchSeconds, stretch) };
        if (focused) next.focusSeconds = (prev.focusSeconds ?? 0) + 1;
        if (key === PRIVATE_LABEL) return next; // counts toward a pause, but what it was isn't kept
        const hourlySeconds = prev.hourlySeconds?.length === 24 ? [...prev.hourlySeconds] : Array<number>(24).fill(0);
        hourlySeconds[new Date(now).getHours()] += 1;
        return { ...next, hourlySeconds, categorySeconds: { ...prev.categorySeconds, [key]: (prev.categorySeconds[key] ?? 0) + 1 } };
      });
    }).then(fn => { if (cancelled) fn(); else stop = fn; });
    return () => { cancelled = true; stop?.(); };
  }, [activityHydrated, queue, restoreActivity, say, setFocus]);

  // The app in front.
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      invoke<FrontmostApp | null>("get_frontmost_app").then(app => {
        if (cancelled) return;
        setFrontmostApp(old => old && app && old.bundle_id === app.bundle_id && old.name === app.name && old.category_label === app.category_label ? old : app);
      }).catch(console.error);
    };
    poll();
    const id = setInterval(poll, FRONT_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Moving to another app, or another site in the same one, is a change of task.
  const frontId = frontmostApp?.bundle_id ?? frontmostApp?.name ?? null;
  const frontKey = frontId && `${frontId}|${place?.site ?? ""}`;
  useEffect(() => {
    if (frontKey !== null && frontKey !== front.current.app) front.current = { app: frontKey, since: Date.now() };
  }, [frontKey]);

  // Remember where you are for a moment, and notice tabs flying past.
  useEffect(() => {
    if (!place?.page) return;
    const now = Date.now(), l = ref.current;
    lastPlace.current = { place, at: now };
    if (windowContext.browser && wandering.current.hop(now) && !l.onBreak && !l.card && !l.panelOpen && !l.characterHidden && !l.speaking
      && now >= l.quietUntil && !status.current.inCall && l.prefs.chattiness !== "quiet") {
      say(focusRef.current ? `Lots of tabs. Looking for something for “${focusRef.current.text}”?` : "Lots of tabs flying by. Lost something?");
    }
  }, [place?.page, place?.site, windowContext.browser, say]);

  /* ---------- actions ---------- */
  const handleAction = useCallback((action: string) => {
    switch (action) {
      case "pet-play": case "pet-treat":
        companion.update(s => care(s, action === "pet-play" ? "play" : "treat", Date.now()));
        setPetRequest(previous => ({
          id: (previous?.id ?? 0) + 1,
          kind: action === "pet-play"
            ? chooseAdventure(character, "play", 5, previous ? [previous.kind] : [], ["ball", "butterfly", "bubbles", "leaf", "peek"])
            : "snack",
        }));
        break;
      case "ugh": {
        const l = ref.current;
        if (l.onBreak) { say("Not now. We’re resting."); break; }
        const target = targetOf(l.place, l.app);
        // A nudge that was waiting for an answer waits its turn.
        if (l.card?.kind === "reminder") pending.current.set("reminder", Date.now());
        dropCard();
        // Rest is the power source. Worn out, all that comes out is a small tantrum.
        if (!canExpand(energyFromTier(l.timeEvents))) {
          throwTantrum(() => { if (!ref.current.card) { say(castSays(ref.current.character, "spent")); showCard({ kind: "spent" }); } });
          break;
        }
        throwTantrum(() => { if (!ref.current.card) showCard({ kind: "ugh", target }); }, true);
        break;
      }
      case "settings": void openPanel("settings"); break;
      case "break": void openPanel("breaks"); break;
      case "rest": startRoutine(); break;
      case "endbreak": endBreak(false); break;
      case "summary": setSummaryTab("today"); void openPanel("summary"); break;
      case "letter": setSummaryTab("letter"); void openPanel("summary"); break;
      case "focus": void openPanel("focus"); break;
      case "garden": setHomeTab("garden"); void openPanel("garden"); break;
      case "outfits": setHomeTab("outfits"); void openPanel("garden"); break;
      case "wrapup": void openPanel("wrapup"); break;
      case "note": void openPanel("notes"); break;
    }
  }, [character, companion.update, dropCard, endBreak, openPanel, say, showCard, startRoutine, throwTantrum]);

  const petAnchor = usePetLayout(position || "bl", overlayHidden || !settings, characterSize, settings?.monitor_index ?? 0);
  const petFacingPosition = petAnchor ? (petAnchor.left + characterSize / 2 > innerWidth / 2 ? "br" : "bl") : position || "bl";
  const openNotes = useCallback(() => handleAction("note"), [handleAction]);
  const { hovered, barOpen, closeBar, toggleBar, dragging, petted, attention, pet } = useCharacterInteraction(
    overlayHidden, handleAction, openNotes, concealed || overlaySuppressed,
  );
  closeBarRef.current = closeBar;

  // Petting is care, and it wakes a pet that dozed off waiting for an answer.
  useEffect(() => {
    if (!petted) return;
    // Two quick pets are an invitation to play; every other time, a snack.
    const now = Date.now();
    if (now - lastPetAt.current < 450) {
      lastPetAt.current = 0;
      plays.current += 1;
      handleAction(plays.current % 2 ? "pet-play" : "pet-treat");
      return;
    }
    lastPetAt.current = now;
    companion.update(s => care(s, "pet", Date.now()));
    if (drowsiness(ref.current.ignoredAt, Date.now()) >= 2 && !ref.current.onBreak && !ref.current.card) {
      setIgnoredAt(null);
      clear();
      setCard({ kind: "reminder", because: "woken" });
    }
  }, [petted, clear, companion.update, handleAction]);

  // Hop onto the window in use, once it has been in front for a moment.
  const busy = dragging || hovered || barOpen || overlayHidden || concealed || onBreak || card !== null || tantrum !== null;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    if (!prefs.sit_on_windows || !frontId) return;
    let cancelled = false;
    const id = setTimeout(() => {
      const body = document.querySelector("[data-pet-body]")?.getBoundingClientRect();
      if (busyRef.current || !body) return;
      setHopping(true);
      setTimeout(() => {
        if (cancelled) return;
        void invoke("perch_on_front_window", { footX: body.left + body.width / 2, footY: body.top + body.height * 0.9, bodySize: body.width })
          .catch(console.error).finally(() => setTimeout(() => setHopping(false), 60));
      }, 180);
    }, 2500);
    return () => { cancelled = true; clearTimeout(id); setHopping(false); };
  }, [prefs.sit_on_windows, frontId]);

  // Transparent NSPanels can leave stale WebKit layers on some Macs when UI unmounts.
  useEffect(() => {
    void invoke("invalidate_overlay_display").catch(console.error);
  }, [barOpen, overlayHidden, panelOpen, card]);

  const openSettings = useCallback(() => handleAction("settings"), [handleAction]);
  useSettingsShortcut(panel === "settings", openSettings, close);

  // Hide-character shortcut: hides only the character until pressed again.
  const toggleCharacterHidden = useCallback(() => {
    setCharacterHidden(prev => {
      if (!prev) { closeBar(); endTantrum(); clearOverlay(); }
      return !prev;
    });
  }, [closeBar, clearOverlay, endTantrum]);
  usePauseTrackingShortcut(toggleCharacterHidden);

  const quietNudges = useCallback((until: number) => {
    ref.current = { ...ref.current, quietUntil: until };
    setQuietUntil(until);
    dropCard();
    say(`Quiet until ${formatClockTime(until)}. I’ll keep track for you.`);
  }, [dropCard, say]);
  const resumeNudges = useCallback(() => {
    ref.current = { ...ref.current, quietUntil: 0 };
    setQuietUntil(0);
    say("I’m back. I’ll nudge you when it’s time.");
    void checkPrompts();
  }, [checkPrompts, say]);
  useEffect(() => {
    if (quietUntil === 0) return;
    const id = setTimeout(() => {
      ref.current = { ...ref.current, quietUntil: 0 };
      setQuietUntil(0);
      void checkPrompts();
    }, Math.max(0, quietUntil - Date.now()));
    return () => clearTimeout(id);
  }, [quietUntil, checkPrompts]);

  // Menu-bar item actions (see src-tauri/src/tray.rs).
  const trayAction = useRef<(action: string) => void>(() => {});
  trayAction.current = (action: string) => {
    const now = Date.now();
    switch (action) {
      case "toggle-companion": toggleCharacterHidden(); break;
      case "quiet-30": quietNudges(now + 30 * MINUTE); break;
      case "quiet-hour": quietNudges(now + 60 * MINUTE); break;
      case "quiet-3h": quietNudges(now + 180 * MINUTE); break;
      case "quiet-tomorrow": quietNudges(tomorrowMorning(now)); break;
      case "resume-nudges": resumeNudges(); break;
      default:
        if (characterHidden) toggleCharacterHidden();
        // A hidden pet has to be back on screen before it can make a scene.
        if (characterHidden && action === "ugh") setTimeout(() => handleAction(action), 100);
        else handleAction(action);
    }
  };
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void listen<string>("tray-action", event => trayAction.current(event.payload)).then(fn => { if (cancelled) fn(); else stop = fn; });
    return () => { cancelled = true; stop?.(); };
  }, []);

  /* ---------- chatter ---------- */
  const chat = useRef<() => void>(() => {});
  chat.current = () => {
    if (overlayHidden || concealed) { clear(); return; }
    // Don't interrupt a line that is still being said; wait for the next turn.
    if (onBreak || tantrum !== null || Date.now() < quietUntil || speech.shown !== "" || card || !label || prefs.chattiness === "quiet") return;
    if (focusRef.current || status.current.inCall || status.current.watching) return;
    const recent = recentDistraction(distraction.current, prefs.distraction_limit_mins, Date.now());
    const remembered = memories(companion.latest.current, history, Date.now());
    const here = siteLine(place);
    if (windDown !== "day") say(pick(SLEEPY_PHRASES));
    else if (isDistractingCategory(label) && recent >= prefs.distraction_limit_mins * 60) say(pickDistractionNudge(label, recent));
    else if (here && Math.random() < 0.4) say(here);
    else if (remembered.length && Math.random() < 0.2) say(pick(remembered));
    else if (Math.random() < 0.7) say(castThought(character, energyFromTier(timeEvents)));
    else if (Math.random() < 0.5) say(napLine(energyFromTier(timeEvents)));
    else say(pickPhrase(Math.min(5, Math.max(1, timeEvents)), label, timePassed));
  };
  // The interval lives in the effect body so its cleanup always clears it.
  useEffect(() => {
    if (overlayHidden || concealed) { clear(); return; }
    if (!settings || prefs.chattiness === "quiet") return;
    const share = prefs.chattiness === "chatty" ? 8 : 4;
    const delay = Math.max(1000, Math.round(prefs.reminder_interval_mins / share * MINUTE * (0.9 + Math.random() * 0.2)));
    const id = setInterval(() => chat.current(), delay);
    return () => clearInterval(id);
  }, [overlayHidden, concealed, clear, prefs.chattiness, prefs.reminder_interval_mins, settings === null]);

  /* ---------- derived for display ---------- */
  const now = Date.now();
  const energy = onBreak ? breakEnergy(breakStartTier, breakNeeded > 0 ? (nowTick - breakTime) / (breakNeeded * MINUTE) : 1) : energyFromTier(timeEvents);
  const elapsed = breakRoutine ? Math.max(0, (nowTick - breakTime) / 1000) : 0;
  const coachStep = breakRoutine ? stepAt(breakRoutine, elapsed) : null;
  const performing = coachStep && (coachStep.step.pose === "walkA" || coachStep.step.pose === "walkB")
    ? (Math.floor(elapsed) % 2 ? "walkB" : "walkA") : coachStep?.step.pose;
  const ignored = drowsiness(ignoredAt, now);
  const drowsy = focus || onBreak ? 0 : Math.max(ignored, windDown === "late" ? 2 : windDown === "soon" ? 1 : 0) as 0 | 1 | 2 | 3;
  const accessory: AccessoryId | null = windDown !== "day" && unlocked(companion.state, now).includes("nightcap") ? "nightcap" : companion.state.wearing;
  const focusing = focus !== null && !focusOver(focus, now);
  const interval = prefs.reminder_interval_mins * 60;
  const toNudge = interval > 0 ? interval - timePassed % interval : 0;
  const snoozed = snooze.current?.kind === "until" && snoozeActive(snooze.current, { now, app: null, appSince: 0 }) ? (snooze.current.at - now) / 1000 : 0;
  const nudgeMinutes = Math.max(1, Math.ceil((snoozed || toNudge) / 60));
  const hoverNote = onBreak ? (breakRoutine ? "A small reset" : "Take your time")
    : focusing ? focusTimeLabel(focus, now)
    : quietUntil > now ? `Quiet until ${formatClockTime(quietUntil)}`
    : (hold && pending.current.has("reminder") && holdLabel(hold)) || `Next nudge in ${nudgeMinutes} min`;

  // Read each step aloud, if asked to.
  const stepIndex = coachStep?.index ?? -1;
  useEffect(() => {
    if (!breakRoutine || stepIndex < 0) return;
    if (stepIndex > 0 && !breakRoutine.steps[stepIndex].breathe) playSound("step", prefs.sounds);
    speak(breakRoutine.steps[stepIndex].text, prefs.spoken_breaks);
  }, [breakRoutine, stepIndex, prefs.sounds, prefs.spoken_breaks]);

  // Minutes beside the menu-bar icon.
  const menuBar = !prefs.menu_bar_timer ? null : onBreak ? "rest" : focusing && focus.endsAt !== null ? `${Math.ceil((focus.endsAt - now) / MINUTE)}m` : quietUntil > now ? "quiet" : `${nudgeMinutes}m`;
  useEffect(() => {
    if (trayTitle.current === menuBar) return;
    trayTitle.current = menuBar;
    void invoke("set_tray_title", { title: menuBar }).catch(console.error);
  }, [menuBar]);

  const applySuggestion = useCallback(async (from: Letter) => {
    if (!from.apply) return;
    const latest = await invoke<Settings>("get_settings");
    await invoke("save_settings", { settings: { ...latest, ...from.apply.patch } });
    await refreshSettings();
  }, [refreshSettings]);

  const goodnight = useCallback((mood: number | null, tomorrow: string) => {
    setStats(prev => ({ ...prev, mood }));
    companion.update(s => ({ ...care(s, "goodnight", Date.now()), tomorrow, goodnights: s.goodnights + 1 }));
    void closePanel(() => { quietNudges(tomorrowMorning(Date.now())); say("Goodnight. I’ll keep the garden company."); });
  }, [closePanel, companion.update, quietNudges, say]);

  const suggested = useMemo(() => card?.kind === "reminder" || panel === "breaks" ? suggestions() : BREAK_ROUTINES, [card, panel, suggestions]);
  const pos = position || "bl";
  const dismiss = () => setCard(null);
  const openScene = (kind: SceneKind, label: string) => { setScene({ kind, label }); void openPanel("mad"); };
  const showUi = !overlayHidden && !concealed;

  const renderCard = (current: Card) => {
    switch (current.kind) {
      case "reminder": return <PetCard position={pos} titleId="reminder-prompt-title" eyebrow={`${petName} · ${formatDuration(stats.currentStretchSeconds)} without a rest`} title={castAsk(character, energy)}
        actions={[
          { label: `${suggested[0].title} · ${durationLabel(suggested[0].durationSeconds)}`, kind: "primary", onClick: () => startRoutine(suggested[0]) },
          // One "not yet": it asks again when you move on to something else, or after your snooze time.
          { label: "Not yet", onClick: () => later({ kind: "after-task", app: front.current.app, until: Date.now() + prefs.reminder_snooze_mins * MINUTE }, castSays(character, "snoozed")) },
        ]}
        later={[{ label: "Something else", onClick: () => handleAction("break") }]}>
        <p>{current.because === "woken" ? "Thanks for waking me." : showLabel(current.because)}</p>
      </PetCard>;
      case "drift": return <PetCard position={pos} eyebrow={current.site ? `${current.site} · still on this?` : "Still on this?"} title={focus ? `“${focus.text}”` : ""} actions={[
        { label: "Back to it", kind: "primary", onClick: dismiss },
        { label: "It’s part of this", onClick: () => { if (focusRef.current) setFocus(allowCategory(focusRef.current, current.allow)); dismiss(); } },
        { label: "I’m done", onClick: () => finishFocus("ended") },
      ]} />;
      case "focus-end": return <PetCard position={pos} eyebrow="Time’s up" title={focus ? `“${focus.text}”` : "How did it go?"} actions={[
        { label: "Done", kind: "primary", onClick: () => finishFocus("done") },
        { label: "Partly", onClick: () => finishFocus("partly") },
        { label: "Stuck", onClick: () => finishFocus("stuck") },
        { label: "10 more min", onClick: () => { moreFocus(10); dismiss(); } },
      ]}><p>How did it go?</p></PetCard>;
      case "ugh": {
        const { target } = current;
        const remembered = !!target && companion.state.grudges.some(g => g.key === target.key);
        return <PetCard position={pos} eyebrow="Expansion complete" title={target ? target.label : "That thing"} actions={[
          ...(focus ? [] : [{ label: `${TOGETHER_MINUTES} minutes, together`, kind: "primary" as const, onClick: () => faceTogether(target) }]),
          ...(target && !remembered ? [{ label: "Stay mad at it", onClick: () => { companion.update(s => ({ ...s, grudges: addGrudge(s.grudges, target, Date.now()) })); dismiss(); say("I won’t forget."); } }] : []),
        ]} later={[
          { label: "Make a GIF", onClick: () => openScene("mad", target?.label ?? "") },
          { label: "That helped", onClick: dismiss },
        ]}><p>{focus ? "Back to it when you’re ready." : "Shall we get it over with?"}</p></PetCard>;
      }
      case "won": return <PetCard position={pos} eyebrow="We did it" title={`${shortLabel(current.label)} is done`} actions={[
        { label: "Make a GIF", kind: "primary", onClick: () => openScene("won", current.label) },
        { label: "On to better things", onClick: dismiss },
      ]}><p>You didn’t want to, and you did it anyway.</p></PetCard>;
      case "helped": return <PetCard position={pos} eyebrow={current.routine.title} title="Did that help?" actions={[
        { label: "Yes", kind: "primary", onClick: () => { companion.update(s => rememberRoutine(s, current.routine.id, Date.now(), "helped")); dismiss(); } },
        { label: "Not really", onClick: () => { companion.update(s => rememberRoutine(s, current.routine.id, Date.now(), "notReally")); dismiss(); } },
      ]} />;
      case "spent": return <PetCard position={pos} eyebrow={TECHNIQUES[character].name} title="Not enough rest energy" actions={[
        { label: "Rest first", kind: "primary", onClick: () => { dismiss(); startRoutine(); } },
        { label: "Fine", onClick: dismiss },
      ]}><p>A full Expansion needs a rested {petName}. Even a short pause charges it.</p></PetCard>;
      case "resume": return <PetCard position={pos} eyebrow="Cut short" title={`${minutesText(current.minutes)} of rest left`} actions={[
        { label: "Keep resting", kind: "primary", onClick: () => startBreak({ resumeMinutes: current.minutes }) },
        { label: "I’m back", onClick: dismiss },
      ]} />;
      case "bedtime": return <PetCard position={pos} eyebrow={`It’s past ${formatMinuteOfDay(prefs.bedtime)}`} title="Shall we call it a day?" actions={[
        { label: "Wrap up", kind: "primary", onClick: () => handleAction("wrapup") },
        { label: "Not tonight", onClick: dismiss },
      ]} />;
      case "letter": return <PetCard position={pos} eyebrow={petName} title="I wrote you a letter" actions={[
        { label: "Read it", kind: "primary", onClick: () => handleAction("letter") },
        { label: "Later", onClick: dismiss },
      ]}><p>About the week we had.</p></PetCard>;
      case "found": return <PetCard position={pos} eyebrow="Look what I found" title={ACCESSORIES[current.accessory].name} actions={[
        { label: "Try it on", kind: "primary", onClick: () => { companion.update(s => ({ ...s, wearing: current.accessory })); dismiss(); say("How do I look?"); } },
        { label: "See all", onClick: () => handleAction("outfits") },
      ]} />;
    }
  };

  return (
    <>
      {activityError && <div className="activity-error" role="alert"><span>{activityError}</span></div>}
      <main className={`container ${overlayHidden ? "hidden" : ""}`} style={{ WebkitUserSelect: "none", userSelect: "none", MozUserSelect: "none" }}>
        <div
          className={`character interactive pos-${pos} ${hovered ? "hovered" : ""}${concealed ? " character-hidden" : ""}`}
          style={{ ...petAnchor, "--pet-size": `${characterSize}px` } as React.CSSProperties}
          data-character
        >
          {showUi && <RadialMenu open={barOpen && !dragging} position={pos} break={breakTime} name={petName} epithet={CAST[character].epithet} rank={bondLevel(companion.state.bond).name}
            rest={`about ${minutesText(restMinutesFor(timePassed, timeEvents))}, together`}
            focus={focusing ? `on “${focus.text}”` : undefined}
            expand={{ label: canExpand(energy) ? TECHNIQUES[character].name : "needs rest first", ready: canExpand(energy) }}
            onAction={handleAction} onClose={closeBar} />}
          {card && showUi && !onBreak && !barOpen && renderCard(card)}
          {breakRoutine && onBreak && showUi && <BreakCoach routine={breakRoutine} elapsedSeconds={elapsed} position={pos} onFinish={() => endBreak(false)} />}

          {!barOpen && !dragging && !card && !breakRoutine && tantrum === null && speech.shown !== "" && showUi && (
            <p data-pet-popover id="messages" className={`messages interactive${speech.pinned ? " messages--pinned" : ""}`}>
              {speech.pinned && (
                <button type="button" className="messages-close interactive" onClick={clear} aria-label="Close reminder note"><LuX size={12} /></button>
              )}
              <span className="messages-text">{speech.shown}</span>
            </p>
          )}

          {!barOpen && !overlayHidden && !dragging && speech.shown === "" && !card && !breakRoutine && tantrum === null && hovered && (
            <div id="hoverInfo" data-pet-popover>
              <p className="hoverInfo-stat" data-label={onBreak ? "Resting" : "Since your last rest"}>
                <span className="hoverInfo-text">{onBreak ? "On a pause" : formatDuration(stats.currentStretchSeconds)}</span>
                <span className="hoverInfo-next">{hoverNote}</span>
              </p>
              <div className="energy-bars">
                {Array.from({ length: ENERGY_CELLS }).map((_, i) => <div key={i} className={`energy-bar ${i < energy ? "filled" : "empty"}`} />)}
              </div>
            </div>
          )}

          {!concealed && (
            <LivingPet character={character} size={characterSize} name={petName} category={label}
              request={petRequest} resting={onBreak && !breakRoutine} hovered={hovered} dragging={dragging} petted={petted}
              attention={attention} busy={barOpen || overlayHidden || speech.shown !== "" || card !== null}
              motionPaused={barOpen || overlayHidden || card !== null}
              position={petFacingPosition} energy={energy} onMenu={toggleBar} onPet={pet}
              accessory={accessory} performing={performing} breathe={coachStep?.step.breathe} drowsy={drowsy}
              hopping={hopping} ultimate={ultimate} announcing={card?.kind === "reminder"} tantrum={overlayHidden ? null : tantrum} music={musicPlaying} sign={focusing && tantrum === null && !card && speech.shown === "" && !barOpen && !hovered ? focus.text : undefined}
              sprout={card || barOpen ? null : sprout} />
          )}
        </div>
      </main>
      {panel === "onboarding" && <OnboardingPanel onComplete={close} />}
      {panel === "settings" && <SettingsPanel onClose={close} onErase={eraseHistory} />}
      {panel === "summary" && (
        <SummaryPanel key={summaryTab} stats={stats} history={history} energy={energy} onBreak={onBreak} onClose={close} letter={letter}
          character={character} accessory={accessory} initialTab={summaryTab} onApply={applySuggestion} onWrapUp={() => setPanel("wrapup")} />
      )}
      {panel === "notes" && <ReminderNotePanel onClose={close} />}
      {panel === "breaks" && <BreakGuidePanel onClose={close} onStart={startRoutine} onJustRest={() => startRoutine()} routines={suggested} />}
      {panel === "focus" && (
        <FocusPanel session={focus} log={companion.state.focusLog} character={character} accessory={accessory} petName={petName} now={now}
          inFront={lastPlace.current && now - lastPlace.current.at < 30 * MINUTE && !isDistractingCategory(lastPlace.current.place.category ?? "") ? lastPlace.current.place.page : undefined}
          onStart={beginFocus} onExtend={moreFocus} onPark={text => { if (focusRef.current) setFocus(parkThought(focusRef.current, text)); }}
          onEnd={() => void closePanel(() => setCard({ kind: "focus-end" }))} onClose={close} />
      )}
      {panel === "garden" && (
        <HomePanel key={homeTab} state={companion.state} character={character} petName={petName} now={now} initialTab={homeTab}
          onForgive={key => companion.update(s => ({ ...s, grudges: dropGrudge(s.grudges, key) }))}
          onWear={id => companion.update(s => ({ ...s, wearing: id }))} onOpen={handleAction} onClose={close} />
      )}
      {panel === "mad" && <MadPanel kind={scene.kind} label={scene.label} character={character} accessory={accessory} petName={petName} onClose={close} />}
      {panel === "wrapup" && (
        <WrapUpPanel stats={stats} petName={petName} tomorrow={companion.state.tomorrow}
          finished={companion.state.focusLog.filter(f => f.outcome === "done" && dateKey(f.startedAt) === dateKey(now))}
          onDone={goodnight} onClose={close} />
      )}
    </>
  );
}

export default App;

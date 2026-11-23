/** When a prompt may appear. Pure, so every situation can be replayed in a test. */

export type NudgeStyle = "gentle" | "balanced" | "firm";
const MINUTE = 60_000;

export interface PromptRules {
  /** Longest to wait for a pause in typing. */
  maxWaitMs: number;
  /** Longest to wait for a video to end. */
  watchingMaxWaitMs: number;
  /** Longest to wait for a focus session to end. */
  focusMaxWaitMs: number;
  ignoreQuiet?: boolean;
  ignoreHours?: boolean;
}

export interface StyleRules extends PromptRules {
  /** An unanswered card folds away after this long, and the pet dozes off instead. */
  foldAfterMs: number | null;
}

export const STYLE_RULES: Record<NudgeStyle, StyleRules> = {
  gentle: { maxWaitMs: 8 * MINUTE, watchingMaxWaitMs: 30 * MINUTE, focusMaxWaitMs: 75 * MINUTE, foldAfterMs: MINUTE },
  balanced: { maxWaitMs: 4 * MINUTE, watchingMaxWaitMs: 20 * MINUTE, focusMaxWaitMs: 50 * MINUTE, foldAfterMs: 2 * MINUTE },
  firm: { maxWaitMs: 1.5 * MINUTE, watchingMaxWaitMs: 10 * MINUTE, focusMaxWaitMs: 30 * MINUTE, foldAfterMs: null },
};

export type Snooze =
  | { kind: "until"; at: number }
  /** Until the person moves on from this app, or a limit passes. */
  | { kind: "after-task"; app: string | null; until: number };

export interface Moment {
  now: number;
  dueAt: number;
  idleSeconds: number;
  /** The app in front, and when it got there. */
  app: string | null;
  appSince: number;
  /** When input last resumed after a stretch away; 0 if it hasn't. */
  returnedAt: number;
  onBreak: boolean;
  panelOpen: boolean;
  hidden: boolean;
  promptOpen: boolean;
  quietUntil: number;
  offHours: boolean;
  snooze: Snooze | null;
  inCall: boolean;
  watching: boolean;
  focusing: boolean;
  rules: PromptRules;
}

export type HoldReason = "break" | "panel" | "hidden" | "prompt" | "quiet" | "hours" | "snoozed"
  | "call" | "watching" | "focus" | "away" | "typing";
export type ShowReason = "pause" | "switch" | "return" | "overdue";
export type Decision = { show: true; because: ShowReason } | { show: false; because: HoldReason };

const PAUSE_SECONDS = 5;
const AWAY_SECONDS = 30;
const SETTLED_MS = 4_000;
const SWITCH_WINDOW_MS = 10_000;
const RETURN_WINDOW_MS = 12_000;

export function snoozeActive(snooze: Snooze | null, m: Pick<Moment, "now" | "app" | "appSince">): boolean {
  if (!snooze) return false;
  if (snooze.kind === "until") return m.now < snooze.at;
  if (m.now >= snooze.until) return false;
  return m.app === snooze.app || m.app === null || m.now - m.appSince < SETTLED_MS;
}

export function decide(m: Moment): Decision {
  const hold = (because: HoldReason): Decision => ({ show: false, because });
  const show = (because: ShowReason): Decision => ({ show: true, because });
  const waited = m.now - m.dueAt;

  if (m.onBreak) return hold("break");
  if (m.hidden) return hold("hidden");
  if (m.panelOpen) return hold("panel");
  if (m.promptOpen) return hold("prompt");
  if (!m.rules.ignoreQuiet && m.now < m.quietUntil) return hold("quiet");
  if (!m.rules.ignoreHours && m.offHours) return hold("hours");
  if (snoozeActive(m.snooze, m)) return hold("snoozed");
  if (m.inCall) return hold("call");
  // A video has no typing to pause, so it gets a longer wait and then a plain answer.
  if (m.watching) return waited < m.rules.watchingMaxWaitMs ? hold("watching") : show("overdue");
  if (m.idleSeconds > AWAY_SECONDS) return hold("away");
  if (m.focusing && waited < m.rules.focusMaxWaitMs) return hold("focus");
  if (m.returnedAt && m.now - m.returnedAt < RETURN_WINDOW_MS) return show("return");
  if (m.idleSeconds >= PAUSE_SECONDS) return show("pause");
  const onApp = m.now - m.appSince;
  if (onApp >= 1500 && onApp < SWITCH_WINDOW_MS && m.idleSeconds >= 1.5) return show("switch");
  return waited >= m.rules.maxWaitMs ? show("overdue") : hold("typing");
}

const HOLD_LABELS: Partial<Record<HoldReason, string>> = {
  call: "Waiting for your call to end",
  watching: "Waiting for a good moment",
  focus: "Waiting for your focus session",
  away: "Waiting until you’re back",
  typing: "Waiting for a pause",
  hours: "Off hours",
};
export const holdLabel = (reason: HoldReason): string | null => HOLD_LABELS[reason] ?? null;

const SHOW_LABELS: Record<ShowReason, string> = {
  pause: "You just paused.",
  switch: "You’re between things.",
  return: "You’re just back.",
  overdue: "I couldn’t find a quiet moment.",
};
export const showLabel = (reason: ShowReason): string => SHOW_LABELS[reason];

/* ---- learning from answers ---- */

export type NudgeOutcome = "taken" | "later" | "missed";
export interface NudgeRecord { hour: number; outcome: NudgeOutcome }
const MIN_SAMPLES = 5;

/** Share of nudges accepted around this hour, or null with too little to go on. */
export function receptivity(nudges: readonly NudgeRecord[], hour: number): number | null {
  const near = nudges.filter(n => Math.min(Math.abs(n.hour - hour), 24 - Math.abs(n.hour - hour)) <= 1);
  if (near.length < MIN_SAMPLES) return null;
  return near.filter(n => n.outcome === "taken").length / near.length;
}

/** Hours that rarely suit someone get twice the patience. Firm means firm. */
export function rulesFor(style: NudgeStyle, accepted: number | null): StyleRules {
  const rules = STYLE_RULES[style];
  return style !== "firm" && accepted !== null && accepted < 0.25
    ? { ...rules, maxWaitMs: rules.maxWaitMs * 2 } : rules;
}

/** Nudges in a row that were left unanswered. */
export function unansweredInARow(nudges: readonly NudgeRecord[]): number {
  let count = 0;
  for (let i = nudges.length - 1; i >= 0 && nudges[i].outcome === "missed"; i--) count++;
  return count;
}

/** After two unanswered cards, stop asking: the pet falls asleep until it is petted. */
export function shouldDozeInstead(style: NudgeStyle, nudges: readonly NudgeRecord[]): boolean {
  return style !== "firm" && unansweredInARow(nudges) >= 2;
}

/** 0 awake · 1 yawning · 2 slowing down · 3 asleep on the job */
export function drowsiness(ignoredAt: number | null, now: number): 0 | 1 | 2 | 3 {
  if (ignoredAt === null) return 0;
  const minutes = (now - ignoredAt) / MINUTE;
  return minutes < 4 ? 1 : minutes < 9 ? 2 : 3;
}

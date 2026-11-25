import { invoke } from "@tauri-apps/api/core";
import type { NudgeStyle } from "../lib/reminderPolicy";
import type { SiteRule } from "../lib/sites";
import type { CompanionId, ThemeId } from "./appearance";

export interface AppCategoryEntry {
  name: string;
  category: string;
  user_override?: boolean;
  is_helper?: boolean | null;
  bundle_path?: string | null;
}

export interface Settings {
  monitor_index: number;
  reminder_interval_mins: number; // default 30 mins - in mins
  reminder_snooze_mins: number;
  position: string;
  character: CompanionId;
  character_size?: number;
  theme: ThemeId;
  // Global shortcut that hides the character, e.g. "Cmd+Shift+KeyP"
  pause_shortcut: string;
  app_categories: Record<string, AppCategoryEntry>;
  onboarding_complete?: boolean;
  pending_notes?: string[];
  /** Minutes without input before an automatic break (default 5). */
  auto_idle_break_mins?: number;
  /** Whether to automatically launch nudge when the user logs in. */
  launch_at_login?: boolean;
  hide_helper_apps?: boolean;
  /** What you call your companion; empty uses its species name. */
  pet_name?: string;
  chattiness?: Chattiness;
  nudge_style?: NudgeStyle;
  /** Hold nudges while the microphone or a camera is in use. */
  call_awareness?: boolean;
  distraction_limit_mins?: number;
  // Times of day are minutes after midnight.
  active_hours_enabled?: boolean;
  active_start?: number;
  active_end?: number;
  active_weekends?: boolean;
  wind_down_enabled?: boolean;
  bedtime?: number;
  rhythm_eyes?: boolean;
  rhythm_water?: boolean;
  rhythm_posture?: boolean;
  sounds?: boolean;
  spoken_breaks?: boolean;
  menu_bar_timer?: boolean;
  history_days?: number;
  /** Read the front window's title. Needs Accessibility. */
  window_titles?: boolean;
  site_rules?: SiteRule[];
  /** Hop onto the window in use. */
  sit_on_windows?: boolean;
  /** A cross pet throws things at the window in front. */
  throw_things?: boolean;
}

export type Chattiness = "quiet" | "normal" | "chatty";

/** Matches the Rust defaults; used until settings load and for files from older versions. */
export const PREFERENCE_DEFAULTS = {
  pet_name: "",
  chattiness: "normal" as Chattiness,
  nudge_style: "balanced" as NudgeStyle,
  call_awareness: true,
  distraction_limit_mins: 60,
  active_hours_enabled: false,
  active_start: 9 * 60,
  active_end: 18 * 60,
  active_weekends: true,
  wind_down_enabled: false,
  bedtime: 23 * 60,
  rhythm_eyes: false,
  rhythm_water: false,
  rhythm_posture: false,
  sounds: false,
  spoken_breaks: false,
  menu_bar_timer: false,
  history_days: 31,
  window_titles: false,
  site_rules: [] as SiteRule[],
  sit_on_windows: false,
  throw_things: true,
};
export type Preferences = typeof PREFERENCE_DEFAULTS & Pick<Settings, "reminder_interval_mins" | "reminder_snooze_mins">;

export function preferences(settings?: Partial<Settings> | null): Preferences {
  const result: Record<string, unknown> = { ...PREFERENCE_DEFAULTS, reminder_interval_mins: 30, reminder_snooze_mins: 10 };
  for (const key of Object.keys(result)) {
    const value = settings?.[key as keyof Settings];
    if (value !== undefined && value !== null) result[key] = value;
  }
  return result as Preferences;
}

export interface MonitorOption {
  value: number;
  label: string;
}

export interface CategoryOption {
  value: string;
  label: string;
}

export const POSITION_OPTIONS = [
  { value: "bottom_left", label: "Bottom left" },
  { value: "bottom_right", label: "Bottom right" },
  { value: "top_left", label: "Top left" },
  { value: "top_right", label: "Top right" },
  { value: "center", label: "Center" },
] as const;

// Shortcuts are stored as "+"-joined modifier names plus one W3C key code
// (e.g. "Cmd+Shift+KeyP"), the format the Rust global-shortcut parser accepts.

const MODIFIER_LABELS: Record<string, string> = {
  Ctrl: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Cmd: "⌘",
};

const KEY_LABELS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Backquote: "`",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Equal: "=",
  Minus: "-",
  Period: ".",
  Quote: "'",
  Semicolon: ";",
  Slash: "/",
};

// Non-modifier key codes the Rust shortcut parser understands.
const NAMED_KEY_CODES = new Set([
  ...Object.keys(KEY_LABELS),
  "Backspace",
  "CapsLock",
  "Delete",
  "End",
  "Enter",
  "Home",
  "Insert",
  "PageDown",
  "PageUp",
  "Space",
  "Tab",
]);

function isBindableKeyCode(code: string): boolean {
  return (
    /^Key[A-Z]$/.test(code) ||
    /^Digit\d$/.test(code) ||
    /^F([1-9]|1\d|2[0-4])$/.test(code) ||
    NAMED_KEY_CODES.has(code)
  );
}

/** Builds a "Ctrl+Alt+Shift+Cmd+<code>" string from a keydown, or null if the
 * pressed combo can't be used as a global shortcut (needs >=1 modifier). */
export function shortcutFromKeyboardEvent(e: KeyboardEvent): string | null {
  if (!isBindableKeyCode(e.code)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Cmd");
  if (parts.length === 0) return null;
  parts.push(e.code);
  return parts.join("+");
}

/** Renders a stored shortcut like "Cmd+Shift+KeyP" as "⌘ ⇧ P". */
export function formatShortcut(shortcut: string): string {
  return shortcut
    .split("+")
    .map((token) => {
      if (token in MODIFIER_LABELS) return MODIFIER_LABELS[token];
      if (/^Key[A-Z]$/.test(token)) return token.slice(3);
      if (/^Digit\d$/.test(token)) return token.slice(5);
      return KEY_LABELS[token] ?? token;
    })
    .join(" ");
}

export function fetchMonitorOptions(): Promise<MonitorOption[]> {
  return invoke<MonitorOption[]>("get_monitor_options");
}

export function fetchAppCategoryOptions(): Promise<CategoryOption[]> {
  return invoke<CategoryOption[]>("get_app_category_options");
}

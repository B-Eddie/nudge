import { invoke } from "@tauri-apps/api/core";
import type { CategoryOveruseMins } from "./categoryOveruse";

export interface AppCategoryEntry {
  name: string;
  category: string;
  user_override?: boolean;
}

export interface Settings {
  monitor_index: number;
  reminder_interval_mins: number; // default 30 mins - in mins
  position: string;
  // Global shortcut that hides the character, e.g. "Cmd+Shift+KeyP"
  pause_shortcut: string;
  app_categories: Record<string, AppCategoryEntry>;
  onboarding_complete?: boolean;
  pending_notes?: string[];
  /** Minutes without input before an automatic break (default 5). */
  auto_idle_break_mins?: number;
  /** Continuous minutes on a category before an overuse nudge (0 = off). */
  category_overuse_mins?: CategoryOveruseMins;
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

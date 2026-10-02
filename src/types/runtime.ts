import { isTauri } from "@tauri-apps/api/core";

/** Support the runtime marker used by both older and newer Tauri 2 hosts. */
export function isDesktopRuntime(): boolean {
  return isTauri() || (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
}

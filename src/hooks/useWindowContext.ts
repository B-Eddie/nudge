import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export interface WindowContext { bundle_id: string | null; title: string | null; fullscreen: boolean; browser: boolean }
const NONE: WindowContext = { bundle_id: null, title: null, fullscreen: false, browser: false };
const POLL_MS = 2000;

/** The window in front, while the person has title reading turned on. Never persisted. */
export function useWindowContext(enabled: boolean): WindowContext {
  const [context, setContext] = useState(NONE);
  useEffect(() => {
    if (!enabled) { setContext(NONE); return; }
    let cancelled = false, busy = false;
    const poll = () => {
      if (busy) return;
      busy = true;
      invoke<WindowContext | null>("get_window_context").then(latest => {
        if (!cancelled) setContext(old => {
          const next = latest ?? NONE;
          return old.title === next.title && old.bundle_id === next.bundle_id && old.fullscreen === next.fullscreen && old.browser === next.browser ? old : next;
        });
      }).catch(console.error).finally(() => { busy = false; });
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [enabled]);
  return context;
}

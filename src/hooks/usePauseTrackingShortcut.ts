import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

// listens for global pause-tracking shortcut
export function usePauseTrackingShortcut(onToggle: () => void): void {
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void listen("toggle-pause", () => onToggleRef.current()).then((stop) => {
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}

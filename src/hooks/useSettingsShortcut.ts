import { useEffect } from "react";

// listen for open setting shortcut button
export function useSettingsShortcut(
  settingsOpen: boolean,
  onOpen: () => void,
  onClose: () => void,
): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === ",") {
        e.preventDefault();
        if (settingsOpen) {
          onClose();
        } else {
          onOpen();
        }
        return;
      }

      if (e.key === "Escape" && settingsOpen) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen, onOpen, onClose]);
}

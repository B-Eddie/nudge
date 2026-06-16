import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

interface CursorMove {
  x: number;
  y: number;
  inside: boolean;
  pressed: boolean;
}

async function setPassThrough(passThrough: boolean): Promise<void> {
  await invoke("set_click_through", { passThrough });
}

export interface CharacterInteraction {
  // Cursor hovering on character
  hovered: boolean;
  // If bar is gone
  barOpen: boolean;

  closeBar: () => void;
}

export function useCharacterInteraction(
  // When true, window captures clicks (e.g. settings/summary panel is open)
  captureClicks: boolean,
  onAction: (action: string) => void,
): CharacterInteraction {
  const [hovered, setHovered] = useState(false);
  const [barOpen, setBarOpen] = useState(false);

  const barOpenRef = useRef(barOpen);
  barOpenRef.current = barOpen;
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const closeBar = useCallback(() => setBarOpen(false), []);

  useEffect(() => {
    if (captureClicks) setBarOpen(false);
  }, [captureClicks]);

  // make it pass through
  useEffect(() => {
    if (captureClicks) {
      void setPassThrough(false);
      return;
    }

    let lastPassThrough: boolean | null = null;
    let prevPressed = false;

    const applyPassThrough = (passThrough: boolean) => {
      if (passThrough === lastPassThrough) return;
      lastPassThrough = passThrough;
      void setPassThrough(passThrough);
    };

    const handle = (x: number, y: number, inside: boolean, pressed: boolean) => {
      const el = inside ? document.elementFromPoint(x, y) : null;
      const overCharacter = el?.closest("[data-character]") != null;
      const overInteractive = el?.closest(".interactive") != null;
      const open = barOpenRef.current;

      setHovered(overCharacter);
      // catch clicks when over the character/bar, otherwise stay click-through
      applyPassThrough(!(overInteractive || open));

      if (pressed && !prevPressed) {
        const action = el
          ?.closest<HTMLElement>("[data-action]")
          ?.dataset.action;
        if (action) {
          onActionRef.current(action);
          setBarOpen(false);
        } else if (overCharacter) {
          setBarOpen((v) => !v);
        } else if (open) {
          setBarOpen(false);
        }
      }
      prevPressed = pressed;
    };

    const unlisten = listen<CursorMove>("cursor://move", (event) => {
      const { x, y, inside, pressed } = event.payload;
      handle(x, y, inside, pressed);
    });

    void setPassThrough(true);
    lastPassThrough = true;

    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [captureClicks]);

  return { hovered, barOpen, closeBar };
}

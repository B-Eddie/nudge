import { isDesktopRuntime } from "../types/runtime";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { petAttentionAt, type PetAttention } from "../lib/petAttention";

interface CursorMove { x: number; y: number; inside: boolean; pressed: boolean; screen_x?: number; screen_y?: number }
export type { PetAttention } from "../lib/petAttention";
const native = (command: string, args?: Record<string, unknown>) => {
  if (isDesktopRuntime()) void invoke(command, args).catch(console.error);
};

export function useCharacterInteraction(
  captureClicks: boolean,
  onAction: (action: string) => void,
  onNoteTrigger?: () => void,
  characterHidden = false,
) {
  const [hovered, setHovered] = useState(false);
  const [barOpen, setBarOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [petted, setPetted] = useState(0);
  const [attention, setAttention] = useState<PetAttention>({ x: 0, y: 0, near: false, tracking: false });
  const current = useRef({ barOpen, onAction, onNoteTrigger });
  current.current = { barOpen, onAction, onNoteTrigger };
  const closeBar = useCallback(() => setBarOpen(false), []);
  const toggleBar = useCallback(() => setBarOpen(v => !v), []);
  const pet = useCallback(() => setPetted(v => v + 1), []);

  useEffect(() => {
    setBarOpen(false);
    setHovered(false);
    setDragging(false);
    setAttention({ x: 0, y: 0, near: false, tracking: false });
    if (captureClicks || characterHidden) {
      native("set_click_through", { passThrough: !captureClicks });
      return;
    }
    let previousPressed = false;
    let passThrough: boolean | undefined;
    let press: { x: number; y: number; dragging: boolean } | null = null;
    let lastPet = 0;
    let lastHoverX: number | null = null;
    let strokes = 0;
    let disposed = false;
    let lastCursor: CursorMove | undefined;
    const handle = ({ x, y, inside, pressed, screen_x = x, screen_y = y }: CursorMove) => {
      const el = inside ? document.elementFromPoint(x, y) : null;
      const overCharacter = !!el?.closest("[data-pet-body]");
      const rect = document.querySelector("[data-pet-body]")?.getBoundingClientRect();
      const nextAttention = petAttentionAt(x, y, rect);
      setAttention(previous => previous.x === nextAttention.x && previous.y === nextAttention.y && previous.near === nextAttention.near && previous.tracking === nextAttention.tracking
        ? previous : nextAttention);
      setHovered(overCharacter || !!el?.closest(".pet-menu-button"));
      if (overCharacter && !pressed) {
        // Entry is not a stroke. Keep the anchor until movement exceeds tiny
        // cursor jitter so slow, continuous strokes still accumulate.
        if (lastHoverX === null) lastHoverX = x;
        else if (Math.abs(x - lastHoverX) > 3) {
          strokes += Math.abs(x - lastHoverX);
          lastHoverX = x;
          if (strokes > 85 && Date.now() - lastPet > 1800) { pet(); lastPet = Date.now(); strokes = 0; }
        }
      } else { lastHoverX = null; strokes = 0; }
      if (pressed && !previousPressed) {
        const action = el?.closest<HTMLElement>("[data-action]")?.dataset.action;
        if (el?.closest("[data-note-trigger]")) { current.current.onNoteTrigger?.(); setBarOpen(false); }
        else if (action) { current.current.onAction(action); setBarOpen(false); }
        else if (overCharacter) {
          press = { x: screen_x, y: screen_y, dragging: false };
          native("pet_drag", { phase: "begin", screenX: screen_x, screenY: screen_y, bodySize: rect?.width });
        } else if (!el?.closest(".interactive")) setBarOpen(false);
      }
      if (press && pressed && Math.hypot(screen_x - press.x, screen_y - press.y) > 5) {
        press.dragging = true;
        setDragging(true);
        setBarOpen(false);
      }
      if (press?.dragging && pressed) native("pet_drag", { phase: "move", bodySize: rect?.width });
      if (!pressed && previousPressed && press) {
        native("pet_drag", { phase: press.dragging ? "end" : "cancel", footX: rect ? rect.left + rect.width / 2 : 60, footY: rect ? rect.top + rect.height * .9 : 260, bodySize: rect?.width });
        if (!press.dragging && overCharacter) pet();
        press = null;
        setDragging(false);
      }
      const next = !(press || el?.closest(".interactive") || current.current.barOpen);
      if (next !== passThrough) { native("set_click_through", { passThrough: next }); passThrough = next; }
      previousPressed = pressed;
    };
    const unlisten = isDesktopRuntime() ? listen<CursorMove>("cursor://move", event => { if (!disposed) { lastCursor = event.payload; handle(event.payload); } }) : null;
    const mouse = (e: MouseEvent) => {
      // DOM down/up guarantees capture for quick gestures between native polls.
      // Movement stays global so leaving the webview or crossing displays works.
      if (isDesktopRuntime() && e.type === "mousemove") return;
      if (isDesktopRuntime() && e.type === "mouseup" && !press) return;
      handle({ x: e.clientX, y: e.clientY, inside: true, pressed: (e.buttons & 1) !== 0,
        screen_x: isDesktopRuntime() ? lastCursor?.screen_x : e.screenX,
        screen_y: isDesktopRuntime() ? lastCursor?.screen_y : e.screenY });
    };
    const resetBrowserPointer = () => {
      // The desktop overlay is usually unfocused: its global native monitor
      // must keep tracking while the user works in another app.
      if (isDesktopRuntime()) return;
      setAttention({ x: 0, y: 0, near: false, tracking: false });
      setHovered(false);
      setDragging(false);
      press = null;
      previousPressed = false;
    };
    ["mousemove", "mousedown", "mouseup"].forEach(name => window.addEventListener(name, mouse as EventListener));
    document.addEventListener("mouseleave", resetBrowserPointer);
    window.addEventListener("blur", resetBrowserPointer);
    return () => {
      disposed = true;
      void unlisten?.then(fn => fn());
      ["mousemove", "mousedown", "mouseup"].forEach(name => window.removeEventListener(name, mouse as EventListener));
      document.removeEventListener("mouseleave", resetBrowserPointer);
      window.removeEventListener("blur", resetBrowserPointer);
      native("pet_drag", { phase: "cancel" });
    };
  }, [captureClicks, characterHidden, pet]);

  return { hovered, barOpen, closeBar, toggleBar, dragging, petted, attention, pet };
}

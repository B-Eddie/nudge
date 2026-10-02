import { isDesktopRuntime } from "../types/runtime";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface Rect { left: number; top: number; width: number; height: number }
interface Size { width: number; height: number }
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, Math.max(low, high)));

export function placePetMenu(pet: Rect, viewport: Size) {
  const right = pet.left + pet.width + 4;
  const left = right + 28 <= viewport.width - 8 ? right : pet.left - 32;
  return {
    left: clamp(left, 8, viewport.width - 36),
    top: clamp(pet.top + pet.height - 32, 8, viewport.height - 32),
  };
}

export function resizePetAnchor(anchor: { left: number; top: number; size: number }, size: number) {
  return { left: anchor.left + (anchor.size - size) / 2, top: anchor.top + (anchor.size - size) * .9 };
}

/** Prefer a free side, then the space above/below. Clamp fallback panels to the canvas. */
export function placePetPopover(pet: Rect, panel: Size, viewport: Size) {
  const gap = 8;
  const right = pet.left + pet.width;
  const bottom = pet.top + pet.height;
  const centeredX = pet.left + (pet.width - panel.width) / 2;
  const centeredY = pet.top + (pet.height - panel.height) / 2;
  const candidates = [
    { left: right + gap, top: centeredY },
    { left: pet.left - panel.width - gap, top: centeredY },
    { left: centeredX, top: pet.top - panel.height - gap },
    { left: centeredX, top: bottom + gap },
  ];
  const fit = candidates.find(p => p.left >= gap && p.top >= gap && p.left + panel.width <= viewport.width - gap && p.top + panel.height <= viewport.height - gap);
  const candidatesClamped = candidates.map(p => ({
    left: clamp(p.left, gap, viewport.width - panel.width - gap),
    top: clamp(p.top, gap, viewport.height - panel.height - gap),
  }));
  const overlap = (p: { left: number; top: number }) =>
    Math.max(0, Math.min(right, p.left + panel.width) - Math.max(pet.left, p.left)) *
    Math.max(0, Math.min(bottom, p.top + panel.height) - Math.max(pet.top, p.top));
  return fit ?? candidatesClamped.reduce((best, p) => overlap(p) < overlap(best) ? p : best);
}

export function usePetLayout(position: string, suspended: boolean, size = 120, monitor = 0) {
  const identity = `${position}:${monitor}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const [anchor, setAnchor] = useState<{ left: number; top: number; size: number; identity: string } | null>(null);
  useEffect(() => setAnchor(null), [position, monitor]);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let disposed = false;
    const pending = listen<{ left: number; top: number; size?: number }>("pet://layout", e => {
      if (!disposed) setAnchor({ ...e.payload, size: e.payload.size ?? sizeRef.current, identity: identityRef.current });
    });
    return () => { disposed = true; void pending.then(off => off()); };
  }, []);
  useEffect(() => {
    if (suspended || !isDesktopRuntime()) return;
    const rect = document.querySelector("[data-pet-body]")?.getBoundingClientRect();
    if (rect) void invoke("pet_drag", { phase: "layout", footX: rect.left + rect.width / 2, footY: rect.top + rect.height * .9, bodySize: size }).catch(console.error);
  }, [suspended, size, position, monitor]);
  // Re-measure after React updates, text changes, or popup size changes. Native
  // drop layout preserves the pet's global position while restoring canvas room.
  useLayoutEffect(() => {
    if (suspended) return;
    const pet = document.querySelector<HTMLElement>("[data-pet-body]");
    if (!pet) return;
    let frame = 0;
    const update = () => {
      const rect = pet.getBoundingClientRect();
      const menu = document.querySelector<HTMLElement>("[data-pet-menu]");
      if (menu) {
        const position = placePetMenu(rect, { width: innerWidth, height: innerHeight });
        menu.style.left = `${position.left}px`;
        menu.style.top = `${position.top}px`;
      }
      document.querySelectorAll<HTMLElement>("[data-pet-popover]").forEach(panel => {
        let target: Rect = rect;
        if (menu && panel.classList.contains("pet-actions")) {
          const control = menu.getBoundingClientRect();
          const left = Math.min(rect.left, control.left), top = Math.min(rect.top, control.top);
          target = { left, top, width: Math.max(rect.right, control.right) - left, height: Math.max(rect.bottom, control.bottom) - top };
        }
        const position = placePetPopover(target, { width: panel.offsetWidth, height: panel.offsetHeight }, { width: innerWidth, height: innerHeight });
        panel.style.left = `${Math.round(position.left)}px`;
        panel.style.top = `${Math.round(position.top)}px`;
      });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(pet);
    document.querySelectorAll<HTMLElement>("[data-pet-popover]").forEach(panel => observer.observe(panel));
    window.addEventListener("resize", schedule);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("resize", schedule); };
  });
  return anchor?.identity === identity ? { ...resizePetAnchor(anchor, size), right: "auto", bottom: "auto", transform: "none" } : undefined;
}

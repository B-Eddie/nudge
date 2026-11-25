import { PiPause, PiChartBar, PiNotePencil, PiCookie, PiSoccerBall, PiPlay, PiGear, PiTarget, PiPlant, PiSmileyAngry } from "react-icons/pi";
import { useEffect, useRef } from "react";

interface RadialMenuProps {
  position: string;
  break: number;
  open: boolean;
  name?: string;
  onAction: (action: string) => void;
  onNote: () => void;
  onClose: () => void;
}

// Compact companion actions leave the pet itself available for touch and dragging.
export function RadialMenu({ position, break: resting, open, name = "Your companion", onAction, onNote, onClose }: RadialMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    // Hand focus back to the pet for keyboard users; a mouse user shouldn't be left with a ring.
    let keyboard = false;
    const key = () => { keyboard = true; }, pointer = () => { keyboard = false; };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", pointer, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", pointer, true);
      const body = document.querySelector<HTMLButtonElement>("[data-pet-body]");
      if (keyboard) body?.focus({ preventScroll: true }); else body?.blur();
    };
  }, [open]);
  if (!open) return null;
  const actions = [
    { action: resting ? "endbreak" : "break", Icon: resting ? PiPlay : PiPause, label: resting ? "End break" : "Take a break", short: resting ? "End break" : "Break" },
    { action: "focus", Icon: PiTarget, label: "Focus session", short: "Focus" },
    { action: "ugh", Icon: PiSmileyAngry, label: "Do-Nothing Expansion: get mad at this", short: "Expand" },
    { action: "pet-play", Icon: PiSoccerBall, label: "Play with pet", short: "Play" },
    { action: "pet-treat", Icon: PiCookie, label: "Give a treat", short: "Treat" },
    { action: "garden", Icon: PiPlant, label: "Garden and outfits", short: "Garden" },
    { action: "summary", Icon: PiChartBar, label: "Activity summary", short: "Activity" },
    { action: "note", Icon: PiNotePencil, label: "Reminder note", short: "Notes" },
    { action: "settings", Icon: PiGear, label: "Settings", short: "Settings" },
  ];
  return <div ref={menu} className={`pet-actions pet-actions-${position} interactive`} data-pet-popover role="group" aria-label="Companion actions" onKeyDown={e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const controls = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const current = controls.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? controls.length - 1
      : (current + ({ ArrowUp: -2, ArrowDown: 2, ArrowLeft: -1, ArrowRight: 1 }[e.key] ?? 0) + controls.length) % controls.length;
    controls[next]?.focus();
  }}>
    <span className="pet-actions-label">{name}</span>
    <div className="pet-actions-grid">
      {actions.map(({ action, Icon, label, short }) => <button type="button" key={action} aria-label={label} title={label} onClick={() => { onClose(); if (action === "note") onNote(); else onAction(action); }}><Icon aria-hidden="true" size={18}/><span>{short}</span></button>)}
    </div>
  </div>;
}

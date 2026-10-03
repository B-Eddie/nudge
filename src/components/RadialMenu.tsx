import { PiPause, PiChartBar, PiNotePencil, PiCookie, PiSoccerBall, PiPlay, PiGear } from "react-icons/pi";
import { useEffect, useRef } from "react";

interface RadialMenuProps {
  position: string;
  break: number;
  open: boolean;
  onAction: (action: string) => void;
  onNote: () => void;
  onClose: () => void;
}

// Compact companion actions leave the pet itself available for touch and dragging.
export function RadialMenu({ position, break: resting, open, onAction, onNote, onClose }: RadialMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => document.querySelector<HTMLButtonElement>("[data-pet-body]")?.focus({ preventScroll: true });
  }, [open]);
  if (!open) return null;
  const actions = [
    { action: "pet-play", Icon: PiSoccerBall, label: "Play with pet" },
    { action: "pet-treat", Icon: PiCookie, label: "Give a treat" },
    { action: resting ? "endbreak" : "break", Icon: resting ? PiPlay : PiPause, label: resting ? "End break" : "Take a break" },
    { action: "summary", Icon: PiChartBar, label: "Activity summary" },
    { action: "settings", Icon: PiGear, label: "Settings" },
    { action: "note", Icon: PiNotePencil, label: "Reminder note" },
  ];
  return <div ref={menu} className={`pet-actions pet-actions-${position} interactive`} data-pet-popover role="group" aria-label="Companion actions" onKeyDown={e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const controls = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const current = controls.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? controls.length - 1
      : (current + (e.key === "ArrowUp" ? -1 : 1) + controls.length) % controls.length;
    controls[next]?.focus();
  }}>
    <span className="pet-actions-label">Your companion</span>
    {actions.map(({ action, Icon, label }) => <button type="button" key={action} onClick={() => { onClose(); if (action === "note") onNote(); else onAction(action); }}><Icon aria-hidden="true" size={17}/><span>{label}</span></button>)}
  </div>;
}

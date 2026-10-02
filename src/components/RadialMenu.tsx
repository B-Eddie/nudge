import { FaPause, FaChartSimple, FaNoteSticky, FaCookieBite, FaFutbol } from "react-icons/fa6";
import { FaPlay } from "react-icons/fa";
import { IoMdSettings } from "react-icons/io";
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
    { action: "pet-play", Icon: FaFutbol, label: "Play with pet" },
    { action: "pet-treat", Icon: FaCookieBite, label: "Give a treat" },
    { action: resting ? "endbreak" : "break", Icon: resting ? FaPlay : FaPause, label: resting ? "End break" : "Take a break" },
    { action: "summary", Icon: FaChartSimple, label: "Activity summary" },
    { action: "settings", Icon: IoMdSettings, label: "Settings" },
    { action: "note", Icon: FaNoteSticky, label: "Reminder note" },
  ];
  return <div ref={menu} className={`pet-actions pet-actions-${position} interactive`} data-pet-popover role="group" aria-label="Companion actions" onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
    {actions.map(({ action, Icon, label }) => <button key={action} onClick={() => { onClose(); if (action === "note") onNote(); else onAction(action); }}><Icon aria-hidden="true" size={13}/><span>{label}</span></button>)}
  </div>;
}

import { PiPause, PiPlay, PiTarget, PiLightning } from "react-icons/pi";
import { useEffect, useRef } from "react";

interface RadialMenuProps {
  position: string;
  break: number;
  open: boolean;
  name?: string;
  epithet?: string;
  /** Napper rank, worn like a badge. */
  rank?: string;
  /** Under each verb: what it will do right now. */
  rest?: string;
  focus?: string;
  expand?: { label: string; ready: boolean };
  onAction: (action: string) => void;
  onNote?: () => void;
  onClose: () => void;
}

/** Three things to do, two places to go. Everything else lives in Home or the menu bar. */
export function RadialMenu({ position, break: resting, open, name = "Your companion", epithet, rank, rest, focus, expand, onAction, onClose }: RadialMenuProps) {
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
  const verbs = [
    resting ? { action: "endbreak", Icon: PiPlay, label: "I’m back", note: "end the rest" }
      : { action: "rest", Icon: PiPause, label: "Rest", note: rest ?? "a short pause, together" },
    { action: "focus", Icon: PiTarget, label: "Focus", note: focus ?? "one thing, on a sign" },
    { action: "ugh", Icon: PiLightning, label: "Expand", note: expand?.label ?? "at the window in front", spent: expand ? !expand.ready : false },
  ];
  const go = (action: string) => { onClose(); onAction(action); };
  return <div ref={menu} className={`pet-actions pet-actions-${position} interactive`} data-pet-popover role="group" aria-label={`${name}: actions`} onKeyDown={e => {
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
    <span className="pet-actions-head"><strong>{name}{rank && <em className="pet-rank">{rank}</em>}</strong>{epithet && <span>{epithet}</span>}</span>
    <div className="pet-actions-main">
      {verbs.map(({ action, Icon, label, note, spent }) => <button type="button" key={action} className={spent ? "spent" : undefined}
        aria-label={`${label}: ${note}`} onClick={() => go(action)}><Icon aria-hidden="true" size={19} /><span>{label}</span><small>{note}</small></button>)}
    </div>
    <div className="pet-actions-places">
      <button type="button" onClick={() => go("garden")}>Home</button>
      <button type="button" onClick={() => go("settings")}>Settings</button>
    </div>
  </div>;
}

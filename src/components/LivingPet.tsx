import { useEffect, useState, type CSSProperties } from "react";
import type { CompanionId } from "../types/appearance";
import type { PetAttention } from "../hooks/useCharacterInteraction";
import { usePetBehavior } from "../hooks/usePetBehavior";
import { usePetExpression } from "../hooks/usePetExpression";
import { PetPlaything } from "./PetPlaything";
import { petSize } from "../types/petSize";
import { ADVENTURES, type PetRequest } from "../hooks/usePetLife";
import { PixelPetSprite } from "./PixelPetSprite";
import "./LivingPet.css";

interface Props {
  size?: number;
  character: CompanionId; name: string; category?: string; resting: boolean;
  hovered: boolean; dragging: boolean; petted: number; attention: PetAttention;
  request?: PetRequest;
  busy: boolean; position: string; energy: number; onMenu: () => void; onPet: () => void;
}
export function LivingPet(p: Props) {
  const size = petSize(p.size);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [happy, setHappy] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!p.petted) return;
    setHappy(true);
    const timeout = setTimeout(() => setHappy(false), 2200);
    return () => clearTimeout(timeout);
  }, [p.petted]);
  const behavior = usePetBehavior(p.category, p.resting, p.busy || p.dragging || happy, reduced, p.character, p.energy, p.request, p.hovered);
  const { activity, transitioning, outing, adventure, touches, responding, interact } = behavior;
  const { pose, reacting } = usePetExpression({
    ...behavior, character: p.character, hovered: p.hovered, dragging: p.dragging,
    petted: p.petted, near: p.attention.near, busy: p.busy, energy: p.energy, reducedMotion: reduced,
  });
  const direction = p.position.endsWith("r") ? -1 : 1;
  const walking = outing === "walk" || outing === "home";
  const facing = outing === "home" ? -direction : direction;
  const style = {
    "--gaze-x": `${p.attention.near && !reduced ? Math.round(p.attention.x) * 2 : 0}px`,
    "--gaze-y": `${p.attention.near && !reduced ? Math.round(p.attention.y) * 2 : 0}px`,
    "--object-x": direction === 1 ? "110px" : "-22px",
    "--sniff-x": `${direction * 2}px`,
    "--walk-x": `${reduced ? 0 : direction * 32}px`,
  } as CSSProperties;
  const mood = p.dragging ? "lifted" : reacting ? "happy" : p.hovered ? "curious" : outing === "sniff" ? "sniff" : activity;
  return <div className={`pet-stage${p.attention.near ? " pet-pointer-near" : ""}`} style={{ "--pet-size": `${size}px`, "--pet-scale": size / 120 } as CSSProperties}
    onContextMenu={e => { e.preventDefault(); p.onMenu(); }}>
    <div className={`living-pet outing-${outing} mood-${mood} ${adventure ? `adventure-${adventure.kind} adventure-${adventure.phase} ${ADVENTURES[adventure.kind].travels ? "adventure-travels" : ""}` : ""} ${transitioning ? "pet-changing" : ""} ${p.energy <= 2 ? "pet-tired" : ""} ${p.hovered ? "pet-attended" : ""}`} style={style} data-pet-pose={pose} data-pet-adventure={adventure?.kind} data-pet-phase={adventure?.phase}>
    {adventure && <PetPlaything kind={adventure.kind} phase={adventure.phase} touches={touches} responding={responding} onInteract={interact} />}
    <button className="pet-body" data-pet-body aria-label={`${p.name}${adventure ? `. ${ADVENTURES[adventure.kind].label}` : ""}. Click to pet, drag to move, right-click for menu.`}
      onClick={e => { if (e.detail === 0) p.onPet(); }}
      onKeyDown={e => { if (e.key === "F10" && e.shiftKey) { e.preventDefault(); p.onMenu(); } }}>
      <span className="pet-shadow" aria-hidden="true" />
      <span className="pet-rig"><span className="pet-breath"><span className="pet-attention">
        <span className={walking || outing === "sniff" ? (facing < 0 ? "pet-facing-left" : "pet-facing-right") : ""}>
          <PixelPetSprite character={p.character} pose={pose} phone={!adventure && activity === "social" && pose === "curious" && !p.hovered && !p.dragging} />
        </span>
      </span></span></span>
      <svg className="pet-heart" viewBox="0 0 9 8" shapeRendering="crispEdges" aria-hidden="true"><path d="M1 0H3V1H6V0H8V1H9V4H8V5H7V6H6V7H5V8H4V7H3V6H2V5H1V4H0V1H1Z" fill="#c87f7c"/><path d="M1 1H3V2H1Z" fill="#f1b9a4"/></svg>
      <span className="pet-zzz" aria-hidden="true">z</span>
    </button>
    </div>
    <button data-pet-menu className="pet-menu-button" aria-label="Companion menu" title="Companion menu (or right-click your pet)" onClick={p.onMenu}>···</button>
  </div>;
}

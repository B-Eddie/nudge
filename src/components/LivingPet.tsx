import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CompanionId } from "../types/appearance";
import type { PetAttention } from "../hooks/useCharacterInteraction";
import { usePetBehavior } from "../hooks/usePetBehavior";
import { usePetExpression } from "../hooks/usePetExpression";
import { PetPlaything } from "./PetPlaything";
import { petSize } from "../types/petSize";
import { ADVENTURES, type PetRequest } from "../hooks/usePetLife";
import { PixelPetSprite } from "./PixelPetSprite";
import { useAmbientLight } from "../hooks/useAmbientLight";
import { useTantrum } from "../hooks/useTantrum";
import { TECHNIQUES } from "../lib/napjutsu";
import { MEGAPHONE, VEIN } from "../lib/tantrumArt";
import { PixelArt, PlantArt } from "./PixelArt";
import type { AccessoryId } from "../lib/companion";
import type { Plant } from "../lib/garden";
import { stageOf } from "../lib/garden";
import type { PetPose } from "../types/pixelPets";
import "./LivingPet.css";

interface Props {
  size?: number;
  character: CompanionId; name: string; category?: string; resting: boolean;
  hovered: boolean; dragging: boolean; petted: number; attention: PetAttention;
  request?: PetRequest;
  motionPaused?: boolean;
  busy: boolean; position: string; energy: number; onMenu: () => void; onPet: () => void;
  accessory?: AccessoryId | null;
  /** Pose held while doing a break routine together, and its breath. */
  performing?: PetPose; breathe?: "in" | "out";
  /** 0 awake to 3 asleep: how long a nudge has gone unanswered. */
  drowsy?: 0 | 1 | 2 | 3;
  /** Music is playing somewhere on the Mac. */
  music?: boolean;
  /** Short text on the pet's sign, for a focus session. */
  sign?: string;
  /** A plant that just grew, shown beside the pet for a moment. */
  sprout?: Plant | null;
  /** Leaving the ground to land on another window. */
  hopping?: boolean;
  /** When the pet started being cross at what's on screen. */
  tantrum?: number | null;
  /** Going all out. */
  ultimate?: boolean;
  /** A nudge is waiting for an answer. */
  announcing?: boolean;
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
  // A short squash-and-settle when the pet is put down, so it lands on the desktop.
  const [landing, setLanding] = useState(false);
  const aloft = p.dragging || !!p.hopping;
  const wasAloft = useRef(aloft);
  useEffect(() => {
    const dropped = wasAloft.current && !aloft;
    wasAloft.current = aloft;
    if (!dropped || reduced) return;
    setLanding(true);
    const timeout = setTimeout(() => setLanding(false), 420);
    return () => clearTimeout(timeout);
  }, [aloft, reduced]);
  const ambient = useAmbientLight();
  const fit = useTantrum(p.dragging ? null : p.tantrum ?? null, p.character, p.ultimate);
  const behavior = usePetBehavior(p.category, p.resting, p.busy || p.dragging || happy || !!p.performing || !!fit || (p.drowsy ?? 0) >= 2, reduced, p.character, p.energy, p.request, p.hovered);
  const { activity, transitioning, outing, adventure, touches, responding, interact } = behavior;
  const { pose, reacting } = usePetExpression({
    ...behavior, character: p.character, hovered: p.hovered, dragging: p.dragging,
    petted: p.petted, near: p.attention.near, busy: p.busy, energy: p.energy, reducedMotion: reduced, performing: p.performing, mad: fit?.step.pose, drowsy: p.drowsy,
  });
  const direction = p.position.endsWith("r") ? -1 : 1;
  const walking = outing === "walk" || outing === "home";
  const facing = outing === "home" ? -direction : direction;
  const style = {
    "--object-x": direction === 1 ? "110px" : "-22px",
    "--sniff-x": `${direction * 2}px`,
    "--pet-side": direction,
    "--walk-x": `${reduced ? 0 : direction * 32}px`,
  } as CSSProperties;
  const mood = p.dragging ? "lifted" : fit ? "mad" : reacting ? "happy" : p.hovered ? "curious" : outing === "sniff" ? "sniff"
    : p.drowsy === 3 && !adventure && !p.performing ? "sleep" : activity;
  // Background music sets a gentle sway, unless the pet is already wearing headphones.
  const swaying = p.music && !fit && !p.resting && !p.performing && !adventure && outing === "rest" && mood !== "sleep" && mood !== "music" && !p.busy;
  return <div className={`pet-stage${p.attention.near ? " pet-pointer-near" : ""}${landing ? " pet-landing" : ""}${p.hopping ? " pet-hopping" : ""}`} data-ambient={ambient} style={{ "--pet-size": `${size}px`, "--pet-scale": size / 120 } as CSSProperties}
    onContextMenu={e => { e.preventDefault(); p.onMenu(); }}>
    <div className={`living-pet outing-${outing} mood-${mood} ${adventure ? `adventure-${adventure.kind} adventure-${adventure.phase} ${ADVENTURES[adventure.kind].travels ? "adventure-travels" : ""}` : ""} ${transitioning ? "pet-changing" : ""} ${p.energy <= 2 ? "pet-tired" : ""} ${p.energy === 1 ? "pet-spent" : ""} ${p.hovered ? "pet-attended" : ""} ${p.breathe ? `pet-breathe-${p.breathe}` : ""} ${swaying ? "pet-swaying" : ""} ${fit ? `pet-mad pet-act-${fit.step.act}` : ""}`} style={style} data-pet-pose={pose} data-pet-adventure={adventure?.kind} data-pet-phase={adventure?.phase}>
    {adventure && <PetPlaything kind={adventure.kind} phase={adventure.phase} touches={touches} responding={responding} onInteract={interact} />}
    {p.sprout && !adventure && <span className={`pet-sprout ${direction === 1 ? "on-right" : "on-left"}`} aria-hidden="true"><PlantArt species={p.sprout.species} stage={stageOf(p.sprout)} scale={2.5} /></span>}
    {p.sign && !p.sprout && !adventure && <span className={`pet-sign ${direction === 1 ? "on-right" : "on-left"}`} aria-hidden="true"><span className="pet-sign-board">{p.sign}</span></span>}
    {fit?.step.shout && <span key={fit.index} className={`pet-shout ${/^[A-Z ]+$/.test(fit.step.shout) ? "loud" : ""}`} aria-hidden="true">{fit.step.shout}</span>}
    {fit && !fit.step.calm && !p.ultimate && <span className="pet-vein" aria-hidden="true"><PixelArt art={VEIN} scale={2} /></span>}
    {p.announcing && !fit && <span className={`pet-megaphone ${direction === 1 ? "on-right" : "on-left"}`} aria-hidden="true"><PixelArt art={MEGAPHONE} scale={2} /></span>}
    {swaying && <span className="pet-note" aria-hidden="true">♪</span>}
    <button className="pet-body" data-pet-body aria-label={`${p.name}${adventure ? `. ${ADVENTURES[adventure.kind].label}` : ""}${p.sign ? `. Focusing on ${p.sign}` : ""}${p.drowsy === 3 ? ". Asleep; pet to wake" : ""}. Click to pet, drag to move, right-click for menu.`}
      onClick={e => { if (e.detail === 0) p.onPet(); }}
      onKeyDown={e => { if (e.key === "F10" && e.shiftKey) { e.preventDefault(); p.onMenu(); } }}>
      <span className="pet-shadow" aria-hidden="true" />
      <span className="pet-rig"><span className="pet-breath"><span className="pet-attention">
        <span className={fit ? (direction < 0 ? "pet-facing-left" : "pet-facing-right") : walking || outing === "sniff" ? (facing < 0 ? "pet-facing-left" : "pet-facing-right") : ""}>
          <PixelPetSprite character={p.character} pose={pose} accessory={p.accessory}
            animated energy={p.energy} mad={!!fit && !fit.step.calm} power={fit && p.ultimate && fit.step.act !== "stand" ? TECHNIQUES[p.character] : null} paused={!fit && (p.motionPaused ?? p.busy)} reducedMotion={reduced}
            attention={fit ? { ...p.attention, x: 1, y: 0, tracking: true } : { ...p.attention, x: (walking || outing === "sniff") && facing < 0 ? -p.attention.x : p.attention.x }}
            phone={!adventure && activity === "social" && pose === "curious" && !p.hovered && !p.dragging} />
        </span>
      </span></span></span>
      <svg className="pet-heart" viewBox="0 0 9 8" shapeRendering="crispEdges" aria-hidden="true"><path d="M1 0H3V1H6V0H8V1H9V4H8V5H7V6H6V7H5V8H4V7H3V6H2V5H1V4H0V1H1Z" fill="#c87f7c"/><path d="M1 1H3V2H1Z" fill="#f1b9a4"/></svg>
      <span className="pet-zzz" aria-hidden="true">z</span>
    </button>
    </div>
    <button data-pet-menu className="pet-menu-button" aria-label="Companion menu" title="Companion menu (or right-click your pet)" onClick={p.onMenu}>···</button>
  </div>;
}

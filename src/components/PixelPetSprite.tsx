import { useEffect, useRef } from "react";
import { sheetParts } from "../lib/petSheet";
import type { CompanionId } from "../types/appearance";
import type { PetAttention } from "../lib/petAttention";
import { getPetRig } from "../lib/petRig";
import { LOGICAL_SIZE, prepareSpritePixels, renderSpritePixels, type SpriteLayers, type Worn } from "../lib/petRenderer";
import { placeAccessory, SIGNATURE, type GearId } from "../lib/accessoryArt";
import type { AccessoryId } from "../lib/companion";
import { sway, transitionFrame, transitionLength } from "../lib/petTransition";
import { samplePetMotion } from "../lib/petMotion";
import { PET_POSES, PIXEL_PETS, type PetPose } from "../types/pixelPets";

interface SpriteProps {
  character: CompanionId;
  pose?: PetPose;
  phone?: boolean;
  animated?: boolean;
  paused?: boolean;
  reducedMotion?: boolean;
  attention?: PetAttention;
  accessory?: AccessoryId | null;
  /** Scowling at something. */
  mad?: boolean;
  /** 1 worn out to 5 rested: shown by the pet's own feature. */
  energy?: number;
  /** Colours of a technique in use. */
  power?: { power: string; glow: string } | null;
}
interface PreparedAtlas {
  poses: Record<PetPose, SpriteLayers>;
  /** Where an outfit sits in a pose, measured on first use. */
  wear: (id: GearId | null, pose: PetPose) => Worn | null;
}
const atlases = new Map<string, Promise<PreparedAtlas>>();

export function loadSprite(character: CompanionId) {
  const key = character;
  let promise = atlases.get(key);
  if (!promise) {
    promise = new Promise<PreparedAtlas>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const atlas = document.createElement("canvas");
          atlas.width = image.naturalWidth;
          atlas.height = image.naturalHeight;
          const ctx = atlas.getContext("2d");
          if (!ctx) throw new Error("Companion canvas unavailable");
          ctx.drawImage(image, 0, 0);
          const rgba = ctx.getImageData(0, 0, atlas.width, atlas.height).data;
          const poses = {} as Record<PetPose, SpriteLayers>;
          const placed = new Map<string, Worn | null>();
          for (const [pose, column] of Object.entries(PET_POSES) as [PetPose, number][]) {
            poses[pose] = prepareSpritePixels(sheetParts(rgba, atlas.width, column), getPetRig(character, pose));
          }
          const solid = (pose: PetPose, x: number, y: number) => x >= 0 && y >= 0 && x < LOGICAL_SIZE && y < LOGICAL_SIZE
            && (["body", "head"] as const).some(part => poses[pose].parts[part][(y * LOGICAL_SIZE + x) * 4 + 3] > 0);
          resolve({ poses, wear: (id, pose) => {
            if (!id) return null;
            const key = `${id}:${pose}`;
            let worn = placed.get(key);
            if (worn === undefined) {
              const place = placeAccessory(id, getPetRig(character, pose), pose, character, (x, y) => solid(pose, x, y));
              worn = place ? { id, place } : null;
              placed.set(key, worn);
            }
            return worn;
          } });
        } catch (error) { atlases.delete(key); reject(error); }
      };
      image.onerror = () => {
        atlases.delete(key);
        reject(new Error(`Cannot load companion artwork: ${PIXEL_PETS[character]}`));
      };
      image.src = PIXEL_PETS[character];
    });
    atlases.set(key, promise);
  }
  return promise;
}

// Decode once. Pointer updates change the articulated face without resetting its
// activity clock, remounting the canvas, or replacing unrelated expression art.
export function PixelPetSprite({ character, pose = "idle", phone = false, animated = false,
  paused = false, reducedMotion = false, attention, accessory = null, mad = false, energy = 5, power = null }: SpriteProps) {
  const size = LOGICAL_SIZE;
  const canvas = useRef<HTMLCanvasElement>(null);
  const inputs = useRef({ pose, phone, animated, paused, reducedMotion, attention, accessory, mad, energy, power });
  inputs.current = { pose, phone, animated, paused, reducedMotion, attention, accessory, mad, energy, power };
  const requestDraw = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let frame: number | null = null;
    let elapsed = 0;
    let lastTime = 0;
    let previousPose: PetPose | null = null;
    let change: { from: PetPose; to: PetPose; at: number } | null = null;
    let swayClock = 0;
    let previousKey = "";
    let gazeX = 0;
    let gazeY = 0;

    void loadSprite(character).then(atlas => {
      if (disposed) return;
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      let lastDraw = 0;
      const schedule = () => {
        if (!disposed && !document.hidden && frame === null) frame = requestAnimationFrame(draw);
      };
      const draw = (now: number) => {
        frame = null;
        if (disposed || document.hidden) return;
        const current = inputs.current;
        const delta = lastTime ? Math.min(80, now - lastTime) : 0;
        lastTime = now;
        if (current.pose !== previousPose) {
          // Keep a walking cycle continuous across its left/right step poses.
          if (!((current.pose === "walkA" || current.pose === "walkB")
            && (previousPose === "walkA" || previousPose === "walkB"))) elapsed = 0;
          if (previousPose && current.animated && !current.reducedMotion && transitionLength(previousPose, current.pose)) {
            change = { from: previousPose, to: current.pose, at: now };
          } else change = null;
          previousPose = current.pose;
          previousKey = "";
        }
        const running = current.animated && !current.paused && !current.reducedMotion;
        if (running) { elapsed += delta; swayClock += delta; }

        const tracking = current.attention?.tracking ?? Boolean(current.attention?.near
          || current.attention?.x || current.attention?.y);
        const targetX = tracking ? current.attention?.x ?? 0 : 0;
        const targetY = tracking ? current.attention?.y ?? 0 : 0;
        const ease = current.reducedMotion ? 1 : Math.min(1, Math.max(delta, 16) / 90);
        gazeX += (targetX - gazeX) * ease;
        gazeY += (targetY - gazeY) * ease;
        const movingEyes = Math.abs(targetX - gazeX) > .02 || Math.abs(targetY - gazeY) > .02;
        const moving = change && transitionFrame(change.from, change.to, atlas.poses[change.from].rig, atlas.poses[change.to].rig, now - change.at);
        if (!moving) change = null;
        if (!lastDraw || now - lastDraw >= 32 || !(running || moving || current.power)) {
          const pose = moving?.pose ?? current.pose;
          const beat = current.power ? Math.floor(now / 90) : 0;
          const lean = running ? Math.round(sway(swayClock, current.energy) * 2) / 2 : 0;
          const motion = samplePetMotion(pose, elapsed, character, current.phone && !moving,
            !current.animated || current.reducedMotion);
          const gaze = { x: Math.round(gazeX * 10) / 10, y: Math.round(gazeY * 10) / 10 };
          const key = JSON.stringify([pose, current.phone, current.accessory, current.mad, current.energy, motion, gaze, lean, moving, beat]);
          if (key !== previousKey) {
            const pixels = renderSpritePixels(atlas.poses[pose], motion, gaze, current.phone && !moving,
              atlas.wear(current.accessory ?? SIGNATURE[character], pose), current.mad, current.energy, { tween: moving?.tween, stretch: moving?.stretch, sway: lean, power: current.power, beat });
            ctx.putImageData(new ImageData(pixels, size, size), 0, 0);
            previousKey = key;
          }
          lastDraw = now;
        }
        if (running || movingEyes || moving || (current.power && !current.reducedMotion)) schedule();
        else lastTime = 0;
      };
      requestDraw.current = schedule;
      schedule();
    }).catch(console.error);

    const visibility = () => {
      lastTime = 0;
      if (document.hidden && frame !== null) { cancelAnimationFrame(frame); frame = null; }
      else requestDraw.current();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      requestDraw.current = () => {};
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [character]);

  useEffect(() => { requestDraw.current(); }, [pose, phone, animated, paused, reducedMotion, accessory, mad, energy, power,
    attention?.x, attention?.y, attention?.near, attention?.tracking]);
  // The box is the pet's usual size; the canvas hangs over its edges so nothing is cut off.
  return <span className="pixel-pet-sprite" aria-hidden="true"><canvas ref={canvas} width={size} height={size} /></span>;
}

import { useEffect, useRef, useState } from "react";
import { isolateAtlas, framePixels } from "../lib/spriteAtlas";
import type { CompanionId } from "../types/appearance";
import type { PetAttention } from "../lib/petAttention";
import { getPetRig } from "../lib/petRig";
import { prepareSpritePixels, renderSpritePixels, type SpriteLayers } from "../lib/petRenderer";
import { samplePetMotion } from "../lib/petMotion";
import { resampleFrame, spriteResolution } from "../lib/spriteResample";
import { PET_POSES, PIXEL_PETS, spritePlacement, mirrorWalkingFrame, type PetPose } from "../types/pixelPets";

interface SpriteProps {
  character: CompanionId;
  pose?: PetPose;
  phone?: boolean;
  animated?: boolean;
  paused?: boolean;
  reducedMotion?: boolean;
  attention?: PetAttention;
  /** CSS pixels the sprite is shown at; picks the art resolution. */
  displaySize?: number;
}
interface PreparedAtlas { poses: Record<PetPose, SpriteLayers> }
const atlases = new Map<string, Promise<PreparedAtlas>>();

/** Tracks devicePixelRatio, which changes when the pet moves to another display. */
function useDevicePixelRatio() {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(`(resolution: ${ratio}dppx)`);
    const update = () => setRatio(window.devicePixelRatio || 1);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [ratio]);
  return ratio;
}

function loadSprite(character: CompanionId, scale: number) {
  const key = `${character}@${scale}`;
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
          const { frames, labels } = isolateAtlas(rgba, atlas.width, atlas.height);
          const poses = {} as Record<PetPose, SpriteLayers>;
          for (const [pose, index] of Object.entries(PET_POSES) as [PetPose, number][]) {
            const source = frames[index];
            const placement = spritePlacement(source, frames[0]);
            const size = 60 * scale;
            const normalized = new Uint8ClampedArray(size * size * 4);
            resampleFrame(framePixels(rgba, atlas.width, labels, source), source.width, source.height,
              normalized, size, {
                x: placement.x * scale, y: placement.y * scale,
                width: placement.width * scale, height: placement.height * scale,
              }, mirrorWalkingFrame(character, pose));
            poses[pose] = prepareSpritePixels(normalized, getPetRig(character, pose), scale);
          }
          resolve({ poses });
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
  paused = false, reducedMotion = false, attention, displaySize = 120 }: SpriteProps) {
  const scale = spriteResolution(displaySize, useDevicePixelRatio());
  const size = 60 * scale;
  const canvas = useRef<HTMLCanvasElement>(null);
  const inputs = useRef({ pose, phone, animated, paused, reducedMotion, attention });
  inputs.current = { pose, phone, animated, paused, reducedMotion, attention };
  const requestDraw = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let frame: number | null = null;
    let elapsed = 0;
    let lastTime = 0;
    let previousPose: PetPose | null = null;
    let previousKey = "";
    let gazeX = 0;
    let gazeY = 0;

    void loadSprite(character, scale).then(atlas => {
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
          previousPose = current.pose;
          previousKey = "";
        }
        const running = current.animated && !current.paused && !current.reducedMotion;
        if (running) elapsed += delta;
        const tracking = current.attention?.tracking ?? Boolean(current.attention?.near
          || current.attention?.x || current.attention?.y);
        const targetX = tracking ? current.attention?.x ?? 0 : 0;
        const targetY = tracking ? current.attention?.y ?? 0 : 0;
        const ease = current.reducedMotion ? 1 : Math.min(1, Math.max(delta, 16) / 90);
        gazeX += (targetX - gazeX) * ease;
        gazeY += (targetY - gazeY) * ease;
        const movingEyes = Math.abs(targetX - gazeX) > .02 || Math.abs(targetY - gazeY) > .02;
        if (!lastDraw || now - lastDraw >= 32 || !running) {
          const motion = samplePetMotion(current.pose, elapsed, character, current.phone,
            !current.animated || current.reducedMotion);
          const gaze = { x: Math.round(gazeX * 10) / 10, y: Math.round(gazeY * 10) / 10 };
          const key = JSON.stringify([current.pose, current.phone, motion, gaze]);
          if (key !== previousKey) {
            const pixels = renderSpritePixels(atlas.poses[current.pose], motion, gaze, current.phone);
            ctx.putImageData(new ImageData(pixels, size, size), 0, 0);
            previousKey = key;
          }
          lastDraw = now;
        }
        if (running || movingEyes) schedule();
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
  }, [character, scale, size]);

  useEffect(() => { requestDraw.current(); }, [pose, phone, animated, paused, reducedMotion,
    attention?.x, attention?.y, attention?.near, attention?.tracking]);
  return <canvas ref={canvas} className="pixel-pet-sprite" width={size} height={size} aria-hidden="true" />;
}

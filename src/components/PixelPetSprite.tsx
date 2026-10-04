import { useEffect, useRef } from "react";
import { isolateAtlas, framePixels } from "../lib/spriteAtlas";
import type { CompanionId } from "../types/appearance";
import type { PetAttention } from "../lib/petAttention";
import { getPetRig } from "../lib/petRig";
import { prepareSpritePixels, renderSpritePixels, type SpriteLayers } from "../lib/petRenderer";
import { samplePetMotion } from "../lib/petMotion";
import { PET_POSES, PIXEL_PETS, spritePlacement, mirrorWalkingFrame, type PetPose } from "../types/pixelPets";

interface SpriteProps {
  character: CompanionId;
  pose?: PetPose;
  phone?: boolean;
  animated?: boolean;
  paused?: boolean;
  reducedMotion?: boolean;
  attention?: PetAttention;
}
interface PreparedAtlas { poses: Record<PetPose, SpriteLayers> }
const atlases = new Map<CompanionId, Promise<PreparedAtlas>>();

function loadSprite(character: CompanionId) {
  let promise = atlases.get(character);
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
            const destination = spritePlacement(source, frames[0]);
            const isolated = document.createElement("canvas");
            isolated.width = source.width;
            isolated.height = source.height;
            isolated.getContext("2d")?.putImageData(
              new ImageData(framePixels(rgba, atlas.width, labels, source), source.width, source.height), 0, 0,
            );
            const normalized = document.createElement("canvas");
            normalized.width = normalized.height = 60;
            const draw = normalized.getContext("2d");
            if (!draw) throw new Error("Companion canvas unavailable");
            draw.imageSmoothingEnabled = false;
            if (mirrorWalkingFrame(character, pose)) { draw.translate(60, 0); draw.scale(-1, 1); }
            draw.drawImage(isolated, 0, 0, source.width, source.height,
              destination.x, destination.y, destination.width, destination.height);
            poses[pose] = prepareSpritePixels(draw.getImageData(0, 0, 60, 60).data, getPetRig(character, pose));
          }
          resolve({ poses });
        } catch (error) { atlases.delete(character); reject(error); }
      };
      image.onerror = () => {
        atlases.delete(character);
        reject(new Error(`Cannot load companion artwork: ${PIXEL_PETS[character]}`));
      };
      image.src = PIXEL_PETS[character];
    });
    atlases.set(character, promise);
  }
  return promise;
}

// Decode once. Pointer updates change the articulated face without resetting its
// activity clock, remounting the canvas, or replacing unrelated expression art.
export function PixelPetSprite({ character, pose = "idle", phone = false, animated = false,
  paused = false, reducedMotion = false, attention }: SpriteProps) {
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
            ctx.putImageData(new ImageData(pixels, 60, 60), 0, 0);
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
  }, [character]);

  useEffect(() => { requestDraw.current(); }, [pose, phone, animated, paused, reducedMotion,
    attention?.x, attention?.y, attention?.near, attention?.tracking]);
  return <canvas ref={canvas} className="pixel-pet-sprite" width={60} height={60} aria-hidden="true" />;
}

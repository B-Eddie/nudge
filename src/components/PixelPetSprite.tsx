import { useEffect, useRef } from "react";
import { isolateAtlas, framePixels } from "../lib/spriteAtlas";
import type { IsolatedFrame } from "../lib/spriteAtlas";
import type { CompanionId } from "../types/appearance";
import { PET_POSES, PIXEL_PETS, spritePlacement, mirrorWalkingFrame, type PetPose } from "../types/pixelPets";

interface PreparedAtlas { frames: IsolatedFrame[]; artwork: HTMLCanvasElement[] }
const images = new Map<string, Promise<PreparedAtlas>>();
function loadSprite(url: string) {
  let promise = images.get(url);
  if (!promise) {
    promise = new Promise<PreparedAtlas>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const atlas = document.createElement("canvas");
          atlas.width = image.naturalWidth; atlas.height = image.naturalHeight;
          const ctx = atlas.getContext("2d");
          if (!ctx) throw new Error("Companion canvas unavailable");
          ctx.drawImage(image, 0, 0);
          const rgba = ctx.getImageData(0, 0, atlas.width, atlas.height).data;
          const { frames, labels } = isolateAtlas(rgba, atlas.width, atlas.height);
          const artwork = frames.map(frame => {
            const isolated = document.createElement("canvas");
            isolated.width = frame.width; isolated.height = frame.height;
            const pixels = framePixels(rgba, atlas.width, labels, frame);
            isolated.getContext("2d")?.putImageData(new ImageData(pixels, frame.width, frame.height), 0, 0);
            return isolated;
          });
          resolve({ frames, artwork });
        } catch (error) { images.delete(url); reject(error); }
      };
      image.onerror = () => { images.delete(url); reject(new Error(`Cannot load companion artwork: ${url}`)); };
      image.src = url;
    });
    images.set(url, promise);
  }
  return promise;
}
// Keep the same canvas and decoded atlas through expressions, avoiding remount flicker.
export function PixelPetSprite({ character, pose = "idle", phone = false }: { character: CompanionId; pose?: PetPose; phone?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    void loadSprite(PIXEL_PETS[character]).then(atlas => {
      if (cancelled) return;
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return;
      const index = PET_POSES[pose];
      const source = atlas.frames[index];
      const destination = spritePlacement(source, atlas.frames[0]);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 60, 60);
      ctx.save();
      if (mirrorWalkingFrame(character, pose)) { ctx.translate(60, 0); ctx.scale(-1, 1); }
      ctx.drawImage(atlas.artwork[index], 0, 0, source.width, source.height, destination.x, destination.y, destination.width, destination.height);
      ctx.restore();
      if (phone) {
        ctx.fillStyle = "#3b3944"; ctx.fillRect(39, 38, 9, 15);
        ctx.fillStyle = "#a4c5b1"; ctx.fillRect(41, 40, 5, 9);
        ctx.fillStyle = "#e8dfbd"; ctx.fillRect(42, 42, 3, 1); ctx.fillRect(42, 45, 2, 1);
      }
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [character, pose, phone]);
  return <canvas ref={canvas} className="pixel-pet-sprite" width={60} height={60} aria-hidden="true" />;
}

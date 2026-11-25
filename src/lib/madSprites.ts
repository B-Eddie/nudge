import { loadSprite } from "../components/PixelPetSprite";
import type { CompanionId } from "../types/appearance";
import type { PetPose } from "../types/pixelPets";
import type { AccessoryId } from "./companion";
import type { SpriteSource } from "./madScene";
import { renderSpritePixels } from "./petRenderer";
import { SIGNATURE } from "./accessoryArt";
import { samplePetMotion } from "./petMotion";

/** Pet poses for a scene, drawn once each and wearing what the pet is wearing. */
export async function madSprites(character: CompanionId, accessory: AccessoryId | null): Promise<SpriteSource> {
  const { poses, wear } = await loadSprite(character);
  const drawn = new Map<string, HTMLCanvasElement>();
  return (pose: PetPose, mad: boolean) => {
    const key = `${pose}:${mad}`;
    let canvas = drawn.get(key);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = canvas.height = 240;
      const pixels = renderSpritePixels(poses[pose], samplePetMotion(pose, 0, character, false, true), { x: mad ? 1 : 0, y: 0 }, false, wear(accessory ?? SIGNATURE[character], pose), mad);
      const small = document.createElement("canvas");
      small.width = small.height = 80;
      small.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(pixels), 80, 80), 0, 0);
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, 240, 240);
      drawn.set(key, canvas);
    }
    return canvas;
  };
}

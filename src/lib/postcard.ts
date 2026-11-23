import { loadSprite } from "../components/PixelPetSprite";
import type { CompanionId } from "../types/appearance";
import type { AccessoryId } from "./companion";
import { stageOf, type Plant } from "./garden";
import { artWidth, pixelRuns, type PixelArt } from "./pixelArt";
import { plantArt } from "./plantArt";
import { renderSpritePixels } from "./petRenderer";
import { samplePetMotion } from "./petMotion";

export const POSTCARD = { width: 1200, height: 800 };
export interface PostcardInput {
  character: CompanionId; accessory: AccessoryId | null; petName: string; plants: readonly Plant[]; breaks: number; days: number; now: number;
}

function drawArt(ctx: CanvasRenderingContext2D, art: PixelArt, centerX: number, bottom: number, scale: number) {
  const left = Math.round(centerX - artWidth(art) * scale / 2), top = bottom - art.rows.length * scale;
  for (const run of pixelRuns(art)) {
    ctx.fillStyle = run.fill;
    ctx.fillRect(left + run.x * scale, top + run.y * scale, run.width * scale, scale);
  }
}

/** A shareable picture of the pet in its garden. It shows no activity data. */
export async function drawPostcard(canvas: HTMLCanvasElement, input: PostcardInput): Promise<void> {
  const { width, height } = POSTCARD;
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingEnabled = false;
  const hour = new Date(input.now).getHours();
  const [skyTop, sky, grass, soil] = hour >= 21 || hour < 6 ? ["#27315a", "#48588a", "#57714f", "#445c40"]
    : hour >= 18 ? ["#f3c9a6", "#f7e2c8", "#a9b985", "#93a874"] : ["#cfe4f3", "#e6f1ee", "#b5cf95", "#a5c384"];
  const night = hour >= 21 || hour < 6;
  // Banded sky, so the gradient is pixel art too.
  const bands = 8, horizon = 430;
  for (let i = 0; i < bands; i++) {
    ctx.globalAlpha = 1; ctx.fillStyle = sky; ctx.fillRect(0, i * horizon / bands, width, horizon / bands + 1);
    ctx.globalAlpha = 1 - i / (bands - 1); ctx.fillStyle = skyTop; ctx.fillRect(0, i * horizon / bands, width, horizon / bands + 1);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = grass; ctx.fillRect(0, horizon, width, height - horizon);
  ctx.fillStyle = soil; ctx.fillRect(0, 620, width, height - 620);
  ctx.fillStyle = night ? "#f3f0d8" : "#fbe39a"; ctx.fillRect(1020, 90, 80, 80);
  ctx.fillRect(1008, 102, 104, 56); ctx.fillRect(1032, 78, 56, 104);

  const plants = input.plants.slice(-14);
  plants.forEach((plant, i) => {
    const back = i % 2 === 0, column = Math.floor(i / 2);
    drawArt(ctx, plantArt(plant.species, stageOf(plant)), 110 + column * 112 + (back ? 0 : 56), back ? 600 : 740, back ? 6 : 7);
  });

  const { poses, wear } = await loadSprite(input.character, 4);
  const pixels = renderSpritePixels(poses.happy, samplePetMotion("happy", 0, input.character, false, true), { x: 0, y: 0 }, false, wear(input.accessory, "happy"));
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 240;
  sprite.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(pixels), 240, 240), 0, 0);
  ctx.fillStyle = "rgb(40 30 20 / 22%)"; ctx.fillRect(915, 726, 200, 14);
  ctx.drawImage(sprite, 830, 410, 360, 360);

  await document.fonts?.load?.('700 60px "PPNeueBit-Bold"').catch(() => undefined);
  ctx.fillStyle = night ? "#fdf8ea" : "#3b3128";
  ctx.font = '700 84px "PPNeueBit-Bold", monospace';
  ctx.fillText(`${input.petName}’s garden`, 70, 150, 880);
  ctx.font = '700 44px "PPNeueBit-Bold", monospace';
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  ctx.fillText(`grown from ${count(input.breaks, "pause")} over ${count(input.days, "day")}`, 72, 212, 880);
  ctx.font = '700 30px "PPNeueBit-Bold", monospace';
  ctx.fillText("nudge", 72, 775);
}

export async function postcardBytes(input: PostcardInput): Promise<number[]> {
  const canvas = document.createElement("canvas");
  await drawPostcard(canvas, input);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not draw the postcard")), "image/png"));
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

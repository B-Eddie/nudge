/** A short shareable cartoon of a pet and the thing it's cross with. Shared by the app and
 * the website; shows only the words the person typed. */
import type { CompanionId } from "../types/appearance";
import type { PetPose } from "../types/pixelPets";
import { encodeGif, type GifFrame } from "./gif";
import { shortLabel } from "./grudges";
import { actOffset, scatter, tantrumAt } from "./tantrum";
import { drawUltimate, ULTIMATE_MS } from "./ultimate";

export type SceneKind = "mad" | "won";
export interface SceneInput { kind: SceneKind; character: CompanionId; petName: string; label: string }
/** The pet in a pose, 240×240, standing on the canvas's shared floor. */
export type SpriteSource = (pose: PetPose, mad: boolean) => CanvasImageSource | null;

export const SCENE = 320;
const SPRITE = 160, FRAME_MS = 80, WON_MS = 4000, REST_MS = 700;
export const SCENE_FONT = '"PPNeueBit-Bold", "NeueBit", monospace';
let sheet: HTMLCanvasElement | null = null;
const PET = { x: 10, y: 148 };
const WINDOW = { x: 20, y: 44, width: 280, height: 160 };

export const sceneLength = (input: SceneInput) => input.kind === "won" ? WON_MS : ULTIMATE_MS + REST_MS;

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, align: CanvasTextAlign = "left") {
  let px = size;
  do { ctx.font = `700 ${px}px ${SCENE_FONT}`; } while (ctx.measureText(text).width > width && --px > 11);
  ctx.textAlign = align;
  ctx.fillText(text, x, y, width);
  ctx.textAlign = "left";
}

function drawWindow(ctx: CanvasRenderingContext2D, label: string, dx: number, tilt: number) {
  const { x, y, width, height } = WINDOW;
  ctx.save();
  ctx.translate(x + width / 2 + dx, y + height / 2);
  ctx.rotate(tilt);
  ctx.translate(-width / 2, -height / 2);
  ctx.fillStyle = "rgb(50 60 80 / 16%)"; ctx.fillRect(4, 6, width, height);
  ctx.fillStyle = "#3a3f4c"; ctx.fillRect(-2, -2, width + 4, height + 4);
  ctx.fillStyle = "#cfd8e4"; ctx.fillRect(0, 0, width, 30);
  ["#e0675c", "#e6b64c", "#6cae62"].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(9 + i * 12, 12, 7, 7); });
  ctx.fillStyle = "#ffffff"; ctx.fillRect(52, 5, 162, 40); ctx.fillRect(0, 30, width, height - 30);
  ctx.fillStyle = "#333843"; fitText(ctx, label, 61, 24, 144, 20);
  ctx.fillStyle = "#e4e9f0";
  [[16, 50, 150], [16, 68, 236], [16, 86, 210], [16, 104, 226], [16, 122, 110]].forEach(([lx, ly, w]) => ctx.fillRect(lx, ly, w, 7));
  ctx.restore();
}

function bubble(ctx: CanvasRenderingContext2D, text: string, loud: boolean) {
  const size = loud ? 30 : 23;
  ctx.font = `700 ${size}px ${SCENE_FONT}`;
  const width = Math.min(138, Math.ceil(ctx.measureText(text).width)) + 22, x = 168, y = 236, height = 38;
  ctx.fillStyle = "#3a3f4c"; ctx.fillRect(x - 2, y, width + 4, height); ctx.fillRect(x, y - 2, width, height + 4);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#3a3f4c"; ctx.fillRect(x - 8, y + 22, 8, 4);
  ctx.fillStyle = loud ? "#c0393a" : "#333843";
  fitText(ctx, text, x + width / 2, y + (loud ? 29 : 26), width - 14, size, "center");
}

export function drawScene(ctx: CanvasRenderingContext2D, input: SceneInput, elapsed: number, sprite: SpriteSource): void {
  const label = shortLabel(input.label) || "this";
  const { character } = input;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = input.kind === "won" ? "#fdeec9" : "#dfe9f6"; ctx.fillRect(0, 0, SCENE, SCENE);
  ctx.fillStyle = input.kind === "won" ? "#f2d79b" : "#c5d6ea"; ctx.fillRect(0, 296, SCENE, 24);
  ctx.fillStyle = "#333843";
  fitText(ctx, input.kind === "won" ? `${input.petName} beat ${label}` : `${input.petName} vs. ${label}`, SCENE / 2, 31, 290, 27, "center");
  ctx.fillStyle = input.kind === "won" ? "#9a7a3a" : "#71839b";
  fitText(ctx, "nudge · a pet for your Mac", SCENE - 10, 314, 260, 18, "right");

  if (input.kind === "won") {
    drawWindow(ctx, `✓ ${label}`, 0, .07);
    ctx.save(); ctx.translate(WINDOW.x + 176, WINDOW.y + 84); ctx.rotate(-.16);
    const stamp = Math.max(1, 2.2 - elapsed / 260);
    ctx.scale(stamp, stamp);
    ctx.strokeStyle = ctx.fillStyle = "#3f8f5b"; ctx.lineWidth = 4; ctx.strokeRect(-56, -22, 112, 42);
    fitText(ctx, "DONE", 0, 12, 100, 38, "center");
    ctx.restore();
    for (let i = 0; i < 30; i++) {
      const fall = (elapsed / 9 + scatter(i) * 320) % 330;
      ctx.fillStyle = ["#e0675c", "#e6b64c", "#6cae62", "#6f95cf", "#c684b8"][i % 5];
      ctx.fillRect(Math.round(scatter(i + 40) * 316 + Math.sin(elapsed / 300 + i) * 4), Math.round(fall) - 8, 5, 5);
    }
    const beat = Math.floor(elapsed / 320);
    const pose: PetPose = beat % 2 ? "delighted" : "happy";
    const art = sprite(pose, false);
    if (art) ctx.drawImage(art, PET.x + 70, PET.y - (beat % 2 ? 8 : 0), SPRITE, SPRITE);
    return;
  }

  const done = elapsed > 5000;
  drawWindow(ctx, label, 0, done ? .05 : 0);
  const now = tantrumAt(character, elapsed, true), step = now?.step ?? null;
  const offset = step && now ? actOffset(step.act, now.into) : { x: 0, y: 0, scale: 1 };
  // Inside the window and nowhere else, at two screen pixels to one.
  const units = { width: WINDOW.width / 2, height: WINDOW.height / 2 };
  if (!sheet) { sheet = document.createElement("canvas"); sheet.width = units.width; sheet.height = units.height; }
  const small = sheet.getContext("2d")!;
  small.clearRect(0, 0, units.width, units.height);
  drawUltimate(small, { character, ...units, pet: { x: (PET.x + 80 - WINDOW.x) / 2, y: (PET.y + 100 - WINDOW.y) / 2 }, target: { x: 0, y: 0, ...units } }, elapsed);
  ctx.save();
  ctx.translate(WINDOW.x + WINDOW.width / 2, WINDOW.y + WINDOW.height / 2); ctx.rotate(done ? .05 : 0);
  ctx.drawImage(sheet, -WINDOW.width / 2, -WINDOW.height / 2, WINDOW.width, WINDOW.height);
  ctx.restore();
  const art = sprite(step?.pose ?? "idle", step ? !step.calm : false), size = Math.round(SPRITE * offset.scale);
  if (art) ctx.drawImage(art, Math.round(PET.x + offset.x * 1.5 - (size - SPRITE) / 2), Math.round(PET.y + offset.y * 1.5 - (size - SPRITE) * .9), size, size);
  if (step?.shout) bubble(ctx, step.shout, false);
  ctx.fillStyle = "#71839b"; fitText(ctx, "nudge · a pet for your Mac", SCENE - 10, 314, 260, 18, "right");
}

/** Draws every frame and packs them up. Yields between frames so the page stays alive. */
export async function sceneGif(input: SceneInput, sprite: SpriteSource, progress?: (share: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SCENE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  await document.fonts?.load?.(`700 30px ${SCENE_FONT}`).catch(() => undefined);
  const count = Math.ceil(sceneLength(input) / FRAME_MS);
  const frames: GifFrame[] = [];
  for (let i = 0; i < count; i++) {
    drawScene(ctx, input, i * FRAME_MS, sprite);
    frames.push({ pixels: ctx.getImageData(0, 0, SCENE, SCENE).data, delayMs: FRAME_MS });
    if (i % 8 === 7) { progress?.(i / count); await new Promise(resolve => setTimeout(resolve)); }
  }
  return encodeGif(frames, SCENE, SCENE, 2);
}

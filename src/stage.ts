/** A clear sheet over the screen for a few seconds, so what the pet throws lands on the
 * window itself. It takes no clicks, reads nothing and has no access to the app. */
import brush from "./assets/ppneuebit-bold.otf";
import { COMPANIONS, type CompanionId } from "./types/appearance";
import { flight, FLIGHT_MS, scatter, throwTimes } from "./lib/tantrum";
import { drawUltimate, ULTIMATE_MS } from "./lib/ultimate";
import { AMMO, drawPixelArt, SPLATS } from "./lib/tantrumArt";

interface Stage { ultimate?: boolean; character: string; startedAt: number; pet: { x: number; y: number }; target: { x: number; y: number; width: number; height: number } }
/** macOS rounds its windows; so does what happens inside them. */
const WINDOW_CORNER = 14;
const LINGER_MS = 1600, SLIDE_MS = 1200;

const stage = (window as unknown as { __STAGE__?: Stage }).__STAGE__;
const canvas = document.getElementById("stage") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
const known = stage && COMPANIONS.some(c => c.id === stage.character);
if (stage && ctx && known && stage.ultimate) {
  // Drawn small and enlarged, so the whole screen is pixel art.
  const unit = Math.max(3, Math.round(innerHeight / 330));
  const width = canvas.width = Math.ceil(innerWidth / unit), height = canvas.height = Math.ceil(innerHeight / unit);
  canvas.style.cssText = `width:${width * unit}px;height:${height * unit}px;image-rendering:pixelated;border-radius:${WINDOW_CORNER}px`;
  const scale = (v: number) => v / unit;
  const scene = {
    character: stage.character as CompanionId, width, height, pet: { x: scale(stage.pet.x), y: scale(stage.pet.y) },
    target: { x: scale(stage.target.x), y: scale(stage.target.y), width: scale(stage.target.width), height: scale(stage.target.height) },
  };
  void new FontFace("PPNeueBit-Bold", `url(${brush})`, { weight: "700" }).load().then(font => document.fonts.add(font)).catch(() => undefined);
  let last = 0;
  const draw = () => {
    const t = Date.now() - stage.startedAt;
    if (t - last >= 32 || t >= ULTIMATE_MS) { last = t; ctx.clearRect(0, 0, width, height); drawUltimate(ctx, scene, t); }
    if (t < ULTIMATE_MS) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
} else if (stage && ctx && known) {
  const character = stage.character as CompanionId;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = innerWidth * ratio; canvas.height = innerHeight * ratio;
  canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`;
  const { target, pet } = stage;
  // Anything already due while the sheet was opening still gets thrown.
  const late = Math.max(0, Date.now() - stage.startedAt - (throwTimes(character)[0] ?? 0));
  const throws = throwTimes(character).map((at, i) => ({
    at: at + late,
    to: { x: target.x + target.width * (.14 + scatter(i + stage.startedAt % 97) * .4), y: target.y + Math.min(target.height, 120) * (.12 + scatter(i + 5) * .6) },
  }));
  // Big enough to be funny on a large display.
  const big = Math.round(Math.max(5, Math.min(11, innerHeight / 150)));
  const end = throws[throws.length - 1].at + FLIGHT_MS + LINGER_MS;
  const draw = () => {
    const elapsed = Date.now() - stage.startedAt;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.imageSmoothingEnabled = false;
    for (const { at, to } of throws) {
      const t = (elapsed - at) / FLIGHT_MS;
      if (t < 0) continue;
      if (t < 1) { const p = flight(pet, to, t); drawPixelArt(ctx, AMMO[character], p.x, p.y, Math.round(big * .6)); continue; }
      const slide = Math.max(0, (elapsed - end) / SLIDE_MS);
      ctx.globalAlpha = Math.max(0, 1 - slide);
      drawPixelArt(ctx, SPLATS[character], to.x, to.y + (t - 1) * 2 + slide * slide * 90, t < 1.12 ? big + 1 : big);
      ctx.globalAlpha = 1;
    }
    if (elapsed < end + SLIDE_MS) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

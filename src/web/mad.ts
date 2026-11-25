/** The website's "mad at it for you" maker. Built into website/mad.js by
 * website/scripts/build-mad.mjs; nothing typed here leaves the page. */
import { drawScene, SCENE, SCENE_FONT, sceneGif, sceneLength, type SceneInput, type SceneKind, type SpriteSource } from "../lib/madScene";
import { SHEET_POSES } from "./madSheet";
import { MAX_LABEL } from "../lib/grudges";
import type { CompanionId } from "../types/appearance";

const NAMES: Record<CompanionId, string> = { crab: "Crab", panda: "Panda", cat: "Cat", capybara: "Capybara" };
const isPet = (value: string | null): value is CompanionId => !!value && Object.keys(NAMES).includes(value);

/** Shared links keep their words after the #, so they are never sent to a server. */
export function readLink(hash: string): { pet: CompanionId; at: string; kind: SceneKind } {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const pet = params.get("pet");
  return { pet: isPet(pet) ? pet : "crab", at: [...(params.get("at") ?? "")].slice(0, MAX_LABEL).join(""), kind: params.get("did") === "1" ? "won" : "mad" };
}
export function writeLink(base: string, state: { pet: CompanionId; at: string; kind: SceneKind }): string {
  const params = new URLSearchParams({ pet: state.pet, at: state.at });
  if (state.kind === "won") params.set("did", "1");
  return `${base.split("#")[0]}#${params}`;
}

const sheets = new Map<CompanionId, Promise<HTMLImageElement>>();
function sheet(pet: CompanionId): Promise<HTMLImageElement> {
  let promise = sheets.get(pet);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => { sheets.delete(pet); reject(new Error(`Could not load ${pet}`)); };
      image.src = `assets/mad/${pet}.webp`;
    });
    sheets.set(pet, promise);
  }
  return promise;
}
async function sprites(pet: CompanionId): Promise<SpriteSource> {
  const image = await sheet(pet);
  const cells = new Map<string, HTMLCanvasElement>();
  return pose => {
    const index = SHEET_POSES.findIndex(p => p.pose === pose);
    if (index < 0) return null;
    let cell = cells.get(pose);
    if (!cell) {
      cell = document.createElement("canvas");
      cell.width = cell.height = 240;
      cell.getContext("2d")!.drawImage(image, index * 240, 0, 240, 240, 0, 0, 240, 240);
      cells.set(pose, cell);
    }
    return cell;
  };
}

export function initMad(root: HTMLElement): () => void {
  const $ = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const canvas = $<HTMLCanvasElement>("canvas"), input = $<HTMLInputElement>("input"), status = $("[role=status]");
  const save = $<HTMLButtonElement>("[data-mad=save]"), copy = $<HTMLButtonElement>("[data-mad=copy]"), done = $<HTMLButtonElement>("[data-mad=done]");
  const pets = [...root.querySelectorAll<HTMLButtonElement>("[data-pet]")];
  const ctx = canvas.getContext("2d")!;
  const controller = new AbortController(), { signal } = controller;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  let state = readLink(location.hash);
  let art: SpriteSource | null = null, started = performance.now(), frame = 0, last = 0, generation = 0;
  canvas.width = canvas.height = SCENE;

  const scene = (): SceneInput => ({ kind: state.kind, character: state.pet, petName: NAMES[state.pet], label: state.at });
  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    if (!art || now - last < 75) return;
    last = now;
    const length = sceneLength(scene());
    drawScene(ctx, scene(), still.matches ? length - 600 : (now - started) % length, art);
  };
  const refresh = (message = "") => {
    pets.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.pet === state.pet)));
    done.setAttribute("aria-pressed", String(state.kind === "won"));
    canvas.setAttribute("aria-label", state.kind === "won" ? `${NAMES[state.pet]} celebrating` : `${NAMES[state.pet]} unleashing a technique on ${state.at || "this"}`);
    status.textContent = message;
    history.replaceState(null, "", writeLink(location.href, state));
  };
  const load = async () => {
    const mine = ++generation;
    started = performance.now();
    try {
      const next = await sprites(state.pet);
      if (mine === generation) { art = next; started = performance.now(); }
    } catch { if (mine === generation) status.textContent = "That pet couldn’t load. Please try again."; }
  };

  input.value = state.at;
  if (document.activeElement !== input && !state.at) input.placeholder = "taxes";
  input.addEventListener("input", () => { state = { ...state, at: input.value }; refresh(); }, { signal });
  pets.forEach(b => b.addEventListener("click", () => { state = { ...state, pet: b.dataset.pet as CompanionId }; refresh(); void load(); }, { signal }));
  done.addEventListener("click", () => { state = { ...state, kind: state.kind === "won" ? "mad" : "won" }; started = performance.now(); refresh(); }, { signal });
  window.addEventListener("hashchange", () => { state = readLink(location.hash); input.value = state.at; refresh(); void load(); }, { signal });
  save.addEventListener("click", async () => {
    if (!art) return;
    save.disabled = true;
    try {
      const gif = await sceneGif(scene(), art, share => { status.textContent = `Drawing… ${Math.round(share * 100)}%`; });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([gif], { type: "image/gif" }));
      link.download = `nudge-${state.pet}-${state.kind}.gif`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      status.textContent = "Saved. Send it to someone who gets it.";
    } catch (error) {
      console.error(error);
      status.textContent = "Couldn’t make the GIF. Please try again.";
    } finally { save.disabled = false; }
  }, { signal });
  copy.addEventListener("click", async () => {
    const url = writeLink(location.href, state);
    try { await navigator.clipboard.writeText(url); status.textContent = "Link copied."; }
    catch { status.textContent = `Copy this link: ${url}`; }
  }, { signal });

  refresh();
  void document.fonts?.load?.(`700 30px ${SCENE_FONT}`).catch(() => undefined);
  void load();
  frame = requestAnimationFrame(draw);
  return () => { controller.abort(); cancelAnimationFrame(frame); };
}

const root = typeof document === "undefined" ? null : document.getElementById("mad-maker");
if (root) initMad(root);

/** Things you'd rather not be doing. Your pet takes it personally. */
import { isDistractingCategory } from "../types/phrases";
import type { Place } from "./sites";

export interface Grudge { label: string; key: string; faced: number; beaten: number; lastAt: number }
export const MAX_GRUDGES = 30;
export const MAX_LABEL = 28;
const AGAIN_MS = 45 * 60_000;

const tidy = (text: string) => text.replace(/\s+/g, " ").trim();
export const shortLabel = (text: string, max = MAX_LABEL) => {
  const chars = [...tidy(text)];
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
};

export interface Target { label: string; key: string }
/** What to be cross with: a feed or an inbox by its name, a document by its title, an app
 * otherwise. Null when there's nothing nameable, such as a private app. */
export function targetOf(place: Place | null, app: { name: string; category_label: string } | null): Target | null {
  if (place?.category === "Private" || app?.category_label === "Private") return null;
  const category = place?.category ?? "";
  const byName = place?.site && (isDistractingCategory(category) || ["Messages", "News", "Shopping", "Music"].includes(category));
  const name = tidy((byName ? place?.site : place?.page || place?.site) || app?.name || "");
  return name ? { label: shortLabel(name), key: [...name].slice(0, 80).join("").toLowerCase() } : null;
}

export function findGrudge(grudges: readonly Grudge[], place: Place | null, app: { name: string; category_label: string } | null): Grudge | null {
  if (!targetOf(place, app)) return null;
  const site = place?.site?.toLowerCase(), page = place?.page.toLowerCase() ?? "", name = app?.name.toLowerCase();
  return grudges.find(g => g.key === site || g.key === name || (g.key.length >= 3 && page.includes(g.key))) ?? null;
}

export function addGrudge(grudges: readonly Grudge[], target: Target, now: number): Grudge[] {
  if (grudges.some(g => g.key === target.key)) return [...grudges];
  return [...grudges, { ...target, faced: 1, beaten: 0, lastAt: now }].slice(-MAX_GRUDGES);
}
export const dropGrudge = (grudges: readonly Grudge[], key: string) => grudges.filter(g => g.key !== key);
export const facedGrudge = (grudges: readonly Grudge[], key: string, now: number) =>
  grudges.map(g => g.key === key ? { ...g, faced: g.faced + 1, lastAt: now } : g);
export const beatGrudge = (grudges: readonly Grudge[], label: string) =>
  grudges.map(g => g.label === label ? { ...g, beaten: g.beaten + 1 } : g);

/** Seeing the same thing again soon isn't news. */
export const grudgeDue = (grudge: Grudge, now: number) => now - grudge.lastAt >= AGAIN_MS;

const AGAIN = ["Oh. It’s you.", "This again?", "I was hoping it had moved away.", "We meet again."];
export const againLine = (random = Math.random()) => AGAIN[Math.floor(random * AGAIN.length)];

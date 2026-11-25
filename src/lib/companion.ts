/** Everything the companion remembers. Pure updates over one saved document. */
import { blooms, MAX_DROPS_PER_DAY, MAX_PLANTS, SPECIES, water, type GardenEvent, type Plant, type SpeciesId } from "./garden";
import type { FocusRecord, FocusSession } from "./focus";
import { RANKS } from "./napjutsu";
import { MAX_GRUDGES, type Grudge } from "./grudges";
import type { RoutineMemory } from "./breakSuggestion";

export type BondKind = "pet" | "treat" | "play" | "rest" | "focus" | "hello" | "goodnight";
/** Care counts, up to a daily limit. Time at the screen never does. */
const BOND: Record<BondKind, { points: number; perDay: number }> = {
  pet: { points: 1, perDay: 5 }, treat: { points: 2, perDay: 2 }, play: { points: 2, perDay: 2 },
  rest: { points: 3, perDay: 8 }, focus: { points: 2, perDay: 3 }, hello: { points: 1, perDay: 1 },
  goodnight: { points: 2, perDay: 1 },
};
export const BOND_LEVELS = [
  { name: RANKS[0], at: 0 }, { name: RANKS[1], at: 25 }, { name: RANKS[2], at: 80 },
  { name: RANKS[3], at: 180 }, { name: RANKS[4], at: 350 }, { name: RANKS[5], at: 600 },
];

export const ACCESSORY_IDS = ["leaf", "flower", "bow_tie", "scarf", "beanie", "straw_hat", "nightcap", "party_hat", "flower_crown", "star", "headband"] as const;
export type AccessoryId = (typeof ACCESSORY_IDS)[number];

export interface CompanionState {
  version: 1;
  metAt: number;
  bond: number;
  breaks: number;
  goodnights: number;
  plants: Plant[];
  wearing: AccessoryId | null;
  /** Outfits already announced, so each one is a surprise only once. */
  found: AccessoryId[];
  milestones: string[];
  routines: Record<string, RoutineMemory>;
  focus: FocusSession | null;
  focusLog: FocusRecord[];
  /** Things the person asked the pet to stay mad at. */
  grudges: Grudge[];
  /** Tantrums thrown on the person's behalf, and dreaded things finished. Only counts. */
  tantrums: number;
  beaten: number;
  tomorrow: string;
  greetedOn: string;
  letterOn: string;
  today: { date: string; counts: Partial<Record<BondKind, number>>; drops: number };
}

export const dateKey = (now: number) => {
  const d = new Date(now), pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function newCompanion(now: number, metAt = now): CompanionState {
  return {
    version: 1, metAt: Math.min(metAt, now), bond: 0, breaks: 0, goodnights: 0, plants: [], wearing: null,
    found: ["leaf"], milestones: [], routines: {}, focus: null, focusLog: [], grudges: [], tantrums: 0, beaten: 0, tomorrow: "", greetedOn: "", letterOn: "",
    today: { date: dateKey(now), counts: {}, drops: 0 },
  };
}

/* ---- reading a saved document, whatever it contains ---- */
type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback = 0) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
const text = (v: unknown, max = 200) => typeof v === "string" ? v.slice(0, max) : "";
const list = (v: unknown) => Array.isArray(v) ? v : [];
const isAccessory = (v: unknown): v is AccessoryId => (ACCESSORY_IDS as readonly unknown[]).includes(v);

function readFocus(v: unknown): FocusSession | null {
  if (!isObject(v) || !text(v.text) || !num(v.startedAt)) return null;
  return {
    text: text(v.text, 60), startedAt: num(v.startedAt), endsAt: v.endsAt === null ? null : num(v.endsAt) || null,
    focusedSeconds: num(v.focusedSeconds), drift: num(v.drift), nextDriftAt: num(v.nextDriftAt),
    allowed: list(v.allowed).map(x => text(x)).filter(Boolean), ...(v.dreaded === true ? { dreaded: true } : {}), parked: list(v.parked).map(x => text(x)).filter(Boolean),
  };
}

export function readCompanion(raw: unknown, now: number, metAt = now): CompanionState {
  const base = newCompanion(now, metAt);
  if (!isObject(raw)) return base;
  const routines: Record<string, RoutineMemory> = {};
  if (isObject(raw.routines)) for (const [id, m] of Object.entries(raw.routines)) {
    if (isObject(m)) routines[id] = { done: num(m.done), helped: num(m.helped), notReally: num(m.notReally), lastAt: num(m.lastAt) };
  }
  const today = isObject(raw.today) ? raw.today : {};
  const counts: Partial<Record<BondKind, number>> = {};
  if (isObject(today.counts)) for (const kind of Object.keys(BOND) as BondKind[]) {
    const count = num(today.counts[kind]);
    if (count) counts[kind] = count;
  }
  return {
    ...base,
    metAt: Math.min(num(raw.metAt, base.metAt) || base.metAt, now),
    bond: num(raw.bond), breaks: num(raw.breaks), goodnights: num(raw.goodnights),
    plants: list(raw.plants).filter(isObject).filter(p => typeof p.species === "string" && p.species in SPECIES)
      .map((p): Plant => ({ id: num(p.id), species: p.species as SpeciesId, drops: num(p.drops), plantedAt: num(p.plantedAt), bloomedAt: num(p.bloomedAt) || null }))
      .slice(-MAX_PLANTS),
    wearing: isAccessory(raw.wearing) ? raw.wearing : null,
    found: [...new Set<AccessoryId>(["leaf", ...list(raw.found).filter(isAccessory)])],
    milestones: list(raw.milestones).map(x => text(x)).filter(Boolean),
    routines,
    focus: readFocus(raw.focus),
    focusLog: list(raw.focusLog).filter(isObject).map((r): FocusRecord => ({
      text: text(r.text, 60), startedAt: num(r.startedAt), seconds: num(r.seconds),
      outcome: r.outcome === "done" || r.outcome === "partly" || r.outcome === "stuck" ? r.outcome : "ended",
    })),
    grudges: list(raw.grudges).filter(isObject).map((g): Grudge => ({ label: text(g.label, 40), key: text(g.key, 80), faced: num(g.faced), beaten: num(g.beaten), lastAt: num(g.lastAt) }))
      .filter(g => g.label && g.key).slice(-MAX_GRUDGES),
    tantrums: num(raw.tantrums), beaten: num(raw.beaten),
    tomorrow: text(raw.tomorrow), greetedOn: text(raw.greetedOn), letterOn: text(raw.letterOn),
    today: { date: text(today.date) || base.today.date, counts, drops: num(today.drops) },
  };
}

/* ---- updates ---- */
const onDay = (state: CompanionState, now: number): CompanionState =>
  state.today.date === dateKey(now) ? state : { ...state, today: { date: dateKey(now), counts: {}, drops: 0 } };

export function care(state: CompanionState, kind: BondKind, now: number): CompanionState {
  const s = onDay(state, now);
  const count = s.today.counts[kind] ?? 0;
  if (count >= BOND[kind].perDay) return s;
  return { ...s, bond: s.bond + BOND[kind].points, today: { ...s.today, counts: { ...s.today.counts, [kind]: count + 1 } } };
}

/** A finished rest: water the garden and grow closer. */
export function rested(state: CompanionState, drops: number, now: number, random?: () => number): { state: CompanionState; events: GardenEvent[] } {
  const s = onDay(state, now);
  if (drops <= 0) return { state: s, events: [] };
  const allowed = Math.max(0, Math.min(drops, MAX_DROPS_PER_DAY - s.today.drops));
  const { plants, events } = water(s.plants, allowed, now, random);
  const cared = care({ ...s, plants, breaks: s.breaks + 1, today: { ...s.today, drops: s.today.drops + allowed } }, "rest", now);
  return { state: cared, events };
}

export function rememberRoutine(state: CompanionState, id: string, now: number, answer?: "helped" | "notReally"): CompanionState {
  const old = state.routines[id] ?? { done: 0, helped: 0, notReally: 0, lastAt: 0 };
  const next = answer ? { ...old, [answer]: old[answer] + 1 } : { ...old, done: old.done + 1, lastAt: now };
  return { ...state, routines: { ...state.routines, [id]: next } };
}

/** Clears what reveals how days were spent. The garden and the friendship stay. */
export const forgetHistory = (state: CompanionState): CompanionState =>
  ({ ...state, focus: null, focusLog: [], grudges: [], tomorrow: "", routines: {}, letterOn: "" });

export const daysTogether = (state: CompanionState, now: number) =>
  Math.max(1, Math.floor((new Date(dateKey(now)).getTime() - new Date(dateKey(state.metAt)).getTime()) / 86_400_000) + 1);

export function bondLevel(points: number) {
  let index = 0;
  while (index + 1 < BOND_LEVELS.length && points >= BOND_LEVELS[index + 1].at) index++;
  const current = BOND_LEVELS[index], next = BOND_LEVELS[index + 1] ?? null;
  return { index, name: current.name, next, progress: next ? (points - current.at) / (next.at - current.at) : 1 };
}

/* ---- outfits ---- */
interface Accessory { name: string; hint: string; unlocked: (s: CompanionState, now: number) => boolean }
const bonded = (index: number) => (s: CompanionState) => bondLevel(s.bond).index >= index;
export const ACCESSORIES: Record<AccessoryId, Accessory> = {
  leaf: { name: "Little leaf", hint: "Yours from the start", unlocked: () => true },
  flower: { name: "Flower", hint: "Grow your first bloom", unlocked: s => blooms(s.plants) >= 1 },
  bow_tie: { name: "Bow tie", hint: `Become a ${RANKS[1]}`, unlocked: bonded(1) },
  scarf: { name: "Scarf", hint: `Become a ${RANKS[2]}`, unlocked: bonded(2) },
  beanie: { name: "Beanie", hint: "Take 25 pauses", unlocked: s => s.breaks >= 25 },
  straw_hat: { name: "Straw hat", hint: "Grow 5 blooms", unlocked: s => blooms(s.plants) >= 5 },
  nightcap: { name: "Nightcap", hint: "Wrap up a day together", unlocked: s => s.goodnights >= 1 },
  party_hat: { name: "Party hat", hint: "Spend 30 days together", unlocked: (s, now) => daysTogether(s, now) >= 30 },
  flower_crown: { name: "Flower crown", hint: "Grow 12 blooms", unlocked: s => blooms(s.plants) >= 12 },
  headband: { name: "Fighting headband", hint: "Finish 5 things you dreaded", unlocked: s => s.beaten >= 5 },
  star: { name: "Lucky star", hint: `Become a ${RANKS[5]}`, unlocked: bonded(5) },
};
export const unlocked = (state: CompanionState, now: number) =>
  ACCESSORY_IDS.filter(id => state.found.includes(id) || ACCESSORIES[id].unlocked(state, now));

/** The next outfit to announce, if any. */
export function newlyFound(state: CompanionState, now: number): AccessoryId | null {
  return ACCESSORY_IDS.find(id => !state.found.includes(id) && ACCESSORIES[id].unlocked(state, now)) ?? null;
}

/* ---- milestones ---- */
export interface Milestone { id: string; text: string; reached: (s: CompanionState, now: number) => boolean }
export const MILESTONES: Milestone[] = [
  { id: "break-1", text: "Our first pause together", reached: s => s.breaks >= 1 },
  { id: "bloom-1", text: "Our first bloom", reached: s => blooms(s.plants) >= 1 },
  { id: "day-7", text: "One week together", reached: (s, now) => daysTogether(s, now) >= 7 },
  { id: "beat-1", text: "First dreaded thing, done", reached: s => s.beaten >= 1 },
  { id: "break-25", text: "25 pauses", reached: s => s.breaks >= 25 },
  { id: "day-30", text: "One month together", reached: (s, now) => daysTogether(s, now) >= 30 },
  { id: "bloom-12", text: "A dozen blooms", reached: s => blooms(s.plants) >= 12 },
  { id: "break-100", text: "100 pauses", reached: s => s.breaks >= 100 },
  { id: "day-100", text: "100 days together", reached: (s, now) => daysTogether(s, now) >= 100 },
  { id: "beat-25", text: "25 dreaded things, done", reached: s => s.beaten >= 25 },
  { id: "break-500", text: "500 pauses", reached: s => s.breaks >= 500 },
  { id: "day-365", text: "A whole year together", reached: (s, now) => daysTogether(s, now) >= 365 },
];
export const nextMilestone = (state: CompanionState, now: number) =>
  MILESTONES.find(m => !state.milestones.includes(m.id) && m.reached(state, now)) ?? null;

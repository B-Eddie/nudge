import { useEffect, useRef, useState } from "react";
import type { CompanionId } from "../types/appearance";
import type { PetPose } from "../types/pixelPets";
import type { PetActivity } from "./usePetBehavior";

export type AdventureKind = "garden" | "ball" | "butterfly" | "bubbles" | "leaf" | "snack" | "tea" | "stargaze" | "exercise" | "nap" | "peek";
export type AdventurePhase = "notice" | "approach" | "interact" | "celebrate" | "return";
export interface PetRequest { id: number; kind: AdventureKind }
export interface Adventure { kind: AdventureKind; phase: AdventurePhase; manual: boolean }
export const ADVENTURES: Record<AdventureKind, { label: string; pose: PetPose; duration: number; travels: boolean }> = {
  garden: { label: "Tending a little garden", pose: "curious", duration: 4500, travels: true },
  ball: { label: "Batting a ball around", pose: "play", duration: 6200, travels: true },
  butterfly: { label: "Watching a butterfly", pose: "curious", duration: 6500, travels: true },
  bubbles: { label: "Popping bubbles", pose: "delighted", duration: 5800, travels: false },
  leaf: { label: "Investigating a fallen leaf", pose: "curious", duration: 4500, travels: true },
  snack: { label: "Enjoying a little treat", pose: "happy", duration: 5000, travels: true },
  tea: { label: "Taking a tea break", pose: "idle", duration: 6500, travels: false },
  stargaze: { label: "Daydreaming", pose: "curious", duration: 6000, travels: false },
  exercise: { label: "Stretching and shaking out", pose: "stretch", duration: 4500, travels: false },
  nap: { label: "Curling up for a tiny nap", pose: "sleep", duration: 10000, travels: false },
  peek: { label: "Playing peekaboo", pose: "blink", duration: 4000, travels: false },
};
const PERSONALITIES: Record<CompanionId, AdventureKind[]> = {
  crab: ["garden", "bubbles", "leaf", "ball", "exercise", "peek", "snack", "butterfly", "tea", "stargaze", "nap"],
  panda: ["garden", "snack", "tea", "butterfly", "ball", "stargaze", "exercise", "bubbles", "leaf", "nap", "peek"],
  red_panda: ["butterfly", "ball", "peek", "leaf", "bubbles", "garden", "snack", "exercise", "tea", "stargaze", "nap"],
  cat: ["ball", "butterfly", "peek", "leaf", "nap", "bubbles", "exercise", "snack", "garden", "stargaze", "tea"],
  capybara: ["tea", "bubbles", "stargaze", "snack", "nap", "garden", "butterfly", "leaf", "exercise", "ball", "peek"],
};
export function chooseAdventure(character: CompanionId, activity: PetActivity, energy: number, recent: AdventureKind[], allowed?: readonly AdventureKind[]): AdventureKind {
  let options = PERSONALITIES[character];
  if (allowed) options = options.filter(kind => allowed.includes(kind));
  if (energy <= 2) options = options.filter(kind => ["tea", "nap", "stargaze", "snack"].includes(kind));
  else if (activity === "focus" || activity === "read") options = options.filter(kind => ["garden", "tea", "stargaze", "leaf", "exercise"].includes(kind));
  const fresh = options.filter(kind => !recent.includes(kind));
  const choices = fresh.length ? fresh : options.filter(kind => kind !== recent[recent.length - 1]);
  const weight = (kind: AdventureKind) => {
    const preference = PERSONALITIES[character].indexOf(kind);
    return preference < 3 ? 4 : preference < 6 ? 2 : 1;
  };
  let draw = Math.random() * choices.reduce((sum, kind) => sum + weight(kind), 0);
  for (const kind of choices) { draw -= weight(kind); if (draw < 0) return kind; }
  return choices[choices.length - 1] ?? options[0];
}

export function usePetLife(activity: PetActivity, interrupted: boolean, resting: boolean, reduced: boolean,
  character: CompanionId = "panda", energy = 5, request?: PetRequest, attended = false) {
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [touches, setTouches] = useState(0);
  const [beat, setBeat] = useState(0);
  const [responding, setResponding] = useState(false);
  const attendedRef = useRef(attended);
  attendedRef.current = attended;
  const recent = useRef<AdventureKind[]>([]);
  const seenRequest = useRef<number | undefined>(undefined);
  const requestRef = useRef(request);
  requestRef.current = request;
  const pending = useRef<AdventureKind | null>(null);
  const startRef = useRef<(kind: AdventureKind, manual: boolean) => void>(() => {});
  const active = useRef<Adventure | null>(null);
  active.current = adventure;

  useEffect(() => {
    const latest = requestRef.current;
    if (latest && latest.id !== seenRequest.current) {
      seenRequest.current = latest.id;
      pending.current = latest.kind;
    }
    setAdventure(null);
    setTouches(0);
    if (interrupted || ((resting || activity === "sleep") && !pending.current)) return;
    let disposed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (callback: () => void, delay: number) => {
      let remaining = delay;
      let previous = Date.now();
      const timer = setInterval(() => {
        const now = Date.now();
        if (!attendedRef.current) remaining -= now - previous;
        previous = now;
        if (remaining <= 0) {
          clearInterval(timer);
          timers.delete(timer);
          if (!disposed) callback();
        }
      }, Math.min(100, Math.max(1, delay)));
      timers.add(timer);
      return timer;
    };
    const setPhase = (kind: AdventureKind, phase: AdventurePhase, manual: boolean) => setAdventure({ kind, phase, manual });
    const schedule = () => {
      if (reduced || resting || activity === "sleep") return;
      later(() => start(chooseAdventure(character, activity, energy, recent.current), false),
        (activity === "focus" || activity === "read" ? 65000 : energy <= 2 ? 26000 : 18000) + Math.random() * 18000);
    };
    const start = (kind: AdventureKind, manual: boolean) => {
      for (const timer of timers) clearInterval(timer);
      timers.clear();
      recent.current = [...recent.current.slice(-2), kind];
      setTouches(0);
      if (reduced) {
        setPhase(kind, "interact", manual);
        later(() => setAdventure(null), 5000);
        return;
      }
      setPhase(kind, "notice", manual);
      later(() => {
        setPhase(kind, "approach", manual);
        later(() => {
          setPhase(kind, "interact", manual);
          later(() => {
            setPhase(kind, "celebrate", manual);
            later(() => {
              setPhase(kind, "return", manual);
              later(() => { setAdventure(null); schedule(); }, ADVENTURES[kind].travels ? 3200 : 700);
            }, 1300);
          }, ADVENTURES[kind].duration);
        }, ADVENTURES[kind].travels ? 3200 : 500);
      }, 900);
    };
    startRef.current = start;
    if (pending.current) { const kind = pending.current; pending.current = null; start(kind, true); }
    else schedule();
    return () => {
      disposed = true;
      timers.forEach(clearInterval);
      startRef.current = () => {};
    };
  }, [activity, interrupted, resting, reduced, character, energy, request?.id]);

  useEffect(() => {
    setBeat(0);
    if (!adventure || adventure.phase !== "interact" || reduced || attended) return;
    const timer = setInterval(() => setBeat(value => value + 1), ["ball", "bubbles", "peek"].includes(adventure.kind) ? 850 : 1600);
    return () => clearInterval(timer);
  }, [adventure?.kind, adventure?.phase, reduced, attended]);
  useEffect(() => {
    setResponding(touches > 0);
    if (!touches) return;
    const timer = setTimeout(() => setResponding(false), 850);
    return () => clearTimeout(timer);
  }, [touches]);
  const interact = () => {
    const current = active.current;
    if (!current) return;
    setTouches(count => count + 1);
    // A click can wake a napping pet or start the same plaything again.
    if (current.phase === "return" || current.kind === "nap") startRef.current(current.kind === "nap" ? "peek" : current.kind, true);
  };
  const traveling = adventure && ADVENTURES[adventure.kind].travels;
  const outing: "rest" | "walk" | "sniff" | "home" = !adventure || adventure.phase === "notice" ? "rest"
    : adventure.phase === "approach" && traveling ? "walk"
    : adventure.phase === "return" && traveling ? "home" : "sniff";
  const sequences: Record<AdventureKind, PetPose[]> = {
    garden: ["curious", "groom", "happy"], ball: ["play", "delighted", "play", "curious"],
    butterfly: ["curious", "stretch", "curious"], bubbles: ["curious", "delighted", "play"],
    leaf: ["curious", "groom", "play"], snack: ["happy", "groom", "delighted"],
    tea: ["idle", "blink", "happy"], stargaze: ["curious", "idle", "blink"],
    exercise: ["stretch", "groom", "stretch", "idle"], nap: ["sleep"], peek: ["blink", "curious", "delighted"],
  };
  const pose: PetPose | undefined = !adventure ? undefined : responding ? "delighted"
    : adventure.phase === "notice" ? adventure.kind === "nap" ? "yawn" : "curious"
    : adventure.phase === "celebrate" ? adventure.kind === "nap" ? "stretch" : "happy"
    : adventure.phase === "interact" ? sequences[adventure.kind][beat % sequences[adventure.kind].length] : ADVENTURES[adventure.kind].pose;
  return { adventure, outing, adventurePose: pose, touches, responding, interact };
}

/** A garden grown by resting. Plants only ever grow: nothing wilts, and nothing is lost. */

export type SpeciesId = "daisy" | "tulip" | "sunflower" | "lavender" | "fern" | "cactus" | "mushroom" | "strawberry"
  | "bamboo" | "moonflower" | "snowdrop" | "blossom" | "pumpkin" | "maple";

interface Species { name: string; months?: number[]; night?: boolean }
const SPRING = [3, 4, 5], AUTUMN = [9, 10, 11], WINTER = [12, 1, 2];
export const SPECIES: Record<SpeciesId, Species> = {
  daisy: { name: "Daisy" }, tulip: { name: "Tulip" }, sunflower: { name: "Sunflower" }, lavender: { name: "Lavender" },
  fern: { name: "Fern" }, cactus: { name: "Cactus" }, mushroom: { name: "Mushroom" }, strawberry: { name: "Strawberry" },
  bamboo: { name: "Bamboo" },
  moonflower: { name: "Moonflower", night: true },
  snowdrop: { name: "Snowdrop", months: WINTER }, blossom: { name: "Cherry blossom", months: SPRING },
  pumpkin: { name: "Pumpkin", months: [10, 11] }, maple: { name: "Maple sapling", months: AUTUMN },
};
export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];

export const DROPS_TO_BLOOM = 4;
export const MAX_DROPS_PER_DAY = 16;
/** Enough for years of daily breaks; the oldest simply become part of the meadow. */
export const MAX_PLANTS = 600;

export interface Plant { id: number; species: SpeciesId; drops: number; plantedAt: number; bloomedAt: number | null }
export type Stage = "seed" | "sprout" | "bud" | "bloom";
export interface GardenEvent { kind: "planted" | "grew" | "bloomed"; plant: Plant }

export function stageOf(plant: Plant): Stage {
  return plant.drops >= DROPS_TO_BLOOM ? "bloom" : plant.drops === 3 ? "bud" : plant.drops === 2 ? "sprout" : "seed";
}

/** Seasonal and night plants are more likely while their moment lasts, and repeats less so. */
export function chooseSpecies(plants: readonly Plant[], now: number, random = Math.random()): SpeciesId {
  const date = new Date(now), month = date.getMonth() + 1, hour = date.getHours();
  const night = hour >= 21 || hour < 5;
  const recent = plants.slice(-3).map(p => p.species);
  const options = SPECIES_IDS.filter(id => {
    const s = SPECIES[id];
    return (!s.months || s.months.includes(month)) && (!s.night || night);
  });
  const weight = (id: SpeciesId) => {
    const special = SPECIES[id].months || SPECIES[id].night;
    const isNew = !plants.some(p => p.species === id);
    return (special ? 3 : 1) * (isNew ? 3 : 1) * (recent.includes(id) ? 0.15 : 1);
  };
  let draw = random * options.reduce((sum, id) => sum + weight(id), 0);
  for (const id of options) { draw -= weight(id); if (draw < 0) return id; }
  return options[options.length - 1];
}

/** Waters the youngest plant; when it blooms, the rest goes to a new seed. */
export function water(plants: readonly Plant[], drops: number, now: number, random?: () => number): { plants: Plant[]; events: GardenEvent[] } {
  let next = [...plants];
  const events: GardenEvent[] = [];
  for (let i = 0; i < drops; i++) {
    let current = next[next.length - 1];
    if (!current || current.drops >= DROPS_TO_BLOOM) {
      current = { id: (current?.id ?? 0) + 1, species: chooseSpecies(next, now, random?.()), drops: 1, plantedAt: now, bloomedAt: null };
      next = [...next, current];
      events.push({ kind: "planted", plant: current });
      continue;
    }
    const grown: Plant = { ...current, drops: current.drops + 1 };
    if (grown.drops >= DROPS_TO_BLOOM) grown.bloomedAt = now;
    next = [...next.slice(0, -1), grown];
    events.push({ kind: grown.bloomedAt ? "bloomed" : "grew", plant: grown });
  }
  return { plants: next.slice(-MAX_PLANTS), events };
}

export const blooms = (plants: readonly Plant[]) => plants.filter(p => p.drops >= DROPS_TO_BLOOM).length;

/** Water earned by a rest. Every finished pause counts; a long one counts for more. */
export function dropsForRest(rest: { seconds: number; complete: boolean; guided: boolean }): number {
  if (rest.guided) return rest.complete ? (rest.seconds >= 180 ? 2 : 1) : 0;
  if (rest.seconds >= 20 * 60) return 3;
  if (rest.complete) return 2;
  return rest.seconds >= 60 ? 1 : 0;
}

export function gardenLine(event: GardenEvent): string {
  const name = SPECIES[event.plant.species].name.toLowerCase();
  if (event.kind === "planted") return "I planted something in the garden. Let’s see what it is.";
  if (event.kind === "bloomed") return `Look! Our ${name} bloomed.`;
  return event.plant.drops === 3 ? "Our newest plant has a bud." : "Our newest plant grew a little.";
}

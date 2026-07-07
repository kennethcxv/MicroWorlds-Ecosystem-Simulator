/**
 * DIGESTION + TOILETING — pure (no Three.js / DOM). True to the real animal:
 * leopard geckos are famous for choosing ONE "bathroom corner" of their
 * enclosure and going there consistently (usually a corner well away from
 * their hides, food and basking spots — a desert-animal hygiene habit). They
 * defecate roughly every 1–3 days after meals, and the dropping is small and
 * dark with a WHITE URATE CAP (they excrete solid urates instead of liquid
 * urine to save water).
 *
 * In game terms: meals fill a digest store; once enough has been eaten a
 * digest timer arms; when it runs out the gecko needs the toilet, walks to its
 * chosen corner (picked once, persisted — the farthest corner from hides +
 * dishes), squats briefly, and leaves a dropping that dirties the sand until
 * the player cleans it (spot brush or Remove Waste).
 */
import type { GroundBounds } from "../HabitatBounds";
import type { HabitatAnimal, Vec3 } from "../HabitatTypes";

export interface DigestionConfig {
  /** Satiety units eaten before a toilet trip becomes due (≈ 2 real meals). */
  satietyToDigest: number;
  /** Random digestion delay once the threshold is crossed (seconds). */
  digestDelay: [number, number];
  /** How far a toilet corner sits in from the enclosure walls (metres). */
  cornerInset: number;
}

export const LIZARD_DIGESTION: DigestionConfig = {
  satietyToDigest: 24,
  digestDelay: [70, 140],
  cornerInset: 0.2,
};

type Rng = () => number;

/** A meal was swallowed: fill the digest store; arm the timer at threshold. */
export function addMealToDigestion(
  animal: HabitatAnimal,
  satiety: number,
  rng: Rng = Math.random,
  cfg: DigestionConfig = LIZARD_DIGESTION,
): void {
  animal.digest = (animal.digest ?? 0) + satiety;
  if (animal.digest >= cfg.satietyToDigest && (animal.digestT ?? 0) <= 0) {
    animal.digestT = cfg.digestDelay[0] + rng() * (cfg.digestDelay[1] - cfg.digestDelay[0]);
  }
}

/** Per-frame digestion tick. Returns true while a toilet trip is DUE. */
export function tickDigestion(animal: HabitatAnimal, dt: number, cfg: DigestionConfig = LIZARD_DIGESTION): boolean {
  if ((animal.digest ?? 0) < cfg.satietyToDigest) return false;
  if ((animal.digestT ?? 0) > 0) {
    animal.digestT = (animal.digestT ?? 0) - dt;
    return false;
  }
  return true;
}

export function needsToilet(animal: HabitatAnimal, cfg: DigestionConfig = LIZARD_DIGESTION): boolean {
  return (animal.digest ?? 0) >= cfg.satietyToDigest && (animal.digestT ?? 0) <= 0;
}

/** The deed is done — drain one load; anything still in the gut re-arms the
 *  digestion delay (a feast yields SPACED trips, never back-to-back squats). */
export function didPoop(animal: HabitatAnimal, cfg: DigestionConfig = LIZARD_DIGESTION): void {
  animal.digest = Math.max(0, (animal.digest ?? 0) - cfg.satietyToDigest);
  animal.digestT = animal.digest >= cfg.satietyToDigest ? cfg.digestDelay[0] : 0;
}

/**
 * Choose the animal's ONE bathroom corner: the enclosure corner FARTHEST from
 * the things it lives around (hides, dishes) — exactly how real leos pick a
 * spot away from where they sleep and eat. Deterministic given the rng.
 */
export function pickToiletCorner(
  bounds: GroundBounds,
  avoid: { x: number; z: number }[],
  rng: Rng = Math.random,
  cfg: DigestionConfig = LIZARD_DIGESTION,
): [number, number] {
  const i = cfg.cornerInset;
  const corners: [number, number][] = [
    [bounds.minX + i, bounds.minZ + i],
    [bounds.maxX - i, bounds.minZ + i],
    [bounds.minX + i, bounds.maxZ - i],
    [bounds.maxX - i, bounds.maxZ - i],
  ];
  let best = corners[0];
  let bestScore = -Infinity;
  for (const c of corners) {
    let nearest = Infinity;
    for (const a of avoid) nearest = Math.min(nearest, Math.hypot(c[0] - a.x, c[1] - a.z));
    const score = nearest + rng() * 0.01; // tiny tiebreak only
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export interface Dropping {
  id: number;
  position: Vec3;
  age: number;
}

/** Add a dropping to the state list (capped — the oldest quietly weathers away). */
export function addDropping(
  list: Dropping[],
  nextId: number,
  position: Vec3,
  cap = 12,
): { list: Dropping[]; nextId: number } {
  const out = [...list, { id: nextId, position, age: 0 }];
  while (out.length > cap) out.shift();
  return { list: out, nextId: nextId + 1 };
}

/** Remove droppings within `radius` of (x,z) — the spot-clean brush. */
export function cleanDroppingsAt(list: Dropping[], x: number, z: number, radius: number): Dropping[] {
  return list.filter((d) => Math.hypot(d.position[0] - x, d.position[2] - z) > radius);
}

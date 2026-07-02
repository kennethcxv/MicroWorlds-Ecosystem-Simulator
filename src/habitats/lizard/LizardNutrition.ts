/**
 * REAL leopard-gecko feeder NUTRITION — pure data + math (no Three.js / DOM).
 *
 * Every feeder insect carries real relative husbandry numbers (satiety, fat,
 * calcium, moisture + a staple/occasional/treat role from actual care sheets):
 * crickets are the lean classic, dubia roaches the best staple (meaty, best
 * Ca:P), mealworms an easy but fattier staple, superworms big + rich, waxworms
 * a fatty treat geckos get hooked on. Eating applies REAL effects:
 *
 *  · satiety      → hunger restore (bigger/meatier = more filling)
 *  · fat          → shifts the body-condition store up (obesity erodes health)
 *  · calcium      → insects alone are calcium-POOR (bad Ca:P); DUSTING them with
 *                   calcium powder is how real keepers deliver it, and D3 makes
 *                   it absorb best. A drained calcium store erodes health — the
 *                   in-game mirror of metabolic bone disease (MBD).
 *  · moisture     → juicy prey supports hydration for a while after the meal.
 *
 * The FOOD_TYPES table lives here (LizardFeedingSystem re-exports it) so data +
 * meal math sit together. Unit-tested in tests/nutrition.test.ts.
 */
import type { AnimalNeeds, FeederKind, FeedingLogEntry, HabitatAnimal, SupplementKind } from "../HabitatTypes";
import { clamp } from "../HabitatState";

// ── Food data (real relative nutrition) ───────────────────────────────────────
export interface FoodProfile {
  label: string;
  /** Hunger restored when eaten (insect size + protein density). */
  satiety: number;
  /** 0..1 relative fat content — drives body condition; treats are ~1. */
  fat: number;
  /** 0..1 relative calcium value BEFORE dusting (all feeders are Ca-poor). */
  calcium: number;
  /** 0..1 moisture — juicy prey supports hydration after the meal. */
  moisture: number;
  /** Husbandry role — mirrors real care sheets. */
  role: "staple" | "occasional" | "treat";
  /** One-line husbandry note shown in the feeding UI. */
  note: string;
  /** Extra calming/enrichment from the hunt (fast prey = more engaging). */
  calm: number;
  /** Wander speed (m/s) — crickets skitter, worms barely crawl. */
  speed: number;
  /** Seconds before an uneaten one burrows away. */
  lifespan: number;
  /** Emoji fallback for compact UI spots (photo cards are the primary art). */
  icon: string;
}

export const FOOD_TYPES: Record<FeederKind, FoodProfile> = {
  cricket: {
    label: "Cricket",
    satiety: 14,
    fat: 0.18,
    calcium: 0.14,
    moisture: 0.69,
    role: "staple",
    note: "Lean, active staple — fun to hunt",
    calm: 5,
    speed: 0.06,
    lifespan: 45,
    icon: "🦗",
  },
  mealworm: {
    label: "Mealworm",
    satiety: 12,
    fat: 0.42,
    calcium: 0.08,
    moisture: 0.62,
    role: "staple",
    note: "Easy staple — a little fatty",
    calm: 3,
    speed: 0.015,
    lifespan: 70,
    icon: "🪱",
  },
  superworm: {
    label: "Superworm",
    satiety: 22,
    fat: 0.68,
    calcium: 0.08,
    moisture: 0.58,
    role: "occasional",
    note: "Big + rich — a few, not daily",
    calm: 4,
    speed: 0.03,
    lifespan: 65,
    icon: "🪱",
  },
  dubia_roach: {
    label: "Dubia Roach",
    satiety: 20,
    fat: 0.28,
    calcium: 0.2,
    moisture: 0.66,
    role: "staple",
    note: "Best staple — meaty, best Ca:P",
    calm: 4,
    speed: 0.05,
    lifespan: 60,
    icon: "🪳",
  },
  waxworm: {
    label: "Waxworm",
    satiety: 16,
    fat: 1.0,
    calcium: 0.06,
    moisture: 0.61,
    role: "treat",
    note: "Fatty treat — geckos get hooked",
    calm: 7,
    speed: 0.008,
    lifespan: 80,
    icon: "🐛",
  },
};

// ── Supplements (the dusting jar) ─────────────────────────────────────────────
export const SUPPLEMENTS: Record<SupplementKind, { label: string; note: string }> = {
  none: { label: "None", note: "No dusting" },
  calcium: { label: "Calcium", note: "Light dusting" },
  calcium_d3: { label: "Calcium + D3", note: "Light dusting" },
};

/** Calcium the gecko banks from ONE insect. Bare insects give only a trickle
 *  (their Ca:P is poor); dusting delivers the real dose, D3 absorbs best. */
export function calciumFromMeal(kind: FeederKind, supplement: SupplementKind): number {
  const base = FOOD_TYPES[kind].calcium * 5;
  if (supplement === "calcium") return base + 8;
  if (supplement === "calcium_d3") return base + 13;
  return base;
}

/** Body-condition shift from ONE insect — fatty foods pile it on. */
export function conditionShift(kind: FeederKind): number {
  return 1 + FOOD_TYPES[kind].fat * 5.5;
}

/** Hydration support from ONE insect's moisture (decays after the meal). */
export function moistureFromMeal(kind: FeederKind): number {
  return FOOD_TYPES[kind].moisture * 2.5;
}

/** Fill the calcium/body-condition stores an older save's needs won't have.
 *  Idempotent — present values are never touched. */
export function ensureNeedDefaults(needs: Partial<AnimalNeeds>): AnimalNeeds {
  needs.calcium ??= 80;
  needs.bodyCondition ??= 50;
  return needs as AnimalNeeds;
}

/** Apply ONE eaten insect's full nutrition to the animal. */
export function applyMeal(animal: HabitatAnimal, kind: FeederKind, supplement: SupplementKind): void {
  const n = ensureNeedDefaults(animal.needs);
  const food = FOOD_TYPES[kind];
  n.hunger = clamp(n.hunger + food.satiety);
  n.stress = clamp(n.stress - food.calm);
  n.calcium = clamp(n.calcium + calciumFromMeal(kind, supplement));
  n.bodyCondition = clamp(n.bodyCondition + conditionShift(kind));
}

// ── Track Intake (feeding-log summary) ────────────────────────────────────────
export interface IntakeSummary {
  total: number;
  byKind: Partial<Record<FeederKind, number>>;
  /** Fraction of insects that were treats (waxworms). */
  treatFraction: number;
  /** Fraction of insects that were supplement-dusted. */
  dustedFraction: number;
  /** Plain-language diet advice, most important first. */
  advice: string[];
}

export function intakeSummary(log: FeedingLogEntry[]): IntakeSummary {
  const byKind: Partial<Record<FeederKind, number>> = {};
  let total = 0;
  let treats = 0;
  let dusted = 0;
  for (const e of log) {
    total += e.count;
    byKind[e.kind] = (byKind[e.kind] ?? 0) + e.count;
    if (FOOD_TYPES[e.kind]?.role === "treat") treats += e.count;
    if (e.supplement !== "none") dusted += e.count;
  }
  const treatFraction = total > 0 ? treats / total : 0;
  const dustedFraction = total > 0 ? dusted / total : 0;

  const advice: string[] = [];
  if (total === 0) {
    advice.push("No feedings recorded yet — offer a meal.");
  } else {
    if (treatFraction > 0.3) advice.push("Too many treats — waxworms are a reward, not a staple.");
    if (dustedFraction < 0.5) advice.push("Dust feeders with calcium — insects alone can't cover it.");
    const staples = (Object.keys(byKind) as FeederKind[]).filter((k) => FOOD_TYPES[k]?.role === "staple");
    if (staples.length === 1 && total >= 6) advice.push("Rotate staples (crickets, dubia, mealworms) for variety.");
  }
  return { total, byKind, treatFraction, dustedFraction, advice };
}

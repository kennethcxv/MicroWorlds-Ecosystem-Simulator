/**
 * Leopard-gecko needs model — pure. Hunger drains over time; temperature,
 * humidity, hide availability and hunger drive a stress *target* the animal eases
 * toward; sustained high stress erodes health while good conditions recover it.
 * Deliberately simple + data-driven (rates in LIZARD_NEEDS, ideals in the
 * species CareProfile) — real numbers, not a fake bar.
 */
import type { CareProfile, HabitatAnimal, HabitatScores, HabitatState } from "../HabitatTypes";
import { clamp } from "../HabitatState";
import { ensureNeedDefaults } from "./LizardNutrition";

export interface NeedsConfig {
  hungerDrainPerSec: number;
  stressEaseRate: number; // 1/s toward the target
  healthDamagePerSec: number; // while stress is high
  healthRecoverPerSec: number; // while calm
  stressHighThreshold: number;
  eatHungerRestore: number;
  /** Calcium store drain (much slower than hunger — a husbandry rhythm). */
  calciumDrainPerSec: number;
  /** Below this the gecko is calcium-deficient: health erodes (MBD risk). */
  lowCalciumThreshold: number;
  calciumHealthDamagePerSec: number;
  /** Body condition eases toward 50 by this fraction of the gap per second. */
  conditionEasePerSec: number;
  /** Above this the gecko is overweight: no recovery + slow health erosion. */
  obeseThreshold: number;
  obeseHealthDamagePerSec: number;
  /** Post-meal moisture support fade (state.foodMoisture, ~15 min to clear). */
  foodMoistureFadePerSec: number;
}

/** Game-paced rates (faster than real husbandry so the loop is observable).
 *  PACING: hunger drains full → empty in ~80 minutes, so a good meal keeps the
 *  HUD reading "Fed" for a real play session. The old 0.3/s emptied a full
 *  belly in ~5 minutes — the gecko read "Hungry" moments after eating, which
 *  made the (real) Hunger stat look broken. */
export const LIZARD_NEEDS: NeedsConfig = {
  hungerDrainPerSec: 0.02,
  stressEaseRate: 0.4,
  healthDamagePerSec: 0.5,
  healthRecoverPerSec: 0.2,
  stressHighThreshold: 60,
  eatHungerRestore: 20,
  calciumDrainPerSec: 0.006,
  lowCalciumThreshold: 25,
  calciumHealthDamagePerSec: 0.25,
  conditionEasePerSec: 0.0015,
  obeseThreshold: 85,
  obeseHealthDamagePerSec: 0.12,
  foodMoistureFadePerSec: 0.011,
};

export interface NeedsContext {
  scores: HabitatScores;
  profile: CareProfile;
}

/** The stress level (0..100) the current conditions justify. */
export function stressTarget(state: HabitatState, animal: HabitatAnimal, ctx: NeedsContext): number {
  let stress = 8; // baseline calm
  const env = state.environment;
  const ideal = ctx.profile.ideal;

  if (env.baskingC < ideal.baskingC[0]) stress += (ideal.baskingC[0] - env.baskingC) * 4;
  if (env.baskingC > ideal.baskingC[1]) stress += (env.baskingC - ideal.baskingC[1]) * 4;

  if (env.humidity < ideal.humidity[0]) stress += (ideal.humidity[0] - env.humidity) * 0.8;
  if (env.humidity > ideal.humidity[1]) stress += (env.humidity - ideal.humidity[1]) * 0.8;

  // Too few hiding places is a major stressor for a crepuscular gecko.
  if (ctx.scores.hidingSpots < 50) stress += (50 - ctx.scores.hidingSpots) * 0.5;
  if (ideal.needsBasking && ctx.scores.basking < 30) stress += 10;

  // Hunger gnaws once it gets low.
  if (animal.needs.hunger < 30) stress += (30 - animal.needs.hunger) * 0.5;

  // Low cleanliness adds mild stress.
  if (env.cleanliness < 50) stress += (50 - env.cleanliness) * 0.3;

  return clamp(stress);
}

export function updateNeeds(
  state: HabitatState,
  animal: HabitatAnimal,
  ctx: NeedsContext,
  dt: number,
  cfg: NeedsConfig = LIZARD_NEEDS,
): void {
  const n = ensureNeedDefaults(animal.needs); // heals old saves live
  n.hunger = clamp(n.hunger - cfg.hungerDrainPerSec * dt);

  // Calcium drains slowly; body condition eases back toward ideal (50).
  n.calcium = clamp(n.calcium - cfg.calciumDrainPerSec * dt);
  n.bodyCondition = clamp(n.bodyCondition + (50 - n.bodyCondition) * Math.min(1, cfg.conditionEasePerSec * dt));

  // Post-meal moisture support fades.
  if (state.foodMoisture) state.foodMoisture = Math.max(0, state.foodMoisture - cfg.foodMoistureFadePerSec * dt);

  const target = stressTarget(state, animal, ctx);
  n.stress = clamp(n.stress + (target - n.stress) * Math.min(1, cfg.stressEaseRate * dt));

  // Health: stress hurts; calcium deficiency (MBD risk) and obesity erode it
  // AND block recovery — a sick or overweight gecko doesn't bounce back until
  // the underlying husbandry is fixed.
  const deficient = n.calcium < cfg.lowCalciumThreshold;
  const obese = n.bodyCondition > cfg.obeseThreshold;
  if (n.stress > cfg.stressHighThreshold) {
    n.health = clamp(n.health - cfg.healthDamagePerSec * dt);
  } else if (!deficient && !obese) {
    n.health = clamp(n.health + cfg.healthRecoverPerSec * dt);
  }
  if (deficient) n.health = clamp(n.health - cfg.calciumHealthDamagePerSec * dt);
  if (obese) n.health = clamp(n.health - cfg.obeseHealthDamagePerSec * dt);
}

/** Apply an eaten feeder's nutrition + its calming effect (varies by food type). */
export function feedAnimal(animal: HabitatAnimal, restore = LIZARD_NEEDS.eatHungerRestore, calm = 4): void {
  animal.needs.hunger = clamp(animal.needs.hunger + restore);
  animal.needs.stress = clamp(animal.needs.stress - calm);
}

/**
 * FROG NEEDS — the colorful frog's pure care model (no Three/DOM; unit-tested
 * in tests/frogneeds.test.ts). Mirrors LizardNeedsSystem's shape but weights
 * the axes an AMPHIBIAN lives by: red-eyed tree frogs drink through their
 * skin, so HUMIDITY and HYDRATION dominate (registry: humiditySensitivity 90,
 * drynessSensitivity 95, ideal humidity 70–95 %). Dry air drains hydration
 * fast; humid air, misting and sitting in the pond restore it; deep
 * dehydration erodes health. Hunger drains at the same session pace as the
 * gecko's so a feeding holds for a play session.
 */
import type { HabitatAnimal, HabitatEnvironment } from "../HabitatTypes";
import { clamp } from "../HabitatState";

export interface FrogNeedsConfig {
  /** Hunger drain (units/s) — one feeding lasts a session. */
  hungerDrainPerSec: number;
  /** Hydration gained per second at fully comfortable humidity. */
  hydrationGainPerSec: number;
  /** Hydration lost per second in bone-dry air (scales with dryness). */
  hydrationDrainPerSec: number;
  /** Hydration gained per second while sitting in the pond. */
  pondHydrationPerSec: number;
  /** Humidity band the frog is comfortable in (%). */
  humidityBand: [number, number];
  /** Ambient band it tolerates (°C) — outside adds stress. */
  tempBand: [number, number];
  /** How fast stress eases toward its target (fraction/s). */
  stressEaseRate: number;
  /** Hydration below this starts damaging health. */
  dehydrationThreshold: number;
  healthDamagePerSec: number;
  healthRecoverPerSec: number;
  /** Hunger restored per cricket taken. */
  eatHungerRestore: number;
}

// Session pacing (same philosophy as the gecko's hunger fix): a neglected-dry
// tank drains hydration over a PLAY SESSION (~ -2…-4/min), never in seconds,
// and one misting holds the band for minutes.
export const FROG_NEEDS: FrogNeedsConfig = {
  hungerDrainPerSec: 0.02,
  hydrationGainPerSec: 0.35,
  hydrationDrainPerSec: 0.07,
  pondHydrationPerSec: 4.5,
  humidityBand: [70, 95],
  tempBand: [22, 28],
  stressEaseRate: 0.06,
  dehydrationThreshold: 22,
  healthDamagePerSec: 0.12,
  healthRecoverPerSec: 0.05,
  eatHungerRestore: 14,
};

export interface FrogTickContext {
  /** True while the frog sits in the pond (skin soak). */
  inPond: boolean;
  /** True for a beat after a startle (looming pointer, grab). */
  startled?: boolean;
}

/** Where stress settles for these conditions (0 = calm). Humidity is the
 *  loudest voice — a dry paludarium stresses the frog far more than a
 *  missed meal. */
export function frogStressTarget(env: HabitatEnvironment, animal: HabitatAnimal, cfg: FrogNeedsConfig = FROG_NEEDS): number {
  let target = 6;
  const [hLo, hHi] = cfg.humidityBand;
  if (env.humidity < hLo) target += Math.min(46, (hLo - env.humidity) * 1.6);
  else if (env.humidity > hHi) target += Math.min(14, (env.humidity - hHi) * 0.8);
  const ambient = (env.baskingC + env.coolC) / 2;
  const [tLo, tHi] = cfg.tempBand;
  if (ambient < tLo) target += (tLo - ambient) * 2.2;
  else if (ambient > tHi) target += (ambient - tHi) * 2.6;
  if (animal.needs.hunger < 25) target += 10;
  const hyd = animal.needs.hydration ?? 100;
  if (hyd < 40) target += (40 - hyd) * 0.5;
  if (env.cleanliness < 40) target += (40 - env.cleanliness) * 0.25;
  return clamp(target);
}

/** Advance the frog's needs by `dt` seconds. Mutates `animal.needs`. */
export function updateFrogNeeds(
  animal: HabitatAnimal,
  env: HabitatEnvironment,
  ctx: FrogTickContext,
  dt: number,
  cfg: FrogNeedsConfig = FROG_NEEDS,
): void {
  const n = animal.needs;
  n.hunger = clamp(n.hunger - cfg.hungerDrainPerSec * dt);

  // Hydration: skin-drinking. Comfortably humid air slowly tops it up, dry
  // air pulls it down proportionally to how far below the band we are, and a
  // pond soak restores it quickly.
  let hyd = n.hydration ?? 80;
  const [hLo] = cfg.humidityBand;
  if (ctx.inPond) {
    hyd += cfg.pondHydrationPerSec * dt;
  } else if (env.humidity >= hLo) {
    hyd += cfg.hydrationGainPerSec * dt;
  } else {
    const dryness = Math.min(1, (hLo - env.humidity) / 35);
    hyd -= cfg.hydrationDrainPerSec * dryness * dt;
  }
  n.hydration = clamp(hyd);

  // Stress eases toward its conditions target; a startle spikes it.
  let target = frogStressTarget(env, animal, cfg);
  if (ctx.startled) target = Math.max(target, 70);
  n.stress += (target - n.stress) * Math.min(1, cfg.stressEaseRate * dt * (ctx.startled ? 8 : 1));
  n.stress = clamp(n.stress);

  // Health: dehydration is the killer; good conditions heal slowly.
  if (n.hydration < cfg.dehydrationThreshold) {
    n.health = clamp(n.health - cfg.healthDamagePerSec * dt);
  } else if (n.stress < 45 && n.hunger > 20) {
    n.health = clamp(n.health + cfg.healthRecoverPerSec * dt);
  }
}

/** One cricket (or morsel) taken — restores hunger, calms a little (a good
 *  hunt is enrichment, same rule as the gecko). */
export function feedFrog(animal: HabitatAnimal, restore = FROG_NEEDS.eatHungerRestore, calm = 3): void {
  animal.needs.hunger = clamp(animal.needs.hunger + restore);
  animal.needs.stress = clamp(animal.needs.stress - calm);
}

/** Player-facing comfort 0..100 for the HUD: humidity band + temperature +
 *  hydration + calm, weighted the way the species cares. */
export function frogComfort(env: HabitatEnvironment, animal: HabitatAnimal, cfg: FrogNeedsConfig = FROG_NEEDS): number {
  const [hLo, hHi] = cfg.humidityBand;
  const hMid = (hLo + hHi) / 2;
  const hHalf = (hHi - hLo) / 2;
  const humidityFit = clamp(100 - (Math.max(0, Math.abs(env.humidity - hMid) - hHalf * 0.6) / hHalf) * 90);
  const ambient = (env.baskingC + env.coolC) / 2;
  const [tLo, tHi] = cfg.tempBand;
  const tMid = (tLo + tHi) / 2;
  const tempFit = clamp(100 - Math.max(0, Math.abs(ambient - tMid) - 1.5) * 16);
  const hyd = animal.needs.hydration ?? 80;
  const calm = 100 - animal.needs.stress;
  return Math.round(clamp(humidityFit * 0.4 + tempFit * 0.2 + hyd * 0.25 + calm * 0.15));
}

// ── Ambient humidity model (scene tick, pure here for tests) ────────────────

export interface HumidityModel {
  /** Resting humidity from the substrate + equipment (e.g. mossy soil ≈ 46+). */
  base: number;
  /** Extra humidity from recent misting (decays). */
  mistBoost: number;
}

export const MIST_BOOST_ON_SPRAY = 38;
/** Slow exponential fade (τ ≈ 4 min): one spray holds the comfort band for a
 *  few minutes of play, then the air drifts back toward the substrate base. */
export const MIST_DECAY_PER_SEC = 0.004;
/** The pond keeps the air a little wetter than bare substrate would. */
export const POND_HUMIDITY_BONUS = 8;

/** Advance the mist boost (exponential fade toward 0). */
export function decayMist(m: HumidityModel, dt: number): void {
  m.mistBoost = Math.max(0, m.mistBoost - m.mistBoost * MIST_DECAY_PER_SEC * dt - 0.05 * dt);
}

/** One spray: humidity jumps, capped so repeat-spraying can't exceed a wet 97 %. */
export function sprayMist(m: HumidityModel): void {
  m.mistBoost = Math.min(97 - m.base, m.mistBoost + MIST_BOOST_ON_SPRAY);
}

/** The live ambient humidity this model produces. */
export function currentHumidity(m: HumidityModel): number {
  return Math.round(clamp(m.base + POND_HUMIDITY_BONUS + m.mistBoost, 5, 97));
}

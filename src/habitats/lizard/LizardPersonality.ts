/**
 * ANIMAL PERSONALITY — pure (no Three.js / DOM). Every animal rolls ONE
 * personality when it first exists (persisted on the save), from a roulette
 * whose weights are SKEWED BY REAL LIFE: leopard geckos are placid, crepuscular
 * couch potatoes at heart — most individuals are calm baskers or shy hiders,
 * plenty are bold once settled, and the relentless little speed-demons are the
 * rare ones. The personality then genuinely drives the sim:
 *
 *   · speedMult    → walk / flee / recover locomotion speeds
 *   · activityMult → idle lengths + pause chance (active geckos linger less)
 *   · shelterMult  → how often it seeks a hide;  restMult → how long it stays
 *   · napChance    → open-air naps (lying down right where it stands)
 *   · startleMult  → panic-run length when spooked
 *   · appetiteMult → hunger drain (food-lovers are always peckish)
 *   · climbCap     → personal max climb height (lazy ones don't bother)
 *
 * Species data gates hard limits: leopard geckos have NO adhesive toe pads
 * (`canClimbGlass: false` in their care profile) — glass is always a wall for
 * them, whatever the personality.
 */
import type { HabitatAnimal } from "../HabitatTypes";
import type { MovementConfig } from "./GeckoMovementController";
import type { NeedsConfig } from "./LizardNeedsSystem";

export type PersonalityId = "calm_basker" | "bold_explorer" | "shy_hider" | "energetic_hunter" | "food_lover";

export interface PersonalityDef {
  id: PersonalityId;
  label: string;
  /** One-line character blurb for the UI. */
  blurb: string;
  /** Real-life-skewed roulette weight. */
  weight: number;
  speedMult: number;
  activityMult: number;
  shelterMult: number;
  restMult: number;
  napChance: number;
  /** Chance per decide-tick to go PERCH on a climbable rock and bask there. */
  perchChance: number;
  startleMult: number;
  appetiteMult: number;
  climbCap: number;
}

export const PERSONALITIES: PersonalityDef[] = [
  {
    id: "calm_basker",
    label: "Calm Basker",
    blurb: "Unhurried and content — loves a warm rock and a long nap.",
    weight: 30,
    speedMult: 0.85,
    activityMult: 0.75,
    shelterMult: 0.9,
    restMult: 1.4,
    napChance: 0.22,
    perchChance: 0.3, // the basker LIVES on the warm rock
    startleMult: 0.8,
    appetiteMult: 0.9,
    climbCap: 0.16,
  },
  {
    id: "shy_hider",
    label: "Shy Hider",
    blurb: "Careful and easily spooked — happiest tucked away in cover.",
    weight: 22,
    speedMult: 0.95,
    activityMult: 0.8,
    shelterMult: 1.8,
    restMult: 1.3,
    napChance: 0.08,
    perchChance: 0.08, // exposed rocks feel risky to a hider
    startleMult: 1.6,
    appetiteMult: 0.95,
    climbCap: 0.17,
  },
  {
    id: "bold_explorer",
    label: "Bold Explorer",
    blurb: "Confident and curious — patrols every corner of the tank.",
    weight: 20,
    speedMult: 1.1,
    activityMult: 1.3,
    shelterMult: 0.6,
    restMult: 0.8,
    napChance: 0.04,
    perchChance: 0.22, // loves a lookout point
    startleMult: 0.6,
    appetiteMult: 1.0,
    climbCap: 0.22,
  },
  {
    id: "food_lover",
    label: "Food Lover",
    blurb: "Lives for feeding time — first to the dish, always peckish.",
    weight: 16,
    speedMult: 0.9,
    activityMult: 0.95,
    shelterMult: 0.8,
    restMult: 1.0,
    napChance: 0.12,
    perchChance: 0.14,
    startleMult: 0.7,
    appetiteMult: 1.3,
    climbCap: 0.18,
  },
  {
    id: "energetic_hunter",
    label: "Energetic Hunter",
    blurb: "Rarely still — fast, hyper, and electric when prey appears.",
    weight: 12,
    speedMult: 1.3,
    activityMult: 1.6,
    shelterMult: 0.5,
    restMult: 0.6,
    napChance: 0.02,
    perchChance: 0.16, // surveys for prey from up high, briefly
    startleMult: 1.1,
    appetiteMult: 1.15,
    climbCap: 0.22,
  },
];

const TOTAL_WEIGHT = PERSONALITIES.reduce((s, p) => s + p.weight, 0);

/** Spin the roulette (weights = real-life prevalence). Deterministic per rng. */
export function rollPersonality(rng: () => number = Math.random): PersonalityId {
  let t = rng() * TOTAL_WEIGHT;
  for (const p of PERSONALITIES) {
    t -= p.weight;
    if (t <= 0) return p.id;
  }
  return PERSONALITIES[0].id;
}

export function personalityOf(id: string | undefined): PersonalityDef {
  return PERSONALITIES.find((p) => p.id === id) ?? PERSONALITIES[0];
}

/** The animal's personality — rolled ONCE and persisted; healed on old saves.
 *  Returns the def + whether this call just assigned it (for the intro event). */
export function ensurePersonality(
  animal: HabitatAnimal,
  rng: () => number = Math.random,
): { def: PersonalityDef; justAssigned: boolean } {
  const had = animal.personality != null && PERSONALITIES.some((p) => p.id === animal.personality);
  if (!had) animal.personality = rollPersonality(rng);
  return { def: personalityOf(animal.personality), justAssigned: !had };
}

/** Movement tuned to the character: speeds, idle rhythm, panic length. */
export function applyPersonalityToMovement(cfg: MovementConfig, p: PersonalityDef): MovementConfig {
  const act = Math.max(0.25, p.activityMult);
  return {
    ...cfg,
    walkSpeed: cfg.walkSpeed * p.speedMult,
    fleeSpeed: cfg.fleeSpeed * p.speedMult,
    recoverSpeed: cfg.recoverSpeed * p.speedMult,
    idleDur: [cfg.idleDur[0] / act, cfg.idleDur[1] / act],
    lookDur: [cfg.lookDur[0] / act, cfg.lookDur[1] / act],
    idleChance: Math.max(0.05, Math.min(0.95, cfg.idleChance / act)),
    fleeDur: cfg.fleeDur * p.startleMult,
  };
}

/** Needs tuned to the character: appetite pacing. */
export function applyPersonalityToNeeds(cfg: NeedsConfig, p: PersonalityDef): NeedsConfig {
  return { ...cfg, hungerDrainPerSec: cfg.hungerDrainPerSec * p.appetiteMult };
}

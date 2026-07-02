/**
 * WELLBEING read-out — pure (no Three.js / DOM). Turns the live habitat state +
 * scores into the Planet-Zoo-style per-need meters the animal info card shows
 * (temperature / humidity comfort, security, enrichment, cleanliness exposure,
 * hydration, land comfort, activity) plus plain-language RECOMMENDATIONS. Every
 * number is derived from real state — add a hide and security rises; let dirt
 * build and cleanliness exposure falls; flood a desert tank and land comfort
 * drops. Unit-tested for exactly those correlations.
 */
import type { CareIdeal, HabitatScores, HabitatState } from "../HabitatTypes";
import { clamp } from "../HabitatState";
import { FULL_HUNGER } from "./LizardFeedingSystem";

/** Leopard-gecko ideals (mirrors the species care profile; override per species). */
const LEO_IDEAL: CareIdeal = {
  baskingC: [28, 34],
  coolC: [22, 26],
  humidity: [30, 50],
  minHides: 2,
  needsBasking: true,
};

export interface WellbeingInputs {
  /** Fraction of the floor that is wet patch (terrainStats). */
  waterFrac?: number;
  /** RMS terrain relief (m) — landscape variety. */
  relief?: number;
  /** The brain currently can't reach any live feeder. */
  foodUnreachable?: boolean;
  /** The gecko is inside a hide right now. */
  sheltering?: boolean;
  /** Live activity 0..1 (speed01) — idle vs roaming. */
  activity01?: number;
  ideal?: CareIdeal;
}

export interface Wellbeing {
  tempComfort: number;
  humidComfort: number;
  security: number;
  enrichment: number;
  cleanExposure: number;
  hydration: number;
  landComfort: number;
  activity: number;
  /** Plain-language husbandry advice, most important first. */
  recommendations: string[];
}

/** 100 when v is inside [lo,hi]; falls off linearly by `per` per unit outside. */
function band(v: number, lo: number, hi: number, per: number): number {
  if (v < lo) return clamp(100 - (lo - v) * per);
  if (v > hi) return clamp(100 - (v - hi) * per);
  return 100;
}

export function computeWellbeing(state: HabitatState, scores: HabitatScores, inp: WellbeingInputs = {}): Wellbeing {
  const ideal = inp.ideal ?? LEO_IDEAL;
  const env = state.environment;
  const needs = state.animals[0]?.needs ?? { hunger: 70, stress: 15, health: 95, calcium: 80, bodyCondition: 50 };
  const waterFrac = inp.waterFrac ?? 0;
  const rec: string[] = [];

  const tempComfort = Math.min(band(env.baskingC, ideal.baskingC[0], ideal.baskingC[1], 9), band(env.coolC, ideal.coolC[0], ideal.coolC[1], 9));
  if (tempComfort < 70) rec.push(env.baskingC < ideal.baskingC[0] ? "The basking spot is too cool" : "Check the temperatures");

  // Humidity comfort: ambient in band, plus wet patches / humid hides help support.
  const humidBase = band(env.humidity, ideal.humidity[0], ideal.humidity[1], 3);
  const humidComfort = clamp(humidBase * 0.8 + Math.min(20, scores.humidity * 0.15 + waterFrac * 90));
  if (scores.humidity < 20 && waterFrac < 0.02) rec.push("Humidity support is low — add a humid hide or a wet patch");

  // Security: hiding-spot quality; hiding right now feels safer.
  const security = clamp(scores.hidingSpots * 0.9 + (inp.sheltering ? 10 : 0));
  if (scores.hidingSpots < 45) rec.push("Needs more hiding spots");

  // Enrichment: climbing/decor variety + terrain relief + live prey to hunt.
  const relief = inp.relief ?? 0;
  const liveFeeders = state.feeders.filter((f) => f.alive).length;
  const enrichment = clamp(scores.enrichment * 0.8 + Math.min(12, relief * 260) + Math.min(8, liveFeeders * 3));
  if (enrichment >= 75) rec.push("Good climbing and enrichment");

  const cleanExposure = clamp(env.cleanliness);
  if (env.cleanliness < 55) rec.push("The habitat is dirty — grab the brush and clean");

  // Hydration: a water dish present + humidity support + juicy recent meals.
  const hasWaterDish = state.layout.objects.some((o) => o.id.includes("water") || (o.category === "dish" && o.label?.toLowerCase().includes("water")));
  const hydration = clamp(
    (hasWaterDish ? 78 : 30) + waterFrac * 60 + (env.humidity >= ideal.humidity[0] ? 10 : 0) + Math.min(8, state.foodMoisture ?? 0),
  );
  if (!hasWaterDish) rec.push("Add a water dish");

  // Land comfort: a desert gecko wants dry footing — too much open water hurts.
  const landComfort = clamp(100 - Math.max(0, waterFrac - 0.06) * 220);
  if (waterFrac > 0.2) rec.push("Too much open water for a desert gecko");

  const activity = clamp((inp.activity01 ?? 0) * 100);

  if (inp.foodUnreachable) rec.unshift("Food is unreachable — clear a path or drop insects in the open");
  if (needs.hunger >= FULL_HUNGER) rec.push("The gecko is full — it won't eat more right now");
  else if (needs.hunger < 30) rec.unshift("The gecko is hungry — offer some insects");
  if (needs.stress > 55) rec.unshift("Too exposed / stressed — it needs calm and cover");

  return { tempComfort, humidComfort, security, enrichment, cleanExposure, hydration, landComfort, activity, recommendations: rec };
}

/**
 * Water-quality metric definitions + a pure evaluator.
 *
 * Both the simulation (for habitat scoring) and the UI (for the left panel)
 * read these. "goodness" is a 0..1 health value used for the bar fill, so a
 * healthy tank shows nearly-full green bars — readable and positive.
 */
import type { MetricKey, WaterQuality } from "../core/state";
import { clamp01, inverseLerp } from "../utils/math";

export type MetricTone = "good" | "warn" | "bad";

export type MetricKind = "range" | "low";

export interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  decimals: number;
  kind: MetricKind;
  /** Color used for the small metric icon. */
  accent: string;
  /** For "range" metrics: comfortable band + hard fail edges. */
  idealMin?: number;
  idealMax?: number;
  hardMin?: number;
  hardMax?: number;
  /** For "low" metrics: at/under `safe` = perfect, at `danger` = 0 goodness. */
  safe?: number;
  danger?: number;
}

export const WATER_METRICS: MetricDef[] = [
  {
    key: "oxygen",
    label: "Oxygen",
    unit: "mg/L",
    decimals: 1,
    kind: "range",
    accent: "#56b6e6",
    idealMin: 7.5,
    idealMax: 9.5,
    hardMin: 4.0,
    hardMax: 12.0,
  },
  {
    key: "temperature",
    label: "Temperature",
    unit: "°C",
    decimals: 1,
    kind: "range",
    accent: "#e8736b",
    idealMin: 23.5,
    idealMax: 26.5,
    hardMin: 19,
    hardMax: 30,
  },
  {
    key: "ph",
    label: "pH Level",
    unit: "",
    decimals: 1,
    kind: "range",
    accent: "#7fd6a8",
    idealMin: 6.4,
    idealMax: 7.4,
    hardMin: 5.5,
    hardMax: 8.4,
  },
  {
    key: "ammonia",
    label: "Ammonia",
    unit: "mg/L",
    decimals: 2,
    kind: "low",
    accent: "#9ad36b",
    safe: 0.05,
    danger: 0.6,
  },
  {
    key: "nitrite",
    label: "Nitrite",
    unit: "mg/L",
    decimals: 2,
    kind: "low",
    accent: "#9ad36b",
    safe: 0.02,
    danger: 0.5,
  },
  {
    key: "nitrate",
    label: "Nitrate",
    unit: "mg/L",
    decimals: 1,
    kind: "low",
    accent: "#9ad36b",
    safe: 10,
    danger: 60,
  },
];

export interface MetricReading {
  def: MetricDef;
  value: number;
  /** 0..1 health of this parameter (used for bar fill). */
  goodness: number;
  tone: MetricTone;
  status: string;
}

function toneFor(goodness: number): MetricTone {
  if (goodness >= 0.66) return "good";
  if (goodness >= 0.34) return "warn";
  return "bad";
}

export function evaluateMetric(def: MetricDef, value: number): MetricReading {
  let goodness: number;
  let status: string;

  if (def.kind === "range") {
    const { idealMin = 0, idealMax = 0, hardMin = 0, hardMax = 0 } = def;
    if (value >= idealMin && value <= idealMax) {
      goodness = 1;
      status = "Ideal";
    } else if (value < idealMin) {
      goodness = inverseLerp(hardMin, idealMin, value);
      status = goodness > 0.5 ? "Good" : goodness > 0.18 ? "Low" : "Critical";
    } else {
      goodness = 1 - inverseLerp(idealMax, hardMax, value);
      status = goodness > 0.5 ? "Good" : goodness > 0.18 ? "High" : "Critical";
    }
  } else {
    const { safe = 0, danger = 1 } = def;
    if (value <= safe) {
      goodness = 1;
      status = value <= safe * 0.5 ? "Safe" : "Good";
    } else {
      goodness = 1 - inverseLerp(safe, danger, value);
      status = goodness > 0.55 ? "Good" : goodness > 0.25 ? "Caution" : "Danger";
    }
  }

  goodness = clamp01(goodness);
  return { def, value, goodness, tone: toneFor(goodness), status };
}

export function readAllMetrics(water: WaterQuality): MetricReading[] {
  return WATER_METRICS.map((def) => evaluateMetric(def, water[def.key]));
}

/**
 * Deterministic ecosystem simulation. Pure logic — no Canvas, no DOM.
 *
 * The nitrogen cycle is intentionally simplified but *real*: creatures + uneaten
 * food create ammonia → nitrite → nitrate, bacteria (scaled by filtration and
 * cleanliness) drive the conversions, and plants + water changes export the end
 * products. Bad water lowers health and the habitat score; care actions help.
 */
import {
  type GameState,
  type Tank,
  type EventTone,
  getActiveTank,
} from "./state";
import { SPECIES } from "../data/species";
import { PLANTS } from "../data/plants";
import { readAllMetrics, evaluateMetric, WATER_METRICS } from "../data/water";
import { getAction, type ActionId } from "../data/tanks";
import { RNG } from "./rng";
import { clamp, clamp01, approach } from "../utils/math";

/** Tunable simulation constants — gameplay feel lives here. */
export const SIM = {
  /** Real-time → game-time. 1 real second = N game minutes (day ≈ 6 min). */
  gameMinutesPerSecond: 4,
  /** Largest chemistry step (game-hours) per update, to stay stable on lag spikes. */
  maxStepHours: 0.5,
  feedAmount: 12,
  overfeedThreshold: 34,
  maxEvents: 40,
};

const FILTRATION_CAP: Record<string, number> = {
  Basic: 0.6,
  Good: 1.0,
  Excellent: 1.4,
  Optimal: 1.7,
};
const LIGHTING_LEVEL: Record<string, number> = {
  Basic: 0.6,
  Good: 0.85,
  Excellent: 1.1,
  Optimal: 1.25,
};

let rng: RNG | null = null;
let rngSeed = -1;
function getRng(state: GameState): RNG {
  if (!rng || rngSeed !== state.seed) {
    rng = new RNG(state.seed);
    rngSeed = state.seed;
  }
  return rng;
}

/** Ephemeral, non-saved debounce flags so warnings don't spam the log. */
const warnState = new Map<string, Record<string, boolean>>();
function warnFlags(tankId: string): Record<string, boolean> {
  let f = warnState.get(tankId);
  if (!f) {
    f = {};
    warnState.set(tankId, f);
  }
  return f;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived helpers (also used by the UI)
// ─────────────────────────────────────────────────────────────────────────────

export function tankBioload(tank: Tank): number {
  let sum = 0;
  for (const p of tank.populations) {
    const s = SPECIES[p.speciesId];
    if (s) sum += p.count * s.bioload;
  }
  return sum;
}

export function tankGrazers(tank: Tank): number {
  let sum = 0;
  for (const p of tank.populations) {
    const s = SPECIES[p.speciesId];
    if (s && (s.type === "shrimp" || s.type === "snail" || s.behavior === "bottom")) {
      sum += p.count;
    }
  }
  return sum;
}

function plantSums(tank: Tank): { oxygen: number; cleanliness: number; count: number } {
  let oxygen = 0;
  let cleanliness = 0;
  for (const item of tank.scape.plants) {
    const pl = PLANTS[item.ref];
    if (pl) {
      oxygen += pl.oxygen;
      cleanliness += pl.cleanliness;
    }
  }
  return { oxygen, cleanliness, count: tank.scape.plants.length };
}

export function decorationCount(tank: Tank): number {
  return tank.scape.plants.length + tank.scape.hardscape.length;
}

export function avgHabitatScore(state: GameState): number {
  if (!state.tanks.length) return 0;
  return state.tanks.reduce((a, t) => a + t.habitatScore, 0) / state.tanks.length;
}

/** Projected per-day resource gains, surfaced as the "+N / day" top-bar figures. */
export function incomeProjection(state: GameState): {
  leaves: number;
  water: number;
  reputation: number;
} {
  const score = avgHabitatScore(state);
  return {
    leaves: Math.round(220 + score * 1.1),
    water: Math.round(120 + score * 0.98),
    reputation: Math.round(score * 0.92),
  };
}

export function formatClock(minutes: number): string {
  const total = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  let h = Math.floor(total / 60);
  const m = total % 60;
  const ampm = h < 12 ? "AM" : "PM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/** 0 = deep night, 1 = midday — drives plant photosynthesis + room light feel. */
export function daylight(minutes: number): number {
  const t = (((minutes % 1440) + 1440) % 1440) / 1440;
  // Peak at ~13:00, trough at ~01:00.
  return clamp01(0.5 - 0.5 * Math.cos((t - 0.05) * Math.PI * 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// Event log
// ─────────────────────────────────────────────────────────────────────────────

export function pushEvent(state: GameState, message: string, tone: EventTone): void {
  state.events.unshift({
    id: state.nextEventId++,
    day: state.clock.day,
    time: formatClock(state.clock.minutes),
    message,
    tone,
  });
  if (state.events.length > SIM.maxEvents) state.events.length = SIM.maxEvents;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main step
// ─────────────────────────────────────────────────────────────────────────────

export function simStep(state: GameState, dtSeconds: number): void {
  const dt = clamp(dtSeconds, 0, 0.25); // guard against tab-restore jumps
  state.elapsed += dt;

  const r = getRng(state);
  const gameMinutes = dt * SIM.gameMinutesPerSecond;

  // Advance clock + handle day rollover.
  const prevMinutes = state.clock.minutes;
  state.clock.minutes += gameMinutes;
  while (state.clock.minutes >= 1440) {
    state.clock.minutes -= 1440;
    state.clock.day += 1;
    onNewDay(state);
  }

  // Chemistry advances in game-hours, sub-stepped for stability.
  let hoursLeft = gameMinutes / 60;
  const light = LIGHTING_LEVEL; // alias
  while (hoursLeft > 0) {
    const h = Math.min(hoursLeft, SIM.maxStepHours);
    for (const tank of state.tanks) updateTank(state, tank, h, r, light);
    hoursLeft -= h;
  }

  void prevMinutes;
}

function onNewDay(state: GameState): void {
  const inc = incomeProjection(state);
  state.resources.leaves += inc.leaves;
  state.resources.water += inc.water;
  state.resources.reputation += inc.reputation;
  pushEvent(
    state,
    `Day ${state.clock.day}: +${inc.leaves} leaves, +${inc.water} water, +${inc.reputation} reputation.`,
    "good",
  );
}

function updateTank(
  state: GameState,
  tank: Tank,
  h: number,
  r: RNG,
  lightLevels: Record<string, number>,
): void {
  const w = tank.water;
  const dilute = 90 / tank.sizeLiters; // smaller tanks swing harder
  const filtrationCap = FILTRATION_CAP[tank.filtration] ?? 1;
  const lightFactor = (lightLevels[tank.lighting] ?? 1) * (0.45 + 0.55 * daylight(state.clock.minutes));
  const bioload = tankBioload(tank);
  const grazers = tankGrazers(tank);
  const plants = plantSums(tank);
  const bacteria = clamp01(0.15 + 0.85 * (w.cleanliness / 100)) * filtrationCap;

  // ── Food: creatures eat, the rest decays into waste ───────────────────────
  const demand = bioload * 0.12;
  const eaten = Math.min(tank.food, demand * h);
  tank.food = Math.max(0, tank.food - eaten);
  const decayed = tank.food * (1 - Math.exp(-0.22 * h));
  tank.food = Math.max(0, tank.food - decayed);

  // ── Ammonia ────────────────────────────────────────────────────────────────
  const ammoniaFromBio = bioload * 0.0011 * dilute * h;
  const ammoniaFromFood = decayed * 0.018 * dilute;
  const ammoniaConverted = w.ammonia * (1 - Math.exp(-0.85 * bacteria * h));
  w.ammonia = Math.max(0, w.ammonia + ammoniaFromBio + ammoniaFromFood - ammoniaConverted);

  // ── Nitrite ──────────────────────────────────────────────────────────────
  const nitriteProduced = ammoniaConverted * 0.9;
  const nitriteConverted = w.nitrite * (1 - Math.exp(-1.0 * bacteria * h));
  w.nitrite = Math.max(0, w.nitrite + nitriteProduced - nitriteConverted);

  // ── Nitrate (end product; plants + water changes export it) ───────────────
  const nitrateProduced = nitriteConverted * 0.95 + bioload * 0.0006 * h;
  const nitrateUptake = (plants.cleanliness * 0.006 + 0.005) * lightFactor * h;
  w.nitrate = Math.max(0, w.nitrate + nitrateProduced - nitrateUptake);

  // ── Oxygen (plants by day + surface agitation − respiration) ──────────────
  const oxygenTarget =
    6.4 + plants.oxygen * lightFactor * 0.2 + filtrationCap * 0.6 - bioload * 0.02;
  w.oxygen = approach(w.oxygen, clamp(oxygenTarget, 2, 11), 0.9, h);

  // ── Temperature (heater holds set-point with a tiny wobble) ───────────────
  const tempTarget = 24.8 + (r.next() - 0.5) * 0.25;
  w.temperature = approach(w.temperature, tempTarget, 0.6, h);

  // ── pH (nitrate gently acidifies) ─────────────────────────────────────────
  const phTarget = clamp(6.9 - w.nitrate * 0.004, 6.2, 7.4);
  w.ph = approach(w.ph, phTarget, 0.4, h);

  // ── Cleanliness (drifts down; grazers + plants slow it) ───────────────────
  const cleanDrop =
    (0.35 + bioload * 0.02 + tank.food * 0.05 - grazers * 0.012 - plants.cleanliness * 0.02) *
    h *
    2.0;
  w.cleanliness = clamp(w.cleanliness - cleanDrop, 0, 100);

  // ── Population health responds to conditions ──────────────────────────────
  const aGood = evaluateMetric(WATER_METRICS[3], w.ammonia).goodness;
  const niGood = evaluateMetric(WATER_METRICS[4], w.nitrite).goodness;
  const oGood = evaluateMetric(WATER_METRICS[0], w.oxygen).goodness;
  for (const p of tank.populations) {
    const s = SPECIES[p.speciesId];
    if (!s) continue;
    const tempSuit = clamp01(
      1 - Math.abs(w.temperature - (s.tempRange[0] + s.tempRange[1]) / 2) /
        ((s.tempRange[1] - s.tempRange[0]) / 2 + 2),
    );
    const target = clamp01(0.25 + 0.75 * Math.min(aGood, niGood) * (0.5 + 0.5 * oGood) * (0.6 + 0.4 * tempSuit));
    p.health = approach(p.health, target, 0.35, h);
  }

  // ── Habitat score ─────────────────────────────────────────────────────────
  const metrics = readAllMetrics(w);
  const waterScore = metrics.reduce((a, m) => a + m.goodness, 0) / metrics.length;
  const cleanScore = w.cleanliness / 100;
  const healthScore = tank.populations.length
    ? tank.populations.reduce((a, p) => a + p.health, 0) / tank.populations.length
    : 1;
  const beauty = clamp01(
    (plants.count / 10) * 0.6 + (tank.scape.hardscape.length / 4) * 0.4,
  );
  const capacity = tank.sizeLiters * 0.36;
  const stock = 1 - clamp01((bioload - capacity) / capacity) * 0.8;
  const target =
    100 *
    (0.34 * waterScore + 0.18 * cleanScore + 0.22 * healthScore + 0.14 * beauty + 0.12 * stock);
  tank.habitatScore = approach(tank.habitatScore, target, 0.5, h);

  // ── Warnings (debounced on threshold crossings) ───────────────────────────
  emitWarnings(state, tank, metrics);
}

function emitWarnings(
  state: GameState,
  tank: Tank,
  metrics: ReturnType<typeof readAllMetrics>,
): void {
  const f = warnFlags(tank.id);

  const cross = (key: string, bad: boolean, msg: string, tone: EventTone, clearMsg?: string) => {
    if (bad && !f[key]) {
      f[key] = true;
      pushEvent(state, msg, tone);
    } else if (!bad && f[key]) {
      f[key] = false;
      if (clearMsg) pushEvent(state, clearMsg, "good");
    }
  };

  if (tank.id !== state.activeTankId) return; // only chatter about the tank you're watching

  cross(
    "overfeed",
    tank.food > SIM.overfeedThreshold,
    `${tank.name}: uneaten food is piling up — ease off the feeding.`,
    "warn",
  );
  const ammonia = metrics.find((m) => m.def.key === "ammonia")!;
  cross(
    "ammonia",
    ammonia.tone === "bad",
    `${tank.name}: ammonia is spiking! Do a water change.`,
    "bad",
    `${tank.name}: ammonia back to safe levels.`,
  );
  const nitrite = metrics.find((m) => m.def.key === "nitrite")!;
  cross(
    "nitrite",
    nitrite.tone === "bad",
    `${tank.name}: nitrite is dangerously high.`,
    "bad",
    `${tank.name}: nitrite has settled.`,
  );
  cross(
    "clean",
    tank.water.cleanliness < 35,
    `${tank.name}: the glass is getting grimy — time for a clean.`,
    "warn",
    `${tank.name}: sparkling clean again.`,
  );
  const oxygen = metrics.find((m) => m.def.key === "oxygen")!;
  cross(
    "oxygen",
    oxygen.tone === "bad",
    `${tank.name}: oxygen is low — check filtration and stocking.`,
    "warn",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Player actions
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionResult {
  ok: boolean;
  message: string;
  tone: EventTone;
}

export function doAction(state: GameState, id: ActionId): ActionResult {
  const def = getAction(id);
  const tank = getActiveTank(state);

  if (!def.implemented) {
    return { ok: false, message: `${def.label} is coming soon.`, tone: "info" };
  }
  if (state.resources.leaves < def.cost) {
    return { ok: false, message: `Not enough leaves for ${def.label} (need ${def.cost}).`, tone: "warn" };
  }

  state.resources.leaves -= def.cost;

  switch (id) {
    case "feed": {
      tank.food = clamp(tank.food + SIM.feedAmount, 0, 100);
      const over = tank.food > SIM.overfeedThreshold;
      const msg = over
        ? `Fed ${tank.name}. Careful — the water's getting cloudy with food.`
        : `Fed ${tank.name}. The fish dart up to snatch every morsel.`;
      pushEvent(state, msg, over ? "warn" : "good");
      return { ok: true, message: msg, tone: over ? "warn" : "good" };
    }
    case "clean": {
      tank.water.cleanliness = clamp(tank.water.cleanliness + 28, 0, 100);
      tank.food = Math.max(0, tank.food - tank.food * 0.5);
      tank.water.ammonia = Math.max(0, tank.water.ammonia * 0.9);
      const msg = `Cleaned ${tank.name}. Glass scrubbed, debris siphoned.`;
      pushEvent(state, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    case "waterChange": {
      tank.water.ammonia *= 0.35;
      tank.water.nitrite *= 0.3;
      tank.water.nitrate *= 0.45;
      tank.water.cleanliness = clamp(tank.water.cleanliness + 12, 0, 100);
      tank.water.temperature = approach(tank.water.temperature, 24.8, 1, 1);
      const msg = `Water change on ${tank.name}. Fresh, conditioned water added.`;
      pushEvent(state, msg, "good");
      return { ok: true, message: msg, tone: "good" };
    }
    default:
      return { ok: false, message: "Nothing happened.", tone: "info" };
  }
}

/** Convenience for the UI: all current metric readings of the active tank. */
export function activeReadings(state: GameState) {
  return readAllMetrics(getActiveTank(state).water);
}

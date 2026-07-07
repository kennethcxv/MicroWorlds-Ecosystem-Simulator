import { describe, it, expect, beforeEach } from "vitest";
import {
  simStep,
  doAction,
  resetSimState,
  tankBioload,
  SIM,
} from "../src/core/sim";
import { createInitialState, getActiveTank, type GameState } from "../src/core/state";

/** Advance the sim by `realSeconds`, sub-stepped at the engine's max step. */
function advance(state: GameState, realSeconds: number): void {
  let left = realSeconds;
  while (left > 0) {
    const d = Math.min(0.25, left);
    simStep(state, d);
    left -= d;
  }
}

/** Stable, comparable snapshot of the persisted, deterministic sim fields. */
function snapshot(state: GameState) {
  const t = getActiveTank(state);
  return JSON.stringify({
    clock: state.clock,
    resources: state.resources,
    water: t.water,
    food: t.food,
    habitatScore: t.habitatScore,
    health: t.populations.map((p) => p.health),
  });
}

beforeEach(() => resetSimState());

describe("player actions", () => {
  it("feeding adds food and spends leaves", () => {
    const s = createInitialState();
    const t = getActiveTank(s);
    const beforeFood = t.food;
    const beforeLeaves = s.resources.leaves;

    const res = doAction(s, "feed");

    expect(res.ok).toBe(true);
    expect(t.food).toBe(beforeFood + SIM.feedAmount);
    expect(s.resources.leaves).toBe(beforeLeaves - 5); // feed costs 5 leaves
  });

  it("overfeeding is flagged once food passes the threshold", () => {
    const s = createInitialState();
    const t = getActiveTank(s);
    t.food = 0;

    let last = doAction(s, "feed");
    while (t.food <= SIM.overfeedThreshold) last = doAction(s, "feed");

    expect(t.food).toBeGreaterThan(SIM.overfeedThreshold);
    expect(last.tone).toBe("warn");
    expect(last.message.toLowerCase()).toContain("cloudy");
  });

  it("blocks an action when leaves are insufficient (no state change)", () => {
    const s = createInitialState();
    const t = getActiveTank(s);
    s.resources.leaves = 2; // less than feed's cost of 5
    const beforeFood = t.food;

    const res = doAction(s, "feed");

    expect(res.ok).toBe(false);
    expect(t.food).toBe(beforeFood);
    expect(s.resources.leaves).toBe(2);
  });

  it("unimplemented actions report 'coming soon' and cost nothing", () => {
    const s = createInitialState();
    const beforeLeaves = s.resources.leaves;

    const res = doAction(s, "decorate");

    expect(res.ok).toBe(false);
    expect(res.message.toLowerCase()).toContain("coming soon");
    expect(s.resources.leaves).toBe(beforeLeaves);
  });

  it("cleaning restores cleanliness and cuts food + ammonia", () => {
    const s = createInitialState();
    const t = getActiveTank(s);
    t.water.cleanliness = 40;
    t.food = 20;
    t.water.ammonia = 0.3;

    doAction(s, "clean");

    expect(t.water.cleanliness).toBeCloseTo(68, 5); // +28
    expect(t.food).toBeCloseTo(10, 5); // halved
    expect(t.water.ammonia).toBeCloseTo(0.27, 5); // *0.9
  });

  it("water change dilutes ammonia, nitrite and nitrate", () => {
    const s = createInitialState();
    const t = getActiveTank(s);
    t.water.ammonia = 0.5;
    t.water.nitrite = 0.4;
    t.water.nitrate = 40;

    doAction(s, "waterChange");

    expect(t.water.ammonia).toBeCloseTo(0.175, 5); // *0.35
    expect(t.water.nitrite).toBeCloseTo(0.12, 5); // *0.3
    expect(t.water.nitrate).toBeCloseTo(18, 5); // *0.45
  });
});

describe("nitrogen cycle", () => {
  it("uneaten food drives ammonia up when bacteria are weak", () => {
    const s = createInitialState();
    const t = getActiveTank(s);
    t.water.ammonia = 0;
    t.food = 80;
    t.water.cleanliness = 5; // weak bacteria → little conversion, ammonia accumulates

    advance(s, 20);

    expect(t.water.ammonia).toBeGreaterThan(0);
  });

  it("processes ammonia → nitrite → nitrate, then ammonia falls", () => {
    const s = createInitialState();
    const t = getActiveTank(s);
    // Bare tank so plant uptake doesn't mask nitrate accumulation.
    t.scape.plants = [];
    t.water.ammonia = 0.6;
    t.water.nitrite = 0;
    t.water.nitrate = 0;
    t.food = 0;
    const startAmmonia = t.water.ammonia;

    advance(s, 120); // ~8 game-hours

    expect(t.water.nitrite).toBeGreaterThan(0);
    expect(t.water.nitrate).toBeGreaterThan(0);
    expect(t.water.ammonia).toBeLessThan(startAmmonia);
  });
});

describe("population health", () => {
  it("declines under toxic water and recovers when water is clean", () => {
    const s = createInitialState();
    const t = getActiveTank(s);
    for (const p of t.populations) p.health = 0.95;

    // Toxic spike.
    t.water.ammonia = 1.2;
    t.water.nitrite = 0.8;
    advance(s, 60);
    const sick = t.populations[0].health;
    expect(sick).toBeLessThan(0.95);

    // Restore pristine conditions.
    t.water.ammonia = 0;
    t.water.nitrite = 0;
    t.water.oxygen = 8.2;
    t.water.temperature = 24.8;
    advance(s, 120);
    expect(t.populations[0].health).toBeGreaterThan(sick);
  });
});

describe("habitat score", () => {
  it("falls when water turns toxic", () => {
    const s = createInitialState();
    const t = getActiveTank(s);
    const before = t.habitatScore;
    t.water.ammonia = 1.5;
    t.water.nitrite = 1.0;
    t.water.cleanliness = 10;

    advance(s, 60);

    expect(t.habitatScore).toBeLessThan(before);
  });
});

describe("economy", () => {
  it("grants resources and logs an event when the day rolls over", () => {
    const s = createInitialState();
    s.clock.day = 50;
    s.clock.minutes = 1430; // 10 minutes before midnight
    const beforeLeaves = s.resources.leaves;
    const beforeEvents = s.events.length;

    advance(s, 30); // 120 game-minutes — crosses midnight

    expect(s.clock.day).toBe(51);
    expect(s.resources.leaves).toBeGreaterThan(beforeLeaves);
    expect(s.events.length).toBeGreaterThan(beforeEvents);
    expect(s.events[0].message).toContain("Day 51");
  });
});

describe("determinism", () => {
  it("same seed + same action/step sequence → identical state", () => {
    const run = (): GameState => {
      resetSimState();
      const s = createInitialState(777);
      advance(s, 10);
      doAction(s, "feed");
      advance(s, 10);
      doAction(s, "clean");
      advance(s, 25);
      doAction(s, "waterChange");
      advance(s, 10);
      return s;
    };

    const a = run();
    const b = run();
    expect(snapshot(a)).toEqual(snapshot(b));
  });
});

describe("derived helpers", () => {
  it("tankBioload sums species bioload × count", () => {
    const s = createInitialState();
    const t = getActiveTank(s);
    const load = tankBioload(t);
    expect(load).toBeGreaterThan(0);
    // Removing a population strictly lowers the bioload.
    const removed = t.populations.pop()!;
    expect(tankBioload(t)).toBeLessThan(load);
    t.populations.push(removed);
  });
});

/**
 * INSECT BEHAVIOUR — feeder insects are prey, not particles. They freeze when
 * the gecko gets close, FLEE away from it in kind-specific bursts (crickets
 * hop-sprint, worms barely hustle), steer along walls instead of jamming into
 * corners, panic-JUMP out of a true corner (crickets), tire so the gecko can
 * actually catch them, keep separation from each other, and are pushed out of
 * the gecko's body so it never walks THROUGH an insect.
 */
import { describe, it, expect } from "vitest";
import type { GroundBounds } from "../src/habitats/HabitatBounds";
import { CollisionWorld, compileObstacles } from "../src/habitats/HabitatCollision";
import type { FeederState } from "../src/habitats/HabitatTypes";
import { FOOD_TYPES, updateFeeders } from "../src/habitats/lizard/LizardFeedingSystem";
import { makeLizardHabitatState } from "../src/habitats/lizard/LizardHabitatData";
import { walkBounds } from "../src/habitats/HabitatLayout";
import {
  INSECT_BEHAVIOR,
  pushInsectsOut,
  separateInsects,
  tickInsect,
} from "../src/habitats/lizard/InsectBehavior";

const BOUNDS: GroundBounds = { minX: -1.4, maxX: 1.4, minZ: -1, maxZ: 1, y: 0.08 };
const openWorld = (): CollisionWorld => new CollisionWorld(BOUNDS, compileObstacles([]));

function seededRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function insect(kind: keyof typeof FOOD_TYPES, x: number, z: number): FeederState {
  return {
    id: 1,
    kind,
    position: [x, BOUNDS.y, z],
    alive: true,
    age: 10,
    heading: 0,
    energy: 1,
    mood: "calm",
    moodT: 0,
  };
}

function run(f: FeederState, world: CollisionWorld, gecko: { x: number; z: number }, seconds: number, rng = seededRng(3)): void {
  const food = FOOD_TYPES[f.kind];
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i++) tickInsect(f, world, food, 0.05, rng, gecko);
}

describe("flee behaviour", () => {
  it("a cricket flees AWAY from a close gecko (distance grows, mood = flee)", () => {
    const w = openWorld();
    const f = insect("cricket", 0, 0);
    const gecko = { x: 0.2, z: 0 };
    run(f, w, gecko, 1.2);
    expect(f.mood).toBe("flee");
    const d = Math.hypot(f.position[0] - gecko.x, f.position[2] - gecko.z);
    expect(d).toBeGreaterThan(0.3); // sprinted away
    expect(f.position[0]).toBeLessThan(-0.05); // directly away = -X
  });

  it("at alert range it FREEZES first (real prey behaviour), barely moving", () => {
    const w = openWorld();
    const f = insect("cricket", 0, 0);
    const gecko = { x: INSECT_BEHAVIOR.alertRange - 0.04, z: 0 }; // alert, not flee
    const x0 = f.position[0];
    const z0 = f.position[2];
    run(f, w, gecko, 0.25);
    expect(f.mood === "alert" || f.mood === "flee").toBe(true);
    // During the first beat it holds still (freeze), no sprint yet.
    expect(Math.hypot(f.position[0] - x0, f.position[2] - z0)).toBeLessThan(0.05);
  });

  it("worms are slow even when scared — a fleeing mealworm covers far less ground than a cricket", () => {
    const w = openWorld();
    const cricket = insect("cricket", 0, 0);
    const worm = insect("mealworm", 0, 0.4);
    run(cricket, w, { x: 0.15, z: 0 }, 1.5, seededRng(4));
    run(worm, w, { x: 0.15, z: 0.4 }, 1.5, seededRng(4));
    const dc = Math.hypot(cricket.position[0], cricket.position[2]);
    const dw = Math.hypot(worm.position[0], worm.position[2] - 0.4);
    expect(dc).toBeGreaterThan(dw * 2);
  });
});

describe("walls + corners (never stuck)", () => {
  it("steers along the wall when fleeing straight away is blocked", () => {
    const w = openWorld();
    const f = insect("dubia_roach", BOUNDS.minX + 0.06, 0); // hard against the left wall
    const gecko = { x: BOUNDS.minX + 0.36, z: 0 }; // gecko to the +X — away = into the wall
    run(f, w, gecko, 3);
    // It did NOT jam into the wall: it slid along it (gained |z|) and got away.
    expect(Math.abs(f.position[2])).toBeGreaterThan(0.18);
    expect(f.position[0]).toBeGreaterThanOrEqual(BOUNDS.minX - 1e-6);
    const d = Math.hypot(f.position[0] - gecko.x, f.position[2] - gecko.z);
    expect(d).toBeGreaterThan(0.4);
  });

  it("a CORNERED cricket panic-jumps clear of the corner (even past the gecko)", () => {
    const w = openWorld();
    const f = insect("cricket", BOUNDS.minX + 0.04, BOUNDS.minZ + 0.04);
    const gecko = { x: BOUNDS.minX + 0.16, z: BOUNDS.minZ + 0.16 }; // pinning the corner
    run(f, w, gecko, 2.5);
    const fromCorner = Math.hypot(f.position[0] - BOUNDS.minX, f.position[2] - BOUNDS.minZ);
    expect(fromCorner).toBeGreaterThan(0.3); // escaped the corner pocket
  });

  it("a cornered WORM hugs the wall and inches out — never through the gecko, never out of bounds", () => {
    const w = openWorld();
    const f = insect("mealworm", BOUNDS.minX + 0.04, BOUNDS.minZ + 0.04);
    const gecko = { x: BOUNDS.minX + 0.14, z: BOUNDS.minZ + 0.14 };
    run(f, w, gecko, 3);
    expect(f.position[0]).toBeGreaterThanOrEqual(BOUNDS.minX - 1e-6);
    expect(f.position[2]).toBeGreaterThanOrEqual(BOUNDS.minZ - 1e-6);
    expect(Math.hypot(f.position[0] - gecko.x, f.position[2] - gecko.z)).toBeGreaterThan(0.05);
  });
});

describe("stamina (catchable prey)", () => {
  it("a chased cricket TIRES: energy drains and its pace drops", () => {
    const w = openWorld();
    const f = insect("cricket", 0.9, 0);
    const rng = seededRng(5);
    let lastX = f.position[0];
    let earlyPace = 0;
    let latePace = 0;
    for (let i = 0; i < 240; i++) {
      // The gecko stays glued right behind it — endless pressure.
      const gecko = { x: f.position[0] + 0.2, z: f.position[2] };
      tickInsect(f, w, FOOD_TYPES.cricket, 0.05, rng, gecko);
      const pace = Math.abs(f.position[0] - lastX);
      if (i < 60) earlyPace += pace;
      if (i >= 180) latePace += pace;
      lastX = f.position[0];
    }
    expect(f.energy ?? 1).toBeLessThan(0.5);
    expect(latePace).toBeLessThan(earlyPace * 0.7); // visibly slower when spent
  });
});

describe("held insects (tong / hand presentations)", () => {
  it("a HELD insect stays exactly where it's offered — no wander, no flee — until released", () => {
    const w = openWorld();
    const f = insect("cricket", 0.3, 0.2);
    f.held = true;
    run(f, w, { x: 0.34, z: 0.2 }, 1.5); // gecko right on top of it
    expect(f.position[0]).toBeCloseTo(0.3, 6);
    expect(f.position[2]).toBeCloseTo(0.2, 6);
    f.held = false;
    run(f, w, { x: 0.34, z: 0.2 }, 1.0);
    expect(Math.hypot(f.position[0] - 0.3, f.position[2] - 0.2)).toBeGreaterThan(0.08); // released → it bolts
  });
});

describe("insect collisions", () => {
  it("stacked insects separate to their body spacing", () => {
    const w = openWorld();
    const a = insect("cricket", 0, 0);
    const b = insect("cricket", 0.001, 0);
    b.id = 2;
    separateInsects([a, b], w);
    const d = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
    expect(d).toBeGreaterThan(0.04);
  });

  it("the gecko's body pushes insects OUT — it can never stand on top of one", () => {
    const w = openWorld();
    const f = insect("mealworm", 0.02, 0);
    pushInsectsOut([f], w, [{ x: 0, z: 0, r: 0.09 }]);
    const d = Math.hypot(f.position[0], f.position[2]);
    expect(d).toBeGreaterThanOrEqual(0.09 + 0.02 - 1e-6);
  });

  it("updateFeeders drives it end-to-end: a close gecko makes loose crickets flee + never overlap it", () => {
    const st = makeLizardHabitatState();
    const world = CollisionWorld.fromLayout(st.layout, walkBounds(st.layout, 1, 1));
    st.feeders.push({ id: 99, kind: "cricket", position: [0.1, 0.1, 0.35], alive: true, age: 8, energy: 1, mood: "calm", moodT: 0, heading: 0 });
    const rng = seededRng(6);
    for (let i = 0; i < 40; i++) {
      const f = st.feeders[0];
      const gecko = { x: f.position[0] + 0.12, z: f.position[2] };
      updateFeeders(st, world, 0.05, undefined, { rng, gecko, geckoCircles: [{ x: gecko.x, z: gecko.z, r: 0.1 }] });
    }
    const f = st.feeders[0];
    expect(f.mood).toBe("flee");
    // 12 cm away + a 10 cm body circle → it must have been pushed/run clear.
    const gecko = { x: f.position[0] + 0.12, z: f.position[2] };
    expect(Math.hypot(f.position[0] - gecko.x, f.position[2] - gecko.z)).toBeGreaterThanOrEqual(0.1);
  });
});

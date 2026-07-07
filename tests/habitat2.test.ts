/**
 * Phase-2 habitat systems: food types, enterable hides (shelter drive), local
 * dirt + brush cleaning, terrain sculpting, and the wellbeing read-out.
 */
import { describe, it, expect } from "vitest";
import { CollisionWorld, compileObstacles } from "../src/habitats/HabitatCollision";
import type { GroundBounds } from "../src/habitats/HabitatBounds";
import type { FeederKind, HabitatState, PlacedObject, Vec2 } from "../src/habitats/HabitatTypes";
import { makeLizardHabitatState } from "../src/habitats/lizard/LizardHabitatData";
import {
  FOOD_TYPES,
  consumeFeeder,
  placeFeederAt,
  updateFeeders,
  wantsToEat,
} from "../src/habitats/lizard/LizardFeedingSystem";
import { hideAnchor } from "../src/habitats/lizard/LizardController";
import { GECKO_MOVEMENT, GeckoMovementController } from "../src/habitats/lizard/GeckoMovementController";
import {
  createDirtMap,
  accumulateDirt,
  cleanAt,
  cleanlinessPct,
  isSpotless,
} from "../src/habitats/lizard/LizardDirtSystem";
import {
  createTerrain,
  sculpt,
  smoothTerrain,
  flattenTerrain,
  paintWater,
  terrainHeightAt,
  terrainStats,
} from "../src/habitats/HabitatTerrain";
import { computeWellbeing } from "../src/habitats/lizard/LizardWellbeing";
import { computeScores } from "../src/habitats/HabitatStats";

const BOUNDS: GroundBounds = { minX: -1.4, maxX: 1.4, minZ: -1, maxZ: 1, y: 0.08 };
const DIMS = { width: 3.0, depth: 1.9, height: 1.3, glass: 0.05, substrateTop: 0.08 };

function rng(seed = 3): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function freshState(): HabitatState {
  const s = makeLizardHabitatState();
  s.feedCooldown = 0;
  return s;
}

// ── Food types (Phase 14) ─────────────────────────────────────────────────────
describe("food types — different insects have different effects", () => {
  it("defines profiles for all four feeders", () => {
    for (const k of ["cricket", "mealworm", "dubia_roach", "waxworm"] as FeederKind[]) {
      expect(FOOD_TYPES[k]).toBeTruthy();
      expect(FOOD_TYPES[k].satiety).toBeGreaterThan(0);
    }
  });

  it("a waxworm restores more hunger (fatty treat) than a cricket", () => {
    expect(FOOD_TYPES.waxworm.satiety).toBeGreaterThan(FOOD_TYPES.cricket.satiety);
  });

  it("consuming different kinds restores different hunger", () => {
    const world = new CollisionWorld(BOUNDS, []);
    for (const kind of ["cricket", "waxworm"] as FeederKind[]) {
      const st = freshState();
      st.animals[0].needs.hunger = 40;
      const err = placeFeederAt(st, world, kind, 0.3, 0.3);
      expect(err).toBeNull();
      consumeFeeder(st, st.feeders[0].id, st.animals[0]);
      const gained = st.animals[0].needs.hunger - 40;
      expect(gained).toBeCloseTo(FOOD_TYPES[kind].satiety, 5);
    }
  });

  it("mealworms crawl slower than crickets in the update", () => {
    expect(FOOD_TYPES.mealworm.speed).toBeLessThan(FOOD_TYPES.cricket.speed);
    const world = new CollisionWorld(BOUNDS, []);
    const st = freshState();
    placeFeederAt(st, world, "cricket", -0.5, 0);
    placeFeederAt(st, world, "mealworm", 0.5, 0);
    const start = st.feeders.map((f) => [f.position[0], f.position[2]]);
    for (let i = 0; i < 200; i++) updateFeeders(st, world, 1 / 30);
    const moved = st.feeders.map((f, i) => Math.hypot(f.position[0] - start[i][0], f.position[2] - start[i][1]));
    expect(moved[1]).toBeLessThan(moved[0]);
  });

  it("placement validity: rejects on-gecko, inside-solid and out-of-bounds spots", () => {
    const world = new CollisionWorld(
      BOUNDS,
      compileObstacles([
        {
          id: "rock",
          category: "rock",
          position: [0.5, 0.08, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          collidable: true,
          collisionType: "box",
          interaction: "blocked",
          collision: { halfExtents: [0.2, 0.15, 0.2] },
        } as PlacedObject,
      ]),
    );
    const st = freshState();
    expect(placeFeederAt(st, world, "cricket", 9, 9)).toMatch(/outside/i);
    expect(placeFeederAt(st, world, "cricket", 0.5, 0)).toMatch(/inside|object/i);
    expect(placeFeederAt(st, world, "cricket", 0, 0, { gecko: { x: 0, z: 0 } })).toMatch(/gecko/i);
    expect(placeFeederAt(st, world, "cricket", -0.5, 0.5)).toBeNull();
  });

  it("a full gecko does not want to eat", () => {
    const st = freshState();
    st.animals[0].needs.hunger = 95;
    expect(wantsToEat(st.animals[0])).toBe(false);
    st.animals[0].needs.hunger = 50;
    expect(wantsToEat(st.animals[0])).toBe(true);
  });
});

// ── Enterable hides (Phase 12) ────────────────────────────────────────────────
describe("hides — the gecko can path INTO a horseshoe hide's pocket", () => {
  // A C-shaped (horseshoe) contour: walls around a pocket, mouth open toward +Z.
  const horseshoe: Vec2[] = [
    [-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [0.18, 0.3], [0.18, -0.18],
    [-0.18, -0.18], [-0.18, 0.3], [-0.3, 0.3],
  ];
  const hide = (): PlacedObject => ({
    id: "cave",
    category: "hide",
    position: [0, 0.08, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    collidable: true,
    collisionType: "box",
    interaction: "hide",
    assetFootprint: { half: [0.3, 0.15, 0.3], center: [0, 0.15, 0], shape: "obb", contours: [horseshoe] },
  });

  it("hideAnchor finds a free interior spot inside the pocket", () => {
    const world = new CollisionWorld(BOUNDS, compileObstacles([hide()]));
    const a = hideAnchor(world, hide(), GECKO_MOVEMENT.bodyRadius);
    expect(a).not.toBeNull();
    // The anchor is inside the pocket (between the arms), free for the gecko.
    expect(Math.abs(a!.x)).toBeLessThan(0.18);
    expect(world.isFree(a!.x, a!.z, GECKO_MOVEMENT.bodyRadius)).toBe(true);
  });

  it("the brain shelters: walks in through the mouth and rests at the anchor", () => {
    const world = new CollisionWorld(BOUNDS, compileObstacles([hide()]));
    const brain = new GeckoMovementController(world, GECKO_MOVEMENT, rng(11), { x: 0, z: 0.8 });
    const anchor = hideAnchor(world, hide(), GECKO_MOVEMENT.bodyRadius)!;
    expect(brain.requestShelter(anchor)).toBe(true);
    let sheltered = false;
    for (let i = 0; i < 60 * 60 && !sheltered; i++) {
      brain.update(1 / 60, []);
      sheltered = brain.sheltering;
      // Never phases through the hide walls on the way in.
      expect(world.bodyPenetration(brain.position.x, brain.position.z, brain.heading, brain.bodyProbes)).toBeLessThan(0.01);
    }
    expect(sheltered).toBe(true);
    expect(Math.hypot(brain.position.x - anchor.x, brain.position.z - anchor.z)).toBeLessThan(0.2);
    expect(brain.navPhase).toBe("shelter");
    brain.endShelter();
    expect(brain.sheltering).toBe(false);
  });
});

// ── Dirt + cleaning (Phase 13) ────────────────────────────────────────────────
describe("dirt map — local accumulation, brush cleaning, sparkle when spotless", () => {
  it("accumulates more dirt near hotspots than far away", () => {
    const m = createDirtMap();
    for (let i = 0; i < 400; i++) accumulateDirt(m, DIMS, 0.25, [{ x: -1.0, z: -0.6, w: 1 }]);
    const near = dirtAtPoint(m, -1.0, -0.6);
    const far = dirtAtPoint(m, 1.2, 0.8);
    expect(near).toBeGreaterThan(far * 2);
    expect(cleanlinessPct(m)).toBeLessThan(100);
  });

  it("ambient film builds over HOURS, not minutes — a cleaned tank stays clean for a session", () => {
    const m = createDirtMap();
    // 10 minutes of ambient-only build-up (gecko elsewhere, no hotspots).
    for (let i = 0; i < 2400; i++) accumulateDirt(m, DIMS, 0.25, []);
    expect(cleanlinessPct(m)).toBeGreaterThan(70);
    // …but it DOES build: never a no-op.
    expect(cleanlinessPct(m)).toBeLessThan(100);
  });

  it("cleanAt scrubs locally, not globally", () => {
    const m = createDirtMap();
    for (let i = 0; i < 400; i++) accumulateDirt(m, DIMS, 0.25, [{ x: -1.0, z: -0.6, w: 1 }, { x: 1.0, z: 0.6, w: 1 }]);
    const beforeA = dirtAtPoint(m, -1.0, -0.6);
    const beforeB = dirtAtPoint(m, 1.0, 0.6);
    for (let i = 0; i < 40; i++) cleanAt(m, DIMS, -1.0, -0.6, 0.3, 0.1);
    expect(dirtAtPoint(m, -1.0, -0.6)).toBeLessThan(beforeA * 0.3); // scrubbed
    expect(dirtAtPoint(m, 1.0, 0.6)).toBeGreaterThan(beforeB * 0.9); // untouched
  });

  it("a fully scrubbed map reads spotless (sparkle trigger)", () => {
    const m = createDirtMap();
    // Long linger sized to the slow pacing — enough to clearly foul the spot.
    for (let i = 0; i < 1400; i++) accumulateDirt(m, DIMS, 0.25, [{ x: 0, z: 0, w: 1 }]);
    expect(isSpotless(m)).toBe(false);
    for (let ix = 0; ix < 40; ix++) {
      for (let iz = 0; iz < 40; iz++) {
        cleanAt(m, DIMS, -1.5 + (ix / 39) * 3.0, -0.95 + (iz / 39) * 1.9, 0.3, 1);
      }
    }
    expect(isSpotless(m)).toBe(true);
    expect(cleanlinessPct(m)).toBeGreaterThan(99);
  });

  function dirtAtPoint(m: ReturnType<typeof createDirtMap>, x: number, z: number): number {
    const ix = Math.min(m.nx - 1, Math.max(0, Math.floor(((x + DIMS.width / 2) / DIMS.width) * m.nx)));
    const iz = Math.min(m.nz - 1, Math.max(0, Math.floor(((z + DIMS.depth / 2) / DIMS.depth) * m.nz)));
    return m.cells[iz * m.nx + ix];
  }
});

// ── Terrain sculpting (Phase 15) ──────────────────────────────────────────────
describe("terrain — sculpt raises/lowers a height map; water affects stats", () => {
  it("raise lifts the sand locally (clamped), lower digs it", () => {
    const t = createTerrain();
    sculpt(t, DIMS, -0.5, 0, 0.3, +0.4); // big delta → clamped
    expect(terrainHeightAt(t, DIMS, -0.5, 0)).toBeGreaterThan(0.01);
    expect(terrainHeightAt(t, DIMS, -0.5, 0)).toBeLessThanOrEqual(0.08 + 1e-9);
    expect(terrainHeightAt(t, DIMS, 1.2, 0.8)).toBeCloseTo(0); // far away untouched
    sculpt(t, DIMS, -0.5, 0, 0.3, -1);
    expect(terrainHeightAt(t, DIMS, -0.5, 0)).toBeLessThan(0.01);
  });

  it("smooth + flatten relax the height map", () => {
    const t = createTerrain();
    sculpt(t, DIMS, 0, 0, 0.25, +0.06); // a real peak (below the clamp plateau)
    const peak = terrainHeightAt(t, DIMS, 0, 0);
    smoothTerrain(t, DIMS, 0, 0, 0.5);
    expect(terrainHeightAt(t, DIMS, 0, 0)).toBeLessThan(peak);
    flattenTerrain(t, DIMS, 0, 0, 0.6);
    expect(Math.abs(terrainHeightAt(t, DIMS, 0, 0))).toBeLessThan(0.02);
  });

  it("water patches raise waterFrac + humidity boost; too much hurts a desert gecko", () => {
    const t = createTerrain();
    expect(terrainStats(t).waterFrac).toBe(0);
    paintWater(t, DIMS, 0.8, 0.5, 0.25, true);
    const some = terrainStats(t);
    expect(some.waterFrac).toBeGreaterThan(0);
    // Paint a huge lake → desert land comfort penalty kicks in via wellbeing.
    for (let x = -1.2; x <= 1.2; x += 0.2) for (let z = -0.8; z <= 0.8; z += 0.2) paintWater(t, DIMS, x, z, 0.3, true);
    expect(terrainStats(t).waterFrac).toBeGreaterThan(0.3);
  });
});

// ── Wellbeing (Phase 16) ──────────────────────────────────────────────────────
describe("wellbeing — stats correlate with the real habitat state", () => {
  it("more hides → higher security; dirt → worse cleanliness exposure", () => {
    const st = freshState();
    const scores = computeScores(st.layout);
    const base = computeWellbeing(st, scores, {});
    expect(base.security).toBeGreaterThan(50); // authored layout has 2 hides

    const noHides = freshState();
    noHides.layout.objects = noHides.layout.objects.filter((o) => o.interaction !== "hide" && o.category !== "hide");
    const wNo = computeWellbeing(noHides, computeScores(noHides.layout), {});
    expect(wNo.security).toBeLessThan(base.security);
    expect(wNo.recommendations.join(" ")).toMatch(/hiding|hide/i);

    const dirty = freshState();
    dirty.environment.cleanliness = 25;
    const wDirty = computeWellbeing(dirty, scores, {});
    expect(wDirty.cleanExposure).toBeLessThan(base.cleanExposure);
    expect(wDirty.recommendations.join(" ")).toMatch(/dirty|clean/i);
  });

  it("too much water for a desert gecko lowers land comfort + says so", () => {
    const st = freshState();
    const scores = computeScores(st.layout);
    const wet = computeWellbeing(st, scores, { waterFrac: 0.45 });
    const dry = computeWellbeing(st, scores, { waterFrac: 0.02 });
    expect(wet.landComfort).toBeLessThan(dry.landComfort);
    expect(wet.humidComfort).toBeGreaterThan(dry.humidComfort);
    expect(wet.recommendations.join(" ")).toMatch(/water/i);
  });

  it("unreachable food + fullness produce the right advice", () => {
    const st = freshState();
    const scores = computeScores(st.layout);
    const w1 = computeWellbeing(st, scores, { foodUnreachable: true });
    expect(w1.recommendations.join(" ")).toMatch(/unreachable/i);
    st.animals[0].needs.hunger = 97;
    const w2 = computeWellbeing(st, scores, {});
    expect(w2.recommendations.join(" ")).toMatch(/full/i);
  });
});

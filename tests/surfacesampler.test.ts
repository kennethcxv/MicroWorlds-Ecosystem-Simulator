/**
 * SURFACE SAMPLER + live terrain ground — the collision world now carries a live
 * GROUND SOURCE (the sculpted terrain), so walk heights, navigation, placement
 * and feeding all follow the sculpted sand with NO world rebuild. On top sits
 * `sampleSurfaceAt`: one query answering "what exactly is under this point" —
 * height, normal, slope, surface type, object id, walkable / climbable /
 * too-steep / fallback — the seam the foot contacts + debug markers read.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildHeightField, clearHeightFields, registerHeightField } from "../src/habitats/HabitatFootprint";
import {
  CollisionWorld,
  MAX_WALK_SLOPE,
  compileObstacles,
  type GroundSource,
} from "../src/habitats/HabitatCollision";
import { NavGraph } from "../src/habitats/HabitatNavigation";
import { placementIssue } from "../src/habitats/HabitatEditing";
import { placeFeederAt, updateFeeders } from "../src/habitats/lizard/LizardFeedingSystem";
import type { GroundBounds } from "../src/habitats/HabitatBounds";
import type { HabitatState, PlacedObject, Vec2, Vec3 } from "../src/habitats/HabitatTypes";

const B: GroundBounds = { minX: -2, maxX: 2, minZ: -1.5, maxZ: 1.5, y: 0.08 };

// ── Ground stubs (what the scene will build from HabitatTerrain) ──────────────
/** A cone dune: height `h` at (cx,cz) falling linearly to 0 at radius `r`. */
function dune(cx: number, cz: number, h: number, r: number): GroundSource {
  const heightAt = (x: number, z: number): number => {
    const d = Math.hypot(x - cx, z - cz);
    return d >= r ? 0 : h * (1 - d / r);
  };
  return {
    heightAt,
    slopeAt: (x, z) => {
      const e = 0.01;
      const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
      const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
      return Math.atan(Math.hypot(gx, gz));
    },
  };
}

/** A uniform ramp: dh/dx = k everywhere. */
function rampGround(k: number): GroundSource {
  return { heightAt: (x) => k * x };
}

// ── Heightfield prop fixtures (same pattern as tests/surface.test.ts) ─────────
function quad(x0: number, z0: number, x1: number, z1: number, y: (x: number, z: number) => number): Vec3[][] {
  const a: Vec3 = [x0, y(x0, z0), z0];
  const b: Vec3 = [x1, y(x1, z0), z0];
  const c: Vec3 = [x1, y(x1, z1), z1];
  const d: Vec3 = [x0, y(x0, z1), z1];
  return [
    [a, b, c],
    [a, c, d],
  ];
}

const SQUARE: Vec2[] = [
  [-0.25, -0.25],
  [0.25, -0.25],
  [0.25, 0.25],
  [-0.25, 0.25],
];

function propWith(key: string, tris: Vec3[][], over: Partial<PlacedObject> = {}): PlacedObject {
  registerHeightField(key, buildHeightField(tris, 64)!);
  return {
    id: over.id ?? "prop",
    asset: key,
    category: "branch",
    interaction: "climbable",
    position: [0, B.y, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    collidable: true,
    collisionType: "meshApprox",
    assetFootprint: {
      half: [0.25, 0.1, 0.25],
      center: [0, 0.1, 0],
      shape: "obb",
      contours: [SQUARE.map((p) => p.slice() as Vec2)],
    },
    ...over,
  };
}

// Deck at 0.2 — BELOW MAX_CLIMB_HEIGHT so it stays climbable (taller volumes are
// compiled hard + routed around; see climbcap.test).
const plateauTris = (): Vec3[][] => [
  ...quad(-0.25, -0.25, 0.25, 0.25, () => 0.2),
  ...quad(-0.25, -0.25, 0.25, 0.25, () => 0),
];

beforeEach(() => clearHeightFields());

// ── Ground height + live updates ──────────────────────────────────────────────
describe("CollisionWorld with a live ground source", () => {
  it("groundHeightAt = bounds.y + the terrain offset; flat without a source", () => {
    const flat = new CollisionWorld(B, []);
    expect(flat.groundHeightAt(0.3, 0.2)).toBe(B.y);
    const w = new CollisionWorld(B, [], dune(0.5, 0, 0.12, 0.5));
    expect(w.groundHeightAt(0.5, 0)).toBeCloseTo(B.y + 0.12, 5);
    expect(w.groundHeightAt(-1.5, 0)).toBeCloseTo(B.y, 5);
  });

  it("reads the ground LIVE — sculpting needs no world rebuild", () => {
    const live = { h: 0 };
    const w = new CollisionWorld(B, [], { heightAt: () => live.h });
    expect(w.groundHeightAt(0, 0)).toBeCloseTo(B.y, 5);
    live.h = 0.1; // ← the brush stroke
    expect(w.groundHeightAt(0, 0)).toBeCloseTo(B.y + 0.1, 5);
  });

  it("climbHeightAt stands on the terrain, and a taller prop still wins", () => {
    const w = new CollisionWorld(
      B,
      compileObstacles([propWith("test://plateau.glb", plateauTris())]),
      dune(1.0, 0, 0.1, 0.4),
    );
    // On the dune (no prop): walk height = terrain.
    expect(w.climbHeightAt(1.0, 0, 0, B.y)).toBeCloseTo(B.y + 0.1, 3);
    // On the plateau prop (flat ground): the prop's measured 0.2 deck wins.
    expect(w.climbHeightAt(0, 0, 0, B.y)).toBeCloseTo(B.y + 0.2, 1);
  });

  it("rejects too-steep terrain from isFree and line-of-sight (navigation avoids it)", () => {
    const steep = dune(0, 0, 0.3, 0.25); // flank slope atan(1.2) ≈ 50° > the cap
    const w = new CollisionWorld(B, [], steep);
    expect(w.isFree(0.12, 0, 0.05)).toBe(false); // on the steep flank
    expect(w.isFree(1.2, 0, 0.05)).toBe(true); // flat sand
    expect(w.losClear(-0.6, 0, 0.6, 0, 0.05)).toBe(false); // straight across the dune
    expect(w.losClear(-0.6, -1.0, 0.6, -1.0, 0.05)).toBe(true); // clear of it
    const nav = new NavGraph(w, 0.05);
    expect(nav.findPath({ x: -0.6, z: 0 }, { x: 0.12, z: 0 })).toBeNull(); // steep target: avoided
  });
});

// ── The sampler itself ────────────────────────────────────────────────────────
describe("sampleSurfaceAt", () => {
  it("flat empty sand: substrate, level normal, walkable", () => {
    const w = new CollisionWorld(B, []);
    const s = w.sampleSurfaceAt(0.4, 0.3);
    expect(s.y).toBeCloseTo(B.y, 5);
    expect(s.type).toBe("substrate");
    expect(s.objectId).toBeNull();
    expect(s.normal[1]).toBeGreaterThan(0.99);
    expect(s.slope).toBeCloseTo(0, 3);
    expect(s.walkable).toBe(true);
    expect(s.climbable).toBe(false);
    expect(s.tooSteep).toBe(false);
    expect(s.fallback).toBe(false);
  });

  it("sculpted ground: terrain type, true height, tilted normal, slope", () => {
    const w = new CollisionWorld(B, [], rampGround(0.1));
    const s = w.sampleSurfaceAt(0.5, 0);
    expect(s.type).toBe("terrain");
    expect(s.y).toBeCloseTo(B.y + 0.05, 3);
    expect(s.slope).toBeCloseTo(Math.atan(0.1), 2);
    expect(s.normal[0]).toBeLessThan(-0.05); // ground rises toward +x ⇒ normal leans −x
    expect(s.normal[1]).toBeGreaterThan(0.9);
    expect(s.tooSteep).toBe(false);
  });

  it("over a climbable prop: its category + id + measured height, not a fallback", () => {
    const w = new CollisionWorld(B, compileObstacles([propWith("test://deck.glb", plateauTris())]));
    const s = w.sampleSurfaceAt(0, 0, B.y + 0.2);
    expect(s.type).toBe("branch");
    expect(s.objectId).toBe("prop");
    expect(s.climbable).toBe(true);
    expect(s.y).toBeCloseTo(B.y + 0.2, 1);
    expect(s.fallback).toBe(false);
  });

  it("a prop WITHOUT height data reports fallback (flat-top superset)", () => {
    const o = propWith("test://nofield.glb", plateauTris());
    delete (o as { asset?: string }).asset;
    clearHeightFields();
    const w = new CollisionWorld(B, compileObstacles([o]));
    const s = w.sampleSurfaceAt(0, 0, B.y + 0.2);
    expect(s.fallback).toBe(true);
  });

  it("steep bare terrain is flagged tooSteep (climbable props are not)", () => {
    const w = new CollisionWorld(B, [], dune(0, 0, 0.3, 0.25));
    expect(w.sampleSurfaceAt(0.12, 0).tooSteep).toBe(true);
    expect(MAX_WALK_SLOPE).toBeGreaterThan(0.5); // sanity: the cap is a real angle
  });
});

// ── Placement + feeding react to terrain ──────────────────────────────────────
describe("terrain-aware placement + feeding", () => {
  const makeState = (): HabitatState =>
    ({
      version: 2,
      layout: { objects: [], zones: [], equipment: [] },
      environment: {},
      animals: [],
      feeders: [],
      feedCooldown: 0,
      events: [],
      nextEventId: 1,
      nextFeederId: 1,
      elapsed: 0,
    }) as unknown as HabitatState;

  it("placementIssue names too-steep ground", () => {
    const w = new CollisionWorld(B, [], dune(0, 0, 0.3, 0.25));
    expect(placementIssue(w, 0.12, 0, 0.1)).toMatch(/steep/i);
    expect(placementIssue(w, 1.2, 0.5, 0.1)).toBeNull();
  });

  it("feeders sit ON the sculpted terrain and refuse too-steep drops", () => {
    const w = new CollisionWorld(B, [], dune(0.8, 0.4, 0.12, 0.6)); // gentle dune
    const state = makeState();
    expect(placeFeederAt(state, w, "cricket", 0.8, 0.4)).toBeNull();
    expect(state.feeders[0].position[1]).toBeCloseTo(B.y + 0.12, 3);
    updateFeeders(state, w, 0.1);
    const f = state.feeders[0];
    expect(f.position[1]).toBeCloseTo(w.groundHeightAt(f.position[0], f.position[2]), 3);

    const steep = new CollisionWorld(B, [], dune(0, 0, 0.3, 0.25));
    expect(placeFeederAt(makeState(), steep, "cricket", 0.12, 0)).toMatch(/steep/i);
  });
});

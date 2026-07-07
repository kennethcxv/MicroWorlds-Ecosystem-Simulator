/**
 * EXACT SURFACE COLLISION — integration of the mesh-measured heightfield with the
 * collision world + the gecko movement brain. Locks in the three user-visible
 * fixes:
 *   1. a sloped/two-level prop lifts the animal by its TRUE local height on each
 *      side (no more one-flat-top-for-the-whole-rock),
 *   2. an ELEVATED span (arched driftwood) is walked UNDER at ground level — the
 *      gecko no longer levitates beside the branch,
 *   3. the climb lift follows the true surface (up to MAX_CLIMB_HEIGHT — taller
 *      props are routed around, see climbcap.test) + the body PITCHES along the
 *      slope, so climbing keeps the body on the wood instead of half inside it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildHeightField,
  clearHeightFields,
  registerHeightField,
} from "../src/habitats/HabitatFootprint";
import { CollisionWorld, compileObstacles } from "../src/habitats/HabitatCollision";
import { GECKO_MOVEMENT, GeckoMovementController } from "../src/habitats/lizard/GeckoMovementController";
import type { GroundBounds } from "../src/habitats/HabitatBounds";
import type { PlacedObject, Vec2, Vec3 } from "../src/habitats/HabitatTypes";

const B: GroundBounds = { minX: -2, maxX: 2, minZ: -1.5, maxZ: 1.5, y: 0 };

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

/** A climbable prop whose heightfield is registered under a fake asset key. */
function propWith(key: string, tris: Vec3[][], over: Partial<PlacedObject> = {}): PlacedObject {
  registerHeightField(key, buildHeightField(tris, 64)!);
  return {
    id: over.id ?? "prop",
    asset: key,
    category: "branch",
    interaction: "climbable",
    position: [0, 0, 0],
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

/** SOLID ramp rising 0 → 0.2 along local +z (top sheet + grounded underside —
 *  real decor GLBs are closed solids, so their bottoms sit near the floor).
 *  Peaks BELOW MAX_CLIMB_HEIGHT so it stays a climbable, not a boulder. */
const rampTris = (): Vec3[][] => [
  ...quad(-0.25, -0.25, 0.25, 0.25, (_x, z) => 0.4 * (z + 0.25)),
  ...quad(-0.25, -0.25, 0.25, 0.25, () => 0),
];

/** Closed plateau: flat deck at 0.2 with a ground face (a solid block's shell). */
const plateauTris = (): Vec3[][] => [
  ...quad(-0.25, -0.25, 0.25, 0.25, () => 0.2),
  ...quad(-0.25, -0.25, 0.25, 0.25, () => 0),
];

/** Arch: elevated deck at 0.2 across the middle; grounded pads at both x ends. */
const archTris = (): Vec3[][] => [
  ...quad(-0.25, -0.1, 0.25, 0.1, () => 0.2),
  ...quad(-0.25, -0.1, -0.18, 0.1, () => 0),
  ...quad(0.18, -0.1, 0.25, 0.1, () => 0),
];

beforeEach(() => clearHeightFields());

describe("climbHeightAt with a mesh heightfield", () => {
  it("returns the TRUE local surface height on each side of a slope", () => {
    const w = new CollisionWorld(B, compileObstacles([propWith("test://ramp.glb", rampTris())]));
    expect(w.climbHeightAt(0, -0.2, 0, B.y)).toBeCloseTo(0.02, 1); // low end
    expect(w.climbHeightAt(0, 0.2, 0, B.y)).toBeCloseTo(0.18, 1); // high end
    expect(w.climbHeightAt(1.5, 0, 0, B.y)).toBe(B.y); // off the prop → substrate
  });

  it("walks UNDER an elevated span from the ground, but stands ON it from above", () => {
    const w = new CollisionWorld(B, compileObstacles([propWith("test://arch.glb", archTris())]));
    // Mid-span: the wood hangs 0.2 above the floor → a grounded gecko passes under.
    expect(w.climbHeightAt(0, 0, 0, B.y)).toBe(B.y);
    // The same point queried FROM deck height is a standable surface.
    expect(w.climbHeightAt(0, 0, 0, B.y + 0.2)).toBeCloseTo(B.y + 0.2, 1);
    // The grounded end is climbable from the floor.
    expect(w.climbHeightAt(-0.22, 0, 0, B.y)).toBeCloseTo(B.y + 0.2, 1);
  });

  it("follows position + yaw + scale (the editor transform)", () => {
    // XZ scale ×2 (Y stays 1 so the prop remains within climbable height).
    const o = propWith("test://ramp2.glb", rampTris(), {
      position: [1, 0, 0.5],
      rotation: [0, Math.PI / 2, 0],
      scale: [2, 1, 2],
    });
    const w = new CollisionWorld(B, compileObstacles([o]));
    // Local (0, +0.2) [high end, y=0.18] → yaw 90° → world (1.4, 0.5).
    expect(w.climbHeightAt(1.4, 0.5, 0, B.y)).toBeCloseTo(0.18, 1);
    // Local (0, −0.2) [low end, y=0.02] → world (0.6, 0.5).
    expect(w.climbHeightAt(0.6, 0.5, 0, B.y)).toBeCloseTo(0.02, 1);
  });

  it("keeps the flat-top behaviour for props WITHOUT height data", () => {
    const o = propWith("test://none.glb", rampTris());
    delete (o as { asset?: string }).asset; // no registry entry → flat fallback
    clearHeightFields();
    const w = new CollisionWorld(B, compileObstacles([o]));
    const flat = w.climbHeightAt(0, -0.2, 0.05);
    expect(flat).toBeCloseTo(0.2, 1); // the old prop-wide top (center+half)
  });
});

describe("gecko riding the exact surface", () => {
  const still = { ...GECKO_MOVEMENT, idleDur: [999, 999] as [number, number], idleChance: 1 };
  const rng = (): number => 0.5;

  it("climbs to the REAL prop height — the old 0.12 m cap is gone", () => {
    const w = new CollisionWorld(B, compileObstacles([propWith("test://plateau.glb", plateauTris())]));
    const g = new GeckoMovementController(w, still, rng, { x: 0, z: 0, yaw: 0 });
    for (let i = 0; i < 400; i++) g.update(1 / 60, []);
    expect(g.climbHeight).toBeGreaterThan(0.17); // true 0.2 deck, not min(0.12, …)
  });

  it("stays ON THE GROUND under an elevated branch span (the floating-gecko fix)", () => {
    const w = new CollisionWorld(B, compileObstacles([propWith("test://arch2.glb", archTris())]));
    const g = new GeckoMovementController(w, still, rng, { x: 0, z: 0, yaw: 0 });
    for (let i = 0; i < 200; i++) g.update(1 / 60, []);
    expect(g.climbHeight).toBeLessThan(0.02);
  });

  it("pitches the body along the slope (nose up climbing, nose down descending)", () => {
    const w = new CollisionWorld(B, compileObstacles([propWith("test://ramp3.glb", rampTris())]));
    const up = new GeckoMovementController(w, still, rng, { x: 0, z: 0, yaw: 0 }); // facing +z = uphill
    for (let i = 0; i < 300; i++) up.update(1 / 60, []);
    expect(up.groundPitch).toBeGreaterThan(0.15);
    const down = new GeckoMovementController(w, still, rng, { x: 0, z: 0, yaw: Math.PI });
    for (let i = 0; i < 300; i++) down.update(1 / 60, []);
    expect(down.groundPitch).toBeLessThan(-0.15);
  });
});

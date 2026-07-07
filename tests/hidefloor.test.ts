/**
 * HIDE INTERIOR FLOOR — the cave's raised floor plate + entrance sill are REAL
 * ground: the animal stands/lies ON them (never sunk through), the sill is
 * stepped over, and the walls/roof never lift it. The dedicated floor field is
 * what makes this possible: the dome ROOF covers the pocket in plan, so the
 * regular top/bottom heightfield can only see the roof there.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildFloorField,
  buildHeightField,
  clearHeightFields,
  registerFloorField,
  registerHeightField,
} from "../src/habitats/HabitatFootprint";
import { CollisionWorld, HIDE_FLOOR_MAX, compileObstacles } from "../src/habitats/HabitatCollision";
import type { GroundBounds } from "../src/habitats/HabitatBounds";
import type { PlacedObject, Vec3 } from "../src/habitats/HabitatTypes";

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

/** A dome-ish hide: ROOF at 0.3 covering the whole span, a raised interior
 *  FLOOR plate at 0.035, an entrance SILL ridge at 0.05, and vertical walls. */
const caveTris = (): Vec3[][] => [
  ...quad(-0.3, -0.3, 0.3, 0.3, () => 0.3), // roof (covers the pocket in plan)
  ...quad(-0.2, -0.2, 0.2, 0.1, () => 0.035), // raised interior floor plate
  ...quad(-0.12, 0.22, 0.12, 0.28, () => 0.05), // entrance sill ridge
  // Two vertical wall sheets (near-vertical quads).
  ...quad(-0.3, -0.3, -0.28, 0.3, (x) => (x < -0.29 ? 0 : 0.3)),
  ...quad(0.28, -0.3, 0.3, 0.3, (x) => (x > 0.29 ? 0 : 0.3)),
];

function hideObj(): PlacedObject {
  return {
    id: "cave",
    asset: "test://cave-floor.glb",
    category: "hide",
    interaction: "hide",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    collidable: true,
    collisionType: "meshApprox",
    assetFootprint: { half: [0.3, 0.15, 0.3], center: [0, 0.15, 0], shape: "obb" },
  };
}

beforeEach(() => clearHeightFields());

describe("buildFloorField — only low, horizontal surfaces", () => {
  it("captures the floor plate + sill, never the roof", () => {
    const ff = buildFloorField(caveTris())!;
    expect(ff).toBeTruthy();
    let max = 0;
    for (const v of ff.top) if (Number.isFinite(v) && v > max) max = v;
    expect(max).toBeLessThanOrEqual(0.06); // sill height — the 0.3 roof is excluded
  });
});

describe("standing INSIDE a hide", () => {
  it("stands ON the interior floor plate (not sunk to the sand, not on the roof)", () => {
    registerHeightField("test://cave-floor.glb", buildHeightField(caveTris(), 96)!);
    registerFloorField("test://cave-floor.glb", buildFloorField(caveTris(), 96)!);
    const w = new CollisionWorld(B, compileObstacles([hideObj()]));
    const inPocket = w.climbHeightAt(0, -0.05, 0, B.y);
    expect(inPocket).toBeCloseTo(0.035, 2); // the floor plate, exactly
    expect(inPocket).toBeLessThan(HIDE_FLOOR_MAX);
    // The entrance sill is stepped OVER (walk height = sill top there).
    expect(w.climbHeightAt(0, 0.25, 0, B.y)).toBeCloseTo(0.05, 2);
    // Clear of the hide → plain sand.
    expect(w.climbHeightAt(1.5, 0, 0, B.y)).toBe(B.y);
  });

  it("without a floor field, hides never lift the animal (roof can't leak in)", () => {
    registerHeightField("test://cave-floor.glb", buildHeightField(caveTris(), 96)!);
    // No registerFloorField on purpose.
    const w = new CollisionWorld(B, compileObstacles([hideObj()]));
    expect(w.climbHeightAt(0, -0.05, 0, B.y)).toBe(B.y);
  });
});

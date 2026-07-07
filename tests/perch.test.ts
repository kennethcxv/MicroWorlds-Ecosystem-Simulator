/**
 * PERCHING — the gecko picks a spot ON climbable decor (top or side) to park
 * itself, and approaches the climb from the LOW side (walks around the tall
 * face — how a real animal takes a rock).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { CollisionWorld, MAX_CLIMB_HEIGHT, compileObstacles } from "../src/habitats/HabitatCollision";
import { buildHeightField, clearHeightFields, registerHeightField } from "../src/habitats/HabitatFootprint";
import { findPerchSpot, lowSideStaging } from "../src/habitats/lizard/LizardPerch";
import { GECKO_MOVEMENT, GeckoMovementController } from "../src/habitats/lizard/GeckoMovementController";
import type { GroundBounds } from "../src/habitats/HabitatBounds";
import type { PlacedObject, Vec3 } from "../src/habitats/HabitatTypes";

const B: GroundBounds = { minX: -1.4, maxX: 1.4, minZ: -1, maxZ: 1, y: 0 };

function seededRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** A SOLID WEDGE rock: low edge (west, 0.02) ramping to a tall crest (east,
 *  0.28). A floor sheet keeps per-cell undersides at ~0 so the tall face reads
 *  as a solid wall to climb, not an overhang to walk under. */
const wedgeTris = (): Vec3[][] => {
  const y = (x: number): number => 0.02 + ((x + 0.2) / 0.4) * 0.26;
  const tris: Vec3[][] = [];
  const N = 8;
  for (let i = 0; i < N; i++) {
    const x0 = -0.2 + (i / N) * 0.4;
    const x1 = -0.2 + ((i + 1) / N) * 0.4;
    const a: Vec3 = [x0, y(x0), -0.16];
    const b: Vec3 = [x1, y(x1), -0.16];
    const c: Vec3 = [x1, y(x1), 0.16];
    const d: Vec3 = [x0, y(x0), 0.16];
    tris.push([a, b, c], [a, c, d]);
    // Underside floor (solid rock, grounded).
    const fa: Vec3 = [x0, 0.004, -0.16];
    const fb: Vec3 = [x1, 0.004, -0.16];
    const fc: Vec3 = [x1, 0.004, 0.16];
    const fd: Vec3 = [x0, 0.004, 0.16];
    tris.push([fa, fb, fc], [fa, fc, fd]);
  }
  return tris;
};

function wedgeWorld(): CollisionWorld {
  registerHeightField("test://wedge.glb", buildHeightField(wedgeTris(), 96)!);
  const rock: PlacedObject = {
    id: "wedge",
    asset: "test://wedge.glb",
    category: "rock",
    interaction: "climbable",
    position: [0.3, 0, 0.2],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    collidable: true,
    collisionType: "meshApprox",
    assetFootprint: { half: [0.2, 0.14, 0.16], center: [0, 0.14, 0], shape: "obb" },
  };
  return new CollisionWorld(B, compileObstacles([rock]));
}

beforeEach(() => clearHeightFields());

describe("findPerchSpot", () => {
  it("finds a standable spot ON the rock within the climb ceiling — never on the too-tall crest", () => {
    const w = wedgeWorld();
    for (let s = 1; s <= 6; s++) {
      const spot = findPerchSpot(w, seededRng(s));
      expect(spot).not.toBeNull();
      expect(spot!.h).toBeGreaterThanOrEqual(0.05);
      expect(spot!.h).toBeLessThanOrEqual(MAX_CLIMB_HEIGHT * 0.95 + 1e-6);
    }
  });

  it("returns null when nothing climbable exists", () => {
    const w = new CollisionWorld(B, []);
    expect(findPerchSpot(w, seededRng(2))).toBeNull();
  });
});

describe("lowSideStaging — climb the SHORT side", () => {
  it("stages the approach on the LOW (west) side of the wedge", () => {
    const w = wedgeWorld();
    // A perch on the mid-slope of the wedge (world x = rock.x + local x).
    const perch = { x: 0.3, z: 0.2 };
    const staging = lowSideStaging(w, perch, GECKO_MOVEMENT.bodyRadius);
    expect(staging).not.toBeNull();
    // The wedge is low on its WEST side — the staging point must be west of the perch.
    expect(staging!.x).toBeLessThan(perch.x);
  });
});

describe("the brain perches: walks to the spot (via the staging point) and STAYS", () => {
  it("requestShelter with a via-point routes through it and parks on the rock", () => {
    const w = wedgeWorld();
    const g = new GeckoMovementController(w, GECKO_MOVEMENT, seededRng(9), { x: -1.0, z: -0.6 });
    const perch = { x: 0.22, z: 0.2 }; // low-mid slope of the wedge
    const staging = lowSideStaging(w, perch, GECKO_MOVEMENT.bodyRadius)!;
    expect(g.requestShelter(perch, staging)).toBe(true);
    let arrived = false;
    for (let i = 0; i < 6000 && !arrived; i++) {
      g.update(1 / 60, []);
      arrived = g.sheltering;
    }
    expect(arrived).toBe(true);
    const p = g.position;
    expect(Math.hypot(p.x - perch.x, p.z - perch.z)).toBeLessThanOrEqual(0.16);
    // Parked ON the rock: standing height above the sand.
    expect(g.climbHeight).toBeGreaterThan(0.03);
    // …and it STAYS parked.
    for (let i = 0; i < 300; i++) g.update(1 / 60, []);
    const q = g.position;
    expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeLessThan(0.02);
  });
});

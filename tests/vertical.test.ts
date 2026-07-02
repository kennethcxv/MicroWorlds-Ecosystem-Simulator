/**
 * VERTICAL NO-PHASE GUARANTEE — no part of the body (snout, legs, hips, tail)
 * may EVER be below the mesh surface under it, in any frame: climbing onto a
 * rock, walking its crest, and especially STEPPING OFF a ledge (where the
 * pitched head/tail line used to stab into the rock face). The body must rise
 * or hold height rather than let any part enter the mesh.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { CollisionWorld, compileObstacles } from "../src/habitats/HabitatCollision";
import { buildHeightField, clearHeightFields, registerHeightField } from "../src/habitats/HabitatFootprint";
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

/** A SOLID mesa (parametric height) with sheer faces — the classic ledge. */
const mesaTrisAt = (top: number): Vec3[][] => {
  const tris: Vec3[][] = [];
  const quad = (x0: number, z0: number, x1: number, z1: number, y: (x: number) => number): void => {
    const a: Vec3 = [x0, y(x0), z0];
    const b: Vec3 = [x1, y(x1), z0];
    const c: Vec3 = [x1, y(x1), z1];
    const d: Vec3 = [x0, y(x0), z1];
    tris.push([a, b, c], [a, c, d]);
  };
  quad(-0.22, -0.2, 0.22, 0.2, () => top);
  quad(-0.22, -0.2, 0.22, 0.2, () => 0.004);
  quad(-0.22, -0.2, -0.215, 0.2, (x) => (x < -0.218 ? 0 : top));
  quad(0.215, -0.2, 0.22, 0.2, (x) => (x > 0.218 ? 0 : top));
  return tris;
};

/** A SOLID mesa: flat top at 0.16 with sheer faces — the classic ledge. */
const mesaTris = (): Vec3[][] => {
  const tris: Vec3[][] = [];
  const quad = (x0: number, z0: number, x1: number, z1: number, y: (x: number) => number): void => {
    const a: Vec3 = [x0, y(x0), z0];
    const b: Vec3 = [x1, y(x1), z0];
    const c: Vec3 = [x1, y(x1), z1];
    const d: Vec3 = [x0, y(x0), z1];
    tris.push([a, b, c], [a, c, d]);
  };
  quad(-0.22, -0.2, 0.22, 0.2, () => 0.16); // flat top
  quad(-0.22, -0.2, 0.22, 0.2, () => 0.004); // grounded underside (solid)
  // Sheer side walls (west + east faces).
  quad(-0.22, -0.2, -0.215, 0.2, (x) => (x < -0.218 ? 0 : 0.16));
  quad(0.215, -0.2, 0.22, 0.2, (x) => (x > 0.218 ? 0 : 0.16));
  return tris;
};

function mesaWorld(): CollisionWorld {
  registerHeightField("test://mesa.glb", buildHeightField(mesaTris(), 96)!);
  const rock: PlacedObject = {
    id: "mesa",
    asset: "test://mesa.glb",
    category: "rock",
    interaction: "climbable",
    position: [0.2, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    collidable: true,
    collisionType: "meshApprox",
    assetFootprint: { half: [0.22, 0.08, 0.2], center: [0, 0.08, 0], shape: "obb" },
  };
  return new CollisionWorld(B, compileObstacles([rock]));
}

beforeEach(() => clearHeightFields());

describe("no body part ever dips into the mesh", () => {
  it("climbing ON, crossing, and STEPPING OFF the mesa: worst part clearance stays sane every frame", () => {
    const w = mesaWorld();
    const g = new GeckoMovementController(w, GECKO_MOVEMENT, seededRng(5), { x: -0.9, z: 0, yaw: Math.PI / 2 });
    // March it straight across the mesa (west → east) via a perch-style trip
    // to a point past the far edge; sample clearance EVERY frame.
    expect(g.requestShelter({ x: 1.0, z: 0 }, undefined, 0.15)).toBe(true);
    let worst = Infinity;
    let crossedTop = false;
    for (let i = 0; i < 4000; i++) {
      g.update(1 / 60, []);
      const c = g.worstPartClearance;
      worst = Math.min(worst, c);
      if (g.climbHeight > 0.1) crossedTop = true;
      if (g.sheltering) break;
    }
    expect(crossedTop).toBe(true); // it genuinely went over the top
    // NO part below the local mesh surface (small grace for sampling noise).
    expect(worst).toBeGreaterThan(-0.02);
  });

  it("SMOOTH climbing: the body rides the FEET — legs never overextend, height never jumps", () => {
    const w = mesaWorld();
    const g = new GeckoMovementController(w, GECKO_MOVEMENT, seededRng(9), { x: -0.9, z: 0, yaw: Math.PI / 2 });
    expect(g.requestShelter({ x: 1.0, z: 0 }, undefined, 0.15)).toBe(true);
    let maxGap = 0; // body height above its HIGHEST support (foot or belly contact)
    let maxJump = 0; // per-frame body height change (smoothness)
    let prevH = g.climbHeight;
    for (let i = 0; i < 4000; i++) {
      g.update(1 / 60, []);
      const feet = g.feet;
      // Support = the highest foot contact OR a torso part resting ON the prop
      // (mid-mantle the chest/hips legitimately bear on the crest lip while the
      // feet reach — real animals belly-slide over ledges).
      let support = Math.max(...feet.map((f) => f.y - f.lift));
      const yaw = g.heading;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const sinP = Math.sin(g.groundPitch);
      const standY = 0 /* bounds.y */ + g.climbHeight;
      for (const pr of g.bodyProbes) {
        const s = w.climbHeightAt(g.position.x + fx * pr.forward, g.position.z + fz * pr.forward, 0.01, standY);
        if (s <= 0.02) continue; // substrate isn't prop support
        const partY = standY + sinP * pr.forward;
        if (Math.abs(partY - s) < 0.03) support = Math.max(support, s);
      }
      maxGap = Math.max(maxGap, standY - support);
      maxJump = Math.max(maxJump, Math.abs(g.climbHeight - prevH));
      prevH = g.climbHeight;
      if (g.sheltering) break;
    }
    // The AAA quadruped rule: the body goes where its contacts are. Mid-mantle
    // the lower feet legitimately reach down — but SOMETHING always bears the
    // body within leg length (~6 cm): no stilts, no floating.
    expect(maxGap).toBeLessThan(0.06);
    // And the height never snaps more than ~12 mm in a single frame (a brisk
    // push-up is fine; a teleport is not).
    expect(maxJump).toBeLessThan(0.012);
  });

  it("NEVER gets carried up (or stranded on) a TOO-TALL prop — it routes around", () => {
    // A crown ABOVE the mantle ceiling: navigation refuses it — and the feet
    // must too, or step by step the body gets carried onto a top no route
    // leads off of (the 'stuck on the rock' bug).
    clearHeightFields();
    registerHeightField("test://tallmesa.glb", buildHeightField(mesaTrisAt(0.3), 96)!);
    const rock: PlacedObject = {
      id: "tallmesa",
      asset: "test://tallmesa.glb",
      category: "rock",
      interaction: "climbable",
      position: [0.2, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      collidable: true,
      collisionType: "meshApprox",
      assetFootprint: { half: [0.22, 0.15, 0.2], center: [0, 0.15, 0], shape: "obb" },
    };
    const w = new CollisionWorld(B, compileObstacles([rock]));
    const g = new GeckoMovementController(w, GECKO_MOVEMENT, seededRng(13), { x: -0.9, z: 0, yaw: Math.PI / 2 });
    // Send it to the far side — the route must go AROUND, never over the crown.
    expect(g.requestShelter({ x: 1.0, z: 0 }, undefined, 0.15)).toBe(true);
    let maxClimbSeen = 0;
    for (let i = 0; i < 5000; i++) {
      g.update(1 / 60, []);
      maxClimbSeen = Math.max(maxClimbSeen, g.climbHeight);
      if (g.sheltering) break;
    }
    expect(g.sheltering).toBe(true); // it got there
    expect(maxClimbSeen).toBeLessThan(0.22); // and never went up the crown
    // …and it ends on legal free ground (not stranded anywhere).
    const p = g.position;
    expect(w.isFree(p.x, p.z, GECKO_MOVEMENT.bodyRadius)).toBe(true);
  });
});

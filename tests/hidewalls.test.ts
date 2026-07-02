/**
 * HIDE WALL COLLISION — the hide's exterior is a CLOSED collision band that
 * matches the visible rock at body height: impossible to walk through from any
 * direction; the ONLY open space is the entrance mouth + the interior pocket.
 *
 * Why the old path was wrong (and let the gecko phase through walls): the full
 * silhouette trace projects ALL triangles, and a dome's ROOF covers everything
 * in plan — the pocket/mouth read as solid, decimation then shed loops, and the
 * compiled result was a leaky partial blob with entire wall sections uncovered.
 */
import { describe, expect, it } from "vitest";
import {
  pointInPolygon,
  traceContours,
  traceWallContours,
} from "../src/habitats/HabitatFootprint";
import { CollisionWorld, compileObstacles } from "../src/habitats/HabitatCollision";
import { NavGraph } from "../src/habitats/HabitatNavigation";
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

/** Vertical wall sheet: vertices at ground (0) and roof (0.3) so its triangles
 *  span the whole body-height band, projecting to the sheet's plan rectangle. */
const wall = (x0: number, z0: number, x1: number, z1: number): Vec3[][] =>
  quad(x0, z0, x1, z1, (x) => (x === x0 ? 0 : 0.3));

/**
 * A dome hide with a MOUTH: roof covering the whole span, raised floor plate,
 * entrance sill, wall band around three sides + two jambs, an ARCH above the
 * mouth opening (material only high up — must NOT block the entrance), and an
 * outer BAFFLE shell in front of the mouth (like the real cave's outer rock
 * arc) so entering requires a BENT path — no straight line reaches the pocket.
 * Mouth gap: x ∈ (−0.12, 0.12) on the +Z side; baffle gap on its east side.
 */
const domeWithMouth = (): Vec3[][] => [
  ...quad(-0.3, -0.3, 0.3, 0.3, () => 0.3), // roof — covers the pocket in plan
  ...quad(-0.18, -0.18, 0.18, 0.12, () => 0.035), // interior floor plate
  ...quad(-0.12, 0.22, 0.12, 0.28, () => 0.05), // entrance sill (stepped over)
  ...wall(-0.3, -0.3, -0.22, 0.3), // west wall
  ...wall(0.22, -0.3, 0.3, 0.3), // east wall
  ...wall(-0.3, -0.3, 0.3, -0.22), // north wall (back)
  ...wall(-0.3, 0.22, -0.12, 0.3), // south jamb (left of the mouth)
  ...wall(0.12, 0.22, 0.3, 0.3), // south jamb (right of the mouth)
  ...quad(-0.12, 0.22, 0.12, 0.3, (x) => (x === -0.12 ? 0.18 : 0.3)), // mouth ARCH — high material only
  ...wall(-0.34, 0.44, 0.06, 0.52), // outer baffle shell — forces a bent entry
];

const insideAny = (loops: Vec2[][], x: number, z: number): boolean =>
  loops.some((loop) => pointInPolygon(loop, x, z));

describe("traceWallContours — walls solid, mouth + pocket open", () => {
  it("blocks every wall section, keeps the pocket + mouth open, ignores roof/floor/sill/arch", () => {
    const loops = traceWallContours(domeWithMouth());
    expect(loops.length).toBeGreaterThan(0);
    // Every wall side is covered — walking through is impossible anywhere.
    expect(insideAny(loops, -0.26, 0)).toBe(true); // west
    expect(insideAny(loops, 0.26, 0)).toBe(true); // east
    expect(insideAny(loops, 0, -0.26)).toBe(true); // back
    expect(insideAny(loops, -0.2, 0.26)).toBe(true); // left jamb
    expect(insideAny(loops, 0.2, 0.26)).toBe(true); // right jamb
    // The ONLY open space: the interior pocket and the entrance mouth.
    expect(insideAny(loops, 0, -0.05)).toBe(false); // pocket centre
    expect(insideAny(loops, 0, 0.26)).toBe(false); // mouth centre (arch is high above)
  });

  it("documents the old bug: the full-silhouette trace swallows the pocket (roof fills the plan)", () => {
    const tris2 = domeWithMouth().map((t) => t.map(([x, , z]) => [x, z] as Vec2));
    const silhouette = traceContours(tris2, 128);
    expect(insideAny(silhouette, 0, -0.05)).toBe(true); // pocket reads SOLID — unusable for a hide
  });
});

describe("compiled hide world — enter through the mouth only", () => {
  function hideWorld(): CollisionWorld {
    const o: PlacedObject = {
      id: "cave",
      asset: "test://cave-walls.glb",
      category: "hide",
      interaction: "hide",
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      collidable: true,
      collisionType: "meshApprox",
      assetFootprint: {
        half: [0.3, 0.15, 0.3],
        center: [0, 0.15, 0],
        shape: "obb",
        contours: traceWallContours(domeWithMouth()),
      },
    };
    return new CollisionWorld(B, compileObstacles([o]));
  }

  it("the pocket is free space; the walls are not", () => {
    const w = hideWorld();
    expect(w.isFree(0, -0.05, 0.05)).toBe(true); // interior pocket
    expect(w.isFree(-0.26, 0, 0.05)).toBe(false); // inside the west wall
  });

  it("no straight walk line crosses a wall — the mouth is the only way in", () => {
    const w = hideWorld();
    // Through the back wall, through a side wall, through the baffle: refused.
    expect(w.losClear(0, -0.6, 0, -0.05, 0.05)).toBe(false);
    expect(w.losClear(-0.6, 0, 0, -0.05, 0.05)).toBe(false);
    expect(w.losClear(0, 0.55, 0, -0.05, 0.05)).toBe(false);
    // From INSIDE the baffle gap, straight through the mouth: clear.
    expect(w.losClear(0, 0.34, 0, -0.05, 0.05)).toBe(true);
  });

  it("the PLANNER routes into the pocket through the mouth from anywhere (doorway corridor)", () => {
    const w = hideWorld();
    const nav = new NavGraph(w, 0.05);
    // From behind the hide (no straight line in) to the pocket centre.
    const path = nav.findPath({ x: 0, z: -0.7 }, { x: 0, z: -0.05 });
    expect(path).not.toBeNull();
    // Planner contract: every leg is a clear walk line.
    let prev = { x: 0, z: -0.7 };
    for (const p of path!) {
      expect(w.losClear(prev.x, prev.z, p.x, p.z, 0.05)).toBe(true);
      prev = p;
    }
    // …and back out again (start INSIDE the pocket).
    expect(nav.findPath({ x: 0, z: -0.05 }, { x: 0.8, z: -0.7 })).not.toBeNull();
  });
});

describe("grid fallback — findPath never strands two walk-connected points", () => {
  it("threads a zigzag lane even with NO visibility waypoints at all", () => {
    // Two long walls forming an S: the only route snakes right, up, then left.
    const wallBox = (id: string, x: number, z: number, hx: number, hz: number): PlacedObject => ({
      id,
      category: "rock",
      position: [x, B.y, z],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      collidable: true,
      collisionType: "box",
      interaction: "blocked",
      collision: { halfExtents: [hx, 0.2, hz] },
    });
    const w = new CollisionWorld(
      B,
      compileObstacles([wallBox("a", -0.4, -0.3, 1.4, 0.06), wallBox("b", 0.4, 0.35, 1.4, 0.06)]),
    );
    // ringPoints 0 = an EMPTY visibility graph — only the grid fallback can route.
    const nav = new NavGraph(w, 0.06, { ringPoints: 0, clearance: 0.05 });
    const from = { x: -1.2, z: -0.8 };
    const to = { x: -1.2, z: 0.8 };
    const path = nav.findPath(from, to);
    expect(path).not.toBeNull();
    let prev = from;
    for (const p of path!) {
      expect(w.losClear(prev.x, prev.z, p.x, p.z, 0.06)).toBe(true);
      prev = p;
    }
    // The final waypoint IS the goal.
    const last = path![path!.length - 1];
    expect(Math.hypot(last.x - to.x, last.z - to.z)).toBeLessThan(1e-6);
  });
});

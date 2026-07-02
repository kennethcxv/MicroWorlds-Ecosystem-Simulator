import { describe, it, expect } from "vitest";
import { CollisionWorld, compileObstacles } from "../src/habitats/HabitatCollision";
import { NavGraph } from "../src/habitats/HabitatNavigation";
import type { GroundBounds } from "../src/habitats/HabitatBounds";
import type { PlacedObject, CollisionType, ObstacleInteraction } from "../src/habitats/HabitatTypes";

const BOUNDS: GroundBounds = { minX: -1.5, maxX: 1.5, minZ: -1.2, maxZ: 1.2, y: 0.08 };

function obj(
  id: string,
  collisionType: CollisionType,
  position: [number, number, number],
  interaction: ObstacleInteraction,
  extra: Partial<PlacedObject> = {},
): PlacedObject {
  return {
    id,
    category: "rock",
    position,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    collidable: true,
    collisionType,
    interaction,
    ...extra,
  };
}

describe("NavGraph.findPath", () => {
  const RADIUS = 0.1;

  it("returns a straight shot when the target is visible", () => {
    const world = new CollisionWorld(BOUNDS, []);
    const nav = new NavGraph(world, RADIUS);
    const path = nav.findPath({ x: -1, z: 0 }, { x: 1, z: 0 });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(1);
    expect(path![0].x).toBeCloseTo(1);
  });

  it("routes AROUND a blocked obstacle between start and goal", () => {
    const obstacles = compileObstacles([
      obj("wall", "box", [0, 0, 0], "blocked", { collision: { halfExtents: [0.15, 0.2, 0.9] } }),
    ]);
    const world = new CollisionWorld(BOUNDS, obstacles);
    const nav = new NavGraph(world, RADIUS);
    const from = { x: -1.0, z: 0 };
    const to = { x: 1.0, z: 0 };
    // Direct line is blocked by the tall thin wall...
    expect(world.losClear(from.x, from.z, to.x, to.z, RADIUS)).toBe(false);
    const path = nav.findPath(from, to);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(1); // it had to detour
    // Every hop of the route is itself clear of hard obstacles.
    let px = from.x;
    let pz = from.z;
    for (const wp of path!) {
      expect(world.losClear(px, pz, wp.x, wp.z, RADIUS)).toBe(true);
      px = wp.x;
      pz = wp.z;
    }
    // ...and the route ends at the goal.
    expect(px).toBeCloseTo(to.x);
    expect(pz).toBeCloseTo(to.z);
  });

  it("returns null when the goal is sealed off by a wall spanning the enclosure", () => {
    // A blocked wall spanning the full depth with no gap ⇒ the right half is sealed.
    const obstacles = compileObstacles([
      obj("wall", "box", [0, 0, 0], "blocked", { collision: { halfExtents: [0.12, 0.2, 1.2] } }),
    ]);
    const world = new CollisionWorld(BOUNDS, obstacles);
    const nav = new NavGraph(world, RADIUS);
    const path = nav.findPath({ x: -1.2, z: 0 }, { x: 1.2, z: 0 });
    expect(path).toBeNull();
  });

  it("builds ONE waypoint ring per PROP, not per compiled volume", () => {
    // A concave prop compiles to several poly volumes sharing one object id — the
    // graph must not multiply ring nodes (O(n²) pre-connect) per loop.
    const sq = (cx: number, cz: number): [number, number][] => [
      [cx - 0.08, cz - 0.08],
      [cx + 0.08, cz - 0.08],
      [cx + 0.08, cz + 0.08],
      [cx - 0.08, cz + 0.08],
    ];
    const obstacles = compileObstacles([
      obj("drift", "box", [0, 0.08, 0], "blocked", {
        assetFootprint: {
          half: [0.4, 0.1, 0.4],
          center: [0, 0.1, 0],
          shape: "obb",
          contours: [sq(-0.25, 0), sq(0.25, 0), sq(0, 0.25)],
        },
      }),
    ]);
    expect(obstacles.length).toBe(3); // three loops…
    const world = new CollisionWorld(BOUNDS, obstacles);
    const nav = new NavGraph(world, RADIUS);
    // …but at most one ring of candidates (12) for the whole prop — measured
    // over the empty-world baseline (perimeter lane nodes are per-tank, not
    // per-prop).
    const baseline = new NavGraph(new CollisionWorld(BOUNDS, []), RADIUS).nodeCount;
    expect(nav.nodeCount - baseline).toBeLessThanOrEqual(12);
    // And routing around the prop still works.
    const path = nav.findPath({ x: -1.2, z: 0 }, { x: 1.2, z: 0 });
    expect(path).not.toBeNull();
  });

  it("walks STRAIGHT across a climbable obstacle (no detour needed)", () => {
    const obstacles = compileObstacles([
      obj("log", "box", [0, 0, 0], "climbable", { collision: { halfExtents: [0.15, 0.1, 0.9] } }),
    ]);
    const world = new CollisionWorld(BOUNDS, obstacles);
    const nav = new NavGraph(world, RADIUS);
    // Climbable ⇒ not a hard obstacle ⇒ LOS is clear ⇒ straight path.
    expect(world.losClear(-1, 0, 1, 0, RADIUS)).toBe(true);
    const path = nav.findPath({ x: -1, z: 0 }, { x: 1, z: 0 });
    expect(path!.length).toBe(1);
    // No ring nodes for a purely climbable world — only the per-tank
    // perimeter lane (same count as an empty world).
    const baseline = new NavGraph(new CollisionWorld(BOUNDS, []), RADIUS).nodeCount;
    expect(nav.nodeCount).toBe(baseline);
  });
});

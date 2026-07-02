import { describe, it, expect } from "vitest";
import {
  CollisionWorld,
  compileObstacle,
  compileObstacles,
  type SolidObstacle,
} from "../src/habitats/HabitatCollision";
import type { GroundBounds } from "../src/habitats/HabitatBounds";
import type { PlacedObject, CollisionType, Vec2 } from "../src/habitats/HabitatTypes";

const BOUNDS: GroundBounds = { minX: -1.5, maxX: 1.5, minZ: -1, maxZ: 1, y: 0.08 };

function obj(
  id: string,
  collisionType: CollisionType,
  position: [number, number, number],
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
    ...extra,
  };
}

/** A seeded LCG so target sampling is deterministic in tests. */
function seededRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

describe("compileObstacle", () => {
  it("skips non-collidable / none volumes", () => {
    expect(compileObstacle(obj("a", "none", [0, 0, 0]))).toBeNull();
    expect(compileObstacle(obj("b", "box", [0, 0, 0], { collidable: false }))).toBeNull();
  });

  it("compiles sphere → circle with scaled radius", () => {
    const c = compileObstacle(
      obj("s", "sphere", [1, 0, 0], { scale: [2, 1, 2], collision: { radius: 0.5 } }),
    ) as SolidObstacle & { shape: "circle" };
    expect(c.shape).toBe("circle");
    expect(c.cx).toBeCloseTo(1);
    expect(c.r).toBeCloseTo(1); // 0.5 * max(2,2)
  });

  it("compiles capsule → segment oriented by yaw", () => {
    const c = compileObstacle(
      obj("l", "capsule", [0, 0, 0], {
        rotation: [0, Math.PI / 2, 0],
        collision: { radius: 0.2, length: 2 },
      }),
    ) as SolidObstacle & { shape: "segment" };
    expect(c.shape).toBe("segment");
    // length along local +Z, rotated 90° → lies along world X
    expect(Math.abs(c.x1 - c.x2)).toBeCloseTo(2, 1);
    expect(Math.abs(c.z1 - c.z2)).toBeCloseTo(0, 5);
  });
});

describe("CollisionWorld.isFree / isBlocked", () => {
  const world = new CollisionWorld(BOUNDS, [
    { shape: "circle", id: "rock", cx: 0, cz: 0, r: 0.3, top: 0.4 },
  ]);

  it("blocks points inside a circle obstacle", () => {
    expect(world.isBlocked(0, 0)).toBe(true);
    expect(world.isBlocked(0.2, 0)).toBe(true);
    expect(world.isBlocked(0.9, 0)).toBe(false);
  });

  it("isFree respects the animal radius and the walls", () => {
    // 0.25 from the rock centre, animal radius 0.1 → 0.35 needed vs 0.3+0.1
    expect(world.isFree(0.25, 0, 0.1)).toBe(false);
    expect(world.isFree(0.9, 0, 0.1)).toBe(true);
    // Just inside the +X wall, but radius pushes it out of bounds.
    expect(world.isFree(1.45, 0, 0.1)).toBe(false);
  });
});

describe("CollisionWorld.resolve — never ends inside an obstacle or outside bounds", () => {
  const RADIUS = 0.12;

  it("clamps a move that would leave the enclosure", () => {
    const world = new CollisionWorld(BOUNDS, []);
    const r = world.resolve(0, 0, 99, 99, RADIUS);
    expect(r.x).toBeLessThanOrEqual(BOUNDS.maxX - RADIUS + 1e-6);
    expect(r.z).toBeLessThanOrEqual(BOUNDS.maxZ - RADIUS + 1e-6);
  });

  it("pushes a move that would enter a circular rock back out (and flags blocked)", () => {
    const world = new CollisionWorld(BOUNDS, [
      { shape: "circle", id: "rock", cx: 0, cz: 0, r: 0.3, top: 0.4 },
    ]);
    const r = world.resolve(-0.9, 0, 0, 0, RADIUS); // aim straight into the rock centre
    expect(Math.hypot(r.x - 0, r.z - 0)).toBeGreaterThanOrEqual(0.3 + RADIUS - 1e-3);
    expect(world.isBlocked(r.x, r.z, RADIUS)).toBe(false);
  });

  it("pushes out of a rotated box (hide) and slides along it", () => {
    const world = new CollisionWorld(BOUNDS, [
      { shape: "obb", id: "hide", cx: 0, cz: 0, hx: 0.4, hz: 0.2, yaw: 0.6, top: 0.3 },
    ]);
    // Approach the box from many angles; result must never be inside it.
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const fromX = Math.cos(ang) * 0.9;
      const fromZ = Math.sin(ang) * 0.9;
      const r = world.resolve(fromX, fromZ, 0, 0, RADIUS);
      expect(world.isBlocked(r.x, r.z, RADIUS)).toBe(false);
    }
  });

  it("keeps a log (segment) impassable", () => {
    const world = new CollisionWorld(BOUNDS, [
      { shape: "segment", id: "log", x1: -0.6, z1: 0, x2: 0.6, z2: 0, r: 0.15, top: 0.3 },
    ]);
    const r = world.resolve(0, -0.8, 0, 0.8, RADIUS); // try to cross the log
    expect(world.isBlocked(r.x, r.z, RADIUS)).toBe(false);
  });
});

describe("walking simulation — a gecko cannot phase through obstacles", () => {
  it("never occupies an obstacle across many steps toward blocked targets", () => {
    const world = new CollisionWorld(BOUNDS, [
      { shape: "circle", id: "rock1", cx: -0.5, cz: 0.2, r: 0.28, top: 0.4 },
      { shape: "obb", id: "hide", cx: 0.5, cz: -0.2, hx: 0.35, hz: 0.25, yaw: 0.4, top: 0.3 },
      { shape: "segment", id: "log", x1: -0.2, z1: 0.5, x2: 0.6, z2: 0.6, r: 0.12, top: 0.3 },
    ]);
    const rng = seededRng(42);
    const radius = 0.1;
    const speed = 0.3;
    const dt = 1 / 60;
    let x = -1.2;
    let z = -0.8;
    // Start clear.
    expect(world.isBlocked(x, z, radius)).toBe(false);

    let target = { x: 0.5, z: -0.2 }; // deliberately AT the hide centre
    for (let step = 0; step < 4000; step++) {
      const dx = target.x - x;
      const dz = target.z - z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) {
        target = world.randomFreeTarget(radius, rng) ?? target;
      }
      const nx = x + (dx / (d || 1)) * speed * dt;
      const nz = z + (dz / (d || 1)) * speed * dt;
      const res = world.resolve(x, z, nx, nz, radius);
      x = res.x;
      z = res.z;
      if (res.blocked) target = world.randomFreeTarget(radius, rng) ?? target;

      // INVARIANT: after every resolved step, never inside an obstacle, never OOB.
      expect(world.isBlocked(x, z, radius)).toBe(false);
      expect(x).toBeGreaterThanOrEqual(BOUNDS.minX - 1e-6);
      expect(x).toBeLessThanOrEqual(BOUNDS.maxX + 1e-6);
      expect(z).toBeGreaterThanOrEqual(BOUNDS.minZ - 1e-6);
      expect(z).toBeLessThanOrEqual(BOUNDS.maxZ + 1e-6);
    }
  });
});

describe("interaction types — passable (climbable/low) vs hard (blocked/hide)", () => {
  const RADIUS = 0.1;

  it("climbable obstacles do NOT hard-block: isBlocked is false inside them", () => {
    const world = new CollisionWorld(
      BOUNDS,
      compileObstacles([obj("log", "box", [0, 0, 0], { interaction: "climbable", collision: { halfExtents: [0.2, 0.1, 0.2] } })]),
    );
    expect(world.hard.length).toBe(0); // excluded from the route-around set
    expect(world.isBlocked(0, 0, RADIUS)).toBe(false);
    // ...and the walk height rises to the top of the climbable when standing on it.
    expect(world.climbHeightAt(0, 0, RADIUS)).toBeGreaterThan(BOUNDS.y);
  });

  it("blocked obstacles hard-block and block line-of-sight; climbable don't", () => {
    const blocked = new CollisionWorld(
      BOUNDS,
      compileObstacles([obj("rock", "box", [0, 0, 0], { interaction: "blocked", collision: { halfExtents: [0.25, 0.2, 0.25] } })]),
    );
    expect(blocked.isBlocked(0, 0, RADIUS)).toBe(true);
    expect(blocked.losClear(-0.9, 0, 0.9, 0, RADIUS)).toBe(false);

    const climb = new CollisionWorld(
      BOUNDS,
      compileObstacles([obj("rock", "box", [0, 0, 0], { interaction: "climbable", collision: { halfExtents: [0.25, 0.1, 0.25] } })]),
    );
    expect(climb.losClear(-0.9, 0, 0.9, 0, RADIUS)).toBe(true);
  });

  it("soft obstacles (small plants) compile to no volume at all", () => {
    expect(compileObstacle(obj("succ", "sphere", [0, 0, 0], { interaction: "softObstacle" }))).toBeNull();
  });
});

describe("asset-derived tight collision (measured footprint overrides the authored guess)", () => {
  it("builds a tight OBB from the measured footprint, ignoring the authored collision box", () => {
    const c = compileObstacle(
      obj("d", "box", [1, 0.08, 0], {
        assetFootprint: { half: [0.1, 0.06, 0.2], center: [0, 0.06, 0], shape: "obb" },
        // Deliberately huge authored guess — must be IGNORED in favour of the footprint.
        collision: { halfExtents: [0.5, 0.5, 0.5] },
      }),
    ) as SolidObstacle & { shape: "obb" };
    expect(c.shape).toBe("obb");
    expect(c.hx).toBeCloseTo(0.1);
    expect(c.hz).toBeCloseTo(0.2);
    // top = position.y + (center.y + half.y) → tight to the visible mesh, no float.
    expect(c.top).toBeCloseTo(0.08 + 0.12);
  });

  it("scales the footprint volume with the object's scale", () => {
    const c = compileObstacle(
      obj("d", "box", [0, 0.08, 0], {
        scale: [2, 1, 3],
        assetFootprint: { half: [0.1, 0.06, 0.2], center: [0, 0.06, 0], shape: "obb" },
      }),
    ) as SolidObstacle & { shape: "obb" };
    expect(c.hx).toBeCloseTo(0.2); // 0.1 * 2
    expect(c.hz).toBeCloseTo(0.6); // 0.2 * 3
  });

  it("orients the footprint OBB by the object's yaw", () => {
    const c = compileObstacle(
      obj("d", "box", [0, 0.08, 0], {
        rotation: [0, Math.PI / 2, 0],
        assetFootprint: { half: [0.1, 0.06, 0.2], center: [0, 0.06, 0], shape: "obb" },
      }),
    ) as SolidObstacle & { shape: "obb" };
    expect(c.yaw).toBeCloseTo(Math.PI / 2);
  });

  it("builds a tight circle from a round footprint", () => {
    const c = compileObstacle(
      obj("r", "sphere", [0, 0.08, 0], {
        scale: [2, 1, 1],
        assetFootprint: { half: [0.12, 0.05, 0.1], center: [0, 0.05, 0], shape: "circle" },
      }),
    ) as SolidObstacle & { shape: "circle" };
    expect(c.shape).toBe("circle");
    expect(c.r).toBeCloseTo(0.24); // max(0.12*2, 0.1*1)
    expect(c.top).toBeCloseTo(0.08 + 0.1); // py + center.y + half.y
  });
});

describe("footprint follows X/Z tilt (advanced rotation) — collision matches the tilted mesh", () => {
  // A tall box (half y = 0.3) with its base at y=0 (center.y = 0.3).
  const tall = () =>
    obj("t", "box", [0, 0, 0], {
      assetFootprint: { half: [0.1, 0.3, 0.1], center: [0, 0.3, 0], shape: "obb" },
    });

  it("keeps a tight yaw-OBB when untilted", () => {
    const c = compileObstacle({ ...tall(), rotation: [0, Math.PI / 4, 0] }) as SolidObstacle & { shape: "obb" };
    expect(c.yaw).toBeCloseTo(Math.PI / 4);
    expect(c.hx).toBeCloseTo(0.1);
    expect(c.hz).toBeCloseTo(0.1);
    expect(c.top).toBeCloseTo(0.6); // full height
  });

  it("laying the box flat on X (90°) deepens the Z footprint and lowers the top", () => {
    // rx = +90°: local +Y (height 0.3) → world +Z, local +Z → world −Y.
    const c = compileObstacle({ ...tall(), rotation: [Math.PI / 2, 0, 0] }) as SolidObstacle & { shape: "obb" };
    expect(c.shape).toBe("obb");
    expect(c.hx).toBeCloseTo(0.1); // X unchanged
    expect(c.hz).toBeCloseTo(0.3); // grew: the former height now lies along Z
    expect(c.cz).toBeCloseTo(0.3); // footprint shifted forward
    expect(c.top).toBeCloseTo(0.1); // former Z half-depth is now the height
  });

  it("a tilted CLIMBABLE box still reports its (lowered) real top for climb height", () => {
    const world = new CollisionWorld(
      BOUNDS,
      compileObstacles([
        obj("ramp", "box", [0, 0.08, 0], {
          interaction: "climbable",
          assetFootprint: { half: [0.1, 0.3, 0.1], center: [0, 0.3, 0], shape: "obb" },
          rotation: [Math.PI / 2, 0, 0],
        }),
      ]),
    );
    // Climbable ⇒ not hard; standing on it, walk height ≈ base + tilted top (~0.1).
    expect(world.climbHeightAt(0, 0.3, 0.1)).toBeCloseTo(0.08 + 0.1, 1);
  });
});

describe("mesh-footprint (convex hull) collision — traces the outline, not the box", () => {
  // A triangular hull (local XZ, natural size) inside a 0.6×0.5 bounding box.
  const tri = {
    half: [0.3, 0.1, 0.3] as [number, number, number],
    center: [0, 0.1, 0] as [number, number, number],
    shape: "obb" as const,
    hull: [
      [-0.3, -0.2],
      [0.3, -0.2],
      [0, 0.3],
    ] as [number, number][],
  };

  it("compiles to a hull obstacle transformed by scale + yaw + position", () => {
    const c = compileObstacle(obj("h", "box", [1, 0.08, 0], { assetFootprint: tri })) as SolidObstacle & {
      shape: "hull";
      pts: { x: number; z: number }[];
    };
    expect(c.shape).toBe("hull");
    expect(c.pts.length).toBe(3);
    expect(c.pts[0].x).toBeCloseTo(0.7); // -0.3 + position.x(1)
    expect(c.pts[0].z).toBeCloseTo(-0.2);
    expect(c.top).toBeCloseTo(0.08 + 0.2);
  });

  it("blocks inside the traced outline but NOT the empty bounding-box corners", () => {
    const world = new CollisionWorld(BOUNDS, compileObstacles([obj("h", "box", [0, 0.08, 0], { assetFootprint: tri })]));
    expect(world.isBlocked(0, 0.0, 0.02)).toBe(true); // inside the triangle
    expect(world.isBlocked(-0.28, 0.28, 0.02)).toBe(false); // empty top-left box corner
    expect(world.isBlocked(0.28, 0.28, 0.02)).toBe(false); // empty top-right box corner
  });

  it("pushes a circle out of the hull and never ends inside it", () => {
    const world = new CollisionWorld(
      BOUNDS,
      compileObstacles([obj("h", "box", [0, 0.08, 0], { assetFootprint: tri, interaction: "blocked" })]),
    );
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      const r = world.resolve(Math.cos(ang) * 0.9, Math.sin(ang) * 0.9, 0, -0.1, 0.1);
      expect(world.isBlocked(r.x, r.z, 0.1)).toBe(false);
    }
  });
});

describe("every interaction type behaves correctly", () => {
  const RADIUS = 0.1;
  // Height 0.18 — below MAX_CLIMB_HEIGHT so "climbable" stays genuinely
  // climbable (taller volumes compile hard + get routed around; climbcap.test).
  const box = (interaction: string) =>
    obj("o", "box", [0, 0.08, 0], { interaction: interaction as never, collision: { halfExtents: [0.25, 0.09, 0.25] } });
  const worldWith = (interaction: string) => new CollisionWorld(BOUNDS, compileObstacles([box(interaction)]));

  it("wall: hard-blocks and blocks line-of-sight", () => {
    const w = worldWith("wall");
    expect(w.hard.length).toBe(1);
    expect(w.isBlocked(0, 0, RADIUS)).toBe(true);
    expect(w.losClear(-0.9, 0, 0.9, 0, RADIUS)).toBe(false);
  });

  it("blocked: hard-blocks (route around)", () => {
    const w = worldWith("blocked");
    expect(w.hard.length).toBe(1);
    expect(w.isBlocked(0, 0, RADIUS)).toBe(true);
  });

  it("climbable: NOT hard; raises the walk height (climb over)", () => {
    const w = worldWith("climbable");
    expect(w.hard.length).toBe(0);
    expect(w.isBlocked(0, 0, RADIUS)).toBe(false);
    expect(w.climbHeightAt(0, 0, RADIUS)).toBeGreaterThan(BOUNDS.y);
  });

  it("lowObstacle: NOT hard; steps over (low walk-height rise)", () => {
    const w = worldWith("lowObstacle");
    expect(w.hard.length).toBe(0);
    expect(w.climbHeightAt(0, 0, RADIUS)).toBeGreaterThan(BOUNDS.y);
  });

  it("hide: hard (route around for now)", () => {
    const w = worldWith("hide");
    expect(w.hard.length).toBe(1);
    expect(w.isBlocked(0, 0, RADIUS)).toBe(true);
  });

  it("softObstacle: compiles to NO volume (minor overlap tolerated)", () => {
    const w = worldWith("softObstacle");
    expect(w.obstacles.length).toBe(0);
    expect(w.isBlocked(0, 0, RADIUS)).toBe(false);
  });

  it("feederZone: compiles to NO volume (a valid feeding area, not an obstacle)", () => {
    const w = worldWith("feederZone");
    expect(w.obstacles.length).toBe(0);
    expect(w.isBlocked(0, 0, RADIUS)).toBe(false);
  });

  it("changing the interaction type rebuilds hard vs passable", () => {
    expect(worldWith("blocked").hard.length).toBe(1);
    expect(worldWith("climbable").hard.length).toBe(0); // same box, now crossable
  });
});

describe("multi-part footprint — traces branches, leaves gaps open", () => {
  const parts = [
    { cx: -0.2, cz: 0, hx: 0.1, hz: 0.1 },
    { cx: 0, cz: -0.2, hx: 0.1, hz: 0.1 },
  ];
  const branchy = (extra: Partial<PlacedObject> = {}) =>
    obj("d", "box", [0, 0.08, 0], {
      interaction: "blocked",
      assetFootprint: { half: [0.3, 0.2, 0.3], center: [0, 0.2, 0], shape: "obb", parts },
      ...extra,
    });

  it("compiles a multi-part footprint into ONE OBB per branch", () => {
    const obs = compileObstacles([branchy()]);
    expect(obs.length).toBe(2);
    expect(obs.every((o) => o.shape === "obb")).toBe(true);
  });

  it("blocks the branches but NOT the empty corner between them", () => {
    const world = new CollisionWorld(BOUNDS, compileObstacles([branchy()]));
    expect(world.isBlocked(-0.2, 0, 0.02)).toBe(true); // on a branch
    expect(world.isBlocked(0, -0.2, 0.02)).toBe(true); // on the other branch
    expect(world.isBlocked(0.18, 0.18, 0.02)).toBe(false); // empty far quadrant
    expect(world.isBlocked(0, 0, 0.02)).toBe(false); // empty inner corner
  });

  it("each part follows the object's yaw + position", () => {
    const obs = compileObstacles([
      obj("d", "box", [1, 0.08, 0], {
        interaction: "blocked",
        rotation: [0, Math.PI / 2, 0],
        assetFootprint: { half: [0.3, 0.1, 0.1], center: [0, 0.1, 0], shape: "obb", parts: [{ cx: 0.2, cz: 0, hx: 0.1, hz: 0.05 }] },
      }),
    ]);
    const ob = obs[0] as SolidObstacle & { shape: "obb" };
    // local (0.2,0) rotated +90° about Y → (0,-0.2), + position (1,0).
    expect(ob.cx).toBeCloseTo(1);
    expect(ob.cz).toBeCloseTo(-0.2);
    expect(ob.yaw).toBeCloseTo(Math.PI / 2);
  });
});

describe("compound body probes — no head/body/tail phases through", () => {
  const probes = [
    { forward: 0.15, side: 0, r: 0.04 }, // head
    { forward: 0, side: 0, r: 0.08 }, // chest/centre
    { forward: -0.15, side: 0, r: 0.04 }, // tail
  ];
  const post = () => new CollisionWorld(BOUNDS, [{ shape: "circle", id: "post", cx: 0, cz: 0.2, r: 0.05, top: 0.4 }]);

  it("bodyBlocked catches a head intrusion the centre circle misses", () => {
    const world = post();
    // gecko centre at origin, facing +Z. Centre circle (r0.08) clears the post…
    expect(world.isBlocked(0, 0, 0.08)).toBe(false);
    // …but the head probe reaches z=0.15 (r0.04) and overlaps the post at z=0.2.
    expect(world.bodyBlocked(0, 0, 0, probes)).toBe(true);
  });

  it("resolveBody pushes the whole body clear (no probe left penetrating)", () => {
    const world = post();
    const r = world.resolveBody(0, 0, 0, probes);
    expect(world.bodyBlocked(r.x, r.z, 0, probes)).toBe(false);
    expect(r.z).toBeLessThan(0); // shoved back away from the post ahead
  });

  it("keeps every probe inside the bounds", () => {
    const world = new CollisionWorld(BOUNDS, []);
    // Nose against the +Z wall: resolveBody should pull the body in.
    const r = world.resolveBody(0, BOUNDS.maxZ, 0, probes);
    expect(world.bodyBlocked(r.x, r.z, 0, probes)).toBe(false);
  });
});

describe("swept resolve — no tunnelling through thin obstacles", () => {
  it("a fast move across a thin wall stops on the near side", () => {
    const world = new CollisionWorld(BOUNDS, [{ shape: "segment", id: "wall", x1: 0, z1: -0.6, x2: 0, z2: 0.6, r: 0.02, top: 0.4 }]);
    const r = world.resolve(-0.3, 0, 0.3, 0, 0.06); // one big step straight through
    expect(world.isBlocked(r.x, r.z, 0.06)).toBe(false);
    expect(r.x).toBeLessThan(0); // did NOT teleport to the far side
  });
});

describe("hanging / overhead obstacles don't block ground movement", () => {
  const hanging = (y: number) =>
    compileObstacles([
      obj("lamp", "box", [0, y, 0], {
        interaction: "blocked",
        placement: "hanging",
        assetFootprint: { half: [0.15, 0.1, 0.15], center: [0, 0.1, 0], shape: "obb" },
      }),
    ]);

  it("an obstacle above the gecko's head is NOT hard (ground stays clear)", () => {
    const world = new CollisionWorld(BOUNDS, hanging(BOUNDS.y + 0.5));
    expect(world.hard.length).toBe(0);
    expect(world.isBlocked(0, 0, 0.1)).toBe(false);
  });

  it("a low-hanging obstacle in the gecko's height band DOES block", () => {
    const world = new CollisionWorld(BOUNDS, hanging(BOUNDS.y + 0.03));
    expect(world.hard.length).toBe(1);
    expect(world.isBlocked(0, 0, 0.1)).toBe(true);
  });
});

describe("contour footprint — traces the real silhouette (poly obstacle)", () => {
  // A concave L-shaped contour (local XZ, natural size) with the notch at top-right.
  const Lcontour: Vec2[] = [
    [-0.3, -0.3],
    [0.3, -0.3],
    [0.3, -0.1],
    [-0.1, -0.1],
    [-0.1, 0.3],
    [-0.3, 0.3],
  ];
  const withContour = (extra: Partial<PlacedObject> = {}): PlacedObject =>
    obj("c", "box", [0, 0.08, 0], {
      interaction: "blocked",
      assetFootprint: { half: [0.3, 0.15, 0.3], center: [0, 0.15, 0], shape: "obb", contours: [Lcontour] },
      ...extra,
    });

  it("compiles a contour footprint into a poly obstacle (one per loop)", () => {
    const obs = compileObstacles([withContour()]);
    expect(obs.length).toBe(1);
    expect(obs[0].shape).toBe("poly");
    expect(obs[0].top).toBeCloseTo(0.08 + 0.3); // py + center.y + half.y
  });

  it("blocks inside the L arms but NOT the concave notch (a real gap)", () => {
    const world = new CollisionWorld(BOUNDS, compileObstacles([withContour()]));
    expect(world.isBlocked(0.2, -0.2, 0.02)).toBe(true); // horizontal arm
    expect(world.isBlocked(-0.2, 0.2, 0.02)).toBe(true); // vertical arm
    expect(world.isBlocked(0.2, 0.2, 0.02)).toBe(false); // the notch — must stay open
  });

  it("transforms contour points by scale + yaw + position", () => {
    const obs = compileObstacles([withContour({ position: [1, 0.08, 0], scale: [2, 1, 2] })]) as (SolidObstacle & {
      shape: "poly";
      pts: { x: number; z: number }[];
    })[];
    expect(obs[0].shape).toBe("poly");
    // first point (-0.3,-0.3) * scale(2) + position(1,0) = (0.4, -0.6).
    expect(obs[0].pts[0].x).toBeCloseTo(0.4);
    expect(obs[0].pts[0].z).toBeCloseTo(-0.6);
  });

  it("uses contours in PRECEDENCE over hull/parts (single source of truth)", () => {
    const obs = compileObstacles([
      obj("c", "box", [0, 0.08, 0], {
        assetFootprint: {
          half: [0.3, 0.1, 0.3],
          center: [0, 0.1, 0],
          shape: "obb",
          hull: [
            [-0.3, -0.3],
            [0.3, -0.3],
            [0.3, 0.3],
            [-0.3, 0.3],
          ],
          contours: [Lcontour],
        },
      }),
    ]);
    expect(obs[0].shape).toBe("poly"); // not "hull"
  });

  it("pushes a circle out of the concave contour and never ends inside", () => {
    const world = new CollisionWorld(BOUNDS, compileObstacles([withContour()]));
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const r = world.resolve(Math.cos(ang) * 0.9, Math.sin(ang) * 0.9, 0.2, -0.2, 0.08);
      expect(world.isBlocked(r.x, r.z, 0.08)).toBe(false);
    }
  });

  it("two contour loops (branches) block both, gap between stays open", () => {
    const sq = (cx: number): Vec2[] => [
      [cx - 0.1, -0.1],
      [cx + 0.1, -0.1],
      [cx + 0.1, 0.1],
      [cx - 0.1, 0.1],
    ];
    const obs = compileObstacles([
      obj("c", "box", [0, 0.08, 0], {
        interaction: "blocked",
        assetFootprint: { half: [0.5, 0.1, 0.1], center: [0, 0.1, 0], shape: "obb", contours: [sq(-0.3), sq(0.3)] },
      }),
    ]);
    expect(obs.length).toBe(2);
    const world = new CollisionWorld(BOUNDS, obs);
    expect(world.isBlocked(-0.3, 0, 0.02)).toBe(true); // left branch
    expect(world.isBlocked(0.3, 0, 0.02)).toBe(true); // right branch
    expect(world.isBlocked(0, 0, 0.02)).toBe(false); // gap between
  });

  it("a body probe uses the exact contour (no phasing into a branch gap or arm)", () => {
    const world = new CollisionWorld(BOUNDS, compileObstacles([withContour()]));
    const probes = [
      { forward: 0.12, side: 0, r: 0.03 },
      { forward: 0, side: 0, r: 0.05 },
      { forward: -0.12, side: 0, r: 0.03 },
    ];
    // Body in the notch facing −Z (yaw π): chest is in the empty notch but the head
    // probe (forward 0.12) pokes into the SOLID horizontal arm at z≈−0.12.
    expect(world.isBlocked(0.05, 0.0, 0.05)).toBe(false); // centre clears
    expect(world.bodyBlocked(0.05, 0.0, Math.PI, probes)).toBe(true); // head in the arm
    const r = world.resolveBody(0.05, 0.0, Math.PI, probes);
    expect(world.bodyBlocked(r.x, r.z, Math.PI, probes)).toBe(false);
  });
});

describe("compileObstacles + randomFreeTarget", () => {
  it("finds a clear target in a populated layout", () => {
    const obstacles = compileObstacles([
      obj("r1", "sphere", [-0.5, 0, 0.2], { collision: { radius: 0.28 } }),
      obj("h1", "box", [0.5, 0, -0.2], { collision: { halfExtents: [0.35, 0.2, 0.25] } }),
    ]);
    const world = new CollisionWorld(BOUNDS, obstacles);
    const t = world.randomFreeTarget(0.1, seededRng(7));
    expect(t).not.toBeNull();
    expect(world.isFree(t!.x, t!.z, 0.1)).toBe(true);
  });
});

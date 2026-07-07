/**
 * MAX-CLIMB CAP + HIDE BODY-FIT — the gecko never PLANS onto a climbable prop
 * that is too tall to mantle gracefully (it routes around instead — no giant-
 * climb animation glitches), and it never tries to enter a hide its whole body
 * can't fit inside (no half-in / half-out geckos).
 */
import { describe, it, expect } from "vitest";
import type { GroundBounds } from "../src/habitats/HabitatBounds";
import { CollisionWorld, MAX_CLIMB_HEIGHT, compileObstacles } from "../src/habitats/HabitatCollision";
import type { PlacedObject } from "../src/habitats/HabitatTypes";
import { GECKO_HIDE_FIT, hideAnchor } from "../src/habitats/lizard/LizardController";
import { GECKO_MOVEMENT, GeckoMovementController } from "../src/habitats/lizard/GeckoMovementController";

const BOUNDS: GroundBounds = { minX: -1.4, maxX: 1.4, minZ: -1, maxZ: 1, y: 0.08 };

function climbBox(height: number, halfXZ = 0.18): PlacedObject {
  // Box volumes compile base-at-origin: top = position.y + halfExtents[1] × 2.
  return {
    id: "climb",
    category: "branch",
    position: [0, BOUNDS.y, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    collidable: true,
    collisionType: "box",
    interaction: "climbable",
    collision: { halfExtents: [halfXZ, height / 2, halfXZ] },
  };
}

function seededRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

describe("max-climb cap (route around, don't attempt)", () => {
  it("a LOW climbable stays crossable; a TALL one is excluded from free space", () => {
    const low = new CollisionWorld(BOUNDS, compileObstacles([climbBox(MAX_CLIMB_HEIGHT * 0.7)]));
    const tall = new CollisionWorld(BOUNDS, compileObstacles([climbBox(MAX_CLIMB_HEIGHT * 2)]));
    expect(low.isFree(0, 0, 0.06)).toBe(true);
    expect(tall.isFree(0, 0, 0.06)).toBe(false);
  });

  it("the walk line refuses to cross a too-tall climbable (planner must detour)", () => {
    const tall = new CollisionWorld(BOUNDS, compileObstacles([climbBox(MAX_CLIMB_HEIGHT * 2)]));
    expect(tall.losClear(-0.6, 0, 0.6, 0, 0.06)).toBe(false);
    const low = new CollisionWorld(BOUNDS, compileObstacles([climbBox(MAX_CLIMB_HEIGHT * 0.7)]));
    expect(low.losClear(-0.6, 0, 0.6, 0, 0.06)).toBe(true);
  });

  it("the brain still REACHES food behind a tall climbable — by routing around it", () => {
    const tall = new CollisionWorld(BOUNDS, compileObstacles([climbBox(MAX_CLIMB_HEIGHT * 2, 0.22)]));
    const brain = new GeckoMovementController(tall, GECKO_MOVEMENT, seededRng(4), { x: -0.9, z: 0 });
    let ate: number | null = null;
    for (let i = 0; i < 3600 && ate == null; i++) {
      ate = brain.update(1 / 60, [{ id: 7, x: 0.9, z: 0 }]).ateFeederId;
    }
    expect(ate).toBe(7);
    // …and it never stood ON the tall prop while doing it.
    expect(brain.climbHeight).toBeLessThan(MAX_CLIMB_HEIGHT);
  });

  it("hard blockers are unaffected (still blocked, still not climbed)", () => {
    const rock: PlacedObject = { ...climbBox(0.3), interaction: "blocked" };
    const w = new CollisionWorld(BOUNDS, compileObstacles([rock]));
    expect(w.isFree(0, 0, 0.06)).toBe(false);
  });
});

describe("the ANIMAL is collidable all over (probes + feet)", () => {
  it("covers every section: snout, neck, BOTH front legs, chest, hips, BOTH rear legs, tail ×2", () => {
    const w = new CollisionWorld(BOUNDS, compileObstacles([]));
    const g = new GeckoMovementController(w, GECKO_MOVEMENT, seededRng(2), { x: 0, z: 0 });
    const probes = g.bodyProbes;
    expect(probes.length).toBeGreaterThanOrEqual(10);
    // Legs: probes on BOTH sides of the body, front and rear.
    expect(probes.some((p) => p.side < -0.03 && p.forward > 0.03)).toBe(true); // front-left
    expect(probes.some((p) => p.side > 0.03 && p.forward > 0.03)).toBe(true); // front-right
    expect(probes.some((p) => p.side < -0.03 && p.forward < -0.03)).toBe(true); // rear-left
    expect(probes.some((p) => p.side > 0.03 && p.forward < -0.03)).toBe(true); // rear-right
  });

  it("no PLANTED paw ever sits inside hard decor across a long roam", () => {
    const rock: PlacedObject = {
      id: "rock",
      category: "rock",
      position: [0.2, BOUNDS.y, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      collidable: true,
      collisionType: "box",
      interaction: "blocked",
      collision: { halfExtents: [0.2, 0.12, 0.16] },
    };
    const w = new CollisionWorld(BOUNDS, compileObstacles([rock]));
    const g = new GeckoMovementController(w, GECKO_MOVEMENT, seededRng(9), { x: -0.9, z: 0 });
    for (let i = 0; i < 4000; i++) {
      g.update(1 / 60, []);
      for (const f of g.feet) {
        if (f.state !== "planted") continue;
        expect(w.isBlocked(f.x, f.z, 0.002)).toBe(false);
      }
    }
  });
});

describe("hide body-fit (whole gecko inside or don't try)", () => {
  /** A dome hide as a poly ring with an opening — approximated by two wall boxes
   *  leaving a pocket of width `pocket` between them. */
  function pocketWorld(pocket: number): { world: CollisionWorld; hide: PlacedObject } {
    const wall = (x: number): PlacedObject => ({
      id: `wall${x}`,
      category: "hide",
      position: [x, BOUNDS.y, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      collidable: true,
      collisionType: "box",
      interaction: "hide",
      collision: { halfExtents: [0.05, 0.1, 0.3] },
    });
    const hide: PlacedObject = {
      id: "hide",
      category: "hide",
      position: [0, BOUNDS.y, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      collidable: false,
      collisionType: "none",
      interaction: "hide",
    };
    const half = pocket / 2 + 0.05;
    const world = new CollisionWorld(BOUNDS, compileObstacles([wall(-half), wall(half)]));
    return { world, hide };
  }

  it("a roomy pocket yields an anchor; a too-tight pocket yields NONE (gecko won't try)", () => {
    const roomy = pocketWorld(GECKO_HIDE_FIT * 2.4);
    expect(hideAnchor(roomy.world, roomy.hide, GECKO_HIDE_FIT)).not.toBeNull();
    const tight = pocketWorld(GECKO_HIDE_FIT * 1.2);
    expect(hideAnchor(tight.world, tight.hide, GECKO_HIDE_FIT)).toBeNull();
  });

  it("GECKO_HIDE_FIT covers at least the walk circle (enclosure keeps anchors inside)", () => {
    expect(GECKO_HIDE_FIT).toBeGreaterThanOrEqual(GECKO_MOVEMENT.bodyRadius);
  });
});

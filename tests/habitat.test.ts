import { describe, it, expect } from "vitest";
import { makeLizardHabitatLayout, makeLizardHabitatState } from "../src/habitats/lizard/LizardHabitatData";
import { walkBounds } from "../src/habitats/HabitatLayout";
import { CollisionWorld, compileObstacles } from "../src/habitats/HabitatCollision";
import type { GroundBounds } from "../src/habitats/HabitatBounds";
import type { PlacedObject, ObstacleInteraction } from "../src/habitats/HabitatTypes";
import { computeScores, ratingFor } from "../src/habitats/HabitatStats";
import { GeckoMovementController, GECKO_MOVEMENT, type HuntTarget } from "../src/habitats/lizard/GeckoMovementController";
import { updateNeeds, feedAnimal } from "../src/habitats/lizard/LizardNeedsSystem";
import {
  spawnFeeders,
  consumeFeeder,
  canFeed,
  nearestFeeder,
} from "../src/habitats/lizard/LizardFeedingSystem";
import { checkCompatibility } from "../src/habitats/HabitatCompatibility";
import { careProfile } from "../src/habitats/HabitatSpecies";

/** A small test enclosure with one wall between the gecko and its food. */
function wallWorld(interaction: ObstacleInteraction, halfDepth: number): CollisionWorld {
  const bounds: GroundBounds = { minX: -1.4, maxX: 1.4, minZ: -1, maxZ: 1, y: 0.08 };
  const wall: PlacedObject = {
    id: "wall",
    category: "rock",
    position: [0, 0.08, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    collidable: true,
    collisionType: "box",
    interaction,
    collision: { halfExtents: [0.14, 0.1, halfDepth] },
  };
  return new CollisionWorld(bounds, compileObstacles([wall]));
}

/** Drive the brain toward a fixed feeder; returns {ate, unreachable} after N frames. */
function huntFixedFeeder(world: CollisionWorld, feeder: HuntTarget, frames: number, startX = -1.1) {
  const brain = new GeckoMovementController(world, GECKO_MOVEMENT, seededRng(9), { x: startX, z: 0 });
  let ate: number | null = null;
  for (let i = 0; i < frames && ate == null; i++) {
    ate = brain.update(1 / 60, [feeder]).ateFeederId;
  }
  return { ate, unreachable: brain.foodUnreachable, brain };
}

function seededRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const worldFor = () => {
  const layout = makeLizardHabitatLayout();
  return { layout, world: CollisionWorld.fromLayout(layout, walkBounds(layout, 0.9, 0.98)) };
};

describe("lizard habitat scoring", () => {
  it("the authored terrarium scores well and rates highly", () => {
    const sc = computeScores(makeLizardHabitatLayout());
    expect(sc.overall).toBeGreaterThan(80);
    expect(sc.hidingSpots).toBeGreaterThan(80);
    expect(["Good", "Excellent"]).toContain(ratingFor(sc.overall));
  });
});

describe("needs system", () => {
  it("hunger drains over time and feeding restores it", () => {
    const st = makeLizardHabitatState();
    const g = st.animals[0];
    const profile = careProfile("leopard_gecko")!;
    const sc = computeScores(st.layout);
    const before = g.needs.hunger;
    for (let i = 0; i < 60; i++) updateNeeds(st, g, { scores: sc, profile }, 1);
    expect(g.needs.hunger).toBeLessThan(before);
    const low = g.needs.hunger;
    feedAnimal(g, 20);
    expect(g.needs.hunger).toBeGreaterThan(low);
  });

  it("a meal keeps the gecko satisfied for a play session, not minutes (HUD accuracy)", () => {
    const st = makeLizardHabitatState();
    const g = st.animals[0];
    const profile = careProfile("leopard_gecko")!;
    const sc = computeScores(st.layout);
    g.needs.hunger = 100; // just ate well
    // 20 sim-minutes later the Hunger stat should still read "Fed", not "Hungry"…
    for (let i = 0; i < 1200; i++) updateNeeds(st, g, { scores: sc, profile }, 1);
    expect(g.needs.hunger).toBeGreaterThan(55);
    // …while still visibly draining (the loop stays observable).
    expect(g.needs.hunger).toBeLessThan(95);
  });
});

describe("feeding prototype", () => {
  it("spawns feeders, sets a cooldown, and eating restores hunger + removes the feeder", () => {
    const st = makeLizardHabitatState();
    const { world } = worldFor();
    const n = spawnFeeders(st, world, seededRng(3));
    expect(n).toBeGreaterThanOrEqual(1);
    expect(canFeed(st)).toBe(false); // cooldown now active

    const g = st.animals[0];
    g.needs.hunger = 40;
    const f = nearestFeeder(st, 0, 0)!;
    consumeFeeder(st, f.id, g);
    expect(g.needs.hunger).toBeGreaterThan(40);
    expect(st.feeders.find((x) => x.id === f.id)).toBeUndefined();
  });
});

describe("feeding at the glass (bounds match the visible tank)", () => {
  const openWorld = () => {
    const bounds: GroundBounds = { minX: -1.4, maxX: 1.4, minZ: -1, maxZ: 1, y: 0.08 };
    return new CollisionWorld(bounds, []);
  };

  it("canReach accepts food the SNOUT can reach even where the body can't stand", () => {
    const world = openWorld();
    const brain = new GeckoMovementController(world, GECKO_MOVEMENT, seededRng(3), { x: 0, z: 0 });
    // 4 cm off the glass — inside the body-radius band, but well within eat range
    // of the nearest standable spot.
    expect(brain.canReach(1.36, 0.5)).toBe(true);
    // Still refuses points actually outside the enclosure.
    expect(brain.canReach(1.6, 0.5)).toBe(false);
  });

  it("hunts down and EATS a cricket dropped against the glass", () => {
    const world = openWorld();
    const { ate, unreachable } = huntFixedFeeder(world, { id: 5, x: 1.36, z: 0.5 }, 6000, -0.5);
    expect(unreachable).toBe(false);
    expect(ate).toBe(5);
  });
});

describe("compatibility foundation", () => {
  it("classifies the brief's pairings", () => {
    expect(checkCompatibility("leopard_gecko", "cricket").verdict).toBe("food");
    expect(checkCompatibility("leopard_gecko", "leopard_gecko").verdict).toBe("caution");
    expect(checkCompatibility("leopard_gecko", "tarantula").verdict).toBe("danger");
    expect(checkCompatibility("leopard_gecko", "isopods").verdict).toBe("safe");
    expect(checkCompatibility("leopard_gecko", "crested_gecko").verdict).toBe("danger");
  });
});

describe("gecko movement in the real terrarium", () => {
  it("never leaves bounds or enters an obstacle over many steps", () => {
    const { world } = worldFor();
    const b = world.bounds;
    const radius = GECKO_MOVEMENT.bodyRadius;
    const brain = new GeckoMovementController(world, GECKO_MOVEMENT, seededRng(11));
    for (let i = 0; i < 3000; i++) {
      brain.update(1 / 60, []);
      const p = brain.position;
      expect(world.isBlocked(p.x, p.z, radius)).toBe(false);
      expect(p.x).toBeGreaterThanOrEqual(b.minX - 1e-6);
      expect(p.x).toBeLessThanOrEqual(b.maxX + 1e-6);
      expect(p.z).toBeGreaterThanOrEqual(b.minZ - 1e-6);
      expect(p.z).toBeLessThanOrEqual(b.maxZ + 1e-6);
    }
  });

  // "No VISIBLE phasing": the whole silhouette (snout → tail) stays out of hard
  // decor. The centre is hard-guaranteed clear; the extremities may leave at most a
  // sub-centimetre residual in the tightest wedge (imperceptible on screen).
  const NO_PHASE = 0.01; // 1 cm

  it("no body part (head/torso/tail) visibly phases through decor while roaming", () => {
    const { world } = worldFor();
    const brain = new GeckoMovementController(world, GECKO_MOVEMENT, seededRng(11));
    for (let i = 0; i < 5000; i++) {
      brain.update(1 / 60, []);
      const p = brain.position;
      expect(world.bodyPenetration(p.x, p.z, brain.heading, brain.bodyProbes)).toBeLessThan(NO_PHASE);
    }
  });

  it("keeps the whole body clear even while hunting across the layout", () => {
    for (const seed of [5, 7]) {
      const { world } = worldFor();
      const brain = new GeckoMovementController(world, GECKO_MOVEMENT, seededRng(seed));
      const feeder = { id: 7, x: 0.1, z: 0.35 };
      for (let i = 0; i < 6000; i++) {
        brain.update(1 / 60, [feeder]);
        const p = brain.position;
        expect(world.bodyPenetration(p.x, p.z, brain.heading, brain.bodyProbes)).toBeLessThan(NO_PHASE);
      }
    }
  });

  it("hunts and eats a feeder placed at its feet", () => {
    const { world } = worldFor();
    const brain = new GeckoMovementController(world, GECKO_MOVEMENT, seededRng(5));
    const start = brain.position;
    const feeder = { id: 99, x: start.x, z: start.z };
    let ate: number | null = null;
    for (let i = 0; i < 600 && ate == null; i++) {
      ate = brain.update(1 / 60, [feeder]).ateFeederId;
    }
    expect(ate).toBe(99);
  });

  it("routes across the terrarium to eat a cricket in the feeding zone", () => {
    // A cricket at the authored feeding-zone centre — the gecko must traverse the
    // real Sunstone Desert layout (around/over the driftwood) to reach it.
    for (const seed of [3, 7, 15]) {
      const { world } = worldFor();
      const brain = new GeckoMovementController(world, GECKO_MOVEMENT, seededRng(seed));
      const feeder = { id: 7, x: 0.1, z: 0.35 };
      let ate: number | null = null;
      for (let i = 0; i < 8000 && ate == null; i++) ate = brain.update(1 / 60, [feeder]).ateFeederId;
      expect(ate).toBe(7);
    }
  });
});

describe("smart navigation — routing, climbing, giving up", () => {
  it("CLIMBS over a climbable wall to reach food on the far side", () => {
    const world = wallWorld("climbable", 0.85); // spans most of the depth, but climbable
    const { ate } = huntFixedFeeder(world, { id: 1, x: 1.1, z: 0 }, 4000);
    expect(ate).toBe(1);
  });

  it("ROUTES AROUND a blocked wall (with gaps) to reach food behind it", () => {
    const world = wallWorld("blocked", 0.5); // gaps top & bottom ⇒ a route exists
    const { ate } = huntFixedFeeder(world, { id: 2, x: 1.1, z: 0 }, 5000);
    expect(ate).toBe(2);
  });

  it("does NOT get permanently stuck: gives up + flags unreachable food it cannot reach", () => {
    const world = wallWorld("blocked", 1.0); // sealed full-depth wall ⇒ no route
    const { ate, unreachable } = huntFixedFeeder(world, { id: 3, x: 1.15, z: 0 }, 1500);
    expect(ate).toBeNull(); // never reaches it
    expect(unreachable).toBe(true); // and it knows the food is unreachable
  });

  it("never leaves bounds while hunting an unreachable feeder", () => {
    const world = wallWorld("blocked", 1.0);
    const b = world.bounds;
    const r = GECKO_MOVEMENT.bodyRadius;
    const brain = new GeckoMovementController(world, GECKO_MOVEMENT, seededRng(4), { x: -1.1, z: 0 });
    const feeder = { id: 5, x: 1.15, z: 0 };
    for (let i = 0; i < 1500; i++) {
      brain.update(1 / 60, [feeder]);
      const p = brain.position;
      expect(world.isBlocked(p.x, p.z, r)).toBe(false);
      expect(p.x).toBeGreaterThanOrEqual(b.minX - 1e-6);
      expect(p.x).toBeLessThanOrEqual(b.maxX + 1e-6);
    }
  });
});

describe("live editing — brain.setWorld rebuilds navigation + frees a trapped gecko", () => {
  const openBounds: GroundBounds = { minX: -1.4, maxX: 1.4, minZ: -1, maxZ: 1, y: 0.08 };

  it("re-routes/blocks after the world changes (a new wall seals the far side)", () => {
    const open = new CollisionWorld(openBounds, []);
    const brain = new GeckoMovementController(open, GECKO_MOVEMENT, seededRng(1), { x: -1.1, z: 0 });
    expect(brain.canReach(1.1, 0)).toBe(true); // straight shot in the open world
    brain.setWorld(wallWorld("blocked", 1.0)); // a full-depth wall now seals the gap
    expect(brain.canReach(1.1, 0)).toBe(false); // path rebuilt → now unreachable
  });

  it("unsticks the gecko when the new layout drops a prop where it stands", () => {
    const open = new CollisionWorld(openBounds, []);
    const brain = new GeckoMovementController(open, GECKO_MOVEMENT, seededRng(2), { x: 0, z: 0 });
    const trap: PlacedObject = {
      id: "rock",
      category: "rock",
      position: [0, 0.08, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      collidable: true,
      collisionType: "sphere",
      interaction: "blocked",
      collision: { radius: 0.4 },
    };
    const trapped = new CollisionWorld(openBounds, compileObstacles([trap]));
    brain.setWorld(trapped);
    const p = brain.position;
    expect(trapped.isBlocked(p.x, p.z, GECKO_MOVEMENT.bodyRadius)).toBe(false);
    expect(trapped.isFree(p.x, p.z, GECKO_MOVEMENT.bodyRadius)).toBe(true);
  });
});

describe("reachable feeder spawning", () => {
  it("prefers spawn points the gecko can reach when a reach test is supplied", () => {
    const st = makeLizardHabitatState();
    st.layout.zones = [{ id: "feeding", kind: "feeding", center: [0, 0.08, 0], radius: 0.5 }];
    const world = new CollisionWorld({ minX: -1, maxX: 1, minZ: -1, maxZ: 1, y: 0.08 }, []);
    // Pretend only the left half of the enclosure is reachable.
    const reach = (x: number) => x < 0;
    const n = spawnFeeders(st, world, seededRng(2), undefined, reach);
    expect(n).toBeGreaterThanOrEqual(1);
    for (const f of st.feeders) expect(f.position[0]).toBeLessThan(0);
  });
});

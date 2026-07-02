/**
 * DISH FEEDING — capacity scales with the dish's real size, served insects are
 * CONTAINED by the smooth stone walls (worms + roaches can't climb out — true to
 * life), and crickets occasionally JUMP out (more when the gecko looms). The
 * "how do insects not leave the dish?" answer: the dish physically contains
 * crawlers; only jumpers escape, and that's a feature, not a bug.
 */
import { describe, it, expect } from "vitest";
import { makeLizardHabitatState } from "../src/habitats/lizard/LizardHabitatData";
import { walkBounds } from "../src/habitats/HabitatLayout";
import { CollisionWorld, compileObstacles } from "../src/habitats/HabitatCollision";
import { buildHeightField, clearHeightFields, registerHeightField } from "../src/habitats/HabitatFootprint";
import {
  MAX_LIVE_FEEDERS,
  dishCapacity,
  dishInterior,
  findFoodDish,
  logFeeding,
  serveMeal,
  updateFeeders,
} from "../src/habitats/lizard/LizardFeedingSystem";
import type { HabitatState, PlacedObject, Vec3 } from "../src/habitats/HabitatTypes";

function seededRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function setup(): { st: HabitatState; world: CollisionWorld; dish: PlacedObject } {
  const st = makeLizardHabitatState();
  const world = CollisionWorld.fromLayout(st.layout, walkBounds(st.layout, 1, 1));
  // findFoodDish must pick the FOOD dish (id "feeding_dish"), never the water dish.
  const dish = findFoodDish(st.layout)!;
  expect(dish.defId).toBe("dish_food");
  return { st, world, dish };
}

describe("dish capacity scales with real dish size", () => {
  it("bigger dish (or scaled-up dish) holds more insects; tiny dishes hold a couple", () => {
    expect(dishCapacity(0.03)).toBeGreaterThanOrEqual(2);
    expect(dishCapacity(0.08)).toBeGreaterThan(dishCapacity(0.05));
    expect(dishCapacity(0.16)).toBeGreaterThan(dishCapacity(0.08));
    expect(dishCapacity(0.5)).toBeLessThanOrEqual(24); // sane cap
  });

  it("dishInterior follows the object's scale", () => {
    const { dish } = setup();
    const base = dishInterior(dish).r;
    dish.scale = [2, 2, 2];
    expect(dishInterior(dish).r).toBeCloseTo(base * 2, 5);
  });
});

describe("serving a meal in the dish", () => {
  it("places contained, dusted insects INSIDE the dish interior", () => {
    const { st, world, dish } = setup();
    const res = serveMeal(st, world, "mealworm", 4, "dish", "calcium_d3", { dish, rng: seededRng(2) });
    expect(res.placed).toBe(4);
    const din = dishInterior(dish);
    const contained = st.feeders.filter((f) => f.containedBy === dish.id);
    expect(contained.length).toBe(4);
    for (const f of contained) {
      expect(Math.hypot(f.position[0] - din.x, f.position[2] - din.z)).toBeLessThanOrEqual(din.r + 1e-6);
      expect(f.dusted).toBe("calcium_d3");
    }
  });

  it("caps the serving at the dish's capacity and reports the honest reason", () => {
    const { st, world, dish } = setup();
    const cap = dishCapacity(dishInterior(dish).r);
    const res = serveMeal(st, world, "mealworm", cap + 6, "dish", "none", { dish, rng: seededRng(3) });
    expect(res.placed).toBe(cap);
    expect(res.reason).toMatch(/full/i);
    // A second serving into the full dish places nothing.
    const res2 = serveMeal(st, world, "mealworm", 2, "dish", "none", { dish, rng: seededRng(4) });
    expect(res2.placed).toBe(0);
  });
});

describe("dish containment (smooth stone walls)", () => {
  it("worms can NEVER leave the dish — 2 sim-minutes and they're all still inside", () => {
    const { st, world, dish } = setup();
    serveMeal(st, world, "mealworm", 4, "dish", "none", { dish, rng: seededRng(5) });
    const din = dishInterior(dish);
    const rng = seededRng(6);
    for (let i = 0; i < 1200; i++) updateFeeders(st, world, 0.1, undefined, { rng, gecko: { x: din.x + 0.2, z: din.z } });
    const still = st.feeders.filter((f) => f.containedBy === dish.id);
    expect(still.length).toBe(4);
    for (const f of still) {
      expect(Math.hypot(f.position[0] - din.x, f.position[2] - din.z)).toBeLessThanOrEqual(din.r + 1e-6);
    }
  });

  it("a cricket eventually JUMPS OUT — and much sooner when the gecko looms over the dish", () => {
    const { st, world, dish } = setup();
    serveMeal(st, world, "cricket", 3, "dish", "none", { dish, rng: seededRng(7) });
    const din = dishInterior(dish);
    const rng = seededRng(8);
    let firstEscape = Infinity;
    for (let i = 0; i < 1800; i++) {
      updateFeeders(st, world, 0.1, undefined, { rng, gecko: { x: din.x + 0.15, z: din.z } });
      const out = st.feeders.filter((f) => f.alive && !f.containedBy);
      if (out.length > 0) {
        firstEscape = Math.min(firstEscape, i * 0.1);
        break;
      }
    }
    expect(firstEscape).toBeLessThan(120); // a looming gecko panics a jumper out well within 2 min
    // The escapee landed OUTSIDE the dish and is now scared.
    const escapee = st.feeders.find((f) => f.alive && !f.containedBy)!;
    expect(Math.hypot(escapee.position[0] - din.x, escapee.position[2] - din.z)).toBeGreaterThan(din.r);
    expect(escapee.mood).toBe("flee");
  });

  it("deleting the dish frees its insects instead of stranding them", () => {
    const { st, world, dish } = setup();
    serveMeal(st, world, "dubia_roach", 3, "dish", "none", { dish, rng: seededRng(9) });
    st.layout.objects = st.layout.objects.filter((o) => o.id !== dish.id);
    updateFeeders(st, world, 0.1, undefined, { rng: seededRng(10) });
    expect(st.feeders.every((f) => !f.containedBy)).toBe(true);
  });
});

describe("insects sit ON the dish's real bowl floor", () => {
  function bowlQuad(x0: number, z0: number, x1: number, z1: number, y: number): Vec3[][] {
    const a: Vec3 = [x0, y, z0];
    const b: Vec3 = [x1, y, z0];
    const c: Vec3 = [x1, y, z1];
    const d: Vec3 = [x0, y, z1];
    return [
      [a, b, c],
      [a, c, d],
    ];
  }
  /** A stone dish: raised interior floor at 0.05, rim ring at 0.12. */
  const bowlTris = (): Vec3[][] => [
    ...bowlQuad(-0.1, -0.1, 0.1, 0.1, 0.05), // interior bowl floor
    ...bowlQuad(-0.14, -0.14, 0.14, -0.1, 0.12), // rim strips
    ...bowlQuad(-0.14, 0.1, 0.14, 0.14, 0.12),
    ...bowlQuad(-0.14, -0.1, -0.1, 0.1, 0.12),
    ...bowlQuad(0.1, -0.1, 0.14, 0.1, 0.12),
  ];

  it("contained feeders rest at the measured bowl-floor height — not sunk to the sand, not floating at the rim", () => {
    clearHeightFields();
    registerHeightField("test://bowl.glb", buildHeightField(bowlTris(), 96)!);
    const bounds = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, y: 0 };
    const dish: PlacedObject = {
      id: "feeding_dish",
      defId: "dish_food",
      asset: "test://bowl.glb",
      category: "dish",
      interaction: "blocked", // the no-step rule — dishes are hard
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      collidable: true,
      collisionType: "meshApprox",
      assetFootprint: { half: [0.14, 0.06, 0.14], center: [0, 0.06, 0], shape: "circle" },
    };
    const world = new CollisionWorld(bounds, compileObstacles([dish]));
    const st = makeLizardHabitatState();
    st.layout.objects = [dish];
    st.feeders = [];
    serveMeal(st, world, "mealworm", 4, "dish", "none", { dish, rng: seededRng(21) });
    const contained = st.feeders.filter((f) => f.containedBy === dish.id);
    expect(contained.length).toBe(4);
    for (const f of contained) {
      expect(f.position[1]).toBeGreaterThan(0.03); // ABOVE the sand — on the bowl floor
      expect(f.position[1]).toBeLessThan(0.1); // BELOW the rim — inside the bowl
    }
    // …and they stay on the floor while milling around.
    const rng = seededRng(22);
    for (let i = 0; i < 300; i++) updateFeeders(st, world, 0.1, undefined, { rng });
    for (const f of st.feeders.filter((x) => x.containedBy === dish.id)) {
      expect(f.position[1]).toBeGreaterThan(0.03);
      expect(f.position[1]).toBeLessThan(0.1);
    }
    clearHeightFields();
  });
});

describe("a hungry gecko WALKS TO the dish and eats over the rim", () => {
  it("deliberately crosses the tank to a feeder penned inside the hard no-step dish", async () => {
    const { GeckoMovementController, GECKO_MOVEMENT } = await import("../src/habitats/lizard/GeckoMovementController");
    const bounds = { minX: -1.4, maxX: 1.4, minZ: -1, maxZ: 1, y: 0.08 };
    const dish: PlacedObject = {
      id: "feeding_dish",
      defId: "dish_food",
      category: "dish",
      interaction: "blocked", // no-step
      position: [0.4, bounds.y, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      collidable: true,
      collisionType: "sphere",
      collision: { radius: 0.08 },
    };
    const world = new CollisionWorld(bounds, compileObstacles([dish]));
    const g = new GeckoMovementController(world, GECKO_MOVEMENT, seededRng(31), { x: -0.9, z: 0 });
    // A mealworm INSIDE the dish (off-centre, as served) — the gecko can't stand
    // there, but a rim stance puts it in snout range.
    const prey = { id: 9, x: 0.36, z: 0.03 };
    let ate: number | null = null;
    for (let i = 0; i < 6000 && ate == null; i++) {
      ate = g.update(1 / 60, [prey]).ateFeederId;
    }
    expect(ate).toBe(9);
    // It ate from OUTSIDE the dish (never stood inside the no-step zone).
    expect(world.isBlocked(g.position.x, g.position.z, 0.01)).toBe(false);
  });
});

describe("quick scatter + the feeding log", () => {
  it("quick-serves free feeders near the point, all dusted, respecting the loose cap", () => {
    const { st, world } = setup();
    const res = serveMeal(st, world, "cricket", 5, "quick", "calcium", { at: { x: 0.1, z: 0.35 }, rng: seededRng(11) });
    expect(res.placed).toBe(5);
    const loose = st.feeders.filter((f) => !f.containedBy);
    expect(loose.length).toBe(5);
    for (const f of loose) {
      expect(f.dusted).toBe("calcium");
      expect(Math.hypot(f.position[0] - 0.1, f.position[2] - 0.35)).toBeLessThan(0.5);
    }
    // The loose cap is honest — a huge second scatter can't flood the tank.
    const res2 = serveMeal(st, world, "cricket", 99, "quick", "none", { at: { x: 0.1, z: 0.35 }, rng: seededRng(12) });
    expect(res2.placed).toBeLessThanOrEqual(MAX_LIVE_FEEDERS - 5);
    expect(res2.reason).toBeTruthy();
  });

  it("servings are recorded in the feeding log (capped)", () => {
    const { st, world, dish } = setup();
    serveMeal(st, world, "mealworm", 3, "dish", "calcium_d3", { dish, rng: seededRng(13) });
    expect(st.feedingLog?.length).toBe(1);
    expect(st.feedingLog![0]).toMatchObject({ kind: "mealworm", count: 3, method: "dish", supplement: "calcium_d3" });
    for (let i = 0; i < 60; i++) logFeeding(st, "cricket", 1, "quick", "none");
    expect(st.feedingLog!.length).toBeLessThanOrEqual(40);
  });
});

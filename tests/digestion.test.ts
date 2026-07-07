/**
 * DIGESTION + TOILETING — meals fill the digest store, a delay passes, then a
 * toilet trip is due; the gecko owns ONE bathroom corner (the farthest from
 * its hides + dishes — real leopard-gecko behaviour) and droppings are real
 * objects the cleaning tools remove.
 */
import { describe, expect, it } from "vitest";
import {
  LIZARD_DIGESTION,
  addDropping,
  addMealToDigestion,
  cleanDroppingsAt,
  didPoop,
  needsToilet,
  pickToiletCorner,
  tickDigestion,
} from "../src/habitats/lizard/LizardDigestion";
import { consumeFeeder, serveMeal } from "../src/habitats/lizard/LizardFeedingSystem";
import { makeLizardHabitatState } from "../src/habitats/lizard/LizardHabitatData";
import { walkBounds } from "../src/habitats/HabitatLayout";
import { CollisionWorld } from "../src/habitats/HabitatCollision";
import type { HabitatAnimal } from "../src/habitats/HabitatTypes";

function seededRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function gecko(): HabitatAnimal {
  return makeLizardHabitatState().animals[0];
}

describe("digest → delay → toilet due", () => {
  it("meals accumulate, the timer arms at the threshold, and the need fires after the delay", () => {
    const g = gecko();
    const rng = seededRng(3);
    expect(needsToilet(g)).toBe(false);
    addMealToDigestion(g, 12, rng); // one mealworm-ish
    expect(needsToilet(g)).toBe(false);
    addMealToDigestion(g, 14, rng); // threshold crossed → timer armed
    expect(needsToilet(g)).toBe(false); // still digesting
    let due = false;
    for (let i = 0; i < LIZARD_DIGESTION.digestDelay[1] * 10 + 10 && !due; i++) due = tickDigestion(g, 0.1);
    expect(due).toBe(true);
    expect(needsToilet(g)).toBe(true);
    didPoop(g);
    expect(needsToilet(g)).toBe(false);
  });

  it("eating through the REAL feeding system fills the digest store", () => {
    const st = makeLizardHabitatState();
    const world = CollisionWorld.fromLayout(st.layout, walkBounds(st.layout, 1, 1));
    const g = st.animals[0];
    serveMeal(st, world, "cricket", 2, "quick", "none", { at: { x: 0, z: 0.3 }, rng: seededRng(5) });
    for (const f of [...st.feeders]) consumeFeeder(st, f.id, g);
    expect(g.digest ?? 0).toBeGreaterThan(0);
  });
});

describe("the bathroom corner", () => {
  it("picks the corner FARTHEST from the hides + dishes and stays inside the enclosure", () => {
    const bounds = { minX: -1.3, maxX: 1.3, minZ: -0.9, maxZ: 0.9, y: 0.08 };
    // Everything the gecko lives around is clustered in the north-west.
    const avoid = [
      { x: -1.0, z: -0.6 },
      { x: -0.7, z: -0.4 },
      { x: -0.9, z: -0.7 },
    ];
    const c = pickToiletCorner(bounds, avoid, seededRng(7));
    // Farthest corner from the NW cluster = the SOUTH-EAST corner.
    expect(c[0]).toBeCloseTo(bounds.maxX - LIZARD_DIGESTION.cornerInset, 5);
    expect(c[1]).toBeCloseTo(bounds.maxZ - LIZARD_DIGESTION.cornerInset, 5);
  });
});

describe("droppings are real, cleanable objects", () => {
  it("adds with unique ids (capped) and the spot brush removes them by radius", () => {
    let list: ReturnType<typeof addDropping>["list"] = [];
    let id = 1;
    for (let i = 0; i < 15; i++) {
      const r = addDropping(list, id, [i * 0.1, 0.08, 0]);
      list = r.list;
      id = r.nextId;
    }
    expect(list.length).toBeLessThanOrEqual(12); // the oldest weathered away
    const n0 = list.length;
    const target = list[3];
    list = cleanDroppingsAt(list, target.position[0], target.position[2], 0.05);
    expect(list.length).toBe(n0 - 1);
    expect(list.find((d) => d.id === target.id)).toBeUndefined();
  });
});

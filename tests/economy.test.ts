/** The light supplies economy: buy packs, consume on feeding, decor prices. */
import { describe, expect, it } from "vitest";
import {
  SUPPLIES,
  buySupply,
  consumeSupply,
  decorPrice,
  defaultStock,
  stockCount,
  supplyById,
} from "../src/game/economy";

describe("economy / supplies", () => {
  it("catalog ids are unique and cover both habitats", () => {
    const ids = SUPPLIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SUPPLIES.some((s) => s.kind === "insect")).toBe(true);
    expect(SUPPLIES.some((s) => s.kind === "fishfood")).toBe(true);
    // Insect ids must match the lizard feeding system's FOOD_TYPES keys.
    for (const id of ["cricket", "mealworm", "dubia_roach", "superworm", "waxworm"]) {
      expect(supplyById(id)?.kind).toBe("insect");
    }
    for (const id of ["flakes", "pellets", "bloodworms"]) {
      expect(supplyById(id)?.kind).toBe("fishfood");
    }
  });

  it("the starter pantry is friendly (no immediate paywall)", () => {
    const s = defaultStock();
    expect(stockCount(s, "cricket")).toBeGreaterThanOrEqual(6);
    expect(stockCount(s, "flakes")).toBeGreaterThanOrEqual(10);
  });

  it("buySupply adds a pack and reports the spend", () => {
    const s = defaultStock();
    const before = stockCount(s, "cricket");
    const def = supplyById("cricket")!;
    const res = buySupply(s, "cricket", 10_000);
    expect(res.ok).toBe(true);
    expect(res.spent).toBe(def.price);
    expect(stockCount(s, "cricket")).toBe(before + def.pack);
  });

  it("buySupply refuses without enough leaves (and spends nothing)", () => {
    const s = defaultStock();
    const before = stockCount(s, "waxworm");
    const res = buySupply(s, "waxworm", 3);
    expect(res.ok).toBe(false);
    expect(res.spent).toBe(0);
    expect(stockCount(s, "waxworm")).toBe(before);
  });

  it("consumeSupply drains only what exists", () => {
    const s = { cricket: 2 };
    expect(consumeSupply(s, "cricket", 5)).toBe(2); // only 2 available
    expect(stockCount(s, "cricket")).toBe(0);
    expect(consumeSupply(s, "cricket", 1)).toBe(0); // empty stays empty
  });

  it("every catalog decor piece carries a price", () => {
    for (const id of [
      "rock_cluster",
      "rock_boulder",
      "hide_cave",
      "hide_moist",
      "branch_log",
      "climb_branch",
      "plant_succulent",
      "plant_succulent_2",
      "hanging_vine",
      "dish_water",
      "dish_food",
    ]) {
      expect(decorPrice(id)).toBeGreaterThan(0);
    }
    expect(decorPrice("unknown_thing")).toBe(0); // unlisted → free, never NaN
  });
});

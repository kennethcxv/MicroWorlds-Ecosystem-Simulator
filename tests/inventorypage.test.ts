/**
 * Inventory page data contract — categories, real-content builders, the
 * presentation words (rarity/size/biome), sorting, pagination and totals.
 */
import { describe, expect, it } from "vitest";
import {
  INV_CATEGORIES,
  INV_PER_PAGE,
  INV_SORTS,
  KIT_ITEMS,
  biomeFor,
  buildInventoryItems,
  categoryCounts,
  invTotals,
  itemsInCategory,
  paginate,
  rarityFor,
  sizeWordFor,
  sortItems,
} from "../src/data/inventoryPage";
import { LIZARD_PLACEABLES } from "../src/habitats/HabitatBuilder";
import type { PlaceableDef } from "../src/habitats/HabitatBuilder";

const INPUT = {
  owned: { hide_cave: 2 },
  inUse: { rock_cluster: 1, hide_cave: 1 },
  stock: { cricket: 5, flakes: 0 },
};

describe("categories", () => {
  it("matches the reference tab set in order", () => {
    expect(INV_CATEGORIES.map((c) => c.id)).toEqual([
      "all",
      "decor",
      "substrate",
      "plants",
      "food",
      "supplements",
      "tools",
      "other",
    ]);
  });
});

describe("presentation words", () => {
  it("derives rarity from real prices", () => {
    expect(rarityFor(79)).toBe("Common");
    expect(rarityFor(80)).toBe("Uncommon");
    expect(rarityFor(139)).toBe("Uncommon");
    expect(rarityFor(140)).toBe("Rare");
    expect(rarityFor(220)).toBe("Exceptional");
  });

  it("derives size words from measured extents", () => {
    const def = (he: [number, number, number]): PlaceableDef =>
      ({ collision: { halfExtents: he }, tags: [] }) as unknown as PlaceableDef;
    expect(sizeWordFor(def([0.05, 0.08, 0.05]))).toBe("Small");
    expect(sizeWordFor(def([0.12, 0.1, 0.1]))).toBe("Medium");
    expect(sizeWordFor(def([0.24, 0.1, 0.1]))).toBe("Large");
    expect(sizeWordFor(def([0.4, 0.1, 0.1]))).toBe("Grand");
  });

  it("maps authored tags to a biome word", () => {
    expect(biomeFor(["Arid", "Soft"])).toBe("Desert");
    expect(biomeFor(["Humid shelter"])).toBe("Tropical");
    expect(biomeFor(["Sturdy"])).toBe("Any habitat");
  });
});

describe("builder (real content only)", () => {
  const items = buildInventoryItems(INPUT);

  it("shows owned decor with spare counts and placed decor honestly", () => {
    const cave = items.find((i) => i.id === "decor:hide_cave");
    expect(cave?.qty).toBe(2);
    expect(cave?.qtyLabel).toBe("×2");
    expect(cave?.inUse).toBe(1);
    expect(cave?.placeable).toBe(true);
    expect(cave?.sellable).toBe(true);
    const cluster = items.find((i) => i.id === "decor:rock_cluster");
    expect(cluster?.qty).toBe(0);
    expect(cluster?.qtyLabel).toBe("In habitat");
    expect(cluster?.placeable).toBe(false);
  });

  it("never lists locked catalog cards", () => {
    const lockedIds = LIZARD_PLACEABLES.filter((d) => d.locked).map((d) => `decor:${d.id}`);
    expect(lockedIds.length).toBeGreaterThan(0);
    for (const id of lockedIds) expect(items.find((i) => i.id === id)).toBeUndefined();
  });

  it("maps supply stock to real counts", () => {
    const cricket = items.find((i) => i.id === "supply:cricket");
    expect(cricket?.qty).toBe(5);
    expect(cricket?.qtyLabel).toBe("5 in stock");
    const flakes = items.find((i) => i.id === "supply:flakes");
    expect(flakes?.qtyLabel).toBe("Out of stock");
  });

  it("lists player-habitat substrates and the permanent kit", () => {
    expect(items.find((i) => i.id === "terrain:sahara_sand")).toBeTruthy();
    expect(items.find((i) => i.id === "terrain:leaf_litter")?.qtyLabel).toBe("Unlocked");
    const kit = items.filter((i) => i.kind === "tool" || i.kind === "supplement");
    expect(kit).toHaveLength(KIT_ITEMS.length);
    expect(kit.every((i) => i.qty === null)).toBe(true);
  });

  it("gives decor rows detail-panel data (effects, size, biome)", () => {
    const cave = items.find((i) => i.id === "decor:hide_cave");
    expect(cave?.effects?.length).toBeGreaterThan(2);
    expect(cave?.sizeWord).toBeTruthy();
    expect(cave?.biome).toBeTruthy();
    expect(cave?.tip).toBeTruthy();
  });
});

describe("filtering, sorting, paging, totals", () => {
  const items = buildInventoryItems(INPUT);

  it("filters by category and counts every lane", () => {
    const counts = categoryCounts(items);
    expect(counts.all).toBe(items.length);
    expect(itemsInCategory(items, "food")).toHaveLength(counts.food);
    expect(counts.tools).toBe(5);
    expect(counts.supplements).toBe(2);
  });

  it("sorts by value and name", () => {
    expect(INV_SORTS.map((s) => s.id)).toContain("value");
    const byValue = sortItems(items, "value");
    for (let i = 1; i < byValue.length; i++) expect(byValue[i - 1].value).toBeGreaterThanOrEqual(byValue[i].value);
    const byName = sortItems(items, "name");
    expect(byName[0].name.localeCompare(byName[byName.length - 1].name)).toBeLessThanOrEqual(0);
  });

  it("paginates at the reference's 5×4 grid size and clamps", () => {
    const fake = Array.from({ length: 45 }, (_, i) => i);
    expect(paginate(fake, 0).slice).toHaveLength(INV_PER_PAGE);
    expect(paginate(fake, 2).slice).toHaveLength(5);
    expect(paginate(fake, 99).page).toBe(2);
    expect(paginate(fake, -2).page).toBe(0);
    expect(paginate([], 0).pages).toBe(1);
  });

  it("totals owned value from decor prices + supply pack rates", () => {
    const totals = invTotals(buildInventoryItems({ owned: { hide_cave: 2 }, inUse: {}, stock: { cricket: 6 } }));
    expect(totals.totalItems).toBe(8); // 2 caves + 6 crickets
    expect(totals.totalValue).toBe(2 * 220 + 30); // caves at 220 + one full cricket pack
  });
});

describe("real art", () => {
  it("feeder supplies carry the Feed drawer's real photos; fish foods stay honest glyphs", () => {
    const items = buildInventoryItems({ owned: {}, inUse: {}, stock: { cricket: 5, waxworm: 2, flakes: 3 } });
    const byRef = (id: string) => items.find((i) => i.id === `supply:${id}`)!;
    for (const id of ["cricket", "mealworm", "superworm", "dubia_roach", "waxworm"]) {
      expect(byRef(id).art, id).toMatch(/^\/assets\/ui\/food\/.+\.png$/);
    }
    for (const id of ["flakes", "pellets", "bloodworms"]) expect(byRef(id).art, id).toBeNull();
  });

  it("every referenced supply photo exists on disk", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const items = buildInventoryItems({ owned: {}, inUse: {}, stock: {} });
    for (const i of items) {
      if (i.kind === "supply" && i.art) {
        expect(existsSync(join(__dirname, "..", "public", i.art)), `${i.id} → ${i.art}`).toBe(true);
      }
    }
  });

  it("unlocked decor has a base thumb AND three turntable frames on disk", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const def of LIZARD_PLACEABLES) {
      if (def.locked) continue;
      const base = join(__dirname, "..", "public", "assets", "ui", "decor_thumbs");
      expect(existsSync(join(base, `${def.id}.png`)), def.id).toBe(true);
      for (const deg of [90, 180, 270]) {
        expect(existsSync(join(base, `${def.id}_y${deg}.png`)), `${def.id}_y${deg}`).toBe(true);
      }
    }
  });
});

describe("recent sort tells the truth", () => {
  it("a fresh purchase sorts first; untouched items keep build order behind it", () => {
    const items = buildInventoryItems({
      owned: { rock_boulder: 1 },
      inUse: { hide_cave: 1 },
      stock: { cricket: 6 },
      acquired: { "decor:rock_boulder": 2000, "supply:cricket": 1000 },
    });
    const sorted = sortItems(items, "recent");
    expect(sorted[0].id).toBe("decor:rock_boulder"); // newest purchase first
    expect(sorted[1].id).toBe("supply:cricket");
    // Never-acquired items follow in stable build order.
    const rest = sorted.slice(2);
    expect(rest.every((i) => i.acquiredAt === 0)).toBe(true);
  });
});

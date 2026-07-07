/**
 * DECOR CATALOG v2 (Decorate Mode) — data validation for the five-category
 * placeable registry: ids stable for saves, sections exact, card copy complete,
 * effects in range, every GLB-backed def pointing at a real file on disk, and
 * the variant machinery (defaultScale / tint) flowing through makePlaced +
 * rehydrateLayoutAssets.
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DECOR_EFFECT_KEYS,
  DECOR_SECTIONS,
  LIZARD_DECOR_DIR,
  LIZARD_PLACEABLES,
  findPlaceable,
  livePlaceables,
  makePlaced,
  rehydrateLayoutAssets,
} from "../src/habitats/HabitatBuilder";
import { decorPrice } from "../src/game/economy";
import type { HabitatLayout } from "../src/habitats/HabitatTypes";

/** defIds that shipped in older saves — renaming/removing any breaks loads. */
const LEGACY_IDS = [
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
];

describe("decor catalog v2", () => {
  it("ids are unique", () => {
    const ids = LIZARD_PLACEABLES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every legacy defId still exists (save compatibility)", () => {
    for (const id of LEGACY_IDS) expect(findPlaceable(id), id).toBeTruthy();
  });

  it("exactly the five player categories, each stocked with live pieces", () => {
    const seen = new Set(LIZARD_PLACEABLES.map((p) => p.section));
    expect([...seen].sort()).toEqual([...DECOR_SECTIONS].sort());
    for (const s of DECOR_SECTIONS) {
      const live = livePlaceables().filter((p) => p.section === s);
      expect(live.length, `${s} live entries`).toBeGreaterThanOrEqual(s === "Utilities" ? 3 : 5);
    }
  });

  it("every def carries complete card copy (desc, 1-3 tags, tip)", () => {
    for (const p of LIZARD_PLACEABLES) {
      expect(p.desc.length, p.id).toBeGreaterThan(10);
      expect(p.tags.length, p.id).toBeGreaterThanOrEqual(1);
      expect(p.tags.length, p.id).toBeLessThanOrEqual(3);
      expect(p.tip.length, p.id).toBeGreaterThan(10);
    }
  });

  it("every def's effects cover all meter keys, each an integer 0..10", () => {
    for (const p of LIZARD_PLACEABLES) {
      for (const { key } of DECOR_EFFECT_KEYS) {
        const v = p.effects[key];
        expect(Number.isInteger(v), `${p.id}.${key}`).toBe(true);
        expect(v, `${p.id}.${key}`).toBeGreaterThanOrEqual(0);
        expect(v, `${p.id}.${key}`).toBeLessThanOrEqual(10);
      }
    }
  });

  it("every catalog piece is priced (locked ones included — harmless)", () => {
    for (const p of LIZARD_PLACEABLES) expect(decorPrice(p.id), p.id).toBeGreaterThan(0);
  });

  it("locked cards carry a human reason; the locked set stays small", () => {
    const locked = LIZARD_PLACEABLES.filter((p) => p.locked);
    for (const p of locked) expect((p.locked ?? "").length, p.id).toBeGreaterThan(5);
    expect(locked.length).toBeLessThanOrEqual(6);
  });

  it("every GLB-backed def points at a real file on disk", () => {
    const base = join(__dirname, "..", "public", "assets", "3d", "habitats", LIZARD_DECOR_DIR);
    for (const p of LIZARD_PLACEABLES) {
      if (!p.asset) continue;
      expect(existsSync(join(base, p.asset)), `${p.id} → ${p.asset}`).toBe(true);
    }
  });

  it("variant defaultScale axes are sane (0.1×..3×)", () => {
    for (const p of LIZARD_PLACEABLES) {
      if (!p.defaultScale) continue;
      for (const s of p.defaultScale) {
        expect(s, p.id).toBeGreaterThanOrEqual(0.1);
        expect(s, p.id).toBeLessThanOrEqual(3);
      }
    }
  });

  it("non-collidable pieces are always soft obstacles (never phantom walls)", () => {
    for (const p of LIZARD_PLACEABLES) {
      if (!p.collidable) {
        expect(p.collisionType, p.id).toBe("none");
        expect(p.interaction, p.id).toBe("softObstacle");
      }
    }
  });

  it("effects stay loosely consistent with the score stats", () => {
    for (const p of LIZARD_PLACEABLES) {
      if (p.category === "hide") {
        expect(p.effects.hideCover, p.id).toBeGreaterThanOrEqual(6);
        expect(p.affectsStats?.hidingSpots ?? 0, p.id).toBeGreaterThanOrEqual(30);
      }
      if ((p.affectsStats?.humidity ?? 0) >= 25) {
        expect(p.effects.humidity, p.id).toBeGreaterThanOrEqual(5);
      }
      if (p.interaction === "climbable") {
        expect((p.affectsStats?.climbing ?? 0) + (p.affectsStats?.basking ?? 0), p.id).toBeGreaterThan(0);
      }
    }
  });
});

describe("variant machinery", () => {
  it("makePlaced starts a variant at its defaultScale and carries the tint", () => {
    const slab = findPlaceable("rock_slate")!;
    const o = makePlaced(slab, "s1", [0, 0, 0]);
    expect(o.scale).toEqual(slab.defaultScale);
    expect(o.tint).toBe(slab.tint);
    // Explicit scale still overrides (the authored layout uses this).
    const o2 = makePlaced(slab, "s2", [0, 0, 0], 0, [1, 1, 1]);
    expect(o2.scale).toEqual([1, 1, 1]);
  });

  it("plain defs still start at 1× with no tint", () => {
    const o = makePlaced(findPlaceable("rock_cluster")!, "r1", [0, 0, 0]);
    expect(o.scale).toEqual([1, 1, 1]);
    expect(o.tint).toBeUndefined();
  });

  it("rehydrateLayoutAssets heals tint from the def (and clears stale ones)", () => {
    const tinted = makePlaced(findPlaceable("rock_slate")!, "s1", [0, 0, 0]);
    tinted.tint = 0x123456; // stale save value
    const plain = makePlaced(findPlaceable("rock_cluster")!, "r1", [0, 0, 0]);
    plain.tint = 0xff00ff; // stale tint on an untinted def
    const layout = { objects: [tinted, plain] } as unknown as HabitatLayout;
    rehydrateLayoutAssets(layout);
    expect(tinted.tint).toBe(findPlaceable("rock_slate")!.tint);
    expect(plain.tint).toBeUndefined();
  });

  it("new hides place at a gecko-fitting default size", () => {
    for (const id of ["hide_cave", "hide_moist", "hide_low_cave", "hide_burrow", "hide_double", "hide_tunnel"]) {
      const def = findPlaceable(id)!;
      const o = makePlaced(def, "h", [0, 0, 0]);
      // The authored layout proved the moist hide fits at 0.2 × 1.8 = 0.36 half-
      // width; every hide's default footprint must reach that empirical bar (the
      // live body-fit check against the measured GLB interior is the real gate).
      const width = (def.collision?.halfExtents?.[0] ?? 0) * o.scale[0];
      expect(width, id).toBeGreaterThanOrEqual(0.34);
    }
  });
});

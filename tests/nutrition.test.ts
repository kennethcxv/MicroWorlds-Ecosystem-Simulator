/**
 * REAL leopard-gecko feeder NUTRITION — every food has real relative nutrition
 * (satiety / fat / calcium / moisture, husbandry role) and eating it applies
 * REAL effects: hunger restore, body-condition shift from fatty foods, calcium
 * store restored by supplement dusting (and eroded health when deficient — the
 * MBD risk every care sheet warns about), food moisture supporting hydration.
 */
import { describe, it, expect } from "vitest";
import { makeLizardHabitatState } from "../src/habitats/lizard/LizardHabitatData";
import { computeScores } from "../src/habitats/HabitatStats";
import { careProfile } from "../src/habitats/HabitatSpecies";
import { computeWellbeing } from "../src/habitats/lizard/LizardWellbeing";
import { FOOD_TYPES, consumeFeeder } from "../src/habitats/lizard/LizardFeedingSystem";
import { LIZARD_NEEDS, updateNeeds } from "../src/habitats/lizard/LizardNeedsSystem";
import {
  applyMeal,
  calciumFromMeal,
  conditionShift,
  ensureNeedDefaults,
  intakeSummary,
  moistureFromMeal,
  type FeedingLogEntry,
} from "../src/habitats/lizard/LizardNutrition";
import type { FeederKind } from "../src/habitats/HabitatTypes";

const ALL_KINDS: FeederKind[] = ["cricket", "mealworm", "superworm", "dubia_roach", "waxworm"];

function freshGecko() {
  const st = makeLizardHabitatState();
  const g = st.animals[0];
  const profile = careProfile("leopard_gecko")!;
  const sc = computeScores(st.layout);
  return { st, g, ctx: { scores: sc, profile } };
}

describe("food nutrition profiles (real husbandry data)", () => {
  it("every feeder kind (incl. the new superworm) has a complete profile", () => {
    for (const k of ALL_KINDS) {
      const f = FOOD_TYPES[k];
      expect(f, k).toBeTruthy();
      expect(f.satiety, k).toBeGreaterThan(0);
      expect(f.fat, k).toBeGreaterThanOrEqual(0);
      expect(f.calcium, k).toBeGreaterThan(0);
      expect(f.moisture, k).toBeGreaterThan(0);
      expect(["staple", "occasional", "treat"]).toContain(f.role);
      expect(f.note.length, k).toBeGreaterThan(4);
    }
  });

  it("mirrors real life: waxworms fattiest treat, dubia the best staple, superworms fattier than mealworms", () => {
    expect(FOOD_TYPES.waxworm.fat).toBeGreaterThan(FOOD_TYPES.superworm.fat);
    expect(FOOD_TYPES.superworm.fat).toBeGreaterThan(FOOD_TYPES.mealworm.fat);
    expect(FOOD_TYPES.mealworm.fat).toBeGreaterThan(FOOD_TYPES.cricket.fat);
    expect(FOOD_TYPES.waxworm.role).toBe("treat");
    expect(FOOD_TYPES.superworm.role).toBe("occasional");
    for (const staple of ["cricket", "mealworm", "dubia_roach"] as const) {
      expect(FOOD_TYPES[staple].role).toBe("staple");
    }
    // Dubia carry the best meat-to-shell + Ca:P of the staples.
    expect(FOOD_TYPES.dubia_roach.calcium).toBeGreaterThan(FOOD_TYPES.cricket.calcium);
    expect(FOOD_TYPES.dubia_roach.satiety).toBeGreaterThan(FOOD_TYPES.cricket.satiety);
    // A superworm is a big insect — more filling than a mealworm.
    expect(FOOD_TYPES.superworm.satiety).toBeGreaterThan(FOOD_TYPES.mealworm.satiety);
  });
});

describe("supplement dusting (calcium / calcium + D3)", () => {
  it("undusted insects give only a little calcium; dusting multiplies it; D3 absorbs best", () => {
    const bare = calciumFromMeal("cricket", "none");
    const dusted = calciumFromMeal("cricket", "calcium");
    const d3 = calciumFromMeal("cricket", "calcium_d3");
    expect(bare).toBeGreaterThan(0);
    expect(dusted).toBeGreaterThan(bare * 3);
    expect(d3).toBeGreaterThan(dusted);
  });

  it("applyMeal restores hunger by the food's satiety and calcium by the dusting", () => {
    const { g } = freshGecko();
    ensureNeedDefaults(g.needs);
    g.needs.hunger = 30;
    g.needs.calcium = 40;
    applyMeal(g, "dubia_roach", "calcium_d3");
    expect(g.needs.hunger).toBeCloseTo(30 + FOOD_TYPES.dubia_roach.satiety, 5);
    expect(g.needs.calcium).toBeCloseTo(40 + calciumFromMeal("dubia_roach", "calcium_d3"), 5);
  });

  it("fatty foods shift body condition up much more than lean staples", () => {
    expect(conditionShift("waxworm")).toBeGreaterThan(conditionShift("cricket") * 2);
    const { g } = freshGecko();
    ensureNeedDefaults(g.needs);
    const start = g.needs.bodyCondition;
    applyMeal(g, "waxworm", "none");
    applyMeal(g, "waxworm", "none");
    expect(g.needs.bodyCondition).toBeGreaterThan(start + conditionShift("cricket"));
  });
});

describe("calcium + body-condition stores (real effects over time)", () => {
  it("calcium drains slowly over time", () => {
    const { st, g, ctx } = freshGecko();
    ensureNeedDefaults(g.needs);
    g.needs.calcium = 80;
    for (let i = 0; i < 600; i++) updateNeeds(st, g, ctx, 1);
    expect(g.needs.calcium).toBeLessThan(80);
    expect(g.needs.calcium).toBeGreaterThan(70); // slow — a husbandry rhythm, not a hunger bar
  });

  it("calcium deficiency erodes health (MBD risk); a well-dusted gecko stays healthy", () => {
    const a = freshGecko();
    const b = freshGecko();
    ensureNeedDefaults(a.g.needs);
    ensureNeedDefaults(b.g.needs);
    a.g.needs.calcium = 5;
    b.g.needs.calcium = 100;
    for (let i = 0; i < 120; i++) {
      updateNeeds(a.st, a.g, a.ctx, 1);
      updateNeeds(b.st, b.g, b.ctx, 1);
    }
    expect(a.g.needs.health).toBeLessThan(90);
    expect(b.g.needs.health).toBeGreaterThanOrEqual(99);
  });

  it("body condition eases back toward ideal (50) and obesity erodes health", () => {
    const fat = freshGecko();
    const fit = freshGecko();
    ensureNeedDefaults(fat.g.needs);
    ensureNeedDefaults(fit.g.needs);
    fat.g.needs.bodyCondition = 100;
    fit.g.needs.bodyCondition = 50;
    for (let i = 0; i < 60; i++) {
      updateNeeds(fat.st, fat.g, fat.ctx, 1);
      updateNeeds(fit.st, fit.g, fit.ctx, 1);
    }
    expect(fat.g.needs.bodyCondition).toBeLessThan(100); // easing down
    expect(fat.g.needs.health).toBeLessThan(fit.g.needs.health); // obesity cost
    // …and over a long calm stretch it converges near ideal.
    for (let i = 0; i < 1800; i++) updateNeeds(fat.st, fat.g, fat.ctx, 1);
    expect(fat.g.needs.bodyCondition).toBeLessThan(62);
  });

  it("ensureNeedDefaults heals an old save's needs (adds calcium + bodyCondition once)", () => {
    const old = { hunger: 60, stress: 10, health: 95 } as Parameters<typeof ensureNeedDefaults>[0];
    const filled = ensureNeedDefaults(old);
    expect(filled.calcium).toBeGreaterThan(0);
    expect(filled.bodyCondition).toBe(50);
    filled.calcium = 33;
    ensureNeedDefaults(filled);
    expect(filled.calcium).toBe(33); // never resets present values
  });
});

describe("food moisture supports hydration", () => {
  it("eating juicy insects raises the hydration read-out a little", () => {
    const { st, g, ctx } = freshGecko();
    ensureNeedDefaults(g.needs);
    expect(moistureFromMeal("cricket")).toBeGreaterThan(0);
    const before = computeWellbeing(st, ctx.scores).hydration;
    g.needs.hunger = 10;
    for (let i = 0; i < 3; i++) {
      st.feeders.push({ id: st.nextFeederId++, kind: "cricket", position: [0, 0, 0], alive: true, age: 0 });
      consumeFeeder(st, st.feeders[st.feeders.length - 1].id, g);
    }
    const after = computeWellbeing(st, ctx.scores).hydration;
    expect(after).toBeGreaterThan(before);
  });
});

describe("track intake (feeding log summary)", () => {
  const entry = (kind: FeederKind, count: number, supplement: "none" | "calcium" | "calcium_d3"): FeedingLogEntry => ({
    t: 0,
    kind,
    count,
    method: "quick",
    supplement,
  });

  it("counts by kind and flags a treat-heavy diet", () => {
    const heavy = intakeSummary([entry("waxworm", 4, "none"), entry("cricket", 1, "none")]);
    expect(heavy.total).toBe(5);
    expect(heavy.byKind.waxworm).toBe(4);
    expect(heavy.treatFraction).toBeCloseTo(0.8, 5);
    expect(heavy.advice.join(" ")).toMatch(/treat/i);

    const balanced = intakeSummary([entry("cricket", 3, "calcium"), entry("dubia_roach", 3, "calcium_d3")]);
    expect(balanced.treatFraction).toBe(0);
    expect(balanced.advice.join(" ")).not.toMatch(/too many treats/i);
  });

  it("tracks the dusted fraction and nudges when nothing is dusted", () => {
    const none = intakeSummary([entry("cricket", 4, "none")]);
    expect(none.dustedFraction).toBe(0);
    expect(none.advice.join(" ")).toMatch(/calcium|dust/i);
    const all = intakeSummary([entry("cricket", 4, "calcium_d3")]);
    expect(all.dustedFraction).toBe(1);
  });
});

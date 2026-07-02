/**
 * PERSONALITY — every animal rolls one from a roulette whose odds are skewed
 * by REAL LIFE (leopard geckos are mostly placid baskers/hiders; relentless
 * speed-demons are the rare draw), it persists on the save, and it genuinely
 * changes behaviour: speeds, idle rhythm, sheltering, appetite, climb comfort.
 */
import { describe, expect, it } from "vitest";
import {
  PERSONALITIES,
  applyPersonalityToMovement,
  applyPersonalityToNeeds,
  ensurePersonality,
  personalityOf,
  rollPersonality,
} from "../src/habitats/lizard/LizardPersonality";
import { GECKO_MOVEMENT } from "../src/habitats/lizard/GeckoMovementController";
import { LIZARD_NEEDS } from "../src/habitats/lizard/LizardNeedsSystem";
import { MAX_CLIMB_HEIGHT } from "../src/habitats/HabitatCollision";
import { makeLeopardGecko } from "../src/habitats/lizard/LizardHabitatData";

function seededRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

describe("the roulette is skewed by real life", () => {
  it("has five distinct personalities with sane trait ranges", () => {
    expect(PERSONALITIES.length).toBe(5);
    for (const p of PERSONALITIES) {
      expect(p.weight).toBeGreaterThan(0);
      expect(p.speedMult).toBeGreaterThan(0.5);
      expect(p.speedMult).toBeLessThan(2);
      expect(p.climbCap).toBeGreaterThanOrEqual(0.1);
      expect(p.climbCap).toBeLessThanOrEqual(MAX_CLIMB_HEIGHT);
      expect(p.blurb.length).toBeGreaterThan(10);
    }
  });

  it("placid temperaments dominate (calm + shy + bold ≥ 60% of the odds)", () => {
    const total = PERSONALITIES.reduce((s, p) => s + p.weight, 0);
    const placid = ["calm_basker", "shy_hider", "bold_explorer"]
      .map((id) => personalityOf(id).weight)
      .reduce((a, b) => a + b, 0);
    expect(placid / total).toBeGreaterThanOrEqual(0.6);
    // …and the hyper speed-demon is the RAREST draw (it exists, but rarely).
    const hunter = personalityOf("energetic_hunter").weight;
    for (const p of PERSONALITIES) if (p.id !== "energetic_hunter") expect(p.weight).toBeGreaterThan(hunter);
  });

  it("rolls deterministically, hits every personality, and tracks the weights", () => {
    const rng = seededRng(7);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 5000; i++) {
      const id = rollPersonality(rng);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    for (const p of PERSONALITIES) expect(counts[p.id] ?? 0).toBeGreaterThan(0);
    // The most common draw is the most common real-life temperament.
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe("calm_basker");
    expect(counts.calm_basker).toBeGreaterThan(counts.energetic_hunter);
  });
});

describe("persistence", () => {
  it("assigns once, persists on the animal, and never re-rolls", () => {
    const g = makeLeopardGecko();
    const first = ensurePersonality(g, seededRng(3));
    expect(first.justAssigned).toBe(true);
    expect(g.personality).toBe(first.def.id);
    const second = ensurePersonality(g, seededRng(999));
    expect(second.justAssigned).toBe(false);
    expect(second.def.id).toBe(first.def.id);
  });

  it("heals an invalid persisted id by rolling fresh", () => {
    const g = makeLeopardGecko();
    g.personality = "totally_bogus";
    const { def, justAssigned } = ensurePersonality(g, seededRng(4));
    expect(justAssigned).toBe(true);
    expect(PERSONALITIES.some((p) => p.id === def.id)).toBe(true);
  });
});

describe("personality genuinely changes behaviour", () => {
  it("an energetic hunter moves faster + idles less than a calm basker", () => {
    const fast = applyPersonalityToMovement(GECKO_MOVEMENT, personalityOf("energetic_hunter"));
    const calm = applyPersonalityToMovement(GECKO_MOVEMENT, personalityOf("calm_basker"));
    expect(fast.walkSpeed).toBeGreaterThan(GECKO_MOVEMENT.walkSpeed);
    expect(calm.walkSpeed).toBeLessThan(GECKO_MOVEMENT.walkSpeed);
    expect(fast.idleDur[1]).toBeLessThan(calm.idleDur[1]);
    expect(fast.idleChance).toBeLessThan(calm.idleChance);
  });

  it("a shy hider panics longer when startled; a bold explorer barely flinches", () => {
    const shy = applyPersonalityToMovement(GECKO_MOVEMENT, personalityOf("shy_hider"));
    const bold = applyPersonalityToMovement(GECKO_MOVEMENT, personalityOf("bold_explorer"));
    expect(shy.fleeDur).toBeGreaterThan(GECKO_MOVEMENT.fleeDur);
    expect(bold.fleeDur).toBeLessThan(GECKO_MOVEMENT.fleeDur);
  });

  it("a food lover gets hungry sooner (appetite drives the hunger drain)", () => {
    const foodie = applyPersonalityToNeeds(LIZARD_NEEDS, personalityOf("food_lover"));
    const calm = applyPersonalityToNeeds(LIZARD_NEEDS, personalityOf("calm_basker"));
    expect(foodie.hungerDrainPerSec).toBeGreaterThan(LIZARD_NEEDS.hungerDrainPerSec);
    expect(calm.hungerDrainPerSec).toBeLessThan(LIZARD_NEEDS.hungerDrainPerSec);
  });

  it("lazy/shy personalities have a lower personal climb ceiling than bold ones", () => {
    expect(personalityOf("calm_basker").climbCap).toBeLessThan(personalityOf("bold_explorer").climbCap);
  });
});

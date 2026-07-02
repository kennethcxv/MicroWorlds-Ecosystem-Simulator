import { describe, it, expect } from "vitest";
import {
  CREATURES,
  creatureList,
  getCreature,
  aquariumCreatures,
  vivariumCreatures,
  defaultAquariumPopulation,
} from "../src/data/creatures/creatureRegistry";
import type { CreatureSpecies } from "../src/data/creatures/CreatureTypes";
import { AQUATIC_CODEX } from "../src/data/aquaticCodex";

const IDS = [
  "feeder_cricket",
  "cherry_shrimp",
  "nerite_snail",
  "neon_tetra",
  "guppy",
  "zebra_danio",
  "otocinclus",
  "mystery_snail",
  "daphnia",
  "isopod",
] as const;

const STAT_KEYS = [
  "health",
  "hunger",
  "energy",
  "stress",
  "comfort",
  "socialNeed",
  "activity",
  "curiosity",
  "boldness",
  "shyness",
  "cleaningPower",
  "algaeControl",
  "wasteProduction",
  "oxygenDemand",
  "waterSensitivity",
  "temperatureSensitivity",
  "pHSensitivity",
  "hardnessSensitivity",
  "humiditySensitivity",
  "drynessSensitivity",
  "breedingChance",
  "visibilityScore",
  "playerAppeal",
] as const;

describe("creature registry", () => {
  it("holds exactly the 10 first-batch animals, keyed by id", () => {
    expect(creatureList().map((c) => c.id).sort()).toEqual([...IDS].sort());
    for (const [key, c] of Object.entries(CREATURES)) expect(key).toBe(c.id);
  });

  it("every entry is complete and well-formed", () => {
    for (const c of creatureList()) {
      expect(c.displayName.length).toBeGreaterThan(0);
      expect(c.category.length).toBeGreaterThan(0);
      expect(c.biome.length).toBeGreaterThan(0);
      expect(["aquarium", "vivarium"]).toContain(c.habitatType);
      expect(c.descriptionUI.length).toBeGreaterThan(20);
      expect(c.descriptionEncyclopedia.length).toBeGreaterThan(40);
      expect(c.personalityTags.length).toBeGreaterThanOrEqual(4);
      expect(c.naturalHabits.length).toBeGreaterThanOrEqual(4);
      expect(c.behaviorStates.length).toBeGreaterThanOrEqual(5);
      expect(c.stressTriggers.length).toBeGreaterThanOrEqual(4);
      expect(c.comfortTriggers.length).toBeGreaterThanOrEqual(4);
      expect(c.ecosystemEffects.length).toBeGreaterThanOrEqual(3);
      expect(c.compatibleHabitats.length).toBeGreaterThanOrEqual(1);
      expect(c.dietType.length).toBeGreaterThan(0);
      expect(c.foodPreferences.length).toBeGreaterThanOrEqual(2);
      expect(c.careRole.length).toBeGreaterThan(0);
      expect(c.ecosystemRole.length).toBeGreaterThan(0);
      // Environment bands are ordered.
      expect(c.env.temperatureF[0]).toBeLessThan(c.env.temperatureF[1]);
      if (c.env.pH) expect(c.env.pH[0]).toBeLessThanOrEqual(c.env.pH[1]);
      if (c.env.humidity) expect(c.env.humidity[0]).toBeLessThanOrEqual(c.env.humidity[1]);
      // Aquatic entries carry water chemistry; terrestrial carry humidity.
      if (c.habitatType === "aquarium") expect(c.env.pH).toBeDefined();
      if (c.habitatType === "vivarium") expect(c.env.humidity).toBeDefined();
    }
  });

  it("every gameplay stat exists and sits in 0..100", () => {
    for (const c of creatureList()) {
      for (const k of STAT_KEYS) {
        const v = c.stats[k];
        expect(v, `${c.id}.stats.${k}`).toBeGreaterThanOrEqual(0);
        expect(v, `${c.id}.stats.${k}`).toBeLessThanOrEqual(100);
      }
      for (const [k, v] of Object.entries(c.special ?? {})) {
        expect(v, `${c.id}.special.${k}`).toBeGreaterThanOrEqual(0);
        expect(v, `${c.id}.special.${k}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it("matches the authored design numbers (spot checks)", () => {
    expect(getCreature("feeder_cricket").stats.activity).toBe(85);
    expect(getCreature("feeder_cricket").special?.preyValue).toBe(90);
    expect(getCreature("neon_tetra").stats.socialNeed).toBe(90);
    expect(getCreature("guppy").stats.breedingChance).toBe(90);
    expect(getCreature("zebra_danio").stats.activity).toBe(95);
    expect(getCreature("otocinclus").special?.biofilmNeed).toBe(95);
    expect(getCreature("mystery_snail").special?.calciumNeed).toBe(95);
    expect(getCreature("daphnia").special?.predatorSensitivity).toBe(95);
    expect(getCreature("isopod").special?.leafLitterNeed).toBe(95);
    expect(getCreature("cherry_shrimp").stats.cleaningPower).toBe(65);
    expect(getCreature("nerite_snail").stats.algaeControl).toBe(85);
  });

  it("habitat split: 8 aquarium animals, 2 vivarium animals", () => {
    expect(aquariumCreatures().map((c) => c.id).sort()).toEqual(
      ["cherry_shrimp", "daphnia", "guppy", "mystery_snail", "neon_tetra", "nerite_snail", "otocinclus", "zebra_danio"].sort(),
    );
    expect(vivariumCreatures().map((c) => c.id).sort()).toEqual(["feeder_cricket", "isopod"].sort());
  });

  it("schooling fish require groups of 6; spawn plans respect group minimums", () => {
    expect(getCreature("neon_tetra").minimumGroupSize).toBe(6);
    expect(getCreature("zebra_danio").minimumGroupSize).toBe(6);
    for (const c of creatureList()) {
      expect(c.spawn.defaultCount).toBeGreaterThanOrEqual(c.minimumGroupSize);
    }
    const plan = defaultAquariumPopulation();
    for (const p of plan) {
      const c = getCreature(p.id);
      expect(c.habitatType).toBe("aquarium");
      expect(p.count).toBeGreaterThanOrEqual(c.minimumGroupSize);
    }
    expect(plan.find((p) => p.id === "neon_tetra")?.count).toBeGreaterThanOrEqual(6);
    expect(plan.find((p) => p.id === "zebra_danio")?.count).toBeGreaterThanOrEqual(6);
  });

  it("difficulty + unlock tiers follow the design", () => {
    const tier = (id: string): number => getCreature(id).unlockTier;
    for (const id of ["feeder_cricket", "neon_tetra", "guppy", "zebra_danio", "nerite_snail", "mystery_snail"]) {
      expect(tier(id), id).toBe(1);
    }
    for (const id of ["cherry_shrimp", "isopod", "daphnia"]) expect(tier(id), id).toBe(2);
    expect(tier("otocinclus")).toBe(3);
    expect(getCreature("otocinclus").difficulty).toBe("medium");
    expect(getCreature("nerite_snail").difficulty).toBe("easy");
  });

  it("special stats exist where the design demands them", () => {
    const cricket = getCreature("feeder_cricket").special ?? {};
    for (const k of ["preyValue", "nutritionValue", "gutLoadValue", "calciumDustValue", "leftUneatenMessRisk"]) {
      expect(cricket[k as keyof typeof cricket], `cricket.${k}`).toBeDefined();
    }
    for (const id of ["nerite_snail", "mystery_snail"] as const) {
      const s = getCreature(id).special ?? {};
      for (const k of ["shellHealth", "calciumNeed", "acidicWaterStress"]) {
        expect(s[k as keyof typeof s], `${id}.${k}`).toBeDefined();
      }
    }
    const oto = getCreature("otocinclus").special ?? {};
    for (const k of ["matureTankNeed", "biofilmNeed", "starvationRiskIfNoAlgae"]) {
      expect(oto[k as keyof typeof oto], `oto.${k}`).toBeDefined();
    }
    const iso = getCreature("isopod").special ?? {};
    for (const k of ["moistureGradientNeed", "leafLitterNeed", "calciumNeed", "daylightAvoidance"]) {
      expect(iso[k as keyof typeof iso], `isopod.${k}`).toBeDefined();
    }
    expect(getCreature("daphnia").flags).toEqual(expect.arrayContaining(["microLife", "liveFood", "populationBased"]));
  });

  it("assets point at runtime creature GLBs with sane display sizes", () => {
    for (const c of creatureList()) {
      expect(c.asset.path).toBe(`/assets/3d/creatures/${c.id}.glb`);
      expect(c.asset.bodyLength).toBeGreaterThan(0.004);
      expect(c.asset.bodyLength).toBeLessThan(0.09); // all are tiny animals
      expect(["+z", "-z", "+x", "-x"]).toContain(c.asset.forward);
      for (const key of Object.keys(c.asset.partOverrides ?? {})) {
        expect(key).toMatch(/^tripo_part_\d+$/);
      }
    }
    // Snails face +X in their Tripo exports; fish face +Z.
    expect(getCreature("nerite_snail").asset.forward).toBe("+x");
    expect(getCreature("mystery_snail").asset.forward).toBe("+x");
    expect(getCreature("neon_tetra").asset.forward).toBe("+z");
  });

  it("controller/movement wiring is data-driven and consistent", () => {
    const ctrl = (id: string): string => getCreature(id).controllerType;
    expect(ctrl("neon_tetra")).toBe("schoolFish");
    expect(ctrl("guppy")).toBe("schoolFish");
    expect(ctrl("zebra_danio")).toBe("schoolFish");
    expect(ctrl("otocinclus")).toBe("surfaceGrazer");
    expect(ctrl("cherry_shrimp")).toBe("shrimpCrawler");
    expect(ctrl("nerite_snail")).toBe("snailGlider");
    expect(ctrl("mystery_snail")).toBe("snailGlider");
    expect(ctrl("daphnia")).toBe("microSwarm");
    expect(ctrl("isopod")).toBe("isopodCrawler");
    expect(ctrl("feeder_cricket")).toBe("feederInsect");
    for (const c of creatureList()) {
      // Every swimming creature has a water-volume bounds behaviour; crawlers
      // are substrate/surface bound.
      if (c.controllerType === "schoolFish" || c.controllerType === "microSwarm") {
        expect(c.boundsBehavior).toBe("water-volume");
      }
      if (c.controllerType === "isopodCrawler" || c.controllerType === "shrimpCrawler") {
        expect(c.boundsBehavior).toBe("substrate");
      }
      if (c.controllerType === "snailGlider" || c.controllerType === "surfaceGrazer") {
        expect(c.boundsBehavior).toBe("surfaces");
      }
      expect(c.collision.radius).toBeGreaterThan(0);
      expect(c.collision.radius).toBeLessThanOrEqual(c.asset.bodyLength); // tight, never oversized
    }
  });

  it("animation profiles match each creature's movement style", () => {
    for (const id of ["neon_tetra", "guppy", "zebra_danio", "otocinclus"] as const) {
      expect(getCreature(id).animation.swimWag, id).toBeDefined();
    }
    expect(getCreature("cherry_shrimp").animation.legScurry).toBeDefined();
    expect(getCreature("cherry_shrimp").animation.antennaSway).toBeDefined();
    expect(getCreature("nerite_snail").animation.footStretch).toBeDefined();
    expect(getCreature("nerite_snail").animation.eyestalkSway).toBeDefined();
    expect(getCreature("daphnia").animation.pulse).toBeDefined();
    expect(getCreature("isopod").animation.legScurry).toBeDefined();
    expect(getCreature("feeder_cricket").animation.antennaSway).toBeDefined();
    for (const c of creatureList()) {
      expect(c.animation.intensity).toBeGreaterThan(0);
      expect(c.animation.intensity).toBeLessThanOrEqual(2);
    }
  });

  it("links back to the 2D aquatic codex where a species already exists", () => {
    const linked = ["neon_tetra", "guppy", "zebra_danio", "otocinclus", "cherry_shrimp", "nerite_snail", "mystery_snail"];
    for (const id of linked) {
      const c = getCreature(id);
      expect(c.codexId, id).toBeDefined();
      expect(AQUATIC_CODEX[c.codexId!], `${id} codex link`).toBeDefined();
    }
    expect(getCreature("daphnia").codexId).toBeUndefined();
  });

  it("vivarium gameplay hooks: cricket is prey, isopod is cleanup crew", () => {
    const cricket = getCreature("feeder_cricket");
    expect(cricket.careRole.toLowerCase()).toContain("feeder");
    expect(cricket.ecosystemEffects.join(" ").toLowerCase()).toContain("gecko");
    const iso = getCreature("isopod");
    expect(iso.stats.cleaningPower).toBeGreaterThanOrEqual(70);
    expect(iso.ecosystemRole.toLowerCase()).toContain("clean");
  });

  it("getCreature throws on unknown ids", () => {
    expect(() => getCreature("axolotl" as never)).toThrow();
  });
});

// The registry must stay serialisable data (no functions/classes inside entries).
describe("registry is pure data", () => {
  it("survives a JSON round-trip unchanged", () => {
    for (const c of creatureList()) {
      const round = JSON.parse(JSON.stringify(c)) as CreatureSpecies;
      expect(round).toEqual(c);
    }
  });
});

import { describe, it, expect } from "vitest";
import { AQUATIC_CODEX, codexList, getCodex } from "../src/data/aquaticCodex";
import { SPECIES } from "../src/data/species";

const RARITIES = new Set(["Common", "Uncommon", "Rare", "Legendary"]);

describe("aquatic codex", () => {
  it("has the full 22-species roster", () => {
    expect(codexList()).toHaveLength(22);
  });

  it("every entry is well-formed", () => {
    for (const c of codexList()) {
      expect(c.id).toMatch(/^[a-z][a-z0-9_]+$/);
      expect(c.common.length).toBeGreaterThan(0);
      expect(c.scientific.length).toBeGreaterThan(0);
      expect(["Fish", "Invertebrate"]).toContain(c.cls);
      expect(RARITIES.has(c.rarity)).toBe(true);
      expect(c.sizeCm).toBeGreaterThan(0);
      expect(c.minGroup).toBeGreaterThanOrEqual(1);
      // Ordered, sane environmental bands.
      expect(c.tempC[0]).toBeLessThan(c.tempC[1]);
      expect(c.ph[0]).toBeLessThanOrEqual(c.ph[1]);
      expect(c.ph[0]).toBeGreaterThan(0);
      // Design scales within documented ranges.
      for (const k of ["bioload", "waste", "hunger", "stress"] as const) {
        expect(c[k]).toBeGreaterThanOrEqual(1);
        expect(c[k]).toBeLessThanOrEqual(7);
      }
      expect(c.breed).toBeGreaterThanOrEqual(0);
      expect(c.breed).toBeLessThanOrEqual(7);
      expect(c.schooling).toBeGreaterThanOrEqual(0);
      expect(c.schooling).toBeLessThanOrEqual(1);
      expect(c.speedPx).toBeGreaterThan(0);
    }
  });

  it("the record key matches each entry's id", () => {
    for (const [key, c] of Object.entries(AQUATIC_CODEX)) {
      expect(key).toBe(c.id);
    }
  });

  it("getCodex returns entries by id and undefined otherwise", () => {
    expect(getCodex("betta")?.common).toBe("Betta");
    expect(getCodex("not_a_real_fish")).toBeUndefined();
  });
});

describe("renderable species ↔ codex consistency", () => {
  it("every renderable species exists in the codex", () => {
    for (const id of Object.keys(SPECIES)) {
      expect(AQUATIC_CODEX[id], `missing codex entry for '${id}'`).toBeDefined();
    }
  });

  it("renderable descriptive fields are derived from the codex", () => {
    for (const sp of Object.values(SPECIES)) {
      const c = AQUATIC_CODEX[sp.id];
      expect(sp.name).toBe(c.common);
      expect(sp.latin).toBe(c.scientific);
      expect(sp.rarity).toBe(c.rarity);
      expect(sp.diet).toBe(c.diet);
      expect(sp.tempRange).toEqual(c.tempC);
    }
  });

  it("a Fish in the codex is never a snail/shrimp render type, and vice versa", () => {
    for (const sp of Object.values(SPECIES)) {
      const c = AQUATIC_CODEX[sp.id];
      if (sp.type === "fish") expect(c.cls).toBe("Fish");
      else expect(c.cls).toBe("Invertebrate");
    }
  });
});

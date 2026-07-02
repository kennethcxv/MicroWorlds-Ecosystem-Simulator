import { describe, it, expect } from "vitest";
import { classifyParts, type PartRole } from "../src/habitats/creatures/PartClassifier";
import { CREATURE_PART_FIXTURES } from "./fixtures/creatureParts";
import { getCreature } from "../src/data/creatures/creatureRegistry";
import { resolvePartRoles } from "../src/data/creatures/creatureRegistry";

function roles(id: string, opts?: { shell?: boolean; legs?: boolean }): Record<string, PartRole> {
  const c = getCreature(id as never);
  return classifyParts(CREATURE_PART_FIXTURES[id], c.asset.forward, {
    shellCreature: opts?.shell ?? false,
    hasLegs: opts?.legs ?? false,
  });
}

describe("part classifier (against the REAL measured GLB part bounds)", () => {
  it("neon tetra: body, tail, head, dorsal fin, paired side fins, static eyes", () => {
    const r = roles("neon_tetra");
    expect(r.tripo_part_0).toBe("body");
    expect(r.tripo_part_1).toBe("tail");
    expect(r.tripo_part_2).toBe("head");
    expect(r.tripo_part_4).toBe("finTop"); // dorsal
    expect([r.tripo_part_8, r.tripo_part_9].sort()).toEqual(["finSideL", "finSideR"]); // pectorals
    expect(r.tripo_part_11).toBe("static"); // eyes never animate
    expect(r.tripo_part_12).toBe("static");
    // The long upper body chunk is NOT misread as a fin.
    expect(r.tripo_part_3).toBe("body");
  });

  it("zebra danio: tail, dorsal, anal + two mirrored fin pairs", () => {
    const r = roles("zebra_danio");
    expect(r.tripo_part_0).toBe("body");
    expect(r.tripo_part_1).toBe("tail");
    expect([r.tripo_part_2, r.tripo_part_3].sort()).toEqual(["finSideL", "finSideR"]);
    expect(r.tripo_part_4).toBe("finTop");
    expect(r.tripo_part_5).toBe("finBottom");
    const values = Object.values(r);
    expect(values.filter((v) => v === "finSideL").length).toBe(values.filter((v) => v === "finSideR").length);
  });

  it("otocinclus: rear tail, top dorsal, mirrored pectorals", () => {
    const r = roles("otocinclus");
    expect(r.tripo_part_0).toBe("body");
    expect(r.tripo_part_3).toBe("tail");
    expect(r.tripo_part_2).toBe("finTop");
    expect([r.tripo_part_1, r.tripo_part_6].sort()).toEqual(["finSideL", "finSideR"]);
  });

  it("nerite snail (shell creature, +x forward): shell above foot, head in front, eyestalks", () => {
    const r = roles("nerite_snail", { shell: true });
    expect(r.tripo_part_0).toBe("shell");
    expect(r.tripo_part_1).toBe("foot");
    expect(r.tripo_part_2).toBe("head");
    expect(r.tripo_part_3).toBe("eyestalk");
    expect(r.tripo_part_4).toBe("eyestalk");
  });

  it("mystery snail: bigger foot below, shell above, head forward", () => {
    const r = roles("mystery_snail", { shell: true });
    expect(r.tripo_part_0).toBe("foot");
    expect(r.tripo_part_1).toBe("shell");
    expect(r.tripo_part_2).toBe("head");
  });

  it("cricket: head found, mid + front leg pairs found", () => {
    const r = roles("feeder_cricket", { legs: true });
    expect(r.tripo_part_0).toBe("body");
    expect(r.tripo_part_2).toBe("head");
    expect([r.tripo_part_3, r.tripo_part_4].sort()).toEqual(["legL", "legR"]);
    expect([r.tripo_part_7, r.tripo_part_8].sort()).toEqual(["legL", "legR"]);
  });

  it("daphnia: the big paired swimming antennae are detected", () => {
    const r = roles("daphnia");
    expect(r.tripo_part_0).toBe("body");
    expect([r.tripo_part_1, r.tripo_part_7].sort()).toEqual(["antennaL", "antennaR"]);
    expect(r.tripo_part_9).toBe("static"); // 37-tri speck
    expect(r.tripo_part_11).toBe("static"); // 1-tri speck
  });

  it("registry overrides + classifier resolve to a complete role map per creature", () => {
    for (const id of Object.keys(CREATURE_PART_FIXTURES)) {
      const map = resolvePartRoles(id as never, CREATURE_PART_FIXTURES[id]);
      // Every measured part gets a role; every override names a real part.
      for (const p of CREATURE_PART_FIXTURES[id]) {
        expect(map[p.name], `${id}.${p.name}`).toBeDefined();
      }
      const c = getCreature(id as never);
      for (const key of Object.keys(c.asset.partOverrides ?? {})) {
        expect(CREATURE_PART_FIXTURES[id].some((p) => p.name === key), `${id} override ${key}`).toBe(true);
      }
    }
  });

  it("guppy overrides give it the flowing tail its classifier split hides", () => {
    const map = resolvePartRoles("guppy", CREATURE_PART_FIXTURES.guppy);
    expect(map.tripo_part_1).toBe("tail");
    expect(map.tripo_part_2).toBe("finTop");
  });

  it("cherry shrimp resolves legs on both sides + front antennae + tail fan", () => {
    const map = resolvePartRoles("cherry_shrimp", CREATURE_PART_FIXTURES.cherry_shrimp);
    const values = Object.values(map);
    expect(values.filter((v) => v === "legL").length).toBeGreaterThanOrEqual(2);
    expect(values.filter((v) => v === "legR").length).toBeGreaterThanOrEqual(2);
    expect(values).toContain("antennaL");
    expect(values).toContain("antennaR");
    expect(map.tripo_part_1).toBe("tail"); // abdomen
    expect(map.tripo_part_3).toBe("tailFan");
  });

  it("isopod resolves side leg rows + antennae + rear tail nub", () => {
    const map = resolvePartRoles("isopod", CREATURE_PART_FIXTURES.isopod);
    expect(map.tripo_part_0).toBe("body");
    expect(map.tripo_part_2).toBe("head");
    expect([map.tripo_part_4, map.tripo_part_7].sort()).toEqual(["legL", "legR"]);
    expect([map.tripo_part_3, map.tripo_part_6].sort()).toEqual(["antennaL", "antennaR"]);
    expect(map.tripo_part_5).toBe("tail");
  });
});

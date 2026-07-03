/**
 * SUBSTRATE MATERIAL MAP — the pure per-cell material grid behind the Terrain
 * editor's Paint brush. The player PHYSICALLY paints materials onto the floor:
 * each cell records a terrain id; the floor texture composites per cell, the
 * humidity model blends by coverage, and the map persists with the habitat
 * save. No DOM/Three imports.
 */
import { describe, expect, it } from "vitest";
import {
  coverageFractions,
  dominantMaterialId,
  ensureMaterialMap,
  materialIdAt,
  paintMaterial,
} from "../src/habitats/HabitatMaterialMap";
import type { HabitatDimensions } from "../src/habitats/HabitatTypes";

const DIMS: HabitatDimensions = { width: 3.0, depth: 1.9, height: 1.3, glass: 0.05, substrateTop: 0.08 };

describe("ensureMaterialMap", () => {
  it("builds a uniform map of the default material", () => {
    const m = ensureMaterialMap(undefined, "sahara_sand");
    expect(m.nx).toBeGreaterThanOrEqual(48);
    expect(m.nz).toBeGreaterThanOrEqual(30);
    expect(m.cells.length).toBe(m.nx * m.nz);
    expect(m.ids).toEqual(["sahara_sand"]);
    expect(m.cells.every((c) => c === 0)).toBe(true);
  });

  it("keeps an existing map intact (persistence round-trip)", () => {
    const a = ensureMaterialMap(undefined, "sahara_sand");
    paintMaterial(a, DIMS, 0.5, 0.2, 0.3, "desert_clay");
    const json = JSON.parse(JSON.stringify(a));
    const b = ensureMaterialMap(json, "sahara_sand");
    expect(b.ids).toEqual(a.ids);
    expect(Array.from(b.cells)).toEqual(Array.from(a.cells));
  });

  it("heals a malformed blob back to a uniform default", () => {
    const bad = { nx: 3, nz: 2, ids: ["x"], cells: [0, 1] } as never;
    const m = ensureMaterialMap(bad, "sahara_sand");
    expect(m.cells.length).toBe(m.nx * m.nz);
    expect(m.ids).toEqual(["sahara_sand"]);
  });
});

describe("paintMaterial — the physical brush", () => {
  it("paints only the cells inside the brush radius", () => {
    const m = ensureMaterialMap(undefined, "sahara_sand");
    const changed = paintMaterial(m, DIMS, 0.6, 0.3, 0.25, "desert_clay");
    expect(changed).toBeGreaterThan(0);
    expect(materialIdAt(m, DIMS, 0.6, 0.3)).toBe("desert_clay");
    expect(materialIdAt(m, DIMS, 0.6 + 0.5, 0.3)).toBe("sahara_sand"); // outside the brush
    expect(materialIdAt(m, DIMS, -1.2, -0.7)).toBe("sahara_sand"); // far corner untouched
  });

  it("re-painting the same material over itself changes nothing", () => {
    const m = ensureMaterialMap(undefined, "sahara_sand");
    paintMaterial(m, DIMS, 0.6, 0.3, 0.25, "desert_clay");
    expect(paintMaterial(m, DIMS, 0.6, 0.3, 0.25, "desert_clay")).toBe(0);
  });

  it("registers each new material id once", () => {
    const m = ensureMaterialMap(undefined, "sahara_sand");
    paintMaterial(m, DIMS, 0.6, 0.3, 0.2, "desert_clay");
    paintMaterial(m, DIMS, -0.6, -0.3, 0.2, "rocky_mix");
    paintMaterial(m, DIMS, 0.0, 0.0, 0.2, "desert_clay");
    expect(m.ids).toEqual(["sahara_sand", "desert_clay", "rocky_mix"]);
  });

  it("clamps to the floor bounds (painting at the glass never throws)", () => {
    const m = ensureMaterialMap(undefined, "sahara_sand");
    expect(() => paintMaterial(m, DIMS, DIMS.width, DIMS.depth, 0.4, "desert_clay")).not.toThrow();
  });
});

describe("coverage + dominance", () => {
  it("coverage fractions sum to 1 and follow the painted area", () => {
    const m = ensureMaterialMap(undefined, "sahara_sand");
    paintMaterial(m, DIMS, 0, 0, 0.5, "desert_clay");
    const cov = coverageFractions(m);
    const total = [...cov.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(cov.get("desert_clay")!).toBeGreaterThan(0.05);
    expect(cov.get("sahara_sand")!).toBeGreaterThan(0.5);
  });

  it("dominantMaterialId is the most-covered material", () => {
    const m = ensureMaterialMap(undefined, "sahara_sand");
    expect(dominantMaterialId(m)).toBe("sahara_sand");
    // Flood most of the floor with clay.
    for (let x = -1.4; x <= 1.4; x += 0.3) {
      for (let z = -0.9; z <= 0.9; z += 0.3) {
        paintMaterial(m, DIMS, x, z, 0.3, "desert_clay");
      }
    }
    expect(dominantMaterialId(m)).toBe("desert_clay");
  });
});

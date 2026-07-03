/**
 * TERRAIN / SUBSTRATE REGISTRY — the data behind the Terrain drawer's Materials
 * row (reference: Designs/Gecko "Terrain Mode"). Every swatch card, its info
 * strip, the applied sand palette and the humidity model read from this ONE
 * data-driven list, so adding terrain #9 is one entry + one swatch PNG.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TERRAIN_ID,
  TERRAINS,
  terrainById,
  terrainUnlocked,
  terrainsFor,
  type TerrainDef,
} from "../src/data/terrains";

const HEX = /^#[0-9a-f]{6}$/i;

describe("terrain registry — integrity", () => {
  it("ships the eight reference materials, desert options first", () => {
    expect(TERRAINS.map((t) => t.id)).toEqual([
      "sahara_sand",
      "soft_dune_sand",
      "desert_clay",
      "rocky_mix",
      "pebble_gravel",
      "dune_ridge",
      "bioactive_soil",
      "mossy_soil",
    ]);
  });

  it("every entry is complete: name, description, 2–4 tags, swatch art path", () => {
    for (const t of TERRAINS) {
      expect(t.name.length, t.id).toBeGreaterThan(2);
      expect(t.description.length, t.id).toBeGreaterThan(12);
      expect(t.tags.length, t.id).toBeGreaterThanOrEqual(2);
      expect(t.tags.length, t.id).toBeLessThanOrEqual(4);
      expect(t.swatch, t.id).toBe(`/assets/ui/terrain/${t.id}.png`);
    }
  });

  it("ids and names are unique", () => {
    expect(new Set(TERRAINS.map((t) => t.id)).size).toBe(TERRAINS.length);
    expect(new Set(TERRAINS.map((t) => t.name)).size).toBe(TERRAINS.length);
  });

  it("design stats are all 0..1 bands", () => {
    for (const t of TERRAINS) {
      for (const [k, v] of Object.entries(t.stats)) {
        expect(v, `${t.id}.${k}`).toBeGreaterThanOrEqual(0);
        expect(v, `${t.id}.${k}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("sand palettes are six valid hex colours + a sane speckle density + a texture style", () => {
    const STYLES = ["sand", "pebbles", "clay", "rocky", "ripples", "litter", "moss"];
    for (const t of TERRAINS) {
      const p = t.palette;
      for (const c of [p.base, p.patchDark, p.patchLight, p.grainDark, p.grainLight, p.coarse]) {
        expect(c, t.id).toMatch(HEX);
      }
      expect(p.coarseCount, t.id).toBeGreaterThanOrEqual(200);
      expect(p.coarseCount, t.id).toBeLessThanOrEqual(4000);
      expect(STYLES, t.id).toContain(p.style);
    }
  });

  it("each material draws its REAL surface features, not just a tint", () => {
    expect(terrainById("pebble_gravel")!.palette.style).toBe("pebbles");
    expect(terrainById("desert_clay")!.palette.style).toBe("clay");
    expect(terrainById("rocky_mix")!.palette.style).toBe("rocky");
    expect(terrainById("dune_ridge")!.palette.style).toBe("ripples");
    expect(terrainById("bioactive_soil")!.palette.style).toBe("litter");
    expect(terrainById("mossy_soil")!.palette.style).toBe("moss");
  });

  it("the default terrain is Sahara Sand and keeps the live sand's exact base tone", () => {
    expect(DEFAULT_TERRAIN_ID).toBe("sahara_sand");
    const sahara = terrainById("sahara_sand")!;
    // Continuity: applying the default must look like the shipped terrarium.
    expect(sahara.palette.base.toLowerCase()).toBe("#d8bd8c");
    expect(sahara.substrateType).toBe("sand");
  });

  it("humidity model params stay in believable bands", () => {
    for (const t of TERRAINS) {
      expect(t.humidityBase, t.id).toBeGreaterThanOrEqual(30);
      expect(t.humidityBase, t.id).toBeLessThanOrEqual(50);
      expect(t.humidityHold, t.id).toBeGreaterThanOrEqual(0.5);
      expect(t.humidityHold, t.id).toBeLessThanOrEqual(1.5);
    }
  });

  it("humid substrates hold more moisture than the desert sands", () => {
    const sahara = terrainById("sahara_sand")!;
    const bio = terrainById("bioactive_soil")!;
    const mossy = terrainById("mossy_soil")!;
    expect(bio.stats.humidity).toBeGreaterThan(sahara.stats.humidity);
    expect(mossy.stats.humidity).toBeGreaterThan(sahara.stats.humidity);
    expect(bio.humidityHold).toBeGreaterThan(sahara.humidityHold);
  });
});

describe("terrain registry — unlock gating per habitat", () => {
  it("the gecko terrarium unlocks the six desert substrates", () => {
    const unlocked = TERRAINS.filter((t) => terrainUnlocked(t, "lizard_terrarium")).map((t) => t.id);
    expect(unlocked).toEqual([
      "sahara_sand",
      "soft_dune_sand",
      "desert_clay",
      "rocky_mix",
      "pebble_gravel",
      "dune_ridge",
    ]);
  });

  it("bioactive + mossy soils stay locked in the desert (future humid habitats)", () => {
    const bio = terrainById("bioactive_soil")!;
    const mossy = terrainById("mossy_soil")!;
    expect(terrainUnlocked(bio, "lizard_terrarium")).toBe(false);
    expect(terrainUnlocked(mossy, "lizard_terrarium")).toBe(false);
    // …but they are real content, already unlockable in a tropical build.
    expect(terrainUnlocked(bio, "tropical_terrarium")).toBe(true);
    expect(terrainUnlocked(mossy, "tropical_terrarium")).toBe(true);
  });

  it("terrainsFor lists every terrain for the habitat, unlocked first, order stable", () => {
    const list = terrainsFor("lizard_terrarium");
    expect(list.map((t: TerrainDef) => t.id)).toEqual(TERRAINS.map((t) => t.id));
  });

  it("terrainById returns null for unknown ids", () => {
    expect(terrainById("linoleum")).toBeNull();
  });
});

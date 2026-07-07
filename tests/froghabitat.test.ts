import { beforeEach, describe, expect, it } from "vitest";
import {
  FROG_DIMENSIONS,
  FROG_HABITAT_ID,
  FROG_POND,
  FROG_WORLD_SCALE,
  applyFrogTints,
  makeColorfulFrog,
  makeFrogHabitatLayout,
  makeFrogHabitatState,
  rehydrateFrogLayout,
} from "../src/habitats/frog/FrogHabitatData";
import { enclosureSpec } from "../src/habitats/EnclosureSpec";
import { computeScores } from "../src/habitats/HabitatStats";
import { deriveEnvironment } from "../src/habitats/HabitatState";
import { saveHabitat, loadHabitat, clearHabitat, habitatKey } from "../src/habitats/HabitatSaveLoad";
import { terrainById, terrainUnlocked } from "../src/data/terrains";

/** Minimal in-memory localStorage so HabitatSaveLoad runs under Node. */
class MemStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  getItem(k: string): string | null {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, String(v));
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
  key(i: number): string | null {
    return Array.from(this.store.keys())[i] ?? null;
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});

describe("frog habitat data", () => {
  it("derives a valid enclosure from the authored dimensions", () => {
    const spec = enclosureSpec(FROG_DIMENSIONS);
    expect(spec.walk.minX).toBeLessThan(spec.walk.maxX);
    expect(spec.walk.minZ).toBeLessThan(spec.walk.maxZ);
    expect(spec.interior.height).toBe(FROG_DIMENSIONS.height);
    // A tall tank — taller than it is deep (arboreal species).
    expect(FROG_DIMENSIONS.height).toBeGreaterThan(FROG_DIMENSIONS.depth);
  });

  it("keeps every floor object inside the shared walk/placement rectangle", () => {
    const layout = makeFrogHabitatLayout();
    const spec = enclosureSpec(FROG_DIMENSIONS);
    for (const o of layout.objects) {
      expect(o.position[0], o.id).toBeGreaterThanOrEqual(spec.placement.minX);
      expect(o.position[0], o.id).toBeLessThanOrEqual(spec.placement.maxX);
      expect(o.position[2], o.id).toBeGreaterThanOrEqual(spec.placement.minZ);
      expect(o.position[2], o.id).toBeLessThanOrEqual(spec.placement.maxZ);
    }
  });

  it("keeps the pond fully inside the interior glass", () => {
    const spec = enclosureSpec(FROG_DIMENSIONS);
    expect(FROG_POND.x - FROG_POND.rx).toBeGreaterThan(spec.interior.minX);
    expect(FROG_POND.x + FROG_POND.rx).toBeLessThan(spec.interior.maxX);
    expect(FROG_POND.z - FROG_POND.rz).toBeGreaterThan(spec.interior.minZ);
    expect(FROG_POND.z + FROG_POND.rz).toBeLessThan(spec.interior.maxZ);
  });

  it("is a humid tropical layout: mister equipment + humid zone + mossy substrate", () => {
    const layout = makeFrogHabitatLayout();
    expect(layout.type).toBe("tropical_terrarium");
    expect(layout.equipment.some((e) => e.kind === "mister")).toBe(true);
    expect(layout.equipment.some((e) => e.kind === "canopy_light")).toBe(true);
    expect(layout.zones.some((z) => z.kind === "humid")).toBe(true);
    expect(layout.substrate.terrainId).toBe("mossy_soil");
    // The mister seeds a wetter starting environment.
    const env = deriveEnvironment(layout);
    expect(env.humidity).toBeGreaterThanOrEqual(45);
    // Gentle tropical temps, never a desert basking blast.
    const warm = layout.zones.find((z) => z.kind === "basking");
    expect(warm?.temperatureC).toBeLessThanOrEqual(29);
  });

  it("scores as a real habitat (hides + climbing + humidity all contribute)", () => {
    const s = computeScores(makeFrogHabitatLayout());
    expect(s.overall).toBeGreaterThan(40);
    expect(s.climbing).toBeGreaterThan(30);
    expect(s.humidity).toBeGreaterThan(20);
  });

  it("moss / leaf-litter / bioactive substrates are unlocked for it, desert sands are not locked away from the gecko", () => {
    const layout = makeFrogHabitatLayout();
    for (const id of ["mossy_soil", "leaf_litter", "bioactive_soil"]) {
      const t = terrainById(id);
      expect(t, id).toBeTruthy();
      expect(terrainUnlocked(t!, layout.type), id).toBe(true);
      // Still locked in the desert vivarium.
      expect(terrainUnlocked(t!, "lizard_terrarium"), id).toBe(false);
    }
    expect(terrainUnlocked(terrainById("sahara_sand")!, "lizard_terrarium")).toBe(true);
  });

  it("re-applies jungle tints after a catalog rehydrate", () => {
    const layout = makeFrogHabitatLayout();
    const grass = layout.objects.find((o) => o.id === "grass_a")!;
    const jungleTint = grass.tint;
    expect(jungleTint).toBeDefined();
    rehydrateFrogLayout(layout); // resets to catalog tints, then re-stamps ours
    expect(layout.objects.find((o) => o.id === "grass_a")!.tint).toBe(jungleTint);
    // applyFrogTints alone is idempotent.
    applyFrogTints(layout);
    expect(layout.objects.find((o) => o.id === "grass_a")!.tint).toBe(jungleTint);
  });

  it("persists under its own save key and round-trips", () => {
    clearHabitat(FROG_HABITAT_ID);
    const state = makeFrogHabitatState();
    state.environment.humidity = 77;
    state.animals[0].needs.hydration = 64;
    expect(saveHabitat(state)).toBe(true);
    expect(habitatKey(FROG_HABITAT_ID)).toContain(FROG_HABITAT_ID);
    const loaded = loadHabitat(FROG_HABITAT_ID);
    expect(loaded).toBeTruthy();
    expect(loaded!.layout.id).toBe(FROG_HABITAT_ID);
    expect(loaded!.environment.humidity).toBe(77);
    expect(loaded!.animals[0].needs.hydration).toBe(64);
    clearHabitat(FROG_HABITAT_ID);
  });

  it("the frog animal starts healthy with a hydration store", () => {
    const frog = makeColorfulFrog();
    expect(frog.speciesId).toBe("colorful_frog");
    expect(frog.needs.hydration).toBeGreaterThan(50);
    expect(FROG_WORLD_SCALE).toBeGreaterThan(1);
  });
});

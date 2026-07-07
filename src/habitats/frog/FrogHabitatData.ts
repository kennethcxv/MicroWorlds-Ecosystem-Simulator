/**
 * Authored RAINFOREST PALUDARIUM — "Emerald Hollow", the colorful frog's home.
 * A tall planted humid tank (Exo-Terra 60×45×60 proportions at the shared
 * habitat world scale): mossy soil + leaf-litter floor, a shallow pond in the
 * front-right corner, a twisted climbing root, an elevated perch branch, a
 * mossy rock cluster + cool hide, hanging vines, and a mister + canopy light
 * on the screen top.
 *
 * This is DATA — `ThreeFrogScene` consumes it. Same contract as
 * LizardHabitatData: every piece is a catalog PlacedObject (real GLBs where
 * they exist, honest procedural placeholders otherwise), zones/equipment feed
 * the environment + score, and the whole state persists through
 * HabitatSaveLoad under its own id.
 */
import type { HabitatAnimal, HabitatCamera, HabitatDimensions, HabitatLayout, HabitatState, PlacedObject } from "../HabitatTypes";
import { findPlaceable, makePlaced, rehydrateLayoutAssets } from "../HabitatBuilder";
import { enclosureSpec } from "../EnclosureSpec";
import { createHabitatState } from "../HabitatState";
import { paintMaterial, type SubstrateMaterialMap } from "../HabitatMaterialMap";

export const FROG_HABITAT_ID = "emerald-hollow";

/** Habitat-world metres per real metre (the gecko's 36" tank is 3.0 wide) —
 *  creature-registry sizes are REAL metres, so frog + feeder models scale up
 *  by this factor inside the paludarium. */
export const FROG_WORLD_SCALE = 3.3;

/** Tall tree-frog tank (60×45×60 cm class) at the shared world scale. */
export const FROG_DIMENSIONS: HabitatDimensions = {
  width: 2.0,
  depth: 1.5,
  height: 2.0,
  glass: 0.05,
  substrateTop: 0.09,
};

const GY = FROG_DIMENSIONS.substrateTop;

/** The pond pool in the front-right corner (an ellipse on the floor). The
 *  scene renders the water; navigation treats it as ordinary (shallow) ground
 *  the frog may sit in — sitting in it restores hydration. */
export interface PondSpec {
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** How far the water surface sits below the substrate top. */
  dip: number;
}

export const FROG_POND: PondSpec = { x: 0.52, z: 0.38, rx: 0.34, rz: 0.24, dip: 0.014 };

export function insidePond(x: number, z: number, pond: PondSpec = FROG_POND): boolean {
  const dx = (x - pond.x) / pond.rx;
  const dz = (z - pond.z) / pond.rz;
  return dx * dx + dz * dz <= 1;
}

/** Deep-jungle recolours for the reused desert defs (applied AFTER
 *  rehydrateLayoutAssets, which resets tints to the catalog's). */
const FROG_TINTS: Record<string, number> = {
  mossy_rocks: 0x6f7a52,
  cool_hide: 0x5f6650,
  grass_a: 0x3f7d4f,
  grass_b: 0x4f8f5a,
  grass_c: 0x2f6b44,
  vine_a: 0x3d7a36,
  vine_b: 0x46883f,
};

function place(defId: string, id: string, x: number, z: number, rotationY = 0, y = GY): PlacedObject {
  const def = findPlaceable(defId);
  if (!def) throw new Error(`Unknown placeable: ${defId}`);
  return makePlaced(def, id, [x, y, z], rotationY);
}

function scaled(o: PlacedObject, s: number): PlacedObject {
  o.scale = [s, s, s];
  return o;
}

const SPEC = enclosureSpec(FROG_DIMENSIONS);
const CAMERA: HabitatCamera = { fov: 35, position: SPEC.cameraHome, target: SPEC.cameraTarget };

export function makeFrogHabitatLayout(): HabitatLayout {
  const layout: HabitatLayout = {
    id: FROG_HABITAT_ID,
    name: "Emerald Hollow",
    type: "tropical_terrarium",
    dimensions: FROG_DIMENSIONS,
    camera: CAMERA,
    substrate: { type: "soil", color: 0x63604a, depth: GY, terrainId: "mossy_soil" },
    objects: [
      // The climbing centerpiece: a twisted root mid-floor (real GLB).
      scaled(place("branch_log", "climbing_root", -0.12, -0.16, 0.8), 1.35),
      // An ELEVATED perch branch lying across the back-right corner —
      // tree-frog headroom (near-horizontal so it reads as a branch from the
      // front, its far end anchored toward the glass).
      scaled(place("climb_branch", "perch_branch", 0.58, -0.48, 2.45, GY + 0.72), 0.8),
      // Mossy rock cluster (tinted jungle) back-left.
      scaled(place("rock_cluster", "mossy_rocks", -0.62, -0.38, 0.4), 0.95),
      // A cool hide tucked back-right, behind the pond.
      scaled(place("hide_cave", "cool_hide", 0.58, -0.42, -0.5), 1.35),
      // Grass clumps read as tropical sedge once tinted deep green.
      place("plant_desert_grass", "grass_a", -0.8, 0.42),
      place("plant_desert_grass", "grass_b", 0.08, -0.56, 0.7),
      place("plant_desert_grass", "grass_c", -0.34, 0.52, 2.1),
      // Trailing vines hung high on the back wall.
      place("hanging_vine", "vine_a", -0.55, -0.6, 0, GY + 1.42),
      place("hanging_vine", "vine_b", 0.76, -0.58, 0, GY + 1.3),
    ],
    equipment: [
      {
        id: "mister",
        kind: "mister",
        label: "Misting Nozzles",
        position: [0, 1.94, -0.5],
        power: 1,
        affectsStats: { humidity: 28, enrichment: 4 },
      },
      {
        id: "canopy",
        kind: "canopy_light",
        label: "Canopy Light",
        position: [0, 1.96, 0.05],
        power: 1,
        affectsStats: { basking: 16, enrichment: 6 },
      },
      { id: "thermo", kind: "thermometer", label: "Thermometer", position: [0.9, 1.05, -0.66], power: 1 },
      { id: "hygro", kind: "hygrometer", label: "Hygrometer", position: [0.9, 0.86, -0.66], power: 1 },
    ],
    zones: [
      // Gentle tropical gradient: a warm patch under the canopy light and a
      // cool shaded side — never a desert basking blast.
      { id: "warm", kind: "basking", center: [0, GY, -0.05], radius: 0.4, temperatureC: 27 },
      { id: "cool", kind: "cool", center: [-0.62, GY, -0.4], radius: 0.42, temperatureC: 23 },
      { id: "humid", kind: "humid", center: [FROG_POND.x, GY, FROG_POND.z], radius: 0.5 },
      { id: "feeding", kind: "feeding", center: [-0.28, GY, 0.28], radius: 0.35 },
    ],
  };
  applyFrogTints(layout);
  return layout;
}

/** Re-stamp the jungle recolours (rehydrateLayoutAssets resets tints to the
 *  catalog's desert values — call this after every load/heal). */
export function applyFrogTints(layout: HabitatLayout): void {
  for (const o of layout.objects) {
    const tint = FROG_TINTS[o.id];
    if (tint != null) o.tint = tint;
  }
}

/** Heal a loaded layout: catalog asset paths first, then our jungle tints. */
export function rehydrateFrogLayout(layout: HabitatLayout): void {
  rehydrateLayoutAssets(layout);
  applyFrogTints(layout);
}

/** Pre-paint the floor: mossy soil base, leaf-litter drifts under the plants
 *  and along the back, a bioactive strip by the pond. Pure — testable. */
export function paintFrogFloor(map: SubstrateMaterialMap, dims: HabitatDimensions = FROG_DIMENSIONS): void {
  // Leaf-litter drifts.
  paintMaterial(map, dims, -0.55, 0.35, 0.34, "leaf_litter");
  paintMaterial(map, dims, -0.15, -0.35, 0.3, "leaf_litter");
  paintMaterial(map, dims, 0.15, 0.5, 0.26, "leaf_litter");
  // Rich bioactive soil pooling around the pond + under the hide.
  paintMaterial(map, dims, 0.55, 0.3, 0.3, "bioactive_soil");
  paintMaterial(map, dims, 0.6, -0.45, 0.26, "bioactive_soil");
}

export function makeColorfulFrog(): HabitatAnimal {
  return {
    id: "frog-1",
    speciesId: "colorful_frog",
    name: "Colorful Frog",
    stage: "adult",
    needs: { hunger: 62, stress: 18, health: 95, calcium: 70, bodyCondition: 50, hydration: 80 },
  };
}

export function makeFrogHabitatState(): HabitatState {
  return createHabitatState(makeFrogHabitatLayout(), [makeColorfulFrog()]);
}

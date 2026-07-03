/**
 * TERRAIN / SUBSTRATE REGISTRY — the data-driven list behind the Terrain
 * drawer's Materials row (reference: Designs/Gecko "Terrain Mode" tiles:
 * Desert Sand · Fine Sand · Clay Mix · Rocky Soil · Pebble Mix · Leaf Litter ·
 * Slate Edge · Dune Ridge).
 *
 * ONE entry drives everything about a substrate: the swatch card (real photo
 * cropped from the design reference, public/assets/ui/terrain/), the info
 * strip (description / tags / stat meters), the PROCEDURAL SAND PALETTE the
 * floor regenerates with when the substrate is applied, the bedrock/skirt
 * tint, the ambient-humidity model, and the per-habitat unlock gate. Adding
 * terrain #9 = one entry here + one swatch PNG.
 *
 * Pure data — no DOM/Three imports (unit-tested in tests/terrains.test.ts).
 */
import type { HabitatType, SubstrateType } from "../habitats/HabitatTypes";

export type TerrainTag =
  | "desert"
  | "dry"
  | "soft"
  | "firm"
  | "warm"
  | "rocky"
  | "decorative"
  | "bright"
  | "bioactive"
  | "humid"
  | "living"
  | "mossy"
  | "future";

/** What SURFACE FEATURES the texture generator draws on top of the grain —
 *  each material renders its real look (stones, cracks, ripples…), never
 *  just a tint. */
export type SandTextureStyle = "sand" | "pebbles" | "clay" | "rocky" | "ripples" | "litter" | "moss";

/** Colours + speckle density for the procedural sand texture generator
 *  (ThreeSandTexture.makeSandTexture). Same roles as the shipped desert sand:
 *  a base wash, two soft tone patches, two fine grains and sparse coarse bits,
 *  plus the material's surface-feature style. */
export interface SandPalette {
  base: string;
  patchDark: string;
  patchLight: string;
  grainDark: string;
  grainLight: string;
  coarse: string;
  /** How many sparse coarse speckles (rough mixes read grittier). */
  coarseCount: number;
  /** Surface features drawn on top (real pebbles / cracks / ripples / …). */
  style: SandTextureStyle;
}

export interface TerrainDef {
  id: string;
  name: string;
  description: string;
  tags: TerrainTag[];
  /** Real photo swatch cropped from the design reference. */
  swatch: string;
  /** Procedural floor palette used when this substrate is applied. */
  palette: SandPalette;
  /** Mapping onto the layout's existing Substrate record. */
  substrateType: SubstrateType;
  /** Bedrock + sand-skirt tint (hex number, feeds the vivarium shell). */
  color: number;
  /** Habitats this substrate is available in (the unlock gate). */
  habitats: HabitatType[];
  /** Design stats 0..1 — the info-strip meters (preview, honest bands). */
  stats: {
    heat: number; // heat retention
    humidity: number; // humidity retention
    digging: number; // digging comfort
    cleanliness: number; // how easily it stays clean
    bioactive: number; // cleanup-crew support
  };
  /** Ambient humidity when applied: % ≈ humidityBase + waterFrac·95·humidityHold. */
  humidityBase: number;
  humidityHold: number;
}

export const DEFAULT_TERRAIN_ID = "sahara_sand";

export const TERRAINS: TerrainDef[] = [
  {
    id: "sahara_sand",
    name: "Sahara Sand",
    description: "Warm loose sand for a dry desert habitat.",
    tags: ["desert", "dry", "soft"],
    swatch: "/assets/ui/terrain/sahara_sand.png",
    // EXACTLY the shipped terrarium sand — applying the default changes nothing.
    palette: {
      base: "#d8bd8c",
      patchDark: "#c8a874",
      patchLight: "#e6d3a6",
      grainDark: "#9c8155",
      grainLight: "#f1e6c6",
      coarse: "#7d6440",
      coarseCount: 900,
      style: "sand",
    },
    substrateType: "sand",
    color: 0xd9c19a,
    habitats: ["lizard_terrarium", "desert_terrarium"],
    stats: { heat: 0.8, humidity: 0.15, digging: 0.6, cleanliness: 0.6, bioactive: 0.1 },
    humidityBase: 38,
    humidityHold: 1.0,
  },
  {
    id: "soft_dune_sand",
    name: "Soft Dune Sand",
    description: "Pale, fine sand with a smooth cozy look.",
    tags: ["soft", "desert", "bright"],
    swatch: "/assets/ui/terrain/soft_dune_sand.png",
    palette: {
      base: "#e4d4ac",
      patchDark: "#d3bf92",
      patchLight: "#f2e7c8",
      grainDark: "#b39d72",
      grainLight: "#faf2dc",
      coarse: "#937e58",
      coarseCount: 480,
      style: "sand",
    },
    substrateType: "sand",
    color: 0xe0d0a8,
    habitats: ["lizard_terrarium", "desert_terrarium"],
    stats: { heat: 0.55, humidity: 0.2, digging: 0.85, cleanliness: 0.7, bioactive: 0.1 },
    humidityBase: 37,
    humidityHold: 0.95,
  },
  {
    id: "desert_clay",
    name: "Desert Clay",
    description: "Firmer reddish substrate that holds shape and warmth.",
    tags: ["desert", "firm", "warm"],
    swatch: "/assets/ui/terrain/desert_clay.png",
    palette: {
      base: "#c9946a",
      patchDark: "#b17a4f",
      patchLight: "#dcaf85",
      grainDark: "#8f5f38",
      grainLight: "#e8c9a4",
      coarse: "#6e421f",
      coarseCount: 700,
      style: "clay",
    },
    substrateType: "soil",
    color: 0xc08a5e,
    habitats: ["lizard_terrarium", "desert_terrarium"],
    stats: { heat: 0.9, humidity: 0.35, digging: 0.35, cleanliness: 0.8, bioactive: 0.15 },
    humidityBase: 41,
    humidityHold: 1.1,
  },
  {
    id: "rocky_mix",
    name: "Rocky Mix",
    description: "Pebbles and rough ground for a natural arid look.",
    tags: ["rocky", "dry", "decorative"],
    swatch: "/assets/ui/terrain/rocky_mix.png",
    palette: {
      base: "#b09677",
      patchDark: "#967c5e",
      patchLight: "#c7af8e",
      grainDark: "#6d563c",
      grainLight: "#d9c6a4",
      coarse: "#4a3826",
      coarseCount: 2400,
      style: "rocky",
    },
    substrateType: "gravel",
    color: 0xa08a6a,
    habitats: ["lizard_terrarium", "desert_terrarium"],
    stats: { heat: 0.75, humidity: 0.15, digging: 0.15, cleanliness: 0.85, bioactive: 0.1 },
    humidityBase: 37,
    humidityHold: 0.85,
  },
  {
    id: "pebble_gravel",
    name: "Pebble Gravel",
    description: "Loose stone mix with crisp drainage and a hard-wearing floor.",
    tags: ["rocky", "dry", "decorative"],
    swatch: "/assets/ui/terrain/pebble_gravel.png",
    palette: {
      base: "#ac9f8b",
      patchDark: "#92856f",
      patchLight: "#c2b6a1",
      grainDark: "#6e6350",
      grainLight: "#d8cdb9",
      coarse: "#514736",
      coarseCount: 3000,
      style: "pebbles",
    },
    substrateType: "gravel",
    color: 0xa2957f,
    habitats: ["lizard_terrarium", "desert_terrarium"],
    stats: { heat: 0.65, humidity: 0.1, digging: 0.1, cleanliness: 0.9, bioactive: 0.1 },
    humidityBase: 36,
    humidityHold: 0.8,
  },
  {
    id: "dune_ridge",
    name: "Dune Ridge",
    description: "Deep golden sand that holds wind-carved ripples and dunes.",
    tags: ["desert", "dry", "warm"],
    swatch: "/assets/ui/terrain/dune_ridge.png",
    palette: {
      base: "#d2ab6c",
      patchDark: "#bc9254",
      patchLight: "#e5c68d",
      grainDark: "#9a7642",
      grainLight: "#f0dbae",
      coarse: "#7c5c30",
      coarseCount: 820,
      style: "ripples",
    },
    substrateType: "sand",
    color: 0xcaa365,
    habitats: ["lizard_terrarium", "desert_terrarium"],
    stats: { heat: 0.85, humidity: 0.15, digging: 0.75, cleanliness: 0.55, bioactive: 0.1 },
    humidityBase: 38,
    humidityHold: 1.0,
  },
  {
    id: "bioactive_soil",
    name: "Bioactive Soil",
    description: "Rich living substrate for cleanup crews and planted habitats.",
    tags: ["bioactive", "humid", "living"],
    swatch: "/assets/ui/terrain/bioactive_soil.png",
    palette: {
      base: "#7a5c3a",
      patchDark: "#64482b",
      patchLight: "#8f7049",
      grainDark: "#4a3620",
      grainLight: "#a68858",
      coarse: "#332413",
      coarseCount: 1400,
      style: "litter",
    },
    substrateType: "bioactive",
    color: 0x6f5434,
    habitats: ["tropical_terrarium"],
    stats: { heat: 0.5, humidity: 0.9, digging: 0.6, cleanliness: 0.5, bioactive: 1 },
    humidityBase: 46,
    humidityHold: 1.35,
  },
  {
    id: "mossy_soil",
    name: "Mossy Soil",
    description: "Soft damp substrate for humid rainforest habitats.",
    tags: ["humid", "mossy", "future"],
    swatch: "/assets/ui/terrain/mossy_soil.png",
    palette: {
      base: "#6f6a4c",
      patchDark: "#585637",
      patchLight: "#857f5e",
      grainDark: "#45452c",
      grainLight: "#9c987a",
      coarse: "#2f3120",
      coarseCount: 1200,
      style: "moss",
    },
    substrateType: "soil",
    color: 0x63604a,
    habitats: ["tropical_terrarium"],
    stats: { heat: 0.35, humidity: 0.95, digging: 0.55, cleanliness: 0.45, bioactive: 0.9 },
    humidityBase: 46,
    humidityHold: 1.4,
  },
];

export function terrainById(id: string): TerrainDef | null {
  return TERRAINS.find((t) => t.id === id) ?? null;
}

/** Is this substrate available (not locked) in the given habitat? */
export function terrainUnlocked(t: TerrainDef, habitat: HabitatType): boolean {
  return t.habitats.includes(habitat);
}

/** Every terrain, in display order, for a habitat's Materials row (locked
 *  entries included — they render as future unlocks, never hidden). */
export function terrainsFor(_habitat: HabitatType): TerrainDef[] {
  return TERRAINS;
}

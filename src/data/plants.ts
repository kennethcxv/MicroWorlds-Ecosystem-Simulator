/**
 * Aquatic plant catalogue. `trim` is the tight alpha box (image-normalized).
 * `heightFrac` is the plant's content height as a fraction of the tank interior
 * height; the renderer derives width from the sprite's real aspect ratio.
 *
 * Plants contribute small, readable bonuses to oxygen + cleanliness in the sim.
 */
import type { TrimBox } from "./species";

export interface Plant {
  id: string;
  name: string;
  asset: string; // key into ASSETS.plants
  trim: TrimBox;
  heightFrac: number;
  /** Per-plant oxygen contribution. */
  oxygen: number;
  /** Per-plant cleanliness / nitrate-uptake contribution. */
  cleanliness: number;
  /** Sway amplitude as a fraction of interior height. */
  sway: number;
  /** Sway speed multiplier. */
  swaySpeed: number;
  /**
   * Sprite base is foggy / fills the frame (javafern, fernbush). The renderer
   * sinks the base further below the substrate so only clean foliage shows.
   */
  sinkBase?: number;
  tint?: number;
}

export const PLANTS: Record<string, Plant> = {
  plant_vallis: {
    id: "plant_vallis",
    name: "Jungle Vallisneria",
    asset: "plant_vallis",
    trim: { x: 0.2393, y: 0.0286, w: 0.5071, h: 0.9286 },
    heightFrac: 0.74,
    oxygen: 0.9,
    cleanliness: 0.5,
    sway: 0.022,
    swaySpeed: 1.0,
    tint: 0.7,
  },
  plant_rotala: {
    id: "plant_rotala",
    name: "Rotala 'Rubra'",
    asset: "plant_rotala",
    trim: { x: 0.2462, y: 0.0846, w: 0.4923, h: 0.8308 },
    heightFrac: 0.5,
    oxygen: 0.7,
    cleanliness: 0.4,
    sway: 0.018,
    swaySpeed: 1.15,
    tint: 0.45,
  },
  plant_anubias: {
    id: "plant_anubias",
    name: "Anubias Nana",
    asset: "plant_anubias",
    trim: { x: 0.0821, y: 0.1964, w: 0.8429, h: 0.6571 },
    heightFrac: 0.26,
    oxygen: 0.4,
    cleanliness: 0.35,
    sway: 0.006,
    swaySpeed: 0.7,
    tint: 0.6,
  },
  plant_javafern: {
    id: "plant_javafern",
    name: "Java Fern",
    asset: "plant_javafern",
    trim: { x: 0.0031, y: 0.0031, w: 0.9922, h: 0.9938 },
    heightFrac: 0.6,
    oxygen: 0.6,
    cleanliness: 0.5,
    sway: 0.012,
    swaySpeed: 0.85,
    sinkBase: 0.1,
    tint: 0.65,
  },
  plant_fernbush: {
    id: "plant_fernbush",
    name: "Water Fern Thicket",
    asset: "plant_fernbush",
    trim: { x: 0.0036, y: 0.0031, w: 0.9911, h: 0.9938 },
    heightFrac: 0.66,
    oxygen: 0.7,
    cleanliness: 0.5,
    sway: 0.014,
    swaySpeed: 0.8,
    sinkBase: 0.12,
    tint: 0.65,
  },
  plant_moss: {
    id: "plant_moss",
    name: "Java Moss",
    asset: "plant_moss",
    trim: { x: 0.1, y: 0.3115, w: 0.8077, h: 0.3962 },
    heightFrac: 0.12,
    oxygen: 0.3,
    cleanliness: 0.6,
    sway: 0.004,
    swaySpeed: 0.6,
    tint: 0.7,
  },
};

export function plantList(): Plant[] {
  return Object.values(PLANTS);
}

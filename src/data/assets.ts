/**
 * Centralized asset path registry. Every image the game loads is referenced
 * through here so paths live in exactly one place. Files live in /public/assets
 * and are served at runtime; `assetUrl` respects Vite's BASE_URL for builds.
 */
import type { TrimBox } from "./species";

function assetUrl(rel: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}assets/${rel}`.replace(/\/{2,}/g, "/").replace(":/", "://");
}

export const ASSETS = {
  room: {
    ecocenter: assetUrl("room/room_ecocenter.png"),
    apothecary: assetUrl("room/room_apothecary.png"),
  },
  tank: {
    stand: assetUrl("tank/stand_cabinet.png"),
    glass: assetUrl("tank/tank_glass.png"),
    substrate: assetUrl("tank/substrate.png"),
  },
  hardscape: {
    driftwood_log: assetUrl("hardscape/driftwood_log.png"),
    driftwood_branch: assetUrl("hardscape/driftwood_branch.png"),
    driftwood_diagonal: assetUrl("hardscape/driftwood_diagonal.png"),
    rock_seiryu: assetUrl("hardscape/rock_seiryu.png"),
    rock_boulders: assetUrl("hardscape/rock_boulders.png"),
  },
  plants: {
    plant_vallis: assetUrl("plants/plant_vallis.png"),
    plant_rotala: assetUrl("plants/plant_rotala.png"),
    plant_anubias: assetUrl("plants/plant_anubias.png"),
    plant_javafern: assetUrl("plants/plant_javafern.png"),
    plant_fernbush: assetUrl("plants/plant_fernbush.png"),
    plant_moss: assetUrl("plants/plant_moss.png"),
  },
  creatures: {
    harlequin_rasbora: assetUrl("creatures/harlequin_rasbora.png"),
    celestial_pearl_danio: assetUrl("creatures/celestial_pearl_danio.png"),
    dwarf_gourami: assetUrl("creatures/dwarf_gourami.png"),
    panda_cory: assetUrl("creatures/panda_cory.png"),
    betta: assetUrl("creatures/betta.png"),
    guppy: assetUrl("creatures/guppy.png"),
    platy: assetUrl("creatures/platy.png"),
    cherry_shrimp: assetUrl("creatures/cherry_shrimp.png"),
    amano_shrimp: assetUrl("creatures/amano_shrimp.png"),
    nerite_snail: assetUrl("creatures/nerite_snail.png"),
    mystery_snail: assetUrl("creatures/mystery_snail.png"),
  },
} as const;

/** Tight alpha content boxes for the big scene plates (image-normalized). */
export const SCENE_TRIM: Record<"glass" | "substrate" | "stand", TrimBox> = {
  glass: { x: 0.038, y: 0.1307, w: 0.924, h: 0.7387 },
  substrate: { x: 0.0182, y: 0.376, w: 0.9636, h: 0.4087 },
  stand: { x: 0.048, y: 0.2453, w: 0.902, h: 0.5493 },
};

/** Flat list of every URL, for the preloader. */
export function allAssetUrls(): string[] {
  const urls: string[] = [];
  for (const group of Object.values(ASSETS)) {
    for (const url of Object.values(group)) urls.push(url as string);
  }
  return urls;
}

export type CreatureAssetKey = keyof typeof ASSETS.creatures;
export type PlantAssetKey = keyof typeof ASSETS.plants;
export type HardscapeAssetKey = keyof typeof ASSETS.hardscape;

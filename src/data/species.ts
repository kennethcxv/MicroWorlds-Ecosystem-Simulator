/**
 * Renderable species catalogue — the subset of the codex that currently has
 * real PNG art and is instantiated inside the tank.
 *
 * Descriptive fields (name, latin, rarity, temperature, diet) are DERIVED from
 * the authoritative `AQUATIC_CODEX` (mined from the stats bible) so there is one
 * source of truth. Each entry only specifies its tuned on-screen render/sim
 * values: sprite asset, behavior, on-screen size, swim zone/speed, the
 * sim-balance bioload coefficient, and a flavour blurb.
 *
 * `trim` is the tight alpha content box of each source sprite (normalized to
 * the image), pre-measured from the PNGs. The renderer uses it to size and
 * place creatures by their *actual* body, ignoring transparent padding — this
 * is what stops sprites from looking pasted/oversized.
 *
 * All sprites face LEFT (head at the left). The renderer flips for rightward swim.
 */
import { AQUATIC_CODEX } from "./aquaticCodex";

export type Rarity = "Common" | "Uncommon" | "Rare" | "Legendary";

export type CreatureType = "fish" | "shrimp" | "snail";

/** Swim/role behavior — drives spawn zone + motion style in the renderer. */
export type Behavior = "school" | "centerpiece" | "mid" | "bottom" | "grazer";

export interface TrimBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Species {
  id: string;
  name: string;
  latin: string;
  type: CreatureType;
  rarity: Rarity;
  asset: string; // key into ASSETS.creatures
  behavior: Behavior;
  /** Content width as a fraction of the tank interior width (on-screen size). */
  sizeFrac: number;
  /** Vertical band the creature occupies: 0 = surface, 1 = substrate. */
  zone: [number, number];
  /** Base horizontal swim speed (interior widths per second). */
  speed: number;
  /** Relative waste contribution per individual (fish dirty, inverts clean). */
  bioload: number;
  /** Preferred temperature band, for health + shop care info. */
  tempRange: [number, number];
  diet: string;
  /** One-liner for shop/journal. */
  blurb: string;
  /** How strongly to apply underwater teal grade (0..1). */
  tint?: number;
}

/** Tuned render/sim values for a renderable species; descriptive fields come from the codex. */
interface RenderSpec {
  type: CreatureType;
  asset: string;
  behavior: Behavior;
  sizeFrac: number;
  zone: [number, number];
  speed: number;
  /** Sim-balance waste coefficient (NOT the codex's 1–7 design scale). */
  bioload: number;
  blurb: string;
  tint?: number;
}

/** Build a renderable Species: descriptive fields from the codex, render fields from `spec`. */
function renderable(id: string, spec: RenderSpec): Species {
  const c = AQUATIC_CODEX[id];
  if (!c) throw new Error(`species '${id}' has no entry in AQUATIC_CODEX`);
  return {
    id,
    name: c.common,
    latin: c.scientific,
    type: spec.type,
    rarity: c.rarity,
    asset: spec.asset,
    behavior: spec.behavior,
    sizeFrac: spec.sizeFrac,
    zone: spec.zone,
    speed: spec.speed,
    bioload: spec.bioload,
    tempRange: c.tempC,
    diet: c.diet,
    blurb: spec.blurb,
    tint: spec.tint,
  };
}

export const SPECIES: Record<string, Species> = {
  harlequin_rasbora: renderable("harlequin_rasbora", {
    type: "fish",
    asset: "harlequin_rasbora",
    behavior: "school",
    sizeFrac: 0.058,
    zone: [0.24, 0.52],
    speed: 0.16,
    bioload: 1.0,
    blurb: "A peaceful, shimmering shoaler with a signature black 'pork-chop' wedge.",
    tint: 0.6,
  }),
  celestial_pearl_danio: renderable("celestial_pearl_danio", {
    type: "fish",
    asset: "celestial_pearl_danio",
    behavior: "school",
    sizeFrac: 0.045,
    zone: [0.4, 0.66],
    speed: 0.14,
    bioload: 0.8,
    blurb: "Tiny galaxy-spotted jewels that drift in loose, sparkling clouds.",
    tint: 0.55,
  }),
  dwarf_gourami: renderable("dwarf_gourami", {
    type: "fish",
    asset: "dwarf_gourami",
    behavior: "centerpiece",
    sizeFrac: 0.13,
    zone: [0.3, 0.58],
    speed: 0.072,
    bioload: 2.4,
    blurb: "A jewel-toned centrepiece that cruises the mid-water with calm confidence.",
    tint: 0.5,
  }),
  panda_cory: renderable("panda_cory", {
    type: "fish",
    asset: "panda_cory",
    behavior: "bottom",
    sizeFrac: 0.07,
    zone: [0.84, 0.97],
    speed: 0.1,
    bioload: 1.3,
    blurb: "Busy little catfish that snuffle along the substrate in cheerful gangs.",
    tint: 0.7,
  }),
  cherry_shrimp: renderable("cherry_shrimp", {
    type: "shrimp",
    asset: "cherry_shrimp",
    behavior: "grazer",
    sizeFrac: 0.034,
    zone: [0.82, 0.98],
    speed: 0.04,
    bioload: 0.18,
    blurb: "Ruby-red cleanup crew that grazes biofilm from every surface.",
    tint: 0.55,
  }),
  amano_shrimp: renderable("amano_shrimp", {
    type: "shrimp",
    asset: "amano_shrimp",
    behavior: "grazer",
    sizeFrac: 0.05,
    zone: [0.82, 0.98],
    speed: 0.05,
    bioload: 0.22,
    blurb: "The legendary algae-eater — tireless, translucent, and endlessly busy.",
    tint: 0.5,
  }),
  nerite_snail: renderable("nerite_snail", {
    type: "snail",
    asset: "nerite_snail",
    behavior: "grazer",
    sizeFrac: 0.038,
    zone: [0.8, 0.98],
    speed: 0.012,
    bioload: 0.1,
    blurb: "Patterned grazers that polish glass and rock without breeding in freshwater.",
    tint: 0.4,
  }),
  mystery_snail: renderable("mystery_snail", {
    type: "snail",
    asset: "mystery_snail",
    behavior: "grazer",
    sizeFrac: 0.06,
    zone: [0.8, 0.98],
    speed: 0.014,
    bioload: 0.16,
    blurb: "Gentle giants of the snail world, trundling about on leisurely patrols.",
    tint: 0.4,
  }),
  betta: renderable("betta", {
    type: "fish",
    asset: "betta",
    behavior: "centerpiece",
    sizeFrac: 0.12,
    zone: [0.28, 0.6],
    speed: 0.06,
    bioload: 2.0,
    blurb: "A flowing-finned individualist; stunning, intelligent, and a little vain.",
    tint: 0.45,
  }),
  guppy: renderable("guppy", {
    type: "fish",
    asset: "guppy",
    behavior: "mid",
    sizeFrac: 0.055,
    zone: [0.3, 0.62],
    speed: 0.13,
    bioload: 1.1,
    blurb: "Endlessly colourful livebearers that fill a tank with darting motion.",
    tint: 0.55,
  }),
  platy: renderable("platy", {
    type: "fish",
    asset: "platy",
    behavior: "mid",
    sizeFrac: 0.062,
    zone: [0.32, 0.6],
    speed: 0.11,
    bioload: 1.4,
    blurb: "Hardy, sociable, and always hungry — a perfect first community fish.",
    tint: 0.55,
  }),
};

/** Pre-measured tight content boxes for each creature sprite (image-normalized). */
export const CREATURE_TRIM: Record<string, TrimBox> = {
  harlequin_rasbora: { x: 0.0829, y: 0.2192, w: 0.8494, h: 0.5083 },
  celestial_pearl_danio: { x: 0.0884, y: 0.2505, w: 0.8287, h: 0.442 },
  dwarf_gourami: { x: 0.1464, y: 0.1621, w: 0.7362, h: 0.6906 },
  panda_cory: { x: 0.1036, y: 0.1934, w: 0.8094, h: 0.5709 },
  cherry_shrimp: { x: 0.0159, y: 0.1722, w: 0.9729, h: 0.563 },
  amano_shrimp: { x: 0.0064, y: 0.1786, w: 0.9809, h: 0.5407 },
  nerite_snail: { x: 0.1148, y: 0.1611, w: 0.7815, h: 0.6348 },
  mystery_snail: { x: 0.0925, y: 0.1627, w: 0.8644, h: 0.6523 },
  betta: { x: 0.1008, y: 0.1215, w: 0.797, h: 0.744 },
  guppy: { x: 0.1188, y: 0.256, w: 0.7721, h: 0.5064 },
  platy: { x: 0.1229, y: 0.2118, w: 0.8108, h: 0.5433 },
};

export const RARITY_COLORS: Record<Rarity, string> = {
  Common: "#8fd66a",
  Uncommon: "#5fc9d6",
  Rare: "#b78be8",
  Legendary: "#ecc463",
};

export function speciesList(): Species[] {
  return Object.values(SPECIES);
}

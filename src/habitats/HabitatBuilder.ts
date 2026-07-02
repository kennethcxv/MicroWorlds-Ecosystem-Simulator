/**
 * Foundation for future player-built habitats: enclosure SIZE presets, a catalog
 * of PLACEABLE objects (with default collision + stat effects + placeholder look),
 * a factory to stamp a placeable into the layout, and simple animal-capacity
 * rules. The habitat editor (and the small dev edit-mode) build on these; for now
 * they also drive the authored lizard layout. Pure data.
 */
import type {
  CollisionParams,
  CollisionType,
  HabitatAnimal,
  HabitatDimensions,
  HabitatLayout,
  HabitatScoreInputs,
  HabitatSizeOption,
  ObjectCategory,
  ObstacleInteraction,
  PlacementMode,
  PlaceholderShape,
  PlacedObject,
  Vec3,
} from "./HabitatTypes";

/** Runtime GLB directory (under public/assets/3d/habitats/) the decor lives in. */
export const LIZARD_DECOR_DIR = "lizard/decor/";

// ── Enclosure size presets (metres; ~scaled real terrariums) ─────────────────
export const LIZARD_SIZE_OPTIONS: HabitatSizeOption[] = [
  {
    id: "20gal_long",
    label: '20 Gallon Long (30×12")',
    dimensions: { width: 2.4, depth: 1.5, height: 1.05, glass: 0.05, substrateTop: 0.08 },
    capacity: 1,
  },
  {
    id: "40gal",
    label: '40 Gallon Breeder (36×18")',
    dimensions: { width: 3.0, depth: 1.9, height: 1.3, glass: 0.05, substrateTop: 0.08 },
    capacity: 2,
  },
  {
    id: "4x2",
    label: "4×2 ft PVC Terrarium",
    dimensions: { width: 3.8, depth: 2.1, height: 1.5, glass: 0.06, substrateTop: 0.09 },
    capacity: 3,
  },
];

// ── Placeable catalog ─────────────────────────────────────────────────────────
export interface PlaceableDef {
  id: string; // catalog key
  label: string;
  category: ObjectCategory;
  /** Catalog section for grouping cards (Rocks / Hides / Branches / …). */
  section: string;
  /** Vertical placement mode (floor-locked vs Y-movable). Defaults to "floor". */
  placement?: PlacementMode;
  collidable: boolean;
  collisionType: CollisionType;
  collision?: CollisionParams;
  /** How the animal treats it (route around / climb / step over). */
  interaction?: ObstacleInteraction;
  affectsStats?: Partial<HabitatScoreInputs>;
  shape: PlaceholderShape;
  color: number;
  /** Runtime GLB filename under LIZARD_DECOR_DIR. When present the scene loads the
   *  real model (uniform-scaled to the collision volume) and drops the placeholder;
   *  when absent — or if the GLB fails to load — the procedural placeholder stays. */
  asset?: string;
}

/**
 * Leopard-gecko-appropriate furniture. Collision sizes are the world volume the
 * animal treats as solid; the imported GLB is uniform-scaled to match that
 * footprint (so what you see is roughly what blocks). `interaction` decides route-
 * around vs climb-over vs step-over. Placeholder shapes are the organic fallback
 * used only if a GLB is missing or fails to load.
 */
export const LIZARD_PLACEABLES: PlaceableDef[] = [
  {
    id: "rock_cluster",
    label: "Basking Rock Cluster",
    category: "rock",
    section: "Rocks",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.28, 0.1, 0.24] },
    // Low, flat-topped basking platform the gecko climbs onto.
    interaction: "climbable",
    affectsStats: { basking: 26, climbing: 22, enrichment: 8 },
    shape: "box",
    color: 0x9a8567,
    asset: "desert_rock_cluster_01.glb",
  },
  {
    id: "rock_boulder",
    label: "Rock Mound",
    category: "rock",
    section: "Rocks",
    collidable: true,
    collisionType: "sphere",
    collision: { radius: 0.22 },
    // Bigger, rounded — the gecko routes around this one.
    interaction: "blocked",
    affectsStats: { basking: 6, enrichment: 6, climbing: 10 },
    shape: "sphere",
    color: 0x7c7060,
    asset: "desert_rock_cluster_01.glb",
  },
  {
    id: "hide_cave",
    label: "Rock Hide / Cave",
    category: "hide",
    section: "Hides",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.26, 0.14, 0.24] },
    interaction: "hide",
    affectsStats: { hidingSpots: 56, basking: 4 },
    shape: "cave",
    color: 0x8a7c66,
    asset: "rock_cave_hide_01.glb",
  },
  {
    id: "hide_moist",
    label: "Humid Hide",
    category: "hide",
    section: "Hides",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.2, 0.12, 0.19] },
    interaction: "hide",
    affectsStats: { hidingSpots: 40, humidity: 40 },
    shape: "cave",
    color: 0x6a6152,
    asset: "rock_cave_hide_01.glb",
  },
  {
    id: "branch_log",
    label: "Driftwood",
    category: "branch",
    section: "Branches",
    collidable: true,
    // The supplied driftwood is an upright twisted root — a box footprint fits it
    // far better than a capsule/log.
    collisionType: "box",
    collision: { halfExtents: [0.16, 0.13, 0.16] },
    interaction: "climbable",
    affectsStats: { climbing: 44, enrichment: 12 },
    shape: "branch",
    color: 0x7a5a3a,
    asset: "driftwood_branch_01.glb",
  },
  {
    id: "climb_branch",
    label: "Climbing Branch",
    category: "branch",
    section: "Branches",
    // A raised branch the player can lift off the floor (elevated) for the gecko to
    // clamber under/over. Proves Y-axis placement with a real climbable prop.
    placement: "elevated",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.05, 0.04, 0.26] },
    interaction: "climbable",
    affectsStats: { climbing: 30, enrichment: 12 },
    shape: "branch",
    color: 0x86643f,
  },
  {
    id: "plant_succulent",
    label: "Succulent",
    category: "plant",
    section: "Plants",
    collidable: false,
    collisionType: "none",
    // Non-collidable (compiles to no volume) — the half-extents are only a DISPLAY
    // size hint the renderer scales the GLB/placeholder to.
    collision: { halfExtents: [0.1, 0.13, 0.1] },
    interaction: "softObstacle",
    affectsStats: { enrichment: 10, humidity: 8, climbing: 4 },
    shape: "sphere",
    color: 0x4e7d4a,
    asset: "succulent_01.glb",
  },
  {
    id: "plant_succulent_2",
    label: "Aloe Succulent",
    category: "plant",
    section: "Plants",
    collidable: false,
    collisionType: "none",
    collision: { halfExtents: [0.11, 0.14, 0.11] },
    interaction: "softObstacle",
    affectsStats: { enrichment: 10, humidity: 8, climbing: 4 },
    shape: "sphere",
    color: 0x5c8a4a,
    asset: "succulent_02.glb",
  },
  {
    id: "hanging_vine",
    label: "Hanging Vine",
    category: "plant",
    section: "Hanging",
    // A trailing vine that hangs from above — Y-movable; when lifted clear of the
    // gecko's head it does not block the floor (see OVERHEAD_CLEARANCE).
    placement: "hanging",
    collidable: false,
    collisionType: "none",
    collision: { halfExtents: [0.07, 0.22, 0.07] },
    interaction: "softObstacle",
    affectsStats: { enrichment: 12, humidity: 12, climbing: 6 },
    shape: "sphere",
    color: 0x4f7a3e,
  },
  {
    id: "dish_water",
    label: "Water Dish",
    category: "dish",
    section: "Dishes",
    collidable: true,
    collisionType: "sphere",
    collision: { radius: 0.12 },
    interaction: "blocked",
    affectsStats: { humidity: 30, enrichment: 5 },
    shape: "dish",
    color: 0x8c7d63,
    asset: "water_dish_stone_01.glb",
  },
  {
    id: "dish_food",
    label: "Feeding Dish",
    category: "dish",
    section: "Dishes",
    collidable: true,
    collisionType: "sphere",
    collision: { radius: 0.11 },
    // Common-sense rule: an animal never STANDS in its food. The dish is a
    // hard no-step zone; the gecko eats over the rim with its snout (the same
    // snout-slack reach that hunts food against the glass).
    interaction: "blocked",
    affectsStats: { enrichment: 5 },
    shape: "dish",
    color: 0x8c7d63,
    asset: "food_dish_stone_01.glb",
  },
];

export function findPlaceable(id: string): PlaceableDef | undefined {
  return LIZARD_PLACEABLES.find((p) => p.id === id);
}

/** Stamp a placeable into a concrete PlacedObject at a position/rotation/scale.
 *  `scale` is a uniform-ish multiplier on the natural display size (default 1×). */
export function makePlaced(
  def: PlaceableDef,
  id: string,
  position: Vec3,
  rotationY = 0,
  scale: Vec3 = [1, 1, 1],
): PlacedObject {
  return {
    id,
    defId: def.id,
    label: def.label,
    category: def.category,
    asset: def.asset ? LIZARD_DECOR_DIR + def.asset : undefined,
    placeholder: !def.asset,
    position,
    rotation: [0, rotationY, 0],
    scale,
    collidable: def.collidable,
    collisionType: def.collisionType,
    collision: def.collision ? { ...def.collision } : undefined,
    interaction: def.interaction,
    placement: def.placement ?? "floor",
    affectsStats: def.affectsStats ? { ...def.affectsStats } : undefined,
    shape: def.shape,
    color: def.color,
  };
}

/**
 * SELF-HEAL a layout loaded from a save: re-derive each object's current `asset`
 * path from its `defId` (so a save made before the decor pipeline — or before an
 * asset path changed — still loads the real GLB instead of a placeholder), and DROP
 * any persisted `assetFootprint` so collision is always re-measured from the live
 * mesh. Player edits (position / rotation / scale / interaction) are left untouched.
 * Idempotent; safe to call on a fresh default layout too.
 */
export function rehydrateLayoutAssets(layout: HabitatLayout): void {
  for (const o of layout.objects) {
    if (o.defId) {
      const def = findPlaceable(o.defId);
      if (def?.asset) o.asset = LIZARD_DECOR_DIR + def.asset;
    }
    // Never trust a persisted footprint — it's re-measured from the GLB on load.
    if (o.assetFootprint) delete o.assetFootprint;
    // Heal the old "step-over food dish" rule in saves: animals never stand in
    // their food — dishes are hard no-step zones now.
    if (o.category === "dish" && o.interaction === "lowObstacle") o.interaction = "blocked";
  }
}

// ── Capacity rules ────────────────────────────────────────────────────────────
/** Rough recommended animal count from floor area (a game rule, not vet advice). */
export function animalCapacity(d: HabitatDimensions): number {
  const areaCm2 = d.width * d.depth; // arbitrary m² units in this toy scale
  return Math.max(1, Math.round(areaCm2 / 2.4));
}

/** Returns a crowding warning string, or null if within capacity. */
export function capacityWarning(layout: HabitatLayout, animals: HabitatAnimal[]): string | null {
  const cap = animalCapacity(layout.dimensions);
  if (animals.length > cap) {
    return `Crowded: ${animals.length} animals for a recommended ${cap}. Expect higher stress.`;
  }
  return null;
}

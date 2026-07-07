/**
 * Foundation for player-built habitats: enclosure SIZE presets, the DECOR CATALOG
 * of placeable objects (collision + stat effects + card copy + placeholder look),
 * a factory to stamp a placeable into the layout, and simple animal-capacity
 * rules. The Decorate editor builds on these; they also drive the authored lizard
 * layout. Pure data — no Three.js / DOM.
 *
 * CATALOG RULES (v13 Decorate pass):
 *  - Five player-facing sections: Plants · Rocks · Caves & Hides · Utilities ·
 *    Decor (DECOR_SECTIONS — the editor's category tabs).
 *  - Several entries are VARIANTS of the same GLB (one art file today),
 *    distinguished by `defaultScale` (per-axis) + `tint` (material recolour) +
 *    interaction + stats — the established v11 approach. Entries that would read
 *    as pure duplicates ship as `locked` cards instead (honest "art pending").
 *  - Existing defIds are NEVER renamed/removed — saves reference them
 *    (rehydrateLayoutAssets heals `asset`/`tint` from the def on load).
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

// ── Decor effects (the detail-card meters) ────────────────────────────────────
/**
 * How one object shapes the habitat, 0..10 per axis — the Decorate detail card's
 * meters. DISTINCT from `affectsStats` (the 0..100 score/sim contributions):
 * effects describe the piece for the player; affectsStats feed the habitat score.
 * A test keeps the two loosely consistent (a hide must have high hideCover, …).
 */
export interface DecorEffects {
  comfort: number;
  hideCover: number;
  heat: number; // heat retention (warms under the lamp, holds warmth)
  humidity: number; // humidity impact
  basking: number; // basking support (flat warm surfaces)
  security: number; // how safe it makes the gecko feel nearby
  natural: number; // natural look
  enrichment: number;
  cleanup: number; // cleanup difficulty (higher = harder to keep clean)
}

/** Display order + labels for the effects meters (UI reads this, data owns it). */
export const DECOR_EFFECT_KEYS: { key: keyof DecorEffects; label: string }[] = [
  { key: "comfort", label: "Comfort" },
  { key: "hideCover", label: "Hide Cover" },
  { key: "heat", label: "Heat Retention" },
  { key: "humidity", label: "Humidity" },
  { key: "basking", label: "Basking" },
  { key: "security", label: "Security" },
  { key: "natural", label: "Natural Look" },
  { key: "enrichment", label: "Enrichment" },
  { key: "cleanup", label: "Cleanup Effort" },
];

/** The editor's category tabs, in display order. Every def's `section` ∈ this. */
export const DECOR_SECTIONS = ["Plants", "Rocks", "Caves & Hides", "Utilities", "Decor"] as const;
export type DecorSection = (typeof DECOR_SECTIONS)[number];

// ── Placeable catalog ─────────────────────────────────────────────────────────
export interface PlaceableDef {
  id: string; // catalog key — NEVER renamed (saves reference it)
  label: string;
  category: ObjectCategory;
  /** Catalog section — one of DECOR_SECTIONS (the editor's category tabs). */
  section: DecorSection;
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
  /** Per-axis scale a NEW placement starts at (variants: a squashed slab, a wide
   *  double hide). Reset-transform returns to this, not to 1×. Default [1,1,1]. */
  defaultScale?: Vec3;
  /** Variant recolour lerped into the GLB's materials (also tints the thumbnail). */
  tint?: number;
  /** Card copy: one-line description, ≤3 tag pills, one placement tip. */
  desc: string;
  tags: string[];
  tip: string;
  /** 0..10 detail-card meters (see DecorEffects). */
  effects: DecorEffects;
  /** Present ⇒ the card is shown dimmed + padlocked with this reason and the
   *  piece cannot be armed/placed ("Art in production", "Future humid habitat"). */
  locked?: string;
}

const fx = (
  comfort: number,
  hideCover: number,
  heat: number,
  humidity: number,
  basking: number,
  security: number,
  natural: number,
  enrichment: number,
  cleanup: number,
): DecorEffects => ({ comfort, hideCover, heat, humidity, basking, security, natural, enrichment, cleanup });

/**
 * Leopard-gecko-appropriate furniture. Collision sizes are the world volume the
 * animal treats as solid; the imported GLB is uniform-scaled to match that
 * footprint (so what you see is roughly what blocks), then the def's
 * `defaultScale` stretches variants per axis (collision + heightfields follow —
 * the compiler applies per-axis scale to the measured contours). `interaction`
 * decides route-around vs climb-over vs step-over. Placeholder shapes are the
 * organic fallback used when a GLB is missing or the piece is procedural.
 */
export const LIZARD_PLACEABLES: PlaceableDef[] = [
  // ═══ PLANTS ═══════════════════════════════════════════════════════════════
  {
    id: "plant_succulent",
    label: "Red Succulent",
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
    color: 0x8a4e3e,
    asset: "succulent_01.glb",
    tint: 0xb0523d,
    desc: "A ruby-blushed rosette that thrives in dry heat.",
    tags: ["Arid", "Soft", "No care"],
    tip: "Soft — the gecko brushes past it, so it can sit right on a walkway.",
    effects: fx(5, 1, 1, 2, 0, 2, 8, 6, 2),
  },
  {
    id: "plant_succulent_2",
    label: "Aloe Vera",
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
    desc: "Classic aloe spears — hardy, sculptural, desert-true.",
    tags: ["Arid", "Soft", "Hardy"],
    tip: "Reads best beside rocks or a hide mouth; it never blocks the floor.",
    effects: fx(5, 2, 1, 2, 0, 2, 8, 6, 2),
  },
  {
    id: "plant_agave",
    label: "Agave",
    category: "plant",
    section: "Plants",
    collidable: false,
    collisionType: "none",
    collision: { halfExtents: [0.13, 0.16, 0.13] },
    interaction: "softObstacle",
    affectsStats: { enrichment: 12, humidity: 6, climbing: 4 },
    shape: "sphere",
    color: 0x6fa08e,
    asset: "succulent_02.glb",
    defaultScale: [1.35, 1.25, 1.35],
    tint: 0x6fa08e,
    desc: "A broad blue-green agave — the desert's statement plant.",
    tags: ["Arid", "Statement", "Soft"],
    tip: "Give it a corner of its own so its wide leaves read clearly.",
    effects: fx(5, 3, 1, 2, 0, 3, 9, 7, 3),
  },
  {
    id: "plant_cactus",
    label: "Cactus Cluster",
    category: "plant",
    section: "Plants",
    collidable: true,
    collisionType: "sphere",
    collision: { radius: 0.06, halfExtents: [0.1, 0.16, 0.1] },
    // Spiky — the one plant the gecko walks AROUND, not through.
    interaction: "blocked",
    affectsStats: { enrichment: 12, humidity: 4 },
    shape: "sphere",
    color: 0x4c8544,
    asset: "succulent_01.glb",
    defaultScale: [0.95, 1.5, 0.95],
    tint: 0x4c8544,
    desc: "A tall spiny cluster — beautiful, but nothing walks through it.",
    tags: ["Arid", "Spiky", "Blocks"],
    tip: "Keep it off the main runway — its base is a small no-go zone.",
    effects: fx(4, 2, 1, 1, 0, 2, 9, 7, 3),
  },
  {
    id: "plant_desert_grass",
    label: "Desert Grass",
    category: "plant",
    section: "Plants",
    collidable: false,
    collisionType: "none",
    collision: { halfExtents: [0.11, 0.14, 0.11] },
    interaction: "softObstacle",
    affectsStats: { enrichment: 8, humidity: 4, hidingSpots: 4 },
    shape: "grass",
    color: 0xb9a86a,
    desc: "A straw-gold clump of bunchgrass that sways over the sand.",
    tags: ["Arid", "Cover", "Soft"],
    tip: "Cluster two or three clumps for natural sight-line cover.",
    effects: fx(5, 3, 1, 1, 0, 3, 8, 5, 3),
  },
  {
    id: "plant_desert_shrub",
    label: "Desert Shrub",
    category: "plant",
    section: "Plants",
    collidable: false,
    collisionType: "none",
    collision: { halfExtents: [0.15, 0.12, 0.15] },
    interaction: "softObstacle",
    affectsStats: { enrichment: 10, humidity: 6, hidingSpots: 6 },
    shape: "sphere",
    color: 0x8a9457,
    asset: "succulent_02.glb",
    defaultScale: [1.5, 0.95, 1.5],
    tint: 0x8a9457,
    desc: "A low olive-green shrub that breaks up open sand.",
    tags: ["Arid", "Cover", "Soft"],
    tip: "Plant it mid-floor — geckos love skirting along low cover.",
    effects: fx(5, 4, 1, 2, 0, 4, 8, 6, 3),
  },
  {
    id: "hanging_vine",
    label: "String of Pearls",
    category: "plant",
    section: "Plants",
    // A trailing vine that hangs from above — Y-movable; when lifted clear of the
    // gecko's head it does not block the floor (see OVERHEAD_CLEARANCE).
    placement: "hanging",
    collidable: false,
    collisionType: "none",
    collision: { halfExtents: [0.07, 0.22, 0.07] },
    interaction: "softObstacle",
    affectsStats: { enrichment: 12, humidity: 12, climbing: 6 },
    shape: "vine",
    color: 0x4f7a3e,
    desc: "Beaded trailing strands that spill from the frame or a branch.",
    tags: ["Hanging", "Trailing", "Soft"],
    tip: "Needs support — hang it from the top frame, a wall, or a branch.",
    effects: fx(5, 3, 0, 3, 0, 3, 8, 7, 3),
  },
  {
    id: "plant_fern",
    label: "Tropical Fern",
    category: "plant",
    section: "Plants",
    collidable: false,
    collisionType: "none",
    collision: { halfExtents: [0.14, 0.16, 0.14] },
    interaction: "softObstacle",
    affectsStats: { enrichment: 10, humidity: 14 },
    shape: "sphere",
    color: 0x3f7d4f,
    desc: "Lush humid-forest fronds — waiting on a tropical habitat.",
    tags: ["Tropical", "Humid"],
    tip: "Ferns wilt in a desert vivarium — unlocks with a humid habitat.",
    effects: fx(5, 4, 0, 6, 0, 3, 9, 6, 4),
    locked: "Future humid habitat",
  },

  // ═══ ROCKS ════════════════════════════════════════════════════════════════
  {
    id: "rock_cluster",
    label: "Flat Ledge",
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
    desc: "A low flat-topped ledge — the classic basking platform.",
    tags: ["Basking", "Climbable"],
    tip: "Park it under the lamp; the gecko will bask on its flat top.",
    effects: fx(7, 1, 8, 0, 9, 3, 8, 6, 2),
  },
  {
    // Same rock art as the ledge on purpose (one GLB today) — the NAME +
    // interaction make it a distinct variant, not a duplicate: this one is a
    // path-blocking boulder, the ledge is a climbable basking platform.
    id: "rock_boulder",
    label: "Sandstone Boulder",
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
    desc: "A rounded sandstone mass the gecko must walk around.",
    tags: ["Blocks", "Landmark"],
    tip: "Use it to split the floor into territories — leave a lane past it.",
    effects: fx(4, 2, 7, 0, 3, 3, 8, 5, 2),
  },
  {
    id: "rock_cave_stone",
    label: "Cave Stone",
    category: "rock",
    section: "Rocks",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.28, 0.1, 0.24] },
    interaction: "blocked",
    affectsStats: { basking: 6, climbing: 8, enrichment: 6 },
    shape: "box",
    color: 0x77705f,
    asset: "desert_rock_cluster_01.glb",
    defaultScale: [1.15, 1.3, 1.15],
    tint: 0x77705f,
    desc: "A tall shadow-gray monolith with real presence.",
    tags: ["Blocks", "Tall"],
    tip: "Great against the back panel — it frames hides without eating floor.",
    effects: fx(4, 3, 6, 0, 2, 4, 8, 5, 2),
  },
  {
    id: "rock_pebbles",
    label: "Pebble Cluster",
    category: "rock",
    section: "Rocks",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.28, 0.08, 0.24] },
    // Low enough that the gecko simply steps over it.
    interaction: "lowObstacle",
    affectsStats: { enrichment: 6 },
    shape: "box",
    color: 0xa8907a,
    asset: "desert_rock_cluster_01.glb",
    defaultScale: [0.45, 0.32, 0.45],
    desc: "A knot of river pebbles the gecko steps right over.",
    tags: ["Step-over", "Accent"],
    tip: "Scatter a few along the glass line for a natural stream-bed edge.",
    effects: fx(5, 0, 4, 0, 2, 1, 8, 4, 3),
  },
  {
    id: "rock_slate",
    label: "Slate Slab",
    category: "rock",
    section: "Rocks",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.3, 0.09, 0.26] },
    interaction: "climbable",
    affectsStats: { basking: 18, climbing: 14, enrichment: 4 },
    shape: "box",
    color: 0x76808a,
    asset: "desert_rock_cluster_01.glb",
    defaultScale: [1.25, 0.34, 1.15],
    tint: 0x76808a,
    desc: "A cool flat slate sheet — a second basking tier.",
    tags: ["Basking", "Climbable", "Flat"],
    tip: "Slate holds heat: one under the lamp, one on the cool side.",
    effects: fx(6, 0, 9, 0, 8, 2, 7, 5, 1),
  },
  {
    id: "rock_ridge",
    label: "Desert Ridge",
    category: "rock",
    section: "Rocks",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.28, 0.12, 0.24] },
    interaction: "blocked",
    affectsStats: { basking: 8, climbing: 8, enrichment: 6 },
    shape: "box",
    color: 0x9d8264,
    asset: "desert_rock_cluster_01.glb",
    defaultScale: [1.7, 0.95, 0.8],
    tint: 0x9d8264,
    desc: "A long weathered ridge that divides the habitat floor.",
    tags: ["Blocks", "Divider"],
    tip: "Run it parallel to the glass, never wall-to-wall — keep both ends open.",
    effects: fx(4, 3, 7, 0, 4, 4, 8, 6, 2),
  },
  {
    id: "rock_stones",
    label: "Small Stones",
    category: "rock",
    section: "Rocks",
    collidable: false,
    collisionType: "none",
    collision: { halfExtents: [0.26, 0.06, 0.22] },
    interaction: "softObstacle",
    affectsStats: { enrichment: 4 },
    shape: "box",
    color: 0xb2a58e,
    asset: "desert_rock_cluster_01.glb",
    defaultScale: [0.3, 0.2, 0.3],
    desc: "Loose desert gravel — pure set dressing, zero blockage.",
    tags: ["Accent", "Soft"],
    tip: "Sprinkle freely — they never block the gecko or the cleanup brush.",
    effects: fx(5, 0, 2, 0, 0, 0, 7, 3, 4),
  },
  {
    id: "rock_arch",
    label: "Rock Arch",
    category: "rock",
    section: "Rocks",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.3, 0.18, 0.16] },
    interaction: "climbable",
    affectsStats: { climbing: 24, enrichment: 12, hidingSpots: 8 },
    shape: "box",
    color: 0x94805f,
    desc: "A natural stone arch to walk under and clamber over.",
    tags: ["Climbable", "Walk-under"],
    tip: "An arch is a highway — the gecko will use both the top and the tunnel.",
    effects: fx(6, 4, 6, 0, 5, 4, 9, 8, 2),
    locked: "Art in production",
  },

  // ═══ CAVES & HIDES ════════════════════════════════════════════════════════
  {
    id: "hide_cave",
    label: "Sandstone Hide",
    category: "hide",
    section: "Caves & Hides",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.26, 0.14, 0.24] },
    interaction: "hide",
    affectsStats: { hidingSpots: 56, basking: 4 },
    shape: "cave",
    color: 0x8a7c66,
    asset: "rock_cave_hide_01.glb",
    // Sized so a NEW placement's interior pocket fits the whole gecko (the
    // body-fit check refuses too-small hides — see GECKO_HIDE_FIT).
    defaultScale: [1.7, 1.7, 1.7],
    desc: "The essential cool-side cave — deep, dark and snug.",
    tags: ["Shelter", "Cool side"],
    tip: "Every gecko needs one on the cool side, mouth facing open floor.",
    effects: fx(8, 9, 3, 1, 1, 9, 8, 5, 5),
  },
  {
    // Same cave art as the sandstone hide (one GLB today) — this variant carries
    // a humid microclimate for shedding, hence the tint + distinct stats.
    id: "hide_moist",
    label: "Moist Hide",
    category: "hide",
    section: "Caves & Hides",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.2, 0.12, 0.19] },
    interaction: "hide",
    affectsStats: { hidingSpots: 40, humidity: 40 },
    shape: "cave",
    color: 0x6a6152,
    asset: "rock_cave_hide_01.glb",
    defaultScale: [1.8, 1.8, 1.8],
    tint: 0x7e8168,
    desc: "A damp mossy-floored retreat that makes shedding easy.",
    tags: ["Shelter", "Humid", "Shedding"],
    tip: "Keep a damp patch inside (Terrain → Wet) and shed problems vanish.",
    effects: fx(8, 8, 2, 8, 0, 8, 7, 5, 6),
  },
  {
    id: "hide_low_cave",
    label: "Low Cave",
    category: "hide",
    section: "Caves & Hides",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.26, 0.14, 0.24] },
    interaction: "hide",
    affectsStats: { hidingSpots: 44, basking: 6 },
    shape: "cave",
    color: 0x8f8069,
    asset: "rock_cave_hide_01.glb",
    defaultScale: [1.95, 1.3, 1.85],
    desc: "A wide squat shelter with a low, shadowed ceiling.",
    tags: ["Shelter", "Snug"],
    tip: "Leos love a tight ceiling — place it where traffic is calm.",
    effects: fx(8, 8, 4, 1, 2, 9, 8, 4, 5),
  },
  {
    id: "hide_burrow",
    label: "Burrow Entrance",
    category: "hide",
    section: "Caves & Hides",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.26, 0.14, 0.24] },
    interaction: "hide",
    affectsStats: { hidingSpots: 34, humidity: 10 },
    shape: "cave",
    color: 0xc4ad86,
    asset: "rock_cave_hide_01.glb",
    defaultScale: [1.55, 1.15, 1.55],
    tint: 0xc4ad86,
    desc: "A sand-toned mouth that reads like a dug burrow.",
    tags: ["Shelter", "Digging"],
    tip: "Half-bury the look: sculpt a dip around it with the Terrain brush.",
    effects: fx(7, 7, 3, 3, 1, 8, 9, 5, 5),
  },
  {
    id: "hide_double",
    label: "Double Chamber Hide",
    category: "hide",
    section: "Caves & Hides",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.26, 0.14, 0.24] },
    interaction: "hide",
    affectsStats: { hidingSpots: 62, humidity: 8 },
    shape: "cave",
    color: 0x857763,
    asset: "rock_cave_hide_01.glb",
    defaultScale: [2.45, 1.7, 1.9],
    desc: "A grand two-room shelter — sleep in one, lurk in the other.",
    tags: ["Shelter", "Large"],
    tip: "It's big — give it a back corner and keep the front floor open.",
    effects: fx(9, 10, 3, 2, 1, 10, 8, 6, 7),
  },
  {
    id: "hide_tunnel",
    label: "Rock Tunnel",
    category: "hide",
    section: "Caves & Hides",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.26, 0.14, 0.24] },
    interaction: "hide",
    affectsStats: { hidingSpots: 46, enrichment: 10 },
    shape: "cave",
    color: 0x8a8378,
    asset: "rock_cave_hide_01.glb",
    defaultScale: [1.6, 1.5, 2.35],
    tint: 0x8a8378,
    desc: "A long stone passage — shelter and adventure in one.",
    tags: ["Shelter", "Long"],
    tip: "Aim the mouth along the habitat's length for a proper corridor.",
    effects: fx(8, 8, 4, 1, 1, 8, 8, 8, 6),
  },
  {
    id: "hide_arch",
    label: "Arch Hide",
    category: "hide",
    section: "Caves & Hides",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.24, 0.15, 0.2] },
    interaction: "hide",
    affectsStats: { hidingSpots: 40, enrichment: 8 },
    shape: "cave",
    color: 0x8f7f66,
    desc: "An open-ended arch shelter — cover with two exits.",
    tags: ["Shelter", "Two exits"],
    tip: "Skittish geckos love a back door — no dead end to be cornered in.",
    effects: fx(8, 7, 3, 1, 2, 8, 9, 7, 4),
    locked: "Art in production",
  },
  {
    id: "hide_cork",
    label: "Cork Hide",
    category: "hide",
    section: "Caves & Hides",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.24, 0.12, 0.2] },
    interaction: "hide",
    affectsStats: { hidingSpots: 38, enrichment: 6 },
    shape: "cave",
    color: 0x9c7a52,
    desc: "A curl of cork bark leaned into a light, natural shelter.",
    tags: ["Shelter", "Natural"],
    tip: "Cork is light — the keeper can lift it for spot checks.",
    effects: fx(7, 7, 2, 2, 1, 7, 10, 6, 3),
    locked: "Art in production",
  },

  // ═══ UTILITIES ════════════════════════════════════════════════════════════
  {
    id: "dish_water",
    label: "Water Bowl",
    category: "dish",
    section: "Utilities",
    collidable: true,
    collisionType: "sphere",
    collision: { radius: 0.12 },
    interaction: "blocked",
    affectsStats: { humidity: 30, enrichment: 5 },
    shape: "dish",
    color: 0x8c7d63,
    asset: "water_dish_stone_01.glb",
    desc: "A shallow stone water bowl — drink-safe for a non-swimmer.",
    tags: ["Water", "Essential"],
    tip: "Keep it shallow and on the cool side; refill from the Clean drawer.",
    effects: fx(8, 0, 0, 7, 0, 2, 7, 3, 6),
  },
  {
    id: "dish_food",
    label: "Food Dish",
    category: "dish",
    section: "Utilities",
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
    desc: "A smooth-walled feeding dish that pens wriggling feeders.",
    tags: ["Feeding", "Essential"],
    tip: "Smooth walls pen worms; crickets can still jump out — that's real.",
    effects: fx(7, 0, 0, 0, 0, 2, 6, 4, 7),
  },
  {
    id: "dish_humid",
    label: "Humidity Hide Bowl",
    category: "dish",
    section: "Utilities",
    collidable: true,
    collisionType: "sphere",
    collision: { radius: 0.12 },
    interaction: "blocked",
    affectsStats: { humidity: 34, enrichment: 4 },
    shape: "dish",
    color: 0x93a382,
    asset: "water_dish_stone_01.glb",
    defaultScale: [1.2, 1.05, 1.2],
    tint: 0x93a382,
    desc: "A moss-lined bowl that raises humidity around a hide.",
    tags: ["Humid", "Shedding"],
    tip: "Park it beside the Moist Hide to build a shedding corner.",
    effects: fx(6, 1, 0, 9, 0, 3, 7, 3, 6),
  },
  {
    id: "util_gauge",
    label: "Thermo-Hygro Gauge",
    category: "decor",
    section: "Utilities",
    collidable: false,
    collisionType: "none",
    collision: { halfExtents: [0.035, 0.16, 0.035] },
    interaction: "softObstacle",
    affectsStats: { enrichment: 2 },
    shape: "gauge",
    color: 0xd8d2c4,
    desc: "A staked twin dial reading temperature and humidity.",
    tags: ["Monitoring", "Tiny"],
    tip: "One near the basking zone, one on the cool side tells the whole story.",
    effects: fx(3, 0, 0, 0, 0, 1, 3, 2, 1),
  },

  // ═══ DECOR ════════════════════════════════════════════════════════════════
  {
    id: "branch_log",
    label: "Driftwood Branch",
    category: "branch",
    section: "Decor",
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
    desc: "A twisted desert root — the habitat's climbing centerpiece.",
    tags: ["Climbable", "Centerpiece"],
    tip: "Mid-floor is fine: the gecko climbs over or slips between its arms.",
    effects: fx(7, 3, 2, 0, 4, 4, 10, 9, 3),
  },
  {
    id: "climb_branch",
    label: "Climbing Branch",
    category: "branch",
    section: "Decor",
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
    desc: "A slim raised perch branch, liftable off the floor.",
    tags: ["Climbable", "Elevated"],
    tip: "Raise it (drag the green arrow) so the gecko can walk beneath.",
    effects: fx(6, 1, 1, 0, 3, 3, 8, 8, 2),
  },
  {
    id: "decor_sign",
    label: "Desert Sign",
    category: "decor",
    section: "Decor",
    collidable: true,
    collisionType: "sphere",
    collision: { radius: 0.045, halfExtents: [0.09, 0.13, 0.05] },
    interaction: "blocked",
    affectsStats: { enrichment: 8 },
    shape: "sign",
    color: 0x8a6a42,
    desc: "A weathered wooden trail sign — pure desert charm.",
    tags: ["Whimsy", "Tiny"],
    tip: "Angle it toward the glass so visitors can read the trail.",
    effects: fx(4, 0, 0, 0, 0, 1, 6, 6, 1),
  },
  {
    id: "decor_platform",
    label: "Small Platform",
    category: "decor",
    section: "Decor",
    collidable: true,
    collisionType: "box",
    collision: { halfExtents: [0.16, 0.05, 0.13] },
    interaction: "climbable",
    affectsStats: { climbing: 14, basking: 10, enrichment: 6 },
    shape: "platform",
    color: 0x7d5f40,
    desc: "A low wooden stage the gecko hops onto to survey its world.",
    tags: ["Climbable", "Viewpoint"],
    tip: "Near the glass makes a natural lookout (and photo spot).",
    effects: fx(6, 0, 3, 0, 6, 2, 6, 7, 2),
  },
  {
    id: "decor_cairn",
    label: "Stone Cairn",
    category: "decor",
    section: "Decor",
    collidable: true,
    collisionType: "sphere",
    collision: { radius: 0.065, halfExtents: [0.08, 0.15, 0.08] },
    // A wobbly stack — routed around, never climbed.
    interaction: "blocked",
    affectsStats: { enrichment: 8, climbing: 2 },
    shape: "cairn",
    color: 0x99917f,
    desc: "A hand-stacked trail cairn — someone was here before.",
    tags: ["Whimsy", "Accent"],
    tip: "Cairns mark paths: set one where two walking routes meet.",
    effects: fx(4, 0, 2, 0, 0, 1, 7, 6, 2),
  },
  {
    id: "decor_skull",
    label: "Skull Accent",
    category: "decor",
    section: "Decor",
    collidable: true,
    collisionType: "sphere",
    collision: { radius: 0.09 },
    interaction: "blocked",
    affectsStats: { enrichment: 10, hidingSpots: 6 },
    shape: "sphere",
    color: 0xd9d2c0,
    desc: "A sun-bleached steer skull — the wild-west statement piece.",
    tags: ["Whimsy", "Statement"],
    tip: "One is a statement; two is a graveyard. Front corner, slight angle.",
    effects: fx(4, 2, 1, 0, 1, 2, 8, 8, 2),
    locked: "Art in production",
  },
];

export function findPlaceable(id: string): PlaceableDef | undefined {
  return LIZARD_PLACEABLES.find((p) => p.id === id);
}

/** Catalog entries the player can actually place (locked cards excluded). */
export function livePlaceables(): PlaceableDef[] {
  return LIZARD_PLACEABLES.filter((p) => !p.locked);
}

/** Stamp a placeable into a concrete PlacedObject at a position/rotation/scale.
 *  `scale` overrides the def's `defaultScale` (variants start pre-stretched). */
export function makePlaced(
  def: PlaceableDef,
  id: string,
  position: Vec3,
  rotationY = 0,
  scale?: Vec3,
): PlacedObject {
  const s = scale ?? def.defaultScale ?? [1, 1, 1];
  return {
    id,
    defId: def.id,
    label: def.label,
    category: def.category,
    asset: def.asset ? LIZARD_DECOR_DIR + def.asset : undefined,
    placeholder: !def.asset,
    position,
    rotation: [0, rotationY, 0],
    scale: [s[0], s[1], s[2]],
    collidable: def.collidable,
    collisionType: def.collisionType,
    collision: def.collision ? { ...def.collision } : undefined,
    interaction: def.interaction,
    placement: def.placement ?? "floor",
    affectsStats: def.affectsStats ? { ...def.affectsStats } : undefined,
    shape: def.shape,
    color: def.color,
    tint: def.tint,
  };
}

/**
 * SELF-HEAL a layout loaded from a save: re-derive each object's current `asset`
 * path + variant `tint` from its `defId` (so a save made before the decor pipeline
 * — or before an asset/tint changed — still loads the current art), and DROP any
 * persisted `assetFootprint` so collision is always re-measured from the live
 * mesh. Player edits (position / rotation / scale / interaction) are left untouched.
 * Idempotent; safe to call on a fresh default layout too.
 */
export function rehydrateLayoutAssets(layout: HabitatLayout): void {
  for (const o of layout.objects) {
    if (o.defId) {
      const def = findPlaceable(o.defId);
      if (def?.asset) o.asset = LIZARD_DECOR_DIR + def.asset;
      if (def) {
        if (def.tint != null) o.tint = def.tint;
        else delete o.tint;
      }
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

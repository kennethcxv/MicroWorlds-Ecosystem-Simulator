/**
 * GLASSWATER — reusable, data-driven HABITAT model (pure data; NO Three.js / DOM).
 *
 * A habitat is everything a player-built enclosure needs to exist and be saved:
 * its type + size, the substrate, every placed object (with collision + stat
 * effects), equipment, environmental zones, the animals living in it, and their
 * care state. The 3D renderer and the UI READ this model; the sim + collision
 * systems MUTATE it. Keeping it framework-free means it is unit-testable and can
 * back fish tanks, terrariums, aviaries, … — not one hardcoded scene.
 *
 * All vectors are plain `[x, y, z]` tuples so a habitat serialises straight to
 * JSON for localStorage. World frame: floor at y = 0, +Y up, animal walks on the
 * substrate surface (y = dimensions.substrateTop).
 */

// ── Primitives ──────────────────────────────────────────────────────────────
export type Vec3 = [number, number, number];
/** A point on the XZ floor plane (used for mesh-footprint hulls). */
export type Vec2 = [number, number];

/** Content-level habitat type (distinct from the renderer's scene selector). */
export type HabitatType =
  | "lizard_terrarium"
  | "desert_terrarium"
  | "tropical_terrarium"
  | "spider_terrarium"
  | "fish_tank"
  | "aviary";

/** What a placed object is, for stats/behaviour grouping + placeholder look. */
export type ObjectCategory =
  | "rock"
  | "hide" // cave / half-log the animal shelters under
  | "branch" // branch / log / root — climb + cover
  | "plant"
  | "dish" // water or food dish
  | "decor"
  | "substrate_feature"; // buried stone, cork flat, etc.

/** Practical collision volumes (mesh-accurate collision is intentionally out of
 *  scope for the prototype — see HabitatCollision). "none" = non-blocking. */
export type CollisionType = "box" | "sphere" | "capsule" | "meshApprox" | "none";

/**
 * How the movement + navigation systems TREAT a placed object, beyond its raw
 * collision volume. This is what makes the gecko route around some things and
 * climb over others (see HabitatCollision + HabitatNavigation + the movement
 * brain). If omitted, a sensible default is derived from the object's category.
 */
export type ObstacleInteraction =
  | "wall" // hard boundary (glass) — never pass through
  | "blocked" // route around; cannot climb (boulders, cave walls, water bowl)
  | "climbable" // gecko may climb / walk over it (raised + slowed while crossing)
  | "lowObstacle" // low lip the gecko steps over slowly (food dish)
  | "hide" // route around for now; a future "enter hide" seam
  | "softObstacle" // avoid, but minor overlap is tolerated (small plants)
  | "feederZone"; // a valid feeding area (not an obstacle at all)

export type PlaceholderShape =
  | "box"
  | "sphere"
  | "cylinder"
  | "capsule"
  | "cave" // dome hide with an opening
  | "dish" // shallow bowl
  | "branch" // tilted tapered log
  | "lamp"; // dome heat lamp

/** Habitat quality contributions an object/equipment adds (all optional, summed
 *  by HabitatStats). Mirrors the reference UI (Hiding Spots, Basking, …). */
export interface HabitatScoreInputs {
  hidingSpots: number;
  basking: number;
  climbing: number;
  enrichment: number;
  humidity: number;
}

// ── Collision data (authored per object) ─────────────────────────────────────
/**
 * Optional explicit sizing for an object's collision volume, in the object's
 * LOCAL frame (before world `scale` is applied). If omitted, the collision
 * compiler derives a sensible volume from the object's scale + category.
 */
export interface CollisionParams {
  /** box/meshApprox: local half-extents [hx, hy, hz]. */
  halfExtents?: Vec3;
  /** sphere/capsule: radius. */
  radius?: number;
  /** capsule: segment length along local +Z (centred on the origin). */
  length?: number;
  /** Local offset of the volume centre from the object origin. */
  offset?: Vec3;
}

/**
 * A TIGHT collision footprint MEASURED from the loaded GLB, in the model's LOCAL
 * frame at its natural display size (i.e. with object `scale` = 1, base sitting on
 * the substrate at y = 0). The renderer populates this after loading each decor
 * model; the collision compiler then builds the solver volume from THIS instead of
 * the hand-authored `collision` guess — so the blocked area matches the visible
 * mesh, follows the object's scale/rotation/position, and the walk-over height is
 * the mesh's true top (no invisible walls, no floating). Not hand-authored (except
 * in tests); safe to serialise (re-measured on the next load).
 */
export interface AssetFootprint {
  /** Local half-extents of the visible mesh's bounding box [hx, hy, hz]. */
  half: Vec3;
  /** Local centre of that bounding box (x/z ≈ 0 after recentre; y = hy). */
  center: Vec3;
  /** Preferred solver primitive for this footprint (round props → circle). */
  shape: "obb" | "circle";
  /**
   * A tight 2D CONVEX HULL of the mesh's vertices projected to the XZ floor plane
   * (local, natural size). When present (and the prop isn't a circle/tilted/multi-
   * part), the collider TRACES this outline instead of the bounding box — so convex
   * props (rocks, caves) don't block the empty box corners. Points are in a
   * consistent winding; the compiler applies scale + yaw + position.
   */
  hull?: Vec2[];
  /**
   * A MULTI-PART decomposition (several tight axis-aligned rectangles, local +
   * natural size) for CONCAVE / branching props — driftwood, roots, twigs. Each
   * part is a small OBB; the EMPTY GAPS between branches are covered by NO part, so
   * a single convex hull no longer bridges them. When present it takes precedence
   * over `hull`. Measured by HabitatFootprint.traceFootprint. */
  parts?: FootprintPart[];
  /**
   * The TRUE ASSET SILHOUETTE: one or more CLOSED contour loops (local XZ, natural
   * size) traced from the filled mesh projection by MARCHING SQUARES
   * (HabitatFootprint.traceContours). Each loop can be concave and follows every
   * bump; disconnected branches / enclosed holes are separate loops so genuine gaps
   * stay open. When present this is the SINGLE SOURCE used for collision, navigation
   * AND the debug overlay — so the debug line proves exactly what the animal hits.
   * Takes precedence over `parts` and `hull`. */
  contours?: Vec2[][];
}

/** One axis-aligned rectangle of a multi-part footprint (local XZ, natural size). */
export interface FootprintPart {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
}

/**
 * One collision probe on the animal's body, in its LOCAL frame: `forward` is metres
 * toward the head (+, travel direction), `side` is metres to the animal's right, `r`
 * is the probe's radius. A chain of probes (head → chest → hips → tail) lets the
 * whole silhouette — not just a single centre circle — be kept out of hard obstacles,
 * so the head / body / tail never visibly phase through decor. See HabitatCollision. */
export interface BodyProbe {
  forward: number;
  side: number;
  r: number;
}

/** How a placed object attaches vertically. `floor` (default) is grounded + floor-
 *  locked; `elevated`/`hanging` may move on the Y axis (vines, branches, lamps). */
export type PlacementMode = "floor" | "elevated" | "hanging";

// ── Placed objects & equipment ───────────────────────────────────────────────
/**
 * A single placed piece of hardscape/decor. Matches the brief's authoring shape:
 * id + asset + category + transform + collidable/collisionType + affectsStats,
 * plus placeholder hints so we can render it before the real GLB exists.
 */
export interface PlacedObject {
  id: string;
  label?: string;
  /** Catalog identity (the PlaceableDef.id this was stamped from). Persisted so a
   *  loaded layout can RE-DERIVE its current `asset` path + defaults from the catalog
   *  — a save can't silently lose its GLB when the asset pipeline changes. */
  defId?: string;
  /** Runtime GLB path (public/…). Undefined ⇒ always a placeholder. */
  asset?: string;
  /** Force a placeholder even when `asset` is set (asset not delivered yet). */
  placeholder?: boolean;
  category: ObjectCategory;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  collidable: boolean;
  collisionType: CollisionType;
  collision?: CollisionParams;
  /** Tight footprint measured from the real GLB (renderer-populated at runtime).
   *  When present it overrides `collision` so the blocked area matches the visible
   *  mesh. See {@link AssetFootprint}. */
  assetFootprint?: AssetFootprint;
  /** How movement/navigation treats it (route around vs climb vs step over).
   *  Defaults derived from `category` if omitted. */
  interaction?: ObstacleInteraction;
  /** Vertical placement mode (floor-locked vs Y-movable). Defaults to `floor`. */
  placement?: PlacementMode;
  affectsStats?: Partial<HabitatScoreInputs>;
  /** Placeholder rendering hints (ignored once a real GLB is loaded). */
  shape?: PlaceholderShape;
  color?: number;
}

export type EquipmentKind =
  | "heat_lamp"
  | "uvb_lamp"
  | "thermometer"
  | "hygrometer"
  | "mister"
  | "canopy_light";

/** Equipment mounted in/above the enclosure. Usually non-blocking (mounted high),
 *  but still contributes to environment + stats. */
export interface Equipment {
  id: string;
  kind: EquipmentKind;
  label?: string;
  position: Vec3;
  /** Point the lamp aims at (basking spot centre on the ground). */
  target?: Vec3;
  /** 0..1 intensity / on-fraction. */
  power: number;
  affectsStats?: Partial<HabitatScoreInputs>;
  shape?: PlaceholderShape;
  color?: number;
}

export type ZoneKind = "basking" | "cool" | "feeding" | "spawn" | "humid";

/** A circular region on the substrate driving temperature/feeding/spawn logic. */
export interface Zone {
  id: string;
  kind: ZoneKind;
  center: Vec3;
  radius: number;
  /** For temperature zones: the local temperature this zone maintains (°C). */
  temperatureC?: number;
}

// ── Enclosure shell ──────────────────────────────────────────────────────────
export interface HabitatDimensions {
  width: number; // X (m)
  depth: number; // Z (m)
  height: number; // Y (m)
  glass: number; // pane thickness (m)
  substrateTop: number; // world Y of the substrate surface
}

export interface HabitatCamera {
  fov: number;
  position: Vec3;
  target: Vec3;
}

export type SubstrateType = "sand" | "soil" | "gravel" | "bioactive" | "paper_towel";

export interface Substrate {
  type: SubstrateType;
  color: number; // hex, for placeholder rendering
  depth: number; // visual depth (m)
}

/** Standard enclosure size presets for the (future) habitat builder. */
export interface HabitatSizeOption {
  id: string;
  label: string;
  dimensions: HabitatDimensions;
  /** Rough animal capacity (used by capacity warnings). */
  capacity: number;
}

// ── The authored layout ──────────────────────────────────────────────────────
export interface HabitatLayout {
  id: string;
  name: string;
  type: HabitatType;
  dimensions: HabitatDimensions;
  camera: HabitatCamera;
  substrate: Substrate;
  objects: PlacedObject[];
  equipment: Equipment[];
  zones: Zone[];
}

// ── Live runtime state (layout + environment + animals + care) ────────────────
export interface HabitatEnvironment {
  /** Warm-side / basking temperature (°C). */
  baskingC: number;
  /** Cool-side temperature (°C). */
  coolC: number;
  humidity: number; // %
  cleanliness: number; // 0..100
}

export interface AnimalNeeds {
  hunger: number; // 0..100 (100 = fully fed)
  stress: number; // 0..100 (0 = calm)
  health: number; // 0..100
  /** Calcium store 0..100 — restored by supplement-dusted feedings; a drained
   *  store erodes health (the in-game mirror of metabolic bone disease). */
  calcium: number;
  /** Body condition 0..100 (≈50 ideal) — fatty foods push it up; obesity
   *  (sustained high) erodes health. Eases back toward ideal over time. */
  bodyCondition: number;
}

export type LifeStage = "hatchling" | "juvenile" | "adult";

export interface HabitatAnimal {
  id: string;
  speciesId: string;
  name: string;
  stage: LifeStage;
  needs: AnimalNeeds;
  /** Last ground position (persisted so the animal resumes where it was). */
  position?: Vec3;
  /** Rolled ONCE from the real-life-skewed roulette (LizardPersonality) and
   *  persisted — this individual's character, driving speed/activity/
   *  sheltering/appetite for its whole life. */
  personality?: string;
  /** Digest store (satiety units eaten, LizardDigestion) — fills with meals. */
  digest?: number;
  /** Digestion countdown once the store crosses its threshold (seconds). */
  digestT?: number;
  /** The ONE bathroom corner this individual chose (real leo behaviour) —
   *  picked on first need, persisted for life. */
  toiletSpot?: [number, number];
}

export type FeederKind = "cricket" | "mealworm" | "superworm" | "dubia_roach" | "waxworm";

/** The dusting jar: bare, plain calcium, or calcium + D3 (absorbs best). */
export type SupplementKind = "none" | "calcium" | "calcium_d3";

/** How a meal was offered (mirrors the Feeding Mode method rail). */
export type FeedMethodKind = "quick" | "hand" | "tong" | "dish";

/** How scared an insect currently is (drives the flee behaviour + rendering). */
export type FeederMood = "calm" | "alert" | "flee";

export interface FeederState {
  id: number;
  kind: FeederKind;
  position: Vec3;
  alive: boolean;
  age: number; // seconds since spawn
  /** Supplement this insect was dusted with when served (nutrition on consume). */
  dusted?: SupplementKind;
  /** PlacedObject id of the dish this insect is contained in (dish feeding).
   *  Contained insects stay inside the dish walls; crickets may jump out. */
  containedBy?: string;
  /** True while pinched in the tongs / resting on the keeper's palm — it holds
   *  perfectly still (the gecko takes it from the keeper) until released. */
  held?: boolean;
  /** Facing/travel direction (rad) — behaviour-driven, renderer-aligned. */
  heading?: number;
  /** 0..1 stamina — flee bursts drain it; tired insects slow (catchable). */
  energy?: number;
  /** Current behaviour state + seconds left in it. */
  mood?: FeederMood;
  moodT?: number;
}

/** One Track-Intake entry: what was served, how, and with which dusting. */
export interface FeedingLogEntry {
  /** state.elapsed when served (seconds). */
  t: number;
  kind: FeederKind;
  count: number;
  method: FeedMethodKind;
  supplement: SupplementKind;
}

export type EventTone = "good" | "warn" | "bad" | "info";

export interface HabitatEvent {
  id: number;
  message: string;
  tone: EventTone;
  t: number; // elapsed seconds when logged
}

export interface HabitatState {
  version: number;
  layout: HabitatLayout;
  environment: HabitatEnvironment;
  animals: HabitatAnimal[];
  feeders: FeederState[];
  /** Seconds until the Feed action is available again. */
  feedCooldown: number;
  events: HabitatEvent[];
  nextEventId: number;
  nextFeederId: number;
  elapsed: number;
  /** Local dirt map over the substrate (see LizardDirtSystem). Rehydrated with a
   *  clean map when absent (older saves). Plain arrays → serialises as-is. */
  dirt?: { nx: number; nz: number; cells: number[] };
  /** Sculpted substrate heights + wet patches (see HabitatTerrain). */
  terrain?: { nx: number; nz: number; heights: number[]; water: number[] };
  /** Track-Intake feeding history (newest last, capped; absent in old saves). */
  feedingLog?: FeedingLogEntry[];
  /** Lingering hydration support from recent juicy meals (decays; 0 when absent). */
  foodMoisture?: number;
  /** Droppings on the sand (LizardDigestion) — real objects the cleaning tools remove. */
  droppings?: { id: number; position: Vec3; age: number }[];
  nextDroppingId?: number;
}

// ── Computed habitat scores (shown in the HUD) ────────────────────────────────
export interface HabitatScores {
  hidingSpots: number; // 0..100
  basking: number;
  climbing: number;
  enrichment: number;
  humidity: number;
  /** Weighted overall 0..100 habitat score. */
  overall: number;
}

// ── Species care profile + compatibility model ───────────────────────────────
export type DietTag = "insectivore" | "carnivore" | "herbivore" | "omnivore";
export type HabitatTag =
  | "desert"
  | "arid"
  | "tropical"
  | "temperate"
  | "arboreal"
  | "terrestrial"
  | "aquatic";
export type Temperament = "docile" | "shy" | "skittish" | "territorial" | "aggressive";

export interface CareIdeal {
  baskingC: [number, number];
  coolC: [number, number];
  humidity: [number, number]; // %
  minHides: number;
  needsBasking: boolean;
  /** Species with adhesive toe pads (crested geckos …) can climb the glass;
   *  leopard geckos CANNOT — glass is always a wall for them. */
  canClimbGlass?: boolean;
}

/** Everything the sim + compatibility checks need to know about a species. */
export interface CareProfile {
  speciesId: string;
  commonName: string;
  scientificName: string;
  diet: DietTag[];
  habitatTags: HabitatTag[];
  sizeCm: number;
  temperament: Temperament;
  /** Identity/class tags used by predator↔prey matching (e.g. "gecko",
   *  "small_lizard", "insect", "arachnid", "cleanup_crew"). */
  classTags: string[];
  /** Feeder/prey identity tags or speciesIds this species eats. */
  preyTags: string[];
  /** Identity tags of things that would prey on / injure this species. */
  predatorTags: string[];
  ideal: CareIdeal;
  compatibleSpecies: string[];
  incompatibleSpecies: string[];
  stressTriggers: string[];
}

export type CompatibilityVerdict = "safe" | "caution" | "danger" | "food";

export interface CompatibilityResult {
  a: string;
  b: string;
  verdict: CompatibilityVerdict;
  reason: string;
}

/**
 * CREATURE DATA MODEL — the shape every 3D game creature is described with.
 * Pure serialisable data (no functions/classes): the registry entries must
 * survive a JSON round-trip so they can later live in saves / mod files.
 *
 * Design intent: adding a future animal = drop its GLB in
 * public/assets/3d/creatures/ + add ONE registry entry. Controllers, the part
 * animator, spawning, UI cards and ecosystem hooks are all driven from here.
 */
import type { PartRole, ForwardAxis } from "../../habitats/creatures/PartClassifier";

export type CreatureId =
  | "feeder_cricket"
  | "cherry_shrimp"
  | "nerite_snail"
  | "neon_tetra"
  | "guppy"
  | "zebra_danio"
  | "otocinclus"
  | "mystery_snail"
  | "daphnia"
  | "isopod";

export type CreatureHabitat = "aquarium" | "vivarium";

/** Which shared movement controller drives this creature. */
export type ControllerType =
  | "schoolFish"
  | "surfaceGrazer"
  | "shrimpCrawler"
  | "snailGlider"
  | "microSwarm"
  | "isopodCrawler"
  | "feederInsect";

export type BoundsBehavior = "water-volume" | "substrate" | "surfaces";

export type CreatureDifficulty = "easy" | "easy-medium" | "medium" | "experimental";

/** One procedural oscillation: rotational amps in radians, positional amps as
 *  a fraction of body length. */
export interface Osc {
  amp: number;
  freq: number;
}

/** Which motions the part animator applies to this creature's classified
 *  parts. Only list what the species visually needs — missing entries simply
 *  don't animate. */
export interface CreatureAnimationProfile {
  /** Master multiplier for every amp (per-animal taming knob). */
  intensity: number;
  /** Tail yaw wag (fish swim, cricket idle twitch). Speed-scaled. */
  swimWag?: Osc;
  /** Whole-body gentle vertical bob. */
  bodyBob?: Osc;
  /** Paired side-fin flutter. */
  finFlutter?: Osc;
  /** Dorsal/anal fin sway. */
  finSway?: Osc;
  /** Leg wiggle while moving (speed-scaled). */
  legScurry?: Osc;
  antennaSway?: Osc;
  eyestalkSway?: Osc;
  /** Snail foot stretch/compress glide cycle. */
  footStretch?: Osc;
  /** Daphnia-style hop stroke (drives body + antenna rows). */
  pulse?: Osc;
  /** Abdomen/tail-fan curl on darts (shrimp). */
  tailCurl?: Osc;
  headBob?: Osc;
}

export interface CreatureAssetConfig {
  /** Runtime GLB under public/ (never an absolute OS path). */
  path: string;
  /** Target world length along the forward axis, metres in-tank. */
  bodyLength: number;
  /** The model's authored facing direction. */
  forward: ForwardAxis;
  /** True → origin at the belly (base) so it sits on surfaces; false → centred
   *  (open-water swimmers). */
  groundCreature: boolean;
  /** Extra vertical fine-tune AFTER normalization (fraction of body length). */
  yOffset?: number;
  /** Material normalization applied on load (Tripo exports are matte 0.9). */
  material?: {
    roughness?: number;
    metalness?: number;
    /** < 1 → transparent (daphnia). */
    opacity?: number;
  };
  /** Hand-authored corrections merged OVER the spatial part classifier. */
  partOverrides?: Record<string, PartRole>;
  /** Classifier hints. */
  shellCreature?: boolean;
  hasLegs?: boolean;
}

/** Movement tuning consumed by the shared controllers (units: metres, seconds). */
export interface CreatureMovement {
  cruiseSpeed: number;
  dartSpeed?: number;
  accel?: number;
  turnRate?: number;
  /** Preferred vertical band, fraction of the swim volume. */
  yBand?: [number, number];
  /** Preferred depth band, fraction (0 back .. 1 front). */
  zBand?: [number, number];
  /** Schooling forces (schoolFish only). */
  school?: {
    radius: number;
    sepRadius: number;
    cohesion: number;
    alignment: number;
    separation: number;
  };
  dartChance?: number;
  hoverChance?: number;
  /** Extra random burst behaviour (zebra danio). */
  burstChance?: number;
  /** Attached graze duration band, seconds (surface grazer). */
  surfaceTime?: [number, number];
  /** Chance per decision to pause and graze (crawlers/snails). */
  pauseChance?: number;
  /** Chance per decision of a backward escape dart (shrimp). */
  backDartChance?: number;
  /** Pulse hops per second band (daphnia). */
  pulseRate?: [number, number];
  /** Pull toward the group's centre (daphnia cluster / isopod huddle). */
  clusterPull?: number;
  /** How far one wander leg may roam (crawlers). */
  wanderRadius?: number;
}

export interface CreatureEnv {
  temperatureF: [number, number];
  pH?: [number, number];
  hardness?: "soft" | "soft-medium" | "medium" | "medium-hard" | "hard";
  flowPreference?: "very-gentle" | "gentle" | "gentle-medium" | "medium";
  lightPreference: "low" | "low-medium" | "medium";
  /** Relative humidity band % (terrestrials). */
  humidity?: [number, number];
  /** 0-100 (terrestrials). */
  ventilationNeed?: number;
  moistureGradientNeed?: number;
}

export interface CreatureNeeds {
  substratePreference?: string;
  hidingNeed: number;
  plantNeed?: number;
  mossNeed?: number;
  oxygenNeed: number;
  algaeNeed?: number;
  biofilmNeed?: number;
  calciumNeed?: number;
  shellHealthNeed?: number;
  leafLitterNeed?: number;
  openSwimSpaceNeed?: number;
  parameterStabilityNeed?: number;
  cleanlinessSensitivity: number;
  stressSensitivity: number;
  healthSensitivity: number;
}

/** The 0-100 gameplay stat block every creature carries. */
export interface CreatureStats {
  health: number;
  hunger: number;
  energy: number;
  stress: number;
  comfort: number;
  socialNeed: number;
  activity: number;
  curiosity: number;
  boldness: number;
  shyness: number;
  cleaningPower: number;
  algaeControl: number;
  wasteProduction: number;
  oxygenDemand: number;
  waterSensitivity: number;
  temperatureSensitivity: number;
  pHSensitivity: number;
  hardnessSensitivity: number;
  humiditySensitivity: number;
  drynessSensitivity: number;
  breedingChance: number;
  visibilityScore: number;
  playerAppeal: number;
}

/** Species-specific extra stats (data layer for future systems). */
export type SpecialStatKey =
  | "preyValue"
  | "nutritionValue"
  | "gutLoadValue"
  | "calciumDustValue"
  | "leftUneatenMessRisk"
  | "shellHealth"
  | "calciumNeed"
  | "acidicWaterStress"
  | "matureTankNeed"
  | "biofilmNeed"
  | "starvationRiskIfNoAlgae"
  | "predatorSensitivity"
  | "moistureGradientNeed"
  | "leafLitterNeed"
  | "daylightAvoidance";

export interface CreatureSpecies {
  id: CreatureId;
  displayName: string;
  scientificName?: string;
  category: string;
  habitatType: CreatureHabitat;
  biome: string;
  rarity: "common" | "uncommon" | "rare";
  unlockTier: 1 | 2 | 3;
  difficulty: CreatureDifficulty;
  /** Short card blurb. */
  descriptionUI: string;
  /** Longer collection-book entry. */
  descriptionEncyclopedia: string;

  asset: CreatureAssetConfig;
  controllerType: ControllerType;
  /** Human-readable movement descriptor ("pulse-hop drift", "surface graze"). */
  movementType: string;
  boundsBehavior: BoundsBehavior;
  preferredZone: string;
  movement: CreatureMovement;
  animation: CreatureAnimationProfile;
  collision: { kind: "soft-bounds" | "ground-contact" | "surface-contact"; radius: number };

  dietType: string;
  foodPreferences: string[];
  feedingBehavior: string;
  careRole: string;
  ecosystemRole: string;
  socialType: string;
  minimumGroupSize: number;
  groupPreference: string;
  activityPattern: "diurnal" | "nocturnal" | "crepuscular" | "cathemeral";
  personalityTags: string[];
  naturalHabits: string[];
  behaviorStates: string[];
  stressTriggers: string[];
  comfortTriggers: string[];
  compatibleHabitats: string[];
  env: CreatureEnv;
  needs: CreatureNeeds;
  breedingPotential: number;
  stats: CreatureStats;
  special?: Partial<Record<SpecialStatKey, number>>;
  /** Boolean-ish traits ("microLife", "liveFood", "populationBased", …). */
  flags?: string[];
  ecosystemEffects: string[];
  /** Dev/test spawn defaults (counts respect minimumGroupSize). */
  spawn: { defaultCount: number; spread: number };
  /** Link to the 2D aquarium sim codex when this species exists there. */
  codexId?: string;
}

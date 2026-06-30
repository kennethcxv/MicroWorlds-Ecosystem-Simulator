/**
 * Central game-state types and the initial save.
 *
 * IMPORTANT: this module is pure data. It must never import from `render/` or
 * `ui/` or touch Canvas/DOM. The renderer and UI read this state; the sim
 * mutates it.
 */

export type MetricKey =
  | "oxygen"
  | "temperature"
  | "ph"
  | "ammonia"
  | "nitrite"
  | "nitrate";

export interface WaterQuality {
  oxygen: number; // mg/L
  temperature: number; // °C
  ph: number;
  ammonia: number; // mg/L
  nitrite: number; // mg/L
  nitrate: number; // mg/L
  /** 0..100 internal clarity/maintenance level — drives water clarity + score. */
  cleanliness: number;
}

/** A creature population living in a tank. Positions are render-only, not here. */
export interface Population {
  speciesId: string;
  count: number;
  /** 0..1 aggregate wellbeing for this group; falls with bad water. */
  health: number;
}

/** A placed decor / plant / hardscape item. Normalized coords inside the tank interior. */
export interface ScapeItem {
  /** Asset key (matches data/plants or data/hardscape id). */
  ref: string;
  /** 0..1 horizontal position across the substrate. */
  x: number;
  /** 0..1 depth: 0 = far back wall, 1 = pressed against front glass. */
  z: number;
  /** Render scale multiplier relative to the item's base size. */
  scale: number;
  /** Mirror horizontally. */
  flip?: boolean;
  /** Small rotation in radians for natural variation. */
  rot?: number;
  /** Vertical lift off the substrate line (0..1 of interior height), for epiphytes on wood. */
  lift?: number;
}

export interface TankScape {
  hardscape: ScapeItem[];
  plants: ScapeItem[];
}

export type LevelRating = "Basic" | "Good" | "Excellent" | "Optimal";

export interface Tank {
  id: string;
  name: string;
  habitatType: string; // e.g. "Freshwater Habitat"
  sizeLiters: number;
  filtration: LevelRating;
  lighting: LevelRating;
  water: WaterQuality;
  populations: Population[];
  scape: TankScape;
  /** Uneaten food floating/decaying in the tank, 0..100. Drives ammonia spikes. */
  food: number;
  /** Smoothed 0..100 habitat score shown in the left panel. */
  habitatScore: number;
}

export interface Resources {
  leaves: number; // primary soft currency (green leaf)
  water: number; // research / water-credits (blue drop)
  reputation: number; // star
}

export type EventTone = "good" | "warn" | "bad" | "info";

export interface EventLogEntry {
  id: number;
  day: number;
  /** Pre-formatted clock label, e.g. "10:30 AM". */
  time: string;
  message: string;
  tone: EventTone;
}

export interface Clock {
  day: number;
  /** Minutes since midnight, 0..1440. */
  minutes: number;
}

export interface GameState {
  version: number;
  seed: number;
  clock: Clock;
  resources: Resources;
  tanks: Tank[];
  activeTankId: string;
  events: EventLogEntry[];
  nextEventId: number;
  /** Accumulated real seconds simulated — useful for save metadata. */
  elapsed: number;
  /** Current top-level screen/route. */
  screen: ScreenId;
}

export type ScreenId =
  | "aquarium"
  | "ecocenter"
  | "shop"
  | "research"
  | "breeding"
  | "rescue"
  | "tasks"
  | "journal";

export const SAVE_VERSION = 1;

/** The reference-matching starter tank: a lush 120 L community aquascape. */
function makeSapphireStream(): Tank {
  return {
    id: "sapphire-stream",
    name: "Sapphire Stream",
    habitatType: "Freshwater Habitat",
    sizeLiters: 120,
    filtration: "Excellent",
    lighting: "Optimal",
    water: {
      oxygen: 7.8,
      temperature: 24.6,
      ph: 6.8,
      ammonia: 0.02,
      nitrite: 0.0,
      nitrate: 5.6,
      cleanliness: 88,
    },
    populations: [
      { speciesId: "harlequin_rasbora", count: 12, health: 0.95 },
      { speciesId: "celestial_pearl_danio", count: 8, health: 0.95 },
      { speciesId: "dwarf_gourami", count: 1, health: 0.96 },
      { speciesId: "cherry_shrimp", count: 18, health: 0.92 },
      { speciesId: "panda_cory", count: 6, health: 0.94 },
      { speciesId: "nerite_snail", count: 4, health: 0.95 },
    ],
    scape: makeStarterScape(),
    food: 6,
    habitatScore: 92,
  };
}

/**
 * Hand-placed aquascape echoing the reference: a central driftwood focal
 * structure flowing left-to-right, rock clusters partly buried, tall plants
 * banked to the back and sides, moss on wood, midground bushes, open swim space.
 * Coords are normalized to the tank interior (0,0 top-left → 1,1 bottom-right).
 */
function makeStarterScape(): TankScape {
  return {
    hardscape: [
      // Main mossy driftwood log: a lower, horizontal-ish focal piece sweeping right.
      { ref: "driftwood_log", x: 0.45, z: 0.52, scale: 0.66, flip: false, rot: 0.04 },
      // A smaller branch accent reaching from the right for depth.
      { ref: "driftwood_branch", x: 0.73, z: 0.4, scale: 0.5, flip: true, rot: 0.05 },
      // Seiryu rock cluster anchoring the left base, partly buried.
      { ref: "rock_seiryu", x: 0.23, z: 0.72, scale: 0.58 },
      // Smaller boulders mid-right, nestled under the wood.
      { ref: "rock_boulders", x: 0.62, z: 0.64, scale: 0.4 },
    ],
    plants: [
      // Back wall: tall vallis / fern bank, densest left & right, open in the centre.
      { ref: "plant_fernbush", x: 0.12, z: 0.1, scale: 1.15 },
      { ref: "plant_vallis", x: 0.04, z: 0.18, scale: 1.1 },
      { ref: "plant_vallis", x: 0.22, z: 0.14, scale: 0.95 },
      { ref: "plant_javafern", x: 0.88, z: 0.12, scale: 1.1, flip: true },
      { ref: "plant_vallis", x: 0.96, z: 0.2, scale: 1.0, flip: true },
      { ref: "plant_fernbush", x: 0.74, z: 0.18, scale: 0.92 },
      { ref: "plant_javafern", x: 0.6, z: 0.1, scale: 0.78 },
      // Pops of red rotala mid-back for colour contrast.
      { ref: "plant_rotala", x: 0.82, z: 0.3, scale: 0.72 },
      { ref: "plant_rotala", x: 0.18, z: 0.34, scale: 0.62, flip: true },
      // Midground anubias on/near the wood.
      { ref: "plant_anubias", x: 0.37, z: 0.54, scale: 0.6 },
      { ref: "plant_anubias", x: 0.55, z: 0.58, scale: 0.48, flip: true },
      // Moss clumps on wood and rock.
      { ref: "plant_moss", x: 0.46, z: 0.6, scale: 0.5, lift: 0.16 },
      { ref: "plant_moss", x: 0.28, z: 0.68, scale: 0.42 },
      // Foreground carpeting moss along the front substrate.
      { ref: "plant_moss", x: 0.68, z: 0.93, scale: 0.52 },
      { ref: "plant_moss", x: 0.1, z: 0.9, scale: 0.46 },
    ],
  };
}

export function createInitialState(seed = 0x51a55): GameState {
  return {
    version: SAVE_VERSION,
    seed,
    clock: { day: 47, minutes: 10 * 60 + 30 }, // Day 47, 10:30 AM — matches the mockup.
    resources: { leaves: 12540, water: 8430, reputation: 4750 },
    tanks: [makeSapphireStream()],
    activeTankId: "sapphire-stream",
    events: [],
    nextEventId: 1,
    elapsed: 0,
    screen: "aquarium",
  };
}

export function getActiveTank(state: GameState): Tank {
  return state.tanks.find((t) => t.id === state.activeTankId) ?? state.tanks[0];
}

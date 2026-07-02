/**
 * The seam between the lizard 3D scene and its HUD. The scene implements
 * `LizardController`; the HUD (src/ui/lizardHud) reads `LizardHudState` and calls
 * feed/clean/decorate/toggleDebug — with no direct dependency on Three.js. Pure
 * types only.
 */
import type { FeedingLogEntry, HabitatEnvironment, HabitatEvent, HabitatScores, PlacedObject } from "../HabitatTypes";
import type { CollisionWorld } from "../HabitatCollision";
import type { DirtSpot } from "./LizardDirtSystem";
import type { IntakeSummary } from "./LizardNutrition";

/** BODY-FIT clearance for entering a hide: the INTERIOR pocket (enclosed by
 *  walls on ≥5 of 8 sides — a free spot merely BESIDE the dome never counts)
 *  must clear the gecko's walk circle, or it won't even try. Half-in/half-out
 *  geckos came from anchors that weren't really inside; the ENCLOSURE rule in
 *  hideAnchor is what fixes that. Measured: the authored cave pockets accept
 *  exactly the walk radius (0.075). */
export const GECKO_HIDE_FIT = 0.09;

/**
 * A HIDE's interior anchor: a spot inside the hide's sheltered pocket the gecko
 * can actually occupy. Thanks to the exact-contour collision, a cave's open mouth
 * is genuinely open — the pocket between its walls is free space — so entering a
 * hide is ordinary navigation to this point (no collision exemptions). Probes the
 * hide's centre first, then a small spiral, and returns null when the pocket is
 * too tight for the animal (that hide isn't enterable). Pass {@link GECKO_HIDE_FIT}
 * as the radius to require the WHOLE body to fit.
 */
/** How many of 8 compass rays from (x,z) hit a solid wall before travelling
 *  `reach` — a hide's interior pocket is walled on most sides (only the mouth
 *  is open); a spot merely BESIDE a hide is open on most sides. */
function enclosedDirections(world: CollisionWorld, x: number, z: number, reach: number): number {
  let walled = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    for (let d = 0.05; d <= reach; d += 0.04) {
      if (world.isBlocked(x + dx * d, z + dz * d, 0.01)) {
        walled++;
        break;
      }
    }
  }
  return walled;
}

export function hideAnchor(world: CollisionWorld, o: PlacedObject, radius: number): { x: number; z: number } | null {
  // The anchor must be UNDER the hide: inside its compiled footprint span AND
  // enclosed by its walls on most sides (≥5 of 8 rays hit rock — only the
  // mouth is open). A free spot merely BESIDE the dome never qualifies —
  // that's how geckos used to end up "sheltering" half-out against the wall.
  let cx = o.position[0];
  let cz = o.position[2];
  let span = 0.16;
  const vols = world.obstacles.filter((v) => v.id === o.id && v.bc);
  if (vols.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const v of vols) {
      const bc = v.bc!;
      minX = Math.min(minX, bc.cx - bc.r);
      maxX = Math.max(maxX, bc.cx + bc.r);
      minZ = Math.min(minZ, bc.cz - bc.r);
      maxZ = Math.max(maxZ, bc.cz + bc.r);
    }
    cx = (minX + maxX) / 2;
    cz = (minZ + maxZ) / 2;
    span = Math.max(maxX - minX, maxZ - minZ) / 2;
  }
  const reach = span + 0.1;
  const ok = (x: number, z: number): boolean =>
    world.isFree(x, z, radius) && enclosedDirections(world, x, z, reach) >= 5;
  if (ok(cx, cz)) return { x: cx, z: cz };
  const maxD = Math.max(0.05, span * 0.62);
  for (let r = 0.04; r <= maxD; r += 0.04) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (ok(x, z)) return { x, z };
    }
  }
  return null;
}

export interface LizardAnimalReadout {
  name: string;
  scientific: string;
  stage: string;
  hunger: number;
  stress: number;
  health: number;
  /** This individual's rolled personality (label, e.g. "Calm Basker"). */
  personality: string;
}

export interface LizardHudState {
  habitatName: string;
  overall: number;
  rating: string;
  scores: HabitatScores;
  environment: HabitatEnvironment;
  /** Whether the UVB lamp is on (light level readout). */
  uvbOn: boolean;
  animal: LizardAnimalReadout;
  events: HabitatEvent[];
  feedCooldown: number;
  canFeed: boolean;
  /** Care/compatibility/environment warnings for the notice strip. */
  warnings: string[];
  /** True when there are live crickets the gecko currently can't reach. */
  foodUnreachable: boolean;
  /** True while the placeholder gecko is on screen (final rig not yet dropped in). */
  usingPlaceholder: boolean;
  /** Animation clips detected on the loaded model (empty for the placeholder). */
  clipNames: string[];
  feederCount: number;
  /** Whether the collision debug overlay is currently visible (for the button). */
  debugOn: boolean;
}

/** Rich read-out for the click-the-animal info card. */
export interface AnimalInfoState {
  name: string;
  species: string;
  scientific: string;
  stage: string;
  /** This individual's rolled personality: label + one-line character blurb. */
  personality: string;
  personalityBlurb: string;
  /** Human-readable current behaviour (Resting / Roaming / Hunting / Eating / …). */
  behavior: string;
  hunger: number;
  stress: number;
  health: number;
  /** Calcium store 0..100 (dusted feedings restore it; low = MBD risk). */
  calcium: number;
  /** Body condition 0..100 (≈50 ideal; fatty treats push it up). */
  bodyCondition: number;
  comfort: number;
  baskingC: number;
  coolC: number;
  humidity: number;
  /** What the gecko is currently heading for (a cricket / a roam spot / basking). */
  target: string;
  basking: boolean;
  usingPlaceholder: boolean;
  clipNames: string[];
  warnings: string[];
  /** Planet-Zoo-style live wellbeing meters (0..100 each). */
  wellbeing: {
    tempComfort: number;
    humidComfort: number;
    security: number;
    enrichment: number;
    cleanExposure: number;
    hydration: number;
    landComfort: number;
    activity: number;
  };
  /** Plain-language husbandry advice, most important first. */
  recommendations: string[];
}

/** One food option in the interactive feeding tray. */
export interface FoodOption {
  kind: string;
  label: string;
  icon: string;
  note: string;
  /** Husbandry role (staple / occasional / treat) for the card badge. */
  role?: string;
}

/** Brush tools of Terrain Mode. */
export type TerrainTool = "raise" | "lower" | "smooth" | "flatten" | "water" | "dry";

/** Independent debug overlays (the View-Collisions legend hosts the toggles). */
export type DebugOption = "collisions" | "feet" | "normals" | "terrain";

export interface LizardController {
  readState(): LizardHudState;
  /** Release feeder insects (Feed action). */
  feed(): void;
  /** Spot-clean the terrarium (raises cleanliness). */
  clean(): void;
  /** Toggle the collision debug overlay; returns the new visibility. */
  toggleDebug(): boolean;
  /** Current collision-debug visibility (for syncing the View Collisions button). */
  debugVisible(): boolean;
  /** Rich info for the click-the-animal card. */
  animalInfo(): AnimalInfoState;
  /** Show/clear a highlight ring under the animal (while its info card is open). */
  highlightAnimal(on: boolean): void;
  // ── Interactive care modes (Clean brush / Feed tray / Terrain sculpt) ─────────
  /** Scrub dirt under the brush at world (x,z). Returns the dirt removed. */
  brushClean(x: number, z: number, radius: number): number;
  /** Live cleanliness percentage (100 = spotless). */
  cleanliness(): number;
  /** Where are the dirty spots? (Cleaning Mode rings + "N spots detected".) */
  dirtSpots(max?: number): DirtSpot[];
  /** Show/refresh the amber rings over the dirty spots (Cleaning Mode). */
  setCleanHighlights(on: boolean): void;
  /** REPLACE WATER: empty + refill the water dish (sparkle + sound + freshness). */
  replaceWaterNow(): boolean;
  /** REMOVE WASTE: scoop EVERY dropping (falls back to the dirtiest spot). */
  removeWasteNow(): { scooped: number; cleanedSpot: boolean };
  /** Everything the Cleaning drawer's status pills need, in one honest read. */
  cleanStatus(): {
    cleanliness: number;
    spots: number;
    dustyAreas: number;
    droppings: number;
    waterQuality: "good" | "fair" | "stale" | "none";
    glassSmudged: boolean;
  };
  /** Drive the sand cleaning tool (scoop / hand brush per `tool`) from the
   *  pointer — it replaces the OS cursor over the substrate. */
  cleanHover(ground: { x: number; z: number } | null, scrubbing: boolean, radius: number, tool: string): void;
  /** Drive the SQUEEGEE on the front glass (Wipe Glass tool). */
  wipeHover(pt: { x: number; y: number } | null, wiping: boolean): void;
  /** One squeegee stroke on the pane at world (x, y) — wipes the smudges. */
  wipeStrokeAt(x: number, y: number): void;
  /** The interactive front pane (position + size + the raycast plane z). */
  glassPane(): { z: number; cx: number; cy: number; w: number; h: number };
  clearCleanHover(): void;
  /** The food dish / feeding-zone anchor for "Place in Dish", or null. */
  feederAnchor(): { x: number; z: number } | null;
  /** The gecko's current floor position (Tong Feed offers food beside it). */
  geckoPosition(): { x: number; z: number };
  /** The feeding tray's food options. */
  foodOptions(): FoodOption[];
  /** Drop one insect of `kind` at world (x,z). Returns the refusal reason or null. */
  dropFood(kind: string, x: number, z: number): string | null;
  /** Serve a full portion with the staged presentation for its method (quick
   *  toss / hand / tongs / dish pour) + real nutrition + the feeding log. */
  serveMealNow(
    kind: string,
    count: number,
    method: string,
    supplement: string,
    at?: { x: number; z: number },
  ): { placed: number; reason: string | null };
  /** True while a feeding presentation (tongs/hand/pour/toss) is running. */
  presentationActive(): boolean;
  /** Steer the player-held tongs — the offer follows the pointer. No-op when
   *  no steerable offer is out. */
  moveOffer(x: number, z: number): void;
  /** Raise/lower the held tong offer (scroll) — held high, the gecko JUMPS. */
  adjustOffer(delta: number): void;
  /** Cinematic mode: the scene drives its follow camera while on. */
  setCinematic(on: boolean): void;
  /** Track Intake: newest-first feeding log + the current sim time. */
  feedingHistory(): { entries: FeedingLogEntry[]; now: number };
  /** Track Intake: totals + diet balance + advice. */
  intake(): IntakeSummary;
  /** The food dish's real capacity + how many insects it currently pens. */
  dishInfo(): { label: string; capacity: number; contained: number } | null;
  /** Honest next-feeding readout (cooldown / digesting / appetite). */
  nextFeeding(): { ready: boolean; label: string; sub: string };
  /** Feed-mode pointer feedback: drives the dashed placement marker; returns
   *  what the pointer is over so the app can style the cursor. */
  feedHover(ground: { x: number; z: number } | null, method: string): { overGecko: boolean; valid: boolean; reason: string | null };
  /** Hide the feed marker (mode exit / pointer left the canvas). */
  clearFeedHover(): void;
  /** Show/hide the soft hover ring under the gecko. */
  setGeckoHover(on: boolean): void;
  /** Apply a terrain brush stroke at world (x,z). */
  sculptAt(tool: TerrainTool, x: number, z: number, radius: number): void;
  /** Strong brush (advanced): taller dunes + digging all the way to bedrock. */
  setStrongBrush(on: boolean): void;
  strongBrush(): boolean;
  /** Current visibility of each debug overlay. */
  debugOptions(): Record<DebugOption, boolean>;
  /** Toggle one debug overlay; returns its new visibility. */
  toggleDebugOption(key: DebugOption): boolean;
}

/**
 * Shared contract for an experimental 3D habitat (fish tank, spider terrarium,
 * lizard terrarium, …). The generic ThreeHabitatRenderer drives any of these:
 * it builds the scene, applies the scene's fixed camera, loads assets, and ticks
 * `update(dt)` each frame. This is the seam that lets us add more habitat
 * prototypes without touching the renderer or the app shell.
 */
import type * as THREE from "three";
import type { LizardController } from "../../habitats/lizard/LizardController";
import type { ObstacleInteraction, PlacementMode } from "../../habitats/HabitatTypes";

/** "creatures" = the DEV-ONLY Creature Lab (?habitat=creatures) and "froglab"
 *  = the DEV-ONLY Frog Animation Lab (?habitat=froglab / ?debugFrog=1) — never
 *  shown in the player-facing habitat switch. */
export type HabitatKind = "fish" | "spider" | "lizard" | "frog" | "creatures" | "froglab";

export interface CameraConfig {
  fov: number;
  pos: [number, number, number];
  look: [number, number, number];
}

/**
 * VIEWING constraints for the normal (non-photo) camera. When a scene provides
 * these, the renderer bounds OrbitControls so dragging feels like leaning your
 * head around a tank that is FIXED in the room — a limited yaw/pitch/zoom window
 * and a pivot clamped inside the tank — never like spinning the tank itself.
 * Photo Mode (and habitats that return null) keep the free orbit.
 */
export interface CameraLimits {
  minAzimuth: number;
  maxAzimuth: number;
  minPolar: number;
  maxPolar: number;
  minDistance: number;
  maxDistance: number;
  /** Clamp box for the orbit target (the point the camera looks at). */
  target: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

export interface HabitatScene {
  /** The Three.js scene to render. Built synchronously in the constructor
   *  (enclosure/lights) so something shows before async assets arrive. */
  readonly scene: THREE.Scene;
  /** Fixed camera framing for this habitat (no orbit/free camera). */
  readonly camera: CameraConfig;
  /** Async-load the animal + any GLB decor. */
  load(): Promise<void>;
  /** Advance the simulation/animation by dt seconds. */
  update(dt: number): void;
  /** Optional "poke" (feeding / disturbance) response. */
  excite?(): void;
  /** Optional NORMAL-mode camera constraints (see {@link CameraLimits}). Null /
   *  absent ⇒ the free orbit stays (fish + spider are unchanged). */
  cameraLimits?(): CameraLimits | null;
  /** Optional live care controller (needs/feed/clean/debug) for habitats that
   *  drive a HUD. Only the lizard terrarium implements this today. */
  getController?(): LizardController | null;
  /** Optional aquarium care hooks (feeding/cleaning visuals + live roster) for
   *  the fish tank's HUD. Only ThreeTankScene implements this. */
  getAquarium?(): AquariumHooks | null;
  /** Optional paludarium care hooks (mist/feed/needs readout) for the frog
   *  habitat's HUD. Only ThreeFrogScene implements this. */
  getFrog?(): FrogHooks | null;
  /** Optional editable habitat (drag/place/move/rotate/scale decor). Only the
   *  lizard terrarium implements this today. Null ⇒ this habitat isn't editable. */
  asEditable?(): EditableHabitat | null;
  /** Optional pickable object for the habitat's animal (click-to-inspect). */
  animalPickObject?(): THREE.Object3D | null;
  /** Optional world position of the animal (for the camera "focus" button). */
  animalPosition?(): [number, number, number] | null;
  /** Optional TRUE ground-surface height (world Y) at floor (x,z) — the
   *  sculpted sand, not the flat base plane. When present, the renderer's
   *  pointer→ground raycast marches the ray against THIS surface, so tools
   *  and markers land exactly under the cursor even on dunes. */
  surfaceYAt?(x: number, z: number): number;
  /** Optional per-frame CAMERA OVERRIDE (cinematic follow / feeding-presentation
   *  angles). While non-null the renderer eases the camera to this pose and
   *  suspends OrbitControls; on null it hands control back where it stands. */
  cameraOverride?(): { pos: [number, number, number]; look: [number, number, number] } | null;
  /** Release GPU resources when the habitat is swapped out. */
  dispose(): void;
}

// ── Aquarium care seam (the fish tank's HUD drives these) ───────────────────────
export type FishFoodKind = "flakes" | "pellets" | "bloodworms";

export interface AquariumHooks {
  /** Sprinkle `count` bits of food at the surface around normalized x (−1..1
   *  across the tank width). Returns how many were actually placed (a live cap
   *  keeps the water from filling with pellets). */
  feed(kind: FishFoodKind, count: number, atX?: number): number;
  /** Uneaten food bits still in the water/on the gravel. */
  foodBitsLive(): number;
  /** Cleaning VISUALS (the sim owns the numbers): sparkle at a front-pane
   *  point / a gravel-vacuum puff at a floor point. */
  scrubFxAt(x: number, y: number): void;
  vacuumFxAt(x: number, z: number): void;
  /** Fresh-water pulse after a water change. */
  waterChangeFx(): void;
  /** Drive water clarity from the sim (0 = murky green, 1 = crystal). */
  setWaterMood(clarity01: number): void;
  /** Front glass pane rect (pointer→pane mapping for scrubbing). */
  glassPane(): { z: number; cx: number; cy: number; w: number; h: number };
  /** Substrate rect (pointer→floor mapping for the gravel vacuum). */
  floorRect(): { y: number; hw: number; hd: number };
  /** Live roster: what is REALLY swimming in this tank right now. */
  population(): { id: string; label: string; count: number }[];
}

// ── Paludarium care seam (the frog habitat's HUD drives these) ──────────────────

/** One line of the frog HUD's live readout — everything the DOM layer needs,
 *  nothing scene-internal leaks out. */
export interface FrogHudState {
  habitatName: string;
  animalName: string;
  species: string;
  scientific: string;
  /** Habitat score 0..100 (computeScores overall). */
  score: number;
  /** Live environment + needs, all 0..100 (temps in °C). */
  humidity: number;
  hunger: number;
  hydration: number;
  stress: number;
  comfort: number;
  health: number;
  cleanliness: number;
  baskingC: number;
  coolC: number;
  /** Crickets currently loose in the enclosure. */
  cricketsLoose: number;
  /** Seconds of misting boost left (0 = air drying back toward base). */
  mistActive: boolean;
  /** Frog behaviour word for the info panel ("Sitting", "Hopping"…). */
  behaviour: string;
  /** True while the frog soaks in the pond. */
  inPond: boolean;
  events: { message: string; tone: string; t: number }[];
}

export interface FrogHooks {
  readState(): FrogHudState;
  /** Release `count` crickets near the feeding zone. Returns how many were
   *  actually placed (live cap). The app consumes stock for the placed count. */
  feed(count: number): number;
  /** Fire the misting nozzles: spray FX + humidity boost. False while a spray
   *  is already running (no stacking sprays). */
  mist(): boolean;
  /** The frog's floor position (hover/pick feedback). */
  frogPosition(): { x: number; z: number } | null;
}

// ── Habitat editor seam (data ops the interaction layer + panel drive) ──────────
/** A placeable in the editor's catalog. */
export interface CatalogItem {
  id: string;
  label: string;
  category: string;
  interaction: string;
  /** Vertical placement mode — drives the floor/hanging filter + Y controls. */
  placement: PlacementMode;
  /** A short section key for grouping cards (the editor's category tabs). */
  section: string;
  /** True when a real GLB backs this placeable (a real thumbnail can render). */
  hasAsset: boolean;
  /** Card copy (from the catalog def): one-liner, ≤3 tag pills, placement tip. */
  desc: string;
  tags: string[];
  tip: string;
  /** Present ⇒ the card is dimmed + padlocked with this reason (not placeable). */
  locked: string | null;
  /** Detail-card meters, pre-resolved to display order: label + 0..10 value. */
  effects: { key: string; label: string; v: number }[];
}

/** A live read-out of one placed object for the editor's inspector. */
export interface PlacedSummary {
  id: string;
  /** Catalog identity (looks up desc/effects/tip on the def) — absent only for
   *  pre-catalog authored objects. */
  defId?: string;
  label: string;
  category: string;
  interaction: ObstacleInteraction;
  x: number;
  y: number;
  z: number;
  /** Vertical placement mode (floor-locked vs Y-movable). */
  placement: PlacementMode;
  /** Euler rotation in DEGREES (stored internally as radians). */
  rotX: number;
  rotY: number;
  rotZ: number;
  /** Per-axis scale (1 = natural size). */
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /** True when scaleX≈scaleY≈scaleZ (uniform). */
  uniform: boolean;
}

/**
 * The data + visual operations the habitat editor performs on a scene. The scene
 * owns the layout, its meshes, collision, navigation, scoring + persistence; the
 * interaction layer (ThreeHabitatEditor) + the DOM panel just call these. Every
 * mutating op is responsible for rebuilding collision + navigation live and saving.
 */
export interface EditableHabitat {
  readonly scene: THREE.Scene;
  /** World Y of the substrate surface (raycast/placement plane). */
  groundY(): number;
  catalog(): CatalogItem[];
  listObjects(): PlacedSummary[];
  getObject(id: string): PlacedSummary | null;
  /** Object groups the editor may raycast against (carry userData.objectId). */
  pickTargets(): THREE.Object3D[];
  /** Approximate XZ footprint radius of a placeable (for the ghost) or placed id. */
  footprintRadius(defOrObjId: string): number;
  /** Is dropping `defId` at (x,z) allowed (bounds / overlap / on-creature)? */
  validPlacement(defId: string, x: number, z: number): boolean;
  /** Create + show a new object; returns its id, or null if placement was invalid. */
  addFromCatalog(defId: string, x: number, z: number): string | null;
  /** Live (cheap) transform updates during a drag/slider gesture — visual + data
   *  only. Call {@link commit} when the gesture ends to rebuild collision + nav. */
  moveObject(id: string, x: number, z: number): void;
  /** Move a prop vertically (elevated/hanging props only; floor props ignore it). */
  moveObjectY(id: string, y: number): void;
  /** Vertical range [minY, maxY] a prop may occupy (floor → a single value). */
  yRange(id: string): [number, number];
  /** Placement mode of a placed object OR a catalog id. */
  placementMode(defOrId: string): PlacementMode;
  /** Set Euler rotation in DEGREES (stored as radians). */
  setRotationEuler(id: string, degX: number, degY: number, degZ: number): void;
  setScaleAxes(id: string, sx: number, sy: number, sz: number): void;
  setInteraction(id: string, interaction: ObstacleInteraction): void;
  /** Why placing `defId` at (x,z) is invalid (null = valid) — for the ghost reason. */
  placementReason(defId: string, x: number, z: number): string | null;
  /** Soft ADVISORY for a legal drop that would still pinch the animal's walking
   *  corridors (ring-sampled against the collision world). Null = all clear. */
  placementWarning(defId: string, x: number, z: number): string | null;
  /** TRUE ground-surface height (world Y) at floor (x,z) — the sculpted sand.
   *  The ghost ring/shadow drape onto this. */
  surfaceYAt(x: number, z: number): number;
  /** Is MOVING the existing object `id` to (x,z) allowed (ignores its own volume)? */
  moveValid(id: string, x: number, z: number): boolean;
  /** Tint the current selection highlight valid (normal) or invalid (red). */
  markSelectionValid(valid: boolean): void;
  /** Toggle / read the collision-debug overlay (shared with the HUD's button). */
  toggleCollisionDebug(): boolean;
  collisionDebugVisible(): boolean;
  /** The animal's pickable object, so clicks on it open the info card (not decor). */
  animalPickObject(): THREE.Object3D | null;
  /** Data-URL thumbnail of a placeable's REAL model for its catalog card (null ⇒
   *  keep the icon fallback). Cached per asset; safe to call repeatedly. */
  thumbnail(defId: string): Promise<string | null>;
  /** A ghost-preview CLONE of a placeable's REAL model at the exact display scale
   *  placement will use (base at local y=0), or null (box fallback). */
  ghostModel(defId: string): Promise<{ object: THREE.Object3D; height: number } | null>;
  /** The Y `addFromCatalog` would place `defId` at — so the ghost previews the
   *  exact final height. Floor props seat on the SCULPTED terrain at (x,z) when
   *  given (dune-aware); hanging/elevated props use their default lift. */
  defaultPlaceY(defId: string, x?: number, z?: number): number;
  /** Rebuild collision + navigation + score and persist, after a live gesture. */
  commit(): void;
  removeObject(id: string): void;
  duplicateObject(id: string): string | null;
  resetTransform(id: string): void;
  snapToFloor(id: string): void;
  centerInHabitat(id: string): void;
  /** Restore the authored default terrarium (keeps the animal + its needs). */
  resetLayout(): void;
  /** Show/clear the selection highlight on an object. */
  highlight(id: string | null): void;
  // Undo / redo of layout edits.
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Push the current layout onto the undo stack (call before a gesture starts). */
  beginEdit(): void;
}

/** Dispose every geometry/material/texture under a scene (on habitat swap). */
export function disposeScene(scene: THREE.Object3D): void {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      const std = m as THREE.MeshStandardMaterial;
      std.map?.dispose();
      std.normalMap?.dispose();
      std.roughnessMap?.dispose();
      std.emissiveMap?.dispose();
      m.dispose();
    }
  });
}

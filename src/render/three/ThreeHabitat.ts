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

/** "creatures" = the DEV-ONLY Creature Lab (?habitat=creatures), not shown in
 *  the player-facing habitat switch. */
export type HabitatKind = "fish" | "spider" | "lizard" | "creatures";

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
  /** Optional editable habitat (drag/place/move/rotate/scale decor). Only the
   *  lizard terrarium implements this today. Null ⇒ this habitat isn't editable. */
  asEditable?(): EditableHabitat | null;
  /** Optional pickable object for the habitat's animal (click-to-inspect). */
  animalPickObject?(): THREE.Object3D | null;
  /** Optional world position of the animal (for the camera "focus" button). */
  animalPosition?(): [number, number, number] | null;
  /** Optional per-frame CAMERA OVERRIDE (cinematic follow / feeding-presentation
   *  angles). While non-null the renderer eases the camera to this pose and
   *  suspends OrbitControls; on null it hands control back where it stands. */
  cameraOverride?(): { pos: [number, number, number]; look: [number, number, number] } | null;
  /** Release GPU resources when the habitat is swapped out. */
  dispose(): void;
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
  /** A short section key for grouping cards (Rocks / Hides / Branches / …). */
  section: string;
  /** True when a real GLB backs this placeable (a real thumbnail can render). */
  hasAsset: boolean;
}

/** A live read-out of one placed object for the editor's inspector. */
export interface PlacedSummary {
  id: string;
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
   *  exact final height (floor props: the substrate; hanging: their default lift). */
  defaultPlaceY(defId: string): number;
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

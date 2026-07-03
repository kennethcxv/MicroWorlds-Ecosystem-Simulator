/**
 * Experimental LIZARD terrarium — now DATA-DRIVEN. It builds its enclosure +
 * collidable furniture from a `HabitatLayout` (LizardHabitatData), drives a
 * leopard gecko with the pure, collision-aware movement brain, runs the feeding
 * + needs sims, and exposes a `LizardController` for the HUD. Saves/loads its own
 * state (namespaced localStorage — the fish tank is untouched).
 *
 * Gecko visual: the freelancer's `leopard_gecko_animated.glb` if present (rigged
 * + clips → ThreeAnimalController plays idle/move/eat), otherwise the procedural
 * placeholder. Both share the exact same brain, so behaviour is identical now
 * and after the rig lands.
 */
import * as THREE from "three";
import type { CameraConfig, CameraLimits, CatalogItem, EditableHabitat, HabitatScene, PlacedSummary } from "./ThreeHabitat";
import { disposeScene } from "./ThreeHabitat";
import { makeTerrariumLights } from "./ThreeMaterials";
import {
  buildTerrarium,
  buildPlaceholderObject,
  displayScaleFor,
  disposeObject,
  loadDecorFor,
  loadTerrariumDecor,
  retintSubstrateBed,
  swapInDecor,
  swapSandTexture,
} from "./ThreeTerrarium";
import { MaterialFloor, makeRockMesh } from "./ThreeSandTexture";
import { DEFAULT_TERRAIN_ID, terrainById, terrainUnlocked, type TerrainDef } from "../../data/terrains";
import {
  coverageFractions,
  dominantMaterialId,
  ensureMaterialMap,
  materialIdAt,
  paintMaterial,
  type SubstrateMaterialMap,
} from "../../habitats/HabitatMaterialMap";
import { decorThumbnail } from "./ThreeThumbnails";
import { ThreeAnimalController } from "./ThreeAnimalController";
import { ThreeFeeders } from "./ThreeFeederInsects";
import { ThreeIsopods } from "./creatures/ThreeIsopods";
import { preloadCreatures } from "./creatures/ThreeCreatureLoader";
import { ThreeCollisionDebug } from "./ThreeCollisionSystem";
import { ContactShadow } from "./ThreeContactShadow";
import {
  habitatAssetExists,
  loadDecorModelCached,
  loadRiggedAnimal,
  loadTextureIfExists,
  lizardTextureUrl,
  type RiggedModel,
} from "./ThreeAssetLoader";

import type { HabitatState, HabitatType, ObstacleInteraction, PlacedObject, PlacementMode, Vec3 } from "../../habitats/HabitatTypes";
import type { GroundBounds } from "../../habitats/HabitatBounds";
import { clampXZ, containsXZ } from "../../habitats/HabitatBounds";
import { enclosureSpec, type EnclosureSpec } from "../../habitats/EnclosureSpec";
import { migrateLayout } from "../../habitats/HabitatMigrate";
import type { VivariumShell } from "./ThreeVivariumShell";
import { CollisionWorld, type GroundSource } from "../../habitats/HabitatCollision";
import {
  addObject,
  removeObject as layoutRemove,
  duplicateObject as layoutDuplicate,
  findObject,
  uniqueObjectId,
} from "../../habitats/HabitatLayout";
import { computeScores, ratingFor } from "../../habitats/HabitatStats";
import { logHabitatEvent } from "../../habitats/HabitatState";
import { careProfile } from "../../habitats/HabitatSpecies";
import { capacityWarning, LIZARD_PLACEABLES, LIZARD_SIZE_OPTIONS, findPlaceable, makePlaced, rehydrateLayoutAssets } from "../../habitats/HabitatBuilder";
import { canPlace, hangingIssue, placementIssue, settleHanging, type PlacementBlocker } from "../../habitats/HabitatEditing";
import { accumulateDirt, cleanAt, cleanlinessPct, dirtSpots, ensureDirtMap, isSpotless, type DirtSpot } from "../../habitats/lizard/LizardDirtSystem";
import {
  ensureTerrain,
  flattenTerrain,
  paintWater,
  sculpt,
  sculptLimits,
  smoothTerrain,
  terrainHeightAt,
  terrainSlopeAt,
  terrainStats,
} from "../../habitats/HabitatTerrain";
import { computeWellbeing } from "../../habitats/lizard/LizardWellbeing";
import {
  AnalysisOverlay,
  GroundOverlay,
  SparkleBurst,
  TerrainBrushCursor,
  applyTerrainToSand,
  type AnalysisField,
} from "./ThreeTerrainOverlay";
import { filterById, filterStatus, scaleColor } from "../../data/habitatFilters";
import type { CursorGlyph } from "../../data/terrainTools";
import { saveHabitat, loadHabitat } from "../../habitats/HabitatSaveLoad";
import { GECKO_MOVEMENT, GeckoMovementController, type HuntTarget } from "../../habitats/lizard/GeckoMovementController";
import { LIZARD_NEEDS, updateNeeds } from "../../habitats/lizard/LizardNeedsSystem";
import {
  FOOD_TYPES,
  MAX_LIVE_FEEDERS,
  canFeed,
  consumeFeeder,
  dishCapacity,
  dishInterior,
  findFoodDish,
  logFeeding,
  nearestFeeder,
  placeFeederAt,
  serveMeal,
  spawnFeeders,
  updateFeeders,
  wantsToEat,
} from "../../habitats/lizard/LizardFeedingSystem";
import { FULL_HUNGER } from "../../habitats/lizard/LizardFeedingSystem";
import { ensureNeedDefaults, intakeSummary, type IntakeSummary } from "../../habitats/lizard/LizardNutrition";
import { ThreeFeedingPresentation, type PresentationHooks } from "./ThreeFeedingPresentation";
import type { FeederKind, FeedMethodKind, FeedingLogEntry, SupplementKind } from "../../habitats/HabitatTypes";
import { LIZARD_HABITAT_ID, makeLizardHabitatLayout, makeLizardHabitatState } from "../../habitats/lizard/LizardHabitatData";
import { GECKO_HIDE_FIT, hideAnchor } from "../../habitats/lizard/LizardController";
import {
  addDropping,
  cleanDroppingsAt,
  didPoop,
  needsToilet,
  pickToiletCorner,
  tickDigestion,
} from "../../habitats/lizard/LizardDigestion";
import { findPerchSpot, lowSideStaging } from "../../habitats/lizard/LizardPerch";
import { ThreeDroppings } from "./ThreeDroppings";
import { ThreeGlassSmudge } from "./ThreeGlassSmudge";
import { sfx } from "../sfx";
import {
  applyPersonalityToMovement,
  applyPersonalityToNeeds,
  ensurePersonality,
  personalityOf,
} from "../../habitats/lizard/LizardPersonality";
import type {
  AnimalInfoState,
  DebugOption,
  FoodOption,
  LizardController,
  LizardHudState,
  TerrainTool,
} from "../../habitats/lizard/LizardController";

const FINAL_GECKO = "lizard/leopard_gecko_animated.glb";
const GECKO_BODY_LENGTH = 0.3;

export class ThreeLizardScene implements HabitatScene, EditableHabitat {
  readonly scene = new THREE.Scene();
  readonly camera: CameraConfig;

  private state: HabitatState;
  /** SINGLE SOURCE OF TRUTH for every enclosure number (see EnclosureSpec). */
  private spec: EnclosureSpec;
  private shell: VivariumShell;
  private bounds: GroundBounds;
  private world: CollisionWorld;
  private brain: GeckoMovementController;
  private animal: ThreeAnimalController | null = null;
  private feeders = new ThreeFeeders();
  private isopods: ThreeIsopods | null = null;
  private droppings = new ThreeDroppings();
  private debug: ThreeCollisionDebug;
  private debugOn = false;
  private scoresCached: ReturnType<typeof computeScores>;
  private saveAccum = 0;
  private usingPlaceholder = true;
  private geckoShadow: ContactShadow | null = null;
  private decorShadows = new THREE.Group();
  private decorShadowObjs: ContactShadow[] = [];
  private selectionRing: THREE.Mesh | null = null;
  private selectedId: string | null = null;
  // Animal body-probe debug (dynamic — follows the gecko each frame when debug on).
  private probeGroup = new THREE.Group();
  private probeRings: THREE.Mesh[] = [];
  private animalRing: THREE.Mesh | null = null;
  // Cleaning Mode: amber rings over the current dirty spots.
  private dirtRings = new THREE.Group();
  private dirtRingsOn = false;
  private dirtRingsT = 0;
  // Feeding presentations (tongs / hand / pour / toss) + their staged cameras.
  private presentation = new ThreeFeedingPresentation();
  // Cinematic mode: slow close follow-orbit of the gecko (letterboxed by the UI).
  private cinematicOn = false;
  private cineAngle = 0.85;
  // Feed-mode hover marker (the dashed teal placement ellipse from the reference)
  // + a soft ring under the gecko when the pointer is over it.
  private hoverMarker!: THREE.Line;
  private hoverGeckoRing!: THREE.Mesh;
  private hoverT = 0;
  // Cleaning-mode TOOL (replaces the OS cursor): a little sponge riding the
  // sand, tilting + jittering while scrubbing, with dust puffs.
  private cleanTool!: THREE.Group;
  private cleanTools!: { spot: THREE.Group; sweep: THREE.Group; wipe: THREE.Group; water: THREE.Group };
  private cleanScrub = false;
  // Manual water pour: progress while the pitcher is HELD over the dish.
  private pouring = false;
  private pourT = 0;
  private pourDripT = 0;
  private scrubPuffT = 0;
  // Interactive front-glass smudges (nose smears / paw prints / dust streaks).
  private glassSmudge: ThreeGlassSmudge | null = null;
  private smudgeAccumT = 0;
  private geckoSmearT = 0;
  private wipeSqueakT = 0;
  private glassWasClean = true;
  private puffs: { pts: THREE.Points; vel: Float32Array; life: number; max: number }[] = [];
  private glassSheen: THREE.Mesh | null = null;
  private glassSheenT = -1;
  /** Seconds since the water dish was last replaced / the glass last wiped —
   *  drives the honest status pills in Cleaning Mode. */
  private waterFreshT = 9999;
  private glassWipeT = 9999;
  /** The feeder currently carried in the MOUTH (bite → chew → swallow). */
  private mouthFeederId: number | null = null;
  /** This individual's rolled personality + the configs tuned to it. */
  private persona!: ReturnType<typeof personalityOf>;
  private moveCfg!: typeof GECKO_MOVEMENT;
  private needsCfg!: typeof LIZARD_NEEDS;

  // Interactive care systems (dirt + terrain + shelter drive).
  private dirt!: ReturnType<typeof ensureDirtMap>;
  private terrain!: ReturnType<typeof ensureTerrain>;
  private overlay!: GroundOverlay;
  private overlayDirtyT = 0;
  private waterFracCached = 0;
  private reliefCached = 0;
  // Filters tab: the analysis wash + its state; Terrain tab: the brush cursor.
  private analysis!: AnalysisOverlay;
  private analysisFilterId: string | null = null;
  private analysisIntensity = 0.8;
  private brushCursor = new TerrainBrushCursor();
  // Painted-substrate material map + its composite floor texture + the real
  // 3D stones scattered over pebble/rocky cells.
  private materials!: SubstrateMaterialMap;
  private matFloor: MaterialFloor | null = null;
  private matDecor: THREE.Group | null = null;
  private strokeCells = 0;
  private strokePaintId = "";
  private substrateBlend = { base: 38, hold: 1 };
  private sparkle: SparkleBurst | null = null;
  private celebratedSpotless = false;
  private shelterDecideT = 4;
  private shelterRestT = 0;
  /** Seconds before the gecko will consider sheltering again after leaving. */
  private shelterCooldownT = 0;
  /** What the current rest trip is: a hide, an open-air nap, a rock PERCH, or
   *  the walk to the bathroom corner. */
  private shelterKind: "hide" | "nap" | "perch" | "toilet" = "nap";
  /** Basking pose on a perch: sometimes belly-down, sometimes standing alert. */
  private baskLie = false;
  /** The deliberate pause at the hide's mouth before walking in (once per trip). */
  private hidePeeked = true;
  private shelterAnchor = { x: 0, z: 0 };
  /** LIVE terrain sampler shared with the collision world (reads this.terrain by
   *  reference — a brush stroke changes walk heights with no world rebuild). */
  private groundSrc!: GroundSource;
  private strongBrushOn = false;
  // Foot-contact / surface-normal debug (independent of the collision overlay).
  private footDebugOn = false;
  private normalsDebugOn = false;
  private terrainDebugOn = false;
  private footMarkers: THREE.Mesh[] = [];
  private footGroup = new THREE.Group();
  private normalLines: THREE.LineSegments | null = null;

  constructor() {
    // Load prior save or build the authored default.
    this.state = loadHabitat(LIZARD_HABITAT_ID) ?? makeLizardHabitatState();
    // Heal pre-nutrition saves: fill the calcium/body-condition stores once.
    for (const a of this.state.animals) ensureNeedDefaults(a.needs);
    // PERSONALITY: rolled once per animal from the real-life-skewed roulette,
    // persisted forever, and applied to movement + appetite + climb comfort.
    const rolled = ensurePersonality(this.state.animals[0]);
    this.persona = rolled.def;
    this.moveCfg = applyPersonalityToMovement(GECKO_MOVEMENT, this.persona);
    this.needsCfg = applyPersonalityToNeeds(LIZARD_NEEDS, this.persona);
    if (rolled.justAssigned) {
      logHabitatEvent(
        this.state,
        `${this.state.animals[0].name}'s personality: ${this.persona.label} — ${this.persona.blurb}`,
        "good",
      );
    }
    // Self-heal a loaded layout: re-derive current GLB asset paths from each object's
    // defId + drop stale footprints, so a save never loads placeholders-with-primitive
    // -collision instead of the real decor meshes. (No-op on a fresh default.)
    rehydrateLayoutAssets(this.state.layout);
    // MIGRATE the save into the current enclosure: stale persisted dimensions are
    // snapped back to the catalog record and any out-of-bounds objects/zones/
    // equipment are clamped inside — a broken or hand-edited save never loads a
    // broken tank. (No-op on a clean save.)
    const migrated = migrateLayout(this.state.layout, LIZARD_SIZE_OPTIONS);
    if (migrated.dimensionsChanged || migrated.movedObjects.length > 0) {
      console.info(
        `[terrarium] migrated save into the current enclosure` +
          `${migrated.dimensionsChanged ? " (dimensions normalized)" : ""}` +
          `${migrated.movedObjects.length ? ` (moved: ${migrated.movedObjects.join(", ")})` : ""}`,
      );
    }
    const layout = this.state.layout;
    // ONE derivation feeds the shell, camera, bounds, placement, terrain + debug.
    // Home position + target come from the spec (NOT the persisted layout, which
    // may carry a stale pre-rebuild camera record); only the fov is authored.
    this.spec = enclosureSpec(layout.dimensions);
    this.camera = { fov: layout.camera.fov, pos: this.spec.cameraHome, look: this.spec.cameraTarget };

    this.scene.fog = new THREE.Fog(0x2c2418, 6.0, 11);
    this.scene.add(makeTerrariumLights());
    this.addBaskingGlow(layout);

    // Vivarium shell (glass/frame/tray/back panel/stand/fixtures) + sand floor +
    // collidable furniture, all sized by the same spec.
    this.shell = buildTerrarium(this.scene, layout);

    // Local DIRT + sculpted TERRAIN state (rehydrated save-safe) + their visuals:
    // the sand displaces from the height map; a decal overlay draws grime + wet
    // patches exactly where the sim says they are.
    this.dirt = ensureDirtMap(this.state.dirt);
    this.terrain = ensureTerrain(this.state.terrain);
    this.state.dirt = this.dirt;
    this.state.terrain = this.terrain;
    // Painted substrate materials (older saves ⇒ a uniform floor of the
    // applied terrain); ambient humidity blends by coverage.
    this.materials = ensureMaterialMap(
      this.state.materials,
      this.state.layout.substrate.terrainId ?? DEFAULT_TERRAIN_ID,
    );
    this.state.materials = this.materials;
    this.recomputeSubstrateBlend();
    this.overlay = new GroundOverlay(layout.dimensions, layout.dimensions.substrateTop, this.spec.sandInset);
    this.scene.add(this.overlay.mesh);
    // Filters-tab analysis wash + Terrain Mode's in-world brush cursor.
    this.analysis = new AnalysisOverlay(layout.dimensions, layout.dimensions.substrateTop, this.spec.sandInset);
    this.scene.add(this.analysis.mesh);
    this.scene.add(this.brushCursor.group);

    // Collision world: THE walk rectangle from the spec (identical to the decor/
    // food placement bounds — navigation matches the visible tank) + compiled
    // object volumes + the LIVE terrain sampler (walk height / feet / nav /
    // feeding follow the brush).
    this.bounds = this.spec.walk;
    this.groundSrc = {
      heightAt: (x, z) => terrainHeightAt(this.terrain, layout.dimensions, x, z),
      slopeAt: (x, z) => terrainSlopeAt(this.terrain, layout.dimensions, x, z),
    };
    this.world = CollisionWorld.fromLayout(layout, this.bounds, this.groundSrc, { maxClimb: this.persona.climbCap });
    this.applyTerrainVisuals();
    this.overlay.redraw(this.dirt, this.terrain);

    // Contact (blob) shadows to ground the decor + gecko.
    this.scene.add(this.decorShadows);
    this.addDecorShadows();

    // Movement brain, resuming the saved pose if any — tuned to the PERSONALITY
    // (an energetic hunter genuinely moves faster and idles less than a basker).
    const saved = this.state.animals[0]?.position;
    const start = saved ? { x: saved[0], z: saved[2] } : undefined;
    this.brain = new GeckoMovementController(this.world, this.moveCfg, Math.random, start);

    this.scoresCached = computeScores(layout);

    this.debug = new ThreeCollisionDebug(this.world, GECKO_MOVEMENT.bodyRadius);
    this.scene.add(this.debug.object);
    this.scene.add(this.feeders.object);
    this.scene.add(this.droppings.object);
    this.state.droppings ??= []; // heal pre-digestion saves
    this.droppings.sync(this.state.droppings);
    this.scene.add(this.presentation.object);
    this.buildHoverMarkers();

    // Dynamic per-frame body-probe rings (the animal's own collision, for debug).
    this.probeGroup.visible = false;
    this.buildProbeRings();
    this.scene.add(this.probeGroup);

    // Foot-contact markers + surface-normal whiskers (their own debug toggles).
    this.footGroup.visible = false;
    this.buildFootDebug();
    this.scene.add(this.footGroup);
  }

  /** One small sphere per foot (green planted / yellow stepping / red no-contact)
   *  + a 4-segment line buffer for the sampled surface normals. */
  private buildFootDebug(): void {
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x51e07e, depthTest: false, transparent: true, opacity: 0.95 }),
      );
      m.renderOrder = 1003;
      this.footMarkers.push(m);
      this.footGroup.add(m);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(4 * 2 * 3), 3));
    this.normalLines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x9ad8ff, depthTest: false, transparent: true, opacity: 0.9 }),
    );
    this.normalLines.renderOrder = 1003;
    this.normalLines.visible = false;
    this.footGroup.add(this.normalLines);
  }

  /** Slide the foot markers onto the live contacts; recolour by state; optionally
   *  draw each foot's sampled surface normal as a short whisker. */
  private updateFootDebug(): void {
    const feet = this.brain.feet;
    const standY = this.bounds.y + this.brain.climbHeight;
    const pos = this.normalLines?.geometry.attributes.position as THREE.BufferAttribute | undefined;
    for (let i = 0; i < this.footMarkers.length; i++) {
      const f = feet[i];
      const m = this.footMarkers[i];
      if (!f) continue;
      m.position.set(f.x, f.y + 0.004, f.z);
      (m.material as THREE.MeshBasicMaterial).color.setHex(
        !f.valid ? 0xff5a4a : f.state === "stepping" ? 0xf3d54e : 0x51e07e,
      );
      if (pos && this.normalsDebugOn) {
        const n = this.world.sampleSurfaceAt(f.x, f.z, standY).normal;
        const L = 0.075;
        pos.setXYZ(i * 2, f.x, f.y, f.z);
        pos.setXYZ(i * 2 + 1, f.x + n[0] * L, f.y + n[1] * L, f.z + n[2] * L);
      }
    }
    if (pos && this.normalsDebugOn) pos.needsUpdate = true;
    if (this.normalLines) this.normalLines.visible = this.normalsDebugOn;
  }

  /** One flat cyan ring per gecko body probe (head → tail); positioned each frame. */
  private buildProbeRings(): void {
    for (const p of this.brain.bodyProbes) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.004, p.r - 0.006), p.r, 20),
        new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 1001;
      this.probeRings.push(ring);
      this.probeGroup.add(ring);
    }
  }

  /** Slide each probe ring to its live world position (centre + heading + climb). */
  private updateProbeRings(): void {
    const p = this.brain.position;
    const yaw = this.brain.heading;
    const y = this.bounds.y + 0.02 + this.brain.climbHeight;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const probes = this.brain.bodyProbes;
    for (let i = 0; i < this.probeRings.length; i++) {
      const pr = probes[i];
      if (!pr) continue;
      this.probeRings[i].position.set(p.x + fx * pr.forward + rx * pr.side, y, p.z + fz * pr.forward + rz * pr.side);
    }
  }

  /** A warm pool of light on the basking spot (cozy heat-lamp glow). */
  private addBaskingGlow(layout: HabitatState["layout"]): void {
    const lamp = layout.equipment.find((e) => e.kind === "heat_lamp");
    const t = lamp?.target ?? [-0.85, layout.dimensions.substrateTop, -0.42];
    const glow = new THREE.PointLight(0xffb26b, 6, 1.8, 2.2);
    glow.position.set(t[0], layout.dimensions.substrateTop + 0.5, t[2]);
    this.scene.add(glow);
  }

  /** Static blob shadows under the sizeable decor (rocks / hides / driftwood /
   *  dishes) so nothing floats. Read straight from the compiled collision volumes. */
  private addDecorShadows(): void {
    const y = this.world.bounds.y;
    for (const ob of this.world.obstacles) {
      const bc = this.world.boundingCircle(ob);
      const s = new ContactShadow(bc.r * 1.15, y, 0.42);
      s.setStatic(bc.cx, bc.cz);
      this.decorShadows.add(s.mesh);
      this.decorShadowObjs.push(s);
    }
  }

  async load(): Promise<void> {
    // In parallel: probe for the freelancer's final rig, load the real decor GLBs,
    // and look for a dropped-in sand texture.
    const rigP: Promise<RiggedModel | null> = habitatAssetExists(FINAL_GECKO).then((ok) =>
      ok ? loadRiggedAnimal(FINAL_GECKO) : null,
    );
    const decorP = loadTerrariumDecor(this.scene, this.state.layout);
    const sandP = loadTextureIfExists(lizardTextureUrl("sand_substrate_01.png"));
    // Preload the self-made creature GLBs used in the vivarium: the REAL
    // feeder cricket (swapped in by the insect factory) + the isopod crew.
    const creaturesP = preloadCreatures(["feeder_cricket", "isopod"]).catch(() => undefined);
    const [rigged, , sandTex] = await Promise.all([rigP, decorP, sandP, creaturesP]);

    // A PAINTED (non-uniform) floor rebuilds its composite texture + the real
    // scattered stones on load.
    const uniformFloor = new Set(this.materials.cells).size <= 1;
    if (!uniformFloor) {
      this.ensureMaterialFloor();
      this.refreshMaterialDecor();
    }
    // The dropped-in PNG is a Sahara-look override — it only applies while the
    // floor is still the untouched default sand.
    if (sandTex && uniformFloor && this.appliedTerrain().id === DEFAULT_TERRAIN_ID) {
      swapSandTexture(this.scene, sandTex);
      console.info("[terrarium] using dropped-in sand_substrate_01.png");
    }

    // Decor GLBs are loaded — their MEASURED footprints are now on the layout, so
    // recompile collision + navigation to hug the real meshes (tight, no float).
    this.rebuildWorld();

    this.usingPlaceholder = !rigged || rigged.clips.length === 0;
    this.animal = new ThreeAnimalController({
      brain: this.brain,
      groundY: this.world.bounds.y,
      rigged: this.usingPlaceholder ? null : rigged,
      bodyLength: GECKO_BODY_LENGTH,
      // Leopard-gecko yellow — clearly reads against the tan sand (the placeholder
      // is meant to be visible + obviously a gecko until the final rig lands).
      color: 0xe6c24e,
      // Author these to match the delivered rig's forward axis if needed.
      modelYaw: 0,
    });
    this.animal.object.userData.animalId = this.state.animals[0].id;
    this.scene.add(this.animal.object);

    // Gecko contact shadow.
    this.geckoShadow = new ContactShadow(GECKO_BODY_LENGTH * 0.85, this.world.bounds.y, 0.5);
    this.scene.add(this.geckoShadow.mesh);

    if (this.usingPlaceholder) {
      console.info("[gecko] using procedural placeholder — drop leopard_gecko_animated.glb into public/assets/3d/habitats/lizard/ to use the final rig.");
    } else {
      console.info("[gecko] final rig loaded:", this.animal.clipNames);
    }

    // BIOACTIVE CLEANUP CREW: a small isopod colony living around the decor —
    // hidden background life that genuinely nibbles light dirt. Fault-tolerant:
    // a missing GLB simply means no colony.
    this.isopods = new ThreeIsopods({
      minX: this.bounds.minX,
      maxX: this.bounds.maxX,
      minZ: this.bounds.minZ,
      maxZ: this.bounds.maxZ,
      groundY: (x, z) => this.world.groundHeightAt(x, z),
      shelters: () =>
        this.state.layout.objects
          .filter((o) => o.interaction === "hide" || o.category === "rock" || o.category === "branch")
          .map((o) => ({ x: o.position[0], z: o.position[2] })),
      threat: () => {
        const p = this.brain.position;
        return { x: p.x, z: p.z };
      },
      onCleanup: (x, z, amount) => {
        cleanAt(this.dirt, this.state.layout.dimensions, x, z, 0.05, amount);
      },
    });
    await this.isopods.spawn(5);
    this.scene.add(this.isopods.group);

    // Optional collision + navigation debug via ?debugCollision=1 (or the C key).
    try {
      if (new URLSearchParams(window.location.search).get("debugCollision") === "1") {
        this.setDebug(true);
      }
    } catch {
      /* non-browser */
    }

    // Read-only QA hook so automated tests can sample the gecko without the UI.
    Object.assign(globalThis, {
      __lizard: {
        pos: () => this.brain.position,
        state: () => this.brain.state,
        phase: () => this.brain.navPhase,
        // Bioactive crew QA: live isopod positions (empty = no colony).
        isopods: () => this.isopods?.positions() ?? [],
        // Which cricket visual is live: the real creature GLB or the fallback?
        cricketVisual: () => this.feeders.cricketVisual(),
        climb: () => this.brain.climbHeight,
        pitch: () => +this.brain.groundPitch.toFixed(3),
        roll: () => +this.brain.groundRoll.toFixed(3),
        geckoY: () => +(this.bounds.y + this.brain.climbHeight).toFixed(3),
        // FOOT-CONTACT QA: live world contacts + how far each planted foot is
        // from the true surface under it (should be ~0 — no float, no sink).
        feet: () =>
          this.brain.feet.map((f) => ({
            id: f.id,
            x: +f.x.toFixed(3),
            y: +f.y.toFixed(3),
            z: +f.z.toFixed(3),
            state: f.state,
            lift: +f.lift.toFixed(3),
            valid: f.valid,
            gap: +(
              f.y -
              f.lift -
              this.world.climbHeightAt(f.x, f.z, 0, this.bounds.y + this.brain.climbHeight)
            ).toFixed(4),
          })),
        // Full surface sample (type / id / normal / slope / flags) at a point.
        sample: (x: number, z: number, fromY?: number) => {
          const s = this.world.sampleSurfaceAt(x, z, fromY ?? this.bounds.y);
          return {
            y: +s.y.toFixed(3),
            type: s.type,
            objectId: s.objectId,
            slope: +s.slope.toFixed(3),
            normal: s.normal.map((n) => +n.toFixed(3)),
            walkable: s.walkable,
            climbable: s.climbable,
            tooSteep: s.tooSteep,
            fallback: s.fallback,
          };
        },
        // Sculpted terrain offset from flat sand at a point (m).
        terrainAt: (x: number, z: number) => +(this.world.groundHeightAt(x, z) - this.bounds.y).toFixed(3),
        sculptStrong: (on: boolean) => {
          this.strongBrushOn = on;
          return this.strongBrushOn;
        },
        debugOptions: () => this.debugOptions(),
        toggleDebugOption: (k: string) => this.toggleDebugOption(k as DebugOption),
        // Exact-surface QA: the walk height collision returns at (x,z) for an animal
        // standing at `fromY` (default: the substrate), relative to the substrate —
        // proves per-point heights + pass-under without screen math.
        surfaceAt: (x: number, z: number, fromY?: number) =>
          +(this.world.climbHeightAt(x, z, 0, fromY ?? this.bounds.y) - this.bounds.y).toFixed(3),
        // How many compiled volumes carry a measured per-point heightfield.
        surfacedVolumes: () => this.world.obstacles.filter((o) => o.hf).length,
        feeders: () => this.state.feeders.filter((f) => f.alive).length,
        hunger: () => this.state.animals[0].needs.hunger,
        foodUnreachable: () => this.brain.foodUnreachable,
        usingPlaceholder: () => this.usingPlaceholder,
        // No-phasing QA: true if ANY body probe currently penetrates a hard obstacle.
        bodyBlocked: () =>
          this.world.bodyBlocked(this.brain.position.x, this.brain.position.z, this.brain.heading, this.brain.bodyProbes),
        probes: () => this.brain.bodyProbes.length,
        debug: () => this.debugOn,
        // Editor QA hooks.
        parts: (id: string) => findObject(this.state.layout, id)?.assetFootprint?.parts?.length ?? 0,
        footprint: (id: string) => {
          const fp = findObject(this.state.layout, id)?.assetFootprint;
          return fp
            ? {
                hull: fp.hull?.length ?? 0,
                parts: fp.parts?.length ?? 0,
                contours: fp.contours?.length ?? 0,
                contourPts: (fp.contours ?? []).map((c) => c.length),
                half: fp.half.map((n) => +n.toFixed(3)),
              }
            : null;
        },
        // Compiled SOLVER volumes by shape — proves what the animal actually collides
        // with (e.g. { poly: 9, circle: 0 } ⇒ exact contours, not primitives).
        solverShapes: () => {
          const counts: Record<string, number> = {};
          for (const ob of this.world.obstacles) counts[ob.shape] = (counts[ob.shape] ?? 0) + 1;
          return counts;
        },
        // THE GATE: hide/show every decor mesh (real GLBs + placeholders) so the
        // debug outline can be judged against the asset silhouette on its own.
        setDecorVisible: (v: boolean) => {
          for (const c of this.scene.children) {
            if (c.userData?.objectId) c.visible = v;
          }
          return v;
        },
        // Care-system QA.
        sheltering: () => this.brain.sheltering,
        cleanliness: () => this.cleanliness(),
        waterFrac: () => +this.waterFracCached.toFixed(3),
        dirtAvg: () => +(this.dirt.cells.reduce((a, b) => a + b, 0) / this.dirt.cells.length).toFixed(4),
        dropFoodAt: (kind: string, x: number, z: number) => this.dropFood(kind, x, z),
        brushCleanAt: (x: number, z: number, r: number) => +this.brushClean(x, z, r).toFixed(4),
        sculptTool: (tool: string, x: number, z: number, r: number) => {
          this.sculptAt(tool as TerrainTool, x, z, r);
          return terrainStats(this.terrain);
        },
        // Paint-brush QA: lay a material + commit, returning live coverage.
        paintMaterial: (id: string, x: number, z: number, r: number) => {
          this.paintMaterialAt(id, x, z, r);
          this.paintStrokeEnd();
          return Object.fromEntries([...coverageFractions(this.materials)].map(([k, v]) => [k, +v.toFixed(3)]));
        },
        materialCoverage: () =>
          Object.fromEntries([...coverageFractions(this.materials)].map(([k, v]) => [k, +v.toFixed(3)])),
        placement: (id: string) => this.placementMode(id),
        posY: (id: string) => findObject(this.state.layout, id)?.position[1] ?? 0,
        canPlaceAt: (defId: string, x: number, z: number) => this.validPlacement(defId, x, z),
        placeReason: (defId: string, x: number, z: number) => this.placementReason(defId, x, z),
        geckoAt: () => {
          const p = this.brain.position;
          return [+p.x.toFixed(3), +p.z.toFixed(3)];
        },
        objects: () => this.state.layout.objects.length,
        objectIds: () => this.state.layout.objects.map((o) => o.id),
        selected: () => this.selectedId,
        score: () => this.scoresCached.overall,
        blockedAt: (x: number, z: number) => this.world.isBlocked(x, z, GECKO_MOVEMENT.bodyRadius),
        speed: () => this.brain.speed01,
        feederList: () =>
          this.state.feeders
            .filter((f) => f.alive)
            .map((f) => [+f.position[0].toFixed(3), +f.position[2].toFixed(3), +f.position[1].toFixed(3)]),
        personality: () => this.persona.id,
        // Worst live body-probe penetration depth into hard decor (metres) —
        // the honest no-phasing metric (sub-cm = invisible).
        bodyPen: () =>
          +this.world
            .bodyPenetration(this.brain.position.x, this.brain.position.z, this.brain.heading, this.brain.bodyProbes)
            .toFixed(4),
        // Worst VERTICAL clearance of any body part vs the mesh under it
        // (negative = inside a mesh — must never happen).
        partClear: () => +this.brain.worstPartClearance.toFixed(4),
        // Floor-field diagnostics: which hides have one + the floor height at
        // their anchor (QA for the stand-on-the-cave-floor rule).
        floorInfo: () =>
          this.state.layout.objects
            .filter((o) => o.category === "hide" || o.interaction === "hide")
            .map((o) => {
              const vol = this.world.obstacles.find((v) => v.id === o.id && v.hf);
              const span = vol ? this.world.floorSpanAt(vol, o.position[0], o.position[2]) : null;
              return {
                id: o.id,
                asset: o.asset ?? null,
                hasField: !!vol?.hf,
                hasFloor: !!vol?.hf?.floor,
                floorTopAtCenter: span ? +span.top.toFixed(3) : null,
                interaction: vol?.interaction ?? null,
                passable: vol?.passable ?? null,
                vols: this.world.obstacles.filter((v) => v.id === o.id).length,
                bcHit: vol?.bc
                  ? Math.hypot(o.position[0] - vol.bc.cx, o.position[2] - vol.bc.cz) <= vol.bc.r
                  : null,
              };
            }),
        // Max body radius each hide's pocket accepts + the anchor point it
        // would shelter at (QA: tune GECKO_HIDE_FIT / diagnose bad anchors).
        hideFit: () =>
          this.state.layout.objects
            .filter((o) => o.interaction === "hide" || o.category === "hide")
            .map((o) => {
              for (let r = 0.16; r >= 0.05; r -= 0.005) {
                const a = hideAnchor(this.world, o, r);
                if (a) return { id: o.id, fit: +r.toFixed(3), at: [+a.x.toFixed(3), +a.z.toFixed(3)], obj: [o.position[0], o.position[2]] };
              }
              return { id: o.id, fit: 0, at: null, obj: [o.position[0], o.position[2]] };
            }),
        // Nav-graph introspection (QA: prove the doorway corridors exist and
        // the planner can thread them).
        navNodes: () => this.brain.navNodes.map((p) => [+p.x.toFixed(2), +p.z.toFixed(2)]),
        los: (x1: number, z1: number, x2: number, z2: number) =>
          this.world.losClear(x1, z1, x2, z2, GECKO_MOVEMENT.bodyRadius),
        probePath: (tx: number, tz: number) => {
          const p = this.brain.probePath(tx, tz);
          return p ? p.map((w) => [+w.x.toFixed(2), +w.z.toFixed(2)]) : null;
        },
        probePathFrom: (x1: number, z1: number, x2: number, z2: number) => {
          const p = this.brain.probePathFrom(x1, z1, x2, z2);
          return p ? p.map((w) => [+w.x.toFixed(2), +w.z.toFixed(2)]) : null;
        },
        // Force a shelter attempt NOW (QA: watch the gecko route in through
        // the mouth without waiting out the natural cadence).
        shelterNow: () => {
          const anchor = this.nearestHideAnchor();
          if (!anchor) return null;
          const ok = this.brain.requestShelter(anchor);
          if (ok) {
            this.shelterRestT = 20;
            this.shelterKind = "hide";
            this.hidePeeked = false;
            this.shelterAnchor = { x: anchor.x, z: anchor.z };
          }
          return { anchor: [+anchor.x.toFixed(3), +anchor.z.toFixed(3)], accepted: ok };
        },
        // Fraction of the front pane carrying smudge (QA for glass wiping).
        glassCover: () => +(this.glassSmudge?.coverage() ?? 0).toFixed(3),
        // Force a TOILET trip NOW (QA: digest full + due → next decide tick
        // walks to the bathroom corner and goes).
        poopNow: () => {
          const g = this.state.animals[0];
          g.digest = 99;
          g.digestT = 0;
          this.shelterDecideT = 0.1;
          return { spot: g.toiletSpot ?? null, due: true };
        },
        droppingList: () =>
          (this.state.droppings ?? []).map((d) => [+d.position[0].toFixed(2), +d.position[2].toFixed(2)]),
        // Force a PERCH attempt NOW (QA: watch the low-side approach + bask).
        perchNow: () => {
          const spot = findPerchSpot(this.world, Math.random, { maxH: this.persona.climbCap * 0.95 });
          if (!spot) return null;
          const via = lowSideStaging(this.world, spot, GECKO_MOVEMENT.bodyRadius);
          const ok = this.brain.requestShelter(spot, via ?? undefined, 0.2);
          if (ok) {
            this.shelterRestT = 25;
            this.shelterKind = "perch";
            this.shelterAnchor = { x: spot.x, z: spot.z };
            this.baskLie = true;
          }
          return {
            spot: [+spot.x.toFixed(3), +spot.z.toFixed(3), +spot.h.toFixed(3)],
            via: via ? [+via.x.toFixed(3), +via.z.toFixed(3)] : null,
            accepted: ok,
          };
        },
        // Per-hide compiled volume geometry (QA for the wall-band tracer):
        // shape, point count + world bbox per volume — proves the walls ring
        // the visible mesh and the pocket/mouth stay open.
        hideVolumes: () =>
          this.state.layout.objects
            .filter((o) => o.interaction === "hide" || o.category === "hide")
            .map((o) => ({
              id: o.id,
              pos: [+o.position[0].toFixed(2), +o.position[2].toFixed(2)],
              scale: +o.scale[0].toFixed(2),
              vols: this.world.obstacles
                .filter((v) => v.id === o.id)
                .map((v) => {
                  const pts = "pts" in v && Array.isArray(v.pts) ? v.pts : null;
                  let bbox: number[] | null = null;
                  if (pts) {
                    let minX = Infinity;
                    let maxX = -Infinity;
                    let minZ = Infinity;
                    let maxZ = -Infinity;
                    for (const p of pts) {
                      if (p.x < minX) minX = p.x;
                      if (p.x > maxX) maxX = p.x;
                      if (p.z < minZ) minZ = p.z;
                      if (p.z > maxZ) maxZ = p.z;
                    }
                    bbox = [minX, maxX, minZ, maxZ].map((n) => +n.toFixed(2));
                  }
                  const c = "cx" in v && "cz" in v ? [+v.cx.toFixed(2), +v.cz.toFixed(2)] : null;
                  return { shape: v.shape, n: pts ? pts.length : 0, bbox, c };
                }),
            })),
        obj: (id: string) => {
          const o = findObject(this.state.layout, id);
          if (!o) return null;
          const d = (r: number) => Math.round(((r ?? 0) * 180) / Math.PI);
          return {
            rotDeg: d(o.rotation[1]),
            rx: d(o.rotation[0]),
            ry: d(o.rotation[1]),
            rz: d(o.rotation[2]),
            scale: o.scale[0],
            sx: o.scale[0],
            sy: o.scale[1],
            sz: o.scale[2],
            x: o.position[0],
            z: o.position[2],
          };
        },
      },
    });
  }

  private setDebug(on: boolean): void {
    this.debugOn = on;
    this.debug.setVisible(on);
    this.probeGroup.visible = on;
    this.brain.setDebug(on, (m) => console.info(`[gecko nav] ${m}`));
  }

  /** Eco-center VIEWING constraints: the terrarium is fixed in the room, so the
   *  normal camera only leans (~±43° yaw, a natural pitch band) and its pivot
   *  stays inside the tank. Photo Mode (renderer-side) unlocks the free orbit. */
  cameraLimits(): CameraLimits {
    const s = this.spec;
    return {
      minAzimuth: -0.75,
      maxAzimuth: 0.75,
      minPolar: 0.55,
      maxPolar: 1.5,
      minDistance: 1.5,
      maxDistance: 6.0,
      // The orbit pivot may roam most of the interior (from the spec — the same
      // box every other system uses), never outside the visible tank.
      target: {
        minX: s.interior.minX * 0.85,
        maxX: s.interior.maxX * 0.85,
        minY: 0.05,
        maxY: s.interior.topY * 0.85,
        minZ: s.interior.minZ * 0.9,
        maxZ: s.interior.maxZ * 0.9,
      },
    };
  }

  update(dt: number): void {
    // Clamp dt so a background tab that resumes doesn't fast-forward the sim.
    const step = Math.min(0.05, dt);
    this.state.elapsed += step;
    if (this.state.feedCooldown > 0) this.state.feedCooldown = Math.max(0, this.state.feedCooldown - step);

    const gecko = this.state.animals[0];
    const profile = careProfile(gecko.speciesId);
    if (profile) updateNeeds(this.state, gecko, { scores: this.scoresCached, profile }, step, this.needsCfg);

    // Insects are prey with real behaviour: they flee the gecko, get penned by
    // dishes, and are shouldered out of the gecko's body probes (no overlap).
    const gp = this.brain.position;
    updateFeeders(this.state, this.world, step, undefined, {
      gecko: { x: gp.x, z: gp.z },
      geckoCircles: this.geckoBodyCircles(),
    });

    // A FULL gecko doesn't hunt or eat — it sees no prey until hunger returns.
    // A HELD insect (in the player's tongs) is huntable while the tips are in
    // LEAPING range — hold them low for an easy strike, raise them (scroll) and
    // the gecko JUMPS for the take; tease them higher still and it can't reach.
    const targets: HuntTarget[] = wantsToEat(gecko)
      ? this.state.feeders
          .filter(
            (f) =>
              f.alive &&
              (!f.held || f.position[1] - this.world.groundHeightAt(f.position[0], f.position[2]) <= 0.24),
          )
          .map((f) => ({ id: f.id, x: f.position[0], z: f.position[2] }))
      : [];

    if (this.animal) {
      const ate = this.animal.update(step, targets);
      if (ate != null) {
        // Swallow: the chew is over — NOW the nutrition applies.
        consumeFeeder(this.state, ate, gecko);
        if (this.mouthFeederId === ate) this.mouthFeederId = null;
      }

      // BITE → CARRY → CHEW: the moment the strike lands (eat phase begins),
      // the prey is snatched INTO THE MOUTH — its visual rides the snout while
      // the chew plays, then vanishes at the swallow above. A raised tong
      // offer additionally earns a real leap at the snatch.
      const chewId = this.brain.eatingFeederId;
      if (chewId != null) {
        const f = this.state.feeders.find((ff) => ff.id === chewId && ff.alive);
        if (f) {
          if (this.mouthFeederId !== chewId) {
            // The bite itself: leap if the prey was dangled above the ground.
            const lift = f.position[1] - this.world.groundHeightAt(f.position[0], f.position[2]);
            if (f.held && lift > 0.09) this.animal.hopLunge(lift);
            this.mouthFeederId = chewId;
          }
          f.held = true; // in the mouth — no wandering, no dish-milling
          const yaw = this.brain.heading;
          const bp = this.brain.position;
          f.position[0] = bp.x + Math.sin(yaw) * 0.135;
          f.position[2] = bp.z + Math.cos(yaw) * 0.135;
          f.position[1] = this.world.bounds.y + this.brain.climbHeight + 0.05;
        }
      } else if (this.mouthFeederId != null) {
        this.mouthFeederId = null;
      }

      // Lie-down pose while resting: always inside a hide / napping; on a rock
      // PERCH only when this bask is a belly-down one (sometimes it stands
      // alert on the crest instead — both are true leopard-gecko basking).
      this.animal.setResting(this.brain.sheltering && (this.shelterKind !== "perch" || this.baskLie));

      // Deliberate HIDE ENTRY: the first time it reaches the mouth, pause a
      // beat (look into the dark), then walk in — no barging.
      if (this.shelterKind === "hide" && this.brain.shelterEnRoute && !this.hidePeeked) {
        const p2 = this.brain.position;
        if (Math.hypot(p2.x - this.shelterAnchor.x, p2.z - this.shelterAnchor.z) < 0.34) {
          this.brain.holdStill(0.5 + Math.random() * 0.5);
          this.hidePeeked = true;
        }
      }
    }

    this.tickCare(step, gecko, targets.length);

    this.feeders.sync(this.state.feeders, step);
    this.isopods?.update(step);
    this.droppings.sync(this.state.droppings);
    this.presentation.update(step);
    this.tickPuffs(step);
    // Manual water pour: held over the dish, the pitcher fills it for real.
    if (this.pouring && this.cleanScrub) {
      this.pourT += step;
      this.pourDripT += step;
      const dish = this.waterDish();
      if (dish && this.pourDripT >= 0.12) {
        this.pourDripT = 0;
        this.puffAt(dish.position[0], dish.position[2], 0x9fd8ff, 5, 0.03);
      }
      if (this.pourT >= 1.2 && dish) {
        this.pourT = 0;
        this.pouring = false;
        this.waterFreshT = 0;
        sfx.water();
        this.puffAt(dish.position[0], dish.position[2], 0x9fd8ff, 18, 0.09);
        logHabitatEvent(this.state, "Poured fresh water into the dish.", "good");
      }
    }
    this.waterFreshT += step;
    this.glassWipeT += step;
    // FRONT-GLASS SMUDGES: build slowly over time, plus nose/paw smears
    // wherever the gecko presses along the front pane.
    const sm = this.ensureGlassSmudge();
    this.smudgeAccumT += step;
    if (this.smudgeAccumT > 85) {
      this.smudgeAccumT = 0;
      sm.addSmudge(0.06 + Math.random() * 0.88, 0.08 + Math.random() * 0.72, Math.random() < 0.4 ? "streak" : "smear");
      this.glassWasClean = false;
    }
    const gpz = this.brain.position;
    if (gpz.z > this.bounds.maxZ - 0.15 && this.brain.isMoving) {
      this.geckoSmearT += step;
      if (this.geckoSmearT > 3.2) {
        this.geckoSmearT = 0;
        const pane = this.glassPane();
        sm.addSmudge((gpz.x - (pane.cx - pane.w / 2)) / pane.w, 0.12 + Math.random() * 0.1, "paws");
        this.glassWasClean = false;
      }
    } else {
      this.geckoSmearT = 0;
    }
    // Wipe-glass SHEEN: a soft highlight sweeping across the front pane.
    if (this.glassSheen && this.glassSheenT >= 0) {
      this.glassSheenT += step;
      const t = this.glassSheenT / 0.8;
      const b = this.bounds;
      this.glassSheen.position.x = b.minX + (b.maxX - b.minX) * Math.min(1, t);
      (this.glassSheen.material as THREE.MeshBasicMaterial).opacity = t < 1 ? 0.28 * Math.sin(Math.PI * Math.min(1, t)) : 0;
      if (t >= 1.15) {
        this.glassSheenT = -1;
        this.glassSheen.visible = false;
      }
    }
    if (this.cinematicOn) this.cineAngle += step * 0.1;
    this.tickHoverMarkers(step);

    // Keep the gecko's contact shadow ON the sculpted sand under it (only the
    // PROP-climb portion of the lift softens it — standing on a dune is still
    // ground contact).
    if (this.geckoShadow) {
      const p = this.brain.position;
      const sandY = this.world.groundHeightAt(p.x, p.z);
      const propLift = Math.max(0, this.bounds.y + this.brain.climbHeight - sandY);
      this.geckoShadow.followOn(p.x, p.z, sandY, propLift);
    }

    // Body-probe debug rings + foot markers + animal highlight follow the gecko.
    if (this.debugOn) this.updateProbeRings();
    if (this.footDebugOn || this.normalsDebugOn) this.updateFootDebug();
    if (this.animalRing?.visible) {
      const p = this.brain.position;
      this.animalRing.position.set(p.x, this.bounds.y + 0.025, p.z);
    }

    // Gentle pulse on the selection ring (Decorate mode) so it reads as "picked".
    if (this.selectionRing?.visible) {
      (this.selectionRing.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.22 * Math.sin(this.state.elapsed * 4.5);
    }

    // Autosave the gecko's pose + needs every 5 s.
    this.saveAccum += step;
    if (this.saveAccum >= 5) {
      const p = this.brain.position;
      gecko.position = [p.x, this.world.bounds.y, p.z];
      saveHabitat(this.state);
      this.saveAccum = 0;
    }
  }

  excite(): void {
    this.animal?.startle();
  }

  // ── Interactive care systems (dirt / shelter / terrain) ──────────────────────
  /** Per-frame care tick: dirt accumulates locally, cleanliness derives from the
   *  map, the shelter drive sends the gecko into hides, sparkles fade out. */
  private tickCare(step: number, gecko: (typeof this.state.animals)[0], liveTargets: number): void {
    // DIRT: builds around wherever the gecko lingers + food + dishes + hides.
    const p = this.brain.position;
    const hotspots = [{ x: p.x, z: p.z, w: this.brain.isMoving ? 0.35 : 1 }];
    for (const f of this.state.feeders) if (f.alive) hotspots.push({ x: f.position[0], z: f.position[2], w: 0.5 });
    // Droppings foul their spot fast until the keeper removes them.
    for (const d of this.state.droppings ?? []) hotspots.push({ x: d.position[0], z: d.position[2], w: 1.4 });
    for (const o of this.state.layout.objects) {
      if (o.category === "dish") hotspots.push({ x: o.position[0], z: o.position[2], w: 0.6 });
      else if (o.interaction === "hide") hotspots.push({ x: o.position[0], z: o.position[2], w: 0.35 });
    }
    accumulateDirt(this.dirt, this.state.layout.dimensions, step, hotspots);
    this.state.environment.cleanliness = cleanlinessPct(this.dirt);
    if (this.state.environment.cleanliness > 20) this.celebratedSpotless = isSpotless(this.dirt) && this.celebratedSpotless;

    // Ambient humidity follows the wet patches, scaled by the PAINTED floor's
    // coverage-weighted moisture retention (half clay ⇒ half clay's hold).
    const t = terrainStats(this.terrain);
    this.waterFracCached = t.waterFrac;
    this.reliefCached = t.relief;
    this.state.environment.humidity = Math.round(
      Math.min(80, this.substrateBlend.base + t.waterFrac * 95 * this.substrateBlend.hold),
    );

    // Overlay redraw ~2×/s (cheap canvas), not every frame. The analysis wash
    // refreshes on the same beat while a filter is up (wetness/decor drift).
    this.overlayDirtyT += step;
    if (this.overlayDirtyT >= 0.5) {
      this.overlayDirtyT = 0;
      this.overlay.redraw(this.dirt, this.terrain, { heights: this.terrainDebugOn });
      if (this.analysis.visible) this.repaintAnalysis();
    }

    // DIGESTION: meals fill the store; when the timer runs out a toilet trip
    // is due (handled in the decide block below).
    tickDigestion(gecko, step);

    // SHELTER DRIVE: a leopard gecko hides regularly — but not constantly. A
    // stressed gecko seeks cover; a calm one only occasionally, and never twice
    // in a row (a cooldown after leaving keeps it exploring the whole tank).
    if (this.brain.sheltering) {
      gecko.needs.stress = Math.max(0, gecko.needs.stress - 1.4 * step);
      this.shelterRestT -= step;
      if (this.shelterRestT <= 0) {
        // A TOILET trip ends with the deed: deposit a dropping behind the tail
        // (dark pellet + white urate cap), reset digestion, tell the keeper.
        if (this.shelterKind === "toilet") {
          const p2 = this.brain.position;
          const yaw = this.brain.heading;
          const dx = p2.x - Math.sin(yaw) * 0.16;
          const dz = p2.z - Math.cos(yaw) * 0.16;
          const b = this.world.bounds;
          const px = Math.min(b.maxX - 0.04, Math.max(b.minX + 0.04, dx));
          const pz = Math.min(b.maxZ - 0.04, Math.max(b.minZ + 0.04, dz));
          const r = addDropping(this.state.droppings ?? [], this.state.nextDroppingId ?? 1, [
            px,
            this.world.groundHeightAt(px, pz),
            pz,
          ]);
          this.state.droppings = r.list;
          this.state.nextDroppingId = r.nextId;
          didPoop(gecko);
          logHabitatEvent(this.state, `${gecko.name} did his business in his usual corner.`, "info");
          this.persist();
        }
        this.brain.endShelter();
        this.shelterCooldownT = this.shelterKind === "toilet" ? 8 : 35;
      }
    } else {
      if (this.shelterCooldownT > 0) this.shelterCooldownT -= step;
      this.shelterDecideT -= step;
      if (this.shelterDecideT <= 0 && !this.brain.shelterEnRoute) {
        this.shelterDecideT = 6;
        const phase = this.brain.navPhase;
        const calmPhase = phase === "idle" || phase === "look" || phase === "roam" || phase === "giveup";
        // BIOLOGY FIRST: a due toilet trip beats everything else — including
        // an ongoing hunt (only an active bite/panic/recovery finishes first).
        // The gecko owns ONE bathroom corner (picked on first need, persisted —
        // real leopard-gecko behaviour) and walks there to go.
        if (needsToilet(gecko) && phase !== "eat" && phase !== "flee" && phase !== "recover") {
          if (!gecko.toiletSpot) {
            const avoid = this.state.layout.objects
              .filter((o) => o.interaction === "hide" || o.category === "hide" || o.category === "dish")
              .map((o) => ({ x: o.position[0], z: o.position[2] }));
            gecko.toiletSpot = pickToiletCorner(this.world.bounds, avoid, Math.random);
            logHabitatEvent(this.state, `${gecko.name} chose a bathroom corner — geckos really do that!`, "info");
          }
          const spot = { x: gecko.toiletSpot[0], z: gecko.toiletSpot[1] };
          if (this.brain.requestShelter(spot, undefined, 0.18)) {
            this.shelterKind = "toilet";
            this.shelterAnchor = spot;
            this.shelterRestT = 2.4; // the squat
          }
        }
        // PERSONALITY drives the rhythm: shy hiders seek cover far more often,
        // baskers stay out longer once rested… (skipped when a toilet trip just
        // started — shelterEnRoute guards the whole chain below.)
        const wants =
          gecko.needs.stress > 45 || (this.shelterCooldownT <= 0 && Math.random() < 0.1 * this.persona.shelterMult);
        if (!this.brain.shelterEnRoute && calmPhase && wants && liveTargets === 0) {
          const anchor = this.nearestHideAnchor();
          if (anchor && this.brain.requestShelter(anchor)) {
            this.shelterKind = "hide";
            this.hidePeeked = false;
            this.shelterAnchor = { x: anchor.x, z: anchor.z };
            this.shelterRestT = (8 + Math.random() * 10) * this.persona.restMult;
          }
        } else if (
          calmPhase &&
          liveTargets === 0 &&
          this.shelterCooldownT <= 0 &&
          Math.random() < this.persona.perchChance
        ) {
          // PERCH: climb onto a rock (from its LOW side — real animals walk
          // around and take the short face) and bask there a while: sometimes
          // belly-down on the warm stone, sometimes standing lookout.
          const spot = findPerchSpot(this.world, Math.random, { maxH: this.persona.climbCap * 0.95 });
          if (spot) {
            const via = lowSideStaging(this.world, spot, GECKO_MOVEMENT.bodyRadius);
            if (this.brain.requestShelter(spot, via ?? undefined, 0.2)) {
              this.shelterKind = "perch";
              this.shelterAnchor = { x: spot.x, z: spot.z };
              this.baskLie = Math.random() < 0.55;
              this.shelterRestT = (10 + Math.random() * 14) * this.persona.restMult;
              logHabitatEvent(this.state, `${this.state.animals[0].name} climbed up to bask on the rocks.`, "info");
            }
          }
        } else if (
          calmPhase &&
          liveTargets === 0 &&
          this.shelterCooldownT <= 0 &&
          Math.random() < this.persona.napChance
        ) {
          // …and the sleepy characters take open-air NAPS right where they
          // stand: lie down (rest pose), doze, get up. Very leopard gecko.
          const p2 = this.brain.position;
          if (this.brain.requestShelter({ x: p2.x, z: p2.z })) {
            this.shelterKind = "nap";
            this.shelterRestT = (5 + Math.random() * 6) * this.persona.restMult;
          }
        }
      }
    }

    // Sparkle celebration fade.
    if (this.sparkle) {
      this.sparkle.update(step);
      if (this.sparkle.done) {
        this.scene.remove(this.sparkle.points);
        this.sparkle.dispose();
        this.sparkle = null;
      }
    }

    // Cleaning Mode rings track the dirt as it accumulates / gets scrubbed.
    if (this.dirtRingsOn) {
      this.dirtRingsT += step;
      if (this.dirtRingsT >= 1) {
        this.dirtRingsT = 0;
        this.refreshDirtRings();
      }
    }
  }

  /** The nearest enterable hide's interior anchor, or null. BODY-FIT: the pocket
   *  must fit the whole gecko (GECKO_HIDE_FIT), or it isn't offered at all — the
   *  gecko never tries to squeeze into a hide it would clip through. */
  private nearestHideAnchor(): { x: number; z: number } | null {
    const p = this.brain.position;
    const fit = Math.max(GECKO_MOVEMENT.bodyRadius, GECKO_HIDE_FIT);
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const o of this.state.layout.objects) {
      if (o.interaction !== "hide" && o.category !== "hide") continue;
      const a = hideAnchor(this.world, o, fit);
      if (!a) continue;
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  /** Hides whose pocket can't fit the gecko's whole body (editor awareness). */
  private tooSmallHides(): string[] {
    const fit = Math.max(GECKO_MOVEMENT.bodyRadius, GECKO_HIDE_FIT);
    const out: string[] = [];
    for (const o of this.state.layout.objects) {
      if (o.interaction !== "hide" && o.category !== "hide") continue;
      if (!hideAnchor(this.world, o, fit)) out.push(o.label ?? o.id);
    }
    return out;
  }

  /** Scrub with the Clean-Mode brush at world (x,z). Returns the dirt removed;
   *  a fully spotless tank earns a one-off sparkle celebration. */
  brushClean(x: number, z: number, radius: number): number {
    const spotsBefore = this.dirtSpotsList().length;
    const removed = cleanAt(this.dirt, this.state.layout.dimensions, x, z, radius, 0.22);
    // The brush (and Remove Waste, which drives it) also picks up DROPPINGS.
    const before = this.state.droppings?.length ?? 0;
    this.state.droppings = cleanDroppingsAt(this.state.droppings ?? [], x, z, Math.max(radius, 0.12));
    if (this.state.droppings.length < before) {
      this.droppings.sync(this.state.droppings);
      for (let i = 0; i < before - this.state.droppings.length; i++) sfx.pop();
      this.puffAt(x, z, 0xbfa06a, 12, 0.08);
      logHabitatEvent(this.state, "Scooped up the droppings.", "good");
    }
    // A dirty SPOT came fully clean under the brush — sparkle + chime.
    if (this.dirtSpotsList().length < spotsBefore) {
      sfx.sparkle();
      this.puffAt(x, z, 0xffe9a8, 16, 0.1);
    }
    this.state.environment.cleanliness = cleanlinessPct(this.dirt);
    this.overlay.redraw(this.dirt, this.terrain, { heights: this.terrainDebugOn });
    if (this.dirtRingsOn) this.refreshDirtRings(); // a scrubbed ring disappears right away
    if (isSpotless(this.dirt) && !this.celebratedSpotless) {
      this.celebratedSpotless = true;
      logHabitatEvent(this.state, "Sparkling clean — the whole terrarium is spotless! ✨", "good");
      // Never orphan an airborne burst — replacing it without removal left
      // frozen stars hanging in the sky until a refresh.
      if (this.sparkle) {
        this.scene.remove(this.sparkle.points);
        this.sparkle.dispose();
      }
      this.sparkle = new SparkleBurst(this.bounds);
      this.scene.add(this.sparkle.points);
    } else if (removed > 0.01) {
      this.celebratedSpotless = false;
    }
    return removed;
  }

  cleanliness(): number {
    return Math.round(this.state.environment.cleanliness);
  }

  /** Current dirty spots (Cleaning Mode rings + the "N spots detected" badge). */
  dirtSpotsList(max = 6): DirtSpot[] {
    return dirtSpots(this.dirt, this.state.layout.dimensions, max);
  }

  /** Show/refresh the amber rings marking the dirty spots (Cleaning Mode). */
  setCleanHighlights(on: boolean): void {
    this.dirtRingsOn = on;
    if (on) {
      if (!this.dirtRings.parent) this.scene.add(this.dirtRings);
      this.refreshDirtRings();
    } else {
      this.clearDirtRings();
    }
  }

  private clearDirtRings(): void {
    for (const c of [...this.dirtRings.children]) {
      this.dirtRings.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose();
    }
  }

  private refreshDirtRings(): void {
    this.clearDirtRings();
    for (const s of this.dirtSpotsList()) {
      const r = 0.09 + s.amount * 0.08;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.022, 36),
        new THREE.MeshBasicMaterial({ color: 0xffc153, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthTest: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(s.x, this.world.groundHeightAt(s.x, s.z) + 0.012, s.z);
      ring.renderOrder = 1002;
      this.dirtRings.add(ring);
    }
  }

  /** The food dish (preferred) or feeding-zone anchor for "Place in Dish". */
  feederAnchor(): { x: number; z: number } | null {
    const dish = findFoodDish(this.state.layout);
    if (dish) return { x: dish.position[0], z: dish.position[2] };
    const zone = this.state.layout.zones.find((z) => z.kind === "feeding");
    if (zone) return { x: zone.center[0], z: zone.center[2] };
    return null;
  }

  // ── Feeding presentations + real-nutrition serving ───────────────────────────

  /** The gecko's floor pose in "math heading" convention (x = cos, z = sin). */
  private presentGecko(): { x: number; z: number; heading: number } {
    const p = this.brain.position;
    const yaw = this.brain.heading; // brain forward = (sin(yaw), cos(yaw))
    return { x: p.x, z: p.z, heading: Math.atan2(Math.cos(yaw), Math.sin(yaw)) };
  }

  /** World-space body circles (snout → tail) — insects get pushed out of these. */
  private geckoBodyCircles(): { x: number; z: number; r: number }[] {
    const p = this.brain.position;
    const yaw = this.brain.heading;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    return this.brain.bodyProbes.map((pr) => ({
      x: p.x + fx * pr.forward + rx * pr.side,
      z: p.z + fz * pr.forward + rz * pr.side,
      r: pr.r * 0.9,
    }));
  }

  /** Serve a portion with the full staged presentation for its method. Returns
   *  how many insects the serving will deliver + an honest refusal reason. */
  serveMealNow(
    kindS: string,
    count: number,
    methodS: string,
    supplementS: string,
    at?: { x: number; z: number },
  ): { placed: number; reason: string | null } {
    const kind = (kindS in FOOD_TYPES ? kindS : "cricket") as FeederKind;
    const method = (["quick", "hand", "tong", "dish"].includes(methodS) ? methodS : "quick") as FeedMethodKind;
    const supplement = (["none", "calcium", "calcium_d3"].includes(supplementS) ? supplementS : "none") as SupplementKind;
    if (this.presentation.active()) return { placed: 0, reason: "A feeding is already underway — let it finish" };

    const requested = count;
    let servePoint: { x: number; z: number };
    let dish: PlacedObject | null = null;
    let reason: string | null = null;

    if (method === "dish") {
      dish = findFoodDish(this.state.layout);
      if (!dish) return { placed: 0, reason: "No food dish placed — add one in Decorate, or pick another method" };
      const din = dishInterior(dish);
      servePoint = { x: din.x, z: din.z };
      const cap = dishCapacity(din.r);
      const already = this.state.feeders.filter((f) => f.alive && f.containedBy === dish!.id).length;
      count = Math.min(count, Math.max(0, cap - already));
      if (count <= 0) return { placed: 0, reason: `The dish is already full (holds ${cap})` };
      if (count < requested) reason = `The dish holds ${cap} — serving ${count}`;
    } else {
      const loose = this.state.feeders.filter((f) => f.alive && !f.containedBy).length;
      count = Math.min(count, Math.max(0, MAX_LIVE_FEEDERS - loose));
      if (count <= 0) return { placed: 0, reason: "Too many insects loose already — let the gecko catch up" };
      if (count < requested) reason = `Only room for ${count} more loose insects`;
      if (method === "tong" || method === "hand") {
        // Offer sessions match the gecko's real appetite — you can't dangle ten
        // crickets at a gecko that fits two more.
        const hunger = this.state.animals[0].needs.hunger;
        const appetite = Math.max(1, Math.ceil((92 - hunger) / FOOD_TYPES[kind].satiety));
        if (count > appetite) {
          count = appetite;
          reason = `The gecko only has appetite for ~${appetite}`;
        }
        const g = this.presentGecko();
        const want = ThreeFeedingPresentation.offerPoint(g, method === "tong" ? 0.24 : 0.32);
        want.x = Math.max(this.bounds.minX + 0.1, Math.min(this.bounds.maxX - 0.1, want.x));
        want.z = Math.max(this.bounds.minZ + 0.1, Math.min(this.bounds.maxZ - 0.1, want.z));
        // The props are physical: the hand needs real clearance, the tongs a
        // little — never presented inside a rock.
        servePoint =
          this.freeSpotNear(want.x, want.z, method === "hand" ? 0.1 : 0.05) ??
          this.freeSpotNear(g.x, g.z, method === "hand" ? 0.1 : 0.05) ??
          this.feederAnchor() ?? { x: 0, z: 0.3 };
        this.lastOffer = { ...servePoint };
      } else {
        servePoint = at ?? this.feederAnchor() ?? { x: 0, z: 0.3 };
      }
    }

    // ONE log entry + event for the session; the presentation spawns the real
    // insects quietly as it delivers them.
    logFeeding(this.state, kind, count, method, supplement);
    const label = FOOD_TYPES[kind].label.toLowerCase();
    const phrase =
      method === "dish"
        ? "poured into the dish"
        : method === "tong"
          ? "offered with the tongs"
          : method === "hand"
            ? "offered by hand"
            : "scattered on the sand";
    logHabitatEvent(this.state, `${count} ${label}${count > 1 ? "s" : ""} ${phrase}.`, "info");
    this.state.feedCooldown = 6;

    this.presentation.start(method, kind, count, servePoint, this.presentationHooks(kind, supplement, dish));
    return { placed: count, reason };
  }

  private presentationHooks(kind: FeederKind, supplement: SupplementKind, dish: PlacedObject | null): PresentationHooks {
    return {
      serveOne: (x, z) =>
        serveMeal(this.state, this.world, kind, 1, dish ? "dish" : "quick", supplement, {
          at: { x, z },
          dish: dish ?? undefined,
          log: false,
          quiet: true,
          reach: (fx, fz) => this.brain.canReach(fx, fz),
        }).placed > 0,
      serveHeld: (x, z) => {
        const id = this.state.nextFeederId;
        const res = serveMeal(this.state, this.world, kind, 1, "hand", supplement, {
          at: { x, z },
          exact: true,
          held: true,
          log: false,
          quiet: true,
        });
        return res.placed > 0 ? id : null;
      },
      releaseHeld: (id) => {
        const f = this.state.feeders.find((ff) => ff.id === id);
        if (f) {
          f.held = undefined;
          f.mood = "flee";
          f.moodT = 1.2;
          f.position[1] = this.world.groundHeightAt(f.position[0], f.position[2]);
        }
      },
      // "Taken" the moment it's bitten into the mouth — the tongs recoil at the
      // BITE, not at the swallow.
      feederAlive: (id) => this.mouthFeederId !== id && this.state.feeders.some((f) => f.id === id && f.alive),
      moveHeld: (id, x, y, z) => {
        const f = this.state.feeders.find((ff) => ff.id === id && ff.held);
        if (!f) return;
        const cl = clampXZ(this.bounds, x, z, 0.05);
        const res = this.world.resolve(f.position[0], f.position[2], cl.x, cl.z, 0.025);
        f.position[0] = res.x;
        f.position[1] = Math.max(this.world.groundHeightAt(res.x, res.z) + 0.01, y);
        f.position[2] = res.z;
      },
      freeSpotNear: (x, z) => this.freeSpotNear(x, z, 0.04, true),
      geckoWants: () => wantsToEat(this.state.animals[0]),
      gecko: () => this.presentGecko(),
      // Climb-aware: over a low rock this is its top — props and food never
      // sink through what's beneath them.
      groundY: (x, z) => this.world.climbHeightAt(x, z, 0.02),
      // Dishes are HARD (no-step), so climbHeightAt can't see them — pour
      // landings read the dish's measured bowl floor instead.
      dishFloorY: (x, z) => (dish ? this.world.propSurfaceYAt(x, z, dish.id) : this.world.climbHeightAt(x, z, 0.02)),
      onDone: () => this.persist(),
    };
  }

  presentationActive(): boolean {
    return this.presentation.active();
  }

  /** Last valid steer point (the tongs slide along solids instead of entering). */
  private lastOffer = { x: 0, z: 0.3 };

  /** The player steers the tongs — the offer follows the pointer, but the tips
   *  RESOLVE against decor + walls like anything else physical: they slide
   *  along a rock's edge rather than passing through it. */
  moveOffer(x: number, z: number): void {
    const cl = clampXZ(this.bounds, x, z, 0.06);
    const res = this.world.resolve(this.lastOffer.x, this.lastOffer.z, cl.x, cl.z, 0.04);
    this.lastOffer = { x: res.x, z: res.z };
    this.presentation.setHoldPoint(res.x, res.z);
  }

  /** Scroll while holding the tongs: raise/lower the offer (jump training). */
  adjustOffer(delta: number): void {
    this.presentation.adjustHold(delta);
  }

  /** A clear spot with `clear` radius near (x,z): the point itself, else a ring
   *  of candidates, else null. Keeps hands/tongs/tossed food out of the decor. */
  private freeSpotNear(x: number, z: number, clear: number, reach = false): { x: number; z: number } | null {
    const ok = (px: number, pz: number): boolean =>
      containsXZ(this.bounds, px, pz, clear) &&
      this.world.isFree(px, pz, clear) &&
      (!reach || this.brain.canReach(px, pz));
    if (ok(x, z)) return { x, z };
    for (let ring = 0; ring < 3; ring++) {
      const rr = 0.08 + ring * 0.09;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + ring * 0.35;
        const px = x + Math.cos(a) * rr;
        const pz = z + Math.sin(a) * rr;
        if (ok(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  }

  /** Cinematic mode: the UI letterboxes; this drives the follow camera. The
   *  opening shot always starts from an angle with a CLEAR view of the animal
   *  (never inside a prop, never with a rock face between lens and gecko). */
  setCinematic(on: boolean): void {
    this.cinematicOn = on;
    if (!on) return;
    const p = this.brain.position;
    const fy = this.world.groundHeightAt(p.x, p.z) + 0.05;
    for (let k = 0; k < 24; k++) {
      const a = this.cineAngle + k * ((Math.PI * 2) / 24);
      const px = p.x + Math.cos(a) * 0.62;
      const pz = p.z + Math.sin(a) * 0.62;
      if (this.world.isBlocked(px, pz, 0.09)) continue;
      if (!this.viewClear(px, fy + 0.26, pz, p.x, fy, p.z)) continue;
      this.cineAngle = a;
      break;
    }
  }

  /** Is the line from the camera to the subject clear of hard props? Samples
   *  the ray and compares each point's HARD roofline against the line height. */
  private viewClear(cx: number, cy: number, cz: number, lx: number, ly: number, lz: number): boolean {
    for (let t = 0.18; t <= 0.86; t += 0.17) {
      const x = cx + (lx - cx) * t;
      const z = cz + (lz - cz) * t;
      const lineY = cy + (ly - cy) * t;
      if (this.world.hardTopAt(x, z) > lineY + 0.015) return false;
    }
    return true;
  }

  /** The camera pose the renderer should ease toward this frame (cinematic
   *  follow-orbit, or a feeding presentation's staged angle), or null. */
  cameraOverride(): { pos: [number, number, number]; look: [number, number, number] } | null {
    if (this.cinematicOn) return this.cinematicPose();
    return this.presentation.cameraPose();
  }

  /** Slow, close follow-orbit of the gecko that FRAMES THE ACTION: while a
   *  feeding presentation runs it splits the frame between gecko and the FOOD
   *  (tong tips / hand / dish / toss point); during a loose-prey hunt it frames
   *  gecko + nearest insect; otherwise it follows the gecko alone. */
  private cinematicPose(): { pos: [number, number, number]; look: [number, number, number] } {
    const p = this.brain.position;
    // PLAYER-HELD TONGS get their own cinematic grammar: a WIDE, steady shot
    // from the tank front (no orbit drift) framing gecko + tongs together —
    // distances on the sand stay readable, so steering is easy.
    const tip = this.presentation.tongTip();
    if (tip) {
      const fx2 = (p.x + tip.x) / 2;
      const fz2 = (p.z + tip.z) / 2;
      const fy2 = this.world.groundHeightAt(fx2, fz2);
      return {
        pos: [fx2 * 0.6, fy2 + 0.66, this.bounds.maxZ + 1.1],
        look: [fx2, fy2 + 0.04, fz2],
      };
    }
    let fx = p.x;
    let fz = p.z;
    let radius = 0.62;
    const stage = this.presentation.focusPoint();
    if (stage) {
      // The food is the star: bias the frame toward it.
      fx = p.x * 0.45 + stage.x * 0.55;
      fz = p.z * 0.45 + stage.z * 0.55;
      radius = 0.5;
    } else {
      const prey = nearestFeeder(this.state, p.x, p.z);
      if (prey && Math.hypot(prey.position[0] - p.x, prey.position[2] - p.z) < 0.7) {
        fx = (p.x + prey.position[0]) / 2;
        fz = (p.z + prey.position[2]) / 2;
        radius = 0.48;
      }
    }
    const fy = this.world.groundHeightAt(fx, fz) + this.brain.climbHeight * 0.6;
    // Keep the shot CLEAR two ways: the lens never sits inside a prop, and a
    // blocked VIEW (subject walked behind the cave) makes the orbit swing
    // around smoothly until the animal is visible again.
    let px = fx + Math.cos(this.cineAngle) * radius;
    let pz = fz + Math.sin(this.cineAngle) * radius;
    const camY = fy + 0.26;
    if (this.world.isBlocked(px, pz, 0.09) || !this.viewClear(px, camY, pz, fx, fy + 0.05, fz)) {
      this.cineAngle += 0.55 * (1 / 60); // pan on (per-frame nudge; update adds the base drift)
      for (let k = 1; k < 16; k++) {
        const a = this.cineAngle + k * (Math.PI / 8);
        const qx = fx + Math.cos(a) * radius;
        const qz = fz + Math.sin(a) * radius;
        if (!this.world.isBlocked(qx, qz, 0.09) && this.viewClear(qx, camY, qz, fx, fy + 0.05, fz)) {
          // Ease toward the nearest clear angle rather than teleporting.
          this.cineAngle += Math.min(0.03, k * 0.004);
          break;
        }
      }
      px = fx + Math.cos(this.cineAngle) * radius;
      pz = fz + Math.sin(this.cineAngle) * radius;
    }
    return { pos: [px, camY, pz], look: [fx, fy + 0.05, fz] };
  }

  // ── Feed-mode hover marker + gecko hover ring ────────────────────────────────

  private buildHoverMarkers(): void {
    // Dashed teal placement ellipse (the reference's marker).
    const pts = new THREE.EllipseCurve(0, 0, 0.15, 0.15, 0, Math.PI * 2, false, 0).getPoints(72);
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, 0, p.y)));
    const mat = new THREE.LineDashedMaterial({
      color: 0x7fe3df,
      dashSize: 0.045,
      gapSize: 0.032,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    this.hoverMarker = new THREE.Line(geo, mat);
    this.hoverMarker.computeLineDistances();
    this.hoverMarker.renderOrder = 1004;
    this.hoverMarker.visible = false;
    this.scene.add(this.hoverMarker);

    // Soft ring under the gecko when the pointer rests on it.
    this.hoverGeckoRing = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.165, 40),
      new THREE.MeshBasicMaterial({ color: 0x8ce25a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthTest: false }),
    );
    this.hoverGeckoRing.rotation.x = -Math.PI / 2;
    this.hoverGeckoRing.renderOrder = 1003;
    this.hoverGeckoRing.visible = false;
    this.scene.add(this.hoverGeckoRing);

    this.buildCleanTools();
  }

  /** The three professional cleaning tools — one per Cleaning Mode option:
   *  a steel sand SCOOP (Spot Clean), a wooden hand BRUSH (Brush Sand) and a
   *  SQUEEGEE for the front glass (Wipe Glass). Each rides the pointer in its
   *  own space (sand plane / glass plane); the OS cursor stays hidden. */
  private buildCleanTools(): void {
    const steel = new THREE.MeshStandardMaterial({ color: 0xbfc8cc, roughness: 0.3, metalness: 0.75 });
    const reachRing = (color: number): THREE.Mesh => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1, 1.07, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthTest: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.name = "reach";
      ring.renderOrder = 1003;
      return ring;
    };

    // SAND SCOOP — teal soft-grip handle, steel neck, slotted pan.
    const scoop = new THREE.Group();
    {
      const grip = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.012, 0.07, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0x2e6b5e, roughness: 0.55 }),
      );
      grip.position.set(0, 0.105, -0.055);
      grip.rotation.x = 0.85;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.055, 8), steel);
      neck.position.set(0, 0.056, -0.02);
      neck.rotation.x = 0.85;
      const pan = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.008, 0.062), steel);
      pan.position.set(0, 0.016, 0.018);
      pan.rotation.x = -0.14;
      const lipL = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.062), steel);
      lipL.position.set(-0.037, 0.026, 0.018);
      lipL.rotation.x = -0.14;
      const lipR = lipL.clone();
      lipR.position.x = 0.037;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.02, 0.006), steel);
      back.position.set(0, 0.026, -0.011);
      back.rotation.x = -0.14;
      scoop.add(grip, neck, pan, lipL, lipR, back, reachRing(0x8ee65a));
    }
    scoop.visible = false;
    this.scene.add(scoop);

    // HAND BRUSH — walnut handle, brass ferrule, straw bristles.
    const brush = new THREE.Group();
    {
      const handle = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.011, 0.08, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0x7a4c2a, roughness: 0.5 }),
      );
      handle.position.set(0, 0.1, -0.05);
      handle.rotation.x = 0.95;
      const ferrule = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.019, 0.024, 10),
        new THREE.MeshStandardMaterial({ color: 0xc9a23f, roughness: 0.35, metalness: 0.6 }),
      );
      ferrule.position.set(0, 0.05, -0.014);
      ferrule.rotation.x = 0.95;
      const bristles = new THREE.Mesh(
        new THREE.BoxGeometry(0.052, 0.038, 0.03),
        new THREE.MeshStandardMaterial({ color: 0xdbb56d, roughness: 0.95 }),
      );
      bristles.position.set(0, 0.02, 0.004);
      bristles.rotation.x = 0.28;
      const tips = new THREE.Mesh(
        new THREE.BoxGeometry(0.056, 0.01, 0.034),
        new THREE.MeshStandardMaterial({ color: 0xc8a35d, roughness: 1 }),
      );
      tips.position.set(0, 0.004, 0.008);
      tips.rotation.x = 0.28;
      brush.add(handle, ferrule, bristles, tips, reachRing(0xf0b94b));
    }
    brush.visible = false;
    this.scene.add(brush);

    // WATER PITCHER — enamel body, angled spout, loop handle. Held over the
    // dish it POURS (the manual Replace-Water gesture).
    const pitcher = new THREE.Group();
    {
      const enamel = new THREE.MeshStandardMaterial({ color: 0x6fa3b7, roughness: 0.45, metalness: 0.15 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.052, 14), enamel);
      body.position.set(0, 0.055, 0);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.034, 8), enamel);
      spout.position.set(0, 0.075, 0.026);
      spout.rotation.x = 1.05;
      spout.name = "spout";
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0035, 8, 14, Math.PI * 1.2), enamel);
      handle.position.set(0, 0.06, -0.024);
      handle.rotation.y = Math.PI / 2;
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.004, 14), steel);
      lid.position.set(0, 0.083, 0);
      pitcher.add(body, spout, handle, lid, reachRing(0x57b8ff));
    }
    pitcher.visible = false;
    this.scene.add(pitcher);

    // SQUEEGEE — dark grip toward the viewer, steel T-bar, rubber blade flat
    // against the glass.
    const squeegee = new THREE.Group();
    {
      const grip = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.012, 0.06, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.55 }),
      );
      grip.position.set(0, -0.01, 0.055);
      grip.rotation.x = Math.PI / 2 - 0.35;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.016, 0.014), steel);
      bar.position.set(0, 0.012, 0.012);
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.115, 0.007, 0.006),
        new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.85 }),
      );
      blade.name = "blade";
      blade.position.set(0, 0.001, 0.004);
      squeegee.add(grip, bar, blade);
    }
    squeegee.visible = false;
    this.scene.add(squeegee);

    this.cleanTools = { spot: scoop, sweep: brush, wipe: squeegee, water: pitcher };
    this.cleanTool = scoop; // active tool (cleanHover swaps it)
  }

  /** Drive the SAND cleaning tool from the pointer (cursor hidden over the
   *  sand). `tool` picks the scoop (spot) or the hand brush (sweep);
   *  `scrubbing` = pointer held down — the tool works, jitters and puffs. */
  cleanHover(ground: { x: number; z: number } | null, scrubbing: boolean, radius: number, tool: string): void {
    const want =
      tool === "sweep" ? this.cleanTools.sweep : tool === "water" ? this.cleanTools.water : this.cleanTools.spot;
    if (this.cleanTool !== want) {
      this.cleanTool.visible = false;
      this.cleanTool = want;
    }
    this.cleanTools.wipe.visible = false;
    if (!ground) {
      this.cleanTool.visible = false;
      return;
    }
    this.cleanScrub = scrubbing;
    const y = this.world.climbHeightAt(ground.x, ground.z, 0.01);
    // The GRIP ANCHOR: the tool's contact point locks to the pointer; all
    // work animation renders as absolute offsets from here (never +=), so a
    // held-still hand can never drift the tool out of position.
    this.cleanTool.userData.anchor = new THREE.Vector3(ground.x, y + 0.004, ground.z);
    this.cleanTool.position.copy(this.cleanTool.userData.anchor as THREE.Vector3);
    const ring = this.cleanTool.getObjectByName("reach");
    if (ring) ring.scale.setScalar(Math.max(0.06, radius));
    this.cleanTool.visible = true;
  }

  /** Drive the SQUEEGEE on the FRONT GLASS (Wipe Glass tool). `pt` = world
   *  x/y on the pane, null when the pointer is off the pane. */
  wipeHover(pt: { x: number; y: number } | null, wiping: boolean): void {
    const sq = this.cleanTools.wipe;
    this.cleanTools.spot.visible = false;
    this.cleanTools.sweep.visible = false;
    this.cleanTool = sq;
    if (!pt) {
      sq.visible = false;
      return;
    }
    this.cleanScrub = wiping;
    sq.userData.anchor = new THREE.Vector3(pt.x, pt.y, this.glassPane().z + 0.006);
    sq.position.copy(sq.userData.anchor as THREE.Vector3);
    sq.visible = true;
  }

  clearCleanHover(): void {
    this.cleanTools.spot.visible = false;
    this.cleanTools.sweep.visible = false;
    this.cleanTools.wipe.visible = false;
    this.cleanTools.water.visible = false;
    this.cleanScrub = false;
    this.pouring = false;
    this.pourT = 0;
  }

  /** The pointer button state (a released hand stops the work animation even
   *  when the pointer hasn't moved since). */
  setCleanScrubbing(on: boolean): void {
    this.cleanScrub = on;
    if (!on) {
      this.pouring = false;
      this.pourT = 0;
    }
  }

  /** The manual REPLACE-WATER gesture: hold the pitcher over the dish and it
   *  pours — progress advances in the sim tick; drifting away stops it. */
  pourAt(ground: { x: number; z: number } | null): "pouring" | "offDish" | "noDish" {
    const dish = this.waterDish();
    if (!dish || !ground) {
      this.pouring = false;
      return dish ? "offDish" : "noDish";
    }
    const r = Math.max(0.14, (dish.size ?? 0.2) * 0.75);
    const over = Math.hypot(ground.x - dish.position[0], ground.z - dish.position[2]) <= r;
    this.pouring = over;
    if (!over) this.pourT = Math.max(0, this.pourT - 0.2);
    return over ? "pouring" : "offDish";
  }

  /** A tiny particle puff (scrub dust, scoop poof, dish sparkle, glass wipe).
   *  `yAt` overrides the height (glass wipes float at pane height). */
  private puffAt(x: number, z: number, color: number, count = 14, spread = 0.05, yAt?: number): void {
    const y = yAt ?? this.world.climbHeightAt(x, z, 0.01) + 0.015;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = x + (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = y + Math.random() * 0.015;
      pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      vel[i * 3] = (Math.random() - 0.5) * 0.14;
      vel[i * 3 + 1] = 0.12 + Math.random() * 0.18;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.14;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.016,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = 1005;
    this.scene.add(pts);
    this.puffs.push({ pts, vel, life: 0, max: 0.55 + Math.random() * 0.2 });
  }

  private tickPuffs(step: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life += step;
      const pos = p.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        pos.setX(k, pos.getX(k) + p.vel[k * 3] * step);
        pos.setY(k, pos.getY(k) + p.vel[k * 3 + 1] * step);
        pos.setZ(k, pos.getZ(k) + p.vel[k * 3 + 2] * step);
        p.vel[k * 3 + 1] -= 0.35 * step; // gravity arc
      }
      pos.needsUpdate = true;
      const mat = p.pts.material as THREE.PointsMaterial;
      mat.opacity = Math.max(0, 0.85 * (1 - p.life / p.max));
      if (p.life >= p.max) {
        this.scene.remove(p.pts);
        p.pts.geometry.dispose();
        mat.dispose();
        this.puffs.splice(i, 1);
      }
    }
  }

  /** Drive the feed-mode marker from the pointer. Returns what the pointer is
   *  over so the app can style the cursor (gecko → pointer, sand → marker). */
  feedHover(ground: { x: number; z: number } | null, methodS: string): { overGecko: boolean; valid: boolean; reason: string | null } {
    const method = methodS as FeedMethodKind;
    const p = this.brain.position;
    const overGecko = !!ground && Math.hypot(ground.x - p.x, ground.z - p.z) < 0.2;
    this.setGeckoHover(overGecko);

    if (!ground || overGecko) {
      this.hoverMarker.visible = false;
      return { overGecko, valid: false, reason: null };
    }

    let markAt = ground;
    let radius = 0.15;
    let valid = true;
    let reason: string | null = null;

    if (method === "dish") {
      // The serving always lands in the dish — the marker rides the dish itself.
      const dish = findFoodDish(this.state.layout);
      if (dish) {
        const din = dishInterior(dish);
        markAt = { x: din.x, z: din.z };
        radius = din.r + 0.03;
      } else {
        valid = false;
        reason = "No food dish placed";
      }
    } else if (method === "tong" || method === "hand") {
      // Offered right to the gecko — the marker previews the offer point.
      markAt = ThreeFeedingPresentation.offerPoint(this.presentGecko(), method === "tong" ? 0.24 : 0.3);
      radius = 0.12;
    } else {
      if (!containsXZ(this.bounds, ground.x, ground.z, 0.04)) {
        valid = false;
        reason = "Outside the enclosure";
      } else if (this.world.isBlocked(ground.x, ground.z, 0.04)) {
        valid = false;
        reason = "Inside a solid object";
      } else if (this.world.tooSteepAt(ground.x, ground.z)) {
        valid = false;
        reason = "That slope is too steep";
      } else if (!this.brain.canReach(ground.x, ground.z)) {
        valid = false;
        reason = "The gecko can't reach that spot";
      }
    }

    const mat = this.hoverMarker.material as THREE.LineDashedMaterial;
    mat.color.setHex(valid ? 0x7fe3df : 0xff8a75);
    this.hoverMarker.userData.r = radius;
    // climbHeightAt = sand on open ground, the RIM height over the dish.
    this.hoverMarker.position.set(markAt.x, this.world.climbHeightAt(markAt.x, markAt.z, 0.01) + 0.014, markAt.z);
    this.hoverMarker.visible = true;
    return { overGecko, valid, reason };
  }

  /** Hide the feed marker (leaving feed mode / pointer left the canvas). */
  clearFeedHover(): void {
    this.hoverMarker.visible = false;
    this.setGeckoHover(false);
  }

  setGeckoHover(on: boolean): void {
    this.hoverGeckoRing.visible = on;
  }

  private tickHoverMarkers(step: number): void {
    this.hoverT += step;
    // While the player holds the tongs, the marker becomes their ground-contact
    // ring — it rides under the tips so depth on the sand is easy to read.
    const tip = this.presentation.tongTip();
    if (tip) {
      this.hoverMarker.userData.r = 0.075;
      (this.hoverMarker.material as THREE.LineDashedMaterial).color.setHex(0x7fe3df);
      this.hoverMarker.position.set(tip.x, this.world.climbHeightAt(tip.x, tip.z, 0.01) + 0.012, tip.z);
      this.hoverMarker.visible = true;
    }
    if (this.hoverMarker.visible) {
      const pulse = 1 + Math.sin(this.hoverT * 3.2) * 0.045;
      const s = (((this.hoverMarker.userData.r as number) ?? 0.15) / 0.15) * pulse;
      this.hoverMarker.scale.set(s, 1, s);
      this.hoverMarker.rotation.y += step * 0.25;
    }
    if (this.hoverGeckoRing.visible) {
      const p = this.brain.position;
      this.hoverGeckoRing.position.set(p.x, this.world.groundHeightAt(p.x, p.z) + 0.02, p.z);
      (this.hoverGeckoRing.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.18 * Math.sin(this.hoverT * 4);
    }
    // The cleaning tools: PERFECTLY STILL in the hand until the player holds
    // the button; while WORKING each animates in its own way as ABSOLUTE
    // offsets from the grip anchor — the tool can never drift off the pointer.
    if (this.cleanTool.visible) {
      const t = this.cleanTool;
      const anchor = t.userData.anchor as THREE.Vector3 | undefined;
      const isWipe = t === this.cleanTools.wipe;
      const isScoop = t === this.cleanTools.spot;
      const isPitcher = t === this.cleanTools.water;
      if (anchor) t.position.copy(anchor);
      if (this.cleanScrub && anchor) {
        if (isPitcher) {
          // Pitcher: tips forward while genuinely pouring, hovers upright off
          // the dish; a slight lift keeps the spout over the water line.
          const tip = this.pouring ? -0.85 : -0.1;
          t.rotation.x += (tip - t.rotation.x) * Math.min(1, step * 10);
          t.position.y = anchor.y + 0.05;
        } else if (isWipe) {
          // Squeegee: a firm drag — slight lean + blade squash against the pane.
          t.rotation.z = Math.sin(this.hoverT * 9) * 0.08;
          const blade = t.getObjectByName("blade");
          if (blade) blade.scale.y = 0.85 + Math.abs(Math.sin(this.hoverT * 12)) * 0.3;
        } else if (isScoop) {
          // Scoop: dip-and-lift digging strokes around the anchor.
          t.rotation.x = -0.16 + Math.sin(this.hoverT * 9) * 0.14;
          t.position.y = anchor.y + Math.max(0, Math.sin(this.hoverT * 9)) * 0.004;
          this.scrubPuffT += step;
          if (this.scrubPuffT > 0.2) {
            this.scrubPuffT = 0;
            this.puffAt(anchor.x, anchor.z, 0xd9c08a, 8, 0.06);
          }
        } else {
          // Brush: quick sweeping tilts + side strokes around the anchor.
          t.rotation.z = Math.sin(this.hoverT * 26) * 0.16;
          t.rotation.x = 0.1 + Math.sin(this.hoverT * 21) * 0.08;
          t.position.x = anchor.x + Math.sin(this.hoverT * 30) * 0.0035;
          this.scrubPuffT += step;
          if (this.scrubPuffT > 0.16) {
            this.scrubPuffT = 0;
            this.puffAt(anchor.x, anchor.z, 0xd9c08a, 8, 0.06);
          }
        }
      } else {
        // At rest: dead still, squared up, exactly at the pointer.
        t.rotation.set(0, 0, 0);
        const blade = isWipe ? t.getObjectByName("blade") : null;
        if (blade) blade.scale.y = 1;
      }
    }
  }

  // ── Track-Intake read-outs ───────────────────────────────────────────────────

  feedingHistory(): { entries: FeedingLogEntry[]; now: number } {
    return { entries: [...(this.state.feedingLog ?? [])].reverse(), now: this.state.elapsed };
  }

  intake(): IntakeSummary {
    return intakeSummary(this.state.feedingLog ?? []);
  }

  dishInfo(): { label: string; capacity: number; contained: number } | null {
    const dish = findFoodDish(this.state.layout);
    if (!dish) return null;
    const cap = dishCapacity(dishInterior(dish).r);
    const contained = this.state.feeders.filter((f) => f.alive && f.containedBy === dish.id).length;
    return { label: dish.label ?? "Feeding Dish", capacity: cap, contained };
  }

  /** Honest "next feeding" readout: cooldown / digestion / appetite. */
  nextFeeding(): { ready: boolean; label: string; sub: string } {
    const gecko = this.state.animals[0];
    if (this.state.feedCooldown > 0) {
      return { ready: false, label: `In ${Math.ceil(this.state.feedCooldown)}s`, sub: "Just served" };
    }
    const hunger = gecko.needs.hunger;
    if (hunger >= FULL_HUNGER) {
      const secs = (hunger - (FULL_HUNGER - 2)) / LIZARD_NEEDS.hungerDrainPerSec;
      const label = secs < 90 ? `In ${Math.ceil(secs)}s` : `In ${Math.ceil(secs / 60)} min`;
      return { ready: false, label, sub: "Full — digesting" };
    }
    if (hunger < 35) return { ready: true, label: "Now", sub: "The gecko is hungry" };
    return { ready: true, label: "Ready now", sub: `Appetite at ${Math.round(100 - hunger)}%` };
  }

  /** The gecko's current floor position (Tong Feed offers food beside it). */
  geckoPosition(): { x: number; z: number } {
    const p = this.brain.position;
    return { x: p.x, z: p.z };
  }

  foodOptions(): FoodOption[] {
    return (Object.keys(FOOD_TYPES) as (keyof typeof FOOD_TYPES)[]).map((k) => {
      const f = FOOD_TYPES[k];
      return { kind: k, label: f.label, icon: f.icon, note: f.note, role: f.role };
    });
  }

  /** Drop one insect where the player pointed (Feed Mode). Null = placed. */
  dropFood(kind: string, x: number, z: number): string | null {
    const p = this.brain.position;
    const err = placeFeederAt(this.state, this.world, kind as keyof typeof FOOD_TYPES, x, z, {
      gecko: { x: p.x, z: p.z },
      reach: (fx, fz) => this.brain.canReach(fx, fz),
    });
    if (!err) this.persist();
    return err;
  }

  /** Cells the terrain brush may touch: not under any prop's collision volume
   *  (the ground under a rock stays put — you can't dig a boulder's footing out)
   *  and not the thin apron against the glass (no gap under the panes). */
  private sculptMask = (x: number, z: number): boolean => {
    const m = this.spec.glassApron;
    const b = this.bounds;
    if (x < b.minX + m || x > b.maxX - m || z < b.minZ + m || z > b.maxZ - m) return false;
    for (const ob of this.world.obstacles) {
      const bc = ob.bc;
      if (!bc) continue;
      const dx = x - bc.cx;
      const dz = z - bc.cz;
      const rr = bc.r * 0.85;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    return true;
  };

  /** Apply one Terrain-Mode brush stroke. The collision world samples the SAME
   *  height field live, so walk height / feet / navigation / feeding react
   *  instantly — the visuals + stats just follow. `strength` (Intensity % ×
   *  Brush Mode) scales raise/lower depth and gives the area brushes a second
   *  pass when pushed hard. */
  sculptAt(tool: TerrainTool, x: number, z: number, radius: number, strength = 1): void {
    const dims = this.state.layout.dimensions;
    const opts = { limits: sculptLimits(dims, this.strongBrushOn), mask: this.sculptMask };
    const s = Math.max(0.1, Math.min(1.6, strength));
    // The PAINTED material resists the shovel: loose dune sand digs easily,
    // clay and gravel fight back (their diggingComfort scales the bite).
    const mat = terrainById(materialIdAt(this.materials, dims, x, z));
    const digFactor = mat ? 0.35 + 0.65 * mat.stats.digging : 1;
    const amount = 0.05 * s * digFactor;
    const passes = s * digFactor >= 1.15 ? 2 : 1;
    switch (tool) {
      case "raise":
        sculpt(this.terrain, dims, x, z, radius, +amount, opts);
        break;
      case "lower":
        sculpt(this.terrain, dims, x, z, radius, -amount, opts);
        break;
      case "smooth":
        for (let i = 0; i < passes; i++) smoothTerrain(this.terrain, dims, x, z, radius, opts);
        break;
      case "flatten":
        for (let i = 0; i < passes; i++) flattenTerrain(this.terrain, dims, x, z, radius, opts);
        break;
      case "water":
        paintWater(this.terrain, dims, x, z, radius, true, opts);
        break;
      case "dry":
        paintWater(this.terrain, dims, x, z, radius, false, opts);
        break;
      case "erase":
        // The reset brush: heights back to level AND damp patches dried.
        for (let i = 0; i < passes; i++) flattenTerrain(this.terrain, dims, x, z, radius, opts);
        paintWater(this.terrain, dims, x, z, radius, false, opts);
        break;
    }
    this.applyTerrainVisuals();
    this.overlay.redraw(this.dirt, this.terrain, { heights: this.terrainDebugOn });
    if (this.analysis.visible) this.repaintAnalysis();
  }

  // ── Terrain Mode brush cursor (soft ring + green tool badge) ────────────

  /** Ride the in-world brush cursor under the pointer. `ground` null or a
   *  point outside the enclosure hides it (the ground ray extends past the
   *  glass; the brush only ever works inside). Returns whether it is shown. */
  terrainHover(ground: { x: number; z: number } | null, radius: number, glyph: CursorGlyph, active: boolean): boolean {
    if (!ground || !containsXZ(this.bounds, ground.x, ground.z, -0.05)) {
      this.brushCursor.hide();
      return false;
    }
    this.brushCursor.setGlyph(glyph);
    const y = this.world.climbHeightAt(ground.x, ground.z, 0.01);
    this.brushCursor.show(ground.x, y, ground.z, radius, active);
    return true;
  }

  clearTerrainHover(): void {
    this.brushCursor.hide();
  }

  // ── FILTERS tab: analysis overlays + live readouts ──────────────────────

  /** Show an analysis wash over the habitat (null clears it). */
  setAnalysisFilter(id: string | null): void {
    this.analysisFilterId = id;
    this.analysis.setVisible(id !== null);
    if (id) this.repaintAnalysis();
  }

  setAnalysisOpacity(frac: number): void {
    this.analysis.setOpacity(frac);
  }

  setAnalysisIntensity(frac: number): void {
    this.analysisIntensity = Math.max(0.1, Math.min(1, frac));
    if (this.analysisFilterId) this.repaintAnalysis();
  }

  private repaintAnalysis(): void {
    const def = this.analysisFilterId ? filterById(this.analysisFilterId) : null;
    if (!def) return;
    this.analysis.applyTerrain(this.terrain);
    this.analysis.paint(this.analysisFieldFor(def.id), def.scale, this.analysisIntensity);
  }

  /** Reach fraction cached by the last traffic-flow field build. */
  private trafficReachFrac = 1;

  /** Per-cell 0..1 field for a filter (0 = legend low, 1 = legend high) — all
   *  read from the LIVE systems through the EXACT collision queries the animal
   *  itself uses (marching-squares contours, hide floors, hard rooflines, the
   *  sculpted terrain and dirt maps), so the wash is the vivarium's truth. */
  private analysisFieldFor(id: string): AnalysisField {
    const dims = this.state.layout.dimensions;
    const world = this.world;
    const b = this.bounds;
    const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
    const obstacles = world.obstacles
      .map((ob) => ({ bc: ob.bc ?? world.boundingCircle(ob), interaction: ob.interaction, passable: ob.passable }))
      .filter((o) => o.bc.r > 0.02);

    switch (id) {
      case "heat": {
        // The sim's own temperature model: baskingC inside the basking zone
        // easing to coolC on the far side — the wash IS the thermal gradient.
        const bask = this.state.layout.zones.find((z) => z.kind === "basking");
        const cx = bask?.center[0] ?? b.maxX * 0.5;
        const cz = bask?.center[2] ?? 0;
        const r = Math.max(0.25, bask?.radius ?? 0.35);
        const warm = this.state.environment.baskingC;
        const cool = this.state.environment.coolC;
        const mm = this.materials;
        return (x, z) => {
          const falloff = clamp01(1 - Math.hypot(x - cx, z - cz) / (r * 2.6));
          let tempC = cool + (warm - cool) * Math.pow(falloff, 0.85);
          // The painted material's heat retention nudges the local reading
          // (clay under the lamp genuinely holds warmth longer).
          const mat = terrainById(materialIdAt(mm, dims, x, z));
          if (mat) tempC += (mat.stats.heat - 0.7) * 2.5;
          return clamp01((tempC - 22) / 14); // 22°C → cold end, 36°C → hot end
        };
      }
      case "humidity": {
        // Exact wet cells from the sculpted terrain's water mask + ambient.
        const t = this.terrain;
        const ambient = clamp01((this.state.environment.humidity - 20) / 100) * 0.45;
        return (x, z) => {
          let wet = 0;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ix = Math.round(((x + dx * 0.09 + dims.width / 2) / dims.width) * (t.nx - 1));
              const iz = Math.round(((z + dz * 0.09 + dims.depth / 2) / dims.depth) * (t.nz - 1));
              if (ix < 0 || iz < 0 || ix >= t.nx || iz >= t.nz) continue;
              if (t.water[iz * t.nx + ix]) wet = Math.max(wet, dx === 0 && dz === 0 ? 1 : 0.62);
            }
          }
          return clamp01(ambient + wet * 0.9);
        };
      }
      case "hide_coverage":
        return (x, z) => {
          // EXACT: inside a hide pocket (the interior floor the gecko rests
          // on) or under a hard roofline = fully covered.
          const s = world.sampleSurfaceAt(x, z);
          if (s.type === "hide") return 1;
          if (world.hardTopAt(x, z) > s.y + 0.04) return 0.95;
          // Aura: security falls off with distance from cover.
          let cover = 0;
          for (const o of obstacles) {
            const strength = o.interaction === "hide" ? 0.92 : o.passable ? 0.5 : 0.62;
            const d = Math.hypot(x - o.bc.cx, z - o.bc.cz);
            const reach = o.bc.r + 0.1;
            cover = Math.max(cover, d < reach ? strength : strength * clamp01(1 - (d - reach) / 0.26));
          }
          // Walls read as partial security (leos hug edges).
          const edge = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
          cover = Math.max(cover, 0.34 * clamp01(1 - edge / 0.16));
          return clamp01(cover);
        };
      case "cleanliness": {
        // The LIVE dirt map — every fouled patch exactly where the sim says.
        const dirt = this.dirt;
        return (x, z) => {
          const ix = Math.max(0, Math.min(dirt.nx - 1, Math.floor(((x + dims.width / 2) / dims.width) * dirt.nx)));
          const iz = Math.max(0, Math.min(dirt.nz - 1, Math.floor(((z + dims.depth / 2) / dims.depth) * dirt.nz)));
          return clamp01(1 - dirt.cells[iz * dirt.nx + ix] * 1.15);
        };
      }
      case "comfort": {
        // JWE-style composite: the right warmth × nearby cover × clean ground.
        const bask = this.state.layout.zones.find((zz) => zz.kind === "basking");
        const cx = bask?.center[0] ?? b.maxX * 0.5;
        const cz = bask?.center[2] ?? 0;
        const r = Math.max(0.25, bask?.radius ?? 0.35);
        const warm = this.state.environment.baskingC;
        const cool = this.state.environment.coolC;
        const coverField = this.analysisFieldFor("hide_coverage");
        const cleanField = this.analysisFieldFor("cleanliness");
        return (x, z) => {
          const falloff = clamp01(1 - Math.hypot(x - cx, z - cz) / (r * 2.6));
          const tempC = cool + (warm - cool) * Math.pow(falloff, 0.85);
          const heatComfort = clamp01(1 - Math.abs(tempC - 29) / 8);
          return clamp01(0.42 * heatComfort + 0.36 * coverField(x, z) + 0.22 * cleanField(x, z));
        };
      }
      case "enrichment": {
        // Planet-Zoo-style: things to DO per corner — climbables score highest,
        // hides next, plus open diggable sand as baseline enrichment.
        const mask = this.sculptMask;
        return (x, z) => {
          let enrich = 0;
          for (const o of obstacles) {
            const strength = o.passable ? 0.95 : o.interaction === "hide" ? 0.85 : 0.55;
            const d = Math.hypot(x - o.bc.cx, z - o.bc.cz);
            const reach = o.bc.r + 0.18;
            enrich = Math.max(enrich, d < reach ? strength : strength * clamp01(1 - (d - reach) / 0.3));
          }
          if (mask(x, z) && world.isFree(x, z, 0.03)) enrich = Math.max(enrich, 0.45);
          return clamp01(enrich);
        };
      }
      case "clutter":
        return (x, z) => {
          // EXACT blocked ground reads fully cluttered; open floor shows the
          // crowding aura of nearby decor.
          if (!world.isFree(x, z, 0.03)) return 1;
          let density = 0;
          for (const o of obstacles) {
            const d = Math.hypot(x - o.bc.cx, z - o.bc.cz);
            density += clamp01(1 - d / (o.bc.r + 0.2)) * 0.6;
          }
          return clamp01(density);
        };
      case "dig_zones": {
        // The BRUSH's own rule (sculptMask) + real slopes + real free ground.
        const mask = this.sculptMask;
        return (x, z) => {
          if (!containsXZ(b, x, z, 0.02)) return 0;
          if (!mask(x, z)) return 0.06;
          if (!world.isFree(x, z, 0.03)) return 0.1;
          if (terrainSlopeAt(this.terrain, dims, x, z) > 0.6) return 0.25;
          let clearance = 1;
          for (const o of obstacles) {
            const d = Math.hypot(x - o.bc.cx, z - o.bc.cz) - o.bc.r;
            clearance = Math.min(clearance, clamp01(d / 0.22));
          }
          return clamp01(0.45 + 0.55 * clearance);
        };
      }
      case "traffic_flow": {
        // Reachability flood from the gecko over the exact walkable field.
        const nx = 72;
        const nz = 46;
        const w = b.maxX - b.minX;
        const d = b.maxZ - b.minZ;
        const free = new Uint8Array(nx * nz);
        const reach = new Uint8Array(nx * nz);
        const cellAt = (x: number, z: number): number => {
          const ix = Math.max(0, Math.min(nx - 1, Math.floor(((x - b.minX) / w) * nx)));
          const iz = Math.max(0, Math.min(nz - 1, Math.floor(((z - b.minZ) / d) * nz)));
          return iz * nx + ix;
        };
        for (let iz = 0; iz < nz; iz++) {
          for (let ix = 0; ix < nx; ix++) {
            const x = b.minX + ((ix + 0.5) / nx) * w;
            const z = b.minZ + ((iz + 0.5) / nz) * d;
            free[iz * nx + ix] = world.isFree(x, z, 0.07) ? 1 : 0;
          }
        }
        const queue: number[] = [];
        const start = cellAt(this.brain.position.x, this.brain.position.z);
        if (free[start]) {
          reach[start] = 1;
          queue.push(start);
        } else {
          // Gecko inside a hide: flood from the first free cell instead.
          for (let i = 0; i < free.length; i++) {
            if (free[i]) {
              reach[i] = 1;
              queue.push(i);
              break;
            }
          }
        }
        while (queue.length) {
          const cell = queue.pop()!;
          const cx = cell % nx;
          const cz = Math.floor(cell / nx);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const jx = cx + dx;
            const jz = cz + dz;
            if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
            const j = jz * nx + jx;
            if (free[j] && !reach[j]) {
              reach[j] = 1;
              queue.push(j);
            }
          }
        }
        let f = 0;
        let r = 0;
        for (let i = 0; i < free.length; i++) {
          if (free[i]) f++;
          if (reach[i]) r++;
        }
        this.trafficReachFrac = f > 0 ? r / f : 1;
        return (x, z) => {
          const cell = cellAt(x, z);
          if (!free[cell]) return 0.32; // decor itself: neutral-low
          if (!reach[cell]) return 0.05; // walled-off pocket
          let clearance = 1;
          for (const o of obstacles) {
            const dd = Math.hypot(x - o.bc.cx, z - o.bc.cz) - o.bc.r;
            clearance = Math.min(clearance, clamp01(dd / 0.24));
          }
          return clamp01(0.5 + 0.5 * clearance);
        };
      }
      case "lighting":
      default: {
        const lamp = this.state.layout.equipment.find((e) => e.kind === "heat_lamp");
        const lx = lamp?.target?.[0] ?? lamp?.position[0] ?? b.maxX * 0.5;
        const lz = lamp?.target?.[2] ?? lamp?.position[2] ?? 0;
        const lampOn = !!lamp && lamp.power > 0;
        const uvb = this.state.layout.equipment.some((e) => e.kind === "uvb_lamp" && e.power > 0);
        const ambient = uvb ? 0.3 : 0.16;
        return (x, z) => {
          let lit = lampOn ? clamp01(1 - Math.hypot(x - lx, z - lz) / 1.15) : 0;
          // EXACT shade: anything with a hard roofline over this point blocks
          // the lamp (cave roofs, rock overhangs) — true cast shadow zones.
          const s = world.sampleSurfaceAt(x, z);
          if (world.hardTopAt(x, z) > s.y + 0.04) lit *= 0.18;
          return clamp01(ambient + lit * 0.85);
        };
      }
    }
  }

  /** Live score + status + one-line verdict for a filter (real systems only). */
  filterReadout(id: string): { id: string; score: number; word: string; tone: "good" | "warn" | "bad"; detail: string } {
    const env = this.state.environment;
    const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));
    let score = 50;
    let detail = "";
    switch (id) {
      case "heat": {
        const off = Math.abs(env.baskingC - 31);
        score = clamp(100 - off * 9);
        detail =
          off <= 3
            ? "The basking zone sits in the ideal range with a cool retreat opposite."
            : env.baskingC > 31
              ? "The basking side runs hot — your gecko may start avoiding it."
              : "The basking side runs cool — warmth drives digestion.";
        break;
      }
      case "humidity": {
        const off = env.humidity < 30 ? 30 - env.humidity : env.humidity > 45 ? env.humidity - 45 : 0;
        score = clamp(96 - off * 3.2);
        detail =
          off === 0
            ? "Ambient humidity sits in the desert comfort band."
            : env.humidity > 45
              ? "The air is humid for a desert species — dry a few damp patches."
              : "Very dry air — paint a small damp patch near a hide for shedding.";
        break;
      }
      case "hide_coverage": {
        score = clamp(this.scoresCached.hidingSpots);
        detail =
          score >= 70
            ? "Your gecko has access to good hiding areas throughout the habitat."
            : score >= 50
              ? "Some open stretches leave your gecko exposed — add another hide."
              : "Too few hiding spots — your gecko has nowhere secure to retreat.";
        break;
      }
      case "cleanliness": {
        score = clamp(this.state.environment.cleanliness);
        const drops = (this.state.droppings ?? []).length;
        detail =
          drops > 0
            ? `${drops} dropping${drops > 1 ? "s" : ""} waiting — scoop ${drops > 1 ? "them" : "it"} before the patch fouls.`
            : score >= 80
              ? "The substrate is fresh — just the usual light traffic marks."
              : "Grime is building up — spot-clean the brown patches soon.";
        break;
      }
      case "comfort": {
        // The gecko's LIVE comfort stat — the same number the stat strip shows.
        score = clamp(this.animalInfo().comfort);
        detail =
          score >= 75
            ? "Your gecko is at ease almost everywhere it wanders."
            : score >= 50
              ? "Comfort is patchy — warmth, cover or clean ground is missing somewhere."
              : "Your gecko struggles to settle — check heat, hides and grime.";
        break;
      }
      case "enrichment": {
        // The LIVE wellbeing meter from the animal-info panel.
        score = clamp(this.animalInfo().wellbeing.enrichment);
        detail =
          score >= 60
            ? "Plenty to climb, dig and explore — a busy little world."
            : "The habitat is a bit bare — add climbable decor or clear digging space.";
        break;
      }
      case "clutter": {
        // Fraction of the floor covered by decor footprints; 20–45% reads natural.
        const area = (this.bounds.maxX - this.bounds.minX) * (this.bounds.maxZ - this.bounds.minZ);
        let covered = 0;
        for (const ob of this.world.obstacles) {
          const bc = ob.bc ?? this.world.boundingCircle(ob);
          covered += Math.PI * bc.r * bc.r * 0.7;
        }
        const frac = Math.min(1, covered / Math.max(0.001, area));
        const off = frac < 0.2 ? 0.2 - frac : frac > 0.45 ? frac - 0.45 : 0;
        score = clamp(95 - off * 240);
        detail =
          off === 0
            ? "A natural balance of sheltered corners and clear walking space."
            : frac > 0.45
              ? "The floor is getting crowded — clear a lane through the middle."
              : "The habitat is sparse — a little more decor adds security.";
        break;
      }
      case "dig_zones": {
        let dig = 0;
        const N = 22;
        for (let iz = 0; iz < N; iz++) {
          for (let ix = 0; ix < N; ix++) {
            const x = this.bounds.minX + ((ix + 0.5) / N) * (this.bounds.maxX - this.bounds.minX);
            const z = this.bounds.minZ + ((iz + 0.5) / N) * (this.bounds.maxZ - this.bounds.minZ);
            if (this.sculptMask(x, z) && terrainSlopeAt(this.terrain, this.state.layout.dimensions, x, z) < 0.6) dig++;
          }
        }
        const frac = dig / (N * N);
        score = clamp((frac / 0.45) * 100);
        detail =
          frac >= 0.3
            ? "Plenty of open sand — digging enrichment is easy to come by."
            : "Open sand is scarce — leave a few clear patches between decor.";
        break;
      }
      case "traffic_flow": {
        this.analysisFieldFor("traffic_flow"); // refresh the reach fraction
        score = clamp(this.trafficReachFrac * 100);
        detail =
          score >= 85
            ? "Every corner of the habitat connects back to the open floor."
            : "Some areas are pinched off — widen the gaps between large decor.";
        break;
      }
      case "lighting": {
        const lampOn = this.state.layout.equipment.some((e) => e.kind === "heat_lamp" && e.power > 0);
        const uvbOn = this.state.layout.equipment.some((e) => e.kind === "uvb_lamp" && e.power > 0);
        score = lampOn && uvbOn ? 92 : lampOn ? 74 : uvbOn ? 55 : 30;
        detail =
          lampOn && uvbOn
            ? "Basking light and UVB are both on, with shaded retreats intact."
            : lampOn
              ? "The basking lamp is on — UVB would round out the light diet."
              : "No basking lamp — your gecko has nowhere bright to warm up.";
        break;
      }
    }
    const st = filterStatus(score);
    return { id, score, word: st.word, tone: st.tone, detail };
  }

  /** Top-down analysis minimap: substrate-coloured floor plan of THIS habitat
   *  — the filter wash blur-smoothed over it, every decor piece as its EXACT
   *  collision contour, the water dish tinted, and the gecko marked live.
   *  Rendered at 2× for crisp display in the drawer's minimap frame. */
  filterMapCanvas(): HTMLCanvasElement | null {
    const def = this.analysisFilterId ? filterById(this.analysisFilterId) : null;
    if (!def) return null;
    const W = 472;
    const H = 296;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const dims = this.state.layout.dimensions;
    const field = this.analysisFieldFor(def.id);
    const px = (x: number): number => (x / dims.width + 0.5) * W;
    const py = (z: number): number => (z / dims.depth + 0.5) * H;

    // Floor plan base: every PAINTED material cell in its own tone (the map
    // shows exactly what the player brushed), plus a whisper of grain.
    const mm = this.materials;
    const cw2 = W / mm.nx;
    const ch2 = H / mm.nz;
    for (let iz = 0; iz < mm.nz; iz++) {
      for (let ix = 0; ix < mm.nx; ix++) {
        const id = mm.ids[mm.cells[iz * mm.nx + ix]] ?? mm.ids[0];
        const pal = (terrainById(id) ?? this.appliedTerrain()).palette;
        ctx.fillStyle = pal.patchDark;
        ctx.fillRect(ix * cw2, iz * ch2, cw2 + 0.5, ch2 + 0.5);
      }
    }
    const base = this.appliedTerrain().palette;
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 340; i++) {
      const gx = ((i * 127.3) % 1009) / 1009;
      const gz = ((i * 311.7) % 997) / 997;
      ctx.fillStyle = i % 2 ? base.grainLight : base.grainDark;
      ctx.fillRect(gx * W, gz * H, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Field wash: low-res cells blur-scaled over the floor.
    const off = document.createElement("canvas");
    off.width = 118;
    off.height = 74;
    const octx = off.getContext("2d")!;
    const img = octx.createImageData(off.width, off.height);
    for (let iz = 0; iz < off.height; iz++) {
      for (let ix = 0; ix < off.width; ix++) {
        const x = ((ix + 0.5) / off.width - 0.5) * dims.width;
        const z = ((iz + 0.5) / off.height - 0.5) * dims.depth;
        const t = Math.max(0, Math.min(1, field(x, z)));
        const col = parseInt(scaleColor(def.scale, t).slice(1), 16);
        const i4 = (iz * off.width + ix) * 4;
        img.data[i4] = (col >> 16) & 255;
        img.data[i4 + 1] = (col >> 8) & 255;
        img.data[i4 + 2] = col & 255;
        img.data[i4 + 3] = 216;
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.save();
    ctx.filter = "blur(2px)";
    ctx.drawImage(off, -4, -4, W + 8, H + 8);
    ctx.restore();

    // Decor as its EXACT collision silhouettes (marching-squares contours).
    for (const ob of this.world.obstacles) {
      const isHide = ob.interaction === "hide";
      const isDish = ob.category === "dish";
      ctx.beginPath();
      if (ob.shape === "poly" || ob.shape === "hull") {
        const pts = (ob as { pts: { x: number; z: number }[] }).pts;
        if (pts.length < 3) continue;
        ctx.moveTo(px(pts[0].x), py(pts[0].z));
        for (let i = 1; i < pts.length; i++) ctx.lineTo(px(pts[i].x), py(pts[i].z));
        ctx.closePath();
      } else {
        const bc = ob.bc ?? this.world.boundingCircle(ob);
        ctx.ellipse(px(bc.cx), py(bc.cz), (bc.r / dims.width) * W, (bc.r / dims.depth) * H, 0, 0, Math.PI * 2);
      }
      ctx.fillStyle = isDish ? "rgba(38, 60, 66, 0.78)" : isHide ? "rgba(26, 19, 11, 0.8)" : "rgba(20, 15, 9, 0.66)";
      ctx.fill();
      ctx.strokeStyle = isDish ? "rgba(140, 210, 220, 0.5)" : "rgba(255, 240, 205, 0.32)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      if (isDish) {
        const bc = ob.bc ?? this.world.boundingCircle(ob);
        ctx.fillStyle = "rgba(105, 180, 205, 0.5)";
        ctx.beginPath();
        ctx.ellipse(px(bc.cx), py(bc.cz), (bc.r * 0.55 / dims.width) * W, (bc.r * 0.55 / dims.depth) * H, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // The gecko, live: soft shadow + green dot + white rim.
    const gp = this.brain.position;
    const gx = px(gp.x);
    const gy = py(gp.z);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(gx + 1.5, gy + 2, 7.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8ce25a";
    ctx.beginPath();
    ctx.arc(gx, gy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Glass frame + corner vignette.
    ctx.strokeStyle = "rgba(214, 230, 226, 0.35)";
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.55, W / 2, H / 2, H * 1.05);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    return c;
  }

  // ── Substrate materials (Terrain Mode → Materials row) ──────────────────

  /** The terrain material committed to the layout (older saves ⇒ Sahara Sand). */
  private appliedTerrain(): TerrainDef {
    return (
      terrainById(this.state.layout.substrate.terrainId ?? "") ??
      terrainById(DEFAULT_TERRAIN_ID)!
    );
  }

  private substrateInfo(): { id: string; name: string; habitat: HabitatType } {
    const dom = dominantMaterialId(this.materials);
    const t = terrainById(dom) ?? this.appliedTerrain();
    const dominance = coverageFractions(this.materials).get(dom) ?? 1;
    return { id: t.id, name: dominance < 0.7 ? "Mixed substrate" : t.name, habitat: this.state.layout.type };
  }

  /** Coverage-weighted humidity params — a half-clay floor holds half-clay
   *  moisture. Recomputed on load + after every paint stroke. */
  private recomputeSubstrateBlend(): void {
    const cov = coverageFractions(this.materials);
    let base = 0;
    let hold = 0;
    for (const [id, f] of cov) {
      const t = terrainById(id) ?? terrainById(DEFAULT_TERRAIN_ID)!;
      base += t.humidityBase * f;
      hold += t.humidityHold * f;
    }
    this.substrateBlend = { base: base || 38, hold: hold || 1 };
  }

  /** Lazily swap the tiled sand texture for the painted-material composite
   *  (only needed once the floor stops being uniform). */
  private ensureMaterialFloor(): MaterialFloor {
    if (!this.matFloor) {
      this.matFloor = new MaterialFloor(
        this.state.layout.dimensions,
        (id) => (terrainById(id) ?? terrainById(DEFAULT_TERRAIN_ID)!).palette,
        this.spec.sandInset,
      );
      this.matFloor.paint(this.materials);
      const sand = this.scene.children.find((c) => c.userData?.sand) as THREE.Mesh | undefined;
      if (sand) {
        const mat = sand.material as THREE.MeshStandardMaterial;
        mat.map?.dispose();
        mat.map = this.matFloor.texture; // full-floor composite: repeat stays 1×1
        mat.needsUpdate = true;
      }
    }
    return this.matFloor;
  }

  /** The Paint brush, PHYSICAL: lay `id` into the material map under the
   *  stroke sample and repaint just that region of the floor texture. */
  private paintMaterialAt(id: string, x: number, z: number, radius: number): boolean {
    const t = terrainById(id);
    if (!t || !terrainUnlocked(t, this.state.layout.type)) return false;
    const changed = paintMaterial(this.materials, this.state.layout.dimensions, x, z, radius, id);
    if (changed > 0) {
      this.ensureMaterialFloor().paint(this.materials, { x, z, radius });
      this.strokeCells += changed;
      this.strokePaintId = id;
    }
    return changed > 0;
  }

  /** A paint stroke finished: dominant substrate + bed tint + humidity blend
   *  update, the real 3D stones rescatter, the event logs once per stroke,
   *  and the save persists the map. */
  private paintStrokeEnd(): void {
    if (this.strokeCells === 0) return;
    const dom = dominantMaterialId(this.materials);
    const t = terrainById(dom) ?? this.appliedTerrain();
    const sub = this.state.layout.substrate;
    this.state.layout.substrate = { type: t.substrateType, color: t.color, depth: sub.depth, terrainId: t.id };
    retintSubstrateBed(this.scene, t.color);
    this.recomputeSubstrateBlend();
    this.refreshMaterialDecor();
    const painted = terrainById(this.strokePaintId);
    logHabitatEvent(this.state, `Painted ${painted?.name ?? "substrate"} into the habitat floor.`, "good");
    saveHabitat(this.state);
    this.strokeCells = 0;
    if (this.analysis.visible) this.repaintAnalysis();
  }

  /** Real 3D stones over pebble/rocky cells — painting gravel doesn't just
   *  tint the floor, it LAYS PEBBLES. Deterministic per cell (stable across
   *  strokes/reloads), capped for perf, riding the sculpted terrain. */
  private refreshMaterialDecor(): void {
    if (this.matDecor) {
      this.scene.remove(this.matDecor);
      this.matDecor.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
      this.matDecor = null;
    }
    const dims = this.state.layout.dimensions;
    const mm = this.materials;
    const group = new THREE.Group();
    group.userData.materialDecor = true;
    const hash = (a: number, b: number): number => {
      const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    let placed = 0;
    for (let iz = 0; iz < mm.nz && placed < 150; iz++) {
      for (let ix = 0; ix < mm.nx && placed < 150; ix++) {
        const id = mm.ids[mm.cells[iz * mm.nx + ix]];
        if (id !== "pebble_gravel" && id !== "rocky_mix") continue;
        const h = hash(ix, iz);
        // Gravel scatters denser than rocky (bigger, sparser shards).
        if (h > (id === "pebble_gravel" ? 0.34 : 0.2)) continue;
        const cellW = dims.width / mm.nx;
        const cellD = dims.depth / mm.nz;
        const x = (ix + 0.5) * cellW - dims.width / 2 + (hash(ix, iz + 99) - 0.5) * cellW * 0.9;
        const z = (iz + 0.5) * cellD - dims.depth / 2 + (hash(ix + 99, iz) - 0.5) * cellD * 0.9;
        const pal = terrainById(id)!.palette;
        const tones = [pal.grainDark, pal.coarse, pal.patchDark].map((c) => parseInt(c.slice(1), 16));
        let seed = (ix * 73 + iz * 149) >>> 0;
        const rng = (): number => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        const r = id === "pebble_gravel" ? 0.008 + rng() * 0.014 : 0.014 + rng() * 0.022;
        const rock = makeRockMesh(r, tones[placed % 3], rng);
        rock.position.x = x;
        rock.position.z = z;
        rock.position.y += dims.substrateTop + terrainHeightAt(this.terrain, dims, x, z);
        rock.rotation.y = rng() * Math.PI * 2;
        rock.castShadow = false;
        group.add(rock);
        placed++;
      }
    }
    if (group.children.length > 0) {
      this.matDecor = group;
      this.scene.add(group);
    }
  }

  /** Live terrain readouts for the drawer's tool-context card: peak dune,
   *  deepest dig, damp coverage, and the centre-line elevation profile. */
  private terrainInfo(): { reliefCm: number; deepCm: number; wetPct: number; profile: number[] } {
    let peak = 0;
    let deep = 0;
    for (const h of this.terrain.heights) {
      if (h > peak) peak = h;
      if (h < deep) deep = h;
    }
    const dims = this.state.layout.dimensions;
    const profile: number[] = [];
    for (let i = 0; i < 48; i++) {
      const x = (i / 47 - 0.5) * dims.width * 0.96;
      profile.push(terrainHeightAt(this.terrain, dims, x, 0));
    }
    return { reliefCm: peak * 100, deepCm: -deep * 100, wetPct: this.waterFracCached * 100, profile };
  }

  /** Re-displace the sand mesh + decal overlays from the sculpted height map,
   *  and re-seat the scattered pebbles so they ride the dunes instead of sinking. */
  private applyTerrainVisuals(): void {
    const dims = this.state.layout.dimensions;
    const sand = this.scene.children.find((c) => c.userData?.sand) as THREE.Mesh | undefined;
    if (sand) applyTerrainToSand(sand, this.terrain, dims);
    this.overlay.applyTerrain(this.terrain);
    this.analysis.applyTerrain(this.terrain);
    const pebbles = this.scene.children.find((c) => c.userData?.pebbles);
    if (pebbles) {
      for (const p of pebbles.children) {
        p.position.y = dims.substrateTop + terrainHeightAt(this.terrain, dims, p.position.x, p.position.z);
      }
    }
    // Painted material stones ride the dunes too.
    if (this.matDecor) {
      for (const p of this.matDecor.children) {
        const mesh = p as THREE.Mesh;
        const rest = -(mesh.geometry.boundingBox?.min.y ?? 0);
        p.position.y = rest + dims.substrateTop + terrainHeightAt(this.terrain, dims, p.position.x, p.position.z);
      }
    }
  }

  /** Toggle one of the independent debug overlays; returns its new state. */
  private toggleDebugOption(key: DebugOption): boolean {
    switch (key) {
      case "collisions":
        this.setDebug(!this.debugOn);
        return this.debugOn;
      case "feet":
        this.footDebugOn = !this.footDebugOn;
        this.footGroup.visible = this.footDebugOn || this.normalsDebugOn;
        return this.footDebugOn;
      case "normals":
        this.normalsDebugOn = !this.normalsDebugOn;
        this.footGroup.visible = this.footDebugOn || this.normalsDebugOn;
        // Normals ride the foot markers — hide the spheres unless feet are on too.
        for (const m of this.footMarkers) m.visible = this.footDebugOn || this.normalsDebugOn;
        return this.normalsDebugOn;
      case "terrain":
        this.terrainDebugOn = !this.terrainDebugOn;
        this.overlay.redraw(this.dirt, this.terrain, { heights: this.terrainDebugOn });
        return this.terrainDebugOn;
    }
  }

  private debugOptions(): Record<DebugOption, boolean> {
    return {
      collisions: this.debugOn,
      feet: this.footDebugOn,
      normals: this.normalsDebugOn,
      terrain: this.terrainDebugOn,
    };
  }

  getController(): LizardController {
    return {
      readState: (): LizardHudState => this.readState(),
      feed: () => this.feed(),
      clean: () => this.clean(),
      replaceWaterNow: () => this.replaceWaterNow(),
      removeWasteNow: () => this.removeWasteNow(),
      cleanStatus: () => this.cleanStatus(),
      cleanHover: (ground, scrubbing, radius, tool) => this.cleanHover(ground, scrubbing, radius, tool),
      setCleanScrubbing: (on) => this.setCleanScrubbing(on),
      pourAt: (ground) => this.pourAt(ground),
      wipeHover: (pt, wiping) => this.wipeHover(pt, wiping),
      wipeStrokeAt: (x, y) => this.wipeStrokeAt(x, y),
      glassPane: () => this.glassPane(),
      clearCleanHover: () => this.clearCleanHover(),
      toggleDebug: () => {
        this.setDebug(!this.debugOn);
        return this.debugOn;
      },
      debugVisible: () => this.debugOn,
      animalInfo: (): AnimalInfoState => this.animalInfo(),
      highlightAnimal: (on: boolean) => this.highlightAnimal(on),
      brushClean: (x, z, radius) => this.brushClean(x, z, radius),
      cleanliness: () => this.cleanliness(),
      dirtSpots: (max?: number) => this.dirtSpotsList(max),
      setCleanHighlights: (on: boolean) => this.setCleanHighlights(on),
      feederAnchor: () => this.feederAnchor(),
      geckoPosition: () => this.geckoPosition(),
      foodOptions: () => this.foodOptions(),
      dropFood: (kind, x, z) => this.dropFood(kind, x, z),
      serveMealNow: (kind, count, method, supplement, at) => this.serveMealNow(kind, count, method, supplement, at),
      presentationActive: () => this.presentationActive(),
      moveOffer: (x, z) => this.moveOffer(x, z),
      adjustOffer: (delta) => this.adjustOffer(delta),
      setCinematic: (on) => this.setCinematic(on),
      feedingHistory: () => this.feedingHistory(),
      intake: () => this.intake(),
      dishInfo: () => this.dishInfo(),
      nextFeeding: () => this.nextFeeding(),
      feedHover: (ground, method) => this.feedHover(ground, method),
      clearFeedHover: () => this.clearFeedHover(),
      setGeckoHover: (on) => this.setGeckoHover(on),
      sculptAt: (tool, x, z, radius, strength) => this.sculptAt(tool, x, z, radius, strength),
      setStrongBrush: (on) => {
        this.strongBrushOn = on;
      },
      strongBrush: () => this.strongBrushOn,
      terrainHover: (ground, radius, glyph, active) => this.terrainHover(ground, radius, glyph as CursorGlyph, active),
      clearTerrainHover: () => this.clearTerrainHover(),
      setAnalysisFilter: (id) => this.setAnalysisFilter(id),
      setAnalysisOpacity: (frac) => this.setAnalysisOpacity(frac),
      setAnalysisIntensity: (frac) => this.setAnalysisIntensity(frac),
      filterReadout: (id) => this.filterReadout(id),
      filterMapCanvas: () => this.filterMapCanvas(),
      substrateInfo: () => this.substrateInfo(),
      paintMaterialAt: (id, x, z, radius) => this.paintMaterialAt(id, x, z, radius),
      paintStrokeEnd: () => this.paintStrokeEnd(),
      terrainInfo: () => this.terrainInfo(),
      debugOptions: () => this.debugOptions(),
      toggleDebugOption: (key) => this.toggleDebugOption(key),
    };
  }

  /** Rich read-out for the click-the-animal info card. */
  private animalInfo(): AnimalInfoState {
    const gecko = this.state.animals[0];
    const profile = careProfile(gecko.speciesId);
    const env = this.state.environment;
    const phase = this.brain.navPhase;
    const climbing = this.brain.climbHeight > 0.02;
    const behavior =
      phase === "eat"
        ? "Eating"
        : phase === "shelter"
          ? this.brain.sheltering
            ? "Hiding in a shelter"
            : "Heading to a hide"
          : climbing && (phase === "roam" || phase === "hunt")
            ? "Climbing"
            : phase === "hunt"
              ? "Hunting a cricket"
              : phase === "recover"
                ? "Stuck — backing up"
                : phase === "roam"
                  ? "Roaming"
                  : phase === "look"
                    ? "Looking around"
                    : phase === "flee"
                      ? "Startled"
                      : phase === "giveup"
                        ? "Resting"
                        : "Idle";
    const target =
      phase === "hunt" || phase === "eat"
        ? "A cricket"
        : this.brain.foodUnreachable
          ? "Cricket (unreachable)"
          : phase === "roam"
            ? "A roam spot"
            : "—";
    const comfort = Math.round(Math.max(0, Math.min(100, 0.5 * gecko.needs.health + 0.5 * (100 - gecko.needs.stress))));
    const heat = this.state.layout.equipment.find((e) => e.kind === "heat_lamp");
    const wb = computeWellbeing(this.state, this.scoresCached, {
      waterFrac: this.waterFracCached,
      relief: this.reliefCached,
      foodUnreachable: this.brain.foodUnreachable,
      sheltering: this.brain.sheltering,
      activity01: this.brain.speed01,
    });
    return {
      name: gecko.name,
      species: "Leopard Gecko",
      scientific: profile?.scientificName ?? "Eublepharis macularius",
      stage: gecko.stage,
      personality: this.persona.label,
      personalityBlurb: this.persona.blurb,
      behavior,
      hunger: Math.round(gecko.needs.hunger),
      stress: Math.round(gecko.needs.stress),
      health: Math.round(gecko.needs.health),
      calcium: Math.round(gecko.needs.calcium ?? 80),
      bodyCondition: Math.round(gecko.needs.bodyCondition ?? 50),
      comfort,
      baskingC: env.baskingC,
      coolC: env.coolC,
      humidity: env.humidity,
      target,
      basking: !!heat && heat.power > 0,
      usingPlaceholder: this.usingPlaceholder,
      clipNames: this.animal?.clipNames ?? [],
      warnings: this.readState().warnings,
      wellbeing: {
        tempComfort: Math.round(wb.tempComfort),
        humidComfort: Math.round(wb.humidComfort),
        security: Math.round(wb.security),
        enrichment: Math.round(wb.enrichment),
        cleanExposure: Math.round(wb.cleanExposure),
        hydration: Math.round(wb.hydration),
        landComfort: Math.round(wb.landComfort),
        activity: Math.round(wb.activity),
      },
      recommendations: wb.recommendations,
    };
  }

  private feed(): void {
    if (!canFeed(this.state)) return;
    // Prefer spawning crickets the gecko can actually path to.
    spawnFeeders(this.state, this.world, Math.random, undefined, (x, z) => this.brain.canReach(x, z));
  }

  /** The HUD's quick Clean action: a light overall tidy (takes the edge off the
   *  grime everywhere). A DEEP clean is the interactive brush (Clean Mode). */
  private clean(): void {
    for (let i = 0; i < this.dirt.cells.length; i++) this.dirt.cells[i] = Math.max(0, this.dirt.cells[i] - 0.3);
    this.state.environment.cleanliness = cleanlinessPct(this.dirt);
    this.overlay.redraw(this.dirt, this.terrain, { heights: this.terrainDebugOn });
    logHabitatEvent(this.state, "Tidied the terrarium — use the brush (Clean Mode) for a deep clean.", "good");
  }

  // ── Cleaning Mode ACTIONS (each a real, distinct behaviour) ─────────────────

  /** The water dish in the layout (never the food dish), or null. */
  private waterDish(): PlacedObject | null {
    const dishes = this.state.layout.objects.filter((o) => o.category === "dish");
    return (
      dishes.find((o) => o.defId === "dish_water" || /water/i.test(o.id) || /water/i.test(o.label ?? "")) ??
      dishes[0] ??
      null
    );
  }

  /** REPLACE WATER: empty + refill the water dish — sparkle at the dish, water
   *  sound, freshness reset (drives the "Water quality" pill). */
  replaceWaterNow(): boolean {
    const dish = this.waterDish();
    if (!dish) return false;
    this.waterFreshT = 0;
    sfx.water();
    this.puffAt(dish.position[0], dish.position[2], 0x9fd8ff, 18, 0.09);
    logHabitatEvent(this.state, "Emptied and refilled the water dish with fresh water.", "good");
    return true;
  }

  /** The interactive front pane: position + size of the smudge layer, and the
   *  plane the app's wipe raycast intersects. */
  glassPane(): { z: number; cx: number; cy: number; w: number; h: number } {
    const b = this.bounds;
    const h = Math.min(0.5, this.state.layout.dimensions.height * 0.62);
    return { z: b.maxZ + 0.012, cx: (b.minX + b.maxX) / 2, cy: b.y + h / 2 + 0.015, w: b.maxX - b.minX, h };
  }

  private ensureGlassSmudge(): ThreeGlassSmudge {
    if (!this.glassSmudge) {
      const p = this.glassPane();
      this.glassSmudge = new ThreeGlassSmudge(p.w, p.h, new THREE.Vector3(p.cx, p.cy, p.z));
      this.scene.add(this.glassSmudge.mesh);
      // A lived-in pane to start with: a few streaks + smears.
      for (let i = 0; i < 7; i++) {
        this.glassSmudge.addSmudge(0.08 + Math.random() * 0.84, 0.1 + Math.random() * 0.7, i % 3 === 0 ? "streak" : i % 3 === 1 ? "smear" : "paws");
      }
      this.glassWasClean = false;
    }
    return this.glassSmudge;
  }

  /** One squeegee stroke on the pane at world (x, y). Wipes the smudge layer;
   *  the moment the whole pane comes clean → sheen sweep + chime. */
  wipeStrokeAt(x: number, y: number): void {
    const sm = this.ensureGlassSmudge();
    const p = this.glassPane();
    sm.wipeAt(x - p.cx, y - p.cy, 0.085);
    this.wipeSqueakT -= 1 / 60;
    if (this.wipeSqueakT <= 0) {
      this.wipeSqueakT = 0.85;
      sfx.squeak();
    }
    this.puffAt(x, this.cleanTools.wipe.position.z + 0.01, 0xeaf6ff, 5, 0.03, y);
    if (!this.glassWasClean) {
      const cover = sm.coverage();
      // Forgiveness: once the pane is nearly there, the next stroke finishes
      // it — hunting the last speck is chore, not game.
      if (cover < 0.05) {
        sm.clearAll();
        this.glassWasClean = true;
        this.glassWipeT = 0;
        this.playGlassSheen();
        sfx.done();
        logHabitatEvent(this.state, "Squeaky clean — the front glass is spotless!", "good");
      }
    }
  }

  /** The finishing flourish: a soft highlight sweeping across the front pane. */
  private playGlassSheen(): void {
    if (!this.glassSheen) {
      const b = this.bounds;
      this.glassSheen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.22, 0.6),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
      );
      this.glassSheen.position.set(b.minX, this.bounds.y + 0.32, b.maxZ + 0.015);
      this.glassSheen.renderOrder = 1006;
      this.scene.add(this.glassSheen);
    }
    this.glassSheen.visible = true;
    this.glassSheenT = 0;
  }

  /** REMOVE WASTE: scoop EVERY dropping (poof + pop at each, its dirt patch
   *  scrubbed), falling back to the dirtiest spot when the sand is poop-free. */
  removeWasteNow(): { scooped: number; cleanedSpot: boolean } {
    const drops = [...(this.state.droppings ?? [])];
    if (drops.length > 0) {
      for (const d of drops) {
        this.puffAt(d.position[0], d.position[2], 0xbfa06a, 14, 0.08);
        cleanAt(this.dirt, this.state.layout.dimensions, d.position[0], d.position[2], 0.24, 0.5);
        sfx.pop();
      }
      this.state.droppings = [];
      this.droppings.sync(this.state.droppings);
      this.state.environment.cleanliness = cleanlinessPct(this.dirt);
      this.overlay.redraw(this.dirt, this.terrain, { heights: this.terrainDebugOn });
      if (this.dirtRingsOn) this.refreshDirtRings();
      sfx.done();
      logHabitatEvent(this.state, `Scooped ${drops.length} dropping${drops.length > 1 ? "s" : ""} out of the sand.`, "good");
      this.persist();
      return { scooped: drops.length, cleanedSpot: false };
    }
    const spots = this.dirtSpotsList(1);
    if (spots.length > 0) {
      this.brushClean(spots[0].x, spots[0].z, 0.32);
      this.brushClean(spots[0].x, spots[0].z, 0.32);
      sfx.done();
      return { scooped: 0, cleanedSpot: true };
    }
    return { scooped: 0, cleanedSpot: false };
  }

  /** Everything the Cleaning drawer's status pills need, in one honest read. */
  cleanStatus(): {
    cleanliness: number;
    spots: number;
    dustyAreas: number;
    droppings: number;
    waterQuality: "good" | "fair" | "stale" | "none";
    glassSmudged: boolean;
  } {
    const clean = this.cleanliness();
    return {
      cleanliness: clean,
      spots: this.dirtSpotsList().length,
      dustyAreas: clean >= 92 ? 0 : Math.min(3, Math.max(1, Math.round((92 - clean) / 9))),
      droppings: this.state.droppings?.length ?? 0,
      waterQuality: !this.waterDish() ? "none" : this.waterFreshT < 300 ? "good" : this.waterFreshT < 900 ? "fair" : "stale",
      glassSmudged: (this.glassSmudge?.coverage() ?? 0) > 0.04,
    };
  }

  private readState(): LizardHudState {
    const gecko = this.state.animals[0];
    const profile = careProfile(gecko.speciesId);
    const env = this.state.environment;
    const warnings: string[] = [];
    const cap = capacityWarning(this.state.layout, this.state.animals);
    if (cap) warnings.push(cap);
    if (profile) {
      if (env.baskingC < profile.ideal.baskingC[0]) warnings.push("Basking side is too cool.");
      if (env.baskingC > profile.ideal.baskingC[1]) warnings.push("Basking side is too hot.");
      if (env.humidity > profile.ideal.humidity[1]) warnings.push("Humidity is high for a desert species.");
      if (env.humidity < profile.ideal.humidity[0]) warnings.push("Humidity is low — offer a humid hide.");
      if (this.scoresCached.hidingSpots < 50) warnings.push("Too few hides — add cover.");
    }
    if (gecko.needs.hunger < 25) warnings.push(`${gecko.name} is hungry.`);
    if ((gecko.needs.calcium ?? 80) < 30) warnings.push("Calcium is low — dust the next feeding (MBD risk).");
    if ((gecko.needs.bodyCondition ?? 50) > 80) warnings.push(`${gecko.name} is getting chubby — ease off fatty treats.`);
    for (const label of this.tooSmallHides()) {
      warnings.push(`${label} is too small for ${gecko.name} to enter — scale it up.`);
    }
    const foodUnreachable = this.brain.foodUnreachable;
    if (foodUnreachable) warnings.unshift("A cricket is out of reach — clear a path or move decor.");

    const uvb = this.state.layout.equipment.find((e) => e.kind === "uvb_lamp");
    return {
      habitatName: this.state.layout.name,
      overall: this.scoresCached.overall,
      rating: ratingFor(this.scoresCached.overall),
      scores: this.scoresCached,
      environment: env,
      uvbOn: !!uvb && uvb.power > 0,
      animal: {
        name: gecko.name,
        scientific: profile?.scientificName ?? "",
        stage: gecko.stage,
        hunger: Math.round(gecko.needs.hunger),
        stress: Math.round(gecko.needs.stress),
        health: Math.round(gecko.needs.health),
        personality: this.persona.label,
      },
      events: this.state.events.slice(0, 8),
      feedCooldown: this.state.feedCooldown,
      canFeed: canFeed(this.state),
      warnings,
      foodUnreachable,
      usingPlaceholder: this.usingPlaceholder,
      clipNames: this.animal?.clipNames ?? [],
      feederCount: this.state.feeders.filter((f) => f.alive).length,
      debugOn: this.debugOn,
      substrateName: this.appliedTerrain().name,
    };
  }

  // ── Live rebuild after a layout edit ────────────────────────────────────────
  /** Recompile collision + navigation, rescore, and refresh decor shadows + debug
   *  from the current layout. Called whenever decor is added/removed/loaded, or a
   *  move/rotate/scale gesture is committed. */
  private rebuildWorld(): void {
    this.settleHangingProps();
    this.world = CollisionWorld.fromLayout(this.state.layout, this.bounds, this.groundSrc, {
      maxClimb: this.persona.climbCap,
    });
    this.brain.setWorld(this.world);
    this.scoresCached = computeScores(this.state.layout);
    this.rebuildDecorShadows();
    this.rebuildDebug();
  }

  /** Drop any UNSUPPORTED hanging props (their branch/wall support was moved or
   *  deleted) to the substrate + sync their meshes. The prop currently selected in
   *  the editor is left alone so a live gesture isn't yanked out of the player's
   *  hand — the gizmo's own snap-back covers it. */
  private settleHangingProps(): void {
    const fell = settleHanging(this.state.layout, this.bounds.y, this.selectedId ?? undefined);
    for (const id of fell) {
      const o = findObject(this.state.layout, id);
      const v = this.viewFor(id);
      if (o && v) v.position.set(o.position[0], o.position[1], o.position[2]);
      const label = o?.label?.toLowerCase() ?? "hanging prop";
      logHabitatEvent(this.state, `The ${label} fell — its support was removed.`, "warn");
    }
  }

  private rebuildDebug(): void {
    const wasVisible = this.debugOn;
    this.scene.remove(this.debug.object);
    this.debug.dispose();
    this.debug = new ThreeCollisionDebug(this.world, GECKO_MOVEMENT.bodyRadius);
    this.debug.setVisible(wasVisible);
    this.scene.add(this.debug.object);
  }

  private rebuildDecorShadows(): void {
    for (const s of this.decorShadowObjs) {
      this.decorShadows.remove(s.mesh);
      s.dispose();
    }
    this.decorShadowObjs = [];
    this.addDecorShadows();
  }

  private persist(): void {
    const p = this.brain.position;
    this.state.animals[0].position = [p.x, this.bounds.y, p.z];
    saveHabitat(this.state);
  }

  // ── EditableHabitat (Decorate mode) ─────────────────────────────────────────
  asEditable(): EditableHabitat {
    return this;
  }

  groundY(): number {
    return this.bounds.y;
  }

  catalog(): CatalogItem[] {
    return LIZARD_PLACEABLES.map((p) => ({
      id: p.id,
      label: p.label,
      category: p.category,
      interaction: p.interaction ?? p.category,
      placement: p.placement ?? "floor",
      section: p.section,
      hasAsset: !!p.asset,
    }));
  }

  /** Real-model thumbnail for a catalog card (data URL; null ⇒ icon fallback). */
  thumbnail(defId: string): Promise<string | null> {
    const def = findPlaceable(defId);
    if (!def?.asset) return Promise.resolve(null);
    const tmp = makePlaced(def, "__thumb__", [0, 0, 0]);
    return tmp.asset ? decorThumbnail(tmp.asset) : Promise.resolve(null);
  }

  /** Ghost-preview clone of a placeable's REAL model, pre-scaled to the exact
   *  display size placement will use (base at local y = 0). Null ⇒ box fallback. */
  async ghostModel(defId: string): Promise<{ object: THREE.Object3D; height: number } | null> {
    const def = findPlaceable(defId);
    if (!def?.asset) return null;
    const tmp = makePlaced(def, "__ghost__", [0, 0, 0]);
    if (!tmp.asset) return null;
    const model = await loadDecorModelCached(tmp.asset);
    if (!model) return null;
    const scale = displayScaleFor(tmp, model.size);
    model.object.scale.setScalar(scale);
    return { object: model.object, height: model.size.y * scale };
  }

  /** The exact Y a new `defId` prop is placed at (mirrors addFromCatalog). */
  defaultPlaceY(defId: string): number {
    const mode = this.placementMode(defId);
    return mode === "hanging" ? this.bounds.y + 0.42 : mode === "elevated" ? this.bounds.y + 0.12 : this.bounds.y;
  }

  animalPickObject(): THREE.Object3D | null {
    return this.animal?.object ?? null;
  }

  animalPosition(): [number, number, number] | null {
    const p = this.brain.position;
    return [p.x, this.bounds.y + this.brain.climbHeight, p.z];
  }

  collisionDebugVisible(): boolean {
    return this.debugOn;
  }

  toggleCollisionDebug(): boolean {
    this.setDebug(!this.debugOn);
    return this.debugOn;
  }

  placementMode(defOrId: string): PlacementMode {
    const o = findObject(this.state.layout, defOrId);
    if (o) return o.placement ?? "floor";
    return findPlaceable(defOrId)?.placement ?? "floor";
  }

  /** Vertical range a prop may occupy: floor props stay grounded; elevated/hanging
   *  props can rise toward the enclosure roof. */
  yRange(id: string): [number, number] {
    const mode = this.placementMode(id);
    if (mode === "floor") return [this.bounds.y, this.bounds.y];
    const roof = this.bounds.y + Math.max(0.15, this.state.layout.dimensions.height - 0.2);
    return [this.bounds.y, roof];
  }

  placementReason(defId: string, x: number, z: number): string | null {
    const base = placementIssue(this.world, x, z, this.footprintRadius(defId), this.blockers());
    if (base) return base;
    // Hanging/elevated props also need an attachment (top frame / wall / branch)
    // at the height they'll be placed — a vine can't float alone in mid-air.
    const def = findPlaceable(defId);
    if (def && (def.placement ?? "floor") !== "floor") {
      const probe = makePlaced(def, "__probe__", [x, this.defaultPlaceY(defId), z]);
      return hangingIssue(probe, this.state.layout, this.state.layout.dimensions);
    }
    return null;
  }

  /** Is moving an EXISTING prop to (x,z) allowed? Ignores its own (stale) volume in
   *  the current world; rejects landing on the gecko/feeders, and rejects leaving a
   *  hanging prop floating with no support. Bounds are already enforced by
   *  moveObject's clamp. */
  moveValid(id: string, x: number, z: number): boolean {
    const r = this.footprintRadius(id);
    for (const b of this.blockers()) {
      if (Math.hypot(x - b.x, z - b.z) < b.r + r * 0.5) return false;
    }
    const o = findObject(this.state.layout, id);
    if (o && (o.placement ?? "floor") !== "floor") {
      const probe = { ...o, position: [x, o.position[1], z] as Vec3 };
      if (hangingIssue(probe, this.state.layout, this.state.layout.dimensions)) return false;
    }
    return true;
  }

  /** Recolour the selection ring valid (cyan) or invalid (red) during a drag. */
  markSelectionValid(valid: boolean): void {
    if (!this.selectionRing) return;
    (this.selectionRing.material as THREE.MeshBasicMaterial).color.setHex(valid ? 0x67e8f0 : 0xff5a5a);
  }

  /** Show/clear a bright ground ring under the gecko (when the info card is open). */
  highlightAnimal(on: boolean): void {
    if (on) {
      if (!this.animalRing) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(GECKO_BODY_LENGTH * 0.7, GECKO_BODY_LENGTH * 0.85, 40),
          new THREE.MeshBasicMaterial({ color: 0xffd66b, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = 1002;
        this.animalRing = ring;
        this.scene.add(ring);
      }
      this.animalRing.visible = true;
    } else if (this.animalRing) {
      this.animalRing.visible = false;
    }
  }

  private summarize(o: PlacedObject): PlacedSummary {
    const toDeg = (r: number): number => {
      let d = Math.round(((r ?? 0) * 180) / Math.PI) % 360;
      if (d < 0) d += 360;
      return d;
    };
    const [sx, sy, sz] = o.scale;
    return {
      id: o.id,
      label: o.label ?? o.id,
      category: o.category,
      interaction: o.interaction ?? "blocked",
      x: o.position[0],
      y: o.position[1],
      z: o.position[2],
      placement: o.placement ?? "floor",
      rotX: toDeg(o.rotation[0]),
      rotY: toDeg(o.rotation[1]),
      rotZ: toDeg(o.rotation[2]),
      scaleX: sx,
      scaleY: sy,
      scaleZ: sz,
      uniform: Math.abs(sx - sy) < 1e-3 && Math.abs(sx - sz) < 1e-3,
    };
  }

  listObjects(): PlacedSummary[] {
    return this.state.layout.objects.map((o) => this.summarize(o));
  }

  getObject(id: string): PlacedSummary | null {
    const o = findObject(this.state.layout, id);
    return o ? this.summarize(o) : null;
  }

  pickTargets(): THREE.Object3D[] {
    return this.scene.children.filter((c) => typeof c.userData?.objectId === "string");
  }

  private viewFor(id: string): THREE.Object3D | undefined {
    return this.scene.children.find((c) => c.userData?.objectId === id);
  }

  /** Natural XZ footprint radius × object scale (from the measured footprint if
   *  loaded, else the authored hint) — used to size the ghost + validate overlap. */
  footprintRadius(defOrObjId: string): number {
    const o = findObject(this.state.layout, defOrObjId);
    if (o) {
      const fp = o.assetFootprint;
      const s = Math.max(o.scale[0], o.scale[2]);
      if (fp) return Math.max(fp.half[0], fp.half[2]) * s;
      if (o.collision?.halfExtents) return Math.max(o.collision.halfExtents[0], o.collision.halfExtents[2]) * s;
      if (o.collision?.radius != null) return o.collision.radius * s;
    }
    const def = findPlaceable(defOrObjId);
    if (def?.collision?.halfExtents) return Math.max(def.collision.halfExtents[0], def.collision.halfExtents[2]);
    if (def?.collision?.radius != null) return def.collision.radius;
    return 0.15;
  }

  /** The gecko + live feeders that a new prop mustn't be dropped on top of. */
  private blockers(): PlacementBlocker[] {
    const out: PlacementBlocker[] = [];
    const p = this.brain.position;
    out.push({ x: p.x, z: p.z, r: GECKO_MOVEMENT.bodyRadius });
    for (const f of this.state.feeders) if (f.alive) out.push({ x: f.position[0], z: f.position[2], r: 0.06 });
    return out;
  }

  validPlacement(defId: string, x: number, z: number): boolean {
    return canPlace(this.world, x, z, this.footprintRadius(defId), this.blockers());
  }

  addFromCatalog(defId: string, x: number, z: number): string | null {
    const def = findPlaceable(defId);
    if (!def || !this.validPlacement(defId, x, z)) return null;
    this.beginEdit();
    const id = uniqueObjectId(this.state.layout, defId);
    // Elevated/hanging props start lifted off the sand; floor props sit on it.
    // (defaultPlaceY is the same value the ghost previews at.)
    const obj = makePlaced(def, id, [x, this.defaultPlaceY(defId), z], 0);
    addObject(this.state.layout, obj);
    this.scene.add(buildPlaceholderObject(obj));
    this.rebuildWorld();
    this.persist();
    logHabitatEvent(this.state, `Placed a ${def.label.toLowerCase()}.`, "info");
    void this.loadObjectAsset(obj); // swap in the real GLB + tighten collision
    return id;
  }

  /** Load one object's GLB in the background, swap out its placeholder, and tighten
   *  collision to the measured footprint. Safe if the object was deleted meanwhile. */
  private async loadObjectAsset(o: PlacedObject): Promise<void> {
    const res = await loadDecorFor(o);
    if (!res) return;
    if (!findObject(this.state.layout, o.id)) {
      disposeObject(res.holder);
      return;
    }
    o.assetFootprint = res.footprint;
    swapInDecor(this.scene, o.id, res.holder);
    this.rebuildWorld();
    if (this.selectedId === o.id) this.updateSelectionRing();
  }

  moveObject(id: string, x: number, z: number): void {
    const o = findObject(this.state.layout, id);
    if (!o) return;
    const c = clampXZ(this.bounds, x, z);
    // Preserve the object's current height (floor props keep groundY; lifted props
    // keep their raised Y) — only XZ moves here.
    const y = o.position[1];
    o.position = [c.x, y, c.z];
    const v = this.viewFor(id);
    if (v) v.position.set(c.x, y, c.z);
    if (this.selectedId === id) this.updateSelectionRing();
  }

  /** Move an elevated/hanging prop up/down (floor props ignore Y). Clamped to yRange. */
  moveObjectY(id: string, y: number): void {
    const o = findObject(this.state.layout, id);
    if (!o) return;
    const [lo, hi] = this.yRange(id);
    const cy = Math.max(lo, Math.min(hi, y));
    o.position = [o.position[0], cy, o.position[2]];
    const v = this.viewFor(id);
    if (v) v.position.y = cy;
    if (this.selectedId === id) this.updateSelectionRing();
  }

  /** Live Euler rotation (degrees → radians), all three axes. */
  setRotationEuler(id: string, degX: number, degY: number, degZ: number): void {
    const o = findObject(this.state.layout, id);
    if (!o) return;
    const r = Math.PI / 180;
    o.rotation = [degX * r, degY * r, degZ * r];
    const v = this.viewFor(id);
    if (v) v.rotation.set(o.rotation[0], o.rotation[1], o.rotation[2]);
    if (this.selectedId === id) this.updateSelectionRing();
  }

  /** Live per-axis scale, clamped to the hard safety cap [0.05, 10]. */
  setScaleAxes(id: string, sx: number, sy: number, sz: number): void {
    const o = findObject(this.state.layout, id);
    if (!o) return;
    const cl = (s: number): number => Math.max(0.05, Math.min(10, s));
    o.scale = [cl(sx), cl(sy), cl(sz)];
    const v = this.viewFor(id);
    if (v) v.scale.set(o.scale[0], o.scale[1], o.scale[2]);
    if (this.selectedId === id) this.updateSelectionRing();
  }

  /** Change how the animal treats a prop (route around / climb / step over / soft).
   *  Rebuilds collision + nav immediately. */
  setInteraction(id: string, interaction: ObstacleInteraction): void {
    const o = findObject(this.state.layout, id);
    if (!o) return;
    this.beginEdit();
    o.interaction = interaction;
    if (interaction === "softObstacle") {
      o.collidable = false;
    } else {
      o.collidable = true;
      if (o.collisionType === "none") o.collisionType = "box";
    }
    this.rebuildWorld();
    this.persist();
  }

  resetTransform(id: string): void {
    const o = findObject(this.state.layout, id);
    if (!o) return;
    this.beginEdit();
    o.rotation = [0, 0, 0];
    o.scale = [1, 1, 1];
    const v = this.viewFor(id);
    if (v) {
      v.rotation.set(0, 0, 0);
      v.scale.set(1, 1, 1);
    }
    this.rebuildWorld();
    this.persist();
    if (this.selectedId === id) this.updateSelectionRing();
  }

  snapToFloor(id: string): void {
    const o = findObject(this.state.layout, id);
    if (!o) return;
    this.beginEdit();
    o.position = [o.position[0], this.bounds.y, o.position[2]];
    const v = this.viewFor(id);
    if (v) v.position.y = this.bounds.y;
    this.rebuildWorld();
    this.persist();
  }

  centerInHabitat(id: string): void {
    const o = findObject(this.state.layout, id);
    if (!o) return;
    this.beginEdit();
    const cx = (this.bounds.minX + this.bounds.maxX) / 2;
    const cz = (this.bounds.minZ + this.bounds.maxZ) / 2;
    o.position = [cx, this.bounds.y, cz];
    const v = this.viewFor(id);
    if (v) v.position.set(cx, this.bounds.y, cz);
    this.rebuildWorld();
    this.persist();
    if (this.selectedId === id) this.updateSelectionRing();
  }

  /** Commit a live move/rotate/scale gesture: rebuild collision + nav + score, save. */
  commit(): void {
    this.rebuildWorld();
    this.persist();
  }

  // ── Undo / redo (layout-object snapshots) ────────────────────────────────────
  private undoStack: string[] = [];
  private redoStack: string[] = [];

  private objectsSnapshot(): string {
    return JSON.stringify(this.state.layout.objects);
  }

  /** Snapshot the layout BEFORE a mutation (discrete ops call this internally; the
   *  editor calls it once at the start of a gizmo/slider gesture). */
  beginEdit(): void {
    this.undoStack.push(this.objectsSnapshot());
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack = [];
  }
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  undo(): void {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.objectsSnapshot());
    this.restoreObjects(this.undoStack.pop()!);
  }
  redo(): void {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.objectsSnapshot());
    this.restoreObjects(this.redoStack.pop()!);
  }

  private restoreObjects(json: string): void {
    const objs = JSON.parse(json) as PlacedObject[];
    for (const o of this.state.layout.objects) {
      const v = this.viewFor(o.id);
      if (v) {
        this.scene.remove(v);
        disposeObject(v);
      }
    }
    this.state.layout.objects = objs;
    this.highlight(null);
    for (const o of objs) this.scene.add(buildPlaceholderObject(o));
    this.rebuildWorld();
    this.persist();
    void loadTerrariumDecor(this.scene, this.state.layout).then(() => this.rebuildWorld());
  }

  removeObject(id: string): void {
    if (!findObject(this.state.layout, id)) return;
    this.beginEdit();
    const v = this.viewFor(id);
    if (v) {
      this.scene.remove(v);
      disposeObject(v);
    }
    layoutRemove(this.state.layout, id);
    if (this.selectedId === id) this.highlight(null);
    this.rebuildWorld();
    this.persist();
  }

  duplicateObject(id: string): string | null {
    if (!findObject(this.state.layout, id)) return null;
    this.beginEdit();
    const copy = layoutDuplicate(this.state.layout, id);
    if (!copy) return null;
    this.scene.add(buildPlaceholderObject(copy));
    this.rebuildWorld();
    this.persist();
    void this.loadObjectAsset(copy);
    return copy.id;
  }

  resetLayout(): void {
    this.beginEdit();
    const fresh = makeLizardHabitatLayout();
    const layout = this.state.layout;
    const oldIds = layout.objects.map((o) => o.id);
    for (const oid of oldIds) {
      const v = this.viewFor(oid);
      if (v) {
        this.scene.remove(v);
        disposeObject(v);
      }
    }
    layout.objects = fresh.objects;
    layout.equipment = fresh.equipment;
    layout.zones = fresh.zones;
    layout.substrate = fresh.substrate;
    for (const o of layout.objects) this.scene.add(buildPlaceholderObject(o));
    this.highlight(null);
    this.rebuildWorld();
    this.persist();
    logHabitatEvent(this.state, "Reset the terrarium to its authored layout.", "info");
    void loadTerrariumDecor(this.scene, layout).then(() => this.rebuildWorld());
  }

  // ── Selection highlight (a bright ground ring under the chosen prop) ─────────
  highlight(id: string | null): void {
    this.selectedId = id;
    if (!id) {
      if (this.selectionRing) this.selectionRing.visible = false;
      return;
    }
    this.ensureSelectionRing();
    this.updateSelectionRing();
  }

  private ensureSelectionRing(): void {
    if (this.selectionRing) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1.0, 44),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f0,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 1000;
    this.selectionRing = ring;
    this.scene.add(ring);
  }

  private updateSelectionRing(): void {
    if (!this.selectionRing || !this.selectedId) return;
    const o = findObject(this.state.layout, this.selectedId);
    if (!o) {
      this.selectionRing.visible = false;
      return;
    }
    const r = Math.max(0.16, this.footprintRadius(this.selectedId) + 0.07);
    this.selectionRing.scale.set(r, r, 1);
    this.selectionRing.position.set(o.position[0], this.bounds.y + 0.02, o.position[2]);
    this.selectionRing.visible = true;
  }

  dispose(): void {
    // Persist on the way out so re-entering resumes.
    try {
      this.persist();
    } catch {
      /* ignore */
    }
    this.animal?.dispose();
    this.feeders.dispose();
    this.isopods?.dispose();
    this.presentation.dispose();
    this.debug.dispose();
    this.geckoShadow?.dispose();
    for (const r of this.probeRings) {
      r.geometry.dispose();
      (r.material as THREE.Material).dispose();
    }
    for (const m of this.footMarkers) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    if (this.normalLines) {
      this.normalLines.geometry.dispose();
      (this.normalLines.material as THREE.Material).dispose();
    }
    if (this.animalRing) {
      this.animalRing.geometry.dispose();
      (this.animalRing.material as THREE.Material).dispose();
    }
    if (this.selectionRing) {
      this.selectionRing.geometry.dispose();
      (this.selectionRing.material as THREE.Material).dispose();
    }
    for (const s of this.decorShadowObjs) s.dispose();
    this.shell.dispose();
    disposeScene(this.scene);
  }
}

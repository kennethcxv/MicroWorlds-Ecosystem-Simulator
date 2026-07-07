/**
 * Loads the tank_spike GLB models for the experimental 3D tank and normalizes
 * them. Every load is fault-tolerant: a failed asset resolves to `null` so the
 * scene can substitute placeholder geometry instead of crashing.
 *
 * FISH NEED SPECIAL PREP. The supplied fish are Tripo meshes split into 8 colour
 * "chunks", and — critically — each chunk node sits at a *different* translation
 * (part_0 at z≈0.40, part_3 at z≈0.61, …). They do NOT share one local frame.
 * A body-deform shader that keys off each mesh's local position therefore moves
 * each chunk by a different amount and the fish visibly tears apart.
 *
 * Fix: `prepareFishBody` bakes every chunk's world transform into its geometry
 * (so all chunks live in ONE frame), recentres them, and merges them into a
 * SINGLE multi-material mesh. After this the whole fish is one continuous body
 * the wave can deform coherently — no part can drift away from another, because
 * there are no separate parts anymore.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const BASE = import.meta.env.BASE_URL || "/";
const DIR = `${BASE}assets/3d/tank_spike/`.replace(/\/{2,}/g, "/").replace(":/", "://");
const HAB_DIR = `${BASE}assets/3d/habitats/`.replace(/\/{2,}/g, "/").replace(":/", "://");
const TEX_DIR = `${BASE}assets/textures/`.replace(/\/{2,}/g, "/").replace(":/", "://");

export interface LoadedModel {
  /** Cloneable model, recentred so its bounding-box centre sits at the origin. */
  object: THREE.Group;
  /** Bounding-box size (after recentre, before any caller scaling). */
  size: THREE.Vector3;
}

export interface TankModels {
  fishSmall: LoadedModel | null;
  fishCenterpiece: LoadedModel | null;
  aquarium: LoadedModel | null;
  plant: LoadedModel | null;
  root: LoadedModel | null;
}

const FILES = {
  fishSmall: "fish_small.glb",
  fishCenterpiece: "fish_centerpiece.glb",
  aquarium: "aquarium.glb",
  plant: "plant_01.glb",
  root: "root_01.glb",
} as const;

/** Decor: recentre as-is (single fused meshes; no per-part deform needed). */
function recentre(scene: THREE.Group): LoadedModel {
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  scene.position.sub(center);
  const wrap = new THREE.Group();
  wrap.add(scene);
  return { object: wrap, size };
}

/**
 * Collapse any multi-mesh object into ONE coherent, recentred body mesh:
 *   1. bake each mesh's world matrix into a cloned geometry (unifies the frame),
 *   2. recentre all geometries on their shared bounding box,
 *   3. merge into a single multi-material mesh (or, if merge is unavailable,
 *      keep the baked geometries as siblings — still one shared frame).
 * Either way every vertex lives in the same frame, so a body-anchored wave can
 * never separate one region from another.
 */
export function unifyToBody(src: THREE.Object3D): LoadedModel {
  src.updateMatrixWorld(true);

  const geoms: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  src.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const g = onlyStandardAttributes(mesh.geometry.clone());
    g.applyMatrix4(mesh.matrixWorld); // bake into the shared frame
    geoms.push(g);
    materials.push(Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);
  });

  // Recentre all baked geometries on their combined bbox.
  const box = new THREE.Box3();
  for (const g of geoms) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  for (const g of geoms) g.translate(-center.x, -center.y, -center.z);

  const wrap = new THREE.Group();
  const merged = geoms.length ? mergeGeometries(geoms, true) : null;
  if (merged) {
    const mesh = new THREE.Mesh(merged, materials);
    mesh.frustumCulled = false; // deformed verts can exceed the rest bbox
    wrap.add(mesh);
  } else {
    // Fallback: separate meshes, but all in the unified frame (no tearing).
    geoms.forEach((g, i) => {
      const mesh = new THREE.Mesh(g, materials[i]);
      mesh.frustumCulled = false;
      wrap.add(mesh);
    });
  }
  return { object: wrap, size };
}

/** Keep only position/normal/uv so geometries merge cleanly. */
function onlyStandardAttributes(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const keep = new Set(["position", "normal", "uv"]);
  for (const name of Object.keys(g.attributes)) {
    if (!keep.has(name)) g.deleteAttribute(name);
  }
  g.morphAttributes = {};
  return g;
}

export async function loadTankModels(): Promise<TankModels> {
  const loader = new GLTFLoader();

  const loadScene = (file: string): Promise<THREE.Group | null> =>
    new Promise((resolve) => {
      loader.load(
        DIR + file,
        (gltf) => resolve(gltf.scene),
        undefined,
        (err) => {
          console.warn(`[3D tank] failed to load ${file}:`, err);
          resolve(null);
        },
      );
    });

  const [fishSmall, fishCenterpiece, aquarium, plant, root] = await Promise.all([
    loadScene(FILES.fishSmall),
    loadScene(FILES.fishCenterpiece),
    loadScene(FILES.aquarium),
    loadScene(FILES.plant),
    loadScene(FILES.root),
  ]);

  return {
    fishSmall: fishSmall ? unifyToBody(fishSmall) : null,
    fishCenterpiece: fishCenterpiece ? unifyToBody(fishCenterpiece) : null,
    aquarium: aquarium ? recentre(aquarium) : null,
    plant: plant ? recentre(plant) : null,
    root: root ? recentre(root) : null,
  };
}

/** Does a URL point at a REAL asset (not the Vite dev-server SPA HTML fallback)?
 *  The dev server answers unknown paths with `index.html` (200, text/html), so a
 *  bare `res.ok` is a false positive — reject text/html. Real binaries never are.
 *  In production a missing file 404s → false. */
export async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    return !ct.includes("text/html");
  } catch {
    return false;
  }
}

/** Check whether a habitat GLB is really present (e.g. the freelancer's final
 *  rig) without triggering a GLTF parse warning for a not-yet-delivered file. */
export async function habitatAssetExists(file: string): Promise<boolean> {
  return urlExists(HAB_DIR + file);
}

/** Runtime URL of a lizard-habitat texture (public/assets/textures/habitats/lizard/). */
export function lizardTextureUrl(name: string): string {
  return `${TEX_DIR}habitats/lizard/${name}`.replace(/\/{2,}/g, "/").replace(":/", "://");
}

/** Load a texture only if it really exists (else null → caller uses a procedural
 *  fallback). Avoids console noise for optional drop-in textures. */
export async function loadTextureIfExists(url: string): Promise<THREE.Texture | null> {
  if (!(await urlExists(url))) return null;
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (t) => resolve(t),
      undefined,
      () => resolve(null),
    );
  });
}

export interface DecorModel {
  /** Recentred on XZ with its base on the ground (min-Y → 0). */
  object: THREE.Group;
  /** Bounding-box size before any caller scaling. */
  size: THREE.Vector3;
}

/**
 * Load a terrarium decor GLB (rock / cave / driftwood / dish / plant) from
 * /assets/3d/habitats/, recentred horizontally with its base sitting on the
 * ground so the caller can drop it straight onto the substrate and uniform-scale
 * it to the object's collision footprint. Fault-tolerant → null (keep placeholder).
 */
export async function loadDecorModel(file: string): Promise<DecorModel | null> {
  const loader = new GLTFLoader();
  const scene = await new Promise<THREE.Group | null>((resolve) => {
    loader.load(
      HAB_DIR + file,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => {
        console.warn(`[3D habitat] failed to load decor ${file}:`, err);
        resolve(null);
      },
    );
  });
  if (!scene) return null;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((m as unknown as { isMesh?: boolean }).isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  scene.position.set(-center.x, -box.min.y, -center.z); // XZ-centre + base on ground
  const wrap = new THREE.Group();
  wrap.add(scene);
  return { object: wrap, size };
}

// One download + parse per decor file; every consumer gets a cheap CLONE (meshes
// cloned, geometry + materials shared). Placement, the editor's real-model ghost
// and the catalog thumbnails all draw from this cache.
const decorCache = new Map<string, Promise<DecorModel | null>>();

/** Cached variant of {@link loadDecorModel}: resolves to a fresh clone per call
 *  (safe to reparent/scale), or null on load failure (cached too — no retry spam). */
export async function loadDecorModelCached(file: string): Promise<DecorModel | null> {
  let p = decorCache.get(file);
  if (!p) {
    p = loadDecorModel(file);
    decorCache.set(file, p);
  }
  const master = await p;
  if (!master) return null;
  return { object: master.object.clone(true) as THREE.Group, size: master.size.clone() };
}

// The wooden cabinet under the fish tank doubles as the vivarium stand — one
// download, recentred, cloned per consumer.
let standCache: Promise<LoadedModel | null> | null = null;

/** Load the tank_spike cabinet GLB (recentred). Fault-tolerant → null. */
export async function loadStandModel(): Promise<LoadedModel | null> {
  if (!standCache) {
    const loader = new GLTFLoader();
    standCache = new Promise((resolve) => {
      loader.load(
        DIR + FILES.aquarium,
        (gltf) => resolve(recentre(gltf.scene)),
        undefined,
        (err) => {
          console.warn("[3D habitat] failed to load stand cabinet:", err);
          resolve(null);
        },
      );
    });
  }
  const master = await standCache;
  if (!master) return null;
  return { object: master.object.clone(true) as THREE.Group, size: master.size.clone() };
}

export interface RiggedModel {
  /** The skinned scene (SkinnedMesh + armature) — kept intact, NOT unified. */
  scene: THREE.Group;
  /** Animation clips baked into the GLB (e.g. "walk", "idle"). */
  clips: THREE.AnimationClip[];
  /** Bounding-box size. */
  size: THREE.Vector3;
  /** Lowest point in model space (feet); used to plant the model on the floor. */
  minY: number;
}

/**
 * Load a RIGGED habitat animal (skin + bones + baked clips) from
 * /assets/3d/habitats/. Unlike `loadAnimal`, this keeps the skeleton/skin so an
 * AnimationMixer can play the walk/idle clips. Fault-tolerant → null on failure.
 */
export async function loadRiggedAnimal(file: string): Promise<RiggedModel | null> {
  const loader = new GLTFLoader();
  return new Promise((resolve) => {
    loader.load(
      HAB_DIR + file,
      (gltf) => {
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if ((m as unknown as { isMesh?: boolean }).isMesh) m.frustumCulled = false;
        });
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        resolve({ scene: gltf.scene, clips: gltf.animations, size, minY: box.min.y });
      },
      undefined,
      (err) => {
        console.warn(`[3D habitat] failed to load rigged ${file}:`, err);
        resolve(null);
      },
    );
  });
}

/**
 * Load one habitat animal GLB (spider/lizard) from /assets/3d/habitats/ and
 * unify it into a single coherent body mesh (same fix as the fish — bakes any
 * multi-chunk/offset parts into one frame so nothing can detach). Fault-tolerant.
 */
export async function loadAnimal(file: string): Promise<LoadedModel | null> {
  const loader = new GLTFLoader();
  const scene = await new Promise<THREE.Group | null>((resolve) => {
    loader.load(
      HAB_DIR + file,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => {
        console.warn(`[3D habitat] failed to load ${file}:`, err);
        resolve(null);
      },
    );
  });
  return scene ? unifyToBody(scene) : null;
}

/** Simple tapered fish stand-in (head at +Z), unified into one body mesh so the
 *  wave deforms it coherently — used when a fish GLB fails to load. */
export function makePlaceholderFish(color: number): LoadedModel {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 14), mat);
  body.scale.set(0.4, 0.55, 1.0); // thin X, tall-ish Y, long Z
  group.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 12), mat);
  tail.rotation.x = -Math.PI / 2;
  tail.scale.set(1, 1, 0.25);
  tail.position.set(0, 0, -0.62);
  group.add(tail);
  return unifyToBody(group);
}

/** Generic placeholder for decor (plant/root/aquarium) on load failure. */
export function makePlaceholderBox(color: number, size: THREE.Vector3): LoadedModel {
  const wrap = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  wrap.add(mesh);
  return { object: wrap, size: size.clone() };
}

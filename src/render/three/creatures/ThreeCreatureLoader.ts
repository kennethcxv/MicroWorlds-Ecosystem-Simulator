/**
 * CREATURE LOADER — turns a registry entry + its part-separated Tripo GLB into
 * a ready-to-animate model:
 *
 *   1. loads + caches the GLB (one download/parse per species; instances clone),
 *   2. MEASURES every mesh part (bbox + tris) and resolves its anatomical role
 *      (spatial classifier + the registry's hand-authored overrides),
 *   3. RE-PIVOTS each animated part at its anatomical joint (a tail hinges at
 *      its front edge, a leg at its hip, an antenna at its base) so procedural
 *      rotation reads as articulation instead of parts orbiting their centres,
 *   4. normalizes the whole model: faces +Z, scaled to the registry's real
 *      bodyLength, origin at the belly (ground creatures) or the body centre
 *      (swimmers), materials tamed per the registry's config.
 *
 * The separated part hierarchy is PRESERVED (that is the entire point of the
 * self-made assets); nothing is merged.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ClassifiablePart, PartRole } from "../../../habitats/creatures/PartClassifier";
import type { CreatureId, CreatureSpecies } from "../../../data/creatures/CreatureTypes";
import { getCreature, resolvePartRoles } from "../../../data/creatures/creatureRegistry";

/** One animatable part: its joint-pivot group (fresh, rest = identity). */
export interface CreaturePart {
  role: PartRole;
  pivot: THREE.Object3D;
}

export interface CreatureModel {
  /** Ready-to-place instance root (fresh clone per call). */
  root: THREE.Group;
  parts: CreaturePart[];
  species: CreatureSpecies;
  /** Forward axis index (0 = x, 2 = z) + sign IN THE PART/MODEL FRAME — the
   *  animator needs it for along-body stretch/curl motions. */
  forwardAxis: 0 | 2;
  forwardSign: 1 | -1;
  /** World height of the normalized model (for labels/debug). */
  height: number;
  /** Body length in the parts' LOCAL (pre-scale) units — translational
   *  animation offsets are authored as fractions of this. */
  localLength: number;
}

const ROLE_NEEDS_PIVOT: Partial<Record<PartRole, true>> = {
  tail: true,
  tailFan: true,
  finTop: true,
  finBottom: true,
  finSideL: true,
  finSideR: true,
  legL: true,
  legR: true,
  legs: true,
  antennaL: true,
  antennaR: true,
  eyestalk: true,
  head: true,
};

interface Master {
  scene: THREE.Group;
  height: number;
  forwardAxis: 0 | 2;
  forwardSign: 1 | -1;
  localLength: number;
}

const masters = new Map<CreatureId, Promise<Master | null>>();
/** Masters that have RESOLVED (sync-clone seam for sync call sites). */
const resolvedMasters = new Map<CreatureId, Master | null>();

function masterPromise(id: CreatureId): Promise<Master | null> {
  let p = masters.get(id);
  if (!p) {
    p = buildMaster(id);
    masters.set(id, p);
    void p.then((m) => resolvedMasters.set(id, m));
  }
  return p;
}

function forwardInfo(f: CreatureSpecies["asset"]["forward"]): { axis: 0 | 2; sign: 1 | -1; yaw: number } {
  switch (f) {
    case "-z":
      return { axis: 2, sign: -1, yaw: Math.PI };
    case "+x":
      return { axis: 0, sign: 1, yaw: -Math.PI / 2 };
    case "-x":
      return { axis: 0, sign: -1, yaw: Math.PI / 2 };
    case "+z":
    default:
      return { axis: 2, sign: 1, yaw: 0 };
  }
}

/** Measure every mesh node of a (matrix-updated) scene in root space. */
function measureParts(scene: THREE.Object3D): { node: THREE.Mesh; info: ClassifiablePart; box: THREE.Box3 }[] {
  const out: { node: THREE.Mesh; info: ClassifiablePart; box: THREE.Box3 }[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const g = mesh.geometry;
    const tris = g.index ? g.index.count / 3 : (g.getAttribute("position")?.count ?? 0) / 3;
    out.push({
      node: mesh,
      box,
      info: {
        name: mesh.name || mesh.parent?.name || "part",
        center: [c.x, c.y, c.z],
        size: [s.x, s.y, s.z],
        tris: Math.round(tris),
      },
    });
  });
  return out;
}

/** Where a part physically attaches, from its role + measured box (root frame). */
function jointFor(
  role: PartRole,
  box: THREE.Box3,
  bodyCenter: THREE.Vector3,
  fwd: { axis: 0 | 2; sign: 1 | -1 },
): THREE.Vector3 {
  const c = box.getCenter(new THREE.Vector3());
  const j = c.clone();
  const axis = fwd.axis === 0 ? "x" : "z";
  const headward = (v: THREE.Box3): number => (fwd.sign > 0 ? v.max[axis] : v.min[axis]);
  const tailward = (v: THREE.Box3): number => (fwd.sign > 0 ? v.min[axis] : v.max[axis]);
  switch (role) {
    case "tail":
    case "tailFan":
      j[axis] = headward(box); // hinge at the body-side edge
      break;
    case "head":
      j[axis] = tailward(box);
      break;
    case "finTop":
      j.y = box.min.y;
      break;
    case "finBottom":
      j.y = box.max.y;
      break;
    case "finSideL":
    case "finSideR": {
      const side = fwd.axis === 0 ? "z" : "x";
      j[side] = Math.abs(box.min[side] - bodyCenter[side]) < Math.abs(box.max[side] - bodyCenter[side]) ? box.min[side] : box.max[side];
      break;
    }
    case "legL":
    case "legR":
    case "legs":
      j.y = box.max.y; // hip at the top of the leg
      break;
    case "antennaL":
    case "antennaR":
      // Base = the along-body edge nearest the body centre (front antennae
      // hinge at their rear, rear cerci hinge at their front).
      j[axis] = Math.abs(box.min[axis] - bodyCenter[axis]) < Math.abs(box.max[axis] - bodyCenter[axis]) ? box.min[axis] : box.max[axis];
      break;
    case "eyestalk":
      j.y = box.min.y;
      break;
    default:
      break;
  }
  return j;
}

async function buildMaster(id: CreatureId): Promise<Master | null> {
  const species = getCreature(id);
  const loader = new GLTFLoader();
  const gltf = await new Promise<THREE.Group | null>((resolve) => {
    loader.load(
      species.asset.path,
      (g) => resolve(g.scene),
      undefined,
      (err) => {
        console.warn(`[creatures] failed to load ${species.asset.path}:`, err);
        resolve(null);
      },
    );
  });
  if (!gltf) return null;

  gltf.updateMatrixWorld(true);
  const measured = measureParts(gltf);
  const roles = resolvePartRoles(
    id,
    measured.map((m) => m.info),
  );

  // Overall bounds + the main body part's centre (joint reference).
  const total = new THREE.Box3();
  for (const m of measured) total.union(m.box);
  let bodyCenter = total.getCenter(new THREE.Vector3());
  const mains = measured
    .filter((m) => ["body", "shell", "foot"].includes(roles[m.info.name] ?? ""))
    .sort((a, b) => b.info.tris - a.info.tris);
  if (mains.length) bodyCenter = mains[0].box.getCenter(new THREE.Vector3());

  const fwd = forwardInfo(species.asset.forward);

  // Materials: tame Tripo defaults per the registry config; keep textures.
  const matCfg = species.asset.material;
  const seen = new Set<THREE.Material>();
  gltf.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false; // tiny animated parts — skip per-part culling
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      const std = m as THREE.MeshStandardMaterial;
      if (matCfg?.roughness !== undefined) std.roughness = matCfg.roughness;
      if (matCfg?.metalness !== undefined) std.metalness = matCfg.metalness;
      if (matCfg?.opacity !== undefined && matCfg.opacity < 1) {
        std.transparent = true;
        std.opacity = matCfg.opacity;
        std.depthWrite = false;
      }
    }
  });

  // Re-pivot animated parts at their anatomical joints. attach() preserves the
  // node's world transform, so this is purely a pivot change.
  for (const m of measured) {
    const role = roles[m.info.name] ?? "static";
    if (!ROLE_NEEDS_PIVOT[role]) continue;
    const parent = m.node.parent ?? gltf;
    const pivot = new THREE.Group();
    pivot.userData.creatureRole = role;
    parent.add(pivot);
    pivot.position.copy(parent.worldToLocal(jointFor(role, m.box, bodyCenter, fwd)));
    pivot.updateMatrixWorld(true);
    pivot.attach(m.node);
  }
  // The main masses (body / shell / foot) animate too (bob, glide stretch) —
  // each pivots at its own centre so shared-role parts move as one.
  for (const m of mains) {
    const role = roles[m.info.name] as PartRole;
    const parent = m.node.parent ?? gltf;
    const pivot = new THREE.Group();
    pivot.userData.creatureRole = role;
    parent.add(pivot);
    pivot.position.copy(parent.worldToLocal(m.box.getCenter(new THREE.Vector3())));
    pivot.updateMatrixWorld(true);
    pivot.attach(m.node);
  }

  // Normalize: face +Z, scale to bodyLength, origin at belly/centre.
  const oriented = new THREE.Group();
  oriented.rotation.y = fwd.yaw;
  oriented.add(gltf);
  const wrap = new THREE.Group();
  wrap.add(oriented);
  wrap.updateMatrixWorld(true);
  const obox = new THREE.Box3().setFromObject(oriented);
  const length = Math.max(1e-6, obox.max.z - obox.min.z);
  const s = species.asset.bodyLength / length;
  oriented.scale.setScalar(s);
  wrap.updateMatrixWorld(true);
  const nbox = new THREE.Box3().setFromObject(oriented);
  const center = nbox.getCenter(new THREE.Vector3());
  if (species.asset.groundCreature) {
    oriented.position.set(-center.x, -nbox.min.y, -center.z);
  } else {
    oriented.position.set(-center.x, -center.y, -center.z);
  }
  if (species.asset.yOffset) oriented.position.y += species.asset.yOffset * species.asset.bodyLength;

  return {
    scene: wrap,
    height: nbox.max.y - nbox.min.y,
    forwardAxis: fwd.axis,
    forwardSign: fwd.sign,
    localLength: length,
  };
}

function instantiate(id: CreatureId, master: Master): CreatureModel {
  const root = master.scene.clone(true) as THREE.Group;
  const parts: CreaturePart[] = [];
  root.traverse((o) => {
    const role = o.userData?.creatureRole as PartRole | undefined;
    if (role) parts.push({ role, pivot: o });
  });
  return {
    root,
    parts,
    species: getCreature(id),
    forwardAxis: master.forwardAxis,
    forwardSign: master.forwardSign,
    height: master.height,
    localLength: master.localLength,
  };
}

/** Load (cached) + return a fresh instance of a creature model, or null when
 *  the GLB is missing/broken (callers keep placeholders / skip gracefully). */
export async function loadCreature(id: CreatureId): Promise<CreatureModel | null> {
  const master = await masterPromise(id);
  return master ? instantiate(id, master) : null;
}

/** Kick off (and await) master loads so later SYNC clones succeed. */
export async function preloadCreatures(ids: CreatureId[]): Promise<void> {
  await Promise.all(ids.map((id) => masterPromise(id)));
}

/** Fresh instance WITHOUT awaiting — null until the master has resolved (or
 *  when it failed). Sync call sites (the feeder-insect factory) use this and
 *  keep their procedural fallback. */
export function cloneCreatureSync(id: CreatureId): CreatureModel | null {
  const master = resolvedMasters.get(id);
  return master ? instantiate(id, master) : null;
}

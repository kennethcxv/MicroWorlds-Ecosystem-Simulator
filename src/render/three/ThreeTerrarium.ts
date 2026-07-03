/**
 * Builds a terrarium's Three.js meshes from a data-driven HabitatLayout:
 *   - the VIVARIUM SHELL (glass + frame + tray + back panel + stand + mounted
 *     lamp/UVB/gauges — see ThreeVivariumShell), sized entirely by the pure
 *     EnclosureSpec so every system shares the same tank,
 *   - a warm SAND FLOOR (tiling procedural texture + subtle dune displacement)
 *     with scattered stone chips,
 *   - a PLACEHOLDER mesh for every placed object (organic — rocks are low-poly
 *     rocks, not raw boxes/spheres).
 *
 * The placeholders show instantly (no pop-in, guaranteed fallback). Then
 * `loadTerrariumDecor` async-loads the real GLBs, uniform-scales each to its
 * object's collision footprint, and SWAPS OUT the matching placeholder. If a GLB
 * is missing or fails, its organic placeholder simply stays.
 */
import * as THREE from "three";
import type { AssetFootprint, HabitatLayout, PlacedObject, Vec2, Vec3 } from "../../habitats/HabitatTypes";
import {
  buildFloorField,
  buildHeightField,
  getFloorField,
  getHeightField,
  registerFloorField,
  registerHeightField,
  traceContours,
  traceFootprint,
  traceWallContours,
} from "../../habitats/HabitatFootprint";
import { enclosureSpec } from "../../habitats/EnclosureSpec";
import { buildVivariumShell, type VivariumShell } from "./ThreeVivariumShell";
import { DEFAULT_TERRAIN_ID, terrainById } from "../../data/terrains";
import { buildSandSurface, makeRockMesh, makeSandTexture, scatterPebbles } from "./ThreeSandTexture";
import { loadDecorModelCached } from "./ThreeAssetLoader";

const TAU = Math.PI * 2;

interface Size {
  hx: number;
  hy: number;
  hz: number;
  r: number;
  len: number;
}

/**
 * NATURAL half-extents of an object at scale 1 (the object's `scale` is applied to
 * the whole group, not baked in here — so the editor can rescale live and collision
 * follows). Source of truth, in order: the MEASURED asset footprint (tight, from the
 * real GLB) → the authored collision guess → a small fallback for bare decor.
 */
function sizeOf(o: PlacedObject): Size {
  const fp = o.assetFootprint;
  if (fp) {
    return { hx: fp.half[0], hy: fp.half[1], hz: fp.half[2], r: Math.max(fp.half[0], fp.half[2]), len: 0 };
  }
  const c = o.collision;
  if (c?.halfExtents) {
    return { hx: c.halfExtents[0], hy: c.halfExtents[1], hz: c.halfExtents[2], r: Math.max(c.halfExtents[0], c.halfExtents[2]), len: c.length ?? 0 };
  }
  if (c?.radius != null) {
    return { hx: c.radius, hy: c.radius, hz: c.radius, r: c.radius, len: c.length ?? 0 };
  }
  return { hx: 0.12, hy: 0.12, hz: 0.12, r: 0.12, len: 0 };
}

/** Preferred solver primitive for a measured footprint (round props → circle). */
function footprintShape(o: PlacedObject): AssetFootprint["shape"] {
  return o.collisionType === "sphere" ? "circle" : "obb";
}

/** Sample a model's vertices projected onto the XZ floor plane (local, natural
 *  size) — the raw point cloud HabitatFootprint traces a hull / multi-part
 *  decomposition from. Caps at ~2000 verts/mesh so tracing stays cheap. */
function sampleMeshXZ(wrap: THREE.Object3D): Vec2[] {
  wrap.updateMatrixWorld(true);
  const pts: Vec2[] = [];
  const v = new THREE.Vector3();
  wrap.traverse((o) => {
    const m = o as THREE.Mesh;
    const geo = m.geometry as THREE.BufferGeometry | undefined;
    if (!(m as unknown as { isMesh?: boolean }).isMesh || !geo?.attributes?.position) return;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const step = Math.max(1, Math.floor(pos.count / 2000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      pts.push([v.x, v.z]);
    }
  });
  return pts;
}

/** Sample a model's TRIANGLES in its local frame at natural display size — full
 *  3D vertices. The XZ projection feeds HabitatFootprint.traceContours (exact
 *  silhouette); the Y values feed buildHeightField (exact per-point surface
 *  heights + undersides). Handles indexed + non-indexed geometry; caps at
 *  `capTris`/mesh so measuring stays cheap (done once per asset at load).
 *  Pass Infinity for meshes whose THIN features matter (hide walls):
 *  every-Nth-triangle decimation shreds a thin band into specks. */
function sampleMeshTriangles3D(wrap: THREE.Object3D, capTris = 4000): Vec3[][] {
  wrap.updateMatrixWorld(true);
  const tris: Vec3[][] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  wrap.traverse((o) => {
    const m = o as THREE.Mesh;
    const geo = m.geometry as THREE.BufferGeometry | undefined;
    if (!(m as unknown as { isMesh?: boolean }).isMesh || !geo?.attributes?.position) return;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const index = geo.index;
    const triCount = Math.floor((index ? index.count : pos.count) / 3);
    const step = Math.max(1, Number.isFinite(capTris) ? Math.floor(triCount / capTris) : 1);
    for (let t = 0; t < triCount; t += step) {
      const base = t * 3;
      const i0 = index ? index.getX(base) : base;
      const i1 = index ? index.getX(base + 1) : base + 1;
      const i2 = index ? index.getX(base + 2) : base + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld);
      tris.push([
        [a.x, a.y, a.z],
        [b.x, b.y, b.z],
        [c.x, c.y, c.z],
      ]);
    }
  });
  return tris;
}

/** Apply a placed object's world transform to its visual group. Scale is applied at
 *  the GROUP level so a live editor rescale needs no mesh rebuild. */
function applyTransform(g: THREE.Object3D, o: PlacedObject): void {
  g.position.set(o.position[0], o.position[1], o.position[2]);
  g.rotation.y = o.rotation[1] ?? 0;
  g.scale.set(o.scale[0], o.scale[1], o.scale[2]);
}

/** A placeholder mesh whose LOCAL origin is at ground contact (base at y=0), built
 *  at natural size; the object's `scale` is applied to the group. */
export function buildPlaceholderObject(o: PlacedObject): THREE.Object3D {
  const s = sizeOf(o);
  const color = o.color ?? 0x8a7d68;
  const g = new THREE.Group();

  // Rocks get an organic low-poly rock (never a raw box/sphere), sized to footprint.
  if (o.category === "rock") {
    const rock = makeRockMesh(Math.max(s.hx, s.hz, s.r, 0.05), color, Math.random);
    g.add(rock);
  } else {
    buildShapePlaceholder(g, o, s, color);
  }

  applyTransform(g, o);
  g.userData.placeholder = true;
  g.userData.objectId = o.id;
  return g;
}

function buildShapePlaceholder(g: THREE.Group, o: PlacedObject, s: Size, color: number): void {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.02 });
  switch (o.shape) {
    case "sphere": {
      if (o.category === "plant") {
        // Succulent rosette — a cluster of little cones.
        const green = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
        const n = 7;
        for (let i = 0; i < n; i++) {
          const leaf = new THREE.Mesh(new THREE.ConeGeometry(s.r * 0.28, s.hy * 2.0, 6), green);
          const a = (i / n) * TAU;
          leaf.position.set(Math.cos(a) * s.r * 0.4, s.hy * 0.6, Math.sin(a) * s.r * 0.4);
          leaf.rotation.set(Math.PI * 0.12 * Math.cos(a), 0, Math.PI * 0.12 * Math.sin(a));
          g.add(leaf);
        }
      } else {
        const m = new THREE.Mesh(new THREE.SphereGeometry(s.r, 16, 12), mat);
        m.scale.y = (s.hy || s.r) / s.r;
        m.position.y = s.hy || s.r;
        g.add(m);
      }
      break;
    }
    case "cave": {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1, 18, 10, 0, TAU, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color, roughness: 0.95 }),
      );
      dome.scale.set(s.hx, s.hy * 2, s.hz);
      g.add(dome);
      const mouth = new THREE.Mesh(
        new THREE.CircleGeometry(Math.min(s.hx, s.hy) * 0.6, 14),
        new THREE.MeshBasicMaterial({ color: 0x0b0a08 }),
      );
      mouth.position.set(0, s.hy * 0.7, s.hz * 0.98);
      g.add(mouth);
      break;
    }
    case "branch": {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(s.r * 0.8 || s.hx * 0.6, s.r || s.hx * 0.8, s.len || s.hy * 2, 10),
        new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
      );
      log.rotation.x = Math.PI / 2;
      log.position.y = s.r || s.hy;
      log.rotation.z = 0.06;
      g.add(log);
      break;
    }
    case "dish": {
      const isWater = o.id.includes("water");
      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(s.r, s.r * 0.8, s.hy * 1.4 || 0.05, 18),
        new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
      );
      bowl.position.y = (s.hy * 1.4 || 0.05) / 2;
      g.add(bowl);
      const fill = new THREE.Mesh(
        new THREE.CircleGeometry(s.r * 0.82, 18),
        new THREE.MeshStandardMaterial({
          color: isWater ? 0x2f7e82 : 0x6b4a2a,
          roughness: isWater ? 0.15 : 0.9,
          metalness: isWater ? 0.1 : 0,
          transparent: isWater,
          opacity: isWater ? 0.85 : 1,
        }),
      );
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = (s.hy * 1.4 || 0.05) * 0.9;
      g.add(fill);
      break;
    }
    default: {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.hx * 2, s.hy * 2, s.hz * 2), mat);
      m.position.y = s.hy;
      g.add(m);
      break;
    }
  }
}

export function buildTerrarium(scene: THREE.Scene, layout: HabitatLayout): VivariumShell {
  // The shell (glass/frame/tray/back panel/stand + mounted lamp/UVB/gauges) is
  // built ENTIRELY from the derived EnclosureSpec — the one source every other
  // system (bounds, placement, terrain, camera) also reads.
  const spec = enclosureSpec(layout.dimensions);
  const lamp = layout.equipment.find((e) => e.kind === "heat_lamp");
  // The APPLIED terrain material (Terrain Mode → Materials) skins the floor and
  // tints the bedrock/skirt, so a saved Desert Clay habitat reloads clay-coloured.
  const applied = terrainById(layout.substrate.terrainId ?? "") ?? terrainById(DEFAULT_TERRAIN_ID);
  const shell = buildVivariumShell(scene, spec, {
    substrateColor: applied?.color ?? layout.substrate.color,
    lampAnchor: lamp
      ? { x: lamp.target?.[0] ?? lamp.position[0], z: lamp.target?.[2] ?? lamp.position[2] }
      : null,
    uvb: layout.equipment.some((e) => e.kind === "uvb_lamp"),
    gauges: layout.equipment
      .filter((e) => e.kind === "thermometer" || e.kind === "hygrometer")
      .map((e) => ({ x: e.position[0], y: e.position[1], z: e.position[2] })),
  });

  // Substrate floor + scattered stone chips (footprint from the same spec).
  const sand = buildSandSurface(layout.dimensions, makeSandTexture(256, applied?.palette), 1.05, spec.sandInset);
  scene.add(sand);
  scene.add(scatterPebbles(layout.dimensions));

  for (const o of layout.objects) scene.add(buildPlaceholderObject(o));
  return shell;
}

export interface LoadedDecor {
  /** The transformed decor group (base on the substrate, at the object's pose). */
  holder: THREE.Object3D;
  /** Footprint MEASURED from the fitted mesh, at natural size (object scale = 1). */
  footprint: AssetFootprint;
}

/**
 * Load one object's real GLB, uniform-scale it to its natural DISPLAY size (max XZ
 * for solids, height for plants — from the authored size hint, NOT re-fit to a
 * collision guess), place + pose it, and MEASURE its true local bounding box → a
 * tight `AssetFootprint`. The caller writes that footprint back onto the object so
 * collision hugs the visible mesh. Fault-tolerant → null (keep the placeholder).
 */
/** Uniform display scale that fits a loaded decor model to an object's authored
 *  display-size hint — plants fit by height, solids by max XZ. The SAME rule sizes
 *  real placement, the editor's ghost preview, and any future use, so the preview
 *  is exactly what gets placed. */
export function displayScaleFor(o: PlacedObject, modelSize: { x: number; y: number; z: number }): number {
  const s = sizeOf(o);
  return o.category === "plant"
    ? (s.hy * 2) / Math.max(1e-3, modelSize.y)
    : (2 * Math.max(s.hx, s.hz)) / Math.max(1e-3, Math.max(modelSize.x, modelSize.z));
}

export async function loadDecorFor(o: PlacedObject): Promise<LoadedDecor | null> {
  if (!o.asset) return null;
  const model = await loadDecorModelCached(o.asset);
  if (!model) return null;
  const wrap = model.object; // base at y=0, XZ-centred
  const scale = displayScaleFor(o, model.size);
  wrap.scale.setScalar(scale);
  wrap.updateMatrixWorld(true);

  // Measure the fitted mesh's tight local bounds (before the object's own scale).
  const box = new THREE.Box3().setFromObject(wrap);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const footprint: AssetFootprint = {
    half: [size.x / 2, size.y / 2, size.z / 2],
    center: [center.x, center.y, center.z],
    shape: footprintShape(o),
  };
  // TRUE SILHOUETTE: rasterise the filled mesh triangles + marching-squares → tight
  // contour loop(s) that trace the REAL outline (every bump; gaps between branches
  // stay open; round dishes trace their true rim, not a generic cylinder). This is
  // the single source collision + the debug overlay both consume.
  // HIDES trace only their WALL BAND (material at body height): the exterior
  // is a closed collision ring exactly matching the visible rock; the mouth +
  // interior pocket are the only open space. Everything else keeps the full
  // silhouette trace. Hides sample UNDECIMATED: the wall band is thin, and
  // every-Nth-triangle sampling shreds it into specks the animal walks through.
  const isHide = o.category === "hide" || o.interaction === "hide";
  const tris3 = sampleMeshTriangles3D(wrap, isHide ? Infinity : 4000);
  const wallLoops = isHide ? traceWallContours(tris3, 128) : [];
  const contours =
    wallLoops.length > 0 ? wallLoops : traceContours(tris3.map((t) => t.map(([x, , z]) => [x, z] as Vec2)), 128);
  if (contours.length > 0) footprint.contours = contours;
  // SURFACE HEIGHTFIELD: the same triangles' Y values → per-point top + underside
  // heights, registered once per GLB file. Collision walk-height queries + the
  // debug overlay sample it, so a sloped rock is low on its low side and the empty
  // span under an arched branch is walked UNDER, not levitated onto.
  if (!getHeightField(o.asset)) {
    const hf = buildHeightField(tris3, 112);
    if (hf) registerHeightField(o.asset, hf);
  }
  // HIDES: also measure the INTERIOR FLOOR (floor plate + entrance sill) from
  // the mesh's low, upward-facing triangles — the roof covers the pocket in
  // plan, so the main field alone would make the animal sink through the floor.
  if ((o.category === "hide" || o.interaction === "hide") && !getFloorField(o.asset)) {
    const ff = buildFloorField(tris3, 112);
    if (ff) registerFloorField(o.asset, ff);
  }
  // Keep the convex hull / multi-part decomposition as a cheap fallback for any prop
  // whose triangles didn't trace (degenerate / point-only meshes).
  if (footprint.shape === "obb") {
    const trace = traceFootprint(sampleMeshXZ(wrap));
    if (trace.hull.length >= 3) footprint.hull = trace.hull;
    if (trace.parts.length > 0) footprint.parts = trace.parts;
  }

  const holder = new THREE.Group();
  holder.add(wrap);
  applyTransform(holder, o);
  holder.userData.decor = true;
  holder.userData.objectId = o.id;
  return { holder, footprint };
}

/** Remove whatever visual currently represents `id` (placeholder or old decor) and
 *  add the new holder in its place. */
export function swapInDecor(scene: THREE.Scene, id: string, holder: THREE.Object3D): void {
  const prev = scene.children.find((c) => c.userData?.objectId === id);
  if (prev) {
    scene.remove(prev);
    disposeObject(prev);
  }
  scene.add(holder);
}

/** Async-load every object's real GLB, MEASURE a tight footprint (written back onto
 *  the object so collision matches the mesh), and swap it in for the placeholder.
 *  Keeps the placeholder on any per-asset failure. Resolves when all settle. */
export async function loadTerrariumDecor(scene: THREE.Scene, layout: HabitatLayout): Promise<void> {
  const jobs = layout.objects
    .filter((o) => o.asset)
    .map(async (o) => {
      const res = await loadDecorFor(o);
      if (!res) return; // keep the placeholder
      o.assetFootprint = res.footprint; // tighten collision to the real mesh
      swapInDecor(scene, o.id, res.holder);
    });
  await Promise.all(jobs);
}

/** Re-tint the vivarium's bedrock + sand-skirt (one shared material, tagged by
 *  the shell) to a newly applied substrate's colour — dug holes keep matching. */
export function retintSubstrateBed(scene: THREE.Scene, color: number): void {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.userData?.substrateBed && m.material) {
      (m.material as THREE.MeshStandardMaterial).color.set(color);
    }
  });
}

/** Swap the sand floor's texture map (e.g. for a real dropped-in PNG). */
export function swapSandTexture(scene: THREE.Scene, tex: THREE.Texture): void {
  const sand = scene.children.find((c) => c.userData?.sand) as THREE.Mesh | undefined;
  if (!sand) return;
  const mat = sand.material as THREE.MeshStandardMaterial;
  const prev = mat.map;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (prev) tex.repeat.copy(prev.repeat);
  mat.map = tex;
  mat.needsUpdate = true;
  if (prev) prev.dispose();
}

/** Dispose a subtree's geometries + materials (used when swapping placeholders). */
export function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((m as unknown as { isMesh?: boolean }).isMesh) {
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) mat?.dispose();
    }
  });
}

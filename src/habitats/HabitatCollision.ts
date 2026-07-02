/**
 * GLASSWATER — pure top-down collision / obstacle system for habitat animals.
 *
 * The animal walks on the flat substrate, so collision is solved in 2D on the XZ
 * plane: the animal is a circle (its body radius) and each collidable object
 * compiles to ONE practical volume — a circle, an oriented box (OBB), or a
 * capsule/segment (for logs & branches). This is deliberately NOT full physics:
 * "practical collision volumes", exactly as the brief asks.
 *
 * The core guarantee: `resolve()` never returns a position that overlaps an
 * obstacle or leaves the bounds. It works by pushing the animal's circle out of
 * every volume it penetrates (a few relaxation passes for corners/multi-contact)
 * and re-clamping to the walls. Because the push is along the surface normal, the
 * tangential part of the motion survives — i.e. the animal SLIDES along rocks and
 * glass instead of sticking or tunnelling. Slow animal + small timestep ⇒ no
 * tunnelling.
 *
 * No Three.js / DOM imports — this is unit-tested directly (see tests/collision).
 */
import type { AssetFootprint, BodyProbe, ObjectCategory, ObstacleInteraction, PlacedObject, HabitatLayout, Vec3 } from "./HabitatTypes";
import { getFloorField, getHeightField, sampleHeightField, type FootprintHeightField } from "./HabitatFootprint";
import {
  type GroundBounds,
  type Rng,
  clampXZ,
  containsXZ,
  randomPointInBounds,
} from "./HabitatBounds";

/**
 * The mesh-measured surface heightfield of one compiled obstacle + the transform
 * that maps a WORLD point back into the field's LOCAL frame (position + yaw +
 * per-axis scale — the same transform the renderer applies to the mesh). With
 * this, walk-height queries return the prop's TRUE height at every point (a
 * sloped rock is low on its low side), and its true UNDERSIDE (an elevated
 * branch span can be walked under). Absent ⇒ the prop-wide flat top is used.
 */
export interface SurfaceRef {
  field: FootprintHeightField;
  /** A hide's INTERIOR-FLOOR field (upward-facing low surfaces only) — the
   *  roof covers the pocket in plan, so the main field can't see the floor. */
  floor?: FootprintHeightField;
  px: number;
  py: number;
  pz: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
}

/**
 * A LIVE ground-height source — the sculpted terrain. `heightAt` returns the
 * OFFSET from the flat substrate (bounds.y) at world (x,z); `slopeAt` its slope
 * angle (radians, optional — derived by finite differences when absent). The
 * world READS it per query, so a brush stroke changes walk heights, navigation,
 * placement and feeding instantly with no rebuild.
 */
export interface GroundSource {
  heightAt(x: number, z: number): number;
  slopeAt?(x: number, z: number): number;
}

/** Steepest bare-terrain slope the animal will walk (radians ≈ 40°). Climbable
 *  PROPS are exempt — climbing steep wood is what "climbable" means. */
export const MAX_WALK_SLOPE = 0.7;

/**
 * Everything one surface query answers: what exactly is under this point. The
 * foot-contact system, body orientation, debug markers and placement checks all
 * read this instead of re-deriving it.
 */
export interface SurfaceSample {
  /** World Y an animal stands at here (terrain, or a passable prop's surface). */
  y: number;
  /** Unit surface normal (+Y up). */
  normal: Vec3;
  /** Slope angle of the standing surface (radians from horizontal). */
  slope: number;
  /** What the surface is: flat sand, sculpted sand, or a prop's category. */
  type: "substrate" | "terrain" | ObjectCategory;
  /** The prop being stood on, if any. */
  objectId: string | null;
  interaction: ObstacleInteraction | null;
  /** In bounds, not inside a hard obstacle, not too steep. */
  walkable: boolean;
  /** Standing on a passable (climbable / low) prop. */
  climbable: boolean;
  /** Bare terrain steeper than {@link MAX_WALK_SLOPE}. */
  tooSteep: boolean;
  /** True when the surface came from a prop WITHOUT height data (flat top). */
  fallback: boolean;
}

/** Fields every compiled volume carries about how the animal treats it. */
interface ObstacleMeta {
  id: string;
  category: ObjectCategory;
  top: number; // world Y of the top (debug viz / climb height)
  base: number; // world Y of the object's origin (for climb height)
  /** World Y of the volume's UNDERSIDE — used to ignore OVERHEAD props (hanging
   *  vines/lamps) for ground movement: a prop whose underside is above the animal's
   *  head doesn't block the floor, but a low-hanging one does. */
  bottom: number;
  interaction: ObstacleInteraction;
  /** True ⇒ the animal may cross it (climb over / step over): it does NOT hard-
   *  block movement; instead it raises the walk height. False ⇒ route around. */
  passable: boolean;
  /** Bounding circle (world XZ), precomputed by CollisionWorld — a cheap reject
   *  before exact edge math (an exact-contour poly can carry dozens of edges). */
  bc?: { cx: number; cz: number; r: number };
  /** Mesh-measured per-point surface heights (see {@link SurfaceRef}). */
  hf?: SurfaceRef;
}

/** How far above the substrate a prop's underside may be before it stops blocking
 *  ground movement (a leopard gecko stands well under this). */
export const OVERHEAD_CLEARANCE = 0.2;

/** Per-POINT pass-under clearance: where a climbable prop's measured underside is
 *  this far above the animal's current standing height, that span is OVERHEAD —
 *  the animal walks beneath it instead of levitating onto it (an arched branch's
 *  elevated middle). Roughly the gecko's standing back height + a little. */
export const PASS_UNDER_CLEARANCE = 0.1;

/** A "climbable" volume whose top rises more than this above the floor is too
 *  tall to mantle gracefully — the animal ROUTES AROUND it instead of trying
 *  (compiled as hard at world construction). The driftwood (~0.18 m) stays
 *  climbable; boulder-height rock sections do not. For mesh-measured props the
 *  decision uses the heightfield's TRUE max surface height, not the bounding
 *  box (a branch with tall twig tips is judged by where the animal can stand). */
export const MAX_CLIMB_HEIGHT = 0.22;

/** A HIDE's measured interior floor may sit a little above the sand (the cave
 *  model's base plate / entrance sill). The dedicated floor field only ever
 *  contains low upward-facing surfaces; this cap is a safety net so nothing
 *  wall-height can sneak in and levitate the animal. */
export const HIDE_FLOOR_MAX = 0.1;

const FIELD_STATS_CACHE = new WeakMap<FootprintHeightField, { max: number; lowFrac: (capLocal: number) => number }>();

/** Cached surface stats of a heightfield: max height + the fraction of covered
 *  cells at/below a local height cap (how much of the prop is actually low). */
function fieldStats(f: FootprintHeightField): { max: number; lowFrac: (capLocal: number) => number } {
  let s = FIELD_STATS_CACHE.get(f);
  if (!s) {
    let max = 0;
    const vals: number[] = [];
    for (const v of f.top) {
      if (!Number.isFinite(v)) continue;
      vals.push(v);
      if (v > max) max = v;
    }
    s = {
      max,
      lowFrac: (capLocal: number) => {
        if (vals.length === 0) return 1;
        let low = 0;
        for (const v of vals) if (v <= capLocal) low++;
        return low / vals.length;
      },
    };
    FIELD_STATS_CACHE.set(f, s);
  }
  return s;
}

// ── Compiled solver volumes (world-space, XZ footprint + top height) ──────────
export interface CircleObstacle extends ObstacleMeta {
  shape: "circle";
  cx: number;
  cz: number;
  r: number;
}
export interface BoxObstacle extends ObstacleMeta {
  shape: "obb";
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  yaw: number;
}
export interface SegmentObstacle extends ObstacleMeta {
  shape: "segment";
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  r: number;
}
/** A tight convex polygon (world XZ) tracing the visible mesh outline. */
export interface HullObstacle extends ObstacleMeta {
  shape: "hull";
  pts: { x: number; z: number }[];
  cx: number;
  cz: number;
  top: number;
}
/**
 * A CONCAVE-capable polygon (world XZ) tracing the EXACT asset silhouette — one loop
 * of a marching-squares contour. Unlike `hull` it may be non-convex (it follows real
 * bumps + notches), so its inside-test is a ray cast, not a convex sign test. This is
 * the accurate footprint: the same points feed collision AND the debug overlay.
 */
export interface PolyObstacle extends ObstacleMeta {
  shape: "poly";
  pts: { x: number; z: number }[];
  cx: number;
  cz: number;
  top: number;
}
export type SolidObstacle = CircleObstacle | BoxObstacle | SegmentObstacle | HullObstacle | PolyObstacle;

/** Default interaction from an object's category when it doesn't specify one. */
export function defaultInteraction(category: ObjectCategory): ObstacleInteraction {
  switch (category) {
    case "hide":
      return "hide";
    case "branch":
      return "climbable";
    case "plant":
      return "softObstacle";
    case "dish":
      return "blocked";
    case "rock":
    case "decor":
    case "substrate_feature":
    default:
      return "blocked";
  }
}

/** Interactions the animal can cross rather than route around. */
export function isPassableInteraction(i: ObstacleInteraction): boolean {
  return i === "climbable" || i === "lowObstacle";
}

// Defaults (LOCAL, before scale) when an object omits explicit `collision` sizing.
const DEFAULT_HALF: Vec3 = [0.5, 0.5, 0.5];
const DEFAULT_RADIUS = 0.5;
const DEFAULT_LENGTH = 1;

function rotY(x: number, z: number, yaw: number): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // local → world (Three.js Euler-Y): wx = c*x + s*z, wz = -s*x + c*z
  return { x: c * x + s * z, z: -s * x + c * z };
}

/**
 * Rotate a LOCAL point by a full Euler rotation in THREE's default 'XYZ' order —
 * MUST match `object.rotation.set(rx,ry,rz)` in the renderer so tilted-prop
 * collision lines up with the tilted mesh. Returns [wx, wy, wz]; wx/wz feed the XZ
 * footprint, wy feeds the top (climb) height.
 */
function rotEulerXYZ(x: number, y: number, z: number, rx: number, ry: number, rz: number): Vec3 {
  const a = Math.cos(rx);
  const b = Math.sin(rx);
  const c = Math.cos(ry);
  const d = Math.sin(ry);
  const e = Math.cos(rz);
  const f = Math.sin(rz);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  const wx = c * e * x - c * f * y + d * z;
  const wy = (af + be * d) * x + (ae - bf * d) * y - b * c * z;
  const wz = (bf - ae * d) * x + (be + af * d) * y + a * c * z;
  return [wx, wy, wz];
}

/** Project an asset footprint's 8 scaled + Euler-rotated corners to XZ → a world-
 *  aligned footprint (centre offset, half-extents) + the highest corner (top). Used
 *  for advanced X/Z tilt, where a yaw-only OBB can't represent the tilted mesh. */
function projectFootprint(
  fp: AssetFootprint,
  scale: Vec3,
  rx: number,
  ry: number,
  rz: number,
): { cx: number; cz: number; hx: number; hz: number; top: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    const lx = (fp.center[0] + (i & 1 ? fp.half[0] : -fp.half[0])) * scale[0];
    const ly = (fp.center[1] + (i & 2 ? fp.half[1] : -fp.half[1])) * scale[1];
    const lz = (fp.center[2] + (i & 4 ? fp.half[2] : -fp.half[2])) * scale[2];
    const [wx, wy, wz] = rotEulerXYZ(lx, ly, lz, rx, ry, rz);
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wz < minZ) minZ = wz;
    if (wz > maxZ) maxZ = wz;
    if (wy > maxY) maxY = wy;
  }
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, hx: (maxX - minX) / 2, hz: (maxZ - minZ) / 2, top: maxY };
}

/**
 * Compile one placed object into ALL its solver volumes. Most props → a single
 * volume; a CONCAVE / branching prop with a measured multi-part footprint → one
 * tight OBB per branch (so the empty gaps between branches stay open). Returns []
 * if the object doesn't block.
 */
export function compileObject(o: PlacedObject): SolidObstacle[] {
  if (!o.collidable || o.collisionType === "none") return [];
  const interaction = o.interaction ?? defaultInteraction(o.category);
  // Soft obstacles (small plants) and feeder ZONES don't get a solver volume — a
  // minor overlap with soft decor is tolerated, and a feeding zone is a valid area,
  // not an obstacle. Both stay visual-only.
  if (interaction === "softObstacle" || interaction === "feederZone") return [];
  const [px, py, pz] = o.position;
  const [sx, sy, sz] = o.scale;
  const yaw = o.rotation[1] ?? 0;
  const off = o.collision?.offset ?? [0, 0, 0];
  const worldOff = rotY(off[0] * sx, off[2] * sz, yaw);
  const cx = px + worldOff.x;
  const cz = pz + worldOff.z;
  const fp = o.assetFootprint;
  const bottom = py + (fp ? (fp.center[1] - fp.half[1]) * sy : (off[1] ?? 0) * sy);
  const meta = {
    id: o.id,
    category: o.category,
    base: py,
    bottom,
    interaction,
    passable: isPassableInteraction(interaction),
    hf: undefined as SurfaceRef | undefined,
  };

  // Prefer a TIGHT, MEASURED footprint (from the real GLB) over the authored guess.
  // This is what makes collision hug the visible mesh and follow scale/rotation.
  if (fp) {
    const rx = o.rotation[0] ?? 0;
    const rz = o.rotation[2] ?? 0;
    const untilted = Math.abs(rx) < 1e-4 && Math.abs(rz) < 1e-4;
    const top = py + (fp.center[1] + fp.half[1]) * sy;
    if (untilted) {
      // Mesh-measured PER-POINT surface heights (registered per asset file at GLB
      // load). Yaw + scale + position transform into the field; X/Z-tilted props
      // fall back to the flat top (their surface no longer matches the field).
      // Hides also carry their INTERIOR-FLOOR field (stand ON the cave floor).
      const hfField = o.asset ? getHeightField(o.asset) : undefined;
      if (hfField) {
        meta.hf = {
          field: hfField,
          floor: interaction === "hide" && o.asset ? getFloorField(o.asset) : undefined,
          px,
          py,
          pz,
          yaw,
          sx,
          sy,
          sz,
        };
      }
      // TRUE SILHOUETTE (single source of truth): one poly per marching-squares
      // contour loop, transformed by scale + yaw + position. Takes precedence over
      // every approximation (circle/hull/parts) so collision == the visible mesh.
      if (fp.contours && fp.contours.length > 0) {
        const out: SolidObstacle[] = [];
        for (const loop of fp.contours) {
          if (loop.length < 3) continue;
          const pts = loop.map(([lx, lz]) => {
            const w = rotY(lx * sx, lz * sz, yaw);
            return { x: px + w.x, z: pz + w.z };
          });
          let sxs = 0;
          let szs = 0;
          for (const p of pts) {
            sxs += p.x;
            szs += p.z;
          }
          out.push({ shape: "poly", pts, cx: sxs / pts.length, cz: szs / pts.length, top, ...meta });
        }
        if (out.length > 0) return out;
      }
      if (fp.shape === "circle") {
        const fo = rotY(fp.center[0] * sx, fp.center[2] * sz, yaw);
        const r = Math.max(fp.half[0] * sx, fp.half[2] * sz);
        return [{ shape: "circle", cx: px + fo.x, cz: pz + fo.z, r, top, ...meta }];
      }
      // CONCAVE / branching: one tight OBB per measured part (traces the branches;
      // the empty gaps between them are covered by no volume).
      if (fp.parts && fp.parts.length > 0) {
        return fp.parts.map((part) => {
          const w = rotY(part.cx * sx, part.cz * sz, yaw);
          return { shape: "obb", cx: px + w.x, cz: pz + w.z, hx: part.hx * sx, hz: part.hz * sz, yaw, top, ...meta };
        });
      }
      // CONVEX: trace the mesh-outline hull (skips empty box corners); else the OBB.
      if (fp.hull && fp.hull.length >= 3) {
        const pts = fp.hull.map(([lx, lz]) => {
          const w = rotY(lx * sx, lz * sz, yaw);
          return { x: px + w.x, z: pz + w.z };
        });
        let sxs = 0;
        let szs = 0;
        for (const p of pts) {
          sxs += p.x;
          szs += p.z;
        }
        return [{ shape: "hull", pts, cx: sxs / pts.length, cz: szs / pts.length, top, ...meta }];
      }
      const fo = rotY(fp.center[0] * sx, fp.center[2] * sz, yaw);
      return [{ shape: "obb", cx: px + fo.x, cz: pz + fo.z, hx: fp.half[0] * sx, hz: fp.half[2] * sz, yaw, top, ...meta }];
    }
    // Advanced X/Z tilt: project the rotated box corners to XZ (matches the mesh).
    const proj = projectFootprint(fp, [sx, sy, sz], rx, yaw, rz);
    if (fp.shape === "circle") {
      const r = Math.max(fp.half[0] * sx, fp.half[2] * sz);
      return [{ shape: "circle", cx: px + proj.cx, cz: pz + proj.cz, r, top: py + proj.top, ...meta }];
    }
    return [{ shape: "obb", cx: px + proj.cx, cz: pz + proj.cz, hx: proj.hx, hz: proj.hz, yaw: 0, top: py + proj.top, ...meta }];
  }

  switch (o.collisionType) {
    case "sphere": {
      const r = (o.collision?.radius ?? DEFAULT_RADIUS) * Math.max(sx, sz);
      const top = py + r + off[1] * sy;
      return [{ shape: "circle", cx, cz, r, top, ...meta }];
    }
    case "capsule": {
      const r = (o.collision?.radius ?? DEFAULT_RADIUS) * Math.max(sx, sz);
      const len = (o.collision?.length ?? DEFAULT_LENGTH) * sz;
      const half = rotY(0, len / 2, yaw);
      const top = py + r * 2 + off[1] * sy;
      return [{ shape: "segment", x1: cx + half.x, z1: cz + half.z, x2: cx - half.x, z2: cz - half.z, r, top, ...meta }];
    }
    case "box":
    case "meshApprox":
    default: {
      const h = o.collision?.halfExtents ?? DEFAULT_HALF;
      const hx = h[0] * sx;
      const hz = h[2] * sz;
      const top = py + h[1] * sy * 2 + off[1] * sy;
      return [{ shape: "obb", cx, cz, hx, hz, yaw, top, ...meta }];
    }
  }
}

/** Compile one placed object into its PRIMARY solver volume (or null). Kept for
 *  single-volume callers/tests; multi-part props return their first branch here. */
export function compileObstacle(o: PlacedObject): SolidObstacle | null {
  return compileObject(o)[0] ?? null;
}

export function compileObstacles(objects: PlacedObject[]): SolidObstacle[] {
  const out: SolidObstacle[] = [];
  for (const o of objects) out.push(...compileObject(o));
  return out;
}

// ── Penetration of a circle (px,pz,radius) against one volume ─────────────────
/** Returns the minimal push (dx,dz) that separates the circle from the volume,
 *  or null if not overlapping. */
function penetration(
  ob: SolidObstacle,
  px: number,
  pz: number,
  radius: number,
): { dx: number; dz: number } | null {
  if (ob.shape === "circle") {
    return circlePush(px, pz, radius, ob.cx, ob.cz, ob.r);
  }
  if (ob.shape === "segment") {
    const cp = closestOnSegment(px, pz, ob.x1, ob.z1, ob.x2, ob.z2);
    return circlePush(px, pz, radius, cp.x, cp.z, ob.r);
  }
  if (ob.shape === "hull") {
    return polyPush(ob.pts, px, pz, radius);
  }
  if (ob.shape === "poly") {
    return concavePolyPush(ob.pts, px, pz, radius);
  }
  // OBB
  const c = Math.cos(ob.yaw);
  const s = Math.sin(ob.yaw);
  const rx = px - ob.cx;
  const rz = pz - ob.cz;
  // world → local (inverse of local→world above): lx = c*x - s*z, lz = s*x + c*z
  const lx = c * rx - s * rz;
  const lz = s * rx + c * rz;
  const insideX = Math.abs(lx) <= ob.hx;
  const insideZ = Math.abs(lz) <= ob.hz;
  let nlx: number;
  let nlz: number;
  if (insideX && insideZ) {
    // Centre is inside the box → push out the nearest face (+ radius).
    const penX = ob.hx - Math.abs(lx);
    const penZ = ob.hz - Math.abs(lz);
    if (penX <= penZ) {
      nlx = Math.sign(lx || 1) * (ob.hx + radius);
      nlz = lz;
    } else {
      nlx = lx;
      nlz = Math.sign(lz || 1) * (ob.hz + radius);
    }
  } else {
    const clx = Math.max(-ob.hx, Math.min(ob.hx, lx));
    const clz = Math.max(-ob.hz, Math.min(ob.hz, lz));
    const ddx = lx - clx;
    const ddz = lz - clz;
    const dist = Math.hypot(ddx, ddz);
    if (dist >= radius) return null; // no overlap
    if (dist < 1e-6) {
      // Exactly on the surface corner → push straight out along the shorter axis.
      nlx = clx + (Math.abs(clx) >= Math.abs(clz) ? Math.sign(clx || 1) * radius : 0);
      nlz = clz + (Math.abs(clz) > Math.abs(clx) ? Math.sign(clz || 1) * radius : 0);
    } else {
      const k = radius / dist;
      nlx = clx + ddx * k;
      nlz = clz + ddz * k;
    }
  }
  // local → world for the corrected point, then delta from current pos.
  const wx = c * nlx + s * nlz + ob.cx;
  const wz = -s * nlx + c * nlz + ob.cz;
  return { dx: wx - px, dz: wz - pz };
}

function circlePush(
  px: number,
  pz: number,
  radius: number,
  cx: number,
  cz: number,
  cr: number,
): { dx: number; dz: number } | null {
  const dx = px - cx;
  const dz = pz - cz;
  const dist = Math.hypot(dx, dz);
  const min = cr + radius;
  if (dist >= min) return null;
  if (dist < 1e-6) return { dx: min, dz: 0 }; // concentric → push +X
  const k = (min - dist) / dist;
  return { dx: dx * k, dz: dz * k };
}

/** Minimal push separating a circle (px,pz,radius) from a CONVEX polygon (any
 *  consistent winding), or null if not overlapping. Handles the center-inside case
 *  (push out through the nearest edge) and the outside case (push along the outward
 *  normal). This is what lets the gecko hug the traced mesh outline. */
function polyPush(
  pts: { x: number; z: number }[],
  px: number,
  pz: number,
  radius: number,
): { dx: number; dz: number } | null {
  const n = pts.length;
  if (n < 3) return null;
  let bestD2 = Infinity;
  let bx = 0;
  let bz = 0;
  let sign = 0;
  let inside = true;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const cp = closestOnSegment(px, pz, a.x, a.z, b.x, b.z);
    const dx = px - cp.x;
    const dz = pz - cp.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      bx = cp.x;
      bz = cp.z;
    }
    const cr = (b.x - a.x) * (pz - a.z) - (b.z - a.z) * (px - a.x);
    if (cr !== 0) {
      const s = cr > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) inside = false;
    }
  }
  const dist = Math.sqrt(bestD2);
  if (inside) {
    if (dist < 1e-6) return { dx: radius, dz: 0 };
    const ux = (bx - px) / dist; // toward the nearest boundary (outward)
    const uz = (bz - pz) / dist;
    return { dx: bx - px + ux * radius, dz: bz - pz + uz * radius };
  }
  if (dist >= radius) return null;
  if (dist < 1e-6) return { dx: radius, dz: 0 };
  const ux = (px - bx) / dist; // outward from the boundary to the centre
  const uz = (pz - bz) / dist;
  const push = radius - dist;
  return { dx: ux * push, dz: uz * push };
}

/** Ray-cast point-in-polygon (handles CONCAVE outlines + any winding). */
function pointInPolyXZ(pts: { x: number; z: number }[], px: number, pz: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const zi = pts[i].z;
    const xj = pts[j].x;
    const zj = pts[j].z;
    const intersect = zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Minimal push separating a circle (px,pz,radius) from a CONCAVE polygon (the exact
 * traced silhouette), or null if not overlapping. Inside is a robust ray cast; the
 * push is toward / along the nearest boundary edge. With the solver's relaxation
 * passes this keeps the animal hugging the real mesh outline (gaps stay open).
 */
function concavePolyPush(
  pts: { x: number; z: number }[],
  px: number,
  pz: number,
  radius: number,
): { dx: number; dz: number } | null {
  const n = pts.length;
  if (n < 3) return null;
  let bestD2 = Infinity;
  let bx = 0;
  let bz = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const cp = closestOnSegment(px, pz, a.x, a.z, b.x, b.z);
    const dx = px - cp.x;
    const dz = pz - cp.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      bx = cp.x;
      bz = cp.z;
    }
  }
  const dist = Math.sqrt(bestD2);
  const inside = pointInPolyXZ(pts, px, pz);
  if (inside) {
    if (dist < 1e-6) return { dx: radius, dz: 0 };
    const ux = (bx - px) / dist; // toward the nearest boundary (outward from interior)
    const uz = (bz - pz) / dist;
    return { dx: bx - px + ux * radius, dz: bz - pz + uz * radius };
  }
  if (dist >= radius) return null;
  if (dist < 1e-6) return { dx: radius, dz: 0 };
  const ux = (px - bx) / dist; // outward from the boundary toward the centre
  const uz = (pz - bz) / dist;
  const push = radius - dist;
  return { dx: ux * push, dz: uz * push };
}

function closestOnSegment(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): { x: number; z: number } {
  const vx = x2 - x1;
  const vz = z2 - z1;
  const len2 = vx * vx + vz * vz;
  if (len2 < 1e-9) return { x: x1, z: z1 };
  let t = ((px - x1) * vx + (pz - z1) * vz) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: x1 + vx * t, z: z1 + vz * t };
}

/** The world an animal moves through: its walkable bounds + solid obstacles. */
export class CollisionWorld {
  readonly obstacles: SolidObstacle[];
  /** Obstacles the animal must route AROUND (blocked/hide/wall). Passable ones
   *  (climbable / low) and OVERHEAD ones (hanging above the animal) are excluded —
   *  the former are crossed, the latter don't touch the floor. */
  readonly hard: SolidObstacle[];
  /** Live sculpted-terrain source (offsets from bounds.y). Absent ⇒ flat. */
  private ground?: GroundSource;

  /** This world's climb ceiling (personality-tunable: a lazy basker won't
   *  bother with props a bold explorer crosses). Defaults to the species cap. */
  readonly maxClimb: number;
  /** ONE interior-floor entry per hide OBJECT. A hide compiles to several wall
   *  loops whose bounding circles cover only the walls — the pocket is the hole
   *  BETWEEN them — so floor sampling needs the object's UNION circle. */
  private hideFloors: { ob: SolidObstacle; cx: number; cz: number; r: number }[] = [];

  constructor(
    public bounds: GroundBounds,
    obstacles: SolidObstacle[] = [],
    ground?: GroundSource,
    opts?: { maxClimb?: number },
  ) {
    this.obstacles = obstacles;
    this.ground = ground;
    this.maxClimb = opts?.maxClimb ?? MAX_CLIMB_HEIGHT;
    // Precompute a bounding circle per volume: every solver query rejects far-away
    // volumes with one distance check before touching their exact geometry.
    for (const ob of obstacles) {
      ob.bc = this.boundingCircle(ob);
      // A "climbable" volume that rises TOO FAR above the floor isn't climbable
      // in practice — the animal treats it like a boulder and routes around it
      // (never attempts a giant mantle, so no animation glitches).
      //  · No height data → judge by the volume's flat top.
      //  · Mesh-measured → judge by SHAPE: a prop that is MOSTLY low (driftwood
      //    with one tall twig) stays crossable — its individual too-tall cells
      //    are excluded per-point in isFree/losClear instead — while a prop
      //    that is mostly boulder-height goes hard and gets routed around.
      if (ob.passable && !this.isOverhead(ob)) {
        if (ob.hf) {
          const capLocal = (this.bounds.y + this.maxClimb - ob.hf.py) / Math.max(1e-6, ob.hf.sy);
          if (fieldStats(ob.hf.field).lowFrac(capLocal) < 0.55) ob.passable = false;
        } else if (ob.top - this.bounds.y > this.maxClimb) {
          ob.passable = false;
        }
      }
    }
    this.hard = obstacles.filter((o) => !o.passable && !this.isOverhead(o));

    // Collect the hide FLOORS (one per object, spanning ALL its wall loops).
    const floorSeen = new Set<string>();
    for (const ob of obstacles) {
      if (ob.interaction !== "hide" || !ob.hf?.floor || floorSeen.has(ob.id)) continue;
      floorSeen.add(ob.id);
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const v of obstacles) {
        if (v.id !== ob.id || !v.bc) continue;
        minX = Math.min(minX, v.bc.cx - v.bc.r);
        maxX = Math.max(maxX, v.bc.cx + v.bc.r);
        minZ = Math.min(minZ, v.bc.cz - v.bc.r);
        maxZ = Math.max(maxZ, v.bc.cz + v.bc.r);
      }
      if (!Number.isFinite(minX)) continue;
      this.hideFloors.push({
        ob,
        cx: (minX + maxX) / 2,
        cz: (minZ + maxZ) / 2,
        r: Math.max(maxX - minX, maxZ - minZ) / 2 + 0.05,
      });
    }
  }

  /** A hide's interior-floor height at (x,z) — floor plate + entrance sill —
   *  or null when no hide floor covers the point. Never lifts above
   *  HIDE_FLOOR_MAX (walls/roof can't leak in by construction). */
  private hideFloorAt(x: number, z: number, ground: number): { top: number; ob: SolidObstacle } | null {
    for (const hfl of this.hideFloors) {
      const dx = x - hfl.cx;
      const dz = z - hfl.cz;
      if (dx * dx + dz * dz > hfl.r * hfl.r) continue;
      const h = hfl.ob.hf!;
      const span = this.spanFromField(h, h.floor!, x, z);
      if (!span) continue;
      if (span.top - ground > HIDE_FLOOR_MAX) continue; // safety cap
      if (span.top > ground) return { top: span.top, ob: hfl.ob };
    }
    return null;
  }

  /** Penetration with a cheap bounding-circle reject (the hot path — every probe /
   *  LOS sample / relaxation pass funnels through here). */
  private pen(ob: SolidObstacle, x: number, z: number, radius: number): { dx: number; dz: number } | null {
    const bc = ob.bc;
    if (bc) {
      const dx = x - bc.cx;
      const dz = z - bc.cz;
      const rr = bc.r + radius;
      if (dx * dx + dz * dz > rr * rr) return null;
    }
    return penetration(ob, x, z, radius);
  }

  /** A prop whose underside is above the animal's head → doesn't block the floor. */
  private isOverhead(o: SolidObstacle): boolean {
    return o.bottom > this.bounds.y + OVERHEAD_CLEARANCE;
  }

  static fromLayout(
    layout: HabitatLayout,
    bounds: GroundBounds,
    ground?: GroundSource,
    opts?: { maxClimb?: number },
  ): CollisionWorld {
    return new CollisionWorld(bounds, compileObstacles(layout.objects), ground, opts);
  }

  /** Terrain slope angle at (x,z) (radians). 0 without a ground source. */
  groundSlopeAt(x: number, z: number): number {
    if (!this.ground) return 0;
    if (this.ground.slopeAt) return this.ground.slopeAt(x, z);
    const e = 0.02;
    const gx = (this.ground.heightAt(x + e, z) - this.ground.heightAt(x - e, z)) / (2 * e);
    const gz = (this.ground.heightAt(x, z + e) - this.ground.heightAt(x, z - e)) / (2 * e);
    return Math.atan(Math.hypot(gx, gz));
  }

  /** Bare terrain steeper than the animal will walk. Cheap no-ground fast path. */
  tooSteepAt(x: number, z: number): boolean {
    return this.ground ? this.groundSlopeAt(x, z) > MAX_WALK_SLOPE : false;
  }

  /** Is a circle of `radius` at (x,z) inside the bounds AND clear of every HARD
   *  obstacle AND on walkably-sloped ground? (Passable/climbable volumes don't
   *  count — you can stand on them.) Validates roam/feeder targets. */
  isFree(x: number, z: number, radius: number): boolean {
    if (!containsXZ(this.bounds, x, z, radius)) return false;
    if (this.tooSteepAt(x, z)) return false;
    for (const ob of this.hard) {
      if (this.pen(ob, x, z, radius)) return false;
    }
    if (this.tooTallAt(x, z, radius)) return false;
    return true;
  }

  /** A crossable mesh-measured prop's LOCAL surface here is higher than the
   *  animal will mantle (the tall twig on otherwise-low driftwood): the point
   *  is excluded from free space + walk lines, so the animal crosses the low
   *  sections and never plans a step onto the tall ones. PUBLIC because the
   *  foot planner must refuse landings here too — feet stepping onto too-tall
   *  cells is how a body gets carried (and stranded) up a crown navigation
   *  would never route onto. */
  tooTallAt(x: number, z: number, radius: number): boolean {
    const g = this.groundHeightAt(x, z);
    for (const ob of this.obstacles) {
      if (!ob.passable || !ob.hf) continue;
      const bc = ob.bc;
      if (bc) {
        const dx = x - bc.cx;
        const dz = z - bc.cz;
        const rr = bc.r + radius;
        if (dx * dx + dz * dz > rr * rr) continue;
      }
      const span = this.surfaceSpanAt(ob, x, z);
      if (!span) continue;
      if (span.bottom > g + PASS_UNDER_CLEARANCE) continue; // overhead — walked under
      if (span.top - g > this.maxClimb) return true;
    }
    return false;
  }

  /** True if the point is inside any HARD obstacle's footprint (ignores bounds
   *  and passable/climbable volumes). This is the never-phase-through invariant. */
  isBlocked(x: number, z: number, radius = 0): boolean {
    for (const ob of this.hard) {
      if (this.pen(ob, x, z, radius)) return true;
    }
    return false;
  }

  /** Straight-line reachability: can a circle of `radius` travel from A→B without
   *  crossing any HARD obstacle or leaving the bounds? The navigation planner uses
   *  this to decide whether it can walk straight or must route via waypoints. */
  losClear(ax: number, az: number, bx: number, bz: number, radius: number): boolean {
    if (!containsXZ(this.bounds, bx, bz, radius)) return false;
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz);
    const stepLen = Math.max(0.03, radius * 0.75);
    const steps = Math.max(1, Math.ceil(dist / stepLen));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      if (!containsXZ(this.bounds, x, z, radius) || this.isBlocked(x, z, radius)) return false;
      // Too-steep sculpted sand blocks the walk line like an obstacle would —
      // the planner routes around dunes it can't climb. Same for the too-tall
      // sections of otherwise-crossable props (the driftwood's upright twig).
      if (this.tooSteepAt(x, z)) return false;
      if (this.tooTallAt(x, z, radius)) return false;
    }
    return true;
  }

  /** Bounding circle (world XZ) of one obstacle — used to place detour waypoints
   *  around it during path planning. */
  boundingCircle(ob: SolidObstacle): { cx: number; cz: number; r: number } {
    if (ob.shape === "circle") return { cx: ob.cx, cz: ob.cz, r: ob.r };
    if (ob.shape === "obb") return { cx: ob.cx, cz: ob.cz, r: Math.hypot(ob.hx, ob.hz) };
    if (ob.shape === "hull" || ob.shape === "poly") {
      let r = 0;
      for (const p of ob.pts) r = Math.max(r, Math.hypot(p.x - ob.cx, p.z - ob.cz));
      return { cx: ob.cx, cz: ob.cz, r };
    }
    const mx = (ob.x1 + ob.x2) / 2;
    const mz = (ob.z1 + ob.z2) / 2;
    return { cx: mx, cz: mz, r: Math.hypot(ob.x2 - ob.x1, ob.z2 - ob.z1) / 2 + ob.r };
  }

  /**
   * Move a circle of `radius` from (fromX,fromZ) toward (toX,toZ), resolving
   * collisions: clamp to the walls, then push out of every penetrated obstacle
   * over a few relaxation passes (tangential motion survives ⇒ the animal SLIDES
   * along rocks/glass). Returns the safe resolved position and whether it ended
   * up meaningfully short of the requested move (blocked ⇒ the caller re-targets).
   *
   * HARD GUARANTEE: the returned position is never inside an obstacle and never
   * outside the bounds. In a pinch narrower than the animal, relaxation can't
   * fully separate two contacts — so we fall back to the last known-free spot
   * (`from`) rather than ever reporting a penetrating position. That naturally
   * produces "can't get through here → stop and pick a new target".
   */
  resolve(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    radius: number,
  ): { x: number; z: number; blocked: boolean } {
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const dist = Math.hypot(dx, dz);
    // SWEEP: split a long move into sub-steps ≤ half a body radius so a fast move
    // (a dart / flee) can't tunnel through a thin obstacle — each sub-step is
    // clamped + pushed out, and we stop at the last free sub-step on a wedge.
    const stepLen = Math.max(radius * 0.5, 1e-3);
    const steps = Math.min(8, Math.max(1, Math.ceil(dist / stepLen)));
    const fromFree = !this.isBlocked(fromX, fromZ, radius) && containsXZ(this.bounds, fromX, fromZ, radius);
    let x = fromX;
    let z = fromZ;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const clamped = clampXZ(this.bounds, fromX + dx * t, fromZ + dz * t, radius);
      const r = this.pushOut(clamped.x, clamped.z, radius);
      if (this.isBlocked(r.x, r.z, radius)) break; // wedge → keep the last free spot
      // Anti-tunnel: reject a sub-step that jumped THROUGH an obstacle (e.g. push-out
      // flipped to the far side of a thin wall) — keep the last free near-side spot.
      if (!this.losClear(x, z, r.x, r.z, radius)) break;
      x = r.x;
      z = r.z;
    }

    if (this.isBlocked(x, z, radius)) {
      // Never return penetrating: fall back to the known-free origin (or unstick it).
      if (fromFree) return { x: fromX, z: fromZ, blocked: true };
      const un = this.pushOut(fromX, fromZ, radius);
      return { x: un.x, z: un.z, blocked: true };
    }

    // Blocked if the actual advance fell well short of what was requested.
    const got = Math.hypot(x - fromX, z - fromZ);
    const blocked = dist > 1e-4 && got < dist * 0.5;
    return { x, z, blocked };
  }

  /** World position of a body probe given the animal's centre + heading (yaw). */
  private probeWorld(x: number, z: number, yaw: number, p: BodyProbe): { x: number; z: number } {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // The animal's RIGHT vector (perpendicular to forward on the XZ plane).
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    return { x: x + fx * p.forward + rx * p.side, z: z + fz * p.forward + rz * p.side };
  }

  /** True if ANY body probe (head/chest/hips/tail) penetrates a hard obstacle or
   *  leaves the bounds, for a body centred at (x,z) heading `yaw`. This is the
   *  whole-silhouette never-phase-through test, not just the centre circle. */
  bodyBlocked(x: number, z: number, yaw: number, probes: BodyProbe[]): boolean {
    for (const p of probes) {
      const w = this.probeWorld(x, z, yaw, p);
      if (!containsXZ(this.bounds, w.x, w.z, p.r)) return true;
      for (const ob of this.hard) if (this.pen(ob, w.x, w.z, p.r)) return true;
    }
    return false;
  }

  /** The DEEPEST penetration (metres) of any body probe into a hard obstacle or past
   *  a wall, for a body centred at (x,z) heading `yaw`. 0 ⇒ fully clear. Used to
   *  assert "no VISIBLE phasing" (a sub-centimetre residual is imperceptible). */
  bodyPenetration(x: number, z: number, yaw: number, probes: BodyProbe[]): number {
    let max = 0;
    for (const p of probes) {
      const w = this.probeWorld(x, z, yaw, p);
      const outX = Math.max(0, this.bounds.minX + p.r - w.x, w.x - (this.bounds.maxX - p.r));
      const outZ = Math.max(0, this.bounds.minZ + p.r - w.z, w.z - (this.bounds.maxZ - p.r));
      if (outX || outZ) max = Math.max(max, Math.hypot(outX, outZ));
      for (const ob of this.hard) {
        const push = this.pen(ob, w.x, w.z, p.r);
        if (push) max = Math.max(max, Math.hypot(push.dx, push.dz));
      }
    }
    return max;
  }

  /** Push the animal's CENTRE so every rigid body probe clears the hard obstacles
   *  AND the walls — so the head / torso / tail never visibly phase through decor.
   *  A few relaxation passes converge multi-probe contacts (probes move with the
   *  centre). Returns the corrected centre. */
  resolveBody(x: number, z: number, yaw: number, probes: BodyProbe[]): { x: number; z: number } {
    let cx = x;
    let cz = z;
    for (let pass = 0; pass < 10; pass++) {
      let moved = false;
      for (const p of probes) {
        const w = this.probeWorld(cx, cz, yaw, p);
        // Keep the probe inside the walls.
        let ox = 0;
        let oz = 0;
        if (w.x < this.bounds.minX + p.r) ox = this.bounds.minX + p.r - w.x;
        else if (w.x > this.bounds.maxX - p.r) ox = this.bounds.maxX - p.r - w.x;
        if (w.z < this.bounds.minZ + p.r) oz = this.bounds.minZ + p.r - w.z;
        else if (w.z > this.bounds.maxZ - p.r) oz = this.bounds.maxZ - p.r - w.z;
        if (ox || oz) {
          cx += ox;
          cz += oz;
          moved = true;
        }
        // Push out of every hard obstacle (probe follows the centre by the same delta).
        for (const ob of this.hard) {
          const push = this.pen(ob, w.x + ox, w.z + oz, p.r);
          if (push) {
            cx += push.dx;
            cz += push.dz;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return { x: cx, z: cz };
  }

  /** Push a circle out of every HARD obstacle it penetrates, re-clamping to the
   *  walls each pass. Several passes converge multi-contact cases (corners).
   *  Passable/climbable volumes are intentionally NOT pushed against — the animal
   *  crosses them (its walk height rises via `climbHeightAt`). */
  /** The nearest point clear of every hard obstacle + inside the bounds — the
   *  public seam FOOT PLANTS use so a paw can never be placed inside a rock. */
  freePoint(x: number, z: number, radius = 0.02): { x: number; z: number } {
    return this.pushOut(x, z, radius);
  }

  private pushOut(x: number, z: number, radius: number): { x: number; z: number } {
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (const ob of this.hard) {
        const push = this.pen(ob, x, z, radius);
        if (push) {
          x += push.dx;
          z += push.dz;
          moved = true;
        }
      }
      const c = clampXZ(this.bounds, x, z, radius);
      x = c.x;
      z = c.z;
      if (!moved) break;
    }
    return { x, z };
  }

  /** Sample a random reachable target (inside bounds + clear of obstacles).
   *  Returns null if none found in `tries` attempts (then keep the old target). */
  randomFreeTarget(radius: number, rng: Rng = Math.random, tries = 24): { x: number; z: number } | null {
    for (let i = 0; i < tries; i++) {
      const p = randomPointInBounds(this.bounds, rng, radius);
      if (this.isFree(p.x, p.z, radius)) return p;
    }
    return null;
  }

  /**
   * EXACT surface span of one obstacle at a world point: the mesh's measured TOP
   * (what the animal stands on) + UNDERSIDE there, from its heightfield. Null ⇒
   * the mesh doesn't cover that point (a gap between branches). Obstacles without
   * height data report their prop-wide flat top/bottom (legacy placeholders).
   */
  surfaceSpanAt(ob: SolidObstacle, x: number, z: number): { top: number; bottom: number } | null {
    const h = ob.hf;
    if (!h) return { top: ob.top, bottom: ob.bottom };
    return this.spanFromField(h, h.field, x, z);
  }

  /** A hide's INTERIOR-FLOOR height at a world point (floor plates + entrance
   *  sills only — never the walls/roof), or null off the floor mesh. */
  floorSpanAt(ob: SolidObstacle, x: number, z: number): { top: number; bottom: number } | null {
    const h = ob.hf;
    if (!h?.floor) return null;
    return this.spanFromField(h, h.floor, x, z);
  }

  private spanFromField(
    h: SurfaceRef,
    field: FootprintHeightField,
    x: number,
    z: number,
  ): { top: number; bottom: number } | null {
    const c = Math.cos(h.yaw);
    const s = Math.sin(h.yaw);
    const dx = x - h.px;
    const dz = z - h.pz;
    // Inverse of the compiler's local→world (scale, then yaw, then translate).
    const lx = (c * dx - s * dz) / h.sx;
    const lz = (s * dx + c * dz) / h.sz;
    const smp = sampleHeightField(field, lx, lz);
    if (!smp) return null;
    return { top: h.py + smp.top * h.sy, bottom: h.py + smp.bottom * h.sy };
  }

  /**
   * Walkable surface height at (x,z): the substrate, unless the point sits over a
   * PASSABLE (climbable / low) obstacle, in which case it's that obstacle's
   * MEASURED surface height AT THAT POINT — the low side of a sloped rock is low,
   * the crest is high, and the empty span under an arched branch doesn't lift the
   * floor at all. `fromY` is the animal's current standing height: any span whose
   * measured underside is more than PASS_UNDER_CLEARANCE above it is overhead —
   * walked beneath, not levitated onto. Hard obstacles are never stood on.
   * `radius` pads the engage test for props without height data (legacy path).
   */
  climbHeightAt(x: number, z: number, radius = 0, fromY = this.bounds.y): number {
    const ground = this.groundHeightAt(x, z);
    let y = ground;
    for (const ob of this.obstacles) {
      if (!ob.passable) continue;
      if (ob.hf) {
        // Cheap reject, then the exact per-point surface query.
        const bc = ob.bc;
        if (bc) {
          const dx = x - bc.cx;
          const dz = z - bc.cz;
          const rr = bc.r + radius;
          if (dx * dx + dz * dz > rr * rr) continue;
        }
        const span = this.surfaceSpanAt(ob, x, z);
        if (!span) continue; // mesh doesn't cover this point
        if (span.bottom > fromY + PASS_UNDER_CLEARANCE) continue; // overhead span
        y = Math.max(y, span.top);
      } else {
        if (this.isOverhead(ob)) continue; // overhead climbables don't lift the floor
        if (this.pen(ob, x, z, radius)) y = Math.max(y, ob.top);
      }
    }
    // A hide's measured interior FLOOR (plate + entrance sill) is real ground:
    // the animal stands/lies ON it and steps OVER the sill, never sunk through.
    const floor = this.hideFloorAt(x, z, ground);
    if (floor) y = Math.max(y, floor.top);
    return y;
  }

  /**
   * The MESH surface height of ONE specific prop at (x,z) — measured per-point
   * from its heightfield (passable or hard alike), falling back to the volume's
   * flat top, then the sand. This is how things REST ON a prop's real shape:
   * insects sit on the dish's bowl floor (not sunk to the sand through it, not
   * floating at rim height), food sits in the hollow, etc.
   */
  propSurfaceYAt(x: number, z: number, objectId: string): number {
    let y = -Infinity;
    let flat = -Infinity;
    for (const ob of this.obstacles) {
      if (ob.id !== objectId) continue;
      if (ob.hf) {
        const span = this.surfaceSpanAt(ob, x, z);
        if (span && span.top > y) y = span.top;
      } else if (this.pen(ob, x, z, 0.005) && ob.top > flat) {
        flat = ob.top;
      }
    }
    const ground = this.groundHeightAt(x, z);
    if (Number.isFinite(y)) return Math.max(y, ground);
    if (Number.isFinite(flat)) return Math.max(flat, ground);
    return ground;
  }

  /** Highest HARD surface covering (x,z) — the roofline a camera ray must clear
   *  to see past a rock/cave — or the ground height when nothing hard is there. */
  hardTopAt(x: number, z: number): number {
    let top = this.groundHeightAt(x, z);
    for (const ob of this.hard) {
      if (this.pen(ob, x, z, 0.01) && ob.top > top) top = ob.top;
    }
    return top;
  }

  /** World Y of the (possibly sculpted) SAND at (x,z), ignoring props. */
  groundHeightAt(x: number, z: number): number {
    return this.bounds.y + (this.ground ? this.ground.heightAt(x, z) : 0);
  }

  /**
   * ONE query answering "what exactly is under this point": stand height, unit
   * normal, slope, surface type + object id, and the walkable / climbable /
   * too-steep / fallback flags. This is the seam the foot-contact system, body
   * orientation, debug markers and validation all read. `fromY` is the animal's
   * current standing height (drives the pass-under rule, as in climbHeightAt).
   */
  sampleSurfaceAt(x: number, z: number, fromY = this.bounds.y, radius = 0): SurfaceSample {
    // Winner: the sculpted ground, unless a passable prop's surface is higher
    // (or a hide's interior FLOOR — stood on, never sunk through).
    const ground = this.groundHeightAt(x, z);
    let y = ground;
    let winner: SolidObstacle | null = null;
    let fallback = false;
    for (const ob of this.obstacles) {
      if (!ob.passable) continue;
      if (ob.hf) {
        const bc = ob.bc;
        if (bc) {
          const dx = x - bc.cx;
          const dz = z - bc.cz;
          if (dx * dx + dz * dz > bc.r * bc.r) continue;
        }
        const span = this.surfaceSpanAt(ob, x, z);
        if (!span) continue;
        if (span.bottom > fromY + PASS_UNDER_CLEARANCE) continue;
        if (span.top > y) {
          y = span.top;
          winner = ob;
          fallback = false;
        }
      } else {
        if (this.isOverhead(ob)) continue;
        if (this.pen(ob, x, z, radius) && ob.top > y) {
          y = ob.top;
          winner = ob;
          fallback = true; // no height data — the prop-wide flat top was used
        }
      }
    }

    // Standing INSIDE a hide: its measured interior floor is the surface.
    const floor = this.hideFloorAt(x, z, ground);
    if (floor && floor.top > y) {
      y = floor.top;
      winner = floor.ob;
      fallback = false;
    }

    // Normal + slope by central differences of the SAME standing-height query, so
    // it reflects whatever surface actually won (terrain or a prop's heightfield).
    const e = 0.02;
    const gx = (this.climbHeightAt(x + e, z, 0, fromY) - this.climbHeightAt(x - e, z, 0, fromY)) / (2 * e);
    const gz = (this.climbHeightAt(x, z + e, 0, fromY) - this.climbHeightAt(x, z - e, 0, fromY)) / (2 * e);
    const len = Math.hypot(gx, 1, gz);
    const normal: Vec3 = [-gx / len, 1 / len, -gz / len];
    const slope = Math.atan(Math.hypot(gx, gz));

    const onTerrain = !winner && this.ground != null && Math.abs(this.groundHeightAt(x, z) - this.bounds.y) > 0.004;
    const tooSteep = !winner && this.tooSteepAt(x, z);
    const walkable = containsXZ(this.bounds, x, z, radius) && !this.isBlocked(x, z, radius) && !tooSteep;
    return {
      y,
      normal,
      slope,
      type: winner ? winner.category : onTerrain ? "terrain" : "substrate",
      objectId: winner ? winner.id : null,
      interaction: winner ? winner.interaction : null,
      walkable,
      climbable: !!winner,
      tooSteep,
      fallback,
    };
  }
}

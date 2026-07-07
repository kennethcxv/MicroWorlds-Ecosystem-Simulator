/**
 * TERRAIN / substrate sculpting — pure (no Three.js / DOM). A coarse height map
 * over the sand the player can RAISE / LOWER / SMOOTH / FLATTEN with a brush,
 * plus a WATER (wet-patch) mask. The renderer displaces the sand mesh from the
 * height map; the COLLISION WORLD samples it live (bilinear) so the animal's walk
 * height, foot contacts, navigation and feeding all follow the sculpted ground.
 *
 * DESIGN — "can the terrain go under the substrate?": the player sculpts the TOP
 * SURFACE of the substrate, not the tank. Digging BELOW the default flat sand
 * level is allowed (depressions / channels / shallow holes / wet hollows), but a
 * hard BEDROCK limit derived from the substrate depth stops the brush ~1 cm above
 * the physical tank floor, so a depression always renders as sand — never a hole
 * through the glass. Raising is capped relative to the enclosure so dunes stay
 * dunes. Normal brushing uses gentle limits; the Strong brush (advanced) unlocks
 * the full range. Fully serialisable (plain arrays) + unit-tested.
 */
import type { HabitatDimensions } from "./HabitatTypes";

export interface Terrain {
  nx: number;
  nz: number;
  /** Row-major height offsets (metres, ± around the flat substrate). */
  heights: number[];
  /** Row-major wet-patch mask 0|1. */
  water: number[];
}

export const TERRAIN_NX = 48;
export const TERRAIN_NZ = 30;
/** LEGACY gentle clamp (m) — the default when a caller passes no limits, so old
 *  call sites keep their behaviour. The game passes {@link sculptLimits} instead. */
export const MAX_H = 0.08;

/** How far the brush may raise (`up`, +m) / dig (`down`, −m) from the flat sand. */
export interface SculptLimits {
  up: number;
  down: number;
}

/**
 * Sculpting range for an enclosure. `down` is bounded by BEDROCK: the substrate
 * bed runs from the tank floor (world y = 0) up to `substrateTop`, so digging
 * stops ~1 cm above the glass — a depression is always sand, never a hole.
 * `up` scales with the enclosure height so dunes stay in proportion.
 */
export function sculptLimits(dims: HabitatDimensions, strong = false): SculptLimits {
  const bedrock = -Math.max(0.02, dims.substrateTop - 0.01);
  if (strong) {
    return { up: Math.min(0.24, dims.height * 0.18), down: bedrock };
  }
  return { up: Math.min(0.14, dims.height * 0.12), down: Math.max(bedrock, -0.05) };
}

/** Optional per-stroke controls: range limits + a cell mask (false ⇒ the brush
 *  skips that cell — used to protect ground under props and along the glass). */
export interface SculptOptions {
  limits?: SculptLimits;
  mask?: (x: number, z: number) => boolean;
}

export function createTerrain(nx = TERRAIN_NX, nz = TERRAIN_NZ): Terrain {
  return { nx, nz, heights: new Array<number>(nx * nz).fill(0), water: new Array<number>(nx * nz).fill(0) };
}

/** Defensive rehydrate for saves from before terrain existed. */
export function ensureTerrain(t: Terrain | undefined): Terrain {
  if (t && Array.isArray(t.heights) && t.heights.length === t.nx * t.nz && Array.isArray(t.water)) return t;
  return createTerrain();
}

function cellCenter(t: Terrain, dims: HabitatDimensions, ix: number, iz: number): { x: number; z: number } {
  return {
    x: -dims.width / 2 + ((ix + 0.5) / t.nx) * dims.width,
    z: -dims.depth / 2 + ((iz + 0.5) / t.nz) * dims.depth,
  };
}

function forBrush(
  t: Terrain,
  dims: HabitatDimensions,
  x: number,
  z: number,
  radius: number,
  fn: (i: number, fall: number) => void,
  mask?: (x: number, z: number) => boolean,
): void {
  for (let iz = 0; iz < t.nz; iz++) {
    for (let ix = 0; ix < t.nx; ix++) {
      const c = cellCenter(t, dims, ix, iz);
      const dist = Math.hypot(c.x - x, c.z - z);
      if (dist >= radius) continue;
      if (mask && !mask(c.x, c.z)) continue;
      const fall = 1 - dist / radius;
      fn(iz * t.nx + ix, fall * fall);
    }
  }
}

const DEFAULT_LIMITS: SculptLimits = { up: MAX_H, down: -MAX_H };

/** Raise (delta > 0) or lower (delta < 0) the sand under the brush, clamped to
 *  the limits (legacy gentle ±MAX_H unless the caller passes real limits). */
export function sculpt(
  t: Terrain,
  dims: HabitatDimensions,
  x: number,
  z: number,
  radius: number,
  delta: number,
  opts: SculptOptions = {},
): void {
  const lim = opts.limits ?? DEFAULT_LIMITS;
  forBrush(
    t,
    dims,
    x,
    z,
    radius,
    (i, fall) => {
      t.heights[i] = Math.max(lim.down, Math.min(lim.up, t.heights[i] + delta * fall));
    },
    opts.mask,
  );
}

/** Relax heights toward their neighbourhood average under the brush. */
export function smoothTerrain(
  t: Terrain,
  dims: HabitatDimensions,
  x: number,
  z: number,
  radius: number,
  opts: SculptOptions = {},
): void {
  const src = t.heights.slice();
  const at = (ix: number, iz: number): number =>
    src[Math.min(t.nz - 1, Math.max(0, iz)) * t.nx + Math.min(t.nx - 1, Math.max(0, ix))];
  forBrush(
    t,
    dims,
    x,
    z,
    radius,
    (i, fall) => {
      const ix = i % t.nx;
      const iz = (i / t.nx) | 0;
      const avg = (at(ix - 1, iz) + at(ix + 1, iz) + at(ix, iz - 1) + at(ix, iz + 1) + at(ix, iz)) / 5;
      t.heights[i] += (avg - t.heights[i]) * Math.min(1, 0.8 * fall + 0.2);
    },
    opts.mask,
  );
}

/** Pull heights toward flat (0) under the brush. */
export function flattenTerrain(
  t: Terrain,
  dims: HabitatDimensions,
  x: number,
  z: number,
  radius: number,
  opts: SculptOptions = {},
): void {
  forBrush(
    t,
    dims,
    x,
    z,
    radius,
    (i, fall) => {
      t.heights[i] *= Math.max(0, 1 - (0.75 * fall + 0.25));
    },
    opts.mask,
  );
}

/** Paint (on) or dry (off) a shallow wet patch under the brush. Wet cells also
 *  settle slightly below grade so the patch reads as a shallow pool, never deep. */
export function paintWater(
  t: Terrain,
  dims: HabitatDimensions,
  x: number,
  z: number,
  radius: number,
  on: boolean,
  opts: SculptOptions = {},
): void {
  const lim = opts.limits ?? DEFAULT_LIMITS;
  forBrush(
    t,
    dims,
    x,
    z,
    radius,
    (i, fall) => {
      if (fall < 0.08) return;
      t.water[i] = on ? 1 : 0;
      if (on) t.heights[i] = Math.max(lim.down, Math.min(t.heights[i], -0.015));
    },
    opts.mask,
  );
}

/**
 * BILINEAR sample of the sculpted height at world (x,z) — smooth between cells,
 * so feet / body height / the displaced sand mesh never stair-step. Clamps to the
 * edge cells outside the grid.
 */
export function terrainHeightAt(t: Terrain, dims: HabitatDimensions, x: number, z: number): number {
  const u = ((x + dims.width / 2) / dims.width) * t.nx - 0.5;
  const v = ((z + dims.depth / 2) / dims.depth) * t.nz - 0.5;
  const ix0 = Math.min(t.nx - 1, Math.max(0, Math.floor(u)));
  const iz0 = Math.min(t.nz - 1, Math.max(0, Math.floor(v)));
  const ix1 = Math.min(t.nx - 1, ix0 + 1);
  const iz1 = Math.min(t.nz - 1, iz0 + 1);
  const fx = Math.min(1, Math.max(0, u - ix0));
  const fz = Math.min(1, Math.max(0, v - iz0));
  const h00 = t.heights[iz0 * t.nx + ix0];
  const h10 = t.heights[iz0 * t.nx + ix1];
  const h01 = t.heights[iz1 * t.nx + ix0];
  const h11 = t.heights[iz1 * t.nx + ix1];
  return h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
}

/** Terrain slope angle (radians from horizontal) at world (x,z), by central
 *  differences of the bilinear field. 0 on flat sand. */
export function terrainSlopeAt(t: Terrain, dims: HabitatDimensions, x: number, z: number): number {
  const ex = (dims.width / t.nx) / 2;
  const ez = (dims.depth / t.nz) / 2;
  const gx = (terrainHeightAt(t, dims, x + ex, z) - terrainHeightAt(t, dims, x - ex, z)) / (2 * ex);
  const gz = (terrainHeightAt(t, dims, x, z + ez) - terrainHeightAt(t, dims, x, z - ez)) / (2 * ez);
  return Math.atan(Math.hypot(gx, gz));
}

export interface TerrainStats {
  /** Fraction of the floor that is wet patch (0..1). */
  waterFrac: number;
  /** RMS height variation (m) — a proxy for landscape variety/enrichment. */
  relief: number;
}

export function terrainStats(t: Terrain): TerrainStats {
  let wet = 0;
  let sq = 0;
  for (let i = 0; i < t.heights.length; i++) {
    wet += t.water[i];
    sq += t.heights[i] * t.heights[i];
  }
  return { waterFrac: wet / t.water.length, relief: Math.sqrt(sq / t.heights.length) };
}

/**
 * LOCAL dirt / cleanliness — pure (no Three.js / DOM). The vivarium doesn't get
 * dirty as one global number: a coarse DIRT MAP over the substrate accumulates
 * around HOTSPOTS (wherever the gecko lingers, food, dishes, hides) plus a slow
 * ambient film everywhere, and the player scrubs it back down with a drag BRUSH
 * (Clean Mode). The renderer draws the map as sand discoloration; the sim reads
 * the average back into `environment.cleanliness` (which needs/stress already
 * consume). Fully serialisable (plain arrays) + unit-tested.
 */
import type { HabitatDimensions } from "../HabitatTypes";

export interface DirtMap {
  nx: number;
  nz: number;
  /** Row-major (iz*nx+ix) dirt 0 (clean) … 1 (filthy). */
  cells: number[];
}

/** Coarse but visibly local — one cell ≈ 6–7 cm of a 40-gallon floor. */
export const DIRT_NX = 44;
export const DIRT_NZ = 28;

/** How fast dirt builds (per second): a slow ambient film + strong hotspots.
 *  PACING (retuned SLOWER on player feedback): the ambient film takes ~9 hours
 *  to saturate (a freshly cleaned tank stays presentable across sessions);
 *  hotspots need a couple of minutes of solid lingering before a visible spot
 *  forms — grime is a gentle chore, not a treadmill (droppings still foul
 *  fast via their 1.4 weight). */
const AMBIENT_PER_SEC = 0.00003;
const HOTSPOT_PER_SEC = 0.0022;
const HOTSPOT_RADIUS = 0.28; // metres of influence around a hotspot

export function createDirtMap(nx = DIRT_NX, nz = DIRT_NZ): DirtMap {
  return { nx, nz, cells: new Array<number>(nx * nz).fill(0) };
}

/** Defensive rehydrate for saves from before the dirt map existed. */
export function ensureDirtMap(m: DirtMap | undefined): DirtMap {
  if (m && Array.isArray(m.cells) && m.cells.length === m.nx * m.nz) return m;
  return createDirtMap();
}

function cellCenter(m: DirtMap, dims: HabitatDimensions, ix: number, iz: number): { x: number; z: number } {
  return {
    x: -dims.width / 2 + ((ix + 0.5) / m.nx) * dims.width,
    z: -dims.depth / 2 + ((iz + 0.5) / m.nz) * dims.depth,
  };
}

/** One place dirt concentrates this tick (gecko / feeder / dish / hide), with a
 *  weight (1 = full strength). */
export interface DirtHotspot {
  x: number;
  z: number;
  w: number;
}

/** Advance the dirt simulation by dt seconds. */
export function accumulateDirt(m: DirtMap, dims: HabitatDimensions, dt: number, hotspots: DirtHotspot[]): void {
  const amb = AMBIENT_PER_SEC * dt;
  for (let iz = 0; iz < m.nz; iz++) {
    for (let ix = 0; ix < m.nx; ix++) {
      const i = iz * m.nx + ix;
      let d = m.cells[i] + amb;
      if (hotspots.length > 0) {
        const c = cellCenter(m, dims, ix, iz);
        for (const h of hotspots) {
          const dist = Math.hypot(c.x - h.x, c.z - h.z);
          if (dist < HOTSPOT_RADIUS) {
            const fall = 1 - dist / HOTSPOT_RADIUS;
            d += HOTSPOT_PER_SEC * h.w * fall * fall * dt;
          }
        }
      }
      m.cells[i] = Math.min(1, d);
    }
  }
}

/** Scrub with the brush at (x,z): removes up to `amount` dirt inside `radius`
 *  (soft falloff). Returns the total dirt removed (0 ⇒ that spot was clean). */
export function cleanAt(m: DirtMap, dims: HabitatDimensions, x: number, z: number, radius: number, amount: number): number {
  let removed = 0;
  for (let iz = 0; iz < m.nz; iz++) {
    for (let ix = 0; ix < m.nx; ix++) {
      const c = cellCenter(m, dims, ix, iz);
      const dist = Math.hypot(c.x - x, c.z - z);
      if (dist >= radius) continue;
      const i = iz * m.nx + ix;
      const fall = 1 - dist / radius;
      const take = Math.min(m.cells[i], amount * fall);
      m.cells[i] -= take;
      removed += take;
    }
  }
  return removed;
}

/** Average dirt 0..1 across the substrate. */
export function dirtiness(m: DirtMap): number {
  let sum = 0;
  for (const c of m.cells) sum += c;
  return sum / m.cells.length;
}

/** The HUD's cleanliness percentage (100 = spotless). */
export function cleanlinessPct(m: DirtMap): number {
  return Math.max(0, Math.min(100, 100 * (1 - dirtiness(m))));
}

/** Spotless enough to earn the sparkle celebration. */
export function isSpotless(m: DirtMap): boolean {
  return dirtiness(m) < 0.005 && Math.max(...m.cells) < 0.05;
}

/** One reported dirty spot for Cleaning Mode (world coordinates). */
export interface DirtSpot {
  x: number;
  z: number;
  /** Peak dirt 0..1 at the spot. */
  amount: number;
}

/** Dirt above this reads as a visible "spot" (the ambient film stays quiet). */
const SPOT_THRESHOLD = 0.16;
/** Two rings never sit closer than this (one smear = one ring). */
const SPOT_SEPARATION = 0.3;

/**
 * Where are the dirty spots? Returns up to `maxCount` local dirt peaks in
 * world coordinates, dirtiest first, each at least SPOT_SEPARATION apart.
 * Drives the amber rings + the "N spots detected" badge in Cleaning Mode.
 */
export function dirtSpots(m: DirtMap, dims: HabitatDimensions, maxCount = 6): DirtSpot[] {
  const candidates: DirtSpot[] = [];
  for (let iz = 0; iz < m.nz; iz++) {
    for (let ix = 0; ix < m.nx; ix++) {
      const d = m.cells[iz * m.nx + ix];
      if (d < SPOT_THRESHOLD) continue;
      const c = cellCenter(m, dims, ix, iz);
      candidates.push({ x: c.x, z: c.z, amount: d });
    }
  }
  candidates.sort((a, b) => b.amount - a.amount);
  const spots: DirtSpot[] = [];
  for (const c of candidates) {
    if (spots.length >= maxCount) break;
    if (spots.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < SPOT_SEPARATION)) continue;
    spots.push(c);
  }
  return spots;
}

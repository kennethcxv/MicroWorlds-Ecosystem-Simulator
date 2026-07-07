/**
 * SUBSTRATE MATERIAL MAP — the pure per-cell material grid behind the Terrain
 * editor's Paint brush. The player PHYSICALLY paints materials onto the floor:
 * each cell records which terrain material (src/data/terrains.ts id) lines it.
 * The floor texture composites per cell, the ambient-humidity model blends by
 * coverage, the minimap draws the cells, and the map persists with the
 * habitat save (compact: an id palette + small integer cells).
 *
 * Pure — no DOM/Three imports (unit-tested in tests/materialmap.test.ts).
 */
import type { HabitatDimensions } from "./HabitatTypes";

export interface SubstrateMaterialMap {
  nx: number;
  nz: number;
  /** The material ids used on this floor; cells index into this palette. */
  ids: string[];
  /** Row-major palette indices, length nx·nz. */
  cells: number[];
}

export const MATERIAL_GRID_NX = 64;
export const MATERIAL_GRID_NZ = 40;

/** A valid map from a saved blob, or a fresh uniform map of `defaultId`. */
export function ensureMaterialMap(existing: SubstrateMaterialMap | undefined, defaultId: string): SubstrateMaterialMap {
  if (
    existing &&
    existing.nx === MATERIAL_GRID_NX &&
    existing.nz === MATERIAL_GRID_NZ &&
    Array.isArray(existing.ids) &&
    existing.ids.length > 0 &&
    Array.isArray(existing.cells) &&
    existing.cells.length === existing.nx * existing.nz &&
    existing.cells.every((c) => Number.isInteger(c) && c >= 0 && c < existing.ids.length)
  ) {
    return existing;
  }
  return {
    nx: MATERIAL_GRID_NX,
    nz: MATERIAL_GRID_NZ,
    ids: [defaultId],
    cells: new Array(MATERIAL_GRID_NX * MATERIAL_GRID_NZ).fill(0),
  };
}

function cellIndex(map: SubstrateMaterialMap, dims: HabitatDimensions, x: number, z: number): number {
  const ix = Math.max(0, Math.min(map.nx - 1, Math.floor(((x + dims.width / 2) / dims.width) * map.nx)));
  const iz = Math.max(0, Math.min(map.nz - 1, Math.floor(((z + dims.depth / 2) / dims.depth) * map.nz)));
  return iz * map.nx + ix;
}

/** The material id lining the floor at world (x, z). */
export function materialIdAt(map: SubstrateMaterialMap, dims: HabitatDimensions, x: number, z: number): string {
  return map.ids[map.cells[cellIndex(map, dims, x, z)]] ?? map.ids[0];
}

/** Paint `id` into every cell whose centre lies within `radius` of (x, z).
 *  Returns how many cells actually changed (0 ⇒ nothing to repaint). */
export function paintMaterial(
  map: SubstrateMaterialMap,
  dims: HabitatDimensions,
  x: number,
  z: number,
  radius: number,
  id: string,
): number {
  let idx = map.ids.indexOf(id);
  if (idx < 0) {
    map.ids.push(id);
    idx = map.ids.length - 1;
  }
  const cellW = dims.width / map.nx;
  const cellD = dims.depth / map.nz;
  const minIx = Math.max(0, Math.floor((x - radius + dims.width / 2) / cellW));
  const maxIx = Math.min(map.nx - 1, Math.ceil((x + radius + dims.width / 2) / cellW));
  const minIz = Math.max(0, Math.floor((z - radius + dims.depth / 2) / cellD));
  const maxIz = Math.min(map.nz - 1, Math.ceil((z + radius + dims.depth / 2) / cellD));
  const r2 = radius * radius;
  let changed = 0;
  for (let iz = minIz; iz <= maxIz; iz++) {
    for (let ix = minIx; ix <= maxIx; ix++) {
      const cx = (ix + 0.5) * cellW - dims.width / 2;
      const cz = (iz + 0.5) * cellD - dims.depth / 2;
      const dx = cx - x;
      const dz = cz - z;
      if (dx * dx + dz * dz > r2) continue;
      const i = iz * map.nx + ix;
      if (map.cells[i] !== idx) {
        map.cells[i] = idx;
        changed++;
      }
    }
  }
  return changed;
}

/** Fraction of the floor each used material covers (sums to 1). */
export function coverageFractions(map: SubstrateMaterialMap): Map<string, number> {
  const counts = new Array(map.ids.length).fill(0);
  for (const c of map.cells) counts[c]++;
  const out = new Map<string, number>();
  for (let i = 0; i < map.ids.length; i++) {
    if (counts[i] > 0) out.set(map.ids[i], counts[i] / map.cells.length);
  }
  return out;
}

/** The most-covered material id (the habitat's dominant substrate). */
export function dominantMaterialId(map: SubstrateMaterialMap): string {
  const counts = new Array(map.ids.length).fill(0);
  for (const c of map.cells) counts[c]++;
  let best = 0;
  for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;
  return map.ids[best];
}

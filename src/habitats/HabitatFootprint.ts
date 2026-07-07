/**
 * GLASSWATER — pure FOOTPRINT TRACING for irregular decor (no Three.js / DOM).
 *
 * Turns a cloud of mesh vertices projected onto the XZ floor plane into a tight
 * 2D collision footprint that TRACES THE VISIBLE OBJECT:
 *   - a CONVEX HULL for compact/convex props (rocks, caves, dishes) — cheap + smooth;
 *   - a MULTI-PART rectangle decomposition for CONCAVE / branching props (driftwood,
 *     roots, twigs) — several small axis-aligned rects that follow the branches so
 *     the EMPTY GAPS BETWEEN BRANCHES are never blocked (a single convex hull would
 *     bridge them; that is the bug this module fixes).
 *
 * The decision (convex vs concave) is data-driven: rasterise the points into an
 * occupancy grid and compare the occupied area to the convex-hull area. A branchy
 * root fills only a fraction of its hull ⇒ concave ⇒ decompose into rectangles.
 *
 * All outputs are in the model's LOCAL frame at natural display size (object
 * scale = 1); the collision compiler applies scale + rotation + position. Pure ⇒
 * unit-tested directly (see tests/footprint.test.ts).
 */
import type { FootprintPart, Vec2, Vec3 } from "./HabitatTypes";
export type { FootprintPart };

export interface OccupancyGrid {
  cell: number;
  nx: number;
  nz: number;
  originX: number; // local X of cell (0,0)'s min corner
  originZ: number;
  cells: number[]; // nx*nz, row-major (iz*nx + ix); 1 = occupied
}

export interface FootprintTrace {
  hull: Vec2[];
  parts: FootprintPart[];
  concave: boolean;
}

/** Andrew's monotone-chain convex hull of XZ points (counter-clockwise-ish). */
export function convexHull2D(input: Vec2[]): Vec2[] {
  const p = input.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p.slice();
  const cross = (o: Vec2, a: Vec2, b: Vec2): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: Vec2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Signed area magnitude of a simple polygon (shoelace). */
export function polygonArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/** Drop the least-significant hull vertices (smallest ear) until ≤ max. */
export function decimateHull(pts: Vec2[], max: number): Vec2[] {
  const p = pts.slice();
  while (p.length > max) {
    let bestI = 0;
    let bestArea = Infinity;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length];
      const b = p[i];
      const c = p[(i + 1) % p.length];
      const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      if (area < bestArea) {
        bestArea = area;
        bestI = i;
      }
    }
    p.splice(bestI, 1);
  }
  return p;
}

interface Bounds2 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Rasterise a point cloud into a binary occupancy grid, dilated by `dilate` cells
 *  so thin/sparse features stay solid (no pinholes the animal could slip through). */
export function rasterizePoints(pts: Vec2[], bounds: Bounds2, cellsAcross: number, dilate = 1): OccupancyGrid {
  const spanX = Math.max(1e-4, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1e-4, bounds.maxZ - bounds.minZ);
  const cell = Math.max(spanX, spanZ) / Math.max(1, cellsAcross);
  const nx = Math.max(1, Math.ceil(spanX / cell));
  const nz = Math.max(1, Math.ceil(spanZ / cell));
  const raw = new Array<number>(nx * nz).fill(0);
  for (const [x, z] of pts) {
    const ix = Math.min(nx - 1, Math.max(0, Math.floor((x - bounds.minX) / cell)));
    const iz = Math.min(nz - 1, Math.max(0, Math.floor((z - bounds.minZ) / cell)));
    raw[iz * nx + ix] = 1;
  }
  let cells = raw;
  for (let d = 0; d < dilate; d++) {
    const next = cells.slice();
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        if (!cells[iz * nx + ix]) continue;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const jx = ix + dx;
            const jz = iz + dz;
            if (jx >= 0 && jx < nx && jz >= 0 && jz < nz) next[jz * nx + jx] = 1;
          }
        }
      }
    }
    cells = next;
  }
  return { cell, nx, nz, originX: bounds.minX, originZ: bounds.minZ, cells };
}

/** Fill ENCLOSED holes: flood the exterior in from the border through empty cells;
 *  any empty cell NOT reachable from the border is interior → mark it solid. This
 *  turns a surface-vertex outline into a filled footprint, so a solid squat prop
 *  reads as convex while a branchy one (whose gaps open to the border) stays sparse. */
export function fillEnclosed(grid: OccupancyGrid): OccupancyGrid {
  const { nx, nz, cells } = grid;
  const exterior = new Array<boolean>(nx * nz).fill(false);
  const stack: number[] = [];
  const push = (ix: number, iz: number): void => {
    if (ix < 0 || ix >= nx || iz < 0 || iz >= nz) return;
    const i = iz * nx + ix;
    if (cells[i] || exterior[i]) return;
    exterior[i] = true;
    stack.push(i);
  };
  for (let ix = 0; ix < nx; ix++) {
    push(ix, 0);
    push(ix, nz - 1);
  }
  for (let iz = 0; iz < nz; iz++) {
    push(0, iz);
    push(nx - 1, iz);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const ix = i % nx;
    const iz = (i / nx) | 0;
    push(ix - 1, iz);
    push(ix + 1, iz);
    push(ix, iz - 1);
    push(ix, iz + 1);
  }
  const filled = cells.map((c, i) => (c || !exterior[i] ? 1 : 0));
  return { ...grid, cells: filled };
}

/** Largest all-occupied axis-aligned rectangle in a binary grid (histogram method).
 *  Returns cell coords {x0,z0,w,h} or null if the grid is empty. */
function largestRect(cells: number[], nx: number, nz: number): { x0: number; z0: number; w: number; h: number } | null {
  const height = new Array<number>(nx).fill(0);
  let best: { x0: number; z0: number; w: number; h: number } | null = null;
  let bestArea = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) height[ix] = cells[iz * nx + ix] ? height[ix] + 1 : 0;
    // Largest rectangle in this histogram row.
    const stack: number[] = [];
    for (let ix = 0; ix <= nx; ix++) {
      const h = ix < nx ? height[ix] : 0;
      while (stack.length && height[stack[stack.length - 1]] >= h) {
        const top = stack.pop()!;
        const hh = height[top];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const w = ix - left;
        const area = hh * w;
        if (area > bestArea) {
          bestArea = area;
          best = { x0: left, z0: iz - hh + 1, w, h: hh };
        }
      }
      stack.push(ix);
    }
  }
  return best;
}

/** Cover a binary occupancy grid with ≤ maxParts axis-aligned rectangles (greedy
 *  largest-rectangle). Empty cells are never covered ⇒ concave notches / gaps stay
 *  open. If the cap is hit with cells left over, one final part bounds the rest. */
export function rectangleCover(grid: OccupancyGrid, maxParts: number): FootprintPart[] {
  const { cell, nx, nz, originX, originZ } = grid;
  const work = grid.cells.slice();
  const parts: FootprintPart[] = [];
  const toPart = (r: { x0: number; z0: number; w: number; h: number }): FootprintPart => ({
    cx: originX + (r.x0 + r.w / 2) * cell,
    cz: originZ + (r.z0 + r.h / 2) * cell,
    hx: (r.w * cell) / 2,
    hz: (r.h * cell) / 2,
  });
  while (parts.length < maxParts) {
    const r = largestRect(work, nx, nz);
    if (!r || r.w === 0 || r.h === 0) break;
    parts.push(toPart(r));
    for (let iz = r.z0; iz < r.z0 + r.h; iz++) for (let ix = r.x0; ix < r.x0 + r.w; ix++) work[iz * nx + ix] = 0;
  }
  // Any residue (cap hit): bound it with one rect so nothing is left uncovered. If
  // we're already at the cap, MERGE it into the last part (union bbox) so the part
  // count is never exceeded — a coarse fallback only for pathological shapes.
  let minIx = nx;
  let maxIx = -1;
  let minIz = nz;
  let maxIz = -1;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      if (!work[iz * nx + ix]) continue;
      minIx = Math.min(minIx, ix);
      maxIx = Math.max(maxIx, ix);
      minIz = Math.min(minIz, iz);
      maxIz = Math.max(maxIz, iz);
    }
  }
  if (maxIx >= 0) {
    const residue = toPart({ x0: minIx, z0: minIz, w: maxIx - minIx + 1, h: maxIz - minIz + 1 });
    if (parts.length < maxParts) {
      parts.push(residue);
    } else if (parts.length > 0) {
      const last = parts[parts.length - 1];
      const nMinX = Math.min(last.cx - last.hx, residue.cx - residue.hx);
      const nMaxX = Math.max(last.cx + last.hx, residue.cx + residue.hx);
      const nMinZ = Math.min(last.cz - last.hz, residue.cz - residue.hz);
      const nMaxZ = Math.max(last.cz + last.hz, residue.cz + residue.hz);
      parts[parts.length - 1] = { cx: (nMinX + nMaxX) / 2, cz: (nMinZ + nMaxZ) / 2, hx: (nMaxX - nMinX) / 2, hz: (nMaxZ - nMinZ) / 2 };
    }
  }
  return parts;
}

/** Fraction of the occupancy grid's cells that are solid, within its hull area. */
function fillRatio(grid: OccupancyGrid, hullArea: number): number {
  let occ = 0;
  for (const c of grid.cells) occ += c;
  const occArea = occ * grid.cell * grid.cell;
  if (hullArea < 1e-6) return 1;
  return Math.min(1, occArea / hullArea);
}

const CONCAVE_FILL_THRESHOLD = 0.82;
const MAX_HULL_POINTS = 14;

// ─────────────────────────────────────────────────────────────────────────────
// TRUE ASSET-SHAPE CONTOUR TRACING (the accurate path).
//
// The convex-hull / rectangle system above APPROXIMATES the silhouette. To make
// the collision debug look like the REAL asset (not a cylinder/box/hull), we
// instead rasterise the projected mesh TRIANGLES (filled, not just vertices) into
// a high-res occupancy grid and extract the boundary with MARCHING SQUARES → a
// tight polygon that traces every bump + leaves genuine gaps open. This exact
// contour is the SINGLE SOURCE used for collision, navigation, body probes AND
// the debug overlay — so the debug line proves what the animal actually hits.
// ─────────────────────────────────────────────────────────────────────────────

/** Sign of the cross product (p-b)×(a-b) — >0 / <0 tells which side of edge ab. */
function edgeSign(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  return (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
}

/** Is point (px,pz) inside (or on) triangle abc? (winding-agnostic sign test). */
function pointInTriangle(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): boolean {
  const d1 = edgeSign(px, pz, ax, az, bx, bz);
  const d2 = edgeSign(px, pz, bx, bz, cx, cz);
  const d3 = edgeSign(px, pz, cx, cz, ax, az);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Bounds of a set of triangles' vertices (XZ). */
function trianglesBounds(tris: Vec2[][]): Bounds2 | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const t of tris) {
    for (const [x, z] of t) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxZ <= minZ) return null;
  return { minX, maxX, minZ, maxZ };
}

/**
 * Rasterise FILLED triangles into a binary occupancy grid: a cell is solid if its
 * CENTRE falls inside any triangle. This is the key difference from
 * `rasterizePoints` — the interior of each face is filled, so a solid mesh reads as
 * a solid silhouette (no pinholes from sparse vertices). `dilate` optionally grows
 * the mask to close sub-cell cracks between adjacent faces.
 */
export function rasterizeTriangles(tris: Vec2[][], bounds: Bounds2, cellsAcross: number, dilate = 0): OccupancyGrid {
  const spanX = Math.max(1e-4, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1e-4, bounds.maxZ - bounds.minZ);
  const cell = Math.max(spanX, spanZ) / Math.max(1, cellsAcross);
  const nx = Math.max(1, Math.ceil(spanX / cell));
  const nz = Math.max(1, Math.ceil(spanZ / cell));
  const cells = new Array<number>(nx * nz).fill(0);
  for (const t of tris) {
    if (t.length < 3) continue;
    const [a, b, c] = t;
    // Only scan the cells overlapping this triangle's bbox (cheap for big grids).
    const tMinX = Math.min(a[0], b[0], c[0]);
    const tMaxX = Math.max(a[0], b[0], c[0]);
    const tMinZ = Math.min(a[1], b[1], c[1]);
    const tMaxZ = Math.max(a[1], b[1], c[1]);
    const ix0 = Math.max(0, Math.floor((tMinX - bounds.minX) / cell));
    const ix1 = Math.min(nx - 1, Math.floor((tMaxX - bounds.minX) / cell));
    const iz0 = Math.max(0, Math.floor((tMinZ - bounds.minZ) / cell));
    const iz1 = Math.min(nz - 1, Math.floor((tMaxZ - bounds.minZ) / cell));
    for (let iz = iz0; iz <= iz1; iz++) {
      const pz = bounds.minZ + (iz + 0.5) * cell;
      for (let ix = ix0; ix <= ix1; ix++) {
        if (cells[iz * nx + ix]) continue;
        const px = bounds.minX + (ix + 0.5) * cell;
        if (pointInTriangle(px, pz, a[0], a[1], b[0], b[1], c[0], c[1])) cells[iz * nx + ix] = 1;
      }
    }
  }
  let out: OccupancyGrid = { cell, nx, nz, originX: bounds.minX, originZ: bounds.minZ, cells };
  for (let d = 0; d < dilate; d++) out = dilateGrid(out);
  return out;
}

/** Grow the solid region by one cell (8-connected). */
function dilateGrid(grid: OccupancyGrid): OccupancyGrid {
  const { nx, nz, cells } = grid;
  const next = cells.slice();
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      if (!cells[iz * nx + ix]) continue;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const jx = ix + dx;
          const jz = iz + dz;
          if (jx >= 0 && jx < nx && jz >= 0 && jz < nz) next[jz * nx + jx] = 1;
        }
      }
    }
  }
  return { ...grid, cells: next };
}

// Marching-squares segment table: case = tl|tr<<1|br<<2|bl<<3 (corner solid bits).
// Each entry lists the pairs of cell EDGES the boundary crosses. Edges: 0=Top
// (tl-tr), 1=Right (tr-br), 2=Bottom (br-bl), 3=Left (bl-tl).
const MS_TABLE: number[][][] = [
  [], // 0000
  [[3, 0]], // 0001 tl
  [[0, 1]], // 0010 tr
  [[3, 1]], // 0011 tl,tr
  [[1, 2]], // 0100 br
  [[3, 0], [1, 2]], // 0101 tl,br (ambiguous)
  [[0, 2]], // 0110 tr,br
  [[3, 2]], // 0111 tl,tr,br
  [[2, 3]], // 1000 bl
  [[0, 2]], // 1001 tl,bl
  [[0, 1], [2, 3]], // 1010 tr,bl (ambiguous)
  [[1, 2]], // 1011 tl,tr,bl -> br empty -> R,B
  [[1, 3]], // 1100 br,bl
  [[0, 1]], // 1101 tl,br,bl -> tr empty -> T,R
  [[3, 0]], // 1110 tr,br,bl -> tl empty -> L,T
  [], // 1111
];

/**
 * MARCHING SQUARES over a binary occupancy grid → one or more CLOSED contour loops
 * (local coordinates, no repeated closing point). Samples sit at cell centres;
 * out-of-range samples are treated as empty so solids touching the grid border are
 * still enclosed. Disconnected solid regions yield separate loops; enclosed holes
 * yield inner loops — so genuine gaps between branches are never bridged.
 */
export function marchingSquares(grid: OccupancyGrid): Vec2[][] {
  const { cell, nx, nz, originX, originZ, cells } = grid;
  const sample = (ix: number, iz: number): number =>
    ix < 0 || ix >= nx || iz < 0 || iz >= nz ? 0 : cells[iz * nx + ix];
  // Sample (ix,iz) is a cell centre at local (originX+(ix+0.5)*cell, ...). An edge
  // midpoint at sample-space (sx,sz) maps to local (originX+(sx+0.5)*cell, ...).
  const q = cell * 1e-3;
  const pts = new Map<string, Vec2>();
  const keyOf = (sx: number, sz: number): string => {
    const lx = originX + (sx + 0.5) * cell;
    const lz = originZ + (sz + 0.5) * cell;
    const k = `${Math.round(lx / q)}|${Math.round(lz / q)}`;
    if (!pts.has(k)) pts.set(k, [lx, lz]);
    return k;
  };
  // Edge midpoints for marching cell at (ix,iz): 0=T,1=R,2=B,3=L.
  const edgeKey = (ix: number, iz: number, e: number): string => {
    switch (e) {
      case 0:
        return keyOf(ix + 0.5, iz);
      case 1:
        return keyOf(ix + 1, iz + 0.5);
      case 2:
        return keyOf(ix + 0.5, iz + 1);
      default:
        return keyOf(ix, iz + 0.5);
    }
  };
  const segs: [string, string][] = [];
  for (let iz = -1; iz < nz; iz++) {
    for (let ix = -1; ix < nx; ix++) {
      const tl = sample(ix, iz);
      const tr = sample(ix + 1, iz);
      const br = sample(ix + 1, iz + 1);
      const bl = sample(ix, iz + 1);
      const c = tl | (tr << 1) | (br << 2) | (bl << 3);
      for (const [e1, e2] of MS_TABLE[c]) {
        const k1 = edgeKey(ix, iz, e1);
        const k2 = edgeKey(ix, iz, e2);
        if (k1 !== k2) segs.push([k1, k2]);
      }
    }
  }
  // Chain segments into closed loops via a shared-endpoint adjacency walk.
  const adj = new Map<string, number[]>();
  segs.forEach((s, i) => {
    (adj.get(s[0]) ?? adj.set(s[0], []).get(s[0])!).push(i);
    (adj.get(s[1]) ?? adj.set(s[1], []).get(s[1])!).push(i);
  });
  const used = new Array<boolean>(segs.length).fill(false);
  const loops: Vec2[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const start = segs[i][0];
    const loopKeys = [start];
    let cur = segs[i][1];
    for (;;) {
      loopKeys.push(cur);
      if (cur === start) break;
      const nextSeg = (adj.get(cur) ?? []).find((j) => !used[j]);
      if (nextSeg === undefined) break;
      used[nextSeg] = true;
      const [a, b] = segs[nextSeg];
      cur = a === cur ? b : a;
    }
    if (loopKeys[loopKeys.length - 1] === loopKeys[0]) loopKeys.pop();
    if (loopKeys.length >= 3) loops.push(loopKeys.map((k) => pts.get(k)!));
  }
  return loops;
}

/** Perpendicular distance from p to the line through a→b. */
function perpDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / len;
}

/** Ramer–Douglas–Peucker simplification of an OPEN polyline. */
function rdp(pts: Vec2[], eps: number): Vec2[] {
  if (pts.length < 3) return pts.slice();
  let idx = -1;
  let max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max > eps && idx > 0) {
    const left = rdp(pts.slice(0, idx + 1), eps);
    const right = rdp(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length - 1]];
}

/**
 * Simplify a CLOSED polygon (Douglas–Peucker) — drops near-collinear points while
 * preserving corners + area. Split the ring at its two most distant points so DP
 * (an open-polyline algorithm) keeps the overall shape.
 */
export function simplifyPolygon(pts: Vec2[], eps: number): Vec2[] {
  const n = pts.length;
  if (n <= 4) return pts.slice();
  let far = 0;
  let fd = -1;
  for (let i = 1; i < n; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const a = pts.slice(0, far + 1);
  const b = pts.slice(far).concat([pts[0]]);
  const sa = rdp(a, eps);
  const sb = rdp(b, eps);
  const out = sa.slice(0, -1).concat(sb.slice(0, -1));
  return out.length >= 3 ? out : pts.slice();
}

/** Ray-cast point-in-polygon test (handles CONCAVE polygons + any winding). */
export function pointInPolygon(pts: Vec2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const zi = pts[i][1];
    const xj = pts[j][0];
    const zj = pts[j][1];
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Simplify a loop, escalating epsilon until it fits under `maxPoints` — keeps the
 *  real shape (corners survive RDP) while bounding the solver's per-edge cost. */
function capLoopPoints(loop: Vec2[], eps: number, maxPoints: number): Vec2[] {
  let out = simplifyPolygon(loop, eps);
  let guard = 0;
  while (out.length > maxPoints && guard++ < 12) {
    eps *= 1.6;
    out = simplifyPolygon(loop, eps);
  }
  return out;
}

/**
 * FULL PIPELINE: projected mesh triangles → filled occupancy grid (enclosed holes
 * filled — the SILHOUETTE is what the player sees) → marching-squares contour(s) →
 * light Douglas–Peucker simplification. Returns tight local-frame contour loops
 * that trace the real outline (each closed, no repeated point).
 *
 * BOUNDED on purpose: real GLBs are noisy (a succulent's leaves can scatter into
 * dozens of specks), and every extra loop/point multiplies the collision +
 * navigation cost each frame. So: keep only the `maxLoops` LARGEST loops, drop
 * speckle below 2% of the main silhouette, and cap each loop at `maxPoints`
 * (corners survive, so the shape still reads as the real asset).
 */
export function traceContours(tris: Vec2[][], cellsAcross = 128, maxLoops = 6, maxPoints = 56): Vec2[][] {
  const bounds = trianglesBounds(tris);
  if (!bounds) return [];
  const grid = fillEnclosed(rasterizeTriangles(tris, bounds, cellsAcross, 0));
  const raw = marchingSquares(grid);
  const eps = grid.cell * 1.2; // simplify only slightly — keep the real shape
  const minArea = grid.cell * grid.cell * 2; // drop sub-cell speckle
  const scored = raw
    .map((loop) => ({ loop, area: polygonArea(loop) }))
    .filter((s) => s.area >= minArea)
    .sort((a, b) => b.area - a.area)
    .slice(0, maxLoops);
  const largest = scored.length > 0 ? scored[0].area : 0;
  const out: Vec2[][] = [];
  for (const { loop, area } of scored) {
    if (area < largest * 0.02) continue; // noise next to the main silhouette
    const s = capLoopPoints(loop, eps, maxPoints);
    if (s.length >= 3) out.push(s);
  }
  return out;
}

/**
 * WALL contours for a HIDE: trace only the mesh material in the animal's BODY
 * HEIGHT BAND (above the floor plate/sill, below the roof arch). The full
 * silhouette trace is wrong for a dome — the roof covers everything in plan,
 * so the pocket/mouth read as solid (or, decimated, as a leaky partial blob).
 * Band-filtering makes the collision EXACTLY what the user sees at gecko
 * height: a closed wall ring, with the entrance gap + interior pocket open —
 * impossible to walk through anywhere except the mouth. NO hole-filling: a
 * mouth gap keeps the band simply-connected (one concave loop), so the pocket
 * is never swallowed by an outer loop.
 */
export function traceWallContours(tris: Vec3[][], cellsAcross = 128, maxLoops = 10, maxPoints = 120): Vec2[][] {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of tris) {
    for (const [, y] of t) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const span = maxY - minY;
  if (!Number.isFinite(span) || span <= 1e-6) return [];
  const lo = minY + span * 0.22; // above the floor plate + entrance sill + skirt
  const hi = minY + span * 0.5; // below the mouth arch — the body-height band
  const band = tris.filter((t) => {
    if (t.length < 3) return false;
    let tMin = Infinity;
    let tMax = -Infinity;
    for (const [, y] of t) {
      if (y < tMin) tMin = y;
      if (y > tMax) tMax = y;
    }
    return tMin <= hi && tMax >= lo;
  });
  if (band.length === 0) return [];
  const tris2 = band.map((t) => t.map(([x, , z]) => [x, z] as Vec2));
  const bounds = trianglesBounds(tris2);
  if (!bounds) return [];
  // NO fillEnclosed — the pocket must stay open space.
  const grid = rasterizeTriangles(tris2, bounds, cellsAcross, 0);
  const raw = marchingSquares(grid);
  // Walls are THIN, SNAKY loops — treat them differently from silhouettes:
  // simplify only gently (heavy decimation bridges the mouth shut), and NEVER
  // area-cull relative to the largest loop — a thin wall arc has tiny area
  // next to the outer shell, yet dropping it opens a walk-through hole. Only
  // sub-cell speckle goes.
  const eps = grid.cell * 0.9;
  const minArea = grid.cell * grid.cell * 4;
  const scored = raw
    .map((loop) => ({ loop, area: polygonArea(loop) }))
    .filter((s) => s.area >= minArea)
    .sort((a, b) => b.area - a.area)
    .slice(0, maxLoops);
  const out: Vec2[][] = [];
  for (const { loop } of scored) {
    const s = capLoopPoints(loop, eps, maxPoints);
    if (s.length >= 3) out.push(s);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE HEIGHTFIELD — per-point collision HEIGHTS measured from the real mesh.
//
// The contour above answers "WHERE is the prop solid" (XZ silhouette). This
// answers "HOW HIGH is its surface at each point": the mesh triangles are
// rasterised into a grid that keeps, per cell, the MAX surface Y (the top the
// animal stands on) and the MIN surface Y (the underside — an elevated branch
// span has a high bottom, so the animal can walk UNDER it; a grounded rock has
// bottom ≈ 0). This is the standard AAA walkable-surface model: a sloped rock
// lifts the animal by its true local height on each side, never one flat top.
// ─────────────────────────────────────────────────────────────────────────────

export interface FootprintHeightField {
  originX: number; // local X of cell (0,0)'s min corner
  originZ: number;
  cell: number;
  nx: number;
  nz: number;
  /** Per cell: highest mesh surface Y (NaN = mesh doesn't cover this cell). */
  top: number[];
  /** Per cell: lowest mesh surface Y — the underside at this column. */
  bottom: number[];
}

/**
 * Rasterise 3D mesh triangles (local frame, natural display size — the SAME
 * frame `traceContours` uses) into a surface heightfield. Every covered cell
 * stores the interpolated triangle-plane Y (max → top, min → bottom); triangle
 * vertices are also stamped so near-vertical wall slivers still contribute.
 * One value-dilation pass fills empty border cells from their solid neighbours
 * so bilinear sampling stays robust at the silhouette edge.
 */
export function buildHeightField(tris: Vec3[][], cellsAcross = 112): FootprintHeightField | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const t of tris) {
    for (const [x, , z] of t) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxZ <= minZ) return null;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const cell = Math.max(spanX, spanZ) / Math.max(1, cellsAcross);
  const nx = Math.max(1, Math.ceil(spanX / cell));
  const nz = Math.max(1, Math.ceil(spanZ / cell));
  const top = new Array<number>(nx * nz).fill(NaN);
  const bottom = new Array<number>(nx * nz).fill(NaN);
  const stamp = (ix: number, iz: number, y: number): void => {
    if (ix < 0 || ix >= nx || iz < 0 || iz >= nz) return;
    const i = iz * nx + ix;
    top[i] = Number.isNaN(top[i]) ? y : Math.max(top[i], y);
    bottom[i] = Number.isNaN(bottom[i]) ? y : Math.min(bottom[i], y);
  };
  for (const t of tris) {
    if (t.length < 3) continue;
    const [a, b, c] = t;
    // Vertex stamps — near-vertical triangles (rock walls) project to a sliver
    // that misses every cell centre; their vertices still record the wall's span.
    stamp(Math.floor((a[0] - minX) / cell), Math.floor((a[2] - minZ) / cell), a[1]);
    stamp(Math.floor((b[0] - minX) / cell), Math.floor((b[2] - minZ) / cell), b[1]);
    stamp(Math.floor((c[0] - minX) / cell), Math.floor((c[2] - minZ) / cell), c[1]);
    // Barycentric plane interpolation across the cells the triangle covers.
    const den = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(den) < 1e-12) continue; // degenerate in XZ → vertices were enough
    const ix0 = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - minX) / cell));
    const ix1 = Math.min(nx - 1, Math.floor((Math.max(a[0], b[0], c[0]) - minX) / cell));
    const iz0 = Math.max(0, Math.floor((Math.min(a[2], b[2], c[2]) - minZ) / cell));
    const iz1 = Math.min(nz - 1, Math.floor((Math.max(a[2], b[2], c[2]) - minZ) / cell));
    for (let iz = iz0; iz <= iz1; iz++) {
      const pz = minZ + (iz + 0.5) * cell;
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = minX + (ix + 0.5) * cell;
        const w0 = ((b[2] - c[2]) * (px - c[0]) + (c[0] - b[0]) * (pz - c[2])) / den;
        const w1 = ((c[2] - a[2]) * (px - c[0]) + (a[0] - c[0]) * (pz - c[2])) / den;
        const w2 = 1 - w0 - w1;
        const eps = -1e-4;
        if (w0 < eps || w1 < eps || w2 < eps) continue; // cell centre outside
        stamp(ix, iz, w0 * a[1] + w1 * b[1] + w2 * c[1]);
      }
    }
  }
  // One dilation pass: give empty edge cells their solid neighbours' values so a
  // query right on the silhouette boundary doesn't fall into a NaN hole.
  const dTop = top.slice();
  const dBottom = bottom.slice();
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      if (!Number.isNaN(top[i])) continue;
      let t = NaN;
      let bo = NaN;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const jx = ix + dx;
          const jz = iz + dz;
          if (jx < 0 || jx >= nx || jz < 0 || jz >= nz) continue;
          const j = jz * nx + jx;
          if (Number.isNaN(top[j])) continue;
          t = Number.isNaN(t) ? top[j] : Math.max(t, top[j]);
          bo = Number.isNaN(bo) ? bottom[j] : Math.min(bo, bottom[j]);
        }
      }
      dTop[i] = t;
      dBottom[i] = bo;
    }
  }
  return { originX: minX, originZ: minZ, cell, nx, nz, top: dTop, bottom: dBottom };
}

/**
 * Bilinear surface query at a LOCAL point: the mesh's top + underside heights
 * there, or null where the mesh doesn't cover the point. Empty neighbour cells
 * simply drop out of the weighting, so the edge of the silhouette stays exact.
 */
export function sampleHeightField(hf: FootprintHeightField, x: number, z: number): { top: number; bottom: number } | null {
  const u = (x - hf.originX) / hf.cell - 0.5;
  const v = (z - hf.originZ) / hf.cell - 0.5;
  const ix0 = Math.floor(u);
  const iz0 = Math.floor(v);
  const fx = u - ix0;
  const fz = v - iz0;
  let wSum = 0;
  let topSum = 0;
  let botSum = 0;
  for (let dz = 0; dz <= 1; dz++) {
    for (let dx = 0; dx <= 1; dx++) {
      const ix = ix0 + dx;
      const iz = iz0 + dz;
      if (ix < 0 || ix >= hf.nx || iz < 0 || iz >= hf.nz) continue;
      const i = iz * hf.nx + ix;
      const t = hf.top[i];
      if (Number.isNaN(t)) continue;
      const w = (dx ? fx : 1 - fx) * (dz ? fz : 1 - fz);
      if (w <= 1e-6) continue;
      wSum += w;
      topSum += t * w;
      botSum += hf.bottom[i] * w;
    }
  }
  if (wSum < 0.25) return null; // mostly off the mesh → not covered
  return { top: topSum / wSum, bottom: botSum / wSum };
}

/**
 * The INTERIOR-FLOOR heightfield of a hide: only its upward-facing LOW surfaces
 * (raised floor plates, entrance sills). The dome ROOF covers the pocket in
 * plan, so the regular top/bottom field can only see the roof there — this
 * dedicated field is how standing height INSIDE a hide reads the REAL floor
 * (the animal lies ON the plate and steps OVER the sill, never through them).
 */
export function buildFloorField(tris: Vec3[][], cellsAcross = 112): FootprintHeightField | null {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of tris) {
    for (const [, y] of t) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minY) || maxY <= minY) return null;
  // Floors + sills live in the mesh's lower band; anything higher is wall/roof.
  const lowCap = minY + (maxY - minY) * 0.42;
  const floors = tris.filter((t) => {
    if (t.length < 3) return false;
    const [a, b, c] = t;
    if (Math.max(a[1], b[1], c[1]) > lowCap) return false;
    // Horizontal-ish faces only (|normal.y| — GLB winding varies).
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nxc = uy * vz - uz * vy;
    const nyc = uz * vx - ux * vz;
    const nzc = ux * vy - uy * vx;
    const len = Math.hypot(nxc, nyc, nzc);
    return len > 1e-12 && Math.abs(nyc) / len > 0.35;
  });
  if (floors.length === 0) return null;
  return buildHeightField(floors, cellsAcross);
}

// Per-asset registry: heightfields are measured ONCE per GLB file at load time
// (they're a few thousand numbers — far too heavy to persist per placed object)
// and looked up here by the collision compiler via `PlacedObject.asset`.
const HEIGHT_FIELDS = new Map<string, FootprintHeightField>();
const FLOOR_FIELDS = new Map<string, FootprintHeightField>();

export function registerHeightField(assetKey: string, hf: FootprintHeightField): void {
  HEIGHT_FIELDS.set(assetKey, hf);
}
export function getHeightField(assetKey: string): FootprintHeightField | undefined {
  return HEIGHT_FIELDS.get(assetKey);
}
export function registerFloorField(assetKey: string, hf: FootprintHeightField): void {
  FLOOR_FIELDS.set(assetKey, hf);
}
export function getFloorField(assetKey: string): FootprintHeightField | undefined {
  return FLOOR_FIELDS.get(assetKey);
}
export function clearHeightFields(): void {
  HEIGHT_FIELDS.clear();
  FLOOR_FIELDS.clear();
}

/**
 * Trace a footprint from projected XZ vertices: a convex hull, plus — when the shape
 * is CONCAVE (fills < 82% of its hull) — a multi-part rectangle decomposition that
 * follows the real outline (branchy driftwood → several tight rects, not one hull).
 */
export function traceFootprint(vertsXZ: Vec2[], cellsAcross = 16, maxParts = 12): FootprintTrace {
  const hull = decimateHull(convexHull2D(vertsXZ), MAX_HULL_POINTS);
  if (hull.length < 3) return { hull, parts: [], concave: false };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of vertsXZ) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  // Dilate by 1 to close the sampled outline, then fill enclosed holes so a solid
  // prop reads as filled (convex) and only genuine gaps (open to the border) stay
  // empty (concave → decompose into rects that skip those gaps).
  const grid = fillEnclosed(rasterizePoints(vertsXZ, { minX, maxX, minZ, maxZ }, cellsAcross, 1));
  const concave = fillRatio(grid, polygonArea(hull)) < CONCAVE_FILL_THRESHOLD;
  const parts = concave ? rectangleCover(grid, maxParts) : [];
  return { hull, parts, concave };
}

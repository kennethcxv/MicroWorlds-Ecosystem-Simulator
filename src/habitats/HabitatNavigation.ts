/**
 * GLASSWATER — pure NAVIGATION / path planning for habitat animals (no Three.js /
 * DOM). The movement brain uses this to route the gecko AROUND blocked obstacles
 * instead of pushing into them forever.
 *
 * Approach (deliberately the simplest robust one for a small terrarium): a tiny
 * VISIBILITY GRAPH. We sample a ring of candidate waypoints around every hard
 * obstacle (inflated by the animal's body radius + a clearance gap), keep the ones
 * that are free + in-bounds, and pre-connect any two that can "see" each other
 * (straight line clear of hard obstacles). A path is then:
 *   - a straight walk if the animal can already see the target, else
 *   - Dijkstra over {start, target, ring waypoints} using line-of-sight edges.
 *
 * This gives natural "go around the rock" routes with 1–6 waypoints, is fully
 * deterministic, and is unit-tested. Climbable / low obstacles are NOT in the
 * graph (they aren't "hard"), so the planner is free to route straight across them
 * — the animal climbs over rather than around.
 */
import type { CollisionWorld } from "./HabitatCollision";

const TAU = Math.PI * 2;

/** Smallest circle enclosing two circles (used to merge one prop's volumes). */
function mergeCircles(
  a: { cx: number; cz: number; r: number },
  b: { cx: number; cz: number; r: number },
): { cx: number; cz: number; r: number } {
  const dx = b.cx - a.cx;
  const dz = b.cz - a.cz;
  const d = Math.hypot(dx, dz);
  if (a.r >= d + b.r) return a; // a already contains b
  if (b.r >= d + a.r) return b;
  const r = (d + a.r + b.r) / 2;
  const t = d > 1e-9 ? (r - a.r) / d : 0;
  return { cx: a.cx + dx * t, cz: a.cz + dz * t, r };
}

export interface NavPoint {
  x: number;
  z: number;
}

/**
 * The most-enclosed free point deep inside a hide prop's merged circle — its
 * interior POCKET. Enclosure = how many of 8 rays hit a wall within the prop's
 * span; open ground near a decorative "hide" scores low and yields no pocket.
 */
function findPocket(
  world: CollisionWorld,
  bc: { cx: number; cz: number; r: number },
  radius: number,
): NavPoint | null {
  const step = Math.max(0.035, bc.r / 14);
  let best: NavPoint | null = null;
  let bestScore = -1;
  for (let gx = -bc.r; gx <= bc.r; gx += step) {
    for (let gz = -bc.r; gz <= bc.r; gz += step) {
      if (gx * gx + gz * gz > bc.r * bc.r * 0.64) continue; // deep inside only
      const x = bc.cx + gx;
      const z = bc.cz + gz;
      if (!world.isFree(x, z, radius)) continue;
      let enclosed = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        for (let d = 0.03; d <= bc.r + 0.05; d += 0.03) {
          if (world.isBlocked(x + dx * d, z + dz * d, 0.005)) {
            enclosed++;
            break;
          }
        }
      }
      const centerBias = 1 - Math.hypot(gx, gz) / Math.max(bc.r, 1e-6);
      const score = enclosed * 10 + centerBias;
      if (score > bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
  }
  // A pocket must be meaningfully enclosed (≥ 6 of 8 directions walled).
  return best && bestScore >= 60 ? best : null;
}

/**
 * The doorway corridor from an interior pocket out into the open: a bounded
 * grid-BFS flood from the pocket over free cells until it escapes the prop's
 * orbit, then the path back is STRING-PULLED (greedy furthest-visible) into a
 * few waypoints. A straight ray can't thread a curved doorway (offset outer
 * shell + inner mouth — the real cave); BFS threads ANY walkable gap, so if
 * the pocket is enterable at this body radius, the graph gets connected.
 */
function pocketCorridor(
  world: CollisionWorld,
  pocket: NavPoint,
  bc: { cx: number; cz: number; r: number },
  radius: number,
): NavPoint[] {
  // Fine lattice + 8-connectivity: a real doorway pinches to barely over the
  // body diameter — a coarse 4-connected flood can't thread it even though the
  // animal can.
  const step = 0.025;
  const reach = bc.r + radius + 0.25; // escape distance: past the ring orbit
  const half = Math.ceil(reach / step) + 1;
  const n = half * 2 + 1;
  const idx = (ix: number, iz: number) => iz * n + ix;
  const toXZ = (ix: number, iz: number): NavPoint => ({
    x: pocket.x + (ix - half) * step,
    z: pocket.z + (iz - half) * step,
  });
  const seen = new Int32Array(n * n).fill(-1); // parent cell index, -2 = start
  const q: number[] = [idx(half, half)];
  seen[idx(half, half)] = -2;
  let exit = -1;
  while (q.length > 0) {
    const cur = q.shift()!;
    const cx = cur % n;
    const cz = Math.floor(cur / n);
    const p = toXZ(cx, cz);
    if (Math.hypot(p.x - bc.cx, p.z - bc.cz) >= reach - step) {
      exit = cur;
      break;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const k = idx(nx, nz);
      if (seen[k] !== -1) continue;
      const w = toXZ(nx, nz);
      if (!world.isFree(w.x, w.z, radius)) {
        seen[k] = -3; // blocked, don't revisit
        continue;
      }
      seen[k] = cur;
      q.push(k);
    }
  }
  if (exit < 0) return []; // pocket is sealed at this radius — nothing to seed
  // Backtrack exit → pocket, then string-pull into the fewest visible legs.
  const raw: NavPoint[] = [];
  for (let cur = exit; cur >= 0; cur = seen[cur]) raw.push(toXZ(cur % n, Math.floor(cur / n)));
  raw.push(pocket);
  raw.reverse(); // pocket → exit
  const out: NavPoint[] = [];
  let at = 0;
  while (at < raw.length - 1) {
    let far = at + 1;
    for (let j = raw.length - 1; j > at; j--) {
      if (world.losClear(raw[at].x, raw[at].z, raw[j].x, raw[j].z, radius)) {
        far = j;
        break;
      }
    }
    out.push(raw[far]);
    at = far;
  }
  return out;
}

export interface NavConfig {
  /** Waypoints sampled around each obstacle's bounding circle. */
  ringPoints: number;
  /** Extra gap beyond (obstacle radius + body radius) so routes hug loosely. */
  clearance: number;
}

export const DEFAULT_NAV: NavConfig = { ringPoints: 12, clearance: 0.05 };

interface Edge {
  to: number;
  cost: number;
}

export class NavGraph {
  readonly nodes: NavPoint[] = [];
  private adj: Edge[][] = [];

  constructor(
    private world: CollisionWorld,
    private radius: number,
    cfg: NavConfig = DEFAULT_NAV,
  ) {
    // Ring waypoints around each hard PROP. A concave prop's exact-contour footprint
    // compiles to SEVERAL volumes sharing one object id — ring per volume would
    // multiply the nodes and blow up the O(n²) visibility pre-connect, so volumes
    // are merged into one enclosing circle per prop first.
    const props = new Map<string, { cx: number; cz: number; r: number }>();
    for (const ob of world.hard) {
      const bc = world.boundingCircle(ob);
      const cur = props.get(ob.id);
      props.set(ob.id, cur ? mergeCircles(cur, bc) : bc);
    }
    for (const bc of props.values()) {
      const rr = bc.r + radius + cfg.clearance;
      for (let k = 0; k < cfg.ringPoints; k++) {
        const a = (k / cfg.ringPoints) * TAU;
        const x = bc.cx + Math.cos(a) * rr;
        const z = bc.cz + Math.sin(a) * rr;
        if (world.isFree(x, z, radius)) this.nodes.push({ x, z });
      }
    }
    // PERIMETER LANE: nodes along the glass walls. Props never sit flush
    // against the glass, so the wall lane is the tank's least-obstructed
    // highway — it stitches together regions a big solid centre prop would
    // otherwise split into disconnected islands (e.g. the alcove behind a
    // walled hide vs the open sand on the other side).
    const b = world.bounds;
    const inset = radius + cfg.clearance + 0.02;
    for (let x = b.minX + inset; x <= b.maxX - inset + 1e-6; x += 0.3) {
      for (const z of [b.minZ + inset, b.maxZ - inset]) {
        if (world.isFree(x, z, radius)) this.nodes.push({ x, z });
      }
    }
    for (let z = b.minZ + inset; z <= b.maxZ - inset + 1e-6; z += 0.3) {
      for (const x of [b.minX + inset, b.maxX - inset]) {
        if (world.isFree(x, z, radius)) this.nodes.push({ x, z });
      }
    }
    // ENTERABLE POCKETS (hides): every ring waypoint sits OUTSIDE its prop, so
    // a sheltered interior behind a doorway is invisible to the graph — no node
    // has line-of-sight in, and any path to an anchor inside fails (the animal
    // would never actually enter its hide). For each hide prop: find the
    // interior pocket (most-enclosed free point inside the merged circle) and
    // seed a CORRIDOR of waypoints from it out through the mouth (the longest
    // free straight run), plus one bend spur where the corridor ends. They join
    // the normal LOS pre-connect below, so routes thread the doorway — in AND out.
    const hides = new Map<string, { cx: number; cz: number; r: number }>();
    for (const ob of world.hard) {
      if (ob.interaction !== "hide") continue;
      const bc = world.boundingCircle(ob);
      const cur = hides.get(ob.id);
      hides.set(ob.id, cur ? mergeCircles(cur, bc) : bc);
    }
    for (const bc of hides.values()) {
      const pocket = findPocket(world, bc, radius);
      if (!pocket) continue;
      this.nodes.push(pocket);
      for (const n of pocketCorridor(world, pocket, bc, radius)) this.nodes.push(n);
    }
    // Pre-connect mutually visible waypoints (static graph).
    this.adj = this.nodes.map(() => []);
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i];
        const b = this.nodes[j];
        if (world.losClear(a.x, a.z, b.x, b.z, radius)) {
          const cost = Math.hypot(b.x - a.x, b.z - a.z);
          this.adj[i].push({ to: j, cost });
          this.adj[j].push({ to: i, cost });
        }
      }
    }
  }

  get nodeCount(): number {
    return this.nodes.length;
  }

  /**
   * Waypoints to walk from `from` to `to`: EXCLUDING the start, INCLUDING the
   * target as the last point. Returns `[to]` for a straight shot, a routed list
   * for a detour, or `null` if no route exists (⇒ the caller treats `to` as
   * temporarily unreachable and picks something else).
   */
  findPath(from: NavPoint, to: NavPoint): NavPoint[] | null {
    if (this.world.losClear(from.x, from.z, to.x, to.z, this.radius)) {
      return [{ x: to.x, z: to.z }];
    }
    const n = this.nodes.length;
    if (n === 0) return this.gridFallback(from, to);

    // Dijkstra over virtual START (index n) and GOAL (index n+1) plus ring nodes.
    const START = n;
    const GOAL = n + 1;
    const dist = new Array<number>(n + 2).fill(Infinity);
    const prev = new Array<number>(n + 2).fill(-1);
    const done = new Array<boolean>(n + 2).fill(false);

    // Edges from START to any visible node, and node→GOAL where visible.
    const startEdges: Edge[] = [];
    const goalVisible = new Array<boolean>(n).fill(false);
    for (let i = 0; i < n; i++) {
      const node = this.nodes[i];
      if (this.world.losClear(from.x, from.z, node.x, node.z, this.radius)) {
        startEdges.push({ to: i, cost: Math.hypot(node.x - from.x, node.z - from.z) });
      }
      if (this.world.losClear(node.x, node.z, to.x, to.z, this.radius)) {
        goalVisible[i] = true;
      }
    }
    if (startEdges.length === 0) return this.gridFallback(from, to);

    const edgesFrom = (u: number): Edge[] => {
      if (u === START) return startEdges;
      if (u === GOAL) return [];
      const out = this.adj[u].slice();
      if (goalVisible[u]) out.push({ to: GOAL, cost: Math.hypot(this.nodes[u].x - to.x, this.nodes[u].z - to.z) });
      return out;
    };

    dist[START] = 0;
    for (;;) {
      // Extract the nearest unfinished vertex (linear scan — the graph is tiny).
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < n + 2; i++) {
        if (!done[i] && dist[i] < best) {
          best = dist[i];
          u = i;
        }
      }
      if (u === -1) break;
      if (u === GOAL) break;
      done[u] = true;
      for (const e of edgesFrom(u)) {
        const nd = dist[u] + e.cost;
        if (nd < dist[e.to]) {
          dist[e.to] = nd;
          prev[e.to] = u;
        }
      }
    }

    if (dist[GOAL] === Infinity) return this.gridFallback(from, to);

    // Reconstruct GOAL → … → START, then emit as waypoints (drop START, map GOAL→to).
    const path: NavPoint[] = [];
    let cur = GOAL;
    const guard = n + 4;
    let steps = 0;
    while (cur !== START && cur !== -1 && steps++ < guard) {
      if (cur === GOAL) path.push({ x: to.x, z: to.z });
      else path.push({ x: this.nodes[cur].x, z: this.nodes[cur].z });
      cur = prev[cur];
    }
    path.reverse();
    return path.length ? path : null;
  }

  /**
   * GRID FALLBACK — the completeness guarantee. A visibility graph only finds
   * routes whose legs are straight sight-lines between its waypoints; a
   * winding lane between several solid props (or a walled hide's doorway
   * alcove) can be perfectly walkable yet own no such leg, stranding two
   * connected regions. When Dijkstra fails, BFS the walkable grid directly
   * (8-connected, body-radius checked) and STRING-PULL the cell path into the
   * fewest clear legs. If the animal can physically walk there, this finds it.
   */
  private gridFallback(from: NavPoint, to: NavPoint): NavPoint[] | null {
    const b = this.world.bounds;
    // Cell-snapping below would silently pull an outside-the-glass goal back
    // in — refuse it outright (out-of-enclosure stays unreachable).
    if (to.x < b.minX || to.x > b.maxX || to.z < b.minZ || to.z > b.maxZ) return null;
    // 0.025 lattice: a hide doorway pinches to barely over the body diameter —
    // a 0.05 grid reads it as sealed (measured on the real cave GLBs).
    const step = 0.025;
    const nx = Math.max(2, Math.round((b.maxX - b.minX) / step) + 1);
    const nz = Math.max(2, Math.round((b.maxZ - b.minZ) / step) + 1);
    const idx = (ix: number, iz: number) => iz * nx + ix;
    const toXZ = (ix: number, iz: number): NavPoint => ({ x: b.minX + ix * step, z: b.minZ + iz * step });
    const toCell = (p: NavPoint): [number, number] => [
      Math.min(nx - 1, Math.max(0, Math.round((p.x - b.minX) / step))),
      Math.min(nz - 1, Math.max(0, Math.round((p.z - b.minZ) / step))),
    ];
    // Snap endpoints to the nearest free cell (grid rounding can land a legal
    // stand point on a blocked cell centre).
    const freeCellNear = (p: NavPoint): [number, number] | null => {
      const [cx, cz] = toCell(p);
      for (let r = 0; r <= 2; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            const ix = cx + dx;
            const iz = cz + dz;
            if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
            const w = toXZ(ix, iz);
            if (this.world.isFree(w.x, w.z, this.radius)) return [ix, iz];
          }
        }
      }
      return null;
    };
    const s = freeCellNear(from);
    const t = freeCellNear(to);
    if (!s || !t) return null;
    const seen = new Int32Array(nx * nz).fill(-1);
    const q: number[] = [idx(s[0], s[1])];
    seen[idx(s[0], s[1])] = -2;
    const target = idx(t[0], t[1]);
    let found = false;
    while (q.length > 0) {
      const cur = q.shift()!;
      if (cur === target) {
        found = true;
        break;
      }
      const cx = cur % nx;
      const cz = Math.floor(cur / nx);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const ix = cx + dx;
        const iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
        const k = idx(ix, iz);
        if (seen[k] !== -1) continue;
        const w = toXZ(ix, iz);
        // Slightly padded: the walk circle threads a lane the full PROBE BODY
        // (legs splay wider) would grind against — leave working room.
        if (!this.world.isFree(w.x, w.z, this.radius * 1.08)) {
          seen[k] = -3;
          continue;
        }
        seen[k] = cur;
        q.push(k);
      }
    }
    if (!found) return null;
    const raw: NavPoint[] = [{ x: to.x, z: to.z }];
    for (let cur = target; cur >= 0; cur = seen[cur]) raw.push(toXZ(cur % nx, Math.floor(cur / nx)));
    raw.push({ x: from.x, z: from.z });
    raw.reverse(); // from → … → to
    const out: NavPoint[] = [];
    let at = 0;
    while (at < raw.length - 1) {
      let far = at + 1;
      for (let j = raw.length - 1; j > at; j--) {
        if (this.world.losClear(raw[at].x, raw[at].z, raw[j].x, raw[j].z, this.radius)) {
          far = j;
          break;
        }
      }
      out.push(raw[far]);
      at = far;
    }
    return out.length ? out : null;
  }
}

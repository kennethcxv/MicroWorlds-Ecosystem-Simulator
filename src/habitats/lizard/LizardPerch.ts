/**
 * PERCHING / BASKING — pure (no Three.js / DOM). Real leopard geckos spend a
 * lot of their day parked ON things: draped over a warm low rock, halfway up a
 * slope, on the flat crest of a slab. This module picks a PERCH SPOT on the
 * layout's climbable decor (top OR side — the body pitch/roll systems make a
 * sloped side read naturally) and, true to how a real animal approaches a
 * climb, a LOW-SIDE STAGING point: it walks around and ascends the SHORTEST
 * side rather than mantling the tall face.
 */
import type { CollisionWorld } from "../HabitatCollision";
import { MAX_CLIMB_HEIGHT } from "../HabitatCollision";
import { containsXZ } from "../HabitatBounds";

const TAU = Math.PI * 2;

export interface PerchSpot {
  x: number;
  z: number;
  /** Height above the local ground (how high the perch sits). */
  h: number;
}

export interface PerchOpts {
  /** Lowest perch worth climbing to (m above ground). */
  minH?: number;
  /** Personal climb ceiling (personality's climbCap). */
  maxH?: number;
  tries?: number;
  bodyRadius?: number;
}

/**
 * A random valid perch point ON a climbable prop: mesh-measured surface height
 * within [minH, maxH] above the ground, not too steep, and standable. Returns
 * null when the layout offers nothing climbable (or nothing in reach).
 */
export function findPerchSpot(world: CollisionWorld, rng: () => number, opts: PerchOpts = {}): PerchSpot | null {
  const minH = opts.minH ?? 0.05;
  const maxH = opts.maxH ?? MAX_CLIMB_HEIGHT * 0.95;
  const radius = opts.bodyRadius ?? 0.09;
  const cands = world.obstacles.filter((ob) => ob.passable && ob.interaction === "climbable");
  if (cands.length === 0) return null;
  for (let t = 0; t < (opts.tries ?? 48); t++) {
    const ob = cands[Math.floor(rng() * cands.length)];
    const bc = world.boundingCircle(ob);
    const a = rng() * TAU;
    const rr = Math.sqrt(rng()) * bc.r;
    const x = bc.cx + Math.cos(a) * rr;
    const z = bc.cz + Math.sin(a) * rr;
    if (!containsXZ(world.bounds, x, z, radius)) continue;
    const ground = world.groundHeightAt(x, z);
    const s = world.sampleSurfaceAt(x, z, ground, 0.02);
    if (!s.climbable || s.tooSteep || !s.walkable) continue;
    const h = s.y - ground;
    if (h < minH || h > maxH) continue;
    if (!world.isFree(x, z, radius)) continue;
    return { x, z, h };
  }
  return null;
}

/**
 * The smartest place to START the climb from: sample bearings around the perch
 * and keep the ground-level staging point whose ascent line has the SMALLEST
 * single step-up — the animal walks around and climbs the low side instead of
 * hauling itself up the tall face. Null when no bearing works (fully ringed).
 */
export function lowSideStaging(
  world: CollisionWorld,
  perch: { x: number; z: number },
  radius: number,
  standoff = 0.3,
): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null;
  let bestRise = Infinity;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    const sx = perch.x + Math.cos(a) * standoff;
    const sz = perch.z + Math.sin(a) * standoff;
    if (!containsXZ(world.bounds, sx, sz, radius)) continue;
    if (!world.isFree(sx, sz, radius)) continue;
    // Staging must be at GROUND level (the base of the climb, not on the prop).
    const g = world.groundHeightAt(sx, sz);
    if (world.climbHeightAt(sx, sz, 0.02, g) - g > 0.03) continue;
    // Walk the ascent line, tracking the biggest single step-up (the mantle).
    let prevY = g;
    let maxStep = 0;
    let blocked = false;
    const n = 12;
    for (let i = 1; i <= n; i++) {
      const x = sx + (perch.x - sx) * (i / n);
      const z = sz + (perch.z - sz) * (i / n);
      if (world.isBlocked(x, z, radius * 0.7)) {
        blocked = true;
        break;
      }
      const y = world.climbHeightAt(x, z, 0.02, prevY);
      maxStep = Math.max(maxStep, y - prevY);
      prevY = y;
    }
    if (blocked) continue;
    if (maxStep < bestRise) {
      bestRise = maxStep;
      best = { x: sx, z: sz };
    }
  }
  return best;
}

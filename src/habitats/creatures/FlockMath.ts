/**
 * Boids-lite steering for schooling creatures — pure vector math (no Three.js)
 * so group behaviour is unit-testable. One call per agent per tick: cohesion
 * (drift toward the sensed group's centre), alignment (match the group's
 * heading) and separation (strong short-range push apart) blended and clamped.
 */

export interface FlockAgent {
  pos: [number, number, number];
  vel: [number, number, number];
}

export interface FlockParams {
  /** Neighbour sense radius (world units). */
  radius: number;
  /** Personal-space radius — inside it separation ramps up. */
  sepRadius: number;
  cohesion: number;
  alignment: number;
  separation: number;
  /** Hard cap on the returned acceleration magnitude. */
  maxAccel: number;
}

/** Steering acceleration for `self` given its (already-filtered) flock mates. */
export function flockAccel(
  self: FlockAgent,
  neighbors: FlockAgent[],
  p: FlockParams,
): [number, number, number] {
  let n = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let vx = 0;
  let vy = 0;
  let vz = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const nb of neighbors) {
    const dx = nb.pos[0] - self.pos[0];
    const dy = nb.pos[1] - self.pos[1];
    const dz = nb.pos[2] - self.pos[2];
    const d = Math.hypot(dx, dy, dz);
    if (d > p.radius) continue;
    n++;
    cx += nb.pos[0];
    cy += nb.pos[1];
    cz += nb.pos[2];
    vx += nb.vel[0];
    vy += nb.vel[1];
    vz += nb.vel[2];
    if (d < p.sepRadius && d > 1e-6) {
      const k = (1 - d / p.sepRadius) / d;
      sx -= dx * k;
      sy -= dy * k;
      sz -= dz * k;
    }
  }
  if (n === 0) return [0, 0, 0];
  let ax = (cx / n - self.pos[0]) * p.cohesion + (vx / n - self.vel[0]) * p.alignment + sx * p.separation;
  let ay = (cy / n - self.pos[1]) * p.cohesion + (vy / n - self.vel[1]) * p.alignment + sy * p.separation;
  let az = (cz / n - self.pos[2]) * p.cohesion + (vz / n - self.vel[2]) * p.alignment + sz * p.separation;
  const len = Math.hypot(ax, ay, az);
  if (len > p.maxAccel) {
    const k = p.maxAccel / len;
    ax *= k;
    ay *= k;
    az *= k;
  }
  return [ax, ay, az];
}

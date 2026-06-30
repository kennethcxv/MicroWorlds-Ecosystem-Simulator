/** Small, dependency-free math helpers shared across sim and render. */

export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing toward `target`. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  const t = 1 - Math.exp(-rate * dt);
  return lerp(current, target, t);
}

export function inverseLerp(a: number, b: number, v: number): number {
  if (a === b) return 0;
  return clamp01((v - a) / (b - a));
}

export function mapRange(v: number, inA: number, inB: number, outA: number, outB: number): number {
  return lerp(outA, outB, inverseLerp(inA, inB, v));
}

export function round(v: number, decimals = 0): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

/** Smooth 0..1 ramp with eased ends. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = inverseLerp(edge0, edge1, x);
  return t * t * (3 - 2 * t);
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

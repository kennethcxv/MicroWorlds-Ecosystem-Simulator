/**
 * Deterministic, seedable PRNG (mulberry32).
 *
 * The simulation uses this so a given seed + action sequence always produces
 * the same result. Rendering may use Math.random freely for purely cosmetic
 * jitter, but anything that touches game state must go through an RNG instance.
 */
export class RNG {
  private state: number;

  constructor(seed: number) {
    // Avoid a zero state which would collapse the generator.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  get seed(): number {
    return this.state;
  }

  set seed(s: number) {
    this.state = (s >>> 0) || 0x9e3779b9;
  }
}

/** Derive a stable numeric seed from a string (e.g. a tank id). */
export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

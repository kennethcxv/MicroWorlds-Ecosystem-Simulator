import { describe, it, expect } from "vitest";
import { RNG, hashSeed } from "../src/core/rng";

describe("RNG (mulberry32)", () => {
  it("is deterministic: same seed → same sequence", () => {
    const a = new RNG(12345);
    const b = new RNG(12345);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds produce different sequences", () => {
    const a = new RNG(1);
    const b = new RNG(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("next() stays in [0, 1)", () => {
    const r = new RNG(99);
    for (let i = 0; i < 5000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("range() stays within [min, max)", () => {
    const r = new RNG(7);
    for (let i = 0; i < 2000; i++) {
      const v = r.range(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it("int() is inclusive on both ends and integral", () => {
    const r = new RNG(7);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = r.int(1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    // Over many draws every face of a d6 should appear.
    expect(seen).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it("a zero seed does not collapse the generator", () => {
    const r = new RNG(0);
    const a = r.next();
    const b = r.next();
    expect(a).not.toBe(b);
    expect(a).toBeGreaterThan(0);
  });

  it("hashSeed is stable and order-sensitive", () => {
    expect(hashSeed("sapphire-stream")).toBe(hashSeed("sapphire-stream"));
    expect(hashSeed("ab")).not.toBe(hashSeed("ba"));
  });
});

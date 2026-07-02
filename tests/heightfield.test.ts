/**
 * SURFACE HEIGHTFIELD — the per-point collision height measured from the real
 * mesh (AAA-style walkable surface). These tests drive the pure core:
 *   - buildHeightField: mesh triangles → per-cell TOP (max surface Y) and BOTTOM
 *     (min surface Y, i.e. the underside — an elevated arch span has a high
 *     bottom, a grounded rock has bottom ≈ 0),
 *   - sampleHeightField: bilinear height query at any local point,
 *   - the per-asset registry the collision compiler reads.
 *
 * This is what fixes: "one side of the rock is higher than the other — they each
 * need a different height" and "the gecko floats next to the branch".
 */
import { describe, expect, it } from "vitest";
import {
  buildHeightField,
  clearHeightFields,
  getHeightField,
  registerHeightField,
  sampleHeightField,
} from "../src/habitats/HabitatFootprint";
import type { Vec3 } from "../src/habitats/HabitatTypes";

/** Two triangles forming the quad (x0,z0)-(x1,z1) with corner heights given by y(x,z). */
function quad(x0: number, z0: number, x1: number, z1: number, y: (x: number, z: number) => number): Vec3[][] {
  const a: Vec3 = [x0, y(x0, z0), z0];
  const b: Vec3 = [x1, y(x1, z0), z0];
  const c: Vec3 = [x1, y(x1, z1), z1];
  const d: Vec3 = [x0, y(x0, z1), z1];
  return [
    [a, b, c],
    [a, c, d],
  ];
}

describe("buildHeightField + sampleHeightField", () => {
  it("a sloped ramp samples its true LOCAL height at each point (not one flat top)", () => {
    // y rises 0 → 0.3 along +z over a 1×1 quad.
    const hf = buildHeightField(quad(0, 0, 1, 1, (_x, z) => 0.3 * z), 40);
    expect(hf).not.toBeNull();
    const low = sampleHeightField(hf!, 0.5, 0.25);
    const high = sampleHeightField(hf!, 0.5, 0.9);
    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
    expect(low!.top).toBeCloseTo(0.075, 1);
    expect(high!.top).toBeCloseTo(0.27, 1);
    // A single surface: underside == top on a one-sided sheet.
    expect(Math.abs(low!.bottom - low!.top)).toBeLessThan(0.03);
  });

  it("two rocks of different heights each get their OWN height (rock-cluster case)", () => {
    const tris = [
      ...quad(0, 0, 1, 1, () => 0.1), // low flat rock
      ...quad(1.2, 0, 2, 1, () => 0.4), // tall rock next to it
    ];
    const hf = buildHeightField(tris, 40)!;
    expect(sampleHeightField(hf, 0.5, 0.5)!.top).toBeCloseTo(0.1, 1);
    expect(sampleHeightField(hf, 1.6, 0.5)!.top).toBeCloseTo(0.4, 1);
    // The genuine gap between them stays empty (no bridged collision).
    expect(sampleHeightField(hf, 1.1, 0.5)).toBeNull();
  });

  it("an elevated arch span has a HIGH underside (pass-under), grounded ends do not", () => {
    const tris = [
      ...quad(0, 0.35, 1, 0.65, () => 0.2), // elevated deck spanning the arch
      ...quad(0, 0.35, 0.15, 0.65, () => 0), // grounded pad, left end
      ...quad(0.85, 0.35, 1, 0.65, () => 0), // grounded pad, right end
    ];
    const hf = buildHeightField(tris, 48)!;
    const mid = sampleHeightField(hf, 0.5, 0.5)!;
    expect(mid.top).toBeCloseTo(0.2, 1);
    expect(mid.bottom).toBeGreaterThan(0.15); // wood hangs above the floor here
    const end = sampleHeightField(hf, 0.05, 0.5)!;
    expect(end.top).toBeCloseTo(0.2, 1);
    expect(end.bottom).toBeLessThan(0.05); // solid down to the ground here
  });

  it("returns null outside the mesh and for empty input", () => {
    const hf = buildHeightField(quad(0, 0, 1, 1, () => 0.1), 32)!;
    expect(sampleHeightField(hf, 5, 5)).toBeNull();
    expect(sampleHeightField(hf, -3, 0.5)).toBeNull();
    expect(buildHeightField([], 32)).toBeNull();
  });
});

describe("heightfield registry (per asset file)", () => {
  it("register / get / clear round-trips", () => {
    clearHeightFields();
    const hf = buildHeightField(quad(0, 0, 1, 1, () => 0.2), 16)!;
    expect(getHeightField("test://prop.glb")).toBeUndefined();
    registerHeightField("test://prop.glb", hf);
    expect(getHeightField("test://prop.glb")).toBe(hf);
    clearHeightFields();
    expect(getHeightField("test://prop.glb")).toBeUndefined();
  });
});

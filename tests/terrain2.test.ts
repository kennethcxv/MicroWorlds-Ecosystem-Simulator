/**
 * TERRAIN v2 — deeper/taller sculpting with a hard bedrock, smooth bilinear
 * sampling, slope read-out, and a brush mask. Locks in the design decisions:
 *   - the player sculpts the TOP of the substrate: dips BELOW the default flat
 *     sand level are allowed (depressions / channels / shallow holes),
 *   - but never through the tank floor — a bedrock limit derived from the
 *     substrate depth stops the brush,
 *   - raising goes well above the old gentle ±0.08 cap (real dunes),
 *   - sampling is bilinear (no stair-steps under feet), slope is queryable,
 *   - a mask protects cells (under props / against the glass) from the brush.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_H,
  createTerrain,
  paintWater,
  sculpt,
  sculptLimits,
  terrainHeightAt,
  terrainSlopeAt,
} from "../src/habitats/HabitatTerrain";
import type { HabitatDimensions } from "../src/habitats/HabitatTypes";

/** The live 40-gallon lizard enclosure's dimensions. */
const DIMS: HabitatDimensions = { width: 3.0, depth: 1.9, height: 1.3, glass: 0.05, substrateTop: 0.08 };

/** World XZ of a cell's centre (matches the module's own layout). */
function cellXZ(t: { nx: number; nz: number }, ix: number, iz: number): { x: number; z: number } {
  return {
    x: -DIMS.width / 2 + ((ix + 0.5) / t.nx) * DIMS.width,
    z: -DIMS.depth / 2 + ((iz + 0.5) / t.nz) * DIMS.depth,
  };
}

describe("bilinear terrain sampling", () => {
  it("returns the exact height at a cell centre and blends smoothly between cells", () => {
    const t = createTerrain();
    const ix = 10;
    const iz = 10;
    t.heights[iz * t.nx + ix] = 0.1;
    const c = cellXZ(t, ix, iz);
    expect(terrainHeightAt(t, DIMS, c.x, c.z)).toBeCloseTo(0.1, 5);
    // Halfway toward the (empty) +x neighbour ⇒ the average, not a stair-step.
    const half = (DIMS.width / t.nx) / 2;
    expect(terrainHeightAt(t, DIMS, c.x + half, c.z)).toBeCloseTo(0.05, 5);
    // Far away stays flat.
    expect(terrainHeightAt(t, DIMS, c.x + 1.0, c.z)).toBeCloseTo(0, 5);
  });
});

describe("sculpt limits (normal / strong) + bedrock", () => {
  it("normal limits raise above the old gentle cap and allow real depressions", () => {
    const lim = sculptLimits(DIMS);
    expect(lim.up).toBeGreaterThan(MAX_H); // taller dunes than the old ±0.08
    expect(lim.down).toBeLessThan(0); // below the default flat surface
  });

  it("strong limits reach the bedrock but NEVER the tank floor", () => {
    const lim = sculptLimits(DIMS, true);
    expect(lim.up).toBeGreaterThanOrEqual(0.2);
    expect(lim.down).toBeLessThan(sculptLimits(DIMS).down); // digs deeper than normal
    expect(lim.down).toBeGreaterThan(-DIMS.substrateTop); // bedrock: sand always remains
  });

  it("raising with strong limits piles sand well above the old ceiling", () => {
    const t = createTerrain();
    const lim = sculptLimits(DIMS, true);
    for (let i = 0; i < 30; i++) sculpt(t, DIMS, 0.4, 0.2, 0.3, +0.05, { limits: lim });
    const h = terrainHeightAt(t, DIMS, 0.4, 0.2);
    expect(h).toBeGreaterThan(0.12);
    expect(h).toBeLessThanOrEqual(lim.up + 1e-9);
  });

  it("lowering digs below the default surface and STOPS at bedrock", () => {
    const t = createTerrain();
    const lim = sculptLimits(DIMS, true);
    for (let i = 0; i < 40; i++) sculpt(t, DIMS, -0.4, -0.2, 0.3, -0.06, { limits: lim });
    const h = terrainHeightAt(t, DIMS, -0.4, -0.2);
    expect(h).toBeLessThan(-0.03); // a real hole, below flat sand
    expect(h).toBeGreaterThanOrEqual(lim.down - 1e-9); // never through the tank floor
  });

  it("keeps the legacy gentle clamp when no limits are passed (back-compat)", () => {
    const t = createTerrain();
    sculpt(t, DIMS, 0, 0, 0.3, +0.4);
    expect(terrainHeightAt(t, DIMS, 0, 0)).toBeLessThanOrEqual(MAX_H + 1e-9);
  });
});

describe("brush mask (protects cells under props / against the glass)", () => {
  it("skips masked cells entirely", () => {
    const t = createTerrain();
    // Brush straddles x = 0 but only the right half is sculptable.
    for (let i = 0; i < 6; i++) {
      sculpt(t, DIMS, 0, 0, 0.4, +0.05, { mask: (x) => x > 0 });
    }
    expect(terrainHeightAt(t, DIMS, 0.2, 0)).toBeGreaterThan(0.02);
    expect(terrainHeightAt(t, DIMS, -0.2, 0)).toBeCloseTo(0, 5);
  });
});

describe("terrainSlopeAt", () => {
  it("is 0 on flat sand and reports a built ramp's true gradient", () => {
    const flat = createTerrain();
    expect(terrainSlopeAt(flat, DIMS, 0, 0)).toBeCloseTo(0, 5);

    const t = createTerrain();
    for (let iz = 0; iz < t.nz; iz++) {
      for (let ix = 0; ix < t.nx; ix++) {
        const c = cellXZ(t, ix, iz);
        t.heights[iz * t.nx + ix] = 0.1 * c.x; // dh/dx = 0.1 everywhere
      }
    }
    expect(terrainSlopeAt(t, DIMS, 0, 0)).toBeCloseTo(Math.atan(0.1), 2);
  });
});

describe("wet patches respect the new limits", () => {
  it("settles wet cells slightly below grade, clamped to the dig limit", () => {
    const t = createTerrain();
    const lim = sculptLimits(DIMS, true);
    paintWater(t, DIMS, 0.5, 0.3, 0.2, true, { limits: lim });
    const h = terrainHeightAt(t, DIMS, 0.5, 0.3);
    expect(h).toBeLessThanOrEqual(-0.01); // reads as a shallow pool
    expect(h).toBeGreaterThanOrEqual(lim.down - 1e-9);
  });
});

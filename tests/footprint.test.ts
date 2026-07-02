import { describe, it, expect } from "vitest";
import {
  convexHull2D,
  polygonArea,
  rasterizePoints,
  rectangleCover,
  traceFootprint,
  type OccupancyGrid,
} from "../src/habitats/HabitatFootprint";
import type { Vec2 } from "../src/habitats/HabitatTypes";

describe("convexHull2D + polygonArea", () => {
  it("hulls a square (ignores an interior point)", () => {
    const hull = convexHull2D([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0.5, 0.5], // interior — must be dropped
    ]);
    expect(hull.length).toBe(4);
    expect(Math.abs(polygonArea(hull))).toBeCloseTo(1);
  });
});

describe("rasterizePoints", () => {
  it("marks the cells the points fall in (+ dilation closes 1-cell gaps)", () => {
    // Two points 0.4 apart on a 0.1 grid; dilation should bridge the single gap.
    const g = rasterizePoints(
      [
        [0.05, 0.05],
        [0.35, 0.05],
      ],
      { minX: 0, maxX: 0.4, minZ: 0, maxZ: 0.1 },
      4,
      1,
    );
    expect(g.nx).toBeGreaterThanOrEqual(4);
    const occ = g.cells.reduce((a, b) => a + b, 0);
    expect(occ).toBeGreaterThan(2); // both points + dilation
  });
});

describe("rectangleCover — decomposes a binary grid into few axis-aligned rects", () => {
  // A 3×3 grid with the CENTRE cell empty (a hole / notch).
  const cell = 0.1;
  const gridWithHole = (): OccupancyGrid => ({
    cell,
    nx: 3,
    nz: 3,
    originX: -0.15,
    originZ: -0.15,
    cells: [
      1, 1, 1,
      1, 0, 1,
      1, 1, 1,
    ],
  });

  it("covers all occupied cells and NONE of the empty hole", () => {
    const parts = rectangleCover(gridWithHole(), 12);
    expect(parts.length).toBeGreaterThan(0);
    // The hole centre (local 0,0) must NOT be inside any part.
    const inAny = parts.some((p) => Math.abs(0 - p.cx) < p.hx - 1e-9 && Math.abs(0 - p.cz) < p.hz - 1e-9);
    expect(inAny).toBe(false);
    // An occupied cell centre (e.g. local (-0.1, 0)) MUST be inside some part.
    const covered = parts.some((p) => Math.abs(-0.1 - p.cx) <= p.hx + 1e-9 && Math.abs(0 - p.cz) <= p.hz + 1e-9);
    expect(covered).toBe(true);
  });

  it("covers a solid rectangle with a single part", () => {
    const parts = rectangleCover(
      { cell, nx: 3, nz: 2, originX: 0, originZ: 0, cells: [1, 1, 1, 1, 1, 1] },
      12,
    );
    expect(parts.length).toBe(1);
    expect(parts[0].hx).toBeCloseTo(0.15); // 3 cells × 0.1 / 2
    expect(parts[0].hz).toBeCloseTo(0.1); // 2 cells × 0.1 / 2
  });

  it("respects the maxParts cap (still covers everything)", () => {
    // A checkerboard needs many rects; the cap must bound the count.
    const cells: number[] = [];
    const nx = 5;
    const nz = 5;
    for (let i = 0; i < nx * nz; i++) cells.push((Math.floor(i / nx) + (i % nx)) % 2 === 0 ? 1 : 0);
    const parts = rectangleCover({ cell, nx, nz, originX: 0, originZ: 0, cells }, 4);
    expect(parts.length).toBeLessThanOrEqual(4);
  });
});

describe("traceFootprint — convex vs concave decision", () => {
  it("a solid disc of points → convex (hull, no parts)", () => {
    const pts: Vec2[] = [];
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      for (let r = 0; r <= 0.3; r += 0.05) pts.push([Math.cos(t) * r, Math.sin(t) * r]);
    }
    const f = traceFootprint(pts, 16, 12);
    expect(f.concave).toBe(false);
    expect(f.hull.length).toBeGreaterThanOrEqual(3);
    expect(f.parts.length).toBe(0);
  });

  it("an L / branching cloud of points → concave (multi-part)", () => {
    // Points along two perpendicular arms with a big empty quadrant.
    const pts: Vec2[] = [];
    for (let i = 0; i <= 12; i++) pts.push([-0.3 + (i / 12) * 0.6, -0.28]); // horizontal arm
    for (let i = 0; i <= 12; i++) pts.push([-0.28, -0.3 + (i / 12) * 0.6]); // vertical arm
    const f = traceFootprint(pts, 18, 12);
    expect(f.concave).toBe(true);
    expect(f.parts.length).toBeGreaterThan(1);
    // The empty far quadrant (top-right) must be covered by NO part.
    const inAny = f.parts.some((p) => Math.abs(0.25 - p.cx) < p.hx && Math.abs(0.25 - p.cz) < p.hz);
    expect(inAny).toBe(false);
  });
});

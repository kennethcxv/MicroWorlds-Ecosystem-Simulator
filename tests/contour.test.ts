import { describe, it, expect } from "vitest";
import {
  rasterizeTriangles,
  marchingSquares,
  simplifyPolygon,
  pointInPolygon,
  traceContours,
  polygonArea,
} from "../src/habitats/HabitatFootprint";
import type { Vec2 } from "../src/habitats/HabitatTypes";

/** Two triangles covering an axis-aligned rectangle [x0,x1] × [z0,z1]. */
function rect(x0: number, x1: number, z0: number, z1: number): Vec2[][] {
  return [
    [
      [x0, z0],
      [x1, z0],
      [x1, z1],
    ],
    [
      [x0, z0],
      [x1, z1],
      [x0, z1],
    ],
  ];
}

/** A filled disc as a triangle fan around the origin. */
function disc(r: number, segments: number): Vec2[][] {
  const tris: Vec2[][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const b = ((i + 1) / segments) * Math.PI * 2;
    tris.push([
      [0, 0],
      [Math.cos(a) * r, Math.sin(a) * r],
      [Math.cos(b) * r, Math.sin(b) * r],
    ]);
  }
  return tris;
}

/** Is a point inside ANY of a set of (possibly concave) contour loops? */
function inAny(contours: Vec2[][], x: number, z: number): boolean {
  return contours.some((c) => pointInPolygon(c, x, z));
}

describe("rasterizeTriangles — fills the projected triangle interior", () => {
  it("marks cells inside a triangle solid and cells outside empty", () => {
    // Right triangle (0,0)-(1,0)-(0,1): the line x+z=1 splits inside from outside.
    const g = rasterizeTriangles(
      [
        [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
      ],
      { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
      32,
    );
    const at = (x: number, z: number): number => {
      const ix = Math.min(g.nx - 1, Math.max(0, Math.floor((x - g.originX) / g.cell)));
      const iz = Math.min(g.nz - 1, Math.max(0, Math.floor((z - g.originZ) / g.cell)));
      return g.cells[iz * g.nx + ix];
    };
    expect(at(0.2, 0.2)).toBe(1); // well inside
    expect(at(0.1, 0.1)).toBe(1);
    expect(at(0.8, 0.8)).toBe(0); // beyond the hypotenuse
  });
});

describe("marchingSquares — traces the boundary of the solid region", () => {
  it("a filled disc → one contour that approximates the circle", () => {
    const g = rasterizeTriangles(disc(0.3, 48), { minX: -0.3, maxX: 0.3, minZ: -0.3, maxZ: 0.3 }, 64);
    const contours = marchingSquares(g);
    expect(contours.length).toBe(1);
    const c = contours[0];
    // Every contour point is ~on the circle of radius 0.3 (within a couple cells).
    const tol = g.cell * 2.5;
    for (const [x, z] of c) {
      expect(Math.hypot(x, z)).toBeGreaterThan(0.3 - tol);
      expect(Math.hypot(x, z)).toBeLessThan(0.3 + tol);
    }
    // Area ≈ π r².
    expect(polygonArea(c)).toBeGreaterThan(Math.PI * 0.3 * 0.3 * 0.8);
    expect(polygonArea(c)).toBeLessThan(Math.PI * 0.3 * 0.3 * 1.2);
  });

  it("two separated filled squares → two contours", () => {
    const tris = [...rect(-0.5, -0.3, -0.1, 0.1), ...rect(0.3, 0.5, -0.1, 0.1)];
    const g = rasterizeTriangles(tris, { minX: -0.5, maxX: 0.5, minZ: -0.1, maxZ: 0.1 }, 80);
    const contours = marchingSquares(g);
    expect(contours.length).toBe(2);
  });
});

describe("traceContours — keeps concave gaps open (branchy assets)", () => {
  it("an L-shape leaves the empty quadrant OUTSIDE the collision contour", () => {
    const tris = [...rect(-0.3, 0.3, -0.3, -0.1), ...rect(-0.3, -0.1, -0.3, 0.3)];
    const contours = traceContours(tris, 96);
    expect(contours.length).toBeGreaterThanOrEqual(1);
    // Both arms are solid → inside a contour.
    expect(inAny(contours, 0.2, -0.2)).toBe(true); // horizontal arm
    expect(inAny(contours, -0.2, 0.2)).toBe(true); // vertical arm
    // The empty top-right quadrant is a real gap → inside NO contour.
    expect(inAny(contours, 0.2, 0.2)).toBe(false);
  });

  it("a solid blob traces one closed contour, not a rectangle", () => {
    const contours = traceContours(disc(0.25, 40), 96);
    expect(contours.length).toBe(1);
    // A rectangle cover would have 4 corners; a traced circle has many points.
    expect(contours[0].length).toBeGreaterThan(8);
  });
});

describe("traceContours — bounded output (real GLBs are noisy)", () => {
  it("fills enclosed holes: an annulus traces ONE outer loop, not a donut", () => {
    // A ring (r 0.15 → 0.3) built from quad segments: the hole is enclosed, so for
    // collision it is filled (the silhouette outline is what the player sees).
    const tris: Vec2[][] = [];
    const seg = 24;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const b = ((i + 1) / seg) * Math.PI * 2;
      const p = (r: number, t: number): Vec2 => [Math.cos(t) * r, Math.sin(t) * r];
      tris.push([p(0.15, a), p(0.3, a), p(0.3, b)]);
      tris.push([p(0.15, a), p(0.3, b), p(0.15, b)]);
    }
    const contours = traceContours(tris, 96);
    expect(contours.length).toBe(1);
    // The filled disc's area ≈ π·0.3² (hole filled), not the annulus area.
    expect(polygonArea(contours[0])).toBeGreaterThan(Math.PI * 0.3 * 0.3 * 0.75);
  });

  it("keeps only the largest loops when a mesh scatters into many pieces", () => {
    // 9 disconnected squares of decreasing size (leaf-noise) with a cap of 4.
    const tris: Vec2[][] = [];
    for (let i = 0; i < 9; i++) {
      const s = 0.1 - i * 0.008;
      const x0 = -1 + i * 0.25;
      tris.push(...rect(x0, x0 + s, 0, s));
    }
    const contours = traceContours(tris, 256, 4);
    expect(contours.length).toBeLessThanOrEqual(4);
    // The biggest square (first) must be among the kept loops.
    expect(inAny(contours, -0.95, 0.05)).toBe(true);
  });

  it("caps the points per loop so the solver stays cheap (still >8, not a box)", () => {
    const contours = traceContours(disc(0.3, 64), 256);
    expect(contours.length).toBe(1);
    expect(contours[0].length).toBeLessThanOrEqual(56);
    expect(contours[0].length).toBeGreaterThan(8);
  });
});

describe("simplifyPolygon — reduces points but keeps the shape", () => {
  it("collapses collinear runs while preserving corners + area", () => {
    // A square sampled with many collinear midpoints per edge.
    const pts: Vec2[] = [];
    const push = (x: number, z: number): void => {
      pts.push([x, z]);
    };
    for (let i = 0; i < 10; i++) push(i / 10, 0);
    for (let i = 0; i < 10; i++) push(1, i / 10);
    for (let i = 0; i < 10; i++) push(1 - i / 10, 1);
    for (let i = 0; i < 10; i++) push(0, 1 - i / 10);
    const simp = simplifyPolygon(pts, 0.01);
    expect(simp.length).toBeLessThan(pts.length);
    expect(simp.length).toBeGreaterThanOrEqual(4); // 4 corners survive
    expect(polygonArea(simp)).toBeCloseTo(1, 1);
  });
});

describe("pointInPolygon — robust for concave shapes", () => {
  it("classifies inside/outside for a concave (L) polygon", () => {
    // Concave L outline (CCW-ish), notch at top-right.
    const L: Vec2[] = [
      [-0.3, -0.3],
      [0.3, -0.3],
      [0.3, -0.1],
      [-0.1, -0.1],
      [-0.1, 0.3],
      [-0.3, 0.3],
    ];
    expect(pointInPolygon(L, -0.2, -0.2)).toBe(true); // corner of the L
    expect(pointInPolygon(L, 0.2, -0.2)).toBe(true); // horizontal arm
    expect(pointInPolygon(L, 0.2, 0.2)).toBe(false); // the notch
    expect(pointInPolygon(L, 1, 1)).toBe(false); // far outside
  });
});

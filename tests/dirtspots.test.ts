/**
 * dirtSpots — pure picker over the DirtMap that answers "where are the dirty
 * spots?" for Cleaning Mode (amber rings in the tank + "N spots detected" on
 * the Spot Clean card). Returns local dirt peaks in world coordinates,
 * dirtiest first, with a minimum separation so one smear isn't ten rings.
 */
import { describe, expect, it } from "vitest";
import { accumulateDirt, cleanAt, createDirtMap, dirtSpots } from "../src/habitats/lizard/LizardDirtSystem";
import { LIZARD_SIZE_OPTIONS } from "../src/habitats/HabitatBuilder";

const DIMS = LIZARD_SIZE_OPTIONS[1].dimensions;

describe("dirtSpots", () => {
  it("returns no spots for a clean map", () => {
    const m = createDirtMap();
    expect(dirtSpots(m, DIMS)).toEqual([]);
  });

  it("finds two separated hotspots at their world positions, dirtiest first", () => {
    const m = createDirtMap();
    // Two lingering hotspots: strong at (-0.8, -0.3), weaker at (0.9, 0.4).
    // (Durations sized to the SLOW real pacing — dirt now needs 8–10 minutes
    // of sustained lingering before a spot forms.)
    for (let i = 0; i < 2400; i++) {
      accumulateDirt(m, DIMS, 0.25, [
        { x: -0.8, z: -0.3, w: 1 },
        ...(i < 1400 ? [{ x: 0.9, z: 0.4, w: 1 }] : []),
      ]);
    }
    const spots = dirtSpots(m, DIMS);
    expect(spots.length).toBeGreaterThanOrEqual(2);
    // Dirtiest first.
    expect(spots[0].amount).toBeGreaterThanOrEqual(spots[1].amount);
    // Each reported spot sits on (or next to) a seeded hotspot.
    const near = (s: { x: number; z: number }, x: number, z: number) => Math.hypot(s.x - x, s.z - z) < 0.15;
    expect(near(spots[0], -0.8, -0.3)).toBe(true);
    expect(spots.some((s) => near(s, 0.9, 0.4))).toBe(true);
  });

  it("one smear yields one ring — spots keep a minimum separation", () => {
    const m = createDirtMap();
    for (let i = 0; i < 2400; i++) accumulateDirt(m, DIMS, 0.25, [{ x: 0, z: 0, w: 1 }]);
    const spots = dirtSpots(m, DIMS);
    for (let a = 0; a < spots.length; a++) {
      for (let b = a + 1; b < spots.length; b++) {
        expect(Math.hypot(spots[a].x - spots[b].x, spots[a].z - spots[b].z)).toBeGreaterThanOrEqual(0.3);
      }
    }
  });

  it("respects maxCount and drops below-threshold film", () => {
    const m = createDirtMap();
    // A faint ambient film only — no spot should be reported.
    for (let i = 0; i < 40; i++) accumulateDirt(m, DIMS, 0.25, []);
    expect(dirtSpots(m, DIMS)).toEqual([]);
    // Many strong hotspots — capped at maxCount.
    for (let i = 0; i < 1100; i++) {
      accumulateDirt(m, DIMS, 0.3, [
        { x: -1.2, z: -0.5, w: 1 },
        { x: -0.4, z: 0.4, w: 1 },
        { x: 0.4, z: -0.4, w: 1 },
        { x: 1.2, z: 0.5, w: 1 },
      ]);
    }
    expect(dirtSpots(m, DIMS, 3).length).toBeLessThanOrEqual(3);
  });

  it("cleaning a spot makes its ring disappear", () => {
    const m = createDirtMap();
    for (let i = 0; i < 2400; i++) accumulateDirt(m, DIMS, 0.25, [{ x: -0.8, z: -0.3, w: 1 }]);
    expect(dirtSpots(m, DIMS).length).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) cleanAt(m, DIMS, -0.8, -0.3, 0.4, 0.3);
    expect(dirtSpots(m, DIMS)).toEqual([]);
  });
});

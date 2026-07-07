/**
 * REAL leopard-gecko hunting locomotion: they're ambush predators, not joggers —
 * a deliberate walk toward prey, a slow CREEP (with brief freezes) once close,
 * then a short fast STRIKE DASH over the last stretch. Speed is banded by
 * distance to the prey and the dash only fires facing it with a clear line.
 */
import { describe, it, expect } from "vitest";
import { CollisionWorld } from "../src/habitats/HabitatCollision";
import type { GroundBounds } from "../src/habitats/HabitatBounds";
import { GECKO_MOVEMENT, GeckoMovementController } from "../src/habitats/lizard/GeckoMovementController";

const B: GroundBounds = { minX: -1.4, maxX: 1.4, minZ: -1, maxZ: 1, y: 0.08 };

function seededRng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

describe("stalk → creep → strike dash", () => {
  it("walks far out, creeps inside the stalk band, dashes the final stretch, and eats", () => {
    const w = new CollisionWorld(B, []);
    const g = new GeckoMovementController(w, GECKO_MOVEMENT, seededRng(11), { x: -1.0, z: 0, yaw: 0 });
    const prey = { id: 1, x: 0.2, z: 0 };
    const walk = GECKO_MOVEMENT.walkSpeed;
    let maxFar = 0; // speed observed while d > stalkRange + margin
    let maxCreep = 0; // speed observed inside the creep band
    let maxDash = 0; // speed observed inside the dash band
    let ate = false;
    let px = -1.0;
    let pz = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 4000 && !ate; i++) {
      const r = g.update(dt, [prey]);
      if (r.ateFeederId === 1) ate = true;
      const p = g.position;
      const v = Math.hypot(p.x - px, p.z - pz) / dt;
      px = p.x;
      pz = p.z;
      const d = Math.hypot(prey.x - p.x, prey.z - p.z);
      if (d > GECKO_MOVEMENT.stalkRange + 0.1) maxFar = Math.max(maxFar, v);
      // Inner creep band only — the walk→creep deceleration eases across the
      // boundary (real animals don't stop on a dime).
      else if (d > GECKO_MOVEMENT.dashRange + 0.03 && d < GECKO_MOVEMENT.stalkRange - 0.08)
        maxCreep = Math.max(maxCreep, v);
      else if (d <= GECKO_MOVEMENT.dashRange && d > GECKO_MOVEMENT.eatRange + 0.02) maxDash = Math.max(maxDash, v);
    }
    expect(ate).toBe(true);
    // Far out: full deliberate walk.
    expect(maxFar).toBeGreaterThan(walk * 0.8);
    // Creep band: clearly slower than the walk (the stalk).
    expect(maxCreep).toBeLessThan(walk * 0.75);
    // Dash band: a genuine sprint — well ABOVE the walk.
    expect(maxDash).toBeGreaterThan(walk * 1.5);
  });

  it("freezes mid-stalk: inside the creep band there are motionless beats", () => {
    const w = new CollisionWorld(B, []);
    const g = new GeckoMovementController(w, GECKO_MOVEMENT, seededRng(7), { x: -0.35, z: 0, yaw: 0 });
    // Prey pinned inside the stalk band, out of eat range (a "wary cricket").
    const prey = { id: 2, x: 0.35, z: 0 };
    const dt = 1 / 60;
    let frozenFrames = 0;
    let px = -0.35;
    let pz = 0;
    for (let i = 0; i < 600; i++) {
      g.update(dt, [prey]);
      const p = g.position;
      const v = Math.hypot(p.x - px, p.z - pz) / dt;
      px = p.x;
      pz = p.z;
      const d = Math.hypot(prey.x - p.x, prey.z - p.z);
      if (d < GECKO_MOVEMENT.stalkRange && d > GECKO_MOVEMENT.dashRange && v < 0.02) frozenFrames++;
      if (d <= GECKO_MOVEMENT.eatRange) break; // reached — enough sampled
    }
    expect(frozenFrames).toBeGreaterThan(4); // real stalk pauses happened
  });
});

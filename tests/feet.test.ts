/**
 * FOOT CONTACTS + BODY ORIENTATION — the gecko now stands on four FEET, not an
 * abstract centre point. Locks in the grounding rules from the brief:
 *   - every PLANTED foot sits EXACTLY on the real surface under it (no float,
 *     no sink), and never slides while the gecko walks,
 *   - STEPPING feet lift briefly and land back on the sampled surface,
 *   - the gait alternates diagonal pairs (FL+RR vs FR+RL — a trot),
 *   - body PITCH comes from front-vs-rear foot heights, body ROLL from
 *     left-vs-right foot heights (leaning on a side slope), both capped,
 *   - when idle the feet settle neatly under the body.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { clearHeightFields } from "../src/habitats/HabitatFootprint";
import { CollisionWorld, type GroundSource } from "../src/habitats/HabitatCollision";
import {
  GECKO_MOVEMENT,
  GeckoMovementController,
  type HuntTarget,
} from "../src/habitats/lizard/GeckoMovementController";
import { GECKO_FOOT_ANCHORS, PITCH_CAP, ROLL_CAP } from "../src/habitats/lizard/GeckoFeet";
import type { GroundBounds } from "../src/habitats/HabitatBounds";

const B: GroundBounds = { minX: -2, maxX: 2, minZ: -1.5, maxZ: 1.5, y: 0.08 };
const rng = (): number => 0.5;
const still = { ...GECKO_MOVEMENT, idleDur: [999, 999] as [number, number], idleChance: 1 };

/** A uniform side ramp: dh/dx = k (rises toward +x). */
const sideRamp = (k: number): GroundSource => ({ heightAt: (x) => k * x });
/** A uniform fore ramp: dh/dz = k (rises toward +z). */
const foreRamp = (k: number): GroundSource => ({ heightAt: (_x, z) => k * z });

/** Drive the gecko on a deterministic straight WALK toward a far feeder. */
function walk(w: CollisionWorld, frames: number, each?: (g: GeckoMovementController) => void): GeckoMovementController {
  const g = new GeckoMovementController(w, still, rng, { x: 0, z: -1.0, yaw: 0 });
  const prey: HuntTarget[] = [{ id: 1, x: 0, z: 1.3 }];
  for (let i = 0; i < frames; i++) {
    g.update(1 / 60, prey);
    each?.(g);
  }
  return g;
}

beforeEach(() => clearHeightFields());

describe("foot contacts while walking", () => {
  it("has four feet (FL FR RL RR) from the anchor config", () => {
    const g = walk(new CollisionWorld(B, []), 1);
    expect(GECKO_FOOT_ANCHORS.map((a) => a.id)).toEqual(["FL", "FR", "RL", "RR"]);
    expect(g.feet.map((f) => f.id)).toEqual(["FL", "FR", "RL", "RR"]);
  });

  it("planted feet sit EXACTLY on the walk surface — no float, no sink", () => {
    const w = new CollisionWorld(B, [], sideRamp(0.12));
    let checked = 0;
    walk(w, 400, (g) => {
      const standY = B.y + g.climbHeight;
      for (const f of g.feet) {
        const surface = w.climbHeightAt(f.x, f.z, 0, standY);
        if (f.state === "planted") {
          expect(Math.abs(f.y - surface)).toBeLessThan(1e-3);
          checked++;
        } else {
          expect(f.y).toBeGreaterThanOrEqual(surface - 1e-3); // never underground
        }
      }
    });
    expect(checked).toBeGreaterThan(300);
  });

  it("planted feet never slide while the gecko walks", () => {
    const w = new CollisionWorld(B, []);
    const last = new Map<string, { x: number; z: number; state: string }>();
    let checked = 0;
    walk(w, 400, (g) => {
      if (!g.isMoving) return;
      for (const f of g.feet) {
        const prev = last.get(f.id);
        if (prev && prev.state === "planted" && f.state === "planted") {
          expect(Math.hypot(f.x - prev.x, f.z - prev.z)).toBeLessThan(1e-6);
          checked++;
        }
        last.set(f.id, { x: f.x, z: f.z, state: f.state });
      }
    });
    expect(checked).toBeGreaterThan(200);
  });

  it("steps with diagonal pairs — FL and FR are never both in the air", () => {
    const w = new CollisionWorld(B, []);
    let flSteps = 0;
    let overlap = 0;
    walk(w, 500, (g) => {
      const by = Object.fromEntries(g.feet.map((f) => [f.id, f.state]));
      if (by.FL === "stepping") flSteps++;
      if (by.FL === "stepping" && by.FR === "stepping") overlap++;
    });
    expect(flSteps).toBeGreaterThan(20); // it genuinely steps
    expect(overlap).toBe(0); // opposite-phase feet never swing together
  });

  it("stepping feet lift off the ground; planted feet have zero lift", () => {
    const w = new CollisionWorld(B, []);
    let maxLift = 0;
    walk(w, 400, (g) => {
      for (const f of g.feet) {
        if (f.state === "stepping") maxLift = Math.max(maxLift, f.lift);
        else expect(f.lift).toBe(0);
      }
    });
    expect(maxLift).toBeGreaterThan(0.005);
  });
});

describe("body orientation from the feet", () => {
  it("ROLLS on a side slope (right side uphill ⇒ lean left-down … sign convention)", () => {
    // Ground rises toward +x; walking toward +z the RIGHT feet are higher.
    const g1 = walk(new CollisionWorld(B, [], sideRamp(0.14)), 400);
    expect(g1.groundRoll).toBeLessThan(-0.04); // right high ⇒ roll negative
    // Mirrored slope ⇒ mirrored lean.
    const g2 = walk(new CollisionWorld(B, [], sideRamp(-0.14)), 400);
    expect(g2.groundRoll).toBeGreaterThan(0.04);
  });

  it("PITCHES from front-vs-rear feet on a fore-aft terrain slope", () => {
    const g = walk(new CollisionWorld(B, [], foreRamp(0.14)), 400); // uphill toward +z
    expect(g.groundPitch).toBeGreaterThan(0.08);
  });

  it("caps pitch and roll so extreme ground can never break the pose", () => {
    const g = walk(new CollisionWorld(B, [], sideRamp(0.5)), 300);
    expect(Math.abs(g.groundRoll)).toBeLessThanOrEqual(ROLL_CAP.climb + 1e-6);
    expect(Math.abs(g.groundPitch)).toBeLessThanOrEqual(PITCH_CAP.climb + 1e-6);
  });
});

describe("idle behaviour", () => {
  it("feet settle to their home anchors under the body and stay planted", () => {
    const w = new CollisionWorld(B, []);
    const g = new GeckoMovementController(w, still, rng, { x: 0.3, z: 0.2, yaw: 0.4 });
    for (let i = 0; i < 240; i++) g.update(1 / 60, []); // 4 s of standing still
    const p = g.position;
    const fx = Math.sin(g.heading);
    const fz = Math.cos(g.heading);
    const rx = Math.cos(g.heading);
    const rz = -Math.sin(g.heading);
    for (let i = 0; i < g.feet.length; i++) {
      const f = g.feet[i];
      const a = GECKO_FOOT_ANCHORS[i];
      const hx = p.x + fx * a.forward + rx * a.side;
      const hz = p.z + fz * a.forward + rz * a.side;
      expect(f.state).toBe("planted");
      expect(f.lift).toBe(0);
      expect(Math.hypot(f.x - hx, f.z - hz)).toBeLessThan(0.02);
    }
  });
});

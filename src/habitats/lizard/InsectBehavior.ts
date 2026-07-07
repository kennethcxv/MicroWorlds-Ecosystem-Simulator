/**
 * INSECT BEHAVIOUR — pure prey AI for the feeder insects (no Three.js / DOM).
 *
 * Real crickets don't wander into a gecko's mouth: they FREEZE when a predator
 * gets close (motion is what betrays prey), then FLEE directly away in fast
 * bursts, steering along walls instead of jamming into corners, and a truly
 * cornered cricket panic-JUMPS — often right past the predator. Worms hustle at
 * worm pace. Fleeing costs stamina, so a persistent gecko still wins the chase.
 * The gecko's body also physically displaces insects (never stands on one) and
 * insects keep separation from each other.
 *
 * All functions mutate FeederState in place (positions/mood/energy), resolve
 * every move through the CollisionWorld (never through decor/glass), and take
 * an injectable RNG for deterministic tests.
 */
import type { FeederState } from "../HabitatTypes";
import { CollisionWorld } from "../HabitatCollision";
import { containsXZ, type Rng } from "../HabitatBounds";
import type { FoodProfile } from "./LizardNutrition";

export const INSECT_BEHAVIOR = {
  /** Gecko within this → freeze/alert (motion betrays prey). */
  alertRange: 0.5,
  /** Gecko within this → flee burst. */
  fleeRange: 0.34,
  /** Burst speed = base wander speed × this. */
  fleeSpeedMult: 6,
  /** Seconds of sprint per burst / pause between bursts. */
  burstTime: 0.5,
  restTime: 0.35,
  /** Stamina cost per burst; slow regen while calm. */
  energyPerBurst: 0.25,
  energyRegenPerSec: 0.04,
  /** Wall probe distance for flee steering. */
  lookahead: 0.09,
  /** Insect body radius (collision vs world, gecko, each other). */
  bodyRadius: 0.025,
};

const rot = (dx: number, dz: number, a: number): { x: number; z: number } => ({
  x: dx * Math.cos(a) - dz * Math.sin(a),
  z: dx * Math.sin(a) + dz * Math.cos(a),
});

/** One steering tick for a FREE (not dish-contained) insect. */
export function tickInsect(
  f: FeederState,
  world: CollisionWorld,
  food: FoodProfile,
  dt: number,
  rng: Rng,
  gecko?: { x: number; z: number },
): void {
  const B = INSECT_BEHAVIOR;
  const gx = gecko ? gecko.x - f.position[0] : 99;
  const gz = gecko ? gecko.z - f.position[2] : 99;
  const d = Math.hypot(gx, gz);

  if (f.held) return; // pinched in tongs / on the palm — perfectly still

  f.mood ??= "calm";
  f.moodT ??= 0;
  f.energy ??= 1;
  // The behaviour clock lives HERE (freeze beats + burst/rest cycles).
  if (f.moodT > 0) f.moodT = Math.max(0, f.moodT - dt);

  // A flee "cycle" = one sprint burst + one pause; moodT counts the whole cycle
  // down (sprinting while moodT > restTime, catching breath below it).
  const startBurst = (): void => {
    f.mood = "flee";
    f.moodT = B.burstTime + B.restTime;
    f.energy = Math.max(0, (f.energy ?? 1) - B.energyPerBurst);
  };

  // ── Mood transitions ──────────────────────────────────────────────────────
  if (f.mood === "calm") {
    if (d < B.fleeRange) {
      startBurst();
    } else if (d < B.alertRange) {
      f.mood = "alert";
      f.moodT = 0.25 + rng() * 0.45; // freeze beat
    }
  } else if (f.mood === "alert") {
    if (d < B.fleeRange) {
      startBurst();
    } else if (f.moodT <= 0) {
      // Freeze over: bolt if the threat is still looming, relax if it moved on.
      if (d < B.alertRange) startBurst();
      else f.mood = "calm";
    }
  } else if (f.mood === "flee") {
    if (d > B.alertRange * 1.4) {
      f.mood = "calm";
    } else if (f.moodT <= 0 && f.energy > 0.2) {
      startBurst();
    }
    // else: spent — stays scared and scrambles slowly (handled below).
  }

  // ── Movement ──────────────────────────────────────────────────────────────
  if (f.mood === "alert") return; // frozen — stillness is the defence

  if (f.mood === "calm") {
    f.energy = Math.min(1, f.energy + B.energyRegenPerSec * dt);
    f.heading = (f.heading ?? 0) + Math.sin(f.id * 1.7 + f.age * 2.3) * 0.9 * dt;
    move(f, world, Math.cos(f.heading), Math.sin(f.heading), food.speed * dt);
    return;
  }

  // Fleeing. COMMIT to the escape line for the whole burst — real prey doesn't
  // zig-zag around its own decision. Re-steer only when a burst starts or the
  // committed heading runs into a wall/decor.
  const newBurst = f.moodT === B.burstTime + B.restTime; // startBurst ran this tick
  let dx = Math.cos(f.heading ?? 0);
  let dz = Math.sin(f.heading ?? 0);
  const aheadX = f.position[0] + dx * B.lookahead;
  const aheadZ = f.position[2] + dz * B.lookahead;
  const blockedAhead =
    !containsXZ(world.bounds, aheadX, aheadZ, B.bodyRadius) || !world.isFree(aheadX, aheadZ, B.bodyRadius);
  if (newBurst || blockedAhead) {
    const dir = fleeDirection(f, world, gecko, rng);
    if (dir === "cornered") {
      if (f.kind === "cricket") panicJump(f, world, rng);
      else wallCrawl(f, world, gecko, food, dt);
      return;
    }
    dx = dir.x;
    dz = dir.z;
    f.heading = Math.atan2(dz, dx);
  }
  const bursting = (f.moodT ?? 0) > B.restTime;
  const tired = (f.energy ?? 0) <= 0.05;
  const energyFactor = 0.45 + 0.55 * (f.energy ?? 1);
  const speed = tired
    ? food.speed * 1.2 // spent — a laboured scramble the gecko can catch
    : bursting
      ? food.speed * B.fleeSpeedMult * energyFactor
      : food.speed * 0.4; // catching breath between bursts
  move(f, world, dx, dz, speed * dt);
}

/** Resolve-checked step; keeps the insect on the (sculpted) ground. */
function move(f: FeederState, world: CollisionWorld, dx: number, dz: number, dist: number): void {
  const res = world.resolve(f.position[0], f.position[2], f.position[0] + dx * dist, f.position[2] + dz * dist, INSECT_BEHAVIOR.bodyRadius);
  f.position[0] = res.x;
  f.position[2] = res.z;
  f.position[1] = world.groundHeightAt(res.x, res.z);
}

/** Directly away from the gecko, rotated stepwise until the path is clear.
 *  "cornered" when every candidate (even nearly backward) is blocked. */
function fleeDirection(
  f: FeederState,
  world: CollisionWorld,
  gecko: { x: number; z: number } | undefined,
  rng: Rng,
): { x: number; z: number } | "cornered" {
  const B = INSECT_BEHAVIOR;
  let bx = gecko ? f.position[0] - gecko.x : Math.cos(f.heading ?? 0);
  let bz = gecko ? f.position[2] - gecko.z : Math.sin(f.heading ?? 0);
  const bd = Math.hypot(bx, bz);
  if (bd < 1e-6) {
    const a = rng() * Math.PI * 2;
    bx = Math.cos(a);
    bz = Math.sin(a);
  } else {
    bx /= bd;
    bz /= bd;
  }
  for (const a of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4]) {
    const dir = rot(bx, bz, a);
    const px = f.position[0] + dir.x * B.lookahead;
    const pz = f.position[2] + dir.z * B.lookahead;
    if (!containsXZ(world.bounds, px, pz, B.bodyRadius)) continue;
    if (!world.isFree(px, pz, B.bodyRadius)) continue;
    return dir;
  }
  return "cornered";
}

/** A cornered cricket springs in ANY clear direction — often over the gecko. */
function panicJump(f: FeederState, world: CollisionWorld, rng: Rng): void {
  for (let k = 0; k < 12; k++) {
    const a = rng() * Math.PI * 2;
    const dist = 0.18 + rng() * 0.12;
    const tx = f.position[0] + Math.cos(a) * dist;
    const tz = f.position[2] + Math.sin(a) * dist;
    if (!containsXZ(world.bounds, tx, tz, INSECT_BEHAVIOR.bodyRadius)) continue;
    if (!world.isFree(tx, tz, INSECT_BEHAVIOR.bodyRadius)) continue;
    const res = world.resolve(f.position[0], f.position[2], tx, tz, INSECT_BEHAVIOR.bodyRadius);
    f.position[0] = res.x;
    f.position[2] = res.z;
    f.position[1] = world.groundHeightAt(res.x, res.z);
    f.heading = a;
    f.energy = Math.max(0, (f.energy ?? 1) - 0.3);
    f.moodT = 0.15;
    return;
  }
}

/** A cornered crawler inches along the wall — slow, but it never just gives up. */
function wallCrawl(
  f: FeederState,
  world: CollisionWorld,
  gecko: { x: number; z: number } | undefined,
  food: FoodProfile,
  dt: number,
): void {
  let bx = gecko ? f.position[0] - gecko.x : 1;
  let bz = gecko ? f.position[2] - gecko.z : 0;
  const bd = Math.hypot(bx, bz) || 1;
  bx /= bd;
  bz /= bd;
  // The two wall tangents; take whichever gains more distance from the gecko.
  const cands = [rot(bx, bz, Math.PI / 2), rot(bx, bz, -Math.PI / 2)];
  let best: { x: number; z: number } | null = null;
  let bestGain = -Infinity;
  for (const c of cands) {
    const px = f.position[0] + c.x * 0.03;
    const pz = f.position[2] + c.z * 0.03;
    if (!containsXZ(world.bounds, px, pz, 0.01)) continue;
    const gain = gecko ? Math.hypot(px - gecko.x, pz - gecko.z) : 0;
    if (gain > bestGain) {
      bestGain = gain;
      best = c;
    }
  }
  if (best) {
    f.heading = Math.atan2(best.z, best.x);
    move(f, world, best.x, best.z, food.speed * 2 * dt);
  }
}

/** Soft pairwise separation so insects never stack (O(n²); n is small). */
export function separateInsects(feeders: FeederState[], world: CollisionWorld): void {
  const minD = INSECT_BEHAVIOR.bodyRadius * 2;
  for (let i = 0; i < feeders.length; i++) {
    for (let j = i + 1; j < feeders.length; j++) {
      const a = feeders[i];
      const b = feeders[j];
      if (!a.alive || !b.alive || a.held || b.held) continue;
      let dx = b.position[0] - a.position[0];
      let dz = b.position[2] - a.position[2];
      let d = Math.hypot(dx, dz);
      if (d >= minD) continue;
      if (d < 1e-6) {
        // Perfectly stacked — split along a deterministic per-pair axis.
        const ang = (a.id * 2.399 + b.id * 1.731) % (Math.PI * 2);
        dx = Math.cos(ang);
        dz = Math.sin(ang);
        d = 1;
      } else {
        dx /= d;
        dz /= d;
      }
      const push = (minD - Math.min(d, minD)) / 2 + 0.001;
      shift(a, world, -dx * push, -dz * push);
      shift(b, world, dx * push, dz * push);
    }
  }
}

/** The animal's body displaces insects — it can never stand on top of one. */
export function pushInsectsOut(
  feeders: FeederState[],
  world: CollisionWorld,
  circles: { x: number; z: number; r: number }[],
): void {
  for (const f of feeders) {
    if (!f.alive || f.containedBy || f.held) continue;
    for (const c of circles) {
      const dx = f.position[0] - c.x;
      const dz = f.position[2] - c.z;
      const d = Math.hypot(dx, dz);
      const clear = c.r + INSECT_BEHAVIOR.bodyRadius;
      if (d >= clear) continue;
      const nx = d < 1e-6 ? Math.cos(f.heading ?? 0) : dx / d;
      const nz = d < 1e-6 ? Math.sin(f.heading ?? 0) : dz / d;
      shift(f, world, nx * (clear - d + 0.002), nz * (clear - d + 0.002));
    }
  }
}

/** Displacement that still respects walls/decor + rides the ground. */
function shift(f: FeederState, world: CollisionWorld, dx: number, dz: number): void {
  const res = world.resolve(f.position[0], f.position[2], f.position[0] + dx, f.position[2] + dz, 0.01);
  f.position[0] = res.x;
  f.position[2] = res.z;
  f.position[1] = world.groundHeightAt(res.x, res.z);
}

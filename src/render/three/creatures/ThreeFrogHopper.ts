/**
 * FROG HOPPER — the colorful frog's movement controller (dev Creature Lab; its
 * real rainforest habitat is a future milestone).
 *
 * Real-frog inspired sit-and-wait rhythm: long motionless sits (the GLB's one
 * baked clip — a 2.5 s breathing idle — plays the whole time), a look-around
 * turn BEFORE committing to move, then a chain of parabolic hops to the
 * target with a landing squash-and-recover. A looming threat triggers a
 * startled jump away + a flight to cover beside a shelter. Hops, turns,
 * squash and the feeding lunge are PROCEDURAL — the asset ships no hop/eat
 * clips (documented in the registry), so nothing pretends otherwise.
 *
 * Deliberately lightweight like the other creature controllers: rectangle
 * bounds + groundY sampling, no pathfinding, no collision solves.
 */
import * as THREE from "three";
import { loadCreature, type CreatureModel } from "./ThreeCreatureLoader";
import { getCreature } from "../../../data/creatures/creatureRegistry";

export interface FrogWorld {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Substrate height under a point. */
  groundY(x: number, z: number): number;
  /** Cover spots (plants/rocks) to rest beside. */
  shelters(): { x: number; z: number }[];
  /** A looming threat position (startle trigger), or null. */
  threat(): { x: number; z: number } | null;
  /** Optional: called when the frog finishes a feeding lunge. */
  onEat?(x: number, z: number): void;
  /** Optional collision hook: nudge a landing/travel point out of hard decor
   *  (a frog never sits inside a rock). Identity when absent (the dev Lab). */
  freeSpot?(x: number, z: number): { x: number; z: number };
}

type FrogState = "sit" | "look" | "travel" | "rest";

interface Hop {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  t: number;
  dur: number;
  height: number;
}

interface Frog {
  model: CreatureModel;
  mixer: THREE.AnimationMixer | null;
  x: number;
  z: number;
  heading: number;
  state: FrogState;
  timer: number;
  /** Travel destination (travel state). */
  tx: number;
  tz: number;
  /** Whether the current travel is a startled flight (bigger, faster hops). */
  fleeing: boolean;
  /** Food lunge target (set by offerFood), consumed on arrival. */
  foodX: number | null;
  foodZ: number | null;
  hop: Hop | null;
  /** Pause between chained hops. */
  hopPause: number;
  /** Landing squash timer (seconds left). */
  squash: number;
  /** Look-around turn goal. */
  lookGoal: number;
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

const SQUASH_TIME = 0.16;

export class ThreeFrogHopper {
  readonly group = new THREE.Group();
  private units: Frog[] = [];
  private dart: number;
  /** World scale: registry sizes are REAL metres; habitat worlds run larger
   *  (FROG_WORLD_SCALE). Scales the model, hop reach/height and thresholds. */
  private k: number;

  constructor(
    private world: FrogWorld,
    opts?: { scale?: number },
  ) {
    this.k = opts?.scale ?? 1;
    const mv = getCreature("colorful_frog").movement;
    this.dart = (mv.dartSpeed ?? mv.cruiseSpeed * 6) * this.k;
  }

  async spawn(count: number): Promise<number> {
    let made = 0;
    for (let i = 0; i < count; i++) {
      const model = await loadCreature("colorful_frog");
      if (!model) break;
      let mixer: THREE.AnimationMixer | null = null;
      const idleName = model.species.asset.rig?.clips.idle;
      const idle = idleName ? model.clips.find((c) => c.name === idleName) : undefined;
      if (idle) {
        mixer = new THREE.AnimationMixer(model.root);
        mixer.clipAction(idle).play();
      }
      const frog: Frog = {
        model,
        mixer,
        x: this.clampX(rand(this.world.minX + 0.1, this.world.maxX - 0.1)),
        z: this.clampZ(rand(this.world.minZ + 0.1, this.world.maxZ - 0.1)),
        heading: rand(0, Math.PI * 2),
        state: "sit",
        timer: rand(1.5, 5),
        tx: 0,
        tz: 0,
        fleeing: false,
        foodX: null,
        foodZ: null,
        hop: null,
        hopPause: 0,
        squash: 0,
        lookGoal: 0,
      };
      model.root.scale.setScalar(this.k);
      this.place(frog, 0);
      this.group.add(model.root);
      this.units.push(frog);
      made++;
    }
    return made;
  }

  /** The first frog's pick target (click → info card), if spawned. */
  pickRoot(): THREE.Object3D | null {
    return this.units[0]?.model.root ?? null;
  }

  /** The first frog's floor position, if spawned. */
  primary(): { x: number; z: number } | null {
    const u = this.units[0];
    return u ? { x: u.x, z: u.z } : null;
  }

  count(): number {
    return this.units.length;
  }

  positions(): [number, number, number][] {
    return this.units.map((u) => [u.x, this.world.groundY(u.x, u.z), u.z]);
  }

  states(): string[] {
    return this.units.map((u) => (u.hop ? "hop" : u.state));
  }

  /** Baked clip names the loaded asset really ships (debug/readiness). */
  clipNames(): string[] {
    return this.units[0]?.model.clips.map((c) => c.name) ?? [];
  }

  /** Basic feeding hook: the nearest frog hops over and takes the morsel. */
  offerFood(x: number, z: number): void {
    let best: Frog | null = null;
    let bd = Infinity;
    for (const u of this.units) {
      const d = Math.hypot(u.x - x, u.z - z);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    if (!best) return;
    best.foodX = this.clampX(x);
    best.foodZ = this.clampZ(z);
    best.state = "look";
    best.timer = rand(0.4, 0.8);
    best.lookGoal = Math.atan2(best.foodX - best.x, best.foodZ - best.z);
  }

  clear(): void {
    for (const u of this.units) this.group.remove(u.model.root);
    this.units = [];
  }

  dispose(): void {
    this.clear();
  }

  private clampX(x: number): number {
    return THREE.MathUtils.clamp(x, this.world.minX + 0.05 * this.k, this.world.maxX - 0.05 * this.k);
  }

  private clampZ(z: number): number {
    return THREE.MathUtils.clamp(z, this.world.minZ + 0.05 * this.k, this.world.maxZ - 0.05 * this.k);
  }

  private shelterSpot(): { x: number; z: number } {
    const shelters = this.world.shelters();
    if (!shelters.length) {
      return { x: this.clampX(this.world.minX + 0.08), z: this.clampZ(rand(this.world.minZ, this.world.maxZ)) };
    }
    const s = shelters[Math.floor(Math.random() * shelters.length)];
    const a = rand(0, Math.PI * 2);
    const r = rand(0.05, 0.12) * this.k;
    return { x: this.clampX(s.x + Math.sin(a) * r), z: this.clampZ(s.z + Math.cos(a) * r) };
  }

  private startTravel(u: Frog, tx: number, tz: number, fleeing: boolean): void {
    u.state = "travel";
    const goal = this.world.freeSpot?.(this.clampX(tx), this.clampZ(tz)) ?? { x: tx, z: tz };
    u.tx = this.clampX(goal.x);
    u.tz = this.clampZ(goal.z);
    u.fleeing = fleeing;
    u.hopPause = fleeing ? 0 : rand(0.1, 0.4);
    u.timer = 12; // travel watchdog — settle wherever we are if it expires
  }

  private beginHop(u: Frog): void {
    const dx = u.tx - u.x;
    const dz = u.tz - u.z;
    const dist = Math.hypot(dx, dz);
    const body = u.model.species.asset.bodyLength * this.k;
    const big = u.fleeing || dist > body * 3.2;
    const reach = Math.min(dist, big ? rand(body * 3, body * 4.6) : rand(body * 1.2, body * 2));
    u.heading = Math.atan2(dx, dz);
    // The landing point is nudged out of hard decor (never sit inside a rock).
    const rawX = this.clampX(u.x + Math.sin(u.heading) * reach);
    const rawZ = this.clampZ(u.z + Math.cos(u.heading) * reach);
    const land = this.world.freeSpot?.(rawX, rawZ) ?? { x: rawX, z: rawZ };
    u.hop = {
      fromX: u.x,
      fromZ: u.z,
      toX: this.clampX(land.x),
      toZ: this.clampZ(land.z),
      t: 0,
      // Flight time from the species' speeds so registry tuning matters.
      dur: THREE.MathUtils.clamp(reach / (big ? this.dart : this.dart * 0.55), 0.22, 0.5),
      height: (big ? rand(0.055, 0.085) : rand(0.02, 0.035)) * this.k,
    };
  }

  private place(u: Frog, hopY: number): void {
    const y = this.world.groundY(u.x, u.z);
    u.model.root.position.set(u.x, y + hopY, u.z);
    u.model.root.rotation.y = u.heading;
  }

  update(dt: number): void {
    if (!this.units.length) return;
    const threat = this.world.threat();

    for (const u of this.units) {
      // Startle: a threat looming close launches a jump AWAY, then cover.
      if (threat && !u.fleeing) {
        const d = Math.hypot(u.x - threat.x, u.z - threat.z);
        if (d < 0.24 * this.k) {
          const away = Math.atan2(u.x - threat.x, u.z - threat.z);
          const s = this.shelterSpot();
          const leap = 0.3 * this.k;
          this.startTravel(u, u.x + Math.sin(away) * leap + (s.x - u.x) * 0.4, u.z + Math.cos(away) * leap + (s.z - u.z) * 0.4, true);
          u.hop = null;
          u.hopPause = 0;
        }
      }

      // ── mid-hop flight ─────────────────────────────────────────────────
      if (u.hop) {
        u.hop.t += dt;
        const f = Math.min(1, u.hop.t / u.hop.dur);
        u.x = THREE.MathUtils.lerp(u.hop.fromX, u.hop.toX, f);
        u.z = THREE.MathUtils.lerp(u.hop.fromZ, u.hop.toZ, f);
        const arcY = Math.sin(f * Math.PI) * u.hop.height;
        this.place(u, arcY);
        // Nose follows the arc: up on take-off, down into the landing.
        u.model.root.rotation.x = -Math.cos(f * Math.PI) * 0.3;
        if (f >= 1) {
          u.hop = null;
          u.squash = SQUASH_TIME;
          u.hopPause = u.fleeing ? rand(0.04, 0.12) : rand(0.25, 0.9);
          u.model.root.rotation.x = 0;
        }
      } else {
        u.timer -= dt;

        switch (u.state) {
          case "sit":
          case "rest":
            if (u.timer <= 0) {
              // Frogs look around BEFORE they commit to moving.
              u.state = "look";
              u.timer = rand(0.7, 1.4);
              u.lookGoal = u.heading + rand(-1.3, 1.3);
            }
            break;
          case "look": {
            let diff = u.lookGoal - u.heading;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            u.heading += THREE.MathUtils.clamp(diff, -2.4 * dt, 2.4 * dt);
            if (u.timer <= 0) {
              if (u.foodX !== null && u.foodZ !== null) {
                this.startTravel(u, u.foodX, u.foodZ, false);
              } else if (Math.random() < 0.55) {
                // Mostly it just looked. Sit back down.
                u.state = Math.random() < 0.3 ? "rest" : "sit";
                u.timer = u.state === "rest" ? rand(6, 14) : rand(2, 8);
              } else if (Math.random() < 0.35) {
                const s = this.shelterSpot();
                this.startTravel(u, s.x, s.z, false);
              } else {
                const r = (getCreature("colorful_frog").movement.wanderRadius ?? 0.4) * this.k;
                this.startTravel(u, u.x + rand(-r, r), u.z + rand(-r, r), false);
              }
            }
            break;
          }
          case "travel": {
            const d = Math.hypot(u.tx - u.x, u.tz - u.z);
            const arrived = d < 0.03 * this.k;
            if (arrived || u.timer <= 0) {
              if (u.foodX !== null && u.foodZ !== null && arrived) {
                // Feeding lunge: a stubby forward hop onto the morsel.
                this.world.onEat?.(u.foodX, u.foodZ);
                u.foodX = null;
                u.foodZ = null;
                u.squash = SQUASH_TIME * 1.4;
              }
              u.fleeing = false;
              u.state = Math.random() < 0.4 ? "rest" : "sit";
              u.timer = u.state === "rest" ? rand(6, 14) : rand(2.5, 9);
            } else {
              u.hopPause -= dt;
              if (u.hopPause <= 0) this.beginHop(u);
            }
            break;
          }
        }
        this.place(u, 0);
      }

      // Landing squash-and-recover on the wrapper scale (art untouched).
      if (u.squash > 0) {
        u.squash = Math.max(0, u.squash - dt);
        const f = u.squash / SQUASH_TIME;
        const dip = Math.sin(Math.min(1, f) * Math.PI) * 0.16;
        u.model.root.scale.set(this.k * (1 + dip * 0.55), this.k * (1 - dip), this.k * (1 + dip * 0.55));
      } else if (u.model.root.scale.y !== this.k) {
        u.model.root.scale.setScalar(this.k);
      }

      // The baked breathing idle runs whenever the frog is grounded; mid-hop
      // it is slowed hard (a throat pulsing in flight reads wrong).
      if (u.mixer) {
        u.mixer.timeScale = u.hop ? 0.15 : u.state === "rest" ? 0.8 : 1;
        u.mixer.update(dt);
      }
    }
  }
}

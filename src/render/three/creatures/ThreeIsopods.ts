/**
 * ISOPOD COLONY — the vivarium's bioactive cleanup crew, rendered from the
 * self-made isopod GLB. Isopods live AROUND the decor: they idle hidden near
 * shelter (hides/rocks), make short nocturnal-style forage runs across the
 * substrate, flee to cover when the gecko stomps close, and while foraging
 * they genuinely CLEAN — the scene wires `onCleanup` into the dirt map, so a
 * colony slowly erases light fouling (droppings still need the keeper).
 *
 * Deliberately lightweight: no collision solves, no pathfinding — they are
 * centimetre-scale background life that stays out of the gecko's systems.
 */
import * as THREE from "three";
import { loadCreature } from "./ThreeCreatureLoader";
import { CreatureAnimator } from "./ThreeCreatureAnimator";
import { getCreature } from "../../../data/creatures/creatureRegistry";

export interface IsopodWorld {
  /** Walkable rectangle (the enclosure's shared walk rect). */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Substrate height under a point (sculpted terrain aware). */
  groundY(x: number, z: number): number;
  /** Cover spots (decor positions) to shelter beside. */
  shelters(): { x: number; z: number }[];
  /** The gecko's position (flee trigger), or null. */
  threat(): { x: number; z: number } | null;
  /** Foraging cleanup hook: nibble dirt at (x,z). */
  onCleanup?(x: number, z: number, amount: number): void;
}

type IsoState = "shelter" | "forage" | "flee";

interface Iso {
  object: THREE.Group;
  anim: CreatureAnimator;
  x: number;
  z: number;
  heading: number;
  state: IsoState;
  timer: number;
  tx: number;
  tz: number;
  speedFrac: number;
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export class ThreeIsopods {
  readonly group = new THREE.Group();
  private units: Iso[] = [];
  private cleanupT = 0;
  private speed: number;

  constructor(private world: IsopodWorld) {
    this.speed = getCreature("isopod").movement.cruiseSpeed;
  }

  async spawn(count: number): Promise<number> {
    let made = 0;
    for (let i = 0; i < count; i++) {
      const model = await loadCreature("isopod");
      if (!model) break;
      const near = this.pickShelterSpot();
      const iso: Iso = {
        object: model.root,
        anim: new CreatureAnimator(model),
        x: near.x,
        z: near.z,
        heading: rand(0, Math.PI * 2),
        state: "shelter",
        timer: rand(2, 14),
        tx: near.x,
        tz: near.z,
        speedFrac: 0,
      };
      this.place(iso);
      this.group.add(iso.object);
      this.units.push(iso);
      made++;
    }
    return made;
  }

  count(): number {
    return this.units.length;
  }

  positions(): [number, number, number][] {
    return this.units.map((u) => [u.x, this.world.groundY(u.x, u.z), u.z]);
  }

  clear(): void {
    for (const u of this.units) this.group.remove(u.object);
    this.units = [];
  }

  private clampX(x: number): number {
    return THREE.MathUtils.clamp(x, this.world.minX + 0.03, this.world.maxX - 0.03);
  }

  private clampZ(z: number): number {
    return THREE.MathUtils.clamp(z, this.world.minZ + 0.03, this.world.maxZ - 0.03);
  }

  private pickShelterSpot(): { x: number; z: number } {
    const shelters = this.world.shelters();
    if (!shelters.length) {
      // No decor: tuck against a wall.
      return { x: this.clampX(this.world.minX + 0.06), z: this.clampZ(rand(this.world.minZ, this.world.maxZ)) };
    }
    const s = shelters[Math.floor(Math.random() * shelters.length)];
    const a = rand(0, Math.PI * 2);
    const r = rand(0.03, 0.1);
    return { x: this.clampX(s.x + Math.sin(a) * r), z: this.clampZ(s.z + Math.cos(a) * r) };
  }

  private place(iso: Iso): void {
    const y = this.world.groundY(iso.x, iso.z);
    iso.object.position.set(iso.x, y, iso.z);
    iso.object.rotation.set(0, iso.heading, 0);
  }

  update(dt: number): void {
    if (!this.units.length) return;
    const threat = this.world.threat();
    this.cleanupT += dt;
    const doCleanup = this.cleanupT >= 0.5; // batch the dirt nibbling
    if (doCleanup) this.cleanupT = 0;

    for (const u of this.units) {
      // Flee check: the gecko looming close sends it scuttling to cover.
      if (threat && u.state !== "flee") {
        const d = Math.hypot(u.x - threat.x, u.z - threat.z);
        if (d < 0.22) {
          const spot = this.pickShelterSpot();
          u.state = "flee";
          u.tx = spot.x;
          u.tz = spot.z;
          u.timer = 4;
        }
      }

      u.timer -= dt;
      if (u.timer <= 0) {
        if (u.state === "shelter") {
          // Mostly stay hidden; sometimes venture out to forage.
          if (Math.random() < 0.45) {
            u.state = "forage";
            u.tx = this.clampX(u.x + rand(-0.35, 0.35));
            u.tz = this.clampZ(u.z + rand(-0.35, 0.35));
            u.timer = rand(4, 9);
          } else {
            u.timer = rand(3, 12);
          }
        } else {
          // Done foraging/fleeing → settle at the nearest cover.
          const spot = this.pickShelterSpot();
          u.state = "shelter";
          u.tx = spot.x;
          u.tz = spot.z;
          u.timer = rand(4, 16);
        }
      }

      // Walk toward the target when away from it.
      const dx = u.tx - u.x;
      const dz = u.tz - u.z;
      const d = Math.hypot(dx, dz);
      let moving = false;
      if (d > 0.015) {
        const want = Math.atan2(dx, dz);
        let diff = want - u.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        u.heading += THREE.MathUtils.clamp(diff, -3 * dt, 3 * dt);
        const sp = this.speed * (u.state === "flee" ? 2.6 : 1);
        u.x = this.clampX(u.x + Math.sin(u.heading) * sp * dt);
        u.z = this.clampZ(u.z + Math.cos(u.heading) * sp * dt);
        moving = true;
      }
      u.speedFrac += ((moving ? (u.state === "flee" ? 1 : 0.55) : 0) - u.speedFrac) * Math.min(1, dt * 6);

      // Foraging isopods genuinely clean the substrate under them.
      if (doCleanup && u.state === "forage" && this.world.onCleanup) {
        this.world.onCleanup(u.x, u.z, 0.006);
      }

      this.place(u);
      u.anim.update(dt, { speedFrac: u.speedFrac, dartFrac: u.state === "flee" ? 1 : 0, resting: u.state === "shelter" && !moving });
    }
  }

  dispose(): void {
    this.clear();
  }
}

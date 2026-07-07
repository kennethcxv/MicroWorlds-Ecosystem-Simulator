/**
 * SURFACE-DWELLING aquarium creatures — the ones that live ON things rather
 * than in open water: cherry shrimp (substrate crawler with a backward escape
 * dart), nerite + mystery snails (slow gliders that climb the glass), and
 * otocinclus (attach-and-graze catfish that hops between surfaces with short
 * swims). All are data-driven from the creature registry; visuals animate via
 * the shared part animator.
 */
import * as THREE from "three";
import type { CreatureSpecies } from "../../../data/creatures/CreatureTypes";
import type { CreatureModel } from "./ThreeCreatureLoader";
import { CreatureAnimator } from "./ThreeCreatureAnimator";
import { makeFusedSwimmer, type FusedSwimmer } from "./ThreeFusedSwimmer";

export interface TankSurfaceSpace {
  /** Inner half-width/-depth the creatures may touch (inside the glass). */
  hw: number;
  hd: number;
  /** Y of the substrate top and the highest climbable waterline. */
  floorY: number;
  topY: number;
  /** Spots worth visiting (plants / hardscape) for gather + graze bias. */
  interest: THREE.Vector3[];
}

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Quaternion with model +Y along `normal` and +Z along `forward`. */
function surfaceQuat(normal: THREE.Vector3, forward: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  _z.copy(forward).normalize();
  _y.copy(normal).normalize();
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y).normalize(); // re-orthogonalize
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

// ── Walls as parametric surfaces ─────────────────────────────────────────────
type WallId = "floor" | "xp" | "xn" | "zp" | "zn";

interface SurfacePoint {
  wall: WallId;
  u: number; // along-wall coordinate
  v: number; // height on walls / depth on floor
}

function surfaceToWorld(s: TankSurfaceSpace, p: SurfacePoint, out: THREE.Vector3): THREE.Vector3 {
  switch (p.wall) {
    case "floor":
      return out.set(p.u, s.floorY, p.v);
    case "xp":
      return out.set(s.hw, p.v, p.u);
    case "xn":
      return out.set(-s.hw, p.v, p.u);
    case "zp":
      return out.set(p.u, p.v, s.hd);
    case "zn":
      return out.set(p.u, p.v, -s.hd);
  }
}

function surfaceNormal(p: SurfacePoint, out: THREE.Vector3): THREE.Vector3 {
  switch (p.wall) {
    case "floor":
      return out.set(0, 1, 0);
    case "xp":
      return out.set(-1, 0, 0);
    case "xn":
      return out.set(1, 0, 0);
    case "zp":
      return out.set(0, 0, -1);
    case "zn":
      return out.set(0, 0, 1);
  }
}

/** Direction of travel in world space for a heading angle on the surface. */
function surfaceDir(p: SurfacePoint, heading: number, out: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(heading);
  const sn = Math.sin(heading);
  switch (p.wall) {
    case "floor":
      return out.set(sn, 0, c);
    case "xp":
      return out.set(0, sn, c);
    case "xn":
      return out.set(0, sn, -c);
    case "zp":
      return out.set(c, sn, 0);
    case "zn":
      return out.set(-c, sn, 0);
  }
}

/** Advance a surface point by (heading, dist); reflects the heading at edges.
 *  Deltas mirror {@link surfaceDir} exactly (floor: u=x uses sin, v=z uses cos;
 *  walls: u = horizontal uses ±cos, v = height uses sin). Returns the
 *  possibly-reflected heading. */
function surfaceStep(s: TankSurfaceSpace, p: SurfacePoint, heading: number, dist: number): number {
  const c = Math.cos(heading) * dist;
  const sn = Math.sin(heading) * dist;
  let h = heading;
  if (p.wall === "floor") {
    p.u += sn;
    p.v += c;
    if (p.u < -s.hw || p.u > s.hw) {
      p.u = THREE.MathUtils.clamp(p.u, -s.hw, s.hw);
      h = -h;
    }
    if (p.v < -s.hd || p.v > s.hd) {
      p.v = THREE.MathUtils.clamp(p.v, -s.hd, s.hd);
      h = Math.PI - h;
    }
    return h;
  }
  const sign = p.wall === "xn" || p.wall === "zn" ? -1 : 1;
  p.u += c * sign;
  p.v += sn;
  const uMax = p.wall === "xp" || p.wall === "xn" ? s.hd : s.hw;
  if (p.u < -uMax || p.u > uMax) {
    p.u = THREE.MathUtils.clamp(p.u, -uMax, uMax);
    h = Math.PI - h;
  }
  if (p.v < s.floorY + 0.005 || p.v > s.topY) {
    p.v = THREE.MathUtils.clamp(p.v, s.floorY + 0.005, s.topY);
    h = -h;
  }
  return h;
}

/** A random point on a random wall (weighted toward the front + side glass). */
function randomWallPoint(s: TankSurfaceSpace, includeFloor: boolean): SurfacePoint {
  const walls: WallId[] = includeFloor ? ["floor", "xp", "xn", "zp", "zn"] : ["xp", "xn", "zp", "zn"];
  const wall = walls[Math.floor(Math.random() * walls.length)];
  if (wall === "floor") return { wall, u: rand(-s.hw * 0.85, s.hw * 0.85), v: rand(-s.hd * 0.85, s.hd * 0.85) };
  const uMax = wall === "zp" || wall === "zn" ? s.hw : s.hd;
  return { wall, u: rand(-uMax * 0.8, uMax * 0.8), v: rand(s.floorY + 0.06, s.topY - 0.05) };
}

// ── Cherry shrimp ────────────────────────────────────────────────────────────

type ShrimpState = "graze" | "crawl" | "dart";

export class ShrimpCreature {
  readonly object: THREE.Group;
  private anim: CreatureAnimator;
  private pos = new THREE.Vector3();
  private heading = rand(0, Math.PI * 2);
  private target = new THREE.Vector3();
  private state: ShrimpState = "graze";
  private timer = rand(1, 3);
  private dartVel = 0;
  private cfg: CreatureSpecies;

  constructor(
    model: CreatureModel,
    private space: TankSurfaceSpace,
  ) {
    this.object = model.root;
    this.anim = new CreatureAnimator(model);
    this.cfg = model.species;
    this.pos.set(rand(-space.hw * 0.8, space.hw * 0.8), space.floorY, rand(-space.hd * 0.8, space.hd * 0.8));
    this.pickTarget();
  }

  position(): THREE.Vector3 {
    return this.pos;
  }

  /** Startle response (feeding splash / tap): chance of a backward dart. */
  excite(): void {
    if (Math.random() < 0.6) this.startDart();
  }

  private pickTarget(): void {
    const m = this.cfg.movement;
    // Bias toward interest points (plants / wood) — where real shrimp gather.
    if (this.space.interest.length && Math.random() < 0.55) {
      const p = this.space.interest[Math.floor(Math.random() * this.space.interest.length)];
      this.target.set(
        THREE.MathUtils.clamp(p.x + rand(-0.12, 0.12), -this.space.hw * 0.9, this.space.hw * 0.9),
        this.space.floorY,
        THREE.MathUtils.clamp(p.z + rand(-0.12, 0.12), -this.space.hd * 0.9, this.space.hd * 0.9),
      );
      return;
    }
    const r = m.wanderRadius ?? 0.3;
    this.target.set(
      THREE.MathUtils.clamp(this.pos.x + rand(-r, r), -this.space.hw * 0.9, this.space.hw * 0.9),
      this.space.floorY,
      THREE.MathUtils.clamp(this.pos.z + rand(-r, r), -this.space.hd * 0.9, this.space.hd * 0.9),
    );
  }

  private startDart(): void {
    this.state = "dart";
    this.timer = rand(0.25, 0.45);
    this.dartVel = this.cfg.movement.dartSpeed ?? 0.5;
  }

  update(dt: number): void {
    const m = this.cfg.movement;
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.state === "dart") {
        this.state = "graze";
        this.timer = rand(1.2, 2.6);
      } else if (this.state === "graze") {
        if (Math.random() < (m.backDartChance ?? 0)) {
          this.startDart();
        } else if (Math.random() < (m.pauseChance ?? 0.5)) {
          this.state = "graze";
          this.timer = rand(1.5, 4);
        } else {
          this.state = "crawl";
          this.timer = rand(3, 7);
          this.pickTarget();
        }
      } else {
        this.state = "graze";
        this.timer = rand(1.5, 4);
      }
    }

    let speedFrac = 0.1;
    if (this.state === "crawl") {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.02) {
        this.state = "graze";
        this.timer = rand(1.5, 4);
      } else {
        const want = Math.atan2(dx, dz);
        let diff = want - this.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.heading += THREE.MathUtils.clamp(diff, -2.4 * dt, 2.4 * dt);
        this.pos.x += Math.sin(this.heading) * m.cruiseSpeed * dt;
        this.pos.z += Math.cos(this.heading) * m.cruiseSpeed * dt;
        speedFrac = 0.55;
      }
    } else if (this.state === "dart") {
      // Shoots BACKWARD along its facing — the classic shrimp escape flick.
      this.dartVel *= Math.pow(0.02, dt); // sharp decay
      this.pos.x -= Math.sin(this.heading) * this.dartVel * dt;
      this.pos.z -= Math.cos(this.heading) * this.dartVel * dt;
      speedFrac = 1;
    }
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -this.space.hw * 0.94, this.space.hw * 0.94);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -this.space.hd * 0.94, this.space.hd * 0.94);

    this.object.position.copy(this.pos);
    this.object.rotation.set(0, this.heading, 0);
    this.anim.update(dt, { speedFrac, dartFrac: this.state === "dart" ? 1 : 0 });
  }
}

// ── Snails ───────────────────────────────────────────────────────────────────

export class SnailCreature {
  readonly object: THREE.Group;
  readonly speciesId: string;
  private anim: CreatureAnimator;
  private sp: SurfacePoint;
  private heading = rand(0, Math.PI * 2);
  private pauseT = 0;
  private retargetT = rand(4, 10);
  private cfg: CreatureSpecies;
  private wallChance: number;
  private posW = new THREE.Vector3();
  private dirW = new THREE.Vector3();
  private nrm = new THREE.Vector3();
  private targetQ = new THREE.Quaternion();

  constructor(
    model: CreatureModel,
    private space: TankSurfaceSpace,
  ) {
    this.object = model.root;
    this.speciesId = model.species.id;
    this.anim = new CreatureAnimator(model);
    this.cfg = model.species;
    // Nerites are keen glass climbers; mystery snails wander the floor more.
    this.wallChance = this.cfg.id === "nerite_snail" ? 0.6 : 0.3;
    this.sp =
      Math.random() < this.wallChance
        ? randomWallPoint(space, false)
        : { wall: "floor", u: rand(-space.hw * 0.7, space.hw * 0.7), v: rand(-space.hd * 0.7, space.hd * 0.7) };
    this.place(1);
  }

  position(): THREE.Vector3 {
    return this.posW;
  }

  private place(snap = 0): void {
    surfaceToWorld(this.space, this.sp, this.posW);
    surfaceNormal(this.sp, this.nrm);
    surfaceDir(this.sp, this.heading, this.dirW);
    surfaceQuat(this.nrm, this.dirW, this.targetQ);
    this.object.position.copy(this.posW);
    if (snap >= 1) this.object.quaternion.copy(this.targetQ);
  }

  update(dt: number): void {
    const m = this.cfg.movement;
    let moving = 0;
    if (this.pauseT > 0) {
      this.pauseT -= dt;
    } else {
      this.retargetT -= dt;
      if (this.retargetT <= 0) {
        this.retargetT = rand(5, 12);
        if (Math.random() < (m.pauseChance ?? 0.4)) this.pauseT = rand(2, 6);
        else this.heading += rand(-1.2, 1.2);
        // Occasionally migrate floor ↔ glass (snails patrol everything).
        if (Math.random() < 0.18) {
          this.sp = Math.random() < this.wallChance ? randomWallPoint(this.space, false) : randomWallPoint(this.space, true);
          this.place(1);
        }
      }
      this.heading = surfaceStep(this.space, this.sp, this.heading, m.cruiseSpeed * dt);
      moving = 1;
    }
    this.place();
    // Ease orientation (a slow animal never snaps).
    this.object.quaternion.slerp(this.targetQ, Math.min(1, dt * 3));
    this.anim.update(dt, { speedFrac: moving * 0.6, resting: this.pauseT > 0 });
  }
}

// ── Otocinclus ───────────────────────────────────────────────────────────────

type OtoState = "attached" | "swim";

export class OtoCreature {
  readonly object: THREE.Group;
  // Otos swim between surfaces — fish-shaped, so they get the fused
  // detachment-proof body + wave, like the schooling fish.
  private swim: FusedSwimmer;
  private state: OtoState = "attached";
  private sp: SurfacePoint;
  private heading = rand(0, Math.PI * 2);
  private timer: number;
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private targetSp: SurfacePoint | null = null;
  private targetPos = new THREE.Vector3();
  private nrm = new THREE.Vector3();
  private dirW = new THREE.Vector3();
  private targetQ = new THREE.Quaternion();
  private cfg: CreatureSpecies;

  constructor(
    model: CreatureModel,
    private space: TankSurfaceSpace,
  ) {
    this.swim = makeFusedSwimmer(model);
    this.object = this.swim.object;
    this.cfg = model.species;
    this.sp = randomWallPoint(space, true);
    const st = this.cfg.movement.surfaceTime ?? ([8, 26] as [number, number]);
    this.timer = rand(st[0], st[1]);
    surfaceToWorld(space, this.sp, this.pos);
    this.applyAttachedPose(1);
  }

  position(): THREE.Vector3 {
    return this.pos;
  }

  excite(): void {
    // Startled otos dart off their surface.
    if (this.state === "attached" && Math.random() < 0.7) this.beginSwim();
  }

  private applyAttachedPose(snap = 0): void {
    surfaceToWorld(this.space, this.sp, this.pos);
    surfaceNormal(this.sp, this.nrm);
    surfaceDir(this.sp, this.heading, this.dirW);
    surfaceQuat(this.nrm, this.dirW, this.targetQ);
    this.object.position.copy(this.pos);
    if (snap >= 1) this.object.quaternion.copy(this.targetQ);
  }

  private beginSwim(): void {
    this.state = "swim";
    this.targetSp = randomWallPoint(this.space, true);
    surfaceToWorld(this.space, this.targetSp, this.targetPos);
    // Ease target slightly off the wall so the approach lands naturally.
    surfaceNormal(this.targetSp, this.nrm);
    this.targetPos.addScaledVector(this.nrm, 0.01);
    this.vel.set(0, 0, 0);
    this.timer = 12; // failsafe
  }

  update(dt: number): void {
    const m = this.cfg.movement;
    if (this.state === "attached") {
      this.timer -= dt;
      // Graze creep: a slow shuffle along the surface.
      if (Math.random() < 0.5) {
        this.heading += rand(-0.3, 0.3) * dt;
        this.heading = surfaceStep(this.space, this.sp, this.heading, 0.006 * dt * 60);
      }
      this.applyAttachedPose();
      this.object.quaternion.slerp(this.targetQ, Math.min(1, dt * 4));
      this.swim.setSwim(0.05, 0, 0, true);
      this.swim.update(dt);
      if (this.timer <= 0) this.beginSwim();
      return;
    }
    // Swimming reposition — fish-like steer to the next surface point.
    this.timer -= dt;
    const toT = this.targetPos.clone().sub(this.pos);
    const d = toT.length();
    if (d < 0.03 || this.timer <= 0) {
      this.state = "attached";
      if (this.targetSp) this.sp = this.targetSp;
      const st = m.surfaceTime ?? ([8, 26] as [number, number]);
      this.timer = rand(st[0], st[1]);
      this.heading = rand(0, Math.PI * 2);
      this.applyAttachedPose();
      return;
    }
    const speed = m.cruiseSpeed;
    const desired = toT.normalize().multiplyScalar(speed);
    this.vel.lerp(desired, Math.min(1, dt * (m.accel ?? 1.4)));
    this.pos.addScaledVector(this.vel, dt);
    // Keep inside the water while travelling.
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -this.space.hw + 0.02, this.space.hw - 0.02);
    this.pos.y = THREE.MathUtils.clamp(this.pos.y, this.space.floorY + 0.01, this.space.topY - 0.02);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -this.space.hd + 0.02, this.space.hd - 0.02);
    this.object.position.copy(this.pos);
    if (this.vel.lengthSq() > 1e-6) {
      surfaceQuat(UP, this.vel, this.targetQ);
      this.object.quaternion.slerp(this.targetQ, Math.min(1, (m.turnRate ?? 5) * dt));
    }
    this.swim.setSwim(Math.min(1, this.vel.length() / Math.max(0.05, speed)), 0, 0);
    this.swim.update(dt);
  }
}

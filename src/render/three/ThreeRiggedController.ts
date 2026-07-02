/**
 * Steering + skeletal animation for RIGGED terrarium animals (AAA path).
 *
 * The GLB ships an armature + skin + baked "idle"/"walk"/"run" clips. Key
 * behaviours for natural motion:
 *  - Locomotion-driven feet: the walk/run clip PHASE advances with distance
 *    travelled (not wall-clock), so the feet don't skate ("gliding"). Speed
 *    blends idle→walk→run.
 *  - Turning happens WHILE stepping (the body never spins in place on ice), and
 *    the spine/tail BEND into the turn (procedural, layered over the clip) so the
 *    whole body moves with the heading like a real animal.
 *  - The root never bobs vertically (no bounce).
 *
 * Animals move noticeably (frequent walks, occasional runs) so they're easy to
 * watch, while keeping subtle idle life (tail/leg/abdomen) when resting.
 */
import * as THREE from "three";
import type { GroundBounds } from "./ThreeEnclosure";
import type { RiggedModel } from "./ThreeAssetLoader";

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const Z = new THREE.Vector3(0, 0, 1);

export interface RiggedConfig {
  bodyLength: number; // world size along the model's length axis
  walkSpeed: number;
  runSpeed: number;
  accel: number;
  turnRate: number; // heading ease while moving (1/s)
  runChance: number; // chance a move leg is a run
  moveDur: [number, number];
  idleDur: [number, number];
  idleChance: number;
  strideWalk: number; // world distance per walk cycle (foot-lock tuning)
  strideRun: number;
  modelYaw: number; // rotation so the model's head faces +Z
  /** Spine/tail bones to bend into turns: [boneName, factor]. */
  bendBones: [string, number][];
  bendGain: number;
}

export const RIGGED_LIZARD: RiggedConfig = {
  bodyLength: 0.7,
  walkSpeed: 0.32,
  runSpeed: 0.95,
  accel: 2.4,
  turnRate: 3.0,
  runChance: 0.4,
  moveDur: [1.8, 3.6],
  idleDur: [1.4, 3.4],
  idleChance: 0.4,
  strideWalk: 0.5,
  strideRun: 0.85,
  modelYaw: Math.PI,
  bendBones: [
    ["neckHead", -0.5],
    ["spineMid", 0.35],
    ["tailA", 0.6],
    ["tailB", 0.95],
    ["tailC", 1.3],
  ],
  bendGain: 0.5,
};

export const RIGGED_SPIDER: RiggedConfig = {
  bodyLength: 0.62,
  walkSpeed: 0.3,
  runSpeed: 0.85,
  accel: 3.0,
  turnRate: 3.2,
  runChance: 0.35,
  moveDur: [1.4, 3.0],
  idleDur: [1.6, 4.0],
  idleChance: 0.45,
  strideWalk: 0.42,
  strideRun: 0.7,
  modelYaw: -Math.PI / 2,
  bendBones: [["abdomen", 0.5]],
  bendGain: 0.35,
};

export class RiggedCreature {
  readonly object = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private idle: THREE.AnimationAction;
  private walk: THREE.AnimationAction;
  private run: THREE.AnimationAction;
  private walkDur: number;
  private runDur: number;
  private bend: { bone: THREE.Object3D; factor: number; baseQ: THREE.Quaternion }[] = [];
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private target = new THREE.Vector3();
  private state: "move" | "idle" = "idle";
  private stateT = 0;
  private moveSpeed: number;
  private yaw = 0;
  private bodyBend = 0;
  private exciteT = 0;
  private dist = 0;
  private footY: number;
  private _q = new THREE.Quaternion();

  constructor(
    model: RiggedModel,
    private cfg: RiggedConfig,
    private bounds: GroundBounds,
  ) {
    const scale = cfg.bodyLength / Math.max(1e-3, model.size.z);
    this.footY = bounds.y - model.minY * scale;
    const inner = model.scene;
    inner.scale.setScalar(scale);
    inner.rotation.y = cfg.modelYaw;
    this.object.add(inner);

    this.mixer = new THREE.AnimationMixer(inner);
    const clip = (n: string) => THREE.AnimationClip.findByName(model.clips, n) ?? model.clips[0];
    this.idle = this.mixer.clipAction(clip("idle"));
    this.walk = this.mixer.clipAction(clip("walk"));
    this.run = this.mixer.clipAction(clip("run"));
    this.walkDur = this.walk.getClip().duration || 1;
    this.runDur = this.run.getClip().duration || 1;
    for (const a of [this.idle, this.walk, this.run]) a.play();
    this.idle.setEffectiveWeight(1);
    this.walk.setEffectiveWeight(0);
    this.run.setEffectiveWeight(0);
    this.walk.setEffectiveTimeScale(0); // phase driven by distance
    this.run.setEffectiveTimeScale(0);

    // Cache turn-bend bones + their rest rotation.
    for (const [name, factor] of cfg.bendBones) {
      const bone = inner.getObjectByName(name);
      if (bone) this.bend.push({ bone, factor, baseQ: bone.quaternion.clone() });
    }

    this.moveSpeed = cfg.walkSpeed;
    this.yaw = rand(-Math.PI, Math.PI);
    this.pos.set(rand(bounds.minX, bounds.maxX), bounds.y, rand(bounds.minZ, bounds.maxZ));
    this.object.position.set(this.pos.x, this.footY, this.pos.z);
    this.pickTarget();
    this.enterIdle();
  }

  excite(): void {
    this.exciteT = 1.4;
    this.pickTarget();
    this.enterMove(true);
  }

  private pickTarget(): void {
    // Prefer a target some distance away so the animal actually travels.
    for (let i = 0; i < 6; i++) {
      const x = rand(this.bounds.minX, this.bounds.maxX);
      const z = rand(this.bounds.minZ, this.bounds.maxZ);
      if (Math.hypot(x - this.pos.x, z - this.pos.z) > this.cfg.bodyLength * 1.5) {
        this.target.set(x, this.bounds.y, z);
        return;
      }
    }
    this.target.set(rand(this.bounds.minX, this.bounds.maxX), this.bounds.y, rand(this.bounds.minZ, this.bounds.maxZ));
  }
  private enterIdle(): void {
    this.state = "idle";
    this.stateT = rand(this.cfg.idleDur[0], this.cfg.idleDur[1]);
  }
  private enterMove(run = Math.random() < this.cfg.runChance): void {
    this.state = "move";
    this.stateT = rand(this.cfg.moveDur[0], this.cfg.moveDur[1]);
    this.moveSpeed = run ? this.cfg.runSpeed : this.cfg.walkSpeed;
  }
  private advance(): void {
    if (this.state === "move" && Math.random() < this.cfg.idleChance) this.enterIdle();
    else {
      this.pickTarget();
      this.enterMove();
    }
  }

  update(dt: number): void {
    const c = this.cfg;
    if (this.exciteT > 0) this.exciteT -= dt;
    this.stateT -= dt;
    if (this.stateT <= 0) this.advance();

    const targetSpeed = this.exciteT > 0 ? c.runSpeed : this.moveSpeed;
    let turnTo = this.yaw;

    if (this.state === "move") {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < c.bodyLength * 0.7) this.advance();
      if (dist > 1e-4) {
        const slow = THREE.MathUtils.clamp(dist / (c.bodyLength * 1.6), 0.2, 1);
        const desX = (dx / dist) * targetSpeed * slow;
        const desZ = (dz / dist) * targetSpeed * slow;
        let ax = (desX - this.vel.x) * 3;
        let az = (desZ - this.vel.z) * 3;
        const am = Math.hypot(ax, az);
        if (am > c.accel) {
          ax = (ax / am) * c.accel;
          az = (az / am) * c.accel;
        }
        this.vel.x += ax * dt;
        this.vel.z += az * dt;
        turnTo = Math.atan2(dx, dz);
      }
    } else {
      const damp = Math.max(0, 1 - dt * 6);
      this.vel.x *= damp;
      this.vel.z *= damp;
    }

    const speed = Math.hypot(this.vel.x, this.vel.z);
    const vmax = targetSpeed * 1.1;
    if (speed > vmax) {
      this.vel.x = (this.vel.x / speed) * vmax;
      this.vel.z = (this.vel.z / speed) * vmax;
    }

    const stepX = this.vel.x * dt;
    const stepZ = this.vel.z * dt;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x + stepX, this.bounds.minX, this.bounds.maxX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z + stepZ, this.bounds.minZ, this.bounds.maxZ);
    this.object.position.set(this.pos.x, this.footY, this.pos.z);
    this.dist += Math.hypot(stepX, stepZ);

    // Eased heading + turn rate (only meaningful while moving).
    let dYaw = turnTo - this.yaw;
    while (dYaw > Math.PI) dYaw -= TAU;
    while (dYaw < -Math.PI) dYaw += TAU;
    const applied = dYaw * Math.min(1, c.turnRate * dt);
    this.yaw += applied;
    this.object.rotation.y = this.yaw;
    const yawRate = applied / Math.max(dt, 1e-3);

    // ── Clip blend: idle → walk → run by speed; feet driven by distance ──
    const sp = Math.hypot(this.vel.x, this.vel.z);
    let wIdle = 0, wWalk = 0, wRun = 0;
    if (sp <= c.walkSpeed) {
      const t = THREE.MathUtils.clamp(sp / c.walkSpeed, 0, 1);
      wIdle = 1 - t; wWalk = t;
    } else {
      const t = THREE.MathUtils.clamp((sp - c.walkSpeed) / (c.runSpeed - c.walkSpeed), 0, 1);
      wWalk = 1 - t; wRun = t;
    }
    this.idle.setEffectiveWeight(wIdle);
    this.walk.setEffectiveWeight(wWalk);
    this.run.setEffectiveWeight(wRun);
    this.walk.time = ((this.dist / c.strideWalk) % 1) * this.walkDur;
    this.run.time = ((this.dist / c.strideRun) % 1) * this.runDur;

    this.mixer.update(dt);

    // ── Procedural turn-bend layered over the clip: body curves into turns ──
    const targetBend = THREE.MathUtils.clamp(yawRate * c.bendGain, -0.6, 0.6);
    this.bodyBend += (targetBend - this.bodyBend) * Math.min(1, dt * 5);
    for (const b of this.bend) {
      this._q.setFromAxisAngle(Z, this.bodyBend * b.factor);
      b.bone.quaternion.multiply(this._q);
    }
  }
}

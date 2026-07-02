/**
 * Steering + animation for grounded terrarium animals (spider, lizard). One
 * parametric controller drives both via per-species configs, so adding more land
 * critters later is just another config.
 *
 * Movement: position/velocity/acceleration toward a roaming target on the
 * substrate plane, idle/move state machine, eased yaw turning, hard enclosure
 * bounds. Everything stays grounded (no flight, no wall-climb in this spike).
 *
 * Animation strategy (assets are FUSED + UNRIGGED, so no per-leg motion):
 *  - LIZARD: reuses the body-wave (lateral spine + tail follow-through) — exactly
 *    how a real lizard crawls — plus idle "breathing". Reads convincingly.
 *  - SPIDER: no rig and no separable legs, so we do NOT fake leg cycles. Instead:
 *    bursty start/stop locomotion + a small gait bob/nod while moving. Honest
 *    limitation — believable spider legs need a rigged or part-separated asset.
 *
 * Like the fish, the body is ONE unified mesh under the root, so nothing detaches.
 */
import * as THREE from "three";
import { applyFishWave, type FishWave } from "./ThreeFishAnimation";
import type { LoadedModel } from "./ThreeAssetLoader";
import type { GroundBounds } from "./ThreeEnclosure";

const TAU = Math.PI * 2;

export interface GroundConfig {
  bodyLength: number; // world units along the model's length axis (Z)
  speed: number;
  dashSpeed: number;
  accel: number;
  turnRate: number; // yaw ease (1/s)
  moveDur: [number, number];
  idleDur: [number, number];
  idleChance: number; // chance to rest after reaching/finishing a move leg
  bursty: boolean; // move at dash speed in short bursts (spider)
  useWave: boolean; // lateral spine+tail wave (lizard)
  waveAmpMove: number; // frac of bodyLength
  waveAmpIdle: number;
  waveFreqMove: number; // Hz
  waveFreqIdle: number;
  gaitBob: number; // vertical bob while moving (frac of bodyLength)
  gaitBobFreq: number; // Hz
  gaitPitch: number; // fore/aft nod while moving (radians)
  breathe: number; // idle belly pulse (frac of height)
  breatheFreq: number; // Hz
  headPlusZ: boolean; // model head points +Z in its local frame
}

export const SPIDER: GroundConfig = {
  bodyLength: 0.52,
  speed: 0.45,
  dashSpeed: 1.7,
  accel: 7,
  turnRate: 7,
  moveDur: [0.45, 1.2],
  idleDur: [0.7, 2.4],
  idleChance: 0.55,
  bursty: true,
  useWave: false,
  waveAmpMove: 0,
  waveAmpIdle: 0,
  waveFreqMove: 0,
  waveFreqIdle: 0,
  gaitBob: 0, // no vertical bounce
  gaitBobFreq: 0,
  gaitPitch: 0,
  breathe: 0.01,
  breatheFreq: 1.4,
  headPlusZ: true,
};

export const LIZARD: GroundConfig = {
  bodyLength: 0.62,
  speed: 0.34,
  dashSpeed: 1.2,
  accel: 2.6,
  turnRate: 2.8,
  moveDur: [2, 4.5],
  idleDur: [1.6, 3.6],
  idleChance: 0.5,
  bursty: false,
  useWave: true,
  waveAmpMove: 0.07,
  waveAmpIdle: 0.015,
  waveFreqMove: 2.3,
  waveFreqIdle: 0.5,
  gaitBob: 0,
  gaitBobFreq: 0,
  gaitPitch: 0,
  breathe: 0.03,
  breatheFreq: 0.85,
  headPlusZ: true,
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class GroundCreature {
  readonly object = new THREE.Group();
  private inner = new THREE.Group();
  private wave: FishWave | null = null;
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private target = new THREE.Vector3();
  private state: "move" | "idle" = "idle";
  private stateT = 0;
  private yaw = 0;
  private t = 0;
  private exciteT = 0;
  private footOffset: number;
  private baseScale: number;

  constructor(
    model: LoadedModel,
    private cfg: GroundConfig,
    private bounds: GroundBounds,
  ) {
    const scale = cfg.bodyLength / Math.max(1e-3, model.size.z);
    this.baseScale = scale;
    const clone = cloneWithMaterials(model.object);
    this.inner.add(clone);
    this.inner.scale.setScalar(scale);
    if (!cfg.headPlusZ) this.inner.rotation.y = Math.PI;
    this.object.add(this.inner);
    if (cfg.useWave) this.wave = applyFishWave(clone, cfg.headPlusZ);
    this.footOffset = (model.size.y * scale) / 2;

    this.pos.set(rand(bounds.minX, bounds.maxX), bounds.y, rand(bounds.minZ, bounds.maxZ));
    this.object.position.set(this.pos.x, bounds.y + this.footOffset, this.pos.z);
    this.pickTarget();
    this.enterIdle();
  }

  /** Disturbance/feeding poke: dash to a fresh target. */
  excite(): void {
    this.exciteT = 1.6;
    this.pickTarget();
    this.state = "move";
    this.stateT = rand(0.5, 1.1);
  }

  private pickTarget(): void {
    this.target.set(
      rand(this.bounds.minX, this.bounds.maxX),
      this.bounds.y,
      rand(this.bounds.minZ, this.bounds.maxZ),
    );
  }
  private enterIdle(): void {
    this.state = "idle";
    this.stateT = rand(this.cfg.idleDur[0], this.cfg.idleDur[1]);
  }
  private enterMove(): void {
    this.state = "move";
    this.stateT = rand(this.cfg.moveDur[0], this.cfg.moveDur[1]);
  }
  private advance(): void {
    if (this.state === "move" && Math.random() < this.cfg.idleChance) {
      this.enterIdle();
    } else {
      this.pickTarget();
      this.enterMove();
    }
  }

  update(dt: number): void {
    const c = this.cfg;
    this.t += dt;
    if (this.exciteT > 0) this.exciteT -= dt;
    this.stateT -= dt;
    if (this.stateT <= 0) this.advance();

    const fast = c.bursty || this.exciteT > 0;
    const targetSpeed = fast ? c.dashSpeed : c.speed;

    if (this.state === "move") {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const arrive = c.bodyLength;
      if (dist < arrive) this.advance();
      if (dist > 1e-4) {
        const slow = THREE.MathUtils.clamp(dist / arrive, 0.2, 1);
        const desX = (dx / dist) * targetSpeed * slow;
        const desZ = (dz / dist) * targetSpeed * slow;
        let ax = (desX - this.vel.x) * 4;
        let az = (desZ - this.vel.z) * 4;
        const am = Math.hypot(ax, az);
        if (am > c.accel) {
          ax = (ax / am) * c.accel;
          az = (az / am) * c.accel;
        }
        this.vel.x += ax * dt;
        this.vel.z += az * dt;
      }
    } else {
      const damp = Math.max(0, 1 - dt * 6);
      this.vel.x *= damp;
      this.vel.z *= damp;
    }

    const vmax = targetSpeed * 1.12;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > vmax) {
      this.vel.x = (this.vel.x / sp) * vmax;
      this.vel.z = (this.vel.z / sp) * vmax;
    }

    this.pos.x = THREE.MathUtils.clamp(this.pos.x + this.vel.x * dt, this.bounds.minX, this.bounds.maxX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z + this.vel.z * dt, this.bounds.minZ, this.bounds.maxZ);

    const speed = Math.hypot(this.vel.x, this.vel.z);
    let yawRate = 0;
    if (speed > 0.02) {
      const tgt = Math.atan2(this.vel.x, this.vel.z);
      let d = tgt - this.yaw;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      const step = d * Math.min(1, c.turnRate * dt);
      this.yaw += step;
      yawRate = step / Math.max(dt, 1e-3);
    }
    this.object.rotation.y = this.yaw;

    const moving = speed > c.speed * 0.25;
    const bob = moving && c.gaitBob > 0
      ? Math.abs(Math.sin(this.t * c.gaitBobFreq * Math.PI)) * c.gaitBob * c.bodyLength
      : 0;
    this.object.position.set(this.pos.x, this.bounds.y + this.footOffset + bob, this.pos.z);

    // Fore/aft nod (spider gait) — keeps the static head-flip on .y intact.
    this.inner.rotation.x = moving && c.gaitPitch > 0
      ? Math.sin(this.t * c.gaitBobFreq * Math.PI) * c.gaitPitch
      : this.inner.rotation.x * 0.85;

    // Idle breathing — subtle belly (vertical) pulse.
    const breatheAmt = c.breathe * (this.state === "idle" ? 1 : 0.35);
    const breathe = 1 + Math.sin(this.t * c.breatheFreq * TAU) * breatheAmt;
    this.inner.scale.set(this.baseScale, this.baseScale * breathe, this.baseScale);

    if (this.wave) {
      const amp = moving ? c.waveAmpMove : c.waveAmpIdle;
      const freq = moving ? c.waveFreqMove : c.waveFreqIdle;
      const turnFrac = THREE.MathUtils.clamp(yawRate * 0.3, -0.5, 0.5);
      this.wave.setMotion(amp, freq, turnFrac);
      this.wave.update(dt);
    }
  }
}

/** Deep-clone giving each mesh its own materials (independent wave uniforms),
 *  sharing geometry + textures. */
function cloneWithMaterials(obj: THREE.Object3D): THREE.Object3D {
  const c = obj.clone(true);
  c.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m.clone())
      : mesh.material.clone();
  });
  return c;
}

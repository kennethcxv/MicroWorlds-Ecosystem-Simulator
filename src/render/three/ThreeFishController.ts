/**
 * Per-fish steering AI for the experimental 3D tank. Each fish has position,
 * velocity, acceleration, a roaming target, a depth/zone preference, an
 * idle(hover)/cruise/dart state machine, soft wall avoidance, banking into
 * turns, and pitch from vertical motion. Movement is acceleration-limited so
 * paths curve and fish ease in/out of speed — never snapping or just bobbing.
 *
 * The body deformation (tail swish) is delegated to ThreeFishAnimation; this
 * controller feeds it amplitude/frequency from the current speed + state.
 */
import * as THREE from "three";
import {
  type TankBounds,
  alongX,
  alongY,
  alongZ,
  clampInside,
  wallAvoid,
} from "./ThreeBounds";
import { applyFishWave, type FishWave } from "./ThreeFishAnimation";
import type { LoadedModel } from "./ThreeAssetLoader";

export interface FishKindConfig {
  count: number;
  bodyLength: number; // world units along the swim axis
  cruiseSpeed: number;
  dartSpeed: number;
  accel: number; // steering acceleration cap (units/s^2)
  turnRate: number; // orientation slerp rate (1/s)
  bankFactor: number;
  maxBank: number;
  tailFreqCruise: number;
  tailFreqDart: number;
  hoverFreq: number;
  tailAmpCruise: number;
  tailAmpDart: number;
  tailAmpHover: number;
  dartChance: number;
  hoverChance: number;
  yPref: [number, number]; // preferred vertical band (fraction of bounds)
  zPref: [number, number]; // preferred depth band (0 back .. 1 front)
  headPlusZ: boolean; // model's head points +Z in its local frame
}

export const SMALL_FISH: FishKindConfig = {
  count: 3,
  bodyLength: 0.27,
  cruiseSpeed: 0.6,
  dartSpeed: 1.75,
  accel: 3.4,
  turnRate: 3.6,
  bankFactor: 1.0,
  maxBank: 0.6,
  tailFreqCruise: 2.7,
  tailFreqDart: 5.6,
  hoverFreq: 1.2,
  tailAmpCruise: 0.11,
  tailAmpDart: 0.17,
  tailAmpHover: 0.05,
  dartChance: 0.18,
  hoverChance: 0.14,
  yPref: [0.25, 0.9],
  zPref: [0.05, 0.7],
  headPlusZ: true,
};

export const CENTERPIECE_FISH: FishKindConfig = {
  count: 1,
  bodyLength: 0.42,
  cruiseSpeed: 0.34,
  dartSpeed: 0.95,
  accel: 1.9,
  turnRate: 1.9,
  bankFactor: 0.75,
  maxBank: 0.45,
  tailFreqCruise: 1.7,
  tailFreqDart: 3.3,
  hoverFreq: 0.8,
  tailAmpCruise: 0.14,
  tailAmpDart: 0.2,
  tailAmpHover: 0.07,
  dartChance: 0.05,
  hoverChance: 0.3,
  yPref: [0.3, 0.85],
  zPref: [0.35, 1.0],
  headPlusZ: true,
};

type State = "cruise" | "hover" | "dart";

const ZP = new THREE.Vector3(0, 0, 1);
const _toTarget = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _avoid = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _f = new THREE.Vector3();
const _baseQuat = new THREE.Quaternion();
const _bankQuat = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class Fish {
  readonly object = new THREE.Group();
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private target = new THREE.Vector3();
  private state: State = "cruise";
  private stateTimer = rand(2, 5);
  private headingY = 0;
  private bank = 0;
  private exciteT = 0;
  private wave: FishWave;

  /** Which roster entry this fish belongs to (population read-outs). */
  get kind(): FishKindConfig {
    return this.cfg;
  }

  constructor(
    model: LoadedModel,
    private cfg: FishKindConfig,
    private bounds: TankBounds,
  ) {
    const scale = cfg.bodyLength / Math.max(1e-3, model.size.z);
    const clone = cloneWithMaterials(model.object);
    const oriented = new THREE.Group();
    oriented.add(clone);
    oriented.scale.setScalar(scale);
    if (!cfg.headPlusZ) oriented.rotation.y = Math.PI;
    this.object.add(oriented);

    this.wave = applyFishWave(clone, cfg.headPlusZ);

    // Random start + first target inside the fish's preferred zone.
    this.pos.set(
      alongX(bounds, Math.random()),
      alongY(bounds, rand(cfg.yPref[0], cfg.yPref[1])),
      alongZ(bounds, rand(cfg.zPref[0], cfg.zPref[1])),
    );
    this.object.position.copy(this.pos);
    this.pickTarget();
    this.headingY = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
  }

  /** Burst toward the upper-front water (used for the feeding response). */
  excite(): void {
    this.exciteT = 2.6;
    this.state = "dart";
    this.stateTimer = rand(0.6, 1.0);
    this.target.set(
      alongX(this.bounds, Math.random()),
      alongY(this.bounds, rand(0.78, 0.96)),
      alongZ(this.bounds, rand(0.55, 1.0)),
    );
  }

  private pickTarget(): void {
    const c = this.cfg;
    const upper = this.exciteT > 0;
    this.target.set(
      alongX(this.bounds, Math.random()),
      alongY(this.bounds, upper ? rand(0.7, 0.96) : rand(c.yPref[0], c.yPref[1])),
      alongZ(this.bounds, upper ? rand(0.5, 1.0) : rand(c.zPref[0], c.zPref[1])),
    );
  }

  private advanceState(): void {
    const c = this.cfg;
    if (this.state === "dart") {
      this.state = "cruise";
      this.stateTimer = rand(2.5, 5);
      this.pickTarget();
      return;
    }
    const r = Math.random();
    if (r < c.dartChance || this.exciteT > 0) {
      this.state = "dart";
      this.stateTimer = rand(0.5, 1.0);
      this.pickTarget();
    } else if (r < c.dartChance + c.hoverChance) {
      this.state = "hover";
      this.stateTimer = rand(1.4, 3.0);
      // hover near the current spot
      this.target.copy(this.pos);
    } else {
      this.state = "cruise";
      this.stateTimer = rand(2.5, 5.0);
      this.pickTarget();
    }
  }

  update(dt: number): void {
    const c = this.cfg;
    if (this.exciteT > 0) this.exciteT -= dt;

    this.stateTimer -= dt;
    if (this.stateTimer <= 0) this.advanceState();

    const desiredSpeed =
      this.state === "dart"
        ? c.dartSpeed
        : this.state === "hover"
          ? c.cruiseSpeed * 0.16
          : c.cruiseSpeed;

    _toTarget.copy(this.target).sub(this.pos);
    const dist = _toTarget.length();
    const arrive = c.bodyLength * 1.4;
    if (dist < arrive && this.state !== "dart") {
      this.pickTarget();
      _toTarget.copy(this.target).sub(this.pos);
    }

    // Desired velocity toward the target, with arrival slowing.
    _desired.copy(_toTarget);
    if (dist > 1e-4) _desired.multiplyScalar(desiredSpeed / dist);
    const slow = THREE.MathUtils.clamp(dist / arrive, 0.25, 1);
    _desired.multiplyScalar(slow);

    // Steering accel toward desired velocity + soft wall avoidance.
    _accel.copy(_desired).sub(this.vel).multiplyScalar(4.0);
    wallAvoid(this.pos, this.bounds, c.bodyLength * 1.6, c.accel * 2.2, _avoid);
    _accel.add(_avoid);
    const aMax = c.accel * (this.state === "dart" ? 2.2 : 1);
    if (_accel.length() > aMax) _accel.setLength(aMax);

    this.vel.addScaledVector(_accel, dt);
    const vMax = desiredSpeed * 1.15;
    if (this.vel.length() > vMax) this.vel.setLength(vMax);

    this.pos.addScaledVector(this.vel, dt);
    clampInside(this.pos, this.bounds);
    this.object.position.copy(this.pos);

    const speed = this.vel.length();
    let yawRate = 0;
    if (speed > 0.03) {
      _f.copy(this.vel).divideScalar(speed);
      const newHeading = Math.atan2(_f.x, _f.z);
      yawRate = angleDiff(newHeading, this.headingY) / Math.max(dt, 1e-3);
      this.headingY = newHeading;

      _baseQuat.setFromUnitVectors(ZP, _f);
      const targetBank = THREE.MathUtils.clamp(-yawRate * c.bankFactor, -c.maxBank, c.maxBank);
      this.bank += (targetBank - this.bank) * Math.min(1, dt * 6);
      _bankQuat.setFromAxisAngle(_f, this.bank);
      _targetQuat.copy(_baseQuat).premultiply(_bankQuat);
      this.object.quaternion.slerp(_targetQuat, Math.min(1, c.turnRate * dt));
    }

    // Drive the swimming wave from speed + state.
    const speedFrac = THREE.MathUtils.clamp(
      (speed - c.cruiseSpeed * 0.2) / (c.dartSpeed - c.cruiseSpeed * 0.2),
      0,
      1,
    );
    let ampFrac: number;
    let freq: number;
    if (this.state === "hover") {
      ampFrac = c.tailAmpHover;
      freq = c.hoverFreq;
    } else {
      ampFrac = THREE.MathUtils.lerp(c.tailAmpCruise, c.tailAmpDart, speedFrac);
      freq = THREE.MathUtils.lerp(c.tailFreqCruise, c.tailFreqDart, speedFrac);
    }
    const turnFrac = THREE.MathUtils.clamp(yawRate * 0.22, -0.5, 0.5);
    this.wave.setMotion(ampFrac, freq, turnFrac);
    this.wave.update(dt);
  }
}

/** Deep-clone an Object3D, giving each mesh its own material instances (so per-
 *  fish wave uniforms are independent) while sharing geometry + textures. */
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

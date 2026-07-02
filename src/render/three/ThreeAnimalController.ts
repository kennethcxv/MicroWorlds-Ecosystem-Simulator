/**
 * Bridges the pure movement BRAIN (GeckoMovementController) to a Three.js visual.
 * Each frame it ticks the brain (which resolves collisions + picks targets),
 * plants the model on the ground at the brain's position/heading, and drives the
 * animation:
 *   - Rigged GLB with clips (the final leopard_gecko_animated.glb) → plays
 *     idle/move/eat via ThreeAnimationController.
 *   - Otherwise → the procedural ThreeGeckoPlaceholder.
 * So the exact same movement/collision/feeding behaviour is on screen today with
 * the placeholder and the day the freelancer's rig lands — only the visual swaps.
 */
import * as THREE from "three";
import { GeckoMovementController, type HuntTarget } from "../../habitats/lizard/GeckoMovementController";
import { ThreeGeckoPlaceholder } from "./ThreeGeckoPlaceholder";
import { ThreeAnimationController, type ClipAliases, type AnimState } from "./ThreeAnimationController";
import type { RiggedModel } from "./ThreeAssetLoader";

export interface AnimalControllerOptions {
  brain: GeckoMovementController;
  groundY: number;
  /** Final rigged model (skin + clips). When omitted → procedural placeholder. */
  rigged?: RiggedModel | null;
  bodyLength?: number;
  color?: number;
  /** Rotate the rig so its head faces +Z (travel-forward). */
  modelYaw?: number;
  aliases?: Partial<ClipAliases>;
}

export class ThreeAnimalController {
  readonly object = new THREE.Group();
  private brain: GeckoMovementController;
  private groundY: number;
  private footY = 0;
  private placeholder: ThreeGeckoPlaceholder | null = null;
  private anim: ThreeAnimationController | null = null;
  private usingClips = false;
  private footLocal = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  /** Jump-lunge overlay (taking a raised tong offer): 0→1 over its duration. */
  private hopT = 1;
  private hopPeak = 0;
  /** Lie-down blend (sheltering in a hide): eased 0..1. */
  private restBlend = 0;
  private restTarget = 0;
  private restT = 0;

  constructor(opts: AnimalControllerOptions) {
    this.brain = opts.brain;
    this.groundY = opts.groundY;
    const bodyLength = opts.bodyLength ?? 0.28;

    if (opts.rigged) {
      const m = opts.rigged;
      const scale = bodyLength / Math.max(1e-3, m.size.z);
      const inner = m.scene;
      inner.scale.setScalar(scale);
      inner.rotation.y = opts.modelYaw ?? 0;
      this.object.add(inner);
      this.footY = -m.minY * scale; // lowest vertex → object origin (ground)
      this.anim = new ThreeAnimationController(inner, m.clips, {
        aliases: opts.aliases,
        logPrefix: "[gecko anim]",
      });
      this.usingClips = this.anim.hasAnyClips;
    } else {
      this.placeholder = new ThreeGeckoPlaceholder(bodyLength, opts.color ?? 0xd8bd86);
      this.object.add(this.placeholder.object);
    }

    const p = this.brain.position;
    // Yaw-then-pitch (YXZ): heading turns in the world plane, then the body tilts
    // nose-up/-down along the walked surface's slope without skewing the heading.
    this.object.rotation.order = "YXZ";
    this.object.position.set(p.x, this.groundY + this.footY, p.z);
    this.object.rotation.y = this.brain.heading;
  }

  get hasClips(): boolean {
    return this.usingClips;
  }
  get clipNames(): string[] {
    return this.anim?.clipNames ?? [];
  }
  get state(): string {
    return this.brain.state;
  }

  startle(): void {
    this.brain.startle();
  }

  /** A quick vertical LUNGE (snatching a raised tong offer): parabolic hop with
   *  a nose-up flick, layered over whatever the brain is doing. */
  hopLunge(peak: number): void {
    this.hopPeak = Math.max(0.04, Math.min(0.2, peak));
    this.hopT = 0;
  }

  /** Lie down / get up (sheltering inside a hide): belly to the floor with a
   *  slow breathing pulse; eases in and out. */
  setResting(on: boolean): void {
    this.restTarget = on ? 1 : 0;
  }

  /** Advance one frame; returns the feeder id just eaten (or null). */
  update(dt: number, feeders: HuntTarget[]): number | null {
    const res = this.brain.update(dt, feeders);

    // Jump-lunge overlay: a parabolic hop + nose-up flick over ~0.5 s.
    let hopY = 0;
    let hopPitch = 0;
    if (this.hopT < 1) {
      this.hopT = Math.min(1, this.hopT + dt / 0.5);
      const s = Math.sin(this.hopT * Math.PI);
      hopY = s * this.hopPeak;
      hopPitch = s * 0.55; // nose up toward the prize
    }

    // Lie-down blend (sheltering): sink to the belly + slow breathing.
    this.restT += dt;
    this.restBlend += (this.restTarget - this.restBlend) * Math.min(1, 2.2 * dt);
    const restSink = this.restBlend * this.footY * 0.55;
    const restBreath = this.restBlend * Math.sin(this.restT * 2.1) * 0.0035;

    const p = this.brain.position;
    // Ride up over climbable obstacles at the mesh's TRUE local surface height,
    // pitch nose-up/-down along the slope (− because +X rotation is nose-down),
    // and ROLL with the left-vs-right foot contacts (− because +Z rotation lifts
    // the animal's right side; roll is + when the LEFT side is high).
    this.object.position.set(
      p.x,
      this.groundY + this.footY + this.brain.climbHeight + hopY - restSink + restBreath,
      p.z,
    );
    this.object.rotation.y = this.brain.heading;
    this.object.rotation.x = -this.brain.groundPitch - hopPitch;
    this.object.rotation.z = -this.brain.groundRoll;

    const speed01 = this.brain.speed01;
    const moving = this.brain.isMoving;
    const eating = this.brain.isEating;

    if (this.anim && this.usingClips) {
      const animState: AnimState = eating ? "eat" : this.restBlend > 0.5 ? "rest" : moving ? "move" : "idle";
      this.anim.play(animState);
      this.anim.setMoveSpeed(0.6 + speed01 * 1.2);
      this.anim.update(dt);
    } else if (this.placeholder) {
      // Feed the placeholder its four live foot contacts in LOCAL body space so
      // the legs reach the real surface (tilted body already accounted for).
      this.object.updateMatrixWorld();
      const feet = this.brain.feet;
      for (let i = 0; i < 4 && i < feet.length; i++) {
        this.footLocal[i].set(feet[i].x, feet[i].y, feet[i].z);
        this.object.worldToLocal(this.footLocal[i]);
      }
      this.placeholder.update(dt, { speed01, moving, yawRate: this.brain.yawRate, eating, feet: this.footLocal });
    }
    return res.ateFeederId;
  }

  dispose(): void {
    this.anim?.dispose();
  }
}

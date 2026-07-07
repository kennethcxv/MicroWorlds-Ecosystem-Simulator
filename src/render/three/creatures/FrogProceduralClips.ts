/**
 * FROG PROCEDURAL CLIPS — builds real THREE.AnimationClips for the colorful
 * frog's fallback animations (spec list: src/data/creatures/frogAnimationMap).
 *
 * How it works (and why):
 *   • The GLB's bind pose is an UPRIGHT rig-default ghost — the real crouch
 *     lives only in the baked idle. So we first pose the skeleton with the
 *     idle at t=0 and CAPTURE that as the per-bone BASE POSE; every
 *     procedural clip is authored as offsets on top of it.
 *   • Offsets are authored in the MODEL's frame (bodyLength units, +Z
 *     forward, +Y up) and converted per bone: rotations by conjugating the
 *     model-frame rotation into the bone's local frame at base pose;
 *     root-bone translation through the parent's inverse linear matrix.
 *   • Curves are sampled at 30 Hz into real KeyframeTracks, so procedural
 *     clips are first-class mixer citizens (crossfade / loop / timeScale).
 *   • Every clip also carries 2-key BASE tracks for all untouched bones —
 *     switching from the 1086-channel GLB idle can never leave stale bone
 *     state behind, and blends always resolve toward the crouch.
 *
 * Rig-honesty: only motions the measured rig supports are built (no eyelids,
 * no jaw/tongue, no throat bone; hind toe fans are body-parented, so leg
 * angles stay small). Missing bones skip a clip gracefully — never a crash.
 */
import * as THREE from "three";
import { FROG_PROCEDURAL_SPECS } from "../../../data/creatures/frogAnimationMap";

/** GLTFLoader strips [].:/ and spaces from node names — match it. */
function sanitizeName(name: string): string {
  return name.replace(/\s/g, "_").replace(/[\[\].:/]/g, "");
}

interface BoneBase {
  node: THREE.Object3D;
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: THREE.Vector3;
  /** Bone world orientation RELATIVE to the model root, at base pose. */
  relQ: THREE.Quaternion;
  relQInv: THREE.Quaternion;
  /** Model-frame Δ → this bone's local Δ (parent linear map inverse). */
  invParent: THREE.Matrix3;
  /** Bone position in the model frame at base pose (whole-body pivots). */
  wrapPos: THREE.Vector3;
}

export interface FrogRigView {
  root: THREE.Object3D;
  bones: Map<string, BoneBase>;
  /** Model-frame body length (the registry's normalized size). */
  bodyLen: number;
  /** The Rigify export ships SEVERAL independent top-level bone subtrees
   *  (root → DEF-spine; MCH-torso.parent → all limb chains;
   *  MCH-foot_ik.parent.* → the toe fans; …) — Blender constraints glued
   *  them, glTF strips constraints. Whole-body motion must move ALL of them
   *  rigidly, so "@body" ops fan out across this list. */
  topBones: string[];
  /** The `root` joint (spine subtree top) — QA position probes read it. */
  rootBone: string;
}

/** Bone names as authored in Blender (pre-sanitize). */
const B = {
  root: "root",
  spine: ["DEF-spine", "DEF-spine.001", "DEF-spine.002", "DEF-spine.003", "DEF-spine.004", "DEF-spine.005", "DEF-spine.006"],
  thighL: "DEF-thigh.L",
  thighR: "DEF-thigh.R",
  shinL: "DEF-shin.L",
  shinR: "DEF-shin.R",
  footL: "DEF-foot.L",
  footR: "DEF-foot.R",
  upperArmL: "DEF-upper_arm.L",
  upperArmR: "DEF-upper_arm.R",
  forearmL: "DEF-forearm.L",
  forearmR: "DEF-forearm.R",
  handL: "DEF-hand.L",
  handR: "DEF-hand.R",
  /** Hind toe-fan chain roots (body-parented — see the rig report). */
  fans: ["Foot_Finger.L", "Foot_Finger.003.L", "Foot_Finger.006.L", "Foot_Finger.009.L", "Foot_Finger.R", "Foot_Finger.003.R", "Foot_Finger.006.R", "Foot_Finger.009.R"],
} as const;

/** Pose the skeleton with the idle at t=0 (the display crouch) and capture
 *  every bone's local TRS + model-relative orientation. Returns null when the
 *  core bones are missing (caller degrades gracefully). */
export function captureFrogRig(root: THREE.Object3D, idleClip: THREE.AnimationClip | undefined, bodyLen: number): FrogRigView | null {
  if (idleClip) {
    const poser = new THREE.AnimationMixer(root);
    poser.clipAction(idleClip).play();
    poser.update(0);
  }
  root.updateMatrixWorld(true);
  const rootWq = root.getWorldQuaternion(new THREE.Quaternion());
  const rootWqInv = rootWq.clone().invert();
  const rootInvWorld = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const bones = new Map<string, BoneBase>();
  const topBones: string[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return;
    const wq = o.getWorldQuaternion(new THREE.Quaternion());
    const relQ = rootWqInv.clone().multiply(wq);
    const parent = o.parent ?? root;
    const rel = new THREE.Matrix4().copy(rootInvWorld).multiply(parent.matrixWorld);
    const invParent = new THREE.Matrix3().setFromMatrix4(rel).invert();
    const wrapPos = o.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInvWorld);
    bones.set(o.name, {
      node: o,
      p: o.position.clone(),
      q: o.quaternion.clone(),
      s: o.scale.clone(),
      relQ,
      relQInv: relQ.clone().invert(),
      invParent,
      wrapPos,
    });
    if (!((o.parent as THREE.Bone | null)?.isBone)) topBones.push(o.name);
  });

  const rootBoneName = sanitizeName(B.root);
  const spineOk = B.spine.every((n) => bones.has(sanitizeName(n)));
  if (!bones.has(rootBoneName) || !spineOk || topBones.length === 0) return null;

  return { root, bones, bodyLen, topBones, rootBone: rootBoneName };
}

/** Snap the whole skeleton back to the captured crouch (the Lab's Reset). */
export function applyFrogBasePose(rig: FrogRigView): void {
  for (const b of rig.bones.values()) {
    b.node.position.copy(b.p);
    b.node.quaternion.copy(b.q);
    b.node.scale.copy(b.s);
  }
  rig.root.updateMatrixWorld(true);
}

// ── Pose accumulation (per sample) ──────────────────────────────────────────

interface Acc {
  rot?: THREE.Quaternion; // model-frame rotation, composed
  move?: THREE.Vector3; // model-frame translation (root bone only)
  scaleMul?: number;
}

const AX = {
  up: new THREE.Vector3(0, 1, 0),
  right: new THREE.Vector3(1, 0, 0),
  fwd: new THREE.Vector3(0, 0, 1),
} as const;

/** Whole-body target: fans out across every top-level bone subtree (the
 *  Rigify export ships several — constraints that glued them are gone). */
export const BODY = "@body";

/** Authoring surface handed to each clip program. Angles are radians in the
 *  MODEL frame: yaw(+) turns the nose left, pitch(+) dips the nose down,
 *  roll(+) tips the back toward the frog's left. Target BODY moves the whole
 *  frog rigidly (each subtree spins AND orbits the model origin — the floor
 *  point under the frog). Unknown bones no-op. */
class PoseOps {
  readonly acc = new Map<string, Acc>();
  readonly touched = new Set<string>();
  readonly missing = new Set<string>();

  constructor(private rig: FrogRigView) {}

  private entry(bone: string): { key: string; a: Acc } | null {
    const key = sanitizeName(bone);
    if (!this.rig.bones.has(key)) {
      this.missing.add(bone);
      return null;
    }
    this.touched.add(key);
    let a = this.acc.get(key);
    if (!a) {
      a = {};
      this.acc.set(key, a);
    }
    return { key, a };
  }

  private rotate(bone: string, axis: THREE.Vector3, rad: number): void {
    if (rad === 0) return;
    if (bone === BODY) {
      // Rigid whole-body rotation about the model origin: every top subtree
      // spins by R and its base orbits (R·p − p) so the body stays coherent.
      const R = new THREE.Quaternion().setFromAxisAngle(axis, rad);
      for (const top of this.rig.topBones) {
        const e = this.entry(top);
        if (!e) continue;
        e.a.rot = e.a.rot ? R.clone().multiply(e.a.rot) : R.clone();
        const base = this.rig.bones.get(e.key)!;
        const orbit = base.wrapPos.clone().applyQuaternion(R).sub(base.wrapPos);
        (e.a.move ?? (e.a.move = new THREE.Vector3())).add(orbit);
      }
      return;
    }
    const e = this.entry(bone);
    if (!e) return;
    const q = new THREE.Quaternion().setFromAxisAngle(axis, rad);
    e.a.rot = e.a.rot ? q.multiply(e.a.rot) : q;
  }

  yaw(bone: string, rad: number): void {
    this.rotate(bone, AX.up, rad);
  }

  pitch(bone: string, rad: number): void {
    this.rotate(bone, AX.right, rad);
  }

  roll(bone: string, rad: number): void {
    this.rotate(bone, AX.fwd, rad);
  }

  /** Model-frame translation in body lengths (BODY = the whole frog). */
  move(bone: string, dxL: number, dyL: number, dzL: number): void {
    const L = this.rig.bodyLen;
    const targets = bone === BODY ? this.rig.topBones : [bone];
    for (const t of targets) {
      const e = this.entry(t);
      if (!e) continue;
      const v = e.a.move ?? (e.a.move = new THREE.Vector3());
      v.x += dxL * L;
      v.y += dyL * L;
      v.z += dzL * L;
    }
  }

  /** Uniform multiplicative scale (breathing pulses). */
  scale(bone: string, mul: number): void {
    if (mul === 1) return;
    const e = this.entry(bone);
    if (!e) return;
    e.a.scaleMul = (e.a.scaleMul ?? 1) * mul;
  }
}

// ── Curve helpers ────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;

function easeInOut(x: number): number {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

/** 0→1 over [a,b], 1 over [b,c], 1→0 over [c,d] (smooth trapezoid). */
function env(t: number, a: number, b: number, c: number, d: number): number {
  if (t <= a || t >= d) return 0;
  if (t < b) return easeInOut((t - a) / (b - a));
  if (t <= c) return 1;
  return 1 - easeInOut((t - c) / (d - c));
}

/** Loop-safe breathing overlay: `cycles` whole chest pulses over the clip. */
function breathe(P: PoseOps, t: number, cycles: number, amp: number): void {
  const s = Math.sin(t * cycles * TAU) * amp;
  P.scale("DEF-spine.004", 1 + s);
  P.scale("DEF-spine.003", 1 + s * 0.6);
  P.scale("DEF-spine.005", 1 + s * 0.45);
}

/** Distribute a gaze turn across the head end of the spine (head-first). */
function gaze(P: PoseOps, yawRad: number, pitchRad = 0): void {
  P.yaw("DEF-spine.006", yawRad * 0.5);
  P.yaw("DEF-spine.005", yawRad * 0.32);
  P.yaw("DEF-spine.004", yawRad * 0.18);
  if (pitchRad !== 0) {
    P.pitch("DEF-spine.006", pitchRad * 0.6);
    P.pitch("DEF-spine.005", pitchRad * 0.4);
  }
}

/** Fold the limbs in a touch (rest/crouch poses) — small angles only. */
function tuckLimbs(P: PoseOps, k: number): void {
  P.pitch(B.thighL, 0.08 * k);
  P.pitch(B.thighR, 0.08 * k);
  P.pitch(B.upperArmL, 0.06 * k);
  P.pitch(B.upperArmR, 0.06 * k);
}

/** Small hind toe-fan curl so the webbing follows body/leg motion. */
function curlFans(P: PoseOps, k: number): void {
  for (const fan of B.fans) P.pitch(fan, 0.05 * k);
}

/** Shared hop shape: squat → arc (dzL forward, hL peak) → landing squash. */
function hop(P: PoseOps, t: number, dzL: number, hL: number, legK: number): void {
  const squat = env(t, 0, 0.14, 0.2, 0.3);
  const flight = env(t, 0.28, 0.3, 0.6, 0.62);
  const fFlight = THREE.MathUtils.clamp((t - 0.28) / 0.34, 0, 1);
  const land = env(t, 0.62, 0.66, 0.7, 0.88);
  // Root path: down in the squat, parabolic arc, dip on landing, settle at 0.
  const forward = t < 0.28 ? 0 : t < 0.62 ? easeInOut(fFlight) * dzL : dzL;
  const height = flight * Math.sin(fFlight * Math.PI) * hL;
  P.move(BODY, 0, height - squat * 0.07 - land * 0.05, forward);
  // Whole body noses up on take-off, down into the landing; a little spine
  // flex on top keeps it organic (the limb chains are separate subtrees).
  P.pitch(BODY, -flight * Math.cos(fFlight * Math.PI) * 0.1);
  P.pitch("DEF-spine.002", squat * 0.05 - flight * Math.cos(fFlight * Math.PI) * 0.04);
  P.pitch("DEF-spine.005", -flight * Math.cos(fFlight * Math.PI) * 0.03);
  // Legs: compress in the squat, extend a touch in flight (toe-fan-safe).
  const leg = squat * 0.1 - flight * 0.1;
  P.pitch(B.thighL, leg * legK);
  P.pitch(B.thighR, leg * legK);
  P.pitch(B.shinL, -leg * 0.8 * legK);
  P.pitch(B.shinR, -leg * 0.8 * legK);
  P.pitch(B.upperArmL, flight * 0.08 * legK);
  P.pitch(B.upperArmR, flight * 0.08 * legK);
  curlFans(P, squat * 0.8 + land * 0.6);
  // Landing squash on the chest (bone scale, like the baked clip's breathing).
  P.scale("DEF-spine.002", 1 + land * 0.05);
  P.scale("DEF-spine.003", 1 + land * 0.04);
  breathe(P, t, 1, 0.008);
}

// ── Clip programs (name → pose function over t ∈ 0..1) ──────────────────────

type Program = (t: number, P: PoseOps) => void;

function makePrograms(): Record<string, Program> {
  const lookSide = (dir: 1 | -1): Program => (t, P) => {
    const e = env(t, 0, 0.32, 0.62, 1);
    gaze(P, dir * 0.42 * e, -0.05 * e);
    P.yaw(BODY, dir * 0.06 * e);
    P.roll("DEF-spine.006", dir * 0.05 * e); // curious head tilt
    breathe(P, t, 1, 0.02);
  };

  const turnSide = (dir: 1 | -1): Program => (t, P) => {
    const f = easeInOut(t);
    P.yaw(BODY, dir * 0.9 * f);
    // Head leads, body catches up; two little shuffle bobs carry the turn.
    gaze(P, dir * 0.22 * env(t, 0, 0.2, 0.4, 0.85));
    P.move(BODY, 0, -0.02 * Math.abs(Math.sin(t * TAU)) * env(t, 0, 0.1, 0.85, 1), 0);
    breathe(P, t, 1, 0.012);
  };

  return {
    procedural_frog_idle_breathing: (t, P) => {
      breathe(P, t, 1, 0.035);
      P.pitch("DEF-spine.002", Math.sin(t * TAU) * 0.012);
      P.pitch("DEF-spine.005", -Math.sin(t * TAU) * 0.01);
    },

    procedural_frog_idle_variation: (t, P) => {
      breathe(P, t, 2, 0.025);
      const sway = Math.sin(t * TAU);
      P.roll(BODY, sway * 0.03);
      P.yaw(BODY, Math.sin(t * TAU + 1.1) * 0.035);
      gaze(P, Math.sin(t * TAU * 2 + 0.6) * 0.09, Math.sin(t * TAU + 2) * 0.03);
      P.roll("DEF-spine.006", sway * 0.04);
    },

    procedural_frog_throat_pulse: (t, P) => {
      const s = Math.sin(t * TAU);
      P.scale("DEF-spine.004", 1 + s * 0.05);
      P.scale("DEF-spine.005", 1 + Math.sin(t * TAU + 0.9) * 0.03);
    },

    procedural_frog_look_left: lookSide(1),
    procedural_frog_look_right: lookSide(-1),

    procedural_frog_look_around: (t, P) => {
      // Scan: left plateau → right plateau → a small upward check.
      const yaw = env(t, 0.02, 0.14, 0.3, 0.42) * 0.4 - env(t, 0.44, 0.56, 0.72, 0.84) * 0.42;
      const up = env(t, 0.84, 0.9, 0.94, 1) * 0.08;
      gaze(P, yaw, -up);
      P.yaw(BODY, yaw * 0.15);
      breathe(P, t, 2, 0.022);
    },

    procedural_frog_rest_sit: (t, P) => {
      P.move(BODY, 0, -0.06, 0);
      P.pitch("DEF-spine.002", 0.05);
      P.pitch("DEF-spine.006", 0.06);
      tuckLimbs(P, 1);
      curlFans(P, 0.5);
      breathe(P, t, 1, 0.045);
    },

    procedural_frog_sleep_pose: (t, P) => {
      P.move(BODY, 0, -0.09, 0);
      P.pitch("DEF-spine.002", 0.06);
      P.pitch("DEF-spine.005", 0.06);
      P.pitch("DEF-spine.006", 0.12);
      tuckLimbs(P, 1.4);
      curlFans(P, 0.8);
      breathe(P, t, 1, 0.02);
    },

    procedural_frog_wake_up: (t, P) => {
      const asleep = 1 - easeInOut(THREE.MathUtils.clamp(t / 0.55, 0, 1));
      P.move(BODY, 0, -0.09 * asleep, 0);
      P.pitch("DEF-spine.002", 0.06 * asleep);
      P.pitch("DEF-spine.006", 0.12 * asleep);
      tuckLimbs(P, 1.4 * asleep);
      // A little head shake as the eyes come up.
      const shake = env(t, 0.5, 0.55, 0.75, 0.9) * Math.sin(t * 26) * 0.1;
      P.yaw("DEF-spine.006", shake);
      breathe(P, t, 1, 0.03);
    },

    procedural_frog_small_hop: (t, P) => hop(P, t, 1.4, 0.55, 1),
    procedural_frog_medium_hop: (t, P) => hop(P, t, 2.6, 1, 1.35),

    procedural_frog_turn_left: turnSide(1),
    procedural_frog_turn_right: turnSide(-1),

    procedural_frog_spot_prey: (t, P) => {
      const e = env(t, 0, 0.22, 1, 1); // snap in, then HOLD (clip clamps)
      gaze(P, 0.16 * e, -0.1 * e);
      P.pitch("DEF-spine.002", -0.05 * e);
      P.move(BODY, 0, -0.02 * e, 0.08 * e);
      breathe(P, t, 2, 0.008); // locked-on: barely breathing
    },

    procedural_frog_startled_jump: (t, P) => {
      const crouch = env(t, 0, 0.08, 0.12, 0.2);
      const flight = env(t, 0.18, 0.22, 0.5, 0.55);
      const f = THREE.MathUtils.clamp((t - 0.18) / (0.55 - 0.18), 0, 1);
      const settleLow = env(t, 0.55, 0.62, 1, 1);
      P.move(BODY, 0.35 * (f > 0 ? easeInOut(f) : 0), flight * Math.sin(f * Math.PI) * 0.8 - crouch * 0.08 - settleLow * 0.07, -1.8 * easeInOut(f));
      P.yaw(BODY, easeInOut(f) * 0.3);
      P.pitch(BODY, -flight * Math.cos(f * Math.PI) * 0.08);
      P.pitch("DEF-spine.002", crouch * 0.06 - flight * Math.cos(f * Math.PI) * 0.04);
      tuckLimbs(P, crouch * 1.2 + settleLow);
      curlFans(P, crouch + settleLow * 0.6);
      breathe(P, t, 3, 0.02 * settleLow + 0.006);
    },

    procedural_frog_hide_crouch: (t, P) => {
      P.move(BODY, 0, -0.1, 0);
      P.pitch("DEF-spine.002", 0.05);
      P.pitch("DEF-spine.006", 0.1);
      tuckLimbs(P, 1.5);
      curlFans(P, 0.9);
      // Nervous micro-shifts, loop-safe.
      P.yaw(BODY, Math.sin(t * TAU) * 0.012 + Math.sin(t * TAU * 3) * 0.008);
      P.roll(BODY, Math.sin(t * TAU * 2 + 0.7) * 0.01);
      breathe(P, t, 5, 0.03);
    },

    procedural_frog_stress_crouch: (t, P) => {
      P.move(BODY, 0, -0.07, 0);
      P.pitch("DEF-spine.006", -0.04); // watching, not hiding
      tuckLimbs(P, 1.1);
      curlFans(P, 0.6);
      const flinch = env(t, 0.52, 0.55, 0.58, 0.72) * 0.09;
      P.yaw("DEF-spine.005", flinch);
      P.yaw(BODY, flinch * 0.3);
      breathe(P, t, 4, 0.04);
    },

    procedural_frog_weak_sick_idle: (t, P) => {
      P.move(BODY, 0, -0.04, 0);
      P.pitch("DEF-spine.002", 0.06);
      P.pitch("DEF-spine.006", 0.1);
      const sway = Math.sin(t * TAU) * 0.03 + Math.sin(t * TAU * 2 + 1.3) * 0.012;
      P.roll(BODY, sway); // slow unsteady lean
      tuckLimbs(P, 0.7);
      breathe(P, t, 2, 0.018); // slow + shallow
    },

    procedural_frog_collapsed_faint: (t, P) => {
      const sink = easeInOut(THREE.MathUtils.clamp(t / 0.3, 0, 1));
      P.move(BODY, 0, -0.14 * sink, 0);
      P.pitch("DEF-spine.002", 0.06 * sink);
      P.pitch("DEF-spine.006", 0.14 * sink);
      // Limbs ease outward into the sprawl — gentle, non-graphic.
      P.roll(B.thighL, 0.1 * sink);
      P.roll(B.thighR, -0.1 * sink);
      P.pitch(B.upperArmL, 0.1 * sink);
      P.pitch(B.upperArmR, 0.1 * sink);
      curlFans(P, 0.3 * sink);
      breathe(P, t, 2, 0.012 * sink); // faint but alive
    },

    procedural_frog_water_float: (t, P) => {
      P.move(BODY, 0, Math.sin(t * TAU * 2) * 0.025, 0);
      P.roll(BODY, Math.sin(t * TAU) * 0.025);
      P.pitch(BODY, Math.sin(t * TAU + 1.2) * 0.02);
      // Limbs eased outward, relaxed.
      P.roll(B.thighL, 0.06);
      P.roll(B.thighR, -0.06);
      P.pitch(B.upperArmL, -0.05);
      P.pitch(B.upperArmR, -0.05);
      breathe(P, t, 2, 0.03);
    },

    procedural_frog_water_paddle_basic: (t, P) => {
      P.move(BODY, 0, Math.sin(t * TAU) * 0.02, Math.sin(t * TAU + 0.8) * 0.05);
      P.roll(BODY, Math.sin(t * TAU) * 0.02);
      // Both hind legs kick together (frog-style), small + toe-fan-safe.
      const kick = Math.sin(t * TAU) * 0.5 + Math.sin(t * TAU * 2) * 0.2;
      P.pitch(B.thighL, -0.08 * kick);
      P.pitch(B.thighR, -0.08 * kick);
      P.pitch(B.shinL, 0.1 * kick);
      P.pitch(B.shinR, 0.1 * kick);
      curlFans(P, 0.3 * Math.max(0, kick));
      // Little alternating arm sculls.
      P.pitch(B.upperArmL, Math.sin(t * TAU * 2) * 0.05);
      P.pitch(B.upperArmR, Math.sin(t * TAU * 2 + Math.PI) * 0.05);
      breathe(P, t, 2, 0.025);
    },

    procedural_frog_water_struggle_basic: (t, P) => {
      // Faster + weaker: nose held high, small unsteady kicks.
      P.pitch("DEF-spine.005", -0.08);
      P.pitch("DEF-spine.006", -0.06);
      P.move(BODY, Math.sin(t * TAU * 3) * 0.012, Math.sin(t * TAU * 2) * 0.02 - 0.01, 0);
      P.roll(BODY, Math.sin(t * TAU * 2 + 0.5) * 0.045);
      const kick = Math.sin(t * TAU * 3);
      P.pitch(B.thighL, -0.06 * kick);
      P.pitch(B.thighR, -0.06 * Math.sin(t * TAU * 3 + 0.7));
      P.pitch(B.shinL, 0.07 * kick);
      P.pitch(B.shinR, 0.07 * Math.sin(t * TAU * 3 + 0.7));
      P.pitch(B.upperArmL, Math.sin(t * TAU * 3 + 1.4) * 0.06);
      P.pitch(B.upperArmR, Math.sin(t * TAU * 3 + 2.6) * 0.06);
      breathe(P, t, 3, 0.035);
    },

    procedural_frog_poop_trigger: (t, P) => {
      // Pause → rear dip (nose up) → tiny tail-area twitch → settle.
      const dip = env(t, 0.1, 0.2, 0.62, 0.78);
      P.move(BODY, 0, -0.05 * dip, 0);
      P.pitch("DEF-spine.002", -0.05 * dip); // rear down, head up a touch
      P.pitch("DEF-spine.006", -0.03 * dip);
      const twitch = env(t, 0.42, 0.46, 0.6, 0.66) * Math.sin(t * 40) * 0.05;
      P.yaw("DEF-spine", twitch);
      P.yaw("DEF-spine.001", twitch * 0.7);
      breathe(P, t, 2, 0.02);
    },
  };
}

// ── Sampler: program → AnimationClip ────────────────────────────────────────

const SAMPLE_HZ = 30;

function sampleClip(rig: FrogRigView, name: string, duration: number, program: Program): THREE.AnimationClip {
  const steps = Math.max(2, Math.round(duration * SAMPLE_HZ) + 1);
  const times = new Float32Array(steps);
  for (let i = 0; i < steps; i++) times[i] = (i / (steps - 1)) * duration;

  // Pass 1: discover which bones/properties the program touches.
  const probe = new PoseOps(rig);
  for (let i = 0; i < steps; i++) program(i / (steps - 1), probe);
  const driven = [...probe.touched];
  const props = new Map<string, { rot: boolean; move: boolean; scale: boolean }>();
  for (const key of driven) props.set(key, { rot: false, move: false, scale: false });
  {
    const p2 = new PoseOps(rig);
    for (let i = 0; i < steps; i++) {
      program(i / (steps - 1), p2);
      for (const [key, a] of p2.acc) {
        const pr = props.get(key)!;
        if (a.rot) pr.rot = true;
        if (a.move) pr.move = true;
        if (a.scaleMul !== undefined) pr.scale = true;
      }
      p2.acc.clear();
    }
  }

  // Pass 2: fill the sampled arrays.
  const rotArr = new Map<string, number[]>();
  const posArr = new Map<string, number[]>();
  const sclArr = new Map<string, number[]>();
  const prevQ = new Map<string, THREE.Quaternion>();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();

  for (let i = 0; i < steps; i++) {
    const P = new PoseOps(rig);
    program(i / (steps - 1), P);
    for (const key of driven) {
      const base = rig.bones.get(key)!;
      const a = P.acc.get(key);
      const pr = props.get(key)!;
      if (pr.rot) {
        q.copy(base.q);
        if (a?.rot) {
          // Conjugate the model-frame rotation into the bone's local frame.
          const local = base.relQInv.clone().multiply(a.rot).multiply(base.relQ);
          q.multiply(local);
        }
        const pq = prevQ.get(key);
        if (pq && pq.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w); // continuity
        prevQ.set(key, prevQ.get(key)?.copy(q) ?? q.clone());
        let arr = rotArr.get(key);
        if (!arr) rotArr.set(key, (arr = []));
        arr.push(q.x, q.y, q.z, q.w);
      }
      if (pr.move) {
        v.copy(base.p);
        if (a?.move) v.add(a.move.clone().applyMatrix3(base.invParent));
        let arr = posArr.get(key);
        if (!arr) posArr.set(key, (arr = []));
        arr.push(v.x, v.y, v.z);
      }
      if (pr.scale) {
        const m = a?.scaleMul ?? 1;
        let arr = sclArr.get(key);
        if (!arr) sclArr.set(key, (arr = []));
        arr.push(base.s.x * m, base.s.y * m, base.s.z * m);
      }
    }
  }

  const tracks: THREE.KeyframeTrack[] = [];
  const timesArr = Array.from(times);
  for (const [key, arr] of rotArr) tracks.push(new THREE.QuaternionKeyframeTrack(`${key}.quaternion`, timesArr, arr));
  for (const [key, arr] of posArr) tracks.push(new THREE.VectorKeyframeTrack(`${key}.position`, timesArr, arr));
  for (const [key, arr] of sclArr) tracks.push(new THREE.VectorKeyframeTrack(`${key}.scale`, timesArr, arr));

  // Base tracks for every OTHER bone (2 keys): switching from the fully-baked
  // GLB idle can never leave stale bone state, and blends resolve to base.
  const t2 = [0, duration];
  for (const [key, b] of rig.bones) {
    const pr = props.get(key);
    if (!pr || !pr.rot) tracks.push(new THREE.QuaternionKeyframeTrack(`${key}.quaternion`, t2, [b.q.x, b.q.y, b.q.z, b.q.w, b.q.x, b.q.y, b.q.z, b.q.w]));
    if (!pr || !pr.move) tracks.push(new THREE.VectorKeyframeTrack(`${key}.position`, t2, [b.p.x, b.p.y, b.p.z, b.p.x, b.p.y, b.p.z]));
    if (!pr || !pr.scale) tracks.push(new THREE.VectorKeyframeTrack(`${key}.scale`, t2, [b.s.x, b.s.y, b.s.z, b.s.x, b.s.y, b.s.z]));
  }

  return new THREE.AnimationClip(name, duration, tracks);
}

export interface FrogClipBuild {
  clips: THREE.AnimationClip[];
  skipped: { name: string; reason: string }[];
  /** Bone names a program asked for that this rig does not have (info line). */
  missingBones: string[];
}

/** Build every supported procedural clip for a captured rig. Specs whose
 *  program is missing (or whose core bones vanished) are reported, not built —
 *  and never crash. */
export function buildFrogProceduralClips(rig: FrogRigView): FrogClipBuild {
  const programs = makePrograms();
  const clips: THREE.AnimationClip[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const missing = new Set<string>();
  for (const spec of FROG_PROCEDURAL_SPECS) {
    const program = programs[spec.name];
    if (!program) {
      skipped.push({ name: spec.name, reason: "no program implemented" });
      continue;
    }
    const probe = new PoseOps(rig);
    program(0.5, probe);
    probe.missing.forEach((m) => missing.add(m));
    if (probe.touched.size === 0) {
      skipped.push({ name: spec.name, reason: "required bones missing from this rig" });
      continue;
    }
    clips.push(sampleClip(rig, spec.name, spec.duration, program));
  }
  return { clips, skipped, missingBones: [...missing] };
}

/**
 * Procedural PLACEHOLDER gecko — a simple but recognisable leopard-gecko-shaped
 * mesh (tapered body + head + 4 legs + segmented tail) with lightweight
 * procedural animation. It exists only to exercise the movement/collision/feeding
 * systems until the freelancer's rigged `leopard_gecko_animated.glb` arrives; it
 * is intentionally not "perfect".
 *
 * Frame: the root origin is at FOOT level (y = 0 = ground), the body sits at
 * `standH` above it on four short legs, so the controller just sets
 * object.y = groundY. Animation is driven by the movement brain:
 *   - each LEG AIMS AT ITS FOOT CONTACT from the pure FootPlanner (passed in
 *     local body space): planted feet visibly touch the real surface, stepping
 *     feet lift on their swing arc — no skate, no floating, no sinking,
 *   - the tail sways laterally while moving + a lazy idle sway + a turn-bend,
 *   - a subtle breathing pulse when resting,
 *   - a head dip/nod when eating.
 */
import * as THREE from "three";

const TAU = Math.PI * 2;

interface Leg {
  pivot: THREE.Group;
  upper: THREE.Mesh;
  foot: THREE.Mesh;
  hip: THREE.Vector3;
  phase: number;
  splay: number;
}

const DOWN = new THREE.Vector3(0, -1, 0);

export class ThreeGeckoPlaceholder {
  readonly object = new THREE.Group();
  private body = new THREE.Group();
  private frame = new THREE.Group(); // raised body (torso/head/tail) above the legs
  private torso: THREE.Mesh;
  private torsoBaseScaleY: number;
  private head = new THREE.Group();
  private tailSegs: THREE.Group[] = [];
  private legs: Leg[] = [];
  private gaitPhase = 0;
  private breatheT = 0;
  private eatBlend = 0;
  private stride: number;
  private headRestY: number;
  private legLen = 0.08;
  private aimV = new THREE.Vector3();

  constructor(bodyLength = 0.3, color = 0xd8bd86) {
    const L = bodyLength;
    const torsoR = L * 0.2;
    const torsoLen = L * 0.62;
    const standH = torsoR * 1.15; // belly height — geckos ride low to the substrate
    const legLen = standH * 1.05;
    this.stride = L * 0.5;

    const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.02 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x5a4622, roughness: 0.8 });

    // Raised body frame (everything except the legs).
    this.frame.position.y = standH;
    this.body.add(this.frame);

    // Torso — a stretched sphere (head at +Z).
    this.torso = new THREE.Mesh(new THREE.SphereGeometry(torsoR, 16, 12), skin);
    this.torsoBaseScaleY = 0.72;
    this.torso.scale.set(0.85, this.torsoBaseScaleY, torsoLen / torsoR / 2);
    this.torso.position.z = -L * 0.02;
    this.frame.add(this.torso);

    // Dorsal spots for a little leopard character.
    for (let i = 0; i < 5; i++) {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(torsoR * 0.16, 8, 6), dark);
      const t = i / 4;
      spot.position.set((i % 2 ? 1 : -1) * torsoR * 0.32, torsoR * 0.5, (0.5 - t) * torsoLen);
      spot.scale.set(1, 0.4, 1.2);
      this.frame.add(spot);
    }

    // Head + snout + eyes.
    const skull = new THREE.Mesh(new THREE.SphereGeometry(torsoR * 0.78, 14, 10), skin);
    skull.scale.set(0.9, 0.72, 1.1);
    this.head.add(skull);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(torsoR * 0.5, 10, 8), skin);
    snout.scale.set(0.7, 0.6, 1.1);
    snout.position.z = torsoR * 0.85;
    this.head.add(snout);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x161008, roughness: 0.3 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(torsoR * 0.15, 8, 8), eyeMat);
      eye.position.set(sx * torsoR * 0.5, torsoR * 0.24, torsoR * 0.5);
      this.head.add(eye);
    }
    this.headRestY = torsoR * 0.28;
    this.head.position.set(0, this.headRestY, torsoLen * 0.5);
    this.frame.add(this.head);

    // Segmented tapering tail (head +Z ⇒ tail toward -Z).
    let tailParent: THREE.Object3D = this.frame;
    let segR = torsoR * 0.72;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? 0 : 0, i === 0 ? -torsoLen * 0.5 : -segR * 1.5);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(segR, 10, 8), skin);
      mesh.scale.set(0.9, 0.8, 1.4);
      mesh.position.z = -segR * 0.7;
      seg.add(mesh);
      tailParent.add(seg);
      this.tailSegs.push(seg);
      tailParent = seg;
      segR *= 0.72;
    }

    // Four legs (FL FR RL RR — matches GECKO_FOOT_ANCHORS order). Hips hang just
    // under the torso; each leg AIMS at its live foot contact when targets are
    // supplied, else swings a simple gait (fallback).
    const legMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const hipY = standH * 0.72;
    const hipZ = torsoLen * 0.3;
    const hipX = torsoR * 0.7;
    this.legLen = legLen;
    const defs: { x: number; z: number; phase: number }[] = [
      { x: -hipX, z: hipZ, phase: 0.0 }, // FL
      { x: hipX, z: hipZ, phase: 0.5 }, // FR
      { x: -hipX, z: -hipZ, phase: 0.5 }, // RL
      { x: hipX, z: -hipZ, phase: 0.0 }, // RR
    ];
    for (const d of defs) {
      const pivot = new THREE.Group();
      pivot.position.set(d.x, hipY, d.z);
      const splay = Math.sign(d.x) * 0.45;
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(torsoR * 0.16, torsoR * 0.12, legLen, 7), legMat);
      upper.position.y = -legLen * 0.5; // hang below the hip
      pivot.add(upper);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(torsoR * 0.18, 8, 6), legMat);
      foot.position.y = -legLen;
      foot.scale.set(1.5, 0.5, 1.7);
      pivot.add(foot);
      pivot.rotation.z = splay; // splay outward
      this.body.add(pivot);
      this.legs.push({ pivot, upper, foot, hip: new THREE.Vector3(d.x, hipY, d.z), phase: d.phase, splay });
    }

    this.object.add(this.body);
  }

  /**
   * Animate a frame. `speed01` 0..1 = fraction of walk speed; `moving` gates the
   * gait; `yawRate` bends the spine/tail into turns; `eating` triggers the head
   * dip. `feet` (optional) = the four live foot contacts in LOCAL body space
   * (FL FR RL RR) — when present each leg reaches its real contact point, so
   * planted feet visibly touch the actual terrain/decor surface.
   */
  update(
    dt: number,
    params: { speed01: number; moving: boolean; yawRate: number; eating: boolean; feet?: THREE.Vector3[] },
  ): void {
    const { speed01, moving, yawRate, eating, feet } = params;

    // Gait phase advances with speed (freezes when stopped ⇒ no obvious skate).
    this.gaitPhase += (speed01 * 2.6 + (moving ? 0.05 : 0)) * dt;
    if (feet && feet.length === this.legs.length) {
      // Aim each leg hip → its live contact; stretch within limits so the foot
      // lands EXACTLY on the target (a stylised stretchy leg beats a floating one).
      for (let i = 0; i < this.legs.length; i++) {
        const leg = this.legs[i];
        this.aimV.copy(feet[i]).sub(leg.hip);
        const len = Math.min(this.legLen * 1.9, Math.max(this.legLen * 0.45, this.aimV.length()));
        this.aimV.normalize();
        leg.pivot.quaternion.setFromUnitVectors(DOWN, this.aimV);
        leg.upper.scale.y = len / this.legLen;
        leg.upper.position.y = -len * 0.5;
        leg.foot.position.y = -len;
      }
    } else {
      const swing = 0.55 * Math.min(1, speed01 + 0.05);
      for (const leg of this.legs) {
        const ph = (this.gaitPhase + leg.phase) * TAU;
        const fore = Math.sin(ph) * swing * (moving ? 1 : 0);
        leg.pivot.rotation.set(fore, 0, leg.splay);
      }
    }

    // Tail + body lateral sway: gait-driven while moving + gentle idle sway + a
    // bend into the current turn.
    this.breatheT += dt;
    const swayBase = moving
      ? Math.sin(this.gaitPhase * TAU) * 0.16 * (speed01 + 0.1)
      : Math.sin(this.breatheT * 0.7) * 0.04;
    const turnBend = THREE.MathUtils.clamp(yawRate * 0.12, -0.35, 0.35);
    for (let i = 0; i < this.tailSegs.length; i++) {
      const f = (i + 1) / this.tailSegs.length;
      this.tailSegs[i].rotation.y = swayBase * (0.6 + f) + turnBend * (0.5 + f);
    }

    // Breathing pulse when calm.
    const breathe = 1 + Math.sin(this.breatheT * 1.6) * (moving ? 0.006 : 0.02);
    this.torso.scale.y = this.torsoBaseScaleY * breathe;

    // Eat: dip + nod the head.
    const eatTarget = eating ? 1 : 0;
    this.eatBlend += (eatTarget - this.eatBlend) * Math.min(1, dt * 8);
    const nod = eating ? Math.sin(this.breatheT * 14) * 0.12 : 0;
    this.head.rotation.x = this.eatBlend * 0.5 + nod;
    this.head.position.y = this.headRestY - this.eatBlend * this.stride * 0.12;
  }
}

/**
 * PART ANIMATOR — drives a creature's re-pivoted anatomical parts with the
 * motion primitives named in its registry animation profile. Fully
 * data-driven: the same animator animates a tetra's tail, a shrimp's legs, a
 * snail's eyestalks and a daphnia's oar antennae — the species entry decides
 * which primitives exist and how strong they are.
 *
 * Motion model: every pivot starts at rest (identity). Each frame the animator
 * SETS rotations/offsets absolutely from oscillators — nothing integrates, so
 * parts can never drift or detach.
 */
import type * as THREE from "three";
import type { CreatureAnimationProfile, Osc } from "../../../data/creatures/CreatureTypes";
import type { CreatureModel } from "./ThreeCreatureLoader";

/** Live inputs from the movement controller. */
export interface AnimatorDrive {
  /** 0 idle … 1 full-speed (scales tail wag / leg scurry). */
  speedFrac: number;
  /** 1 while darting/fleeing (tail-fan curl, faster everything). */
  dartFrac?: number;
  /** Optional externally-owned pulse phase 0..2π (daphnia hop sync). */
  pulsePhase?: number;
  /** True while resting/attached — motion drops to a breathing minimum. */
  resting?: boolean;
}

export class CreatureAnimator {
  private t: number;
  private profile: CreatureAnimationProfile;
  private parts: { role: string; pivot: THREE.Object3D; phase: number; baseY: number }[];
  private fwdAxis: "x" | "z";
  /** Body length in the pivots' LOCAL units — translational amps scale by this
   *  (pivot base positions are non-zero joints; offsets ADD to them). */
  private localLen: number;

  constructor(model: CreatureModel, seed = Math.random() * 10) {
    this.t = seed * 7.31;
    this.profile = model.species.animation;
    this.fwdAxis = model.forwardAxis === 0 ? "x" : "z";
    this.localLen = model.localLength;
    let i = 0;
    this.parts = model.parts.map((p) => ({
      role: p.role,
      pivot: p.pivot,
      baseY: p.pivot.position.y,
      // Same-role parts on the SAME side share motion; alternate phases come
      // from the index so leg rows ripple instead of marching in lockstep.
      phase: p.role === "body" || p.role === "shell" || p.role === "foot" ? 0 : (i++ % 5) * 1.31,
    }));
  }

  update(dt: number, drive: AnimatorDrive): void {
    this.t += dt;
    const P = this.profile;
    const k = P.intensity;
    const t = this.t;
    const speed = Math.min(1, Math.max(0, drive.speedFrac));
    const dart = Math.min(1, Math.max(0, drive.dartFrac ?? 0));
    const restMul = drive.resting ? 0.35 : 1;

    const osc = (o: Osc | undefined, phase: number, rate = 1): number =>
      o ? Math.sin((t + phase) * o.freq * Math.PI * 2 * rate) * o.amp * k : 0;

    for (const p of this.parts) {
      const pv = p.pivot;
      switch (p.role) {
        case "tail": {
          // Speed-scaled swim wag; a touch of travelling-wave lag vs the body.
          const wag = osc(P.swimWag, p.phase + 0.12, 0.55 + speed * 0.8) * (0.35 + speed * 0.9 + dart * 0.5) * restMul;
          pv.rotation.y = wag;
          break;
        }
        case "tailFan": {
          const wag = osc(P.swimWag, p.phase + 0.2, 0.55 + speed * 0.8) * (0.3 + speed * 0.8) * restMul;
          pv.rotation.y = wag;
          // Escape curl: the fan tucks under on a dart.
          if (P.tailCurl) pv.rotation.x = -dart * P.tailCurl.amp * k;
          break;
        }
        case "finTop":
        case "finBottom": {
          const sway = osc(P.finSway, p.phase) * restMul;
          pv.rotation.z = sway;
          break;
        }
        case "finSideL":
        case "finSideR": {
          const dir = p.role === "finSideL" ? 1 : -1;
          const flut = osc(P.finFlutter, p.phase, 0.7 + speed * 0.6) * (0.5 + speed * 0.6) * restMul;
          pv.rotation.y = flut * dir * 0.6;
          pv.rotation.z = flut * dir;
          break;
        }
        case "legL":
        case "legR":
        case "legs": {
          // Scurry only while moving; a faint idle twitch keeps them alive.
          const dir = p.role === "legR" ? -1 : 1;
          const amp = osc(P.legScurry, p.phase, 0.6 + speed) * (0.12 + speed * 0.9 + dart * 0.4);
          pv.rotation.x = amp;
          if (p.role !== "legs") pv.rotation.y = amp * 0.35 * dir;
          break;
        }
        case "antennaL":
        case "antennaR": {
          const dir = p.role === "antennaL" ? 1 : -1;
          if (drive.pulsePhase !== undefined && P.pulse) {
            // Daphnia oar stroke: both antennae row together with the hop.
            pv.rotation.x = Math.sin(drive.pulsePhase) * P.pulse.amp * k;
          } else {
            pv.rotation.x = osc(P.antennaSway, p.phase) * restMul;
            pv.rotation.y = osc(P.antennaSway, p.phase + 0.7) * 0.6 * dir * restMul;
          }
          break;
        }
        case "eyestalk": {
          pv.rotation.x = osc(P.eyestalkSway, p.phase) * restMul;
          pv.rotation.z = osc(P.eyestalkSway, p.phase + 1.3) * 0.7 * restMul;
          break;
        }
        case "head": {
          pv.rotation.x = osc(P.headBob, p.phase) * restMul;
          break;
        }
        case "body":
        case "shell":
        case "foot": {
          if (P.bodyBob) {
            pv.position.y = p.baseY + osc(P.bodyBob, 0, 1) * this.localLen;
          }
          if (P.footStretch && p.role === "foot") {
            const s = 1 + Math.sin(t * P.footStretch.freq * Math.PI * 2) * P.footStretch.amp * k * (0.3 + speed * 0.7);
            if (this.fwdAxis === "x") pv.scale.x = s;
            else pv.scale.z = s;
          }
          if (P.pulse && drive.pulsePhase !== undefined && p.role === "body") {
            // Daphnia body kick: a tiny hop-synced bounce.
            pv.position.y = p.baseY + Math.max(0, Math.sin(drive.pulsePhase)) * 0.08 * this.localLen * k;
          }
          break;
        }
        default:
          break;
      }
    }
  }
}

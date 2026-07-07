/**
 * FUSED SWIMMER — the detachment-proof fish body.
 *
 * The part-separated fish (tetra/guppy/danio/oto) used to animate by rotating
 * their cut-apart tail/head/fin meshes around hinge pivots. Absolute-set
 * rotations can't drift, but a HARD-CUT mesh rotating around a planar seam
 * visibly OPENS at the joint — at swim amplitudes the head/tail read as
 * detaching from the body. (The player-reported "fish falls apart" bug.)
 *
 * Fix: bake all parts into ONE merged mesh (same `unifyToBody` used by the
 * goldfish/betta) and drive the same bounded travelling body-wave shader —
 * whole-body undulation + tail sway + turn curl with a structural guarantee:
 * there are no separate parts left to detach, the head is anchored (hp=0),
 * amplitude is clamped, and the phase wraps (nothing accumulates).
 *
 * The original part hierarchy still exists in the GLB/master — invertebrates
 * (shrimp/snails/daphnia/isopods/crickets) keep the part animator, whose small
 * motions read as real articulation without seam gaps.
 */
import * as THREE from "three";
import { unifyToBody } from "../ThreeAssetLoader";
import { applyFishWave, type FishWave } from "../ThreeFishAnimation";
import type { CreatureModel } from "./ThreeCreatureLoader";

export interface FusedSwimmer {
  /** Drop-in replacement for model.root — same origin, one merged mesh. */
  object: THREE.Group;
  /** Feed per-frame motion (all inputs bounded; output clamped in the wave). */
  setSwim(speedFrac: number, dartFrac: number, turnFrac: number, resting?: boolean): void;
  update(dt: number): void;
}

export function makeFusedSwimmer(model: CreatureModel): FusedSwimmer {
  // Preserve the loader's carefully-normalized origin: unifyToBody recentres
  // geometry on its bbox centre, so park the merged mesh back at that centre —
  // vertices land exactly where the part hierarchy had them.
  model.root.updateMatrixWorld(true);
  const pre = new THREE.Box3().setFromObject(model.root);
  const centre = pre.getCenter(new THREE.Vector3());

  const unified = unifyToBody(model.root);
  unified.object.position.copy(centre);
  const wrap = new THREE.Group();
  wrap.add(unified.object);

  // Loader-normalized creatures face +Z.
  const wave: FishWave = applyFishWave(unified.object, true);

  let amp = 0.05;
  let freq = 1.2;
  let turn = 0;
  return {
    object: wrap,
    setSwim(speedFrac: number, dartFrac: number, turnFrac: number, resting = false): void {
      const s = THREE.MathUtils.clamp(speedFrac, 0, 1);
      const d = THREE.MathUtils.clamp(dartFrac, 0, 1);
      if (resting) {
        amp = 0.035; // gentle fin-breathing sway while attached/paused
        freq = 0.9;
      } else {
        amp = THREE.MathUtils.lerp(0.09, 0.16, s) + d * 0.03;
        freq = THREE.MathUtils.lerp(2.1, 5.2, Math.max(s, d * 0.8));
      }
      turn = THREE.MathUtils.clamp(turnFrac, -0.5, 0.5);
      wave.setMotion(amp, freq, turn);
    },
    update(dt: number): void {
      wave.update(dt);
    },
  };
}

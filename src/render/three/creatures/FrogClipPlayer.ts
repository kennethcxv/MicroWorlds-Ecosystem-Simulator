/**
 * FROG CLIP PLAYER — a safe playback wrapper around one frog instance's
 * AnimationMixer for BOTH kinds of clips (real GLB + built procedural).
 *
 * Guarantees the Frog Animation Lab (and any future frog controller) relies
 * on: real clips and procedural clips play through the same mixer path with
 * crossfades; "once" clips clamp on their final pose instead of snapping;
 * loop + speed are live-adjustable; and Reset Pose always lands EXACTLY on
 * the captured crouch base pose (never the upright bind ghost). This class
 * never touches the gecko path (ThreeAnimalController / ThreeRiggedController)
 * or the paludarium's live ThreeFrogHopper.
 */
import * as THREE from "three";
import { FROG_PROCEDURAL_SPECS } from "../../../data/creatures/frogAnimationMap";
import { applyFrogBasePose, type FrogRigView } from "./FrogProceduralClips";

export interface FrogClipInfo {
  name: string;
  source: "glb" | "procedural";
  duration: number;
  /** The clip's natural playback mode ("once" clips clamp when finished). */
  defaultLoop: "repeat" | "once";
  rootMotion: boolean;
}

export interface FrogPlayerStatus {
  name: string | null;
  source: "glb" | "procedural" | null;
  playing: boolean;
  /** True when a "once" clip has finished and is holding its final pose. */
  finished: boolean;
  loop: "repeat" | "once";
  speed: number;
}

const FADE = 0.25;

export class FrogClipPlayer {
  private mixer: THREE.AnimationMixer;
  private clips = new Map<string, { clip: THREE.AnimationClip; info: FrogClipInfo }>();
  private action: THREE.AnimationAction | null = null;
  private currentName: string | null = null;
  private finished = false;
  private speed = 1;
  /** null = use each clip's natural mode; boolean = user override. */
  private loopOverride: boolean | null = null;

  constructor(
    private rig: FrogRigView,
    glbClips: readonly THREE.AnimationClip[],
    proceduralClips: readonly THREE.AnimationClip[],
  ) {
    this.mixer = new THREE.AnimationMixer(rig.root);
    this.mixer.addEventListener("finished", () => {
      this.finished = true;
    });
    for (const clip of glbClips) {
      this.clips.set(clip.name, {
        clip,
        info: { name: clip.name, source: "glb", duration: clip.duration, defaultLoop: "repeat", rootMotion: false },
      });
    }
    const specByName = new Map(FROG_PROCEDURAL_SPECS.map((s) => [s.name, s]));
    for (const clip of proceduralClips) {
      const spec = specByName.get(clip.name);
      this.clips.set(clip.name, {
        clip,
        info: {
          name: clip.name,
          source: "procedural",
          duration: clip.duration,
          defaultLoop: spec?.loop ?? "repeat",
          rootMotion: spec?.rootMotion ?? false,
        },
      });
    }
  }

  list(): FrogClipInfo[] {
    return [...this.clips.values()].map((c) => c.info);
  }

  has(name: string): boolean {
    return this.clips.has(name);
  }

  /** Crossfade to a clip. Returns false (and changes nothing) for unknown names. */
  play(name: string, opts?: { loop?: boolean; speed?: number }): boolean {
    const entry = this.clips.get(name);
    if (!entry) return false;
    if (opts?.loop !== undefined) this.loopOverride = opts.loop;
    if (opts?.speed !== undefined) this.setSpeed(opts.speed);

    const next = this.mixer.clipAction(entry.clip);
    next.reset();
    this.applyLoopMode(next, entry.info);
    next.enabled = true;
    if (this.action && this.action !== next) {
      this.action.fadeOut(FADE);
      next.fadeIn(FADE);
    } else {
      next.fadeIn(0.001);
    }
    next.play();
    this.action = next;
    this.currentName = name;
    this.finished = false;
    return true;
  }

  /** Effective loop mode for a clip under the current override. */
  private loopFor(info: FrogClipInfo): "repeat" | "once" {
    if (this.loopOverride === null) return info.defaultLoop;
    return this.loopOverride ? "repeat" : "once";
  }

  private applyLoopMode(action: THREE.AnimationAction, info: FrogClipInfo): void {
    if (this.loopFor(info) === "once") {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true; // hold the landing/final pose — no snap
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }
  }

  /** Freeze a clip at an exact normalized time (0..1) — deterministic pose
   *  inspection for the Lab/QA (stops any running action first). */
  seek(name: string, t01: number): boolean {
    const entry = this.clips.get(name);
    if (!entry) return false;
    this.mixer.stopAllAction();
    const a = this.mixer.clipAction(entry.clip);
    a.reset();
    this.applyLoopMode(a, entry.info);
    a.play();
    a.paused = true;
    a.time = THREE.MathUtils.clamp(t01, 0, 1) * Math.max(0.0001, entry.clip.duration - 0.0001);
    this.mixer.update(0);
    this.action = a;
    this.currentName = name;
    this.finished = false;
    return true;
  }

  /** Live loop toggle (null returns to each clip's natural mode). */
  setLoopOverride(loop: boolean | null): void {
    this.loopOverride = loop;
    const entry = this.currentName ? this.clips.get(this.currentName) : null;
    if (this.action && entry) {
      this.applyLoopMode(this.action, entry.info);
      // A finished clamped action can resume looping when the toggle flips on.
      if (this.finished && this.loopFor(entry.info) === "repeat") {
        this.action.reset().play();
        this.finished = false;
      }
    }
  }

  setSpeed(v: number): void {
    this.speed = THREE.MathUtils.clamp(v, 0.05, 4);
    this.mixer.timeScale = this.speed;
  }

  /** Hard reset: stop everything and land EXACTLY on the crouch base pose. */
  resetPose(): void {
    this.mixer.stopAllAction();
    this.action = null;
    this.currentName = null;
    this.finished = false;
    applyFrogBasePose(this.rig);
  }

  status(): FrogPlayerStatus {
    const entry = this.currentName ? this.clips.get(this.currentName) : null;
    return {
      name: this.currentName,
      source: entry?.info.source ?? null,
      playing: !!this.action && !this.finished,
      finished: this.finished,
      loop: entry ? this.loopFor(entry.info) : "repeat",
      speed: this.speed,
    };
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.rig.root);
  }
}

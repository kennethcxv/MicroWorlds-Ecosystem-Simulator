/**
 * Reusable skeletal ANIMATION controller for habitat animals — the seam the
 * freelancer's rigged GLB drops into. It:
 *   - loads the GLB's AnimationClips into a mixer,
 *   - logs the detected clip names (so we can verify a delivery in the console),
 *   - maps clip-name ALIASES → behaviour states (idle / move / turn / eat / rest /
 *     stress), tolerant of exporter prefixes ("Armature|Walk", "gecko_walk_01"),
 *   - crossfades between states,
 *   - and NEVER crashes on missing clips: each state falls back down a chain
 *     (move→idle, eat→idle, …); with zero clips it's an inert no-op so the scene's
 *     procedural placeholder animation drives the model instead.
 *
 * Expected final leopard-gecko clips: Idle, Walk/Crawl, Turn/Look, Eat/Bite,
 * (optional) Rest, Stress. Any subset works.
 */
import * as THREE from "three";

export type AnimState = "idle" | "move" | "turn" | "eat" | "rest" | "stress";

export type ClipAliases = Record<AnimState, string[]>;

/** Default alias table (extend/override per species via options.aliases). */
export const DEFAULT_ALIASES: ClipAliases = {
  idle: ["Idle", "Breathing", "Idle_Breathing", "IdleBreathing", "Idle_01", "Rest_Idle"],
  move: ["Walk", "Crawl", "SlowCrawl", "Walk_Cycle", "WalkCycle", "Move", "Run", "Scuttle"],
  turn: ["Turn", "Look", "LookAround", "Turn_L", "Turn_R", "TurnLeft", "TurnRight"],
  eat: ["Eat", "Bite", "Feed", "Feeding", "Eating", "Lick", "Strike"],
  rest: ["Rest", "Sleep", "Bask", "Basking", "Sleeping"],
  stress: ["Stress", "Hide", "Alert", "Defensive", "Threat"],
};

export interface AnimationControllerOptions {
  aliases?: Partial<ClipAliases>;
  crossfade?: number; // seconds
  logPrefix?: string;
}

const STATE_FALLBACK: Record<AnimState, AnimState[]> = {
  idle: ["idle"],
  move: ["move", "idle"],
  turn: ["turn", "move", "idle"],
  eat: ["eat", "idle"],
  rest: ["rest", "idle"],
  stress: ["stress", "idle"],
};

const eq = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Assign clips to states: exact (case-insensitive) matches first, then a
 *  substring pass for the still-unfilled states. A clip is used at most once. */
function assignClips(clips: THREE.AnimationClip[], aliases: ClipAliases): Partial<Record<AnimState, THREE.AnimationClip>> {
  const out: Partial<Record<AnimState, THREE.AnimationClip>> = {};
  const used = new Set<string>();
  const states = Object.keys(aliases) as AnimState[];

  for (const state of states) {
    for (const alias of aliases[state]) {
      const clip = clips.find((c) => !used.has(c.name) && eq(c.name, alias));
      if (clip) {
        out[state] = clip;
        used.add(clip.name);
        break;
      }
    }
  }
  for (const state of states) {
    if (out[state]) continue;
    for (const alias of aliases[state]) {
      const needle = alias.toLowerCase();
      const clip = clips.find((c) => !used.has(c.name) && c.name.toLowerCase().includes(needle));
      if (clip) {
        out[state] = clip;
        used.add(clip.name);
        break;
      }
    }
  }
  return out;
}

export class ThreeAnimationController {
  private mixer: THREE.AnimationMixer;
  private actions: Partial<Record<AnimState, THREE.AnimationAction>> = {};
  private detected: string[];
  private current: AnimState | null = null;
  private crossfade: number;
  private root: THREE.Object3D;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[], opts: AnimationControllerOptions = {}) {
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.crossfade = opts.crossfade ?? 0.28;
    this.detected = clips.map((c) => c.name);

    const aliases: ClipAliases = {
      idle: opts.aliases?.idle ?? DEFAULT_ALIASES.idle,
      move: opts.aliases?.move ?? DEFAULT_ALIASES.move,
      turn: opts.aliases?.turn ?? DEFAULT_ALIASES.turn,
      eat: opts.aliases?.eat ?? DEFAULT_ALIASES.eat,
      rest: opts.aliases?.rest ?? DEFAULT_ALIASES.rest,
      stress: opts.aliases?.stress ?? DEFAULT_ALIASES.stress,
    };
    const mapped = assignClips(clips, aliases);
    const mapping: Record<string, string> = {};
    for (const [state, clip] of Object.entries(mapped)) {
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.loop = THREE.LoopRepeat;
      action.clampWhenFinished = false;
      action.enabled = true;
      this.actions[state as AnimState] = action;
      mapping[state] = clip.name;
    }

    const prefix = opts.logPrefix ?? "[habitat anim]";
    if (this.detected.length === 0) {
      console.info(`${prefix} model has no animation clips — using procedural motion.`);
    } else {
      console.info(`${prefix} detected clips:`, this.detected);
      console.info(`${prefix} state → clip:`, mapping);
      const missing = (Object.keys(aliases) as AnimState[]).filter((s) => !this.actions[s]);
      if (missing.length) console.info(`${prefix} states without a clip (fallbacks used):`, missing);
    }

    // Kick off idle (or whatever is available) so the model isn't a T-pose.
    if (this.hasAnyClips) this.play("idle", 0);
  }

  get clipNames(): string[] {
    return this.detected;
  }
  get hasAnyClips(): boolean {
    return Object.keys(this.actions).length > 0;
  }
  has(state: AnimState): boolean {
    return !!this.actions[state];
  }
  get currentState(): AnimState | null {
    return this.current;
  }

  /** Resolve `state` through its fallback chain to a state that actually has a clip. */
  private resolve(state: AnimState): AnimState | null {
    for (const s of STATE_FALLBACK[state]) if (this.actions[s]) return s;
    const first = Object.keys(this.actions)[0] as AnimState | undefined;
    return first ?? null;
  }

  /** Crossfade to a behaviour state (following fallbacks). Returns the state
   *  actually played, or null if the model has no clips. */
  play(state: AnimState, fade = this.crossfade): AnimState | null {
    if (!this.hasAnyClips) return null;
    const target = this.resolve(state);
    if (!target || target === this.current) return target;
    const next = this.actions[target]!;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    next.fadeIn(fade);
    next.play();
    const prev = this.current ? this.actions[this.current] : undefined;
    if (prev) prev.fadeOut(fade);
    this.current = target;
    return target;
  }

  /** Scale the move clip's playback rate with locomotion speed so feet don't
   *  skate too badly even without a distance-matched stride. */
  setMoveSpeed(scale: number): void {
    const m = this.actions.move;
    if (m && this.current === "move") m.setEffectiveTimeScale(Math.max(0.25, Math.min(2.5, scale)));
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root as THREE.Object3D);
  }
}

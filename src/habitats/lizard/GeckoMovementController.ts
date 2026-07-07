/**
 * GLASSWATER — pure gecko MOVEMENT BRAIN (no Three.js / DOM). Decides where the
 * gecko goes and how it faces; the renderer (ThreeAnimalController) just applies
 * the result to a model + animation. Pure ⇒ unit-testable and identical for the
 * placeholder and the final rig.
 *
 * This version is SMART: it doesn't shove into obstacles forever. It uses the
 * navigation graph (HabitatNavigation) to plan a straight walk or a routed set of
 * waypoints AROUND blocked obstacles, CLIMBS OVER climbable ones (driftwood, low
 * rocks — walk height rises via CollisionWorld.climbHeightAt), detects when it is
 * STUCK (little progress toward the target), backs up + turns + replans, and after
 * repeated failures GIVES UP on that target (temporarily flagging an unreachable
 * feeder) and idles/looks around before trying again — like a real animal.
 *
 * Behaviour states (brief): Idle ▸ LookAround ▸ Roam ▸ DetectFood ▸ PlanPathToFood
 * ▸ FollowPath ▸ ClimbObstacle ▸ Eat ▸ StuckRecovery ▸ GiveUpAndIdle.
 */
import { CollisionWorld } from "../HabitatCollision";
import { NavGraph, type NavPoint } from "../HabitatNavigation";
import { FootPlanner, PITCH_CAP, ROLL_CAP, type FootContact } from "./GeckoFeet";
import type { Rng } from "../HabitatBounds";
import type { BodyProbe } from "../HabitatTypes";

/**
 * Compound body probes for a ~0.3 m leopard gecko — FULL-BODY coverage, the
 * animal-side mirror of the props' exact-silhouette collision: a circle over
 * EVERY section (snout, neck, both front legs/shoulders, chest, hips, both
 * rear legs, tail, tail tip), laid out in the body frame (the rig is
 * normalised to this length, so they line up for both the placeholder and the
 * final rig). The centre circle is handled by `resolve` (bodyRadius); these
 * keep every other part — including the splayed LEGS — out of decor. */
export function geckoProbes(bodyLength = 0.3): BodyProbe[] {
  const k = bodyLength / 0.3;
  return [
    { forward: 0.14 * k, side: 0, r: 0.045 * k }, // snout
    { forward: 0.07 * k, side: 0, r: 0.06 * k }, // neck
    { forward: 0.075 * k, side: -0.058 * k, r: 0.036 * k }, // front-left leg/shoulder
    { forward: 0.075 * k, side: 0.058 * k, r: 0.036 * k }, // front-right leg/shoulder
    { forward: 0.02 * k, side: 0, r: 0.072 * k }, // chest
    { forward: -0.06 * k, side: 0, r: 0.068 * k }, // hips
    { forward: -0.062 * k, side: -0.058 * k, r: 0.036 * k }, // rear-left leg/hip
    { forward: -0.062 * k, side: 0.058 * k, r: 0.036 * k }, // rear-right leg/hip
    { forward: -0.13 * k, side: 0, r: 0.05 * k }, // tail
    { forward: -0.19 * k, side: 0, r: 0.032 * k }, // tail tip
  ];
}

export const GECKO_PROBES: BodyProbe[] = geckoProbes(0.3);

/** Coarse locomotion the renderer/animation cares about (idle vs move vs eat). */
export type LocomotionState = "idle" | "roam" | "hunt" | "eat" | "flee";

/** Fine-grained behaviour phase (drives the brain + debug logging). */
export type NavPhase =
  | "idle"
  | "look"
  | "roam"
  | "hunt"
  | "eat"
  | "flee"
  | "recover"
  | "giveup"
  | "shelter";

export interface HuntTarget {
  id: number;
  x: number;
  z: number;
}

export interface MovementConfig {
  bodyRadius: number; // collision circle
  walkSpeed: number; // m/s
  fleeSpeed: number;
  turnRate: number; // rad/s
  accel: number; // speed ease (1/s)
  idleDur: [number, number];
  lookDur: [number, number];
  roamDur: [number, number]; // roam leg timeout (arrival usually ends it first)
  idleChance: number; // chance to pause after a roam leg
  arrive: number; // distance that counts as "reached" (a waypoint/target)
  eatRange: number; // snout-to-prey distance to start eating
  eatDuration: number; // seconds an eat takes
  fleeDur: number;
  // ── hunting locomotion (real leopard-gecko: ambush, not pursuit) ──
  stalkRange: number; // within this of prey → slow deliberate CREEP
  stalkSpeedMul: number; // creep speed = walkSpeed × this
  stalkFreezeDur: [number, number]; // motionless beats mid-stalk (s)
  stalkFreezeGap: [number, number]; // seconds of creeping between freezes
  dashRange: number; // within this (facing + clear line) → strike DASH
  dashSpeedMul: number; // dash speed = walkSpeed × this
  // ── smart-navigation tuning ──
  climbSpeedMul: number; // speed factor while climbing a climbable obstacle
  climbLiftCap: number; // max metres the body rises when crossing (approximate)
  climbLiftRate: number; // how fast the climb height eases (1/s)
  stuckTime: number; // window (s) of insufficient progress ⇒ stuck
  stuckProgress: number; // min net progress toward target over that window (m)
  maxFails: number; // consecutive stuck recoveries before giving up
  recoverTime: number; // seconds spent backing up + turning
  recoverSpeed: number; // reverse speed during recovery
  giveUpDur: number; // idle/look time after abandoning a target
  repathInterval: number; // re-plan cadence while hunting a moving feeder (s)
  unreachableCooldown: number; // seconds a feeder stays flagged unreachable
}

export const GECKO_MOVEMENT: MovementConfig = {
  bodyRadius: 0.09,
  walkSpeed: 0.22,
  fleeSpeed: 0.6,
  turnRate: 2.4,
  accel: 4,
  idleDur: [1.4, 3.8],
  lookDur: [0.7, 1.6],
  roamDur: [4.0, 8.0],
  idleChance: 0.5,
  arrive: 0.12,
  eatRange: 0.17,
  eatDuration: 1.1,
  fleeDur: 1.3,
  // Leopard geckos are sit-and-wait hunters: deliberate walk → slow creep with
  // freeze beats inside ~half a metre → a short explosive strike dash. The dash
  // tops out near flee speed (a real sprint), but only over the last stretch.
  stalkRange: 0.55,
  stalkSpeedMul: 0.42,
  stalkFreezeDur: [0.25, 0.6],
  stalkFreezeGap: [1.1, 2.6],
  dashRange: 0.3,
  dashSpeedMul: 2.5,
  climbSpeedMul: 0.55,
  // High cap — a safety clamp only. The lift itself is the mesh's EXACT measured
  // surface height at the gecko's position (see CollisionWorld.climbHeightAt), so
  // capping below real prop height would sink the body into tall driftwood.
  climbLiftCap: 0.6,
  // Fast enough that the body tracks a steep trunk within ~2 cm while walking
  // (no visible sink-into-the-wood on ascent), still smooth on step-offs.
  climbLiftRate: 7,
  stuckTime: 1.1,
  stuckProgress: 0.03,
  maxFails: 3,
  recoverTime: 0.55,
  recoverSpeed: 0.16,
  giveUpDur: 2.4,
  repathInterval: 0.6,
  unreachableCooldown: 6,
};

const TAU = Math.PI * 2;

export interface MovementResult {
  ateFeederId: number | null;
}

type NavLogger = (msg: string) => void;

export class GeckoMovementController {
  private x: number;
  private z: number;
  private yaw: number;
  private speed = 0;
  private lastYawRate = 0;

  private phase: NavPhase = "idle";
  private stateT = 0;
  private goal: NavPoint = { x: 0, z: 0 }; // final target of the current leg
  private path: NavPoint[] | null = null;
  private pathIdx = 0;

  private currentFeederId: number | null = null;
  private eatT = 0;
  private fleeT = 0;

  // Climb (crossing climbable obstacles): eased body-lift + speed scale.
  private climbH = 0;
  private climbTargetH = 0;
  private climbScale = 1;
  // Body pitch following the walked surface's slope (radians, + = nose up).
  private pitch = 0;
  // Body roll from left-vs-right FOOT heights (radians, + = left side high).
  private roll = 0;
  // The four feet: planted exactly on the surface / stepping on an arc.
  private feetPlanner = new FootPlanner();

  // Stuck detection.
  private stuckWindowT = 0;
  private stuckRefDist = Infinity;
  private fails = 0;
  private recoverT = 0;
  private recoverDir = 1;
  private recoverReturn: "hunt" | "roam" | "shelter" = "roam";

  // Look-around scan.
  private lookYaw = 0;

  // Feeder reachability.
  private unreachable = new Map<number, number>(); // id → seconds remaining
  private repathT = 0;
  private foodUnreachableFlag = false;

  // Stalk freeze beats (motionless pauses while creeping toward prey).
  private stalkFreezeLeft = 0;
  private stalkFreezeGapT = 0;

  // Rim-press tracking: pressing toward penned food, pinned by the dish/glass.
  private pressStallT = 0;
  private pressLastD = Infinity;

  // A deliberate hold-still beat during a shelter walk (the peek at the mouth).
  private stillT = 0;

  // The spine is actively rearing up/down to clear an obstacle (pitch assist).
  private pitchAssistOn = false;
  private assistSin = 0;
  // Forward-motion brake while the body lifts over a step (motion warping).
  private mantleBrake = 1;
  // Clearance height held between frames mid-mantle (released smoothly after).
  private enforcedFloorH = 0;

  // Sheltering (inside a hide): walk to the pocket anchor, then rest there.
  private shelterMode = false;
  private shelterArrived = false;
  private shelterGoal: NavPoint = { x: 0, z: 0 };
  private shelterTol = 0.12;

  private nav: NavGraph;
  private probes = GECKO_PROBES;
  private debug = false;
  private logger: NavLogger = (m) => console.info(`[gecko nav] ${m}`);

  constructor(
    private world: CollisionWorld,
    private cfg: MovementConfig = GECKO_MOVEMENT,
    private rng: Rng = Math.random,
    start?: { x: number; z: number; yaw?: number },
  ) {
    this.nav = new NavGraph(world, cfg.bodyRadius);
    const b = world.bounds;
    if (start && world.isFree(start.x, start.z, cfg.bodyRadius)) {
      this.x = start.x;
      this.z = start.z;
    } else {
      const p = world.randomFreeTarget(cfg.bodyRadius, rng) ?? {
        x: (b.minX + b.maxX) / 2,
        z: (b.minZ + b.maxZ) / 2,
      };
      this.x = p.x;
      this.z = p.z;
    }
    this.yaw = start?.yaw ?? rng() * TAU;
    this.lookYaw = this.yaw;
    this.settleBody();
    this.enterIdle();
  }

  /** Ensure the whole BODY (not just the centre) starts clear: nudge it out, and if
   *  still wedged, relocate to a spot where the full silhouette fits. Keeps the
   *  no-phasing invariant true from frame 0 (spawn / after a layout edit). */
  private settleBody(): void {
    const b = this.world.resolveBody(this.x, this.z, this.yaw, this.probes);
    this.x = b.x;
    this.z = b.z;
    if (!this.world.bodyBlocked(this.x, this.z, this.yaw, this.probes)) return;
    for (let i = 0; i < 48; i++) {
      const t = this.world.randomFreeTarget(this.cfg.bodyRadius, this.rng);
      if (t && !this.world.bodyBlocked(t.x, t.z, this.yaw, this.probes)) {
        this.x = t.x;
        this.z = t.z;
        return;
      }
    }
  }

  // ── Read-outs for the renderer / animation controller ──────────────────────
  get position(): { x: number; z: number } {
    return { x: this.x, z: this.z };
  }
  get heading(): number {
    return this.yaw;
  }
  /** Extra body height while climbing a climbable obstacle (metres, eased). */
  get climbHeight(): number {
    return this.climbH;
  }
  /** Smoothed body pitch from the FRONT-vs-REAR foot contacts (radians, + = nose
   *  up). The renderer tilts the model by this so climbing a branch keeps the
   *  body ON the wood instead of skewering horizontally through it. */
  get groundPitch(): number {
    return this.pitch;
  }
  /** Smoothed body roll from the LEFT-vs-RIGHT foot contacts (radians, + = left
   *  side high ⇒ the body leans toward its right). One foot on a rock, the other
   *  on sand ⇒ a natural lean instead of a floating flat body. */
  get groundRoll(): number {
    return this.roll;
  }

  /**
   * The WORST vertical clearance of any body part vs the PROP mesh surface
   * under it (metres; negative = that part is INSIDE a rock/branch mesh).
   * Substrate contact is exempt — the belly rests on and the tail drags across
   * the sand naturally. Part heights follow the final pitched/rolled spine
   * exactly as the renderer poses the body — this is the metric the vertical
   * no-phase guarantee enforces and QA reads.
   */
  get worstPartClearance(): number {
    const baseY = this.world.bounds.y + this.climbH;
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const sinP = Math.sin(this.pitch);
    const sinR = Math.sin(this.roll);
    let worst = Infinity;
    for (const p of this.probes) {
      if (p.forward < -0.09) continue; // the flexible tail drapes — see the enforcement
      const px = this.x + fwdX * p.forward - fwdZ * p.side;
      const pz = this.z + fwdZ * p.forward + fwdX * p.side;
      const s = this.world.climbHeightAt(px, pz, 0.01, baseY);
      if (s - this.world.groundHeightAt(px, pz) <= 0.02) continue; // bare substrate
      // Conservative on roll sign: assume the LOW side (over-lifting a touch is
      // fine; a part inside rock never is).
      const partY = baseY + sinP * p.forward - Math.abs(sinR * p.side);
      worst = Math.min(worst, partY - s);
    }
    return worst;
  }
  /** Live world-space foot contacts (FL FR RL RR): planted feet sit EXACTLY on
   *  the sampled surface; stepping feet arc briefly. For the renderer + debug. */
  get feet(): FootContact[] {
    return this.feetPlanner.contacts;
  }
  /** Body-collision probes (head → tail) in the animal's local frame — for the
   *  no-phasing solve and the debug overlay. */
  get bodyProbes(): BodyProbe[] {
    return this.probes;
  }
  get speed01(): number {
    return Math.min(1, this.speed / this.cfg.walkSpeed);
  }
  get yawRate(): number {
    return this.lastYawRate;
  }
  /** Coarse locomotion state (for animation blends). */
  get state(): LocomotionState {
    switch (this.phase) {
      case "roam":
      case "recover":
        return "roam";
      case "shelter":
        return this.shelterArrived ? "idle" : "roam"; // walk in, then rest
      case "hunt":
        return "hunt";
      case "eat":
        return "eat";
      case "flee":
        return "flee";
      default:
        return "idle";
    }
  }
  /** Fine-grained phase (for the HUD / debugging). */
  get navPhase(): NavPhase {
    return this.phase;
  }
  get isEating(): boolean {
    return this.phase === "eat";
  }
  /** The feeder currently held in the mouth (bite → chew → swallow), or null.
   *  The renderer parks that insect's visual at the snout while this is set;
   *  nutrition applies only when the chew finishes (ateFeederId). */
  get eatingFeederId(): number | null {
    return this.phase === "eat" && this.eatT > 0 ? this.currentFeederId : null;
  }
  get isMoving(): boolean {
    return this.speed > this.cfg.walkSpeed * 0.15;
  }
  /** True while there are live feeders but the gecko can't currently reach any. */
  get foodUnreachable(): boolean {
    return this.foodUnreachableFlag;
  }

  /** True while the gecko is resting INSIDE a hide (arrived at the pocket anchor). */
  get sheltering(): boolean {
    return this.shelterMode && this.shelterArrived;
  }

  /** True while WALKING to a shelter anchor (committed, not yet arrived) — the
   *  care layer must not re-decide (e.g. start a nap) mid-journey, or the trip
   *  gets hijacked and the gecko "shelters" in the open. */
  get shelterEnRoute(): boolean {
    return this.shelterMode && !this.shelterArrived;
  }

  /**
   * Walk to a rest point and STAY there until {@link endShelter}: a hide's
   * interior pocket, a nap spot, or a PERCH on climbable decor. While
   * sheltering the gecko ignores feeders (a hiding gecko doesn't hunt).
   * `via` is an optional STAGING point routed first — how a real animal takes
   * a rock: walk around to the low side, THEN ascend (LizardPerch's
   * lowSideStaging). Returns false if the spot is unreachable from here.
   */
  requestShelter(anchor: NavPoint, via?: NavPoint, arriveTol?: number): boolean {
    if (via && this.planTo(via.x, via.z)) {
      // Ascent leg staging → anchor must itself be a clean straight climb.
      if (this.world.losClear(via.x, via.z, anchor.x, anchor.z, this.cfg.bodyRadius * 0.8)) {
        this.path = [...(this.path ?? []), { x: anchor.x, z: anchor.z }];
        this.goal = { x: anchor.x, z: anchor.z };
      } else if (!this.planTo(anchor.x, anchor.z)) {
        return false;
      }
    } else if (!this.planTo(anchor.x, anchor.z)) {
      return false;
    }
    this.shelterMode = true;
    this.shelterArrived = false;
    this.shelterGoal = { x: anchor.x, z: anchor.z };
    // A hide pocket needs precision; a rock perch just needs to be ON the rock
    // near the spot — steering wobble on a slope shouldn't cancel the bask.
    this.shelterTol = arriveTol ?? Math.max(this.cfg.bodyRadius * 1.2, 0.12);
    this.currentFeederId = null;
    this.phase = "shelter";
    return true;
  }

  /** Leave the hide: back to the normal idle/roam cycle. */
  endShelter(): void {
    this.shelterMode = false;
    this.shelterArrived = false;
    this.stillT = 0;
    this.enterIdle();
  }

  /** Hold perfectly still for `sec` during a shelter walk — the peek at a
   *  hide's mouth before committing to the dark. */
  holdStill(sec: number): void {
    if (this.shelterMode && !this.shelterArrived) this.stillT = Math.max(this.stillT, sec);
  }

  /** QA: the nav graph's waypoints (copy) — feeds debug overlays + probes. */
  get navNodes(): NavPoint[] {
    return this.nav.nodes.slice();
  }

  /** QA: raw planner probe from the current position. */
  probePath(tx: number, tz: number): NavPoint[] | null {
    return this.nav.findPath({ x: this.x, z: this.z }, { x: tx, z: tz });
  }

  /** QA: raw planner probe between arbitrary points. */
  probePathFrom(x1: number, z1: number, x2: number, z2: number): NavPoint[] | null {
    return this.nav.findPath({ x: x1, z: z1 }, { x: x2, z: z2 });
  }

  /** Enable debug reroute/stuck logs (only when the habitat's debug mode is on). */
  setDebug(on: boolean, logger?: NavLogger): void {
    this.debug = on;
    if (logger) this.logger = logger;
  }
  private log(msg: string): void {
    if (this.debug) this.logger(msg);
  }

  /**
   * Where the gecko's BODY should stand to take food at (x,z). Food may sit
   * closer to the glass than the body's centre ever can (the walk bounds match
   * the visible tank; the body radius keeps the centre a few cm off the panes) —
   * the SNOUT covers that last stretch. Returns the point itself when standable,
   * the nearest standable point when it's within eating range, else null.
   */
  private reachGoal(x: number, z: number): NavPoint | null {
    const b = this.world.bounds;
    const r = this.cfg.bodyRadius + 1e-3;
    const gx = Math.min(b.maxX - r, Math.max(b.minX + r, x));
    const gz = Math.min(b.maxZ - r, Math.max(b.minZ + r, z));
    // Clamped into the enclosure but too far for the snout → truly unreachable.
    if ((gx !== x || gz !== z) && Math.hypot(gx - x, gz - z) > this.cfg.eatRange * 0.9) return null;
    // Food INSIDE a hard prop (a mealworm penned in the no-step dish): the body
    // can't stand there — find the nearest STANDABLE point within snout reach
    // and eat over the rim. Same idea as the glass case, generalised to props.
    if (this.world.isBlocked(gx, gz, this.cfg.bodyRadius * 0.9)) {
      const reach = this.cfg.eatRange * 0.9;
      for (let rr = 0.04; rr <= reach + 1e-6; rr += 0.03) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * TAU;
          const px = gx + Math.sin(a) * rr;
          const pz = gz + Math.cos(a) * rr;
          if (px < b.minX + r || px > b.maxX - r || pz < b.minZ + r || pz > b.maxZ - r) continue;
          if (this.world.isFree(px, pz, this.cfg.bodyRadius)) return { x: px, z: pz };
        }
      }
      return null;
    }
    return { x: gx, z: gz };
  }

  /** Can the gecko currently plan a route from where it stands to (x,z)? Used by
   *  feeding to prefer spawning crickets the gecko can actually get to. Food
   *  against the glass counts as reachable when the snout can cover the gap. */
  canReach(x: number, z: number): boolean {
    if (this.nav.findPath({ x: this.x, z: this.z }, { x, z }) != null) return true;
    const g = this.reachGoal(x, z);
    return g != null && (g.x !== x || g.z !== z) && this.nav.findPath({ x: this.x, z: this.z }, g) != null;
  }

  /**
   * Swap in a new collision world after a LIVE layout edit (decor moved / added /
   * removed / scaled). Rebuilds the navigation graph so routing reflects the new
   * obstacles, drops the stale path + feeder target, and — crucially — FREES the
   * gecko if the edit dropped a prop on top of it (push out of the obstacle, or
   * relocate to a clear spot) so it never ends up trapped inside decor.
   */
  setWorld(world: CollisionWorld): void {
    this.world = world;
    this.nav = new NavGraph(world, this.cfg.bodyRadius);
    this.path = null;
    this.pathIdx = 0;
    this.currentFeederId = null;
    this.unreachable.clear();
    // The layout changed — the hide may have moved; the care layer re-requests.
    this.shelterMode = false;
    this.shelterArrived = false;
    this.feetPlanner.reset(); // re-home the feet on the (possibly moved) ground
    if (!world.isFree(this.x, this.z, this.cfg.bodyRadius)) {
      const res = world.resolve(this.x, this.z, this.x, this.z, this.cfg.bodyRadius);
      this.x = res.x;
      this.z = res.z;
      if (!world.isFree(this.x, this.z, this.cfg.bodyRadius)) {
        const t = world.randomFreeTarget(this.cfg.bodyRadius, this.rng);
        if (t) {
          this.x = t.x;
          this.z = t.z;
        }
      }
      this.enterIdle();
    }
    // Make sure the whole silhouette (not just the centre) is clear of the new decor.
    this.settleBody();
  }

  /** Disturbance (rehousing / startled): a brief fast scuttle to cover. */
  startle(): void {
    this.fleeT = this.cfg.fleeDur;
    this.phase = "flee";
    this.pickAnyFreeGoal();
  }

  /** Advance one tick. `feeders` = live feeder positions (for hunting). */
  update(dt: number, feeders: HuntTarget[]): MovementResult {
    this.lastYawRate = 0;
    this.tickUnreachable(dt, feeders);

    // Climb slowdown from LAST frame's solved height (one frame of lag is
    // invisible; the height itself is solved from the FEET after the move).
    // Approaching a climb (pitch assist anticipating) slows EARLY — a real
    // animal assesses a rock at a creep, giving the front feet time to plant
    // on top before the chest reaches the face.
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    this.climbScale =
      (this.climbTargetH > 0.005 ? this.cfg.climbSpeedMul : this.pitchAssistOn ? this.cfg.climbSpeedMul * 0.8 : 1) *
      this.mantleBrake;

    const result = this.think(dt, feeders);

    // No-phasing: after the brain moves/turns, push the whole silhouette (snout →
    // tail) out of hard decor + walls. 10 relaxation passes leave only a sub-cm
    // residual in the tightest wedges (invisible), while the centre stays hard-
    // guaranteed by `resolve`. This never deadlocks the gecko's turning.
    const body = this.world.resolveBody(this.x, this.z, this.yaw, this.probes);
    this.x = body.x;
    this.z = body.z;

    // FEET: plant/step the four feet on the EXACT surface under each of them
    // (terrain + per-point prop heights + pass-under all included). On a climb
    // the gait shortens + lifts a touch — short careful steps, like the real
    // animal on rock.
    const standNow = this.world.bounds.y + this.climbH;
    const surf = (sx: number, sz: number): number => this.world.climbHeightAt(sx, sz, 0, standNow);
    // Feet are COLLIDABLE like everything else: every plant/landing is pushed
    // out of hard decor first, so a paw can never sit inside a rock — and NEVER
    // onto a TOO-TALL cell (beyond the mantle ceiling): navigation refuses
    // those, and feet stepping onto them anyway is how the body used to get
    // carried up (and stranded on) a crown no route leads off of. A landing
    // that would be too tall walks back toward the body instead.
    const clampFoot = (sx: number, sz: number): { x: number; z: number } => {
      const p = this.world.freePoint(sx, sz, 0.018);
      if (!this.world.tooTallAt(p.x, p.z, 0.01)) return p;
      for (let t = 0.3; t <= 1.01; t += 0.35) {
        const q = this.world.freePoint(p.x + (this.x - p.x) * t, p.z + (this.z - p.z) * t, 0.018);
        if (!this.world.tooTallAt(q.x, q.z, 0.01)) return q;
      }
      return { x: this.x, z: this.z };
    };
    const onClimb = this.climbH > 0.015;
    const mantling = this.pitchAssistOn || this.mantleBrake < 0.9;
    this.feetPlanner.update(
      dt,
      { x: this.x, z: this.z, yaw: this.yaw, standY: standNow },
      this.isMoving || mantling,
      this.speed,
      surf,
      clampFoot,
      onClimb || mantling ? { stride: 0.62, lift: 1.5, phaseBoost: mantling ? 0.8 : 0 } : undefined,
    );
    const pose = this.feetPlanner.pose();

    // THE BODY GOES WHERE THE FEET ARE (the standard quadruped-IK rule): the
    // root's height is the MEAN of the four foot-contact surfaces — so the legs
    // can never overextend, and a climb is a smooth ride up the contacts as
    // each foot finds higher rock. The pitched spine (below) does the ledge
    // work the old "ride the highest surface" hack faked with stilts.
    this.climbTargetH = Math.min(this.cfg.climbLiftCap, Math.max(0, pose.mean - this.world.bounds.y));

    // Ease the body lift toward the support height. The rate grows with the gap
    // (a "mantle" boost): stepping onto a sheer trunk edge closes in ~0.1 s so
    // the body doesn't visibly sink through the wood face, while gentle slopes
    // keep the soft base rate.
    const liftGap = Math.abs(this.climbTargetH - this.climbH);
    const liftRate = this.cfg.climbLiftRate + liftGap * 26;
    this.climbH += (this.climbTargetH - this.climbH) * Math.min(1, liftRate * dt);
    if (Math.abs(this.climbH - this.climbTargetH) < 1e-4) this.climbH = this.climbTargetH;
    // Mid-mantle the clearance floor (below) holds the body up even though the
    // feet-mean target is lower — without this the two fight in a sawtooth of
    // ease-down + clamp-up. The floor releases smoothly once the need is gone.
    this.climbH = Math.max(this.climbH, this.enforcedFloorH);

    // Body PITCH from front-vs-rear foot contacts, ROLL from left-vs-right —
    // climbing driftwood reads as climbing (nose up the wood), a rock under one
    // side reads as a lean. Caps are gentle on bare ground, steeper on climbables.
    const climbing = this.climbTargetH > 0.01;
    const pCap = climbing || this.pitchAssistOn ? PITCH_CAP.climb : PITCH_CAP.walk;
    const rCap = climbing ? ROLL_CAP.climb : ROLL_CAP.walk;
    let targetPitch = Math.max(-pCap, Math.min(pCap, Math.atan2(pose.front - pose.rear, pose.wheelbase)));
    const targetRoll = Math.max(-rCap, Math.min(rCap, Math.atan2(pose.left - pose.right, pose.track)));

    // PITCH ASSIST — the SPINE does the clearance work, not the root: facing a
    // tall step, the head REARS UP along the face (and the tail lifts on the
    // way down a crest) instead of the whole body hoisting on stilt legs. It
    // ANTICIPATES (samples a stride ahead) so the rear-up starts before the
    // face arrives, and eases faster than the lift floor so the spine wins.
    this.pitchAssistOn = false;
    this.assistSin = 0;
    {
      const baseY = this.world.bounds.y + this.climbH;
      const grace = 0.008;
      const snout = 0.135;
      const tail = -0.19;
      const ahead = snout + 0.11; // one careful stride of anticipation
      const sSnout = Math.max(
        this.world.climbHeightAt(this.x + fwdX * snout, this.z + fwdZ * snout, 0.01, baseY),
        this.world.climbHeightAt(this.x + fwdX * ahead, this.z + fwdZ * ahead, 0.01, baseY),
      );
      const sTail = this.world.climbHeightAt(this.x + fwdX * tail, this.z + fwdZ * tail, 0.01, baseY);
      const upNeed = (sSnout - grace - baseY) / snout; // required sin(pitch) nose-up
      const downNeed = (sTail - grace - baseY) / tail; // required sin(pitch) nose-down (negative)
      const maxSin = Math.sin(PITCH_CAP.climb);
      if (upNeed > 0 && downNeed >= 0) {
        this.assistSin = Math.min(maxSin, upNeed);
        targetPitch = Math.max(targetPitch, Math.asin(this.assistSin));
        this.pitchAssistOn = true;
      } else if (downNeed < 0 && upNeed <= 0) {
        this.assistSin = Math.max(-maxSin, downNeed);
        targetPitch = Math.min(targetPitch, Math.asin(this.assistSin));
        this.pitchAssistOn = true;
      }
      // Head AND tail both blocked (straddling a slot) → pitch can't help;
      // the lift floor below handles it.
    }
    this.pitch += (targetPitch - this.pitch) * Math.min(1, (this.pitchAssistOn ? 13 : 8) * dt);
    this.roll += (targetRoll - this.roll) * Math.min(1, 8 * dt);

    // VERTICAL NO-PHASE GUARANTEE: with the FINAL pitch/roll, walk every body
    // part along the pitched spine — NO part may end below the mesh surface
    // under it. With the body riding the feet and the spine pitched between the
    // contact pairs, this is normally a SMALL correction at ledge lips: raise
    // FAST-EASED (smooth), with a hard clamp on whatever tiny residual remains
    // so real penetration stays impossible.
    {
      const sinP = Math.sin(this.pitch);
      const sinR = Math.sin(this.roll);
      const baseY = this.world.bounds.y + this.climbH;
      let needNow = 0; // REAL penetration at current positions → hard-clamped
      let needSoft = 0; // includes the travel anticipation → ease-only (smooth pre-rise)
      let needForward = 0; // where the governing violation sits on the spine
      for (const p of this.probes) {
        // The TAIL is FLEXIBLE — it drapes down a rock face behind the body
        // (real tails drag; ours waves procedurally). A rigid tail lever here
        // kept the body hovering for seconds after every descent. Tail probes
        // still collide SIDEWAYS (resolveBody) — just not vertically.
        if (p.forward < -0.09) continue;
        const px = this.x + fwdX * p.forward - fwdZ * p.side;
        const pz = this.z + fwdZ * p.forward + fwdX * p.side;
        const sNow = this.world.climbHeightAt(px, pz, 0.01, baseY);
        // Anticipate a few cm along the travel direction: a sheer face's cell
        // edge otherwise lands the whole step's need in ONE frame (a pop). The
        // anticipated part is EASE-ONLY — never hard-clamped (it isn't real yet).
        const sAhead = this.world.climbHeightAt(px + fwdX * 0.03, pz + fwdZ * 0.03, 0.01, baseY);
        // ONLY PROP MATERIAL constrains: the belly and tail naturally REST ON /
        // DRAG ACROSS the substrate (a pitched-up gecko's tail lies on the
        // sand — that's the real animal, not a violation). Guarding parts
        // against bare ground was what hoisted the body onto stilt legs.
        const ground = this.world.groundHeightAt(px, pz);
        if (Math.max(sNow, sAhead) - ground <= 0.02) continue;
        // Head/neck probes get CREDIT for the pitch the spine is committed to
        // (the assist) — but only probes the assist RAISES (a nose-up rear
        // must never be credited to parts it actually lowers).
        const credited = Math.abs(p.forward) >= 0.085 && this.assistSin * p.forward > 0;
        const sinEff = credited
          ? this.assistSin > 0
            ? Math.max(sinP, this.assistSin)
            : Math.min(sinP, this.assistSin)
          : sinP;
        const partY = baseY + sinEff * p.forward - Math.abs(sinR * p.side);
        // Parts REST on surfaces (belly contact) — only entering one is banned.
        needNow = Math.max(needNow, sNow - 0.008 - partY);
        const n = Math.max(sNow, sAhead) - 0.008 - partY;
        if (n > needSoft) {
          needSoft = n;
          needForward = p.forward;
        }
      }
      // MANTLE BRAKE (motion warping): while the body is actively lifting over
      // a step AHEAD, forward motion slows right down — the animal pushes UP,
      // then continues forward. Departures (hips resting on the crest lip while
      // walking OFF) must NOT brake, or the body hovers at the edge for ages.
      this.mantleBrake =
        needSoft > 0.01 && needForward >= -0.01
          ? Math.max(0.25, 1 - needSoft * 8)
          : Math.min(1, this.mantleBrake + 3 * dt);
      if (needSoft > 0) {
        const applied = needSoft * Math.min(1, (10 + needSoft * 15) * dt);
        // Smooth rise for the anticipated part; only REAL remaining penetration
        // at the current pose is clamped out instantly (≤ 8 mm slack).
        const residualNow = needNow - applied;
        this.climbH = Math.min(this.cfg.climbLiftCap, this.climbH + applied + Math.max(0, residualNow - 0.008));
        this.enforcedFloorH = this.climbH;
      } else {
        this.enforcedFloorH = Math.max(0, this.enforcedFloorH - 0.3 * dt);
      }
    }
    return result;
  }

  private think(dt: number, feeders: HuntTarget[]): MovementResult {
    // ── EAT (highest priority) ──
    if (this.eatT > 0) {
      this.phase = "eat";
      this.eatT -= dt;
      this.easeSpeed(0, dt);
      const f = feeders.find((t) => t.id === this.currentFeederId);
      if (f) this.turnToward(f.x, f.z, dt);
      if (this.eatT <= 0) {
        const ate = this.currentFeederId;
        this.currentFeederId = null;
        this.enterIdle();
        return { ateFeederId: ate };
      }
      return { ateFeederId: null };
    }

    // ── FLEE (panic dash — no pathfinding) ──
    if (this.fleeT > 0) {
      this.phase = "flee";
      this.fleeT -= dt;
      const r = this.steer(dt, this.goal.x, this.goal.z, this.cfg.fleeSpeed);
      if (r.arrived || r.blocked) this.pickAnyFreeGoal();
      if (this.fleeT <= 0) this.enterIdle();
      return { ateFeederId: null };
    }

    // ── STUCK RECOVERY (back up + turn, then replan) ──
    if (this.phase === "recover") {
      this.recoverTick(dt, feeders);
      return { ateFeederId: null };
    }

    // ── SHELTER (walk into a hide's pocket, then rest — ignores feeders) ──
    if (this.shelterMode) {
      this.phase = "shelter";
      if (this.shelterArrived) {
        this.easeSpeed(0, dt);
        return { ateFeederId: null };
      }
      // The PEEK: a deliberate pause mid-journey (at the hide's mouth) — the
      // care layer requests it; stillness here is intentional, not stuck.
      if (this.stillT > 0) {
        this.stillT -= dt;
        this.easeSpeed(0, dt);
        this.resetStuck();
        return { ateFeederId: null };
      }
      const status = this.followPath(dt, this.cfg.walkSpeed);
      if (status === "arrived") {
        // "Path exhausted" is NOT "inside the hide": stuck recovery can swap
        // the path mid-journey, so verify we're actually AT the pocket anchor —
        // else re-aim at it (or give up if it became unreachable).
        if (this.dist(this.shelterGoal.x, this.shelterGoal.z) <= this.shelterTol) {
          this.shelterArrived = true;
          this.easeSpeed(0, dt);
        } else if (!this.planTo(this.shelterGoal.x, this.shelterGoal.z)) {
          this.endShelter();
        }
      } else if (status === "blocked") {
        // Pocket entrance blocked (an edit?) — give up on hiding for now.
        this.endShelter();
      } else {
        this.trackStuck(dt, "shelter");
      }
      return { ateFeederId: null };
    }

    // ── HUNT (feeders present + at least one currently reachable) ──
    const reachable = feeders.filter((f) => !this.unreachable.has(f.id));
    if (reachable.length > 0) {
      return this.huntTick(dt, feeders, reachable);
    }
    // No feeders, or all flagged unreachable → normal roam/idle.
    if (this.phase === "hunt") this.enterIdle();
    this.roamTick(dt);
    return { ateFeederId: null };
  }

  // ── HUNT ──────────────────────────────────────────────────────────────────
  private huntTick(dt: number, feeders: HuntTarget[], reachable: HuntTarget[]): MovementResult {
    this.repathT += dt;
    const cur = this.currentFeederId != null ? feeders.find((f) => f.id === this.currentFeederId) : undefined;

    // (Re)acquire a target: when we have none, it despawned, or the repath
    // timer fired. NEVER while PRESSING at a rim — ten worms milling in a dish
    // would swap the target every cycle and reset the over-the-rim bite forever.
    if (!cur || (this.repathT >= this.cfg.repathInterval && this.pressStallT <= 0)) {
      this.repathT = 0;
      this.acquireFeeder(reachable);
    }

    const target = this.currentFeederId != null ? feeders.find((f) => f.id === this.currentFeederId) : undefined;
    if (!target) {
      // Nothing reachable right now — look around, retry when a feeder frees up.
      this.phase = "hunt";
      this.foodUnreachableFlag = feeders.length > 0;
      this.easeSpeed(0, dt);
      this.scan(dt);
      return { ateFeederId: null };
    }

    this.phase = "hunt";
    const d = this.dist(target.x, target.z);
    if (d <= this.cfg.eatRange) {
      this.eatT = this.cfg.eatDuration;
      this.easeSpeed(0, dt);
      this.turnToward(target.x, target.z, dt);
      return { ateFeederId: null };
    }

    // REAL leopard-gecko approach: walk in, CREEP once inside the stalk band
    // (with motionless freeze beats — the wary pause), then a short STRIKE DASH
    // over the last stretch when facing the prey with a clear line. Ambush
    // locomotion, not a jog.
    let huntSpeed = this.cfg.walkSpeed;
    if (d <= this.cfg.dashRange) {
      const ang = Math.atan2(target.x - this.x, target.z - this.z); // brain yaw convention
      let diff = ang - this.yaw;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      const facing = Math.abs(diff) < 0.55;
      const striking = facing && this.world.losClear(this.x, this.z, target.x, target.z, this.cfg.bodyRadius * 0.7);
      huntSpeed = striking
        ? this.cfg.walkSpeed * this.cfg.dashSpeedMul
        : this.cfg.walkSpeed * this.cfg.stalkSpeedMul;
      // The strike is EXPLOSIVE — a burst from stillness, not a gentle ramp
      // (the whole dash lives inside ~10 cm; a slow ease would never peak).
      if (striking) this.speed = Math.max(this.speed, Math.min(huntSpeed, this.speed + huntSpeed * 6 * dt));
      this.stalkFreezeLeft = 0; // never freeze mid-strike
    } else if (d <= this.cfg.stalkRange) {
      if (this.stalkFreezeLeft > 0) {
        this.stalkFreezeLeft -= dt;
        this.easeSpeed(0, dt);
        this.turnToward(target.x, target.z, dt);
        this.resetStuck(); // a freeze is intentional stillness, not being stuck
        return { ateFeederId: null };
      }
      this.stalkFreezeGapT -= dt;
      if (this.stalkFreezeGapT <= 0) {
        this.stalkFreezeLeft = rand(this.rng, this.cfg.stalkFreezeDur);
        this.stalkFreezeGapT = rand(this.rng, this.cfg.stalkFreezeGap);
      }
      huntSpeed = this.cfg.walkSpeed * this.cfg.stalkSpeedMul;
    }

    // Keep the goal locked to the (moving) feeder and follow the planned path.
    this.goal = { x: target.x, z: target.z };
    const status = this.followPath(dt, huntSpeed);
    if (status === "arrived") {
      if (d <= this.cfg.eatRange * 2.2) {
        // Final close-in: press toward the PREY itself — the dish rim / glass
        // stops the body physically (resolve), and the snout covers the last
        // gap. Waypoint arrival tolerance alone would strand it just short.
        this.steer(dt, target.x, target.z, this.cfg.walkSpeed * this.cfg.stalkSpeedMul);
        // PINNED-PRESS BITE: pinned at the barrier (no more progress) with the
        // prey just inside snout-stretch range — that IS the over-the-rim bite.
        // (pressStallT > 0 also HOLDS the current target — see the repath gate.)
        this.pressStallT = d < this.pressLastD - 0.004 ? 1e-4 : this.pressStallT + dt;
        this.pressLastD = Math.min(this.pressLastD, d);
        if (this.pressStallT > 0.9 && d <= this.cfg.eatRange * 1.35) {
          this.eatT = this.cfg.eatDuration;
          this.easeSpeed(0, dt);
          this.turnToward(target.x, target.z, dt);
          this.pressStallT = 0;
          this.pressLastD = Infinity;
          return { ateFeederId: null };
        }
      } else {
        // Reached the path end but far off → replan to the nearest STANDABLE
        // point (the snout covers a glass-hugging cricket).
        const goal = this.reachGoal(target.x, target.z);
        if (goal) this.planTo(goal.x, goal.z);
      }
    } else {
      this.pressStallT = 0;
      this.pressLastD = Infinity;
    }
    this.trackStuck(dt, "hunt");
    return { ateFeederId: null };
  }

  /** Pick the nearest reachable feeder we can actually path to; flag the ones we
   *  can't as temporarily unreachable. Sets currentFeederId + path, or clears them. */
  private acquireFeeder(reachable: HuntTarget[]): void {
    const sorted = reachable.slice().sort((a, b) => this.dist(a.x, a.z) - this.dist(b.x, b.z));
    for (const f of sorted) {
      const goal = this.reachGoal(f.x, f.z);
      const path = goal ? this.nav.findPath({ x: this.x, z: this.z }, goal) : null;
      if (path) {
        this.currentFeederId = f.id;
        this.goal = { x: f.x, z: f.z };
        this.path = path;
        this.pathIdx = 0;
        this.resetStuck();
        this.foodUnreachableFlag = false;
        if (path.length > 1) this.log(`path blocked; rerouting to cricket ${f.id} via ${path.length} waypoints.`);
        return;
      }
      this.unreachable.set(f.id, this.cfg.unreachableCooldown);
      this.log(`feeder ${f.id} unreachable; selecting another feeder.`);
    }
    this.currentFeederId = null;
    this.path = null;
    this.foodUnreachableFlag = true;
  }

  // ── ROAM / IDLE / LOOK ──────────────────────────────────────────────────────
  private roamTick(dt: number): void {
    if (this.phase === "idle" || this.phase === "giveup") {
      this.easeSpeed(0, dt);
      this.stateT -= dt;
      if (this.stateT <= 0) this.enterLook();
      return;
    }
    if (this.phase === "look") {
      this.easeSpeed(0, dt);
      this.scan(dt);
      this.stateT -= dt;
      if (this.stateT <= 0) this.enterRoam();
      return;
    }
    // phase === "roam"
    const status = this.followPath(dt, this.cfg.walkSpeed);
    this.trackStuck(dt, "roam");
    this.stateT -= dt;
    if (status === "arrived" || this.stateT <= 0) {
      if (this.rng() < this.cfg.idleChance) this.enterIdle();
      else this.enterRoam();
    } else if (status === "blocked") {
      if (!this.enterRoam()) this.enterIdle();
    }
  }

  // ── Path following ───────────────────────────────────────────────────────────
  /** Steer along the current path; returns whether we're moving / arrived at the
   *  final target / blocked on the current waypoint. */
  private followPath(dt: number, maxSpeed: number): "moving" | "arrived" | "blocked" {
    if (!this.path || this.pathIdx >= this.path.length) return "arrived";
    const wp = this.path[this.pathIdx];
    const r = this.steer(dt, wp.x, wp.z, maxSpeed * this.climbScale);
    if (r.arrived) {
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) return "arrived";
    }
    return r.blocked ? "blocked" : "moving";
  }

  /** Plan a route to (tx,tz); returns whether a route was found. */
  private planTo(tx: number, tz: number): boolean {
    const path = this.nav.findPath({ x: this.x, z: this.z }, { x: tx, z: tz });
    this.goal = { x: tx, z: tz };
    this.path = path;
    this.pathIdx = 0;
    this.resetStuck();
    if (path && path.length > 1) this.log(`path blocked; rerouting via ${path.length} waypoints.`);
    return !!path;
  }

  // ── Stuck detection + recovery ────────────────────────────────────────────────
  private trackStuck(dt: number, ret: "hunt" | "roam" | "shelter"): void {
    this.stuckWindowT += dt;
    if (this.stuckWindowT < this.cfg.stuckTime) return;
    const d = this.dist(this.goal.x, this.goal.z);
    const progress = this.stuckRefDist - d;
    this.stuckRefDist = d;
    this.stuckWindowT = 0;
    if (progress < this.cfg.stuckProgress) this.enterRecover(ret);
  }
  private resetStuck(): void {
    this.stuckRefDist = this.dist(this.goal.x, this.goal.z);
    this.stuckWindowT = 0;
  }
  private enterRecover(ret: "hunt" | "roam" | "shelter"): void {
    this.phase = "recover";
    this.recoverReturn = ret;
    this.recoverT = this.cfg.recoverTime;
    this.recoverDir = this.rng() < 0.5 ? -1 : 1;
    this.log("stuck; backing up and choosing an alternate path.");
  }
  private recoverTick(dt: number, feeders: HuntTarget[]): void {
    this.recoverT -= dt;
    // Back up (opposite heading) + turn in place.
    this.easeSpeed(this.cfg.recoverSpeed, dt);
    this.yaw += this.recoverDir * this.cfg.turnRate * dt;
    this.lastYawRate = this.recoverDir * this.cfg.turnRate;
    const bx = this.x - Math.sin(this.yaw) * this.speed * dt;
    const bz = this.z - Math.cos(this.yaw) * this.speed * dt;
    const res = this.world.resolve(this.x, this.z, bx, bz, this.cfg.bodyRadius);
    this.x = res.x;
    this.z = res.z;
    if (this.recoverT > 0) return;

    this.fails++;
    if (this.fails >= this.cfg.maxFails) {
      this.giveUp();
      return;
    }
    // Try again: re-plan toward a feeder (hunt), the SHELTER goal (a rest trip
    // recovers toward its own destination — never a random roam target), or a
    // fresh roam target.
    if (this.recoverReturn === "hunt") {
      const reachable = feeders.filter((f) => !this.unreachable.has(f.id));
      this.phase = "hunt";
      this.acquireFeeder(reachable);
    } else if (this.recoverReturn === "shelter" && this.shelterMode) {
      if (!this.planTo(this.shelterGoal.x, this.shelterGoal.z)) this.endShelter();
      else this.phase = "shelter";
    } else {
      this.enterRoam();
    }
  }
  /** PLAYER RESCUE — the "Unstuck" button. Ends any shelter/hunt state and
   *  either walks straight to legal ground (if stranded) or, when even that
   *  fails (fully boxed in by an edit), teleports the body to the nearest
   *  free point. Always leaves the animal in a plannable state. */
  rescue(): "walking" | "teleported" | "fine" {
    this.shelterMode = false;
    this.shelterArrived = false;
    this.currentFeederId = null;
    this.fails = 0;
    this.resetStuck();
    if (this.world.isFree(this.x, this.z, this.cfg.bodyRadius)) {
      // Not stranded — just clear the head: replan from here.
      this.path = null;
      this.phase = "idle";
      this.stateT = 1.2;
      this.log("rescue: state cleared; replanning from open ground.");
      return "fine";
    }
    if (this.escapeStrand()) return "walking";
    // Boxed in completely — lift the animal to the nearest free point.
    for (let rr = 0.1; rr <= 1.4; rr += 0.06) {
      for (let k = 0; k < 20; k++) {
        const a = (k / 20) * TAU;
        const x = this.x + Math.sin(a) * rr;
        const z = this.z + Math.cos(a) * rr;
        if (this.world.isFree(x, z, this.cfg.bodyRadius)) {
          this.x = x;
          this.z = z;
          this.path = null;
          this.phase = "idle";
          this.stateT = 1.5;
          this.log("rescue: teleported to the nearest free ground.");
          return "teleported";
        }
      }
    }
    return "fine";
  }

  /** Stranded somewhere navigation considers illegal (a too-tall crown, after
   *  an edit, etc.): walk STRAIGHT to the nearest legal free ground — the
   *  motion resolver keeps the descent honest, and planning works again from
   *  down there. Returns true when an escape walk was started. */
  private escapeStrand(): boolean {
    if (this.world.isFree(this.x, this.z, this.cfg.bodyRadius)) return false;
    for (let rr = 0.12; rr <= 0.9; rr += 0.08) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU;
        const x = this.x + Math.sin(a) * rr;
        const z = this.z + Math.cos(a) * rr;
        if (this.world.isFree(x, z, this.cfg.bodyRadius)) {
          this.goal = { x, z };
          this.path = [{ x, z }];
          this.pathIdx = 0;
          this.phase = "roam";
          this.stateT = 4;
          this.fails = 0;
          this.resetStuck();
          this.log("stranded on decor; climbing down to free ground.");
          return true;
        }
      }
    }
    return false;
  }

  private giveUp(): void {
    if (this.escapeStrand()) return;
    if (this.shelterMode) this.log("couldn't reach the rest spot; giving up on it for now.");
    this.shelterMode = false;
    this.shelterArrived = false;
    if (this.recoverReturn === "hunt" && this.currentFeederId != null) {
      this.unreachable.set(this.currentFeederId, this.cfg.unreachableCooldown);
      this.foodUnreachableFlag = true;
      this.log(`gave up on cricket ${this.currentFeederId}; it seems unreachable.`);
      this.currentFeederId = null;
    }
    this.fails = 0;
    this.path = null;
    this.phase = "giveup";
    this.stateT = this.cfg.giveUpDur;
    this.log("giving up for now — idling and looking around.");
  }

  // ── State entries ─────────────────────────────────────────────────────────────
  private enterIdle(): void {
    this.phase = "idle";
    this.path = null;
    this.fails = 0;
    this.stateT = rand(this.rng, this.cfg.idleDur);
  }
  private enterLook(): void {
    this.phase = "look";
    this.stateT = rand(this.rng, this.cfg.lookDur);
    // Scan toward a new random bearing.
    this.lookYaw = this.rng() * TAU;
  }
  /** Choose a reachable roam target + plan a path to it; returns success. */
  private enterRoam(): boolean {
    for (let i = 0; i < 6; i++) {
      const t = this.world.randomFreeTarget(this.cfg.bodyRadius, this.rng);
      if (t && this.planTo(t.x, t.z)) {
        this.phase = "roam";
        this.fails = 0;
        this.stateT = rand(this.rng, this.cfg.roamDur);
        return true;
      }
    }
    this.enterIdle();
    return false;
  }
  private pickAnyFreeGoal(): void {
    const t = this.world.randomFreeTarget(this.cfg.bodyRadius, this.rng);
    if (t) {
      this.goal = t;
      this.resetStuck();
    }
  }

  // ── Steering primitives ───────────────────────────────────────────────────────
  private scan(dt: number): void {
    // Gently rotate toward the look bearing so it "looks around" before moving.
    let dY = this.lookYaw - this.yaw;
    while (dY > Math.PI) dY -= TAU;
    while (dY < -Math.PI) dY += TAU;
    const turn = Math.max(-this.cfg.turnRate * 0.6 * dt, Math.min(this.cfg.turnRate * 0.6 * dt, dY));
    this.yaw += turn;
    this.lastYawRate = turn / Math.max(dt, 1e-3);
  }

  private easeSpeed(to: number, dt: number): void {
    this.speed += (to - this.speed) * Math.min(1, this.cfg.accel * dt);
    if (this.speed < 1e-4) this.speed = 0;
  }

  private turnToward(tx: number, tz: number, dt: number): void {
    const bearing = Math.atan2(tx - this.x, tz - this.z);
    let dY = bearing - this.yaw;
    while (dY > Math.PI) dY -= TAU;
    while (dY < -Math.PI) dY += TAU;
    const turn = Math.max(-this.cfg.turnRate * dt, Math.min(this.cfg.turnRate * dt, dY));
    this.yaw += turn;
    this.lastYawRate = turn / Math.max(dt, 1e-3);
  }

  /** Turn toward the target and advance forward when aligned; resolve collisions.
   *  Returns whether the target was reached / the move was blocked. */
  private steer(dt: number, tx: number, tz: number, maxSpeed: number): { arrived: boolean; blocked: boolean } {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const dist = Math.hypot(dx, dz);
    let desired = 0;
    if (dist > this.cfg.arrive) {
      const bearing = Math.atan2(dx, dz);
      let dY = bearing - this.yaw;
      while (dY > Math.PI) dY -= TAU;
      while (dY < -Math.PI) dY += TAU;
      const turn = Math.max(-this.cfg.turnRate * dt, Math.min(this.cfg.turnRate * dt, dY));
      this.yaw += turn;
      this.lastYawRate = turn / Math.max(dt, 1e-3);
      const align = Math.max(0, Math.cos(dY));
      const slow = dist < this.cfg.arrive * 3 ? Math.max(0.25, dist / (this.cfg.arrive * 3)) : 1;
      desired = maxSpeed * align * align * slow;
    }
    this.easeSpeed(desired, dt);

    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const nx = this.x + fx * this.speed * dt;
    const nz = this.z + fz * this.speed * dt;
    const res = this.world.resolve(this.x, this.z, nx, nz, this.cfg.bodyRadius);
    this.x = res.x;
    this.z = res.z;
    return { arrived: dist <= this.cfg.arrive, blocked: res.blocked };
  }

  private dist(tx: number, tz: number): number {
    return Math.hypot(tx - this.x, tz - this.z);
  }

  private tickUnreachable(dt: number, feeders: HuntTarget[]): void {
    if (this.unreachable.size === 0) {
      if (feeders.length === 0) this.foodUnreachableFlag = false;
      return;
    }
    const liveIds = new Set(feeders.map((f) => f.id));
    for (const [id, t] of this.unreachable) {
      const nt = t - dt;
      if (nt <= 0 || !liveIds.has(id)) this.unreachable.delete(id);
      else this.unreachable.set(id, nt);
    }
    if (feeders.length === 0) this.foodUnreachableFlag = false;
  }

  /** For save/resume: current ground pose. */
  snapshot(): { x: number; z: number; yaw: number } {
    return { x: this.x, z: this.z, yaw: this.yaw };
  }
}

function rand(rng: Rng, range: [number, number]): number {
  return range[0] + rng() * (range[1] - range[0]);
}

/**
 * GLASSWATER — pure FOOT-CONTACT planner (no Three.js / DOM). The gecko stands on
 * four FEET, not an abstract centre: each foot is either PLANTED (world-locked on
 * the exact sampled surface — it does not slide and does not float) or STEPPING
 * (briefly airborne on a smooth arc, landing back on the surface). A diagonal
 * trot (FL+RR alternating with FR+RL) is driven by DISTANCE TRAVELLED, so feet
 * freeze the instant the body stops — no foot-skate.
 *
 * The planner is deliberately renderer-agnostic: it consumes a surface-height
 * callback (the collision world's climbHeightAt, which already understands
 * sculpted terrain, per-point prop heightfields and pass-under) and emits plain
 * contact points. The movement brain derives body HEIGHT / PITCH / ROLL from
 * these contacts; the renderer just draws them (feet + debug markers). The same
 * contacts will drive foot bones when the final rigged gecko lands.
 */

export interface FootAnchor {
  id: "FL" | "FR" | "RL" | "RR";
  /** Metres toward the head (+) in the body frame. */
  forward: number;
  /** Metres toward the animal's RIGHT (+) in the body frame. */
  side: number;
  /** Gait phase offset (0..1). Diagonal pairs share a phase. */
  phase: number;
}

/** Foot home positions for the ~0.3 m leopard gecko (matches the placeholder's
 *  hip/leg geometry; the final rig can override with its own anchors). */
export const GECKO_FOOT_ANCHORS: FootAnchor[] = [
  { id: "FL", forward: 0.075, side: -0.073, phase: 0.0 },
  { id: "FR", forward: 0.075, side: 0.073, phase: 0.5 },
  { id: "RL", forward: -0.062, side: -0.073, phase: 0.5 },
  { id: "RR", forward: -0.062, side: 0.073, phase: 0.0 },
];

/** Body pitch caps (radians): gentle on bare ground, steeper while climbing a
 *  climbable prop (that's what climbable means — 0.9 covers a max-climb step
 *  across the wheelbase, so the spine can lie ALONG the face of a tall rock). */
export const PITCH_CAP = { walk: 0.55, climb: 0.9 };
/** Body roll caps (radians): a lean, never a barrel roll. */
export const ROLL_CAP = { walk: 0.32, climb: 0.5 };

export type FootPhase = "planted" | "stepping";

/** One foot's live contact, in world space. */
export interface FootContact {
  id: FootAnchor["id"];
  x: number;
  z: number;
  /** World Y of the foot (surface + step lift while airborne). */
  y: number;
  state: FootPhase;
  /** Current step lift above the surface (0 when planted). */
  lift: number;
  /** False when the surface under the foot is beyond plausible leg reach
   *  (a cliff edge under one foot) — the debug marker turns red. */
  valid: boolean;
}

export interface FootPlannerConfig {
  /** Distance per full gait cycle (m). */
  strideLen: number;
  /** Fraction of the cycle a foot spends airborne. < 0.5 keeps opposite-phase
   *  feet from ever swinging together. */
  airFrac: number;
  /** Peak step lift (m). */
  liftHeight: number;
  /** How far ahead of the home a swing lands, in strides. */
  lead: number;
  /** Max |foot surface − body stand height| that still counts as contact. */
  reach: number;
  /** Idle: how fast displaced feet ease home (1/s). */
  settleRate: number;
  /** Plant-vs-home distance that forces an instant re-plant (teleport guard). */
  snapDist: number;
}

export const GECKO_FEET: FootPlannerConfig = {
  strideLen: 0.16,
  airFrac: 0.38,
  liftHeight: 0.022,
  lead: 0.45,
  reach: 0.17,
  settleRate: 6,
  snapDist: 0.3,
};

/** The body pose a foot update needs. `standY` = world Y the body stands at. */
export interface BodyPose {
  x: number;
  z: number;
  yaw: number;
  standY: number;
}

/** World surface height under a point (the collision world's walk height). */
export type SurfaceFn = (x: number, z: number) => number;

/** Project a point OUT of hard obstacles (the collision world's freePoint) —
 *  a foot is never planted inside a rock, whatever the gait wants. */
export type ClampFn = (x: number, z: number) => { x: number; z: number };

/** Heights the brain turns into body height / pitch / roll. All from the feet's
 *  SURFACE contact heights (step lift excluded). */
export interface FeetPose {
  front: number;
  rear: number;
  left: number;
  right: number;
  mean: number;
  /** Front-to-rear anchor distance (m) — the pitch lever arm. */
  wheelbase: number;
  /** Left-to-right anchor distance (m) — the roll lever arm. */
  track: number;
}

interface FootRT {
  anchor: FootAnchor;
  plantX: number;
  plantZ: number;
  swingX: number;
  swingZ: number;
  inAir: boolean;
  out: FootContact;
}

const frac = (v: number): number => v - Math.floor(v);
const smooth = (p: number): number => p * p * (3 - 2 * p);

export class FootPlanner {
  private feetRT: FootRT[];
  private phase = 0;
  private homed = false;

  constructor(
    private cfg: FootPlannerConfig = GECKO_FEET,
    anchors: FootAnchor[] = GECKO_FOOT_ANCHORS,
  ) {
    this.feetRT = anchors.map((anchor) => ({
      anchor,
      plantX: 0,
      plantZ: 0,
      swingX: 0,
      swingZ: 0,
      inAir: false,
      out: { id: anchor.id, x: 0, z: 0, y: 0, state: "planted", lift: 0, valid: true },
    }));
  }

  /** Live world-space contacts (one per anchor, stable order). */
  get contacts(): FootContact[] {
    return this.feetRT.map((f) => f.out);
  }

  /** Forget every plant (after a teleport / world swap) — feet re-home cleanly. */
  reset(): void {
    this.homed = false;
  }

  /** A foot's HOME (its anchor under the current body pose), world XZ. */
  private home(a: FootAnchor, body: BodyPose): { x: number; z: number } {
    const fx = Math.sin(body.yaw);
    const fz = Math.cos(body.yaw);
    const rx = Math.cos(body.yaw);
    const rz = -Math.sin(body.yaw);
    return { x: body.x + fx * a.forward + rx * a.side, z: body.z + fz * a.forward + rz * a.side };
  }

  update(
    dt: number,
    body: BodyPose,
    moving: boolean,
    speed: number,
    surfaceAt: SurfaceFn,
    clampXZ?: ClampFn,
    gait?: { stride?: number; lift?: number; phaseBoost?: number },
  ): void {
    const cfg = this.cfg;
    // Climbing gait: SHORT careful steps with a touch more lift (how a real
    // animal takes rock) — the brain passes multipliers while on a climb.
    // `phaseBoost` adds TIME-driven stepping during a mantle: the body barely
    // advances while it pushes up a step, but the legs must keep reaching (a
    // distance-only clock would freeze the feet mid-climb).
    const strideLen = cfg.strideLen * (gait?.stride ?? 1);
    const liftHeight = cfg.liftHeight * (gait?.lift ?? 1);
    const clamp = clampXZ ?? ((x: number, z: number) => ({ x, z }));
    if (!this.homed) {
      // First tick (or after reset): plant every foot at its home.
      for (const f of this.feetRT) {
        const h0 = this.home(f.anchor, body);
        const h = clamp(h0.x, h0.z);
        f.plantX = h.x;
        f.plantZ = h.z;
        f.inAir = false;
      }
      this.homed = true;
    }

    // The gait clock is DISTANCE — stop moving and the feet freeze mid-stance.
    if (moving) this.phase += (speed * dt) / Math.max(1e-4, strideLen) + (gait?.phaseBoost ?? 0) * dt;

    for (const f of this.feetRT) {
      const h = this.home(f.anchor, body);

      // Teleport guard: a flee/replant left the plant impossibly far behind.
      if (Math.hypot(f.plantX - h.x, f.plantZ - h.z) > cfg.snapDist) {
        const hc = clamp(h.x, h.z);
        f.plantX = hc.x;
        f.plantZ = hc.z;
        f.inAir = false;
      }

      const cyc = frac(this.phase + f.anchor.phase);
      const air = moving && cyc < cfg.airFrac;

      // Where this swing lands: the home pushed a little ahead of travel —
      // CLAMPED out of hard decor, so a paw never lands inside a rock.
      const fx = Math.sin(body.yaw);
      const fz = Math.cos(body.yaw);
      const lead = strideLen * cfg.lead;
      const land = clamp(h.x + fx * lead, h.z + fz * lead);
      const tx = land.x;
      const tz = land.z;

      if (air && !f.inAir) {
        f.inAir = true;
        f.swingX = f.plantX;
        f.swingZ = f.plantZ;
      } else if (!air && f.inAir) {
        f.inAir = false;
        f.plantX = tx;
        f.plantZ = tz;
      }

      if (f.inAir) {
        const prog = Math.min(1, cyc / cfg.airFrac);
        const s = smooth(prog);
        const x = f.swingX + (tx - f.swingX) * s;
        const z = f.swingZ + (tz - f.swingZ) * s;
        const lift = Math.sin(Math.PI * prog) * liftHeight;
        const surf = surfaceAt(x, z);
        f.out.x = x;
        f.out.z = z;
        f.out.y = surf + lift;
        f.out.lift = lift;
        f.out.state = "stepping";
        f.out.valid = Math.abs(surf - body.standY) <= cfg.reach;
      } else {
        // Idle: displaced feet (after a turn-in-place) shuffle back under the body.
        if (!moving) {
          const k = Math.min(1, cfg.settleRate * dt);
          const hc = clamp(h.x, h.z);
          const d = Math.hypot(f.plantX - hc.x, f.plantZ - hc.z);
          if (d > 0.005) {
            f.plantX += (hc.x - f.plantX) * k;
            f.plantZ += (hc.z - f.plantZ) * k;
          }
        }
        const surf = surfaceAt(f.plantX, f.plantZ);
        f.out.x = f.plantX;
        f.out.z = f.plantZ;
        f.out.y = surf; // EXACTLY on the surface — the whole point
        f.out.lift = 0;
        f.out.state = "planted";
        f.out.valid = Math.abs(surf - body.standY) <= cfg.reach;
      }
    }
  }

  /** Contact-surface heights grouped for the body solve (lift excluded). */
  pose(): FeetPose {
    const y = (id: string): number => {
      const f = this.feetRT.find((r) => r.anchor.id === id)!;
      return f.out.y - f.out.lift;
    };
    const fl = y("FL");
    const fr = y("FR");
    const rl = y("RL");
    const rr = y("RR");
    const a = this.feetRT.map((f) => f.anchor);
    const wheelbase = Math.abs((a[0]?.forward ?? 0.07) - (a[2]?.forward ?? -0.06));
    const track = Math.abs((a[1]?.side ?? 0.07) - (a[0]?.side ?? -0.07));
    return {
      front: (fl + fr) / 2,
      rear: (rl + rr) / 2,
      left: (fl + rl) / 2,
      right: (fr + rr) / 2,
      mean: (fl + fr + rl + rr) / 4,
      wheelbase,
      track,
    };
  }
}

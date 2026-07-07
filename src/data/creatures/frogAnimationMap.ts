/**
 * FROG ANIMATION MAP — the colorful frog's behavior-state ↔ clip registry
 * (pure data + pure resolution, no Three/DOM; unit-tested).
 *
 * Every frog behavior state maps to:
 *   • `preferred`  — real GLB clip names, first match wins (the Fiverr
 *     animator's deliverables; today only the baked idle "Animation" exists),
 *   • `fallback`   — a procedural clip this codebase can build safely on the
 *     CURRENT rig (see FROG_PROCEDURAL_SPECS), or null when the rig cannot
 *     support the motion honestly,
 *   • `requiredForRelease` + an honest capability `note`.
 *
 * The rig truth these decisions rest on (measured, docs/CLAUDE_HANDOFF.md §v22):
 * one seamless skinned mesh, NO morph targets, NO eye/eyelid/jaw/tongue/throat
 * bones; head deformation rides DEF-spine.005/.006; hind toe fans
 * (Foot_Finger.*) are parented to the BODY, capping safe leg extension.
 * Real clips are ALWAYS preferred; procedural clips are fallbacks only;
 * missing states are surfaced loudly (never silently hidden).
 */

export type FrogClipSource = "glb" | "procedural" | "missing";

export interface FrogStateMapping {
  /** Accepted real GLB clip names, in preference order. */
  preferred: readonly string[];
  /** Procedural fallback clip name (must exist in FROG_PROCEDURAL_SPECS), or
   *  null when the rig cannot support the motion without faking. */
  fallback: string | null;
  requiredForRelease: boolean;
  /** One honest sentence — shown in the Frog Animation Lab. */
  note: string;
}

export type FrogBehaviorState =
  | "idle_breathing"
  | "idle_variation"
  | "throat_pulse"
  | "blink"
  | "look_left"
  | "look_right"
  | "look_around"
  | "rest_sit"
  | "sleep"
  | "wake_up"
  | "small_hop"
  | "medium_hop"
  | "big_jump"
  | "landing"
  | "turn_left"
  | "turn_right"
  | "slow_crawl"
  | "climb_up"
  | "climb_down"
  | "perch_idle"
  | "spot_prey"
  | "tongue_catch"
  | "bite"
  | "chew_swallow"
  | "missed_tongue"
  | "water_paddle"
  | "water_float"
  | "climb_out_water"
  | "water_struggle"
  | "startled_jump"
  | "hide_crouch"
  | "stress_crouch"
  | "weak_sick_idle"
  | "collapsed_faint"
  | "poop";

/** One procedural clip this codebase builds on the CURRENT rig. `loop` is the
 *  natural playback mode ("once" clips clamp on their final pose); rootMotion
 *  clips translate the `root` bone (loops restart from the origin). */
export interface FrogProceduralSpec {
  name: string;
  label: string;
  duration: number;
  loop: "repeat" | "once";
  rootMotion: boolean;
  about: string;
}

export const FROG_PROCEDURAL_SPECS: readonly FrogProceduralSpec[] = [
  {
    name: "procedural_frog_idle_breathing",
    label: "Idle breathing",
    duration: 3.2,
    loop: "repeat",
    rootMotion: false,
    about: "Slow chest-scale breathing with a whisper of spine sway — fallback twin of the baked idle.",
  },
  {
    name: "procedural_frog_idle_variation",
    label: "Idle variation",
    duration: 4.6,
    loop: "repeat",
    rootMotion: false,
    about: "Small weight shift + wandering gaze; blends naturally from idle.",
  },
  {
    name: "procedural_frog_throat_pulse",
    label: "Throat pulse (approx.)",
    duration: 1.6,
    loop: "repeat",
    rootMotion: false,
    about: "Chest-region bone-scale pulse — no gular bone exists, so this is an honest approximation.",
  },
  {
    name: "procedural_frog_look_left",
    label: "Look left",
    duration: 2.8,
    loop: "once",
    rootMotion: false,
    about: "Head-first curious turn (DEF-spine.005/.006), small body follow, and back.",
  },
  {
    name: "procedural_frog_look_right",
    label: "Look right",
    duration: 2.8,
    loop: "once",
    rootMotion: false,
    about: "Mirror of look left — a slow gaze scan to the right side.",
  },
  {
    name: "procedural_frog_look_around",
    label: "Look around",
    duration: 5.2,
    loop: "repeat",
    rootMotion: false,
    about: "Slow scan left → right with plateau pauses, gaze leading the body.",
  },
  {
    name: "procedural_frog_rest_sit",
    label: "Rest sit",
    duration: 4.2,
    loop: "repeat",
    rootMotion: false,
    about: "Settled lower pose, limbs tucked a touch, deep slow breathing.",
  },
  {
    name: "procedural_frog_sleep_pose",
    label: "Sleep pose (rest fallback)",
    duration: 6,
    loop: "repeat",
    rootMotion: false,
    about: "Very low, very slow rest — the rig has no eyelids, so eyes stay open (labeled fallback).",
  },
  {
    name: "procedural_frog_wake_up",
    label: "Wake up",
    duration: 2.2,
    loop: "once",
    rootMotion: false,
    about: "Rise from the sleep pose with a small head shake, ending at the alert idle.",
  },
  {
    name: "procedural_frog_small_hop",
    label: "Small hop",
    duration: 0.9,
    loop: "once",
    rootMotion: true,
    about: "Anticipation squat → short forward arc (~1.4 body lengths) → clean landing squash, no float.",
  },
  {
    name: "procedural_frog_medium_hop",
    label: "Medium hop",
    duration: 1.05,
    loop: "once",
    rootMotion: true,
    about: "Stronger controlled hop (~2.6 body lengths); leg fold kept small (toe-fan parenting cap).",
  },
  {
    name: "procedural_frog_turn_left",
    label: "Turn left",
    duration: 1.1,
    loop: "once",
    rootMotion: true,
    about: "In-place ~50° body turn with two little shuffle bobs, head leading.",
  },
  {
    name: "procedural_frog_turn_right",
    label: "Turn right",
    duration: 1.1,
    loop: "once",
    rootMotion: true,
    about: "Mirror of turn left — an in-place ~50° turn to the right.",
  },
  {
    name: "procedural_frog_spot_prey",
    label: "Spot prey",
    duration: 1.4,
    loop: "once",
    rootMotion: false,
    about: "Snap-freeze: head locks toward the target, body leans in, then holds motionless (clamps).",
  },
  {
    name: "procedural_frog_startled_jump",
    label: "Startled jump",
    duration: 1,
    loop: "once",
    rootMotion: true,
    about: "Instant crouch → fast hop backward-aside → lands low and alert.",
  },
  {
    name: "procedural_frog_hide_crouch",
    label: "Hide crouch",
    duration: 4,
    loop: "repeat",
    rootMotion: false,
    about: "Body pressed low and small, quick shallow breathing, nervous micro-shifts.",
  },
  {
    name: "procedural_frog_stress_crouch",
    label: "Stress crouch",
    duration: 3.2,
    loop: "repeat",
    rootMotion: false,
    about: "Tight watchful crouch with faster breathing and an occasional flinch.",
  },
  {
    name: "procedural_frog_weak_sick_idle",
    label: "Weak / sick idle",
    duration: 6,
    loop: "repeat",
    rootMotion: false,
    about: "Low energy: drooped head, slight unsteady sway, slow shallow breaths — nothing dramatic.",
  },
  {
    name: "procedural_frog_collapsed_faint",
    label: "Collapsed / faint",
    duration: 6,
    loop: "once",
    rootMotion: false,
    about: "Gentle non-graphic sink to a belly-flat sprawl, then barely-visible breathing (clamps).",
  },
  {
    name: "procedural_frog_water_float",
    label: "Water float",
    duration: 4.8,
    loop: "repeat",
    rootMotion: false,
    about: "Level, gentle bobbing with limbs eased outward — no fish-like motion.",
  },
  {
    name: "procedural_frog_water_paddle_basic",
    label: "Water paddle (basic)",
    duration: 2.4,
    loop: "repeat",
    rootMotion: false,
    about: "Float plus a soft rhythmic hind-leg kick and small arm sculls.",
  },
  {
    name: "procedural_frog_water_struggle_basic",
    label: "Water struggle (basic)",
    duration: 1.5,
    loop: "repeat",
    rootMotion: false,
    about: "Faster, weaker paddling with the nose held high — reads “needs help”, never graphic.",
  },
  {
    name: "procedural_frog_poop_trigger",
    label: "Poop trigger",
    duration: 2.6,
    loop: "once",
    rootMotion: false,
    about: "Pause, rear dip + tiny tail-area twitch, settle. Waste spawning stays game logic (event marker).",
  },
];

/** Timing markers inside procedural clips that game logic listens for
 *  (seconds from clip start). The waste OBJECT is spawned by the habitat —
 *  never baked into the frog model. */
export const FROG_CLIP_EVENTS: Readonly<Record<string, { wasteSpawnAt: number }>> = {
  procedural_frog_poop_trigger: { wasteSpawnAt: 1.35 },
};

/** Honest rig-capability notes (shown in the Frog Animation Lab). */
export const FROG_RIG_SUPPORT: readonly string[] = [
  "One seamless skinned mesh (9,765 tris) — no morph targets / shape keys.",
  "83 weighted bones: 7-link spine (pelvis → head), full Rigify limbs + fingers, 24 hind toe-fan bones.",
  "Head = DEF-spine.005/.006 (the named head/neck joints carry no skin weights).",
  "No eyelid bones → blink is impossible without a rig update (never faked).",
  "No jaw / tongue → tongue-catch, bite and chew need Fiverr rig + clips.",
  "No gular throat bone → throat pulse is a chest-scale approximation.",
  "Hind toe fans are parented to the body, not the feet → leg extension is kept small to avoid mesh tearing.",
  "One baked GLB clip ships today: \"Animation\" (2.5 s breathing idle).",
];

const spec = (name: string): FrogStateMapping["fallback"] => name;

export const FROG_ANIMATION_MAP: Readonly<Record<FrogBehaviorState, FrogStateMapping>> = {
  idle_breathing: {
    preferred: ["frog_idle_breathing", "Idle", "Animation"],
    fallback: spec("procedural_frog_idle_breathing"),
    requiredForRelease: true,
    note: "The baked GLB idle covers this today; the procedural twin exists as insurance.",
  },
  idle_variation: {
    preferred: ["frog_idle_variation"],
    fallback: spec("procedural_frog_idle_variation"),
    requiredForRelease: false,
    note: "Procedural weight-shift variation; a hand-keyed one would add charm.",
  },
  throat_pulse: {
    preferred: ["frog_throat_pulse"],
    fallback: spec("procedural_frog_throat_pulse"),
    requiredForRelease: false,
    note: "Approximation only — a real gular pulse needs a throat bone.",
  },
  blink: {
    preferred: ["frog_blink"],
    fallback: null,
    requiredForRelease: false,
    note: "IMPOSSIBLE on this rig: no eyelid bones, no shape keys. Needs animator/rig update.",
  },
  look_left: {
    preferred: ["frog_look_left"],
    fallback: spec("procedural_frog_look_left"),
    requiredForRelease: false,
    note: "Head rides the spine tip — subtle by design.",
  },
  look_right: {
    preferred: ["frog_look_right"],
    fallback: spec("procedural_frog_look_right"),
    requiredForRelease: false,
    note: "Head rides the spine tip — subtle by design.",
  },
  look_around: {
    preferred: ["frog_look_around"],
    fallback: spec("procedural_frog_look_around"),
    requiredForRelease: true,
    note: "The frog's signature sit-and-watch behavior.",
  },
  rest_sit: {
    preferred: ["frog_rest_sit"],
    fallback: spec("procedural_frog_rest_sit"),
    requiredForRelease: true,
    note: "Calm settled pose with deep breathing.",
  },
  sleep: {
    preferred: ["frog_sleep"],
    fallback: spec("procedural_frog_sleep_pose"),
    requiredForRelease: false,
    note: "Eyes cannot close (no eyelids) — shipped as a clearly-labeled low rest pose.",
  },
  wake_up: {
    preferred: ["frog_wake_up"],
    fallback: spec("procedural_frog_wake_up"),
    requiredForRelease: false,
    note: "Rise + head shake out of the sleep pose.",
  },
  small_hop: {
    preferred: ["frog_small_hop"],
    fallback: spec("procedural_frog_small_hop"),
    requiredForRelease: true,
    note: "Root-motion clip; the paludarium's live hops stay controller-driven.",
  },
  medium_hop: {
    preferred: ["frog_medium_hop"],
    fallback: spec("procedural_frog_medium_hop"),
    requiredForRelease: true,
    note: "Root-motion clip; leg fold capped by the toe-fan parenting.",
  },
  big_jump: {
    preferred: ["frog_big_jump"],
    fallback: null,
    requiredForRelease: false,
    note: "Full leg extension tears the hind toe fans (body-parented) — needs Fiverr rig fix + clip.",
  },
  landing: {
    preferred: ["frog_landing"],
    fallback: null,
    requiredForRelease: false,
    note: "Hop clips include a basic landing squash; a dedicated quality landing is a Fiverr clip.",
  },
  turn_left: {
    preferred: ["frog_turn_left"],
    fallback: spec("procedural_frog_turn_left"),
    requiredForRelease: true,
    note: "Usable for pathing (root yaw with shuffle bobs).",
  },
  turn_right: {
    preferred: ["frog_turn_right"],
    fallback: spec("procedural_frog_turn_right"),
    requiredForRelease: true,
    note: "Usable for pathing (root yaw with shuffle bobs).",
  },
  slow_crawl: {
    preferred: ["frog_slow_crawl"],
    fallback: null,
    requiredForRelease: false,
    note: "Coordinated limb stepping needs hand animation — procedural legs would read broken.",
  },
  climb_up: {
    preferred: ["frog_climb_up"],
    fallback: null,
    requiredForRelease: false,
    note: "Climbing with gripping toes needs Fiverr animation (and ideally the toe-fan rig fix).",
  },
  climb_down: {
    preferred: ["frog_climb_down"],
    fallback: null,
    requiredForRelease: false,
    note: "Same rig limits as climb up.",
  },
  perch_idle: {
    preferred: ["frog_perch_idle"],
    fallback: spec("procedural_frog_rest_sit"),
    requiredForRelease: false,
    note: "Reuses the rest-sit fallback on a perch; a dedicated perch pose is a nice-to-have clip.",
  },
  spot_prey: {
    preferred: ["frog_spot_prey"],
    fallback: spec("procedural_frog_spot_prey"),
    requiredForRelease: true,
    note: "The freeze-and-lock alert before a strike; the strike itself needs the tongue rig.",
  },
  tongue_catch: {
    preferred: ["frog_tongue_catch"],
    fallback: null,
    requiredForRelease: true,
    note: "IMPOSSIBLE on this rig: no tongue or jaw. Top-priority Fiverr rig + clip.",
  },
  bite: {
    preferred: ["frog_bite"],
    fallback: null,
    requiredForRelease: false,
    note: "No jaw bone — needs the mouth rig update.",
  },
  chew_swallow: {
    preferred: ["frog_chew_swallow"],
    fallback: null,
    requiredForRelease: true,
    note: "No jaw/throat bones — needs the mouth rig update (pairs with tongue catch).",
  },
  missed_tongue: {
    preferred: ["frog_missed_tongue"],
    fallback: null,
    requiredForRelease: false,
    note: "Needs the tongue rig; game logic can reuse spot-prey + a hop meanwhile.",
  },
  water_paddle: {
    preferred: ["frog_water_paddle"],
    fallback: spec("procedural_frog_water_paddle_basic"),
    requiredForRelease: false,
    note: "Basic procedural paddle ships; a hand-keyed kick cycle is a Fiverr upgrade.",
  },
  water_float: {
    preferred: ["frog_water_float"],
    fallback: spec("procedural_frog_water_float"),
    requiredForRelease: true,
    note: "The Emerald Hollow pond soak uses this.",
  },
  climb_out_water: {
    preferred: ["frog_climb_out_water"],
    fallback: null,
    requiredForRelease: false,
    note: "Pull-out over a rim needs hand animation.",
  },
  water_struggle: {
    preferred: ["frog_water_struggle"],
    fallback: spec("procedural_frog_water_struggle_basic"),
    requiredForRelease: false,
    note: "Deliberately gentle 'needs help' signal — cozy-game safe.",
  },
  startled_jump: {
    preferred: ["frog_startled_jump"],
    fallback: spec("procedural_frog_startled_jump"),
    requiredForRelease: true,
    note: "Root-motion escape hop; the live habitat flee stays controller-driven.",
  },
  hide_crouch: {
    preferred: ["frog_hide_crouch"],
    fallback: spec("procedural_frog_hide_crouch"),
    requiredForRelease: true,
    note: "Bad humidity / exposed-space stress reads through this.",
  },
  stress_crouch: {
    preferred: ["frog_stress_crouch"],
    fallback: spec("procedural_frog_stress_crouch"),
    requiredForRelease: true,
    note: "Tighter, faster-breathing sibling of hide crouch.",
  },
  weak_sick_idle: {
    preferred: ["frog_weak_sick_idle"],
    fallback: spec("procedural_frog_weak_sick_idle"),
    requiredForRelease: true,
    note: "Low-energy health signal, deliberately understated.",
  },
  collapsed_faint: {
    preferred: ["frog_collapsed_faint"],
    fallback: spec("procedural_frog_collapsed_faint"),
    requiredForRelease: false,
    note: "Procedural sink is safe + non-graphic; a hand-keyed version would land softer.",
  },
  poop: {
    preferred: ["frog_poop"],
    fallback: spec("procedural_frog_poop_trigger"),
    requiredForRelease: true,
    note: "Clip only signals timing (FROG_CLIP_EVENTS) — the waste object is spawned by game logic.",
  },
};

export const FROG_BEHAVIOR_STATES = Object.keys(FROG_ANIMATION_MAP) as FrogBehaviorState[];

export interface FrogResolvedState {
  state: FrogBehaviorState;
  source: FrogClipSource;
  /** The clip name to play (null when missing). */
  clip: string | null;
  mapping: FrogStateMapping;
}

/** Resolve every behavior state against what actually exists: real GLB clips
 *  first, procedural fallbacks second, loud "missing" otherwise. */
export function resolveFrogAnimations(
  glbClipNames: readonly string[],
  proceduralClipNames: readonly string[],
): FrogResolvedState[] {
  const glb = new Set(glbClipNames);
  const proc = new Set(proceduralClipNames);
  return FROG_BEHAVIOR_STATES.map((state) => {
    const mapping = FROG_ANIMATION_MAP[state];
    const real = mapping.preferred.find((n) => glb.has(n));
    if (real) return { state, source: "glb" as const, clip: real, mapping };
    if (mapping.fallback && proc.has(mapping.fallback)) {
      return { state, source: "procedural" as const, clip: mapping.fallback, mapping };
    }
    return { state, source: "missing" as const, clip: null, mapping };
  });
}

/** Human-readable report (the Lab's "copy report" + the Fiverr brief). */
export function frogAnimationReport(
  glbClipNames: readonly string[],
  proceduralClipNames: readonly string[],
): string {
  const resolved = resolveFrogAnimations(glbClipNames, proceduralClipNames);
  const by = (s: FrogClipSource): FrogResolvedState[] => resolved.filter((r) => r.source === s);
  const lines: string[] = [];
  lines.push("FROG ANIMATION REPORT — colorful_frog (Agalychnis callidryas)");
  lines.push(`GLB clips shipped: ${glbClipNames.length ? glbClipNames.join(", ") : "none"}`);
  lines.push("");
  lines.push(`── Real GLB clip (${by("glb").length}):`);
  for (const r of by("glb")) lines.push(`  • ${r.state} → "${r.clip}"`);
  lines.push("");
  lines.push(`── Procedural fallback (${by("procedural").length}):`);
  for (const r of by("procedural")) lines.push(`  • ${r.state} → ${r.clip}`);
  lines.push("");
  lines.push(`── Missing — needs Fiverr animation (${by("missing").length}):`);
  for (const r of by("missing")) {
    lines.push(`  • ${r.state}${r.mapping.requiredForRelease ? " [REQUIRED FOR RELEASE]" : ""} — ${r.mapping.note}`);
  }
  lines.push("");
  lines.push("Rig support:");
  for (const s of FROG_RIG_SUPPORT) lines.push(`  - ${s}`);
  return lines.join("\n");
}

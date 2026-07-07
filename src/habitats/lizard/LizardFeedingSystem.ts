/**
 * Leopard-gecko feeding prototype — pure logic (positions only; the renderer
 * draws the crickets + the eat animation). Flow: Feed → spawn 1–3 feeder insects
 * in the feeding zone → feeders wander a little → (movement controller hunts the
 * nearest) → gecko eats → hunger improves + event logged. Includes a feed
 * cooldown and feeder lifespan so uneaten crickets eventually wander off.
 */
import type {
  FeederKind,
  FeederState,
  FeedMethodKind,
  HabitatAnimal,
  HabitatState,
  PlacedObject,
  SupplementKind,
} from "../HabitatTypes";
import { CollisionWorld } from "../HabitatCollision";
import { containsXZ, type Rng } from "../HabitatBounds";
import { logHabitatEvent } from "../HabitatState";
import { FOOD_TYPES, applyMeal, moistureFromMeal } from "./LizardNutrition";
import { addMealToDigestion } from "./LizardDigestion";
import { pushInsectsOut, separateInsects, tickInsect } from "./InsectBehavior";

// The full nutrition table + profile type live in LizardNutrition (data + meal
// math together); re-exported here so existing imports keep working.
export { FOOD_TYPES, type FoodProfile } from "./LizardNutrition";

/** A gecko at/above this hunger is FULL — it will not hunt or eat. */
export const FULL_HUNGER = 90;

export function wantsToEat(animal: HabitatAnimal): boolean {
  return animal.needs.hunger < FULL_HUNGER;
}

/** Max insects LOOSE at once (dish-contained ones don't count — they're penned). */
export const MAX_LIVE_FEEDERS = 14;

// ── Dish feeding (capacity + containment) ─────────────────────────────────────
/** How many insects fit in a dish of interior radius r — scales with real area. */
export function dishCapacity(innerRadius: number): number {
  return Math.max(2, Math.min(24, Math.round(10 * (innerRadius / 0.08) ** 2)));
}

/** A dish's interior (bowl) circle in world space, following its live scale. */
export function dishInterior(o: PlacedObject): { x: number; z: number; r: number } {
  const sxz = Math.max(Math.abs(o.scale[0]), Math.abs(o.scale[2]));
  const base = o.assetFootprint
    ? Math.max(o.assetFootprint.half[0], o.assetFootprint.half[2])
    : (o.collision?.radius ?? 0.1);
  return { x: o.position[0], z: o.position[2], r: Math.max(0.03, base * sxz * 0.72) };
}

/** The bowl-surface height insects in a dish sit on — the dish's MEASURED mesh
 *  top at that point. climbHeightAt is wrong here: dishes are HARD (the no-step
 *  rule), and hard volumes never contribute standing height, so it returned the
 *  sand and insects sat sunk through the bowl bottom. */
function dishSurfaceY(world: CollisionWorld, dish: PlacedObject, x: number, z: number): number {
  return world.propSurfaceYAt(x, z, dish.id);
}

/** The FOOD dish (never the water/humidity dish) in a layout, or null. Matches
 *  by catalog identity first, then by name, then any non-water non-humid dish. */
export function findFoodDish(layout: HabitatState["layout"]): PlacedObject | null {
  const dishes = layout.objects.filter((o) => o.category === "dish");
  const notFood = (o: PlacedObject): boolean =>
    o.defId === "dish_water" || o.defId === "dish_humid" || /water|humid/i.test(o.id) || /water|humid/i.test(o.label ?? "");
  return (
    dishes.find((o) => o.defId === "dish_food") ??
    dishes.find((o) => /food|feed/i.test(o.id) || /food|feed/i.test(o.label ?? "")) ??
    dishes.find((o) => !notFood(o)) ??
    null
  );
}

/** Record a serving in the Track-Intake log (newest last, capped at 40). */
export function logFeeding(
  state: HabitatState,
  kind: FeederKind,
  count: number,
  method: FeedMethodKind,
  supplement: SupplementKind,
): void {
  state.feedingLog ??= [];
  state.feedingLog.push({ t: state.elapsed, kind, count, method, supplement });
  if (state.feedingLog.length > 40) state.feedingLog.splice(0, state.feedingLog.length - 40);
}

/** "cricket" ×3 → "crickets"; "dubia roach" → "dubia roaches". */
function pluralize(label: string, n: number): string {
  if (n === 1) return label;
  if (/(ch|sh|x|z|s)$/i.test(label)) return `${label}es`;
  return `${label}s`;
}

export interface ServeResult {
  placed: number;
  /** Honest refusal / partial-placement reason, or null when all placed. */
  reason: string | null;
}

/**
 * Serve a portion by any feeding method. `dish` servings are CONTAINED inside
 * the bowl (capped at the dish's real capacity); the rest scatter free insects
 * near `at` (quick toss) / exactly at `at` (hand + tong release points),
 * respecting the loose cap. Every insect carries its supplement dusting.
 */
export function serveMeal(
  state: HabitatState,
  world: CollisionWorld,
  kind: FeederKind,
  count: number,
  method: FeedMethodKind,
  supplement: SupplementKind,
  opts: {
    at?: { x: number; z: number };
    dish?: PlacedObject;
    reach?: ReachTest;
    rng?: Rng;
    /** Set false when the caller logs the whole session once (tong offers). */
    log?: boolean;
    /** Skip the event-feed line too (presentation spawns one insect at a time). */
    quiet?: boolean;
    /** Spawn HELD (pinched in tongs / on the palm) — stays put until released. */
    held?: boolean;
    /** Place exactly at `at` with no scatter (tong tip / palm spots). */
    exact?: boolean;
  } = {},
): ServeResult {
  const rng = opts.rng ?? Math.random;
  const food = FOOD_TYPES[kind] ?? FOOD_TYPES.cricket;
  let placed = 0;
  let reason: string | null = null;

  if (method === "dish") {
    const dish = opts.dish;
    if (!dish) return { placed: 0, reason: "No food dish placed — add one or use another method" };
    const din = dishInterior(dish);
    const cap = dishCapacity(din.r);
    const already = state.feeders.filter((f) => f.alive && f.containedBy === dish.id).length;
    const n = Math.min(count, Math.max(0, cap - already));
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng()) * din.r * 0.8;
      const x = din.x + Math.cos(a) * rr;
      const z = din.z + Math.sin(a) * rr;
      state.feeders.push({
        id: state.nextFeederId++,
        kind,
        position: [x, dishSurfaceY(world, dish, x, z), z],
        alive: true,
        age: 0,
        dusted: supplement,
        containedBy: dish.id,
        heading: rng() * Math.PI * 2,
        energy: 1,
        mood: "calm",
        moodT: 0,
      });
      placed++;
    }
    if (placed < count) {
      reason =
        placed === 0
          ? `The dish is already full (holds ${cap})`
          : `The dish is full — only ${placed} of ${count} fit (holds ${cap})`;
    }
  } else {
    const loose = state.feeders.filter((f) => f.alive && !f.containedBy).length;
    const n = Math.min(count, Math.max(0, MAX_LIVE_FEEDERS - loose));
    const zone = state.layout.zones.find((z) => z.kind === "feeding");
    const cx = opts.at?.x ?? zone?.center[0] ?? 0;
    const cz = opts.at?.z ?? zone?.center[2] ?? 0;
    for (let i = 0; i < n; i++) {
      const p = opts.exact ? { x: cx, z: cz } : scatterPoint(world, cx, cz, i, rng, opts.reach);
      if (!p) continue;
      state.feeders.push({
        id: state.nextFeederId++,
        kind,
        position: [p.x, world.groundHeightAt(p.x, p.z), p.z],
        alive: true,
        age: 0,
        dusted: supplement,
        held: opts.held || undefined,
        heading: rng() * Math.PI * 2,
        energy: 1,
        mood: "calm",
        moodT: 0,
      });
      placed++;
    }
    if (placed < count) {
      reason =
        n <= 0
          ? "Too many insects loose already — let the gecko catch up"
          : placed === 0
            ? "Couldn't find a clear spot there"
            : `Only ${placed} of ${count} fit — too many insects loose`;
    }
  }

  if (placed > 0) {
    if (opts.log !== false) logFeeding(state, kind, placed, method, supplement);
    if (!opts.quiet) {
      const phrase =
        method === "dish" ? " in the dish" : method === "tong" ? " from the tongs" : method === "hand" ? " by hand" : "";
      logHabitatEvent(state, `Served ${placed} ${pluralize(food.label.toLowerCase(), placed)}${phrase}.`, "info");
    }
  }
  return { placed, reason };
}

/** A free, reachable spot near (cx, cz) — jittered ring so servings don't stack. */
function scatterPoint(
  world: CollisionWorld,
  cx: number,
  cz: number,
  i: number,
  rng: Rng,
  reach?: ReachTest,
): { x: number; z: number } | null {
  for (let k = 0; k < 10; k++) {
    const a = rng() * Math.PI * 2;
    const rr = 0.04 + i * 0.03 + rng() * 0.08 + k * 0.02;
    const x = cx + Math.cos(a) * rr;
    const z = cz + Math.sin(a) * rr;
    if (!containsXZ(world.bounds, x, z, 0.04)) continue;
    if (!world.isFree(x, z, 0.03)) continue;
    if (reach && !reach(x, z)) continue;
    return { x, z };
  }
  return world.randomFreeTarget(0.03, rng);
}

/**
 * Drop ONE insect of `kind` exactly where the player pointed (drag-drop feeding
 * mode). Returns the human-readable reason the drop is invalid, or null when the
 * insect was placed. Same spirit as decor placement: in bounds, not inside a hard
 * object, not on the gecko, not a swarm.
 */
export function placeFeederAt(
  state: HabitatState,
  world: CollisionWorld,
  kind: FeederKind,
  x: number,
  z: number,
  opts: { gecko?: { x: number; z: number }; reach?: ReachTest; cfg?: FeedingConfig } = {},
): string | null {
  const cfg = opts.cfg ?? LIZARD_FEEDING;
  if (!containsXZ(world.bounds, x, z, cfg.bodyRadius)) return "Outside the enclosure";
  if (world.isBlocked(x, z, cfg.bodyRadius)) return "Inside a solid object";
  if (world.tooSteepAt(x, z)) return "That slope is too steep for the gecko";
  if (opts.gecko && Math.hypot(x - opts.gecko.x, z - opts.gecko.z) < 0.22) return "Too close to the gecko";
  if (state.feeders.filter((f) => f.alive && !f.containedBy).length >= MAX_LIVE_FEEDERS)
    return "Too many insects loose already";
  if (opts.reach && !opts.reach(x, z)) return "The gecko can't reach that spot";
  state.feeders.push({
    id: state.nextFeederId++,
    kind,
    position: [x, world.groundHeightAt(x, z), z],
    alive: true,
    age: 0,
  });
  logHabitatEvent(state, `Dropped a ${FOOD_TYPES[kind].label.toLowerCase()} into the terrarium.`, "info");
  return null;
}

export interface FeedingConfig {
  cooldown: number; // seconds between Feed presses
  perFeed: [number, number]; // min/max feeders spawned per press
  feederLifespan: number; // seconds before an uneaten feeder despawns
  feederSpeed: number; // wander speed (m/s)
  hungerPerFeeder: number;
  bodyRadius: number; // feeder collision radius
}

export const LIZARD_FEEDING: FeedingConfig = {
  cooldown: 6,
  perFeed: [1, 3],
  feederLifespan: 45,
  feederSpeed: 0.06,
  hungerPerFeeder: 20,
  bodyRadius: 0.03,
};

export function canFeed(state: HabitatState): boolean {
  return state.feedCooldown <= 0;
}

/** Predicate: is a candidate spawn point reachable by the gecko? (Backed by the
 *  movement brain's nav graph; optional so the feeding logic stays pure.) */
export type ReachTest = (x: number, z: number) => boolean;

/** Spawn feeders inside the feeding zone (or anywhere free), PREFERRING spots the
 *  gecko can actually reach when a reachability test is supplied. Returns the count
 *  spawned; sets the cooldown + logs. No-op if still cooling down. */
export function spawnFeeders(
  state: HabitatState,
  world: CollisionWorld,
  rng: Rng = Math.random,
  cfg: FeedingConfig = LIZARD_FEEDING,
  reach?: ReachTest,
): number {
  if (!canFeed(state)) return 0;
  const zone = state.layout.zones.find((z) => z.kind === "feeding");
  const [lo, hi] = cfg.perFeed;
  const n = lo + Math.floor(rng() * (hi - lo + 1));
  let spawned = 0;
  for (let i = 0; i < n; i++) {
    const p = feederSpawnPoint(world, zone, rng, cfg.bodyRadius, reach);
    if (!p) continue;
    state.feeders.push({
      id: state.nextFeederId++,
      kind: "cricket",
      position: [p.x, world.groundHeightAt(p.x, p.z), p.z],
      alive: true,
      age: 0,
    });
    spawned++;
  }
  if (spawned > 0) {
    state.feedCooldown = cfg.cooldown;
    logHabitatEvent(state, `Released ${spawned} cricket${spawned > 1 ? "s" : ""} into the terrarium.`, "info");
  }
  return spawned;
}

function feederSpawnPoint(
  world: CollisionWorld,
  zone: { center: [number, number, number]; radius: number } | undefined,
  rng: Rng,
  radius: number,
  reach?: ReachTest,
): { x: number; z: number } | null {
  // First pass: insist on a FREE + REACHABLE point (so food isn't sealed behind a
  // blocked object). Second pass: settle for any free point. Last resort: any target.
  const passes = reach ? [true, false] : [false];
  for (const wantReach of passes) {
    for (let i = 0; i < 24; i++) {
      let x: number;
      let z: number;
      if (zone) {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * zone.radius;
        x = zone.center[0] + Math.cos(a) * r;
        z = zone.center[2] + Math.sin(a) * r;
      } else {
        const p = world.randomFreeTarget(radius, rng);
        if (!p) continue;
        x = p.x;
        z = p.z;
      }
      if (!world.isFree(x, z, radius)) continue;
      if (wantReach && reach && !reach(x, z)) continue;
      return { x, z };
    }
  }
  return world.randomFreeTarget(radius, rng);
}

export interface FeederTickOpts {
  rng?: Rng;
  /** The gecko's floor position — prey flees it; looming panics dish jumpers. */
  gecko?: { x: number; z: number };
  /** The gecko's body circles (snout → tail) — insects get pushed out of them
   *  so it never stands ON one. */
  geckoCircles?: { x: number; z: number; r: number }[];
}

/** Advance feeder behaviour + age. Free insects wander/flee on the (sculpted)
 *  sand; DISH-CONTAINED ones mill inside the bowl (smooth stone walls — worms
 *  and roaches can't leave), except crickets, which occasionally JUMP out —
 *  much sooner when the gecko looms. Loose feeders past their lifespan burrow
 *  away; contained ones keep (they're penned in a dish). */
export function updateFeeders(
  state: HabitatState,
  world: CollisionWorld,
  dt: number,
  _cfg: FeedingConfig = LIZARD_FEEDING,
  opts: FeederTickOpts = {},
): void {
  const rng = opts.rng ?? Math.random;
  let despawned = 0;
  for (const f of state.feeders) {
    if (!f.alive) continue;
    f.age += dt;
    // HELD insects (pinched in tongs / on the palm / carried in the MOUTH)
    // don't behave at all — the presenter/eater owns their position.
    if (f.held) continue;
    const food = FOOD_TYPES[f.kind] ?? FOOD_TYPES.cricket;

    const dish = f.containedBy ? state.layout.objects.find((o) => o.id === f.containedBy) : undefined;
    if (f.containedBy && !dish) f.containedBy = undefined; // dish deleted → freed

    if (dish) {
      tickContained(state, world, f, dish, food, dt, rng, opts.gecko);
    } else {
      // Prey AI: calm wander / freeze / flee-with-wall-steering (InsectBehavior).
      tickInsect(f, world, food, dt, rng, opts.gecko);
      if (f.age > food.lifespan) {
        f.alive = false;
        despawned++;
      }
    }
  }

  // Insects collide: with each other, and with the gecko's body (pushed clear —
  // the gecko never walks THROUGH an insect, it shoulders them aside).
  const loose = state.feeders.filter((f) => f.alive && !f.containedBy);
  separateInsects(loose, world);
  if (opts.geckoCircles && opts.geckoCircles.length > 0) pushInsectsOut(loose, world, opts.geckoCircles);

  if (despawned > 0) {
    state.feeders = state.feeders.filter((f) => f.alive);
    logHabitatEvent(state, `${despawned} insect${despawned > 1 ? "s" : ""} burrowed away.`, "warn");
  }
}

/** One tick of an in-dish insect: mill inside the bowl; crickets may jump out. */
function tickContained(
  state: HabitatState,
  world: CollisionWorld,
  f: FeederState,
  dish: PlacedObject,
  food: (typeof FOOD_TYPES)[FeederKind],
  dt: number,
  rng: Rng,
  gecko?: { x: number; z: number },
): void {
  const din = dishInterior(dish);
  f.heading = (f.heading ?? 0) + Math.sin(f.id * 2.1 + f.age * 1.3) * 1.2 * dt;
  const sp = food.speed * 0.4;
  let nx = f.position[0] + Math.cos(f.heading) * sp * dt;
  let nz = f.position[2] + Math.sin(f.heading) * sp * dt;
  const dx = nx - din.x;
  const dz = nz - din.z;
  const d = Math.hypot(dx, dz);
  const maxR = din.r * 0.82;
  if (d > maxR) {
    // The smooth bowl wall — crawlers turn along it instead of climbing out.
    nx = din.x + (dx / d) * maxR;
    nz = din.z + (dz / d) * maxR;
    f.heading = (f.heading ?? 0) + Math.PI * (0.6 + rng() * 0.5);
  }
  f.position[0] = nx;
  f.position[2] = nz;
  f.position[1] = dishSurfaceY(world, dish, nx, nz);

  // Crickets are JUMPERS: rarely out on their own, quickly when the gecko looms.
  if (f.kind === "cricket" && f.age > 5) {
    const looming = gecko && Math.hypot(gecko.x - din.x, gecko.z - din.z) < 0.45;
    if (rng() < (looming ? 0.14 : 0.012) * dt) escapeDish(state, world, f, din, rng);
  }
}

/** A cricket springs out of the dish: land just past the rim, scared. */
function escapeDish(
  state: HabitatState,
  world: CollisionWorld,
  f: FeederState,
  din: { x: number; z: number; r: number },
  rng: Rng,
): void {
  for (let k = 0; k < 10; k++) {
    const a = rng() * Math.PI * 2;
    const rr = din.r + 0.08 + rng() * 0.06;
    const x = din.x + Math.cos(a) * rr;
    const z = din.z + Math.sin(a) * rr;
    if (!containsXZ(world.bounds, x, z, 0.03) || world.isBlocked(x, z, 0.02)) continue;
    f.containedBy = undefined;
    f.position[0] = x;
    f.position[2] = z;
    f.position[1] = world.groundHeightAt(x, z);
    f.mood = "flee";
    f.moodT = 1.6;
    f.heading = a;
    logHabitatEvent(state, "A cricket jumped out of the dish!", "info");
    return;
  }
}

/** Nearest live feeder to a point, or null. */
export function nearestFeeder(state: HabitatState, x: number, z: number): FeederState | null {
  let best: FeederState | null = null;
  let bestD = Infinity;
  for (const f of state.feeders) {
    if (!f.alive) continue;
    const d = Math.hypot(f.position[0] - x, f.position[2] - z);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

/** Resolve an eaten feeder: remove it and apply its FULL nutrition (satiety,
 *  calm, calcium incl. its dusting, body-condition fat, lingering moisture). */
export function consumeFeeder(
  state: HabitatState,
  feederId: number,
  animal: HabitatAnimal,
  _cfg: FeedingConfig = LIZARD_FEEDING,
): void {
  const idx = state.feeders.findIndex((f) => f.id === feederId);
  if (idx < 0) return;
  const f = state.feeders[idx];
  state.feeders.splice(idx, 1);
  const food = FOOD_TYPES[f.kind] ?? FOOD_TYPES.cricket;
  applyMeal(animal, f.kind in FOOD_TYPES ? f.kind : "cricket", f.dusted ?? "none");
  // What goes in must come out: meals fill the digest store (LizardDigestion).
  addMealToDigestion(animal, food.satiety);
  // Juicy prey supports hydration for a while after the meal (decays in needs).
  state.foodMoisture = Math.min(10, (state.foodMoisture ?? 0) + moistureFromMeal(f.kind in FOOD_TYPES ? f.kind : "cricket"));
  // A successful hunt is ENRICHMENT: catching live prey settles the animal a
  // little (staple insects more than lazy fatty treats).
  animal.needs.stress = Math.max(0, animal.needs.stress - (food.role === "treat" ? 1 : 2.5));
  logHabitatEvent(state, `${animal.name} ate a ${food.label.toLowerCase()}.`, "good");
  if (food.role === "treat") {
    logHabitatEvent(state, `${food.label}s are a fatty treat — don't make them a staple.`, "warn");
  }
}

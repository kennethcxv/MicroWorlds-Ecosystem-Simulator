# LIZARD HABITAT PROTOTYPE — GLASSWATER

_Last updated: 2026-07-01_

The experimental **3D Lizard** habitat: a reusable, data-driven, saveable habitat
foundation with collision, **smart navigation**, a placeholder/real-rig animal
controller, a feeding prototype, a needs system, and a HUD — everything the
freelancer's rigged leopard gecko drops straight into. Built while the final rig
is pending.

Open it: on-screen **3D Lizard** button, or `?habitat=lizard`. Collision debug:
`?habitat=lizard&debugCollision=1` or press **C**. Foot/normal/terrain overlays:
the **🐾 Debug ▾** menu in the action bar.

## What's new in the "vivarium shell" pass (v6, 2026-07-01)

- **`EnclosureSpec` — the single source of truth** (`src/habitats/EnclosureSpec.ts`,
  pure + unit-tested): ONE derivation from `HabitatDimensions` produces the
  interior, **THE walk/placement/feeding rectangle** (navigation = decor placement
  = food drops, identical by construction; the old 0.9×/0.98 HUD-framing inset is
  gone — the gecko now roams to the visible glass), frame + base-tray sizing, the
  terrain brush's glass apron, bedrock, camera target/home, stand and lamp mount.
  Nothing else hard-codes a tank size.
- **New shell** (`ThreeVivariumShell.ts`, built entirely FROM the spec): glass
  panes in a dark frame (posts + slim top band + subtle screen top), an opaque
  **base tray** whose lip rises just past the substrate line (the bed's cut side
  never shows; sculpted dunes stay visible through the glass), a **desert back
  panel** inside the rear glass (no more busy see-through; pools the lamp glow),
  the **basking lamp clamped ON the screen** over the basking zone (hood + bulb +
  fixture glow + drooping power cable), a UVB tube + gauge discs, a **bedrock
  floor + sand skirt** (dug holes read as sand — never a hollow box), and a
  **wooden stand** (the real `aquarium.glb` cabinet; walnut plinth fallback) +
  soft floor shadow. The tank finally sits IN the room instead of floating.
- **Save migration** (`HabitatMigrate.ts`): loaded layouts snap stale dimensions
  back to the current catalog record and clamp out-of-bounds objects / zones /
  equipment inside (never deleted; idempotent). The camera comes from the spec,
  not the persisted record.
- **Feeding at the glass** — new snout-slack reach: food within the body-radius
  band along the panes is pathed to the nearest standable point and eaten (live-
  proven with two glass-hugging crickets).
- **Dirt de-checkered** — organic jittered blotches instead of grid-aligned
  ellipses, and the ambient film retuned 0.0016 → 0.00008 /s (the floor used to
  saturate to full filth in ~10 minutes, which is what rendered as a checkerboard;
  a cleaned tank now stays presentable for a session). Sand texture tiling
  widened 0.6 → 1.05 m with softer patches (no visible repeats).

Screenshots: `screenshots/vivarium_shell/` (before/after).

## What's new in the "surface-aware grounding" pass (v5, 2026-07-01)

- **Four FOOT CONTACTS** (pure `GeckoFeet.ts` FootPlanner): a distance-driven
  diagonal trot; planted feet world-locked EXACTLY on the sampled surface (no
  float / sink / slide — live worst gap 0.0000 m), stepping feet arc and land on
  the surface, idle feet settle home. The placeholder's legs aim at the live
  contacts so the feet visibly touch dunes, rocks, and wood; the same contacts
  will drive the final rig's foot bones.
- **Body pitch AND roll from the feet** — pitch = front-vs-rear contact heights,
  roll = left-vs-right (one foot on a rock + one on sand ⇒ a natural lean),
  eased + capped, applied yaw→pitch→roll.
- **`CollisionWorld.sampleSurfaceAt`** — height / normal / slope / surface type /
  object id / walkable / climbable / tooSteep / fallback in one query.
- **Terrain became physical** — the collision world samples the sculpted height
  map LIVE: walk height, foot contacts, navigation (bare slopes > ~40° are
  routed around), placement + feeding validation, feeder heights. **⚡ Strong
  brush** raises real dunes (~0.23 m) and digs below the default sand to a
  **bedrock limit** (never through the tank floor). Ground under props + a glass
  apron are brush-masked.
- **Anchored eco-center camera** — normal view = a ±43° yaw window + pitch band
  + pivot clamped inside the tank (dragging leans your head; the tank never
  spins), with a camera bar (Front/Left/Right/Top/Focus/Reset) and **📷 Photo
  Mode** for the free orbit. Decorate Mode auto-frees the camera. Fish + spider
  cameras unchanged.

Full details + verification numbers: **`HABITAT_EDITOR.md` §14**.

## What's new in the "Decorate Mode + mesh-footprint collision" pass (2026-07-01)

- **Decorate Mode editor** — the **Decorate** button opens a real, in-world editor
  (simplified Unity/Unreal style; full write-up + UI decision in
  **`HABITAT_EDITOR.md`**): a catalog of placeables, a three.js `TransformControls`
  move/rotate/scale **gizmo** on the selected prop, and an inspector. Place (click a
  card → click the sand, ghost preview + red/green validity), select, **move / rotate
  X·Y·Z / scale** (0.25–3× normal, 0.05–8× advanced/per-axis, cap 10×), **duplicate,
  delete, reset-transform, snap-to-floor, center, reset layout, undo/redo**, and
  change interaction type. **W/E/R** switch tools; Del/Ctrl+D/Ctrl+Z/Ctrl+Y as
  expected. Every edit rebuilds collision + navigation + habitat score live and
  saves. OrbitControls is gated off while dragging the gizmo.
- **Mesh-footprint (convex-hull) collision** — collision is now measured from the
  real GLB: a tight **2D convex hull** of the mesh's vertices projected to the floor
  (`AssetFootprint.hull`, ≤14 pts), so the collider **traces the visible silhouette**
  instead of a bounding box. Round props (dishes, boulder) use a tight circle; soft
  succulents don't hard-block. The hull follows position + **full X/Y/Z rotation** +
  per-axis scale (X/Z tilt uses a safe world-aligned superset — see limitations),
  and the walk-over height is the mesh's true top. Debug (**C**) traces the hull +
  a faint body-clearance offset, colour-coded by interaction.

## What's new in the "real assets + smart animal" pass (2026-07-01)

- **Real decor art** — the terrarium now builds from imported Tripo GLBs (rock
  cave hide, desert rock cluster/mound, driftwood, stone water + food dishes, two
  succulents) instead of raw primitives, on a **procedural warm-sand floor** (tiling
  texture + subtle dune displacement) with scattered stone chips, a warm basking
  glow, and soft **contact (blob) shadows**. Placeholders remain the instant, organic
  fallback if a GLB is missing.
- **Interaction types** — every object is tagged `wall | blocked | climbable |
  lowObstacle | hide | softObstacle | feederZone`, which drives whether the gecko
  routes around it, climbs over it, or steps over it.
- **Smart navigation** — the gecko no longer shoves into obstacles: it plans a
  route (straight, or **waypoints around** blocked objects), **climbs over**
  climbable driftwood / low rocks, detects when it's **stuck** (backs up, turns,
  replans), and **gives up** on genuinely unreachable food (temporarily flags it,
  idles, retries) — see §4.
- **Reachable feeding** — crickets prefer to spawn where the gecko can path to
  them; if one ends up unreachable the HUD warns and the gecko picks another.

---

## 1. Architecture (pure logic vs. rendering)

Simulation is separate from rendering (project rule). The habitat model + all
game logic are **pure TypeScript with no Three.js/DOM imports** and are
unit-tested; a thin Three.js bridge renders it.

```
src/habitats/                     ← PURE, framework-free, unit-tested
  HabitatTypes.ts        data model: type, dimensions, camera, substrate,
                         placed objects (+collision), equipment, zones, animals,
                         needs, feeders, scores, species care + compatibility
  HabitatBounds.ts       walk rectangle: derive / inset / contains / clamp
  HabitatCollision.ts    top-down collision solver (circle / OBB / capsule) +
                         interaction types + line-of-sight + climb-height query
  HabitatNavigation.ts   NavGraph — visibility-graph waypoint path planner
  HabitatStats.ts        habitat score from placed-object stat contributions
  HabitatLayout.ts       add/move/rotate/scale/remove objects; clone; walk bounds
  HabitatBuilder.ts      size presets + placeable catalog + capacity rules
  HabitatState.ts        runtime state factory + event log
  HabitatSaveLoad.ts     per-habitat localStorage (namespaced; fish tank untouched)
  HabitatSpecies.ts      CareProfiles (leopard/crested gecko, cricket, isopods, …)
  HabitatCompatibility.ts safe/caution/danger/food verdicts
  lizard/
    LizardHabitatData.ts     the authored "Sunstone Desert" terrarium layout
    GeckoMovementController.ts  collision-aware roam/hunt/eat brain (pure)
    LizardNeedsSystem.ts     hunger/stress/health rules
    LizardFeedingSystem.ts   spawn/hunt/eat crickets + cooldown + events
    LizardController.ts      HUD state + control interface (types only)

src/render/three/                 ← Three.js bridge
  ThreeLizardScene.ts       orchestrates everything; implements HabitatScene
  ThreeTerrarium.ts         enclosure + sand + placeholders; async-loads real decor GLBs
  ThreeSandTexture.ts       procedural sand texture + dune floor + pebbles + rock mesh
  ThreeContactShadow.ts     soft blob shadows (gecko follows; decor static)
  ThreeGeckoPlaceholder.ts  procedural gecko (body+head+4 legs+tail, animated)
  ThreeAnimalController.ts  drives placeholder OR rigged GLB from the brain (+climb lift)
  ThreeAnimationController.ts clip-alias mixer (idle/move/turn/eat/rest/stress)
  ThreeCollisionSystem.ts   colour-coded debug wireframes for the collision volumes
  ThreeFeederInsects.ts     cricket placeholder meshes + hop
  ThreeAssetLoader.ts       decor/rig/texture loaders (fault-tolerant, dev-safe)

src/ui/lizardHud.ts               ← self-contained HUD overlay (fish UI untouched)
```

## 2. Scene structure (the "Sunstone Desert" terrarium)

Authored in `LizardHabitatData.ts` (40-gallon-ish glass enclosure, sand):
- **Basking rock** (flat, back-left, under the lamp) + **boulder** (right).
- **Rock hide / cave** (front-left) + **humid hide** (mid-right).
- **Driftwood branch** across the middle (a capsule/log obstacle).
- **Water dish** (right) + **feeding dish** (front-centre).
- **Faux succulents** (non-collidable enrichment).
- **Equipment:** heat lamp (basking), UVB tube, thermometer, hygrometer.
- **Zones:** basking (warm, 31 °C), cool (24 °C), feeding (open front area).

The renderer builds the enclosure + sand instantly, shows an **organic placeholder**
per object (rocks are low-poly rocks, not raw boxes), then **async-loads the real
decor GLBs** (`public/assets/3d/habitats/lizard/decor/`) and swaps them in, uniform-
scaled to each object's collision footprint. A missing/failed GLB just keeps its
placeholder. Asset→object mapping (see `HabitatBuilder.LIZARD_PLACEABLES`):

| object            | GLB                          | interaction |
|-------------------|------------------------------|-------------|
| basking rock      | `desert_rock_cluster_01.glb` | climbable   |
| rock mound        | `desert_rock_cluster_01.glb` | blocked     |
| cave + humid hide | `rock_cave_hide_01.glb`      | hide        |
| driftwood         | `driftwood_branch_01.glb`    | climbable   |
| water dish        | `water_dish_stone_01.glb`    | blocked     |
| feeding dish      | `food_dish_stone_01.glb`     | lowObstacle |
| succulents ×3     | `succulent_01/02.glb`        | softObstacle|

The floor is a **procedural warm-sand texture** (tiling, `RepeatWrapping`) on a
gently height-displaced plane, with scattered stone chips. Dropping a real
`sand_substrate_01.png` into `public/assets/textures/habitats/lizard/` overrides it
automatically (see `ANIMAL_ASSET_PIPELINE.md`).

Habitat quality (`HabitatStats`) → **habitat score ~90 "Excellent"** for this
build, shown in the HUD alongside Hiding Spots / Climbing / Enrichment.

## 3. Object / collision system

The **single most important** system. Solved top-down on the XZ plane (the animal
is a circle of `bodyRadius`); each collidable object compiles to one practical
volume — **circle**, **oriented box (OBB)**, or **capsule/segment** (logs):

- Authored per object as `collidable` + `collisionType` (`box`/`sphere`/`capsule`/
  `meshApprox`/`none`) + optional `collision` sizing + an **`interaction`** type.
- **Interaction types** (route-around vs climb-over vs step-over):

  | interaction   | behaviour                              | used by |
  |---------------|----------------------------------------|---------|
  | `wall`        | hard boundary, never pass through      | glass (bounds) |
  | `blocked`     | route around, cannot climb             | rock mound, water dish |
  | `climbable`   | climb / walk over (raised + slowed)    | basking rock cluster, driftwood |
  | `lowObstacle` | step over slowly (low lip)             | food dish |
  | `hide`        | route around now; future *enter hide*  | rock caves |
  | `softObstacle`| avoid; minor overlap ok (no volume)    | succulents |
  | `feederZone`  | valid feeding area (not an obstacle)   | feeding zone |

  Omitted ⇒ derived from `category`. `climbable`/`lowObstacle` compile to
  **passable** volumes (kept out of the route-around set); everything else is a
  **hard** obstacle. `softObstacle` compiles to no volume (minor overlap ok).
- `CollisionWorld.resolve(from→to, radius)` clamps to the walls, then pushes the
  circle out of every penetrated **hard** volume over several relaxation passes.
  The tangential motion survives ⇒ the gecko **slides** along rocks/glass. Hard
  guarantee: it **never returns a position inside a hard obstacle or outside the
  bounds** — in a pinch it falls back to the last free spot and reports `blocked`.
- `losClear(a→b, radius)` — swept-circle line-of-sight against hard obstacles; the
  navigation planner uses it to decide "walk straight" vs "route via waypoints".
- `climbHeightAt(x,z,radius)` — the walkable surface height: the substrate, or the
  **top of a passable obstacle** the gecko is standing on, so it rides up and over
  climbable driftwood / low rocks (the controller lifts the model, capped + eased).
- `randomFreeTarget()` validates roam/feeder targets are inside bounds + clear.
- **Debug viz** (`ThreeCollisionSystem`, off by default) draws every volume +
  the walk rectangle as **colour-coded** wireframes: green = climbable, cyan =
  low, red = blocked, amber = hide.

Proven by `tests/collision.test.ts` + `tests/habitat.test.ts`: a gecko stepping
toward blocked targets for thousands of frames is **never** inside an obstacle or
out of bounds, against both synthetic layouts and the real terrarium.

## 4. Gecko movement + smart navigation

`GeckoMovementController` (pure) — a slow, deliberate, crepuscular crawl that
**routes, climbs, and gives up like a real animal** instead of shoving into things.

Behaviour phases: `Idle ▸ LookAround ▸ Roam ▸ Hunt (detect/plan/follow) ▸
ClimbObstacle ▸ Eat ▸ StuckRecovery ▸ GiveUpAndIdle`.

- **Path planning** (`HabitatNavigation.NavGraph`): a tiny **visibility graph** —
  candidate waypoints are sampled on a ring around each hard obstacle (inflated by
  the body radius + a clearance gap), kept if free + in-bounds, and pre-connected
  where they can "see" each other. `findPath(from, to)` returns a straight shot if
  line-of-sight is clear, else Dijkstra over {start, waypoints, target}. So the
  gecko **walks around** rocks/hides/dishes with 1–6 natural waypoints.
- **Climbing**: climbable/low obstacles aren't in the graph (not "hard"), so the
  planner routes **straight across** them; while crossing, the body **lifts** to
  the obstacle top (`climbHeightAt`, eased + capped ≈ 12 cm) and **slows** — reads
  as clambering over the driftwood / onto the basking rock.
- **Stuck detection**: it tracks net progress toward the target over a ~1.1 s
  window; too little progress ⇒ **StuckRecovery** (back up, turn, re-plan).
- **Give up**: after a few failed recoveries it **abandons** the target; for food
  it flags that cricket **temporarily unreachable**, idles/looks around, and
  retries when the flag expires — so it never grinds forever.
- **Forward-only steering** (turn-to-face then advance, eased — no sideways slide,
  no jitter); every step is collision-resolved; `startle()` = brief scuttle.

`ThreeAnimalController` applies the brain's position/heading + **climb lift** to
the model each frame and selects the animation (idle/move/eat), driving either the
procedural placeholder or — when present — the rigged GLB's clips.

When `?debugCollision=1` (or **C**) is on, the brain logs reroute / stuck /
unreachable decisions to the console (silent otherwise).

## 5. Feeding prototype

1. Press **Feed Insects** (HUD).
2. `LizardFeedingSystem.spawnFeeders` drops **1–3 crickets** in free spots inside
   the feeding zone; sets a cooldown; logs the event.
3. Crickets skitter (small wander, collision-aware) and hop (visual).
4. The gecko detects the **nearest** cricket, turns, and crawls to it.
5. In range → plays **eat** (or pauses if no eat clip); the cricket is consumed.
6. **Hunger rises**, a small stress relief applies, and the log reads
   "Leopard gecko ate a cricket." Uneaten crickets burrow away after their
   lifespan.

## 6. Needs system

`LizardNeedsSystem` (pure), tuned by the leopard-gecko `CareProfile`:
- **hunger** drains over time (raised by eating);
- **stress** eases toward a target set by temperature/humidity out of the ideal
  band, too few hides, low cleanliness, and hunger;
- **health** slowly drops under sustained high stress, recovers when calm.
The HUD shows Appetite / Stress / Health + a warnings strip (e.g. "hungry",
"humidity high for a desert species").

## 7. Compatibility foundation

`HabitatCompatibility.checkCompatibility(a, b)` → `safe | caution | danger | food`
from diet / temperament / predator↔prey / explicit lists. Examples wired today:
gecko + cricket = **food**; gecko + gecko = **caution** (territorial); gecko +
tarantula = **danger**; gecko + isopods = **safe**; gecko + crested gecko =
**danger** (climate mismatch / incompatible). Ready for an Add-Species flow.

## 8. Current limitations (honest)

> ⚠ Historical list from the first foundation pass — several items are since
> FIXED: collision now traces exact contours + per-point surface heights (v3/v4),
> the climb cap is gone, hides ARE enterable, feet plant on the real surface and
> the body pitches/rolls, and terrain is physical (v5). See the "What's new"
> sections above + `HABITAT_EDITOR.md` §13–14 for the live truth.

- The gecko is a **procedural placeholder** (now leopard-yellow so it reads against
  the sand) — recognisable, animated legs/tail, but not final art. Real stepping/rig
  quality arrives with the freelancer's GLB.
- Collision is **2D top-down** (footprints), not mesh-accurate. The gecko now
  **climbs over** climbable obstacles (approximate lift, capped ≈ 12 cm) and
  **routes around** blocked ones, but it doesn't follow fine mesh contours.
- Hides are solid `hide` obstacles — the gecko routes around them but can't yet
  **enter** a hide (the seam is ready: flip `hide` handling + occupancy state).
- Decor collision volumes are **roughly** matched to the meshes (slightly generous
  on some rocks) — safe, but not pixel-perfect.
- Decor GLB textures are resized to 1024² (≈7.7 MB total, lazy-loaded); further
  mesh decimation/dedup is a possible later optimisation.
- Needs rates are **game-paced** (faster than real husbandry) for a watchable loop.
- One habitat layout is authored; the **habitat editor** (drag/place) is
  foundation-only (data + catalog + a small dev-move API), not a full UI yet.

## 9. Next steps after the real gecko arrives

1. Drop `leopard_gecko_animated.glb` in (see `ANIMAL_ASSET_PIPELINE.md`) — it
   auto-replaces the placeholder; tune `modelYaw`/`bodyLength` if needed.
2. Verify clips map to idle/move/eat; add per-state polish (crossfade times).
3. Optionally let the gecko **enter hides** + **climb** low rocks (extend
   `groundHeightAt` + a hide "occupied" state).
4. Build the **habitat editor UI** on the existing builder/collision foundation
   (place/move/rotate/scale, live score preview, capacity + compatibility warnings).
5. Add more species/animals reusing the same pipeline.

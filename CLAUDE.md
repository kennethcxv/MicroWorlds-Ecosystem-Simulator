# CLAUDE.md — GLASSWATER

> Mandatory project guide. Read this first every session. Keep it updated
> (see **Update Rules** at the bottom).

---

## 1. Project Identity

**GLASSWATER** — a cozy but systems-deep **2D/2.5D ecosystem collection
simulator** for the browser.

**Core fantasy:** the player restores a rundown eco-center into a living gallery
of tiny worlds. They build aquariums/habitats, rescue neglected animals, breed
rare morphs, complete a collection book, earn reputation/resources, and keep
fragile ecosystems alive.

**Core loop:** restore room → build tank → add plants/hardscape/species → feed &
maintain → ecosystem changes → animals thrive/stress/breed → unlock
species/morphs → earn resources → upgrade eco-center → expand to more habitats.

### What this project IS
- A polished aquarium/ecosystem management sim with a real, deterministic
  ecosystem simulation.
- 2.5D *look*, 2D *implementation* (Canvas 2D + DOM/CSS).
- Collect / breed / rare-morph retention, light economy, rescue cases.
- Data-driven content (species, plants, hardscape, tanks, equipment).

### What this project is NOT
- ❌ A full 3D walking house / 3D renderer.
- ❌ A TCG battle game (cards are collection UI, not battles).
- ❌ A full customer/staff shop tycoon.
- ❌ A static aquarium screensaver or flat PNG collage.
- ❌ A fake image-only prototype (the tank must be real interactive layers).
- ❌ A web dashboard / debug UI / generic idle game.

---

## 2. Current Source of Truth

**Only** this folder:
`C:\Users\Kenneth\Documents\GLASSWATER_New_Project_Starter_Pack`

- `01_reference_screens/` — visual targets (8 screens). **Not** static
  backgrounds — match them with real interactive code.
- `02_tankview_assets/` — scene-building art for the main aquarium view.
- `03_species_refs/` — species / floor-creature references and card art.
- `04_docs/` — the master prompt
  (`CLAUDE_NEW_PROJECT_MASTER_PROMPT.txt`) and the **species/plant/hardscape
  stats `.docx` files** (authoritative numbers for data-driven content).

**Ignore completely:** `C:\Users\Kenneth\Documents\GitHub\3` (old project — do
not read or modify).

> Note: this folder is the starter pack *with the live build layered on top of
> it*. The reference/asset/`04_docs` folders are inputs; `src/`, `public/`,
> `tools/`, and the docs below are the build.

---

## 3. Tech Stack

- **TypeScript** (strict: `noUnusedLocals`, `noUnusedParameters`).
- **Vite 5** dev server + bundler.
- **Canvas 2D** for the tank/habitat scene rendering.
- **DOM/CSS** for UI panels, menus, screens (glassmorphism).
- **localStorage** save/load.
- Zero runtime game frameworks.

**Forbidden:** Unity, Unreal, Godot, Phaser, Pixi, any 3D renderer or external
game engine. The visual style can read 2.5D; the implementation stays 2D.

**Three.js — narrow, documented exception (experimental).** Three.js is used in
exactly one place: the **opt-in, isolated 3D habitat viewport**
(`src/render/three/`, lazy-loaded) that tests whether 3D animates animals better
than the 2.5D sprites. It now hosts **three habitat prototypes** — fish tank,
spider terrarium, lizard terrarium — behind one `HabitatScene` interface. The
rest of the game stays 2D HTML/CSS, the 2.5D Canvas tank remains the default +
fallback, and Three.js is **not** loaded unless the player picks a 3D habitat. Do
**not** expand Three.js beyond this viewport (e.g. to general UI/screens) without
a new decision. The **lizard terrarium is now a data-driven, collision-aware,
feedable, PLAYER-EDITABLE habitat** (pure model in `src/habitats/`, Three.js bridge in
`src/render/three/`) built to accept the freelancer's rigged gecko as a drop-in.
It renders **real imported decor art** (rock cave, rock cluster, driftwood, stone
dishes, succulents on procedural sand) and the gecko uses **smart navigation** —
routing around blocked obstacles, climbing over climbable ones, and giving up on
unreachable food instead of shoving in. The **Decorate** button opens a real
in-world editor (simplified Unity/Unreal style — catalog + a `TransformControls`
transform gizmo + inspector): place / move / rotate X·Y·Z / scale / duplicate /
delete / undo·redo, saved to the layout. Collision is **measured from the real GLB
mesh** in BOTH axes: the exact marching-squares **silhouette contour** in plan
(gaps between branches stay open; hull/rect decomposition kept as fallback) AND a
per-point **surface heightfield** (top + underside per cell) so a sloped rock is
low on its low side, an arched branch is walked UNDER where it's elevated, and the
walk height/body pitch follow the true wood surface — following every transform
live and rebuilding navigation + score. The gecko stands on **four FOOT CONTACTS**
(pure FootPlanner: planted feet world-locked exactly on the sampled surface — no
float/sink/slide; stepping feet arc; the placeholder's legs aim at the live
contacts) and the body **pitches (front-vs-rear feet) AND rolls (left-vs-right
feet)** with the ground. **Terrain sculpting is physical**: collision reads the
sculpted height map LIVE (walk height, foot contacts, nav slope-blocking > ~40°,
placement + feeding validation, feeder heights), the ⚡ Strong brush raises real
dunes (~0.23 m) and digs BELOW the default sand down to a **bedrock limit** (~1 cm
above the tank floor — depressions yes, holes through the glass never), and
`CollisionWorld.sampleSurfaceAt` answers height/normal/slope/type per point. The
**normal camera is anchored** (eco-center viewing: ±43° yaw window + pitch band +
pivot clamped inside the tank + Front/Left/Right/Top/Focus presets — dragging
leans your head, never spins the tank) with **📷 Photo Mode** for the free orbit
(the Decorate editor auto-frees + re-anchors); fish/spider cameras unchanged. The
gecko uses **compound body probes** (head→tail) + swept motion so **no body part
phases through** decor; overhead/hanging props don't block the floor; the catalog
has **sections/search/filters/icons + Y-axis placement**; a **View Collisions**
button + a **🐾 Debug menu** (foot contacts / surface normals / terrain heatmap)
expose the overlays; and **clicking the gecko** opens a live info card. The
**vivarium shell is built from ONE derived spec** (`EnclosureSpec` — interior,
THE shared walk/placement/feeding rectangle, frame + base-tray sizing, glass
apron, bedrock, camera target/home, stand, lamp mount all derive from the single
`HabitatDimensions` record — never hard-code a tank size anywhere else): premium
glass + dark frame + screen top + desert back panel + rim-clamped basking lamp +
UVB/gauges + a **wooden stand** (real cabinet GLB), so the tank sits fixed in the
room; `HabitatMigrate` heals stale saves on load (dimensions normalized, content
clamped inside, never deleted). The gecko habitat's UI is the **reference-match
GLASSWATER game UI** from `Designs/Gecko/` (top identity + score cards, 8-stat
strip, large action dock, bottom drawers for Clean/Feed/Terrain/Decorate, right
Animal Info panel, Photo mode), driven by a pure tested **mode machine**
(`src/ui/gwModes.ts`) + the shared `.gw-*` design system (`src/ui/gwTheme.ts`) —
which image controls which screen: `docs/production/DESIGN_REFERENCE_MAP.md`.
See `docs/production/HABITAT_EDITOR.md`, `docs/production/THREE_D_TANK_SPIKE.md`,
`docs/production/HABITAT_ANIMATION_COMPARISON.md`,
`docs/production/LIZARD_HABITAT_PROTOTYPE.md`,
`docs/production/ANIMAL_ASSET_PIPELINE.md`, and `DECISIONS.md`.

Runtime deps: `three` + `@types/three` (3D spike only, code-split). Tooling deps
(Node, not shipped to the game): `@fal-ai/client`, `dotenv`, `@gltf-transform/cli`
for the asset scripts in `tools/` + GLB inspection.

### 3D asset paths (experimental habitats)
- Raw 3D models: `3D_Assets/` (fish/plant/log/cabinet) and `3D_Assets/Animals/`
  (spider, geckos, chameleon, snake, frog, turtle, …). Never destroy originals.
- Runtime (browser, served by Vite):
  - `public/assets/3d/tank_spike/` → `fish_small.glb`, `fish_centerpiece.glb`,
    `aquarium.glb` (cabinet/stand), `plant_01.glb`, `root_01.glb`.
  - `public/assets/3d/habitats/` → `spider_rigged.glb`, `lizard_rigged.glb`
    (**rigged**: armature + skin + `walk`/`idle` clips), plus `spider.glb`,
    `lizard.glb`, `gecko_ik.glb` (older un-rigged/IK placeholders).
    Textures 1024² via `gltf-transform resize`.
  - `public/assets/3d/habitats/lizard/decor/` → the terrarium decor GLBs
    (`rock_cave_hide_01`, `desert_rock_cluster_01`, `driftwood_branch_01`,
    `water_dish_stone_01`, `food_dish_stone_01`, `succulent_01/02`) — real Tripo
    art, textures resized to 1024², loaded + collided data-drivenly. Mapping +
    "add a new prop" steps: `ANIMAL_ASSET_PIPELINE.md` §8.
  - `public/assets/textures/habitats/lizard/` → optional `sand_substrate_01.png`
    drop-in (tiled floor texture; procedural sand used if absent).
  - `public/assets/3d/creatures/` → the **10 self-made first-batch animals**
    (`feeder_cricket`, `cherry_shrimp`, `nerite_snail`, `neon_tetra`, `guppy`,
    `zebra_danio`, `otocinclus`, `mystery_snail`, `daphnia`, `isopod` — one GLB
    per registry id, textures ≤1024²; sources under `3D_Assets/<Animal>/`,
    never modified). Fully data-driven from `src/data/creatures/`; the
    part-separated meshes animate procedurally (no rigs). Dev viewer:
    **`?habitat=creatures`** (Creature Lab — URL-only, never persisted, not in
    the player habitat switch). Pipeline + "add animal #11" steps:
    `docs/production/CREATURE_BATCH.md`; GLB inspection: `tools/inspect-glb.mjs`.
  - **Pending freelancer drop-in:** `public/assets/3d/habitats/lizard/
    leopard_gecko_animated.glb` — the final rigged leopard gecko. Auto-detected +
    used when present (else a procedural placeholder gecko is used). Expected
    clips: **Idle, Walk/Crawl, Turn/Look, Eat/Bite, (opt) Rest, Stress** — mapped
    by alias, missing clips degrade gracefully, never crash. Full spec:
    `docs/production/ANIMAL_ASSET_PIPELINE.md`.
  - Never load from absolute Windows paths in runtime code.
- Select a 3D habitat: the on-screen **2D Aquarium / 3D Fish / 3D Spider /
  3D Lizard** buttons, or `?habitat=fish|spider|lizard` (implies 3D), or
  `?tank=3d|2d`. Choice persisted in `localStorage`.
- The 3D habitats use **OrbitControls** (middle-mouse or left drag = rotate,
  wheel = zoom, right drag = pan) — inspect the tank from any side. Land animals
  play **idle/walk/run** clips with distance-driven feet + turn-bend (see
  `ThreeRiggedController`).
- Supplied animals are **fused + unrigged**. Fish = procedural body-wave. Spider +
  lizard were **rigged in Blender (via MCP)**: armature → automatic skin weights →
  hand-authored walk/idle clips → rigged GLB → played via AnimationMixer
  (`ThreeRiggedController`). Real stepping legs, body level (no bounce). This
  Blender auto-rig pipeline is reusable for more quadrupeds/arthropods.

---

## 4. Current Milestone

- **Phase:** Phase 1 (Main Aquarium Screen) ✅ done + Phase 2 (Core Sim) ✅
  largely done; currently in a **Phase 3 "alive/gloss" polish pass**.
- **Current goal:** glossier glass + better creature animation (done), plus a
  parallel **habitat-foundation** track — the lizard terrarium is now a reusable,
  data-driven, collision-aware, feedable habitat awaiting the freelancer's rigged
  gecko drop-in. Then continue the roadmap (habitat editor next).
- **Current visual target:** `01_reference_screens/01_main_aquarium_management_target.png`
  — cozy eco-center room, physical glass tank on wooden stand, lush planted
  aquascape, dark-teal glassmorphism UI.
- **Blocking issues:** none known. (Dev server must be (re)started per session;
  verify with Playwright after visual changes.)

See `docs/production/STATUS.md` for the live status and
`docs/production/TODO_ROADMAP.md` for what's next.

---

## 5. Commands

```bash
npm install          # install deps
npm run dev          # Vite dev server (http://localhost:5173)
npm run typecheck    # tsc --noEmit
npm test             # vitest run — pure-sim + data + habitat/editor/care/ui-mode/creature tests (402 tests)
npm run test:watch   # vitest watch mode
npm run build        # tsc --noEmit && vite build
npm run preview      # preview the production build

# Asset tooling (paid APIs — read keys from .env, never hardcode; log usage):
npm run gen:asset    # OpenAI Images → assets/generated/openai/
npm run edit:asset   # fal / Flux Kontext img2img → assets/generated/fal/
npm run clean:bg     # remove.bg background removal: TankView_Assets/raw → cleaned
#   add `-- --dry-run` to any asset script to preview without spending credits
```

Tests live in top-level `tests/` (kept out of the `src` tsconfig include so the
shippable build stays focused); they import from `vitest` explicitly. `npm test`
runs the pure-sim + data suites.

---

## 6. Visual Target Rules

1. The **main Aquarium screen is the highest priority** and the quality bar for
   everything else.
2. Match the reference mockups **using real interactive code** — depth-sorted
   sprite layers, live creatures, particles, procedural glass.
3. **No static full-screen screenshot faking.** Tank contents, creatures, food,
   particles, and UI are real layers.
4. The tank must read as a **physical glass aquarium** on a wooden stand in a
   cozy eco-center room.
5. **Polished dark-teal glassmorphism UI.**
6. **Lush planted aquascape** — tall plant clusters back-left/back-right, hero
   driftwood/rock/moss centerpiece, low plants/rocks front, detailed substrate,
   open mid/upper swimming space. Don't leave the tank empty, don't use flat
   plank driftwood, don't repeat identical evenly-spaced plants, don't let fish
   be tiny invisible dots.
7. **Glossy, not matte** — visible glass reflections, waterline highlight,
   caustics/god-rays/bubbles. (Active polish area.)
8. **Always verify visual changes with Playwright** before claiming a pass.

### Main-screen layout contract
- **Top bar:** logo, coins/leaves, research/water, reputation/star, day/time,
  menu/settings.
- **Left panel:** tank name, habitat type, water quality, oxygen, temperature,
  pH, ammonia, nitrite, nitrate, cleanliness, habitat score, warnings.
- **Right panel:** population list, species counts, tank size, filtration,
  lighting, decorations, plant mass/cover, notes/events.
- **Center:** physical glass tank + wooden stand + cozy room + detailed
  aquascape.
- **Bottom action bar:** Feed, Clean, Water Change, Decorate, Add Species,
  Info/Journal.
- **Bottom nav:** Eco-Center, Shop, Collection, Research, Rescue, Breeding,
  Tasks, Settings.

---

## 7. Architecture Rules

- **Simulation is separate from rendering.** The ecosystem sim
  (`src/core/sim.ts`) must be testable with no Canvas/DOM imports.
- **Data-driven content** — all species/plants/hardscape/tanks live in
  `src/data/*` and feed off the `04_docs` stats sheets.
- **Deterministic seeded RNG** (`src/core/rng.ts`, mulberry32). Same seed → same
  result.
- **Save/load** through `src/core/save.ts` (localStorage).
- No global spaghetti, no one giant file. Keep modules focused.

### Source layout (current)
```
src/
  main.ts app.ts styles.css vite-env.d.ts
  core/    rng.ts state.ts sim.ts save.ts   (TODO: economy.ts events.ts)
  data/    assets.ts species.ts aquaticCodex.ts swim.ts plants.ts hardscape.ts tanks.ts water.ts
           terrains.ts (substrate materials registry — swatches/palettes/stats/unlocks)
           terrainTools.ts (Terrain-editor tool registry) habitatFilters.ts (7 analysis filters)
           creatures/ CreatureTypes.ts creatureRegistry.ts (the 10 self-made animals — pure data)
           (TODO: equipment.ts research.ts rescueCases.ts)
  render/  assetLoader.ts canvasRenderer.ts tankScene.ts layers.ts effects.ts fishDeformation.ts
           (TODO: particles.ts split-outs)
  habitats/ (PURE data-driven habitat model — no Three/DOM, unit-tested)
           HabitatTypes.ts HabitatBounds.ts HabitatCollision.ts HabitatNavigation.ts
           HabitatStats.ts HabitatLayout.ts HabitatBuilder.ts HabitatState.ts
           HabitatSaveLoad.ts HabitatSpecies.ts HabitatCompatibility.ts HabitatEditing.ts
           HabitatTerrain.ts HabitatFootprint.ts EnclosureSpec.ts HabitatMigrate.ts
           HabitatMaterialMap.ts (per-cell painted substrate materials)
           lizard/ LizardHabitatData.ts GeckoMovementController.ts GeckoFeet.ts
                   LizardNeedsSystem.ts LizardFeedingSystem.ts LizardController.ts
                   LizardNutrition.ts (real feeder nutrition + supplements + intake)
                   InsectBehavior.ts (prey AI: freeze/flee/wall-steer/tire + collisions)
           creatures/ PartClassifier.ts (anatomy from measured GLB bounds) FlockMath.ts (boids-lite)
  render/three/  (EXPERIMENTAL 3D habitats, lazy-loaded)
           ThreeHabitatRenderer.ts ThreeHabitat.ts            (generic renderer + interface)
           ThreeTankScene.ts ThreeWater.ts ThreeBounds.ts     (fish tank)
           ThreeSpiderScene.ts ThreeLizardScene.ts ThreeEnclosure.ts (land habitats)
           ThreeTerrarium.ts ThreeVivariumShell.ts ThreeSandTexture.ts ThreeContactShadow.ts (lizard scene)
           ThreeGeckoPlaceholder.ts ThreeFeederInsects.ts (lizard scene)
           ThreeFeedingPresentation.ts (staged feeding: toss/pour/hand/player-held tongs + cameras)
           ThreeAnimalController.ts ThreeAnimationController.ts ThreeCollisionSystem.ts (data-driven habitat bridge)
           ThreeRiggedController.ts ThreeGroundController.ts (spider fallback controllers)
           ThreeAssetLoader.ts ThreeFishController.ts ThreeFishAnimation.ts ThreeMaterials.ts (shared)
           ThreeHabitatEditor.ts (Decorate-mode gizmo/placement — TransformControls)
           ThreeCreatureLabScene.ts (DEV creature viewer — ?habitat=creatures)
           creatures/ ThreeCreatureLoader.ts ThreeCreatureAnimator.ts (joint-pivoted part animation)
                      ThreeAquaticCreatures.ts ThreeSurfaceCreatures.ts ThreeIsopods.ts (controllers)
  ui/      controller.ts topBar.ts sidePanels.ts bottomActions.ts screens.ts
           layout.ts icons.ts lizardHud.ts habitatEditor.ts animalInfo.ts
           gwModes.ts (pure UI mode machine) gwTheme.ts (.gw-* design system)
           gwDrawers.ts (Clean/Feed/Terrain drawers) careModes.ts (H help sheet)
           substrateSelection.ts (pure Terrain-Materials preview/apply state)
           (TODO: cards.ts)
  utils/   math.ts dom.ts        (TODO: color.ts)
tests/     rng.test.ts sim.test.ts save.test.ts codex.test.ts
           collision.test.ts navigation.test.ts habitat.test.ts editing.test.ts
           contour.test.ts footprint.test.ts rehydrate.test.ts habitat2.test.ts
           heightfield.test.ts surface.test.ts terrain2.test.ts
           surfacesampler.test.ts feet.test.ts enclosure.test.ts migrate.test.ts
           uimode.test.ts dirtspots.test.ts
           nutrition.test.ts dish.test.ts insects.test.ts
           creatures.test.ts partclassifier.test.ts flock.test.ts
           terrains.test.ts substrate.test.ts filters.test.ts terraintools.test.ts
           materialmap.test.ts
           fixtures/creatureParts.ts (REAL measured GLB part bounds — generated)
           (vitest — 402 tests)
tools/     generate-openai-asset.mjs  edit-asset-with-fal.mjs  remove-backgrounds.mjs
           inspect-glb.mjs (GLB hierarchy/material report + --table + --fixtures)
public/assets/  room/ tank/ hardscape/ plants/ creatures/  3d/tank_spike/ (GLBs)
docs/      production/  decisions/
```

### Rendering layer order (tankScene/canvasRenderer)
room backdrop → tank back-shadow → stand → tank shadow → glass shell → water bg
→ background plants → midground hardscape/plants → fish/creatures → foreground
plants/details → particles/bubbles/food/waste → procedural glass front + sheen
overlay → name plate → colour grade → DOM UI overlay.

---

## 8. Tool / MCP Rules

- **Playwright MCP** — mandatory after any visual/UI change. Open the app, click
  buttons, screenshot, check the console, compare before/after. Never claim a
  visual pass without it.
- **Figma MCP** — use if connected for layout/spacing/color/hierarchy reference.
- **frontend-design plugin** — UI polish, glassmorphism, typography, button
  states, responsive layout.
- **superpowers plugin** — milestone planning, keeping execution focused, no
  scope drift.
- **code-review plugin** — run before completing a major milestone (architecture,
  dead code, performance, bugs, secrets, bad abstractions).
- **context7** — fetch current docs for Vite / TS / Canvas / Playwright / package
  APIs before relying on memory.
- **GitHub MCP** — branches/commits/checkpoints if/when git is initialized (this
  folder is **not** a git repo yet).
- **Higgsfield / asset APIs** — visual references & asset ideation only when
  needed.
- **Paid-API discipline:** never expose or hardcode keys; read from `.env`;
  `.env` is gitignored; log every paid call in
  `docs/production/api_usage_log.md`; don't spam generations; curate before
  integrating; default to `--dry-run` when testing the scripts.

---

## 9. Asset Rules

- Reference images are **visual targets, not static backgrounds**.
- The gameplay screen must stay **interactive** (real layers, not a baked image).
- Use cleaned/curated assets; **normalize raw images** (background removal, trim)
  before live use.
- Keep **card/collection art separate** from in-tank gameplay art.
- Pipeline: drop raw into `assets/TankView_Assets/raw/` → `npm run clean:bg` →
  curate keepers into `public/assets/<group>/` → register the path in
  `src/data/assets.ts` (with an alpha trim box if it's a big scene plate).
- Generated outputs live under `assets/generated/{openai,fal}/` — curate before
  promoting into `public/`.

---

## 10. Update Rules

Update **this file's** Current Status (section 4) + the relevant
`docs/production/*` file:

- after every completed milestone,
- after any major architecture change,
- after any new command/script,
- after any visual-target decision change,
- after any API/tooling setup change,
- when a bug/workaround becomes important,
- before ending a long session.

Companion docs to keep current:
`docs/production/STATUS.md`, `docs/production/VISUAL_GAP_REPORT.md`,
`docs/production/TODO_ROADMAP.md`, `docs/production/api_usage_log.md`,
`docs/decisions/DECISIONS.md`.

---

## Current Status — 2026-07-02

- ✅ **TERRAIN EDITOR v3: TRUE MATERIAL PAINTING + 10 LENSES (v10.4)** — the
  Paint brush is PHYSICAL: a per-cell material map
  (`src/habitats/HabitatMaterialMap.ts`, persisted) + a composite floor
  texture (`MaterialFloor` — per-material procedural tiles, jittered organic
  boundaries, region-only repaints) lay the armed material exactly where the
  player strokes (live-proven: 167-cell clay band, reload-persistent, swept
  back). Stroke-end commits dominant substrate + bed tint + coverage-weighted
  humidity + one event + save; dock reads "Mixed substrate" under 70%
  dominance. Tool grid = 4×2 full-size (Flatten re-added; Wet/Dry full
  boxes); context cards carry husbandry TIP strips + live Relief/Damp meters.
  The editor NEVER moves the camera. Filters = 10 lenses in a 2-col grid
  (+ Comfort = live comfort stat 89; + Enrichment = live wellbeing meter 87),
  main column redesigned score-hero-first (number + status + tinted ring +
  bar + recommendation, verdict + View Details beneath); minimap draws the
  painted cells. QA: `__lizard.paintMaterial/materialCoverage`. typecheck +
  build + **402 tests**; fish 3D + 2D + all modes intact; 0 console errors.
- ✅ **TERRAIN EDITOR v2: COMPACT + PAINT-TO-APPLY + EXACT FILTERS (v10.3)** —
  the editor box is ~24% of the screen (2-col tool grid Raise/Lower/Smooth/
  Erase/Paint + Wet·Dry pair; Select cut); the right panel is TOOL-CONTEXTUAL
  (sculpt tools → context card w/ live Relief/Damp meters; **materials only on
  Paint**); substrates apply by PAINTING only (tile click = arm, brush stroke
  = applySubstrate — preview API deleted). Filters (now 8, **+ Cleanliness**
  from the live dirt map, readout = env.cleanliness exactly) sample the EXACT
  collision/sim queries (hide floors, hard rooflines, isFree contours,
  sculptMask, gecko BFS, real °C gradient, wet cells); readouts + minimap
  refresh ~1 s live; the wash drapes sculpted dunes. AAA wash (blur-smoothed,
  value-shaped alpha, glass-edge fade) + minimap v2 (2×, substrate base, exact
  hide-wall C-contours + rock silhouettes, teal dish, live gecko marker).
  Playwright-proven arm→paint flow + 15=15 cleanliness match; fish 3D + 2D +
  all modes intact; 0 console errors. typecheck + build + **393 tests**.
- ✅ **TERRAIN EDITOR: TWO TABS + FILTERS + BRUSH CURSOR (v10.2)** — the
  Terrain editor matches its two FINAL references (`Designs/Gecko/…04_54_24/
  04_54_42 PM.png`) with exactly **two tabs: Terrain · Filters** (Decorate/
  category tabs removed — they live elsewhere). TERRAIN: single-column tool
  stack Select/Paint/Raise/Lower/Smooth/Erase (+ compact Wet/Dry) from the
  pure registry `src/data/terrainTools.ts`; **Erase = flatten+dry reset brush**
  (live-proven), Select = inspect, Paint lays the selected material (global —
  per-cell TODO); Intensity is a % slider and the **⚡ Brush Mode chip**
  (Soft/Normal/Strong) scales sculpt strength + gates the bedrock limits; an
  **in-world brush cursor** (white ring + green tool-glyph badge, terrain-
  draped, enclosure-bounded) rides the pointer; the editor auto-raises the
  camera (Top vantage) and re-anchors on exit. FILTERS: 7 real analysis
  lenses (`src/data/habitatFilters.ts` + scene `AnalysisOverlay`): Heat/
  Humidity/Hide Coverage/Clutter/Dig Zones/Traffic Flow/Lighting — soft
  colour wash on the habitat from LIVE data (zones, wet map, decor volumes,
  reachability flood, lamp), score cards from `filterReadout` (hidingSpots,
  env bands, coverage/dig/reach fractions), gradient legend + top-down
  minimap + About/TIPS panel, Overlay Opacity/Intensity + Reset Filters.
  Playwright-verified; fish 3D + 2D + all modes intact; 0 console errors.
  typecheck + build + **392 tests** (filters 9, terraintools 5). Screenshots:
  `screenshots/ui_reference_match/editor_*.png`.
- ✅ **TERRAIN UI REFERENCE-MATCH + REAL SUBSTRATES (v10.1)** — the Terrain
  drawer now matches its reference exactly: tab pills on the drawer's top edge
  (Terrain active · jump-to-Decorate), a floating 2-column sculpt-tool palette
  (6 designed SVG icons, green-filled active card), an always-visible
  MATERIALS row of **8 real photo tiles cropped from the reference art**
  (`public/assets/ui/terrain/`), a selected-substrate info strip (description
  + tag pills + Heat/Humidity/Digging/Clean/Bioactive mini meters +
  Apply/Revert + "✓ Current"), slider PILLS with designed icons, ⚡ Strong and
  a round brush-reset. Substrates are REAL: `src/data/terrains.ts` (8 entries;
  6 desert unlocked, Bioactive/Mossy Soil locked "Future habitat") drives
  per-terrain **procedural sand palettes** (floor re-skins live), bedrock/
  skirt tint, the **humidity model** (base 38/41/36% per substrate,
  live-verified) and unlocks; the pure tested `SubstrateSelection`
  (preview→apply/revert; Esc reverts) commits `terrainId` onto
  `layout.substrate` — **persists through reload**; Terrain dock subtitle =
  live substrate name; event log + chime on apply. Playwright-verified end to
  end; fish 3D + 2D + all sibling modes intact; 0 console errors. typecheck +
  build + **378 tests** (terrains 12, substrate 9). Screenshots:
  `screenshots/ui_reference_match/terrain_*.png`.
- ✅ **SELF-MADE CREATURE BATCH v1 — 10 REAL ANIMALS (v10)** — the first 10
  self-made Tripo animals (feeder cricket, cherry shrimp, nerite snail, neon
  tetra, guppy, zebra danio, otocinclus, mystery snail, daphnia, isopod) are
  real, data-driven in-game creatures. ONE registry entry + ONE GLB per animal
  (`src/data/creatures/` — full husbandry-derived design data: tiers,
  difficulty, environment/needs bands, personality/habits/triggers, the 0-100
  stat block + species special stats, ecosystem effects, spawn defaults,
  2D-codex links). Anatomy is measured, not assumed: `PartClassifier` (pure,
  tested vs REAL fixtures from the new `tools/inspect-glb.mjs`) reads each
  part-separated GLB's bounds into roles; registry `partOverrides` pin the
  rest; the loader RE-PIVOTS every part at its anatomical joint and the shared
  animator drives role oscillators (tail wag, fin flutter, leg scurry,
  antenna/eyestalk sway, snail foot stretch, daphnia oar pulse, shrimp escape
  curl) — absolute-set from base transforms so parts can never detach. Shared
  controllers: schoolFish (boids-lite `FlockMath` + zones + danio bursts),
  surfaceGrazer (oto belly-to-glass attach), shrimpCrawler (backward escape
  flick), snailGlider (floor + glass climbing), microSwarm (daphnia pulse-hop
  cloud, flees fish), isopodCrawler (shelters by decor, flees the gecko,
  genuinely cleans the dirt map), feederInsect (the EXISTING tested cricket
  prey sim wearing the real GLB — procedural fallback kept; QA
  `__lizard.cricketVisual()`). In game: the 3D aquarium runs the default
  population (33 creatures incl. two schools of 6) beside the goldfish/betta;
  the vivarium hosts a 5-isopod bioactive colony; the DEV **Creature Lab**
  (`?habitat=creatures`, URL-only, never persisted) shows a labelled specimen
  bench + live water/sand stations + a spawn/codex panel. Playwright-verified:
  all 10 load/move/stay in bounds, no detachment (a body-pivot bug was caught
  ON the bench and fixed), fish 3D + 2D + gecko + spider intact, 0 console
  errors. typecheck + build + **357 tests** (creatures 15, classifier 11,
  flock 6 — TDD). Docs: `docs/production/CREATURE_BATCH.md`. Screenshots:
  `screenshots/creatures/`.
- ✅ **CLEANING TOOLS + GLASS WIPING + SLOWER DIRT (v9.7)** — dirt hotspot rate
  0.02→0.006/s (lingering fouls ~3× slower); the sponge cursor became three
  PROFESSIONAL per-option tools (steel sand scoop / walnut hand brush /
  rubber-blade squeegee, each with its own work animation + ring tint); the
  front pane carries a real SMUDGE layer (`ThreeGlassSmudge` canvas texture —
  streaks/smears + paw prints where the gecko walks the glass, slow build-up)
  and Wipe Glass is now a DRAG TOOL on the glass (renderer `pointAtZ` raycast,
  firm-core wipes, throttled squeaks, near-clean forgiveness → sheen + done
  chime + coverage-driven "Crystal clear" pill; QA `glassCover()`). Live:
  coverage 0.057→0 wiping, pill flip, all sounds logged. typecheck + build +
  **325 tests**; fish 3D + 2D intact; 0 console errors.
- ✅ **CLEANING MODE POLISH (v9.6)** — reference-exact Clean drawer (5 SVG-icon
  tool cards + honest live status pills incl. real droppings count + water
  freshness + glass-smudge timers), the OS cursor replaced by a 3D SPONGE TOOL
  (bobs idle; tilts/jitters/puffs while scrubbing), a **procedural WebAudio SFX
  module** (`src/render/sfx.ts` — brush loop, spot-clean sparkle, per-dropping
  pop, done chime, water pour, glass squeak; zero asset files = Steam-safe; QA
  `__sfxLog`), and every action real: Remove Waste scoops ALL droppings (9→0
  live), Replace Water sparkles at the dish + freshness reset, Wipe Glass
  sheen sweep. Favicon added (killed the 404). typecheck + build + **325
  tests**; fish 3D + 2D intact; 0 console errors.
- ✅ **STRANDED-ON-ROCK fix (v9.5.1)** — feet could plant on TOO-TALL cells
  (nav refuses them; feet didn't), carrying the feet-driven body onto a crown
  with no route off = stuck forever. `tooTallAt` is now public; `clampFoot`
  walks too-tall landings back toward the body (a paw never steps past the
  mantle ceiling), and `escapeStrand()` in `giveUp()` walks an already-
  stranded gecko straight to the nearest legal ground. TDD: 0.3 m crown —
  routes around, never exceeds the ceiling, ends on free ground. Live: the
  stuck save self-rescued in seconds. **325 tests**; 0 console errors.
- ✅ **SMOOTH CLIMBING — feet-driven body (v9.5)** — climbing rebuilt on the
  AAA quadruped rule: root height = the MEAN of the four foot contacts (legs
  can never overextend; v9.4's ride-the-highest-surface floor made stilts),
  the pitched spine does the ledge work (climb pitch cap 0.9 + a PITCH ASSIST
  that rears the head up a face, anticipating a stride ahead), the no-phase
  guarantee constrains PROP material only (belly/tail rest on sand naturally;
  the flexible TAIL is vertically exempt — it drapes), needs split into
  hard-clamped needNow vs ease-only anticipated needSoft + a decaying
  hold-floor (no ease-vs-clamp sawtooth), and the mantle is motion-warped
  (forward brake ~25% while lifting AHEAD, never on departures; TIME-based
  gait phaseBoost so feet keep stepping at brake speeds; stride ×0.62 lift
  ×1.5 on climbs). TDD: mesa crossing — no part below prop mesh, body ≤ 6 cm
  above its highest support, ≤ 12 mm/frame height motion. Live: smooth perch
  climb, body between contacts, pen 0. typecheck + build + **324 tests**;
  fish 3D + 2D intact; 0 console errors.
- ✅ **TOILETING + VERTICAL NO-PHASE GUARANTEE (v9.4)** — the pitched body line
  could stab into a rock face on ledge step-offs (measured −0.16 m in the mesa
  fixture); now every probe's height along the final pitched/rolled spine is
  HARD-FLOORED against the mesh under it each frame (instant raise, eased
  lowering) — geometrically impossible for any part to enter a mesh (QA
  `__lizard.partClear()`, live −0.008 m = belly-contact grace only). Plus a
  species-true TOILETING system (`LizardDigestion.ts` + `ThreeDroppings.ts`):
  meals fill a digest store → 70–140 s later the gecko walks to its ONE chosen
  bathroom corner (farthest from hides/dishes, persisted — real leo habit),
  squats ~2.4 s, deposits a dark pellet with the white urate cap; droppings
  are persisted meshes fouling their spot until the spot brush / Remove Waste
  scoops them; trips interrupt hunting; feasts yield spaced trips. Live:
  second trip 0.01 m from the first (the habit), brush removed 2/2, droppings
  survive reload. QA `__lizard.poopNow()/droppingList()`. typecheck + build +
  **323 tests**; fish 3D + 2D intact; 0 console errors.
- ✅ **INTELLIGENT, LIFELIKE MOVEMENT (v9.3)** — real leopard-gecko locomotion +
  smarter use of the habitat. **Stalk→creep→dash hunting** (deliberate walk;
  slow creep + motionless freeze beats inside ~0.55 m; short explosive strike
  dash inside 0.3 m facing prey — they're ambush hunters, not joggers).
  **PERCHING/BASKING** (`LizardPerch.ts`, pure + TDD): climbs ONTO climbable
  decor and STAYS (top or draped on a sloped side), approaching from the LOW
  side (`lowSideStaging` — walks around, climbs the short face); personality-
  weighted (`perchChance`), belly-down bask ~55%. **Deliberate hide entry**:
  pauses a beat at the mouth (holdStill peek) then walks in. **Dish honest**:
  contained insects sit ON the measured bowl floor (`propSurfaceYAt`; the old
  climbHeightAt path ignored HARD volumes so dish insects sat at sand level —
  the "phasing through the dish bottom"), pour lands on the floor, and a
  hungry gecko WALKS TO the dish (reachGoal rim-goal generalisation +
  pinned-press over-the-rim bite; target held while pressing). Shelter trips
  recover toward their OWN goal ("shelter" recoverReturn) + padded fallback
  lattice. Live: hunger 0→21.6 via two unprompted dish meals; perched 0.09 m
  up a rock (perch_basking.png); hide entry with a 0.9 s mouth peek at 0.075 m
  anchor precision; pen 0 throughout. QA `__lizard.perchNow()`. typecheck +
  build + **318 tests**; fish 3D + 2D intact; 0 console errors.
- ✅ **HIDE WALLS ARE REAL + complete pathing (v9.2)** — the gecko can never
  pass through a hide wall and reliably enters/rests/leaves through the mouth.
  Hides get **wall-band collision** (`traceWallContours`: only mesh material at
  body height, sampled UNDECIMATED — the old full-silhouette trace +
  every-11th-triangle sampling left a leaky partial blob = the walk-through) →
  two closed wall rings per hide, `hideFit` 0→0.16, too-small warning cleared.
  Navigation gained **pocket doorway corridors** (BFS + string-pull from each
  hide's most-enclosed free point), a **glass perimeter lane**, and a **grid
  fallback** in `findPath` (0.025 m lattice BFS when the visibility graph
  fails — if it's physically walkable it routes; out-of-enclosure still
  refused). Shelter journeys protected: `shelterEnRoute` guards the nap
  decide-tick; arrival verifies proximity to the pocket anchor. Live: rested
  0.073 m from the anchor, bodyPen 0.0000 m throughout, walks back out; debug
  shows closed amber wall rings + the gecko's probe figure THROUGH the hide.
  QA: `__lizard.hideVolumes()/shelterNow()/navNodes()/probePath()/
  probePathFrom()/los()`. typecheck + build + **310 tests**; fish 3D + 2D
  intact; 0 console errors.
- ✅ **FULL-BODY ANIMAL COLLISION + TONGS PARKED (v9.1)** — 10 body probes now
  cover EVERY section incl. both front + rear legs (the old 6 ran only down
  the spine); every FOOT plant/landing is clamped out of hard decor
  (`CollisionWorld.freePoint` + FootPlanner clamp) so a paw can never sit in a
  rock. TDD: quadrant leg coverage + 4000-frame zero-paw-in-rock roam (304
  tests); live `__lizard.bodyPen()` = 0.0000 m worst penetration over 42 s.
  The tong mechanic is PARKED (out of the feed rail, code dormant) pending a
  steering-UX redesign — feed = Quick / Hand / Dish / Track Intake.
- ✅ **COLLISION OVERHAUL + PERSONALITY + BITE-CARRY (v9)** — hide interiors
  fixed at the root: a dedicated per-asset FLOOR field (upward-facing low
  triangles; the roof hides the floor from the normal field) served via an
  object-level union entry (`hideFloorAt` — the pocket is the hole BETWEEN the
  wall loops, so per-volume bounding circles never covered it); the gecko now
  stands/lies ON the cave floor and steps OVER the sill (live: hide-floor
  surface 0.128–0.144 vs 0.08 sand, type "hide"). Torso standing height =
  max over chest/centre/hip samples (no more butt-in-the-ledge). PERSONALITY
  (`LizardPersonality.ts`): 5 characters, real-life-skewed roulette, persisted
  per animal, driving speeds/idles/shelter/naps/startle/appetite + a personal
  climb ceiling (CollisionWorld `maxClimb` opt); `canClimbGlass` species flag
  (leo false). BITE→CARRY→CHEW→SWALLOW for all feeding (insect rides the snout
  through the chew; tongs recoil at the bite; nutrition at the swallow). Tong
  cinematic = wide steady front shot. 302 tests; 0 console errors.
- ✅ **COMMON-SENSE RULES (v8.2)** — dishes are hard no-step zones (the gecko
  eats over the rim; old saves healed); a hide's measured interior FLOOR lifts
  stance/feet (stands ON the cave floor, never sunk; `HIDE_FLOOR_MAX`); a real
  lie-down rest pose while sheltering (belly-down + breathing; rigged Rest clip
  when it lands); tong offers raise/lower on the mouse WHEEL and a raised take
  triggers a genuine JUMP (`ThreeAnimalController.hopLunge`); cinematic always
  OPENS from an unblocked angle with clear line-of-sight
  (`CollisionWorld.hardTopAt` ray test) and pans around when the subject walks
  behind decor. All live-proven; 290 tests; 0 console errors.
- ✅ **FEEDING POLISH + PHYSICALITY (v8.1)** — tong feeding is player-steered on
  a STATIONARY camera (the old moving shot made the pointer unmanageable),
  tongs/hand/toss landings are collision-validated (props slide along decor,
  never through it), a **max-climb cap** (0.22 m, per-point for mesh props)
  stops the gecko from ever attempting too-tall climbs, hides use an
  **enclosed-interior anchor + body-fit** (no more half-in/half-out; too-small
  hides are never entered and the HUD warns while editing; authored hides
  rescaled to truly fit; QA `__lizard.hideFit()`), shelter frequency tuned
  (10% + 35 s cooldown), the keeper's hand is an articulated rig (per-joint
  finger curl, palm mounds, sleeve) with cupped→open→close animation, and
  CINEMATIC follows the FOOD during feedings (prop-aware orbit) + is available
  ANYTIME via a film button under the photo button (V). 290 tests; 0 console
  errors.
- ✅ **FEEDING OVERHAUL (v8)** — the Feeding screen now matches its reference
  EXACTLY and feeding is a real husbandry system. UI: left method rail (Quick
  Feed / Hand Feed / Tongs / Place in Dish / Track Intake, designed SVG icons),
  FOOD row of **5 real photo cards** (cropped from the reference art itself:
  Mealworms / Superworms / Crickets / Roaches / Treats), QUANTITY −10+ stepper,
  SUPPLEMENT dropdown (Calcium + D3 · "Light dusting"), honest NEXT FEEDING
  readout, 🎬 Cinematic + green Start Feeding CTA, ✕ close, no slim nav (per
  ref). **Real nutrition** (`LizardNutrition.ts`, TDD): per-insect satiety/fat/
  calcium/moisture/role from real care sheets; new REAL animal stores —
  **calcium** (dusted feedings restore it; deficiency erodes health = MBD risk)
  and **body condition** (fatty treats push it up; obesity erodes health) —
  both shown in Animal Info; meal moisture supports hydration. **Staged
  presentations with per-method CAMERAS** (`ThreeFeedingPresentation` + a
  generic renderer `cameraOverride()` hook): quick toss arcs from the screen
  top (overview shot), automatic dish pour (dish close-up), **PLAYER-STEERED
  tongs** (they follow the pointer, insect wiggling in the tips — the gecko
  chases + strikes them; sessions cap at real appetite and end early when it's
  full), keeper's-hand feeding (eats off the palm); the camera glides back to
  the player's view afterwards. **Dish physics**: capacity from the dish's real
  measured size, smooth walls pen worms/roaches forever, **crickets jump out**
  (more when the gecko looms). **Prey AI + insect collisions**
  (`InsectBehavior.ts`, TDD): freeze/flee-bursts/wall-tangent steering/panic
  jumps/stamina; pairwise separation + push-out of the gecko's body probes (it
  never walks THROUGH an insect); distinct per-kind procedural insect models
  coloured from the photos. **Pointer feedback**: the reference's dashed teal
  placement ellipse rides the sand in feed mode (cursor hidden; red + reason
  when invalid; snaps to the dish), gecko hover = glow ring + pointer.
  **Cinematic mode** (new pure mode-machine state): full-screen letterboxed
  slow follow-orbit framing gecko + prey, Esc exits. **Track Intake**:
  persisted feeding log with photo thumbnails + diet-balance meters + real
  advice. Main HUD sized up ~15% (stat strip + dock). Fixed en route:
  `feederAnchor` never matched the authored food dish (dish serving silently
  fell back to the feeding zone). Live-proven numbers: quick-served 10
  mealworms → hunger 69→93 (exactly 2 × 12 satiety, then full-stop, leftovers
  roam); steered tongs → 2 crickets taken (68→94.7); dish 10/10 contained,
  "holds 10" from real geometry; jump-outs while the gecko loomed. typecheck +
  build + **284 tests** (nutrition 12, dish 9, insects 10, uimode 17); **0
  console errors/warnings**; fish 3D + 2D regression-checked. Screenshots:
  `screenshots/ui_reference_match/feed_*.png`.
- ✅ **Main-screen PERFECTION sub-pass (v7.1)** — the gecko MAIN screen now
  matches its reference exactly: a REAL leopard-gecko portrait
  (`public/assets/ui/gecko_portrait_01.png`, cropped from the reference art)
  in the identity card + Animal-Info photo; a designed **SVG icon set**
  (`src/ui/gwIcons.ts`: bowl / angled broom / sprout / twin dunes / top-view
  gecko dock icons, colored stat glyphs, camera/menu/sliders/leaf/chart
  chrome) replaces every emoji; reference-exact sizing (64px thumb, 40px score
  number, 60px ring with leaf, 3-row stat items: icon+label / bar / status
  word + live value, always-on dock dots, "Enhance habitat"/"Sandy Desert"
  subtitles, identity card sans details-button per the ref). **Stat accuracy
  proven through the UI**: feeding moved Hunger 0→53% + Stress 23→5% +
  Comfort 89→98% and made real dirt; wet patches moved Humidity 40→49% +
  Hydration 89→95%; TDD'd hunger-pacing fix (`hungerDrainPerSec` 0.3 →
  0.02/s — a meal now holds for a session instead of emptying in ~5 min, so
  the Hunger stat reads TRUE; verified live 40%→38% over a minute). QA gotcha
  found: `__lizard.waterFrac()` reads a lagging cache — read live values from
  `sculptTool(...)`'s returned terrainStats. typecheck + build + **250
  tests**; 0 console errors/warnings. Screenshot:
  `screenshots/ui_reference_match/gecko_main.png`.
- ✅ **UI REFERENCE-MATCH pass (v7)** — the gecko habitat now runs the GLASSWATER
  game UI from the 10 mockups in `Designs/Gecko/` (which image controls which
  screen: `docs/production/DESIGN_REFERENCE_MAP.md`). A pure, unit-tested **mode
  machine** (`src/ui/gwModes.ts`) owns the seven modes (gecko-main / feed /
  clean / terrain / decorate / animal-info / photo): `regionsFor(mode)` declares
  which regions show, Esc always returns to gecko-main, re-requesting toggles
  off, and `app.applyUiMode` is the ONE place a mode change touches the world —
  so two drawers can never fight. A shared **`.gw-*` design system**
  (`src/ui/gwTheme.ts` — dark rounded glass, green active glow, amber badges,
  styled sliders/steppers/segmented controls) styles the whole layer. Main HUD
  (`lizardHud.ts` rewritten): top-left identity card (name + species +
  *Eublepharis macularius* + Desert/Warm/Lowlands pills + View Habitat
  Details), top-right score card (big green number + rating + SVG progress ring
  + breakdown flyout), 📷 photo button, 8-stat bottom strip (icon + bar +
  status word + live value), large action dock (Feed/Clean/Decorate/Terrain/
  Animal Info with live subtitles + notification dots) flanked by ☰ event-log +
  ⚙ camera/overlays/help flyouts; in drawer modes the dock swaps for a slim
  green-underline nav, and the habitat view-switch docks top-centre. Bottom
  **drawers** (`gwDrawers.ts`, replaces CareModeBar): Cleaning (Spot Clean /
  Brush Sand brushes + one-click Wipe Glass / Refresh Water / Remove Waste,
  live badges, cleanliness meter, **amber rings over the real dirty spots** via
  the new pure `dirtSpots()` picker — TDD'd), Feeding (Quick / Place-in-Dish /
  Tong methods, 4 food cards, portion stepper, supplement segment, next-feeding
  readout, green Start Feeding CTA that really serves the portion at the dish /
  beside the gecko via new `feederAnchor()`/`geckoPosition()` accessors, full-
  gecko refusal honored), Terrain (Terrain/Materials tabs, 6 sculpt tools,
  material swatches — Desert Sand live, rest honestly "Coming soon", Brush Size
  + Intensity (1–3 real passes) + ⚡ Strong). **Decorate** reskinned to the
  reference bottom tray (category tabs + GLB-thumbnail carousel + search +
  Done) + left 2-column tool palette + floating inspector — every EditorHandle
  feature kept. **Animal Info** is the right-side panel (round photo, "Active &
  Exploring" status + caption, 10 live metrics with status words,
  recommendations, Feed/Focus/Habitat Details). **Photo mode**: compact top
  cards + free camera + hint pill; Esc re-anchors. Playwright-verified on a
  fresh load across every mode: dish feeding served 3 crickets (appetite 0→41),
  brush + Remove Waste raised cleanliness 74→77 live, Esc chains exact,
  fish 3D + 2D aquarium untouched, **0 console errors/warnings**. typecheck +
  build + **249 tests** (new `uimode.test.ts` 15, `dirtspots.test.ts` 5).
  Screenshots: `screenshots/ui_reference_match/`. Remaining (documented):
  aquarium keeps its earlier dark-glass HUD (reference stat-strip/dock
  conversion pending); no main-menu/hub screen exists yet to apply the hub
  reference; gecko thumb is an emoji tile until portrait art lands.
- ✅ **VIVARIUM SHELL rebuild + EnclosureSpec single source of truth (v6)** — the
  gecko enclosure is a clean premium terrarium FIXED in the eco-center room, and
  ONE pure derivation (`src/habitats/EnclosureSpec.ts`) now feeds every system:
  interior-inside-the-glass, **THE shared walk/placement/feeding rectangle**
  (navigation = decor placement = food drops, identical by construction — the old
  0.9×/0.98 framing inset is gone, bounds match the visible tank), frame/tray
  sizing, the terrain brush's glass apron, bedrock, camera target + home, stand
  and lamp mount. New **`ThreeVivariumShell.ts`** builds the physical tank from
  that spec: glass panes + dark corner posts + slim top band + subtle **screen
  top**, an opaque **base tray** whose lip rises just past the substrate line (no
  more cream bed side leaking below the rim; dunes stay visible), a **desert back
  panel** (kills the noisy see-through; pools the lamp glow), the **basking lamp
  CLAMPED on the screen** over the basking zone (hood/bulb/fixture-glow/drooping
  cable — no more floating hood), UVB tube + gauge discs, a **bedrock floor +
  sand skirt** (dug holes read as sand, never a hollow box), and a **wooden
  STAND** (real `aquarium.glb` cabinet, walnut-plinth fallback) + soft floor
  shadow. **`HabitatMigrate.ts`** heals saves on load: stale dimensions snap to
  the current catalog record, out-of-bounds objects/zones/equipment clamp inside
  (never deleted), idempotent; the camera reads from the spec, not the stale
  save. New **snout-slack reach** (`GeckoMovementController.reachGoal`): food
  dropped against the glass is hunted + eaten (body stands off the pane, snout
  covers the gap) — live-proven, 2 glass-hugging crickets eaten. **Dirt fixed at
  the root**: the overlay draws jittered ORGANIC blotches (aligned per-cell
  ellipses used to render a mechanical checkerboard when filthy) and the ambient
  rate dropped 0.0016 → 0.00008 /s (the whole floor used to saturate to max
  filth in ~10 minutes — the actual cause of the checker look); sand tiling
  widened 0.6 → 1.05 m + patch contrast softened. Playwright-verified: frame
  aligned front/left/top; dig stops at bedrock −0.07 (sandy hole), dune 0.234;
  brush refused at the apron; placement valid at 10/10 edge+corner probes,
  "Outside the enclosure" beyond; editor auto-frees + re-anchors the camera;
  presets exact; `sceneRotationY` 0; fish (unconstrained camera) + 2D untouched;
  save/reload keeps decor/terrain/camera; **0 console errors**. typecheck +
  build + **229 tests** (new `enclosure.test.ts` 15, `migrate.test.ts` 8, glass-
  feeding 2, dirt-pacing 1). Screenshots: `screenshots/vivarium_shell/`.
  Limitations: gauges are simple discs (float slightly against the back-right
  glass); the stand reuses the fish cabinet's art style; spider still uses the
  old minimal `ThreeEnclosure` shell (intentionally untouched).
- ✅ **Surface-aware GROUNDING + anchored camera + physical terrain (v5)** — the
  gecko now stands on **four FOOT CONTACTS** (new pure `GeckoFeet.ts` FootPlanner:
  distance-driven diagonal trot; PLANTED feet world-locked EXACTLY on the sampled
  surface — live-measured worst gap 0.0000 m across a full climb; STEPPING feet
  arc + land back on the surface; idle feet settle home; the placeholder's legs
  AIM at the live contacts so feet visibly touch terrain + decor). Body **pitch
  now comes from front-vs-rear foot heights and a NEW ROLL from left-vs-right**
  (one foot on a rock + one on sand ⇒ a natural lean; live: roll to 23°, pitch to
  44°, four planted feet at four different heights 0.108/0.150/0.168/0.251 m, all
  gap-0), eased + capped, applied YXZ (yaw→pitch→roll). New
  **`CollisionWorld.sampleSurfaceAt`** answers height/normal/slope/type
  (substrate/terrain/rock/hide/branch/dish)/objectId/walkable/climbable/tooSteep/
  fallback in one query. **Terrain became PHYSICAL**: the collision world holds a
  LIVE ground source over the sculpted height map (now bilinear) — walk height,
  foot contacts, navigation (losClear/isFree reject bare slopes > ~40° = 0.7 rad),
  decor placement ("The ground is too steep here"), feeder drops/wander heights
  all react to the brush with NO world rebuild; `sculptLimits(dims, strong)`
  raises the range (normal ~0.14 m; **⚡ Strong brush** ~0.23 m up + digging BELOW
  the default sand to a **bedrock limit** ~1 cm above the tank floor — the design
  answer to "can terrain go under the substrate": sculpt the substrate's TOP, dig
  depressions, never breach the glass); brush MASKS protect ground under props +
  a glass apron; sand mesh densified 96×64; the dirt/wet overlay is a draped
  terrain-following plane; pebbles re-seat; the gecko's blob shadow rides the
  sculpted sand. Live-proven: dune 0.234 m (≈3× the old cap), hole −0.07 m stopped
  at bedrock, terrain survives save/load. **Camera**: the lizard's normal view is
  an **anchored eco-center camera** (OrbitControls constrained to a ±0.75 rad yaw
  window + polar band [0.55, 1.5] + zoom [1.5, 6] + orbit target clamped inside
  the tank — a huge fling clamps at exactly 0.75; `sceneRotationY` stays 0), a
  **camera bar** (Front/Left/Right/Top presets + Focus Gecko + Reset) with fling-
  momentum flushing so presets land exactly, and **📷 Photo Mode** restores the
  free orbit (proven to 189°); the Decorate editor auto-frees + re-anchors on
  exit; fish + spider cameras untouched. **Debug menu** (🐾 Debug ▾ beside View
  Collisions): foot-contact markers (green planted / yellow stepping / red
  no-contact) + surface-normal whiskers + a draped terrain heatmap (cyan
  depressions / amber dunes / red too-steep). QA hooks: `__lizard.feet()/roll()/
  sample()/terrainAt()/sculptStrong()`, `__habitat3d.azimuth()/polar()/
  constrained()/preset()/setCameraMode()`. typecheck + build + **203 tests** pass
  (new `terrain2.test.ts`, `surfacesampler.test.ts`, `feet.test.ts`); Playwright-
  verified live with **0 console errors/warnings** (lizard + fish 3D + 2D all
  checked). Screenshots: `screenshots/gecko_grounding/`. Limitations: the FINAL
  rigged GLB plays its clips without per-bone foot IK yet (the contacts are
  computed and ready to map to foot bones when the freelancer rig lands); props
  don't ride sculpted terrain (the brush masks the ground under them instead);
  steep-dune sand texture stretches slightly.
- ✅ **Exact SURFACE-HEIGHT collision (v4) — per-point heightfields** — collision
  now matches the asset **vertically** too, AAA-style. The v3 contours answered
  "where is the prop solid" but every prop still had ONE flat top: a sloped rock
  lifted the gecko to its max height everywhere, the arched driftwood's silhouette
  levitated the gecko standing under its elevated span, and the 0.12 m climb cap
  left half the body inside tall wood. Fixed with a **mesh-measured surface
  heightfield** per GLB (`HabitatFootprint.buildHeightField`: triangles → 112²
  grid keeping per-cell TOP + UNDERSIDE via barycentric interpolation + wall-vertex
  stamps + one value-dilation; bilinear `sampleHeightField`; per-asset-file
  registry — too heavy to persist per object). Compiled volumes carry the field +
  transform (`SurfaceRef`); `CollisionWorld.surfaceSpanAt` inverts scale→yaw→pos;
  `climbHeightAt(x, z, r, fromY)` now returns the TRUE local surface height and
  treats spans whose measured underside is > `PASS_UNDER_CLEARANCE` (0.1 m) above
  the animal as overhead → **walked under, never levitated onto**. The brain feeds
  its standing height in, the climb cap is a 0.6 m safety only, the lift ease gets
  a gap-proportional "mantle boost", and a new **`groundPitch`** (snout-vs-tail
  surface sampling, eased, applied YXZ in `ThreeAnimalController`) pitches the
  body nose-up/-down along slopes. The View-Collisions overlay draws each prop's
  measured surface as a translucent **lit shrink-wrap mesh** (per-rock heights
  visible; flat-top loops/struts remain only for data-less placeholders).
  Playwright-proven live: 31/31 volumes surfaced; driftwood standable lifts
  2.4→17.9 cm point-by-point with 9 genuine pass-under cells; rock-cluster lifts
  0.8→24.2 cm (low rocks low, tall side tall); steady-state body-vs-surface gap
  ≈ 1 mm while crossing; pitch to ±0.52 rad observed; gecko frozen mid-climb ON
  the wood for the visual gate; fish tank + 2D intact, 0 console errors.
  typecheck + build + **174 tests** pass (new `heightfield.test.ts` +
  `surface.test.ts`). See `HABITAT_EDITOR.md` §13 +
  `screenshots/surface_collision/`.
- ✅ **Exact-contour collision + interactive care (v3)** — the collision debug now
  **IS the asset silhouette**: `HabitatFootprint.traceContours` rasterises the
  mesh's FILLED triangles (128² grid, enclosed holes filled) and traces the
  boundary with **marching squares** → concave `poly` solver volumes (≤6 loops ×
  ≤56 pts each) that are the **single source** for collision, navigation,
  placement validity AND the View-Collisions overlay (translucent filled
  silhouette + crisp outline + faint top/struts) — with the mesh hidden, the
  debug still looks like the real rock/cave/dish/branch. Root cause of the old
  "primitive shapes" look found + fixed: a stale v1 localStorage save with no
  `asset` fields silently loaded placeholders → save **version 2**, `defId` on
  placed objects, `rehydrateLayoutAssets` self-heal. Perf: bounding-circle
  early-outs in the solver + one nav ring per prop (fixes a CPU wedge). Editor:
  **real GLB thumbnails** + a **real tinted-model ghost** (exact final
  scale/rotation/Y), full-transform **invalid snap-back** (move/rotate/scale/Y),
  PgUp/PgDn Y-keys, F-focus + Reset-Camera/Focus buttons, colour-coded
  interaction segments, Cancel-Placement bar, **hanging attachment rules**
  (mid-air vines invalid; deleting the support drops them). Care systems (pure
  models, unit-tested): **enterable hides** (the gecko walks in through the
  contour's open mouth and rests — shelter drive by stress + natural cadence),
  **local dirt map + Clean-Mode brush** (sparkle when spotless), **drag-drop Feed
  Mode** (cricket/mealworm/dubia/waxworm with distinct satiety/speed; full gecko
  won't eat; fatty-treat warning), **Terrain Mode** (raise/lower/smooth/flatten +
  wet patches → humidity/land-comfort), **wellbeing card** (12 live meters +
  recommendations), **shortcuts for everything + H help sheet** (D/B/F/T/C/H,
  1–6, [ ], Esc/Enter). typecheck + build + **162 tests** pass;
  Playwright-verified live (drop→hunt→eat observed, 0 console errors, fish tank +
  2D untouched). See `HABITAT_EDITOR.md`, `STATUS.md`,
  `screenshots/collision_contours/` + `screenshots/care_systems/`.
- ✅ **Habitat editor + collision v2 (accuracy, no-phasing, UX, hanging, info)** —
  a large follow-up pass on the lizard terrarium:
  - **Concave collision for roots/twigs/driftwood** — a new pure `HabitatFootprint`
    module traces each GLB's XZ silhouette and, when it's concave (fills < 82 % of
    its convex hull, measured via an interior flood-fill), decomposes it into a
    **multi-part set of tight rectangles** so the empty gaps between branches are no
    longer blocked. Compact props still use a tight convex hull; dishes stay circles.
  - **Animal no-phasing** — the gecko is now a chain of **compound body probes**
    (snout → tail); `resolveBody` pushes the whole silhouette out of hard decor +
    walls each frame, and `resolve` **sweeps** long moves so a dart can't tunnel a
    thin obstacle. Proven ≤ 1 cm residual across 5 000+ frames (pure test).
  - **View Collisions button + legend** — a visible toggle in the lizard HUD **and**
    the editor toolbar (C still works); a colour legend; the debug overlay now also
    draws the **animal's body probes**.
  - **Camera vs container** — confirmed + test-hooked: OrbitControls orbits the
    camera; the enclosure/scene never rotates (`sceneRotationY` stays 0). Home key
    resets the view; the info card can focus the animal.
  - **Planet-Zoo-style catalog** — sections (Rocks/Hides/Branches/Plants/Hanging/
    Dishes), search, filter chips, icon cards, a Build-Help sheet, and a live
    invalid-placement reason line.
  - **Y-axis / hanging placement** — placeables carry a `placement` mode; elevated/
    hanging props (Climbing Branch, Hanging Vine) get a Y gizmo handle + Height
    slider; overhead props above the gecko's head don't block the floor.
  - **Invalid placement** — red ghost + a reason ("Outside the enclosure", "Overlaps
    a solid object", "Too close to the gecko"); an invalid gizmo MOVE snaps back.
  - **Click the gecko → info card** (normal view + Decorate): behaviour, hunger/
    stress/health/comfort, environment, target, rig status + clips, warnings, and
    Feed / Focus / View-Collisions actions, with a highlight ring.
  - Fish tank + 2.5D aquarium untouched; final gecko drop-in path unchanged.
    typecheck + build + **118 tests** pass; Playwright-verified (0 console errors on
    a fresh load). See `HABITAT_EDITOR.md` §7 + screenshots/habitat_editor_v2/.
- ✅ **Habitat Editor (Decorate Mode) + mesh-footprint collision** — the Decorate
  button now opens a real editor (simplified **Unity/Unreal-style**, not Blender —
  catalog left, 3D viewport centre, transform gizmo, inspector right; three.js
  `TransformControls`, code-split into the 3D chunk). Player can **place** (click a
  catalog card → click the sand; ghost preview turns red on invalid drops),
  **select**, **move**, **rotate X·Y·Z** (simple = Y only; Advanced unlocks X/Z),
  **scale** (0.25–3× normal, 0.05–8× advanced/per-axis, hard cap 10×), **duplicate,
  delete, reset-transform, snap-to-floor, center, reset layout, undo/redo**, and
  change interaction type — with **W/E/R + Blender-ish hotkeys**; the layout
  saves/reloads. Collision is now **asset-derived**: a tight **convex-hull footprint
  measured from the real GLB mesh** (traces the silhouette — no oversized boxes;
  round dishes = tight circles; soft succulents don't hard-block), following
  position + full X/Y/Z rotation + per-axis scale live and rebuilding navigation +
  score; the debug overlay (**C**) traces the hull + a faint body-clearance offset.
  OrbitControls never fights a gizmo drag. Playwright-verified (place / rotate-X /
  scale-to-4× / persistence / hull tracing; fish tank + 2D untouched; 0 console
  errors); the gecko's feeding-reach across the real layout is proven by a pure sim
  test. typecheck + build + **118 tests** pass. See `HABITAT_EDITOR.md`.
- ✅ **Lizard terrarium: real decor art + smart animal navigation** — replaced the
  primitive placeholders with imported Tripo GLBs (rock cave, desert rock cluster/
  mound, driftwood, stone water + food dishes, 2 succulents; textures resized to
  1024²) under `public/assets/3d/habitats/lizard/decor/`, on a **procedural warm-
  sand floor** (tiling texture + dune displacement + scattered pebbles), with a warm
  basking glow + soft **contact shadows**. Added **interaction types** (`wall/
  blocked/climbable/lowObstacle/hide/softObstacle/feederZone`) and **smart
  navigation** (`HabitatNavigation` visibility-graph waypoint planner): the gecko
  **routes around** blocked obstacles, **climbs over** climbable driftwood/low rocks
  (eased lift), detects **stuck** (backs up + replans), and **gives up** on
  unreachable food (flags it, retries) — no more shoving into a stick forever.
  Feeding now spawns **reachable** crickets + warns if food is unreachable. HUD adds
  UVB/Light + Add Species. Placeholder gecko recoloured leopard-yellow so it reads
  on sand. Fish tank untouched; final gecko drop-in path + clip aliases unchanged.
  Playwright-verified (0 errors/warnings; real assets load, gecko roams/climbs/eats,
  collision debug colour-coded + matches assets, fish 2D+3D intact). typecheck +
  build + **62 tests** pass. See `LIZARD_HABITAT_PROTOTYPE.md` + `ANIMAL_ASSET_PIPELINE.md`.
- ✅ **Lizard habitat foundation (rig pending from a freelancer)** — rebuilt the
  3D lizard terrarium as a **reusable, data-driven, saveable habitat** so the
  final rigged/animated leopard gecko drops straight in. Pure `src/habitats/`
  model (types, **collision solver** circle/OBB/capsule with a never-phase-through
  guarantee, stats/score, layout ops, size presets + placeable catalog, per-
  habitat save/load, species care + compatibility) + Three.js bridge
  (`ThreeLizardScene` builds the "Sunstone Desert" terrarium from data;
  `ThreeAnimalController` drives a procedural **placeholder gecko** OR a rigged
  GLB; `ThreeAnimationController` maps clip aliases idle/move/turn/eat/rest/stress
  with graceful missing-clip fallbacks; collision debug viz via `?debugCollision=1`
  / **C**). **Feeding prototype** (crickets: spawn→hunt→eat→hunger + cooldown +
  events), **needs system**, and a **lizard HUD** (fish-tank UI untouched, hidden
  behind it in lizard mode). Final path: `public/assets/3d/habitats/lizard/
  leopard_gecko_animated.glb`. Removed old gecko design scratch files +
  `ThreeWalker.ts`. Playwright-verified (0 errors/warnings; gecko moves, stays in
  bounds, never phases through objects; Feed → eat → hunger up; fish tank intact).
  typecheck + build + **50 tests** pass. See `LIZARD_HABITAT_PROTOTYPE.md` +
  `ANIMAL_ASSET_PIPELINE.md`.
- ✅ **3D habitats AAA motion pass** — idle/walk/run clips blended by speed;
  **feet driven by distance travelled** (no foot-skate/glide); **spine/tail bend
  into turns** (procedural over the clip) + turn-while-stepping (no rigid
  spin-in-place); **cleaned/smoothed skin weights**; animals move more often;
  **bigger enclosures** + proportionate sizing; **OrbitControls** (middle-mouse
  rotate, wheel zoom) to view the tank from any side. Playwright-verified, 0
  errors. See `HABITAT_ANIMATION_COMPARISON.md` + `DECISIONS.md`.
- ✅ **Rigged spider + lizard walking (AAA pass)** — rigged both in Blender (via
  MCP): armature + automatic skin weights + hand-authored `walk`/`idle` clips,
  exported as `*_rigged.glb`, played via AnimationMixer (`ThreeRiggedController`,
  walk↔idle crossfade by speed). **Real stepping legs, body level (no bounce),
  clean skinning (no tearing).** Enclosures stripped to just the animal + floor.
  Playwright-verified (lizard excellent; spider's 8 legs articulate — auto-rig not
  perfect; fish regression + 2D fallback intact; 0 errors). typecheck/build/33
  tests pass.
- ✅ **Experimental 3D habitats expanded to spider + lizard** — generalized the
  renderer to multiple habitats (`HabitatScene` + `ThreeHabitatRenderer` + shared
  `ThreeEnclosure`/`ThreeGroundController`). Spider terrarium (bursty scuttle, no
  leg articulation — fused/unrigged) + leopard-gecko terrarium (lateral spine +
  tail-wave crawl, reads well). 4-way view switch; assets unify-to-one-body so
  nothing detaches. Playwright-verified (no detachment, fish regression + 2D
  fallback intact, 0 errors). Verdict: fish best, lizard strong, spider rig-gated.
  See `docs/production/HABITAT_ANIMATION_COMPARISON.md`.
- ✅ **Experimental hybrid 3D tank spike** — isolated Three.js viewport
  (`src/render/three/`, lazy-loaded) drawing only the central tank in 3D behind
  the unchanged 2D HUD; 2.5D Canvas tank stays the default + fallback. Procedural
  glass/water/caustics + cabinet stand + plant/log decor + 3 goldfish + 1 betta;
  steering AI (states, banking, depth, wall-avoid) + GPU body-wave tail swish.
  Source GLBs are Tripo **fused/unrigged** (no bones/fins) → true fin animation
  needs rigged/part-separated assets (next step). Toggle via `?tank=3d` or the
  on-screen button. Playwright-verified (fish swim X/Y/Z, turn, head-first, in
  bounds; UI + 2D fallback intact). typecheck + build clean. Details:
  `docs/production/THREE_D_TANK_SPIKE.md`.
- ✅ Git initialized; verified state committed as a checkpoint.
- ✅ Phase 0 setup (Vite/TS/structure, `.gitignore`, `.env.example`, asset
  tools) — formalized this session with CLAUDE.md + production docs.
- ✅ Phase 1 main aquarium screen — cozy room, wooden stand, procedural glass
  tank, layered aquascape (substrate + hardscape + plants), animated
  fish/shrimp/snails, bubbles/particles, full top bar + left/right panels +
  bottom actions + nav, save/load. Playwright-verified earlier (habitat score
  ~92–95, closely matches reference).
- ✅ Phase 2 core sim — deterministic nitrogen cycle (ammonia→nitrite→nitrate),
  feeding/waste, filtration/plant export, water change; verified live (overfeed
  raised ammonia, water change cut nitrate/ammonia, leaves deducted).
- ✅ Phase 3 gloss + animation pass — Playwright-verified glossy glass + live
  creature motion. Removed the `tank_glass.png` photo overlay (it stamped a
  mismatched inner outline) and the floating name plate; cleared the water
  (reduced depth-haze/caustics/god-rays).
- ✅ Real fish swimming: **sliced sprite deformation** (`fishDeformation.ts`) +
  per-species `swim.ts` profiles + idle/cruise/dart steering in `tankScene`
  (body bend, tail swish, head-led smooth turns, feeding darts). Upscaled fish
  art installed (betta centerpiece, rasbora, cory, guppy, platy).
- ✅ Phase 2 foundation closed out: **vitest harness, 33 tests passing**;
  `resetSimState()` determinism fix; **22-species `aquaticCodex.ts`** mined from
  the stats bible with `species.ts` deriving from it (consistency tested).
- ⏳ Not started: Decorate/habitat editor (Phase 4), collection/shop/add-species
  (Phase 5), breeding/morphs (Phase 6), rescue (Phase 7), eco-center hub
  (Phase 8), more habitats (Phase 9), audio/QA polish (Phase 10). Remaining data:
  mine plant/hardscape (and later land-animal) stats from the second `.docx`.

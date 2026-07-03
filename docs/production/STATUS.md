# STATUS — GLASSWATER

## TERRAIN EDITOR v3: TRUE MATERIAL PAINTING + 10 LENSES (v10.4) — 2026-07-02

- **PHYSICAL substrate painting** — the flagship: a per-cell material map
  (`src/habitats/HabitatMaterialMap.ts`, pure + 9 tests, persisted on
  `HabitatState.materials`) + a **composite floor texture**
  (`MaterialFloor` in ThreeSandTexture: full-floor canvas whose pixels copy
  from each material's procedural tile with hash-jittered cell lookups →
  ragged hand-painted boundaries; strokes repaint only the brushed region).
  Dragging the Paint brush lays the ARMED material exactly where you stroke
  — live-proven: a drag painted 167 clay cells into 2393 sand cells, visible
  as a ragged band on the floor, **persisted through reload** (82.9/17.1
  coverage after cold boot), then swept back to 100% sahara. Stroke-end
  commits dominant substrate + bed tint + coverage-WEIGHTED humidity blend +
  one event + save. Dock label reads "Mixed substrate" when dominance < 70%.
  QA: `__lizard.paintMaterial(id,x,z,r)` / `materialCoverage()`.
- **Tool grid 4×2, all full-size** (Wet/Dry no longer crammed half-pairs):
  Raise · Lower · Smooth · **Flatten** (re-added, levels without drying) ·
  Erase · Paint · Wet · Dry. The context card gained a **husbandry TIP strip**
  per tool (registry `tip`) alongside the live Relief/Damp meters.
- **No camera hijack**: entering the editor leaves the player's camera
  exactly where it was (verified azimuth/polar unchanged); the compact drawer
  leaves ~258 paintable sand points visible at the default view.
- **Filters: 10 lenses** in a compact 2-column grid (short labels, full name
  in the title): + **Comfort** (JWE-style composite — warmth × cover × clean;
  score = the LIVE comfort stat, 89 verified) and **Enrichment** (Planet-Zoo
  style — climbables/hides/dig space; score = the LIVE wellbeing.enrichment
  meter, 87 verified). Main column redesigned: **score HERO on top** (big
  number + status + tone-tinted progress ring with the filter's icon +
  full-width bar + recommendation) with the verdict + View Details card
  beneath. Minimap floor now draws the PAINTED material cells per cell.
- typecheck + build + **402 tests**; Playwright: paint/persist/restore, all
  10 lenses live, tool grid + tips, camera unchanged, sibling modes + fish
  3D + 2D intact, **0 console errors**. Screenshots:
  `screenshots/ui_reference_match/editor_v3_*.png`.

## TERRAIN EDITOR v2: COMPACT + PAINT-TO-APPLY + EXACT LIVE FILTERS (v10.3) — 2026-07-02

- **The editor box shrank to ~24% of the screen** (was ~42%): a 2-column tool
  grid (Raise · Lower · Smooth · Erase · Paint + the Wet/Dry half-pair) beside
  a TOOL-CONTEXTUAL right panel — sculpt tools show a context card (big tinted
  icon, what the brush does, LIVE Relief-cm + Damp-% meters); the **materials
  only appear on the Paint tool**. Select was CUT (it had no job the main
  screen doesn't already do). Tabs stay exactly Terrain · Filters.
- **Substrates apply by PAINTING, never by clicking**: a tile click only ARMS
  the material (amber "Selected", hint "Drag on the sand to lay it down");
  the Paint brush stroke commits it (applySubstrate → floor re-skins, save,
  event, chime). Live-proven: click → save still `sahara_sand`; stroke →
  `desert_clay` + "New substrate laid down". Apply/Revert buttons removed;
  `previewSubstrate`/`revertSubstratePreview` deleted from the controller.
- **Filters are now EXACT to the vivarium** — fields sample the same
  collision/sim queries the gecko uses: hide interiors via
  `sampleSurfaceAt().type === "hide"`, roof cover + lamp shade via
  `hardTopAt`, blocked ground via `isFree` (marching-squares contours),
  digging via the brush's own `sculptMask` + real slopes, traffic via a
  BFS flood from the gecko, heat = the sim's coolC→baskingC gradient
  (real °C), humidity = the exact wet-cell mask, and a **new CLEANLINESS
  filter** reading the live dirt map (readout = env.cleanliness EXACTLY —
  verified 15 = 15 — plus the real droppings count in the verdict). 8 filters
  total; readouts + minimap refresh ~1×/s live and the wash drapes sculpted
  dunes (`applyTerrain` on the analysis decal).
- **AAA wash + minimap v2**: the on-tank wash renders blur-smoothed (no pixel
  blocks) with value-shaped alpha and an edge fade before the glass; the
  minimap is a real floor plan at 2× — substrate-toned base, the EXACT
  hide-wall C-contours + rock silhouettes (solver polys), the water dish
  tinted teal, wet patches, dirt, and the gecko as a live marker. A painted
  wet patch appears in the same spot on the tank, the wash and the map.
- Playwright-verified end to end: drawer 220px/24%, arm→paint flow, erase
  cleanup, all 8 filters + live scores, tab exclusivity, sibling modes +
  fish 3D + 2D intact, **0 console errors**. typecheck + build + **393
  tests**. Screenshots: `screenshots/ui_reference_match/editor_v2_*.png`.

## TERRAIN EDITOR: TWO TABS + FILTERS ANALYSIS + BRUSH CURSOR (v10.2) — 2026-07-02

- The Terrain editor now matches the two FINAL reference images
  (`Designs/Gecko/…04_54_24 PM.png` Terrain · `…04_54_42 PM.png` Filters) and
  carries exactly **two tabs: Terrain · Filters** (the Decorate jump tab and
  every other category tab are gone — those live elsewhere in the game).
- **TERRAIN tab** — reference layout: single-column left tool stack **Select ·
  Paint · Raise · Lower · Smooth · Erase** (+ a compact Wet/Dry pair keeping
  the humidity brushes; all from the new pure registry
  `src/data/terrainTools.ts`), the Materials photo tiles (label inside the
  card outline per the new ref), the selected-substrate info card, and the
  bottom row **Brush Size · Intensity % · ⚡ Brush Mode chip (Soft/Normal/
  Strong — Strong = the bedrock/tall-dune limits) · round reset**. Tools are
  REAL: sculpt strength = Intensity × mode (scene `sculptAt` gained
  `strength`), **Erase = the reset brush** (flatten + dry in one stroke —
  live-proven: relief 0.0056 → 0.00001, wet 0.0063 → 0), Select = inspect
  (click the gecko → info card), Paint lays the selected material (habitat-
  wide — substrate is one material today; per-cell painting is a marked TODO).
- **In-world BRUSH CURSOR** (`TerrainBrushCursor` in ThreeTerrainOverlay):
  soft white double ring sized to the brush radius + a green centre badge
  carrying the active tool's glyph, draped on the substrate, hidden outside
  the enclosure; the OS cursor hides over the sand. The editor auto-raises
  the camera to the Top vantage on entry (floor visible above the drawer,
  same pattern as Decorate) and re-anchors home on exit.
- **FILTERS tab** — a real habitat-analysis system on the new pure registry
  `src/data/habitatFilters.ts` (7 filters: Heat, Humidity, Hide Coverage,
  Clutter, Dig Zones, Traffic Flow, Lighting — copy, tints, colour ramps,
  legends, tips, recommendations; `filterStatus`/`scaleColor` unit-tested).
  The scene paints a **soft draped analysis wash** over the habitat
  (`AnalysisOverlay` — per-cell fields from the LIVE systems: basking zone,
  wet map, decor volumes + hide interactions, sculpt mask + slopes, a
  reachability flood from the gecko, lamp/UVB), with **Overlay Opacity /
  Intensity** sliders and **Reset Filters**. Main content = score card
  (live `filterReadout`: hidingSpots subscore, env bands, decor coverage,
  diggable fraction, reach fraction, lamp+UVB) + status word + recommendation
  + verdict sentence + **View Details** (opens the score breakdown), a
  **gradient legend** + **top-down analysis minimap** (field + decor blobs),
  and an ABOUT THIS FILTER panel with the amber TIPS card. All 7 filters
  switch live (scores 92–100 on this thriving save, honestly derived).
- Playwright-verified end to end: two tabs only, tool selection, materials
  preview/apply intact, brush ring on the sand, all 7 filters + wash +
  minimap + reset, Esc chains, sibling modes + fish 3D + 2D intact,
  **0 console errors**. typecheck + build + **392 tests** (new
  `filters.test.ts` 9, `terraintools.test.ts` 5). Screenshots:
  `screenshots/ui_reference_match/editor_*.png`.

## TERRAIN UI REFERENCE-MATCH + REAL SUBSTRATE MATERIALS (v10.1) — 2026-07-02

- The Terrain drawer now matches its design reference (`Designs/Gecko/…03_04_31
  PM (7).png`) instead of the old two-tab placeholder: **tab pills riding the
  drawer's top edge** (Terrain active · Decorate jumps to Decorate mode), a
  **floating 2-column sculpt-tool palette** (6 designed SVG icons — raise/
  lower/smooth/flatten/wet/dry; active card = green-filled, reference-style),
  an **always-visible MATERIALS row of 8 real photo tiles** (cropped from the
  reference art itself into `public/assets/ui/terrain/`, food-card style),
  a **selected-substrate info strip** (description · tag pills · five mini
  stat meters Heat/Humidity/Digging/Clean/Bioactive · Apply/Revert CTA ·
  "✓ Current" state), **slider pills** (designed brush-ring + intensity icons,
  px/soft readouts), the ⚡ Strong chip and a **round brush-reset button**.
  Drawer header: designed dune icon + "Shape the floor of your habitat." + a
  live current-substrate chip (mini swatch + name).
- **Substrates are REAL now, not "Coming soon"**: a data-driven registry
  (`src/data/terrains.ts` — 8 terrains: Sahara Sand, Soft Dune Sand, Desert
  Clay, Rocky Mix, Pebble Gravel, Dune Ridge unlocked for the desert;
  Bioactive Soil + Mossy Soil locked "Future habitat" for humid builds) feeds
  the tiles, the info strip, a **per-terrain procedural sand palette**
  (`makeSandTexture(size, palette)`), the bedrock/skirt tint
  (`retintSubstrateBed`), and the **ambient humidity model**
  (`humidityBase + waterFrac·95·humidityHold` — Sahara 38%, Clay 41%,
  Pebble 36%, live-verified through the stat strip).
- **Preview → Apply → Revert** flow on a pure, tested `SubstrateSelection`
  model (`src/ui/substrateSelection.ts`): clicking a tile re-skins the floor
  live (amber "Previewing" state), Apply commits (layout.substrate gains
  `terrainId`, event log "New substrate laid down: …", chime, save), Revert or
  leaving the drawer restores the applied look; locked tiles are inspectable
  (info + lock badge + honest note) but never preview or apply. The applied
  terrain **persists through reload** (buildTerrarium reads `terrainId`; the
  dropped-in `sand_substrate_01.png` override now only applies to the default
  Sahara look). Terrain dock-card subtitle = live substrate name.
- Playwright-verified: preview/apply/revert + Esc-revert live; Desert Clay
  survived a cold reload; locked Mossy Soil refused honestly; sculpt brush +
  hotkeys unchanged; feed/clean/decorate/animal-info/photo cycle intact; fish
  3D + 2D aquarium untouched; **0 console errors**. typecheck + build +
  **378 tests** (new `terrains.test.ts` 12, `substrate.test.ts` 9).
  Screenshots: `screenshots/ui_reference_match/terrain_*.png`.

## SELF-MADE CREATURE BATCH v1 — 10 REAL ANIMALS (v10) — 2026-07-02

- The first 10 self-made Tripo animals are REAL in-game creatures on a
  data-driven foundation: **feeder cricket, cherry shrimp, nerite snail, neon
  tetra, guppy, zebra danio, otocinclus, mystery snail, daphnia, isopod**.
  Full write-up: `docs/production/CREATURE_BATCH.md`.
- **Registry** (`src/data/creatures/` — types + 10 complete entries, pure
  data, JSON-round-trip tested): identity, tiers/difficulty/rarity, UI +
  encyclopedia text, asset config, movement tuning, animation profile, tight
  collision, diet/care/ecosystem roles, social + group minimums (tetra/danio
  6), personality/habits/states/triggers, environment + needs bands, the full
  0-100 stat block + species special stats, ecosystem effects, spawn
  defaults, 2D-codex links (7 species).
- **Anatomy from geometry**: `PartClassifier` (pure) reads each GLB's
  measured part bounds into roles (body/head/tail/fins/legs/antennae/
  eyestalks/shell/foot) — tested against REAL fixtures generated by the new
  `tools/inspect-glb.mjs`; registry `partOverrides` pin the stragglers.
- **Loader + part animator**: joint re-pivoted parts (tails hinge at the
  body, legs at the hip, antennae at the base), normalization (faces +Z, real
  bodyLength, belly/centre origin, tamed materials), data-driven oscillators
  (swim wag, fin flutter, leg scurry, antenna/eyestalk sway, snail foot
  stretch, daphnia oar pulse, shrimp escape curl). Parts can never drift —
  absolute-set from captured base transforms (a body-pivot overwrite bug WAS
  caught live on the Lab bench and fixed).
- **Shared controllers**: schoolFish (boids-lite FlockMath, pure + tested;
  danio bursts, guppy hover), surfaceGrazer (oto attaches belly-to-glass,
  short repositioning swims), shrimpCrawler (graze + backward escape flick),
  snailGlider (floor + glass climbing, eased orientation), microSwarm
  (daphnia pulse-hop cloud, flees fish), isopodCrawler (shelters by decor,
  flees the gecko, **genuinely cleans the dirt map while foraging**), cricket
  = existing tested prey sim wearing the REAL GLB (procedural fallback kept;
  tongs/palm presentation shares it).
- **In game**: the 3D aquarium spawns the registry default population (33
  creatures incl. two schools of 6) alongside the goldfish/betta; the gecko
  vivarium feeds REAL crickets (`__lizard.cricketVisual()` → "glb") and hosts
  a 5-isopod bioactive colony; the DEV **Creature Lab** (`?habitat=creatures`,
  URL-only, never persisted) shows a labelled specimen bench + live stations +
  spawn/codex panel.
- Playwright-verified: all 10 load/move/stay in bounds, no detachment, 0
  console errors; fish 3D + 2D + gecko (bodyPen 0) + spider intact. Gates:
  typecheck + build clean, **357 tests** (registry 15, classifier-vs-real-
  fixtures 11, flock 6 — TDD RED→GREEN). Screenshots:
  `screenshots/creatures/`.

## CLEANING TOOLS + INTERACTIVE GLASS WIPING + SLOWER DIRT (v9.7) — 2026-07-02

- **Dirt pacing relaxed** (user feedback: too fast): hotspot rate 0.02 →
  0.006/s — a lingering gecko needs ~half a minute of solid sitting before a
  visible spot forms (droppings still foul fast via their 1.4× weight);
  ambient film unchanged (~3.5 h). Pacing test re-sized to match.
- **Professional PER-TOOL cleaning tools** replace the sponge cursor: a steel
  sand SCOOP with a teal soft-grip (Spot Clean), a walnut-handled hand BRUSH
  with brass ferrule + straw bristles (Brush Sand), and a SQUEEGEE with a
  rubber blade (Wipe Glass). Each has its own work animation — the scoop digs
  in dipping strokes, the brush sweeps with quick tilts + dust, the squeegee
  drags with blade squash — and its own reach-ring tint matching its card.
- **INTERACTIVE WINDOW CLEANING**: the front pane now carries a real SMUDGE
  layer (`ThreeGlassSmudge` — canvas texture: dusty streaks, smears, and paw
  prints the gecko leaves when it walks along the front glass; more build up
  slowly over time). Wipe Glass is a DRAG TOOL: the squeegee rides the pane
  under the pointer (raycast via the new `pointAtZ`), strokes wipe the
  smudges (firm blade core, feathered rim), throttled squeaks while wiping,
  and when the pane is nearly spotless the next stroke FINISHES it (chore
  forgiveness) → sheen sweep + done chime + "Squeaky clean!" event + the
  "Crystal clear" pill (coverage-driven, honest). Live-proven: coverage
  0.057 → 0 across six wipe passes, squeaks + done chime in `__sfxLog`, pill
  flipped. QA `__lizard.glassCover()`.
- The one-click Wipe Glass action is gone (the card SELECTS the tool);
  Replace Water + Remove Waste stay one-click. Contextual footer guidance per
  tool. Gates: typecheck + build clean, **325 tests**, fish 3D + 2D intact,
  0 console errors.

## CLEANING MODE POLISH — REFERENCE UI + SFX + REAL ACTIONS (v9.6) — 2026-07-02

The Clean section is now reference-exact, audible, animated, and every action
does a real distinct thing:

- **UI = the reference** (`03_22_09 PM.png`): green SVG broom header ("Cleaning
  Mode — Keep your habitat healthy"), FIVE tool cards in the reference anatomy
  (colored SVG icon + title + 2-line description + live status pill; selected =
  green outline + ✓): Spot Clean (green target), Brush Sand (amber broom),
  Replace Water (blue drop), Remove Waste (amber bag), Wipe Glass (cyan pane).
  Honest live pills: "N spots detected" / "N areas dusty" / "Water quality:
  Good·Fair·Replace soon" (real freshness timer) / "N items ready" (real
  droppings count) / "A little smudged"·"Crystal clear" (wipe timer). Meter +
  brush size in the footer; action cards get a press animation.
- **The cursor is GONE over the sand**: a 3D SPONGE TOOL (two-tone sponge + a
  soft green reach ring sized to the brush) rides the surface instead — idle it
  bobs; while scrubbing it tilts, jitters and sheds sand-dust puffs.
- **SOUND** (`src/render/sfx.ts` — 100% procedural WebAudio, zero asset files,
  nothing to license → Steam-safe): looped brush scrub while dragging, sparkle
  ping when a dirty spot comes clean, pop per dropping scooped, two-note DONE
  chime, water pour + bubbles for Replace Water, glass squeak for Wipe Glass.
  QA: `window.__sfxLog` records every trigger (verified headless).
- **Every action is real now**: REMOVE WASTE scoops EVERY dropping (poof + pop
  each, its dirt patch scrubbed, falls back to the dirtiest spot when
  poop-free) — the poop-pickup fix (live: 9 droppings → 0 in one click);
  REPLACE WATER sparkles at the water dish + resets the freshness timer (was a
  generic tidy before); WIPE GLASS sweeps a sheen highlight across the front
  pane + a light overall tidy. Scrubbing with the brush still picks droppings
  up too.
- Extra Steam polish: favicon added (inline SVG — killed the console 404).
- Verified live: cursor "none" over sand in clean mode + restored on Esc; sfx
  log `brushStart→brushStop, pop×9, done, water, squeak`; pills flipped to
  "Water quality: Good" / "Nothing to remove" / "Crystal clear" after the
  actions; screenshots `clean_mode_v2.png`, `clean_scrub.png` (visible scrub
  trail + amber spot rings), `clean_actions.png`. Gates: typecheck + build
  clean, **325 tests**, fish 3D + 2D intact, **0 console errors**.

## STRANDED-ON-ROCK FIX (v9.5.1) — 2026-07-02

The gecko could get carried onto a rock crown navigation would never route
onto — and then be stuck there forever (every path plan from an "illegal"
standing cell fails). Root cause: `tooTallAt` (the per-point mantle ceiling)
gated NAVIGATION only; the FEET happily planted on too-tall cells, and with
the body riding the feet (v9.5), each step up the tall side carried it higher.
Fixes, both TDD'd (`vertical.test.ts` ×3):

- **Feet refuse too-tall landings** (`tooTallAt` now public; the brain's
  `clampFoot` walks a too-tall landing back toward the body — a paw never
  steps past the mantle ceiling, so the body can never be carried up there).
- **`escapeStrand()`**: if the gecko IS standing somewhere nav-illegal (old
  saves, edits), `giveUp()` now walks it STRAIGHT to the nearest legal free
  ground (motion resolver keeps the descent honest) instead of looping
  stuck-recoveries forever.
- Regression test: a 0.3 m crown (above MAX_CLIMB 0.22) between the gecko and
  its goal — it routes AROUND, climb height never exceeds the ceiling, arrives,
  and ends on legal ground. Live: the user's stuck save loaded with the gecko
  ON the rock (climb 0.064) — it climbed down within seconds, resumed normal
  behaviour (idles in character, hunt burst at 0.88 speed), pen 0. Gates:
  typecheck + build clean, **325 tests**, fish 3D + 2D intact, 0 console errors.

## SMOOTH CLIMBING — FEET-DRIVEN BODY (v9.5) — 2026-07-02

Rock climbing rebuilt on the standard AAA quadruped rule: **the body goes where
the feet are.** The v9.4 no-phase floor rode the highest surface under ANY body
part — so on a climb the root hovered at crest height while the feet were still
planted low (legs at full stretch, "extending without touching", and popping).
Now, per frame:

- **Root height = the mean of the four foot-contact surfaces** (`pose.mean`) —
  legs can never overextend by construction; ascent/descent is a smooth ride up
  the contacts as each foot finds higher/lower rock.
- **The pitched spine does the ledge work**: pitch/roll from the front-vs-rear /
  left-vs-right contact pairs (climb pitch cap 0.85→0.9 rad = a max-climb step
  across the wheelbase), plus a **PITCH ASSIST** — facing a tall step the head
  REARS UP along the face (anticipating a stride ahead, easing faster than the
  lift) instead of the body hoisting; only what pitch can't reach becomes lift.
- **The no-phase guarantee stays absolute but got smarter**: (a) it constrains
  PROP material only — the belly rests on and the tail drags across the SAND
  naturally (guarding parts against bare ground was half the stilts); (b) the
  TAIL is exempt vertically (flexible — it drapes down a face behind the body;
  still collides sideways) — this killed a multi-second hover after every
  descent; (c) the need splits into needNow (real penetration → hard-clamped ≤
  8 mm) and needSoft (travel-anticipated → EASE-ONLY pre-rise), with a decaying
  hold-floor so the feet-mean ease can't saw against the clearance floor.
- **Motion-warped mantle**: while actively lifting over a step AHEAD, forward
  speed brakes to ~25% (push UP, then continue) — but never on departures
  (hips resting on the crest lip while walking off). The gait gets a TIME-based
  `phaseBoost` while mantling (a distance-driven clock would freeze the feet at
  brake speeds) + short high steps on climbs (stride ×0.62, lift ×1.5).
- TDD (`vertical.test.ts`, now 2): full mesa crossing asserts (a) no part ever
  below the PROP mesh (> −0.02 m incl. transients), (b) body never more than
  6 cm above its highest SUPPORT (foot or torso-on-lip contact) and height
  never jumps more than 12 mm/frame. Live: perch climb smooth (≈6 mm/frame),
  body BETWEEN its contacts, bodyPen 0, partClear ≥ −0.016 m, fish 3D + 2D
  intact, 0 console errors. Gates: typecheck + build clean, **324 tests**.

## TOILETING + VERTICAL NO-PHASE GUARANTEE (v9.4) — 2026-07-01

- **VERTICAL NO-PHASE GUARANTEE** (TDD `vertical.test.ts`): the pitched body
  line (snout → tail) could stab INTO a rock face while stepping off a ledge —
  measured live at −0.16 m (a part 16 cm inside the mesa fixture). Now, after
  the final pitch/roll each frame, EVERY body probe's height along the pitched
  spine is checked against the mesh surface under it and the body lift is
  HARD-FLOORED (instant raise, eased lowering): stepping off a ledge the body
  holds its height until the trailing parts clear the crest; a nose-first
  climb rears up before the head could enter the face. It is geometrically
  impossible for any part to dip into a mesh (worst-case grace = 8 mm belly
  contact). QA `__lizard.partClear()` — live −0.008 m worst across full climb +
  toilet trips (= exactly the contact grace, zero penetration).
- **TOILETING** (`LizardDigestion.ts` pure + TDD ×4, `ThreeDroppings.ts`): true
  to the species — leopard geckos pick ONE bathroom corner and defecate there
  consistently, producing a dark pellet with a WHITE URATE CAP (solid urine —
  desert water-saving). Meals fill a digest store (wired into `consumeFeeder`);
  past a threshold a 70–140 s digestion timer arms; when due, the gecko walks
  to its chosen corner (picked once = the enclosure corner FARTHEST from hides
  + dishes, persisted on the save), SQUATS ~2.4 s (rest-pose lower + stillness)
  and deposits a dropping behind its tail. Droppings are real persisted meshes
  that foul their spot (strong dirt hotspots → cleanliness falls, Clean badge
  reacts) until the keeper removes them — the spot brush AND Remove Waste both
  scoop them (`cleanDroppingsAt` wired into `brushClean`, which Remove Waste
  drives). Toilet trips interrupt hunting (biology first; only an active bite/
  panic/recovery finishes first), and a feast yields SPACED trips (the delay
  re-arms per load). Live-proven: walked to the corner, squatted, dropping
  appeared; SECOND trip to the SAME corner 0.01 m away (the habit!); brush
  removed 2/2; droppings survive save/reload. QA `__lizard.poopNow()/
  droppingList()`. Events: "chose a bathroom corner — geckos really do that!"
- Gates: typecheck + build clean, **323 tests** (new `vertical.test.ts` 1,
  `digestion.test.ts` 4), fish 3D + 2D intact, **0 console errors**.

## INTELLIGENT, LIFELIKE MOVEMENT (v9.3) — 2026-07-01

The gecko now moves like a real leopard gecko (an ambush hunter, not a jogger),
uses the decor the way real animals do, and the dish is physically honest:

- **Stalk → creep → strike DASH hunting** (`GECKO_MOVEMENT` + huntTick, TDD):
  full deliberate walk far out; inside ~0.55 m a slow CREEP (0.42×) with
  motionless FREEZE beats (0.25–0.6 s, real stalk pauses); inside 0.3 m, facing
  the prey with a clear line, a short EXPLOSIVE dash (2.5× walk, burst
  acceleration — the strike). Leopard geckos are sit-and-wait predators; the
  research answer to "does it run a lot?" is no — it walks deliberately, then
  sprints only the last stretch.
- **PERCHING / BASKING** (`LizardPerch.ts`, pure + TDD): the gecko now climbs
  ONTO climbable decor and STAYS there — on the top or draped on a sloped side
  (body pitch/roll already follow the surface). `findPerchSpot` picks a
  mesh-measured spot within the personality's climb ceiling; `lowSideStaging`
  walks the approach ring and starts the climb from the side with the SMALLEST
  step-up — it goes AROUND and climbs the short face, like a real animal.
  Personality-weighted cadence (`perchChance`: basker 0.3 … shy hider 0.08);
  basks belly-down ~55% of the time (rest pose), stands lookout otherwise.
  Live-proven: staging → ascent → parked at 0.12 m of the spot, 0.09 m up the
  rock, pen 0 (screenshot `perch_basking.png`).
- **Deliberate HIDE ENTRY**: entering a hide, it now pauses a beat at the
  mouth (0.5–1 s, `holdStill` — the peek into the dark), then walks in. Live:
  3 stationary samples at the mouth, then inside at 0.075 m of the anchor.
- **DISH is physically honest** (TDD ×2): contained insects sit ON the dish's
  measured BOWL FLOOR (`CollisionWorld.propSurfaceYAt` — per-point mesh top of
  a specific prop; `dishSurfaceY` had used climbHeightAt, which ignores HARD
  volumes, so since the v8.2 no-step rule every dish insect sat sunk at sand
  level = the reported "phasing through the dish bottom"). The pour
  presentation lands on the bowl floor too (`dishFloorY` hook). Live: 10/10
  mealworms at y 0.083–0.089 over sand 0.080 — per-point bowl curvature.
- **A hungry gecko now WALKS TO the dish** (TDD): `reachGoal` generalised —
  food inside a HARD prop gets a nearest-standable RIM goal (the glass logic
  extended to props); the final close-in PRESSES toward the prey (the rim pins
  the body, the snout covers the gap) and a PINNED-PRESS BITE fires when
  pressing stalls in snout-stretch range. Target is HELD while pressing (ten
  milling worms used to swap the target every repath and reset the bite
  forever). Live: starving gecko crossed the tank unprompted, hunger 0 → 21.6
  over two dish meals.
- **Shelter-journey integrity**: stuck recovery during ANY rest trip (hide /
  nap / perch) now re-plans toward the TRIP'S OWN goal (`recoverReturn:
  "shelter"`) instead of a random roam target, and giving up is logged. The
  grid-fallback lattice is padded ×1.08 so fallback lanes leave room for the
  full probe body (legs splay wider than the walk circle).
- QA hooks: `__lizard.perchNow()` (force a perch trip). Gates: typecheck +
  build clean, **318 tests** (new `stalk.test.ts` 2, `perch.test.ts` 4, dish
  bowl-floor + walk-to-dish 2), fish 3D + 2D intact, **0 console errors**.
  Limitations: hides stay no-climb (their walls are the v9.2 impassability
  guarantee, and the dome tops sit above the leo's real climb ceiling anyway);
  the pinned-press bite accepts prey up to ~1.35× eat range (the bite-carry
  animation snaps the insect to the snout, so it reads correctly).

## HIDE WALLS ARE REAL + COMPLETE PATHING (v9.2) — 2026-07-01

The gecko can no longer pass through any hide wall, and reliably walks IN
through the mouth, rests inside, and walks back out. Root causes found + fixed:

- **Wall-band collision for hides** (`traceWallContours` in `HabitatFootprint`):
  the old full-silhouette trace was WRONG for a dome — the roof covers the
  pocket/mouth in plan, and decimation shed loops, leaving a leaky partial blob
  with whole wall sections uncovered (the actual walk-through). Hides now trace
  ONLY the mesh material in the body-height band (22–50% of mesh height): a
  closed wall ring exactly matching the visible rock; the mouth + interior
  pocket are the only open space; no hole-filling so the pocket survives.
- **Undecimated sampling for hides**: `sampleMeshTriangles3D` capped at ~4000
  tris (every 11th triangle of the 46k-tri cave) — fine for silhouettes, but it
  shredded the thin wall band into 2-cm specks. Hides now sample ALL triangles
  (one-time at load). Wall loops went from ten 3–6-pt specks to two 63/71-pt
  rings per hide; `hideFit` went 0 → 0.16 both hides; the too-small warning
  cleared.
- **Doorway corridors + perimeter lane + GRID FALLBACK in navigation**
  (`HabitatNavigation`): ring waypoints all sit OUTSIDE a prop, so a walled
  pocket was invisible to the visibility graph (requestShelter always refused).
  NavGraph now (a) finds each hide's interior pocket (most-enclosed free point)
  and seeds a BFS-traced, string-pulled corridor out through the mouth, (b) adds
  a perimeter lane along the glass, and (c) when Dijkstra still fails,
  `gridFallback` BFS-es the walkable 0.025 m lattice directly and string-pulls —
  if the animal can physically walk there, findPath finds it (out-of-enclosure
  goals still refused).
- **Shelter journey integrity** (`GeckoMovementController` + scene): the
  care-layer decide tick could hijack an en-route shelter walk with an open-air
  nap (`shelterEnRoute` now guards it), and "path exhausted" was treated as
  "arrived" (stuck-recovery could swap the path → gecko 'sheltered' in the open).
  Arrival now verifies proximity to the pocket anchor (≤ max(1.2·bodyRadius,
  0.12)) and re-aims otherwise.
- **Live-proven** (Playwright): 16/16 straight approach rays into the pocket are
  wall-blocked; grid-BFS reaches both pockets only via the mouths; forced
  shelter → gecko walked in and rested **0.073 m from the humid pocket anchor**
  with **bodyPen 0.0000 m** the whole journey; walks back out after resting;
  planner probes route in AND out from across the tank; the collision debug
  shows closed amber wall rings hugging both domes and the gecko's probe figure
  visible THROUGH the hide while inside. Screenshots:
  `screenshots/ui_reference_match/hide_walls_debug_rings.png` + `hide_walls_resting_inside.png`.
- **QA hooks**: `__lizard.hideVolumes()` (per-hide compiled loop geometry),
  `shelterNow()` (force a shelter attempt), `navNodes()`, `probePath(x,z)`,
  `probePathFrom(x1,z1,x2,z2)`, `los(x1,z1,x2,z2)`.
- Gates: typecheck clean · build clean · **310 tests** (new `hidewalls.test.ts`:
  wall-band geometry, old-bug contrast, compiled walls, doorway-corridor
  planning, zigzag grid-fallback; nav node-count tests re-baselined for the
  perimeter lane) · fish 3D + 2D aquarium intact · **0 console errors/warnings**.

_Last updated: 2026-07-01 (v8 — FEEDING OVERHAUL: reference-exact Feeding Mode
with real photo food cards, REAL per-insect nutrition with applied effects
(calcium/dusting → MBD risk, fat → body condition, moisture → hydration),
staged per-method presentations with their own cameras — quick toss / hand
feed / PLAYER-STEERED tongs / automatic dish pour — dish capacity + smooth-wall
containment + cricket jump-outs, prey AI (freeze/flee/wall-steer/panic-jump/
tire) + insect collisions, the dashed-teal placement marker + gecko hover glow,
full-screen letterboxed Cinematic mode, and Track Intake with a live feeding
log + diet-balance advice)_

## At a glance
- **Phase:** 1 ✅ + 2 ✅ done; **3 (alive/gloss polish) in progress**; plus an
  **experimental hybrid 3D habitat spike** ✅ (opt-in, viewport-only) now covering
  **3 habitats** — fish tank, spider terrarium, lizard terrarium.
- **Build:** `npm run typecheck` clean · `npm run build` clean (main JS ~169 kB + a
  lazy ~880 kB Three.js chunk loaded only when 3D is toggled) · `npm test`
  **284 tests passing**.
- **Lizard habitat** = a **data-driven, collision-aware, feedable, PLAYER-EDITABLE,
  interactive-care** habitat: **EXACT asset-silhouette collision** (filled-triangle
  rasterisation + marching squares → the debug outline looks like the real rock /
  cave / dish / branch even with the mesh hidden; collision + navigation + debug all
  read the SAME contour) **now with per-point SURFACE HEIGHTS** (a mesh-measured
  heightfield per asset: a sloped rock lifts the gecko by its true local height on
  each side, elevated branch spans are walked UNDER, the body pitches along slopes,
  and the debug draws each prop's measured surface as a lit shrink-wrap),
  **compound body probes** (no phasing), **real GLB
  thumbnails + a real tinted-model placement ghost** in the Decorate editor,
  full-transform **invalid snap-back** (move/rotate/scale/Y), **hanging attachment
  rules** (a vine can't float mid-air; deleting its support drops it), **enterable
  hides** (the gecko walks in through the real contour's open mouth and rests),
  **local dirt + Clean-Mode scrub brush** (sparkle when spotless), **drag-drop Feed
  Mode** (4 insect types with distinct nutrition/speed; a full gecko won't eat),
  **Terrain Mode** (raise/lower/smooth/flatten + wet patches that drive humidity /
  land comfort), a **Planet-Zoo-style wellbeing card** (12 live meters +
  recommendations), and **keyboard shortcuts for everything + an H help sheet**.
  Ready for the freelancer's rigged gecko drop-in. See `HABITAT_EDITOR.md`,
  `LIZARD_HABITAT_PROTOTYPE.md`, `ANIMAL_ASSET_PIPELINE.md`.
- **Runs:** Vite dev server; main aquarium screen renders interactively in 2D and
  in experimental 3D (`?tank=3d` or the on-screen toggle).
- **Repo:** git initialized; work checkpointed on `master`.

## Done
- **FULL-BODY ANIMAL COLLISION + TONGS PARKED (v9.1)** —
  - The animal is now collidable ALL OVER, the mirror of the props' exact
    silhouettes: **10 body probes** covering snout, neck, BOTH front
    legs/shoulders, chest, hips, BOTH rear legs/hips, tail and tail tip
    (previously the 6 probes ran only down the spine — the legs were
    uncovered, which is where the remaining phasing lived).
  - **Feet are collidable**: every foot plant/landing/settle target is pushed
    out of hard decor first (`CollisionWorld.freePoint` + a clamp callback in
    the pure FootPlanner) — a paw can never be placed inside a rock.
  - TDD: leg-probe coverage on all four quadrants + a 4 000-frame roam next to
    a boulder with ZERO planted-paw-in-rock frames (304 tests total). Live: a
    new `__lizard.bodyPen()` metric (worst probe penetration depth) read
    **0.0000 m across 42 s of roaming** — no part of the body enters anything.
  - **Tong mechanic PARKED** (per direction — the steering UX needs another
    design pass): removed from the feed rail + pointer/wheel handlers; the
    presentation/sim/cinematic code stays dormant behind the rail list for an
    easy return. Feed methods now: Quick / Hand / Place in Dish / Track Intake.
- **COLLISION OVERHAUL + PERSONALITY + BITE-CARRY (v9)** — the phase-through
  class of bugs fixed at the root, plus a real character system:
  - **Hide floors are REAL** (`buildFloorField` + per-asset floor registry):
    a hide's raised interior floor + entrance sill are measured from its
    upward-facing LOW triangles (the roof covers the pocket in plan, so the
    normal top/bottom field can't see the floor) and served through an
    OBJECT-level union entry (`CollisionWorld.hideFloorAt` — the pocket is the
    hole BETWEEN the wall loops, outside every loop's bounding circle, which is
    exactly why the old per-volume gate never fired). Live: inside both hides
    the surface reads type "hide" at the plate (0.128–0.144 vs 0.08 sand) —
    stand/lie ON the floor, step OVER the sill, never through either.
  - **Whole-body standing height**: the torso samples chest/centre/hips and
    rides the HIGHEST support — lying across a slab ledge no longer sinks the
    midsection/butt into the step (TDD hidefloor + existing surface suites).
  - **PERSONALITY system** (`LizardPersonality.ts`, TDD ×9): five characters
    rolled ONCE per animal from a real-life-skewed roulette (leos are placid:
    Calm Basker 30 / Shy Hider 22 / Bold Explorer 20 / Food Lover 16 /
    Energetic Hunter 12), persisted on the save, healed on old saves, and
    genuinely applied — walk/flee speeds, idle rhythm, shelter frequency +
    rest length, open-air NAPS (lies down right where it stands), startle
    length, hunger pacing, and a personal CLIMB CEILING (lazy geckos route
    around props bold ones cross; per-world `maxClimb`). Species data gains
    `canClimbGlass` (leopard gecko FALSE — no toe pads; crested gecko true for
    the future arboreal build). Shown as an identity-card pill + Animal Info
    pill w/ blurb; intro event on first roll. Live: rolled Energetic Hunter +
    Shy Hider across saves; HUD pill updates; shy one napped behind the slabs.
  - **BITE → CARRY → CHEW → SWALLOW**: at the strike the insect snaps INTO the
    mouth (its visual rides the snout through the whole chew — live: mouth
    distance 0.135 m, elevated), the tongs recoil at the BITE (not the
    swallow), the chew animation plays, and nutrition applies only at the end.
    Works identically for tongs, hand, dish and loose hunts.
  - **Tong cinematic = its own grammar**: while the player holds the tongs,
    cinematic switches to a WIDE, steady front shot (no orbit drift, high
    vantage — live camera at the front glass, z≈+1.1) so steering distances
    stay readable; the close follow-orbit remains for everything else.
  - 302 tests (hidefloor 3, personality 9) · typecheck/build clean · 0 console
    errors · fish regression-checked. Screenshots: `feed_bite_carry /
    tong_cinematic_wide / personality_nap`.
- **COMMON-SENSE PHYSICALITY RULES (v8.2)** — "logic gates games have":
  - **Never stand in the food**: dishes are hard no-step zones (def changed
    lowObstacle→blocked + old saves healed in `rehydrateLayoutAssets`); the
    gecko eats over the rim with its snout — live-proven: ate from the dish to
    full with ZERO lift onto it.
  - **Hide floor is real**: a hide's measured interior floor plate (≤ 0.07 m)
    now lifts stand height + foot contacts (`HIDE_FLOOR_MAX` in climbHeightAt /
    sampleSurfaceAt) — the gecko stands/lies ON the cave floor, never sunk
    through; walls/roof never lift it. Exterior stays fully solid via the
    exact-silhouette contours; the mouth is the only way in.
  - **Lie-down rest**: sheltering plays a real rest pose — the placeholder
    sinks belly-down with a slow breathing pulse (rigged model will play its
    Rest clip via the existing alias); eases in/out. Live: gecko resting fully
    inside the cave, snout at the mouth.
  - **Tong height control + JUMP**: scroll raises/lowers the held tongs
    (wheel is intercepted from camera zoom while holding); held low = strike,
    raised (up to a fair 0.24 m reach) = the gecko LEAPS for the take
    (`hopLunge`: parabolic hop + nose-up flick at consume). Live-proven:
    raised offer taken, hunger rose.
  - **Cinematic never opens blocked**: entering cinematic scans 24 angles for
    a lens position outside all props AND a clear line-of-sight to the animal
    (`CollisionWorld.hardTopAt` roofline test); if the subject later walks
    behind a rock the orbit pans around smoothly until the view clears.
    Live: repeated cold-opens all clean.
  - 290 tests · typecheck/build clean · 0 console errors. Screenshots:
    `dish_no_step_eating / hide_rest_inside / cinematic_clear_open`.
- **FEEDING POLISH + PHYSICALITY FIXES (v8.1)** — user-reported issues fixed
  and re-verified live:
  - **Tong control rebuilt**: NO camera move while the player steers (a moving
    camera kept re-mapping the pointer — that was the "impossible to manage");
    the view stays exactly where the player left it, the tongs chase the
    pointer fast (13/s), ride `climbHeightAt` (over low props, never through
    them), **resolve against decor** (they slide along a rock's edge — steering
    error 0.00 on open sand, clamped at the hide dome, proven live), and a
    teal contact ring rides under the tips for depth on the sand.
  - **Props never clip assets**: hand/tong serve points are validated CLEAR
    ground near the gecko (probe rings, hand needs 0.1 m clearance); QUICK toss
    landing spots are validated free + reachable and the sim spawns EXACTLY
    there (visual = sim); held insects resolve against solids.
  - **Max-climb cap** (`MAX_CLIMB_HEIGHT` 0.22, TDD `climbcap.test.ts`): the
    gecko never PLANS onto anything too tall — no-height-data volumes judged by
    their top, mesh-measured props by SHAPE (mostly-low driftwood stays
    crossable, its tall twig cells are excluded per-point from free space /
    walk lines; mostly-tall volumes compile hard and get nav detour rings).
    Live: routes around, feeds behind tall props, climb height stays ≤ cap.
  - **Hides fixed at the root** (the half-in/half-out gecko): `hideAnchor` now
    requires the anchor to be inside the hide's footprint AND **enclosed by
    walls on ≥5 of 8 rays** — a free spot merely BESIDE the dome (which is
    where "sheltering" geckos actually stood) never qualifies. Body-fit
    (`GECKO_HIDE_FIT`) checked before any attempt: a too-small hide is never
    entered and the HUD **warns while placing/scaling** ("X is too small for
    the gecko to enter — scale it up", shown live). The authored hides were
    measured (QA hook `__lizard.hideFit()`) and scaled (cave 1.7×, humid 1.8×)
    so their pockets truly fit; shelter frequency lowered (10% roll + 35 s
    cooldown, stress still drives it).
  - **Hand v2**: articulated fingers (3 capsule segments each on chained joint
    pivots, natural per-finger length/curl variance), thumb, palm mounds,
    fingertip pads, wrist + rolled sleeve cuff; fingers CURL live (cupped
    entry → open offer with idle sway → gentle close on exit); wider
    three-quarter camera.
  - **Cinematic follows the FOOD**: while a presentation runs the frame biases
    toward the tong tips / palm / dish (55%) vs the gecko; loose-prey hunts
    frame the midpoint; the orbit auto-advances past props so a rock face never
    fills the lens. **Cinematic anytime**: a film button under the photo button
    (+ V key) letterboxes and follows the gecko with no feeding involved.
  - typecheck + build + **290 tests** (climbcap 6 new; surface/collision
    fixtures updated to the new max-climb spec); 0 console errors; fish 3D
    regression-checked. Screenshots: `feed_tongs_steered / feed_hand_v2 /
    cinematic_anytime / hide_too_small_warning` in
    `screenshots/ui_reference_match/`.
- **FEEDING OVERHAUL (v8)** — feeding became a real husbandry system with a
  reference-exact UI and staged, filmable presentations:
  - **Feeding Mode = the reference exactly**: left method rail (Quick Feed /
    Hand Feed / Tongs / Place in Dish / Track Intake, designed SVG icons, green
    active pill), FOOD header + **5 real photo cards** (Mealworms / Superworms /
    Crickets / Roaches / Treats — cropped from the design reference itself,
    green border + ✓ when selected), QUANTITY − 10 + stepper (Small/Medium/
    Large), SUPPLEMENT dropdown (sun icon · Calcium + D3 · "Light dusting"),
    NEXT FEEDING readout (calendar icon; honest: cooldown / "Full — digesting" /
    appetite %), 🎬 Cinematic + the green **Start Feeding · Observe & enjoy**
    CTA, ✕ close. No slim nav under it (per the reference).
  - **REAL NUTRITION** (`LizardNutrition.ts`, TDD): every insect carries real
    relative husbandry data (satiety/fat/calcium/moisture + staple/occasional/
    treat role — dubia the best staple, waxworms a fatty treat). Eating applies
    it ALL: hunger by satiety; **calcium store** restored by supplement dusting
    (bare insects give a trickle; D3 absorbs best) and a drained store **erodes
    health (MBD risk)** + warns; fatty food raises **body condition** (obesity
    erodes health, eases back toward ideal); juicy prey supports hydration for
    a while. Two new REAL meters (Calcium, Body Condition) in Animal Info.
  - **Per-method staged presentations + cameras** (`ThreeFeedingPresentation`):
    QUICK tosses arcing insects in from the screen top (elevated overview cam);
    DISH auto-pours one-by-one into the real stone dish (close dish cam);
    **TONGS are PLAYER-HELD** — steel tongs follow the pointer with the insect
    wiggling in the tips, the gecko chases and strikes them (low action cam
    tracks the steered tips; sessions cap at real appetite + end early when
    it's full); HAND lowers the keeper's open palm and the gecko eats off it.
    The camera eases out to each shot and **glides back exactly where the
    player left it**.
  - **Dish physics**: capacity from the dish's REAL measured size (scales with
    the editor's scale gizmo), smooth stone walls **contain** worms/roaches
    permanently, **crickets jump out** — rarely alone, quickly when the gecko
    looms (live-proven: 10 penned → gecko loomed → panic jump-outs → hunted).
  - **Prey AI + insect collisions** (`InsectBehavior.ts`, TDD): freeze-when-
    spotted, flee bursts away from the gecko, wall-tangent steering (never
    jams in corners), cornered crickets panic-JUMP clear, per-kind speeds,
    stamina (chases tire → catchable), pairwise separation + push-out of the
    gecko's body probes (it never stands on an insect). Per-kind procedural
    models coloured from the photos (hopping crickets, inching golden
    mealworms, long superworms, flat mahogany dubia, plump waxworms).
  - **Pointer feedback**: the reference's **dashed teal placement ellipse**
    rides the sand under the cursor in feed mode (OS cursor hidden; red when
    invalid with a reason; snaps to the dish for dish method; previews the
    offer point for tongs/hand), and hovering the gecko glows a soft ring +
    pointer cursor in any mode.
  - **Cinematic mode**: a new full-screen mode (pure mode-machine state) —
    letterbox bars slide in, ALL HUD hides, a slow close orbit follows the
    gecko (framing gecko + prey during hunts), Esc exits. Button next to
    Start Feeding serves + watches.
  - **Track Intake**: persisted feeding log (what/how many/method/dusted +
    "Nm ago") with photo thumbnails, diet-balance meters (dusted %, treat %)
    and real advice (too many treats / dust with calcium / rotate staples).
  - **Main HUD sized up** (~15%): stat strip items/icons/bars/fonts + action
    dock cards + icon buttons all bigger per feedback.
  - Found + fixed en route: `feederAnchor` never matched the authored food dish
    (id `feeding_dish` vs `includes("food")`) — dish serving used to fall back
    to the feeding zone; camera override now restores the pre-shot view.
  - **34 new tests** (nutrition 12, dish 9, insects 10 + mode-machine updates,
    284 total) · typecheck + build clean · Playwright-verified end-to-end with
    live numbers (Quick: 10 mealworms tossed, hunger 69→93 = exactly 2 × 12
    satiety then full-stop; Tongs: 2 crickets taken from steered tips, 68→94.7;
    dish: 10/10 contained, "holds 10" from real geometry) · **0 console
    errors/warnings** · fish 3D + 2D aquarium regression-checked. Screenshots:
    `screenshots/ui_reference_match/feed_*.png|jpeg`.
- **UI REFERENCE-MATCH pass (v7)** — the gecko habitat's UI was rebuilt to match
  the 10 reference mockups in `Designs/Gecko/` (mapping:
  `DESIGN_REFERENCE_MAP.md`). One pure **mode machine** (`src/ui/gwModes.ts`,
  unit-tested) owns which regions show per mode (gecko-main / feed / clean /
  terrain / decorate / animal-info / photo; Esc → main; one drawer at a time by
  construction). One **gw design system** (`src/ui/gwTheme.ts` — dark rounded
  glass, green active glow, warm amber badges, styled sliders/steppers/segs)
  styles every surface. **Main HUD** (`lizardHud.ts` rewritten): top-left
  identity card (thumb + name + species + *Eublepharis macularius* + Desert/
  Warm/Lowlands pills + View Habitat Details), top-right **Habitat Score card**
  (big green number + rating + SVG progress ring + View Detailed Stats →
  breakdown flyout), camera button (Photo Mode), an 8-stat **bottom strip**
  (Hunger/Hydration/Stress/Health/Comfort/Cleanliness/Temperature/Humidity —
  icon, bar, status word + live value), and a large **action dock** (Feed /
  Clean / Decorate / Terrain / Animal Info with subtitles, notification dots +
  green active glow) flanked by ☰ event-log + ⚙ camera/overlays/help flyouts.
  **Bottom drawers** (`gwDrawers.ts`, replaces the old CareModeBar): Cleaning
  (5 tool cards with live badges — Spot Clean/Brush Sand brushes + one-click
  Wipe Glass/Refresh Water/Remove Waste, cleanliness meter, amber **rings over
  the actual dirty spots** via a new pure `dirtSpots()` picker), Feeding
  (Quick/Place-in-Dish/Tong methods, 4 food photo-cards, portion stepper,
  supplement seg, next-feeding readout, green **Start Feeding** CTA — dish/tong
  serve a real portion at the dish/gecko via new `feederAnchor()`/
  `geckoPosition()` accessors), Terrain (Terrain/Materials tabs, 6 sculpt tool
  cards, material swatches — Desert Sand live, others honestly "Coming soon" —
  Brush Size + **Intensity** (1–3 real brush passes) sliders + ⚡ Strong).
  **Decorate** reskinned to the reference tray: category tabs + horizontal
  GLB-thumbnail carousel + left 2-column tool palette + floating inspector
  (all EditorHandle logic intact). **Animal Info** is now the right-side panel
  (round photo, status "Active & Exploring" + caption, 10 live metrics with
  status words, recommendations box, Feed/Focus/Habitat Details). **Photo
  mode** = compact top cards + free camera + hint pill. While a drawer mode is
  open the dock swaps for a **slim icon nav with a green active underline**;
  the habitat view-switch docks top-centre in lizard mode. Playwright-verified
  across every mode on a fresh load — dish feeding served 3 crickets, brush +
  Remove Waste raised cleanliness live, Esc chains + camera re-anchoring exact,
  fish 3D + 2D aquarium untouched, **0 console errors/warnings**. typecheck +
  build + **249 tests** (new `uimode.test.ts` 15, `dirtspots.test.ts` 5).
  **Main-screen PERFECTION sub-pass** (user focus: "exactly like the image,
  real images not weird icons, stats accurate"): a REAL leopard-gecko portrait
  (cropped from the reference art → `public/assets/ui/gecko_portrait_01.png`)
  replaces the emoji tile in the identity card + Animal-Info photo; a designed
  **SVG icon set** (`src/ui/gwIcons.ts` — bowl/broom/sprout/dune/top-view
  gecko for the dock, colored fork/drop/blossom/heart/house/sparkle/thermo
  stat glyphs, camera/menu/sliders/leaf/chart chrome) replaces every emoji;
  cards/strip/dock resized to the reference (64px thumb, 40px score number,
  60px ring, 3-row stat items with status word + live value, always-on card
  dots, "Enhance habitat"/"Sandy Desert" subtitles). **Stat accuracy proven
  live through the UI**: dish-feeding 3 crickets moved Hunger 0→53% (status
  Hungry→Peckish), Stress 23→5% (eating calms), Comfort 89→98% (derived),
  Cleanliness dipped as feeding made real dirt; painting wet patches moved
  Humidity 40→49% and Hydration 89→95%, drying + flattening restored them; and
  a TDD'd **hunger-pacing fix** (`hungerDrainPerSec` 0.3 → 0.02/s — the old
  rate emptied a full belly in ~5 min so the gecko read "Hungry" right after
  eating; now a meal holds for a play session, verified 40%→38% over a live
  minute) makes the Hunger stat read true (**250 tests**). Known gaps:
  aquarium keeps its (already dark-glass) HUD — the reference stat-strip/dock
  conversion for the fish tank is future work; no main-menu/hub screen exists
  yet to reskin.
- **VIVARIUM SHELL rebuild + single source of truth (v6)** — the gecko enclosure is
  now a clean premium terrarium FIXED in the eco-center, and every system reads the
  SAME derived numbers.
  - **`EnclosureSpec` (pure, `src/habitats/EnclosureSpec.ts`)** — ONE derivation
    from `HabitatDimensions` produces: interior-inside-the-glass, THE walk/placement
    rectangle (navigation = decor placement = feeding — identical by construction),
    frame sizing (posts / top band / base tray lip), the terrain brush's glass
    apron, bedrock (deepest dig, shared with HabitatTerrain), camera target + home,
    stand sizing, lamp mount height. No other file hard-codes a tank size.
  - **New shell (`ThreeVivariumShell.ts`)** — four glass panes in a dark frame:
    corner posts, slim top band with a subtle mesh **screen top**, an opaque **base
    tray** whose lip rises just past the substrate line (the sand bed's cut side
    never shows; sculpted dunes stay visible through the glass), a **desert back
    panel** inside the rear glass (no more noisy see-through + a warm lamp-glow
    pool), the **basking lamp now CLAMPED on the screen** over the basking zone
    (hood + bulb + fixture glow + drooping power cable — no more floating UFO),
    a UVB tube under the back band, gauge discs, a **bedrock floor + sand skirt**
    (dug holes read as sand, never a hollow box), and a **wooden STAND** under the
    tank (the real `aquarium.glb` cabinet, walnut-plinth fallback) + a soft floor
    shadow — the tank sits IN the room instead of hovering.
  - **Save migration (`HabitatMigrate.ts`)** — on load, stale persisted dimensions
    snap back to the current catalog record and out-of-bounds objects / zones /
    equipment are clamped inside (never deleted); idempotent; the camera comes from
    the spec, not the stale save. Old decor layouts load as-is.
  - **Bounds now match the visible tank** — the old 0.9×/0.98 framing inset is
    gone; nav/placement/feeding all use the spec rectangle (glass minus 6 cm). New
    snout-slack reach: food dropped against the glass is hunted + eaten (the body
    stands off the pane, the snout covers the gap) — live-proven (2 glass-hugging
    crickets eaten).
  - **Dirt fixed twice**: the overlay draws jittered organic blotches (the old
    aligned per-cell ellipses rendered a mechanical CHECKERBOARD once the tank was
    filthy), and the ambient dirt rate was retuned 0.0016 → 0.00008 /s (the whole
    floor used to saturate to max filth in ~10 minutes — the root cause of the
    checker; now a cleaned tank stays presentable for a session). Sand texture
    tiling widened (0.6 → 1.05 m) + patch contrast softened so repeats vanish.
  - Verified live (Playwright): frame aligned from front/left/top; strong dig stops
    at bedrock −0.07 with a sandy hole; dune 0.234; brush refused at the glass
    apron; placement valid at all 10 edge/corner probes + "Outside the enclosure"
    beyond; editor opens/closes with camera auto-free/re-anchor; presets exact;
    `sceneRotationY` stays 0; fish tank (camera unconstrained) + 2D aquarium
    untouched; save/reload keeps decor/terrain/camera; **0 console errors**.
    typecheck + build clean, **229 tests** (15 enclosure + 8 migrate + 2 glass-
    feeding + 1 dirt-pacing new). Screenshots:
    `screenshots/vivarium_shell/` (before/after).
- **Surface-aware GROUNDING + anchored camera + deep terrain (v5)** — the gecko now
  stands on FOUR FEET, the camera stops feeling like it spins the tank, and terrain
  sculpting is physical.
  - **Foot contacts** (pure `GeckoFeet.ts` FootPlanner): four configurable anchors
    (FL FR RL RR), a distance-driven diagonal trot; PLANTED feet are world-locked
    EXACTLY on the sampled surface (no float, no sink, no slide — live-measured
    worst gap 0.0000 m across a full climb), STEPPING feet arc briefly and land
    back on the surface; idle feet settle home. The placeholder's legs AIM at the
    live contacts (stretchy within limits) so feet visibly touch terrain + decor.
  - **Body pitch + NEW roll from the feet**: pitch = front-vs-rear contact heights,
    roll = left-vs-right (one foot on a rock, one on sand ⇒ a natural lean), both
    eased + capped (gentle on bare ground, steeper on climbables). Applied YXZ
    (yaw → pitch → roll) in ThreeAnimalController. Live: roll to 23°, pitch to
    44° scrambling a dune; four planted feet at four DIFFERENT heights
    (0.108/0.150/0.168/0.251 m), all gap-0.
  - **Surface sampler** (`CollisionWorld.sampleSurfaceAt`): one query → height,
    unit normal, slope, surface TYPE (substrate/terrain/rock/hide/branch/dish),
    object id, walkable/climbable/tooSteep/fallback. Feet, debug markers and
    validation all read it.
  - **Terrain is now PHYSICAL**: the collision world holds a LIVE ground source
    (bilinear `terrainHeightAt`) — walk height, foot contacts, navigation
    (losClear/isFree reject slopes > ~40°), decor placement ("The ground is too
    steep here") and feeder drops/wander all follow the brush with NO rebuild.
    Range up: normal brush raises to ~0.14 m; the new **⚡ Strong brush** to
    ~0.23 m and digs BELOW the default sand level down to a **bedrock limit**
    ~1 cm above the tank floor (design: the player sculpts the substrate's TOP —
    depressions yes, holes through the glass never). Sand mesh densified (96×64),
    the dirt/wet decal overlay is now a draped, terrain-following plane, pebbles
    re-seat on dunes, feeders ride the surface, the gecko's blob shadow sits on
    the sculpted sand. Brush masks keep the ground under props + a glass apron
    untouched. Live-proven: dune to 0.234 m (≈3× the old ±0.08 cap), hole to
    −0.07 m stopped exactly at bedrock, terrain survives save/load.
  - **Anchored eco-center camera (lizard only)**: normal view constrains OrbitControls
    to a ±43° yaw window, a natural pitch band, zoom limits and a pivot clamped
    inside the tank — dragging leans your head around a FIXED tank (live: a huge
    fling clamps at exactly 0.75 rad; scene rotation stays 0). A **camera bar**
    (Front / Left / Right / Top / Focus-Gecko / Reset) gives named views, and
    **📷 Photo Mode** restores the full free orbit (proven to 189°); the Decorate
    editor auto-frees the camera and re-anchors on exit. Fling momentum is flushed
    so presets land exactly. Fish + spider cameras untouched (still free).
  - **Debug menu** (🐾 Debug ▾): Foot contacts (green planted / yellow stepping /
    red no-contact spheres), Surface normals (whiskers), Terrain heights (draped
    heatmap: cyan depressions / amber dunes / red too-steep), plus the existing
    View Collisions. QA hooks: `__lizard.feet()/roll()/sample()/terrainAt()`,
    `__habitat3d.azimuth()/constrained()/preset()`.
  - typecheck + build clean; **203 tests** (new `terrain2`, `surfacesampler`,
    `feet` suites); Playwright-verified live with 0 console errors/warnings
    (lizard + fish + 2D). Screenshots: `screenshots/gecko_grounding/`.
- **Exact SURFACE-HEIGHT collision (v4)** — collision now matches the asset
  **vertically**, per point, AAA-style. Symptoms fixed (user-reported): the gecko
  half-inside the driftwood while climbing (a 0.12 m lift cap under a flat
  prop-wide top), the gecko FLOATING beside the branch (the arched span's
  silhouette lifted anything standing under it), and rock-cluster collision with
  one flat height (tall side + low rocks all wrapped at the max). Fix:
  `HabitatFootprint.buildHeightField` rasterises each GLB's triangles into a 112²
  grid keeping per-cell TOP + UNDERSIDE (barycentric plane interpolation +
  wall-vertex stamps + one value-dilation pass), sampled bilinearly and registered
  once per asset file. Compiled solver volumes carry the field + its exact
  transform; `climbHeightAt(x, z, r, fromY)` returns the true local surface height
  and skips spans whose measured underside is > 0.1 m above the animal
  (PASS_UNDER_CLEARANCE) → walk under, never levitate. Movement: climb cap raised
  to a 0.6 m safety, gap-proportional "mantle boost" on the lift ease, and a new
  smoothed `groundPitch` (snout-vs-tail surface sampling) pitches the body along
  slopes (applied YXZ in ThreeAnimalController). Debug: each prop's measured
  surface renders as a translucent **lit shrink-wrap mesh** — per-rock heights
  visible with the meshes hidden. Playwright-proven: 31/31 volumes surfaced;
  driftwood lifts 2.4→17.9 cm point-by-point with 9 pass-under cells; rock cluster
  0.8→24.2 cm; ~1 mm steady body-vs-surface tracking; pitch to ±0.52 rad; gecko
  frozen mid-climb ON the wood; fish + 2D intact; 0 console errors. **174 tests**
  (new `heightfield.test.ts`, `surface.test.ts`). Screenshots:
  `screenshots/surface_collision/`.
- **Exact-contour collision + interactive care (v3)** — the collision debug now
  **IS the asset silhouette**: project every mesh triangle to XZ (filled, not
  vertex-sampled), rasterise into a 128² occupancy grid, fill enclosed holes,
  **marching squares** → tight contour loops (≤6 loops × ≤56 pts, RDP-simplified),
  compiled into concave `poly` solver volumes — the SINGLE source for collision,
  navigation, placement AND the debug overlay (filled translucent silhouette +
  crisp base outline + faint top loop/struts). Fixed the root cause that had made
  collision look like primitives: a **stale localStorage save (v1) with no `asset`
  fields** silently loaded placeholders — save version bumped to 2, `defId` added,
  and `rehydrateLayoutAssets` self-heals loaded layouts. Solver got bounding-circle
  early-outs + one nav ring per prop (a CPU-wedge fix). Editor: **real thumbnails**
  (offscreen renders of the actual GLBs) + **real-model ghost** at exact final
  scale/rotation/Y, full-transform snap-back, PgUp/PgDn + F + camera buttons,
  colour-coded interaction segments, Cancel-Placement bar. Care: **hides are
  enterable** (shelter drive: stress-based + natural cadence, extra calm inside),
  **dirt map + brush**, **feed tray** (cricket/mealworm/dubia/waxworm — waxworm
  logs a fatty-treat warning; FULL gecko ignores prey), **terrain sculpting** (wet
  patches raise ambient humidity; too much water dents a desert gecko's land
  comfort), **wellbeing read-out** (temp/humidity/security/enrichment/cleanliness/
  hydration/land/activity + advice). All Playwright-verified live (drop→hunt→eat
  chain observed; 0 console errors; fish tank + 2D untouched). **162 tests.**
  Screenshots: `screenshots/collision_contours/` + `screenshots/care_systems/`.
- **Editor + collision v2 (accuracy · no-phasing · UX · hanging · info)** — a large
  follow-up pass:
  - **Concave root/twig/driftwood collision** — new pure `HabitatFootprint` module:
    trace the mesh XZ silhouette, and when concave (fill < 82 % of its hull, via an
    interior flood-fill) decompose into **multiple tight rectangles** (one OBB per
    branch) so empty gaps aren't blocked; compact props keep a tight convex hull;
    dishes stay circles. `compileObject` emits one volume per part.
  - **No-phasing** — the gecko is a chain of **body probes** (snout→tail);
    `resolveBody` clears the whole silhouette each frame (incl. after turning),
    `resolve` sweeps long moves (no tunnelling), and it settles the body at spawn/
    after edits. Proven ≤ 1 cm residual across 5 000+ frames (pure tests).
  - **View Collisions button + legend** in the HUD and editor (C still works); the
    debug overlay also draws the animal probes. Overhead/hanging props don't block
    the floor.
  - **Camera** — OrbitControls orbits the camera; the enclosure never rotates
    (`sceneRotationY` stays 0, test-hooked); Home resets, the info card focuses.
  - **Catalog** — sections, search, filter chips, icon cards, Build-Help sheet.
  - **Y-axis / hanging placement** — `placement` modes; Y gizmo handle + Height
    slider for elevated/hanging props (Climbing Branch, Hanging Vine).
  - **Invalid placement** — red ghost + reason line; invalid gizmo moves snap back.
  - **Click-the-gecko info card** — behaviour, needs, environment, target, rig +
    clips, warnings, Feed / Focus / View-Collisions.
  - Fish tank + 2.5D aquarium untouched. typecheck + build + **118 tests** +
    Playwright (0 console errors on fresh load). Screens in
    `screenshots/habitat_editor_v2/`. See `HABITAT_EDITOR.md` §7.
- **Habitat Editor (Decorate Mode) + mesh-footprint collision** — the Decorate
  button opens a real editor (simplified Unity/Unreal style — catalog left,
  viewport centre, transform gizmo, inspector right; three.js `TransformControls`).
  Place (click card → click sand, ghost preview + red/green validity), select,
  **move / rotate X·Y·Z / scale** (normal 0.25–3×, advanced 0.05–8×, cap 10, per-
  axis), duplicate, delete, reset-transform, snap-to-floor, center, reset layout,
  **undo/redo** (W/E/R + Blender-ish hotkeys), interaction-type dropdown; layout
  saves/reloads. Collision now derives a **tight convex-hull footprint from the
  real GLB mesh** (traces the silhouette, no giant boxes; dishes = tight circles;
  soft succulents don't block) and follows position/rotation(X/Y/Z)/scale live,
  rebuilding navigation + score. Debug (**C**) traces the hull + a faint body-
  clearance offset. Playwright-verified (place/rotate-X/scale/persist/hull, fish
  tank untouched, 0 console errors); feeding-reach proven by a pure sim test.
  typecheck + build + **86 tests** pass. See `HABITAT_EDITOR.md`.
- **Phase 0 — setup:** Vite 5 + TS (strict), modular `src/` tree, `index.html`,
  `tsconfig`, `vite.config`, `.gitignore` (node_modules/dist/.env/.playwright-mcp),
  `.env.example`. 27 curated assets in `public/assets/`. Three asset tools in
  `tools/` (OpenAI gen, fal edit, remove.bg clean) — all dry-run tested.
  Mandated `CLAUDE.md` + these docs created.
- **Phase 1 — main aquarium screen:** cozy eco-center room backdrop (blurred,
  vignetted), wooden stand + name plate, procedural glass tank shell, layered
  aquascape (substrate bed, driftwood/rock hardscape, back/mid/front plant
  clusters), depth-sorted animated fish + bottom-dwelling shrimp/snails,
  bubbles/particles, god-rays/caustics/waterline. Full DOM UI: top bar,
  left stats panel, right population/equipment panel, bottom action bar, bottom
  nav. Placeholder secondary screens (Shop, Eco-Center, Journal) with persistent
  chrome. Save/load via localStorage. Playwright-verified (habitat score ~92–95).
- **Phase 2 — core sim:** deterministic nitrogen cycle
  (ammonia→nitrite→nitrate), bacteria scaled by filtration + cleanliness,
  plant/water-change export, feeding → food → waste, oxygen/temp/pH,
  cleanliness, habitat score. Pure module (no Canvas/DOM). RNG = mulberry32.
  Verified live: overfeed 0.03→0.18 ammonia; water change cut nitrate 5.6→2.5,
  ammonia 0.18→0.06; leaves deducted.

## Phase 3 polish — gloss + animation ✅ verified (2026-06-29)
- **Glossier glass:** `effects.paintGlassFront` rewritten with additive sheen,
  drifting diagonal pane reflections (time-driven), crisp edge highlights, corner
  glints; wet specular on rims; brighter water gradient + caustics; glass photo
  overlay alpha 0.22 → 0.30; `canvasRenderer` feeds elapsed time in.
- **Better animation:** agents ease a signed `face` scale toward heading (smooth
  turns/squash), body wiggle amplitude scales with speed, feeding excitement
  raises fish toward the surface.
- **Verified:** typecheck + build clean; Playwright two-frame capture shows live
  motion (rasbora school relocated + stayed cohesive, gourami repositioned,
  god-rays drifted) and glossy specular glass. Only console msg = favicon 404
  (harmless). Screenshots: `docs/production/screenshots/verify-gloss-{1,2}.png`.

## Phase 2 foundation close-out ✅ (2026-06-29)
- **Sim test harness (vitest):** `npm test` → **33 tests passing** across
  `tests/{rng,sim,save,codex}.test.ts`. Covers deterministic RNG, feeding,
  overfeeding, action gating, clean/water-change, the ammonia→nitrite→nitrate
  cycle, health decline/recovery, habitat-score response, day-rollover income,
  save/load round-trip + version/partial/malformed handling, and seed-repeatable
  determinism.
- **Determinism fix:** added `resetSimState()` (clears the module RNG stream +
  warning debounce) and call it from the app's `reset()` so a new/reset game is
  reproducible from its seed instead of inheriting stale caches.
- **Authoritative content mined:** generated `src/data/aquaticCodex.ts` — the
  full **22-species aquatic codex** from `04_docs` stats bible (taxonomy, care,
  rarity, temp/pH bands, 1–7 design scales, procedural-render direction).
  `species.ts` now derives name/latin/rarity/temp/diet from the codex (single
  source of truth) while keeping tuned render/sim values. Consistency enforced by
  tests. Build clean; Playwright re-verified (no regressions, score "Thriving").

## Phase 3 polish — outline fix + lifelike fish ✅ (2026-06-29)
- **Removed the glass-overlay double-outline:** dropped the `tank_glass.png`
  screen-blend (its ¾-perspective edges stamped a mismatched inner outline);
  procedural gloss carries the look. Before/after in `screenshots/outline-*.png`.
- **Lifelike fish motion:** front-back depth swimming (per-fish `offZ` + wandering
  depth targets), body undulation (head→tail strip warp in `drawSprite`, fish
  only), velocity-aligned nose pitch, speed-scaled tail-beat; removed the old
  rigid wiggle. Playwright-verified (depth spread + clean undulation, no seams).

## Phase 3 — real fish swimming + upscaled art ✅ (2026-06-29)
- **Sliced-deformation swim system** (`render/fishDeformation.ts`,
  `data/swim.ts`, rewritten `tankScene` motion): fish flex head→tail, tail
  swishes (amp/freq by state + speed), bodies curve through turns, heading leads,
  smooth acceleration/glide, idle/cruise/dart states, edge-avoidance (no bounce),
  depth-lane wander, feeding darts. Inverts keep a simple scoot.
- **Upscaled fish art** installed (betta centerpiece, harlequin rasbora, cory,
  guppy, platy) from `UpScaled_Assets`; trims/sizes retuned.
- **Clearer water:** depth-haze `hazeAlpha` cut ~0.46→0.26, caustics + god-rays +
  glass sheen softened. Photo glass overlay + floating name plate already removed.
- Playwright-verified: body bend visible, fish swim + turn, feeding response,
  no console errors. Tuning lives in `data/swim.ts`.

## Experimental hybrid 3D tank spike ✅ (2026-06-30)
- **Goal:** test whether a Three.js viewport gives better *fish animation* than
  the 2.5D sprites. **Only the central viewport is 3D**; all UI stays 2D HTML/CSS
  and the 2.5D Canvas tank remains the default + fallback.
- **Isolated renderer** in `src/render/three/` (8 modules): procedural glass tank
  + black rim, tinted water volume + rippling surface + gravel caustics, the
  wooden cabinet as a stand, plant + driftwood decor, **3 goldfish + 1 betta**,
  soft aquarium lighting, depth fog, fixed three-quarter camera.
- **Fish:** full steering AI (pos/vel/accel, idle/cruise/dart, wall avoidance,
  banking, depth lanes, head-led turns) + a **GPU body-wave vertex shader** for
  tail swish (the source GLBs are fused/unrigged Tripo meshes — no bones/fins to
  animate, so a whole-body wave is the honest best case).
- **Toggle:** two on-screen buttons (**2D Aquarium** / **3D Aquarium ·
  Experimental**) or `?tank=3d`; Three.js is **lazy-loaded** so 2D-only players
  never download it.
- **Attachment fix (2026-06-30):** fish parts were tearing apart — the 8 Tripo
  colour chunks each had a *different* node origin, so the shared body-wave
  deformed them inconsistently. Fixed by baking all chunks into one frame and
  **merging each fish into a single multi-material body mesh** (one continuous
  body, head-anchored bounded time-sine, `FishRoot` owns world movement). No
  pivot rig — the chunks aren't anatomical parts. Re-verified >30 s, 0 errors.
- **Playwright-verified:** fish swim in X/Y/Z, turn/bank, lead with the head, stay
  in bounds, and **stay fully attached** across idle/cruise/dart/turn; UI intact;
  2D fallback intact; 0 console errors.
- Full write-up: `docs/production/THREE_D_TANK_SPIKE.md`. Captures in
  `screenshots/3d_spike/`.

## Experimental 3D habitats — spider + lizard added ✅ (2026-06-30)
- **Generalized to multiple habitats** behind a `HabitatScene` interface +
  generic `ThreeHabitatRenderer` (swaps scene + per-habitat camera; replaced the
  fish-only `ThreeTankRenderer`). New shared `ThreeEnclosure` (glass terrarium +
  ground bounds + rock/branch) and `ThreeGroundController` (`GroundCreature` with
  `SPIDER`/`LIZARD` configs). Fish unify-to-one-body fix exported as `unifyToBody`
  and reused.
- **Spider terrarium** (Meshy spider — fused, unrigged): bursty grounded scuttle,
  turning, idle, gait bob/nod. **No leg articulation** (fused mesh) — honest gap.
- **Lizard terrarium** (leopard gecko — Tripo, fused): walks head-first with a
  lateral spine + tail-follow-through wave + idle breathing. Reads convincingly.
- **UI:** 4-way switch — 2D Aquarium / 3D Fish / 3D Spider / 3D Lizard (also
  `?habitat=spider|lizard|fish`). Three.js still lazy-loaded.
- **Assets:** `public/assets/3d/habitats/{spider,lizard}.glb`, 4096²→1024²
  textures via `gltf-transform resize`.
- **Playwright-verified:** each habitat loads, animates 20-30 s, no part
  detachment, in bounds, UI intact, fish regression + 2D fallback OK, 0 errors.
- **Comparison + verdict:** `docs/production/HABITAT_ANIMATION_COMPARISON.md`
  (fish best, lizard strong, spider needs a rig for legs).

## Rigged walking — spider + lizard now skinned & animated ✅ (2026-06-30)
- Followed up the procedural pass by **rigging both land animals in Blender (via
  MCP)**: armature (lizard = spine/tail/4 legs; spider = body + 8 legs from
  detected leg-tips) → **automatic skin weights** (bone-heat succeeded on both
  AI meshes after cleanup) → hand-authored looping **walk + idle** clips with the
  **body kept level (no bounce)** → exported rigged GLBs, textures downscaled to
  1024².
- New `ThreeRiggedController` plays the clips via **AnimationMixer**, crossfading
  walk↔idle by speed (cadence tracks travel so feet don't skate); the root only
  handles locomotion/turning. `GroundCreature` remains a procedural fallback.
- **Enclosures stripped** to just the animal + floor (no rock/branch/pebbles).
- **Playwright-verified:** lizard walks with real stepping legs + spine/tail
  follow-through (clean skinning, no tearing); spider's 8 legs articulate in an
  alternating gait; no bounce; fish regression + 2D fallback intact; 0 errors.
- Verdict: lizard excellent; spider much improved (auto-rig isn't perfect — wants
  a hand-tuned rig for true AAA). See `HABITAT_ANIMATION_COMPARISON.md`.

## Rig-accuracy fix — bones now match the mesh ✅ (2026-06-30)
- First rigs placed bones blindly and the gecko's bones sat **outside the body**
  (its mesh is posed on a **curved/diagonal centerline**, not axis-aligned).
- Rebuilt the gecko rig from **measured geometry**: spine/tail bones follow the
  per-slice **centroid centerline**, legs run to the **4 clustered foot toes**;
  **visually verified in Blender** (top/side/posed screenshots — bones inside the
  body, clean skin deformation). Got the Blender viewport rendering working
  (SOLID shading) for this.
- Rebuilt the spider rig with a body bone covering the central mass + 8 legs to
  the true detected tips. (Blender won't draw this Meshy mesh in-viewport, so the
  spider rig was verified **in-engine**.)
- Added a **roam-inset** so animals stay framed centrally (no wandering behind
  the side panels). Re-verified both in Playwright: accurate deformation, legs
  step, body level, 0 errors.

## 3D habitats — AAA motion + orbit + bigger tanks ✅ (2026-06-30)
- **Rig polish:** rebuilt both rigs with **cleaned + smoothed skin weights**
  (limit-to-4, clean, smooth) for AAA-clean deformation; gecko spine/legs follow
  the measured centerline, spider abdomen force-locked (no split). Verified in
  Blender via render-to-file (viewport won't draw the re-exported textured GLBs).
- **Smooth, locomotion-driven motion** (`ThreeRiggedController` rewrite):
  - baked **idle / walk / run** clips (3-way blend by speed);
  - **feet driven by distance travelled** (walk/run clip phase advances with
    movement) → no more foot-skate "gliding";
  - **spine/tail bend into turns** (procedural, layered over the clip) so the
    whole body curves with the heading — no rigid spin-in-place;
  - turning happens **while stepping** (no idle ice-spin); body stays level (no
    bounce).
- **Behaviour:** animals now move **noticeably more** (frequent walks, occasional
  runs) so they're easy to watch, with subtle idle life when resting.
- **Bigger enclosures** (lizard 3.0×1.9×1.3, spider 2.8×1.8×1.2) with animals
  scaled proportionately; spider head-first orientation fixed (`modelYaw`).
- **Orbit camera:** `OrbitControls` — **middle-mouse (or left) drag rotates** the
  view around the tank from any side, wheel zooms, right-drag pans.
- Playwright-verified: gecko + spider walk/turn with body bending, no glide,
  abdomen intact, orbit works, 0 errors. typecheck/build/33 tests pass.

## Lizard habitat — data-driven foundation + collision + feeding ✅ (2026-06-30)
_(A freelancer is producing the final rigged/animated leopard gecko; this pass
built everything else so it drops straight in.)_
- **Removed** the old scattered gecko design scratch files (root `gecko_*.png`,
  `gk_*.png`, `gkv4_*.png`, `tmp_inspect_rig.mjs`) + the orphaned `ThreeWalker.ts`.
- **Reusable, pure habitat model** (`src/habitats/`, no Three/DOM, unit-tested):
  types, bounds, **collision solver** (circle/OBB/capsule, slide + never-penetrate
  guarantee), stats/score, layout ops, size presets + placeable catalog, per-
  habitat save/load (namespaced — fish tank untouched), species care profiles +
  compatibility (safe/caution/danger/food).
- **Data-driven "Sunstone Desert" terrarium** (`lizard/LizardHabitatData.ts`):
  glass enclosure, sand, 2 rocks, cave + humid hide, driftwood log, water + food
  dishes, succulents, heat lamp + UVB + thermo/hygro, basking/cool/feeding zones.
  Every collidable piece carries collision data. **Habitat score ~90 Excellent.**
- **Collision-aware gecko brain** (`GeckoMovementController`, pure): slow
  deliberate roam/idle, forward-only steering (no sideways slide), hunt→eat,
  slides around obstacles, re-targets when blocked, stays on substrate + in bounds.
- **Three.js bridge:** `ThreeLizardScene` builds the terrarium from the layout;
  `ThreeAnimalController` drives a **procedural placeholder gecko** (body+head+4
  legs+tail) OR a rigged GLB; `ThreeAnimationController` maps clip aliases
  (idle/move/turn/eat/rest/stress) with graceful missing-clip fallbacks;
  `ThreeCollisionSystem` draws debug volumes (`?debugCollision=1` / key **C**);
  `ThreeFeederInsects` renders crickets.
- **Feeding prototype:** Feed → 1–3 crickets spawn → gecko hunts nearest → eats →
  hunger rises → event log. **Needs system:** hunger/stress/health driven by
  temp/humidity/hides/hunger. **Lizard HUD** overlay (stats, score, feed/clean/
  decorate, event log) shown only in lizard mode — the fish-tank UI is hidden
  behind it and fully restored on switch-back.
- **Final asset path prepared:** `public/assets/3d/habitats/lizard/
  leopard_gecko_animated.glb` — auto-detected + used when present (HUD badge flips
  to "FINAL RIG"), placeholder otherwise; never crashes on a missing/clipless GLB.
- **Playwright-verified:** scene loads, **0 errors/0 warnings**, gecko moves +
  stays in bounds + never phases through rocks/hide/log (debug viz confirms
  volumes), Feed spawns crickets → gecko eats → hunger 0→39 + events logged, HUD
  live, **fish tank (2D + 3D) fully intact**. typecheck + build + 50 tests pass.
- New: `tests/collision.test.ts` (11) + `tests/habitat.test.ts` (6). Docs:
  `LIZARD_HABITAT_PROTOTYPE.md`, `ANIMAL_ASSET_PIPELINE.md`.

## In progress (Phase 3 polish — remaining)
- Per-species feel tuning (amp/freq) once reviewed at full framerate.
- Plant sway + day/night lighting grade pass.

## Data still to mine (cross-cutting)
- Plant Library core data (land doc §8) and Hardscape core data (§10) — only the
  aquatic-relevant rows needed near-term; current 6 plants + 5 hardscape suffice
  for the tank.
- Land Animal species (land doc §5) — defer to Phase 9 habitats.

## Not started
- Automated sim tests (Phase 2 acceptance item).
- Phase 4 Decorate / habitat editor.
- Phase 5 collection / shop / add-species.
- Phase 6 breeding / rare morphs.
- Phase 7 rescue / quarantine.
- Phase 8 eco-center hub.
- Phase 9 more habitats.
- Phase 10 audio / settings / accessibility / QA.
- Mine `04_docs/*.docx` species & hardscape stats into `src/data`.

## Known issues / watch-list
- Dev server must be (re)started each session.
- HMR can transiently report stale-method errors after big edits to
  `tankScene.ts`; a clean reload clears them.
- No git history yet → no rollback safety net. Recommend `git init`.

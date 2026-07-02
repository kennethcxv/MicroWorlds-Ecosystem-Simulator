# DECISIONS — GLASSWATER

Architecture & direction decisions (ADR-lite). Newest first. Each: context →
decision → consequences.

---

## 2026-07-01 — Feeding is real husbandry + staged presentations (v8)
**Context:** Feeding was "insects appear, hunger goes up 20" — one number, no
methods, no nutrition, insects as wandering particles the gecko could stand on.
The reference feed screen shows a full system: five methods (Quick / Hand /
Tongs / Dish / Track Intake), real food photography, quantity, supplement
dusting, next-feeding scheduling.
**Decision:** (1) **Nutrition is data, effects are real** — one pure table
(`LizardNutrition.FOOD_TYPES`) carries real relative husbandry numbers
(satiety / fat / calcium / moisture / role); eating applies ALL of it to real
stores: a calcium store fed by supplement DUSTING (drained → health erosion =
the MBD risk every care sheet warns about), a body-condition store pushed up by
fatty treats (obesity erodes health), lingering meal moisture supporting
hydration. UI meters read the stores; nothing is invented at display time.
(2) **Methods are presentations, sims stay pure** — a scene-side stage
(`ThreeFeedingPresentation`) animates props (toss arcs, dish pour, keeper's
hand, PLAYER-STEERED tongs that follow the pointer) and per-method camera
shots via a generic renderer `cameraOverride()` hook (also used by the new
full-screen letterboxed Cinematic mode), while every actual insect is spawned/
held/released through the tested feeding system (`serveMeal` + `held` flag) —
behaviour and nutrition never live in the renderer. (3) **Insects are prey,
not particles** — a pure `InsectBehavior` (freeze / flee bursts / wall-tangent
steering / cornered panic-jumps / stamina) + dish containment with real
capacity from measured dish geometry (crickets can jump out; worms can't climb
smooth stone) + collision (separation, pushed out of the gecko's body probes).
**Consequences:** 34 new pure tests (284 total); feeding logs persist for
Track Intake; MAX_LIVE_FEEDERS is a loose-only cap (penned insects don't
count); FeederKind gained `superworm`; old saves heal via `ensureNeedDefaults`.
The renderer's camera-override hook is reusable for any future scripted shot.

## 2026-07-01 — Reference-matched game UI on a pure mode machine (UI pass v7)
**Context:** `Designs/Gecko/` holds 10 UI mockups that are the visual TARGET
(not inspiration) for the gecko habitat: dark rounded glass, a top-left habitat
identity card, a top-right score card with a progress ring, a bottom stat
strip, a large bottom action dock, bottom DRAWERS for Clean/Feed/Terrain/
Decorate and a right-side Animal Info panel. The existing lizard HUD was a
functional teal side-panel layout that didn't match, and its mode handling was
scattered (careBar / editor / animal card each toggled themselves — two modes
could fight).
**Decision:** (1) A pure, unit-tested **mode machine** (`src/ui/gwModes.ts`):
seven modes, `regionsFor(mode)` declares which UI regions show, Esc always
returns to gecko-main, re-requesting toggles off — the DOM layer just applies
the answer, so "one drawer at a time" holds by construction and
`app.applyUiMode` is the single place a mode change touches the world (drawers,
editor, panel, camera, clean rings, pointer ownership). (2) One shared **gw
design system** (`src/ui/gwTheme.ts`, `.gw-*` classes) implements the reference
look once; the HUD, drawers, decorate tray, inspector and animal panel all
consume it. (3) The reference decides layout; REAL data decides content — every
meter/badge/subtitle reads live sim state, and features with no backing system
ship honestly ("Coming soon" material swatches) instead of faking. Small
controller accessors were added for UI integration only (`dirtSpots`,
`setCleanHighlights`, `feederAnchor`, `geckoPosition`) — no care/terrain logic
changed.
**Consequences:** All gecko modes visually match their references
(`DESIGN_REFERENCE_MAP.md` records which image controls which screen;
screenshots in `screenshots/ui_reference_match/`). The old CareModeBar is gone;
`ShortcutsOverlay` remains. The fish tank UI is untouched (its reference
stat-strip conversion is future work), and there is no main-menu screen yet to
apply the hub reference to. 249 tests; 0 console errors across all modes.

---

## 2026-07-01 — One derived EnclosureSpec rules the vivarium (shell rebuild v6)
**Context:** The gecko enclosure had drifted into conflicting hard-coded numbers:
the shell, sand plane, dirt overlay, walk bounds, placement checks, terrain apron
and camera each re-derived their own insets/margins (0.12 vs 0.16 vs 0.9×/0.98
framing insets vs −0.02 sand trims vs an authored camera record persisted in the
save). Visually the tank was "messed up": it floated in mid-air with no stand, the
lamp was a giant hood hovering over the open top, the substrate bed's cream side
showed outside the bottom rim, the busy room read straight through the back glass,
and a saturated dirt map rendered as a mechanical CHECKERBOARD.
**Decision:** A pure **`EnclosureSpec`** (`src/habitats/EnclosureSpec.ts`) derives
EVERY shared number from the one authored `HabitatDimensions` record: interior,
THE single walk/placement rectangle (navigation = decor placement = feeding, by
construction), frame/tray sizing, glass apron, bedrock (reusing HabitatTerrain's
limit), camera target/home, stand and lamp mount. The renderer's new
**`ThreeVivariumShell`** builds the physical tank FROM the spec (glass + posts +
top band + screen top + base tray that hides the bed side + desert back panel +
rim-clamped lamp with cable + UVB + gauges + bedrock floor/skirt + wooden stand +
floor shadow). A new **`HabitatMigrate`** heals loaded saves: dimensions snap to
the current catalog record, out-of-bounds content is clamped inside (never
deleted), and the camera reads from the spec, not the persisted record. The old
0.9×/0.98 HUD-framing inset on the walk bounds was removed — bounds must match the
visible tank — with a snout-slack reach so food against the glass stays eatable.
**Consequences:** No conflicting tank sizes can drift again (15 spec + 8 migrate
unit tests lock the derivations); the tank reads as a premium fixed vivarium on a
stand; old layouts keep loading; dirt now draws as organic jittered blotches and
its ambient rate dropped 0.0016 → 0.00008 /s (the floor used to saturate to full
filth in ~10 minutes — the actual root cause of the checkerboard). Changing an
enclosure number means editing `LIZARD_SIZE_OPTIONS` (input) or `EnclosureSpec`
(derivation) — nowhere else. The spider/fish shells are intentionally untouched.

## 2026-07-01 — Foot contacts drive the body (grounding v5)
**Context:** With per-point surface heights (v4) the BODY tracked the ground, but
the animal still read as a floating capsule: no roll on side slopes (one foot on a
rock, one on sand → flat body hovering between), feet swinging freely without
touching what they stood on, and pitch sampled from two abstract snout/tail points.
**Decision:** A pure **FootPlanner** (`GeckoFeet.ts`) owns four configurable foot
anchors and a DISTANCE-driven diagonal trot. Planted feet are **world-locked
exactly on the sampled surface** (the same `climbHeightAt` query the body uses, so
terrain + prop heightfields + pass-under all apply); stepping feet arc and land
back on the surface; idle feet settle home. The BODY then derives from the feet:
height from centre + mean contacts, **pitch = front-vs-rear, roll =
left-vs-right**, eased + capped (gentle on bare ground, steeper on climbables).
The placeholder's legs AIM at the live contacts (stretchy within limits) rather
than swinging a canned gait. Chosen over full skeletal IK because the final rig
isn't here yet — the contact points are computed and renderer-agnostic, so when
the freelancer GLB lands they map straight onto its foot bones.
**Consequences:** No planted foot floats, sinks, or slides (unit-locked +
live-measured gap 0.0000 m); the body leans naturally on uneven ground; the gait
frees the visual from foot-skate by construction. Costs ~10 extra surface queries
per frame (negligible). Debug markers (green/yellow/red + normal whiskers) make
grounding inspectable at a glance.

## 2026-07-01 — Anchored eco-center viewing camera; free orbit only in Photo Mode
**Context:** OrbitControls' full 360° orbit made dragging feel like spinning the
TANK as a hand-held model, even though only the camera ever moved (the scene's
rotation is provably 0). The fantasy is a fixed vivarium in a room you lean around.
**Decision:** Scenes may publish **CameraLimits**; the lizard constrains the
normal camera to a ±0.75 rad yaw window, a natural pitch band, zoom limits, and an
orbit pivot CLAMPED inside the tank, with named presets (Front / Left / Right /
Top / Focus) whose fling momentum is flushed so they land exactly. **📷 Photo
Mode** (and the Decorate editor, automatically) restores the historical free
orbit. Fish + spider scenes publish no limits and keep their old camera. Chosen
over fixed camera stations to keep smooth, tactile control — the window is the
constraint, not the input.
**Consequences:** Normal dragging reads as parallax/head-lean (a huge fling stops
at the window edge); the tank stays visually anchored in the room; inspection and
screenshots keep full freedom one click away; nothing changes for the other two
habitats.

## 2026-07-01 — Terrain is physical, sculpted to bedrock but never through it
**Context:** Terrain sculpting was visual/stats-only (±0.08 m into the sand mesh);
the animal walked a flat plane regardless. The player asked for taller/deeper
sculpting and "can the floor go under the substrate?".
**Decision:** The collision world holds a **live ground source** reading the
sculpted height map (bilinear) BY REFERENCE — walk height, foot contacts,
navigation, placement and feeding all consume it per query, so a brush stroke is
physical instantly with no world rebuild. Design answer to "under the substrate":
the player sculpts the substrate's TOP SURFACE — digging below the default flat
level is allowed (depressions/channels/hollows) down to a **bedrock limit ~1 cm
above the tank floor**, derived from the substrate depth, so a hole always renders
as sand and never breaches the glass. Ranges: normal brush ~+0.14 m; **⚡ Strong**
~+0.23 m and to bedrock. Bare slopes steeper than ~40° are unwalkable (nav routes
around; placement + food drops refuse). Brush masks protect the ground under prop
collision volumes ("you can't dig out a boulder's footing") and a thin apron along
the glass — chosen over making props ride terrain, which needs footprint-wide
resampling + visual re-seating and is deferred.
**Consequences:** Dunes ~3× taller than before, real depressions below grade, wet
hollows; the gecko climbs/leans/paths around sculpted ground like decor;
depressions can't tunnel out of the tank; sculpting under props is a no-op rather
than a floating rock. Deferred: props following terrain height, sand texture
stretch on steep flanks.

## 2026-07-01 — Per-point surface heightfields for prop collision (v4)
**Context:** The exact-contour pass (v3) made collision match the asset in PLAN,
but every prop still had one flat top height. User-visible bugs: the gecko climbed
driftwood with half its body inside the wood (a 0.12 m lift cap under a max-height
top), levitated beside the branch when standing under its elevated arch (the
silhouette covers ground the wood only passes OVER), and the rock cluster wore a
flat max-height collision cage over its low rocks.
**Decision:** Measure a **surface heightfield per GLB** — rasterise the same local
triangles the contour tracer uses into a 112² grid keeping per-cell TOP and
UNDERSIDE (barycentric plane interpolation + wall-vertex stamps + one
value-dilation), sampled bilinearly. Registered ONCE per asset FILE in a pure
registry (a per-placed-object copy would put megabytes into localStorage saves);
compiled volumes carry the field + their exact transform. `climbHeightAt(x, z, r,
fromY)` returns the true local surface and skips spans whose measured underside is
> 0.1 m above the animal (pass-under) — chosen over "solid column" collision
because meshes are shells: top+underside per column is the standard AAA 2.5D
walkable-surface model and directly expresses arches/overhangs. Movement uncaps
the climb (0.6 m safety only), adds a gap-proportional mantle boost to the lift
ease, and pitches the body along the slope (snout-vs-tail sampling, YXZ rotation
order). The debug overlay draws the measured surface as a lit shrink-wrap mesh —
the same data the solver samples, so the debug stays proof.
**Consequences:** A sloped rock is low on its low side and tall at its crest;
elevated branch spans are walked under, never levitated onto; the body tracks the
wood surface to ~1 mm steady-state with visible climb pitch. Tilted (X/Z-rotated)
props still fall back to a flat-top superset; a hollow shell with no bottom faces
would misread as pass-under (real Tripo decor is closed, and the fromY-relative
rule self-heals while climbing); feeders/terrain don't consume surface heights
yet. 174 tests; Playwright-verified live.

## 2026-07-01 — Concave multi-part collision + compound body probes (editor v2)
**Context:** After the first editor pass, two accuracy problems remained: (1) a single
convex hull around a branching root/twig/driftwood still blocks the empty space
*between* branches, and (2) the gecko was a single centre circle, so its head/tail
could visibly clip decor the centre cleared. Plus UX asks: a visible View-Collisions
button, a clearer Planet-Zoo-style catalog, Y-axis/hanging placement, invalid-
placement feedback, click-the-animal info, and confirmation the camera (not the
container) orbits.
**Decision (collision shape):** Add a pure `HabitatFootprint` tracer. Rasterise the
mesh's projected XZ vertices into an occupancy grid, dilate to close the outline, and
**flood-fill enclosed holes**; if the filled area is < 82 % of the convex hull the
prop is **concave** → decompose into ≤ 12 **axis-aligned rectangles** (greedy
largest-rectangle), one OBB collider each, leaving true gaps open. Compact props keep
the tight convex hull; round props stay circles. Chosen over a single concave/alpha
hull (still bridges non-convex notches) and over a live occupancy grid (heavier,
harder to slide against) — multi-OBB reuses the existing, well-tested OBB solver +
sliding, and each part follows scale/yaw/position.
**Decision (animal integrity):** Represent the gecko as a chain of **body probes**
(snout→tail). `resolveBody` pushes the whole silhouette out of hard obstacles + walls
each frame (incl. after pure rotation); `resolve` **sweeps** long moves so a dart
can't tunnel a thin obstacle; the body is **settled clear** at spawn + after edits.
The centre stays hard-guaranteed; extremities may leave a ≤ 1 cm (invisible) residual
in the tightest wedge — accepted as "no *visible* phasing" rather than fighting a
rigid-body wedge to exactly zero (a full-frame revert caused turn deadlocks + stalled
pathing, so it was dropped). Overhead/hanging props (underside above the gecko's head)
are excluded from ground collision.
**Consequences:** Collision traces branchy props without blocking gaps; no body part
visibly phases through decor; both are unit-tested (footprint decomposition; ≤ 1 cm
across 5 000+ frames). New pure module + probe API; a small residual tolerance is the
documented contract. UX (View Collisions + legend, catalog sections/search/filters/
icons + Build Help, Y-axis/hanging, invalid-placement reason + snap-back, click-info,
camera QA hooks) layered on the same seams. 118 tests; Playwright-verified.

## 2026-07-01 — Habitat editor = simplified Unity/Unreal gizmo (not Blender); mesh-hull collision
**Context:** The lizard terrarium needed to become player-editable (place / move /
rotate / scale / delete decor) and its collision needed to trace the real props,
not oversized boxes. Question 1: which editor UI. Question 2: how to make collision
match the visible mesh under arbitrary transforms.
**Decision (UI):** A **simplified Unity/Unreal-style** editor — persistent, clickable
move/rotate/scale **gizmo** (three.js `TransformControls`), catalog left, viewport
centre, inspector right, cozy glassmorphism skin — NOT Blender's modal keyboard-only
transform. Keep only helpful Blender-ish hotkeys (W/E/R, Del, Ctrl+D/Z/Y). Advanced
toggle unlocks X/Z rotation + per-axis scale (0.05–8×, cap 10×) so beginners aren't
overwhelmed. `TransformControls` (already in the shipped `three`, code-split) beats
a custom gizmo. Full rationale + research table: `HABITAT_EDITOR.md`.
**Decision (collision):** Collision is **asset-derived**, measured from the loaded
GLB — a bounding box **plus a tight 2D convex hull** of the mesh vertices projected
to the floor (`AssetFootprint.hull`). The pure compiler builds a convex-polygon
obstacle (circle-vs-poly push-out) that traces the silhouette and follows position +
full THREE-`XYZ` Euler rotation + per-axis scale; X/Z tilt uses a world-aligned
corner-projection superset (documented). Gecko body radius stays a separate solver
expansion, shown faintly in the debug overlay.
**Consequences:** Discoverable, forgiving editor; collision hugs the visible props
(no empty box corners), updates live, rebuilds nav + score, and persists. The hull
adds a new obstacle type + polygon math (unit-tested). Still the one Three.js
viewport; the 2.5D aquarium editor is future work.

## 2026-06-30 — Data-driven habitat foundation + placeholder-first animal pipeline
**Context:** A freelancer is producing the final rigged/animated leopard gecko.
Rather than block on it, we need everything *around* the animal built so the rig
drops straight in — and the game must become a **player-built habitat** sim, not
one hardcoded terrarium scene. The prior lizard scene was a propless box with only
rectangular bounds (no collision, no data model, no feeding/needs).
**Decision (architecture):** Introduce a **pure, framework-free `src/habitats/`
subsystem** (types, bounds, collision, stats, layout ops, size/placeable catalog,
per-habitat save/load, species care + compatibility) that is unit-tested and has
**no Three.js/DOM imports**, mirroring the sim/render split. The 3D scene + a thin
bridge (`ThreeLizardScene`, `ThreeAnimalController`, `ThreeAnimationController`,
`ThreeTerrarium`, `ThreeCollisionSystem`) *consume* the data model. Habitats save
to their **own namespaced localStorage keys** — the aquarium `GameState` + fish
tank are untouched.
**Decision (collision):** Practical **2D top-down** volumes (circle / OBB /
capsule) on the substrate, not full physics — with a hard guarantee that
`resolve()` never returns a penetrating or out-of-bounds position (push-out +
slide, fall back to last-free on a pinch). Debug viz is opt-in
(`?debugCollision=1` / **C**).
**Decision (animal pipeline):** Ship a **procedural placeholder gecko** now;
`ThreeAnimationController` maps clip-name **aliases** (idle/move/turn/eat/rest/
stress) with graceful missing-clip fallbacks, so the real GLB at
`public/assets/3d/habitats/lizard/leopard_gecko_animated.glb` is a **drop-in with
no code changes** (auto-detected; HTML-fallback guarded via content-type). The
movement **brain** is pure + reused by both the placeholder and the final rig, so
behaviour is identical before/after delivery.
**Consequences:** The lizard habitat is data-driven, collidable, feedable, scored
(~90 Excellent), and saveable today; the freelancer's rig plugs in cleanly. The
same foundation backs the future habitat editor + more species. Superseded the
old propless lizard scene + removed `ThreeWalker.ts` and the scattered gecko
design PNGs. Verified: 0 console errors/warnings, 50 tests, build clean. See
`LIZARD_HABITAT_PROTOTYPE.md` + `ANIMAL_ASSET_PIPELINE.md`.

## 2026-06-30 — AAA motion: locomotion-driven feet, turn-bend, orbit, idle/walk/run
**Context:** Even with accurate rigs, the land animals read as unnatural — feet
skated ("gliding"), they rotated rigidly in place ("body doesn't move when they
turn"), and they moved too rarely to watch. The user also wanted bigger tanks, a
free orbit camera, and correct sizing.
**Decision (animation):**
- Bake **idle/walk/run** clips per animal and blend by speed.
- **Drive the walk/run clip phase from distance travelled** (not wall-clock), so
  the legs cycle in lock-step with movement → no foot-skate. (Foot-IK ground-lock
  would be the next step but distance-phase removes the obvious glide.)
- Layer a **procedural spine/tail turn-bend** over the clip (rotate spine bones
  about local Z by smoothed yaw-rate) so the body curves into turns.
- Turn **only while moving** (legs stepping) — removed idle spin-in-place.
- **Clean + smooth skin weights** (limit-4/clean/smooth) for AAA deformation.
**Decision (camera/scene):** add `OrbitControls` (middle-mouse rotate, wheel
zoom, right pan) so the tank is viewable from any side — supersedes the earlier
"fixed camera, no orbit" rule at the user's request. Enlarged enclosures and
sized animals proportionately; fixed the spider's head-first orientation via a
per-model `modelYaw`. Behaviour tuned to move more often (frequent walks + runs).
**Consequences:** Motion reads natural (no glide, body bends through turns, real
stepping), animals are easy to watch, and the habitat can be inspected from all
angles. Verified in Playwright; 0 errors.

## 2026-06-30 — Rig accuracy: place bones from measured geometry, verify visually
**Context:** The first auto-rigs were placed blindly; the gecko's bones ended up
**outside the body** because its mesh is posed on a curved/diagonal centerline
(not axis-aligned), so straight bones missed the limbs.
**Decision:** Place bones from **measured geometry**, not assumptions: spine/tail
follow the per-Y-slice **centroid centerline**; legs run to **clustered foot
toes** (k-means on floor-contact verts). **Visually verify the rig in Blender**
(fixed the black-viewport issue by switching to SOLID shading) with top/side/posed
screenshots before exporting. The spider's Meshy mesh won't draw in the Blender
viewport, so its rig is verified **in-engine** (clean skinned deformation proves
the bones are inside the body). Added an `insetBounds` roam-inset so animals stay
framed centrally (not behind the side UI panels).
**Consequences:** Bones now sit inside the limbs; skin deforms cleanly; gecko rig
visually confirmed. General lesson: rig from sampled geometry + verify with
screenshots, never place bones blind.

## 2026-06-30 — Rig the spider + lizard in Blender (real leg walking, no bounce)
**Context:** Procedural motion on the fused/unrigged land animals only bobbed or
slid ("they're just bouncing"). True AAA walking needs articulated legs, which a
fused mesh can't do procedurally.
**Decision:** Rig both animals **in Blender via MCP** (free, no paid service):
import → join/clean → build an armature from geometry analysis (lizard:
spine/tail/4 legs; spider: body + 8 legs at detected leg-tips) → **automatic skin
weights** (bone-heat succeeded on both AI meshes after `remove_doubles`) →
hand-author looping **walk + idle** clips (diagonal trot / alternating tetrapod)
with the **root/body kept level (no vertical bounce)** → export rigged GLBs
(`export_animation_mode='ACTIONS'`) → downscale textures to 1024². Runtime: a new
`ThreeRiggedController` plays the clips via `AnimationMixer`, crossfading walk↔idle
by speed (cadence tracks travel speed to limit foot-skate); the root only handles
locomotion/turning. `loadRiggedAnimal` keeps the skin/bones (does NOT unify).
`GroundCreature` stays as the procedural fallback when no rigged GLB exists. Also
stripped enclosure props per the brief.
**Consequences:** Legs actually step; body is level; skinning deforms cleanly (no
tearing). Lizard reads excellent; spider is much improved but the auto-placed leg
bones aren't anatomically perfect (wants a hand-tuned rig + per-foot IK for true
AAA). The Blender auto-rig pipeline is reusable for future quadrupeds/arthropods.
See `HABITAT_ANIMATION_COMPARISON.md` (UPDATE section).

## 2026-06-30 — Multi-habitat 3D: spider + lizard via a shared HabitatScene
**Context:** Test whether 3D rigging/animation works for non-fish animals
(spider, lizard) to decide which habitats are worth keeping 3D. All supplied
animals (Meshy spider, Tripo geckos/etc.) are **fused + unrigged** — no
skeleton, skin, or clips.
**Decision:** Generalize the fish renderer into a reusable habitat system rather
than special-casing each animal: a `HabitatScene` interface, a generic
`ThreeHabitatRenderer` that swaps scenes + per-habitat camera (replacing the
fish-only `ThreeTankRenderer`), a shared `ThreeEnclosure` (glass terrarium +
ground bounds + rock/branch), and one parametric `ThreeGroundController`
(`GroundCreature` + `SPIDER`/`LIZARD` configs). Reuse the fish unify-to-one-body
(`unifyToBody`) so land animals never detach, and reuse the body-wave as a
**lateral spine/tail undulation** for the lizard (matches real lizard gait).
**Spider gets no fake leg animation** — bursty grounded scuttle + gait bob only,
because a fused mesh has no legs to drive. UI: a 4-way switch (2D / Fish / Spider
/ Lizard) + `?habitat=` param.
**Consequences:** Adding a habitat is now a small, contained addition (a scene +
maybe a config). Lizard reads convincingly; spider movement is fine but legless
articulation is the gap (rig-gated); fish remains best. Verdict + production
asset needs in `docs/production/HABITAT_ANIMATION_COMPARISON.md`.

## 2026-06-30 — Fix 3D fish part-detachment: unify chunks into one body mesh
**Context:** 3D fish visibly tore apart while swimming (tail/fins/colour patches
drifting off). Blender showed the cause: the 8 Tripo colour chunks each have a
**different node translation** (not one shared frame), so a body-wave shader that
keys off each mesh's local `position.z` deformed every chunk by a different amount.
**Decision:** Do **not** build a `TailPivot`/`FinPivot` rig — the chunks are
arbitrary colour regions, not anatomical parts, so splitting them would *cut* the
fused shell and create real gaps. Instead, in `ThreeAssetLoader.prepareFishBody`,
**bake each chunk's world matrix into its geometry** (unify the frame), recentre,
and **merge into a single multi-material body mesh**. The wave then deforms one
continuous body, anchored at the head (`hp=0`), as a **bounded local time-sine**
(no positional accumulation). `FishRoot` still owns all world movement/banking.
Also: amplitude/turn are clamped; a DEV log asserts the unified-body guarantee;
the tank toggle is now **two explicit buttons** (2D / 3D).
**Consequences:** No part can drift — there are no separate parts. Verified in
Playwright across idle/cruise/dart/turn for >30 s (0 errors). True per-fin flutter
still needs rigged/part-separated assets (the documented next step). Fewer draw
calls too (one mesh per fish). See `THREE_D_TANK_SPIKE.md` §8.

## 2026-06-30 — Experimental hybrid 3D tank (Three.js), opt-in & isolated
**Context:** Open question whether a real 3D fish tank animates fish better than
the 2.5D sprite system. The user supplied 3D assets and explicitly asked for an
isolated 3D viewport spike — overriding `CLAUDE.md`'s "no Three.js / stay 2D"
rule **for this experiment only**.
**Decision:** Add a self-contained Three.js renderer under `src/render/three/`
that draws **only the central aquarium viewport** in 3D, behind the unchanged 2D
HTML/CSS HUD. The 2.5D `CanvasRenderer` stays the **default and fallback**; 3D is
opt-in via `?tank=3d` or an on-screen toggle and is **lazy dynamic-imported** so
2D-only players never download Three.js. Glass/water/substrate are procedural;
the supplied GLBs (Tripo, **fused + unrigged** — no bones/shape-keys/separated
fins) are loaded fault-tolerantly with placeholder fallback. Since the fish can't
be rigged, tail/body motion uses a **GPU head→tail body-wave vertex shader**
plus a steering AI (states, banking, depth, wall avoidance). `@types/three` added
as a dev dep for strict TS.
**Consequences:** 3D fish read as more *alive in motion* (depth swimming, banking
turns, body wave) than 2.5D sprites; the 2.5D scene is still nicer as a still
image. True fin flutter needs **rigged or part-separated** fish — the documented
next step. Main bundle stays ~78 kB (three is a separate ~625 kB chunk). Full
write-up: `docs/production/THREE_D_TANK_SPIKE.md`.

## 2026-06-29 — Real fish swimming via sliced sprite deformation + steering
**Context:** Fish read as flat PNG stickers that bobbed/slid; an earlier
whole-sprite vertical wave looked like jitter. The brief: visible body bend, tail
swish, head-led smooth turns, idle/cruise/dart states, 2.5D depth.
**Decision:** Two new modules + a motion rewrite.
- `render/fishDeformation.ts` — `drawSlicedStamp()` redraws a fish's graded stamp
  as ~18 vertical slices, each offset by a head→tail travelling sine wave
  (head weight ~0, tail max) plus a static `turnBend` for body curvature in
  turns. `effects.drawSprite` gained an optional `deform` that routes to it.
- `data/swim.ts` — per-behavior `SwimProfile` (cruise/turn/tailAmp/tailFreq/
  bodyFlex/hover/dartChance/schooling/depth); `cruise` derives from species speed.
- `render/tankScene.ts` — agents now use an idle/cruise/dart **state machine** with
  acceleration-limited steering (curved paths, arrive-slow, edge **avoidance** not
  bounce), depth-lane wander, facing **hysteresis** + eased turn-through with a
  0.3 minimum width (no sliver/pop), velocity pitch, and a smoothed bend signal.
  Tail amplitude/frequency scale with state + speed; inverts (shrimp/snail) keep a
  simple scoot with no flex.
**Consequences:** Fish visibly flex and swish, lead with the head, accelerate and
glide, and respond to feeding (staggered darts toward the surface). Cost ≈ 18
slice-blits per fish/frame (~500 total) — fine for one tank. Amplitudes/freqs are
all in `swim.ts` for easy tuning.

## 2026-06-29 — Upscaled fish art + betta centerpiece
**Context:** User supplied 5 high-res, background-removed fish in `UpScaled_Assets`.
**Decision:** Crop each to its alpha bbox, downscale to ≤1000px, install as
`harlequin_rasbora`, `panda_cory`, `guppy`, `platy`, `betta`; set their
`CREATURE_TRIM` to full-frame and retune `sizeFrac`. Swapped the starter tank's
centerpiece from `dwarf_gourami` to the new `betta` to showcase the body-bend
animation. (Existing saves keep their old centerpiece until "Reset Game".)
**Consequences:** Much higher-fidelity fish; the rest (celestial pearl danio,
inverts) still use the original art until upscaled versions exist.

---

## 2026-06-29 — Drop the tank_glass.png photo overlay (fixes the double-outline)
**Context:** The glossy pass screen-blended `tank_glass.png` over the tank. That
asset is a ¾-perspective photo of a real aquarium with bright cyan glass edges;
over our flat, front-on procedural tank it stamped a *second*, mismatched glass
outline inside the water (an inset rectangle with angled corner lines). Raising
its alpha to 0.30 made it obvious; the perspectives can never align.
**Decision:** Remove the photo overlay entirely. The procedural `paintGlassFront`
(sheen, drifting reflections, edge highlights, corner glints, wet rims) carries
the glossiness on its own.
**Consequences:** The spurious inner outline is gone and the glass still reads
glossy. `drawGlassOverlay` is now unused by the renderer (kept in effects for
possible future per-geometry use). Verified via before/after screenshots in
`docs/production/screenshots/outline-{before,after}.png`.

## 2026-06-29 — Lifelike fish: depth swimming + body undulation
**Context:** Fish only slid side-to-side at a fixed depth; the user wanted
real-fish motion including front-to-back movement.
**Decision:** (1) **Depth (front-back):** each fish holds a depth within its
shoal's slab (per-fish `offZ`) and shoals/centerpieces/bottom-dwellers ease
toward wandering depth targets, so fish visibly swim toward/away from the glass
(scale + haze + occlusion already track `z`). (2) **Body undulation:** `drawSprite`
gained an optional `bend` that redraws the sprite in ~12 vertical strips offset by
a head→tail traveling wave (amplitude ∝ swim speed), so the body flexes and the
tail sweeps — fish only (not the many tiny inverts, for perf). (3) **Pitch:** the
nose eases toward the actual travel direction. The old rigid full-body wiggle
rotation was removed in favour of the strip flex.
**Consequences:** Fish read as alive and three-dimensional. ~12 strips × fish only
keeps the per-frame cost modest. Verified in Playwright (motion across frames +
zoomed flex with no strip seams).

## 2026-06-29 — Treat the existing build as the foundation (don't rebuild from zero)
**Context:** The master prompt frames this as a "brand new project, build from
scratch." But the project folder already contains a working Vite+TS+Canvas build
(Phases 0–2) layered on top of the starter pack, created in a prior session. The
"old project to ignore" (`GitHub/3`) is a *different* folder and was never
touched.
**Decision:** Do not delete/overwrite the working build. Treat it as the
foundation, formalize the missing process artifacts (CLAUDE.md + production
docs), finish the in-flight polish, and continue down the phase roadmap.
**Consequences:** No loss of verified work. Process discipline now matches the
prompt. "Build from scratch" is interpreted as "build to the spec's quality
bar," not "rm -rf and restart."

## 2026-06-29 — vitest for the test harness; tests live outside `src`
**Context:** Phase 2 acceptance requires the pure sim to be tested. The project
is Vite-based.
**Decision:** Use **vitest** (Vite-native, zero-config). Tests live in top-level
`tests/`, kept out of the `src` tsconfig include so `tsc`/`vite build` stay
focused on shippable code; tests import `{describe,it,expect}` from `vitest`
explicitly (no global types needed). A small in-memory `localStorage` polyfill
covers `save.ts` under Node.
**Consequences:** `npm test` runs 33 tests (rng/sim/save/codex). Vitest adds
dev-only transitive deps (audit warnings are dev-only, not shipped).

## 2026-06-29 — `resetSimState()` for seed-reproducible new games
**Context:** `sim.ts` caches the RNG as a module singleton keyed by seed and
holds a `warnState` map; the app's `reset()` made a fresh state but never cleared
these, so a reset game inherited the old RNG position + stale warnings.
**Decision:** Add `resetSimState()` (nulls the RNG cache, clears `warnState`) and
call it from `reset()`. Tests call it in `beforeEach` for isolation.
**Consequences:** New/reset games are reproducible from seed; determinism is
testable. Purely additive — no change to a normal continuous session.

## 2026-06-29 — Aquatic codex is the source of truth; species.ts derives from it
**Context:** `04_docs` ships an authoritative stats bible (a JSON array of 22
aquatic species). The hand-written `species.ts` had drifted (e.g. betta rarity).
**Decision:** Generate `src/data/aquaticCodex.ts` from the docx JSON
(programmatically, to avoid transcription error). It is the single source for
taxonomy/care/rarity/temp/pH/1–7 scales/render direction. The renderable
`species.ts` subset derives name/latin/rarity/temp/diet from the codex and keeps
only its tuned on-screen size/zone/speed + the sim-balance **bioload coefficient**
(deliberately NOT the codex's 1–7 "Bio" scale, to preserve the verified
nitrogen-cycle balance). A consistency test enforces the link.
**Consequences:** One source of truth, no drift; the full 22-species roster is
ready for the Phase 5 shop/collection. Regenerate (don't hand-edit) the codex.

## 2026-06-29 — Glass gloss: procedural front + photo overlay, time-animated
**Context:** User feedback — "looks too matte, make it more glossy."
**Decision:** Keep the hybrid glass (procedural `paintGlassFront` + real
`tank_glass.png` screen-blend overlay). Add additive sheen, drifting diagonal
pane reflections driven by elapsed time, crisp edge highlights/corner glints,
wet specular rims, a brighter water gradient, and bump the photo overlay alpha
0.22 → 0.30.
**Consequences:** Glossier, livelier glass without replacing the interactive
scene with a static image. `canvasRenderer` threads an `elapsed` accumulator
into `paintGlassFront`.

## 2026-06-29 — Creature turn animation via eased signed face-scale
**Context:** Fish flipping instantly on direction change looked robotic; user
wanted "better animation."
**Decision:** Each agent keeps a signed `face` scale that eases toward its
heading (magnitude <1 mid-turn = squash), body wiggle amplitude scales with
speed fraction, and feeding excitement nudges fish toward the surface.
`SpritePlacement` gained `scaleX` to override simple flip.
**Consequences:** Smooth, organic turns and livelier motion using existing
sprite draw path; no per-frame sprite sheets needed.

## 2026-06-29 — 2.5D depth via depth-sorted sprite stamps (not 3D)
**Context:** Need a 2.5D look while staying strictly 2D (no Three.js).
**Decision:** Maintain a depth-sorted draw list with perspective X, ground-Y
slope, depth scale, teal haze, contact shadows, and a per-sprite top-down light
grade applied through an offscreen "stamp" canvas (`source-atop`). Sprites are
placed by pre-measured alpha trim boxes.
**Consequences:** Convincing depth and lighting within Canvas 2D; cost is the
per-sprite stamp pass.

## 2026-06-29 — Sim is a pure module, separate from rendering
**Context:** Acceptance criteria require the ecosystem sim to be testable without
Canvas/DOM.
**Decision:** `src/core/sim.ts` imports no rendering/DOM code; deterministic
mulberry32 RNG; render layers read sim state but never feed it back implicitly.
**Consequences:** Sim is unit-testable (test harness still TODO). Clean
separation of concerns.

## 2026-06-29 — Secrets hygiene for paid asset APIs
**Context:** Three asset tools use paid APIs (OpenAI, fal, remove.bg).
**Decision:** Keys read from `.env` only (gitignored via `.env` + `.env.*` with
`!.env.example`); never hardcoded or printed; every real call logged in
`api_usage_log.md`; scripts support `--dry-run`.
**Consequences:** No key leakage risk; auditable spend; safe to test without
cost.

## 2026-07-01 — Exact-contour collision is the single source; care systems land as pure models

- **Marching-squares contours over hulls/rectangles.** The v2 approximations
  (convex hull, multi-part rects) never looked like the asset. v3 rasterises the
  mesh's FILLED triangles and traces the boundary with marching squares into
  concave `poly` solver volumes — the SAME points feed collision, navigation,
  placement and the debug overlay, so the debug provably shows what the animal
  hits. Output is bounded (6 loops x 56 pts max, speckle dropped) after an
  unbounded first cut pegged the CPU (the nav graph is quadratic in ring nodes;
  solver cost scales with loop points). Alternatives rejected: SDF textures
  (harder to debug-draw + serialise), per-triangle exact hulls (huge point counts).
- **Save schema v2 + defId + rehydration.** The "collision looks like shapes" bug
  was ultimately a STALE SAVE loading placeholder-only layouts (no `asset`
  fields). Decision: version-gate the save, persist the catalog `defId` on every
  placed object, and re-derive asset paths + drop persisted footprints on every
  load. A save can never again silently downgrade to placeholders.
- **Hides are entered through real geometry, not exemptions.** Because the cave
  contour keeps its mouth open, the pocket is ordinary free space — the shelter
  behaviour is plain navigation to an interior anchor. No collision layers, no
  ghosting the hide, nothing to desync.
- **Care systems are pure modules first.** Dirt map, terrain, food types,
  wellbeing all live in `src/habitats/` with unit tests; the scene only renders
  them and routes pointer input (`renderer.groundAt` + window-capture listeners,
  the same pattern the editor uses). That kept the 44 new tests cheap and the
  Three bridge thin.
- **Hanging props FALL when unsupported** (rather than flagging red in place or
  prompting to reattach) — deterministic, self-explanatory in the event log, and
  trivially pure-testable (`settleHanging`).

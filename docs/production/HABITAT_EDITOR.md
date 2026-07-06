# HABITAT EDITOR — Decorate Mode (lizard terrarium)

_Last updated: 2026-07-01_

The **Decorate** button opens a real, in-world habitat editor for the 3D lizard
terrarium: a catalog of props on the left, the 3D terrarium as the viewport, a
transform **gizmo** on the selected prop, and a right-side **inspector**. Placing,
moving, rotating, and scaling props updates the layout, collision, navigation,
habitat score, and the save — live. The fish tank and 2.5D aquarium are untouched.

---

## 1. UI decision — why this shape (research before build)

We compared the transform workflows of the tools the brief called out:

| Tool | What's great | Why NOT to copy wholesale for GLASSWATER |
|------|--------------|------------------------------------------|
| **Blender** | Ultimate power: modal `G/R/S`, axis locks (`X/Y/Z`), numeric typing, snapping, pivots. | Modal, keyboard-first, no persistent gizmo by default → steep for a cozy game. Too much for a normal player. |
| **Unity Scene View** | Persistent **W/E/R** gizmos (move/rotate/scale), click-select, inspector on the right with numeric transform. Discoverable + powerful. | Ideal reference. Full Unity is over-featured (layers, snapping increments, handles galore). |
| **Unreal Editor** | Same **W/E/R** gizmo model, viewport toolbar, details panel, drag-from-content-browser placement. | Same reference; full Unreal details panel is far too dense. |
| **three.js `TransformControls`** | A ready, battle-tested move/rotate/scale gizmo that IS the Unity/Unreal model, with `dragging-changed` to gate the camera. | It's a tool, not a full UX — we wrap it. |
| **Cozy builders** (Unpacking, Animal Crossing, Terrarium apps) | Click-to-pick, ghost preview, drag-to-place, gentle constraints (things sit on the ground), forgiving overlaps. | The "feel" target: warm, low-friction, no engineering vibe. |

**Decision — a simplified Unity/Unreal-style editor, NOT Blender:**

1. **Not full Blender.** Blender's modal, keyboard-only transform (no persistent
   gizmo, cryptic pivots/axis-locks) is wrong for a cozy collection game. We keep
   only the *helpful* Blender-ish hotkeys.
2. **Simplified Unity/Unreal gizmos are better here.** A persistent, clickable
   move/rotate/scale gizmo on the selected object is discoverable (you can *see*
   the handles), forgiving, and matches what players expect from "build mode" in
   games. Left = catalog, center = viewport + gizmo, right = inspector.
3. **three.js `TransformControls` is the right engine.** It's exactly the
   Unity/Unreal gizmo, already implemented + maintained in the same `three` we
   ship, code-split into the lazy 3D chunk (no cost for 2D players). It emits
   `dragging-changed` so the camera never fights a drag, and `objectChange` for
   live sync. Building a custom gizmo would reinvent it with more bugs.
4. **Beginners** never need to learn anything: click a catalog card → click the
   sand to drop it; click a prop → drag it; use the on-screen **Move / Rotate /
   Scale** toolbar and the inspector sliders. Sensible defaults keep props flat on
   the floor and rotating only around Y.
5. **Advanced users** flip the **Advanced** toggle to unlock full **X/Y/Z
   rotation** and **per-axis scale** (up to 8× / hard cap 10×), plus the
   interaction-type dropdown — power without cluttering the default view.

### Hotkeys (Blender-ish where it helps, Unity-ish gizmo modes)
- **W** = Move · **E** = Rotate · **R** = Scale (Unity/Unreal muscle memory)
- **Q** / **Esc** = deselect (or cancel placement)
- **Delete** / **Backspace** = delete selected
- **Ctrl+D** = duplicate selected
- **Ctrl+Z** = undo · **Ctrl+Y** / **Ctrl+Shift+Z** = redo
- While placing: **R** or **mouse wheel** rotates the ghost; **Ctrl** snaps to grid

---

## 2. Layout (Unity/Unreal-style, cozy skin)

- **Left / top panel:** *Decorate Mode* title, live **Habitat Score**, the
  **catalog** of placeable props (cards with name + interaction tag), a transform
  **toolbar** (Move / Rotate / Scale + **Advanced** toggle), and instructions.
- **Center:** the 3D terrarium. The selected prop shows the transform **gizmo**.
- **Right (inspector):** appears when a prop is selected — name / category /
  interaction, position X·Z, rotation X·Y·Z, uniform (or per-axis) scale, and
  actions: Duplicate, Delete, Reset Transform, Snap to Floor, Center, and the
  Advanced locks + interaction dropdown.

---

## 3. Rotation (X / Y / Z)

- **Simple mode (default):** rotation around **Y** only (turn/spin on the floor) —
  the gizmo shows just the Y ring and the inspector shows only Rotation Y.
- **Advanced mode:** unlocks **X** (tilt fore/aft) and **Z** (tilt side-to-side),
  for leaning driftwood, tilted rocks, angled plants. Dishes warn if tilted past a
  threshold (they should stay flat).
- Angles are shown in **degrees** in the UI and stored in **radians** internally
  (the codebase uses radians). Collision + climb footprints update on every axis —
  see §5.

## 4. Scale

- **Normal range:** 0.25× – 3.0× (uniform slider).
- **Advanced range:** 0.05× – 8.0× and optional **per-axis** X/Y/Z scale.
- **Hard safety cap:** 10× (the model clamps here regardless).
- Scaling updates the visible GLB, the collision footprint, the climb height, the
  debug outline, the navigation graph, and the save. Invalid results (through the
  glass, trapping the gecko) are blocked/flagged — see §6.

## 5. Tight collision that follows the real asset — after ANY transform

Collision is solved top-down on the XZ floor plane (the gecko walks on sand). The
footprint is **measured from the real GLB** (`AssetFootprint`, local + natural
size), then the pure compiler applies the object's transform:

- **Untilted (Y-only, the common case):** a tight **oriented box** (OBB) rotated by
  Y, sized `footprint × scale` — hugs the mesh, rotates with it.
- **Tilted (X/Z rotation, advanced):** the 8 scaled+Euler-rotated box corners are
  projected to XZ (matching three's `Euler` `'XYZ'` order exactly) → a tight
  world-aligned footprint, and the **top** = the highest rotated corner (so climb
  height matches the tilted mesh). This is a safe, close-fitting superset for
  irregular tilts (documented limitation: not a per-triangle hull).
- Circles (round props) keep a radius from the scaled footprint; their top follows
  the tilt.

So moving/rotating/scaling a prop moves/rotates/scales its collision **exactly**,
climbable props stay climbable after transforms, and the debug overlay traces it.

## 6. Placement validation

A drop/scale is rejected (ghost turns **red**) when it would:
- leave the enclosure bounds / go through the glass,
- bury deep inside another **hard** prop (a slight edge touch is fine — cozy),
- land on top of the gecko or a live feeder,
- (on scale) grow so large it traps the gecko or breaks navigation.

Soft props (succulents) never hard-block; slight overlaps are allowed.

## 7. How collision/nav/score/save stay in sync

Every **discrete** edit (place, delete, duplicate, reset, interaction change) and
every **committed** gesture (end of a gizmo drag or slider change) calls a single
`rebuild`: recompile collision → rebuild the navigation graph → free the gecko if
it got trapped → recompute the habitat score → refresh decor shadows + debug →
save. During a live drag only the visual + data move (cheap); the nav graph
rebuilds once on release, so dragging stays smooth.

## 8. Adding a new placeable to the catalog

1. Resize the GLB's textures to 1024² and copy it to
   `public/assets/3d/habitats/lizard/decor/<clean_name>.glb`.
2. Add a `PlaceableDef` to `LIZARD_PLACEABLES` (`src/habitats/HabitatBuilder.ts`):
   `collision` half-extents as a **display-size hint**, an `interaction` type, and
   `asset: "<clean_name>.glb"`.
3. It appears in the catalog automatically; placing it loads the GLB, measures a
   tight footprint, and collides data-drivenly.

## 9. Known limitations

- Tilted-prop (X/Z) collision uses a world-aligned bounding footprint, not a
  per-triangle hull — tight for boxes/rocks, a small safe superset for very
  irregular tilts.
- Position Y is floor-locked for **floor** props; **elevated / hanging** props are
  Y-movable (see §11). Free-Y stacking of floor props isn't exposed.
- Undo/redo covers layout edits (place/move/rotate/scale/delete/duplicate/reset),
  not camera or selection.
- One enclosure size for now (the size presets exist in data but aren't in the UI).
- Catalog cards use illustrated (emoji) icons, not rendered GLB thumbnails yet.

## 10. What to test first

Open `http://localhost:5173/?habitat=lizard` → **Decorate**:
1. Click a catalog card → click the sand → prop appears + is selected (gizmo on).
2. **W/E/R** switch Move/Rotate/Scale; drag the gizmo (camera shouldn't fight it).
3. Flip **Advanced** → rotate on X, scale past 3× → collision debug (**C**) still
   hugs the mesh; the gecko routes around / climbs correctly.
4. Duplicate (Ctrl+D), Delete, Undo (Ctrl+Z) / Redo (Ctrl+Y), Reset Layout.
5. Reload → the edited layout persists.
6. Switch to **2D Aquarium** / **3D Fish** → the fish tank is unchanged.

## 11. v2 — accuracy, no-phasing, UX, hanging, click-info

A follow-up pass on collision accuracy, animal integrity, and build UX. Screens:
`docs/production/screenshots/habitat_editor_v2/`.

**Concave collision for roots/twigs/driftwood** (`src/habitats/HabitatFootprint.ts`,
pure + unit-tested). On GLB load the renderer samples the mesh's vertices projected
to the XZ floor and calls `traceFootprint`, which:
1. builds a decimated **convex hull** (≤ 14 pts),
2. rasterises the points into an occupancy grid, dilates 1 cell to close the sampled
   outline, then **flood-fills enclosed holes** so a solid squat prop reads as filled
   while a branchy one (whose gaps open to the border) stays sparse,
3. if the filled area is **< 82 %** of the hull area → **concave** → decompose into
   ≤ 12 **axis-aligned rectangles** (greedy largest-rectangle), one collider per
   branch, so the empty gaps between branches are covered by *no* volume.

`compileObject` emits **one OBB per part** (following scale + yaw + position); compact
props keep the single hull; round props (dishes/boulder) stay circles; soft plants +
feeder zones compile to nothing. So collision **traces the visible object** — never a
giant box, never bridging empty space. (The current supplied driftwood is a compact
upright root, so it traces as a tight hull; the multi-part path engages automatically
for genuinely branchy meshes — proven by `tests/footprint.test.ts`.)

**Animal no-phasing** (`HabitatCollision.resolveBody` / `bodyBlocked` /
`bodyPenetration`; `geckoProbes`). The gecko is a chain of **body probes**
(snout → neck → chest → hips → tail → tail-tip) in its local frame. Each frame, after
the brain moves/turns, `resolveBody` pushes the whole silhouette out of hard obstacles
+ walls (10 relaxation passes); `resolve` **sweeps** long moves into sub-steps with a
line-of-sight guard so a fast dart can't tunnel a thin obstacle; the body is **settled
clear at spawn and after every edit**. The centre stays hard-guaranteed; the
extremities leave at most a sub-centimetre (invisible) residual in the tightest wedge.
The debug overlay draws the probes as light-blue rings.

**View Collisions + legend.** A visible **View Collisions** button in the lizard HUD
*and* the editor toolbar toggles the overlay (the **C** key still works); a colour
legend (red = blocked/wall, green = climbable, cyan = low/step-over, amber = hide,
purple = soft, white = bounds, light-blue = animal probes) shows whenever it's on.

**Camera vs container.** OrbitControls orbits the **camera** around the fixed
habitat; the scene/enclosure is never rotated (QA hook `__habitat3d.sceneRotationY()`
stays 0 while `cameraPos()` changes). **Home** resets the framing; the info card's
**Focus** re-targets the animal.

**Catalog (Planet-Zoo / JWE-style).** Cards are grouped into **sections** (Rocks /
Hides / Branches / Plants / Hanging / Dishes) with **icon** thumbnails, a **search**
box, **filter chips** (All / Climbable / Blocked / Hides / Soft / Food-Water /
Hanging), and a collapsible **Build Help** sheet.

**Y-axis / hanging placement.** Placeables carry a `placement` mode (`floor` |
`elevated` | `hanging`). Floor props stay XZ-locked; **elevated/hanging** props
(Climbing Branch, Hanging Vine) get the gizmo's **Y handle** + a **Height** slider,
and start lifted. A prop whose underside sits above the gecko's head
(`OVERHEAD_CLEARANCE`) doesn't block the floor; a low one still does.

**Invalid placement.** The ghost turns **red** with a reason line ("Outside the
enclosure", "Overlaps a solid object", "Too close to the gecko"); dropping is blocked,
and an invalid gizmo **move snaps back** to the last valid spot.

**Click-the-gecko info card** (`src/ui/animalInfo.ts`; works in normal view *and*
Decorate). Clicking the gecko opens a card with its behaviour, hunger/stress/health/
comfort, environment comfort, current target, rig status + loaded clips, and warnings,
plus **Feed / Focus / View-Collisions** actions and a highlight ring. In Decorate mode
a click on the gecko opens the card instead of selecting decor.

---

## 12. v3 — EXACT asset-silhouette collision + real previews + interactive care (2026-07-01)

**The acceptance gate for this pass:** with the visible mesh hidden, the collision
debug must still look like the real rock / cave / dish / branch — not a cylinder,
box, hull or rectangle set. It does now (see `screenshots/collision_contours/`).

### 12.1 How the exact contour works (single source of truth)
1. On GLB load, `ThreeTerrarium.sampleMeshTrianglesXZ` projects every mesh
   TRIANGLE (filled faces, not vertex samples) onto the floor plane.
2. `HabitatFootprint.traceContours` rasterises them into a 128x128 occupancy grid,
   fills enclosed holes (`fillEnclosed`), and extracts the boundary with
   **marching squares** into closed contour loops. Loops are lightly simplified
   (Douglas-Peucker) and BOUNDED: the 6 largest loops, 56 points each max, and
   speckle below 2% of the main silhouette is dropped (real GLBs are noisy;
   unbounded contours melted the CPU via the nav graph).
3. The loops live on `AssetFootprint.contours` and compile to concave `poly`
   solver volumes (`HabitatCollision`), taking precedence over circle/hull/
   multi-part. Collision push-out, `isBlocked`, LOS, navigation, placement
   validity, body probes AND the debug overlay all read these same points — the
   debug line PROVES what the animal collides with.
4. The debug draw is a translucent FILLED silhouette on the sand + a crisp base
   outline (+ faint top loop and corner struts on tall props), colour-coded by
   interaction. Toggle: View Collisions button / C. QA: `__lizard.solverShapes()`
   returns `{ poly: N }` — zero primitives for real assets;
   `__lizard.setDecorVisible(false)` hides the meshes for the gate check.
5. A cave's open mouth is genuinely open in the contour — which is exactly what
   makes hides ENTERABLE (12.5) with no collision exemptions.

**Root cause found this pass:** collision had looked like primitives because a
stale v1 localStorage save (predating the decor pipeline) had NO `asset` fields —
the scene silently loaded placeholders with authored box/sphere volumes. Fixes:
`HABITAT_SAVE_VERSION = 2` (invalidates those saves), `defId` persisted on every
placed object, and `rehydrateLayoutAssets` re-derives asset paths + drops stale
footprints on every load, so a save can never silently lose its GLBs again.

**Perf:** every solver volume gets a precomputed bounding circle (cheap reject
before exact edge math) and the nav graph builds ONE waypoint ring per PROP (its
volumes merged), not per contour loop.

### 12.2 Real thumbnails + real placement ghost
- Catalog cards render the ACTUAL GLB in a small offscreen renderer
  (`ThreeThumbnails.decorThumbnail`, cached data URLs; emoji only as fallback).
- Arming a card shows the ACTUAL model as the ghost (cached clone, shared ghost
  material) at the exact display scale, yaw and Y that placement will use —
  tinted cyan (valid) / red (invalid) with the live reason line. The stand-in box
  appears only for the first frames of a cold cache / asset-less placeables.
- Placement drops exactly where the preview was (verified: ghost at
  (-0.156, 0.667) placed the object at (-0.156, 0.667)).

### 12.3 Snap-back, Y-axis, camera
- The gizmo captures the FULL transform at drag start; an invalid release (over
  the gecko/feeders, or an unsupported hanging prop) restores position +
  rotation + scale + height — invalid transforms never persist.
- Elevated/hanging props always show the gizmo's Y arrow; Advanced unlocks Y for
  floor props too. PgUp/PgDn nudge height (Shift = fine). F focuses the selection
  (or the animal); the toolbar gains Focus + Reset-Camera buttons
  (`OrbitControls.saveState/reset` — the camera moves, the vivarium never spins).

### 12.4 Hanging attachment rules
A hanging/elevated prop must reach the top frame, hug a glass wall, or rest at a
nearby climbable prop's top (`HabitatEditing.hangingSupport`). Mid-air placement
shows red + "Needs support — attach to the top frame, a wall, or a branch"; an
unsupported move snaps back; deleting/moving the support makes the prop FALL to
the substrate (event-logged). Pure-tested.

### 12.5 Interactive care systems (all pure-model + unit-tested)
- **Enterable hides** — `hideAnchor` finds a free spot inside the hide's contour
  pocket; the movement brain's `requestShelter` paths in through the mouth and
  rests (`sheltering`); the scene's shelter drive triggers on stress or a natural
  cadence and grants extra calm inside. Proven by a pure test that walks the
  gecko into a horseshoe hide with zero visible body penetration.
- **Dirt + Clean Mode (B)** — a 44x28 dirt map accumulates around wherever the
  gecko lingers, food, dishes and hides (plus a slow ambient film); it renders as
  dark blotches on a decal overlay and drives `environment.cleanliness`. The
  Clean button / B opens a brush mode (drag to scrub, [ ] sizes the brush, live %
  in the bar); a fully spotless tank earns a sparkle burst + event.
- **Feed Mode (F)** — a tray of Cricket / Mealworm / Dubia Roach / Waxworm (keys
  1-4), click the sand to drop each one; placement enforces bounds / not-inside-
  decor / not-on-the-gecko / max 6 live insects, with the reason shown live in
  the bar. Food types differ (satiety, fat, calm, speed, lifespan); waxworms log
  a fatty-treat warning; a FULL gecko ignores prey until hunger returns.
- **Terrain Mode (T)** — raise / lower / smooth / flatten brushes displace the
  real sand mesh (clamped to 8 cm, walkability preserved); wet patches paint a
  teal sheen, raise ambient humidity, and dent a desert gecko's land comfort when
  overdone. All serialised with the save.
- **Wellbeing card** — clicking the gecko now shows 12 live meters (temp /
  humidity / security / enrichment / cleanliness / hydration / land comfort /
  activity + the four needs) and plain-language recommendations, every value
  derived from real state (`LizardWellbeing.computeWellbeing`, correlation-tested).
- **Shortcuts** — D/B/F/T modes, C collisions, H help sheet, Esc/Enter close,
  1-6 tool pick, [ ] brush size; the editor keeps W/E/R, Ctrl+Z/Y, Ctrl+D, Del,
  PgUp/PgDn, F. All listed in the H overlay and the Build Help sheet.

### 12.6 Known limitations (v3)
- Advanced X/Z-TILTED props still fall back to a world-aligned box superset (the
  contour is authored for the untilted pose).
- Terrain heights are visual + stats only — the gecko walks the flat plane
  (heights are clamped gentle so nothing reads wrong).
- Feeders render as simple markers (no insect GLBs yet); hide interiors don't yet
  hide the gecko model behind geometry (it rests in the pocket).
- The shelter drive is time/stress-based; day-night cycling is future work.

## 13. v4 — EXACT surface-height collision: per-point heightfields (2026-07-01)

v3 made collision exact in PLAN (the marching-squares silhouette). v4 makes it
exact in ELEVATION — the fix for three user-visible bugs: the gecko climbing the
driftwood with half its body inside the wood, the gecko levitating beside the
branch (standing under its elevated arch), and the rock cluster wearing one flat
collision top even though one side is much taller than the other.

### 13.1 What was wrong
Every compiled volume had ONE `top` (the mesh bbox max), so `climbHeightAt`
lifted the animal to the prop's MAX height anywhere inside the silhouette, the
brain capped that lift at 0.12 m (so tall wood swallowed the body), and the
per-prop "overhead" test couldn't express "this SPAN of the branch is elevated
but its ends are grounded".

### 13.2 The heightfield (pure — `HabitatFootprint`)
- `buildHeightField(tris3, 112)` — the same local-frame triangles the contour
  tracer uses, but keeping Y: each covered cell stores the mesh's **TOP** (max
  surface Y — what you stand on) and **BOTTOM** (min surface Y — the underside).
  Cell coverage via barycentric plane interpolation per triangle (bbox scan);
  near-vertical wall triangles contribute through vertex stamps; one
  value-dilation pass makes edge sampling robust. Real decor GLBs are closed
  solids, so grounded parts have bottom ≈ 0 and elevated spans (the arch) have a
  high bottom.
- `sampleHeightField(hf, x, z)` — bilinear over solid cells; null off the mesh.
- Registered ONCE per GLB file (`registerHeightField(assetKey, hf)`) — several
  thousand numbers per asset is far too heavy to persist per placed object, and
  the field is transform-independent (local frame).

### 13.3 Collision integration (`HabitatCollision`)
- Untilted compiled volumes carry a `SurfaceRef` — the field + the exact
  position/yaw/per-axis-scale transform. `CollisionWorld.surfaceSpanAt(ob, x, z)`
  inverts it (translate → un-yaw → un-scale) and returns the world-space
  top/underside at that point.
- `climbHeightAt(x, z, radius, fromY)` — for surfaced passable props it returns
  the TRUE local surface height, and any span whose underside is more than
  `PASS_UNDER_CLEARANCE` (0.1 m) above `fromY` is treated as overhead → the
  animal walks UNDER it. Props without height data keep the old flat-top path,
  X/Z-tilted props fall back to the flat top (documented limitation).

### 13.4 Movement (`GeckoMovementController`)
- Feeds its current standing height into the query (so pass-under is relative to
  where the body actually is), climb cap raised to a 0.6 m safety-only clamp,
  and the lift ease gets a gap-proportional "mantle boost" (sheer trunk edges
  settle in ~0.1 s instead of visibly sinking through the face).
- New `groundPitch`: surface sampled ±11 cm along the heading → smoothed
  nose-up/-down pitch, applied with YXZ rotation order in ThreeAnimalController
  so heading stays true. Climbing driftwood now reads as climbing.

### 13.5 Debug + QA
- View Collisions draws each surfaced prop as a translucent **lit shrink-wrap
  mesh** of its measured surface (per-rock heights, dish rims, the hollow under
  the arch) + the crisp base contour; flat top-loops/struts remain only for
  placeholder props with no height data.
- QA hooks: `__lizard.surfaceAt(x, z, fromY?)` (walk height relative to the
  substrate), `__lizard.surfacedVolumes()`, `__lizard.pitch()`, `__lizard.geckoY()`.
- Playwright-proven: 31/31 volumes surfaced; driftwood standable lifts
  2.4→17.9 cm with 9 pass-under cells inside the silhouette; rock cluster
  0.8→24.2 cm; steady body-vs-surface tracking ≈ 1 mm; pitch to ±0.52 rad; the
  gecko frozen mid-climb ON the wood (screenshots in
  `screenshots/surface_collision/`); fish tank + 2D aquarium untouched; 0
  console errors. 174 vitest tests (new: `heightfield.test.ts`,
  `surface.test.ts` — ramp/two-level/arch fields, transform inversion,
  pass-under, uncapped climb, slope pitch).

### 13.6 Remaining limitations (v4)
- X/Z-TILTED props fall back to the flat prop-wide top (heightfield assumes
  yaw-only, like the contour path).
- The surface heightfield is 2.5D (one top per column): a cave's interior floor
  under its roof isn't a standable surface (hides remain enterable via the open
  contour mouth as before — hard props don't use walk heights).
- A hollow-shell mesh with NO bottom faces would read its interior as
  "pass-under"; real Tripo decor is closed, and the fromY-relative rule
  self-heals while climbing from the perimeter.
- Feeder insects still sit at substrate height (they don't ride prop surfaces).
- ~~Terrain sculpting still affects visuals/stats only, not the walk height.~~
  → fixed in v5 (§14): terrain is physical.

## 14. v5 — Surface-aware grounding, anchored camera, physical terrain (2026-07-01)

### 14.1 Foot contacts + body roll (`src/habitats/lizard/GeckoFeet.ts`)
Four configurable foot anchors (FL FR RL RR) + a **distance-driven diagonal
trot**. PLANTED feet are world-locked EXACTLY on the surface sampled by the same
`climbHeightAt` the body uses (terrain + prop heightfields + pass-under all
apply); they never float, sink, or slide. STEPPING feet arc (smoothstep + sine
lift) and land back on the surface; idle feet settle under the body; a teleport
guard re-homes after flee/world swaps. The body derives from the contacts:
**pitch = front-vs-rear heights, ROLL = left-vs-right heights** (both eased,
capped gently on bare ground and steeper on climbables), height = centre surface
∨ mean contacts. `ThreeAnimalController` applies yaw→pitch→roll (YXZ) and hands
the placeholder its contacts in local space — each leg AIMS at its live target
(stretchy within limits), so feet visibly touch dunes, rocks and wood. The final
rigged GLB plays clips as before; its foot bones get these same contacts later.

### 14.2 Surface sampler
`CollisionWorld.sampleSurfaceAt(x, z, fromY)` → `{ y, normal, slope, type
(substrate/terrain/rock/hide/branch/dish/…), objectId, interaction, walkable,
climbable, tooSteep, fallback }` — one query the feet, debug markers, and
validation all read. Normals come from central differences of the SAME walk-height
query, so they reflect whatever surface actually won.

### 14.3 Terrain is physical (`HabitatTerrain` v2)
- `terrainHeightAt` is now **bilinear** (no stair-steps under feet); new
  `terrainSlopeAt`.
- The collision world holds a **live ground source** reading the height map by
  reference: walk height, foot contacts, `isFree`/`losClear` (bare slopes > ~40°
  are unwalkable → nav routes around, roam targets skip), decor placement
  ("The ground is too steep here"), and feeder drop/wander heights all react to
  the brush **with no world rebuild**.
- `sculptLimits(dims, strong)`: normal ~+0.14 m; **⚡ Strong brush** (Terrain-Mode
  toggle) ~+0.23 m and digs BELOW the default sand to a **bedrock limit** ~1 cm
  above the tank floor. Design: the player sculpts the substrate's TOP —
  depressions/channels/hollows yes; holes through the glass never.
- Brush **masks** skip cells under prop collision volumes + a thin apron along
  the glass (no digging out a boulder's footing, no gap under the panes).
- Visuals: sand plane densified (96×64); the dirt/wet decal overlay is a
  **draped, terrain-following plane**; pebbles re-seat on dunes; the gecko's blob
  shadow sits on the sculpted sand; terrain persists in the habitat save.

### 14.4 Anchored viewing camera + Photo Mode
The lizard scene publishes `CameraLimits`; the renderer constrains the NORMAL
camera to a **±0.75 rad yaw window**, polar band [0.55, 1.5], zoom [1.5, 6], and
clamps the orbit pivot inside the tank — dragging leans your head around a FIXED
tank (the scene itself never rotates; `sceneRotationY` stays 0). A **camera bar**
(Front / ◀ Left / ▶ Right / ⬒ Top / 🎯 Gecko / 📷 Photo / ⟲ Reset) sits under the
top bar; presets flush fling momentum so they land exactly. **Photo Mode** (and
Decorate Mode automatically) restores the free orbit; leaving re-anchors. Fish +
spider habitats publish no limits — their cameras are untouched.

### 14.5 Debug overlays (🐾 Debug ▾ menu)
- **Foot contacts** — a sphere per foot: green planted · yellow stepping · red
  no-plausible-surface; they ride the live contacts.
- **Surface normals** — short whiskers from each contact along the sampled normal.
- **Terrain heights** — heatmap draped on the sand: cyan depressions, amber
  dunes, red too-steep cells.
- **View Collisions** stays a first-class button (C), synced with the menu.
- QA hooks: `__lizard.feet()/roll()/sample()/terrainAt()/sculptStrong()`,
  `__habitat3d.azimuth()/polar()/constrained()/cameraMode()/preset()`.

### 14.6 Verified (v5)
typecheck + build clean · **203 vitest tests** (new `terrain2` / `surfacesampler`
/ `feet` suites) · Playwright live: planted-foot worst gap **0.0000 m** across a
full dune climb; roll to 23° + pitch to 44°; four planted feet at four different
heights (0.108/0.150/0.168/0.251 m); dune sculpted to 0.234 m and a hole to
−0.07 m stopped at bedrock; terrain survives reload; a huge camera fling clamps
at exactly 0.75 rad in normal mode and reaches 189° in Photo Mode; fish + 2D
intact; **0 console errors/warnings**. Screenshots:
`screenshots/gecko_grounding/`.

### 14.7 Remaining limitations (v5)
- The FINAL rigged gecko plays its clips without per-bone foot IK yet — the
  contact points are computed and ready to map onto its foot bones when the
  freelancer delivery lands.
- Props don't ride sculpted terrain height; instead the brush masks the ground
  under them (deferred: footprint-wide resample + visual re-seat).
- Sand texture stretches slightly on very steep dune flanks (UVs are planar).
- Terrain cells are 48×30 — very tight brushes quantise a little.

## 15. v13 — Decorate Mode v2: five-category builder + Decor Catalog v2 (2026-07-03)

The Decorate pass that separates decorating cleanly from Terrain and turns the
editor into a full habitat builder. Full narrative: `docs/production/STATUS.md`
(v13) + the ADR in `docs/decisions/DECISIONS.md`.

- **Catalog** (`src/habitats/HabitatBuilder.ts`): 32 placeables in five
  sections (`DECOR_SECTIONS` = Plants · Rocks · Caves & Hides · Utilities ·
  Decor), 27 live + 5 locked (art pending). Defs carry `desc`/`tags`/`tip`,
  9-axis `effects` (0..10, `DECOR_EFFECT_KEYS`), variant `defaultScale`
  (per-axis) + `tint` (cloned-material lerp; thumbnails keyed per
  file+tint+scale), and `locked`. `makePlaced` stamps defaultScale + tint;
  `rehydrateLayoutAssets` heals both on load. Duplicate charges like placement.
- **Panel** (`src/ui/habitatEditor.ts`): BUILD TOOLS rail (Place/Move/Rotate/
  Scale/Duplicate/Remove/Snap + minis), category tabs + search, cards with
  variant thumbs + lock overlays, right detail card (copy + effects meters +
  tip + selection editing). Detail card max-height stays clear of the tray.
- **Interaction** (`ThreeHabitatEditor`): snap toggle (0.1 m / 15° / 0.25×,
  persisted `gw_decor_snap`, Ctrl inverts), green/amber/red ghost + terrain-
  draped placement ring + soft shadow, amber `placementWarning` advisory
  (scene ring-samples the collision world). QA: `__editorQA.ringAt/ringColor/
  warning/snap/project`.
- **Terrain-true placement**: `defaultPlaceY(defId, x, z)` seats floor props
  on the sculpted sand; `moveObject`/`snapToFloor` re-seat live;
  `resetTransform` returns to the def's defaultScale.
- Tests: `tests/decorcatalog.test.ts` (15). Live proof: screenshots
  `screenshots/session_checks/d1…d8`.

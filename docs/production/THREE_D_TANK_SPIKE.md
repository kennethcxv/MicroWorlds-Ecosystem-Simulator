# THREE_D_TANK_SPIKE — Hybrid 3D Aquarium Viewport

_Spike date: 2026-06-30 · Status: ✅ prototype working, Playwright-verified_

> **Scope:** ONLY the central aquarium viewport becomes 3D (Three.js). The rest
> of GLASSWATER stays 2D HTML/CSS UI, and the existing 2.5D Canvas tank remains
> the default + fallback. This is a spike to test whether a 3D tank gives
> noticeably better **fish animation** than the 2.5D sprite version.
>
> Note: `CLAUDE.md` historically forbids Three.js. That rule is deliberately
> overridden **only** for this isolated, opt-in experimental viewport (documented
> in `CLAUDE.md` §3 and `docs/decisions/DECISIONS.md`).

---

## 1. Tools verified

| Tool | Status | Notes |
|------|--------|-------|
| **Playwright MCP** | ✅ used | Opened the running app, read console (only a harmless `favicon.ico` 404), captured before/after frames, drove the 2D⇄3D toggle. |
| **Blender MCP** | ✅ connected + used | Live scene reachable; imported the betta to confirm **no armature / no shape keys** and the 8 colour-chunk mesh layout + dimensions. Not used to author assets (see §3 decision). |
| **glTF Transform** | ✅ used | `gltf-transform inspect` on all 5 GLBs (meshes, materials, textures, attributes, "no animations"). |
| **Three.js** | ✅ installed `^0.185` + working | Renders the viewport. `@types/three` added as a dev dep for strict TS. |
| **context7** | available | Not needed; GLTFLoader/material APIs were stable from memory. |
| **Figma MCP** | available | Not needed for this spike. |
| **frontend-design / code-review plugins** | available | Toggle styling reuses the existing glass design tokens; code-review can run before promoting the spike. |

## 2. Assets found

In `3D_Assets/` (raw) → copied with clean runtime names to
`public/assets/3d/tank_spike/`:

| Raw file | Runtime name | Role |
|----------|--------------|------|
| `goldfish+3d+model.glb` | `fish_small.glb` | Small active fish (×3) |
| `betta+fish+3d+model.glb` | `fish_centerpiece.glb` | Centerpiece fish (×1) |
| `wooden+cabinet+3d+model.glb` | `aquarium.glb` | **Stand/cabinet** (not a glass tank — glass is procedural) |
| `green+leafy+plant+3d+model.glb` | `plant_01.glb` | Plant |
| `fallen+log+3d+model.glb` | `root_01.glb` | Driftwood/root hardscape |

> The "aquarium" asset is actually a wooden **cabinet**; there is no glass-tank
> mesh, so the glass box + rim + water are built **procedurally** and the cabinet
> is placed underneath as the stand.

## 3. Asset formats

- **glTF 2.0 binary (.glb)**, generator **Tripo** (AI image/text→3D).
- Geometry: `POSITION`, `NORMAL`, `TEXCOORD_0` only. No `JOINTS_0`/`WEIGHTS_0`.
- Materials: `MeshStandard`-style with a JPEG `baseColorTexture` per chunk
  (1024² typical; goldfish has one 2048²). No Draco / meshopt / KTX2.
- **No animations** in any file.
- Triangle counts (render): goldfish ~62k, betta ~85k, plant ~47k, cabinet ~65k,
  log ~104k.

## 4. Fish hierarchy findings

Both fish are one `ParentNode` with **8 sibling meshes** `Mesh_0…Mesh_7`
(materials `tripo_part_0…7`). These are **colour/segmentation chunks of one fused
shell**, not anatomical parts — there is no `Tail_Fin`, `Pectoral_Fin`, etc.
Blender import confirmed: `ARMATURES: []`, `has_shapekeys: False` for every mesh.

Orientation (both fish): body **length axis = Z** (~0.98), height = Y, thin
axis = X. Heads point **+Z** in the model frame (verified in-engine: fish swim
head-first with `headPlusZ = true`).

## 5. Rigged / separated / fused?

**FUSED + UNRIGGED (Case C).** No bones, no shape keys, no separated tail/fins,
no baked animation. The only subdivision is by colour, which we explicitly do
**not** animate as parts. This is the honest constraint that shaped the approach.

## 6. What was implemented

Isolated, modular renderer in `src/render/three/`:

| Module | Responsibility |
|--------|----------------|
| `ThreeBounds.ts` | Tank constants + swim-bounds math (pure, no scene objects). |
| `ThreeMaterials.ts` | Glass, rim, water, substrate materials + aquarium lighting + underwater tint. |
| `ThreeWater.ts` | Tinted water volume, animated surface ripple, caustic pattern on the gravel. |
| `ThreeAssetLoader.ts` | GLTFLoader wrapper; recentres models; **fault-tolerant** (failed load → `null` → placeholder). |
| `ThreeFishAnimation.ts` | GPU body-wave vertex-shader injection (the tail swish). |
| `ThreeFishController.ts` | Per-fish steering AI + species configs. |
| `ThreeTankScene.ts` | Assembles glass/rim/water/substrate/cabinet/plant/log/fish; ticks the scene. |
| `ThreeTankRenderer.ts` | WebGL renderer, fixed camera, resize, render. |

Scene contents: procedural glass box + black rim + corner pillars, tinted water
volume + rippling surface + caustics, gravel substrate + scattered pebbles, the
**wooden cabinet as the stand**, plant (back-left), driftwood/root (mid),
**3 goldfish + 1 betta**, soft hemisphere/key/rim/hood lighting, depth fog, fixed
three-quarter-front camera (no orbit/free/walk). Placeholder geometry stands in
for any asset that fails to load.

Integration: two buttons — **◧ 2D Aquarium** / **⬢ 3D Aquarium · Experimental**
(also `?tank=3d` query param, persisted in `localStorage`). The 3D renderer is
**lazy dynamic-imported** on first use, so 2D-only players never download Three.js
(main bundle stays 77 kB; the 625 kB three chunk loads only on toggle). The cozy
room shows as a CSS backdrop behind the transparent 3D canvas. The 2D
`CanvasRenderer` remains the default and is never removed.

## 7. How movement works

Each fish (`ThreeFishController.Fish`) carries position, velocity, acceleration,
a roaming target, a depth/zone preference, and an **idle(hover) / cruise / dart**
state machine. Per frame it:

1. picks a new target inside its preferred zone on arrival/timer (darts upper-
   front when "excited" by feeding);
2. computes a desired velocity toward the target with **arrival slowing**;
3. adds **soft wall avoidance** (an inward push that ramps near each pane — a
   curve-away, not a bounce);
4. integrates with an **acceleration cap** (so paths curve and speed eases in/out
   — never snapping), then a hard safety clamp inside the bounds;
5. orients via `setFromUnitVectors` (head → velocity, includes pitch) plus a
   **bank/roll proportional to yaw rate** (leans into turns);
6. feeds the body-wave amplitude/frequency from current speed + state.

Two tuned species (`src/render/three/ThreeFishController.ts`):
- **Small (goldfish ×3):** faster, tighter turns, mid/back depth, frequent darts.
- **Centerpiece (betta ×1):** slower, graceful, wider turns, mid/front depth,
  bigger slower body wave — the "star" fish.

## 8. How tail / fin / body animation works

Because the fish are **fused + unrigged**, true per-fin animation is impossible
from these assets. Instead `ThreeFishAnimation.applyFishWave` injects a deform
into every chunk material's vertex shader (shared uniforms, so the whole fish
moves as one body):

```
hp   = clamp((position.z - headZ) * invLen, 0..1)   // 0 at head, 1 at tail
x   += (sin(hp * wavelength - phase) * amp + turn * hp) * hp
```

i.e. a **head→tail travelling sine wave** with amplitude ramping to the tail
(head stays steady, tail swishes) + a steady `turn` term that **curls the body
into turns**. Amplitude/frequency scale with speed and state (hover < cruise <
dart). This produces a believable swimming swish + body undulation on a fused
mesh — visible on the betta's curving body and trailing fins in the captures.

> **Honest limitation:** the betta's fins move only as part of the whole-body
> wave; there is no independent pectoral/dorsal flutter, because the source mesh
> has no separated or rigged fins.

### Attachment fix (2026-06-30) — parts were tearing apart
**Symptom:** during a swim the tail/fins/colour patches drifted away from the
body. **Root cause (confirmed via Blender):** the 8 colour chunks are NOT in one
frame — each chunk node sits at a *different* translation (e.g. `part_0` z≈0.40,
`part_3` z≈0.61). The wave keys off each mesh's local `position.z`, so every
chunk computed a different displacement and separated. **Why not a pivot rig:**
these are arbitrary colour chunks, not anatomical tail/fin meshes — building
`TailPivot`/`FinPivot` would require *cutting* the fused shell, which creates real
gaps. **Fix:** `ThreeAssetLoader.prepareFishBody` bakes every chunk's world
matrix into its geometry (unifying the frame), recentres, and **merges all chunks
into one multi-material body mesh**. The wave now deforms a single continuous body
anchored at the head (`hp=0`), with `FishRoot` owning all world movement and the
deform being a **bounded local time-sine** (no positional accumulation). Verified
in Playwright across idle/cruise/dart/turn for >30 s: no detachment, 0 errors.
Captures: `screenshots/3d_spike/3d_attached_{cruise,dart,turn}.png`.

## 9. Playwright test result

- App loads in 3D mode (`?tank=3d`); console clean except `favicon.ico` 404.
- 3D canvas active (1440×900), 2D canvas hidden, cozy room backdrop behind, full
  HUD (top bar, water-quality, population, habitat info, actions, nav) intact.
- Across frames: betta + 3 goldfish **swim in X/Y/Z**, **turn and bank**,
  **lead with the head** (orientation flag verified), redistribute in depth, and
  **stay inside the glass** — not bobbing/sliding.
- Live toggle switches **3D → 2D** and the 2.5D tank renders perfectly (fallback
  intact). Captures: `screenshots/3d_spike/{3d_tank_planted,3d_tank_fish,2d_tank_fallback}.png`.

## 10. Performance notes

- Scene ≈ 0.57M triangles (one of each decor + 3 shared-geometry goldfish + betta);
  fish instances share geometry/textures (cloned materials only) so extra fish are
  cheap. Smooth in dev.
- Bundle is **code-split**: main `index.js` 77.6 kB; the Three.js viewport is a
  separate 625 kB (161 kB gzip) chunk loaded **only when 3D is toggled**.
- Heaviest cost is texture VRAM (goldfish 2048² ≈ 22 MB GPU) and the ~104k-tri
  log. Both are fine for one desktop tank; a production build should downscale
  textures to ≤1024² and decimate the log.
- No transmission/SSR is used (glass is cheap opacity + clearcoat) to keep fish
  readable and the frame budget low.

## 11. What production-ready fish assets need

To get true fin flutter + best-in-class motion, commission fish that are either:

1. **Rigged** — an armature with spine + tail + pectoral/dorsal/caudal bones and
   clean weights (then we drive bones procedurally, or play baked swim clips); or
2. **Part-separated** — named objects (`Body`, `Tail_Fin`, `L_Pectoral`,
   `R_Pectoral`, `Dorsal`, `Caudal`) with sensible pivots at each attachment.

Plus: consistent forward orientation (+Z), origin at body centre, ≤~15–25k tris,
a single ≤1024² atlas, and ideally one or two baked animation clips (idle/swim).
The current Tripo assets are fine for a spike and for the whole-body wave, but
their fused/unrigged colour-chunk topology caps fin realism.

## 12. Recommendation

**Continue the hybrid 3D tank — with rigged/part-separated fish.** Even with
fused, unrigged source art, the 3D fish read as more *alive in motion* than the
2.5D sprites: real depth swimming, banking turns, acceleration, and a body wave,
all inside a tank that looks like a tank (not a model viewer). The 2.5D scene is
still more polished as a *still image* today, so:

- Keep the 2.5D renderer as the default/fallback while the 3D path matures.
- Invest in **rigged or part-separated fish** (§11) — that's the single biggest
  quality unlock and what the whole-body wave can't fully deliver.
- Then polish 3D glass/caustics/lighting and port the management overlays before
  considering 3D as the default tank.

---

## Update (2026-06-30) — multi-habitat expansion (spider + lizard)
The renderer was generalized to drive **multiple 3D habitats** behind a shared
`HabitatScene` interface, and two land terrariums were added next to the fish
tank: a **spider** habitat and a **leopard-gecko (lizard)** habitat.

- **Architecture:** `ThreeHabitat.ts` (interface + `disposeScene`),
  `ThreeHabitatRenderer.ts` (generic renderer that swaps scenes + per-habitat
  camera; replaced `ThreeTankRenderer`), `ThreeEnclosure.ts` (reusable glass
  terrarium + ground bounds + rock/branch), `ThreeGroundController.ts`
  (`GroundCreature` + `SPIDER`/`LIZARD` configs). Fish scene unchanged except it
  now implements `HabitatScene`. The fish loader's unify-to-one-body fix was
  exported as `unifyToBody` and reused for the land animals.
- **Assets:** both fused + unrigged (spider = Meshy single mesh; gecko = Tripo
  colour-chunks). 4096² textures downscaled to 1024² (`gltf-transform resize`) →
  `public/assets/3d/habitats/{spider,lizard}.glb`.
- **Animation:** lizard reuses the body-wave as a lateral spine + tail
  undulation (reads as a real crawl); spider uses bursty grounded locomotion +
  gait bob/nod (no leg articulation — fused mesh, honest limitation).
- **UI:** the toggle became a 4-way switch — **2D Aquarium / 3D Fish / 3D Spider
  / 3D Lizard** (also `?habitat=spider|lizard|fish`).
- **Verdict + full comparison:** see
  `docs/production/HABITAT_ANIMATION_COMPARISON.md`. Short version: fish best,
  lizard strong, spider needs a rig for believable legs.

### Follow-up — rigged walking (2026-06-30, later)
The spider + lizard were then **rigged in Blender (via MCP)**: armature +
automatic skin weights + hand-authored looping **walk/idle** clips, exported as
rigged GLBs (`{spider,lizard}_rigged.glb`) and played in Three.js via an
**AnimationMixer** (`ThreeRiggedController`, crossfading walk↔idle by speed). The
legs now actually step, the body stays level (no bounce), and the skinning
deforms cleanly (no tearing). Enclosures were stripped to just the animal +
floor. `GroundCreature` remains the procedural fallback if a rigged GLB is
absent. Lizard reads excellent; spider is much improved (auto-rig isn't perfect).
Captures: `screenshots/3d_spike/rigged_{lizard,spider}_walk*.png`.
```

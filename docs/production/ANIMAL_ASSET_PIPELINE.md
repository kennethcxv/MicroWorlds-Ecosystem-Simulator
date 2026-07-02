# ANIMAL & DECOR ASSET PIPELINE — GLASSWATER (3D habitats)

_Last updated: 2026-07-01_

How rigged/animated animals **and** terrarium decor are delivered, dropped into
the game, and verified. Written for the **leopard gecko** (a freelancer is
producing the rig) but applies to any future 3D habitat animal + decor.

> **Decor + sand** live in §8–§10 below; the animal rig spec is §1–§7.

---

## 1. Status

- The lizard habitat prototype currently runs on a **procedural placeholder
  gecko** (`src/render/three/ThreeGeckoPlaceholder.ts`). It walks, hunts, eats,
  and respects collision — the placeholder exists to exercise the systems.
- **A freelancer is producing the final rigged + animated leopard gecko.** The
  engine is already wired to use it the moment it lands — **no code changes
  needed** for a conforming asset.

## 2. Where the final asset goes

Drop the delivered file here (exact path + name):

```
public/assets/3d/habitats/lizard/leopard_gecko_animated.glb
```

On the next load of the **3D Lizard** habitat the scene auto-detects it
(`ThreeLizardScene.load()` → `habitatAssetExists()`), loads it rigged, and
switches from the placeholder to the real animal. The HUD badge flips from
`PLACEHOLDER GECKO` to `FINAL RIG · N clips`.

> If the file is absent or has zero animation clips, the game silently keeps the
> placeholder — it never crashes.

## 3. GLB requirements

- **Format:** glTF-Binary (`.glb`), single file, embedded textures. (FBX must be
  converted to GLB first — Blender export or `gltf-transform`.)
- **Rig:** one armature skinned to a single mesh (or a few) — a normal skeletal
  rig. Keep limbs/tail **attached** (no separate unparented parts that can drift).
- **Orientation:** head faces **+Z**, up is **+Y**. If the rig faces another axis,
  set `modelYaw` in `ThreeLizardScene.load()` (the `ThreeAnimalController`
  `modelYaw` option) — a one-line rotate, no rework.
- **Scale:** any — the engine normalises the model to ~0.3 m body length
  (`GECKO_BODY_LENGTH`). It's placed feet-on-substrate automatically from its
  bounding box.
- **Textures:** ≤ 1024² recommended (use `gltf-transform resize`); keep the file
  lean (the whole Three.js chunk is already ~700 kB).
- **Animations:** baked clips on the GLB (see next section). Loop cleanly.

## 4. Expected animation clip names

The animation controller (`ThreeAnimationController`) maps clip names to states
by **alias**, case-insensitively, and tolerates exporter prefixes like
`Armature|Walk` or `gecko_walk_01`. Deliver any subset — missing clips degrade
gracefully.

| State  | Accepted clip names (aliases)                              | Required? |
|--------|------------------------------------------------------------|-----------|
| idle   | `Idle`, `Breathing`, `Idle_Breathing`                      | Strongly  |
| move   | `Walk`, `Crawl`, `SlowCrawl`, `Move`, `Run`                | Strongly  |
| turn   | `Turn`, `Look`, `LookAround`                               | Optional  |
| eat    | `Eat`, `Bite`, `Feed`, `Eating`, `Strike`                  | Optional  |
| rest   | `Rest`, `Sleep`, `Bask`                                    | Optional  |
| stress | `Stress`, `Hide`, `Alert`, `Defensive`                     | Optional  |

Graceful fallbacks (never crash):
- **Walk/Crawl missing** → plays Idle while the code still moves + rotates the body.
- **Eat/Bite missing** → the feeding logic still fires on timing (gecko pauses at
  the prey, the cricket is consumed, hunger rises) — just without a bite pose.
- **Turn/Look missing** → the code rotates the model smoothly anyway.
- **No clips at all** → the model is positioned/rotated and gently idle-posed;
  consider keeping the placeholder instead.

Extend/override aliases in `DEFAULT_ALIASES` (`ThreeAnimationController.ts`) or via
the `aliases` option if the freelancer uses different names.

## 5. How to test the asset BEFORE approving delivery

1. Copy the file to `public/assets/3d/habitats/lizard/leopard_gecko_animated.glb`.
2. `npm run dev`, open `http://localhost:5173/?habitat=lizard`.
3. Open the browser console. You should see:
   - `[gecko] final rig loaded: [ ...clip names... ]`
   - `[gecko anim] detected clips: [...]` and `[gecko anim] state → clip: {...}`
   - `[gecko anim] states without a clip (fallbacks used): [...]` (if any).
4. Watch for **60 seconds**:
   - gecko idles, then crawls to targets, turning to face them;
   - stays on the substrate (no floating/sinking), never leaves the glass;
   - never phases through rocks / hides / the log / dishes;
   - limbs + tail stay attached; no skinning tears; loops don't pop.
5. Press **Feed Insects** → gecko crawls to a cricket and plays the eat/bite clip
   (or pauses if none), the cricket disappears, hunger rises.
6. Toggle collision debug: `?habitat=lizard&debugCollision=1` (or press **C**) —
   the gecko should stay outside every green volume.
7. `npm run typecheck` + `npm run build` + `npm test` still clean.
8. Confirm **0 console errors** (a `favicon.ico` 404 is unrelated + harmless).

## 6. Freelancer delivery checklist

- [ ] Opens in Blender without errors.
- [ ] Has an **Idle** animation.
- [ ] Has a **Walk / Crawl** animation.
- [ ] Has a **Turn / Look** animation (if in scope).
- [ ] Has an **Eat / Bite** animation (if in scope).
- [ ] Animations **loop cleanly** (no pop at the seam).
- [ ] Scale is reasonable (real-ish proportions; engine will normalise).
- [ ] Orientation correct (head +Z, up +Y) — or note the offset.
- [ ] Limbs + tail **stay attached** during all clips (no detaching parts).
- [ ] Exports to a single **.glb** with embedded, reasonably sized textures.
- [ ] Loads in Three.js (verify via §5) with **no console errors**.
- [ ] Clip names match §4 aliases (or the freelancer lists the actual names).

## 7. Checklist for future animals (reusable)

1. Decide the habitat + care profile (`src/habitats/HabitatSpecies.ts`).
2. Author or generate a rig with the same clip vocabulary (§4).
3. Place the GLB under `public/assets/3d/habitats/<habitat>/<species>.glb`.
4. Point the scene at it (path + `modelYaw` + `bodyLength`), reusing
   `ThreeAnimalController` + `ThreeAnimationController`.
5. Give it a movement config (like `GECKO_MOVEMENT`) and, if it climbs/flies,
   extend the movement brain.
6. Verify with the §5 steps + add a pure movement test (see `tests/habitat.test.ts`).

---

## 8. Terrarium DECOR assets (rocks / hides / driftwood / dishes / plants)

**Where they live (runtime):**
```
public/assets/3d/habitats/lizard/decor/
  rock_cave_hide_01.glb      driftwood_branch_01.glb   desert_rock_cluster_01.glb
  water_dish_stone_01.glb    food_dish_stone_01.glb    succulent_01.glb  succulent_02.glb
```

**How they map to placeable objects:** the catalog in
`src/habitats/HabitatBuilder.ts` (`LIZARD_PLACEABLES`) pairs each placeable with an
`asset` filename, a **display-size hint** (the old `collision` half-extents, now
used only to size the model + as a pre-load fallback), and an **interaction** type.
The scene (`ThreeTerrarium.loadDecorFor`) loads each GLB, uniform-scales it to that
display size, plants it on the sand, **measures a tight collision footprint from the
real mesh** — a bounding box + a **2D convex hull** (`AssetFootprint`, traced from
the mesh vertices) — writes it back onto the placed object, and swaps out the
placeholder. For concave / branching props (roots, driftwood) the footprint is a
**multi-part set of tight rectangles** (`AssetFootprint.parts`, via
`HabitatFootprint.traceFootprint`) instead of one hull, so the empty gaps between
branches stay open. Collision then hugs the silhouette (not the box, never bridging
empty space), and follows the object's position / X·Y·Z rotation / per-axis scale.
The gecko itself is a chain of **body probes** (snout→tail) so no body part phases
through. Failures keep the placeholder.

**Placing / editing decor at runtime:** the same catalog drives **Decorate Mode**
(the `Decorate` button) — players drag/place, move, rotate, scale, duplicate, and
delete props with a `TransformControls` gizmo; edits rebuild collision + navigation
+ score live and save. Full write-up: `HABITAT_EDITOR.md`.

| placeable id      | GLB                          | interaction  |
|-------------------|------------------------------|--------------|
| `rock_cluster`    | `desert_rock_cluster_01.glb` | climbable    |
| `rock_boulder`    | `desert_rock_cluster_01.glb` | blocked      |
| `hide_cave` / `hide_moist` | `rock_cave_hide_01.glb` | hide     |
| `branch_log`      | `driftwood_branch_01.glb`    | climbable    |
| `dish_water`      | `water_dish_stone_01.glb`    | blocked      |
| `dish_food`       | `food_dish_stone_01.glb`     | lowObstacle  |
| `plant_succulent(_2)` | `succulent_01/02.glb`    | softObstacle |

**Interaction types** (drive route-around vs climb-over vs step-over):
`wall`, `blocked`, `climbable`, `lowObstacle`, `hide`, `softObstacle`, `feederZone`.

**GLB requirements (decor):** single `.glb`, Y-up, textures ≤ 1024²
(`gltf-transform resize <in> <out> --width 1024 --height 1024`). Origin/scale don't
matter — the loader recentres on XZ, drops the base to the ground, and scales to the
collision footprint. Keep it a single fused mesh (no loose unparented parts).

**Adding a NEW terrarium prop:**
1. Resize its textures to 1024² and copy it to `.../lizard/decor/<clean_name>.glb`.
2. Add a `PlaceableDef` in `LIZARD_PLACEABLES` (collision volume + `interaction` +
   `asset: "<clean_name>.glb"`), or set `asset` on an existing def.
3. Place it in `LizardHabitatData.ts` (`place("<id>", "<instanceId>", x, z, rotY)`).
4. Reload 3D Lizard — it loads + collides automatically; verify with `?debugCollision=1`.

## 9. Sand SUBSTRATE texture (optional drop-in)

- Runtime folder: `public/assets/textures/habitats/lizard/`.
- Drop a **tileable** sand image named `sand_substrate_01.png` (1024² recommended)
  and it overrides the procedural sand on the next load — applied with
  `RepeatWrapping` on the floor plane (a **texture**, never a 3D model).
- If absent, a procedural warm-sand texture is generated at runtime, so the floor
  always looks like sand with no art dependency.

## 10. What to test before approving a DECOR delivery

1. Copy the GLB in (resized to 1024²), reload `?habitat=lizard`.
2. It appears roughly the right size on the sand, grounded (not floating/sinking).
3. `?debugCollision=1` — its coloured volume roughly matches the visible mesh and
   the gecko doesn't clip through it (or climbs it, if `climbable`).
4. `npm run typecheck && npm run build && npm test` clean; **0 console errors**
   (a `favicon.ico` 404 is harmless).

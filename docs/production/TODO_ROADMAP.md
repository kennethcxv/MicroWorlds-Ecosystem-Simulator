# TODO / ROADMAP — GLASSWATER

_Last updated: 2026-07-01_

Phase order follows the master prompt. Don't advance a phase until the prior one
meets its acceptance bar. **Do not scope-drift.**

## ▶ Now (Phase 3 — alive/gloss polish)
- [x] Glossier glass (procedural sheen + drifting reflections + brighter water +
      wet rims + overlay alpha bump + time-driven).
- [x] Better fish animation (eased turn/face, speed-scaled wiggle, feeding rise).
- [x] **Playwright-verify** gloss + animation; VISUAL_GAP_REPORT updated.
- [ ] Schooling cohesion / bottom-dweller grazing & snail-crawl polish.
- [ ] Plant sway, day/night lighting grade pass.

## ◆ Experimental — Hybrid 3D habitats (side track, opt-in)
- [x] Fish-tank spike: Three.js viewport, steering AI + GPU body-wave, unify-to-
      one-body attachment fix, lazy-loaded. See `THREE_D_TANK_SPIKE.md`.
- [x] Multi-habitat architecture: `HabitatScene` + generic `ThreeHabitatRenderer`
      + shared `ThreeEnclosure` + `ThreeGroundController`. 4-way view switch.
- [x] Spider + lizard terrariums. Playwright-verified. Comparison + verdict:
      `HABITAT_ANIMATION_COMPARISON.md`.
- [x] **Rigged the spider + lizard in Blender (via MCP)** — armature + automatic
      skin weights + hand-authored walk/idle clips, played via AnimationMixer
      (`ThreeRiggedController`). Real stepping legs, body level (no bounce).
      Enclosures stripped to just the animal.
- [ ] Hand-tune the auto-rigs for true AAA (esp. spider — auto-placed leg bones
      aren't anatomically perfect) and add **per-foot IK ground-lock** (zero skate).
- [ ] Add a `dash` clip per species + blend; rig the fish properly too (fins).
- [ ] Consider frog/turtle next (quadruped rig pipeline now proven & reusable).
- [ ] Decision gate: which habitats stay 3D vs 2.5D — lizard looks keep-worthy.

### Lizard habitat — reusable foundation (rig pending from freelancer)
- [x] **Data-driven habitat model** (`src/habitats/`, pure + unit-tested): types,
      bounds, **collision solver** (circle/OBB/capsule, slide, never-penetrate),
      stats/score, layout ops, size presets + placeable catalog, per-habitat
      save/load, species care profiles + compatibility.
- [x] **Authored "Sunstone Desert" terrarium** (rocks/hides/branch/dishes/lamp/
      zones), every collidable piece with collision data; score ~90 Excellent.
- [x] **Collision-aware gecko movement brain** + `ThreeAnimalController` +
      **`ThreeAnimationController`** (clip aliases idle/move/turn/eat/rest/stress,
      graceful missing-clip fallbacks) + procedural placeholder gecko + collision
      debug viz.
- [x] **Feeding prototype** (crickets: spawn→hunt→eat→hunger + cooldown + events),
      **needs system**, **lizard HUD** (fish UI untouched). Playwright-verified.
- [x] Final rig drop-in prepared: `public/assets/3d/habitats/lizard/
      leopard_gecko_animated.glb` (auto-used when present). See
      `ANIMAL_ASSET_PIPELINE.md` + `LIZARD_HABITAT_PROTOTYPE.md`.
- [x] **Real decor art + procedural sand** — imported Tripo GLBs (rock cave, rock
      cluster/mound, driftwood, stone dishes, succulents; 1024² textures) loaded +
      collided data-drivenly; warm-sand floor + pebbles + basking glow + contact
      shadows. No raw primitives (organic fallbacks only). Placeholder gecko
      recoloured for contrast.
- [x] **Interaction types + smart navigation** — `wall/blocked/climbable/lowObstacle
      /hide/softObstacle/feederZone`; `HabitatNavigation` visibility-graph planner;
      the gecko routes around blocked obstacles, **climbs over** climbable ones,
      detects stuck + replans, and gives up on unreachable food. Reachable-cricket
      spawning + food-unreachable HUD warning. (62 vitest tests.)
- [ ] **Drop in the freelancer's rigged gecko** when delivered; verify clips +
      orientation (`modelYaw`), then per-state polish.
- [ ] Let the gecko **enter hides** (climbing low rocks/driftwood now works via
      `climbHeightAt`; entering a `hide` is the next seam + occupancy state).
- [x] **Real Decorate Mode editor for the 3D lizard habitat** — Unity/Unreal-style
      transform gizmo (`TransformControls`): catalog + ghost placement, select,
      move / rotate X·Y·Z / scale (0.25–3× normal, 0.05–8× advanced, per-axis),
      duplicate, delete, reset-transform, snap-to-floor, center, reset layout,
      undo/redo, interaction dropdown; saves/reloads. See `HABITAT_EDITOR.md`.
- [x] **Mesh-footprint collision** — collision traces the real GLB silhouette (no
      oversized boxes; dishes = circles; soft plants don't block), follows
      move/rotate(X/Y/Z)/scale live, rebuilds nav + score.
- [x] **Concave root/twig/driftwood collision (v2)** — `HabitatFootprint` decomposes
      concave props into **multiple tight rectangles** (one OBB per branch) so the
      gaps between branches aren't blocked; compact props keep a convex hull.
- [x] **Animal no-phasing (v2)** — compound body probes (snout→tail) + `resolveBody`
      + swept `resolve`; ≤ 1 cm residual across 5 000+ frames (pure tests).
- [x] **Editor/HUD v2** — View Collisions button + legend (+ probe viz); Planet-Zoo-
      style catalog (sections/search/filters/icons + Build Help); **Y-axis / hanging
      placement**; invalid-placement reason + snap-back; **click-the-gecko info card**;
      camera-orbit-doesn't-rotate-container (hooked) + Reset/Focus. (118 tests.)
- [x] **Exact-contour collision (v3)** — filled-triangle rasterisation + marching
      squares -> concave `poly` volumes that ARE the asset silhouette; one source
      for solver + nav + placement + debug (filled silhouette overlay). Save v2 +
      `defId` + `rehydrateLayoutAssets` (fixed the stale-save placeholder bug);
      bounding-circle early-outs + per-prop nav rings (perf).
- [x] **Real GLB catalog thumbnails + real-model placement ghost** (exact final
      scale/rotation/Y; tinted valid/invalid); full-transform invalid SNAP-BACK
      (move/rotate/scale/Y); PgUp/PgDn + F focus + Reset-Camera/Focus buttons;
      colour-coded interaction segments; Cancel-Placement bar.
- [x] **Hanging attachment rules** — mid-air vines invalid (top frame / wall /
      branch support required); deleting the support drops the vine to the sand.
- [x] **Gecko ENTERS hides** — shelter drive (stress + natural cadence) walks it
      through the contour's real open mouth to an interior anchor; extra calm
      inside; behaviour surfaces as "Hiding in a shelter".
- [x] **Interactive care modes** — Clean brush over a LOCAL dirt map (sparkle when
      spotless), drag-drop Feed Mode (4 insect types, distinct effects, full gecko
      won't eat), Terrain sculpting (raise/lower/smooth/flatten + wet patches ->
      humidity / land comfort), wellbeing card (12 live meters + advice),
      shortcuts everywhere + H help sheet. (162 tests.)
- [x] **Exact SURFACE-HEIGHT collision (v4)** — per-GLB heightfield (per-cell top
      + underside from the real triangles); `climbHeightAt` returns the TRUE local
      surface per point (sloped rocks low on the low side), elevated branch spans
      are WALKED UNDER (pass-under vs the animal's standing height — no more
      floating gecko), climb uncapped + mantle-boosted (no more body inside tall
      wood), body PITCHES along slopes, and the debug draws each prop's measured
      surface as a lit shrink-wrap mesh. (174 tests.)
- [x] **Surface-aware GROUNDING + camera + physical terrain (v5)** — four FOOT
      CONTACTS (pure FootPlanner: planted feet world-locked exactly on the
      surface, stepping feet arc; placeholder legs aim at the live contacts);
      body PITCH from front-vs-rear + NEW ROLL from left-vs-right feet;
      `sampleSurfaceAt` (height/normal/slope/type/flags); terrain heights feed
      COLLISION live (walk height, nav slope-blocking > ~40°, placement +
      feeding validation, feeder Y); Strong brush + bedrock limit (dig below the
      default sand, never through the tank floor); draped overlay + heatmap;
      ANCHORED viewing camera (±43° yaw window + target clamp + presets +
      Photo-Mode free orbit; editor auto-frees); foot/normal/terrain debug
      toggles. (203 tests.)
- [x] **VIVARIUM SHELL rebuild + EnclosureSpec single source of truth (v6)** —
      pure `EnclosureSpec` derives interior / THE shared walk+placement+feeding
      rectangle / frame+tray sizing / glass apron / bedrock / camera target+home /
      stand / lamp mount from `HabitatDimensions` (no conflicting hard-coded tank
      sizes); new `ThreeVivariumShell` (glass + posts + top band + screen top +
      base tray hiding the bed side + desert BACK PANEL + rim-CLAMPED basking
      lamp with cable + UVB tube + gauges + bedrock floor/skirt + wooden STAND
      from the real cabinet GLB + floor shadow — tank fixed in the room, nothing
      floats); `HabitatMigrate` heals stale saves (dims normalized, content
      clamped inside, never deleted); bounds now MATCH the visible tank (framing
      inset removed) + snout-slack reach so glass-hugging food is hunted + eaten;
      dirt de-checkered (organic jittered blotches + ambient rate 0.0016→0.00008
      /s) + sand tiling widened. (229 tests.)
- [x] **UI REFERENCE-MATCH pass (v7)** — the gecko UI now matches the mockups in
      `Designs/Gecko/` (map: `DESIGN_REFERENCE_MAP.md`): pure tested MODE
      MACHINE (`gwModes.ts` — gecko-main/feed/clean/terrain/decorate/animal-
      info/photo, Esc→main, one drawer at a time) + `.gw-*` DESIGN SYSTEM
      (`gwTheme.ts`); main HUD = identity card + score card with progress ring
      + 8-stat strip + large action dock (+ ☰ log & ⚙ camera/overlay flyouts);
      bottom DRAWERS for Cleaning (tool cards + live badges + amber dirt-spot
      rings via pure `dirtSpots()`), Feeding (methods/food cards/portion/
      supplement/Start-Feeding → real dish & tong serving) and Terrain
      (tabs/tools/materials/intensity); Decorate reskinned to the bottom
      category-tab tray + thumbnail carousel + left palette + floating
      inspector; right-side Animal Info panel; Photo mode. Playwright-verified
      every mode, fish untouched, 0 console errors. (249 tests.)
- [x] **FEEDING OVERHAUL (v8)** — Feeding Mode = its reference exactly (method
      rail w/ SVG icons, 5 REAL photo food cards cropped from the reference,
      quantity/supplement-dropdown/next-feeding, Start Feeding CTA, ✕, dashed
      teal placement marker, no slim nav); REAL nutrition (`LizardNutrition`:
      satiety/fat/calcium/moisture/role per insect; calcium store + dusting →
      MBD risk; body condition + obesity; meal moisture → hydration; 2 new
      Animal-Info meters); staged per-method presentations + cameras
      (`ThreeFeedingPresentation` + renderer `cameraOverride()`): quick toss,
      auto dish pour, PLAYER-STEERED tongs (pointer-held; gecko chases +
      strikes; appetite-capped sessions), keeper's-hand feeding; dish capacity
      from real geometry + containment + cricket jump-outs; prey AI + insect
      collisions (`InsectBehavior`: freeze/flee/wall-steer/panic-jump/stamina +
      separation + gecko-probe push-out); per-kind insect models; cinematic
      mode (letterboxed follow cam); Track Intake (persisted log + diet
      advice); HUD sized up ~15%. (284 tests; 0 console errors.)
- [ ] Bring the reference stat-strip/dock/score-ring HUD to the **2D aquarium**
      (it already shares the dark-glass language; structural conversion pending)
      and build the eco-center **main menu / hub** screen from its reference
      when Phase 8 starts.
- [ ] Let advanced X/Z-tilt collision use per-triangle contours + heightfields
      (currently a safe world-aligned flat-top superset); expose enclosure size
      presets in the editor; GLB insect models for feeders (procedural per-kind
      models shipped in v8; real art + riding prop surfaces later); per-foot IK
      on the FINAL rigged gecko's foot bones (contacts are ready — map them to
      the rig when it lands); props riding sculpted terrain height (today the
      brush masks the ground under props instead); per-hide humidity typing
      (humid hide boosts shed comfort); a small nose-up lunge animation when
      the gecko takes from raised tongs.

## Next (close out Phase 2 hygiene)
- [x] Minimal test harness (**vitest**) for the pure sim: feeding, waste,
      ammonia, water change, stress/health, save/load round-trip, deterministic
      RNG. → `npm test`, 33 tests passing. (Phase 2 acceptance criteria.)
- [x] `resetSimState()` so reset/new games are reproducible from seed.
- [ ] Add `src/core/economy.ts` + `events.ts` (currency, events) as the loop
      deepens.

## Phase 4 — Habitat / Decorate editor
- [x] **3D lizard habitat editor delivered** (see the lizard section above +
      `HABITAT_EDITOR.md`): catalog + click/drag placement, ghost preview with
      valid/invalid states, move/rotate/scale/duplicate/delete, save layout, live
      habitat-score preview, undo/redo.
- [ ] Bring the same editor to the **2.5D fish aquarium** (Canvas layers): item
      tray, depth layers, flip, live water-stat preview.
- [x] Objects affect hiding spots / basking / climbing / enrichment / humidity
      (habitat score) live in the lizard habitat; extend to cover/oxygen/bioload
      for the aquarium.

## Phase 5 — Collection / Shop / Add Species
- [ ] Species cards + collection book (discovered/owned/bred/morph states).
- [ ] Add-Species flow + simple shop/adoption market, compatibility warnings,
      costs, unlock states. (Cards = collection UI, not battles.)

## Phase 6 — Breeding / rare morphs
- [ ] Simple genetics (color/pattern/size/fin), lineage, breeding conditions,
      offspring + rare-morph chance, collection updates, light sell/adopt.

## Phase 7 — Rescue / quarantine
- [ ] Rescue cases, quarantine tank, stabilize/treat/recover, reputation
      rewards, rescue event log. Emotional, not over-complex.

## Phase 8 — Eco-center hub
- [ ] 2D/isometric hub: rundown center, clickable rooms, tank slots, upgrades,
      locked future rooms, visual progression. (No 3D walking.)

## Phase 9 — More habitats (only after freshwater is strong)
- [ ] Shrimp / betta / planted / ant colony / frog bog / terrarium / reef /
      turtle pool — one at a time, not all at once.

## Phase 10 — Polish / audio / QA
- [ ] Audio (UI, ambience, bubbles, feeding, warnings), settings, accessibility
      (reduced motion, UI scale), save robustness, perf + build checks.

## Cross-cutting data work
- [x] Mine `GLASSWATER_Fish_and_Aquatic_Species_Stats.docx` → `aquaticCodex.ts`
      (22 species, authoritative). `species.ts` derives from it.
- [ ] Mine the Plant Library (§8) + Hardscape (§10) core data from
      `..._Land_Animals_Plants_Hardscape_Stats.docx` (aquatic-relevant rows).
- [ ] Mine Land Animal species (§5) when Phase 9 land habitats begin.

## Housekeeping
- [ ] `git init` for safe checkpoints (folder is not a repo yet).
- [ ] Split `render/` into `particles.ts` / `creatureAnimation.ts` as it grows.
- [ ] Run the code-review plugin before declaring a major milestone complete.

# CLAUDE SESSION HANDOFF — Main Menu = THE ATRIUM (v23) + Frog Animation Lab (v22)

> Living handoff, latest 2026-07-05 (second session): **v23 — the main menu
> is now a rendered ATRIUM backdrop + live UI** (below), and **v22 — frog rig
> inspection + procedural animation system + Frog Animation Lab**. Earlier:
> **v21 — the TRUE-perspective lodge** (CSS-3D room from `…12_25_29`; NOW
> RETIRED — the user's source of truth is `…12_25_17`, the atrium), over
> **v20.1 / v20** lodge passes. Before: v19.x Inventory/Album/Care-Guide.
> All: 0 console noise.

## v23 quick map (the atrium main menu)

- **Source of truth**: `Designs/Main_Menu/ChatGPT Image Jul 5, 2026,
  12_25_17 AM.png` (circular atrium). The prior menus (v20–v21) hand-drew the
  room and read "flat/prototype" 3×; v21 was also the WRONG board (12_25_29,
  a rectangular room).
- **Approach (ADR in DECISIONS.md, user-approved)**: render the atrium as a
  BACKDROP and overlay the real live UI. The plate is **generated with
  gpt-image-1** (`tools/generate-openai-asset.mjs`, `OPENAI_API_KEY` from
  `.env`) to match the reference — a UI-free art asset, NOT the reference file
  — curated to `public/assets/ui/hub/eco_center_atrium.jpg`. Candidates in
  `assets/generated/openai/eco_center_atrium_v1|v2.png` (v2 chosen); spend
  logged in `api_usage_log.md`. Regenerate: `npm run gen:asset -- --size
  1536x1024 --quality high --background opaque --out eco_center_atrium_vN
  "<atrium prompt, no UI/text>"`, then `sips -s format jpeg` into public.
- **`src/ui/homeHub.ts`** rebuilt (1629 → ~640 lines; the CSS-3D room deleted).
  The class API (`show/hide/update`, `HubMeta`, `loadHubMeta/saveHubMeta`,
  `PlayerHabitat`, `HomeHubCallbacks`) is UNCHANGED → app.ts untouched.
  Structure: `.stage` = `.backdrop` `<img>` (pointer parallax in `tickPar`,
  reduced-motion aware) + `.vignette` + 5 `.hotspot` buttons each with a
  `.sign` label. `HOTSPOTS` (viewport-% cx/cy/w/h + optional label/sub
  overrides) pins each hotspot over a painted display — **re-tune these if the
  plate composition changes**. Overlay panels: `.brandp` (over the scene, no
  glass), `.topbar` (Eco Points · Day&Time · Restoration+View), `.habp` (live
  Current Habitats rows), `.carep` (daily care from `deriveReminders`),
  `.dock` (5 doors), `.foot`, `.wingmodal` (restoration locked modal).
- **Hotspot → action** comes from `ECO_SECTIONS` (src/data/ecoCenter.ts) by id:
  vivarium-wing→lizard, aquarium-wall→fish, rainforest-room→frog,
  care-library→guide (labeled "Research Desk"), restoration-wing→locked modal.
  Labels overridden to the reference wording (Desert Vivarium / Freshwater
  Aquarium / Rainforest Paludarium / Research Desk / Restoration Hub).
- **Drive** (scratchpad `hub_drive.mjs`, 31 checks): screen doors (shop/
  inventory/guide/album/settings/research-desk/view-all) OVERLAY the hub — the
  open/closed signal is the universal `.gw-backpill:visible` (album + settings
  are STANDALONE screens that don't report via `__app.hubScreen()`; hubScreens
  ones do). Habitat entry: click → `__app.hubOpen()===false && habitat()===k`,
  then `__app.goHome()`. Screenshots: `docs/production/screenshots/
  main_menu_atrium/` (1920/1600/1366 + hover).

## v22 FROG RIG INSPECTION REPORT (Phase 1 — measured 2026-07-05, not assumed)

**1. Asset found.** Runtime: `public/assets/3d/creatures/colorful_frog.glb`
(1.26 MB, texture 1024², prepped by `tools/prep-rigged-creature.mjs`).
Source (never modified): `3D_Assets/Red_Eyed_Green_Tree_Frog/Source/`
(`260703_Rig Frog.blend` + `260703_Rig Frog.glb`) + `Texture/` + `Render/`
(still + 60-frame turntable MP4). Registry entry `colorful_frog`
(`src/data/creatures/creatureRegistry.ts`: bodyLength 0.06 m, forward `+z`,
ground creature, `rig.clips: { idle: "Animation" }`). Loaded through
`ThreeCreatureLoader`'s rigged branch (SkeletonUtils clone per instance,
posed-bounds normalization); moved in-game by `ThreeFrogHopper` (Emerald
Hollow paludarium + dev Creature Lab). ONE seamless skinned mesh — 9,765
tris / 8,755 verts, **no morph targets**, material rough 0.359 doubleSided.
Raw bind bbox 0.98 × 0.98 × 0.28 (an UPRIGHT rig-default ghost — the real
crouch lives only in the baked clip; the loader poses idle@t=0 before
measuring, so instances arrive crouched). Deforms cleanly (v14 validation
+ the live in-game idle).

**2. Bones.** 362 joints = a full baked Rigify CONTROL rig, but glTF strips
Blender constraints/drivers, so ORG/MCH/VIS/tweak/IK bones are inert
passengers — **only direct bone transforms deform**. The mesh is weighted
to **83 joints**:

- `root` (parent of the whole deform tree — the whole-body motion hook);
- `DEF-spine → DEF-spine.006` — a sequential 7-link chain, PELVIS end →
  HEAD end (arms + breasts branch at .004 = the chest; .004/.005 carry the
  big breathing bulge = chest/throat region; **.005/.006 = the head**);
- full Rigify limb chains ×2: `DEF-thigh/-thigh.001/-shin/-shin.001/-foot/
  -toe`, `DEF-shoulder/-upper_arm(+.001)/-forearm(+.001)/-hand` + 3×3
  finger segments + 3 palms, `DEF-pelvis.L/R`, `DEF-breast.L/R`;
- **24 custom `Foot_Finger.*` bones** (four 3-bone chains per side — the
  long hind toe fans) — ⚠ parented to the BODY (`DEF-spine.002`), NOT the
  feet: large hind-leg extensions pull the leg away from its own toe
  webbing (mesh tearing). This caps safe procedural leg motion at small
  angles. Naming glitch: `Foot_Finger.011.R` lives in the LEFT fan (and
  .011.L in the right) — walk chains by hierarchy, never by suffix.

`head` / `neck` joints EXIST but carry **zero skin weights** (and their
Rigify constraints are gone) — head motion must ride DEF-spine.005/.006.
**No eye bones. No eyelid bones. No jaw/mouth bones. No tongue bone or
separate tongue mesh. No throat/gular bone.** No detached body parts.
Pivot: `root` sits at the floor between the hips — usable for turns,
crouches and hop root-motion.

**3. Existing animation clips.** Exactly ONE: `"Animation"` — 2.5 s,
60 keys, 1086 channels (fully baked across all 362 nodes; 98 targets
actually move). It is the breathing idle: small spine rotations + strong
bone-SCALE breathing (DEF-spine.004 scale Δ0.43, .005 Δ0.31, .002/.003
Δ≈0.10) + tiny head/limb drift. **No hop / walk / eat / blink / swim
clips exist.** (Bone-scale on the chest deforms well — the baked clip
proves chest/throat scale-pulses are safe on this skin.)

**4. Procedural animations possible with THIS rig** (built this session —
all authored as offsets ON TOP of the captured crouch pose, sampled into
real `THREE.AnimationClip`s; root-motion clips key the `root` bone):
idle breathing (fallback twin of the GLB idle), idle variation, chest
"throat" pulse (approximation — chest-region bone scale), look left /
right / around (head = spine.005/.006 + a body lean), rest sit, sleep
pose (lower rest — eyes stay open, labeled honestly), wake up, small /
medium hop (arc + anticipation squat + landing squash; leg fold kept
small for the toe-fan cap), turn left / right, spot-prey freeze-lean,
startled jump, hide crouch, stress crouch, weak/sick idle, collapsed
faint (non-graphic sink + faint breathing), water float / basic paddle /
basic struggle (gentle — no graphic drowning), poop trigger (pause +
rear dip + twitch; waste spawn stays GAME logic via an exported event
marker).

**5. Impossible without a better rig** (never faked): blink / any eyelid
motion (no lid bones, no shape keys), eye tracking (no eye bones), mouth
opening or bite (no jaw), tongue catch / missed tongue (no tongue), a
true gular throat pulse (no throat bone — only the chest-scale
approximation), full-extension athletic leaps + climbing with gripping
toes (Foot_Finger parenting + no hand-keyed polish), closed-eye sleep.

**6. What Fiverr still needs to animate / rig** — the full brief is the
next section.

## v22 FIVERR ANIMATION BRIEF (generated from the shipped map — copyable
from the Lab's "Copy animation report" button too)

**Can be handled by Claude/procedural now (23 fallback clips, built +
verified live):** idle breathing (twin of the baked idle), idle variation,
throat pulse (chest approximation), look left / right / around, rest sit,
sleep pose (open-eyed rest fallback), wake up, small hop, medium hop,
turn left / right, spot prey, startled jump, hide crouch, stress crouch,
weak/sick idle, collapsed faint, water float, water paddle (basic),
water struggle (basic), poop trigger (waste spawn stays game logic —
`FROG_CLIP_EVENTS.procedural_frog_poop_trigger.wasteSpawnAt = 1.35 s`).

**Needs rig controls first (blocked by missing bones — no clip can fix
these without a rig update):**
- eyelid bones (or blink shape keys) → blink, closed-eye sleep;
- jaw bone → bite, chew/swallow, mouth-open threat;
- tongue chain (2–3 bones) or a separate tongue mesh → tongue catch +
  missed tongue;
- gular throat bone → a true vocal-sac pulse;
- **re-parent the 24 `Foot_Finger.*` toe-fan bones to their feet** (they
  are parented to the body today, and `Foot_Finger.011.R` sits in the
  LEFT fan) → without this, full leg extension tears the hind toe webbing.

**Should be hand-animated by Fiverr (quality clips, exported with THESE
names so the game auto-prefers them over the procedural fallbacks —
`src/data/creatures/frogAnimationMap.ts` `preferred` lists):**
`frog_big_jump`, `frog_landing`, `frog_tongue_catch` ★required,
`frog_chew_swallow` ★required, `frog_bite`, `frog_missed_tongue`,
`frog_blink`, `frog_slow_crawl`, `frog_climb_up`, `frog_climb_down`,
`frog_climb_out_water`, `frog_water_paddle`, `frog_collapsed_faint`,
`frog_poop` (needs real body deformation), plus better takes of any
fallback (`frog_small_hop`, `frog_startled_jump`, …) whenever wanted —
a real clip with a preferred name ALWAYS wins over the procedural twin.

## v22 quick map (frog animation system + Lab)

- **Pure map** `src/data/creatures/frogAnimationMap.ts` — 35 behavior
  states × { preferred GLB names, procedural fallback, requiredForRelease,
  note } + `FROG_PROCEDURAL_SPECS` (23 buildable clips: name/duration/
  loop/rootMotion) + `FROG_CLIP_EVENTS` + `FROG_RIG_SUPPORT` +
  `resolveFrogAnimations()` (glb → procedural → missing, loudly) +
  `frogAnimationReport()`. Tested: `tests/froganim.test.ts` (9).
- **Clip builder** `src/render/three/creatures/FrogProceduralClips.ts` —
  `captureFrogRig()` poses the baked idle at t=0 and captures the CROUCH
  as the per-bone base pose (the bind pose is an upright ghost);
  `buildFrogProceduralClips()` samples authored offset programs into real
  `THREE.AnimationClip`s @30 Hz (+2-key base tracks on every untouched
  bone so the 1086-channel GLB idle can never leave stale bone state).
  ⚠ THE RIG LESSON: the export ships SEVERAL independent top-level bone
  subtrees (`root`→DEF-spine; `MCH-torso.parent`→ALL limb chains;
  `MCH-foot_ik.parent.*`→toe fans) — Blender constraints glued them, glTF
  strips constraints. Whole-body motion must drive EVERY top subtree
  (`BODY` target: rigid spin + orbit about the model origin) — driving
  only `root` stretches the frog like taffy (hit it, fixed it, photos in
  scratchpad/poses). Also: three.js sanitizes node names (dots stripped:
  `DEF-spine.001` → `DEF-spine001`) — always look bones up sanitized.
- **Player** `src/render/three/creatures/FrogClipPlayer.ts` — one mixer
  for GLB + procedural clips: crossfades, loop override, speed clamp,
  `seek(name, t01)` frozen-pose scrub, `resetPose()` → EXACT crouch.
  Untouched: ThreeFrogHopper (live paludarium), gecko controllers.
- **Lab** `src/render/three/ThreeFrogLabScene.ts` — `?habitat=froglab`
  (alias `?debugFrog=1`, dev-only, never persisted): magnified frog on a
  ringed stage (rings = small/medium hop reach), grouped state list with
  GLB/Procedural/Missing badges, play/prev/next/replay, loop + speed +
  reset transport, missing box, rig notes, copy-report. QA hooks:
  `__frogLab.ready/states/missing/clips/play/pose(state,t01)/current/
  next/prev/reset/setSpeed/setLoop/report/rootBoneWorld`.
- Drives (scratchpad): `frog_probe.mjs` (26 checks — structure, hop
  root-motion lands Δy 0.0000, clamp/loop/speed/reset, UI clicks, console
  0/404s 0), `frog_regress.mjs` (14 checks — lizard incl. terrain/
  decorate modes, frog, fish, creature lab), `frog_poses.mjs` (frozen
  pose audit → scratchpad/poses). Screenshots:
  `screenshots/session_checks/froglab_*.png`.

## v21 quick map (the CSS-3D room)

- Everything in `src/ui/homeHub.ts`; HomeHub class API + HubMeta unchanged
  (app.ts untouched). Registry still `src/data/ecoCenter.ts`.
- **Camera**: `.scene` carries `perspective` (170u) + `perspective-origin`
  (50% 42%); pointer parallax eases the origin (rAF loop started in
  `show()`, stopped in `hide()`, skipped under prefers-reduced-motion).
- **World**: `.room` (preserve-3d, 0×0 anchor at scene center). All placed
  elements register in `this.placed` with u-unit specs; `layoutRoom()`
  re-projects px on show/resize (u = scene height / 100 — composition is
  identical at every 16:9 size). `ROOM` constants: halfW 88, depth 190,
  floorY +32, ceilY −34, door −6..+30. Helper mappers (`lwX/rwX/wallY/
  floorX/floorZ…`) convert world u → %-children on shell planes.
- **Structure**: `.rfloor`/`.rceil` (rotateX ±90) + `.rwall.rl/.rr`
  (rotateY ±90) + `.bseg` back segments around a REAL door gap + `.rlake`
  at z −252 (parallax through the door) + `.doorpost/.doorhead` + `.wwin`
  window. Tanks = `buildTankUnit()` boxes: `.cab` front (minis + `.plq` +
  `.underglow`) + `.cabs` end + `.glass` art face + `.tfside` glass end cap
  + `.tftop` lit lid. Rainforest = `buildRainforest()` column on the back
  wall. Library/supply/photo/restoration = `%`-placed `.unit.onwall`
  children of the wall planes (their inner DOM unchanged from v20.1).
  Chips = billboarded `.spot` pills at `CHIP_AT` (no rotation → they face
  the screen).
- **RULES (learned the hard way, keep them)**: ① no placed plane may CROSS
  another plane — Chromium preserve-3d plane-splitting is nondeterministic
  (pale-ghost renders on some loads). Near-camera props (couch, corner
  ferns) are therefore FLAT `.fg` overlays above the room; glows are
  coplanar children of the plane they light (`.wash.hue` on walls,
  `.fpool` on the floor); chains/posts stop just shy of ceiling/floor.
  ② decorative faces (`.tfside/.tftop/.cabs`, motes) are
  `pointer-events: none` — Chromium's 3D hit test can return a farther
  face for a point where a nearer face is visible (the aquarium's end cap
  used to swallow clicks aimed at the vivarium's art). Click targets: art
  faces, cabinet fronts, wall units, chips.
- Drive: scratchpad `drive3d.mjs` (46 checks; screenshots into
  `docs/production/screenshots/main_menu_3d_hub/` — 1920/1600/1366 + hover
  + restoration modal). Door screens overlay the hub → their open/closed
  signal is a VISIBLE `.gw-backpill` (pills persist hidden in the DOM).

### Painted art slots — v21 revision (per-plane, not one plate)

The v20.1 "single 16:9 background plate" concept is superseded: the room is
now real geometry, so final art lands as PER-PLANE textures that keep the
perspective live (each slot replaces a CSS gradient stack 1:1, same element):

- **Floor plank texture** (`.rfloor` background; tileable, lit warm center,
  ~2k), **wall wood** (`.rwall`/`.bseg`), **ceiling boards** (`.rceil`).
- **Lake vista** (`.rlake`, ~1200×1000, dusk sky + moon path + water + tree
  lines, no UI) — the single highest-impact plate.
- **Prop sprites** (alpha PNGs): couch back, coffee table w/ lantern +
  terrarium bowl, pendant lanterns, potted plants — swap the CSS-drawn
  `.fg .couch`/`.ctable`/`.pshade` for art 1:1 at the same boxes.
- Tank glass/plaques/chips/photo pins stay REAL DOM. No UI in any plate.

## v20/v20.1 quick map (main menu — superseded by v21 but the panels remain)

- Scene + panels: `src/ui/homeHub.ts` (rebuilt; HomeHub class API + HubMeta
  byte-compatible — app.ts untouched). Room registry: `src/data/ecoCenter.ts`
  (ECO_SECTIONS 7 / QUICK_NAV 5 / HABITAT_ROWS / RESTORATION / greetings;
  tests `tests/ecocenter.test.ts`, 10).
- Geometry: `UNIT_GEOM` in homeHub (stage-relative %, per-unit `chipTop` —
  v20.1 anchors every chip just above its feature on a SHORT stem; the v20
  beam cords are deleted); compact chip tier ≤1560px; Restoration card
  hides ≤1560px.
- v20.1 scene layers (all CSS/DOM in homeHub, top→bottom): `.ceil` rafters →
  `.wall` (darker, grained) → stage: `.sky`(×2 dusk windows; `.moon`
  variant) / `.post` / `.wallglow` / `.pend`(chain+shade+bulb+halo+cone) /
  `.spill`(per-tank floor light, `--sp` hue) / units / `.shelfplant` ferns →
  `.vig` vignette → `.fol` foreground fernbush sprites. Units carry `--hue`
  (`hue-amber|aqua|green`) feeding glow/rim/underglow; `.cab` holds two
  `.mini` tanks (`--mh` hue). Restoration: `.seep` teal pulse. Library:
  `.lampdome/.chair/.lean`. Photo board: `.piclight` + paper-blank
  `.pin.empty`.
- Real art: tank plates `public/assets/ui/habitats/*.jpg`; Photo Wall =
  `listShots()` (refreshed on show()); Supply shelves = decor_thumbs PNGs;
  foliage = `public/assets/plants/plant_fernbush.png` (darkened silhouette).
- New icon: `moon` in gwIcons (sun/moon swaps with the in-game clock).
- Drive: scratchpad `main_menu_drive.mjs` (58 checks + 5 screenshots into
  `docs/production/screenshots/main_menu_v2/`; v20's shots remain in
  `main_menu_implementation/` as history).

### Background plate — the future final-art slot (documented, not blocking)

The CSS envelope (`.ceil/.wall/.sky/.floor/.vig` + lounge silhouettes) is
built to be replaced 1:1 by ONE painted background plate when art lands:

- **Spec**: 16:9 (author ≥2560×1440), NO UI baked in, cozy wood research
  lodge at dusk; leave the six feature zones readable as physical anchors
  (stage-relative: vivarium 0–16.5% / aquarium 18.5–44% / rainforest
  46–60% / restoration arch 62–72% / library 74–86.5% / supply 88–100%,
  floor line at 74% height); warm amber key light + aquarium teal accents;
  keep the left ~19% and bottom ~15% quiet/dark for the overlay panels.
- **Integration**: set it as the `.scene` base layer; delete the CSS
  wall/ceil/sky/floor draws; KEEP the live layers (tank plates, minis or
  real tank crops, chips, spills, vignette, foliage) on top. The tank
  glass/plaques/chips must stay real DOM — no UI in the plate.

## v19.1 quick map

- In-use fallback: `app.decorInUse()` (counts authored default layouts
  when `glasswater.habitat.<id>` is absent).
- Turntable art: rerun the scratchpad `extract_decor_thumbs.mjs` after
  catalog changes — writes base + `_y90/_y180/_y270` per unlocked piece.
- `SUPPLY_ART`/`supplyArtPath` live in shopCatalog (Shop + Inventory
  share); `sellAllSpares` in decorInventory; Edit = `placeFromInventory(null)`.

## v19 in five bullets (details in STATUS.md)

- `gwBackPill()` in gwTheme → mounted in the headers of Care Guide,
  Habitats, Supply Shop (`ShopCallbacks.close` NEW — the shop had no close
  control), Inventory, Photo Album, Settings.
- `app.capturePhoto()` now escapes the active "photo" mode machine after
  the shutter (all three habitats); the flash covers the re-anchor.
- 16 real captures in `public/assets/ui/care_guide/` shot via the NEW
  `__habitat3d.setView(pos, target)` QA hook — regenerate with the
  scratchpad `capture_care_guide.mjs` (per-shot camera coords inside) +
  `capture_hub_wall.mjs` (Overview hero). Card tiles = the reference's
  side-by-side layout; heroes carry 📷 caption chips.
- `src/data/careGuide.ts` fully rewritten (accurate, plain-language,
  species-checked; CARE_QUIZ deleted; `CARE_FACTS` rotating Did-You-Know;
  hero `caption` field; feeder cards now use the real food photos;
  at-a-glance species panel on Behavior). careguide tests 15→20 (art
  exists on disk, full-sentence notes, autotomy FAQ, prey-size rule).
- Whole guide cards are clickable (pointer cursor probed live); Esc chain
  unchanged (collapse first, then close).

## Session status — v18 COMPLETE + v19 COMPLETE (all verified live)

Reference folders used: `Designs/Supply_Shop/`, `Designs/Inventory_Screen/`,
`Designs/Photo_Album/`, `Designs/Settings_Page/` (no Main_Menu folder exists
— the hub redesign followed the prompt's written direction: a physical
eco-center room). Batch rule held: screenshots are the source of truth
(six settings tabs per the image, no left nav anywhere).

### The new economy loop (foundation for Shop + Inventory)
- `src/game/decorInventory.ts` (pure + `glasswater.decor.v1`, 6 tests):
  owned decor counts, `consumeOwned` (placement takes a spare first —
  wired at app.ts's single placement-economy seam; leaves charged only
  when none spare), `sellOwned` at `SELL_BACK_RATE` 0.6, `inUseCounts`
  parsed from the REAL habitat saves.
- Checkout delivery lives in `app.applyShopCheckout` (stock += packs ×
  pack size; owned decor += pieces; leaves −= total; saves + chime).

### Where each screen lives
- **Supply Shop** — `src/data/shopCatalog.ts` (products = 8 supply packs +
  every unlocked catalog piece at real DECOR_PRICES; 3 BUNDLES priced
  Σ(contents) − discount; pure cart math + checkout; 9 tests) +
  `src/ui/shopScreen.ts` (HubScreens "shop" case, self-chromed). Substrate
  + Care Tools lanes honestly sell nothing (real notes).
- **Inventory** — `src/data/inventoryPage.ts` (8 categories over real
  content: decor/plants/other = catalog with owned+in-use, food = stock,
  substrate = terrains with real swatches, tools/supplements = the
  permanent keeper's kit; rarity/size/biome DERIVED words; sort/paginate/
  totals; 13 tests) + `src/ui/inventoryScreen.ts` (HubScreens
  "inventory"). Actions: Place in Habitat (deep-link below), Sell (60%),
  Buy-in-Shop, Paint-in-Terrain.
- **Photo Album** — `src/data/photoAlbum.ts` (caption→collection matching
  for every real caption shape incl. renamed fish tanks; counted stats;
  showcase = favorites + covers; 9 tests) + `src/ui/photoAlbumScreen.ts`
  (**standalone overlay**, replaces AlbumOverlay — in-habitat 🖼 buttons
  must return to the habitat, and HubScreens' close() re-shows the hub).
  Album STORE stays `src/ui/albumScreen.ts` (+ favorites/covers sidecars
  `glasswater.album.favs.v1` / `covers.v1`, heal-safe delete).
- **Settings** — `src/data/settingsSchema.ts` (six tabs; every row
  live-wired / true info / honest future with persisted choice; 9 tests) +
  `src/ui/settingsScreen.ts` (**standalone**, replaces SettingsModal —
  file deleted, all callers rerouted). Central application:
  `app.applySettings` on `onPrefsChange` (sfx volume, body classes, menu
  zoom, renderer setRenderScale/setControlTuning, fps cap, autosave
  cadence). Prefs grew v2 fields with clamped healing + `fmtClockPref`.
- **Home hub v2** — `src/ui/homeHub.ts` re-rendered: DISPLAY WALL (real
  plates as lit glass displays + stand/shelf/plaques/reflections + live
  scores + reminder dots), TODAY'S CARE strip via `deriveReminders`
  (needs `careData()` callback = app.habitatsData()), restoration bar,
  icon-chip doors. Class API + HubMeta stash unchanged.

### The Inventory → Decorate deep link
`app.placeFromInventory(defId)` → `pendingDecorArm` + enterHabitat("lizard")
→ bounded 500 ms retry until HUD+editor ready → requestMode("decorate") →
`enterEditor` consumes the pending arm via the new
`HabitatEditorPanel.armExternal(defId)` (jumps to the piece's category tab,
arms it, shows its detail card — exactly as if its card was clicked).

### Art
- 29 REAL decor thumbnails (512² studio renders of the actual GLBs incl.
  placeholder-shape pieces) at `public/assets/ui/decor_thumbs/<defId>.png`.
  Regenerate with the scratchpad `extract_decor_thumbs.mjs` (page-side
  import of ThreeThumbnails — which gained a `size` param +
  `placeholderThumbnail`, cache keys include size).
- No reference-image crops were needed this session; supply packs use
  styled glyph tiles (limitation: product photography later).

## Gates (all green)

- typecheck EXIT 0 · **550/550 tests** (5 new files, 46 new tests) ·
  production build EXIT 0.
- Final Playwright drive **78/78** + a 31-check smoke, **0 console
  errors/warnings** (GL-driver chatter filtered as tool noise): exact
  cart/checkout math (subtotal 674 / total 550 / leaves −550 / crickets
  +18 / mealworms +6 / owned pieces persisted), product-line merge +
  steppers + remove + clear, bundle modal, honest empty lanes, 5-per-row
  inventory + detail facts/meters/tips, sell +42, Decorate deep-link with
  armed card, album collections with real-capture covers + favorite →
  sidebar count + favorites filter + slideshow + Esc chains + honest
  Seasonal toast, settings persistence (°C), REAL menu zoom via uiScale,
  R-resets-open-tab-only, high-contrast body class, reset-to-defaults,
  playtime chip, Care Guide + Habitats page regressions, no horizontal
  overflow at 1920/1600/1366.
- Screenshots: `docs/production/screenshots/final_ui_pass/`
  (main_home · supply_shop · inventory · photo_album · settings).

## How to test

```bash
npm run typecheck && npm test && npm run build
npm run dev   # → http://localhost:5173
```
Hub → Supply Shop: add Crickets twice (one line, qty 2), Add Bundle on the
hero, watch Subtotal/Bundle savings/Total, Checkout → toast lists the
delivery. Inventory: click pieces (detail panel), Sell one (two-click
confirm), Place in Habitat → lands in the vivarium's Decorate mode with the
piece armed (placing it is FREE — from your inventory). Photo Album: take
photos first (camera button in any habitat → shutter), then favorites/
cover-pick/slideshow/export. Settings: every slider/toggle applies
instantly; R resets the open tab; Esc backs out. Playwright locally:
`node <scratchpad>/verify_final_ui.mjs`.

## Gotchas found this session

- **R inside form controls is deliberately ignored** by the Settings
  screen (typing in selects/sliders must not reset the tab) — drives must
  blur before pressing R.
- Playwright's virtual pointer rests at its last click point — incidental
  hover/focus rings can appear in screenshots (known from v17).
- The Red Succulent tint: `applyDecorTint` lerps the material's WHITE base
  color toward the tint (multiplier over the green texture) — the red
  reads subtle both in-tank and on the extracted thumbs. Faithful, not a
  bug; a stronger tint would change the live look (out of scope).

## Known v1 limits / notes

- Supply-pack product art = glyph tiles (decor products use real GLB
  renders); product photography is a follow-up.
- Bulk Actions, key rebinding, music/ambience volumes, dynamic shadows,
  bloom: honest future rows (choices persist for when systems land).
- Place in Habitat targets the vivarium (the only Decorate-capable
  habitat); fish decorate/aquascaping remains the next big habitat item.
- The fourth hub bay is honestly draped "in restoration" — no fake
  construction flow.
- ALL WORK REMAINS UNCOMMITTED on top of the old "Phase 2" commit
  (v15+v16+v17+v18) — a checkpoint commit is strongly recommended (user
  decision).

## Next recommended prompt

"Give the aquarium a real Decorate mode (aquascaping with the existing
editor machinery + an aquatic catalog), wire Care Guide checklists + the
Habitats-page reminders to live habitat audits, and land real art for the
5 locked decor cards + supply-pack product photos."

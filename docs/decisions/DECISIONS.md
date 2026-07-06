# DECISIONS — GLASSWATER

Architecture & direction decisions (ADR-lite). Newest first. Each: context →
decision → consequences.

---

## 2026-07-05 — Main menu v23: a rendered ATRIUM backdrop + live UI (reverses the v21 CSS-3D-room decision)

**Context.** The user named a single source of truth for the main menu:
`Designs/Main_Menu/ChatGPT Image Jul 5, 2026, 12_25_17 AM.png` — a cozy premium
**circular atrium** eco-center. Three prior attempts to hand-draw the
environment (v20 CSS wall, v20.1 cinematic pass, v21 one-point-perspective
CSS-3D room) were each rejected as "flat / prototype / boxes in a 3D room," and
v21's rectangular room is the wrong composition entirely (it was built from the
12_25_29 board, not 12_25_17). The user asked to match 12_25_17 "extremely
close … release-quality," explicitly allowing a full rebuild and "whatever gets
closest."

**Decision.** Stop hand-drawing the environment. Render the atrium as a painted
BACKDROP plate and overlay the real, live, wired UI on top (asked the user
first; they chose this over reusing the reference file or hand-building the
rotunda). The plate is **generated with gpt-image-1** to match the reference
composition — a UI-free art asset, NOT the reference screenshot — curated to
`public/assets/ui/hub/eco_center_atrium.jpg`. All interaction stays real DOM:
5 habitat hotspots + signage aligned to the painted displays, top ribbon,
brand + Continue, live Current Habitats, daily-care card, dock, restoration
modal. `src/ui/homeHub.ts` was rebuilt (the CSS-3D scene deleted); the HomeHub
class API + HubMeta + app.ts are unchanged.

**Why this over the alternatives.**
- *Hand-drawn CSS/3D* (v20–v21) cannot reach a painted atrium at Steam quality —
  proven three times. This is the approach the user kept rejecting.
- *Pasting the reference file* would ship its baked-in UI (no live scores/
  reminders) and is what the user earlier forbade ("don't paste the reference
  as the UI").
- *A generated UI-free plate* gives the painted fidelity while the UI stays
  live — and it's consistent with existing practice: the game already renders a
  room backdrop (`ASSETS.room.ecocenter`) behind the 3D habitats.

**§9 exception.** CLAUDE.md §9 ("reference images are visual targets, not static
backgrounds") is about not shipping the *reference* as a fake background; a
purpose-generated menu backdrop art asset is a legitimate game asset (same class
as the habitat room plate). Logged the spend in api_usage_log.md.

**Consequences.** The hub is now art-plate-driven: swapping the JPG restyles the
whole menu, and hotspot positions (viewport-% in `HOTSPOTS`) must be re-tuned if
the plate's composition changes. The v21 CSS-3D room + its rules (plane-crossing,
decorative-face pointer-events) are retired for the hub (git history keeps them).
Three.js is unaffected (still habitat-only). Known minor gaps vs. the reference
noted in STATUS.md.

---

## 2026-07-04 — Inventory pass (v19.1): default layouts count as owned, pre-rendered turntables, bulk sell

**Context:** "Perfect the Inventory and make sure everything works." The
audit found a fresh profile showed ZERO decorations (in-use counts only
read habitat saves, which don't exist before the first visit), glyph
tiles where real art exists, and three reference buttons (Rotate / Edit /
Bulk Actions) that were missing or placeholder.

**Decisions:**
1. **The authored default layouts are the player's property.** When a
   habitat has no save yet, its default layout's pieces count as "in
   habitat" (`app.decorInUse()`); the moment a real save exists it wins.
   No phantom counts, no empty first-run tabs.
2. **Rotate = pre-rendered turntable frames, not runtime three.js.** The
   hub stays 2D: the extraction script renders 4 yaw frames per piece
   offline (`ThumbVariant.yaw`); the button pages static PNGs and falls
   back to the base frame if one is missing. Tests pin all 4 frames on
   disk per unlocked piece.
3. **Reference "Remove" stays "Sell" and "Edit" opens Decorate.** Sell
   refunds 60% (economy beats mockup fiction, standing ADR); Edit
   deep-links into the vivarium's Decorate mode unarmed via the same
   bounded-retry pipeline as Place — real machinery, no new editor
   surface.
4. **Bulk Actions ships with one real action** (sell all spares — pure
   `sellAllSpares`, per-piece floor identical to single sales) plus a
   Shop jump, instead of a future-toast. Fish-food product photography
   remains the only glyph lane, honestly.

---

## 2026-07-04 — Care Guide pass (v19): live-capture art pipeline, universal back pill, self-exiting photo mode, quiz removed

**Context:** Direct user feedback: no visible back buttons on the door
screens, photo mode strands you after a shot, and the Care Guide should
feel like a real game encyclopedia — actual in-game imagery per topic,
plainly written accurate Learn-more content, no quiz box, pointer cursors.

**Decisions:**
1. **Guide imagery = live captures, never stock or mockup crops.** A new
   `__habitat3d.setView(pos, target)` QA hook places the free camera
   exactly; the scratchpad capture script hides the HUD and clips JPEGs
   from the running game (heroes + all Habitat Setup essentials). The
   careguide test suite requires every referenced art path to exist on
   disk, so dead art fails CI. Consequence: after major redecoration of
   the vivarium, rerun the capture script so the guide matches the tank.
2. **One back affordance for every full-screen door** — `gwBackPill()` in
   gwTheme, mounted top-left in each screen's own header (works with both
   hosting models: HubScreens cases call `cb.close()`, standalone overlays
   call their own `close()`). The Supply Shop gained the `close` callback
   it never had. Footer backs stay for reference fidelity.
3. **The shutter ends Photo Mode.** Capture → flash → escape whichever
   mode machine is in "photo". The flash masks the camera re-anchor, so
   the transition reads as one beat (the standard game pattern).
4. **Quiz CTA deleted, not deferred.** The reference's "Track Your
   Knowledge" box promised a system that doesn't exist; the user asked
   for its removal. Its sidebar slot now holds a rotating true "Did You
   Know?" field note (pure `CARE_FACTS`, advances per chapter view) —
   game-encyclopedia flavor with zero fake promises.
5. **Copy contract enforced by tests:** every Learn-more note must be a
   complete sentence (length + terminal punctuation asserted), heroes
   (except FAQ) must carry a capture + caption, and safety content
   (solitary, can't-swim, tail autotomy) is pinned by regex.

---

## 2026-07-04 — Final-UI pass (v18): owned-decor economy, standalone vs hosted screens, honest settings rows, the physical hub

**Context:** The last four Designs references (Supply_Shop, Inventory_Screen,
Photo_Album, Settings_Page) + a home-hub redesign brief landed as one
autonomous session. The mockups show systems the game lacked (owned item
quantities, a cart, graphics options like V-Sync/shadows, photo likes/star
ratings) and the hub was a flat card dashboard the user disliked.

**Decisions:**
1. **Owned-decor economy loop** (`src/game/decorInventory.ts`): the Shop
   sells real catalog pieces into a persisted owned store; Decorate-mode
   placement consumes an owned piece FIRST and only charges leaves when
   none are spare — the classic pay-on-place path is unchanged otherwise,
   guarded at the single placement-charge site. Inventory sells spares back
   at 60% of catalog price (a real sink; full-price sell-back would make
   buying reversible for free). "In use" counts are READ from the real
   saved habitat layouts, never tracked separately.
2. **Two hosting models, chosen by return-path**: Shop + Inventory stay
   HubScreens cases (hub-only destinations); Photo Album + Settings are
   STANDALONE fullscreen overlays because in-habitat HUD buttons open them
   and closing must return to the habitat, not the hub (the HubScreens
   host's close() re-shows the hub). This preserved every existing
   openAlbum/openSettings call site's behavior while replacing the old
   AlbumOverlay + SettingsModal outright.
3. **Settings honesty policy**: every row is (a) live-wired to a real
   system, (b) a true stated fact (V-Sync/pause-on-blur are
   browser-managed; view distance really is "the whole tank"), or (c) a
   FUTURE row that persists its value with an explicit "arrives with the …
   update" note (music/ambience/shadows/bloom own real pref fields the
   future systems will read). No dead toggles pretending to work. The
   image's six tabs beat the prompt template's nine sections (batch rule:
   the screenshot is the source of truth).
4. **Real data over reference fiction, extended** (v17 policy): shop prices
   ARE the economy's; bundle prices are Σ(real contents) minus the stated
   discount; album stats are counted, "likes/star ratings" (multiplayer
   fiction) became favorites + a Showcase of favorites/covers; inventory
   rarity/size/biome are presentation WORDS derived from real
   price/measured extents/authored tags (scoreWord precedent); supplies'
   "Substrate"/"Care Tools" shop lanes honestly sell nothing.
5. **The hub is a physical room, not cards**: the three real tank plates
   render as lit glass displays (sheen, lamp cones, stands, one shared
   shelf, plaques, reflections) with live scores + reminder dots; the
   fourth bay is honestly draped "in restoration"; the care strip reuses
   deriveReminders. Class API + HubMeta stash unchanged.
6. **Catalog art is extracted, not hand-made**: ThreeThumbnails gained a
   size param + placeholderThumbnail; a one-off script rendered all 29
   unlocked pieces at 512² into `public/assets/ui/decor_thumbs/` — the
   Shop/Inventory cards show the ACTUAL models (tint faithfulness matches
   the in-tank look).

**Consequences:** Decor purchases finally have a home before placement and
placement has a free-from-inventory path (new toast copy); selling exists
as a leaves source (60% rate is the knob). Settings replaced a modal that
three HUDs opened — all callers now open the screen. The old shop/inventory
v12 hub screens and their CSS are gone. New persisted keys
(`glasswater.decor.v1`, `glasswater.album.favs/covers.v1`, `gw_playtime.v1`,
prefs v2 fields) all wipe with the existing reset sweep; prefs still
survive by design.

## 2026-07-04 — Habitats page: real data over reference fiction; templates stay honest concepts (v17)
**Context:** The Habitats reference (`Designs/Habitats/`) shows a management
page populated with a designer's placeholder world: fictional habitat names
(Sahara Dunes / Riverbend Haven / Mossy Hollow / Crystal Stream / Ember
Flats), an XP level, a 12-day streak, 128 photos, three canned reminders and
a 3/6 habitats footer. The game has exactly three real habitats with live
scores, real saves and real care signals.
**Decision:** (1) **Owned content shows the player's real world**: "Your
Habitats" and "Recently Visited" are the three live habitats (Sunstone
Desert · Sapphire Stream · Emerald Hollow) with LIVE scores (aquarium from
the running sim; vivarium/paludarium from an extended HubMeta stash that now
carries cleanliness/hunger/humidity/hydration), and every card actually
opens its tank. The reference's layout is matched exactly; its fictional
content is treated as lorem ipsum. (2) **Unowned content is explicitly
future**: the reference's four template builds keep their aspirational names
but render as procedural gradient "Concept" tiles (no borrowed tank art)
whose clicks answer with the honest future-update note — same pattern as
locked decor/substrates. (3) **Meta numbers are derived, never invented**:
Eco-Keeper level is a fixed 250★-per-level presentation of real reputation
(pure `keeperLevel`, tested); Care Streak is a real persisted daily counter
stamped on habitat entry (`bumpStreak`); Avg. Cleanliness averages the live
per-habitat signals; photo count reads the real album; Reminders DERIVE from
the stashed signals (`deriveReminders` — hunger/cleanliness/humidity/
hydration/nitrate thresholds, urgency-ordered) so a fresh save honestly
shows "—", "Not visited yet" and "All caught up" instead of fake numbers.
(4) **Visits are first-class data**: `enterHabitat` stamps real last-visit
timestamps into HubMeta (drives "Recently Visited" + the default featured
selection) and the care streak; selecting any card re-features the hero — the
featured habitat IS the selection. (5) The batch rules from the v16 ADR
extend unchanged: no left nav (hub doors + a new Habitats door), full-bleed
over the room, scoped serif display (`--hb-display`), honest status footer.
**Consequences:** Card/hero art is real in-game renders (canvas-only
Playwright captures under `public/assets/ui/habitats/` — regenerable as the
tanks evolve); HubMeta gained nullable signal/visit fields (old stashes heal
to null and simply show the honest empty states); "Create New Habitat" is a
polished placeholder until construction ships; the reference's Recently
Visited row necessarily repeats the same three tanks until more habitats
exist.

## 2026-07-04 — Care Guide: data-driven chapters, hub-door navigation, derived numbers (v16)
**Context:** A final Care Guide reference landed (`Designs/Care_Guide/`) as
part of a NEW batch of full-bleed screen designs (Supply Shop, Inventory,
Photo Album, Settings, Habitats). The implementation brief's generic template
asked for a persistent left nav; the reference image (declared source of
truth) shows none — and neither does any other screen in the batch.
**Decision:** (1) **The image wins over the template**: no left nav anywhere;
the hub's doors remain the game's navigation and every full-bleed screen
carries its own header + Back (the Care Guide's lives in its status footer).
(2) **Content is a pure data registry** (`src/data/careGuide.ts`): eight
chapter definitions (hero / info strip / expandable cards / per-tab quick
reference / checklist / FAQ) rendered by ONE view (`src/ui/careGuide.ts`)
hosted inside the existing HubScreens overlay — adding a chapter is a data
edit, and the content contract is unit-tested. (3) **Husbandry numbers are
DERIVED, never copied**: temperatures are °C bands read from
`LEOPARD_GECKO.ideal` and formatted through prefs (the °F/°C toggle keeps
working), feeder cards derive from `FOOD_TYPES` — the guide can never
contradict the in-game warnings/filters, which read the same sources. Where
the reference's prose numbers differed slightly (88–92°F warm hide), the
researched profile wins. (4) **Honest gamification**: the footer shows real
stats only (Eco Points = leaves — the Supply_Shop reference's own name for
the currency; "3 restored" habitats; reputation; the in-game clock) — no
fake achievements/playtime counters; the Track Your Knowledge quiz CTA says
plainly that quizzes aren't built yet. (5) The batch's serif display face is
scoped to the screen (`--cg-display`), not pushed into gwTheme, until more
screens adopt it.
**Consequences:** The old flat guide's content (nitrogen cycle, species
encyclopedia) moved into the Overview chapter rather than being deleted;
checklist `done` flags are static copy for now with live-audit wiring left
as a roadmap item; Playwright now runs as a local dev dependency (the MCP
was unavailable), which any future session can reuse for verification.

## 2026-07-04 — A third habitat is a LEAN composition, not a gecko fork (paludarium v15)
**Context:** The colorful frog needed its rainforest paludarium. The gecko
scene (~4300 lines) mixes scene + editor + terrain + care; copying it for
every new habitat would be a maintenance disaster, but the shell/floor/decor
machinery it uses is genuinely reusable.
**Decision:** (1) A new habitat = **one pure data module + one lean scene
class** composing the shared load-bearing pieces: `EnclosureSpec` →
`buildVivariumShell` (styling via small options like the new
`backPanel: "rainforest"`, defaults untouched), `HabitatMaterialMap` +
`MaterialFloor` for a painted floor, the shared decor pipeline
(placeholders → GLBs + measured footprints), `HabitatSaveLoad` under the
layout's own id, and a species controller (`ThreeFrogHopper` grew `scale`
for the habitat world scale and a `freeSpot` hook so hop landings clamp out
of the measured-contour CollisionWorld). Editors/terrain tools are NOT part
of a habitat's v1 bar — the dock ships only the species' real care verbs
(Feed / Mist / Info for an amphibian). (2) **Species needs live in their own
pure module** (`FrogNeedsSystem`): hydration is the amphibian's load-bearing
axis (humidity/mist/pond), tuned to SESSION pacing (the first cut drained
~20×/min too fast — same lesson as the gecko hunger fix). (3) **Substrate
unlock semantics stay data-driven**: `TerrainDef.habitats` gates per habitat
type; `tropical_terrarium` unlocks bioactive/mossy/leaf-litter that stay
locked in the desert. (4) The hub gains a card + `HubMeta` stash per
habitat; each habitat gets its own `GwModeMachine` home mode.
**Consequences:** ThreeFrogScene is ~700 lines for a full playable habitat;
habitat #4 (bird/turtle/…) has a template to follow; the gecko flagship
stays the only scene carrying editor complexity until Decorate is
generalized deliberately.

## 2026-07-04 — Dev environment: stat-polling watcher over iCloud fsevents (tooling)
**Context:** The repo lives in iCloud-synced `~/Documents` ("Desktop &
Documents" sync ON, files evicted under Optimize Storage). macOS fseventsd
ghost-replays events for files whose mtimes never changed, so Vite
phantom-restarted (`vite.config.ts changed` / `.env changed`) every few
seconds and killed verification flows across three sessions; node_modules
eviction also explains the historical tsc crawls.
**Decision:** `server.watch.usePolling: true` (interval 800 / binary 2500)
with **root-anchored** ignore globs for the non-runtime art/docs trees.
Polling compares real stats, so ghost events can't fire. Gotcha now
documented in the config: a bare `**/assets/**` glob ALSO matches
`public/assets/**`, and the public-file registry is maintained by this same
watcher — new public files then fall back to index.html when requested.
**Consequences:** 17 phantom restarts before → 0 after; HMR latency ≤0.8 s.
The real cure remains moving the repo out of iCloud-synced Documents (or
disabling Optimize Storage) — recommended to the user.

## 2026-07-03 — Rigged creatures in the shared pipeline (colorful frog, v14)
**Context:** The first commissioned rigged asset arrived (red-eyed tree frog:
Rigify skeleton + one baked breathing-idle clip). The creature pipeline was
built for unrigged part-separated models (spatial classifier + joint
re-pivoting + procedural oscillators), and the frog's real habitat
(rainforest/paludarium) doesn't exist yet.
**Decision:** (1) **Rigged = a loader branch, not a new pipeline** — same
registry, same Lab, same controllers list; `asset.rig.clips` maps behaviour
alias → EXACT clip name and missing aliases are never faked (hops are
procedural until clips are commissioned). (2) **Instances clone via
SkeletonUtils** (plain `clone()` leaves skins bound to the master's bones).
(3) **Normalize from the POSED skin, not the bind pose** — this asset's bind
pose is a rig-default upright; the display pose lives in the clip, so the
loader poses the mapped idle at t=0 and measures `SkinnedMesh.
computeBoundingBox` (bind-pose measuring produced a 21 cm standing ghost vs
the true 6 cm crouch). Assume future rigged deliveries have the same trait.
(4) **`locked` on CreatureSpecies** (human-readable reason) gates species
whose habitat doesn't exist — visible in the dev Lab with the reason +
asset-readiness line, excluded from player-facing spawning (which is by
explicit id anyway). (5) **`tools/prep-rigged-creature.mjs`** owns runtime
prep (texture resize via sips, junk-node strip, never touches sources)
because the gltf-transform CLI cannot run on this machine's Node v20.6.0.
**Consequences:** the freelancer gecko drop-in path gains a proven rigged
route through the creature system; more clips = registry-only change; the
frog ships data-complete for the future rainforest milestone; prep tool is
reusable for every rigged delivery.

---

## 2026-07-03 — Decorate Mode v2: variants over new art, honest locks, effects data (v13)
**Context:** The Decorate brief called for ~34 named decor objects across five
categories (Plants / Rocks / Caves & Hides / Utilities / Decor), per-object
habitat effects, snapping, tighter collision and a placement preview — but the
project owns only 7 real decor GLBs, and collision was already mesh-measured
(contours + heightfields).
**Decision:** (1) **Variants over new art** — one GLB serves several catalog
entries distinguished by per-axis `defaultScale` + material `tint` +
interaction + stats (the v11 same-GLB-variant precedent, now systematic). The
collision compiler already applies per-axis scale to measured contours and
heightfields, so variant collision is correct by construction. Tint clones
materials (the decor cache shares them); thumbnails cache per
file+tint+scale. (2) **Honest locks** — objects that would read as pure
duplicates ship as LOCKED cards ("Art in production" / "Future humid
habitat") rather than fake variants: data-complete, visible in the catalog,
never placeable. (3) **Two stat layers stay** — `affectsStats` (0..100 score
contributions, already tuned + tested) and the new 0..10 `effects` card
meters serve different readers; a consistency test ties them loosely.
Deriving one from the other risked regressing the tuned habitat score for no
player value. (4) **Duplicate = purchase** — duplicating a placed piece runs
the same economy gate + charge as placing it (found as a free-decor exploit
during live verification). (5) **Terrain-true placement** — floor props seat
on the sculpted heightmap at place/move/snap-to-floor; the steep-slope rule
that gates the gecko's navigation also gates placement, so players can't
wedge decor onto walls the animal can't use. (6) The **Basking Lamp Marker
is not a placeable**: the lamp is part of the EnclosureSpec-derived shell;
making it placeable would fork the zone/environment model.
**Consequences:** 32 catalog entries ship from 7 GLBs + 6 procedural shapes;
saves stay compatible (legacy defIds preserved, rehydrate heals asset+tint);
five cards are explicit art-debt (Rock Arch, Arch Hide, Cork Hide, Skull
Accent, Tropical Fern); when real art lands, a variant upgrades by swapping
`asset` on its def — no save migration needed.

---

## 2026-07-03 — One unified game: hub-first navigation, legacy retired (v12)
**Context:** The player-facing build was three stapled experiences: the
polished gecko vivarium (gw UI), the old dark-teal 2D aquarium (the historical
default), and two 3D views (fish/spider) wearing the WRONG 2D HUD — the spider
was a bare placeholder box. Navigation was a corner debug switcher.
**Decision:** (1) A **HOME HUB** is the entry screen and the only player
navigation (habitat cards + Shop/Inventory/Guide/Album/Settings doors); both
habitat HUDs get a ⌂ pill back. (2) The **fish tank is rebuilt as a real gw
habitat** on the existing 3D scene, DRIVEN BY the existing deterministic
nitrogen-cycle sim (`src/core/sim.ts`) — the sim survives as the aquarium's
brain, the old 2D chrome does not. (3) **Spider + 2D aquarium become dev-only**
(`?habitat=spider`, `?tank=2d`; the corner switcher requires `?dev=1`); the 2D
game additionally remains the automatic WebGL-failure fallback, so the code
stays but no player path shows it. (4) **Part-hinge animation is banned for
fish silhouettes**: part-separated swimmers fuse to one mesh + the bounded
body-wave (`ThreeFusedSwimmer`) — hard-cut hinge seams read as the body
falling apart; invertebrates keep part animation where cuts read as
segmentation.
**Consequences:** One design language everywhere; the fish scene gained care
hooks (`AquariumHooks`) instead of a controller fork; the LizardController
pattern stays lizard-only. The 2D renderer/HUD/screens are dormant code kept
for fallback — delete only when a WebGL-fallback replacement exists. Economy
(stock + decor prices) now spans both habitats, so future habitats must budget
their consumables in `src/game/economy.ts`.

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

## 2026-07-05 — The main menu IS the eco-center: a self-drawn lodge, data-driven rooms

- **The hub is a place, not a dashboard.** `Designs/Main_Menu/` (7 boards)
  replaced the v18 display wall with a full research lodge. We synthesized the
  boards instead of copying one: board #2's stemmed sign chips + numbered-wall
  layout, #5's lounge mood/footer motto, #3/#4's resource + restoration bars,
  #1's daily-care card. The isometric cutaway (#6) was rejected for v1 — a flat
  wall composition ships at quality now; isometric is a future pass.
- **No pasted backgrounds — the scene is CSS and real game art.** Rule kept
  from every prior screen: reference images never render in-game. The lodge is
  gradients/DOM (wall, clerestory dusk, beams, lamps, floor, furniture); the
  only bitmaps are REAL content — live tank render plates, the player's actual
  album captures on the Photo Wall, and shop decor renders on the Supply
  Corner shelves. A fresh profile honestly shows empty photo frames.
- **Rooms are a pure registry** (`src/data/ecoCenter.ts`): id/label/subtitle/
  icon/desc + a typed action (habitat | screen | locked). The hub builds
  chips, stems, units and wiring from the list — adding a future room is a
  data edit. Scene geometry (UNIT_GEOM) stays in the UI layer because it is
  presentation, not content.
- **Stage-relative geometry over viewport-fixed.** Lamps, wall pools, stems
  and posts live inside the same %-based stage as the furniture, so alignment
  survives every viewport; overlay panels are px-clamped. Panels that must
  never collide are grouped in flex stacks (`.rightstack`) instead of being
  independently pinned. Non-essential panels (Restoration card) drop first
  below 1560px.
- **Honesty constraints carried into the menu**: keeper level is the existing
  reputation presentation (no XP system), restoration progress is the real
  3-of-4 bays (75%) with "Cloudridge Wetlands" as the next wing's project
  NAME (fiction naming allowed; fake progress numbers are not), the Daily
  Care card derives from live `deriveReminders`, and the locked wing opens a
  modal that says exactly what it is: a future update.
- **Class API frozen.** HomeHub's constructor/show/hide/update/HubMeta stayed
  byte-compatible with v12 — the whole replacement landed without touching
  `app.ts`, and the door screens/back pills were re-verified by the drive.

## 2026-07-05 — Main Menu V2: cinematic depth stays CSS-drawn (v20.1)

The user's follow-up ("too flat, too prototype-like — closer to the boards")
was answered INSIDE the same architecture, not by pasting art:

- **Depth is layered light, not bitmaps.** Rafter ceiling, mullioned dusk
  windows, per-habitat light hues (amber/aqua/green wall wash + glass
  rim-light + rack underglow + floor spills), a full-scene vignette and
  foreground foliage are all gradients/DOM. The only NEW bitmap is the
  existing fernbush sprite reused as a darkened silhouette — still real
  game art, still no reference pasted.
- **Empty cabinets became mini-tank racks** (six small glowing set-dressing
  tanks). They are scenery like the sofa — deliberately unlabeled and
  non-interactive so only the three REAL habitats + the locked wing read as
  actionable. Honesty rule holds: nothing implies content that doesn't exist.
- **Chips are in-world plaques now**: anchored just above their feature on a
  short soft stem (the v20 beam cords read as mockup callouts — deleted),
  dark wood-glass style, green-badge cream icons, green hover glow.
- **A painted background plate is the sanctioned upgrade path** (not a
  requirement): spec + integration seams documented in CLAUDE_HANDOFF so a
  future 16:9 no-UI plate can replace the CSS envelope 1:1 while every live
  layer (real tank plates, chips, spills, vignette) stays DOM.

## 2026-07-05 — Main Menu v21: a TRUE perspective room in CSS 3D (Option B; Three.js stays habitat-only)

**Context.** After v20.1 the user rejected the flat-wall composition outright
("still a flat CSS/DOM wall … I want a true 3D/isometric-looking Eco-Center
hub") and offered two implementation paths: a real Three.js hub scene
(Option A) or a layered-perspective rebuild (Option B).

**Decision.** Option B — the hub scene is a genuine one-point-perspective
room built with CSS 3D (`perspective` on `.scene`, `preserve-3d` planes for
floor/ceiling/walls, volumetric tank boxes, a deeper lake plane behind a real
doorway gap, pointer-driven perspective-origin parallax), composed to the
`Designs/Main_Menu/…12_25_29 AM.png` lodge-interior board.

**Why not Three.js here.**
- The hub is the BOOT screen: a Three.js hub front-loads a ~300 kB-gzip
  chunk before the player sees anything, and would require keeping a second
  DOM hub alive as the WebGL-failure fallback — two main menus to maintain.
- The project's architecture rule holds Three.js to the isolated habitat
  viewport; the hub staying DOM keeps "2.5D look, 2D implementation" true
  while CSS 3D applies the same projective math to planes (GPU-composited).
- Every interaction (7 hotspots, modal, panels, live photo pins, tooltips,
  focus) stays plain DOM — near-zero regression surface for the frozen
  HomeHub class API. Proven: 46/46 interaction drive, 0 console noise.

**Rules learned (bind future edits to this scene):**
1. **No placed plane may CROSS another plane.** Chromium's preserve-3d
   plane-splitting is nondeterministic for intersecting planes (the couch
   billboard crossing the floor rendered as a pale ghost on SOME loads).
   Near-camera props therefore live in a flat overlay ABOVE the 3D room
   (which also strengthens the parallax read); glows attach to the plane
   they light (wall washes / floor pools), never as crossing billboards.
2. **Decorative faces are `pointer-events: none`.** Chromium's 3D hit test
   can return a farther face for a point where a nearer face is visible;
   only art faces, cabinet fronts and chips take clicks.
3. Geometry is u-unit-relative (u = scene height / 100) and re-projected by
   `layoutRoom()` — never hard-code px in the room.
4. Painted per-plane art (floor/walls/props) is the sanctioned visual
   upgrade path; the 3D structure, live tank plates, photo pins and chips
   stay DOM.

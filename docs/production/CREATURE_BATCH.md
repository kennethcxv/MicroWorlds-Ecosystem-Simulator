# CREATURE BATCH v1 — the first 10 self-made animals

> The first self-made Tripo animal assets, incorporated as REAL in-game
> creatures on a data-driven foundation: one registry entry + one GLB per
> animal; shared loaders, part animators and movement controllers do the rest.
> Future animals are added mostly through data (see §7).

## 1. Asset files found (sources — never modified)

| Animal | Source GLB (3D_Assets/) | Parts | Verts | Faces layout |
|---|---|---|---|---|
| Feeder cricket | `Feeder_Cricket/cricket+3d+model.glb` | 10 | 63k | body, head, 3 leg pairs, cerci pair |
| Cherry shrimp | `Cherry_Shrimp/red+shrimp+3d+model.glb` | 14 | 67k | carapace, abdomen, tail fan, legs, antennae |
| Nerite snail | `Nerite_Snail/striped+snail+3d+model.glb` | 5 | 35k | shell, foot, head, 2 eyestalks |
| Neon tetra | `Neon_Tetra/neon+fish+3d+model.glb` | 13 | 35k | full fish anatomy incl. adipose fin + eyes |
| Guppy | `Guppy/guppy+fish+3d+model.glb` | 3 | 59k | front body, flowing tail half, dorsal |
| Zebra danio | `Zebra_Danio/striped+fish+3d+model.glb` | 8 | 58k | body, tail, dorsal, anal, 2 fin pairs |
| Otocinclus | `Otocinclus/small+fish+3d+model.glb` | 8 | 71k | body, tail, dorsal, anal, 2 fin pairs |
| Mystery snail | `Mystery_Snail/yellow+snail+3d+model.glb` | 3 | 70k | foot, shell, head |
| Daphnia | `Daphnia/rotifer+3d+model.glb` | 12 | 35k | body, oar antennae pair, appendage rows |
| Isopod | `Isopod/isopod+3d+model.glb` | 8 | 89k | plates, leg fringe, side rows, head, antennae, uropod |

All: quad topology, one embedded baseColor texture per part (up to 4096²),
metal 0 / rough 0.9, double-sided, no rigs, ~1 unit long, base at y=0.
Fish/cricket/shrimp/isopod/daphnia face **+Z**; both snails face **+X**.

**Runtime copies**: `public/assets/3d/creatures/<registry-id>.glb` — textures
capped at 1024² via `gltf-transform resize` (0.86–1.76 MB each, ~12.8 MB
total, loaded only with the code-split 3D chunk). Regenerate with the mapping
loop in the session log or one-off `npx gltf-transform resize --width 1024
--height 1024 <src> <dst>`.

**Inspection tool**: `tools/inspect-glb.mjs` — hierarchy/material/animation
report per GLB, `--table` (compact per-part bounds) and `--fixtures` (emits
`tests/fixtures/creatureParts.ts`, the REAL measured part bounds the
classifier tests run against). Re-run when an asset is regenerated.

## 2. Registry (data layer)

`src/data/creatures/CreatureTypes.ts` + `creatureRegistry.ts` — 10 complete
entries, pure serialisable data (JSON round-trip tested). Every entry carries:
identity (id/name/scientific/category/habitat/biome), rarity + unlock tier +
difficulty, UI + encyclopedia descriptions, asset config (path, real
bodyLength, forward axis, ground vs swimmer pivot, material tweaks, part-role
overrides), controllerType + movement tuning (speeds, zone bands, schooling
forces, burst/pause/dart chances…), animation profile (which oscillators +
amps), tight collision radius + bounds behaviour, diet/food/feeding, care +
ecosystem role, social type + minimum group size, activity pattern,
personality tags, natural habits, behaviour states, stress + comfort triggers,
compatible habitats, environment bands (°F, pH, hardness, flow, light,
humidity, ventilation), needs (hiding/plants/algae/biofilm/calcium/leaf
litter/stability/cleanliness…), breeding potential, the full 0-100 stat block
(23 stats, authored numbers), species special stats, flags, ecosystem effects
and spawn defaults. 7 aquatic species link `codexId` to the 2D sim codex.

Helpers: `creatureList / getCreature / aquariumCreatures / vivariumCreatures /
defaultAquariumPopulation / resolvePartRoles`.

Tiers: T1 cricket + tetra + guppy + danio + both snails · T2 shrimp + isopod +
daphnia · T3 otocinclus (mature-tank reward). Difficulty per design (oto
medium, daphnia experimental, rest easy/easy-medium).

## 3. Anatomy from geometry

`src/habitats/creatures/PartClassifier.ts` (pure, tested against the real
measured bounds of all 10 models): classifies `tripo_part_N` nodes into roles
— body/shell/foot, head, tail, tailFan, finTop/finBottom, finSideL/R,
legL/R/legs, antennaL/R, eyestalk, static — from bbox position/size/tris in a
forward-normalized frame (largest mass = body; shell creatures split the two
largest into shell above / foot below; tiny high parts = eyestalks; specks =
static; front centre-line = head; rear centre-line = tail; mirrored side pairs
= antennae/legs/fins by height + position; thin centre plates = dorsal/anal).
Species with unusual splits pin stragglers via 2–14-line `partOverrides` in
the registry (guppy's tail half, shrimp's full map, cricket's tall hind legs +
cerci, isopod's leg fringe + low antennae). The classifier stays the default
for future animals.

## 4. Loading + procedural part animation

`src/render/three/creatures/ThreeCreatureLoader.ts` — one download/parse per
species, cheap clones per instance (`loadCreature`, `preloadCreatures`, sync
seam `cloneCreatureSync`). Measures every part, resolves roles, then
**re-pivots each animated part at its anatomical joint** (tail hinges at its
front edge, legs at the hip, antennae at the base nearest the body, fins at
their body-side edge) so rotation reads as articulation. Normalizes the whole
model: faces +Z, scaled to the registry's real bodyLength, origin at belly
(ground creatures) or centre (swimmers), materials tamed (roughness/metalness/
opacity per registry). Part hierarchy is PRESERVED — nothing merged.

`ThreeCreatureAnimator.ts` — data-driven oscillators applied per role:
speed-scaled tail swimWag, paired fin flutter, dorsal/anal sway, leg scurry
(idle twitch when still), antenna sway, eyestalk sway, snail foot
stretch/compress, daphnia oar-stroke pulse (hop-synced), shrimp tail-fan
escape curl, head bob, body bob. Absolute-set each frame from captured base
transforms → parts can never drift or detach.

## 5. Movement controllers (shared, data-driven)

- **schoolFish** (tetra/guppy/danio): the fish-tank steering model (states,
  arrival, wall avoidance, banking) + boids-lite **FlockMath** (pure, tested)
  cohesion/alignment/separation with same-species mates; zone bands; danio
  burst sprints; guppy hover/display; feeding excite → upper-front dash.
- **surfaceGrazer** (oto): attaches belly-to-surface on glass/floor (suction
  pose), grazes with slow creep, detaches for short fish-like repositioning
  swims; startles off its pane.
- **shrimpCrawler** (cherry shrimp): substrate crawl between interest points
  (plants/wood), graze pauses with picking legs, backward escape flick with
  tail-fan curl.
- **snailGlider** (both snails): parametric floor+glass surface glide with
  pauses; nerite climbs glass often (60%), mystery mostly floors; eased
  orientation, eyestalk sway, foot stretch.
- **microSwarm** (daphnia): pulse-hop drift — antenna-stroke impulses,
  gravity sink between strokes, cluster pull, flee bursts from close fish;
  translucent material; cheapest possible per-unit update.
- **isopodCrawler** (isopod): shelter beside decor, short forage runs, flee
  to cover when the gecko looms (<0.22 m), **genuinely cleans** — foraging
  nibbles the vivarium dirt map (`cleanAt`, batched).
- **feederInsect** (cricket): the EXISTING tested prey sim (InsectBehavior:
  freeze/flee/wall-steer/tire/hop) — only the VISUAL was upgraded: the insect
  factory returns the real part-separated cricket GLB (legs kick in flee
  bursts, antennae sway, freeze = motionless) with the procedural model kept
  as fallback; the tongs/palm presentation shares it automatically. QA:
  `__lizard.cricketVisual()` → `"glb"`.

## 6. Where they live

- **3D aquarium** (`?habitat=fish`): `ThreeAquariumCreatures` layer spawns the
  registry default population (6 tetra school + 6 danio school + 3 guppies +
  3 otos + 3 shrimp + nerite + mystery + 10 daphnia = 33) alongside the
  original goldfish/betta. QA: `__aquarium.creatureCounts()/creaturePositions(id)`.
- **Gecko vivarium** (`?habitat=lizard`): real cricket GLB in every feeding;
  a 5-isopod bioactive colony living around the decor (hidden background
  life) that slowly erases light fouling — droppings still need the keeper.
  QA: `__lizard.isopods()/cricketVisual()`.
- **Creature Lab** (`?habitat=creatures`, DEV-ONLY, URL-gated, never
  persisted, not in the player habitat switch): specimen bench (all 10 at a
  common display size with name + real-size labels, idling), live water
  volume running the real aquarium layer, sand pad with crickets + isopod
  colony, and a self-contained side panel — live counts, spawn buttons
  (+1/+group per species) and a registry-driven codex card per species. QA:
  `__creatureLab.counts()/positions(id)/isopods()/spawn(id,n)/lineupCount()`.

## 7. Adding animal #11 (the point of all this)

1. Drop the Tripo GLB under `3D_Assets/<Animal>/` (source, never touched).
2. `npx gltf-transform resize --width 1024 --height 1024 <src>
   public/assets/3d/creatures/<id>.glb`.
3. `node tools/inspect-glb.mjs --table <src>` to read its part anatomy;
   append `--fixtures` output to the test fixtures if it should be
   classifier-tested.
4. Add ONE entry to `creatureRegistry.ts` (stats, needs, movement, animation
   profile, forward axis, bodyLength; `partOverrides` only where the
   classifier's roles need pinning).
5. Open `?habitat=creatures` — the Lab lists + spawns it automatically.
   Existing controllers cover swimmers, grazers, crawlers, gliders, swarms;
   only a genuinely new locomotion style needs controller code.

## 8. Verified (Playwright, live)

All 10 load with 0 console errors/warnings; every species moves; aquatics stay
inside the swim volume / vivarium crew stays on the substrate (programmatic
bounds sweeps); no part detachment (the body-pivot overwrite bug was caught on
the bench — danio pristine vs guppy/tetra torn — and fixed by offsetting from
captured base positions); materials/textures read (bench close-ups); cricket
feeding session runs on the GLB visual; gecko regression clean (bodyPen 0);
fish 3D + 2D aquarium + spider untouched. Gates: typecheck + build clean,
**357 tests** (registry validation 15, part classifier vs real fixtures 11,
flock math 6 — all TDD'd RED→GREEN). Screenshots:
`docs/production/screenshots/creatures/`.

## 9. Asset issues found + follow-ups

- **No semantic part names** (`tripo_part_N`) — solved by the spatial
  classifier + overrides; if Tripo ever exports named parts, the classifier
  becomes a fallback automatically.
- **Textures oversized for cm-scale animals** (4096² on a 2 cm snail) —
  runtime copies capped at 1024²; could drop to 512² if VRAM ever matters.
- **Draw calls**: each part is a draw call (~330 creature calls at full
  population) — fine today; if populations grow 10×, merge same-material
  parts per species or instance daphnia. Documented, not built (no
  overbuilding).
- **Guppy split is body/tail/dorsal only** (no separate pectorals) — wag +
  dorsal sway carry it; reads well.
- **No animal needs regeneration** — all 10 read correctly in the Lab.
- Future (not started): breeding/population dynamics for guppy + daphnia,
  gut-loading/dusting for crickets (data fields ready), fish eating daphnia
  (flee already works), shell-health simulation from water chemistry (stats
  ready), player-facing Add Species UI backed by the registry, 2D-sim
  ecosystem wiring via the `codexId` links.

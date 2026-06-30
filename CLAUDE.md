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

**Forbidden:** Unity, Unreal, Godot, Phaser, Pixi, Three.js, any 3D renderer or
external game engine. The visual style can read 2.5D; the implementation stays
2D.

Tooling deps (Node, not shipped to the game): `@fal-ai/client`, `dotenv` for the
asset scripts in `tools/`.

---

## 4. Current Milestone

- **Phase:** Phase 1 (Main Aquarium Screen) ✅ done + Phase 2 (Core Sim) ✅
  largely done; currently in a **Phase 3 "alive/gloss" polish pass**.
- **Current goal:** glossier glass + better creature animation (in progress →
  verifying), then formalize process docs, then continue the roadmap.
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
npm test             # vitest run — pure-sim + data tests (33 tests)
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
           (TODO: equipment.ts research.ts rescueCases.ts)
  render/  assetLoader.ts canvasRenderer.ts tankScene.ts layers.ts effects.ts fishDeformation.ts
           (TODO: particles.ts split-outs)
  ui/      controller.ts topBar.ts sidePanels.ts bottomActions.ts screens.ts
           layout.ts icons.ts   (TODO: cards.ts habitatEditor.ts)
  utils/   math.ts dom.ts        (TODO: color.ts)
tests/     rng.test.ts sim.test.ts save.test.ts codex.test.ts   (vitest)
tools/     generate-openai-asset.mjs  edit-asset-with-fal.mjs  remove-backgrounds.mjs
public/assets/  room/ tank/ hardscape/ plants/ creatures/   (27 integrated assets)
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

## Current Status — 2026-06-29

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

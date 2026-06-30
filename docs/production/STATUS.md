# STATUS — GLASSWATER

_Last updated: 2026-06-29_

## At a glance
- **Phase:** 1 ✅ + 2 ✅ done; **3 (alive/gloss polish) in progress**.
- **Build:** `npm run typecheck` clean · `npm run build` clean (28 modules,
  ~59 kB JS / ~19 kB CSS, builds in ~240 ms).
- **Runs:** Vite dev server; main aquarium screen renders interactively.
- **Repo:** not a git repository yet.

## Done
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

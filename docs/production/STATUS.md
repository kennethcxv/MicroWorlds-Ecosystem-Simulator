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

## In progress (Phase 3 polish — remaining)
- Schooling cohesion / bottom-dweller grazing & snail-crawl polish.
- Plant sway + day/night lighting grade pass.

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

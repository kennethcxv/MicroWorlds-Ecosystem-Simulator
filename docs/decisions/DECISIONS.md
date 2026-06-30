# DECISIONS — GLASSWATER

Architecture & direction decisions (ADR-lite). Newest first. Each: context →
decision → consequences.

---

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

# DECISIONS — GLASSWATER

Architecture & direction decisions (ADR-lite). Newest first. Each: context →
decision → consequences.

---

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

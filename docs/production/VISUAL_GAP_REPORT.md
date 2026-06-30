# VISUAL GAP REPORT — GLASSWATER

_Last updated: 2026-06-29 · Target:
`01_reference_screens/01_main_aquarium_management_target.png`_

Comparison of the live main aquarium screen against the reference mockup. Update
after each visual pass (with fresh Playwright screenshots).

## Legend
✅ matches · 🔄 close, actively improving · ⚠️ gap · ⏳ not built yet

| Area | Target | Status | Notes |
|------|--------|:--:|------|
| Cozy eco-center room backdrop | warm, soft, framed | ✅ | blurred + teal wash + vignette so the tank is the focal point |
| Wooden stand + name plate | tank sits on cabinet | ✅ | stand asset + procedural plaque |
| Physical glass tank shell | reads as real glass | ✅ | fully procedural front; photo overlay removed (it stamped a mismatched inner outline) |
| Glossy reflections / sheen | bright highlights | ✅ | additive sheen, drifting pane reflections, edge glints, wet rims — no double-outline artifact |
| Waterline highlight | crisp surface line | ✅ | animated surface line + brighter top water |
| Caustics / god-rays / bubbles | lively water | ✅ | god-ray intensity tracks daylight; caustics + bubbles + particles |
| Lush planted aquascape | dense, natural | ✅ | back-left/back-right tall clusters, hero centerpiece, low front plants |
| Driftwood / rocks | natural, not flat planks | ✅ | scaled driftwood + seiryu/boulders; avoid flat plank look |
| Detailed substrate | gravel bed | ✅ | substrate plate as ground bed |
| Visible animated fish | clearly visible, alive | ✅ | depth (front-back) swimming + body undulation + velocity pitch + turn easing |
| Bottom life (shrimp/snails) | grazing/crawling | ✅ | bottom-dweller agents present; grazing polish ongoing |
| Open swimming space | mid/upper open | ✅ | aquascape leaves open mid/upper volume |
| Dark-teal glassmorphism UI | premium panels | ✅ | top bar + side panels + actions + nav, glass styling |
| Top bar (coins/research/rep/time) | full HUD | ✅ | all chips present |
| Left stats panel | water chemistry | ✅ | quality/O2/temp/pH/NH3/NO2/NO3/cleanliness/score/warnings |
| Right population/equipment panel | counts + gear | ✅ | population, tank size, filtration, lighting, decor, plant cover |
| Bottom action bar | Feed/Clean/etc. | ✅ | Feed, Clean, Water Change, Decorate, Add Species, Info |
| Bottom nav | section switcher | 🔄 | nav present; several destinations are placeholder screens |

## Current top gaps (priority order)
1. ~~Glass glossiness~~ ✅ done (2026-06-29).
2. ~~Glass double-outline (photo overlay)~~ ✅ removed (2026-06-29) — see
   `screenshots/outline-before.png` vs `outline-after.png`.
3. ~~Fish liveliness~~ ✅ depth + undulation + pitch shipped (2026-06-29).
   Remaining polish: tighter schooling cohesion, bottom-dweller grazing, snail crawl.
4. **Decorate flow** — button exists; editor (Phase 4) not built.
5. **Secondary screens** — Shop/Collection/Research/Rescue/Breeding/Tasks are
   placeholders vs. their reference targets (Phases 5–8).

## Method
Use Playwright MCP: `browser_navigate` to the dev URL, `browser_take_screenshot`,
`browser_console_messages`. Save shots and diff against the reference in
`01_reference_screens/`. Record findings here with the date.

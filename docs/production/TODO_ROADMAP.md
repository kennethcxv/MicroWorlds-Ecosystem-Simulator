# TODO / ROADMAP — GLASSWATER

_Last updated: 2026-06-29_

Phase order follows the master prompt. Don't advance a phase until the prior one
meets its acceptance bar. **Do not scope-drift.**

## ▶ Now (Phase 3 — alive/gloss polish)
- [x] Glossier glass (procedural sheen + drifting reflections + brighter water +
      wet rims + overlay alpha bump + time-driven).
- [x] Better fish animation (eased turn/face, speed-scaled wiggle, feeding rise).
- [x] **Playwright-verify** gloss + animation; VISUAL_GAP_REPORT updated.
- [ ] Schooling cohesion / bottom-dweller grazing & snail-crawl polish.
- [ ] Plant sway, day/night lighting grade pass.

## Next (close out Phase 2 hygiene)
- [ ] Add a minimal test harness (node/vitest) for the **pure sim**: feeding,
      waste, ammonia, water change, stress/health, save/load round-trip,
      deterministic RNG. (Phase 2 acceptance criteria.)
- [ ] Add `src/core/economy.ts` + `events.ts` (currency, events) as the loop
      deepens.

## Phase 4 — Habitat / Decorate editor
- [ ] Wire the **Decorate** button to a 2.5D editor: item tray + categories,
      click/drag placement, ghost preview, valid/invalid states, depth layers,
      move/scale/flip/delete, save layout, live stat preview.
- [ ] Objects affect cover / beauty / oxygen / hiding spots / swimming space /
      bioload.

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
- [ ] Mine `04_docs/GLASSWATER_Fish_and_Aquatic_Species_Stats.docx` and
      `..._Land_Animals_Plants_Hardscape_Stats.docx` into `src/data/*` as the
      authoritative content source.

## Housekeeping
- [ ] `git init` for safe checkpoints (folder is not a repo yet).
- [ ] Split `render/` into `particles.ts` / `creatureAnimation.ts` as it grows.
- [ ] Run the code-review plugin before declaring a major milestone complete.

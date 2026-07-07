# GLASSWATER

A cozy **2.5D ecosystem & aquarium-management sim**, built as a browser game with
**Vite + TypeScript + Canvas/DOM** — no game engine, no framework.

This repo contains the first vertical slice: a polished, interactive **main Aquarium
screen** plus a navigable shell of secondary screens.

## Run it

```bash
npm install
npm run dev      # dev server at http://localhost:5173
```

Other scripts:

```bash
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
npm run typecheck
```

## What's here

- **Aquarium screen (fully built):** a physical glass tank on a wooden stand inside a
  warm eco-center room. Real-time underwater scene with schooling fish, a centrepiece
  gourami, bottom-dwelling shrimp/snails/corydoras, a planted aquascape with driftwood
  and rock, god rays, caustics, bubbles, drifting motes, and a procedural glass front.
  Live water-quality panel, population list, habitat info, habitat score, action buttons
  (Feed / Clean / Water Change work; Decorate / Add Species are placeholders), and a
  floating event log.
- **Eco-Center & Shop:** data-driven placeholder screens (room cards + species grid).
- **Research / Breeding / Rescue / Tasks:** "coming soon" stubs. **Journal:** live event log.
- **Simulation:** a deterministic, render-independent nitrogen-cycle model
  (ammonia → nitrite → nitrate, bacteria scaled by filtration + cleanliness, plants and
  water changes export waste, overfeeding/neglect raise warnings). Autosaves to `localStorage`.

## Architecture

```
src/
  main.ts            boot + asset preload
  app.ts             state, controller, main loop, autosave
  styles.css         dark-teal glassmorphism design system
  core/              sim.ts · state.ts · rng.ts · save.ts   (no Canvas/DOM)
  data/              species · plants · hardscape · tanks · water · assets
  render/            canvasRenderer · tankScene · effects · layers · assetLoader
  ui/                layout · topBar · sidePanels · bottomActions · screens · icons
  utils/             math · dom
public/assets/       room · tank · hardscape · plants · creatures  (art served at runtime)
```

**Rules:** the simulation never touches Canvas/DOM; the renderer reads state + data and
draws; the UI dispatches actions into the sim; all asset paths live in `data/assets.ts`.

Source art lives in `01_reference_screens/`, `02_tankview_assets/`, `03_species_refs/`.

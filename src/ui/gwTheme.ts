/**
 * GW DESIGN SYSTEM — the GLASSWATER game-UI look from Designs/Gecko/
 * (see docs/production/DESIGN_REFERENCE_MAP.md): dark rounded glass panels,
 * soft blur, green active glow, warm amber accents, big bottom action dock,
 * bottom drawers, premium cozy-game feel (NOT web-dashboard chrome).
 *
 * One injected stylesheet of reusable `.gw-*` classes shared by the gecko HUD,
 * the care drawers, the decorate tray, and the animal-info panel. Pure CSS-in-TS
 * (matches the app's injected-style pattern); no imports.
 */

let injected = false;

export function ensureGwStyles(): void {
  if (injected) return;
  injected = true;
  const css = `
  :root {
    --gw-bg: rgba(13, 14, 12, 0.86);
    --gw-bg-soft: rgba(16, 18, 15, 0.72);
    --gw-bg-raise: rgba(255, 255, 255, 0.045);
    --gw-border: rgba(255, 255, 255, 0.08);
    --gw-border-soft: rgba(255, 255, 255, 0.055);
    --gw-ink: #f2f4ec;
    --gw-ink-dim: #a9b1a2;
    --gw-ink-faint: #7c847733;
    --gw-green: #8ce25a;
    --gw-green-deep: #55b13a;
    --gw-green-soft: rgba(134, 222, 84, 0.14);
    --gw-green-line: rgba(140, 226, 90, 0.75);
    --gw-green-glow: 0 0 0 1.5px rgba(140,226,90,0.75), 0 0 22px rgba(140,226,90,0.28);
    --gw-amber: #f0b64b;
    --gw-amber-soft: rgba(240, 182, 75, 0.14);
    --gw-amber-line: rgba(240, 182, 75, 0.55);
    --gw-blue: #5db9f0;
    --gw-pink: #ef86a8;
    --gw-red: #ef7a5e;
    --gw-radius: 22px;
    --gw-radius-sm: 14px;
    --gw-blur: blur(18px);
    --gw-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
    --gw-font: "Segoe UI", system-ui, -apple-system, "Segoe UI Emoji", "Segoe UI Symbol", sans-serif;
  }

  /* While the gecko HUD owns the screen, the habitat view-switch moves to the
     top centre so it never collides with the action dock / drawers. */
  body.gw-lizard-ui .tank-mode-switch {
    bottom: auto !important;
    top: clamp(12px, 1.6vh, 22px);
    left: 50%;
    right: auto !important;
    transform: translateX(-50%);
  }
  /* Full-screen cinematics: nothing but the world and the bars. */
  body.gw-cinematic .tank-mode-switch { display: none !important; }

  /* ── Panels & cards ──────────────────────────────────────────────────── */
  .gw-panel { background: var(--gw-bg); border: 1px solid var(--gw-border);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    border-radius: var(--gw-radius); box-shadow: var(--gw-shadow); color: var(--gw-ink);
    font: 400 14px/1.4 var(--gw-font); }
  .gw-card { background: var(--gw-bg-raise); border: 1px solid var(--gw-border-soft);
    border-radius: var(--gw-radius-sm); color: var(--gw-ink); }
  .gw-muted { color: var(--gw-ink-dim); }
  .gw-section-title { font: 700 11px/1 var(--gw-font); letter-spacing: 1.4px;
    text-transform: uppercase; color: var(--gw-ink-dim); margin: 0 0 10px; }

  /* ── Top-left identity card ─────────────────────────────────────────── */
  .gw-top-card { position: absolute; top: clamp(14px, 2vh, 26px); left: clamp(14px, 1.6vw, 28px);
    width: max-content; min-width: 288px; max-width: 360px; padding: 12px 14px; pointer-events: auto; }
  .gw-top-card .gw-id-row { display: flex; gap: 12px; align-items: flex-start; }
  .gw-thumb { width: 64px; height: 64px; flex: 0 0 auto; border-radius: 12px; overflow: hidden;
    display: grid; place-items: center;
    background: radial-gradient(circle at 32% 28%, #5a4526, #241a10 78%);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.09); }
  .gw-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .gw-id-name { font: 700 20px/1.15 var(--gw-font); letter-spacing: 0.2px; display: flex; align-items: center; gap: 7px; }
  .gw-id-species { font: 600 13px/1.3 var(--gw-font); color: var(--gw-green); margin-top: 2px; }
  .gw-id-sci { font: italic 400 11.5px/1.3 var(--gw-font); color: var(--gw-ink-dim); margin-top: 1px; }
  .gw-tag-row { display: flex; gap: 7px; margin-top: 11px; flex-wrap: wrap; }
  .gw-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px;
    border-radius: 999px; background: rgba(255,255,255,0.055); border: 1px solid var(--gw-border-soft);
    font: 600 10.5px/1 var(--gw-font); color: var(--gw-ink); white-space: nowrap; }

  /* ── Top-right score card ───────────────────────────────────────────── */
  .gw-score-card { position: absolute; top: clamp(14px, 2vh, 26px); right: clamp(14px, 1.6vw, 28px);
    width: clamp(268px, 20vw, 306px); padding: 12px 14px 12px; pointer-events: auto; }
  .gw-score-head { display: flex; align-items: center; gap: 6px; font: 600 11.5px/1 var(--gw-font);
    color: var(--gw-ink-dim); }
  .gw-score-head .qi { width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--gw-ink-faint);
    display: grid; place-items: center; font-size: 8.5px; color: var(--gw-ink-dim); }
  .gw-score-main { display: flex; align-items: center; gap: 12px; margin-top: 3px; }
  .gw-score-num { font: 800 40px/1 var(--gw-font); color: var(--gw-green); letter-spacing: -1px; }
  .gw-score-rating { font: 700 15px/1 var(--gw-font); color: var(--gw-green); }
  .gw-score-ring { margin-left: auto; position: relative; width: 60px; height: 60px; flex: 0 0 auto; }
  .gw-score-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .gw-score-ring .track { stroke: rgba(255,255,255,0.1); }
  .gw-score-ring .fill { stroke: var(--gw-green); stroke-linecap: round;
    transition: stroke-dashoffset 0.5s ease; filter: drop-shadow(0 0 5px rgba(140,226,90,0.5)); }
  .gw-score-ring .mid { position: absolute; inset: 0; display: grid; place-items: center; font-size: 21px; }
  .gw-score-line { font: 500 12px/1.35 var(--gw-font); color: var(--gw-ink); margin-top: 6px; }

  /* Full-width dark row button ("View Detailed Stats ›"). */
  .gw-row-btn { appearance: none; cursor: pointer; width: 100%; margin-top: 10px;
    display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 11px;
    background: rgba(255,255,255,0.05); border: 1px solid var(--gw-border-soft);
    color: var(--gw-ink); font: 600 12px/1 var(--gw-font); transition: background 0.15s; }
  .gw-row-btn:hover { background: rgba(255,255,255,0.09); }
  .gw-row-btn .chev { margin-left: auto; color: var(--gw-ink-dim); font-size: 13px; }

  /* ── Bottom stat strip ──────────────────────────────────────────────── */
  .gw-stat-strip { position: absolute; left: 50%; transform: translateX(-50%);
    bottom: clamp(104px, 13.6vh, 128px); display: flex; align-items: stretch;
    padding: 10px 5px; border-radius: 18px; pointer-events: auto;
    background: var(--gw-bg-soft); border: 1px solid var(--gw-border-soft);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    box-shadow: 0 14px 40px rgba(0,0,0,0.45); max-width: min(96vw, 1320px); }
  .gw-stat-item { flex: 1 1 0; min-width: 118px; padding: 4px 14px; display: flex; flex-direction: column; gap: 5px; }
  .gw-stat-item + .gw-stat-item { border-left: 1px solid rgba(255,255,255,0.06); }
  .gw-stat-item .top { display: flex; align-items: center; gap: 7px; font: 600 12.5px/1 var(--gw-font); white-space: nowrap; }
  .gw-stat-item .gw-bar { height: 5px; }
  .gw-stat-item .foot { display: flex; align-items: baseline; justify-content: space-between;
    font: 600 11.5px/1 var(--gw-font); color: var(--gw-ink-dim); white-space: nowrap; gap: 8px; }
  .gw-stat-item .foot .st { color: #dfe4da; }
  .gw-stat-item .foot .st.warn { color: var(--gw-amber); }
  .gw-stat-item .foot .st.bad { color: var(--gw-red); }

  /* Slim progress bar. */
  .gw-bar { height: 5px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
  .gw-bar > i { display: block; height: 100%; width: 0%; border-radius: 999px;
    background: var(--gw-green); transition: width 0.35s ease; }
  .gw-bar.blue > i { background: var(--gw-blue); }
  .gw-bar.pink > i { background: var(--gw-pink); }
  .gw-bar.amber > i { background: linear-gradient(90deg, var(--gw-red), var(--gw-amber)); }

  /* ── Bottom action dock ─────────────────────────────────────────────── */
  .gw-dock-wrap { position: absolute; left: 50%; transform: translateX(-50%);
    bottom: clamp(14px, 2.4vh, 26px); display: flex; align-items: center; gap: 14px; pointer-events: none; }
  .gw-action-dock { display: flex; gap: 10px; padding: 11px; border-radius: 26px; pointer-events: auto;
    background: var(--gw-bg-soft); border: 1px solid var(--gw-border-soft);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    box-shadow: 0 16px 46px rgba(0,0,0,0.5); }
  .gw-action-card { appearance: none; cursor: pointer; position: relative;
    display: flex; align-items: center; gap: 12px; text-align: left;
    min-width: 170px; padding: 12px 19px 12px 15px; border-radius: 17px;
    background: rgba(255,255,255,0.035); border: 1.5px solid transparent;
    color: var(--gw-ink); font-family: var(--gw-font); transition: background 0.15s, border-color 0.15s, box-shadow 0.15s; }
  .gw-action-card:hover { background: rgba(255,255,255,0.08); }
  .gw-action-card .ic { width: 32px; height: 32px; display: grid; place-items: center; flex: 0 0 auto; }
  .gw-action-card .lbl { font: 700 15px/1.15 var(--gw-font); }
  .gw-action-card .sub { font: 500 11.5px/1.2 var(--gw-font); color: var(--gw-ink-dim); margin-top: 3px; white-space: nowrap; }
  .gw-action-card .dot { position: absolute; top: 10px; right: 11px; width: 7px; height: 7px;
    border-radius: 50%; background: var(--gw-green); box-shadow: 0 0 6px rgba(140,226,90,0.8); display: none; }
  .gw-action-card.has-dot .dot { display: block; }
  .gw-action-card.gw-active { border-color: var(--gw-green-line);
    background: var(--gw-green-soft); box-shadow: 0 0 22px rgba(140,226,90,0.22); }
  .gw-action-card.gw-active .lbl { color: var(--gw-green); }

  /* Round icon buttons flanking the dock / at screen corners. */
  .gw-icon-button { appearance: none; cursor: pointer; width: 50px; height: 50px; border-radius: 50%;
    display: grid; place-items: center; font-size: 20px; color: var(--gw-ink); pointer-events: auto;
    background: var(--gw-bg-soft); border: 1px solid var(--gw-border-soft);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    box-shadow: 0 10px 28px rgba(0,0,0,0.45); transition: background 0.15s, box-shadow 0.15s, border-color 0.15s; }
  .gw-icon-button:hover { background: rgba(255,255,255,0.1); }
  .gw-icon-button.gw-active { border-color: var(--gw-green-line); box-shadow: var(--gw-green-glow); color: var(--gw-green); }
  .gw-icon-button.square { border-radius: 14px; }

  /* ── Slim bottom nav (drawer modes) ─────────────────────────────────── */
  .gw-mode-tabs { position: absolute; left: 50%; transform: translateX(-50%);
    bottom: clamp(12px, 2vh, 22px); display: flex; gap: 6px; padding: 7px 10px; border-radius: 999px;
    pointer-events: auto; background: var(--gw-bg-soft); border: 1px solid var(--gw-border-soft);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    box-shadow: 0 12px 34px rgba(0,0,0,0.5); }
  .gw-mode-tab { appearance: none; cursor: pointer; display: flex; align-items: center; gap: 8px;
    padding: 9px 17px; border-radius: 999px; background: transparent; border: none; position: relative;
    color: var(--gw-ink-dim); font: 600 13px/1 var(--gw-font); transition: color 0.15s, background 0.15s; }
  .gw-mode-tab:hover { color: var(--gw-ink); background: rgba(255,255,255,0.05); }
  .gw-mode-tab .ic { font-size: 15px; }
  .gw-mode-tab.gw-active { color: var(--gw-green); }
  .gw-mode-tab.gw-active::after { content: ""; position: absolute; left: 18px; right: 18px; bottom: 2px;
    height: 2.5px; border-radius: 2px; background: var(--gw-green); box-shadow: 0 0 8px rgba(140,226,90,0.7); }

  /* ── Bottom drawers (Clean / Feed / Terrain / Decorate) ─────────────── */
  .gw-bottom-drawer { position: absolute; left: 50%; transform: translateX(-50%);
    bottom: clamp(70px, 9.5vh, 92px); width: min(1240px, 96vw); pointer-events: auto;
    padding: 15px 18px 15px; border-radius: var(--gw-radius);
    background: var(--gw-bg); border: 1px solid var(--gw-border);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    box-shadow: var(--gw-shadow); color: var(--gw-ink); font-family: var(--gw-font); }
  .gw-drawer-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
  .gw-drawer-title { font: 800 16px/1 var(--gw-font); letter-spacing: 0.2px; display: flex; align-items: center; gap: 9px; }
  .gw-drawer-sub { font: 500 12px/1 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-drawer-head .spacer { flex: 1; }

  /* Tool cards (Cleaning tools / terrain tools). */
  .gw-tool-row { display: flex; gap: 10px; align-items: stretch; }
  .gw-tool-card { appearance: none; cursor: pointer; position: relative; flex: 1 1 0; text-align: left;
    padding: 12px 13px 11px; border-radius: 15px; background: rgba(255,255,255,0.04);
    border: 1.5px solid var(--gw-border-soft); color: var(--gw-ink); font-family: var(--gw-font);
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s; min-width: 0; }
  .gw-tool-card:hover { background: rgba(255,255,255,0.08); }
  .gw-tool-card .trow { display: flex; align-items: center; gap: 9px; }
  .gw-tool-card .ic { font-size: 21px; flex: 0 0 auto; }
  .gw-tool-card .nm { font: 700 13.5px/1.15 var(--gw-font); }
  .gw-tool-card .ds { font: 500 11px/1.35 var(--gw-font); color: var(--gw-ink-dim); margin-top: 5px; }
  .gw-tool-card .check { position: absolute; top: 9px; right: 10px; width: 19px; height: 19px; border-radius: 50%;
    display: none; place-items: center; background: var(--gw-green); color: #10240b; font: 800 11px/1 var(--gw-font); }
  .gw-tool-card.gw-active { border-color: var(--gw-green-line); background: var(--gw-green-soft);
    box-shadow: 0 0 18px rgba(140,226,90,0.18); }
  .gw-tool-card.gw-active .check { display: grid; }
  .gw-tool-card:disabled { opacity: 0.55; cursor: default; }
  .gw-tool-card:disabled:hover { background: rgba(255,255,255,0.04); }

  /* Status badges on cards / rows. */
  .gw-badge { display: inline-flex; align-items: center; gap: 5px; margin-top: 9px; padding: 5px 10px;
    border-radius: 999px; font: 700 10.5px/1 var(--gw-font); }
  .gw-badge.green { background: var(--gw-green-soft); border: 1px solid rgba(140,226,90,0.4); color: var(--gw-green); }
  .gw-badge.amber { background: var(--gw-amber-soft); border: 1px solid var(--gw-amber-line); color: var(--gw-amber); }
  .gw-badge.dim { background: rgba(255,255,255,0.05); border: 1px solid var(--gw-border-soft); color: var(--gw-ink-dim); }

  /* Item cards (food / catalog / materials). */
  .gw-item-card { appearance: none; cursor: pointer; position: relative; text-align: center;
    border-radius: 15px; background: rgba(255,255,255,0.04); border: 1.5px solid var(--gw-border-soft);
    color: var(--gw-ink); font-family: var(--gw-font); padding: 0 0 9px; overflow: hidden;
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, transform 0.12s; }
  .gw-item-card:hover { background: rgba(255,255,255,0.08); transform: translateY(-1px); }
  .gw-item-card .art { width: 100%; aspect-ratio: 1.25; display: grid; place-items: center; font-size: 38px;
    background: radial-gradient(circle at 40% 30%, #3a3226, #17140e 80%); position: relative; }
  .gw-item-card .art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .gw-item-card .nm { display: block; font: 700 12.5px/1.15 var(--gw-font); margin-top: 8px; padding: 0 8px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gw-item-card .ds { display: block; font: 500 10.5px/1.25 var(--gw-font); color: var(--gw-ink-dim); margin-top: 3px; padding: 0 8px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gw-item-card .check { position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border-radius: 50%;
    display: none; place-items: center; background: var(--gw-green); color: #10240b; font: 800 12px/1 var(--gw-font);
    box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
  .gw-item-card.gw-active { border-color: var(--gw-green-line); box-shadow: 0 0 18px rgba(140,226,90,0.22); }
  .gw-item-card.gw-active .check { display: grid; }
  .gw-item-card:disabled { opacity: 0.5; cursor: default; }

  /* ── Terrain Mode (reference: tab pills riding the drawer's top edge, a
       compact floating sculpt-tool palette, photo material tiles + info strip,
       slider pills and a round reset) ──────────────────────────────────── */
  /* Blocky, CONNECTED tab bar riding the drawer's top edge (reference): wide
     squared segments joined into one block, the active one merging seamlessly
     into the drawer body with a green top rule. */
  .gw-drawer-tabs { position: absolute; bottom: 100%; left: 20px; display: flex; gap: 0; margin-bottom: -1px; }
  .gw-drawer-tab { appearance: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
    gap: 10px; min-width: 164px; padding: 14px 28px 15px; border-radius: 0; border: 1px solid var(--gw-border);
    border-bottom: none; background: rgba(10, 11, 9, 0.8); color: var(--gw-ink-dim);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    font: 700 13.5px/1 var(--gw-font); transition: color 0.15s, background 0.15s; }
  .gw-drawer-tab:first-child { border-radius: 13px 0 0 0; }
  .gw-drawer-tab:last-child { border-radius: 0 13px 0 0; }
  .gw-drawer-tab + .gw-drawer-tab { border-left: none; }
  .gw-drawer-tab .ic { width: 17px; height: 17px; display: grid; place-items: center; }
  .gw-drawer-tab:hover { color: var(--gw-ink); background: rgba(22, 24, 20, 0.85); }
  .gw-drawer-tab.gw-active { color: var(--gw-green); background: var(--gw-bg);
    box-shadow: inset 0 3px 0 var(--gw-green-line), inset 0 16px 24px -16px rgba(140,226,90,0.4); }

  /* The TERRAIN EDITOR drawer: one grouped, blocky panel that is WIDER and
     runs FLUSH to the bottom of the screen (reference pair in Designs/Gecko —
     no floating gap, no slim nav beneath; the tabs + ✕ own the mode). */
  .gw-bottom-drawer.gw-editor { bottom: 0; width: min(1560px, 98vw);
    border-radius: var(--gw-radius) var(--gw-radius) 0 0; border-bottom: none;
    padding: 16px 22px calc(14px + env(safe-area-inset-bottom, 0px)); }

  .gw-terrain-grid { display: flex; gap: 15px; align-items: stretch; }
  .gw-tool-palette { flex: 0 0 auto; display: grid; grid-template-columns: repeat(2, clamp(108px, 9vw, 132px));
    gap: 7px; align-content: start; padding: 9px; border-radius: 15px;
    background: rgba(0,0,0,0.26); border: 1px solid var(--gw-border-soft); }
  .gw-tool-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  .gw-tool-mini { appearance: none; cursor: pointer; position: relative; display: flex; align-items: center;
    gap: 9px; padding: 11px 12px; border-radius: 11px; text-align: left;
    background: rgba(255,255,255,0.045); border: 1.5px solid var(--gw-border-soft);
    color: var(--gw-ink); font: 700 12px/1 var(--gw-font);
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, color 0.15s; }
  .gw-tool-mini .ic { width: 19px; height: 19px; display: grid; place-items: center; color: var(--gw-ink-dim);
    flex: 0 0 auto; transition: color 0.15s; }
  .gw-tool-mini:hover { background: rgba(255,255,255,0.1); }
  .gw-tool-mini.gw-active { background: linear-gradient(180deg, #6ecb46, #4da335); border-color: rgba(255,255,255,0.22);
    color: #ffffff; box-shadow: 0 5px 16px rgba(90,190,60,0.4), inset 0 1px 0 rgba(255,255,255,0.25); }
  .gw-tool-mini.gw-active .ic { color: #ffffff; }
  .gw-tool-mini.half { padding: 8px 6px; gap: 5px; font-size: 10.5px; justify-content: center; }

  /* The tool-context card (non-paint tools): what the brush does + live terrain
     readouts + a husbandry tip, in the space the materials occupy while painting. */
  .gw-tool-context { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px;
    padding: 10px 13px; border-radius: 14px;
    background: rgba(255,255,255,0.035); border: 1px solid var(--gw-border-soft); }
  .gw-tool-context .row { display: flex; align-items: center; gap: 13px; min-width: 0; }
  .gw-tool-context .big { width: 42px; height: 42px; flex: 0 0 auto; border-radius: 12px;
    display: grid; place-items: center; background: rgba(0,0,0,0.3); border: 1px solid var(--gw-border-soft); }
  .gw-tool-context .big .ic { width: 23px; height: 23px; display: grid; place-items: center; }
  .gw-tool-context .tx { min-width: 0; max-width: 400px; }
  .gw-tool-context .tx .nm { font: 700 13px/1.15 var(--gw-font); }
  .gw-tool-context .tx .ds { font: 500 10.5px/1.35 var(--gw-font); color: var(--gw-ink-dim); margin-top: 3px; }
  .gw-tool-context .chips { display: flex; gap: 8px; margin-left: auto; flex: 0 0 auto; }
  .gw-tool-context .chip { min-width: 76px; padding: 6px 10px; border-radius: 10px; text-align: center;
    background: rgba(0,0,0,0.28); border: 1px solid var(--gw-border-soft); }
  .gw-tool-context .chip .k { display: block; font: 700 8.5px/1 var(--gw-font); letter-spacing: 0.9px;
    text-transform: uppercase; color: var(--gw-ink-dim); }
  .gw-tool-context .chip .v { display: block; font: 800 13px/1 var(--gw-font); margin-top: 4px;
    font-variant-numeric: tabular-nums; }
  .gw-tool-context .profile { position: relative; border-radius: 10px; overflow: hidden;
    background: rgba(0,0,0,0.26); border: 1px solid var(--gw-border-soft); height: 64px; }
  .gw-tool-context .brushline { display: flex; align-items: center; gap: 14px; padding: 7px 10px;
    border-radius: 10px; background: rgba(0,0,0,0.22); border: 1px solid var(--gw-border-soft);
    font: 600 10.5px/1 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-tool-context .brushline b { color: var(--gw-ink); font-weight: 800; font-variant-numeric: tabular-nums; }
  .gw-tool-context .brushline .sep { width: 1px; height: 12px; background: rgba(255,255,255,0.12); }
  .gw-tool-context .profile canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .gw-tool-context .profile .lbl { position: absolute; top: 4px; left: 8px; font: 700 8px/1 var(--gw-font);
    letter-spacing: 1px; text-transform: uppercase; color: var(--gw-ink-dim); }
  .gw-tool-context .tip { display: flex; align-items: flex-start; gap: 7px; padding: 7px 10px;
    border-radius: 10px; background: rgba(240,182,75,0.08); border: 1px solid rgba(240,182,75,0.28);
    font: 500 10.5px/1.4 var(--gw-font); color: var(--gw-ink); }
  .gw-tool-context .tip .ic { width: 12px; height: 12px; display: grid; place-items: center;
    color: var(--gw-amber); flex: 0 0 auto; margin-top: 1px; }

  /* Material tiles: the card chrome wraps photo + label, states on the CARD
     border, ✓ on the photo corner, lock chip for future substrates. */
  .gw-mat-row { display: flex; gap: 9px; align-items: flex-start; flex-wrap: nowrap; overflow-x: auto;
    padding-bottom: 3px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.22) transparent; }
  .gw-mat-tile { appearance: none; cursor: pointer; padding: 4px 4px 5px;
    width: clamp(80px, 6.4vw, 96px); flex: 0 0 auto; color: var(--gw-ink); font-family: var(--gw-font); text-align: center;
    background: rgba(0,0,0,0.24); border: 2px solid var(--gw-border-soft); border-radius: 13px;
    box-shadow: 0 5px 14px rgba(0,0,0,0.35);
    transition: border-color 0.15s, box-shadow 0.15s, transform 0.13s, background 0.15s; }
  .gw-mat-tile:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.22); }
  .gw-mat-tile .ph { position: relative; display: block; width: 100%; aspect-ratio: 1; border-radius: 9px;
    overflow: hidden; box-shadow: inset 0 0 12px rgba(0,0,0,0.25); }
  .gw-mat-tile .ph img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .gw-mat-tile .nm { display: block; font: 700 10px/1.2 var(--gw-font); margin-top: 5px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gw-mat-tile .sub { display: block; font: 600 8.5px/1.2 var(--gw-font); color: var(--gw-ink-dim); margin-top: 1px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 9px; }
  .gw-mat-tile .check { position: absolute; right: 4px; bottom: 4px; width: 18px; height: 18px; border-radius: 50%;
    display: none; place-items: center; background: var(--gw-green); color: #10240b; font: 800 10.5px/1 var(--gw-font);
    box-shadow: 0 2px 8px rgba(0,0,0,0.5); }
  .gw-mat-tile .lk { position: absolute; right: 4px; top: 4px; width: 19px; height: 19px; border-radius: 7px;
    display: grid; place-items: center; background: rgba(10,11,9,0.62); border: 1px solid rgba(255,255,255,0.14);
    color: #ddd6bd; }
  .gw-mat-tile .lk .ic { width: 11px; height: 11px; display: grid; place-items: center; }
  .gw-mat-tile.gw-applied { border-color: var(--gw-green-line); box-shadow: 0 0 18px rgba(140,226,90,0.28), 0 5px 14px rgba(0,0,0,0.35); }
  .gw-mat-tile.gw-applied .check { display: grid; }
  .gw-mat-tile.gw-applied .nm { color: var(--gw-green); }
  .gw-mat-tile.gw-armed { border-color: var(--gw-amber-line); box-shadow: 0 0 16px rgba(240,182,75,0.28), 0 5px 14px rgba(0,0,0,0.35); }
  .gw-mat-tile.gw-armed .nm { color: var(--gw-amber); }
  .gw-mat-tile.gw-locked .ph { filter: saturate(0.5) brightness(0.62); }
  .gw-mat-tile.gw-locked .nm { color: var(--gw-ink-dim); }

  .gw-mat-info { display: flex; align-items: center; gap: 12px; padding: 6px 11px; border-radius: 12px;
    background: rgba(255,255,255,0.035); border: 1px solid var(--gw-border-soft); min-height: 46px; }
  .gw-mat-info .sw { display: block; width: 32px; height: 32px; flex: 0 0 auto; border-radius: 8px; overflow: hidden;
    border: 1.5px solid rgba(255,255,255,0.12); box-shadow: 0 3px 9px rgba(0,0,0,0.4); }
  .gw-mat-info .sw img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .gw-mat-info .tx { min-width: 0; max-width: 350px; }
  .gw-mat-info .tx .nm { font: 700 12px/1.15 var(--gw-font); display: flex; align-items: center; gap: 7px; white-space: nowrap; }
  .gw-mat-info .tx .ds { font: 500 10px/1.3 var(--gw-font); color: var(--gw-ink-dim); margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gw-mat-info .tags { display: flex; gap: 4px; flex: 0 0 auto; }
  .gw-mat-info .tags .gw-pill { padding: 3px 7px; font-size: 8.5px; text-transform: capitalize; }
  .gw-mat-info .meters { display: grid; grid-template-columns: repeat(5, 52px); gap: 8px; margin-left: auto; }
  .gw-mat-meter { display: flex; flex-direction: column; gap: 3px; }
  .gw-mat-meter .k { font: 700 8px/1 var(--gw-font); letter-spacing: 0.8px; text-transform: uppercase;
    color: var(--gw-ink-dim); white-space: nowrap; }
  .gw-mat-meter .gw-bar { height: 4px; }
  .gw-mat-info .cta { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }

  .gw-slider.pill { padding: 8px 14px; border-radius: 999px; background: rgba(0,0,0,0.24);
    border: 1px solid var(--gw-border-soft); }
  .gw-slider .lbl .ic { width: 16px; height: 16px; display: grid; place-items: center; color: var(--gw-green); }
  .gw-icon-button.sm { width: 40px; height: 40px; font-size: 15px; box-shadow: 0 6px 16px rgba(0,0,0,0.4); }

  /* Brush Mode selector chip (reference: ⚡ Brush Mode · Strong ›). */
  .gw-mode-chip { appearance: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 13px; border-radius: 999px; background: rgba(0,0,0,0.24); border: 1px solid var(--gw-border-soft);
    color: var(--gw-ink); font: 700 12px/1 var(--gw-font); transition: background 0.15s, border-color 0.15s; }
  .gw-mode-chip:hover { background: rgba(255,255,255,0.07); }
  .gw-mode-chip .ic { width: 15px; height: 15px; display: grid; place-items: center; color: var(--gw-amber); }
  .gw-mode-chip .lb { color: var(--gw-ink-dim); font-weight: 600; }
  .gw-mode-chip .vl { color: var(--gw-green); min-width: 48px; text-align: left; }
  .gw-mode-chip .car { color: var(--gw-ink-dim); font-size: 11px; }
  .gw-mode-chip.strong .vl { color: var(--gw-amber); }

  /* ── Filters tab (analysis lenses over the habitat) ─────────────────── */
  .gw-filter-grid { display: flex; gap: 14px; align-items: stretch; }
  .gw-filter-list { flex: 0 0 auto; display: grid; grid-template-columns: repeat(2, clamp(112px, 9vw, 134px));
    grid-auto-rows: min-content; gap: 7px; align-self: stretch; align-content: start; }
  .gw-filter-list .gw-section-title { grid-column: 1 / -1; }
  .gw-filter-row { appearance: none; cursor: pointer; display: flex; align-items: center; gap: 8px;
    padding: 10px 12px; border-radius: 10px; text-align: left;
    background: rgba(255,255,255,0.045); border: 1.5px solid var(--gw-border-soft);
    color: var(--gw-ink); font: 700 12px/1 var(--gw-font); white-space: nowrap; overflow: hidden;
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, color 0.15s; }
  .gw-filter-row .ic { width: 15px; height: 15px; display: grid; place-items: center; flex: 0 0 auto; }
  .gw-filter-row:hover { background: rgba(255,255,255,0.1); }
  .gw-filter-row.gw-active { border-color: var(--gw-green-line); background: var(--gw-green-soft);
    color: var(--gw-green); box-shadow: 0 0 14px rgba(140,226,90,0.2); }

  .gw-filter-main { flex: 1.1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
  .gw-filter-title { display: flex; align-items: center; gap: 8px; font: 800 14px/1 var(--gw-font);
    letter-spacing: 1.5px; text-transform: uppercase; }
  .gw-filter-title .ic { width: 17px; height: 17px; display: grid; place-items: center; }
  .gw-filter-desc { font: 500 11px/1.35 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-fcard { min-width: 0; padding: 8px 11px; border-radius: 12px;
    background: rgba(255,255,255,0.04); border: 1px solid var(--gw-border-soft); }
  .gw-fcard.hero { display: flex; flex-direction: column; gap: 5px; }
  .gw-fcard .cap { font: 700 9.5px/1 var(--gw-font); letter-spacing: 1px; text-transform: uppercase;
    color: var(--gw-ink-dim); }
  .gw-fcard .scorerow { display: flex; align-items: center; gap: 9px; }
  .gw-fcard .scorerow .ringwrap { margin-left: auto; }
  .gw-fcard .scorerow .ringwrap .gw-score-ring { width: 44px; height: 44px; }
  .gw-fcard .scorerow .ringwrap .mid { font-size: 13px; }
  .gw-fcard .num { font: 800 27px/1 var(--gw-font); color: var(--gw-green); letter-spacing: -0.5px; }
  .gw-fcard .num.warn { color: var(--gw-amber); }
  .gw-fcard .num.bad { color: var(--gw-red); }
  .gw-fcard .st { font: 700 13px/1 var(--gw-font); color: var(--gw-green); }
  .gw-fcard .st.warn { color: var(--gw-amber); }
  .gw-fcard .st.bad { color: var(--gw-red); }
  .gw-fcard .rec { font: 600 10.5px/1.3 var(--gw-font); color: var(--gw-ink-dim); margin-top: 8px; }
  .gw-fcard .gw-bar { margin-top: 8px; }
  .gw-fcard .info { display: flex; gap: 8px; font: 500 12px/1.45 var(--gw-font); color: var(--gw-ink); }
  .gw-fcard .info .ic { width: 16px; height: 16px; flex: 0 0 auto; margin-top: 1px; color: var(--gw-green); }

  .gw-filter-map { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 6px; }
  .gw-legend-bar { height: 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.14);
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.4); }
  .gw-legend-caps { display: flex; justify-content: space-between; font: 600 9.5px/1 var(--gw-font);
    color: var(--gw-ink-dim); padding: 0 2px; }
  .gw-filter-minimap { position: relative; flex: 1; min-height: 108px; border-radius: 13px; overflow: hidden;
    border: 1px solid var(--gw-border); background: #221a10; box-shadow: inset 0 0 22px rgba(0,0,0,0.5); }
  .gw-filter-minimap canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

  .gw-filter-about { width: 232px; flex: 0 0 auto; display: flex; flex-direction: column; gap: 7px;
    padding: 9px 12px; border-radius: 13px; background: rgba(255,255,255,0.035);
    border: 1px solid var(--gw-border-soft); }
  .gw-filter-about .cap { font: 700 9.5px/1 var(--gw-font); letter-spacing: 1.2px; text-transform: uppercase;
    color: var(--gw-ink-dim); }
  .gw-filter-about p { margin: 0; font: 500 10.5px/1.4 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-filter-about p:first-of-type { color: var(--gw-ink); }
  .gw-tips { margin-top: 1px; padding: 8px 10px; border-radius: 10px; background: rgba(240,182,75,0.08);
    border: 1px solid rgba(240,182,75,0.3); }
  .gw-tips .cap { display: flex; align-items: center; gap: 6px; font: 700 9.5px/1 var(--gw-font);
    letter-spacing: 1.2px; text-transform: uppercase; color: var(--gw-amber); }
  .gw-tips .tx { font: 500 10.5px/1.4 var(--gw-font); color: var(--gw-ink); margin-top: 5px; }

  /* Tight drawer variant (the Terrain editor). */
  .gw-bottom-drawer.gw-tight { padding: 12px 15px; }

  .gw-reset-pill { appearance: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 16px; border-radius: 999px; background: rgba(255,255,255,0.05);
    border: 1px solid var(--gw-border-soft); color: var(--gw-ink); font: 700 12px/1 var(--gw-font);
    transition: background 0.15s; }
  .gw-reset-pill:hover { background: rgba(255,255,255,0.1); }
  .gw-reset-pill .ic { width: 15px; height: 15px; display: grid; place-items: center; color: var(--gw-ink-dim); }

  /* ── Buttons ────────────────────────────────────────────────────────── */
  .gw-primary-button { appearance: none; cursor: pointer; border: none; border-radius: 15px;
    padding: 13px 26px; background: linear-gradient(180deg, #6ecb46, #4da335);
    color: #ffffff; font: 800 14.5px/1.1 var(--gw-font); letter-spacing: 0.2px;
    box-shadow: 0 8px 24px rgba(90,190,60,0.35), inset 0 1px 0 rgba(255,255,255,0.25);
    transition: filter 0.15s, transform 0.12s; }
  .gw-primary-button:hover { filter: brightness(1.08); }
  .gw-primary-button:active { transform: translateY(1px); }
  .gw-primary-button:disabled { filter: saturate(0.25) brightness(0.7); cursor: default; }
  .gw-primary-button .subtx { display: block; font: 600 10.5px/1 var(--gw-font); opacity: 0.85; margin-top: 4px; }
  .gw-ghost-button { appearance: none; cursor: pointer; border-radius: 13px; padding: 11px 18px;
    background: rgba(255,255,255,0.05); border: 1px solid var(--gw-border-soft);
    color: var(--gw-ink); font: 700 12.5px/1 var(--gw-font); transition: background 0.15s; }
  .gw-ghost-button:hover { background: rgba(255,255,255,0.1); }
  .gw-danger-button { appearance: none; cursor: pointer; border-radius: 13px; padding: 11px 18px;
    background: rgba(226,105,78,0.14); border: 1px solid rgba(226,105,78,0.5);
    color: #ffb9a6; font: 700 12.5px/1 var(--gw-font); transition: filter 0.15s; }
  .gw-danger-button:hover { filter: brightness(1.15); }

  /* ── The universal back pill (top-left of every full-screen door) ────── */
  .gw-backpill { appearance: none; cursor: pointer; display: inline-flex; align-items: center; gap: 10px;
    padding: 8px 17px 8px 9px; border-radius: 999px; flex: 0 0 auto; align-self: center;
    background: rgba(13,16,14,0.72); border: 1.5px solid var(--gw-border-soft);
    color: var(--gw-ink); font: 700 12.5px/1 var(--gw-font); letter-spacing: 0.2px; white-space: nowrap;
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    box-shadow: 0 8px 22px rgba(0,0,0,0.35);
    transition: border-color 0.16s, background 0.16s, transform 0.14s, box-shadow 0.16s; }
  .gw-backpill .bp-ic { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
    background: rgba(140,226,90,0.12); border: 1px solid rgba(140,226,90,0.32); color: var(--gw-green);
    font: 800 16px/1 var(--gw-font); padding-bottom: 2px; transition: transform 0.16s; }
  .gw-backpill:hover { border-color: var(--gw-green-line); background: rgba(20,26,20,0.85);
    box-shadow: 0 10px 26px rgba(0,0,0,0.42), 0 0 18px rgba(140,226,90,0.14); }
  .gw-backpill:hover .bp-ic { transform: translateX(-2px); }
  .gw-backpill:active { transform: scale(0.98); }

  /* ── Styled sliders / steppers / selects ────────────────────────────── */
  .gw-slider { display: flex; align-items: center; gap: 10px; font: 600 12px/1 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-slider .lbl { display: flex; align-items: center; gap: 6px; white-space: nowrap; color: var(--gw-ink); }
  .gw-slider input[type=range] { -webkit-appearance: none; appearance: none; width: clamp(110px, 13vw, 190px);
    height: 6px; border-radius: 999px; background: rgba(255,255,255,0.13); outline: none; cursor: pointer; }
  .gw-slider input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;
    width: 17px; height: 17px; border-radius: 50%; background: var(--gw-green);
    border: 2.5px solid #17240f; box-shadow: 0 0 10px rgba(140,226,90,0.6); }
  .gw-slider input[type=range]::-moz-range-thumb { width: 15px; height: 15px; border-radius: 50%;
    background: var(--gw-green); border: 2.5px solid #17240f; box-shadow: 0 0 10px rgba(140,226,90,0.6); }
  .gw-slider .rd { min-width: 44px; text-align: right; color: var(--gw-ink); font-variant-numeric: tabular-nums; }
  .gw-stepper { display: inline-flex; align-items: center; gap: 0; border-radius: 12px; overflow: hidden;
    border: 1px solid var(--gw-border-soft); background: rgba(255,255,255,0.045); }
  .gw-stepper button { appearance: none; cursor: pointer; border: none; width: 36px; height: 36px;
    background: transparent; color: var(--gw-ink); font: 800 16px/1 var(--gw-font); transition: background 0.15s; }
  .gw-stepper button:hover { background: rgba(255,255,255,0.1); }
  .gw-stepper .val { min-width: 44px; text-align: center; font: 800 14px/1 var(--gw-font); font-variant-numeric: tabular-nums; }
  .gw-seg { display: inline-flex; gap: 5px; padding: 4px; border-radius: 12px;
    background: rgba(0,0,0,0.25); border: 1px solid var(--gw-border-soft); }
  .gw-seg button { appearance: none; cursor: pointer; border: none; border-radius: 9px; padding: 7px 12px;
    background: transparent; color: var(--gw-ink-dim); font: 700 11.5px/1 var(--gw-font); white-space: nowrap;
    transition: background 0.15s, color 0.15s; }
  .gw-seg button:hover { color: var(--gw-ink); }
  .gw-seg button.gw-active { background: var(--gw-green-soft); color: var(--gw-green);
    box-shadow: inset 0 0 0 1px rgba(140,226,90,0.45); }

  /* Field label above a control inside drawers (QUANTITY / SUPPLEMENT …). */
  .gw-field { display: flex; flex-direction: column; gap: 7px; }
  .gw-field > .cap { font: 700 10.5px/1 var(--gw-font); letter-spacing: 1.2px; text-transform: uppercase; color: var(--gw-ink-dim); }
  .gw-field > .note { font: 500 10.5px/1 var(--gw-font); color: var(--gw-ink-dim); text-align: center; }

  /* ── Flyout menus (settings / details / log) ────────────────────────── */
  .gw-flyout { position: absolute; z-index: 9; min-width: 250px; max-width: 330px; max-height: 62vh; overflow: auto;
    padding: 13px 14px; border-radius: 16px; pointer-events: auto;
    background: rgba(13,14,12,0.95); border: 1px solid var(--gw-border);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    box-shadow: var(--gw-shadow); color: var(--gw-ink); font: 400 13px/1.4 var(--gw-font); }
  .gw-flyout.hidden { display: none; }
  .gw-flyout .fx-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
  .gw-flyout label.fx-row { cursor: pointer; }
  .gw-flyout input[type=checkbox] { accent-color: var(--gw-green); }
  .gw-flyout .fx-btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 8px; }
  .gw-chip { appearance: none; cursor: pointer; border-radius: 999px; padding: 7px 12px;
    background: rgba(255,255,255,0.05); border: 1px solid var(--gw-border-soft);
    color: var(--gw-ink); font: 700 11.5px/1 var(--gw-font); transition: background 0.15s, border-color 0.15s; }
  .gw-chip:hover { background: rgba(255,255,255,0.1); }
  .gw-chip.gw-active { background: var(--gw-green-soft); border-color: var(--gw-green-line); color: var(--gw-green); }

  /* Small stat rows inside flyouts / the animal panel. */
  .gw-meter { display: grid; grid-template-columns: 20px 1fr 92px 66px; align-items: center; gap: 8px; padding: 4px 0; }
  .gw-meter .ic { font-size: 13px; text-align: center; }
  .gw-meter .k { font: 600 12.5px/1.2 var(--gw-font); color: var(--gw-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gw-meter .stat { font: 600 11px/1 var(--gw-font); text-align: right; white-space: nowrap; }
  .gw-meter .stat .pc { color: var(--gw-ink); font-variant-numeric: tabular-nums; margin-right: 5px; }
  .gw-meter .stat .st { color: var(--gw-green); }
  .gw-meter .stat .st.warn { color: var(--gw-amber); }
  .gw-meter .stat .st.bad { color: var(--gw-red); }

  /* ── Right-side Animal Info panel ───────────────────────────────────── */
  .gw-animal-panel { position: fixed; z-index: 7; top: clamp(12px, 1.8vh, 22px); right: clamp(12px, 1.4vw, 24px);
    bottom: clamp(12px, 1.8vh, 22px); width: clamp(330px, 26vw, 400px); display: flex; flex-direction: column;
    pointer-events: auto; overflow: hidden; }
  .gw-animal-panel .ap-head { display: flex; align-items: center; padding: 15px 16px 11px;
    border-bottom: 1px solid rgba(255,255,255,0.07); }
  .gw-animal-panel .ap-title { font: 800 16px/1 var(--gw-font); letter-spacing: 0.2px; }
  .gw-animal-panel .ap-x { margin-left: auto; }
  .gw-animal-panel .ap-body { flex: 1; overflow-y: auto; padding: 13px 16px 14px; }
  .gw-animal-panel .ap-hero { display: flex; gap: 13px; align-items: center; }
  .gw-animal-panel .ap-photo { width: 84px; height: 84px; border-radius: 50%; flex: 0 0 auto;
    display: grid; place-items: center; font-size: 44px;
    background: radial-gradient(circle at 35% 30%, #6b5426, #2a1f10 76%);
    box-shadow: inset 0 0 0 2px rgba(255,255,255,0.1), 0 6px 18px rgba(0,0,0,0.4); }
  .gw-animal-panel .ap-name { font: 800 22px/1.1 var(--gw-font); }
  .gw-animal-panel .ap-species { font: 600 13px/1.3 var(--gw-font); color: var(--gw-ink); opacity: 0.9; }
  .gw-animal-panel .ap-meta { display: flex; gap: 7px; margin-top: 6px; flex-wrap: wrap; }
  .gw-animal-panel .ap-status { margin: 12px 0 3px; padding: 10px 12px; border-radius: 12px;
    background: var(--gw-green-soft); border: 1px solid rgba(140,226,90,0.3); }
  .gw-animal-panel .ap-status .s1 { font: 700 13.5px/1.2 var(--gw-font); color: var(--gw-green); display: flex; align-items: center; gap: 7px; }
  .gw-animal-panel .ap-status .s1 .pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--gw-green);
    box-shadow: 0 0 8px rgba(140,226,90,0.9); }
  .gw-animal-panel .ap-status .s2 { font: 500 11.5px/1.35 var(--gw-font); color: var(--gw-ink-dim); margin-top: 3px; }
  .gw-animal-panel .ap-rec { margin-top: 11px; padding: 10px 12px; border-radius: 12px;
    background: rgba(255,255,255,0.04); border: 1px solid var(--gw-border-soft); }
  .gw-animal-panel .ap-rec .r { display: flex; gap: 8px; font: 500 12px/1.4 var(--gw-font); color: var(--gw-ink); padding: 2px 0; }
  .gw-animal-panel .ap-rec .r .lf { flex: 0 0 auto; }
  .gw-animal-panel .ap-foot { display: flex; gap: 8px; padding: 11px 16px 14px; border-top: 1px solid rgba(255,255,255,0.07); }
  .gw-animal-panel .ap-foot > * { flex: 1; }

  /* ── Habitat Details panel (View Detailed Stats) ────────────────────── */
  .gw-flyout.gw-details { top: clamp(186px, 25.5vh, 238px); right: clamp(70px, 5vw, 90px);
    min-width: 0; width: min(560px, 92vw); max-width: none; max-height: min(72vh, 760px);
    padding: 16px 18px; }
  .gw-details .dhead { display: flex; align-items: center; gap: 14px; margin-bottom: 4px; }
  .gw-details .dhead > div:first-child { flex: 1; }
  .gw-details .dscore { font: 800 26px/1 var(--gw-font); color: var(--gw-green); letter-spacing: -0.5px; }
  .gw-details .dsec { margin-top: 12px; padding: 10px 12px 8px; border-radius: 13px;
    background: rgba(255,255,255,0.035); border: 1px solid var(--gw-border-soft); }
  .gw-details .dsec .gw-section-title { margin-bottom: 5px; }
  .gw-details .dline { display: flex; align-items: center; gap: 7px; margin-top: 10px;
    font: 500 11.5px/1.4 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-details .dline .gw-ic { flex: 0 0 auto; }

  /* Photo-mode shutter — the big round capture button. */
  .gw-shutter { position: absolute; left: 50%; transform: translateX(-50%);
    bottom: clamp(64px, 9vh, 92px); width: 74px; height: 74px; border-radius: 50%;
    appearance: none; cursor: pointer; pointer-events: auto;
    background: radial-gradient(circle at 35% 30%, #ffffff, #cfd6cc 70%);
    border: 5px solid rgba(13,14,12,0.85); outline: 3px solid rgba(255,255,255,0.65);
    box-shadow: 0 14px 40px rgba(0,0,0,0.55); transition: transform 0.1s, filter 0.15s; }
  .gw-shutter:hover { filter: brightness(1.06); }
  .gw-shutter:active { transform: translateX(-50%) scale(0.92); }
  .gw-shutter-flash { position: fixed; inset: 0; z-index: 60; background: #fff; opacity: 0;
    pointer-events: none; }

  /* ── Misc ───────────────────────────────────────────────────────────── */
  .gw-hint-pill { position: absolute; left: 50%; transform: translateX(-50%); bottom: clamp(16px, 2.6vh, 30px);
    padding: 10px 18px; border-radius: 999px; pointer-events: auto; white-space: nowrap;
    background: var(--gw-bg); border: 1px solid var(--gw-border);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    color: var(--gw-ink); font: 600 12.5px/1 var(--gw-font); box-shadow: 0 12px 32px rgba(0,0,0,0.5); }
  .gw-warn-pill { position: absolute; left: 50%; transform: translateX(-50%); top: clamp(16px, 2.2vh, 26px);
    padding: 8px 16px; border-radius: 999px; pointer-events: auto; white-space: nowrap;
    background: rgba(46,32,10,0.88); border: 1px solid var(--gw-amber-line); color: var(--gw-amber);
    font: 700 12px/1 var(--gw-font); box-shadow: 0 10px 30px rgba(0,0,0,0.45);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); }
  .gw-hidden { display: none !important; }
  .gw-scroll-x { display: flex; gap: 10px; overflow-x: auto; padding: 2px 2px 8px; scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.22) transparent; }
  .gw-scroll-x::-webkit-scrollbar { height: 7px; }
  .gw-scroll-x::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 4px; }
  .gw-scroll-x::-webkit-scrollbar-track { background: transparent; }

  /* ── Feeding Mode (reference layout: method rail + photo food cards) ──── */
  .gw-bottom-drawer.gw-low { bottom: clamp(14px, 2.2vh, 26px); }
  .gw-feed-grid { display: flex; gap: 20px; align-items: stretch; }
  .gw-method-rail { display: flex; flex-direction: column; gap: 5px; min-width: 196px;
    padding-right: 16px; border-right: 1px solid rgba(255,255,255,0.06); }
  .gw-method { appearance: none; cursor: pointer; display: flex; align-items: center; gap: 12px;
    text-align: left; padding: 12px 15px; border-radius: 13px; background: transparent;
    border: 1.5px solid transparent; color: var(--gw-ink); font: 600 14px/1 var(--gw-font);
    transition: background 0.15s, border-color 0.15s, color 0.15s; white-space: nowrap; }
  .gw-method .ic { width: 22px; height: 22px; display: grid; place-items: center; color: var(--gw-ink-dim); flex: 0 0 auto; }
  .gw-method:hover { background: rgba(255,255,255,0.06); }
  .gw-method.gw-active { background: var(--gw-green-soft); border-color: rgba(140,226,90,0.4); color: var(--gw-green); }
  .gw-method.gw-active .ic { color: var(--gw-green); }

  .gw-food-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
  .gw-food-card { appearance: none; cursor: pointer; position: relative; border-radius: 14px; overflow: hidden;
    border: 2px solid var(--gw-border-soft); background: #16130d; padding: 0; color: var(--gw-ink);
    font-family: var(--gw-font); transition: border-color 0.15s, transform 0.12s, box-shadow 0.15s; }
  .gw-food-card:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.18); }
  .gw-food-card img { display: block; width: 100%; aspect-ratio: 1.78; object-fit: cover; }
  .gw-food-card .nm { display: block; font: 700 13.5px/1 var(--gw-font); padding: 9px 8px 10px; text-align: center; }
  .gw-food-card .check { position: absolute; top: 8px; right: 8px; width: 21px; height: 21px; border-radius: 50%;
    display: none; place-items: center; background: var(--gw-green); color: #10240b; font: 800 12px/1 var(--gw-font);
    box-shadow: 0 2px 8px rgba(0,0,0,0.45); }
  .gw-food-card.gw-active { border-color: var(--gw-green-line); box-shadow: 0 0 20px rgba(140,226,90,0.25); }
  .gw-food-card.gw-active .check { display: grid; }

  /* Dropdown-style face (SUPPLEMENT selector / NEXT FEEDING readout). */
  .gw-select { position: relative; }
  .gw-select > .face { appearance: none; cursor: pointer; display: flex; align-items: center; gap: 11px;
    padding: 9px 13px; min-width: 196px; border-radius: 13px; background: rgba(255,255,255,0.05);
    border: 1px solid var(--gw-border-soft); color: var(--gw-ink); font: 700 13.5px/1.1 var(--gw-font); }
  .gw-select > .face .ic { width: 20px; height: 20px; display: grid; place-items: center; color: var(--gw-amber); flex: 0 0 auto; }
  .gw-select > .face .two { display: flex; flex-direction: column; gap: 3px; text-align: left; min-width: 0; }
  .gw-select > .face .two .sub { font: 500 10.5px/1 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-select > .face .car { margin-left: auto; color: var(--gw-ink-dim); font-size: 10px; }
  .gw-select .menu { position: absolute; bottom: calc(100% + 7px); left: 0; min-width: 100%; z-index: 10;
    padding: 6px; border-radius: 13px; background: rgba(13,14,12,0.97); border: 1px solid var(--gw-border);
    box-shadow: var(--gw-shadow); display: flex; flex-direction: column; gap: 2px; }
  .gw-select .menu.gw-hidden { display: none !important; }
  .gw-select .menu button { appearance: none; cursor: pointer; border: none; border-radius: 9px; padding: 9px 12px;
    background: transparent; color: var(--gw-ink); font: 600 12.5px/1.2 var(--gw-font); text-align: left;
    display: flex; gap: 8px; align-items: center; white-space: nowrap; }
  .gw-select .menu button:hover { background: rgba(255,255,255,0.08); }
  .gw-select .menu button.gw-active { background: var(--gw-green-soft); color: var(--gw-green); }

  /* Small round ✕ (drawer close). */
  .gw-x { appearance: none; cursor: pointer; width: 30px; height: 30px; border-radius: 50%;
    border: 1px solid var(--gw-border-soft); background: rgba(255,255,255,0.05); color: var(--gw-ink-dim);
    font: 700 13px/1 var(--gw-font); display: grid; place-items: center; transition: background 0.15s, color 0.15s; }
  .gw-x:hover { background: rgba(255,255,255,0.12); color: var(--gw-ink); }

  /* Track Intake (feeding history + diet balance). */
  .gw-intake { display: flex; gap: 20px; min-height: 150px; }
  .gw-intake .col { flex: 1; min-width: 0; }
  .gw-intake .col.log { max-height: 190px; overflow-y: auto; padding-right: 6px; }
  .gw-log-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 11px;
    background: rgba(255,255,255,0.035); border: 1px solid var(--gw-border-soft); margin-bottom: 6px;
    font: 600 12.5px/1.2 var(--gw-font); }
  .gw-log-row img { width: 42px; height: 26px; object-fit: cover; border-radius: 7px; flex: 0 0 auto; }
  .gw-log-row .t { margin-left: auto; color: var(--gw-ink-dim); font: 500 11px/1 var(--gw-font); white-space: nowrap; }

  /* ── Cinematic letterbox (full-screen eating cinematics) ─────────────── */
  .gw-letterbox { position: fixed; left: 0; right: 0; z-index: 8; height: clamp(58px, 9.5vh, 116px);
    background: #000; pointer-events: none; transition: transform 0.55s cubic-bezier(0.33, 0.9, 0.3, 1); }
  .gw-letterbox.top { top: 0; transform: translateY(-101%); }
  .gw-letterbox.bottom { bottom: 0; transform: translateY(101%); }
  body.gw-cinematic .gw-letterbox.top { transform: translateY(0); }
  body.gw-cinematic .gw-letterbox.bottom { transform: translateY(0); }
  .gw-cine-hint { position: fixed; right: 22px; bottom: clamp(66px, 10.5vh, 124px); z-index: 9;
    padding: 8px 14px; border-radius: 999px; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.14);
    color: rgba(255,255,255,0.85); font: 600 11.5px/1 var(--gw-font); pointer-events: none; }
  `;
  const tag = document.createElement("style");
  tag.id = "gw-theme-styles";
  tag.textContent = css;
  document.head.appendChild(tag);
}

/** Tiny DOM helper shared by the gw UI modules. */
export function gwEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** The universal top-left back pill — every full-screen door screen mounts
 *  one so leaving is always a visible click, never just Esc. */
export function gwBackPill(onBack: () => void, label = "Back"): HTMLButtonElement {
  const b = gwEl("button", "gw-backpill") as HTMLButtonElement;
  b.type = "button";
  b.title = `${label} (Esc)`;
  b.setAttribute("aria-label", label);
  b.append(gwEl("span", "bp-ic", "‹"), document.createTextNode(label));
  b.addEventListener("click", onBack);
  return b;
}

/** An SVG circular progress ring (score card). Returns the element + a setter. */
export function gwProgressRing(size = 68, stroke = 6): { root: HTMLElement; set: (pct: number) => void; center: HTMLElement } {
  const root = gwEl("div", "gw-score-ring");
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  const mk = (cls: string): SVGCircleElement => {
    const el = document.createElementNS(ns, "circle");
    el.setAttribute("cx", String(size / 2));
    el.setAttribute("cy", String(size / 2));
    el.setAttribute("r", String(r));
    el.setAttribute("fill", "none");
    el.setAttribute("stroke-width", String(stroke));
    el.setAttribute("class", cls);
    svg.appendChild(el);
    return el;
  };
  mk("track");
  const fill = mk("fill");
  fill.setAttribute("stroke-dasharray", String(c));
  fill.setAttribute("stroke-dashoffset", String(c));
  const center = gwEl("div", "mid", "🌿");
  root.append(svg, center);
  return {
    root,
    center,
    set: (pct: number) => {
      const p = Math.max(0, Math.min(100, pct));
      fill.setAttribute("stroke-dashoffset", String(c * (1 - p / 100)));
    },
  };
}

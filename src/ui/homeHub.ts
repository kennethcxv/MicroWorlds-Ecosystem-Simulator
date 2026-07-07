/**
 * HOME HUB — the GLASSWATER Eco-Center research lodge (main menu).
 *
 * Composition target: Designs/Main_Menu/ChatGPT Image Jul 5, 2026,
 * 12_25_17 AM.png — a cozy premium CIRCULAR ATRIUM eco-center. Rather than
 * hand-draw that painted rotunda in CSS (which read as flat/prototype in
 * v20–v21), the environment is a rendered atrium BACKDROP plate
 * (public/assets/ui/hub/eco_center_atrium.jpg — generated with gpt-image-1 to
 * match the reference composition, NOT the reference file itself) with all of
 * the real, live, wired UI overlaid on top:
 *
 *   • floating habitat SIGNAGE + clickable hotspots over each painted display
 *     (Desert Vivarium → gecko, Freshwater Aquarium → fish, Rainforest
 *     Paludarium → frog, Research Desk → Care Guide, Restoration Hub → locked),
 *   • top ribbon: Eco Points · Day & Time · Restoration Progress (View),
 *   • left: brand + welcome + Continue, and the live Current Habitats panel,
 *   • bottom: the five-door quick-nav dock,
 *   • bottom-right: the daily-care card (fed by REAL reminders).
 *
 * A soft pointer parallax drifts the backdrop for life (reduced-motion aware).
 * The class API (show/hide/update + the HubMeta stash) is unchanged since v12,
 * so app.ts needs no edits.
 */
import type { GameState } from "../core/state";
import { getActiveTank } from "../core/state";
import { gwEl as el, ensureGwStyles } from "./gwTheme";
import { gwIcon } from "./gwIcons";
import { fmtClockPref, getPrefs } from "./prefs";
import { deriveReminders, type ReminderDef } from "../data/habitats";
import {
  ECO_SECTIONS,
  HABITAT_ROWS,
  HUB_FLAVOR,
  HUB_MOTTO,
  HUB_WELCOME,
  QUICK_NAV,
  RESTORATION,
  greetingFor,
  habitatRowCard,
  restorationPct,
  type EcoSectionAction,
} from "../data/ecoCenter";
import type { HabitatsLiveData } from "./habitatsScreen";

export type PlayerHabitat = "lizard" | "fish" | "frog";

export interface HomeHubCallbacks {
  enterHabitat(kind: PlayerHabitat): void;
  openHabitats(): void;
  openShop(): void;
  openInventory(): void;
  openGuide(): void;
  openAlbum(): void;
  openSettings(): void;
  /** Live scores/signals (the Habitats page's data) → rows + care card. */
  careData(): HabitatsLiveData;
}

/** Last-known habitat scores + care signals (stashed by the app so the hub
 *  and the Habitats page can show them without booting a 3D scene), plus the
 *  real last-visit timestamps behind "Recently Visited". Older stashes heal
 *  through META_DEFAULTS (missing fields read null). */
const META_KEY = "glasswater.hubmeta.v1";

export interface HubMeta {
  geckoScore: number | null;
  geckoName: string;
  geckoCleanliness: number | null;
  geckoHunger: number | null;
  frogScore: number | null;
  frogName: string;
  frogCleanliness: number | null;
  frogHunger: number | null;
  frogHumidity: number | null;
  frogHydration: number | null;
  lastVisitLizard: number | null;
  lastVisitFish: number | null;
  lastVisitFrog: number | null;
}

const META_DEFAULTS: HubMeta = {
  geckoScore: null,
  geckoName: "Sunstone Desert",
  geckoCleanliness: null,
  geckoHunger: null,
  frogScore: null,
  frogName: "Emerald Hollow",
  frogCleanliness: null,
  frogHunger: null,
  frogHumidity: null,
  frogHydration: null,
  lastVisitLizard: null,
  lastVisitFish: null,
  lastVisitFrog: null,
};

export function loadHubMeta(): HubMeta {
  try {
    const raw = globalThis.localStorage?.getItem(META_KEY);
    if (raw) return { ...META_DEFAULTS, ...(JSON.parse(raw) as Partial<HubMeta>) };
  } catch {
    /* defaults */
  }
  return { ...META_DEFAULTS };
}

export function saveHubMeta(meta: Partial<HubMeta>): void {
  try {
    const cur = loadHubMeta();
    globalThis.localStorage?.setItem(META_KEY, JSON.stringify({ ...cur, ...meta }));
  } catch {
    /* non-fatal */
  }
}

// ── Habitat hotspots over the atrium backdrop ───────────────────────────────
//
// Each entry pins a clickable region + floating sign over a painted display in
// eco_center_atrium.jpg (shown object-fit:cover in 16:9). Positions are
// viewport-% (cx/cy = sign anchor; w/h = the clickable window rect around it),
// tuned to the plate. `label`/`sub` override the section copy to match the
// reference signage where it differs.
interface HotspotDef {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  label?: string;
  sub?: string;
}

const HOTSPOTS: readonly HotspotDef[] = [
  { id: "vivarium-wing", cx: 10, cy: 62, w: 18, h: 26, label: "Desert Vivarium" }, // warm desert archway, far left
  { id: "aquarium-wall", cx: 28, cy: 61, w: 16, h: 26, label: "Freshwater Aquarium" }, // teal planted tank, lower-left
  { id: "care-library", cx: 49.5, cy: 45, w: 13, h: 14, label: "Research Desk", sub: "Discover & Learn" }, // bookshelf nook, above the emblem
  { id: "rainforest-room", cx: 72, cy: 59, w: 16, h: 26, label: "Rainforest Paludarium" }, // rainforest green bays, right
  { id: "restoration-wing", cx: 91, cy: 60, w: 13, h: 24, label: "Restoration Hub", sub: "Heal Habitats" }, // maps + desk-lamp research corner, far right
];

const BACKDROP = "/assets/ui/hub/eco_center_atrium.jpg";

let stylesIn = false;
function ensureStyles(): void {
  if (stylesIn) return;
  stylesIn = true;
  const css = `
  .gw-hub { position: fixed; inset: 0; z-index: 20; display: none; color: var(--gw-ink);
    font-family: var(--gw-font); overflow: hidden; background: #0a0805;
    --hub-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
    --brass: #f4e3bf; }
  .gw-hub.open { display: block; animation: gw-hub-in 0.5s ease; }
  @keyframes gw-hub-in { from { opacity: 0; } to { opacity: 1; } }
  .gw-hub button { font-family: var(--gw-font); color: var(--gw-ink); }
  .gw-hub button:focus-visible { outline: 2px solid var(--gw-green); outline-offset: 3px; }

  /* ═══ THE ATRIUM — a rendered eco-center rotunda plate with the live UI on
     top. The backdrop drifts a hair with the pointer (parallax); a vignette
     grounds the edges + keeps overlaid UI readable. ═══ */
  .gw-hub .stage { position: absolute; inset: 0; overflow: hidden; }
  .gw-hub .backdrop { position: absolute; inset: -3.5%; width: 107%; height: 107%;
    object-fit: cover; object-position: 50% 43%; will-change: transform;
    filter: brightness(1.09) saturate(1.06) contrast(1.03);
    transition: transform 0.35s cubic-bezier(0.22,0.61,0.36,1); }
  /* Vignette: darken only the very top/bottom edges (for ribbon + dock
     legibility) and softly frame the corners — kept light on the sides so the
     edge exhibit bays (desert far-left, research far-right) stay readable. */
  .gw-hub .vignette { position: absolute; inset: 0; pointer-events: none; z-index: 2;
    background:
      linear-gradient(180deg, rgba(6,4,2,0.55) 0%, rgba(6,4,2,0.10) 11%, rgba(0,0,0,0) 24%),
      linear-gradient(0deg, rgba(5,3,1,0.62) 0%, rgba(5,3,1,0.12) 14%, rgba(0,0,0,0) 30%),
      linear-gradient(90deg, rgba(5,3,1,0.32) 0%, rgba(0,0,0,0) 16%, rgba(0,0,0,0) 84%, rgba(5,3,1,0.32) 100%),
      radial-gradient(ellipse 92% 84% at 50% 46%, rgba(0,0,0,0) 62%, rgba(5,3,1,0.4) 100%); }

  /* — Habitat hotspots: a clickable window rect + a floating signage pill. — */
  .gw-hub .hotspot { position: absolute; transform: translate(-50%, -50%); z-index: 3;
    appearance: none; border: none; background: transparent; padding: 0; cursor: pointer; }
  .gw-hub .hotspot::after { content: ""; position: absolute; inset: 8%;
    border-radius: 16px; pointer-events: none; opacity: 0;
    background: radial-gradient(ellipse at 50% 60%, rgba(140,226,120,0.16), rgba(140,226,120,0) 70%);
    box-shadow: inset 0 0 0 2px rgba(140,226,120,0.45), 0 0 26px rgba(140,226,120,0.28);
    transition: opacity 0.18s ease; }
  .gw-hub .hotspot:hover::after, .gw-hub .hotspot:focus-visible::after { opacity: 1; }
  .gw-hub .hotspot .sign { position: absolute; left: 50%; top: -2px; transform: translate(-50%, -100%);
    display: flex; flex-direction: column; align-items: center; gap: 2px; white-space: nowrap;
    padding: 7px 16px 8px; border-radius: 11px;
    background: linear-gradient(180deg, rgba(20,15,9,0.9), rgba(9,7,4,0.92));
    border: 1px solid rgba(244,227,191,0.28);
    box-shadow: 0 8px 22px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,236,196,0.16);
    transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease; }
  .gw-hub .hotspot:hover .sign, .gw-hub .hotspot:focus-visible .sign {
    border-color: rgba(140,226,120,0.6); transform: translate(-50%, calc(-100% - 3px));
    box-shadow: 0 10px 26px rgba(0,0,0,0.55), 0 0 22px rgba(140,226,120,0.28), inset 0 1px 0 rgba(255,236,196,0.16); }
  .gw-hub .hotspot .sign::after { content: ""; position: absolute; left: 50%; top: 100%; margin-left: -6px;
    border: 6px solid transparent; border-top-color: rgba(12,9,5,0.92); }
  .gw-hub .hotspot .nm { font: 700 12.5px/1 var(--hub-display); letter-spacing: 2.4px; text-transform: uppercase;
    color: #f3ead2; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
  .gw-hub .hotspot .sp { font: italic 500 11px/1.15 var(--hub-display); letter-spacing: 0.3px; color: rgba(230,214,180,0.82); }
  .gw-hub .hotspot .alertdot { position: absolute; top: 6px; right: 6px; width: 9px; height: 9px; border-radius: 50%;
    border: 2px solid rgba(9,7,4,0.9); display: none; }

  /* ═══ OVERLAY UI ═══ */
  .gw-hub .panel { border-radius: 16px; background: rgba(10,9,6,0.66);
    border: 1px solid rgba(224,214,188,0.14); backdrop-filter: var(--gw-blur);
    -webkit-backdrop-filter: var(--gw-blur);
    box-shadow: 0 16px 44px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,240,205,0.07); }
  .gw-hub .continue.gw-primary-button { background: linear-gradient(180deg, #5aa73f, #3c7a2a 62%, #326e23);
    border: 1px solid rgba(170,235,130,0.45); text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    box-shadow: 0 8px 22px rgba(70,150,60,0.32), inset 0 1px 0 rgba(255,255,255,0.24); }

  /* Brand + welcome + Continue (over the scene, no panel — like the ref). */
  .gw-hub .brandp { position: absolute; left: 34px; top: 30px; width: clamp(280px, 20vw, 340px); z-index: 6;
    text-shadow: 0 2px 10px rgba(0,0,0,0.8); }
  .gw-hub .brandp .mark { display: flex; align-items: center; gap: 13px; }
  .gw-hub .brandp .droplet { width: 44px; height: 52px; flex: 0 0 auto; filter: drop-shadow(0 3px 8px rgba(0,0,0,0.6)); }
  .gw-hub .brandp .t { font: 500 clamp(30px, 2.5vw, 40px)/0.92 var(--hub-display); letter-spacing: 2px; color: #f4ead4; }
  .gw-hub .brandp .s { display: flex; align-items: center; gap: 8px; margin-top: 6px;
    font: 600 11px/1 var(--gw-font); color: rgba(240,214,150,0.92); letter-spacing: 5px; text-transform: uppercase; }
  .gw-hub .brandp .s .fl { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(240,214,150,0.5), rgba(240,214,150,0)); }
  .gw-hub .brandp .s .fl.r { background: linear-gradient(270deg, rgba(240,214,150,0.5), rgba(240,214,150,0)); }
  .gw-hub .brandp .wel { display: flex; align-items: center; gap: 8px; margin-top: 20px;
    font: 500 17px/1.3 var(--hub-display); color: #f1e8d4; }
  .gw-hub .brandp .flav { font: italic 500 12.5px/1.5 var(--hub-display); color: rgba(226,214,186,0.8); margin: 3px 0 0 26px; }
  .gw-hub .brandp .continue { width: min(230px, 100%); margin-top: 18px; padding: 14px 20px; font-size: 14px; letter-spacing: 1px; }

  /* Top ribbon: Eco Points · Day & Time · Restoration Progress. */
  .gw-hub .topbar { position: absolute; top: 26px; left: 50%; transform: translateX(-50%); z-index: 6;
    display: flex; align-items: stretch; gap: 14px; }
  .gw-hub .tcard { display: flex; align-items: center; gap: 12px; padding: 11px 18px; border-radius: 14px;
    background: rgba(10,9,6,0.64); border: 1px solid rgba(224,214,188,0.16); backdrop-filter: var(--gw-blur);
    -webkit-backdrop-filter: var(--gw-blur); box-shadow: 0 12px 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,240,205,0.08); }
  .gw-hub .tcard .ic { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex: 0 0 auto;
    background: rgba(240,214,150,0.12); border: 1px solid rgba(240,214,150,0.3); }
  .gw-hub .tcard .lbl { font: 700 9.5px/1 var(--gw-font); letter-spacing: 1.6px; text-transform: uppercase; color: rgba(230,214,180,0.72); }
  .gw-hub .tcard .big { font: 800 21px/1 var(--gw-font); font-variant-numeric: tabular-nums; color: #f4ecd6; margin-top: 3px; }
  .gw-hub .tcard .sub { font: italic 500 11px/1.2 var(--hub-display); color: rgba(226,214,186,0.72); margin-top: 3px; }
  .gw-hub .tcard.day { flex-direction: column; align-items: center; gap: 2px; text-align: center; padding: 10px 26px; }
  .gw-hub .tcard.day .row { display: flex; align-items: center; gap: 9px; }
  .gw-hub .tcard.day .row .d { font: 800 16px/1 var(--gw-font); letter-spacing: 0.5px; color: #f4ecd6; }
  .gw-hub .rest { min-width: 300px; }
  .gw-hub .rest .body { flex: 1; min-width: 0; }
  .gw-hub .rest .top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .gw-hub .rest .pn { font: 500 12.5px/1.1 var(--hub-display); color: var(--brass); letter-spacing: 0.3px; }
  .gw-hub .rest .pv { font: 800 12px/1 var(--gw-font); color: var(--gw-amber); font-variant-numeric: tabular-nums; }
  .gw-hub .rest .rmeter { height: 7px; border-radius: 999px; background: rgba(255,255,255,0.12); overflow: hidden; margin-top: 7px; }
  .gw-hub .rest .rmeter i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #7bbf46, #a7e267); }
  .gw-hub .rest .viewbtn { flex: 0 0 auto; padding: 8px 15px; border-radius: 10px; font: 700 11px/1 var(--gw-font);
    letter-spacing: 1px; text-transform: uppercase; background: rgba(255,255,255,0.06);
    border: 1px solid rgba(224,214,188,0.28); color: #ece2c8; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; }
  .gw-hub .rest .viewbtn:hover { background: rgba(140,226,120,0.14); border-color: rgba(140,226,120,0.5); }

  /* Current Habitats (left, lower). */
  .gw-hub .habp { position: absolute; left: 34px; bottom: 96px; width: clamp(300px, 21vw, 360px); padding: 14px 15px 13px; z-index: 6; }
  .gw-hub .habp .cap { display: flex; align-items: center; gap: 8px; font: 800 10.5px/1 var(--gw-font);
    letter-spacing: 1.8px; text-transform: uppercase; color: rgba(230,214,180,0.82); padding: 2px 4px 10px; }
  .gw-hub .hrow { appearance: none; border: none; width: 100%; display: flex; align-items: center; gap: 11px;
    padding: 9px; border-radius: 13px; background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.05);
    cursor: pointer; text-align: left; margin-bottom: 8px; transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease; }
  .gw-hub .hrow:hover { background: rgba(140,226,120,0.09); border-color: rgba(140,226,120,0.35); transform: translateX(2px); }
  .gw-hub .hrow .av { width: 42px; height: 42px; border-radius: 11px; object-fit: cover; flex: 0 0 auto; border: 1px solid rgba(255,255,255,0.14); }
  .gw-hub .hrow .mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .gw-hub .hrow .nm { font: 700 13px/1.1 var(--gw-font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #f1e8d4; }
  .gw-hub .hrow .sp { font: italic 500 10px/1.2 var(--hub-display); color: rgba(226,214,186,0.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gw-hub .hrow .right { flex: 0 0 74px; display: flex; flex-direction: column; gap: 5px; align-items: stretch; }
  .gw-hub .hrow .pctrow { display: flex; align-items: center; justify-content: flex-end; gap: 5px;
    font: 800 12px/1 var(--gw-font); font-variant-numeric: tabular-nums; white-space: nowrap; color: #eef3e6; }
  .gw-hub .hrow .meter { height: 5px; border-radius: 999px; background: rgba(255,255,255,0.12); overflow: hidden; }
  .gw-hub .hrow .meter i { display: block; height: 100%; border-radius: 999px; width: 0%; background: linear-gradient(90deg, #58b23c, #8ce25a); transition: width 0.4s ease; }
  .gw-hub .hrow .chev { flex: 0 0 auto; opacity: 0.5; }
  .gw-hub .habp .viewall { width: 100%; margin-top: 3px; letter-spacing: 1.4px; text-transform: uppercase; font-size: 11px; }

  /* Daily care (bottom-right). */
  .gw-hub .carep { position: absolute; right: 34px; bottom: 96px; width: clamp(280px, 19vw, 320px); padding: 13px 15px; z-index: 6; }
  .gw-hub .carep .hd { display: flex; align-items: center; gap: 12px; }
  .gw-hub .carep .hd .txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .gw-hub .carep .ring { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; flex: 0 0 auto; order: 2;
    border: 2px solid rgba(140,226,90,0.8); background: rgba(140,226,90,0.12); }
  .gw-hub .carep.warn .ring { border-color: rgba(240,182,75,0.8); background: rgba(240,182,75,0.12); }
  .gw-hub .carep .ttl { font: 700 10.5px/1.1 var(--gw-font); letter-spacing: 1.4px; text-transform: uppercase; color: #f1e8d4; }
  .gw-hub .carep .sub { font: italic 500 11.5px/1.4 var(--hub-display); color: rgba(226,214,186,0.82); margin-top: 3px; }
  .gw-hub .carep .items { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
  .gw-hub .carep .rem { display: flex; align-items: center; gap: 7px; padding: 6px 10px; border-radius: 10px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); font: 600 11px/1.2 var(--gw-font); color: #ece2c8; }
  .gw-hub .carep .rem .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
  .gw-hub .carep .rem .hb { color: rgba(226,214,186,0.7); margin-left: auto; white-space: nowrap; font-size: 10px; }

  /* Quick-nav dock (bottom-center) + footer. */
  .gw-hub .dock { position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 7;
    display: flex; align-items: stretch; border-radius: 16px;
    background: rgba(10,9,6,0.72); border: 1px solid rgba(224,214,188,0.16); backdrop-filter: var(--gw-blur);
    -webkit-backdrop-filter: var(--gw-blur); box-shadow: 0 16px 44px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,240,205,0.08); overflow: hidden; }
  .gw-hub .dockbtn { appearance: none; border: none; background: transparent; cursor: pointer;
    display: flex; align-items: center; gap: 11px; padding: 13px 20px; text-align: left; transition: background 0.15s ease, transform 0.12s ease; }
  .gw-hub .dockbtn + .dockbtn { border-left: 1px solid rgba(255,255,255,0.07); }
  .gw-hub .dockbtn:hover { background: rgba(140,226,120,0.09); }
  .gw-hub .dockbtn:active { transform: translateY(1px); }
  .gw-hub .dockbtn:hover .ic { border-color: rgba(240,182,75,0.55); box-shadow: 0 0 12px rgba(240,182,75,0.2); }
  .gw-hub .dockbtn .ic { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex: 0 0 auto;
    background: rgba(240,182,75,0.1); border: 1px solid rgba(240,182,75,0.26); transition: border-color 0.15s ease, box-shadow 0.15s ease; }
  .gw-hub .dockbtn .tx { display: flex; flex-direction: column; gap: 2px; }
  .gw-hub .dockbtn .nm { font: 700 12px/1.05 var(--gw-font); letter-spacing: 0.8px; text-transform: uppercase; color: #f1e8d4; white-space: nowrap; }
  .gw-hub .dockbtn .ds { font: italic 500 10px/1.2 var(--hub-display); color: rgba(226,214,186,0.72); white-space: nowrap; }
  .gw-hub .foot { position: absolute; left: 34px; bottom: 30px; z-index: 5; display: inline-flex; align-items: center; gap: 7px;
    font: italic 500 11px/1 var(--hub-display); color: rgba(226,214,186,0.6); text-shadow: 0 1px 3px rgba(0,0,0,0.7); pointer-events: none; }

  /* Locked-wing modal. */
  .gw-hub .wingmodal { position: absolute; inset: 0; z-index: 30; display: none; align-items: center;
    justify-content: center; background: rgba(4,3,1,0.66); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
  .gw-hub .wingmodal.on { display: flex; }
  .gw-hub .wingcard { width: min(440px, calc(100vw - 48px)); border-radius: 20px; padding: 24px 26px 22px;
    background: rgba(16,13,8,0.97); border: 1.5px solid rgba(224,214,188,0.2); box-shadow: 0 30px 80px rgba(0,0,0,0.7); }
  .gw-hub .wingcard .wh { display: flex; align-items: center; gap: 13px; }
  .gw-hub .wingcard .wic { width: 46px; height: 46px; border-radius: 13px; display: grid; place-items: center;
    background: rgba(240,182,75,0.12); border: 1px solid rgba(240,182,75,0.35); flex: 0 0 auto; }
  .gw-hub .wingcard .wt1 { font: 500 20px/1.15 var(--hub-display); letter-spacing: 0.4px; color: #f4ead4; }
  .gw-hub .wingcard .wt2 { font: 700 10.5px/1 var(--gw-font); color: var(--gw-amber); letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
  .gw-hub .wingcard .wnote { font: 500 12.5px/1.6 var(--gw-font); color: rgba(226,214,186,0.85); margin: 14px 0 15px; }
  .gw-hub .wingcard .rmeter { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; }
  .gw-hub .wingcard .rmeter i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #7bbf46, #a7e267); }
  .gw-hub .wingcard .rlbl { display: flex; justify-content: space-between; font: 700 10.5px/1 var(--gw-font); color: rgba(226,214,186,0.7); margin-top: 7px; }
  .gw-hub .wingcard .wbtns { display: flex; gap: 10px; margin-top: 19px; justify-content: flex-end; }

  /* ═══ Responsive ═══ */
  @media (max-width: 1500px) {
    .gw-hub .rest { min-width: 240px; }
    .gw-hub .tcard .sub { display: none; }
    .gw-hub .hotspot .sp { display: none; }
    .gw-hub .dockbtn .ds { display: none; }
    .gw-hub .hrow .chev { display: none; }
    .gw-hub .hrow .right { flex-basis: 62px; }
    .gw-hub .habp { width: clamp(300px, 24vw, 360px); }
  }
  @media (max-width: 1300px) {
    .gw-hub .brandp .flav { display: none; }
    .gw-hub .tcard.day .row .p { display: none; }
    .gw-hub .dockbtn { padding: 12px 15px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .gw-hub *, .gw-hub .backdrop { transition-duration: 0.01ms !important; animation: none !important; }
  }
  `;
  const tag = document.createElement("style");
  tag.id = "gw-hub-styles";
  tag.textContent = css;
  document.head.append(tag);
}

interface RowRefs {
  pct: HTMLElement;
  fill: HTMLElement;
}

export class HomeHub {
  readonly root: HTMLElement;
  private ecoNum!: HTMLElement;
  private clockDay!: HTMLElement;
  private clockSub!: HTMLElement;
  private clockIcon!: HTMLElement;
  private carePanel!: HTMLElement;
  private careHead!: HTMLElement;
  private careItems!: HTMLElement;
  private continueBtn!: HTMLButtonElement;
  private wingModal!: HTMLElement;
  private rows = new Map<PlayerHabitat, RowRefs>();
  /** Alert dots on the atrium signage (per habitat needing care). */
  private alerts = new Map<PlayerHabitat, HTMLElement>();
  private lastHabitat: PlayerHabitat = "fish";
  private backdropEl!: HTMLImageElement;
  private parallax = { tx: 0, ty: 0, cx: 0, cy: 0, raf: 0 };

  private modalEsc = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      this.closeWingModal();
    }
  };

  constructor(private cb: HomeHubCallbacks) {
    ensureGwStyles();
    ensureStyles();
    this.root = el("div", "gw-hub");
    this.root.append(this.buildStage(), ...this.buildPanels(), this.buildWingModal());
  }

  // ── The atrium stage (backdrop + habitat hotspots) ───────────────────────

  private buildStage(): HTMLElement {
    const stage = el("div", "stage");
    const img = document.createElement("img");
    img.className = "backdrop";
    img.src = BACKDROP;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.draggable = false;
    this.backdropEl = img;
    stage.append(img);

    for (const hs of HOTSPOTS) {
      const section = ECO_SECTIONS.find((s) => s.id === hs.id);
      if (!section) continue;
      const label = hs.label ?? section.label;
      const sub = hs.sub ?? section.subtitle;
      const btn = el("button", "hotspot") as HTMLButtonElement;
      btn.style.left = `${hs.cx}%`;
      btn.style.top = `${hs.cy}%`;
      btn.style.width = `${hs.w}%`;
      btn.style.height = `${hs.h}%`;
      btn.setAttribute("aria-label", `${label} — ${sub}`);
      btn.title = section.desc;
      const sign = el("span", "sign");
      const alert = el("span", "alertdot");
      sign.append(alert, el("span", "nm", label), el("span", "sp", sub));
      btn.append(sign);
      btn.addEventListener("click", () => this.act(section.action));
      stage.append(btn);
      const habitat = section.action.kind === "habitat" ? (section.action.habitat as PlayerHabitat) : null;
      if (habitat) this.alerts.set(habitat, alert);
    }

    stage.append(el("div", "vignette"));
    return stage;
  }

  private pointerPar = (e: PointerEvent): void => {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.parallax.tx = (e.clientX / w - 0.5) * 2;
    this.parallax.ty = (e.clientY / h - 0.5) * 2;
  };

  private tickPar = (): void => {
    const p = this.parallax;
    p.cx += (p.tx - p.cx) * 0.05;
    p.cy += (p.ty - p.cy) * 0.05;
    // Backdrop drifts OPPOSITE the pointer (parallax depth), a hair of scale.
    this.backdropEl.style.transform = `scale(1.05) translate(${(-p.cx * 1.1).toFixed(2)}%, ${(-p.cy * 0.8).toFixed(2)}%)`;
    p.raf = requestAnimationFrame(this.tickPar);
  };

  // ── Overlay panels ────────────────────────────────────────────────────────

  private brandDroplet(): SVGElement {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 44 52");
    svg.setAttribute("class", "droplet");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M22 2 C22 2 6 22 6 33 a16 16 0 0 0 32 0 C38 22 22 2 22 2 Z");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#8fd0f4");
    path.setAttribute("stroke-width", "2.4");
    const leaf = document.createElementNS(ns, "path");
    leaf.setAttribute("d", "M22 24 C17 24 14 28 14 33 C20 33 23 29 23 24 Z M22 24 C27 24 30 28 30 33 C24 33 21 29 22 24 Z");
    leaf.setAttribute("fill", "#8fd0f4");
    leaf.setAttribute("opacity", "0.9");
    svg.append(path, leaf);
    return svg;
  }

  private buildPanels(): HTMLElement[] {
    // Brand + welcome + Continue (top-left, over the scene).
    const brand = el("div", "brandp");
    const mark = el("div", "mark");
    const wt = el("div");
    wt.append(el("div", "t", "GLASSWATER"));
    const sub = el("div", "s");
    sub.append(el("i", "fl"), document.createTextNode("Eco-Center"), el("i", "fl r"));
    wt.append(sub);
    mark.append(this.brandDroplet(), wt);
    const wel = el("div", "wel");
    wel.append(gwIcon("heart", 13, "#8ce25a"), document.createTextNode(HUB_WELCOME));
    this.continueBtn = el("button", "gw-primary-button continue") as HTMLButtonElement;
    this.continueBtn.addEventListener("click", () => this.cb.enterHabitat(this.lastHabitat));
    brand.append(mark, wel, el("div", "flav", HUB_FLAVOR), this.continueBtn);

    // Top ribbon: Eco Points · Day & Time · Restoration Progress.
    const topbar = el("div", "topbar");
    // Eco Points.
    const eco = el("div", "tcard");
    const ecoIc = el("span", "ic");
    ecoIc.append(gwIcon("leaf", 16, "#8ce25a"));
    const ecoBody = el("div");
    ecoBody.append(el("div", "lbl", "Eco Points"), (this.ecoNum = el("div", "big", "—")));
    eco.append(ecoIc, ecoBody);
    // Day & Time.
    const day = el("div", "tcard day");
    const dayRow = el("div", "row");
    this.clockIcon = el("span");
    this.clockIcon.append(gwIcon("moon", 15, "#f0b64b"));
    this.clockDay = el("span", "d", "—");
    dayRow.append(this.clockIcon, this.clockDay);
    this.clockSub = el("div", "sub", "");
    day.append(dayRow, this.clockSub);
    // Restoration Progress.
    const rest = el("div", "tcard rest");
    const restIc = el("span", "ic");
    restIc.append(gwIcon("sprout", 15, "#f0b64b"));
    const restBody = el("div", "body");
    const restTop = el("div", "top");
    restTop.append(el("span", "pn", RESTORATION.wingName), el("span", "pv", `${restorationPct()}%`));
    const rmeter = el("div", "rmeter");
    const rfill = el("i");
    rfill.style.width = `${restorationPct()}%`;
    rmeter.append(rfill);
    const restLbl = el("div", "lbl", "Restoration Progress");
    restBody.append(restLbl, restTop, rmeter);
    const viewBtn = el("button", "viewbtn", "View");
    viewBtn.addEventListener("click", () => this.openWingModal());
    rest.append(restIc, restBody, viewBtn);
    topbar.append(eco, day, rest);

    // Current Habitats (left, lower).
    const habp = el("div", "panel habp");
    const cap = el("div", "cap");
    cap.append(gwIcon("mountains", 12, "#f0b64b"), document.createTextNode("Current Habitats"));
    habp.append(cap);
    for (const row of HABITAT_ROWS) {
      const card = habitatRowCard(row.id);
      const kind = row.id as PlayerHabitat;
      const r = el("button", "hrow") as HTMLButtonElement;
      const av = document.createElement("img");
      av.className = "av";
      av.src = card.art;
      av.alt = "";
      if (card.artPos) av.style.objectPosition = card.artPos;
      const mid = el("span", "mid");
      mid.append(el("span", "nm", card.name), el("span", "sp", card.typeLabel));
      const right = el("span", "right");
      const pctrow = el("span", "pctrow");
      const icon = gwIcon(row.careIcon, 12, row.careIcon === "heart" ? "#ef7a5e" : row.careIcon === "drop" ? "#5db9f0" : "#8ce25a");
      const pct = el("span", undefined, "—");
      pctrow.append(icon, pct);
      const meter = el("span", "meter");
      const fill = el("i");
      meter.append(fill);
      right.append(pctrow, meter);
      const chev = el("span", "chev");
      chev.append(gwIcon("chevron", 12, "#d6ded0"));
      r.append(av, mid, right, chev);
      r.title = `${card.name} — ${row.careLabel}`;
      r.addEventListener("click", () => this.cb.enterHabitat(kind));
      habp.append(r);
      this.rows.set(kind, { pct, fill });
    }
    const viewAll = el("button", "gw-ghost-button viewall", "View All Habitats");
    viewAll.addEventListener("click", () => this.cb.openHabitats());
    habp.append(viewAll);

    // Daily care (bottom-right).
    this.carePanel = el("div", "panel carep");
    this.careHead = el("div", "hd");
    this.careItems = el("div", "items");
    this.carePanel.append(this.careHead, this.careItems);

    // Quick-nav dock.
    const dock = el("div", "dock");
    for (const d of QUICK_NAV) {
      const b = el("button", "dockbtn") as HTMLButtonElement;
      const ic = el("span", "ic");
      ic.append(gwIcon(d.icon, 16, "#f0b64b"));
      const tx = el("span", "tx");
      tx.append(el("span", "nm", d.label), el("span", "ds", d.sub));
      b.append(ic, tx);
      b.setAttribute("aria-label", d.label);
      const go: Record<typeof d.id, () => void> = {
        shop: () => this.cb.openShop(),
        inventory: () => this.cb.openInventory(),
        guide: () => this.cb.openGuide(),
        album: () => this.cb.openAlbum(),
        settings: () => this.cb.openSettings(),
      };
      b.addEventListener("click", go[d.id]);
      dock.append(b);
    }

    // Footer motto.
    const foot = el("div", "foot");
    foot.append(document.createTextNode(HUB_MOTTO), gwIcon("leaf", 11, "#8ce25a"));

    return [brand, topbar, habp, this.carePanel, dock, foot];
  }

  // ── Locked-wing modal ─────────────────────────────────────────────────────

  private buildWingModal(): HTMLElement {
    this.wingModal = el("div", "wingmodal");
    this.wingModal.addEventListener("click", (e) => {
      if (e.target === this.wingModal) this.closeWingModal();
    });
    const card = el("div", "wingcard");
    const wh = el("div", "wh");
    const wic = el("span", "wic");
    wic.append(gwIcon("lock", 20, "#f0b64b"));
    const wt = el("div");
    wt.append(el("div", "wt1", "Restoration Wing"), el("div", "wt2", RESTORATION.wingName));
    wh.append(wic, wt);
    const note = el("div", "wnote", RESTORATION.note);
    const rmeter = el("div", "rmeter");
    const rfill = el("i");
    rfill.style.width = `${restorationPct()}%`;
    rmeter.append(rfill);
    const rlbl = el("div", "rlbl");
    rlbl.append(
      el("span", undefined, `${RESTORATION.living} of ${RESTORATION.total} bays living`),
      el("span", undefined, `${restorationPct()}%`),
    );
    const btns = el("div", "wbtns");
    const habBtn = el("button", "gw-ghost-button", "View Habitats");
    habBtn.addEventListener("click", () => {
      this.closeWingModal();
      this.cb.openHabitats();
    });
    const closeBtn = el("button", "gw-primary-button", "Back to the lodge") as HTMLButtonElement;
    closeBtn.addEventListener("click", () => this.closeWingModal());
    btns.append(habBtn, closeBtn);
    card.append(wh, note, rmeter, rlbl, btns);
    this.wingModal.append(card);
    return this.wingModal;
  }

  private openWingModal(): void {
    this.wingModal.classList.add("on");
    window.addEventListener("keydown", this.modalEsc, true);
    (this.wingModal.querySelector(".gw-primary-button") as HTMLButtonElement | null)?.focus();
  }

  private closeWingModal(): void {
    this.wingModal.classList.remove("on");
    window.removeEventListener("keydown", this.modalEsc, true);
  }

  // ── Actions / lifecycle ───────────────────────────────────────────────────

  private act(action: EcoSectionAction): void {
    if (action.kind === "habitat") {
      this.cb.enterHabitat(action.habitat as PlayerHabitat);
    } else if (action.kind === "screen") {
      const go: Record<typeof action.screen, () => void> = {
        shop: () => this.cb.openShop(),
        inventory: () => this.cb.openInventory(),
        guide: () => this.cb.openGuide(),
        album: () => this.cb.openAlbum(),
        settings: () => this.cb.openSettings(),
        habitats: () => this.cb.openHabitats(),
      };
      go[action.screen]();
    } else {
      this.openWingModal();
    }
  }

  mount(parent: HTMLElement): void {
    parent.append(this.root);
  }

  get open(): boolean {
    return this.root.classList.contains("open");
  }

  show(lastHabitat: PlayerHabitat): void {
    this.lastHabitat = lastHabitat;
    const backTo =
      lastHabitat === "lizard" ? "Back to the vivarium" : lastHabitat === "frog" ? "Back to the paludarium" : "Back to the aquarium";
    this.continueBtn.replaceChildren(document.createTextNode("Continue"), gwIcon("leaf", 14, "#eafbe9"), el("span", "subtx", backTo));
    this.root.classList.add("open");
    if (this.parallax.raf === 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.addEventListener("pointermove", this.pointerPar);
      this.parallax.raf = requestAnimationFrame(this.tickPar);
    }
  }

  hide(): void {
    this.closeWingModal();
    if (this.parallax.raf !== 0) {
      cancelAnimationFrame(this.parallax.raf);
      this.parallax.raf = 0;
      window.removeEventListener("pointermove", this.pointerPar);
    }
    this.root.classList.remove("open");
  }

  update(state: GameState): void {
    if (!this.open) return;
    this.ecoNum.textContent = state.resources.leaves.toLocaleString();
    this.clockDay.textContent = `Day ${state.clock.day} · ${fmtClockPref(state.clock.minutes)}`;
    const h = state.clock.minutes / 60;
    const night = h < 6 || h >= 19;
    this.clockIcon.replaceChildren(gwIcon(night ? "moon" : "sun", 15, "#f0b64b"));
    this.clockSub.textContent = `${greetingFor(h).replace(" at the eco-center", "")} at Glasswater`;

    const data = this.cb.careData();
    const tank = getActiveTank(state);
    const setLive = (kind: PlayerHabitat, score: number | null): void => {
      const row = this.rows.get(kind);
      if (row) {
        row.pct.textContent = score != null ? `${Math.round(score)}%` : "New";
        row.fill.style.width = `${score != null ? Math.max(0, Math.min(100, Math.round(score))) : 0}%`;
      }
    };
    const liz = data.habitats.find((hb) => hb.id === "lizard");
    const fro = data.habitats.find((hb) => hb.id === "frog");
    setLive("lizard", liz?.score ?? null);
    setLive("fish", tank.habitatScore);
    setLive("frog", fro?.score ?? null);

    // Real reminders → atrium alert dots + the daily-care card.
    const remindersOn = getPrefs().reminders;
    const reminders = remindersOn
      ? deriveReminders(data.habitats.map((hb) => ({ id: hb.id, name: hb.name ?? hb.id, signals: hb.signals })))
      : [];
    const TONE: Record<ReminderDef["tone"], string> = { red: "#ef7a5e", amber: "#f0b64b", blue: "#5db9f0" };
    for (const dot of this.alerts.values()) dot.style.display = "none";
    for (const r of reminders) {
      const dot = this.alerts.get(r.habitatId as PlayerHabitat);
      if (dot && dot.style.display === "none") {
        dot.style.display = "block";
        dot.style.background = TONE[r.tone];
      }
    }

    this.carePanel.classList.toggle("warn", reminders.length > 0);
    this.careHead.replaceChildren();
    this.careItems.replaceChildren();
    const ring = el("span", "ring");
    const txt = el("span", "txt");
    if (!remindersOn) {
      ring.append(gwIcon("bell", 15, "#f0b64b"));
      txt.append(el("span", "ttl", "Reminders Off"), el("span", "sub", "Settings › Gameplay turns them back on."));
      this.careHead.append(txt, ring);
    } else if (reminders.length === 0) {
      ring.append(gwIcon("check", 16, "#8ce25a"));
      txt.append(el("span", "ttl", "Daily Care Complete"), el("span", "sub", "Great work, Keeper! All habitats are healthy."));
      this.careHead.append(txt, ring);
    } else {
      ring.append(gwIcon("bell", 15, "#f0b64b"));
      txt.append(
        el("span", "ttl", "Today's Care"),
        el("span", "sub", reminders.length === 1 ? "One thing needs your attention." : `${reminders.length} things need your attention.`),
      );
      this.careHead.append(txt, ring);
      for (const r of reminders.slice(0, 3)) {
        const chip = el("span", "rem");
        const dot = el("span", "dot");
        dot.style.background = TONE[r.tone];
        chip.append(dot, document.createTextNode(r.label), el("span", "hb", r.habitatName));
        this.careItems.append(chip);
      }
      if (reminders.length > 3) this.careItems.append(el("span", "rem", `+${reminders.length - 3} more — see Habitats`));
    }
  }
}

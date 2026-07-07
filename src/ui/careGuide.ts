/**
 * CARE GUIDE SCREEN — reference-match renderer for the in-game care
 * encyclopedia (Designs/Care_Guide/Screenshot 2026-07-03 at 11.33.51 PM.png):
 * a header panel with eight chapter tabs, a hero card with art + an info
 * strip, expandable topic cards, a right sidebar (Quick Reference · setup
 * checklist · Track Your Knowledge) and a live status footer — all real gw
 * components over the cozy eco-center room, never a pasted screenshot.
 *
 * All copy/structure comes from src/data/careGuide.ts (data-driven tabs);
 * temperatures format through prefs so the °F/°C setting applies. Hosted by
 * HubScreens (the hub's Care Guide door); this module owns only the guide.
 *
 * Design note: this design batch (Care_Guide + Supply_Shop references) sets
 * display headings in a warm serif over the sans body — scoped here as
 * --cg-display, not a global gwTheme change.
 */
import {
  CARE_FACTS,
  CARE_GUIDE_DEFAULT_TAB,
  CARE_GUIDE_TABS,
  careTabById,
  type CareCard,
  type CareTabDef,
  type CareTabId,
  type CareValue,
  type QuickGroup,
} from "../data/careGuide";
import { gwEl as el, ensureGwStyles, gwBackPill } from "./gwTheme";
import { gwIcon, type GwIconName } from "./gwIcons";
import { fmtTempRange } from "./prefs";
import { ASSETS } from "../data/assets";
import { speciesList, RARITY_COLORS } from "../data/species";

export interface CareGuideStats {
  /** Leaves — the design language calls the currency "Eco Points". */
  ecoPoints: number;
  habitats: number;
  reputation: number;
  dayLabel: string;
}

export interface CareGuideCallbacks {
  close(): void;
  stats(): CareGuideStats;
}

const AMBER = "#f0b64b";
const GREEN = "#8ce25a";
const BLUE = "#7fc7e8";

/** Per-strip-item icon tints so the row reads warm but not monochrome. */
const STRIP_TINTS: Partial<Record<GwIconName, string>> = {
  snow: BLUE,
  drop: BLUE,
  leaf: GREEN,
  sprout: GREEN,
  fish: BLUE,
};

let stylesIn = false;
function ensureStyles(): void {
  if (stylesIn) return;
  stylesIn = true;
  const css = `
  .gw-cg { --cg-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
    position: relative; flex: 1; display: flex; flex-direction: column; min-height: 0;
    color: var(--gw-ink); font-family: var(--gw-font); }
  .gw-cg .cg-bg { position: absolute; inset: 0; background-size: cover; background-position: center 34%;
    filter: saturate(1.04); }
  .gw-cg .cg-bg::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(6,10,9,0.88) 0%, rgba(6,10,9,0.72) 40%, rgba(5,8,7,0.9) 100%); }
  .gw-cg-wrap { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; min-height: 0;
    gap: clamp(10px, 1.6vh, 14px); width: 100%; max-width: 1680px; margin: 0 auto;
    padding: clamp(12px, 2.2vh, 22px) clamp(14px, 2.2vw, 34px); }

  .gw-cg button:focus-visible { outline: 2px solid var(--gw-green); outline-offset: 2px; border-radius: 8px; }
  @media (prefers-reduced-motion: reduce) { .gw-cg *, .gw-cg *::after { transition-duration: 0.01ms !important; } }

  /* ── Header: book + title, chapter tabs ─────────────────────────────── */
  .gw-cg-head { padding: clamp(12px, 1.8vh, 18px) clamp(14px, 1.6vw, 24px) 10px; flex: 0 0 auto; }
  .gw-cg-head .hrow { display: flex; align-items: center; gap: 13px; }
  .gw-cg-head .hicon { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center;
    background: radial-gradient(circle at 35% 30%, rgba(240,182,75,0.22), rgba(240,182,75,0.06) 78%);
    border: 1px solid rgba(240,182,75,0.3); color: var(--gw-amber); flex: 0 0 auto; }
  .gw-cg-head .t { font: 600 clamp(23px, 2.2vw, 29px)/1.05 var(--cg-display); letter-spacing: 0.4px; }
  .gw-cg-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 11px; padding-top: 11px;
    border-top: 1px solid rgba(255,255,255,0.06); }
  .gw-cg-tab { appearance: none; cursor: pointer; border: 1.5px solid transparent; border-radius: 12px;
    padding: 9px 16px; background: transparent; color: var(--gw-ink-dim); font: 600 12.5px/1 var(--gw-font);
    white-space: nowrap; transition: color 0.16s, background 0.16s, border-color 0.16s; }
  .gw-cg-tab:hover { color: var(--gw-ink); background: rgba(255,255,255,0.06); }
  .gw-cg-tab.gw-active { color: var(--gw-green); border-color: var(--gw-green-line);
    background: var(--gw-green-soft); box-shadow: 0 0 16px rgba(140,226,90,0.14); }

  /* ── Columns ────────────────────────────────────────────────────────── */
  .gw-cg-cols { flex: 1; min-height: 0; display: flex; gap: clamp(10px, 1.2vw, 16px); }
  .gw-cg-main { flex: 1; min-width: 0; overflow-y: auto; display: flex; flex-direction: column;
    gap: clamp(11px, 1.6vh, 16px); padding-right: 3px; padding-bottom: 4px;
    scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }
  .gw-cg-side { width: clamp(272px, 20.5vw, 322px); flex: 0 0 auto; overflow-y: auto;
    display: flex; flex-direction: column; gap: clamp(10px, 1.5vh, 14px); padding-bottom: 4px;
    scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }

  /* ── Hero card + info strip ─────────────────────────────────────────── */
  .gw-cg-hero { padding: clamp(15px, 2vh, 22px) clamp(16px, 1.8vw, 26px); flex: 0 0 auto; }
  .gw-cg-hero .top { display: flex; gap: clamp(14px, 2vw, 26px); align-items: stretch; }
  .gw-cg-hero .htx { flex: 1 1 46%; min-width: 240px; display: flex; flex-direction: column; }
  .gw-cg-hero .ht { font: 600 clamp(26px, 2.6vw, 34px)/1.08 var(--cg-display); letter-spacing: 0.3px; }
  .gw-cg-hero .hs { font: 600 clamp(13px, 1.15vw, 15px)/1.45 var(--gw-font); color: var(--gw-green); margin-top: 9px; max-width: 40ch; }
  .gw-cg-hero .hb { font: 400 13px/1.62 var(--gw-font); color: var(--gw-ink-dim); margin-top: 9px; max-width: 54ch; }
  .gw-cg-hero .hart { flex: 1.25 1 54%; min-width: 0; border-radius: 14px; overflow: hidden; position: relative;
    background: radial-gradient(circle at 40% 30%, #3a3226, #17140e 82%);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), 0 10px 30px rgba(0,0,0,0.4);
    min-height: clamp(150px, 22vh, 240px); }
  .gw-cg-hero .hart img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .gw-cg-hero .hart::after { content: ""; position: absolute; inset: 0;
    box-shadow: inset 0 -26px 40px -22px rgba(0,0,0,0.65); pointer-events: none; }
  .gw-cg-hero .hart .cap { position: absolute; left: 10px; bottom: 10px; z-index: 1; display: inline-flex;
    align-items: center; gap: 7px; padding: 6px 12px; border-radius: 999px; max-width: calc(100% - 20px);
    background: rgba(8,10,9,0.74); border: 1px solid rgba(255,255,255,0.14); color: #dfe4da;
    font: 600 10.5px/1.2 var(--gw-font); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }

  .gw-cg-strip { display: flex; align-items: stretch; margin-top: clamp(12px, 1.8vh, 18px);
    padding-top: clamp(10px, 1.5vh, 14px); border-top: 1px solid rgba(255,255,255,0.07); }
  .gw-cg-strip .item { flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: 11px; padding: 2px 16px; }
  .gw-cg-strip .item + .item { border-left: 1px solid rgba(255,255,255,0.07); }
  .gw-cg-strip .item:first-child { padding-left: 4px; }
  .gw-cg-strip .tx { min-width: 0; }
  .gw-cg-strip .k { font: 600 11px/1.2 var(--gw-font); color: var(--gw-ink-dim); white-space: nowrap; }
  .gw-cg-strip .v { font: 700 13.5px/1.25 var(--gw-font); margin-top: 2px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }

  /* ── Section + topic cards ──────────────────────────────────────────── */
  .gw-cg-sect { flex: 0 0 auto; }
  .gw-cg-sect .st { font: 600 clamp(17px, 1.5vw, 21px)/1.15 var(--cg-display); letter-spacing: 0.3px; margin: 4px 2px 3px; }
  .gw-cg-sect .ss { font: 500 11.5px/1.4 var(--gw-font); color: var(--gw-ink-dim); margin: 0 2px 10px; }
  .gw-cg-sect .st + .gw-cg-grid { margin-top: 9px; }
  .gw-cg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(296px, 1fr)); gap: 11px; }
  /* Reference layout: photo/icon tile LEFT, title + body to its right, the
     whole card clickable (Learn more is the visible affordance). */
  .gw-cg-card { display: grid; grid-template-columns: 88px minmax(0, 1fr); grid-template-rows: auto auto auto;
    column-gap: 13px; align-content: start; cursor: pointer; padding: 14px 15px 13px;
    border-radius: 16px; background: rgba(13,15,13,0.66); border: 1.5px solid var(--gw-border-soft);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    transition: border-color 0.18s, box-shadow 0.18s, transform 0.15s, background 0.18s; }
  .gw-cg-card:hover { border-color: rgba(140,226,90,0.32); background: rgba(18,21,17,0.72);
    box-shadow: 0 10px 30px rgba(0,0,0,0.35), 0 0 18px rgba(140,226,90,0.08); transform: translateY(-2px); }
  .gw-cg-card.open { border-color: var(--gw-green-line); box-shadow: 0 0 20px rgba(140,226,90,0.16); }
  .gw-cg-card .cic { grid-row: 1 / span 3; grid-column: 1; width: 88px; height: 88px; border-radius: 13px;
    display: grid; place-items: center; font-size: 34px; color: var(--gw-amber); overflow: hidden;
    background: radial-gradient(circle at 36% 30%, #40342033, #17140e); border: 1px solid rgba(240,182,75,0.22);
    box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25); }
  .gw-cg-card .cic img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .gw-cg-card .ct { grid-column: 2; font: 600 15.5px/1.25 var(--cg-display); letter-spacing: 0.2px; margin-top: 1px; }
  .gw-cg-card .cb { grid-column: 2; font: 400 12.5px/1.55 var(--gw-font); color: var(--gw-ink-dim); margin-top: 5px; }
  .gw-cg-card .cmore { grid-column: 2; justify-self: start; appearance: none; cursor: pointer; border: none;
    background: none; padding: 0; margin-top: 9px; display: inline-flex; align-items: center; gap: 7px;
    color: var(--gw-green); font: 700 12px/1 var(--gw-font); transition: gap 0.16s, filter 0.16s; }
  .gw-cg-card:hover .cmore { gap: 10px; filter: brightness(1.12); }
  .gw-cg-card .cdetail { grid-column: 1 / -1; width: 100%; margin: 11px 0 0; padding: 10px 0 0; list-style: none;
    border-top: 1px solid rgba(255,255,255,0.08); }
  .gw-cg-card .cdetail[hidden] { display: none; }
  .gw-cg-card .cdetail li { position: relative; padding: 4px 0 4px 16px; font: 400 12.5px/1.55 var(--gw-font); color: var(--gw-ink); }
  .gw-cg-card .cdetail li::before { content: ""; position: absolute; left: 2px; top: 12px; width: 5px; height: 5px;
    border-radius: 50%; background: var(--gw-green); opacity: 0.8; }

  /* ── FAQ accordion ──────────────────────────────────────────────────── */
  .gw-cg-faq { display: flex; flex-direction: column; gap: 9px; }
  .gw-cg-faqitem { border-radius: 15px; background: rgba(13,15,13,0.66); border: 1.5px solid var(--gw-border-soft);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    transition: border-color 0.18s, box-shadow 0.18s; overflow: hidden; }
  .gw-cg-faqitem.open { border-color: var(--gw-green-line); box-shadow: 0 0 18px rgba(140,226,90,0.13); }
  .gw-cg-faqitem .q { appearance: none; cursor: pointer; border: none; background: none; width: 100%;
    display: flex; align-items: center; gap: 12px; text-align: left; padding: 13px 15px;
    color: var(--gw-ink); font: 600 14.5px/1.3 var(--cg-display); letter-spacing: 0.2px; }
  .gw-cg-faqitem .q:hover { background: rgba(255,255,255,0.045); }
  .gw-cg-faqitem .q .chev { margin-left: auto; color: var(--gw-ink-dim); transition: transform 0.18s; flex: 0 0 auto; }
  .gw-cg-faqitem.open .q .chev { transform: rotate(90deg); color: var(--gw-green); }
  .gw-cg-faqitem .a { padding: 0 15px 13px 15px; font: 400 12.5px/1.62 var(--gw-font); color: var(--gw-ink-dim); max-width: 88ch; }
  .gw-cg-faqitem .a[hidden] { display: none; }

  /* ── Species encyclopedia grid (Overview) ───────────────────────────── */
  .gw-cg .gw-species-card { border-radius: 16px; overflow: hidden; background: rgba(13,15,13,0.66);
    border: 1.5px solid var(--gw-border-soft); transition: border-color 0.18s, transform 0.15s; }
  .gw-cg .gw-species-card:hover { border-color: rgba(255,255,255,0.18); transform: translateY(-2px); }
  .gw-cg .gw-species-card .ph { height: 92px; display: grid; place-items: center;
    background: radial-gradient(circle at 42% 34%, #14444d, #0a1a1e 82%); }
  .gw-cg .gw-species-card .ph img { max-width: 82%; max-height: 86%; object-fit: contain; }
  .gw-cg .gw-species-card .tx { padding: 10px 12px 12px; }
  .gw-cg .gw-species-card .nm { font: 600 13.5px/1.2 var(--cg-display); }
  .gw-cg .gw-species-card .lt { font: italic 500 10.5px/1.2 var(--gw-font); color: var(--gw-ink-dim); margin-top: 1px; }
  .gw-cg .gw-species-card .bl { font: 500 10.5px/1.45 var(--gw-font); color: var(--gw-ink-dim); margin-top: 6px; }
  .gw-cg .gw-species-card .tags { display: flex; gap: 5px; margin-top: 8px; }
  .gw-cg .gw-species-card .rt { font: 700 9.5px/1 var(--gw-font); padding: 4px 8px; border-radius: 999px; border: 1px solid; }

  /* ── Sidebar panels ─────────────────────────────────────────────────── */
  .gw-cg-panel { padding: 14px 16px 15px; flex: 0 0 auto; }
  .gw-cg-panel .pt { display: flex; align-items: center; gap: 9px; font: 600 16px/1.15 var(--cg-display); letter-spacing: 0.2px; }
  .gw-cg-qgroup { margin-top: 13px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.07); }
  .gw-cg-qgroup:first-of-type { margin-top: 11px; padding-top: 0; border-top: none; }
  .gw-cg-qgroup .gh { display: flex; align-items: center; gap: 8px; font: 700 12.5px/1.2 var(--gw-font); }
  .gw-cg-qgroup .facts { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
  .gw-cg-qgroup .frow { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .gw-cg-qgroup .fk { font: 500 12px/1.3 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-cg-qgroup .fv { font: 700 12.5px/1.3 var(--gw-font); text-align: right; font-variant-numeric: tabular-nums; }
  .gw-cg-qgroup .note { margin-top: 8px; font: 400 11.5px/1.55 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-cg-qgroup .dial { display: flex; align-items: center; gap: 12px; margin-top: 9px; }
  .gw-cg-qgroup .dial .dv { font: 800 19px/1 var(--gw-font); letter-spacing: -0.3px; }
  .gw-cg-qgroup .dial .dc { font: 500 11px/1.3 var(--gw-font); color: var(--gw-ink-dim); margin-top: 4px; }
  .gw-cg-qgroup .dial svg { margin-left: auto; flex: 0 0 auto; }

  .gw-cg-check { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
  .gw-cg-check .crow { display: flex; align-items: center; gap: 10px; }
  .gw-cg-check .cbox { width: 19px; height: 19px; border-radius: 50%; flex: 0 0 auto; display: grid; place-items: center; }
  .gw-cg-check .crow.done .cbox { background: var(--gw-green); color: #10240b;
    box-shadow: 0 0 8px rgba(140,226,90,0.35); }
  .gw-cg-check .crow.todo .cbox { border: 1.7px solid rgba(255,255,255,0.32); }
  .gw-cg-check .cl { font: 500 12.5px/1.35 var(--gw-font); }
  .gw-cg-check .crow.todo .cl { color: var(--gw-ink-dim); }

  /* "Did You Know?" field note — a rotating true fact (a new one per chapter). */
  .gw-cg-fact { padding: 14px 16px 15px; border-radius: var(--gw-radius); flex: 0 0 auto;
    background: linear-gradient(180deg, rgba(240,182,75,0.12), rgba(240,182,75,0.05));
    border: 1.5px solid rgba(240,182,75,0.36); color: var(--gw-ink);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    box-shadow: 0 12px 32px rgba(0,0,0,0.35); }
  .gw-cg-fact .ft { display: flex; align-items: center; gap: 9px; font: 600 15px/1.15 var(--cg-display);
    color: var(--gw-amber); letter-spacing: 0.2px; }
  .gw-cg-fact .fx { font: 400 12.5px/1.6 var(--gw-font); margin-top: 8px; }

  /* ── Footer status bar ──────────────────────────────────────────────── */
  .gw-cg-foot { flex: 0 0 auto; display: flex; align-items: center; gap: clamp(10px, 1.4vw, 20px);
    padding: 11px clamp(14px, 1.6vw, 22px); border-radius: 18px; }
  .gw-cg-foot .fstat { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .gw-cg-foot .fstat + .fstat { border-left: 1px solid rgba(255,255,255,0.08); padding-left: clamp(10px, 1.4vw, 20px); }
  .gw-cg-foot .fk { font: 600 10px/1.1 var(--gw-font); letter-spacing: 0.9px; text-transform: uppercase;
    color: var(--gw-ink-dim); white-space: nowrap; }
  .gw-cg-foot .fv { font: 800 14px/1.15 var(--gw-font); font-variant-numeric: tabular-nums; margin-top: 2px; white-space: nowrap; }
  .gw-cg-foot .spacer { flex: 1; }
  .gw-cg-foot .gw-ghost-button { display: inline-flex; align-items: center; gap: 8px; }
  .gw-cg-faqbtn { appearance: none; cursor: pointer; display: inline-flex; align-items: center; gap: 9px;
    padding: 10px 16px; border-radius: 999px; background: rgba(255,255,255,0.045);
    border: 1px solid var(--gw-border-soft); color: var(--gw-ink); font: 600 12px/1 var(--gw-font);
    transition: background 0.15s, border-color 0.15s; }
  .gw-cg-faqbtn:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.18); }
  .gw-cg-faqbtn .qm { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
    border: 1.4px solid var(--gw-amber); color: var(--gw-amber); font: 800 11px/1 var(--gw-font); }

  /* ── Responsive ─────────────────────────────────────────────────────── */
  @media (max-width: 1240px) {
    .gw-cg-cols { flex-direction: column; overflow-y: auto; }
    .gw-cg-main { overflow: visible; flex: 0 0 auto; padding-right: 0; }
    .gw-cg-side { width: auto; overflow: visible; flex-direction: row; flex-wrap: wrap; align-items: stretch; }
    .gw-cg-side > * { flex: 1 1 262px; }
  }
  @media (max-width: 880px) {
    .gw-cg-hero .top { flex-direction: column; }
    .gw-cg-hero .hart { min-height: clamp(140px, 24vh, 200px); }
    .gw-cg-strip { flex-wrap: wrap; gap: 6px 0; }
    .gw-cg-strip .item { flex: 1 1 46%; border-left: none !important; padding: 5px 10px 5px 4px; }
    .gw-cg-foot { flex-wrap: wrap; }
    .gw-cg-foot .spacer { flex-basis: 100%; order: 5; display: none; }
  }
  `;
  const tag = document.createElement("style");
  tag.id = "gw-careguide-styles";
  tag.textContent = css;
  document.head.append(tag);
}

/** Format a strip/fact value; temperature bands honor the °F/°C preference. */
function fmtValue(v: CareValue): string {
  return typeof v === "string" ? v : fmtTempRange(v.tempC[0], v.tempC[1]);
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Small arc dial (the reference's humidity gauge): green band on a track. */
function dialSvg(lo: number, hi: number, min: number, max: number): SVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 54 46");
  svg.setAttribute("width", "54");
  svg.setAttribute("height", "46");
  svg.setAttribute("aria-hidden", "true");
  const SPAN = 240; // -120°..120°
  const a = (t: number) => -120 + ((t - min) / (max - min)) * SPAN;
  const track = document.createElementNS(NS, "path");
  track.setAttribute("d", arcPath(27, 26, 18, -120, 120));
  track.setAttribute("stroke", "rgba(255,255,255,0.14)");
  const band = document.createElementNS(NS, "path");
  band.setAttribute("d", arcPath(27, 26, 18, a(lo), a(hi)));
  band.setAttribute("stroke", GREEN);
  for (const p of [track, band]) {
    p.setAttribute("fill", "none");
    p.setAttribute("stroke-width", "5");
    p.setAttribute("stroke-linecap", "round");
  }
  const needle = document.createElementNS(NS, "line");
  const [nx, ny] = polar(27, 26, 12.5, a((lo + hi) / 2));
  needle.setAttribute("x1", "27");
  needle.setAttribute("y1", "26");
  needle.setAttribute("x2", nx.toFixed(2));
  needle.setAttribute("y2", ny.toFixed(2));
  needle.setAttribute("stroke", "#e9eee2");
  needle.setAttribute("stroke-width", "2.2");
  needle.setAttribute("stroke-linecap", "round");
  const hub = document.createElementNS(NS, "circle");
  hub.setAttribute("cx", "27");
  hub.setAttribute("cy", "26");
  hub.setAttribute("r", "2.6");
  hub.setAttribute("fill", "#e9eee2");
  svg.append(track, band, needle, hub);
  return svg;
}

export class CareGuideView {
  readonly root: HTMLElement;
  private tabsRow!: HTMLElement;
  private main!: HTMLElement;
  private side!: HTMLElement;
  private foot!: HTMLElement;
  private active: CareTabId = CARE_GUIDE_DEFAULT_TAB;
  /** Open learn-more/FAQ items — Esc collapses these before closing the screen. */
  private expanded = new Set<HTMLElement>();
  /** Rotates the sidebar's "Did You Know?" note — one new fact per chapter view. */
  private factIdx = 0;

  constructor(private cb: CareGuideCallbacks) {
    ensureGwStyles();
    ensureStyles();
    this.root = el("div", "gw-cg");
    const bg = el("div", "cg-bg");
    bg.style.backgroundImage = `url("${ASSETS.room.ecocenter}")`;
    const wrap = el("div", "gw-cg-wrap");

    // Header panel: book icon + title + the eight chapter tabs.
    const head = el("div", "gw-panel gw-cg-head");
    const hrow = el("div", "hrow");
    const hicon = el("span", "hicon");
    hicon.append(gwIcon("book", 22));
    hrow.append(gwBackPill(() => this.cb.close()), hicon, el("div", "t", "Care Guide"));
    this.tabsRow = el("div", "gw-cg-tabs");
    this.tabsRow.setAttribute("role", "tablist");
    for (const tab of CARE_GUIDE_TABS) {
      const b = el("button", "gw-cg-tab", tab.label);
      b.dataset.tab = tab.id;
      b.setAttribute("role", "tab");
      b.addEventListener("click", () => this.setTab(tab.id));
      this.tabsRow.append(b);
    }
    head.append(hrow, this.tabsRow);

    // Columns: scrolling main + sidebar.
    const cols = el("div", "gw-cg-cols");
    this.main = el("div", "gw-cg-main");
    this.side = el("div", "gw-cg-side");
    cols.append(this.main, this.side);

    // Footer status bar.
    this.foot = el("div", "gw-panel gw-cg-foot");

    wrap.append(head, cols, this.foot);
    this.root.append(bg, wrap);
  }

  /** Called by the host every time the guide opens. */
  show(): void {
    this.renderTab();
    this.refreshFooter();
  }

  /** Esc first collapses any open detail; returns true when it consumed the key. */
  handleEscape(): boolean {
    if (this.expanded.size === 0) return false;
    for (const item of [...this.expanded]) this.collapse(item);
    return true;
  }

  private setTab(id: CareTabId): void {
    if (id === this.active) return;
    this.active = id;
    this.factIdx += 1;
    this.renderTab();
    this.refreshFooter();
    this.main.scrollTop = 0;
    this.side.scrollTop = 0;
  }

  // ── Expand/collapse plumbing ───────────────────────────────────────────

  private expand(item: HTMLElement): void {
    item.classList.add("open");
    const detail = item.querySelector<HTMLElement>("[data-detail]");
    const btn = item.querySelector<HTMLElement>("[data-toggle]");
    if (detail) detail.hidden = false;
    btn?.setAttribute("aria-expanded", "true");
    const label = btn?.querySelector<HTMLElement>("[data-label]");
    if (label && label.dataset.less) label.textContent = label.dataset.less;
    this.expanded.add(item);
  }

  private collapse(item: HTMLElement): void {
    item.classList.remove("open");
    const detail = item.querySelector<HTMLElement>("[data-detail]");
    const btn = item.querySelector<HTMLElement>("[data-toggle]");
    if (detail) detail.hidden = true;
    btn?.setAttribute("aria-expanded", "false");
    const label = btn?.querySelector<HTMLElement>("[data-label]");
    if (label && label.dataset.more) label.textContent = label.dataset.more;
    this.expanded.delete(item);
  }

  private toggle(item: HTMLElement): void {
    if (this.expanded.has(item)) this.collapse(item);
    else this.expand(item);
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  private renderTab(): void {
    const tab = careTabById(this.active);
    this.expanded.clear();
    for (const b of this.tabsRow.querySelectorAll<HTMLElement>(".gw-cg-tab")) {
      const on = b.dataset.tab === tab.id;
      b.classList.toggle("gw-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    }
    this.main.replaceChildren(this.buildHero(tab));
    for (const sect of tab.sections) this.main.append(this.buildSection(sect));
    if (tab.faq?.length) this.main.append(this.buildFaq(tab));
    this.renderSide(tab);
  }

  private buildHero(tab: CareTabDef): HTMLElement {
    const hero = el("div", "gw-panel gw-cg-hero");
    const top = el("div", "top");
    const htx = el("div", "htx");
    htx.append(el("div", "ht", tab.hero.title), el("div", "hs", tab.hero.tagline), el("div", "hb", tab.hero.body));
    top.append(htx);
    if (tab.hero.art) {
      const hart = el("div", "hart");
      const img = document.createElement("img");
      img.src = tab.hero.art;
      img.alt = tab.hero.artAlt ?? tab.hero.title;
      img.loading = "lazy";
      // A missing plate must never render as a broken-image glyph.
      img.addEventListener("error", () => hart.remove());
      hart.append(img);
      if (tab.hero.caption) {
        const cap = el("span", "cap");
        cap.append(gwIcon("camera", 12, "#9fd67e"), document.createTextNode(tab.hero.caption));
        hart.append(cap);
      }
      top.append(hart);
    }
    hero.append(top);
    if (tab.strip.length) {
      const strip = el("div", "gw-cg-strip");
      for (const item of tab.strip) {
        const it = el("div", "item");
        it.append(gwIcon(item.icon, 26, STRIP_TINTS[item.icon] ?? AMBER));
        const tx = el("div", "tx");
        tx.append(el("div", "k", item.label), el("div", "v", fmtValue(item.value)));
        it.append(tx);
        strip.append(it);
      }
      hero.append(strip);
    }
    return hero;
  }

  private buildSection(sect: { title: string; sub?: string; cards?: CareCard[]; speciesGrid?: boolean }): HTMLElement {
    const s = el("div", "gw-cg-sect");
    s.append(el("div", "st", sect.title));
    if (sect.sub) s.append(el("div", "ss", sect.sub));
    const grid = el("div", "gw-cg-grid");
    if (sect.speciesGrid) {
      for (const sp of speciesList()) grid.append(this.buildSpeciesCard(sp));
    } else {
      for (const card of sect.cards ?? []) grid.append(this.buildCard(card));
    }
    s.append(grid);
    return s;
  }

  private buildCard(card: CareCard): HTMLElement {
    const c = el("div", "gw-cg-card");
    const cic = el("div", "cic");
    if (card.art) {
      const img = document.createElement("img");
      img.src = card.art;
      img.alt = "";
      img.loading = "lazy";
      cic.append(img);
    } else if (card.emoji) {
      cic.textContent = card.emoji;
    } else {
      cic.append(gwIcon(card.icon, 24));
    }
    const more = el("button", "cmore");
    more.dataset.toggle = "1";
    more.setAttribute("aria-expanded", "false");
    const label = el("span", undefined, "Learn more");
    label.dataset.label = "1";
    label.dataset.more = "Learn more";
    label.dataset.less = "Show less";
    more.append(label, document.createTextNode("→"));
    const detail = el("ul", "cdetail") as HTMLUListElement;
    detail.dataset.detail = "1";
    detail.hidden = true;
    for (const line of card.more) detail.append(el("li", undefined, line));
    c.append(cic, el("div", "ct", card.title), el("div", "cb", card.body), more, detail);
    // The whole card is the click target (the Learn more link is the visible
    // affordance; it lives inside the card, so one listener covers both).
    // Clicks inside the open notes don't collapse — text stays selectable.
    c.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".cdetail")) return;
      this.toggle(c);
    });
    return c;
  }

  private buildSpeciesCard(sp: ReturnType<typeof speciesList>[number]): HTMLElement {
    const card = el("div", "gw-species-card");
    const ph = el("div", "ph");
    const img = document.createElement("img");
    img.src = ASSETS.creatures[sp.asset as keyof typeof ASSETS.creatures];
    img.alt = sp.name;
    img.loading = "lazy";
    ph.append(img);
    const tx = el("div", "tx");
    const tags = el("div", "tags");
    const rt = el("span", "rt", sp.rarity);
    rt.style.color = RARITY_COLORS[sp.rarity];
    rt.style.borderColor = `${RARITY_COLORS[sp.rarity]}55`;
    tags.append(rt, el("span", "rt", sp.type));
    tx.append(el("div", "nm", sp.name), el("div", "lt", sp.latin), el("div", "bl", sp.blurb), tags);
    card.append(ph, tx);
    return card;
  }

  private buildFaq(tab: CareTabDef): HTMLElement {
    const wrap = el("div", "gw-cg-sect");
    const list = el("div", "gw-cg-faq");
    for (const entry of tab.faq ?? []) {
      const item = el("div", "gw-cg-faqitem");
      const q = el("button", "q");
      q.dataset.toggle = "1";
      q.setAttribute("aria-expanded", "false");
      const chev = el("span", "chev", "›");
      q.append(document.createTextNode(entry.q), chev);
      q.addEventListener("click", () => this.toggle(item));
      const a = el("div", "a", entry.a);
      a.dataset.detail = "1";
      a.hidden = true;
      item.append(q, a);
      list.append(item);
    }
    wrap.append(list);
    return wrap;
  }

  private renderSide(tab: CareTabDef): void {
    this.side.replaceChildren();

    // Quick Reference.
    const qr = el("div", "gw-panel gw-cg-panel");
    const qt = el("div", "pt");
    qt.append(gwIcon("leaf", 17, GREEN), document.createTextNode("Quick Reference"));
    qr.append(qt);
    for (const group of tab.quickRef.groups) qr.append(this.buildQuickGroup(group));
    this.side.append(qr);

    // Checklist.
    if (tab.checklist) {
      const ck = el("div", "gw-panel gw-cg-panel");
      const ct = el("div", "pt");
      ct.append(gwIcon("leaf", 17, GREEN), document.createTextNode(tab.checklist.title));
      const list = el("div", "gw-cg-check");
      for (const item of tab.checklist.items) {
        const row = el("div", `crow ${item.done ? "done" : "todo"}`);
        const box = el("span", "cbox");
        if (item.done) box.append(gwIcon("check", 11));
        row.append(box, el("span", "cl", item.label));
        list.append(row);
      }
      ck.append(ct, list);
      this.side.append(ck);
    }

    // "Did You Know?" — a rotating true field note (a fresh one per chapter).
    const fact = el("div", "gw-cg-fact");
    const ft = el("div", "ft");
    ft.append(gwIcon("sparkle", 16, AMBER), document.createTextNode("Did You Know?"));
    fact.append(ft, el("div", "fx", CARE_FACTS[this.factIdx % CARE_FACTS.length]));
    this.side.append(fact);
  }

  private buildQuickGroup(group: QuickGroup): HTMLElement {
    const g = el("div", "gw-cg-qgroup");
    const gh = el("div", "gh");
    gh.append(gwIcon(group.icon, 15, STRIP_TINTS[group.icon] ?? AMBER), document.createTextNode(group.title));
    g.append(gh);
    if (group.facts) {
      const facts = el("div", "facts");
      for (const f of group.facts) {
        const row = el("div", "frow");
        const fv = el("span", "fv", fmtValue(f.value));
        fv.style.color = f.tint === "amber" ? AMBER : f.tint === "blue" ? BLUE : f.tint === "green" ? GREEN : "var(--gw-ink)";
        row.append(el("span", "fk", f.label), fv);
        facts.append(row);
      }
      g.append(facts);
    }
    if (group.dial) {
      const d = group.dial;
      const dial = el("div", "dial");
      const tx = el("div");
      tx.append(el("div", "dv", `${d.lo}–${d.hi}${d.unit}`), el("div", "dc", d.caption));
      dial.append(tx, dialSvg(d.lo, d.hi, d.min, d.max));
      g.append(dial);
    }
    if (group.note) g.append(el("div", "note", group.note));
    return g;
  }

  private refreshFooter(): void {
    const s = this.cb.stats();
    this.foot.replaceChildren();
    const stat = (icon: GwIconName, tint: string, label: string, value: string): HTMLElement => {
      const w = el("div", "fstat");
      w.append(gwIcon(icon, 20, tint));
      const tx = el("div");
      tx.append(el("div", "fk", label), el("div", "fv", value));
      w.append(tx);
      return w;
    };
    this.foot.append(
      stat("leaf", GREEN, "Eco Points", s.ecoPoints.toLocaleString()),
      stat("house", AMBER, "Habitats", `${s.habitats} restored`),
      stat("star", AMBER, "Reputation", s.reputation.toLocaleString()),
      stat("clock", BLUE, "In-Game Time", s.dayLabel),
    );
    this.foot.append(el("div", "spacer"));
    const back = el("button", "gw-ghost-button", "‹ Back");
    back.addEventListener("click", () => this.cb.close());
    const faq = el("button", "gw-cg-faqbtn");
    faq.append(el("span", "qm", "?"), document.createTextNode("Need more help? Visit FAQ"));
    faq.addEventListener("click", () => this.setTab("faq"));
    this.foot.append(back, faq);
  }
}

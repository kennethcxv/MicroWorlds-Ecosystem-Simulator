/**
 * HABITATS SCREEN — the eco-center's habitat management page, matching the
 * final reference (Designs/Habitats/Screenshot 2026-07-04 at 12.52.35 AM.png)
 * with real components over the cozy room:
 *
 *  · serif "Habitats" header + featured hero card (the SELECTED habitat —
 *    live score, real in-game render, Continue Caring / View Details / star),
 *  · Your Habitats · Recently Visited · Templates rows (selection re-features
 *    the hero; the Create New card and templates answer honestly),
 *  · right sidebar: Eco-Keeper (level derived from real reputation), Habitat
 *    Insights (real streak / live avg cleanliness / real photo count),
 *    Reminders derived from live habitat signals, Supply Shop promo,
 *  · the design batch's status footer (Eco Points · Habitats · Reputation ·
 *    In-Game Time · ‹ Back).
 *
 * Like the Care Guide, this batch has no left nav — the hub doors navigate.
 * Hosted by HubScreens ("habitats" case, host chrome hidden). All content
 * derives from src/data/habitats.ts + live callbacks; favorites persist in
 * localStorage. Esc chain: detail overlay → expanded reminders → close.
 */
import { gwEl as el, ensureGwStyles, gwBackPill } from "./gwTheme";
import { gwIcon } from "./gwIcons";
import { ASSETS } from "../data/assets";
import type { CareGuideStats } from "./careGuide";
import {
  CREATE_HABITAT_NOTE,
  HABITAT_CARDS,
  HABITATS_PROMO,
  TEMPLATE_IDEAS,
  TEMPLATES_PENDING_NOTE,
  deriveReminders,
  habitatCardById,
  keeperLevel,
  scoreWord,
  sortByRecent,
  streakCaption,
  visitLabel,
  type HabitatPageId,
  type HabitatSignals,
  type ReminderTone,
} from "../data/habitats";

export interface HabitatLive {
  id: HabitatPageId;
  /** Live layout name when known (overrides the registry default). */
  name?: string | null;
  score: number | null;
  signals: HabitatSignals;
  lastVisit: number | null;
}

export interface HabitatsLiveData {
  habitats: HabitatLive[];
  reputation: number;
  photoCount: number;
  streakDays: number;
  nowMs: number;
}

export interface HabitatsCallbacks {
  close(): void;
  enterHabitat(id: HabitatPageId): void;
  openShop(): void;
  toast(message: string): void;
  stats(): CareGuideStats;
  data(): HabitatsLiveData;
}

const FAVS_KEY = "gw_hb_favs";

function loadFavs(): Partial<Record<string, boolean>> {
  try {
    const raw = globalThis.localStorage?.getItem(FAVS_KEY);
    if (raw) return JSON.parse(raw) as Partial<Record<string, boolean>>;
  } catch {
    /* default */
  }
  return {};
}

const TONE_TINTS: Record<ReminderTone, string> = { red: "#ef7a5e", amber: "#f0b64b", blue: "#5db9f0" };

let stylesIn = false;
function ensureStyles(): void {
  if (stylesIn) return;
  stylesIn = true;
  const css = `
  .gw-hb { --hb-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
    position: relative; flex: 1; display: flex; flex-direction: column; min-height: 0;
    color: var(--gw-ink); font-family: var(--gw-font); }
  .gw-hb .hb-bg { position: absolute; inset: 0; background-size: cover; background-position: center 36%;
    filter: saturate(1.04); }
  .gw-hb .hb-bg::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(6,10,9,0.86) 0%, rgba(6,10,9,0.74) 42%, rgba(5,8,7,0.9) 100%); }
  .gw-hb-wrap { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; min-height: 0;
    gap: clamp(10px, 1.6vh, 14px); width: 100%; max-width: 1680px; margin: 0 auto;
    padding: clamp(12px, 2.2vh, 22px) clamp(14px, 2.2vw, 34px); }
  .gw-hb button:focus-visible { outline: 2px solid var(--gw-green); outline-offset: 2px; border-radius: 10px; }
  .gw-hb [role="button"]:focus-visible { outline: 2px solid var(--gw-green); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .gw-hb *, .gw-hb *::after { transition-duration: 0.01ms !important; } }

  /* ── Columns ────────────────────────────────────────────────────────── */
  .gw-hb-cols { flex: 1; min-height: 0; display: flex; gap: clamp(10px, 1.2vw, 16px); }
  .gw-hb-main { flex: 1; min-width: 0; overflow-y: auto; display: flex; flex-direction: column;
    gap: clamp(12px, 1.9vh, 18px); padding-right: 3px; padding-bottom: 6px;
    scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }
  .gw-hb-side { width: clamp(276px, 20.5vw, 326px); flex: 0 0 auto; overflow-y: auto;
    display: flex; flex-direction: column; gap: clamp(10px, 1.5vh, 14px); padding-bottom: 6px;
    scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }

  /* ── Page header ────────────────────────────────────────────────────── */
  .gw-hb-head { padding: clamp(4px, 1vh, 10px) 2px 0; }
  .gw-hb-head .t { font: 600 clamp(28px, 2.8vw, 38px)/1.05 var(--hb-display); letter-spacing: 0.4px; }
  .gw-hb-head .s { font: 500 12.5px/1.4 var(--gw-font); color: var(--gw-ink-dim); margin-top: 5px; }

  /* ── Featured hero ──────────────────────────────────────────────────── */
  .gw-hb-hero { position: relative; overflow: hidden; border-radius: 22px;
    border: 1.5px solid var(--gw-border); background: rgba(10,13,11,0.86);
    box-shadow: 0 18px 50px rgba(0,0,0,0.45); min-height: clamp(250px, 34vh, 330px);
    display: flex; flex: 0 0 auto; }
  .gw-hb-hero .hart { position: absolute; inset: 0; }
  .gw-hb-hero .hart img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .gw-hb-hero .hart::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(90deg, rgba(7,11,9,0.94) 0%, rgba(7,11,9,0.85) 32%, rgba(7,11,9,0.3) 58%, rgba(7,11,9,0.04) 82%),
      linear-gradient(0deg, rgba(7,11,9,0.5) 0%, rgba(7,11,9,0) 30%); }
  .gw-hb-hero .hin { position: relative; z-index: 1; display: flex; flex-direction: column; justify-content: center;
    gap: 9px; padding: clamp(16px, 2.4vh, 26px) clamp(16px, 1.8vw, 28px); max-width: min(46%, 520px); }
  .gw-hb-hero .heyebrow { font: 700 10.5px/1 var(--gw-font); letter-spacing: 1.8px; text-transform: uppercase;
    color: var(--gw-amber); display: flex; align-items: center; gap: 7px; }
  .gw-hb-hero .hname { font: 600 clamp(26px, 2.6vw, 36px)/1.08 var(--hb-display); letter-spacing: 0.3px;
    display: flex; align-items: center; gap: 11px; }
  .gw-hb-hero .hname .gw-ic { opacity: 0.9; }
  .gw-hb-hero .htype { font: 600 12.5px/1.3 var(--gw-font); color: var(--gw-ink-dim); margin-top: -3px; }
  .gw-hb-hero .hblurb { font: 500 12.5px/1.6 var(--gw-font); color: var(--gw-ink-dim); max-width: 46ch; }
  .gw-hb-hero .hstats { display: flex; gap: clamp(18px, 2vw, 30px); margin-top: 4px; }
  .gw-hb-hero .hstat .k { font: 600 10px/1.1 var(--gw-font); letter-spacing: 1px; text-transform: uppercase;
    color: var(--gw-ink-dim); }
  .gw-hb-hero .hstat .v { display: flex; align-items: baseline; gap: 7px; margin-top: 4px; }
  .gw-hb-hero .hstat .num { font: 800 26px/1 var(--gw-font); color: var(--gw-green); font-variant-numeric: tabular-nums; }
  .gw-hb-hero .hstat .word { font: 700 12.5px/1 var(--gw-font); color: var(--gw-green); }
  .gw-hb-hero .hstat .sp { font: 700 14px/1.2 var(--gw-font); display: flex; align-items: center; gap: 7px; }
  .gw-hb-hero .hbtns { display: flex; align-items: center; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
  .gw-hb-hero .hbtns .gw-ghost-button { display: inline-flex; align-items: center; gap: 8px; }
  .gw-hb-star { position: absolute; top: 14px; right: 14px; z-index: 2; appearance: none; cursor: pointer;
    width: 40px; height: 40px; border-radius: 13px; display: grid; place-items: center;
    background: rgba(10,12,10,0.72); border: 1.5px solid var(--gw-border-soft); color: rgba(240,182,75,0.5);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    transition: color 0.15s, border-color 0.15s, transform 0.12s; }
  .gw-hb-star:hover { transform: scale(1.06); border-color: rgba(240,182,75,0.5); }
  .gw-hb-star.on { color: var(--gw-amber); border-color: rgba(240,182,75,0.55);
    box-shadow: 0 0 14px rgba(240,182,75,0.18); }

  /* ── Card rows ──────────────────────────────────────────────────────── */
  .gw-hb-sect { display: flex; flex-direction: column; gap: 10px; flex: 0 0 auto; }
  .gw-hb-sect .shead { display: flex; align-items: center; gap: 10px; padding: 0 2px; }
  .gw-hb-sect .sicon { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center;
    background: var(--gw-green-soft); border: 1px solid var(--gw-green-line); color: var(--gw-green); flex: 0 0 auto; }
  .gw-hb-sect .st { font: 600 clamp(16px, 1.5vw, 20px)/1.15 var(--hb-display); letter-spacing: 0.3px; }
  .gw-hb-sect .shead .spacer { flex: 1; }
  .gw-hb-sect .sall { font: 600 11.5px/1 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-hb-arrow { appearance: none; cursor: pointer; width: 30px; height: 30px; border-radius: 999px;
    border: 1.5px solid var(--gw-border-soft); background: rgba(13,16,14,0.8); color: var(--gw-ink-dim);
    display: grid; place-items: center; transition: color 0.14s, border-color 0.14s, background 0.14s; }
  .gw-hb-arrow:hover { color: var(--gw-ink); border-color: rgba(255,255,255,0.24); background: rgba(24,28,24,0.9); }
  .gw-hb-arrow.back .gw-ic { transform: rotate(180deg); }
  .gw-hb-row { display: flex; gap: 12px; overflow-x: auto; padding: 3px 2px 6px;
    scroll-snap-type: x proximity; scrollbar-width: none; }
  .gw-hb-row::-webkit-scrollbar { display: none; }

  .gw-hb-cardwrap { position: relative; flex: 0 0 auto; width: clamp(232px, 17vw, 268px); scroll-snap-align: start; }
  .gw-hb-card { appearance: none; cursor: pointer; text-align: left; width: 100%; padding: 0; overflow: hidden;
    border-radius: 18px; border: 1.5px solid var(--gw-border-soft); background: rgba(13,16,14,0.82);
    color: var(--gw-ink); font-family: var(--gw-font); display: flex; flex-direction: column;
    transition: transform 0.15s ease, border-color 0.15s, box-shadow 0.15s; }
  .gw-hb-card:hover { transform: translateY(-3px); border-color: rgba(140,226,90,0.45);
    box-shadow: 0 14px 34px rgba(0,0,0,0.45), 0 0 22px rgba(140,226,90,0.1); }
  .gw-hb-cardwrap.sel .gw-hb-card { border-color: var(--gw-green); box-shadow: 0 0 0 1px var(--gw-green),
    0 14px 34px rgba(0,0,0,0.45), 0 0 26px rgba(140,226,90,0.2); }
  .gw-hb-card .cart { position: relative; height: clamp(104px, 12.5vh, 128px); overflow: hidden; }
  .gw-hb-card .cart img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .gw-hb-card .cart .tile { position: absolute; inset: 0; display: grid; place-items: center; color: rgba(255,255,255,0.75); }
  .gw-hb-card .cart::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(10,13,11,0.78) 100%); }
  .gw-hb-card .cbody { padding: 11px 13px 12px; display: flex; flex-direction: column; gap: 4px; }
  .gw-hb-card .cnm { font: 800 14.5px/1.2 var(--gw-font); display: flex; align-items: center; gap: 8px; }
  .gw-hb-card .ctp { font: 600 11px/1.3 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-hb-card .cfoot { display: flex; align-items: baseline; gap: 7px; margin-top: 3px; }
  .gw-hb-card .cscore { font: 800 17px/1 var(--gw-font); color: var(--gw-green); font-variant-numeric: tabular-nums; }
  .gw-hb-card .cword { font: 700 11px/1 var(--gw-font); color: var(--gw-green); }
  .gw-hb-card .cvis { font: 600 10.5px/1 var(--gw-font); color: var(--gw-ink-dim); margin-left: auto; }
  .gw-hb-card .cnote { font: 600 11px/1.35 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-hb-cstar { position: absolute; top: 9px; right: 9px; z-index: 2; appearance: none; cursor: pointer;
    width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center;
    background: rgba(10,12,10,0.68); border: 1px solid var(--gw-border-soft); color: rgba(240,182,75,0.45);
    transition: color 0.15s, border-color 0.15s, transform 0.12s; }
  .gw-hb-cstar:hover { transform: scale(1.08); border-color: rgba(240,182,75,0.5); }
  .gw-hb-cstar.on { color: var(--gw-amber); border-color: rgba(240,182,75,0.5); }
  .gw-hb-chip { position: absolute; top: 9px; right: 9px; z-index: 2; padding: 5px 9px; border-radius: 999px;
    background: rgba(240,182,75,0.14); border: 1px solid rgba(240,182,75,0.4); color: var(--gw-amber);
    font: 700 9.5px/1 var(--gw-font); letter-spacing: 0.8px; text-transform: uppercase; }

  /* Create-new card */
  .gw-hb-card.create { border-style: dashed; border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.03);
    align-items: center; justify-content: center; gap: 9px; min-height: 100%;
    padding: 18px 14px; }
  .gw-hb-card.create:hover { border-color: rgba(140,226,90,0.5); box-shadow: none; transform: none;
    background: rgba(140,226,90,0.05); }
  .gw-hb-card.create .plus { width: 44px; height: 44px; border-radius: 999px; display: grid; place-items: center;
    border: 1.5px dashed rgba(255,255,255,0.3); color: var(--gw-ink-dim); }
  .gw-hb-card.create:hover .plus { color: var(--gw-green); border-color: rgba(140,226,90,0.5); }
  .gw-hb-card.create .cnm { justify-content: center; }
  .gw-hb-card.create .ctp { text-align: center; }

  .gw-hb-empty { flex: 0 0 auto; width: 100%; display: flex; align-items: center; gap: 10px;
    padding: 16px 18px; border-radius: 16px; border: 1.5px dashed rgba(255,255,255,0.14);
    color: var(--gw-ink-dim); font: 500 12.5px/1.5 var(--gw-font); }

  /* ── Sidebar panels ─────────────────────────────────────────────────── */
  .gw-hb-panel { border-radius: 18px; border: 1.5px solid var(--gw-border-soft); background: rgba(12,15,13,0.84);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    padding: 14px 15px; display: flex; flex-direction: column; gap: 11px; flex: 0 0 auto; }
  .gw-hb-panel .pt { display: flex; align-items: center; gap: 9px; font: 600 16px/1.15 var(--hb-display);
    letter-spacing: 0.2px; }
  .gw-hb-panel .pticon { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; flex: 0 0 auto; }
  .gw-hb-panel .pticon.green { background: var(--gw-green-soft); border: 1px solid var(--gw-green-line); color: var(--gw-green); }
  .gw-hb-panel .pticon.amber { background: rgba(240,182,75,0.1); border: 1px solid rgba(240,182,75,0.32); color: var(--gw-amber); }

  .gw-hb-keeper { display: flex; align-items: center; gap: 12px; }
  .gw-hb-keeper .kicon { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; flex: 0 0 auto;
    background: radial-gradient(circle at 35% 30%, rgba(140,226,90,0.22), rgba(140,226,90,0.05) 78%);
    border: 1px solid var(--gw-green-line); color: var(--gw-green); }
  .gw-hb-keeper .kt { font: 600 15.5px/1.15 var(--hb-display); }
  .gw-hb-keeper .kl { font: 700 12px/1.2 var(--gw-font); color: var(--gw-ink-dim); margin-top: 2px; }
  .gw-hb-xp { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
  .gw-hb-xp span { display: block; height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, #5aa83e, #8ce25a); box-shadow: 0 0 10px rgba(140,226,90,0.4); }
  .gw-hb-xpnote { font: 600 11px/1.3 var(--gw-font); color: var(--gw-ink-dim); }

  .gw-hb-insight { display: flex; align-items: center; gap: 11px; padding: 9px 0; }
  .gw-hb-insight + .gw-hb-insight { border-top: 1px solid rgba(255,255,255,0.06); }
  .gw-hb-insight .iic { width: 38px; height: 38px; border-radius: 999px; display: grid; place-items: center; flex: 0 0 auto; }
  .gw-hb-insight .ik { font: 600 11px/1.2 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-hb-insight .iv { font: 800 19px/1.1 var(--gw-font); font-variant-numeric: tabular-nums; margin-top: 1px; }
  .gw-hb-insight .ic2 { font: 600 10.5px/1.2 var(--gw-font); color: var(--gw-ink-dim); margin-top: 1px; }

  .gw-hb-rem { display: flex; align-items: center; gap: 10px; padding: 10px 11px; border-radius: 13px;
    background: rgba(255,255,255,0.04); border: 1px solid var(--gw-border-soft); }
  .gw-hb-rem .dot { width: 9px; height: 9px; border-radius: 999px; flex: 0 0 auto; box-shadow: 0 0 8px currentColor; }
  .gw-hb-rem .rl { font: 700 12px/1.25 var(--gw-font); }
  .gw-hb-rem .rh { font: 600 10.5px/1.2 var(--gw-font); color: var(--gw-ink-dim); margin-top: 1px; }
  .gw-hb-remall { appearance: none; cursor: pointer; border-radius: 12px; padding: 10px 12px; width: 100%;
    border: 1.5px solid var(--gw-border-soft); background: rgba(255,255,255,0.04); color: var(--gw-ink);
    font: 700 12px/1 var(--gw-font); transition: border-color 0.15s, background 0.15s; }
  .gw-hb-remall:hover { border-color: rgba(255,255,255,0.24); background: rgba(255,255,255,0.07); }
  .gw-hb-remok { display: flex; align-items: center; gap: 9px; padding: 4px 2px;
    font: 600 12px/1.45 var(--gw-font); color: var(--gw-ink-dim); }

  .gw-hb-promo { display: flex; align-items: center; gap: 12px; }
  .gw-hb-promo .pic { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; flex: 0 0 auto;
    background: radial-gradient(circle at 35% 30%, rgba(140,226,90,0.2), rgba(140,226,90,0.04) 78%);
    border: 1px solid var(--gw-green-line); color: var(--gw-green); }
  .gw-hb-promo .ptx { font: 600 12px/1.45 var(--gw-font); }
  .gw-hb-promo-btn { appearance: none; cursor: pointer; align-self: flex-start; display: inline-flex; align-items: center;
    gap: 7px; border: none; border-radius: 11px; padding: 10px 15px;
    background: linear-gradient(180deg, #6ecb46, #4da335); color: #fff; font: 800 12px/1 var(--gw-font);
    box-shadow: 0 5px 14px rgba(90,190,60,0.3); transition: filter 0.15s; }
  .gw-hb-promo-btn:hover { filter: brightness(1.08); }

  /* ── Footer ─────────────────────────────────────────────────────────── */
  .gw-hb-foot { flex: 0 0 auto; display: flex; align-items: center; gap: clamp(10px, 1.4vw, 20px);
    padding: 11px clamp(13px, 1.5vw, 20px); }
  .gw-hb-foot .fstat { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .gw-hb-foot .fstat + .fstat { border-left: 1px solid rgba(255,255,255,0.08); padding-left: clamp(10px, 1.4vw, 20px); }
  .gw-hb-foot .fk { font: 600 10px/1.1 var(--gw-font); letter-spacing: 0.9px; text-transform: uppercase;
    color: var(--gw-ink-dim); }
  .gw-hb-foot .fv { font: 800 14px/1.15 var(--gw-font); font-variant-numeric: tabular-nums; margin-top: 2px; white-space: nowrap; }
  .gw-hb-foot .spacer { flex: 1; }
  .gw-hb-foot .gw-ghost-button { display: inline-flex; align-items: center; gap: 8px; }

  /* ── Detail overlay ─────────────────────────────────────────────────── */
  .gw-hb-detail { position: absolute; inset: 0; z-index: 6; display: none; place-items: center;
    background: rgba(4,7,6,0.62); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); padding: 20px; }
  .gw-hb-detail.open { display: grid; }
  .gw-hb-dcard { width: min(560px, 94vw); max-height: min(84vh, 640px); overflow-y: auto; border-radius: 22px;
    border: 1.5px solid var(--gw-border); background: rgba(12,15,13,0.97); box-shadow: 0 30px 80px rgba(0,0,0,0.6);
    scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }
  .gw-hb-dcard .dart { position: relative; height: 168px; overflow: hidden; }
  .gw-hb-dcard .dart img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .gw-hb-dcard .dart::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(12,15,13,0.95) 100%); }
  .gw-hb-dcard .dbody { padding: 16px 19px 19px; display: flex; flex-direction: column; gap: 12px; }
  .gw-hb-dcard .dnm { font: 600 24px/1.1 var(--hb-display); display: flex; align-items: center; gap: 10px; }
  .gw-hb-dcard .dtp { font: 600 12px/1.3 var(--gw-font); color: var(--gw-ink-dim); margin-top: 2px; }
  .gw-hb-dcard .dscore { display: flex; align-items: baseline; gap: 9px; }
  .gw-hb-dcard .dscore .num { font: 800 34px/1 var(--gw-font); color: var(--gw-green); }
  .gw-hb-dcard .dscore .word { font: 700 13.5px/1 var(--gw-font); color: var(--gw-green); }
  .gw-hb-dcard .dscore .lab { font: 600 10.5px/1.1 var(--gw-font); letter-spacing: 1px; text-transform: uppercase;
    color: var(--gw-ink-dim); margin-right: 2px; }
  .gw-hb-dcard .dblurb { font: 500 12.5px/1.55 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-hb-dcard .dsigs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .gw-hb-dsig { padding: 10px 12px; border-radius: 13px; background: rgba(255,255,255,0.04);
    border: 1px solid var(--gw-border-soft); }
  .gw-hb-dsig .k { font: 600 10px/1.1 var(--gw-font); letter-spacing: 0.8px; text-transform: uppercase; color: var(--gw-ink-dim); }
  .gw-hb-dsig .v { font: 800 15px/1.15 var(--gw-font); margin-top: 3px; font-variant-numeric: tabular-nums; }
  .gw-hb-dsig .w { font: 600 10.5px/1 var(--gw-font); margin-left: 6px; }
  .gw-hb-dcard .dmeta { display: flex; gap: 6px; flex-wrap: wrap; }
  .gw-hb-dcard .dbtns { display: flex; gap: 10px; margin-top: 2px; }

  /* ── Responsive ─────────────────────────────────────────────────────── */
  @media (max-width: 1240px) {
    .gw-hb-cols { flex-direction: column; overflow-y: auto; scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.2) transparent; }
    .gw-hb-main { overflow: visible; padding-right: 0; }
    .gw-hb-side { width: 100%; overflow: visible; display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); align-items: start; }
  }
  @media (max-width: 880px) {
    .gw-hb-hero .hin { max-width: 100%; }
    .gw-hb-foot { flex-wrap: wrap; }
    .gw-hb-foot .spacer { display: none; }
  }
  `;
  const tag = document.createElement("style");
  tag.id = "gw-habitats-styles";
  tag.textContent = css;
  document.head.append(tag);
}

export class HabitatsView {
  readonly root: HTMLElement;
  private main!: HTMLElement;
  private side!: HTMLElement;
  private foot!: HTMLElement;
  private detail!: HTMLElement;
  private selected: HabitatPageId = "lizard";
  private favs = loadFavs();
  private remindersExpanded = false;
  private live: HabitatsLiveData = { habitats: [], reputation: 0, photoCount: 0, streakDays: 0, nowMs: 0 };

  constructor(private cb: HabitatsCallbacks) {
    ensureGwStyles();
    ensureStyles();
    this.root = el("div", "gw-hb");
    const bg = el("div", "hb-bg");
    bg.style.backgroundImage = `url("${ASSETS.room.ecocenter}")`;
    const wrap = el("div", "gw-hb-wrap");
    const cols = el("div", "gw-hb-cols");
    this.main = el("div", "gw-hb-main");
    this.side = el("div", "gw-hb-side");
    cols.append(this.main, this.side);
    this.foot = el("div", "gw-panel gw-hb-foot");
    wrap.append(cols, this.foot);
    this.detail = el("div", "gw-hb-detail");
    this.detail.addEventListener("click", (e) => {
      if (e.target === this.detail) this.closeDetail();
    });
    this.root.append(bg, wrap, this.detail);
  }

  /** Called by the host every time the screen opens. */
  show(): void {
    this.live = this.cb.data();
    // Default the featured habitat to the most recently visited one.
    const recent = sortByRecent(this.live.habitats.map((h) => ({ id: h.id, lastVisit: h.lastVisit })));
    if (recent.length > 0 && recent[0].lastVisit) this.selected = recent[0].id;
    this.remindersExpanded = false;
    this.closeDetail();
    this.render();
    this.main.scrollTop = 0;
    this.side.scrollTop = 0;
  }

  /** Esc chain: detail overlay → expanded reminders → (host closes). */
  handleEscape(): boolean {
    if (this.detail.classList.contains("open")) {
      this.closeDetail();
      return true;
    }
    if (this.remindersExpanded) {
      this.remindersExpanded = false;
      this.renderSide();
      return true;
    }
    return false;
  }

  // ── Live lookups ─────────────────────────────────────────────────────────

  private liveFor(id: HabitatPageId): HabitatLive {
    return this.live.habitats.find((h) => h.id === id) ?? { id, name: null, score: null, signals: {}, lastVisit: null };
  }

  private nameFor(id: HabitatPageId): string {
    return this.liveFor(id).name || habitatCardById(id)?.name || id;
  }

  private isFav(id: string): boolean {
    return this.favs[id] === true;
  }

  private setFav(id: string, on: boolean): void {
    this.favs[id] = on;
    try {
      globalThis.localStorage?.setItem(FAVS_KEY, JSON.stringify(this.favs));
    } catch {
      /* non-fatal */
    }
    this.render();
  }

  private select(id: HabitatPageId): void {
    if (this.selected === id) return;
    this.selected = id;
    this.render();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  private render(): void {
    this.renderMain();
    this.renderSide();
    this.renderFooter();
  }

  private renderMain(): void {
    this.main.replaceChildren();

    const head = el("div", "gw-hb-head");
    const hrow = el("div");
    hrow.style.cssText = "display:flex;align-items:center;gap:16px;";
    const htx = el("div");
    htx.append(el("div", "t", "Habitats"), el("div", "s", "Your living displays of care and conservation."));
    hrow.append(gwBackPill(() => this.cb.close()), htx);
    head.append(hrow);
    this.main.append(head, this.buildHero());

    // Your Habitats — the player's real three + Create New.
    const yours = this.section("Your Habitats", "leaf", `View All (${HABITAT_CARDS.length})`);
    for (const def of HABITAT_CARDS) yours.row.append(this.buildHabitatCard(def.id, undefined));
    yours.row.append(this.buildCreateCard());

    // Recently Visited — real timestamps, most recent first.
    const visited = this.live.habitats.filter((h) => h.lastVisit != null && h.lastVisit > 0);
    const recent = this.section("Recently Visited", "clock", `View All (${visited.length})`);
    if (visited.length === 0) {
      const empty = el("div", "gw-hb-empty");
      empty.append(gwIcon("clock", 17, "rgba(255,255,255,0.4)"), el("span", undefined, "Enter a habitat and it'll appear here with its visit time."));
      recent.row.append(empty);
    } else {
      for (const h of sortByRecent(visited)) recent.row.append(this.buildHabitatCard(h.id, visitLabel(this.live.nowMs, h.lastVisit)));
    }

    // Templates / New Ideas — honest future concepts.
    const ideas = this.section("Templates / New Ideas", "sparkle", `View All (${TEMPLATE_IDEAS.length})`);
    for (const t of TEMPLATE_IDEAS) ideas.row.append(this.buildTemplateCard(t));
  }

  private section(title: string, icon: Parameters<typeof gwIcon>[0], all: string): { row: HTMLElement } {
    const sect = el("div", "gw-hb-sect");
    const head = el("div", "shead");
    const ic = el("span", "sicon");
    ic.append(gwIcon(icon, 15));
    const back = el("button", "gw-hb-arrow back") as HTMLButtonElement;
    back.setAttribute("aria-label", `Scroll ${title} back`);
    back.append(gwIcon("chevron", 13));
    const fwd = el("button", "gw-hb-arrow") as HTMLButtonElement;
    fwd.setAttribute("aria-label", `Scroll ${title} forward`);
    fwd.append(gwIcon("chevron", 13));
    head.append(ic, el("span", "st", title), el("span", "spacer"), el("span", "sall", all), back, fwd);
    const row = el("div", "gw-hb-row");
    back.addEventListener("click", () => row.scrollBy({ left: -row.clientWidth * 0.85, behavior: "smooth" }));
    fwd.addEventListener("click", () => row.scrollBy({ left: row.clientWidth * 0.85, behavior: "smooth" }));
    sect.append(head, row);
    this.main.append(sect);
    return { row };
  }

  private buildHero(): HTMLElement {
    const def = habitatCardById(this.selected) ?? HABITAT_CARDS[0];
    const live = this.liveFor(def.id);
    const hero = el("div", "gw-hb-hero");

    const hart = el("div", "hart");
    const img = document.createElement("img");
    img.src = def.art;
    img.alt = `${this.nameFor(def.id)} — ${def.typeLabel}`;
    if (def.artPos) img.style.objectPosition = def.artPos;
    img.addEventListener("error", () => img.remove());
    hart.append(img);

    const hin = el("div", "hin");
    const eyebrow = el("div", "heyebrow");
    eyebrow.append(gwIcon("leaf", 12), document.createTextNode("Featured Habitat"));
    const name = el("div", "hname");
    name.append(document.createTextNode(this.nameFor(def.id)), gwIcon(def.speciesIcon, 22, "#dcc496"));
    const type = el("div", "htype", def.typeLabel);
    const blurb = el("div", "hblurb", def.blurb);

    const stats = el("div", "hstats");
    const score = el("div", "hstat");
    score.append(el("div", "k", "Habitat Score"));
    const sv = el("div", "v");
    if (live.score != null) {
      sv.append(el("span", "num", String(Math.round(live.score))), el("span", "word", scoreWord(live.score)));
    } else {
      const dash = el("span", "num", "—");
      dash.style.color = "var(--gw-ink-dim)";
      sv.append(dash, elDim("word", "Visit to score"));
    }
    score.append(sv);
    const sp = el("div", "hstat");
    sp.append(el("div", "k", "Species"));
    const spv = el("div", "v");
    const spx = el("span", "sp");
    spx.append(document.createTextNode(def.species.join(" · ")), gwIcon(def.speciesIcon, 15, "#dcc496"));
    spv.append(spx);
    sp.append(spv);
    stats.append(score, sp);

    const btns = el("div", "hbtns");
    const go = el("button", "gw-primary-button") as HTMLButtonElement;
    go.append(document.createTextNode("Continue Caring"), gwIcon("chevron", 13));
    go.addEventListener("click", () => this.cb.enterHabitat(def.id));
    const details = el("button", "gw-ghost-button") as HTMLButtonElement;
    details.append(gwIcon("eye", 15), document.createTextNode("View Details"));
    details.addEventListener("click", () => this.openDetail(def.id));
    btns.append(go, details);

    hin.append(eyebrow, name, type, blurb, stats, btns);

    const star = el("button", `gw-hb-star${this.isFav(def.id) ? " on" : ""}`) as HTMLButtonElement;
    star.setAttribute("aria-label", `Favorite ${this.nameFor(def.id)}`);
    star.setAttribute("aria-pressed", this.isFav(def.id) ? "true" : "false");
    star.append(gwIcon("star", 19));
    star.addEventListener("click", () => this.setFav(def.id, !this.isFav(def.id)));

    hero.append(hart, hin, star);
    return hero;
  }

  private buildHabitatCard(id: HabitatPageId, visited: string | undefined): HTMLElement {
    const def = habitatCardById(id) ?? HABITAT_CARDS[0];
    const live = this.liveFor(id);
    const wrap = el("div", `gw-hb-cardwrap${this.selected === id ? " sel" : ""}`);

    const card = el("button", "gw-hb-card") as HTMLButtonElement;
    const art = el("div", "cart");
    const img = document.createElement("img");
    img.src = def.art;
    img.alt = def.typeLabel;
    if (def.artPos) img.style.objectPosition = def.artPos;
    img.addEventListener("error", () => img.remove());
    art.append(img);
    const body = el("div", "cbody");
    const nm = el("div", "cnm");
    nm.append(document.createTextNode(this.nameFor(id)), gwIcon(def.speciesIcon, 14, "#dcc496"));
    const tp = el("div", "ctp", def.species.join(" · "));
    const foot = el("div", "cfoot");
    if (live.score != null) {
      foot.append(el("span", "cscore", String(Math.round(live.score))), el("span", "cword", scoreWord(live.score)));
    } else {
      foot.append(elDim("cword", "Not scored yet — pay a visit"));
    }
    if (visited) foot.append(el("span", "cvis", visited));
    body.append(nm, tp, foot);
    card.append(art, body);
    card.addEventListener("click", () => this.select(id));

    const star = el("button", `gw-hb-cstar${this.isFav(id) ? " on" : ""}`) as HTMLButtonElement;
    star.setAttribute("aria-label", `Favorite ${this.nameFor(id)}`);
    star.setAttribute("aria-pressed", this.isFav(id) ? "true" : "false");
    star.append(gwIcon("star", 14));
    star.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setFav(id, !this.isFav(id));
    });

    wrap.append(card, star);
    return wrap;
  }

  private buildCreateCard(): HTMLElement {
    const wrap = el("div", "gw-hb-cardwrap");
    const card = el("button", "gw-hb-card create") as HTMLButtonElement;
    const plus = el("span", "plus");
    plus.append(gwIcon("plus", 20));
    card.append(plus, el("div", "cnm", "Create New Habitat"), el("div", "ctp", "Build a new home"));
    card.addEventListener("click", () => this.cb.toast(CREATE_HABITAT_NOTE));
    wrap.append(card);
    return wrap;
  }

  private buildTemplateCard(t: (typeof TEMPLATE_IDEAS)[number]): HTMLElement {
    const wrap = el("div", "gw-hb-cardwrap");
    const card = el("button", "gw-hb-card") as HTMLButtonElement;
    const art = el("div", "cart");
    art.style.background = `radial-gradient(circle at 42% 30%, ${t.palette[0]}, ${t.palette[1]} 82%)`;
    const tile = el("span", "tile");
    tile.append(gwIcon(t.icon, 34));
    art.append(tile, el("span", "gw-hb-chip", "Concept"));
    const body = el("div", "cbody");
    body.append(el("div", "cnm", t.name), el("div", "ctp", t.typeLabel), el("div", "cnote", t.note));
    card.append(art, body);
    card.addEventListener("click", () => this.cb.toast(TEMPLATES_PENDING_NOTE));
    wrap.append(card);
    return wrap;
  }

  // ── Sidebar ──────────────────────────────────────────────────────────────

  private renderSide(): void {
    this.side.replaceChildren();
    this.side.append(this.buildKeeper(), this.buildInsights(), this.buildReminders(), this.buildPromo());
  }

  private buildKeeper(): HTMLElement {
    const lvl = keeperLevel(this.live.reputation);
    const panel = el("div", "gw-hb-panel");
    const row = el("div", "gw-hb-keeper");
    const ic = el("span", "kicon");
    ic.append(gwIcon("leaf", 22));
    const tx = el("div");
    tx.append(el("div", "kt", "Eco-Keeper"), el("div", "kl", `Level ${lvl.level}`));
    row.append(ic, tx);
    const bar = el("div", "gw-hb-xp");
    const fill = el("span");
    fill.style.width = `${Math.round((lvl.into / lvl.span) * 100)}%`;
    bar.append(fill);
    const note = el(
      "div",
      "gw-hb-xpnote",
      `${lvl.toNext} ★ reputation to next level · ${this.live.reputation.toLocaleString()} ★ earned`,
    );
    panel.append(row, bar, note);
    return panel;
  }

  private buildInsights(): HTMLElement {
    const panel = el("div", "gw-hb-panel");
    const pt = el("div", "pt");
    const ic = el("span", "pticon green");
    ic.append(gwIcon("chart", 14));
    pt.append(ic, document.createTextNode("Habitat Insights"));
    panel.append(pt);

    const insight = (
      icon: Parameters<typeof gwIcon>[0],
      tint: string,
      label: string,
      value: string,
      caption: string,
    ): HTMLElement => {
      const rowEl = el("div", "gw-hb-insight");
      const chip = el("span", "iic");
      chip.style.background = `${tint}1f`;
      chip.style.border = `1px solid ${tint}55`;
      chip.style.color = tint;
      chip.append(gwIcon(icon, 17));
      const tx = el("div");
      tx.append(el("div", "ik", label), el("div", "iv", value), el("div", "ic2", caption));
      rowEl.append(chip, tx);
      return rowEl;
    };

    const streak = this.live.streakDays;
    panel.append(
      insight("flame", "#f0a63e", "Care Streak", streak > 0 ? `${streak} day${streak === 1 ? "" : "s"}` : "—", streakCaption(streak)),
    );

    const cleans = this.live.habitats
      .map((h) => h.signals.cleanliness)
      .filter((c): c is number => c != null);
    const avg = cleans.length > 0 ? Math.round(cleans.reduce((a, b) => a + b, 0) / cleans.length) : null;
    panel.append(
      insight(
        "drop",
        "#5db9f0",
        "Avg. Cleanliness",
        avg != null ? `${avg}%` : "—",
        avg != null ? scoreWord(avg) : "Visit your habitats to measure",
      ),
    );

    const photos = this.live.photoCount;
    panel.append(
      insight(
        "camera",
        "#8ce25a",
        "Total Photos Captured",
        String(photos),
        photos > 0 ? "Beautiful moments" : "Try Photo Mode's shutter",
      ),
    );
    return panel;
  }

  private buildReminders(): HTMLElement {
    const panel = el("div", "gw-hb-panel");
    const pt = el("div", "pt");
    const ic = el("span", "pticon amber");
    ic.append(gwIcon("bell", 14));
    pt.append(ic, document.createTextNode("Reminders"));
    panel.append(pt);

    const reminders = deriveReminders(
      this.live.habitats.map((h) => ({ id: h.id, name: this.nameFor(h.id), signals: h.signals })),
    );
    if (reminders.length === 0) {
      const ok = el("div", "gw-hb-remok");
      ok.append(gwIcon("check", 15, "#8ce25a"), el("span", undefined, "All caught up — your habitats look great."));
      panel.append(ok);
      return panel;
    }
    const shown = this.remindersExpanded ? reminders : reminders.slice(0, 3);
    for (const r of shown) {
      const item = el("div", "gw-hb-rem");
      const dot = el("span", "dot");
      dot.style.background = TONE_TINTS[r.tone];
      dot.style.color = TONE_TINTS[r.tone];
      const tx = el("div");
      tx.append(el("div", "rl", r.label), el("div", "rh", r.habitatName));
      item.append(dot, tx);
      panel.append(item);
    }
    if (reminders.length > 3) {
      const btn = el("button", "gw-hb-remall") as HTMLButtonElement;
      btn.textContent = this.remindersExpanded ? "Show Fewer" : `View All Reminders (${reminders.length})`;
      btn.setAttribute("aria-expanded", this.remindersExpanded ? "true" : "false");
      btn.addEventListener("click", () => {
        this.remindersExpanded = !this.remindersExpanded;
        this.renderSide();
      });
      panel.append(btn);
    }
    return panel;
  }

  private buildPromo(): HTMLElement {
    const panel = el("div", "gw-hb-panel");
    const row = el("div", "gw-hb-promo");
    const ic = el("span", "pic");
    ic.append(gwIcon(HABITATS_PROMO.icon, 21));
    row.append(ic, el("div", "ptx", HABITATS_PROMO.text));
    const btn = el("button", "gw-hb-promo-btn") as HTMLButtonElement;
    btn.append(document.createTextNode(HABITATS_PROMO.cta), gwIcon("chevron", 12));
    btn.addEventListener("click", () => this.cb.openShop());
    panel.append(row, btn);
    return panel;
  }

  // ── Footer ───────────────────────────────────────────────────────────────

  private renderFooter(): void {
    const s = this.cb.stats();
    this.foot.replaceChildren();
    const stat = (icon: Parameters<typeof gwIcon>[0], tint: string, k: string, v: string): HTMLElement => {
      const box = el("div", "fstat");
      box.append(gwIcon(icon, 17, tint));
      const tx = el("div");
      tx.append(el("div", "fk", k), el("div", "fv", v));
      box.append(tx);
      return box;
    };
    const back = el("button", "gw-ghost-button", "‹ Back to Eco-Center") as HTMLButtonElement;
    back.addEventListener("click", () => this.cb.close());
    this.foot.append(
      stat("leaf", "#8ce25a", "Eco Points", s.ecoPoints.toLocaleString()),
      stat("house", "#7fd0e8", "Habitats", `${s.habitats} restored`),
      stat("star", "#f0b64b", "Reputation", s.reputation.toLocaleString()),
      stat("clock", "#dcc496", "In-Game Time", s.dayLabel),
      el("span", "spacer"),
      back,
    );
  }

  // ── Detail overlay ───────────────────────────────────────────────────────

  private openDetail(id: HabitatPageId): void {
    const def = habitatCardById(id) ?? HABITAT_CARDS[0];
    const live = this.liveFor(id);
    this.detail.replaceChildren();
    const card = el("div", "gw-hb-dcard");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", `${this.nameFor(id)} details`);

    const art = el("div", "dart");
    const img = document.createElement("img");
    img.src = def.art;
    img.alt = def.typeLabel;
    if (def.artPos) img.style.objectPosition = def.artPos;
    img.addEventListener("error", () => img.remove());
    art.append(img);

    const body = el("div", "dbody");
    const nm = el("div", "dnm");
    nm.append(document.createTextNode(this.nameFor(id)), gwIcon(def.speciesIcon, 20, "#dcc496"));
    const tp = el("div", "dtp", `${def.typeLabel} · ${def.biome}`);

    const score = el("div", "dscore");
    if (live.score != null) {
      score.append(
        el("span", "lab", "Habitat Score"),
        el("span", "num", String(Math.round(live.score))),
        el("span", "word", scoreWord(live.score)),
      );
    } else {
      score.append(el("span", "lab", "Habitat Score"), elDim("word", "Not scored yet — pay a visit"));
    }

    const sigs = el("div", "dsigs");
    const sig = (k: string, v: number | null | undefined, unit: string, word?: string, tint?: string): void => {
      if (v == null) return;
      const box = el("div", "gw-hb-dsig");
      const vEl = el("div", "v", `${Math.round(v)}${unit}`);
      if (word) {
        const w = el("span", "w", word);
        w.style.color = tint ?? "var(--gw-ink-dim)";
        vEl.append(w);
      }
      box.append(el("div", "k", k), vEl);
      sigs.append(box);
    };
    const s = live.signals;
    sig("Cleanliness", s.cleanliness, "%", s.cleanliness != null ? scoreWord(s.cleanliness) : undefined, "#5db9f0");
    sig("Hunger", s.hunger, "%", s.hunger != null ? (s.hunger >= 70 ? "Satisfied" : s.hunger >= 45 ? "Peckish" : "Hungry") : undefined, s.hunger != null && s.hunger < 45 ? "#ef7a5e" : "#8ce25a");
    sig("Humidity", s.humidity, "%", s.humidity != null ? (s.humidity >= 70 ? "In band" : "Too dry") : undefined, s.humidity != null && s.humidity < 70 ? "#f0b64b" : "#8ce25a");
    sig("Hydration", s.hydration, "%", undefined, undefined);
    sig("Nitrate", s.nitrate, " mg/L", s.nitrate != null ? (s.nitrate > 40 ? "Rising" : "Safe") : undefined, s.nitrate != null && s.nitrate > 40 ? "#f0b64b" : "#8ce25a");

    const meta = el("div", "dmeta");
    for (const label of [def.species.join(" · "), visitLabel(this.live.nowMs, live.lastVisit)]) {
      meta.append(el("span", "gw-pill", label));
    }

    const blurb = el("div", "dblurb", def.blurb);

    const btns = el("div", "dbtns");
    const enter = el("button", "gw-primary-button") as HTMLButtonElement;
    enter.append(document.createTextNode("Enter Habitat"), gwIcon("chevron", 13));
    enter.addEventListener("click", () => this.cb.enterHabitat(id));
    const closeBtn = el("button", "gw-ghost-button", "Close") as HTMLButtonElement;
    closeBtn.addEventListener("click", () => this.closeDetail());
    btns.append(enter, closeBtn);

    body.append(nm, tp, score, sigs, meta, blurb, btns);
    card.append(art, body);
    this.detail.append(card);
    this.detail.classList.add("open");
    enter.focus();
  }

  private closeDetail(): void {
    this.detail.classList.remove("open");
    this.detail.replaceChildren();
  }
}

/** A dim-tinted labelled span (for honest "no data yet" fallbacks). */
function elDim(cls: string, text: string): HTMLElement {
  const s = el("span", cls, text);
  s.style.color = "var(--gw-ink-dim)";
  return s;
}

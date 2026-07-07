/**
 * SUPPLY SHOP — the reference-match screen (Designs/Supply_Shop): serif
 * header + Eco-Keeper card, seven category pills, FEATURED BUNDLES (real
 * contents at an honest discount — hero + two side cards with a View Bundle
 * detail), a 5-per-row product grid of REAL goods (supply packs + the decor
 * catalog at its real prices), and a live cart sidebar whose checkout
 * genuinely delivers: stock into the pantry, decor into your inventory,
 * leaves out of your pocket.
 *
 * Hosted by HubScreens ("shop" case, host chrome hidden). Data + cart math
 * live in src/data/shopCatalog.ts (pure, tested).
 */
import { gwEl as el, ensureGwStyles, gwBackPill } from "./gwTheme";
import { gwIcon } from "./gwIcons";
import { ASSETS } from "../data/assets";
import { keeperLevel } from "../data/habitats";
import type { CareGuideStats } from "./careGuide";
import { sfx } from "../render/sfx";
import {
  SHOP_BUNDLES,
  SHOP_CATEGORIES,
  SUBSTRATE_NOTE,
  TOOLS_NOTE,
  bundleBadge,
  bundlePricing,
  cartAdd,
  cartCount,
  cartSetQty,
  cartTotals,
  productById,
  productsInCategory,
  type CartLine,
  type ShopBundle,
  type ShopCategoryId,
  type ShopProduct,
} from "../data/shopCatalog";
import { SUPPLIES } from "../game/economy";

export interface ShopCallbacks {
  close(): void;
  leaves(): number;
  stats(): CareGuideStats;
  /** Apply a checkout: deliver + charge. Returns a user-facing message. */
  checkout(cart: CartLine[]): { ok: boolean; message: string };
  toast(message: string): void;
}

type ShopSort = "featured" | "price-asc" | "price-desc" | "name";

let stylesIn = false;
function ensureStyles(): void {
  if (stylesIn) return;
  stylesIn = true;
  const css = `
  .gw-shop { position: relative; flex: 1; display: flex; flex-direction: column; min-height: 0;
    color: var(--gw-ink); font-family: var(--gw-font);
    --sh-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif; }
  .gw-shop .sh-bg { position: absolute; inset: 0; background-size: cover; background-position: center 36%; }
  .gw-shop .sh-bg::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(6,9,8,0.93) 0%, rgba(6,9,8,0.88) 42%, rgba(5,8,7,0.95) 100%); }
  .gw-shop .sh-shell { position: relative; z-index: 1; flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin;
    width: min(1780px, 100%); margin: 0 auto; padding: clamp(14px, 2.4vh, 28px) clamp(16px, 2.2vw, 36px) 20px; }

  .gw-shop .sh-head { display: flex; align-items: flex-start; gap: 16px; }
  .gw-shop h1 { margin: 0; font: 500 clamp(28px, 3vw, 44px)/1.02 var(--sh-display); letter-spacing: 0.4px; }
  .gw-shop .sh-sub { margin-top: 6px; font: 500 12.5px/1.4 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-shop .sh-head .sp { flex: 1; }
  .gw-shop .sh-hr { display: flex; flex-direction: column; gap: 8px; align-items: stretch; }
  .gw-shop .sh-keeper { display: flex; align-items: center; gap: 12px; padding: 11px 15px; border-radius: 16px;
    background: rgba(12,15,14,0.8); border: 1.5px solid var(--gw-border-soft); min-width: 236px;
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); }
  .gw-shop .sh-keeper .ic { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center;
    background: rgba(120,200,80,0.12); border: 1px solid var(--gw-green-line); }
  .gw-shop .sh-keeper .nm { font: 800 13px/1.1 var(--gw-font); }
  .gw-shop .sh-keeper .lv { font: 600 10.5px/1.2 var(--gw-font); color: var(--gw-ink-dim); margin-top: 2px; }
  .gw-shop .sh-keeper .bar { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; margin-top: 6px; }
  .gw-shop .sh-keeper .fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #6fbf49, #a5e06b); }
  .gw-shop .sh-cartpill { appearance: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
    gap: 9px; padding: 10px 14px; border-radius: 13px; border: 1.5px solid var(--gw-border-soft);
    background: rgba(12,15,14,0.8); color: var(--gw-ink); font: 800 12.5px/1 var(--gw-font); }
  .gw-shop .sh-cartpill:hover { border-color: rgba(255,255,255,0.28); }
  .gw-shop .sh-cartpill .n { display: inline-grid; place-items: center; min-width: 21px; height: 21px; padding: 0 5px;
    border-radius: 999px; background: linear-gradient(180deg, #7ecb52, #55a337); color: #0d1409; font: 800 11px/1 var(--gw-font); }

  .gw-shop .sh-tabs { display: flex; align-items: center; gap: 7px; margin-top: 14px; padding: 8px;
    border-radius: 16px; background: rgba(10,13,12,0.66); border: 1px solid var(--gw-border-soft); flex-wrap: wrap;
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); }
  .gw-shop .sh-tab { appearance: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
    padding: 9px 14px; border-radius: 999px; border: 1.5px solid transparent; background: transparent;
    color: var(--gw-ink-dim); font: 700 12.5px/1 var(--gw-font); transition: color .14s, border-color .14s, background .14s; }
  .gw-shop .sh-tab:hover { color: var(--gw-ink); background: rgba(255,255,255,0.05); }
  .gw-shop .sh-tab.on { color: var(--gw-green); border-color: var(--gw-green-line); background: rgba(120,200,80,0.1); }

  .gw-shop .sh-cols { display: grid; grid-template-columns: minmax(0, 1fr) 332px; gap: clamp(12px, 1.4vw, 22px); margin-top: 14px; }
  .gw-shop .sh-main { min-width: 0; }

  .gw-shop .sh-secthead { display: flex; align-items: baseline; gap: 10px; margin: 6px 0 10px; }
  .gw-shop .sh-secthead .t { font: 800 14px/1 var(--gw-font); letter-spacing: 1.4px; text-transform: uppercase;
    display: inline-flex; align-items: center; gap: 9px; }
  .gw-shop .sh-secthead .s { font: 500 11.5px/1.3 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-shop .sh-secthead .sp { flex: 1; }

  .gw-shop .sh-bundles { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 12px; }
  .gw-shop .sh-bcol { display: grid; gap: 12px; align-content: stretch; }
  .gw-shop .sh-bundle { position: relative; overflow: hidden; border-radius: 20px; border: 1.5px solid var(--gw-border-soft);
    background: rgba(12,15,14,0.82); padding: 16px; display: flex; flex-direction: column; gap: 10px;
    transition: border-color .15s, box-shadow .15s; }
  .gw-shop .sh-bundle:hover { border-color: rgba(255,255,255,0.22); box-shadow: 0 16px 40px rgba(0,0,0,0.4); }
  .gw-shop .sh-bundle.hero { padding: 0; }
  .gw-shop .sh-bundle.hero .hart { position: relative; aspect-ratio: 21 / 9; overflow: hidden; }
  .gw-shop .sh-bundle.hero .hart img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 58%; }
  .gw-shop .sh-bundle.hero .hart::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.05) 30%, rgba(9,11,10,0.94) 100%); }
  .gw-shop .sh-bundle.hero .hbody { padding: 0 16px 16px; margin-top: -34px; position: relative; display: flex; flex-direction: column; gap: 10px; }
  .gw-shop .sh-bbadge { position: absolute; top: 12px; left: 12px; z-index: 2; padding: 6px 11px; border-radius: 999px;
    background: rgba(240,182,75,0.94); color: #241a08; font: 800 10.5px/1 var(--gw-font); letter-spacing: 0.8px;
    text-transform: uppercase; }
  .gw-shop .sh-bundle .bt { font: 500 21px/1.15 var(--sh-display); }
  .gw-shop .sh-bundle .bd { font: 500 11.5px/1.45 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-shop .sh-bitems { display: flex; gap: 7px; flex-wrap: wrap; }
  .gw-shop .sh-bitem { position: relative; width: 52px; height: 52px; border-radius: 12px; display: grid; place-items: center;
    background: radial-gradient(circle at 50% 40%, rgba(126,110,80,0.32), rgba(10,12,11,0.35) 75%);
    border: 1px solid var(--gw-border-soft); overflow: hidden; }
  .gw-shop .sh-bitem img { max-width: 88%; max-height: 88%; object-fit: contain; }
  .gw-shop .sh-bitem .g { font-size: 24px; }
  .gw-shop .sh-bitem .q { position: absolute; right: 2px; top: 2px; padding: 2px 5px; border-radius: 999px;
    background: rgba(8,10,9,0.85); font: 800 8.5px/1 var(--gw-font); }
  .gw-shop .sh-bfoot { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
  .gw-shop .sh-chip { padding: 5px 10px; border-radius: 999px; background: rgba(255,255,255,0.07);
    border: 1px solid var(--gw-border-soft); font: 800 10.5px/1 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-shop .sh-chip.green { color: #a5e06b; border-color: var(--gw-green-line); background: rgba(120,200,80,0.1); }
  .gw-shop .sh-bfoot .sp { flex: 1; }
  .gw-shop .sh-was { font: 700 13px/1 var(--gw-font); color: var(--gw-ink-dim); text-decoration: line-through; }
  .gw-shop .sh-now { font: 800 21px/1 var(--gw-font); display: inline-flex; align-items: center; gap: 6px; }
  .gw-shop .sh-bundle .gw-primary-button { justify-content: center; }

  .gw-shop .sh-toolbar { display: flex; align-items: center; gap: 10px; margin: 16px 0 10px; }
  .gw-shop .sh-toolbar select { appearance: none; cursor: pointer; padding: 9px 28px 9px 12px; border-radius: 11px;
    background: rgba(12,15,14,0.8) url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23cfe0cf' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 10px center;
    border: 1.5px solid var(--gw-border-soft); color: var(--gw-ink); font: 700 12px/1 var(--gw-font); }

  .gw-shop .sh-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 11px; }
  .gw-shop .sh-card { position: relative; display: flex; flex-direction: column; border-radius: 16px; overflow: hidden;
    border: 1.5px solid var(--gw-border-soft); background: rgba(12,15,14,0.8); padding: 0 0 12px;
    transition: transform .13s, border-color .14s, box-shadow .14s; }
  .gw-shop .sh-card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.24); box-shadow: 0 10px 26px rgba(0,0,0,0.4); }
  .gw-shop .sh-pbadge { position: absolute; top: 8px; left: 8px; z-index: 1; padding: 4px 9px; border-radius: 999px;
    font: 800 9.5px/1 var(--gw-font); letter-spacing: 0.5px; text-transform: uppercase; }
  .gw-shop .sh-pbadge.New { background: rgba(110,180,235,0.92); color: #0a1a24; }
  .gw-shop .sh-pbadge.Popular { background: rgba(240,182,75,0.94); color: #241a08; }
  .gw-shop .sh-pbadge.Recommended { background: rgba(126,203,82,0.94); color: #0d1409; }
  .gw-shop .sh-card .art { height: clamp(120px, 10.5vw, 180px); display: grid; place-items: center; padding: 10px;
    background: radial-gradient(circle at 50% 42%, rgba(126,110,80,0.3), rgba(10,12,11,0.12) 72%); }
  .gw-shop .sh-card .art img { max-width: 88%; max-height: 90%; object-fit: contain; filter: drop-shadow(0 8px 10px rgba(0,0,0,0.45)); }
  .gw-shop .sh-card .art .g { font-size: 42px; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.5)); }
  .gw-shop .sh-card .nm { padding: 8px 11px 0; font: 700 12.5px/1.25 var(--gw-font); }
  .gw-shop .sh-card .ds { padding: 3px 11px 0; font: 500 10px/1.4 var(--gw-font); color: var(--gw-ink-dim); min-height: 30px; }
  .gw-shop .sh-card .foot { display: flex; align-items: center; gap: 8px; padding: 8px 11px 0; margin-top: auto; }
  .gw-shop .sh-card .pr { font: 800 13.5px/1 var(--gw-font); display: inline-flex; align-items: center; gap: 5px; }
  .gw-shop .sh-card .addbtn { margin-left: auto; appearance: none; cursor: pointer; width: 34px; height: 34px;
    border-radius: 10px; border: none; display: grid; place-items: center;
    background: linear-gradient(180deg, #6ecb46, #4da335); color: #fff; box-shadow: 0 5px 12px rgba(90,190,60,0.3);
    transition: filter .14s, transform .1s; }
  .gw-shop .sh-card .addbtn:hover { filter: brightness(1.1); }
  .gw-shop .sh-card .addbtn:active { transform: scale(0.92); }

  .gw-shop .sh-note-card { border-radius: 16px; border: 1.5px dashed rgba(255,255,255,0.16); background: rgba(12,15,14,0.6);
    padding: 22px; text-align: center; color: var(--gw-ink-dim); font: 500 12.5px/1.6 var(--gw-font); grid-column: 1 / -1; }

  .gw-shop .sh-cart { position: sticky; top: 0; align-self: start; display: flex; flex-direction: column; gap: 12px; }
  .gw-shop .sh-cartpanel { border-radius: 20px; border: 1.5px solid var(--gw-border-soft); background: rgba(12,15,14,0.86);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); padding: 15px; }
  .gw-shop .sh-cartpanel.flash { animation: gwCartFlash 0.7s ease; }
  @keyframes gwCartFlash { 0% { border-color: var(--gw-green-line); box-shadow: 0 0 24px rgba(120,200,80,0.3); } 100% { border-color: var(--gw-border-soft); } }
  .gw-shop .sh-carthead { display: flex; align-items: center; gap: 9px; }
  .gw-shop .sh-carthead .t { font: 800 15px/1 var(--gw-font); flex: 1; display: inline-flex; align-items: center; gap: 9px; }
  .gw-shop .sh-clear { appearance: none; cursor: pointer; border: none; background: transparent; color: var(--gw-ink-dim);
    display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; }
  .gw-shop .sh-clear:hover { background: rgba(226,105,78,0.14); color: #ffb9a6; }
  .gw-shop .sh-lines { display: flex; flex-direction: column; gap: 8px; margin-top: 11px; max-height: 320px;
    overflow-y: auto; scrollbar-width: thin; padding-right: 2px; }
  .gw-shop .sh-line { display: flex; align-items: center; gap: 9px; padding: 8px; border-radius: 13px;
    background: rgba(255,255,255,0.04); border: 1px solid var(--gw-border-soft); }
  .gw-shop .sh-line .thumb { width: 44px; height: 44px; border-radius: 10px; display: grid; place-items: center; overflow: hidden;
    background: radial-gradient(circle at 50% 40%, rgba(126,110,80,0.3), rgba(10,12,11,0.3) 75%); flex: 0 0 auto; }
  .gw-shop .sh-line .thumb img { max-width: 88%; max-height: 88%; object-fit: contain; }
  .gw-shop .sh-line .thumb .g { font-size: 20px; }
  .gw-shop .sh-line .mid { flex: 1; min-width: 0; }
  .gw-shop .sh-line .nm { font: 700 11.5px/1.2 var(--gw-font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gw-shop .sh-line .qty { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; }
  .gw-shop .sh-line .qb { appearance: none; cursor: pointer; width: 20px; height: 20px; border-radius: 6px;
    border: 1px solid var(--gw-border-soft); background: rgba(255,255,255,0.06); color: var(--gw-ink);
    font: 800 11px/1 var(--gw-font); display: grid; place-items: center; }
  .gw-shop .sh-line .qn { font: 700 11px/1 var(--gw-font); min-width: 16px; text-align: center; font-variant-numeric: tabular-nums; }
  .gw-shop .sh-line .pr { font: 800 12px/1 var(--gw-font); display: inline-flex; align-items: center; gap: 4px; }
  .gw-shop .sh-line .rm { appearance: none; cursor: pointer; border: none; background: transparent; color: var(--gw-ink-dim);
    width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; }
  .gw-shop .sh-line .rm:hover { color: #ffb9a6; background: rgba(226,105,78,0.12); }
  .gw-shop .sh-cartempty { padding: 22px 8px; text-align: center; color: var(--gw-ink-dim); font: 500 11.5px/1.55 var(--gw-font); }
  .gw-shop .sh-totals { margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px; }
  .gw-shop .sh-trow { display: flex; align-items: baseline; justify-content: space-between; padding: 3.5px 0;
    font: 600 12px/1.2 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-shop .sh-trow b { color: var(--gw-ink); font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; gap: 5px; }
  .gw-shop .sh-trow.save b { color: #a5e06b; }
  .gw-shop .sh-trow.total { font: 700 13px/1.2 var(--gw-font); color: var(--gw-ink); }
  .gw-shop .sh-trow.total b { font: 800 19px/1 var(--gw-font); }
  .gw-shop .sh-checkout { display: flex; align-items: center; width: 100%; margin-top: 11px; justify-content: center; flex-direction: column; gap: 2px; }
  .gw-shop .sh-checkout .sub { font: 600 9.5px/1 var(--gw-font); opacity: 0.85; }
  .gw-shop .sh-balance { margin-top: 9px; text-align: center; font: 600 11px/1.4 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-shop .sh-promise { display: flex; gap: 11px; align-items: center; border-radius: 16px;
    border: 1px solid var(--gw-green-line); background: rgba(120,200,80,0.07); padding: 12px 14px; }
  .gw-shop .sh-promise .pt { font: 800 12.5px/1.2 var(--gw-font); }
  .gw-shop .sh-promise .ps { font: 500 10.5px/1.35 var(--gw-font); color: var(--gw-ink-dim); margin-top: 2px; }

  .gw-shop .sh-trust { display: flex; gap: 12px; margin-top: 18px; padding: 13px 16px; border-radius: 16px;
    background: rgba(10,13,12,0.7); border: 1px solid var(--gw-border-soft); flex-wrap: wrap; }
  .gw-shop .sh-trust .ti { flex: 1; min-width: 190px; display: flex; align-items: center; gap: 10px; }
  .gw-shop .sh-trust .tt { font: 800 12px/1.2 var(--gw-font); }
  .gw-shop .sh-trust .ts { font: 500 10.5px/1.3 var(--gw-font); color: var(--gw-ink-dim); margin-top: 2px; }

  /* Bundle detail modal */
  .gw-shop .sh-bmodal { position: fixed; inset: 0; z-index: 30; display: none; place-items: center;
    background: rgba(4,6,5,0.72); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px); }
  .gw-shop .sh-bmodal.open { display: grid; }
  .gw-shop .sh-bmodal .card { width: min(560px, 92vw); max-height: 84vh; overflow-y: auto; scrollbar-width: thin;
    border-radius: 22px; border: 1.5px solid var(--gw-border); background: rgba(13,16,14,0.97); padding: 20px; }
  .gw-shop .sh-bmodal .bt { font: 500 24px/1.15 var(--sh-display); }
  .gw-shop .sh-brow { display: flex; align-items: center; gap: 11px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .gw-shop .sh-brow:last-of-type { border-bottom: none; }
  .gw-shop .sh-brow .nm { flex: 1; font: 700 12.5px/1.2 var(--gw-font); }
  .gw-shop .sh-brow .pr { font: 700 12px/1 var(--gw-font); color: var(--gw-ink-dim); font-variant-numeric: tabular-nums; }

  @media (max-width: 1500px) { .gw-shop .sh-grid { grid-template-columns: repeat(4, minmax(0,1fr)); } }
  @media (max-width: 1280px) {
    .gw-shop .sh-bundles { grid-template-columns: 1fr; }
    .gw-shop .sh-grid { grid-template-columns: repeat(3, minmax(0,1fr)); }
  }
  @media (max-width: 1080px) { .gw-shop .sh-cols { grid-template-columns: 1fr; } .gw-shop .sh-cart { position: static; } }
  .gw-shop button:focus-visible { outline: 2px solid var(--gw-green); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .gw-shop * { transition-duration: 0.01ms !important; animation: none !important; } }
  `;
  const tag = document.createElement("style");
  tag.id = "gw-shopscreen-styles";
  tag.textContent = css;
  document.head.append(tag);
}

function leafPrice(n: number, size = 13): HTMLElement {
  const s = el("span", "pr");
  s.append(document.createTextNode(n.toLocaleString()), gwIcon("leaf", size, "#8ce25a"));
  return s;
}

function itemThumb(kind: "supply" | "decor", refId: string): HTMLElement {
  const t = el("span", "sh-bitem");
  if (kind === "decor") {
    const img = document.createElement("img");
    img.src = `/assets/ui/decor_thumbs/${refId}.png`;
    img.alt = refId;
    img.addEventListener("error", () => {
      img.remove();
      t.append(el("span", "g", "🪨"));
    });
    t.append(img);
  } else {
    const s = SUPPLIES.find((x) => x.id === refId);
    t.append(el("span", "g", s?.icon ?? "📦"));
  }
  return t;
}

export class ShopView {
  readonly root: HTMLElement;
  private shell!: HTMLElement;
  private mainEl!: HTMLElement;
  private cartEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private cartPillN!: HTMLElement;
  private modal!: HTMLElement;
  private cart: CartLine[] = [];
  private cat: ShopCategoryId = "all";
  private sort: ShopSort = "featured";

  constructor(private cb: ShopCallbacks) {
    ensureGwStyles();
    ensureStyles();
    this.root = el("div", "gw-shop");
    const bg = el("div", "sh-bg");
    bg.style.backgroundImage = `url("${ASSETS.room.ecocenter}")`;
    this.shell = el("div", "sh-shell");
    this.modal = el("div", "sh-bmodal");
    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) this.closeModal();
    });
    this.root.append(bg, this.shell, this.modal);
  }

  show(): void {
    this.render();
    this.shell.scrollTop = 0;
  }

  /** Esc: bundle detail first, then the host closes the screen. */
  handleEscape(): boolean {
    if (this.modal.classList.contains("open")) {
      this.closeModal();
      return true;
    }
    return false;
  }

  private render(): void {
    this.shell.replaceChildren(this.buildHead(), this.buildTabs(), this.buildCols(), this.buildTrust());
  }

  private refreshCart(flash = false): void {
    const fresh = this.buildCart();
    this.cartEl.replaceWith(fresh);
    this.cartEl = fresh;
    this.cartPillN.textContent = String(cartCount(this.cart));
    if (flash) {
      const panel = this.cartEl.querySelector(".sh-cartpanel");
      panel?.classList.remove("flash");
      requestAnimationFrame(() => panel?.classList.add("flash"));
    }
  }

  private buildHead(): HTMLElement {
    const head = el("div", "sh-head");
    const tx = el("div");
    tx.append(el("h1", undefined, "Supply Shop"), el("div", "sh-sub", "Premium supplies for healthy habitats and thriving wildlife."));
    head.append(gwBackPill(() => this.cb.close()), tx, el("div", "sp"));

    const hr = el("div", "sh-hr");
    const stats = this.cb.stats();
    const lvl = keeperLevel(stats.reputation);
    const keeper = el("div", "sh-keeper");
    const ic = el("div", "ic");
    ic.append(gwIcon("leaf", 19, "#8ce25a"));
    const kx = el("div");
    kx.style.flex = "1";
    const bar = el("div", "bar");
    const fill = el("div", "fill");
    fill.style.width = `${Math.round((lvl.into / lvl.span) * 100)}%`;
    bar.append(fill);
    kx.append(el("div", "nm", "Eco-Keeper"), el("div", "lv", `Level ${lvl.level} · ${lvl.toNext.toLocaleString()} ★ to next`), bar);
    keeper.append(ic, kx);

    const pill = el("button", "sh-cartpill");
    this.cartPillN = el("span", "n", String(cartCount(this.cart)));
    pill.append(gwIcon("cart", 15, "#8ce25a"), document.createTextNode("View Cart"), this.cartPillN);
    pill.addEventListener("click", () => {
      this.cartEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      this.refreshCart(true);
    });
    hr.append(keeper, pill);
    head.append(hr);
    return head;
  }

  private buildTabs(): HTMLElement {
    this.tabsEl = el("div", "sh-tabs");
    for (const c of SHOP_CATEGORIES) {
      const b = el("button", `sh-tab${this.cat === c.id ? " on" : ""}`);
      b.append(gwIcon(c.icon, 14, this.cat === c.id ? "#8ce25a" : "#f0b64b"), document.createTextNode(c.label));
      b.addEventListener("click", () => {
        this.cat = c.id;
        this.render();
      });
      this.tabsEl.append(b);
    }
    return this.tabsEl;
  }

  private buildCols(): HTMLElement {
    const cols = el("div", "sh-cols");
    this.mainEl = el("div", "sh-main");
    if (this.cat === "all") this.mainEl.append(this.buildBundles());
    this.mainEl.append(this.buildProducts());
    this.cartEl = this.buildCart();
    cols.append(this.mainEl, this.cartEl);
    return cols;
  }

  // ── Bundles ────────────────────────────────────────────────────────────────

  private buildBundles(): HTMLElement {
    const wrap = el("div");
    const head = el("div", "sh-secthead");
    const t = el("div", "t");
    t.append(gwIcon("star", 15, "#f0b64b"), document.createTextNode("Featured Bundles"));
    head.append(t, el("span", "s", "Handpicked collections for thriving habitats."));
    wrap.append(head);
    const grid = el("div", "sh-bundles");
    const hero = SHOP_BUNDLES.find((b) => b.hero);
    const rest = SHOP_BUNDLES.filter((b) => !b.hero);
    if (hero) grid.append(this.buildBundleCard(hero));
    const col = el("div", "sh-bcol");
    for (const b of rest) col.append(this.buildBundleCard(b));
    grid.append(col);
    wrap.append(grid);
    return wrap;
  }

  private buildBundleCard(b: ShopBundle): HTMLElement {
    const pr = bundlePricing(b);
    const card = el("div", `sh-bundle${b.hero ? " hero" : ""}`);
    card.append(el("span", "sh-bbadge", bundleBadge(b)));
    const body = el("div", b.hero ? "hbody" : "");
    if (b.hero && b.art) {
      const hart = el("div", "hart");
      const img = document.createElement("img");
      img.src = b.art;
      img.alt = b.name;
      hart.append(img);
      card.append(hart);
    }
    body.append(el("div", "bt", b.name), el("div", "bd", b.blurb));
    const items = el("div", "sh-bitems");
    for (const it of b.items) {
      const th = itemThumb(it.kind, it.refId);
      if (it.qty > 1) th.append(el("span", "q", `×${it.qty}`));
      items.append(th);
    }
    body.append(items);
    const foot = el("div", "sh-bfoot");
    foot.append(el("span", "sh-chip", `${pr.itemCount} items`), el("span", "sh-chip green", `${Math.round(b.discount * 100)}% off`), el("div", "sp"));
    const was = el("span", "sh-was", pr.full.toLocaleString());
    const now = el("span", "sh-now");
    now.append(document.createTextNode(pr.price.toLocaleString()), gwIcon("leaf", 16, "#8ce25a"));
    foot.append(was, now);
    body.append(foot);
    const btnrow = el("div");
    btnrow.style.cssText = "display:flex; gap:8px;";
    const view = el("button", "gw-ghost-button");
    view.style.flex = "1";
    view.append(gwIcon("eye", 14), document.createTextNode("View Bundle"));
    view.addEventListener("click", () => this.openModal(b));
    const add = el("button", "gw-primary-button");
    add.style.flex = "1.4";
    add.append(gwIcon("cart", 15), document.createTextNode(" Add Bundle"));
    add.addEventListener("click", () => this.addToCart("bundle", b.id));
    btnrow.append(view, add);
    body.append(btnrow);
    card.append(body);
    return card;
  }

  private openModal(b: ShopBundle): void {
    const pr = bundlePricing(b);
    const card = el("div", "card");
    const top = el("div");
    top.style.cssText = "display:flex; align-items:flex-start; gap:12px;";
    const tx = el("div");
    tx.style.flex = "1";
    tx.append(el("div", "bt", b.name), el("div", "bd", b.blurb));
    const x = el("button", "gw-x", "✕");
    x.addEventListener("click", () => this.closeModal());
    top.append(tx, x);
    card.append(top);
    const list = el("div");
    list.style.marginTop = "12px";
    for (const it of b.items) {
      const row = el("div", "sh-brow");
      const th = itemThumb(it.kind, it.refId);
      const p = productById(`${it.kind}:${it.refId}`);
      const nm = el("span", "nm", `${p?.name ?? it.refId}${it.qty > 1 ? ` ×${it.qty}` : ""}`);
      const price = el("span", "pr", `${((p?.price ?? 0) * it.qty).toLocaleString()} 🍃`);
      row.append(th, nm, price);
      list.append(row);
    }
    card.append(list);
    const foot = el("div", "sh-bfoot");
    foot.style.marginTop = "12px";
    foot.append(el("span", "sh-chip green", `You save ${pr.saved.toLocaleString()} 🍃`), el("div", "sp"));
    const was = el("span", "sh-was", pr.full.toLocaleString());
    const now = el("span", "sh-now");
    now.append(document.createTextNode(pr.price.toLocaleString()), gwIcon("leaf", 16, "#8ce25a"));
    foot.append(was, now);
    card.append(foot);
    const add = el("button", "gw-primary-button");
    add.style.cssText = "width:100%; justify-content:center; margin-top:12px;";
    add.append(gwIcon("cart", 15), document.createTextNode(" Add Bundle to Cart"));
    add.addEventListener("click", () => {
      this.addToCart("bundle", b.id);
      this.closeModal();
    });
    card.append(add);
    this.modal.replaceChildren(card);
    this.modal.classList.add("open");
  }

  private closeModal(): void {
    this.modal.classList.remove("open");
  }

  // ── Products ───────────────────────────────────────────────────────────────

  private sortedProducts(): ShopProduct[] {
    const list = productsInCategory(this.cat).slice();
    if (this.sort === "price-asc") list.sort((a, b) => a.price - b.price);
    else if (this.sort === "price-desc") list.sort((a, b) => b.price - a.price);
    else if (this.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => Number(!!b.badge) - Number(!!a.badge)); // featured: badged first, stable
    return list;
  }

  private buildProducts(): HTMLElement {
    const wrap = el("div");
    const bar = el("div", "sh-toolbar");
    const t = el("div", "sh-secthead");
    t.style.margin = "0";
    const tt = el("div", "t");
    tt.append(gwIcon("box", 15, "#f0b64b"), document.createTextNode(this.cat === "all" ? "All Products" : (SHOP_CATEGORIES.find((c) => c.id === this.cat)?.label ?? "Products")));
    t.append(tt);
    bar.append(t, el("div", "sp"));
    const sel = document.createElement("select");
    for (const [v, label] of [
      ["featured", "Sort by: Featured"],
      ["price-asc", "Price · low to high"],
      ["price-desc", "Price · high to low"],
      ["name", "Name A–Z"],
    ] as const) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = label;
      if (this.sort === v) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener("change", () => {
      this.sort = sel.value as ShopSort;
      this.render();
    });
    bar.append(sel);
    bar.style.marginTop = this.cat === "all" ? "16px" : "4px";
    wrap.append(bar);

    const grid = el("div", "sh-grid");
    const items = this.sortedProducts();
    if (items.length === 0) {
      const note = el("div", "sh-note-card", this.cat === "substrate" ? SUBSTRATE_NOTE : this.cat === "tools" ? TOOLS_NOTE : "Nothing here yet.");
      grid.append(note);
    }
    for (const p of items) grid.append(this.buildProductCard(p));
    wrap.append(grid);
    return wrap;
  }

  private buildProductCard(p: ShopProduct): HTMLElement {
    const card = el("div", "sh-card");
    if (p.badge) card.append(el("span", `sh-pbadge ${p.badge}`, p.badge));
    const art = el("div", "art");
    if (p.art) {
      const img = document.createElement("img");
      img.src = p.art;
      img.alt = p.name;
      img.loading = "lazy";
      img.addEventListener("error", () => {
        img.remove();
        art.append(el("span", "g", p.glyph));
      });
      art.append(img);
    } else art.append(el("span", "g", p.glyph));
    card.append(art, el("div", "nm", p.name), el("div", "ds", p.desc));
    const foot = el("div", "foot");
    foot.append(leafPrice(p.price));
    const add = el("button", "addbtn");
    add.append(gwIcon("cart", 16));
    add.title = `Add ${p.name} to cart`;
    add.setAttribute("aria-label", `Add ${p.name} to cart`);
    add.addEventListener("click", () => this.addToCart("product", p.id));
    foot.append(add);
    card.append(foot);
    return card;
  }

  // ── Cart ───────────────────────────────────────────────────────────────────

  private addToCart(kind: CartLine["kind"], id: string): void {
    this.cart = cartAdd(this.cart, kind, id);
    this.refreshCart(true);
    sfx.done();
  }

  private buildCart(): HTMLElement {
    const side = el("div", "sh-cart");
    const panel = el("div", "sh-cartpanel");
    const head = el("div", "sh-carthead");
    const t = el("div", "t");
    t.append(gwIcon("cart", 16, "#8ce25a"), document.createTextNode(`Your Cart (${cartCount(this.cart)})`));
    head.append(t);
    if (this.cart.length) {
      const clear = el("button", "sh-clear");
      clear.append(gwIcon("trash", 15));
      clear.title = "Empty the cart";
      clear.addEventListener("click", () => {
        this.cart = [];
        this.refreshCart();
      });
      head.append(clear);
    }
    panel.append(head);

    const lines = el("div", "sh-lines");
    if (this.cart.length === 0) {
      lines.append(el("div", "sh-cartempty", "Your cart is empty — add supplies, decor pieces or a whole bundle."));
    }
    for (const line of this.cart) {
      lines.append(this.buildCartLine(line));
    }
    panel.append(lines);

    const totals = el("div", "sh-totals");
    const tt = cartTotals(this.cart);
    const r1 = el("div", "sh-trow");
    const b1 = el("b");
    b1.append(document.createTextNode(tt.subtotal.toLocaleString()), gwIcon("leaf", 12, "#8ce25a"));
    r1.append(el("span", undefined, "Subtotal"), b1);
    totals.append(r1);
    if (tt.discount > 0) {
      const r2 = el("div", "sh-trow save");
      const b2 = el("b");
      b2.append(document.createTextNode(`−${tt.discount.toLocaleString()}`), gwIcon("leaf", 12, "#a5e06b"));
      r2.append(el("span", undefined, "Bundle savings"), b2);
      totals.append(r2);
    }
    const r3 = el("div", "sh-trow total");
    const b3 = el("b");
    b3.append(document.createTextNode(tt.total.toLocaleString()), gwIcon("leaf", 15, "#8ce25a"));
    r3.append(el("span", undefined, "Total"), b3);
    totals.append(r3);
    panel.append(totals);

    const leaves = this.cb.leaves();
    const short = tt.total > leaves;
    const checkout = el("button", "gw-primary-button sh-checkout") as HTMLButtonElement;
    checkout.append(el("span", undefined, "Checkout"), el("span", "sub", short ? `Need ${(tt.total - leaves).toLocaleString()} more leaves` : "Delivers instantly"));
    checkout.disabled = this.cart.length === 0 || short;
    checkout.addEventListener("click", () => {
      const res = this.cb.checkout(this.cart);
      this.cb.toast(res.message);
      if (res.ok) {
        this.cart = [];
        this.render();
      }
    });
    panel.append(checkout);
    const bal = el("div", "sh-balance");
    bal.append(document.createTextNode(`You have ${leaves.toLocaleString()} `), gwIcon("leaf", 12, "#8ce25a"));
    panel.append(bal);
    side.append(panel);

    const promise = el("div", "sh-promise");
    const ptx = el("div");
    ptx.append(el("div", "pt", "Eco Promise"), el("div", "ps", "Ethical products for a better planet."));
    promise.append(gwIcon("shield", 24, "#8ce25a"), ptx);
    side.append(promise);
    return side;
  }

  private buildCartLine(line: CartLine): HTMLElement {
    const row = el("div", "sh-line");
    let name = "";
    let unit = 0;
    let thumb: HTMLElement;
    if (line.kind === "product") {
      const p = productById(line.id);
      name = p?.name ?? line.id;
      unit = p?.price ?? 0;
      thumb = p ? itemThumb(p.kind, p.refId) : el("span", "sh-bitem");
    } else {
      const b = SHOP_BUNDLES.find((x) => x.id === line.id);
      name = b?.name ?? line.id;
      unit = b ? bundlePricing(b).price : 0;
      thumb = el("span", "sh-bitem");
      thumb.append(el("span", "g", "🎁"));
    }
    thumb.classList.add("thumb");
    const mid = el("div", "mid");
    const qty = el("div", "qty");
    const minus = el("button", "qb", "−");
    minus.addEventListener("click", () => {
      this.cart = cartSetQty(this.cart, line.kind, line.id, line.qty - 1);
      this.refreshCart();
    });
    const plus = el("button", "qb", "+");
    plus.addEventListener("click", () => {
      this.cart = cartSetQty(this.cart, line.kind, line.id, line.qty + 1);
      this.refreshCart();
    });
    qty.append(minus, el("span", "qn", String(line.qty)), plus);
    mid.append(el("div", "nm", name), qty);
    const pr = el("span", "pr");
    pr.append(document.createTextNode((unit * line.qty).toLocaleString()), gwIcon("leaf", 12, "#8ce25a"));
    const rm = el("button", "rm", "✕");
    rm.title = `Remove ${name}`;
    rm.addEventListener("click", () => {
      this.cart = cartSetQty(this.cart, line.kind, line.id, 0);
      this.refreshCart();
    });
    row.append(thumb, mid, pr, rm);
    return row;
  }

  private buildTrust(): HTMLElement {
    const strip = el("div", "sh-trust");
    const item = (icon: Parameters<typeof gwIcon>[0], tt: string, ts: string): HTMLElement => {
      const d = el("div", "ti");
      const tx = el("div");
      tx.append(el("div", "tt", tt), el("div", "ts", ts));
      d.append(gwIcon(icon, 22, "#8ce25a"), tx);
      return d;
    };
    strip.append(
      item("shield", "Sustainable & Ethical", "Responsibly sourced products."),
      item("check", "Keeper Approved", "Trusted by keepers in our habitats."),
      item("heart", "Expert Support", "The Care Guide is always a door away."),
    );
    return strip;
  }
}

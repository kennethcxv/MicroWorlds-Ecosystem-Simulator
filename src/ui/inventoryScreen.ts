/**
 * INVENTORY — the reference-match screen (Designs/Inventory_Screen): category
 * tabs, a left summary rail with live counts, a 5-per-row grid of REAL items
 * (decor thumbs are studio renders of the actual GLBs), and a right detail
 * panel with husbandry-useful facts (size, biome, habitat effects, in-use
 * counts) + real actions — Place in Habitat arms the piece in Decorate mode,
 * Sell refunds leaves, supplies jump to the Supply Shop.
 *
 * Hosted by HubScreens ("inventory" case, host chrome hidden). All content
 * comes from src/data/inventoryPage.ts (pure, tested).
 */
import { gwEl as el, ensureGwStyles, gwBackPill } from "./gwTheme";
import { gwIcon } from "./gwIcons";
import { ASSETS } from "../data/assets";
import { TERRAINS } from "../data/terrains";
import { terrainSwatchUrl } from "./terrainSwatch";
import { findPlaceable } from "../habitats/HabitatBuilder";
import { decorThumbPath } from "../data/shopCatalog";
import type { BuybackEntry } from "../game/decorInventory";
import {
  INV_CATEGORIES,
  INV_SORTS,
  buildInventoryItems,
  categoryCounts,
  invTotals,
  itemsInCategory,
  paginate,
  sortItems,
  type InvCategoryId,
  type InvItem,
  type InvSort,
  type InventoryInputs,
} from "../data/inventoryPage";

export interface InventoryCallbacks {
  close(): void;
  openShop(): void;
  /** Live wallet for the header pills (leaves = the game's coin). */
  resources(): { leaves: number; reputation: number };
  /** Enter the vivarium with this owned piece armed in Decorate mode. */
  placeInHabitat(defId: string): void;
  /** Enter the vivarium's Decorate mode with nothing armed — edit placed decor. */
  editInHabitat(): void;
  enterHabitat(id: "lizard" | "frog" | "fish"): void;
  /** Sell one owned piece back; the app owns the money. */
  sellItem(defId: string): { ok: boolean; message: string };
  /** Bulk Actions: sell every spare decor piece. */
  sellAllSpares(): { ok: boolean; message: string };
  /** Recently sold pieces (newest first) — the undo list. */
  buybackList(): BuybackEntry[];
  /** Re-buy list entry `index` at exactly the price it refunded. */
  buyBack(index: number): { ok: boolean; message: string };
  toast(message: string): void;
  data(): InventoryInputs;
}

type OwnFilter = "all" | "stocked" | "placed";

let stylesIn = false;
function ensureStyles(): void {
  if (stylesIn) return;
  stylesIn = true;
  const css = `
  .gw-inv { position: relative; flex: 1; display: flex; flex-direction: column; min-height: 0;
    color: var(--gw-ink); font-family: var(--gw-font); }
  .gw-inv .iv-bg { position: absolute; inset: 0; background-size: cover; background-position: center 36%; }
  .gw-inv .iv-bg::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(6,9,8,0.93) 0%, rgba(6,9,8,0.88) 40%, rgba(5,8,7,0.95) 100%); }
  .gw-inv .iv-shell { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; min-height: 0;
    width: min(1760px, 100%); margin: 0 auto; padding: clamp(14px, 2.4vh, 26px) clamp(16px, 2.2vw, 34px) 0; }

  .gw-inv h1 { margin: 0; font: 900 clamp(24px, 2.4vw, 34px)/1.05 var(--gw-font); letter-spacing: 0.2px; }

  /* Header wallet pills (leaves = coins, reputation) — live values. */
  .gw-inv .iv-res { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; }
  .gw-inv .iv-res .pill { display: inline-flex; align-items: center; gap: 8px; padding: 9px 15px;
    border-radius: 999px; background: rgba(12,15,14,0.78); border: 1.5px solid var(--gw-border-soft);
    font: 800 13px/1 var(--gw-font); font-variant-numeric: tabular-nums;
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); }

  /* Toolbar above the grid: current category + count, then sort + view.
     Categories live ONLY in the left rail. */
  .gw-inv .iv-toolbar { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding: 8px 8px 8px 15px;
    border-radius: 16px; background: rgba(10,13,12,0.66); border: 1px solid var(--gw-border-soft);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); flex-wrap: wrap; }
  .gw-inv .iv-toolbar .tl { display: inline-flex; align-items: center; gap: 9px; font: 700 13.5px/1 var(--gw-font); }
  .gw-inv .iv-toolbar .tl .n { font: 600 11.5px/1 var(--gw-font); color: var(--gw-ink-dim); padding: 4px 9px;
    border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid var(--gw-border-soft); }
  .gw-inv .iv-toolbar .sp { flex: 1; }
  .gw-inv .iv-sort { display: inline-flex; align-items: center; gap: 8px; font: 600 11.5px/1 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-inv .iv-sort select { appearance: none; cursor: pointer; padding: 8px 26px 8px 11px; border-radius: 10px;
    background: rgba(255,255,255,0.06) url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23cfe0cf' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 9px center;
    border: 1px solid var(--gw-border-soft); color: var(--gw-ink); font: 700 12px/1 var(--gw-font); }
  .gw-inv .iv-viewbtn { appearance: none; cursor: pointer; display: grid; place-items: center; width: 34px; height: 34px;
    border-radius: 10px; border: 1px solid var(--gw-border-soft); background: rgba(255,255,255,0.05); color: var(--gw-ink-dim); }
  .gw-inv .iv-viewbtn.on { color: var(--gw-green); border-color: var(--gw-green-line); background: rgba(120,200,80,0.12); }

  .gw-inv .iv-cols { flex: 1; min-height: 0; display: grid; grid-template-columns: 236px minmax(0,1fr) 344px;
    gap: clamp(10px, 1.2vw, 18px); margin-top: 12px; }
  .gw-inv .iv-side { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding-bottom: 12px; }
  .gw-inv .iv-panel { border-radius: 18px; background: rgba(12,15,14,0.78); border: 1.5px solid var(--gw-border-soft);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); padding: 10px; }
  .gw-inv .iv-cat { appearance: none; cursor: pointer; width: 100%; display: flex; align-items: center; gap: 10px;
    padding: 10px 11px; border-radius: 12px; border: 1.5px solid transparent; background: transparent;
    color: var(--gw-ink-dim); font: 700 12.5px/1 var(--gw-font); text-align: left; transition: background .13s, color .13s; }
  .gw-inv .iv-cat:hover { background: rgba(255,255,255,0.05); color: var(--gw-ink); }
  .gw-inv .iv-cat.on { color: var(--gw-green); border-color: var(--gw-green-line); background: rgba(120,200,80,0.1); }
  .gw-inv .iv-cat .n { margin-left: auto; font: 700 11.5px/1 var(--gw-font); color: var(--gw-ink-dim); font-variant-numeric: tabular-nums; }
  .gw-inv .iv-cat.on .n { color: var(--gw-green); }
  .gw-inv .iv-totals { padding: 13px 14px; }
  .gw-inv .iv-totals .row { display: flex; align-items: baseline; justify-content: space-between; padding: 5px 0;
    font: 600 12px/1.2 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-inv .iv-totals .row b { font: 800 14px/1 var(--gw-font); color: var(--gw-ink); font-variant-numeric: tabular-nums;
    display: inline-flex; align-items: center; gap: 5px; }
  .gw-inv .iv-totals .gw-ghost-button { width: 100%; margin-top: 9px; justify-content: center; display: inline-flex; align-items: center; gap: 7px; }

  .gw-inv .iv-main { display: flex; flex-direction: column; min-height: 0; }
  .gw-inv .iv-grid { flex: 1; min-height: 0; overflow-y: auto; display: grid; align-content: start;
    grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 11px; padding: 2px 2px 10px; scrollbar-width: thin; }
  .gw-inv .iv-card { position: relative; appearance: none; cursor: pointer; text-align: center; padding: 0 0 11px;
    border-radius: 16px; border: 1.5px solid var(--gw-border-soft); background: rgba(12,15,14,0.8); color: var(--gw-ink);
    font-family: var(--gw-font); overflow: hidden; transition: transform .13s, border-color .14s, box-shadow .14s; }
  .gw-inv .iv-card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.24); box-shadow: 0 10px 26px rgba(0,0,0,0.4); }
  .gw-inv .iv-card.sel { border-color: var(--gw-green-line); box-shadow: 0 0 0 1px var(--gw-green-line), 0 0 22px rgba(120,200,80,0.22); }
  .gw-inv .iv-card .qty { position: absolute; top: 8px; right: 8px; z-index: 1; padding: 4px 8px; border-radius: 999px;
    background: rgba(8,10,9,0.82); border: 1px solid var(--gw-border-soft); font: 800 10.5px/1 var(--gw-font); }
  .gw-inv .iv-card .qty.zero { color: var(--gw-amber); }
  .gw-inv .iv-card .art { aspect-ratio: 1 / 1; display: grid; place-items: center; padding: 10px;
    background: radial-gradient(circle at 50% 42%, rgba(126,110,80,0.3), rgba(10,12,11,0.1) 70%); }
  .gw-inv .iv-card .art img { max-width: 92%; max-height: 92%; object-fit: contain; display: block;
    filter: drop-shadow(0 8px 10px rgba(0,0,0,0.45)); }
  .gw-inv .iv-card .art img.swatch { width: 72%; height: 72%; object-fit: cover; border-radius: 12px;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12), 0 8px 14px rgba(0,0,0,0.4); }
  .gw-inv .iv-card .art .glyph { font-size: 46px; filter: drop-shadow(0 6px 8px rgba(0,0,0,0.5)); }
  .gw-inv .iv-card .nm { margin-top: 9px; padding: 0 8px; font: 700 12.5px/1.25 var(--gw-font); }
  .gw-inv .iv-card .sub { margin-top: 3px; font: 600 10px/1.2 var(--gw-font); color: var(--gw-ink-dim); }

  .gw-inv .iv-grid.listmode { display: flex; flex-direction: column; gap: 8px; }
  .gw-inv .iv-grid.listmode .iv-card { display: flex; align-items: center; text-align: left; padding: 8px 14px 8px 8px; gap: 12px; }
  .gw-inv .iv-grid.listmode .iv-card .art { aspect-ratio: auto; width: 54px; height: 54px; border-radius: 12px; padding: 4px; flex: 0 0 auto; }
  .gw-inv .iv-grid.listmode .iv-card .art .glyph { font-size: 26px; }
  .gw-inv .iv-grid.listmode .iv-card .nm { margin: 0; padding: 0; flex: 1; }
  .gw-inv .iv-grid.listmode .iv-card .qty { position: static; margin-left: auto; }
  .gw-inv .iv-grid.listmode .iv-card .sub { margin: 0; }

  .gw-inv .iv-pager { display: flex; align-items: center; justify-content: center; gap: 7px; padding: 10px 0 12px; }
  .gw-inv .iv-page { appearance: none; cursor: pointer; min-width: 34px; height: 34px; padding: 0 8px; border-radius: 10px;
    border: 1px solid var(--gw-border-soft); background: rgba(255,255,255,0.05); color: var(--gw-ink-dim);
    font: 800 12.5px/1 var(--gw-font); }
  .gw-inv .iv-page.on { color: #0d1409; background: linear-gradient(180deg, #7ecb52, #55a337); border-color: transparent; }
  .gw-inv .iv-page:disabled { opacity: 0.35; cursor: default; }

  .gw-inv .iv-detail { min-height: 0; overflow-y: auto; scrollbar-width: thin; border-radius: 20px;
    background: rgba(12,15,14,0.84); border: 1.5px solid var(--gw-border-soft);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); padding: 16px 16px 14px; }
  .gw-inv .iv-detail .dt { display: flex; align-items: center; gap: 10px; }
  .gw-inv .iv-detail .dt h2 { margin: 0; font: 800 19px/1.15 var(--gw-font); flex: 1; }
  .gw-inv .iv-rarity { display: inline-block; margin-top: 8px; padding: 4px 10px; border-radius: 999px;
    font: 800 10.5px/1 var(--gw-font); letter-spacing: 0.4px; }
  .gw-inv .iv-dart { margin-top: 12px; border-radius: 16px; overflow: hidden; display: grid; place-items: center;
    aspect-ratio: 16 / 10; background: radial-gradient(circle at 50% 40%, rgba(130,112,80,0.36), rgba(9,11,10,0.2) 74%);
    border: 1px solid var(--gw-border-soft); }
  .gw-inv .iv-dart img { max-width: 86%; max-height: 88%; object-fit: contain; filter: drop-shadow(0 14px 16px rgba(0,0,0,0.5)); }
  .gw-inv .iv-dart img.swatch { width: 56%; height: auto; aspect-ratio: 1; object-fit: cover; border-radius: 14px;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14), 0 12px 20px rgba(0,0,0,0.45); }
  .gw-inv .iv-dart .glyph { font-size: 74px; filter: drop-shadow(0 10px 12px rgba(0,0,0,0.5)); }

  /* Buy Back — the undo list for sold pieces. */
  .gw-inv .iv-buyback { padding: 13px 14px; }
  .gw-inv .iv-buyback .cap { display: flex; align-items: center; gap: 8px; font: 800 11px/1 var(--gw-font);
    letter-spacing: 1px; text-transform: uppercase; color: var(--gw-ink-dim); }
  .gw-inv .iv-buyback .note { margin-top: 7px; font: 500 11px/1.45 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-inv .iv-buyback .bbrow { appearance: none; cursor: pointer; width: 100%; display: flex; align-items: center;
    gap: 9px; margin-top: 7px; padding: 7px 8px; border-radius: 11px; text-align: left;
    border: 1px solid var(--gw-border-soft); background: rgba(255,255,255,0.035); color: var(--gw-ink);
    font: 700 11.5px/1.2 var(--gw-font); transition: border-color .14s, background .14s; }
  .gw-inv .iv-buyback .bbrow:hover { border-color: var(--gw-green-line); background: rgba(120,200,80,0.08); }
  .gw-inv .iv-buyback .bbrow .th { width: 30px; height: 30px; border-radius: 8px; overflow: hidden; flex: 0 0 auto;
    display: grid; place-items: center; background: radial-gradient(circle at 50% 42%, rgba(126,110,80,0.3), rgba(10,12,11,0.2) 75%); }
  .gw-inv .iv-buyback .bbrow .th img { max-width: 92%; max-height: 92%; object-fit: contain; }
  .gw-inv .iv-buyback .bbrow .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gw-inv .iv-buyback .bbrow .pr { flex: 0 0 auto; font: 800 11px/1 var(--gw-font); color: var(--gw-amber); }

  /* Bulk Actions expands INLINE inside the totals panel (never a clipped popover). */
  .gw-inv .iv-bulkbtn .chev { margin-left: auto; color: var(--gw-ink-dim); font: 800 14px/1 var(--gw-font);
    transform: rotate(90deg); transition: transform 0.16s, color 0.16s; }
  .gw-inv .iv-bulkbtn.on { border-color: var(--gw-green-line); color: var(--gw-green); }
  .gw-inv .iv-bulkbtn.on .chev { transform: rotate(-90deg); color: var(--gw-green); }
  .gw-inv .iv-bulkbody { margin-top: 9px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.07);
    display: flex; flex-direction: column; gap: 3px; }
  .gw-inv .iv-bulkbody[hidden] { display: none; }
  .gw-inv .iv-bulkbody .fo:disabled { opacity: 0.45; cursor: default; }
  .gw-inv .iv-actrow { display: flex; gap: 8px; margin-top: 11px; }
  .gw-inv .iv-actrow .gw-ghost-button { flex: 1; justify-content: center; display: inline-flex; align-items: center; gap: 7px; }
  .gw-inv .iv-actrow .iv-sell { width: auto; flex: 1.35; min-width: 0; }
  .gw-inv .iv-actrow .gw-ghost-button:disabled { opacity: 0.45; cursor: default; }
  .gw-inv .iv-desc { margin-top: 12px; font: 500 12px/1.55 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-inv .iv-facts { margin-top: 12px; border-radius: 14px; border: 1px solid var(--gw-border-soft);
    background: rgba(255,255,255,0.035); padding: 11px 13px; }
  .gw-inv .iv-facts .cap { font: 800 11px/1 var(--gw-font); letter-spacing: 1px; text-transform: uppercase;
    color: var(--gw-ink-dim); margin-bottom: 4px; }
  .gw-inv .iv-fact { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 5.5px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05); font: 600 12px/1.2 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-inv .iv-fact:last-child { border-bottom: none; }
  .gw-inv .iv-fact b { font: 700 12px/1.2 var(--gw-font); color: var(--gw-ink); display: inline-flex; align-items: center; gap: 5px; }
  .gw-inv .iv-effects { margin-top: 12px; }
  .gw-inv .iv-eff { display: grid; grid-template-columns: 108px 1fr; align-items: center; gap: 9px; padding: 3.5px 0; }
  .gw-inv .iv-eff .k { font: 600 10.5px/1.2 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-inv .iv-eff .track { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
  .gw-inv .iv-eff .fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #6fbf49, #a5e06b); }
  .gw-inv .iv-tip { margin-top: 12px; display: flex; gap: 9px; padding: 10px 12px; border-radius: 12px;
    background: rgba(240,182,75,0.08); border: 1px solid rgba(240,182,75,0.3); font: 500 11.5px/1.5 var(--gw-font); }
  .gw-inv .iv-cta { margin-top: 13px; display: flex; flex-direction: column; gap: 8px; }
  .gw-inv .iv-cta .gw-primary-button { width: 100%; justify-content: center; }
  .gw-inv .iv-sell { appearance: none; cursor: pointer; width: 100%; padding: 11px; border-radius: 12px;
    border: 1.5px solid rgba(226,105,78,0.45); background: rgba(226,105,78,0.1); color: #ffb9a6;
    font: 800 12.5px/1 var(--gw-font); transition: background .14s; }
  .gw-inv .iv-sell:hover { background: rgba(226,105,78,0.18); }
  .gw-inv .iv-sell:disabled { opacity: 0.4; cursor: default; }
  .gw-inv .iv-empty-detail { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center;
    padding: 46px 18px; color: var(--gw-ink-dim); font: 500 12.5px/1.5 var(--gw-font); }

  .gw-inv .iv-foot { position: relative; z-index: 1; display: flex; align-items: center; gap: 14px;
    padding: 10px clamp(16px, 2.2vw, 34px) 14px; border-top: 1px solid rgba(255,255,255,0.06);
    background: rgba(8,10,9,0.72); backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); }
  .gw-inv .iv-foot .hint { flex: 1; text-align: center; font: 600 12px/1.3 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-inv .iv-filterwrap { position: relative; }
  .gw-inv .iv-filtermenu { position: absolute; right: 0; bottom: calc(100% + 8px); width: 230px; padding: 8px;
    border-radius: 14px; background: rgba(14,17,15,0.97); border: 1.5px solid var(--gw-border);
    box-shadow: 0 18px 44px rgba(0,0,0,0.55); display: none; z-index: 5; }
  .gw-inv .iv-filtermenu.open { display: block; }
  .gw-inv .iv-filtermenu .fo, .gw-inv .iv-bulkbody .fo { appearance: none; cursor: pointer; width: 100%;
    display: flex; align-items: center; gap: 9px;
    padding: 9px 10px; border-radius: 10px; border: none; background: transparent; color: var(--gw-ink-dim);
    font: 700 12px/1.25 var(--gw-font); text-align: left; }
  .gw-inv .iv-filtermenu .fo:hover, .gw-inv .iv-bulkbody .fo:hover:not(:disabled) { background: rgba(255,255,255,0.06); color: var(--gw-ink); }
  .gw-inv .iv-filtermenu .fo.on { color: var(--gw-green); }

  .gw-inv .iv-emptygrid { grid-column: 1 / -1; }

  @media (max-width: 1440px) { .gw-inv .iv-grid { grid-template-columns: repeat(4, minmax(0,1fr)); } }
  @media (max-width: 1240px) {
    .gw-inv .iv-cols { grid-template-columns: 200px minmax(0,1fr); }
    .gw-inv .iv-detail { position: fixed; right: 12px; top: 12px; bottom: 12px; width: min(360px, 92vw); z-index: 6;
      box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
    .gw-inv .iv-detail.hidden-sm { display: none; }
  }
  @media (max-width: 1100px) { .gw-inv .iv-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }
  .gw-inv button:focus-visible { outline: 2px solid var(--gw-green); outline-offset: 2px; }
  `;
  const tag = document.createElement("style");
  tag.id = "gw-inventory-styles";
  tag.textContent = css;
  document.head.append(tag);
}

const RARITY_TINTS: Record<string, [string, string]> = {
  Common: ["rgba(190,205,190,0.14)", "#c8d6c8"],
  Uncommon: ["rgba(120,200,80,0.16)", "#9fdc74"],
  Rare: ["rgba(110,180,235,0.16)", "#8fc9ef"],
  Exceptional: ["rgba(240,182,75,0.18)", "#f0c46b"],
};

export class InventoryView {
  readonly root: HTMLElement;
  private tabsEl!: HTMLElement;
  private resEl!: HTMLElement;
  private colsEl!: HTMLElement;
  private items: InvItem[] = [];
  private cat: InvCategoryId = "all";
  private sort: InvSort = "recent";
  private page = 0;
  private listMode = false;
  private ownFilter: OwnFilter = "all";
  private selectedId: string | null = null;
  private filterOpen = false;
  private bulkOpen = false;
  /** Turntable step (0..3) for the detail preview's Rotate button. */
  private rotYaw = 0;

  constructor(private cb: InventoryCallbacks) {
    ensureGwStyles();
    ensureStyles();
    this.root = el("div", "gw-inv");
    const bg = el("div", "iv-bg");
    bg.style.backgroundImage = `url("${ASSETS.room.ecocenter}")`;
    this.root.append(bg);
    const shell = el("div", "iv-shell");
    const hrow = el("div");
    hrow.style.cssText = "display:flex;align-items:center;gap:16px;";
    this.resEl = el("div", "iv-res");
    hrow.append(gwBackPill(() => this.cb.close()), el("h1", undefined, "Inventory"), this.resEl);
    shell.append(hrow);
    this.tabsEl = el("div", "iv-toolbar");
    this.colsEl = el("div", "iv-cols");
    shell.append(this.tabsEl, this.colsEl);
    this.root.append(shell, this.buildFooter());
  }

  /** Re-pull live data and render. */
  show(): void {
    this.items = buildInventoryItems(this.cb.data());
    if (!this.selectedId || !this.items.find((i) => i.id === this.selectedId)) {
      this.selectedId = this.items[0]?.id ?? null;
    }
    this.rotYaw = 0;
    this.bulkOpen = false;
    this.render();
  }

  /** Esc: close open menus first → then let the host close the screen. */
  handleEscape(): boolean {
    if (this.filterOpen || this.bulkOpen) {
      this.filterOpen = false;
      this.bulkOpen = false;
      this.render();
      return true;
    }
    return false;
  }

  private refresh(): void {
    this.items = buildInventoryItems(this.cb.data());
    this.render();
  }

  private visibleItems(): InvItem[] {
    let list = itemsInCategory(this.items, this.cat);
    if (this.ownFilter === "stocked") list = list.filter((i) => (i.qty ?? 1) > 0);
    else if (this.ownFilter === "placed") list = list.filter((i) => i.inUse > 0);
    return sortItems(list, this.sort);
  }

  private render(): void {
    this.renderResources();
    this.renderToolbar();
    this.colsEl.replaceChildren(this.buildSide(), this.buildMain(), this.buildDetail());
  }

  /** Header wallet pills — live, so a sale updates them on the spot. */
  private renderResources(): void {
    const r = this.cb.resources();
    this.resEl.replaceChildren();
    const pill = (icon: Parameters<typeof gwIcon>[0], tint: string, value: string, title: string): HTMLElement => {
      const p = el("span", "pill");
      p.title = title;
      p.append(gwIcon(icon, 14, tint), document.createTextNode(value));
      return p;
    };
    this.resEl.append(
      pill("leaf", "#8ce25a", r.leaves.toLocaleString(), "Leaves — earned by caring, spent in the Supply Shop"),
      pill("star", "#f0b64b", r.reputation.toLocaleString(), "Reputation — your standing as a keeper"),
    );
  }

  /** The toolbar above the grid: current category + live count on the left,
   *  sort + view mode on the right. Categories live ONLY in the left rail —
   *  the old duplicate tab pills are gone. */
  private renderToolbar(): void {
    this.tabsEl.replaceChildren();
    const counts = categoryCounts(this.items);
    const c = INV_CATEGORIES.find((x) => x.id === this.cat) ?? INV_CATEGORIES[0];
    const title = el("div", "tl");
    const n = counts[this.cat];
    title.append(gwIcon(c.icon, 15, "#f0b64b"), el("b", undefined, c.label), el("span", "n", `${n} item${n === 1 ? "" : "s"}`));
    this.tabsEl.append(title, el("div", "sp"));
    const sortWrap = el("label", "iv-sort");
    sortWrap.append(document.createTextNode("Sort by:"));
    const sel = document.createElement("select");
    for (const s of INV_SORTS) {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.label;
      if (s.id === this.sort) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener("change", () => {
      this.sort = sel.value as InvSort;
      this.page = 0;
      this.render();
    });
    sortWrap.append(sel);
    const gridBtn = el("button", `iv-viewbtn${this.listMode ? "" : " on"}`);
    gridBtn.append(gwIcon("grid", 15));
    gridBtn.title = "Grid view";
    gridBtn.setAttribute("aria-label", "Grid view");
    gridBtn.addEventListener("click", () => {
      this.listMode = false;
      this.render();
    });
    const listBtn = el("button", `iv-viewbtn${this.listMode ? " on" : ""}`);
    listBtn.append(gwIcon("list", 15));
    listBtn.title = "List view";
    listBtn.setAttribute("aria-label", "List view");
    listBtn.addEventListener("click", () => {
      this.listMode = true;
      this.render();
    });
    this.tabsEl.append(sortWrap, gridBtn, listBtn);
  }

  private buildSide(): HTMLElement {
    const side = el("div", "iv-side");
    const cats = el("div", "iv-panel");
    const counts = categoryCounts(this.items);
    for (const c of INV_CATEGORIES) {
      const b = el("button", `iv-cat${this.cat === c.id ? " on" : ""}`);
      b.append(gwIcon(c.icon, 15, this.cat === c.id ? "#8ce25a" : "#f0b64b"), document.createTextNode(c.label), el("span", "n", String(counts[c.id])));
      b.addEventListener("click", () => {
        this.cat = c.id;
        this.page = 0;
        const vis = this.visibleItems();
        if (!vis.find((i) => i.id === this.selectedId)) { this.selectedId = vis[0]?.id ?? null; this.rotYaw = 0; }
        this.render();
      });
      cats.append(b);
    }
    const totals = el("div", "iv-panel iv-totals");
    const t = invTotals(this.items);
    const r1 = el("div", "row");
    const b1 = el("b", undefined, t.totalItems.toLocaleString());
    r1.append(el("span", undefined, "Total Items"), b1);
    const r2 = el("div", "row");
    const b2 = el("b");
    b2.append(gwIcon("leaf", 13, "#8ce25a"), document.createTextNode(t.totalValue.toLocaleString()));
    r2.append(el("span", undefined, "Total Value"), b2);

    // Bulk Actions — expands INLINE inside this panel (a floating popover
    // clipped against the rail's scroll edge and read as broken).
    const spares = this.items.filter((i) => i.kind === "decor" && (i.qty ?? 0) > 0);
    const spareCount = spares.reduce((n, i) => n + (i.qty ?? 0), 0);
    const spareRefund = spares.reduce((n, i) => n + (i.qty ?? 0) * Math.floor(i.value * 0.6), 0);
    const bulk = el("button", `gw-ghost-button iv-bulkbtn${this.bulkOpen ? " on" : ""}`);
    bulk.append(gwIcon("sliders", 14), document.createTextNode("Bulk Actions"));
    const chev = el("span", "chev", "›");
    bulk.append(chev);
    const body = el("div", "iv-bulkbody");
    body.hidden = !this.bulkOpen;
    const sellAll = el("button", "fo") as HTMLButtonElement;
    sellAll.append(gwIcon("cart", 13), document.createTextNode(`Sell all spares (+${spareRefund.toLocaleString()} 🍃)`));
    sellAll.disabled = spareCount === 0;
    if (spareCount === 0) sellAll.title = "No spare pieces — placed decor stays placed";
    else sellAll.title = `${spareCount} spare piece${spareCount === 1 ? "" : "s"} at 60% of catalog price`;
    let confirmingAll = false;
    sellAll.addEventListener("click", () => {
      if (spareCount === 0) return;
      if (!confirmingAll) {
        confirmingAll = true;
        sellAll.replaceChildren(gwIcon("cart", 13), document.createTextNode(`Really sell ${spareCount}? Click again`));
        window.setTimeout(() => {
          confirmingAll = false;
          if (sellAll.isConnected)
            sellAll.replaceChildren(gwIcon("cart", 13), document.createTextNode(`Sell all spares (+${spareRefund.toLocaleString()} 🍃)`));
        }, 2600);
        return;
      }
      const res = this.cb.sellAllSpares();
      this.cb.toast(res.message);
      this.bulkOpen = false;
      this.refresh();
    });
    const restock = el("button", "fo");
    restock.append(gwIcon("bag", 13), document.createTextNode("Restock supplies — Supply Shop"));
    restock.addEventListener("click", () => this.cb.openShop());
    body.append(sellAll, restock);
    bulk.addEventListener("click", () => {
      this.bulkOpen = !this.bulkOpen;
      body.hidden = !this.bulkOpen;
      bulk.classList.toggle("on", this.bulkOpen);
    });

    totals.append(r1, r2, bulk, body);
    side.append(cats, totals);

    // Buy Back — sold something by mistake? Take it back at the same price.
    const bb = this.cb.buybackList();
    if (bb.length > 0) {
      const panel = el("div", "iv-panel iv-buyback");
      const cap = el("div", "cap");
      cap.append(gwIcon("rotate", 13, "#f0b64b"), document.createTextNode("Buy Back"));
      panel.append(cap, el("div", "note", "Sold by mistake? Take it back at the price it refunded."));
      bb.forEach((entry, i) => {
        const def = findPlaceable(entry.defId);
        const row = el("button", "bbrow") as HTMLButtonElement;
        const thumb = el("span", "th");
        const img = document.createElement("img");
        img.src = decorThumbPath(entry.defId);
        img.alt = "";
        img.addEventListener("error", () => img.remove());
        thumb.append(img);
        const price = el("span", "pr", `−${entry.price} 🍃`);
        row.append(thumb, el("span", "nm", def?.label ?? entry.defId), price);
        row.title = `Buy ${def?.label ?? "it"} back for ${entry.price} leaves`;
        row.addEventListener("click", () => {
          const res = this.cb.buyBack(i);
          this.cb.toast(res.message);
          if (res.ok) this.refresh();
        });
        panel.append(row);
      });
      side.append(panel);
    }
    return side;
  }

  private buildMain(): HTMLElement {
    const main = el("div", "iv-main");
    const grid = el("div", `iv-grid${this.listMode ? " listmode" : ""}`);
    const vis = this.visibleItems();
    const pg = paginate(vis, this.page);
    this.page = pg.page;
    if (pg.slice.length === 0) {
      const empty = el("div", "gw-empty-state iv-emptygrid");
      empty.append(
        el("span", "big", "🎒"),
        el("span", undefined, this.cat === "decor" || this.cat === "plants" ? "No spare pieces here yet." : "Nothing matches this view."),
        el("span", undefined, this.cat === "decor" || this.cat === "plants" ? "The Supply Shop sells habitat pieces — placed ones show up here too." : "Try another category or filter."),
      );
      grid.append(empty);
    }
    for (const item of pg.slice) grid.append(this.buildCard(item));
    main.append(grid);
    if (pg.pages > 1) {
      const pager = el("div", "iv-pager");
      const prev = el("button", "iv-page", "‹") as HTMLButtonElement;
      prev.disabled = pg.page === 0;
      prev.addEventListener("click", () => {
        this.page--;
        this.render();
      });
      pager.append(prev);
      for (let i = 0; i < pg.pages; i++) {
        const b = el("button", `iv-page${i === pg.page ? " on" : ""}`, String(i + 1));
        b.addEventListener("click", () => {
          this.page = i;
          this.render();
        });
        pager.append(b);
      }
      const next = el("button", "iv-page", "›") as HTMLButtonElement;
      next.disabled = pg.page >= pg.pages - 1;
      next.addEventListener("click", () => {
        this.page++;
        this.render();
      });
      pager.append(next);
      main.append(pager);
    }
    return main;
  }

  /** Best image for an item: real file art, else the substrate's procedural
   *  swatch (Arid Soil / Bark Chips / Leaf Litter draw theirs at runtime). */
  private artUrl(item: InvItem, size = 192): string | null {
    if (item.art) return item.art;
    if (item.kind === "substrate") {
      const t = TERRAINS.find((x) => x.id === item.refId);
      if (t) {
        try {
          return terrainSwatchUrl(t, size);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private buildCard(item: InvItem): HTMLElement {
    const card = el("button", `iv-card${item.id === this.selectedId ? " sel" : ""}`);
    // Quantity chip only where a count exists — permanent kit / unlocked
    // substrates carry their status in the sub line instead (reference look).
    if (item.qty != null) {
      const chipText =
        item.kind === "supply" ? (item.qty === 0 ? "Out" : `×${item.qty}`) : item.qty === 0 ? "Placed" : `×${item.qty}`;
      card.append(el("span", `qty${item.qty === 0 ? " zero" : ""}`, chipText));
    }
    const art = el("div", "art");
    const artSrc = this.artUrl(item);
    if (artSrc) {
      const img = document.createElement("img");
      img.src = artSrc;
      img.alt = item.name;
      img.loading = "lazy";
      img.addEventListener("error", () => {
        img.remove();
        art.append(el("span", "glyph", item.glyph));
      });
      if (item.kind === "substrate") img.classList.add("swatch");
      art.append(img);
    } else {
      art.append(el("span", "glyph", item.glyph));
    }
    card.append(art, el("div", "nm", item.name));
    const sub =
      item.inUse > 0 ? `${item.inUse} in habitat` : item.kind === "supply" ? item.qtyLabel : item.qty == null ? item.qtyLabel : item.rarity;
    card.append(el("div", "sub", sub));
    card.addEventListener("click", () => {
      this.selectedId = item.id;
      this.rotYaw = 0;
      this.render();
    });
    return card;
  }

  private buildDetail(): HTMLElement {
    const panel = el("div", "iv-detail");
    const item = this.items.find((i) => i.id === this.selectedId) ?? null;
    if (!item) {
      const empty = el("div", "iv-empty-detail");
      empty.append(el("span", undefined, "🔍"), el("span", undefined, "Select an item to view details and place it in your habitat."));
      panel.append(empty);
      return panel;
    }
    const head = el("div", "dt");
    head.append(el("h2", undefined, item.name));
    const x = el("button", "gw-x", "✕");
    x.title = "Clear selection";
    x.addEventListener("click", () => {
      this.selectedId = null;
      this.render();
    });
    head.append(x);
    panel.append(head);
    const [bgTint, fgTint] = RARITY_TINTS[item.rarity] ?? RARITY_TINTS.Common;
    const rar = el("span", "iv-rarity", item.qty == null ? item.qtyLabel : item.rarity);
    rar.style.background = bgTint;
    rar.style.color = fgTint;
    panel.append(rar);

    const dart = el("div", "iv-dart");
    const baseArt = this.artUrl(item, 256);
    let dartImg: HTMLImageElement | null = null;
    if (baseArt) {
      const img = document.createElement("img");
      img.src = this.rotatedArt(item, baseArt);
      img.alt = item.name;
      img.addEventListener("error", () => {
        // Missing turntable frame → fall back to the base render, never a hole.
        if (img.src.includes("_y")) img.src = baseArt;
        else {
          img.remove();
          dart.append(el("span", "glyph", item.glyph));
        }
      });
      if (item.kind === "substrate") img.classList.add("swatch");
      dart.append(img);
      dartImg = img;
    } else dart.append(el("span", "glyph", item.glyph));
    panel.append(dart);

    if (item.kind === "decor" || item.kind === "substrate") {
      const acts = el("div", "iv-actrow");
      if (item.kind === "decor" && baseArt) {
        const rot = el("button", "gw-ghost-button");
        rot.append(gwIcon("rotate", 14), document.createTextNode("Rotate"));
        rot.title = "Turn the piece to see its other sides";
        rot.addEventListener("click", () => {
          this.rotYaw = (this.rotYaw + 1) % 4;
          if (dartImg) dartImg.src = this.rotatedArt(item, baseArt);
        });
        acts.append(rot);
      }
      const view = el("button", "gw-ghost-button");
      view.append(gwIcon("eye", 14), document.createTextNode("View in Habitat"));
      view.addEventListener("click", () => this.cb.enterHabitat(item.kind === "substrate" && item.biome === "Tropical" ? "frog" : "lizard"));
      acts.append(view);
      panel.append(acts);
    }

    panel.append(el("div", "iv-desc", item.desc));

    const facts = el("div", "iv-facts");
    facts.append(el("div", "cap", "Details"));
    const fact = (k: string, v: string | HTMLElement): void => {
      const row = el("div", "iv-fact");
      const b = el("b");
      if (typeof v === "string") b.textContent = v;
      else b.append(v);
      row.append(el("span", undefined, k), b);
      facts.append(row);
    };
    fact("Category", INV_CATEGORIES.find((c) => c.id === item.cat)?.label ?? item.cat);
    if (item.sizeWord) fact("Size", item.sizeWord);
    fact("Biome", item.biome);
    fact("Rarity", item.qty == null ? "—" : item.rarity);
    if (item.value > 0) {
      const v = el("span");
      v.append(gwIcon("leaf", 12, "#8ce25a"), document.createTextNode(` ${item.value.toLocaleString()}`));
      fact("Base Value", v);
    }
    if (item.qty != null) fact(item.kind === "supply" ? "In Stock" : "In Inventory", String(item.qty));
    if (item.kind === "decor") fact("In Use", item.inUse > 0 ? `${item.inUse} placed` : "Not placed yet");
    panel.append(facts);

    if (item.effects && item.effects.length) {
      const eff = el("div", "iv-facts iv-effects");
      eff.append(el("div", "cap", "Habitat Effects"));
      for (const e of item.effects.slice(0, 6)) {
        const row = el("div", "iv-eff");
        const track = el("div", "track");
        const fill = el("div", "fill");
        fill.style.width = `${Math.round((Math.max(0, Math.min(10, e.v)) / 10) * 100)}%`;
        track.append(fill);
        row.append(el("span", "k", e.label), track);
        eff.append(row);
      }
      panel.append(eff);
    }

    if (item.tip) {
      const tip = el("div", "iv-tip");
      tip.append(el("span", undefined, "💡"), el("span", undefined, item.tip));
      panel.append(tip);
    }

    const cta = el("div", "iv-cta");
    if (item.kind === "decor") {
      const place = el("button", "gw-primary-button") as HTMLButtonElement;
      place.textContent = item.placeable ? "Place in Habitat" : "Place in Habitat (none spare)";
      place.disabled = !item.placeable;
      place.title = item.placeable ? "Opens Sunstone Desert's Decorate mode with this piece armed" : "Buy one in the Supply Shop or sell nothing — placed pieces stay placed";
      place.addEventListener("click", () => this.cb.placeInHabitat(item.refId));
      cta.append(place);

      // Edit (placed pieces → Decorate mode) beside Sell — the reference row.
      const row = el("div", "iv-actrow");
      const edit = el("button", "gw-ghost-button") as HTMLButtonElement;
      edit.append(gwIcon("pencil", 13), document.createTextNode("Edit in Habitat"));
      edit.disabled = item.inUse === 0;
      edit.title =
        item.inUse > 0
          ? "Opens Decorate mode — move, rotate, scale or remove your placed pieces"
          : "Nothing placed yet — Place in Habitat first";
      edit.addEventListener("click", () => this.cb.editInHabitat());
      row.append(edit);
      const sell = el("button", "iv-sell") as HTMLButtonElement;
      const refund = Math.floor(item.value * 0.6);
      sell.textContent = `Sell one (+${refund} 🍃)`;
      sell.disabled = !item.sellable;
      if (!item.sellable) sell.title = "No spare pieces — placed decor stays placed";
      let confirming = false;
      sell.addEventListener("click", () => {
        if (!confirming) {
          confirming = true;
          sell.textContent = `Really sell for ${refund} 🍃? Click again`;
          window.setTimeout(() => {
            confirming = false;
            if (sell.isConnected) sell.textContent = `Sell one (+${refund} 🍃)`;
          }, 2600);
          return;
        }
        const res = this.cb.sellItem(item.refId);
        this.cb.toast(res.message);
        this.refresh();
      });
      row.append(sell);
      cta.append(row);
    } else if (item.kind === "supply") {
      const buy = el("button", "gw-primary-button", "Buy packs in the Supply Shop");
      buy.addEventListener("click", () => this.cb.openShop());
      cta.append(buy);
    } else if (item.kind === "substrate") {
      const paint = el("button", "gw-primary-button", `Paint it in ${item.biome === "Tropical" ? "Emerald Hollow" : "Sunstone Desert"}`);
      paint.addEventListener("click", () => this.cb.enterHabitat(item.biome === "Tropical" ? "frog" : "lizard"));
      cta.append(paint);
    } else if (item.kind === "tool") {
      const where = item.refId === "tool_mister" ? "frog" : item.refId === "tool_sponge" ? "fish" : "lizard";
      const label =
        where === "frog" ? "Use it in Emerald Hollow" : where === "fish" ? "Use it in Sapphire Stream" : "Use it in Sunstone Desert";
      const use = el("button", "gw-primary-button", label);
      use.title = "Enter the habitat — the tool lives in its care drawer";
      use.addEventListener("click", () => this.cb.enterHabitat(where));
      cta.append(use);
    } else if (item.kind === "supplement") {
      const dust = el("button", "gw-primary-button", "Dust at the next feeding");
      dust.title = "Enter the vivarium — pick the supplement in the Feed drawer";
      dust.addEventListener("click", () => this.cb.enterHabitat("lizard"));
      cta.append(dust);
    }
    panel.append(cta);
    return panel;
  }

  /** Turntable frame for the current rotate step ("" / _y90 / _y180 / _y270). */
  private rotatedArt(item: InvItem, baseArt: string): string {
    if (item.kind !== "decor" || this.rotYaw === 0) return baseArt;
    return baseArt.replace(/\.png$/, `_y${this.rotYaw * 90}.png`);
  }

  private buildFooter(): HTMLElement {
    const foot = el("div", "iv-foot");
    const back = el("button", "gw-ghost-button", "‹ Back");
    back.addEventListener("click", () => this.cb.close());
    const hint = el("div", "hint", "Select an item to view details and place it in your habitat.");
    const wrap = el("div", "iv-filterwrap");
    const filter = el("button", "gw-ghost-button");
    filter.append(gwIcon("funnel", 14), document.createTextNode("Filter"));
    const menu = el("div", "iv-filtermenu");
    const opts: { id: OwnFilter; label: string }[] = [
      { id: "all", label: "Show everything" },
      { id: "stocked", label: "In stock / owned only" },
      { id: "placed", label: "Placed in habitats" },
    ];
    const renderMenu = (): void => {
      menu.replaceChildren();
      for (const o of opts) {
        const b = el("button", `fo${this.ownFilter === o.id ? " on" : ""}`);
        b.append(gwIcon(this.ownFilter === o.id ? "check" : "funnel", 13), document.createTextNode(o.label));
        b.addEventListener("click", () => {
          this.ownFilter = o.id;
          this.filterOpen = false;
          this.page = 0;
          this.render();
          menu.classList.remove("open");
        });
        menu.append(b);
      }
    };
    filter.addEventListener("click", () => {
      this.filterOpen = !this.filterOpen;
      renderMenu();
      menu.classList.toggle("open", this.filterOpen);
    });
    wrap.append(filter, menu);
    foot.append(back, hint, wrap);
    return foot;
  }
}

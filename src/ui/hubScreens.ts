/**
 * HUB SCREENS — the host for the full-screen doors opened from the home hub.
 * Every screen is now SELF-CHROMED (its own header/footer); this host only
 * mounts them, routes Esc chains and hides its generic topbar.
 *
 *  · SHOP — the reference-match Supply Shop (shopScreen.ts): bundles,
 *    product grid, real cart → checkout genuinely delivers stock + decor.
 *  · INVENTORY — the reference-match Inventory (inventoryScreen.ts): tabs,
 *    5-per-row grid of real items, detail panel, Place in Habitat / Sell.
 *  · GUIDE — the reference-match Care Guide (careGuide.ts): eight
 *    data-driven chapters, quick reference, checklist, status footer.
 *  · HABITATS — the reference-match management page (habitatsScreen.ts):
 *    featured hero + card rows + insights/reminders sidebar.
 */
import { gwEl as el, ensureGwStyles } from "./gwTheme";
import { CareGuideView, type CareGuideStats } from "./careGuide";
import { HabitatsView, type HabitatsLiveData } from "./habitatsScreen";
import { InventoryView } from "./inventoryScreen";
import { ShopView } from "./shopScreen";
import type { CartLine } from "../data/shopCatalog";
import type { InventoryInputs } from "../data/inventoryPage";
import type { BuybackEntry } from "../game/decorInventory";
import type { HabitatPageId } from "../data/habitats";

export type HubScreenId = "shop" | "inventory" | "guide" | "habitats";

export interface HubScreensCallbacks {
  /** Apply a Supply Shop checkout (deliver + charge). */
  shopCheckout(cart: CartLine[]): { ok: boolean; message: string };
  leaves(): number;
  /** Live values for the Care Guide's + Habitats page's status footers. */
  guideStats(): CareGuideStats;
  /** Live scores/signals/visits for the Habitats page. */
  habitatsData(): HabitatsLiveData;
  /** Owned decor / in-use / stock snapshots for the Inventory screen. */
  inventoryData(): InventoryInputs;
  /** Enter the vivarium's Decorate mode with this owned piece armed. */
  placeDecorFromInventory(defId: string): void;
  /** Enter the vivarium's Decorate mode with nothing armed (edit placed decor). */
  editDecorInHabitat(): void;
  /** Sell one owned decor piece back for leaves. */
  sellDecor(defId: string): { ok: boolean; message: string };
  /** Bulk Actions: sell every spare decor piece at once. */
  sellAllDecorSpares(): { ok: boolean; message: string };
  /** Recently sold pieces available for re-purchase (newest first). */
  buybackList(): BuybackEntry[];
  /** Undo a sale: re-buy list entry `index` at its recorded price. */
  buyBackDecor(index: number): { ok: boolean; message: string };
  /** Leave the overlay and enter a habitat (Continue Caring / Enter Habitat). */
  enterHabitat(id: HabitatPageId): void;
  toast(message: string): void;
  close(): void;
}

let stylesIn = false;
function ensureStyles(): void {
  if (stylesIn) return;
  stylesIn = true;
  const css = `
  .gw-screen { position: fixed; inset: 0; z-index: 22; display: none; flex-direction: column;
    background: #080c0b; color: var(--gw-ink); font-family: var(--gw-font); }
  .gw-screen.open { display: flex; }
  /* Self-chromed screens (guide / habitats / inventory / shop) hide the host's chrome. */
  .gw-screen.gw-screen-guide .topbar, .gw-screen.gw-screen-guide .gw-screen-note,
  .gw-screen.gw-screen-habitats .topbar, .gw-screen.gw-screen-habitats .gw-screen-note,
  .gw-screen.gw-screen-inventory .topbar, .gw-screen.gw-screen-inventory .gw-screen-note,
  .gw-screen.gw-screen-shop .topbar, .gw-screen.gw-screen-shop .gw-screen-note { display: none; }
  .gw-screen.gw-screen-guide .body, .gw-screen.gw-screen-habitats .body,
  .gw-screen.gw-screen-inventory .body, .gw-screen.gw-screen-shop .body { padding: 0; overflow: hidden; display: flex; }
  .gw-screen .topbar { display: flex; align-items: center; gap: 14px;
    padding: clamp(14px, 2.4vh, 24px) clamp(18px, 3vw, 40px) 12px; }
  .gw-screen .topbar .t { font: 800 clamp(20px, 2.4vw, 26px)/1.1 var(--gw-font); display: flex; align-items: center; gap: 11px; }
  .gw-screen .topbar .s { font: 500 12px/1.3 var(--gw-font); color: var(--gw-ink-dim); margin-top: 3px; }
  .gw-screen .topbar .spacer { flex: 1; }
  .gw-screen .leaves { display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px;
    border-radius: 999px; background: rgba(13,14,12,0.72); border: 1px solid var(--gw-border-soft);
    font: 700 13px/1 var(--gw-font); font-variant-numeric: tabular-nums; }
  .gw-screen .body { flex: 1; overflow-y: auto; padding: 4px clamp(18px, 3vw, 40px) 30px;
    scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }
  .gw-screen .sect { margin-top: 18px; }

  .gw-empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
    padding: 34px 20px; border-radius: 18px; border: 1.5px dashed rgba(255,255,255,0.14);
    color: var(--gw-ink-dim); font: 500 12.5px/1.5 var(--gw-font); }
  .gw-empty-state .big { font-size: 34px; }
  `;
  const tag = document.createElement("style");
  tag.id = "gw-hubscreens-styles";
  tag.textContent = css;
  document.head.append(tag);
}

export class HubScreens {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private title: HTMLElement;
  private sub: HTMLElement;
  private leavesEl: HTMLElement;
  private current: HubScreenId | null = null;
  private note: HTMLElement;
  private careGuide: CareGuideView | null = null;
  private habitats: HabitatsView | null = null;
  private inventory: InventoryView | null = null;
  private shop: ShopView | null = null;

  constructor(private cb: HubScreensCallbacks) {
    ensureGwStyles();
    ensureStyles();
    this.root = el("div", "gw-screen");
    const bar = el("div", "topbar");
    const back = el("button", "gw-ghost-button", "‹ Eco-Center");
    back.addEventListener("click", () => this.cb.close());
    const tWrap = el("div");
    this.title = el("div", "t", "—");
    this.sub = el("div", "s", "");
    tWrap.append(this.title, this.sub);
    const spacer = el("div", "spacer");
    this.leavesEl = el("span", "leaves", "—");
    bar.append(back, tWrap, spacer, this.leavesEl);
    this.note = el("div", "gw-screen-note");
    this.note.style.cssText =
      "margin: 6px clamp(18px,3vw,40px) 0; min-height: 16px; font: 600 12px/1.4 var(--gw-font); color: var(--gw-green);";
    this.body = el("div", "body");
    this.root.append(bar, this.note, this.body);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.current) {
        e.stopImmediatePropagation();
        // Inside a self-chromed screen, Esc first collapses any open detail.
        if (this.current === "guide" && this.careGuide?.handleEscape()) return;
        if (this.current === "habitats" && this.habitats?.handleEscape()) return;
        if (this.current === "inventory" && this.inventory?.handleEscape()) return;
        if (this.current === "shop" && this.shop?.handleEscape()) return;
        this.cb.close();
      }
    });
  }

  mount(parent: HTMLElement): void {
    parent.append(this.root);
  }

  get openScreen(): HubScreenId | null {
    return this.current;
  }

  close(): void {
    this.current = null;
    this.root.classList.remove("open");
  }

  show(screen: HubScreenId): void {
    this.current = screen;
    this.note.textContent = "";
    this.body.replaceChildren();
    this.root.classList.toggle("gw-screen-guide", screen === "guide");
    this.root.classList.toggle("gw-screen-habitats", screen === "habitats");
    this.root.classList.toggle("gw-screen-inventory", screen === "inventory");
    this.root.classList.toggle("gw-screen-shop", screen === "shop");
    this.refreshLeaves();
    if (screen === "shop") this.buildShop();
    else if (screen === "inventory") this.buildInventory();
    else if (screen === "habitats") this.buildHabitats();
    else this.buildGuide();
    this.root.classList.add("open");
    this.body.scrollTop = 0;
  }

  private refreshLeaves(): void {
    this.leavesEl.replaceChildren(document.createTextNode("🍃 "), document.createTextNode(this.cb.leaves().toLocaleString()));
  }

  // ── SHOP ──────────────────────────────────────────────────────────────

  /** The reference-match Supply Shop (shopScreen.ts) owns the whole screen —
   *  header, bundles, product grid, cart sidebar, trust strip. */
  private buildShop(): void {
    this.title.textContent = "🛒 Supply Shop";
    if (!this.shop)
      this.shop = new ShopView({
        close: () => this.cb.close(),
        leaves: () => this.cb.leaves(),
        stats: () => this.cb.guideStats(),
        checkout: (cart) => {
          const res = this.cb.shopCheckout(cart);
          this.refreshLeaves();
          return res;
        },
        toast: (m) => this.cb.toast(m),
      });
    this.body.append(this.shop.root);
    this.shop.show();
  }

  // ── INVENTORY ─────────────────────────────────────────────────────────

  /** The reference-match Inventory screen (inventoryScreen.ts) owns the whole
   *  screen — tabs, summary rail, 5-per-row grid, detail panel, footer. */
  private buildInventory(): void {
    this.title.textContent = "🎒 Inventory";
    if (!this.inventory)
      this.inventory = new InventoryView({
        close: () => this.cb.close(),
        openShop: () => this.show("shop"),
        resources: () => ({ leaves: this.cb.leaves(), reputation: this.cb.guideStats().reputation }),
        placeInHabitat: (defId) => this.cb.placeDecorFromInventory(defId),
        editInHabitat: () => this.cb.editDecorInHabitat(),
        enterHabitat: (id) => this.cb.enterHabitat(id),
        sellItem: (defId) => this.cb.sellDecor(defId),
        sellAllSpares: () => this.cb.sellAllDecorSpares(),
        buybackList: () => this.cb.buybackList(),
        buyBack: (index) => this.cb.buyBackDecor(index),
        toast: (m) => this.cb.toast(m),
        data: () => this.cb.inventoryData(),
      });
    this.body.append(this.inventory.root);
    this.inventory.show();
  }

  // ── GUIDE ─────────────────────────────────────────────────────────────

  /** The reference-match Care Guide (careGuide.ts) owns the whole screen —
   *  header, chapters, sidebar and footer; this host just mounts it. */
  private buildGuide(): void {
    this.title.textContent = "📖 Care Guide";
    if (!this.careGuide)
      this.careGuide = new CareGuideView({
        close: () => this.cb.close(),
        stats: () => this.cb.guideStats(),
      });
    this.body.append(this.careGuide.root);
    this.careGuide.show();
  }

  // ── HABITATS ──────────────────────────────────────────────────────────

  /** The reference-match Habitats management page (habitatsScreen.ts) —
   *  hero, card rows, insights/reminders sidebar, footer. Visit Shop inside
   *  it swaps this host straight to the shop screen. */
  private buildHabitats(): void {
    this.title.textContent = "🏞 Habitats";
    if (!this.habitats)
      this.habitats = new HabitatsView({
        close: () => this.cb.close(),
        enterHabitat: (id) => this.cb.enterHabitat(id),
        openShop: () => this.show("shop"),
        toast: (m) => this.cb.toast(m),
        stats: () => this.cb.guideStats(),
        data: () => this.cb.habitatsData(),
      });
    this.body.append(this.habitats.root);
    this.habitats.show();
  }
}

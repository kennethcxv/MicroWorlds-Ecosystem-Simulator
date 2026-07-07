/**
 * SUPPLY SHOP CATALOG — pure data + cart math for the reference-match Supply
 * Shop screen (Designs/Supply_Shop). Everything sold here is REAL:
 *
 *  · SUPPLY products are the economy's consumable packs (economy.ts SUPPLIES —
 *    the same packs feeding both habitats' drawers).
 *  · DECOR products are the vivarium's real Decorate catalog pieces at their
 *    real DECOR_PRICES; buying one lands it in the owned-decor inventory
 *    (decorInventory.ts) and Decorate consumes it on placement.
 *  · BUNDLES are priced from their real contents with an honest percentage
 *    off — the savings line in the cart is exactly Σ(full) − price.
 *
 * No DOM, no Three — unit-tested in tests/shoppage.test.ts.
 */
import { SUPPLIES, decorPrice, type SupplyDef } from "../game/economy";
import { LIZARD_PLACEABLES, type PlaceableDef } from "../habitats/HabitatBuilder";
import type { GwIconName } from "../ui/gwIcons";

export type ShopCategoryId = "all" | "food" | "plants" | "decor" | "substrate" | "gear" | "tools";

export interface ShopCategory {
  id: ShopCategoryId;
  label: string;
  icon: GwIconName;
}

export const SHOP_CATEGORIES: ShopCategory[] = [
  { id: "all", label: "All", icon: "box" },
  { id: "food", label: "Food", icon: "bowl" },
  { id: "plants", label: "Plants", icon: "sprout" },
  { id: "decor", label: "Decor", icon: "branch" },
  { id: "substrate", label: "Substrate", icon: "mound" },
  { id: "gear", label: "Habitat Gear", icon: "gauge" },
  { id: "tools", label: "Care Tools", icon: "broom" },
];

export type ProductKind = "supply" | "decor";

export interface ShopProduct {
  /** Unique product id, namespaced: "supply:cricket" / "decor:hide_cave". */
  id: string;
  kind: ProductKind;
  /** SupplyDef.id or PlaceableDef.id. */
  refId: string;
  name: string;
  desc: string;
  price: number;
  cat: Exclude<ShopCategoryId, "all">;
  /** Static thumbnail under /assets/ui/decor_thumbs (decor) — supplies use glyph tiles. */
  art: string | null;
  glyph: string;
  badge: "New" | "Popular" | "Recommended" | null;
}

/** Real GLB-render thumbnail path for a catalog piece (generated offline). */
export function decorThumbPath(defId: string): string {
  return `/assets/ui/decor_thumbs/${defId}.png`;
}

/** Real product photos for the feeder supplies — the same art the Feed
 *  drawer's food cards use. Fish foods have no photography yet (glyph tiles). */
export const SUPPLY_ART: Record<string, string> = {
  cricket: "/assets/ui/food/crickets.png",
  mealworm: "/assets/ui/food/mealworms.png",
  superworm: "/assets/ui/food/superworms.png",
  dubia_roach: "/assets/ui/food/roaches.png",
  waxworm: "/assets/ui/food/treats.png",
};

export function supplyArtPath(supplyId: string): string | null {
  return SUPPLY_ART[supplyId] ?? null;
}

function decorCat(def: PlaceableDef): Exclude<ShopCategoryId, "all"> {
  if (def.section === "Plants") return "plants";
  if (def.section === "Utilities") return "gear";
  return "decor";
}

const SUPPLY_BADGES: Record<string, ShopProduct["badge"]> = {
  dubia_roach: "Recommended",
  cricket: "Popular",
  bloodworms: "New",
};

const DECOR_BADGES: Record<string, ShopProduct["badge"]> = {
  hide_cave: "Popular",
  branch_log: "Popular",
  plant_succulent_2: "Recommended",
  dish_humid: "New",
  rock_arch: "New",
};

function supplyProduct(s: SupplyDef): ShopProduct {
  return {
    id: `supply:${s.id}`,
    kind: "supply",
    refId: s.id,
    name: s.label,
    desc: `${s.desc} ${s.pack} per pack.`,
    price: s.price,
    cat: "food",
    art: supplyArtPath(s.id),
    glyph: s.icon,
    badge: SUPPLY_BADGES[s.id] ?? null,
  };
}

function decorProduct(d: PlaceableDef): ShopProduct {
  return {
    id: `decor:${d.id}`,
    kind: "decor",
    refId: d.id,
    name: d.label,
    desc: d.desc,
    price: decorPrice(d.id),
    cat: decorCat(d),
    art: decorThumbPath(d.id),
    glyph: "🪨",
    badge: DECOR_BADGES[d.id] ?? null,
  };
}

/** Every purchasable product: all supply packs + every UNLOCKED catalog piece. */
export const SHOP_PRODUCTS: ShopProduct[] = [
  ...SUPPLIES.map(supplyProduct),
  ...LIZARD_PLACEABLES.filter((d) => !d.locked).map(decorProduct),
];

export function productById(id: string): ShopProduct | undefined {
  return SHOP_PRODUCTS.find((p) => p.id === id);
}

export function productsInCategory(cat: ShopCategoryId): ShopProduct[] {
  return cat === "all" ? SHOP_PRODUCTS : SHOP_PRODUCTS.filter((p) => p.cat === cat);
}

/** Honest copy for the two lanes that sell nothing (nothing is faked). */
export const SUBSTRATE_NOTE =
  "Substrates aren't sold — every habitat's Terrain mode includes its full material palette. Repaint the floor any time, free.";
export const TOOLS_NOTE =
  "Your keeper's kit is complete: scoop, brush, squeegee, sponge and mister live in each habitat's Clean drawer, always ready.";

// ── Bundles ──────────────────────────────────────────────────────────────────

export interface BundleItem {
  kind: ProductKind;
  refId: string;
  qty: number;
}

export interface ShopBundle {
  id: string;
  name: string;
  blurb: string;
  /** 0..1 fraction off the summed full price. */
  discount: number;
  hero: boolean;
  items: BundleItem[];
  /** Large art plate for the hero card (a real in-game render). */
  art: string | null;
}

export const SHOP_BUNDLES: ShopBundle[] = [
  {
    id: "bundle_desert_starter",
    name: "Desert Starter Bundle",
    blurb: "Everything you need to furnish a warm desert home — hide, water, greenery and a first pantry.",
    discount: 0.2,
    hero: true,
    items: [
      { kind: "decor", refId: "hide_cave", qty: 1 },
      { kind: "decor", refId: "dish_water", qty: 1 },
      { kind: "decor", refId: "plant_succulent_2", qty: 1 },
      { kind: "decor", refId: "rock_boulder", qty: 1 },
      { kind: "decor", refId: "util_gauge", qty: 1 },
      { kind: "supply", refId: "cricket", qty: 1 },
      { kind: "supply", refId: "mealworm", qty: 1 },
    ],
    art: "/assets/ui/habitats/sunstone_desert.jpg",
  },
  {
    id: "bundle_feeding",
    name: "Feeding Essentials Bundle",
    blurb: "A full week of varied feeders — staples, a big meal and a treat.",
    discount: 0.15,
    hero: false,
    items: [
      { kind: "supply", refId: "cricket", qty: 1 },
      { kind: "supply", refId: "mealworm", qty: 1 },
      { kind: "supply", refId: "dubia_roach", qty: 1 },
      { kind: "supply", refId: "superworm", qty: 1 },
      { kind: "supply", refId: "waxworm", qty: 1 },
    ],
    art: null,
  },
  {
    id: "bundle_decor",
    name: "Natural Decor Bundle",
    blurb: "Beautiful natural pieces to enrich and personalize any habitat.",
    discount: 0.1,
    hero: false,
    items: [
      { kind: "decor", refId: "branch_log", qty: 1 },
      { kind: "decor", refId: "plant_desert_grass", qty: 1 },
      { kind: "decor", refId: "rock_cluster", qty: 1 },
      { kind: "decor", refId: "rock_stones", qty: 1 },
    ],
    art: null,
  },
];

export function bundleById(id: string): ShopBundle | undefined {
  return SHOP_BUNDLES.find((b) => b.id === id);
}

function itemUnitPrice(it: BundleItem): number {
  if (it.kind === "supply") return SUPPLIES.find((s) => s.id === it.refId)?.price ?? 0;
  return decorPrice(it.refId);
}

export interface BundlePricing {
  /** Σ contents at full price. */
  full: number;
  /** What the bundle actually costs (rounded to a clean 5). */
  price: number;
  /** full − price — the honest savings badge/line. */
  saved: number;
  itemCount: number;
}

export function bundlePricing(b: ShopBundle): BundlePricing {
  const full = b.items.reduce((sum, it) => sum + itemUnitPrice(it) * it.qty, 0);
  const price = Math.max(5, Math.round((full * (1 - b.discount)) / 5) * 5);
  return { full, price, saved: full - price, itemCount: b.items.reduce((n, it) => n + it.qty, 0) };
}

export function bundleBadge(b: ShopBundle): string {
  return b.hero ? "Best value" : `Save ${Math.round(b.discount * 100)}%`;
}

// ── Cart (pure model) ────────────────────────────────────────────────────────

export interface CartLine {
  /** "product" lines reference SHOP_PRODUCTS ids; "bundle" lines SHOP_BUNDLES ids. */
  kind: "product" | "bundle";
  id: string;
  qty: number;
}

export function cartAdd(cart: CartLine[], kind: CartLine["kind"], id: string, qty = 1): CartLine[] {
  const next = cart.map((l) => ({ ...l }));
  const line = next.find((l) => l.kind === kind && l.id === id);
  if (line) line.qty = Math.min(99, line.qty + qty);
  else next.push({ kind, id, qty: Math.max(1, Math.min(99, qty)) });
  return next;
}

export function cartSetQty(cart: CartLine[], kind: CartLine["kind"], id: string, qty: number): CartLine[] {
  const next = cart.map((l) => ({ ...l }));
  const i = next.findIndex((l) => l.kind === kind && l.id === id);
  if (i < 0) return next;
  if (qty <= 0) next.splice(i, 1);
  else next[i].qty = Math.min(99, Math.floor(qty));
  return next;
}

export function cartCount(cart: CartLine[]): number {
  return cart.reduce((n, l) => n + l.qty, 0);
}

export interface CartTotals {
  /** Every line at FULL price (bundles priced as their contents). */
  subtotal: number;
  /** Bundle savings (subtotal − total). */
  discount: number;
  total: number;
}

export function cartTotals(cart: CartLine[]): CartTotals {
  let subtotal = 0;
  let total = 0;
  for (const l of cart) {
    if (l.kind === "product") {
      const p = productById(l.id);
      if (!p) continue;
      subtotal += p.price * l.qty;
      total += p.price * l.qty;
    } else {
      const b = bundleById(l.id);
      if (!b) continue;
      const pr = bundlePricing(b);
      subtotal += pr.full * l.qty;
      total += pr.price * l.qty;
    }
  }
  return { subtotal, discount: subtotal - total, total };
}

export interface CheckoutResult {
  ok: boolean;
  spend: number;
  /** Packs per supply id / pieces per decor defId to deliver. */
  supplies: Record<string, number>;
  decor: Record<string, number>;
  reason?: string;
}

/** Pure checkout: validates funds and flattens the cart into deliveries.
 *  The app applies them (stock/owned/leaves) and clears the cart. */
export function checkout(cart: CartLine[], leavesAvailable: number): CheckoutResult {
  const totals = cartTotals(cart);
  if (cart.length === 0) return { ok: false, spend: 0, supplies: {}, decor: {}, reason: "Your cart is empty" };
  if (leavesAvailable < totals.total)
    return {
      ok: false,
      spend: 0,
      supplies: {},
      decor: {},
      reason: `Need ${totals.total.toLocaleString()} leaves (you have ${Math.floor(leavesAvailable).toLocaleString()})`,
    };
  const supplies: Record<string, number> = {};
  const decor: Record<string, number> = {};
  const put = (it: BundleItem, times: number): void => {
    const bag = it.kind === "supply" ? supplies : decor;
    bag[it.refId] = (bag[it.refId] ?? 0) + it.qty * times;
  };
  for (const l of cart) {
    if (l.kind === "product") {
      const p = productById(l.id);
      if (p) put({ kind: p.kind, refId: p.refId, qty: 1 }, l.qty);
    } else {
      const b = bundleById(l.id);
      if (b) for (const it of b.items) put(it, l.qty);
    }
  }
  return { ok: true, spend: totals.total, supplies, decor };
}

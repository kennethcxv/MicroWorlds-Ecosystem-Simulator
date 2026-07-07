/**
 * ECONOMY — the light "supplies" layer that makes leaves matter without
 * turning GLASSWATER into a tycoon game.
 *
 * One idea, applied everywhere: CONSUMABLES come from Inventory stock (bought
 * in the Shop with leaves), BIG maintenance costs leaves directly (water
 * change), CARE LABOUR is free (scrubbing, scooping, sculpting). Decor pieces
 * carry a one-time placement price.
 *
 * Pure logic — the store itself never touches GameState; the app passes the
 * leaves balance in and applies the returned spend. Persistence is guarded so
 * this also runs under vitest/node.
 */

export interface SupplyDef {
  id: string;
  label: string;
  icon: string;
  /** Which habitat's feeding UI consumes it. */
  kind: "insect" | "fishfood";
  /** Leaves per PACK. */
  price: number;
  /** Units per pack (insects: animals; fish food: pinches). */
  pack: number;
  desc: string;
}

/** The shop's consumables catalog. Insect ids MATCH LizardNutrition FOOD_TYPES;
 *  fish food ids match the fish feed drawer. */
export const SUPPLIES: SupplyDef[] = [
  { id: "cricket", label: "Crickets", icon: "🦗", kind: "insect", price: 30, pack: 6, desc: "Lean, active staple — fun to hunt." },
  { id: "mealworm", label: "Mealworms", icon: "🪱", kind: "insect", price: 24, pack: 6, desc: "Easy staple — a little fatty." },
  { id: "dubia_roach", label: "Dubia Roaches", icon: "🪳", kind: "insect", price: 42, pack: 6, desc: "Best staple — meaty, best Ca:P." },
  { id: "superworm", label: "Superworms", icon: "🪱", kind: "insect", price: 36, pack: 4, desc: "Big + rich — a few, not daily." },
  { id: "waxworm", label: "Waxworms", icon: "🐛", kind: "insect", price: 32, pack: 4, desc: "Fatty treat — geckos get hooked." },
  { id: "flakes", label: "Flake Food", icon: "🥣", kind: "fishfood", price: 20, pack: 10, desc: "Community staple — floats, then sinks." },
  { id: "pellets", label: "Sinking Pellets", icon: "🟤", kind: "fishfood", price: 26, pack: 10, desc: "Reaches the bottom dwellers." },
  { id: "bloodworms", label: "Bloodworm Treat", icon: "🍥", kind: "fishfood", price: 34, pack: 6, desc: "Rich treat — sparks a feeding frenzy." },
];

export function supplyById(id: string): SupplyDef | undefined {
  return SUPPLIES.find((s) => s.id === id);
}

/** Decor placement prices (leaves) by placeable defId. Unlisted → free.
 *  Locked catalog entries are priced too (harmless — they can't be placed yet). */
export const DECOR_PRICES: Record<string, number> = {
  // Plants
  plant_succulent: 70,
  plant_succulent_2: 70,
  plant_agave: 85,
  plant_cactus: 95,
  plant_desert_grass: 45,
  plant_desert_shrub: 75,
  hanging_vine: 90,
  plant_fern: 110,
  // Rocks
  rock_cluster: 140,
  rock_boulder: 110,
  rock_cave_stone: 120,
  rock_pebbles: 60,
  rock_slate: 130,
  rock_ridge: 150,
  rock_stones: 40,
  rock_arch: 190,
  // Caves & Hides
  hide_cave: 220,
  hide_moist: 240,
  hide_low_cave: 210,
  hide_burrow: 180,
  hide_double: 320,
  hide_tunnel: 260,
  hide_arch: 230,
  hide_cork: 200,
  // Utilities
  dish_water: 90,
  dish_food: 90,
  dish_humid: 120,
  util_gauge: 70,
  // Decor
  branch_log: 160,
  climb_branch: 120,
  decor_sign: 60,
  decor_platform: 90,
  decor_cairn: 55,
  decor_skull: 170,
};

export function decorPrice(defId: string): number {
  return DECOR_PRICES[defId] ?? 0;
}

// ── Stock (owned consumables) ────────────────────────────────────────────────

export type Stock = Record<string, number>;

/** A friendly starter pantry so the first session never hits a paywall. */
export function defaultStock(): Stock {
  return {
    cricket: 12,
    mealworm: 12,
    dubia_roach: 6,
    superworm: 4,
    waxworm: 4,
    flakes: 14,
    pellets: 10,
    bloodworms: 5,
  };
}

export function stockCount(stock: Stock, id: string): number {
  return Math.max(0, Math.floor(stock[id] ?? 0));
}

export interface BuyResult {
  ok: boolean;
  /** Leaves actually spent (0 on failure). */
  spent: number;
  reason?: string;
}

/** Buy one pack of `id`. Mutates `stock`; the caller deducts `spent` leaves. */
export function buySupply(stock: Stock, id: string, leavesAvailable: number): BuyResult {
  const def = supplyById(id);
  if (!def) return { ok: false, spent: 0, reason: "Unknown item" };
  if (leavesAvailable < def.price) {
    return { ok: false, spent: 0, reason: `Need ${def.price} leaves` };
  }
  stock[id] = stockCount(stock, id) + def.pack;
  return { ok: true, spent: def.price };
}

/** Consume up to `n` units; returns how many were actually available. */
export function consumeSupply(stock: Stock, id: string, n: number): number {
  const have = stockCount(stock, id);
  const used = Math.min(have, Math.max(0, Math.floor(n)));
  stock[id] = have - used;
  return used;
}

// ── Persistence (guarded) ────────────────────────────────────────────────────

const STOCK_KEY = "glasswater.stock.v1";

export function loadStock(): Stock {
  try {
    const raw = globalThis.localStorage?.getItem(STOCK_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Stock;
      if (s && typeof s === "object") return { ...defaultStock(), ...s };
    }
  } catch {
    /* fall through to defaults */
  }
  return defaultStock();
}

export function saveStock(stock: Stock): void {
  try {
    globalThis.localStorage?.setItem(STOCK_KEY, JSON.stringify(stock));
  } catch {
    /* non-fatal */
  }
}

export function clearStock(): void {
  try {
    globalThis.localStorage?.removeItem(STOCK_KEY);
  } catch {
    /* non-fatal */
  }
}

/**
 * DECOR INVENTORY — owned habitat pieces, the layer that makes the Inventory
 * screen and the Supply Shop's decor lane REAL.
 *
 * The loop: the Shop sells a piece → it lands here as OWNED stock. Placing
 * that piece in a habitat's Decorate mode CONSUMES one from stock instead of
 * charging leaves (the classic pay-on-place path still covers pieces you
 * don't own). Selling from the Inventory refunds a fair fraction of the
 * catalog price. "In use" counts are read straight from the real saved
 * habitat layouts — never invented.
 *
 * Pure logic + guarded persistence (economy.ts style) so it runs under
 * vitest/node. Reset wipes it via the glasswater.* sweep.
 */

export type DecorOwned = Record<string, number>;

/** Fraction of the catalog price refunded when selling a piece back. */
export const SELL_BACK_RATE = 0.6;

export function ownedCount(owned: DecorOwned, defId: string): number {
  return Math.max(0, Math.floor(owned[defId] ?? 0));
}

export function totalOwned(owned: DecorOwned): number {
  return Object.keys(owned).reduce((n, id) => n + ownedCount(owned, id), 0);
}

export function addOwned(owned: DecorOwned, defId: string, n = 1): void {
  owned[defId] = ownedCount(owned, defId) + Math.max(0, Math.floor(n));
}

/** Take one piece for placement. Returns false (and changes nothing) when
 *  none are owned — the caller then falls back to charging leaves. */
export function consumeOwned(owned: DecorOwned, defId: string): boolean {
  const have = ownedCount(owned, defId);
  if (have <= 0) return false;
  owned[defId] = have - 1;
  return true;
}

export interface SellResult {
  ok: boolean;
  /** Leaves refunded (0 on failure). */
  refund: number;
  reason?: string;
}

/** Sell one owned piece back at SELL_BACK_RATE of its catalog price. */
export function sellOwned(owned: DecorOwned, defId: string, catalogPrice: number): SellResult {
  if (ownedCount(owned, defId) <= 0) return { ok: false, refund: 0, reason: "None in inventory" };
  owned[defId] = ownedCount(owned, defId) - 1;
  return { ok: true, refund: Math.floor(Math.max(0, catalogPrice) * SELL_BACK_RATE) };
}

/** Total leaves value of everything owned (full catalog price, the Inventory
 *  footer's honest "what this collection is worth" number). */
export function totalValue(owned: DecorOwned, priceOf: (defId: string) => number): number {
  return Object.keys(owned).reduce((sum, id) => sum + ownedCount(owned, id) * Math.max(0, priceOf(id)), 0);
}

export interface SellAllResult {
  /** Pieces sold. */
  count: number;
  /** Total leaves refunded (each piece floors separately, same as sellOwned). */
  refund: number;
}

/** Bulk Actions: sell EVERY spare piece at SELL_BACK_RATE. Placed decor is
 *  untouched — this only drains the owned/spare store. Mutates `owned`. */
export function sellAllSpares(owned: DecorOwned, priceOf: (defId: string) => number): SellAllResult {
  let count = 0;
  let refund = 0;
  for (const id of Object.keys(owned)) {
    const have = ownedCount(owned, id);
    if (have <= 0) continue;
    count += have;
    refund += have * Math.floor(Math.max(0, priceOf(id)) * SELL_BACK_RATE);
    owned[id] = 0;
  }
  return { count, refund };
}

// ── In-use counts (from the real saved habitat layouts) ─────────────────────

/** Count placed defIds across raw habitat-save JSON blobs. Tolerant: a
 *  malformed blob contributes nothing (the game itself heals those on load). */
export function inUseCounts(rawSaves: (string | null | undefined)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const raw of rawSaves) {
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as { layout?: { objects?: { defId?: string }[] } };
      const objects = data?.layout?.objects;
      if (!Array.isArray(objects)) continue;
      for (const o of objects) {
        if (o && typeof o.defId === "string" && o.defId) counts[o.defId] = (counts[o.defId] ?? 0) + 1;
      }
    } catch {
      /* stale blob — skip */
    }
  }
  return counts;
}

// ── Acquisition times (drives the Inventory's honest "Recent" sort) ─────────

/** itemKey ("decor:hide_cave" / "supply:cricket") → last acquired, epoch ms. */
export type AcquiredMap = Record<string, number>;

export function markAcquired(map: AcquiredMap, keys: string[], t: number): void {
  for (const k of keys) if (k) map[k] = t;
}

// ── Buy Back (undo a sale at exactly the refunded price) ────────────────────

export interface BuybackEntry {
  defId: string;
  /** Leaves you received — and pay again to take it back. */
  price: number;
  t: number;
}

export const BUYBACK_CAP = 10;

/** Record a sale for buy-back. Most recent first; the list stays capped. */
export function pushBuyback(list: BuybackEntry[], defId: string, price: number, t: number): BuybackEntry[] {
  const next = [{ defId, price: Math.max(0, Math.floor(price)), t }, ...list];
  return next.slice(0, BUYBACK_CAP);
}

export interface BuybackResult {
  ok: boolean;
  /** Leaves charged (0 on failure). */
  cost: number;
  reason?: string;
}

/** Take entry `index` back: charges its recorded price, restores one piece.
 *  Mutates `owned` and returns the new list on success. */
export function takeBuyback(
  list: BuybackEntry[],
  index: number,
  owned: DecorOwned,
  leavesAvailable: number,
): { res: BuybackResult; list: BuybackEntry[] } {
  const entry = list[index];
  if (!entry) return { res: { ok: false, cost: 0, reason: "Already gone" }, list };
  if (leavesAvailable < entry.price) return { res: { ok: false, cost: 0, reason: `Need ${entry.price} leaves` }, list };
  addOwned(owned, entry.defId, 1);
  return { res: { ok: true, cost: entry.price }, list: list.filter((_, i) => i !== index) };
}

// ── Persistence (guarded) ────────────────────────────────────────────────────

const KEY = "glasswater.decor.v1";
const ACQUIRED_KEY = "glasswater.decor.acquired.v1";
const BUYBACK_KEY = "glasswater.decor.buyback.v1";

export function loadAcquired(): AcquiredMap {
  try {
    const raw = globalThis.localStorage?.getItem(ACQUIRED_KEY);
    if (raw) {
      const m = JSON.parse(raw) as AcquiredMap;
      if (m && typeof m === "object" && !Array.isArray(m)) return m;
    }
  } catch {
    /* fresh */
  }
  return {};
}

export function saveAcquired(map: AcquiredMap): void {
  try {
    globalThis.localStorage?.setItem(ACQUIRED_KEY, JSON.stringify(map));
  } catch {
    /* non-fatal */
  }
}

export function loadBuyback(): BuybackEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(BUYBACK_KEY);
    if (raw) {
      const l = JSON.parse(raw) as BuybackEntry[];
      if (Array.isArray(l)) return l.filter((e) => e && typeof e.defId === "string" && typeof e.price === "number").slice(0, BUYBACK_CAP);
    }
  } catch {
    /* fresh */
  }
  return [];
}

export function saveBuyback(list: BuybackEntry[]): void {
  try {
    globalThis.localStorage?.setItem(BUYBACK_KEY, JSON.stringify(list.slice(0, BUYBACK_CAP)));
  } catch {
    /* non-fatal */
  }
}

export function loadOwned(): DecorOwned {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as DecorOwned;
      if (o && typeof o === "object" && !Array.isArray(o)) return o;
    }
  } catch {
    /* fresh */
  }
  return {};
}

export function saveOwned(owned: DecorOwned): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(owned));
  } catch {
    /* non-fatal */
  }
}

/** In-use counts for the player habitats, read from live localStorage. */
export function readInUse(habitatIds: string[]): Record<string, number> {
  const raws: (string | null)[] = [];
  for (const id of habitatIds) {
    try {
      raws.push(globalThis.localStorage?.getItem(`glasswater.habitat.${id}`) ?? null);
    } catch {
      raws.push(null);
    }
  }
  return inUseCounts(raws);
}

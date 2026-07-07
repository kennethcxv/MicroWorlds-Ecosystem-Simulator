/**
 * Owned-decor inventory: the pure layer that makes Shop decor purchases and
 * Inventory quantities real. Placement consumption, sell-back and the
 * in-use counter (read from real habitat-save JSON) are contract-tested.
 */
import { describe, expect, it } from "vitest";
import {
  SELL_BACK_RATE,
  addOwned,
  consumeOwned,
  inUseCounts,
  ownedCount,
  sellAllSpares,
  sellOwned,
  totalOwned,
  totalValue,
  type DecorOwned,
} from "../src/game/decorInventory";

describe("owned counts", () => {
  it("adds, floors and never goes negative", () => {
    const o: DecorOwned = {};
    addOwned(o, "hide_cave");
    addOwned(o, "hide_cave", 2.9);
    expect(ownedCount(o, "hide_cave")).toBe(3);
    expect(ownedCount(o, "missing")).toBe(0);
    o.broken = -4 as never;
    expect(ownedCount(o, "broken")).toBe(0);
    expect(totalOwned(o)).toBe(3);
  });

  it("consumes one for placement and refuses at zero", () => {
    const o: DecorOwned = { rock_boulder: 1 };
    expect(consumeOwned(o, "rock_boulder")).toBe(true);
    expect(ownedCount(o, "rock_boulder")).toBe(0);
    expect(consumeOwned(o, "rock_boulder")).toBe(false);
    expect(ownedCount(o, "rock_boulder")).toBe(0);
  });
});

describe("sell-back", () => {
  it("refunds the sell-back fraction of the catalog price", () => {
    const o: DecorOwned = { hide_cave: 2 };
    const r = sellOwned(o, "hide_cave", 220);
    expect(r.ok).toBe(true);
    expect(r.refund).toBe(Math.floor(220 * SELL_BACK_RATE));
    expect(ownedCount(o, "hide_cave")).toBe(1);
  });

  it("fails honestly when none are owned", () => {
    const o: DecorOwned = {};
    const r = sellOwned(o, "hide_cave", 220);
    expect(r.ok).toBe(false);
    expect(r.refund).toBe(0);
    expect(r.reason).toMatch(/None/i);
  });
});

describe("bulk sell (Inventory → Bulk Actions)", () => {
  it("sells every spare at the same per-piece floor as sellOwned", () => {
    const o: DecorOwned = { a: 2, b: 1, c: 0 };
    const price = (id: string): number => (id === "a" ? 105 : 70);
    const r = sellAllSpares(o, price);
    expect(r.count).toBe(3);
    // Each piece floors separately: 2×floor(105×0.6) + 1×floor(70×0.6).
    expect(r.refund).toBe(2 * Math.floor(105 * SELL_BACK_RATE) + Math.floor(70 * SELL_BACK_RATE));
    expect(totalOwned(o)).toBe(0);
  });

  it("does nothing on an empty store", () => {
    const o: DecorOwned = {};
    const r = sellAllSpares(o, () => 100);
    expect(r.count).toBe(0);
    expect(r.refund).toBe(0);
  });
});

describe("value + in-use", () => {
  it("totals owned value from catalog prices", () => {
    const o: DecorOwned = { a: 2, b: 1 };
    expect(totalValue(o, (id) => (id === "a" ? 100 : 50))).toBe(250);
  });

  it("counts placed defIds across real habitat-save blobs", () => {
    const saveA = JSON.stringify({
      layout: { objects: [{ defId: "hide_cave" }, { defId: "rock_cluster" }, { defId: "hide_cave" }, { noDef: 1 }] },
    });
    const saveB = JSON.stringify({ layout: { objects: [{ defId: "rock_cluster" }] } });
    const counts = inUseCounts([saveA, saveB, null, "not json", JSON.stringify({ layout: {} })]);
    expect(counts.hide_cave).toBe(2);
    expect(counts.rock_cluster).toBe(2);
    expect(Object.keys(counts)).toHaveLength(2);
  });
});

describe("buy back (undo a sale)", () => {
  it("records sales newest-first and stays capped", async () => {
    const { pushBuyback, BUYBACK_CAP } = await import("../src/game/decorInventory");
    let list = [] as ReturnType<typeof pushBuyback>;
    for (let i = 0; i < BUYBACK_CAP + 4; i++) list = pushBuyback(list, `piece_${i}`, 60, i);
    expect(list).toHaveLength(BUYBACK_CAP);
    expect(list[0].defId).toBe(`piece_${BUYBACK_CAP + 3}`); // newest first
  });

  it("re-buys at exactly the recorded price and consumes the entry", async () => {
    const { pushBuyback, takeBuyback } = await import("../src/game/decorInventory");
    const o: DecorOwned = {};
    const list = pushBuyback([], "hide_cave", 132, 1);
    const { res, list: next } = takeBuyback(list, 0, o, 200);
    expect(res.ok).toBe(true);
    expect(res.cost).toBe(132);
    expect(o.hide_cave).toBe(1);
    expect(next).toHaveLength(0);
  });

  it("refuses honestly when leaves are short or the entry is gone", async () => {
    const { pushBuyback, takeBuyback } = await import("../src/game/decorInventory");
    const o: DecorOwned = {};
    const list = pushBuyback([], "hide_cave", 132, 1);
    expect(takeBuyback(list, 0, o, 50).res.ok).toBe(false);
    expect(takeBuyback(list, 4, o, 500).res.ok).toBe(false);
    expect(o.hide_cave).toBeUndefined();
  });
});

describe("acquisition times", () => {
  it("marks keys at a timestamp", async () => {
    const { markAcquired } = await import("../src/game/decorInventory");
    const m: Record<string, number> = { "decor:old": 5 };
    markAcquired(m, ["decor:hide_cave", "supply:cricket"], 99);
    expect(m["decor:hide_cave"]).toBe(99);
    expect(m["supply:cricket"]).toBe(99);
    expect(m["decor:old"]).toBe(5);
  });
});

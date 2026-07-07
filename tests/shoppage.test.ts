/**
 * Supply Shop data contract — categories, real product mapping, honest bundle
 * math (price = contents minus the stated discount), cart model and checkout.
 */
import { describe, expect, it } from "vitest";
import { SUPPLIES, decorPrice } from "../src/game/economy";
import { LIZARD_PLACEABLES, findPlaceable } from "../src/habitats/HabitatBuilder";
import {
  SHOP_BUNDLES,
  SHOP_CATEGORIES,
  SHOP_PRODUCTS,
  SUBSTRATE_NOTE,
  TOOLS_NOTE,
  bundleBadge,
  bundleById,
  bundlePricing,
  cartAdd,
  cartCount,
  cartSetQty,
  cartTotals,
  checkout,
  productsInCategory,
  type CartLine,
} from "../src/data/shopCatalog";

describe("catalog", () => {
  it("has the reference's seven category pills", () => {
    expect(SHOP_CATEGORIES.map((c) => c.id)).toEqual(["all", "food", "plants", "decor", "substrate", "gear", "tools"]);
  });

  it("sells every supply pack and every unlocked catalog piece — nothing locked, nothing invented", () => {
    const supplyProducts = SHOP_PRODUCTS.filter((p) => p.kind === "supply");
    expect(supplyProducts).toHaveLength(SUPPLIES.length);
    const decorProducts = SHOP_PRODUCTS.filter((p) => p.kind === "decor");
    const unlocked = LIZARD_PLACEABLES.filter((d) => !d.locked);
    expect(decorProducts).toHaveLength(unlocked.length);
    for (const p of decorProducts) {
      const def = findPlaceable(p.refId);
      expect(def?.locked).toBeUndefined();
      expect(p.price).toBe(decorPrice(p.refId));
      expect(p.price).toBeGreaterThan(0);
      expect(p.art).toMatch(/^\/assets\/ui\/decor_thumbs\//);
    }
  });

  it("keeps the empty lanes honest (substrates/tools aren't sold)", () => {
    expect(productsInCategory("substrate")).toHaveLength(0);
    expect(productsInCategory("tools")).toHaveLength(0);
    expect(SUBSTRATE_NOTE).toMatch(/Terrain/);
    expect(TOOLS_NOTE).toMatch(/Clean/);
    expect(productsInCategory("all")).toHaveLength(SHOP_PRODUCTS.length);
  });
});

describe("bundles", () => {
  it("references only real goods", () => {
    for (const b of SHOP_BUNDLES)
      for (const it of b.items) {
        if (it.kind === "supply") expect(SUPPLIES.find((s) => s.id === it.refId)).toBeTruthy();
        else {
          expect(findPlaceable(it.refId)).toBeTruthy();
          expect(findPlaceable(it.refId)?.locked).toBeUndefined();
        }
      }
  });

  it("prices bundles from their real contents with the stated discount", () => {
    const b = bundleById("bundle_decor")!;
    const pr = bundlePricing(b);
    const full = 160 + 45 + 140 + 40; // branch_log + desert grass + rock cluster + small stones
    expect(pr.full).toBe(full);
    expect(pr.price).toBe(Math.round((full * 0.9) / 5) * 5);
    expect(pr.saved).toBe(pr.full - pr.price);
    expect(pr.itemCount).toBe(4);
    expect(bundleBadge(b)).toBe("Save 10%");
    const hero = SHOP_BUNDLES.find((x) => x.hero)!;
    expect(bundleBadge(hero)).toBe("Best value");
    expect(bundlePricing(hero).itemCount).toBe(7);
  });
});

describe("cart", () => {
  it("adds and merges lines, updates quantities, removes at zero", () => {
    let cart: CartLine[] = [];
    cart = cartAdd(cart, "product", "supply:cricket");
    cart = cartAdd(cart, "product", "supply:cricket");
    cart = cartAdd(cart, "bundle", "bundle_decor");
    expect(cart).toHaveLength(2);
    expect(cartCount(cart)).toBe(3);
    cart = cartSetQty(cart, "product", "supply:cricket", 5);
    expect(cart.find((l) => l.id === "supply:cricket")?.qty).toBe(5);
    cart = cartSetQty(cart, "product", "supply:cricket", 0);
    expect(cart.find((l) => l.id === "supply:cricket")).toBeUndefined();
  });

  it("totals with bundle savings as the discount line", () => {
    let cart: CartLine[] = [];
    cart = cartAdd(cart, "product", "supply:cricket", 2); // 60 full
    cart = cartAdd(cart, "bundle", "bundle_decor"); // 385 full → 345
    const t = cartTotals(cart);
    expect(t.subtotal).toBe(60 + 385);
    expect(t.total).toBe(60 + 345);
    expect(t.discount).toBe(40);
  });
});

describe("checkout", () => {
  it("refuses an empty cart and insufficient funds with reasons", () => {
    expect(checkout([], 9999).ok).toBe(false);
    const cart = cartAdd([], "bundle", "bundle_decor");
    const broke = checkout(cart, 10);
    expect(broke.ok).toBe(false);
    expect(broke.reason).toMatch(/Need/);
  });

  it("flattens products + bundles into real deliveries", () => {
    let cart: CartLine[] = [];
    cart = cartAdd(cart, "bundle", "bundle_desert_starter");
    cart = cartAdd(cart, "product", "supply:cricket");
    cart = cartAdd(cart, "product", "decor:rock_boulder");
    const res = checkout(cart, 100000);
    expect(res.ok).toBe(true);
    expect(res.spend).toBe(cartTotals(cart).total);
    expect(res.supplies.cricket).toBe(2); // bundle pack + product pack
    expect(res.supplies.mealworm).toBe(1);
    expect(res.decor.hide_cave).toBe(1);
    expect(res.decor.rock_boulder).toBe(2); // bundle + product
  });
});

describe("product art", () => {
  it("feeder packs use the real food photos; fish foods keep glyph tiles", () => {
    const byRef = (id: string) => SHOP_PRODUCTS.find((p) => p.id === `supply:${id}`)!;
    for (const id of ["cricket", "mealworm", "superworm", "dubia_roach", "waxworm"]) {
      expect(byRef(id).art, id).toMatch(/^\/assets\/ui\/food\/.+\.png$/);
    }
    for (const id of ["flakes", "pellets", "bloodworms"]) expect(byRef(id).art, id).toBeNull();
  });
});

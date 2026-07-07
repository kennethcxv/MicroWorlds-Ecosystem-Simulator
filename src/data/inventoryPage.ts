/**
 * INVENTORY PAGE DATA — pure registry + derivations for the reference-match
 * Inventory screen (Designs/Inventory_Screen). Real content only:
 *
 *  · Decorations / Plants / Other = the vivarium's real Decorate catalog
 *    (owned counts from decorInventory, "in use" from the saved layouts).
 *  · Food = the economy's real supply stock.
 *  · Substrate = the real terrain materials with their real unlock gates.
 *  · Tools = the keeper's permanent care kit (the Clean drawers' real tools).
 *  · Supplements = the feed drawer's real dusting options (always stocked).
 *
 * Rarity/size/biome are PRESENTATION WORDS derived from real numbers (price,
 * measured collision extents, authored tags) — same policy as scoreWord.
 * No DOM — unit-tested in tests/inventorypage.test.ts.
 */
import { SUPPLIES, decorPrice } from "../game/economy";
import { LIZARD_PLACEABLES, DECOR_EFFECT_KEYS, type PlaceableDef } from "../habitats/HabitatBuilder";
import { TERRAINS, type TerrainDef } from "./terrains";
import { decorThumbPath, supplyArtPath } from "./shopCatalog";
import type { GwIconName } from "../ui/gwIcons";

export type InvCategoryId = "all" | "decor" | "substrate" | "plants" | "food" | "supplements" | "tools" | "other";

export interface InvCategory {
  id: InvCategoryId;
  label: string;
  icon: GwIconName;
}

export const INV_CATEGORIES: InvCategory[] = [
  { id: "all", label: "All Items", icon: "box" },
  { id: "decor", label: "Decorations", icon: "branch" },
  { id: "substrate", label: "Substrate", icon: "mound" },
  { id: "plants", label: "Plants", icon: "sprout" },
  { id: "food", label: "Food", icon: "bowl" },
  { id: "supplements", label: "Supplements", icon: "flask" },
  { id: "tools", label: "Tools", icon: "broom" },
  { id: "other", label: "Other", icon: "gauge" },
];

export type Rarity = "Common" | "Uncommon" | "Rare" | "Exceptional";

/** Price → rarity word (presentation over the real catalog prices). */
export function rarityFor(price: number): Rarity {
  if (price < 80) return "Common";
  if (price < 140) return "Uncommon";
  if (price < 220) return "Rare";
  return "Exceptional";
}

/** Measured collision extents → a size word ("what footprint am I buying"). */
export function sizeWordFor(def: PlaceableDef): string {
  const he = def.collision?.halfExtents;
  const d = he ? 2 * Math.max(he[0], he[1], he[2]) : def.collision?.radius ? def.collision.radius * 2 : 0.2;
  if (d <= 0.17) return "Small";
  if (d <= 0.3) return "Medium";
  if (d <= 0.52) return "Large";
  return "Grand";
}

export function biomeFor(tags: string[]): string {
  const t = tags.map((x) => x.toLowerCase());
  if (t.some((x) => x.includes("arid") || x.includes("desert"))) return "Desert";
  if (t.some((x) => x.includes("humid") || x.includes("tropic"))) return "Tropical";
  return "Any habitat";
}

export type InvKind = "decor" | "supply" | "substrate" | "tool" | "supplement";

export interface InvItem {
  /** Unique row id, namespaced ("decor:hide_cave", "supply:cricket"…). */
  id: string;
  refId: string;
  kind: InvKind;
  cat: Exclude<InvCategoryId, "all">;
  name: string;
  /** Owned/spare count; null = permanent kit (tools, supplements, substrates). */
  qty: number | null;
  qtyLabel: string;
  /** Image path (decor thumb / terrain swatch); null → glyph tile. */
  art: string | null;
  glyph: string;
  /** Full catalog value in leaves (0 for permanent kit). */
  value: number;
  rarity: Rarity;
  sizeWord: string | null;
  biome: string;
  desc: string;
  tags: string[];
  tip: string | null;
  /** Decor habitat-effect meters (label + 0..10), for the detail panel. */
  effects: { label: string; v: number }[] | null;
  /** Pieces currently placed in the real saved habitats. */
  inUse: number;
  placeable: boolean;
  sellable: boolean;
  /** Last acquisition time (epoch ms; 0 = never bought this session-era).
   *  Drives the honest "Recent" sort — a fresh purchase lands first. */
  acquiredAt: number;
}

export interface InventoryInputs {
  /** Owned decor counts (decorInventory). */
  owned: Record<string, number>;
  /** Placed-in-habitat counts (decorInventory.readInUse). */
  inUse: Record<string, number>;
  /** Supply stock (economy). */
  stock: Record<string, number>;
  /** Acquisition times by item key ("decor:x" / "supply:x") — optional. */
  acquired?: Record<string, number>;
}

function decorItem(def: PlaceableDef, owned: number, inUse: number): InvItem {
  const price = decorPrice(def.id);
  const cat: InvItem["cat"] = def.section === "Plants" ? "plants" : def.section === "Utilities" ? "other" : "decor";
  return {
    id: `decor:${def.id}`,
    refId: def.id,
    kind: "decor",
    cat,
    name: def.label,
    qty: owned,
    qtyLabel: owned > 0 ? `×${owned}` : "In habitat",
    art: decorThumbPath(def.id),
    glyph: "🪨",
    value: price,
    rarity: rarityFor(price),
    sizeWord: sizeWordFor(def),
    biome: biomeFor(def.tags),
    desc: def.desc,
    tags: def.tags,
    tip: def.tip,
    effects: DECOR_EFFECT_KEYS.map(({ key, label }) => ({ label, v: def.effects[key] })).filter((e) => e.v > 0),
    inUse,
    acquiredAt: 0,
    placeable: owned > 0,
    sellable: owned > 0,
  };
}

function supplyItem(id: string, count: number): InvItem | null {
  const s = SUPPLIES.find((x) => x.id === id);
  if (!s) return null;
  return {
    id: `supply:${s.id}`,
    refId: s.id,
    kind: "supply",
    cat: "food",
    name: s.label,
    qty: count,
    qtyLabel: count > 0 ? `${count} in stock` : "Out of stock",
    art: supplyArtPath(s.id),
    glyph: s.icon,
    value: s.price,
    rarity: rarityFor(s.price),
    sizeWord: null,
    biome: s.kind === "insect" ? "Vivarium feeder" : "Aquarium food",
    desc: s.desc,
    tags: [s.kind === "insect" ? "Live feeder" : "Fish food", `${s.pack} per pack`],
    tip: count <= 3 ? "Running low — the Supply Shop sells packs." : null,
    effects: null,
    inUse: 0,
    acquiredAt: 0,
    placeable: false,
    sellable: false,
  };
}

function substrateItem(t: TerrainDef): InvItem {
  const inLizard = t.habitats.includes("lizard_terrarium") || t.habitats.includes("desert_terrarium");
  const inTropical = t.habitats.includes("tropical_terrarium");
  const where = inLizard && inTropical ? "Sunstone Desert · Emerald Hollow" : inLizard ? "Sunstone Desert" : "Emerald Hollow";
  return {
    id: `terrain:${t.id}`,
    refId: t.id,
    kind: "substrate",
    cat: "substrate",
    name: t.name,
    qty: null,
    qtyLabel: "Unlocked",
    art: t.swatch,
    glyph: "🏜",
    value: 0,
    rarity: "Common",
    sizeWord: null,
    biome: inTropical && !inLizard ? "Tropical" : "Desert",
    desc: t.description,
    tags: t.tags.slice(0, 3),
    tip: `Paint it in ${where}'s Terrain mode — materials are free to apply.`,
    effects: null,
    inUse: 0,
    acquiredAt: 0,
    placeable: false,
    sellable: false,
  };
}

interface KitDef {
  id: string;
  name: string;
  glyph: string;
  cat: "tools" | "supplements";
  desc: string;
  tags: string[];
  tip: string;
}

/** The keeper's permanent kit — these really are the Clean/Feed drawers' tools. */
export const KIT_ITEMS: KitDef[] = [
  { id: "tool_scoop", name: "Sand Scoop", glyph: "🥄", cat: "tools", desc: "Steel scoop for spot-cleaning droppings and fouled sand.", tags: ["Clean drawer", "Vivarium"], tip: "Hold Spot Clean / Pick Up Waste and work the scoop over the mess." },
  { id: "tool_brush", name: "Hand Brush", glyph: "🧹", cat: "tools", desc: "Walnut-handled brush that sweeps sand smooth again.", tags: ["Clean drawer", "Vivarium"], tip: "Great after digging — brushes hotspots before they linger." },
  { id: "tool_squeegee", name: "Glass Squeegee", glyph: "🪟", cat: "tools", desc: "Rubber-blade squeegee for smudged front glass.", tags: ["Clean drawer", "All habitats"], tip: "Drag firmly across the pane until it squeaks crystal clear." },
  { id: "tool_sponge", name: "Soft Sponge", glyph: "🧽", cat: "tools", desc: "Gentle sponge for algae and stubborn spots.", tags: ["Clean drawer", "Aquarium"], tip: "The aquarium's glass-scrub tool — sparkles as it lifts algae." },
  { id: "tool_mister", name: "Pressure Mister", glyph: "💦", cat: "tools", desc: "Fine-spray mister that raises humidity in seconds.", tags: ["Dock action", "Paludarium"], tip: "Emerald Hollow's frog drinks through its skin — mist when it reads dry." },
  { id: "supp_calcium", name: "Calcium Powder", glyph: "🦴", cat: "supplements", desc: "Pure calcium dust for feeder insects — the MBD guard.", tags: ["Feed drawer", "Always stocked"], tip: "Pick it in the Feed drawer's supplement row; a light dusting per feeding." },
  { id: "supp_d3", name: "Calcium + D3", glyph: "☀️", cat: "supplements", desc: "Calcium with D3 for animals without strong UVB exposure.", tags: ["Feed drawer", "Always stocked"], tip: "Alternate with plain calcium — D3 every few feedings is plenty." },
];

function kitItem(k: KitDef): InvItem {
  return {
    id: `kit:${k.id}`,
    refId: k.id,
    kind: k.cat === "tools" ? "tool" : "supplement",
    cat: k.cat,
    name: k.name,
    qty: null,
    qtyLabel: k.cat === "tools" ? "Keeper's kit" : "Always stocked",
    art: null,
    glyph: k.glyph,
    value: 0,
    rarity: "Common",
    sizeWord: null,
    biome: "Any habitat",
    desc: k.desc,
    tags: k.tags,
    tip: k.tip,
    effects: null,
    inUse: 0,
    acquiredAt: 0,
    placeable: false,
    sellable: false,
  };
}

/** Assemble every real inventory row. Decor appears once you own a spare OR
 *  have one placed in a habitat (the default layouts count — they're yours). */
export function buildInventoryItems(input: InventoryInputs): InvItem[] {
  const items: InvItem[] = [];
  for (const def of LIZARD_PLACEABLES) {
    if (def.locked) continue;
    const owned = Math.max(0, Math.floor(input.owned[def.id] ?? 0));
    const used = Math.max(0, Math.floor(input.inUse[def.id] ?? 0));
    if (owned > 0 || used > 0) items.push(decorItem(def, owned, used));
  }
  for (const s of SUPPLIES) {
    const it = supplyItem(s.id, Math.max(0, Math.floor(input.stock[s.id] ?? 0)));
    if (it) items.push(it);
  }
  for (const t of TERRAINS) {
    const anyPlayerHabitat =
      t.habitats.includes("lizard_terrarium") || t.habitats.includes("desert_terrarium") || t.habitats.includes("tropical_terrarium");
    if (anyPlayerHabitat) items.push(substrateItem(t));
  }
  for (const k of KIT_ITEMS) items.push(kitItem(k));
  // Stamp real acquisition times (shop purchases / buy-backs) by item key.
  if (input.acquired) for (const it of items) it.acquiredAt = input.acquired[it.id] ?? 0;
  return items;
}

export function itemsInCategory(items: InvItem[], cat: InvCategoryId): InvItem[] {
  return cat === "all" ? items : items.filter((i) => i.cat === cat);
}

export function categoryCounts(items: InvItem[]): Record<InvCategoryId, number> {
  const counts = { all: 0, decor: 0, substrate: 0, plants: 0, food: 0, supplements: 0, tools: 0, other: 0 } as Record<
    InvCategoryId,
    number
  >;
  for (const i of items) {
    counts.all++;
    counts[i.cat]++;
  }
  return counts;
}

export type InvSort = "recent" | "name" | "value" | "count";

export const INV_SORTS: { id: InvSort; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "name", label: "Name A–Z" },
  { id: "value", label: "Value" },
  { id: "count", label: "Quantity" },
];

export function sortItems(items: InvItem[], mode: InvSort): InvItem[] {
  const arr = items.slice();
  if (mode === "name") arr.sort((a, b) => a.name.localeCompare(b.name));
  else if (mode === "value") arr.sort((a, b) => b.value - a.value);
  else if (mode === "count") arr.sort((a, b) => (b.qty ?? Number.MAX_SAFE_INTEGER) - (a.qty ?? Number.MAX_SAFE_INTEGER));
  // "Recent" = latest acquisition first; never-acquired items keep the stable
  // build order (catalog → supplies → substrates → kit) behind them.
  else if (mode === "recent") arr.sort((a, b) => b.acquiredAt - a.acquiredAt);
  return arr;
}

export const INV_PER_PAGE = 20; // the reference's 5-per-row × 4 rows

export interface InvPage<T> {
  page: number;
  pages: number;
  slice: T[];
}

export function paginate<T>(items: T[], page: number, perPage = INV_PER_PAGE): InvPage<T> {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { page: p, pages, slice: items.slice(p * perPage, (p + 1) * perPage) };
}

export interface InvTotals {
  /** Countable things you own (decor spares + supply units). */
  totalItems: number;
  /** Leaves value of owned decor spares + supply stock at pack rates. */
  totalValue: number;
}

export function invTotals(items: InvItem[]): InvTotals {
  let totalItems = 0;
  let totalValue = 0;
  for (const i of items) {
    if (i.qty == null) continue;
    totalItems += i.qty;
    if (i.kind === "decor") totalValue += i.qty * i.value;
    else if (i.kind === "supply") {
      const s = SUPPLIES.find((x) => x.id === i.refId);
      if (s && s.pack > 0) totalValue += Math.round((i.qty / s.pack) * s.price);
    }
  }
  return { totalItems, totalValue };
}

/**
 * PHOTO ALBUM DATA — pure grouping/derivations over the REAL persisted album
 * (albumScreen.ts shots) for the reference-match Photo Album screen
 * (Designs/Photo_Album). Collections are the player's real three habitats
 * (matched from the shot captions the shutters actually write, both caption
 * orders), plus a catch-all bucket for anything else. Stats are counted,
 * never invented. No DOM — unit-tested in tests/photoalbum.test.ts.
 */
import type { AlbumShot } from "../ui/albumScreen";
import type { GwIconName } from "../ui/gwIcons";

export type AlbumCollectionId = "lizard" | "fish" | "frog" | "eco";

export interface AlbumCollectionDef {
  id: AlbumCollectionId;
  name: string;
  type: string;
  biome: string;
  icon: GwIconName;
  accent: string;
  desc: string;
}

export const ALBUM_COLLECTIONS: AlbumCollectionDef[] = [
  {
    id: "lizard",
    name: "Sunstone Desert",
    type: "Desert Habitat",
    biome: "Desert",
    icon: "sun",
    accent: "#f0a63e",
    desc: "Sun-drenched sands, rocky hides and hardy plants — a thriving desert home.",
  },
  {
    id: "fish",
    name: "Sapphire Stream",
    type: "Freshwater Aquarium",
    biome: "Freshwater",
    icon: "drop",
    accent: "#5db9f0",
    desc: "A planted community aquarium — schools weaving through driftwood and green.",
  },
  {
    id: "frog",
    name: "Emerald Hollow",
    type: "Rainforest Paludarium",
    biome: "Rainforest",
    icon: "sprout",
    accent: "#8ce25a",
    desc: "Mist, moss and broad leaves around a quiet pond — the frog's humid hollow.",
  },
  {
    id: "eco",
    name: "Around the Eco-Center",
    type: "Keeper's Snapshots",
    biome: "Indoors",
    icon: "house",
    accent: "#dcc496",
    desc: "Everything else your camera caught around the eco-center.",
  },
];

export function collectionById(id: AlbumCollectionId): AlbumCollectionDef {
  return ALBUM_COLLECTIONS.find((c) => c.id === id) ?? ALBUM_COLLECTIONS[3];
}

/** Which collection a shot belongs to, from the caption the shutter wrote.
 *  Handles both real orders: "Leopard Gecko · Sunstone Desert" AND
 *  "Sapphire Stream · Community Aquarium" (renamed tanks keep the suffix). */
export function collectionIdFor(caption: string): AlbumCollectionId {
  if (caption.includes("Sunstone Desert")) return "lizard";
  if (caption.includes("Emerald Hollow")) return "frog";
  if (caption.includes("Community Aquarium") || caption.includes("Sapphire Stream")) return "fish";
  return "eco";
}

/** The subject label for the By Species view. */
export function speciesFor(caption: string): string {
  const parts = caption.split("·").map((s) => s.trim());
  if (parts.length < 2) return caption || "Keeper's shot";
  // Fish captions lead with the TANK name; the species-ish label is generic.
  if (parts[1] === "Community Aquarium") return "Aquarium Community";
  return parts[0];
}

export interface ShotMeta extends AlbumShot {
  fav: boolean;
  collection: AlbumCollectionId;
  species: string;
}

export function decorateShots(shots: AlbumShot[], favIds: number[]): ShotMeta[] {
  const favs = new Set(favIds);
  return shots.map((s) => ({
    ...s,
    fav: favs.has(s.id),
    collection: collectionIdFor(s.caption),
    species: speciesFor(s.caption),
  }));
}

export interface CollectionSummary {
  def: AlbumCollectionDef;
  shots: ShotMeta[];
  count: number;
  favCount: number;
  /** Wall-clock ms of the first/last shot (null when empty). */
  createdT: number | null;
  latest: ShotMeta | null;
  /** Explicit cover (Edit Album Cover) or the latest shot. */
  cover: ShotMeta | null;
}

/** Summaries for the three real habitats (always listed, even empty) + the
 *  catch-all bucket only when it actually holds shots. */
export function summarizeCollections(shots: ShotMeta[], covers: Record<string, number>): CollectionSummary[] {
  const out: CollectionSummary[] = [];
  for (const def of ALBUM_COLLECTIONS) {
    const mine = shots.filter((s) => s.collection === def.id).sort((a, b) => b.t - a.t);
    if (def.id === "eco" && mine.length === 0) continue;
    const latest = mine[0] ?? null;
    const coverId = covers[def.id];
    const cover = mine.find((s) => s.id === coverId) ?? latest;
    out.push({
      def,
      shots: mine,
      count: mine.length,
      favCount: mine.filter((s) => s.fav).length,
      createdT: mine.length ? Math.min(...mine.map((s) => s.t)) : null,
      latest,
      cover,
    });
  }
  return out;
}

export type AlbumFilterId = "habitat" | "species" | "favorites" | "seasonal" | "showcase";

export const ALBUM_FILTERS: { id: AlbumFilterId; label: string; icon: GwIconName }[] = [
  { id: "habitat", label: "By Habitat", icon: "gecko" },
  { id: "species", label: "By Species", icon: "frog" },
  { id: "favorites", label: "Favorites", icon: "heart" },
  { id: "seasonal", label: "Seasonal", icon: "snow" },
  { id: "showcase", label: "Showcase", icon: "star" },
];

export const SEASONAL_NOTE = "Seasonal event albums arrive with a future update — happy snapping meanwhile.";
export const SHOWCASE_EMPTY_NOTE = "Favorite a shot (♥) to build your showcase — your curated best lives here.";

/** Showcase = your curated picks: favorites plus each collection's cover. */
export function showcaseShots(shots: ShotMeta[], covers: Record<string, number>): ShotMeta[] {
  const coverIds = new Set(Object.values(covers));
  return shots.filter((s) => s.fav || coverIds.has(s.id)).sort((a, b) => b.t - a.t);
}

export type AlbumSort = "new" | "old";

export function sortShots(shots: ShotMeta[], mode: AlbumSort): ShotMeta[] {
  const arr = shots.slice().sort((a, b) => (mode === "new" ? b.t - a.t : a.t - b.t));
  return arr;
}

export function groupBySpecies(shots: ShotMeta[]): { species: string; shots: ShotMeta[] }[] {
  const map = new Map<string, ShotMeta[]>();
  for (const s of shots) {
    const list = map.get(s.species) ?? [];
    list.push(s);
    map.set(s.species, list);
  }
  return [...map.entries()]
    .map(([species, list]) => ({ species, shots: list.sort((a, b) => b.t - a.t) }))
    .sort((a, b) => b.shots.length - a.shots.length);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "May 18, 2025" — deterministic (no locale surprises in tests). */
export function fmtStampDate(t: number): string {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "7:42 PM". */
export function fmtStampTime(t: number): string {
  const d = new Date(t);
  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}

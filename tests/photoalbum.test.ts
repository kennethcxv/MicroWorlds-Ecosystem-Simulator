/**
 * Photo Album data contract — caption→collection matching (both real caption
 * orders), species labels, honest counted stats, covers, showcase and stamps.
 */
import { describe, expect, it } from "vitest";
import type { AlbumShot } from "../src/ui/albumScreen";
import {
  ALBUM_COLLECTIONS,
  ALBUM_FILTERS,
  SEASONAL_NOTE,
  SHOWCASE_EMPTY_NOTE,
  collectionIdFor,
  decorateShots,
  fmtStampDate,
  fmtStampTime,
  groupBySpecies,
  showcaseShots,
  sortShots,
  speciesFor,
  summarizeCollections,
} from "../src/data/photoAlbum";

const shot = (id: number, caption: string, t: number): AlbumShot => ({ id, img: "data:,x", when: `Day ${id}`, caption, t });

const SHOTS: AlbumShot[] = [
  shot(1, "Leopard Gecko · Sunstone Desert", 1000),
  shot(2, "Leopard Gecko · Sunstone Desert", 5000),
  shot(3, "Sapphire Stream · Community Aquarium", 3000),
  shot(4, "Colorful Frog · Emerald Hollow", 4000),
  shot(5, "GLASSWATER", 2000),
];

describe("caption matching", () => {
  it("maps every real caption shape to its collection", () => {
    expect(collectionIdFor("Leopard Gecko · Sunstone Desert")).toBe("lizard");
    expect(collectionIdFor("Colorful Frog · Emerald Hollow")).toBe("frog");
    expect(collectionIdFor("Sapphire Stream · Community Aquarium")).toBe("fish");
    expect(collectionIdFor("My Renamed Tank · Community Aquarium")).toBe("fish");
    expect(collectionIdFor("GLASSWATER")).toBe("eco");
  });

  it("labels species from the subject side of the caption", () => {
    expect(speciesFor("Leopard Gecko · Sunstone Desert")).toBe("Leopard Gecko");
    expect(speciesFor("My Tank · Community Aquarium")).toBe("Aquarium Community");
    expect(speciesFor("GLASSWATER")).toBe("GLASSWATER");
  });
});

describe("collections", () => {
  const metas = decorateShots(SHOTS, [2, 4]);
  const sums = summarizeCollections(metas, { lizard: 1 });

  it("always lists the three real habitats; the catch-all only when used", () => {
    expect(sums.map((s) => s.def.id)).toEqual(["lizard", "fish", "frog", "eco"]);
    const noEco = summarizeCollections(
      decorateShots(SHOTS.slice(0, 4), []),
      {},
    );
    expect(noEco.map((s) => s.def.id)).toEqual(["lizard", "fish", "frog"]);
    expect(ALBUM_COLLECTIONS).toHaveLength(4);
  });

  it("counts photos/favorites and stamps created/latest honestly", () => {
    const liz = sums[0];
    expect(liz.count).toBe(2);
    expect(liz.favCount).toBe(1);
    expect(liz.createdT).toBe(1000);
    expect(liz.latest?.id).toBe(2);
  });

  it("uses the explicit cover when set, else the latest shot", () => {
    expect(sums[0].cover?.id).toBe(1); // explicit
    expect(sums[1].cover?.id).toBe(3); // latest fallback
    expect(sums[2].cover?.id).toBe(4);
  });
});

describe("filters + showcase", () => {
  it("offers the reference's five pills", () => {
    expect(ALBUM_FILTERS.map((f) => f.id)).toEqual(["habitat", "species", "favorites", "seasonal", "showcase"]);
    expect(SEASONAL_NOTE).toMatch(/future update/i);
    expect(SHOWCASE_EMPTY_NOTE).toMatch(/Favorite/);
  });

  it("showcase = favorites + covers, newest first", () => {
    const metas = decorateShots(SHOTS, [2]);
    const picks = showcaseShots(metas, { fish: 3 });
    expect(picks.map((s) => s.id)).toEqual([2, 3]);
  });

  it("sorts and groups by species", () => {
    const metas = decorateShots(SHOTS, []);
    expect(sortShots(metas, "new")[0].id).toBe(2);
    expect(sortShots(metas, "old")[0].id).toBe(1);
    const groups = groupBySpecies(metas);
    expect(groups[0].species).toBe("Leopard Gecko");
    expect(groups[0].shots).toHaveLength(2);
  });
});

describe("stamps", () => {
  it("formats dates and times deterministically", () => {
    const t = new Date(2025, 4, 18, 19, 42).getTime();
    expect(fmtStampDate(t)).toBe("May 18, 2025");
    expect(fmtStampTime(t)).toBe("7:42 PM");
    expect(fmtStampTime(new Date(2025, 0, 2, 0, 5).getTime())).toBe("12:05 AM");
  });
});

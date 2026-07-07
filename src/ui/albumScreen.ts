/**
 * PHOTO ALBUM STORE — the persisted shots (localStorage) every shutter fills,
 * plus the favorites/covers sidecars. The browsing UI lives in
 * photoAlbumScreen.ts (the reference-match Photo Album screen); pure grouping
 * helpers live in data/photoAlbum.ts.
 *
 * Storage stays small on purpose: JPEG thumbnails ~832px wide, capped at 24
 * shots (oldest drops first) — comfortably inside localStorage budgets.
 */
import { gwEl as el } from "./gwTheme";

const KEY = "glasswater.album.v1";
const MAX_SHOTS = 24;
const SHOT_W = 832;

export interface AlbumShot {
  id: number;
  /** JPEG data URL (already scaled down). */
  img: string;
  /** In-game day/time label, e.g. "Day 48 · 2:31 PM". */
  when: string;
  /** Who/where, e.g. "Leopard Gecko · Sunstone Desert". */
  caption: string;
  /** Wall-clock save time (ms) — for ordering. */
  t: number;
}

function load(): AlbumShot[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as AlbumShot[];
    return Array.isArray(arr) ? arr.filter((s) => s && typeof s.img === "string") : [];
  } catch {
    return [];
  }
}

function save(shots: AlbumShot[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(shots));
  } catch {
    // Storage full: drop the oldest shot and retry once.
    if (shots.length > 1) {
      shots.shift();
      try {
        localStorage.setItem(KEY, JSON.stringify(shots));
      } catch {
        /* give up quietly — the capture still showed its flash */
      }
    }
  }
}

/** Scale the live canvas into a small JPEG and add it to the album. */
export function captureToAlbum(source: HTMLCanvasElement, when: string, caption: string): AlbumShot {
  const scale = Math.min(1, SHOT_W / source.width);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(source.width * scale));
  c.height = Math.max(1, Math.round(source.height * scale));
  c.getContext("2d")!.drawImage(source, 0, 0, c.width, c.height);
  const shots = load();
  const shot: AlbumShot = {
    id: (shots[shots.length - 1]?.id ?? 0) + 1,
    img: c.toDataURL("image/jpeg", 0.74),
    when,
    caption,
    t: Date.now(),
  };
  shots.push(shot);
  while (shots.length > MAX_SHOTS) shots.shift();
  save(shots);
  return shot;
}

export function albumCount(): number {
  return load().length;
}

/** All shots, oldest → newest (callers sort as needed). */
export function listShots(): AlbumShot[] {
  return load();
}

export function deleteShot(id: number): void {
  save(load().filter((s) => s.id !== id));
  // A deleted shot can't stay favorited or be a cover.
  saveFavIds(favoriteIds().filter((f) => f !== id));
  const covers = coverMap();
  let changed = false;
  for (const k of Object.keys(covers)) {
    if (covers[k] === id) {
      delete covers[k];
      changed = true;
    }
  }
  if (changed) saveCovers(covers);
}

// ── Favorites + album covers (tiny sidecar stores) ──────────────────────────

const FAV_KEY = "glasswater.album.favs.v1";
const COVER_KEY = "glasswater.album.covers.v1";

export function favoriteIds(): number[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as number[];
      if (Array.isArray(arr)) return arr.filter((n) => typeof n === "number");
    }
  } catch {
    /* fresh */
  }
  return [];
}

function saveFavIds(ids: number[]): void {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(ids));
  } catch {
    /* non-fatal */
  }
}

/** Toggle a shot's favorite; returns the NEW state. */
export function toggleFavorite(id: number): boolean {
  const ids = favoriteIds();
  const i = ids.indexOf(id);
  if (i >= 0) ids.splice(i, 1);
  else ids.push(id);
  saveFavIds(ids);
  return i < 0;
}

/** Explicit album covers per collection id (photoAlbum.ts collections). */
export function coverMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COVER_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Record<string, number>;
      if (o && typeof o === "object" && !Array.isArray(o)) return o;
    }
  } catch {
    /* fresh */
  }
  return {};
}

function saveCovers(covers: Record<string, number>): void {
  try {
    localStorage.setItem(COVER_KEY, JSON.stringify(covers));
  } catch {
    /* non-fatal */
  }
}

export function setCover(collectionId: string, shotId: number): void {
  const covers = coverMap();
  covers[collectionId] = shotId;
  saveCovers(covers);
}

/** A quick white shutter flash over the whole screen. */
export function shutterFlash(): void {
  const f = el("div", "gw-shutter-flash");
  document.body.append(f);
  f.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 420, easing: "ease-out" }).onfinish = () => f.remove();
}

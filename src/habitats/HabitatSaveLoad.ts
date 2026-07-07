/**
 * Habitat persistence — one namespaced localStorage entry PER habitat
 * (`glasswater.habitat.<id>`), completely separate from the aquarium save
 * (`glasswater.save`). Defensive on read: a malformed or stale-version blob
 * returns null so the caller rebuilds the default layout instead of crashing.
 */
import type { HabitatState } from "./HabitatTypes";
import { HABITAT_SAVE_VERSION } from "./HabitatState";

const PREFIX = "glasswater.habitat.";

export function habitatKey(id: string): string {
  return PREFIX + id;
}

export function saveHabitat(state: HabitatState): boolean {
  try {
    localStorage.setItem(habitatKey(state.layout.id), JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn("[GLASSWATER habitat] save failed:", e);
    return false;
  }
}

export function loadHabitat(id: string): HabitatState | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(habitatKey(id));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<HabitatState>;
    if (!data || typeof data !== "object") return null;
    if (data.version !== HABITAT_SAVE_VERSION) {
      console.info("[GLASSWATER habitat] save version mismatch — rebuilding default.");
      return null;
    }
    if (!data.layout || !Array.isArray(data.animals)) return null;
    const s = data as HabitatState;
    // Patch runtime-only fields that an older/partial blob might miss.
    s.feeders = Array.isArray(s.feeders) ? s.feeders : [];
    s.events = Array.isArray(s.events) ? s.events : [];
    if (typeof s.nextEventId !== "number") s.nextEventId = 1;
    if (typeof s.nextFeederId !== "number") s.nextFeederId = 1;
    if (typeof s.feedCooldown !== "number") s.feedCooldown = 0;
    if (typeof s.elapsed !== "number") s.elapsed = 0;
    return s;
  } catch (e) {
    console.warn("[GLASSWATER habitat] load failed:", e);
    return null;
  }
}

export function hasHabitat(id: string): boolean {
  try {
    return localStorage.getItem(habitatKey(id)) != null;
  } catch {
    return false;
  }
}

export function clearHabitat(id: string): void {
  try {
    localStorage.removeItem(habitatKey(id));
  } catch {
    /* ignore */
  }
}

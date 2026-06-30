/**
 * localStorage save/load. Defensive on read: a malformed or stale save falls
 * back to a fresh game rather than crashing the app.
 */
import { type GameState, SAVE_VERSION, createInitialState } from "./state";

const KEY = "glasswater.save";

export function saveGame(state: GameState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn("[GLASSWATER] save failed:", e);
    return false;
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) != null;
  } catch {
    return false;
  }
}

export function loadGame(): GameState | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as Partial<GameState>;
    if (!data || typeof data !== "object") return null;
    if (data.version !== SAVE_VERSION) {
      console.info("[GLASSWATER] save version mismatch — starting fresh.");
      return null;
    }
    // Patch any missing top-level keys against a fresh state so older/partial
    // saves still load cleanly.
    const base = createInitialState(data.seed ?? undefined);
    const merged: GameState = { ...base, ...data } as GameState;
    if (!Array.isArray(merged.tanks) || merged.tanks.length === 0) merged.tanks = base.tanks;
    if (!Array.isArray(merged.events)) merged.events = [];
    if (!merged.clock || typeof merged.clock.minutes !== "number") merged.clock = base.clock;
    if (!merged.resources) merged.resources = base.resources;
    if (!merged.tanks.some((t) => t.id === merged.activeTankId)) {
      merged.activeTankId = merged.tanks[0].id;
    }
    return merged;
  } catch (e) {
    console.warn("[GLASSWATER] load failed:", e);
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

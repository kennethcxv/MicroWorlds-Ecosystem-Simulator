import { describe, it, expect, beforeEach } from "vitest";
import { saveGame, loadGame, hasSave, clearSave } from "../src/core/save";
import { createInitialState, SAVE_VERSION } from "../src/core/state";

/** Minimal in-memory localStorage so the save module can be tested under Node. */
class MemStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  getItem(k: string): string | null {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, String(v));
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
  key(i: number): string | null {
    return Array.from(this.store.keys())[i] ?? null;
  }
}

const KEY = "glasswater.save";

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});

describe("save / load", () => {
  it("round-trips a full game state", () => {
    const s = createInitialState(424242);
    s.resources.leaves = 9999;
    s.clock.day = 73;
    getTank(s).food = 27;

    expect(saveGame(s)).toBe(true);
    expect(hasSave()).toBe(true);

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(s);
  });

  it("returns null and reports no save when storage is empty", () => {
    expect(hasSave()).toBe(false);
    expect(loadGame()).toBeNull();
  });

  it("rejects a save from a different version", () => {
    const s = createInitialState();
    saveGame(s);
    const raw = JSON.parse(localStorage.getItem(KEY)!);
    raw.version = SAVE_VERSION + 99;
    localStorage.setItem(KEY, JSON.stringify(raw));

    expect(loadGame()).toBeNull();
  });

  it("returns null on malformed JSON instead of throwing", () => {
    localStorage.setItem(KEY, "{not valid json");
    expect(loadGame()).toBeNull();
  });

  it("repairs a partial save by patching missing keys", () => {
    // A save missing events/tanks but with the right version.
    const partial = { version: SAVE_VERSION, seed: 5, resources: { leaves: 1, water: 2, reputation: 3 } };
    localStorage.setItem(KEY, JSON.stringify(partial));

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(Array.isArray(loaded!.events)).toBe(true);
    expect(loaded!.tanks.length).toBeGreaterThan(0);
    expect(loaded!.tanks.some((t) => t.id === loaded!.activeTankId)).toBe(true);
    expect(loaded!.resources.leaves).toBe(1);
  });

  it("clearSave removes the stored game", () => {
    saveGame(createInitialState());
    expect(hasSave()).toBe(true);
    clearSave();
    expect(hasSave()).toBe(false);
    expect(loadGame()).toBeNull();
  });
});

function getTank(s: ReturnType<typeof createInitialState>) {
  return s.tanks[0];
}

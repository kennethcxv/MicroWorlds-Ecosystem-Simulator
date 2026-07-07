/**
 * Settings schema contract — the reference's six tabs, every pref-wired row
 * points at a REAL Prefs field with its default inside the row's own range,
 * future rows carry honest notes, and the load/save clamps hold.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { SETTINGS_SCHEMA, SETTINGS_TABS, settingsTab, tabPrefs } from "../src/data/settingsSchema";
import { DEFAULT_PREFS, fmtClockPref, getPrefs, resetPrefsCache, setPrefs } from "../src/ui/prefs";

const allRows = SETTINGS_SCHEMA.flatMap((t) => t.groups.flatMap((g) => g.rows));

describe("tabs", () => {
  it("matches the reference's six tabs in order", () => {
    expect(SETTINGS_TABS.map((t) => t.id)).toEqual(["graphics", "audio", "controls", "gameplay", "accessibility", "camera"]);
    expect(SETTINGS_SCHEMA.map((t) => t.id)).toEqual(SETTINGS_TABS.map((t) => t.id));
    expect(settingsTab("audio").label).toBe("Audio");
  });
});

describe("rows", () => {
  it("wires every pref row to a real Prefs field", () => {
    const keys = new Set(Object.keys(DEFAULT_PREFS));
    for (const r of allRows) if (r.pref) expect(keys.has(r.pref), `${r.id} → ${r.pref}`).toBe(true);
  });

  it("keeps each default inside its own control's range/options", () => {
    for (const r of allRows) {
      if (!r.pref) continue;
      const dflt = DEFAULT_PREFS[r.pref];
      if (r.kind === "slider") {
        expect(typeof dflt).toBe("number");
        expect(dflt as number).toBeGreaterThanOrEqual(r.min ?? -Infinity);
        expect(dflt as number).toBeLessThanOrEqual(r.max ?? Infinity);
      } else if (r.kind === "select") {
        expect(r.options && r.options.length >= 2, `${r.id} has options`).toBe(true);
        expect(r.options?.some((o) => o.v === dflt), `${r.id} default in options`).toBe(true);
      } else if (r.kind === "toggle") {
        expect(typeof dflt).toBe("boolean");
      }
    }
  });

  it("labels every not-yet-live control with an honest future note", () => {
    const future = allRows.filter((r) => r.future);
    expect(future.length).toBeGreaterThanOrEqual(4); // shadows, bloom, music, ambience…
    for (const r of future) expect(r.future).toMatch(/future update|arrives/i);
  });

  it("ships a genuinely functional screen (a dozen-plus LIVE controls)", () => {
    const live = allRows.filter((r) => (r.pref || r.action) && !r.future);
    expect(live.length).toBeGreaterThanOrEqual(14);
    expect(allRows.filter((r) => r.action === "save-now")).toHaveLength(1);
    expect(allRows.filter((r) => r.action === "reset-game" && r.danger)).toHaveLength(1);
    expect(allRows.filter((r) => r.action === "test-sound")).toHaveLength(1);
  });

  it("collects a tab's live pref keys for Reset Tab", () => {
    const keys = tabPrefs(settingsTab("gameplay"));
    expect(keys).toContain("tempUnit");
    expect(keys).toContain("autosaveSec");
    expect(keys).not.toContain("musicVolume");
  });
});

/** Minimal in-memory localStorage so the prefs module can be tested under Node. */
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

describe("prefs store (v2 fields)", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
    resetPrefsCache();
  });

  it("heals an old v1 blob to full defaults", () => {
    localStorage.setItem("glasswater.prefs.v1", JSON.stringify({ tempUnit: "C", volume: 0.5 }));
    resetPrefsCache();
    const p = getPrefs();
    expect(p.tempUnit).toBe("C");
    expect(p.volume).toBe(0.5);
    expect(p.uiScale).toBe(1);
    expect(p.autosaveSec).toBe(8);
    expect(p.timeFormat).toBe("12h");
  });

  it("clamps wild patches", () => {
    const p = setPrefs({ uiScale: 99, cameraSensitivity: -3, autosaveSec: 1, renderScale: 2 });
    expect(p.uiScale).toBe(1.2);
    expect(p.cameraSensitivity).toBe(0.4);
    expect(p.autosaveSec).toBe(4);
    expect(p.renderScale).toBe(1);
  });

  it("formats the clock in both time formats", () => {
    expect(fmtClockPref(14 * 60 + 31, "12h")).toBe("2:31 PM");
    expect(fmtClockPref(14 * 60 + 31, "24h")).toBe("14:31");
    expect(fmtClockPref(5, "12h")).toBe("12:05 AM");
    expect(fmtClockPref(12 * 60, "12h")).toBe("12:00 PM");
  });
});

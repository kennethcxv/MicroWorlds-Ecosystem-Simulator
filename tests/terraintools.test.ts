/**
 * TERRAIN TOOL REGISTRY — the data behind the Terrain editor's 4×2 tool grid
 * (Raise · Lower · Smooth · Flatten · Erase · Paint · Wet · Dry — every tool
 * a full-size card). Sculpt tools map to the pure HabitatTerrain brush ops;
 * Erase is the reset brush (flatten heights + dry wetness); Paint physically
 * paints the armed material into the per-cell material map. Each tool carries
 * a husbandry TIP for the context card.
 */
import { describe, expect, it } from "vitest";
import { TERRAIN_TOOLS, toolById } from "../src/data/terrainTools";

describe("terrain tool registry", () => {
  it("ships eight full-size tools in the 4×2 grid order", () => {
    expect(TERRAIN_TOOLS.map((t) => t.id)).toEqual([
      "raise",
      "lower",
      "smooth",
      "flatten",
      "erase",
      "paint",
      "water",
      "dry",
    ]);
  });

  it("select is gone — no dead inspect tool in the grid", () => {
    expect(toolById("select")).toBeNull();
  });

  it("every tool is complete: label, icon, tint, description, note, TIP, glyph", () => {
    for (const t of TERRAIN_TOOLS) {
      expect(t.label.length, t.id).toBeGreaterThan(2);
      expect(t.icon.length, t.id).toBeGreaterThan(1);
      expect(t.tint, t.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.description.length, t.id).toBeGreaterThan(8);
      expect(t.note.length, t.id).toBeGreaterThan(12);
      expect(t.tip.length, t.id).toBeGreaterThan(20);
      expect(t.cursorGlyph.length, t.id).toBeGreaterThan(0);
    }
  });

  it("sculpt tools carry valid brush ops; erase is the flatten+dry reset brush", () => {
    expect(toolById("raise")!.ops).toEqual(["raise"]);
    expect(toolById("lower")!.ops).toEqual(["lower"]);
    expect(toolById("smooth")!.ops).toEqual(["smooth"]);
    expect(toolById("flatten")!.ops).toEqual(["flatten"]);
    expect(toolById("erase")!.ops).toEqual(["flatten", "dry"]);
    expect(toolById("water")!.ops).toEqual(["water"]);
    expect(toolById("dry")!.ops).toEqual(["dry"]);
    for (const t of TERRAIN_TOOLS) {
      if (t.action === "sculpt") expect(t.ops?.length, t.id).toBeGreaterThan(0);
      else expect(t.ops, t.id).toBeUndefined();
    }
  });

  it("paint physically paints the armed material; the rest are sculpt brushes", () => {
    expect(toolById("paint")!.action).toBe("paintMaterial");
    for (const t of TERRAIN_TOOLS) {
      if (t.id !== "paint") expect(t.action, t.id).toBe("sculpt");
    }
  });

  it("toolById returns null for unknown ids", () => {
    expect(toolById("bulldozer")).toBeNull();
  });
});

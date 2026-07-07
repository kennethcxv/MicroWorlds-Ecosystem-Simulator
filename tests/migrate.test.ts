/**
 * SAVE MIGRATION — old/hand-edited saves are healed into the current enclosure:
 *   - stale persisted dimensions are replaced by the current catalog numbers
 *     (nearest size preset), so one authored record rules the shell,
 *   - placed objects / zones / equipment that fall outside the new bounds are
 *     clamped back inside safely (never deleted, never left out-of-bounds),
 *   - valid content is untouched, and a second migration is a no-op.
 */
import { describe, expect, it } from "vitest";
import { migrateLayout } from "../src/habitats/HabitatMigrate";
import { enclosureSpec } from "../src/habitats/EnclosureSpec";
import { LIZARD_SIZE_OPTIONS } from "../src/habitats/HabitatBuilder";
import { makeLizardHabitatLayout } from "../src/habitats/lizard/LizardHabitatData";
import type { HabitatLayout } from "../src/habitats/HabitatTypes";

const freshLayout = (): HabitatLayout => makeLizardHabitatLayout();

describe("dimension normalization", () => {
  it("replaces stale persisted dimensions with the current catalog record", () => {
    const layout = freshLayout();
    layout.dimensions = { width: 3.02, depth: 1.88, height: 1.0, glass: 0.02, substrateTop: 0.05 };
    const report = migrateLayout(layout, LIZARD_SIZE_OPTIONS);
    expect(report.dimensionsChanged).toBe(true);
    expect(layout.dimensions).toEqual(LIZARD_SIZE_OPTIONS[1].dimensions);
  });

  it("leaves matching dimensions untouched", () => {
    const layout = freshLayout();
    const report = migrateLayout(layout, LIZARD_SIZE_OPTIONS);
    expect(report.dimensionsChanged).toBe(false);
  });
});

describe("object clamping", () => {
  it("clamps an out-of-bounds floor object into the placement rectangle, on the sand", () => {
    const layout = freshLayout();
    const rogue = layout.objects[0];
    rogue.position = [9.5, 0.4, -7.2];
    const report = migrateLayout(layout, LIZARD_SIZE_OPTIONS);
    const spec = enclosureSpec(layout.dimensions);
    expect(report.movedObjects).toContain(rogue.id);
    expect(rogue.position[0]).toBeLessThanOrEqual(spec.placement.maxX);
    expect(rogue.position[0]).toBeGreaterThanOrEqual(spec.placement.minX);
    expect(rogue.position[2]).toBeLessThanOrEqual(spec.placement.maxZ);
    expect(rogue.position[2]).toBeGreaterThanOrEqual(spec.placement.minZ);
    expect(rogue.position[1]).toBeCloseTo(spec.substrateTop, 6);
  });

  it("does not move objects that are already inside", () => {
    const layout = freshLayout();
    const before = layout.objects.map((o) => [...o.position]);
    const report = migrateLayout(layout, LIZARD_SIZE_OPTIONS);
    expect(report.movedObjects).toEqual([]);
    layout.objects.forEach((o, i) => expect(o.position).toEqual(before[i]));
  });

  it("keeps a hanging object's height but clamps it under the top band", () => {
    const layout = freshLayout();
    const vine = layout.objects[0];
    vine.placement = "hanging";
    vine.position = [0.2, 4.5, 0.1];
    migrateLayout(layout, LIZARD_SIZE_OPTIONS);
    const spec = enclosureSpec(layout.dimensions);
    expect(vine.position[1]).toBeLessThanOrEqual(spec.interior.topY - 0.05);
    expect(vine.position[1]).toBeGreaterThanOrEqual(spec.substrateTop);

    const low = layout.objects[1];
    low.placement = "elevated";
    low.position = [0.4, 0.4, -0.2];
    const report2 = migrateLayout(layout, LIZARD_SIZE_OPTIONS);
    expect(low.position[1]).toBeCloseTo(0.4, 6);
    expect(report2.movedObjects).not.toContain(low.id);
  });
});

describe("zones + equipment", () => {
  it("clamps zone centres into the walk rectangle", () => {
    const layout = freshLayout();
    layout.zones[0].center = [40, 0.08, -40];
    const report = migrateLayout(layout, LIZARD_SIZE_OPTIONS);
    const spec = enclosureSpec(layout.dimensions);
    expect(report.clampedZones).toContain(layout.zones[0].id);
    expect(layout.zones[0].center[0]).toBeLessThanOrEqual(spec.walk.maxX);
    expect(layout.zones[0].center[2]).toBeGreaterThanOrEqual(spec.walk.minZ);
  });

  it("clamps equipment into the enclosure box (up to the lamp mount)", () => {
    const layout = freshLayout();
    const lamp = layout.equipment[0];
    lamp.position = [-12, 9, 0];
    const report = migrateLayout(layout, LIZARD_SIZE_OPTIONS);
    const spec = enclosureSpec(layout.dimensions);
    expect(report.clampedEquipment).toContain(lamp.id);
    expect(lamp.position[0]).toBeGreaterThanOrEqual(spec.interior.minX);
    expect(lamp.position[1]).toBeLessThanOrEqual(spec.lampMountY);
  });
});

describe("idempotence", () => {
  it("a second migration reports nothing to do", () => {
    const layout = freshLayout();
    layout.objects[0].position = [9.5, 0.4, -7.2];
    layout.dimensions = { ...layout.dimensions, glass: 0.01 };
    migrateLayout(layout, LIZARD_SIZE_OPTIONS);
    const second = migrateLayout(layout, LIZARD_SIZE_OPTIONS);
    expect(second.dimensionsChanged).toBe(false);
    expect(second.movedObjects).toEqual([]);
    expect(second.clampedZones).toEqual([]);
    expect(second.clampedEquipment).toEqual([]);
  });
});

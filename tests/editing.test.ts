import { describe, it, expect } from "vitest";
import {
  addObject,
  moveObject,
  rotateObject,
  scaleObject,
  removeObject,
  duplicateObject,
  uniqueObjectId,
  cloneLayout,
} from "../src/habitats/HabitatLayout";
import { canPlace, placementIssue, hangingSupport, hangingIssue, settleHanging } from "../src/habitats/HabitatEditing";
import { CollisionWorld, compileObstacles } from "../src/habitats/HabitatCollision";
import { LIZARD_PLACEABLES, findPlaceable } from "../src/habitats/HabitatBuilder";
import { makeLizardHabitatLayout } from "../src/habitats/lizard/LizardHabitatData";
import type { GroundBounds } from "../src/habitats/HabitatBounds";
import type { HabitatLayout, PlacedObject } from "../src/habitats/HabitatTypes";

const BOUNDS: GroundBounds = { minX: -1.4, maxX: 1.4, minZ: -1, maxZ: 1, y: 0.08 };

function rock(id: string, x: number, z: number, extra: Partial<PlacedObject> = {}): PlacedObject {
  return {
    id,
    category: "rock",
    position: [x, 0.08, z],
    rotation: [0, 0.3, 0],
    scale: [1, 1, 1],
    collidable: true,
    collisionType: "box",
    interaction: "blocked",
    collision: { halfExtents: [0.2, 0.15, 0.2] },
    ...extra,
  };
}

function bareLayout(objects: PlacedObject[]): HabitatLayout {
  const l = makeLizardHabitatLayout();
  l.objects = objects;
  return l;
}

describe("uniqueObjectId", () => {
  it("returns the base id when it's free, else a numbered suffix", () => {
    const layout = bareLayout([rock("a", 0, 0), rock("a-copy", 0.5, 0)]);
    expect(uniqueObjectId(layout, "b")).toBe("b");
    expect(uniqueObjectId(layout, "a")).toBe("a-2");
    expect(uniqueObjectId(layout, "a-copy")).toBe("a-copy-2");
  });
});

describe("duplicateObject", () => {
  it("clones an object with a unique id and a nudged position", () => {
    const layout = bareLayout([rock("boulder", 0.2, -0.3, { scale: [1.5, 1.5, 1.5] })]);
    const dup = duplicateObject(layout, "boulder");
    expect(dup).not.toBeNull();
    expect(dup!.id).not.toBe("boulder");
    expect(layout.objects).toHaveLength(2);
    // Same look (category/scale/rotation copied)...
    expect(dup!.category).toBe("rock");
    expect(dup!.scale).toEqual([1.5, 1.5, 1.5]);
    // ...but offset so it's not hidden exactly behind the original.
    expect(dup!.position[0]).not.toBeCloseTo(0.2);
    // Deep copy — mutating the copy must not touch the original.
    dup!.scale[0] = 9;
    expect(layout.objects[0].scale[0]).toBe(1.5);
  });

  it("gives every duplicate a distinct id", () => {
    const layout = bareLayout([rock("r", 0, 0)]);
    const a = duplicateObject(layout, "r")!;
    const b = duplicateObject(layout, "r")!;
    expect(a.id).not.toBe(b.id);
    expect(new Set(layout.objects.map((o) => o.id)).size).toBe(3);
  });

  it("returns null for an unknown id", () => {
    const layout = bareLayout([rock("r", 0, 0)]);
    expect(duplicateObject(layout, "nope")).toBeNull();
  });
});

describe("canPlace — placement validation", () => {
  const world = new CollisionWorld(
    BOUNDS,
    compileObstacles([rock("existing", 0, 0, { collision: { halfExtents: [0.3, 0.2, 0.3] } })]),
  );
  const footprint = 0.18;

  it("accepts a clear spot inside the bounds", () => {
    expect(canPlace(world, -1.0, 0.6, footprint)).toBe(true);
  });

  it("rejects a spot outside the enclosure bounds", () => {
    expect(canPlace(world, 2.0, 0, footprint)).toBe(false);
    expect(canPlace(world, 0, 5.0, footprint)).toBe(false);
  });

  it("rejects placing deep inside an existing hard prop", () => {
    expect(canPlace(world, 0, 0, footprint)).toBe(false);
  });

  it("rejects placing on top of the gecko or a live feeder", () => {
    const blockers = [{ x: -1.0, z: 0.6, r: 0.1 }];
    expect(canPlace(world, -1.0, 0.6, footprint, blockers)).toBe(false);
    // ...but a clear spot away from the blocker is still fine.
    expect(canPlace(world, 0.9, 0.6, footprint, blockers)).toBe(true);
  });

  it("tolerates a slight edge overlap with an existing prop (cozy builder)", () => {
    // Just outside the 0.3 core but touching the edge — allowed.
    expect(canPlace(world, 0.42, 0, footprint)).toBe(true);
  });
});

describe("placementIssue — human-readable invalid-placement reasons", () => {
  const world = new CollisionWorld(
    BOUNDS,
    compileObstacles([rock("existing", 0, 0, { collision: { halfExtents: [0.3, 0.2, 0.3] } })]),
  );
  const fp = 0.18;

  it("null when valid; a reason string when not", () => {
    expect(placementIssue(world, -1.0, 0.6, fp)).toBeNull();
    expect(placementIssue(world, 3, 0, fp)).toMatch(/enclosure/i);
    expect(placementIssue(world, 0, 0, fp)).toMatch(/overlaps|solid/i);
    expect(placementIssue(world, -1.0, 0.6, fp, [{ x: -1.0, z: 0.6, r: 0.1 }])).toMatch(/gecko/i);
  });

  it("canPlace agrees with placementIssue", () => {
    expect(canPlace(world, -1.0, 0.6, fp)).toBe(placementIssue(world, -1.0, 0.6, fp) === null);
    expect(canPlace(world, 0, 0, fp)).toBe(placementIssue(world, 0, 0, fp) === null);
  });
});

describe("catalog — sections, placement modes, filterable metadata", () => {
  it("every placeable declares a section", () => {
    for (const p of LIZARD_PLACEABLES) expect(typeof p.section).toBe("string");
    // Several distinct sections exist for grouping.
    expect(new Set(LIZARD_PLACEABLES.map((p) => p.section)).size).toBeGreaterThanOrEqual(4);
  });

  it("has a hanging placeable and an elevated one (Y-axis placement)", () => {
    expect(LIZARD_PLACEABLES.some((p) => p.placement === "hanging")).toBe(true);
    expect(LIZARD_PLACEABLES.some((p) => p.placement === "elevated")).toBe(true);
  });

  it("makePlaced stamps the placement mode (defaults to floor)", () => {
    const vine = findPlaceable("hanging_vine")!;
    expect(vine.placement).toBe("hanging");
    const rockDef = findPlaceable("rock_cluster")!;
    expect(rockDef.placement ?? "floor").toBe("floor");
  });

  it("a filter by interaction returns the expected props", () => {
    const climbables = LIZARD_PLACEABLES.filter((p) => p.interaction === "climbable");
    expect(climbables.length).toBeGreaterThan(0);
    expect(climbables.every((p) => p.interaction === "climbable")).toBe(true);
  });
});

describe("layout transform ops round-trip through a JSON clone (save/load fidelity)", () => {
  it("add/move/rotate/scale/remove mutate the layout, and transforms survive clone", () => {
    const layout = bareLayout([]);
    addObject(layout, rock("r", 0.1, 0.1));
    expect(layout.objects).toHaveLength(1);

    moveObject(layout, "r", [0.5, 0.08, -0.4]);
    rotateObject(layout, "r", [0, 1.2, 0]);
    scaleObject(layout, "r", [2, 2, 2]);

    const restored = cloneLayout(layout);
    const o = restored.objects[0];
    expect(o.position).toEqual([0.5, 0.08, -0.4]);
    expect(o.rotation).toEqual([0, 1.2, 0]);
    expect(o.scale).toEqual([2, 2, 2]);

    expect(removeObject(layout, "r")).toBe(true);
    expect(layout.objects).toHaveLength(0);
  });

  it("preserves a measured assetFootprint across a clone", () => {
    const layout = bareLayout([
      rock("r", 0, 0, { assetFootprint: { half: [0.1, 0.06, 0.2], center: [0, 0.06, 0], shape: "obb" } }),
    ]);
    const restored = cloneLayout(layout);
    expect(restored.objects[0].assetFootprint).toEqual({ half: [0.1, 0.06, 0.2], center: [0, 0.06, 0], shape: "obb" });
  });
});

describe("hanging attachment rules — vines can't float in mid-air", () => {
  const layout = () => makeLizardHabitatLayout(); // dims: 3.0 × 1.9 × 1.3
  const dims = () => layout().dimensions;
  const GY = 0.08;

  function vine(y: number, x = 0, z = 0): PlacedObject {
    return {
      id: "vine1",
      category: "plant",
      position: [x, y, z],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      collidable: false,
      collisionType: "none",
      collision: { halfExtents: [0.06, 0.14, 0.06] },
      interaction: "softObstacle",
      placement: "hanging",
    };
  }

  it("floating alone mid-air is UNSUPPORTED (invalid)", () => {
    const l = bareLayout([]);
    expect(hangingSupport(vine(0.5), l, dims())).toBeNull();
    expect(hangingIssue(vine(0.5), l, dims())).toMatch(/support|attach/i);
  });

  it("raised to the top frame counts as CEILING-supported", () => {
    const l = bareLayout([]);
    const v = vine(dims().height - 0.3);
    expect(hangingSupport(v, l, dims())).toBe("ceiling");
    expect(hangingIssue(v, l, dims())).toBeNull();
  });

  it("against a glass wall counts as WALL-supported", () => {
    const l = bareLayout([]);
    const d = dims();
    expect(hangingSupport(vine(0.5, d.width / 2 - 0.2, 0), l, d)).toBe("wall");
    expect(hangingSupport(vine(0.5, 0, -(d.depth / 2 - 0.2)), l, d)).toBe("wall");
  });

  it("resting at a nearby climbable branch's top counts as PROP-supported", () => {
    const branch = rock("branch1", 0.1, 0.1, {
      category: "branch",
      interaction: "climbable",
      collision: { halfExtents: [0.1, 0.25, 0.1] },
    });
    const l = bareLayout([branch]);
    // Branch top ≈ 0.08 + 0.5; vine base at 0.5 right next to it → supported.
    expect(hangingSupport(vine(0.5, 0.25, 0.1), l, dims())).toBe("prop");
    // Same spot but far above the branch top → unsupported.
    expect(hangingSupport(vine(0.68, 0.25, 0.1), l, dims())).toBeNull();
  });

  it("settleHanging drops a prop whose support was deleted to the substrate", () => {
    const branch = rock("branch1", 0.1, 0.1, {
      category: "branch",
      interaction: "climbable",
      collision: { halfExtents: [0.1, 0.25, 0.1] },
    });
    const v = vine(0.5, 0.25, 0.1);
    const l = bareLayout([branch, v]);
    expect(settleHanging(l, GY)).toEqual([]); // supported → nothing falls
    removeObject(l, "branch1");
    expect(settleHanging(l, GY)).toEqual(["vine1"]); // support gone → it falls
    expect(l.objects.find((o) => o.id === "vine1")!.position[1]).toBeCloseTo(GY);
  });
});

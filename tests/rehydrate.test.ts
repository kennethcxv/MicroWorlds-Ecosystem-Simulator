import { describe, it, expect } from "vitest";
import {
  findPlaceable,
  makePlaced,
  rehydrateLayoutAssets,
  LIZARD_DECOR_DIR,
} from "../src/habitats/HabitatBuilder";
import type { HabitatLayout } from "../src/habitats/HabitatTypes";

const wrap = (objects: ReturnType<typeof makePlaced>[]): HabitatLayout =>
  ({ objects } as unknown as HabitatLayout);

describe("makePlaced stamps a defId (the catalog identity for self-healing)", () => {
  it("records which placeable an object came from", () => {
    const o = makePlaced(findPlaceable("hide_cave")!, "h1", [0, 0, 0]);
    expect(o.defId).toBe("hide_cave");
    expect(o.asset).toBe(LIZARD_DECOR_DIR + "rock_cave_hide_01.glb");
  });
});

describe("rehydrateLayoutAssets — self-heals a stale saved layout", () => {
  it("restores a stripped asset path from the object's defId", () => {
    const o = makePlaced(findPlaceable("rock_cluster")!, "r1", [0, 0, 0]);
    // Simulate a pre-asset saved blob: asset gone, a stale footprint left behind.
    o.asset = undefined;
    o.assetFootprint = { half: [1, 1, 1], center: [0, 0, 0], shape: "obb" };
    rehydrateLayoutAssets(wrap([o]));
    expect(o.asset).toBe(LIZARD_DECOR_DIR + "desert_rock_cluster_01.glb");
    // Persisted footprint dropped → collision is re-measured from the live GLB.
    expect(o.assetFootprint).toBeUndefined();
  });

  it("preserves the player's edits (position / scale / interaction)", () => {
    const o = makePlaced(findPlaceable("rock_cluster")!, "r1", [0.5, 0, 0.5], 1.2, [2, 1, 2]);
    o.interaction = "blocked"; // player changed it in the editor
    rehydrateLayoutAssets(wrap([o]));
    expect(o.position).toEqual([0.5, 0, 0.5]);
    expect(o.scale).toEqual([2, 1, 2]);
    expect(o.interaction).toBe("blocked");
    expect(o.rotation).toEqual([0, 1.2, 0]);
  });

  it("leaves an asset-less placeable (e.g. a plain plant) without an asset", () => {
    const o = makePlaced(findPlaceable("climb_branch")!, "b1", [0, 0, 0]);
    expect(o.asset).toBeUndefined();
    rehydrateLayoutAssets(wrap([o]));
    expect(o.asset).toBeUndefined();
  });
});

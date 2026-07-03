/**
 * SUBSTRATE SELECTION — the pure preview/apply/revert state behind the Terrain
 * drawer's Materials row. Clicking a swatch PREVIEWS it live on the sand;
 * Apply commits it to the layout; Revert (or leaving the drawer) restores the
 * applied substrate. Locked swatches can be inspected but never previewed.
 * No DOM/Three imports — the drawer + scene just obey this state.
 */
import { describe, expect, it } from "vitest";
import { SubstrateSelection } from "../src/ui/substrateSelection";

describe("SubstrateSelection", () => {
  it("starts clean on the applied substrate", () => {
    const s = new SubstrateSelection("sahara_sand");
    expect(s.appliedId).toBe("sahara_sand");
    expect(s.previewId).toBeNull();
    expect(s.inspectedId).toBe("sahara_sand");
    expect(s.dirty).toBe(false);
  });

  it("selecting an unlocked terrain previews it", () => {
    const s = new SubstrateSelection("sahara_sand");
    expect(s.select("desert_clay", true)).toBe("preview");
    expect(s.previewId).toBe("desert_clay");
    expect(s.inspectedId).toBe("desert_clay");
    expect(s.dirty).toBe(true);
    expect(s.appliedId).toBe("sahara_sand"); // nothing committed yet
  });

  it("selecting the applied terrain clears any preview", () => {
    const s = new SubstrateSelection("sahara_sand");
    s.select("desert_clay", true);
    expect(s.select("sahara_sand", true)).toBe("applied");
    expect(s.previewId).toBeNull();
    expect(s.dirty).toBe(false);
    expect(s.inspectedId).toBe("sahara_sand");
  });

  it("selecting a locked terrain inspects it but reverts the world preview", () => {
    const s = new SubstrateSelection("sahara_sand");
    s.select("desert_clay", true);
    expect(s.select("mossy_soil", false)).toBe("locked");
    expect(s.inspectedId).toBe("mossy_soil"); // info card shows the locked one
    expect(s.previewId).toBeNull(); // the sand shows the applied substrate again
    expect(s.dirty).toBe(false);
  });

  it("apply commits the preview and becomes clean", () => {
    const s = new SubstrateSelection("sahara_sand");
    s.select("desert_clay", true);
    expect(s.apply()).toBe("desert_clay");
    expect(s.appliedId).toBe("desert_clay");
    expect(s.previewId).toBeNull();
    expect(s.dirty).toBe(false);
    expect(s.inspectedId).toBe("desert_clay");
  });

  it("apply with nothing previewed is a no-op", () => {
    const s = new SubstrateSelection("sahara_sand");
    expect(s.apply()).toBeNull();
    expect(s.appliedId).toBe("sahara_sand");
  });

  it("revert drops the preview and re-inspects the applied substrate", () => {
    const s = new SubstrateSelection("sahara_sand");
    s.select("rocky_mix", true);
    expect(s.revert()).toBe("sahara_sand");
    expect(s.previewId).toBeNull();
    expect(s.inspectedId).toBe("sahara_sand");
    expect(s.dirty).toBe(false);
  });

  it("revert with no preview still resets inspection (locked card was open)", () => {
    const s = new SubstrateSelection("sahara_sand");
    s.select("mossy_soil", false);
    expect(s.revert()).toBe("sahara_sand");
    expect(s.inspectedId).toBe("sahara_sand");
  });

  it("previewing a second terrain replaces the first preview", () => {
    const s = new SubstrateSelection("sahara_sand");
    s.select("desert_clay", true);
    s.select("dune_ridge", true);
    expect(s.previewId).toBe("dune_ridge");
    expect(s.apply()).toBe("dune_ridge");
  });
});

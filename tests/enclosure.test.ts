/**
 * ENCLOSURE SPEC — the single source of truth for the vivarium shell. One pure
 * derivation turns the authored HabitatDimensions into every number the shell,
 * camera, placement, navigation, feeding, terrain brush and debug overlays
 * share, so there are no conflicting hard-coded tank sizes:
 *   - interior = inside the glass; walk/placement bounds = ONE rectangle,
 *   - the base tray lip rises just past the substrate line (hides the bed side),
 *   - bedrock (deepest dig) matches the terrain module's own limit,
 *   - the sand plane always extends past the walk bounds (feet stay on sand),
 *   - camera target is centred on the tank; the lamp mounts on the top band.
 */
import { describe, expect, it } from "vitest";
import { WALK_MARGIN, enclosureSpec } from "../src/habitats/EnclosureSpec";
import { sculptLimits } from "../src/habitats/HabitatTerrain";
import { LIZARD_SIZE_OPTIONS } from "../src/habitats/HabitatBuilder";
import type { HabitatDimensions } from "../src/habitats/HabitatTypes";

/** The live 40-gallon lizard enclosure's dimensions. */
const DIMS: HabitatDimensions = { width: 3.0, depth: 1.9, height: 1.3, glass: 0.05, substrateTop: 0.08 };

describe("interior bounds", () => {
  it("insets the glass on all four sides and spans floor to the top band", () => {
    const s = enclosureSpec(DIMS);
    expect(s.interior.minX).toBeCloseTo(-1.5 + 0.05, 6);
    expect(s.interior.maxX).toBeCloseTo(1.5 - 0.05, 6);
    expect(s.interior.minZ).toBeCloseTo(-0.95 + 0.05, 6);
    expect(s.interior.maxZ).toBeCloseTo(0.95 - 0.05, 6);
    expect(s.interior.floorY).toBe(0);
    expect(s.interior.topY).toBeCloseTo(1.3, 6);
    expect(s.interior.width).toBeCloseTo(2.9, 6);
    expect(s.interior.depth).toBeCloseTo(1.8, 6);
  });

  it("passes the substrate surface height straight through", () => {
    expect(enclosureSpec(DIMS).substrateTop).toBeCloseTo(0.08, 6);
  });
});

describe("walk + placement bounds", () => {
  it("keeps the walk rectangle strictly inside the interior by the walk margin", () => {
    const s = enclosureSpec(DIMS);
    expect(s.walk.minX).toBeCloseTo(s.interior.minX + WALK_MARGIN, 6);
    expect(s.walk.maxX).toBeCloseTo(s.interior.maxX - WALK_MARGIN, 6);
    expect(s.walk.minZ).toBeCloseTo(s.interior.minZ + WALK_MARGIN, 6);
    expect(s.walk.maxZ).toBeCloseTo(s.interior.maxZ - WALK_MARGIN, 6);
    expect(s.walk.y).toBeCloseTo(DIMS.substrateTop, 6);
  });

  it("uses ONE rectangle for navigation and decor placement (no conflicting bounds)", () => {
    const s = enclosureSpec(DIMS);
    expect(s.placement).toEqual(s.walk);
  });

  it("extends the sand plane past the walk bounds so feet always land on sand", () => {
    const s = enclosureSpec(DIMS);
    expect(s.sandInset).toBeGreaterThan(0);
    expect(s.sandInset).toBeLessThan(WALK_MARGIN);
  });

  it("keeps the terrain brush apron thinner than the walk half-extent", () => {
    const s = enclosureSpec(DIMS);
    expect(s.glassApron).toBeGreaterThan(0);
    expect(s.glassApron).toBeLessThan((s.walk.maxX - s.walk.minX) / 2);
  });
});

describe("frame + tray", () => {
  it("sizes slim posts and a slim top band", () => {
    const f = enclosureSpec(DIMS).frame;
    expect(f.post).toBeGreaterThan(0.02);
    expect(f.post).toBeLessThan(0.1);
    expect(f.topBand).toBeGreaterThan(0.04);
    expect(f.topBand).toBeLessThan(0.12);
  });

  it("raises the tray lip just past the substrate line (hides the bed side, not the dunes)", () => {
    const s = enclosureSpec(DIMS);
    expect(s.frame.trayLip).toBeGreaterThan(s.substrateTop);
    expect(s.frame.trayLip).toBeLessThanOrEqual(s.substrateTop + 0.05);
  });

  it("drops the tray skirt below the tank floor", () => {
    const f = enclosureSpec(DIMS).frame;
    expect(f.trayBottomY).toBeLessThan(0);
    expect(f.trayHeight).toBeCloseTo(f.trayLip - f.trayBottomY, 6);
  });
});

describe("bedrock", () => {
  it("matches the terrain module's strong-brush dig limit exactly", () => {
    const s = enclosureSpec(DIMS);
    const expected = DIMS.substrateTop + sculptLimits(DIMS, true).down;
    expect(s.bedrockY).toBeCloseTo(expected, 6);
    expect(s.bedrockY).toBeGreaterThan(0);
    expect(s.bedrockY).toBeLessThan(DIMS.substrateTop);
  });
});

describe("camera + fixtures + stand", () => {
  it("centres the camera target on the tank between the sand and the rim", () => {
    const s = enclosureSpec(DIMS);
    expect(s.cameraTarget[0]).toBeCloseTo(0, 6);
    expect(s.cameraTarget[2]).toBeCloseTo(0, 6);
    expect(s.cameraTarget[1]).toBeGreaterThan(s.substrateTop);
    expect(s.cameraTarget[1]).toBeLessThan(DIMS.height);
  });

  it("puts the camera home in front of the front pane, above the sand", () => {
    const s = enclosureSpec(DIMS);
    expect(s.cameraHome[2]).toBeGreaterThan(DIMS.depth / 2);
    expect(s.cameraHome[1]).toBeGreaterThan(s.substrateTop);
  });

  it("mounts the lamp on top of the rim band", () => {
    const s = enclosureSpec(DIMS);
    expect(s.lampMountY).toBeGreaterThanOrEqual(DIMS.height);
    expect(s.lampMountY).toBeLessThanOrEqual(DIMS.height + s.frame.topBand + 0.01);
  });

  it("sizes a believable stand under the tank", () => {
    const s = enclosureSpec(DIMS);
    expect(s.stand.height).toBeGreaterThanOrEqual(0.6);
    expect(s.stand.height).toBeLessThanOrEqual(1.0);
    expect(s.stand.overhang).toBeGreaterThan(0);
  });
});

describe("every catalog size", () => {
  it("derives a valid spec for all lizard size presets", () => {
    for (const opt of LIZARD_SIZE_OPTIONS) {
      const s = enclosureSpec(opt.dimensions);
      expect(s.interior.width).toBeGreaterThan(0);
      expect(s.interior.depth).toBeGreaterThan(0);
      expect(s.walk.maxX).toBeGreaterThan(s.walk.minX);
      expect(s.walk.maxZ).toBeGreaterThan(s.walk.minZ);
      expect(s.bedrockY).toBeGreaterThan(0);
      expect(s.bedrockY).toBeLessThan(opt.dimensions.substrateTop);
      expect(s.frame.trayLip).toBeGreaterThan(opt.dimensions.substrateTop);
    }
  });
});

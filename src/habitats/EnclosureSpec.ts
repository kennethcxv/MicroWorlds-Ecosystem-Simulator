/**
 * ENCLOSURE SPEC — the single source of truth for the vivarium shell.
 *
 * `enclosureSpec(dims)` derives EVERY shared number of the gecko enclosure from
 * the one authored `HabitatDimensions` record: the interior inside the glass,
 * the ONE walk/placement rectangle used by navigation + collision + decor
 * placement + feeding, the frame/tray/post sizing the renderer builds the shell
 * from, the terrain-brush glass apron, the bedrock (deepest dig) height, the
 * camera target/home, the stand under the tank, and the lamp mount. Nothing
 * else may hard-code a tank size — if a system needs an enclosure number it
 * reads it from here (or from the `HabitatDimensions` this derives from).
 *
 * Pure data + math; no Three.js / DOM. The renderer consumes the spec, it never
 * re-derives its own insets.
 */
import type { HabitatDimensions, Vec3 } from "./HabitatTypes";
import type { GroundBounds } from "./HabitatBounds";
import { sculptLimits } from "./HabitatTerrain";

/** Gap between the glass and the animal's walk/placement rectangle. ONE margin —
 *  navigation, decor placement and feeding all share the same rectangle. */
export const WALK_MARGIN = 0.06;

/** How far the sand plane stops short of the interior walls (visual seam). Must
 *  stay under WALK_MARGIN so feet/props always sit on visible sand. */
const SAND_INSET = 0.012;

/** Terrain-brush keep-out strip against the glass (no gap under the panes). */
const GLASS_APRON = 0.07;

/** Frame/trim sizing for the shell (all metres, derived per enclosure size). */
export interface FrameSpec {
  /** Corner post thickness (also the rim bar thickness). */
  post: number;
  /** Top rim band height. */
  topBand: number;
  /** Y the opaque base tray rises to — just past the substrate line, so the
   *  bed's cut side hides behind it while sculpted dunes stay visible. */
  trayLip: number;
  /** Y of the tray's bottom face (below the tank floor — the skirt). */
  trayBottomY: number;
  /** Total tray height (trayLip − trayBottomY). */
  trayHeight: number;
}

/** The usable box inside the glass. */
export interface EnclosureInterior {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Inside floor (tank bottom). */
  floorY: number;
  /** Underside of the top band. */
  topY: number;
  width: number;
  depth: number;
  height: number;
}

export interface StandSpec {
  /** Height of the wooden stand under the tank (tank floor sits at y = 0). */
  height: number;
  /** How far the stand's top slab overhangs the tank footprint per side. */
  overhang: number;
}

export interface EnclosureSpec {
  dims: HabitatDimensions;
  frame: FrameSpec;
  interior: EnclosureInterior;
  /** World Y of the sand surface (= dims.substrateTop). */
  substrateTop: number;
  /** World Y of the deepest diggable point — matches HabitatTerrain's strong-
   *  brush limit, and is where the visual under-floor plane sits. */
  bedrockY: number;
  /** Sand plane inset from the interior walls. */
  sandInset: number;
  /** THE walk/navigation rectangle (animal + collision world). */
  walk: GroundBounds;
  /** Decor/food placement rectangle — same rectangle as `walk` by design. */
  placement: GroundBounds;
  /** Terrain-brush keep-out apron against the glass. */
  glassApron: number;
  /** Centre of interest for the viewing camera (tank-centred). */
  cameraTarget: Vec3;
  /** Suggested camera home (front three-quarter view). */
  cameraHome: Vec3;
  stand: StandSpec;
  /** Y a clamp-lamp hood sits at (on the top band). */
  lampMountY: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Derive the full shell spec from the authored dimensions. Pure + total: any
 *  positive dims produce a usable spec. */
export function enclosureSpec(d: HabitatDimensions): EnclosureSpec {
  const interior: EnclosureInterior = {
    minX: -d.width / 2 + d.glass,
    maxX: d.width / 2 - d.glass,
    minZ: -d.depth / 2 + d.glass,
    maxZ: d.depth / 2 - d.glass,
    floorY: 0,
    topY: d.height,
    width: d.width - d.glass * 2,
    depth: d.depth - d.glass * 2,
    height: d.height,
  };

  const walk: GroundBounds = {
    minX: interior.minX + WALK_MARGIN,
    maxX: interior.maxX - WALK_MARGIN,
    minZ: interior.minZ + WALK_MARGIN,
    maxZ: interior.maxZ - WALK_MARGIN,
    y: d.substrateTop,
  };

  const post = clamp(d.width * 0.016, 0.03, 0.06);
  const topBand = clamp(d.height * 0.055, 0.05, 0.09);
  const trayLip = d.substrateTop + 0.022;
  const trayBottomY = -0.055;

  const frame: FrameSpec = {
    post,
    topBand,
    trayLip,
    trayBottomY,
    trayHeight: trayLip - trayBottomY,
  };

  return {
    dims: d,
    frame,
    interior,
    substrateTop: d.substrateTop,
    bedrockY: d.substrateTop + sculptLimits(d, true).down,
    sandInset: SAND_INSET,
    walk,
    placement: { ...walk },
    glassApron: GLASS_APRON,
    cameraTarget: [0, d.substrateTop + (d.height - d.substrateTop) * 0.3, 0],
    cameraHome: [d.width * 0.2, d.height * 1.08, d.depth / 2 + d.width * 1.1],
    stand: { height: clamp(d.height * 0.65, 0.6, 1.0), overhang: 0.05 },
    lampMountY: d.height + topBand,
  };
}

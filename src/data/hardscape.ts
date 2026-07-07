/**
 * Hardscape (driftwood + rock) catalogue. `trim` is the tight alpha box;
 * `widthFrac` is the content width as a fraction of the tank interior width.
 * The renderer derives height from the sprite's real aspect ratio and sinks
 * the base slightly into the substrate so pieces read as "partly buried".
 */
import type { TrimBox } from "./species";

export type HardscapeKind = "wood" | "rock";

export interface Hardscape {
  id: string;
  name: string;
  asset: string; // key into ASSETS.hardscape
  kind: HardscapeKind;
  trim: TrimBox;
  widthFrac: number;
  /** Fraction of the piece's height to bury beneath the substrate line. */
  bury: number;
  tint?: number;
}

export const HARDSCAPE: Record<string, Hardscape> = {
  driftwood_log: {
    id: "driftwood_log",
    name: "Mossy Driftwood Log",
    asset: "driftwood_log",
    kind: "wood",
    trim: { x: 0.0719, y: 0.0812, w: 0.8656, h: 0.8375 },
    widthFrac: 0.5,
    bury: 0.08,
    tint: 0.55,
  },
  driftwood_branch: {
    id: "driftwood_branch",
    name: "Driftwood Branch",
    asset: "driftwood_branch",
    kind: "wood",
    trim: { x: 0.0941, y: 0.2235, w: 0.8706, h: 0.5765 },
    widthFrac: 0.46,
    bury: 0.06,
    tint: 0.55,
  },
  driftwood_diagonal: {
    id: "driftwood_diagonal",
    name: "Diagonal Driftwood",
    asset: "driftwood_diagonal",
    kind: "wood",
    trim: { x: 0.0882, y: 0.1735, w: 0.8206, h: 0.6471 },
    widthFrac: 0.5,
    bury: 0.06,
    tint: 0.55,
  },
  rock_seiryu: {
    id: "rock_seiryu",
    name: "Seiryu Stone",
    asset: "rock_seiryu",
    kind: "rock",
    trim: { x: 0.0419, y: 0.2548, w: 0.9161, h: 0.5097 },
    widthFrac: 0.32,
    bury: 0.14,
    tint: 0.6,
  },
  rock_boulders: {
    id: "rock_boulders",
    name: "Mossy Boulders",
    asset: "rock_boulders",
    kind: "rock",
    trim: { x: 0.0516, y: 0.2258, w: 0.8935, h: 0.5903 },
    widthFrac: 0.3,
    bury: 0.16,
    tint: 0.6,
  },
};

export function hardscapeList(): Hardscape[] {
  return Object.values(HARDSCAPE);
}

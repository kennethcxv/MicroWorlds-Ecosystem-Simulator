/**
 * TERRAIN TOOL REGISTRY — the data behind the Terrain editor's 4×2 tool grid
 * (Raise · Lower · Smooth · Flatten · Erase · Paint · Wet · Dry — every tool
 * a full-size card, Planet-Zoo style).
 *
 *  · sculpt tools apply their `ops` (pure HabitatTerrain brushes) per stroke
 *    sample — ERASE is the reset brush (flatten heights + dry wetness),
 *    FLATTEN levels heights but leaves moisture alone.
 *  · paint = PHYSICALLY brush the armed material into the per-cell substrate
 *    material map (HabitatMaterialMap) — the floor changes where you stroke.
 *  · every tool carries a husbandry TIP for the context card.
 *
 * Pure data — no DOM/Three imports (unit-tested in tests/terraintools.test.ts).
 */

export type TerrainToolAction = "paintMaterial" | "sculpt";

/** Pure HabitatTerrain brush operations a sculpt tool applies per sample. */
export type TerrainBrushOp = "raise" | "lower" | "smooth" | "flatten" | "water" | "dry";

/** Glyph drawn in the brush cursor's green centre badge. */
export type CursorGlyph = "box" | "brush" | "up" | "down" | "wave" | "flat" | "cross" | "drop" | "sun";

export interface TerrainToolDef {
  id: string;
  label: string;
  /** gw icon name. */
  icon: string;
  tint: string;
  /** Tooltip. */
  description: string;
  /** Footer guidance line while the tool is active. */
  note: string;
  /** Husbandry flavour for the context card's tip strip. */
  tip: string;
  action: TerrainToolAction;
  /** Brush ops per stroke sample (sculpt tools only). */
  ops?: TerrainBrushOp[];
  cursorGlyph: CursorGlyph;
}

export const TERRAIN_TOOLS: TerrainToolDef[] = [
  {
    id: "raise",
    label: "Raise",
    icon: "raise",
    tint: "#8ce25a",
    description: "Pile the sand up",
    note: "Drag over the sand to pile it into dunes.",
    tip: "Leopard geckos patrol dune ridges at dusk — a varied skyline is free enrichment.",
    action: "sculpt",
    ops: ["raise"],
    cursorGlyph: "up",
  },
  {
    id: "lower",
    label: "Lower",
    icon: "lower",
    tint: "#f0b64b",
    description: "Dig a depression",
    note: "Drag to dig — bedrock stops you ~1 cm above the glass.",
    tip: "Shallow hollows trap morning warmth — dig one on the cool side as a snug spot.",
    action: "sculpt",
    ops: ["lower"],
    cursorGlyph: "down",
  },
  {
    id: "smooth",
    label: "Smooth",
    icon: "smooth",
    tint: "#7fd8d4",
    description: "Relax bumps",
    note: "Drag across bumps to relax them.",
    tip: "Smooth runs become gecko highways — keep one easy route between the hides.",
    action: "sculpt",
    ops: ["smooth"],
    cursorGlyph: "wave",
  },
  {
    id: "flatten",
    label: "Flatten",
    icon: "flatten",
    tint: "#d6c29a",
    description: "Level back to flat",
    note: "Drag to press the sand back to level (moisture stays).",
    tip: "A level pad keeps dishes steady — no more crickets escaping a tilted bowl.",
    action: "sculpt",
    ops: ["flatten"],
    cursorGlyph: "flat",
  },
  {
    id: "erase",
    label: "Erase",
    icon: "erase",
    tint: "#ef9a86",
    description: "Reset terrain edits",
    note: "Drag to erase edits — heights flatten AND damp patches dry out.",
    tip: "The factory-reset brush: level ground and bone-dry sand in one pass.",
    action: "sculpt",
    ops: ["flatten", "dry"],
    cursorGlyph: "cross",
  },
  {
    id: "paint",
    label: "Paint",
    icon: "paint",
    tint: "#e8b46a",
    description: "Brush the armed material onto the floor",
    note: "Pick a material below, then drag — it lays down exactly where you stroke.",
    tip: "Mix substrates like a zoo exhibit: clay near the lamp holds heat, sand for digging.",
    action: "paintMaterial",
    cursorGlyph: "brush",
  },
  {
    id: "water",
    label: "Wet",
    icon: "drop",
    tint: "#57b8ff",
    description: "Paint a damp patch",
    note: "Paint damp patches — they raise humidity while they last.",
    tip: "A damp patch tucked by a hide becomes a humid retreat — perfect for shedding.",
    action: "sculpt",
    ops: ["water"],
    cursorGlyph: "drop",
  },
  {
    id: "dry",
    label: "Dry",
    icon: "sun",
    tint: "#f0b64b",
    description: "Dry a wet patch",
    note: "Drag over a damp patch to dry it out.",
    tip: "Desert species hate soggy feet — keep the open floor dry, the retreats damp.",
    action: "sculpt",
    ops: ["dry"],
    cursorGlyph: "sun",
  },
];

export function toolById(id: string): TerrainToolDef | null {
  return TERRAIN_TOOLS.find((t) => t.id === id) ?? null;
}

/**
 * ECO-CENTER LODGE — the main menu's data layer (pure, no DOM).
 *
 * The home hub renders a physical research lodge; this file is the single
 * editable registry behind it: the seven labeled room sections (what they are,
 * what they open), the five quick-nav doors, the Current Habitats rows, the
 * honest restoration state, and the greeting/flavor copy. Add a future room by
 * adding a section here — the hub builds chips and wiring from this list.
 *
 * Design source: Designs/Main_Menu/ (7 reference boards, synthesized).
 */
import type { GwIconName } from "../ui/gwIcons";
import { HABITAT_CARDS, type HabitatPageId } from "./habitats";

// ── Room sections (the labeled hotspots pinned to the lodge scene) ─────────

/** What a section does when clicked. `locked` opens the restoration modal. */
export type EcoSectionAction =
  | { kind: "habitat"; habitat: HabitatPageId }
  | { kind: "screen"; screen: "shop" | "inventory" | "guide" | "album" | "settings" | "habitats" }
  | { kind: "locked" };

export interface EcoSectionDef {
  id: string;
  /** Chip title, e.g. "Vivarium Wing". */
  label: string;
  /** Chip subtitle, e.g. "Desert Leopard Gecko". */
  subtitle: string;
  icon: GwIconName;
  action: EcoSectionAction;
  /** One honest sentence — tooltips + the locked-wing modal. */
  desc: string;
}

/** Scene order, left → right along the lodge wall. */
export const ECO_SECTIONS: readonly EcoSectionDef[] = [
  {
    id: "vivarium-wing",
    label: "Vivarium Wing",
    subtitle: "Desert Leopard Gecko",
    icon: "gecko",
    action: { kind: "habitat", habitat: "lizard" },
    desc: "The warm desert vivarium — feed, clean, sculpt and decorate around one leopard gecko.",
  },
  {
    id: "aquarium-wall",
    label: "Aquarium Wall",
    subtitle: "Planted Freshwater",
    icon: "fish",
    action: { kind: "habitat", habitat: "fish" },
    desc: "The planted community aquarium — a real nitrogen cycle under the glass.",
  },
  {
    id: "rainforest-room",
    label: "Rainforest Room",
    subtitle: "Red-Eyed Tree Frog",
    icon: "frog",
    action: { kind: "habitat", habitat: "frog" },
    desc: "The humid paludarium — mist the jungle and keep one small frog thriving.",
  },
  {
    id: "restoration-wing",
    label: "Restoration Wing",
    subtitle: "Cloudridge Wetlands",
    icon: "lock",
    action: { kind: "locked" },
    desc: "The next room of the eco-center is still under restoration — it opens in a future update.",
  },
  {
    id: "care-library",
    label: "Care Library",
    subtitle: "Research & Notes",
    icon: "book",
    action: { kind: "screen", screen: "guide" },
    desc: "Field guides and husbandry research — everything the Care Guide knows.",
  },
  {
    id: "supply-corner",
    label: "Supply Corner",
    subtitle: "Substrate, Decor & Tools",
    icon: "cart",
    action: { kind: "screen", screen: "shop" },
    desc: "The stocked shelves of the Supply Shop — feeders, decor and bundles.",
  },
  {
    id: "photo-wall",
    label: "Photo Wall",
    subtitle: "Captured Moments",
    icon: "camera",
    action: { kind: "screen", screen: "album" },
    desc: "Your own captures, pinned to the lodge wall — opens the Photo Album.",
  },
];

export function ecoSectionById(id: string): EcoSectionDef | undefined {
  return ECO_SECTIONS.find((s) => s.id === id);
}

// ── Quick navigation (the bottom dock) ──────────────────────────────────────

export interface QuickNavDef {
  id: "shop" | "inventory" | "guide" | "album" | "settings";
  label: string;
  sub: string;
  icon: GwIconName;
}

export const QUICK_NAV: readonly QuickNavDef[] = [
  { id: "shop", label: "Supply Shop", sub: "Supplies & decor", icon: "cart" },
  { id: "inventory", label: "Inventory", sub: "Items & materials", icon: "bag" },
  { id: "guide", label: "Care Guide", sub: "Learn & improve care", icon: "book" },
  { id: "album", label: "Photo Album", sub: "Your captured moments", icon: "camera" },
  { id: "settings", label: "Settings", sub: "Game, audio & more", icon: "sliders" },
];

// ── Current Habitats rows (joined to the real habitat cards) ────────────────

export interface HabitatRowDef {
  id: HabitatPageId;
  /** The little stat icon by the care bar (heart / drop / leaf, per refs). */
  careIcon: GwIconName;
  /** What the bar honestly measures for this habitat. */
  careLabel: string;
}

export const HABITAT_ROWS: readonly HabitatRowDef[] = [
  { id: "lizard", careIcon: "heart", careLabel: "Habitat score" },
  { id: "fish", careIcon: "drop", careLabel: "Aquarium score" },
  { id: "frog", careIcon: "leaf", careLabel: "Habitat score" },
];

/** Row + its card in one lookup (name/typeLabel/art come from the card). */
export function habitatRowCard(id: HabitatPageId) {
  const card = HABITAT_CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`No habitat card for row "${id}"`);
  return card;
}

// ── Restoration (honest: three of the four display bays are alive) ──────────

export const RESTORATION = {
  /** The next wing's project name (game fiction, like "Sunstone Desert"). */
  wingName: "Cloudridge Wetlands",
  living: 3,
  total: 4,
  note: "Three of the eco-center's four display bays are living habitats. The last wing opens in a future update.",
} as const;

export function restorationPct(living: number = RESTORATION.living, total: number = RESTORATION.total): number {
  if (total <= 0) return 0;
  return Math.round((100 * Math.max(0, Math.min(living, total))) / total);
}

// ── Copy ────────────────────────────────────────────────────────────────────

export const HUB_WELCOME = "Welcome back, Keeper.";
export const HUB_FLAVOR = "Every small care creates a lasting ripple.";
export const HUB_MOTTO = "Care. Observe. Understand. Protect.";

/** Footer time-of-day line from the in-game clock (fractional hours 0..24). */
export function greetingFor(hourFrac: number): string {
  const h = ((hourFrac % 24) + 24) % 24;
  if (h < 5 || h >= 22) return "Night at the eco-center";
  if (h < 12) return "Morning at the eco-center";
  if (h < 18) return "Afternoon at the eco-center";
  return "Evening at the eco-center";
}

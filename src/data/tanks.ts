/**
 * Tank-related config: action costs and size presets. Kept as data so the
 * economy can be tuned without touching sim logic.
 */

export type ActionId = "feed" | "clean" | "decorate" | "addSpecies" | "waterChange";

export interface ActionDef {
  id: ActionId;
  label: string;
  /** Cost in leaves (the green currency). */
  cost: number;
  /** Whether this is a real working action in the vertical slice. */
  implemented: boolean;
  hint: string;
}

export const ACTIONS: ActionDef[] = [
  { id: "feed", label: "Feed", cost: 5, implemented: true, hint: "Feed the tank. Don't overdo it — uneaten food fouls the water." },
  { id: "clean", label: "Clean", cost: 10, implemented: true, hint: "Scrub glass and siphon debris. Restores cleanliness." },
  { id: "decorate", label: "Decorate", cost: 15, implemented: false, hint: "Open the habitat editor (coming soon)." },
  { id: "addSpecies", label: "Add Species", cost: 0, implemented: false, hint: "Browse and stock new species (coming soon)." },
  { id: "waterChange", label: "Water Change", cost: 20, implemented: true, hint: "Partial water change. Dilutes ammonia, nitrite and nitrate." },
];

export function getAction(id: ActionId): ActionDef {
  return ACTIONS.find((a) => a.id === id)!;
}

export interface TankSizePreset {
  id: string;
  label: string;
  liters: number;
}

export const TANK_SIZES: TankSizePreset[] = [
  { id: "nano", label: "Nano", liters: 20 },
  { id: "standard", label: "Standard", liters: 60 },
  { id: "community", label: "Community", liters: 120 },
  { id: "showcase", label: "Showcase", liters: 240 },
];

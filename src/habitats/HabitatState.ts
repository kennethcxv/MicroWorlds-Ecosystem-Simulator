/**
 * Live habitat runtime state — factory + small mutators. Pure (no Three/DOM).
 * A HabitatState wraps an authored layout with the dynamic bits the sim owns:
 * environment readings, the animals + their needs, live feeder insects, the feed
 * cooldown, and a habitat-scoped event log (separate from the aquarium's).
 */
import type {
  HabitatAnimal,
  HabitatEnvironment,
  HabitatLayout,
  HabitatState,
  EventTone,
} from "./HabitatTypes";

// v2: placed objects now carry `defId` + load real decor GLBs (measured contour
// footprints). Bumping invalidates pre-asset saves that would otherwise load
// placeholders with primitive collision instead of the real mesh silhouette.
export const HABITAT_SAVE_VERSION = 2;

/** Read the intended environment from the layout's equipment + basking zone. */
export function deriveEnvironment(layout: HabitatLayout): HabitatEnvironment {
  const basking = layout.zones.find((z) => z.kind === "basking");
  const cool = layout.zones.find((z) => z.kind === "cool");
  const hasHeat = layout.equipment.some((e) => e.kind === "heat_lamp" && e.power > 0);
  const hasMister = layout.equipment.some((e) => e.kind === "mister");
  return {
    baskingC: basking?.temperatureC ?? (hasHeat ? 31 : 24),
    coolC: cool?.temperatureC ?? 24,
    humidity: hasMister ? 45 : 38,
    cleanliness: 92,
  };
}

export function createHabitatState(
  layout: HabitatLayout,
  animals: HabitatAnimal[],
  environment?: HabitatEnvironment,
): HabitatState {
  return {
    version: HABITAT_SAVE_VERSION,
    layout,
    environment: environment ?? deriveEnvironment(layout),
    animals,
    feeders: [],
    feedCooldown: 0,
    events: [],
    nextEventId: 1,
    nextFeederId: 1,
    elapsed: 0,
  };
}

const MAX_EVENTS = 40;

/** Prepend an event to the habitat log (newest first), capped. */
export function logHabitatEvent(state: HabitatState, message: string, tone: EventTone): void {
  state.events.unshift({ id: state.nextEventId++, message, tone, t: state.elapsed });
  if (state.events.length > MAX_EVENTS) state.events.length = MAX_EVENTS;
}

export const clamp = (v: number, lo = 0, hi = 100): number => Math.min(hi, Math.max(lo, v));

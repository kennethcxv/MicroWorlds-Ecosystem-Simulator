/**
 * GW UI MODE SYSTEM — the pure state machine behind the gecko HUD
 * (reference-match pass, see docs/production/DESIGN_REFERENCE_MAP.md).
 *
 * One mode is active at a time. Each mode declares which UI regions are shown
 * via `regionsFor` — the DOM layer just applies the answer, so "no two drawers
 * open at once" holds by construction. Esc always returns to gecko-main;
 * re-requesting the active mode toggles back to gecko-main. No DOM imports —
 * unit-tested in tests/uimode.test.ts.
 */

export type GwMode = "gecko-main" | "feed" | "clean" | "terrain" | "decorate" | "animal-info" | "photo" | "cinematic";

export type GwDrawer = "feed" | "clean" | "terrain" | "decorate" | null;

export interface GwRegions {
  /** Bottom stat strip (Hunger … Humidity). */
  statStrip: boolean;
  /** Large bottom action dock (Feed / Clean / Decorate / Terrain / Animal Info). */
  dock: boolean;
  /** Compact icon+label nav shown while a drawer mode is open. */
  slimNav: boolean;
  /** Which bottom drawer is open (drawer modes only). */
  drawer: GwDrawer;
  /** Right-side Animal Info panel. */
  animalPanel: boolean;
  /** Top identity + score cards: full, compact (photo) or hidden (cinematic). */
  topCards: "full" | "compact" | "hidden";
  /** Whether this mode wants the free (unanchored) camera. */
  cameraFree: boolean;
  /** Full-screen cinema bars (cinematic mode only). */
  letterbox: boolean;
  /** Whether the scene should drive its auto-follow cinematic camera. */
  cameraCinematic: boolean;
}

const BASE = { letterbox: false, cameraCinematic: false };

export function regionsFor(mode: GwMode): GwRegions {
  switch (mode) {
    case "feed":
      // The reference feed screen is the drawer alone (method rail + ✕ inside
      // it) — no slim nav row beneath.
      return { ...BASE, statStrip: false, dock: false, slimNav: false, drawer: "feed", animalPanel: false, topCards: "full", cameraFree: false };
    case "clean":
    case "terrain":
      return { ...BASE, statStrip: false, dock: false, slimNav: true, drawer: mode, animalPanel: false, topCards: "full", cameraFree: false };
    case "decorate":
      return { ...BASE, statStrip: false, dock: false, slimNav: true, drawer: "decorate", animalPanel: false, topCards: "full", cameraFree: true };
    case "animal-info":
      return { ...BASE, statStrip: true, dock: true, slimNav: false, drawer: null, animalPanel: true, topCards: "full", cameraFree: false };
    case "photo":
      return { ...BASE, statStrip: false, dock: false, slimNav: false, drawer: null, animalPanel: false, topCards: "compact", cameraFree: true };
    case "cinematic":
      // Pure cinema: the world, black bars, nothing else. Esc brings it back.
      return {
        statStrip: false,
        dock: false,
        slimNav: false,
        drawer: null,
        animalPanel: false,
        topCards: "hidden",
        cameraFree: false,
        letterbox: true,
        cameraCinematic: true,
      };
    case "gecko-main":
    default:
      return { ...BASE, statStrip: true, dock: true, slimNav: false, drawer: null, animalPanel: false, topCards: "full", cameraFree: false };
  }
}

export type GwModeListener = (next: GwMode, prev: GwMode) => void;

export class GwModeMachine {
  private _mode: GwMode = "gecko-main";
  private listeners: GwModeListener[] = [];

  get mode(): GwMode {
    return this._mode;
  }

  /** Enter `mode`; requesting the active mode toggles back to gecko-main.
   *  Returns the mode actually entered. */
  request(mode: GwMode): GwMode {
    return this.set(mode === this._mode ? "gecko-main" : mode);
  }

  /** Esc — always back to gecko-main. */
  escape(): GwMode {
    return this.set("gecko-main");
  }

  onChange(cb: GwModeListener): void {
    this.listeners.push(cb);
  }

  private set(next: GwMode): GwMode {
    if (next === this._mode) return this._mode;
    const prev = this._mode;
    this._mode = next;
    for (const cb of this.listeners) cb(next, prev);
    return next;
  }
}

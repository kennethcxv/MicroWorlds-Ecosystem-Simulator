/**
 * Scene geometry + the 2.5D depth model. Pure math (no canvas calls) so it is
 * easy to reason about and reuse. The renderer asks this module "where does a
 * thing at normalized position (x, z) land on screen, and how big/hazy is it?"
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneLayout {
  w: number;
  h: number;
  /** Outer glass box of the aquarium. */
  tank: Rect;
  /** Water region inside the glass (excludes rim + glass thickness). */
  interior: Rect;
  /** Y of the water surface line. */
  waterTop: number;
  /** Substrate "ground" Y at the back wall (z=0) — higher on screen. */
  groundBack: number;
  /** Substrate ground Y at the front glass (z=1) — lower on screen. */
  groundFront: number;
  /** Full draw rect for the wooden stand image. */
  stand: Rect;
  /** X where the filter outflow / bubble column originates. */
  filterX: number;
}

const TANK_ASPECT = 1.6; // width / height of the glass box

export function computeLayout(w: number, h: number): SceneLayout {
  const cx = w * 0.5;

  const maxTankW = w * 0.54;
  const maxTankH = h * 0.6;
  let tankW = Math.min(maxTankW, maxTankH * TANK_ASPECT);
  let tankH = tankW / TANK_ASPECT;

  // Keep a sensible minimum on very small windows.
  tankW = Math.max(tankW, 360);
  tankH = tankW / TANK_ASPECT;

  const centerY = h * 0.45;
  const tankTop = Math.max(centerY - tankH / 2, h * 0.15);
  const tankX = cx - tankW / 2;
  const tank: Rect = { x: tankX, y: tankTop, w: tankW, h: tankH };

  const waterTop = tankTop + tankH * 0.105;
  const interiorBottom = tankTop + tankH * 0.965;
  const sideInset = tankW * 0.035;
  const interior: Rect = {
    x: tankX + sideInset,
    y: waterTop,
    w: tankW - sideInset * 2,
    h: interiorBottom - waterTop,
  };

  const groundFront = interiorBottom - interior.h * 0.015;
  const groundBack = interiorBottom - interior.h * 0.19;

  const standW = tankW * 1.16;
  const standH = standW * 0.75; // image is 1000x750
  const standContentTop = 0.2453; // stand trim ty
  const standTopY = tankTop + tankH * 0.99 - standContentTop * standH;
  const stand: Rect = { x: cx - standW / 2, y: standTopY, w: standW, h: standH };

  return {
    w,
    h,
    tank,
    interior,
    waterTop,
    groundBack,
    groundFront,
    stand,
    filterX: interior.x + interior.w * 0.93,
  };
}

/** Ground (substrate surface) Y for a given depth z (0 back → 1 front). */
export function groundY(layout: SceneLayout, z: number): number {
  return layout.groundBack + (layout.groundFront - layout.groundBack) * z;
}

/** Perspective-aware screen X for a normalized horizontal position at depth z. */
export function perspX(layout: SceneLayout, xNorm: number, z: number): number {
  const inset = layout.interior.w * 0.06 * (1 - z);
  return layout.interior.x + inset + xNorm * (layout.interior.w - inset * 2);
}

/** Size multiplier from depth — near things are bigger. */
export function depthScale(z: number): number {
  return 0.8 + z * 0.34;
}

/** Teal haze strength for a depth — far things fade into the water. */
export function hazeAlpha(z: number): number {
  return 0.46 * (1 - z) + 0.05;
}

/** Y for a midwater creature given its zone band [top,bottom] (0..1) and a t. */
export function waterY(layout: SceneLayout, t: number): number {
  return layout.interior.y + t * layout.interior.h;
}

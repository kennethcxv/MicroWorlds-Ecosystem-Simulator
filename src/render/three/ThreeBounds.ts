/**
 * Tank geometry constants + swim-bounds helpers for the experimental 3D tank.
 *
 * Coordinate frame (world units, Y-up):
 *   - floor (outside glass bottom) at y = 0
 *   - X = tank width (left/right), Z = tank depth (front/back), Y = height
 *   - origin centered on X/Z; the glass box spans y = [0, TANK.height]
 *
 * Pure math — no Three.js scene objects are created here so the steering AI can
 * be reasoned about (and later tested) in isolation from rendering.
 */
import * as THREE from "three";

export const TANK = {
  width: 2.0, // X extent of the glass box
  height: 1.18, // Y extent
  depth: 1.18, // Z extent
  glass: 0.04, // glass pane thickness
  waterTop: 1.06, // y of the water surface
  substrate: 0.13, // y of the gravel surface
} as const;

export interface TankBounds {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

/** Swimmable volume: inset from the glass + a margin so fish never touch panes. */
export function makeBounds(margin = 0.1): TankBounds {
  const hw = TANK.width / 2 - TANK.glass - margin;
  const hd = TANK.depth / 2 - TANK.glass - margin;
  return {
    min: new THREE.Vector3(-hw, TANK.substrate + margin, -hd),
    max: new THREE.Vector3(hw, TANK.waterTop - margin, hd),
  };
}

/** Map a [0..1] fraction onto a bounds axis range. */
export function alongX(b: TankBounds, t: number): number {
  return THREE.MathUtils.lerp(b.min.x, b.max.x, t);
}
export function alongY(b: TankBounds, t: number): number {
  return THREE.MathUtils.lerp(b.min.y, b.max.y, t);
}
export function alongZ(b: TankBounds, t: number): number {
  return THREE.MathUtils.lerp(b.min.z, b.max.z, t);
}

/**
 * Inward steering acceleration that grows as a point nears any wall. Zero deep
 * in the interior; ramps smoothly to ~`strength` within `feather` of a face.
 * This is *avoidance* (a soft push), not a bounce — fish curve away naturally.
 */
export function wallAvoid(
  p: THREE.Vector3,
  b: TankBounds,
  feather: number,
  strength: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const axis = (val: number, lo: number, hi: number): number => {
    if (val < lo + feather) return ((lo + feather - val) / feather) ** 2;
    if (val > hi - feather) return -(((val - (hi - feather)) / feather) ** 2);
    return 0;
  };
  out.set(
    axis(p.x, b.min.x, b.max.x) * strength,
    axis(p.y, b.min.y, b.max.y) * strength,
    axis(p.z, b.min.z, b.max.z) * strength,
  );
  return out;
}

/** Hard safety clamp so a fish can never escape the glass, whatever the physics. */
export function clampInside(p: THREE.Vector3, b: TankBounds): void {
  p.x = THREE.MathUtils.clamp(p.x, b.min.x, b.max.x);
  p.y = THREE.MathUtils.clamp(p.y, b.min.y, b.max.y);
  p.z = THREE.MathUtils.clamp(p.z, b.min.z, b.max.z);
}

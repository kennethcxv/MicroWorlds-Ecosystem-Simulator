/**
 * Enclosure walk bounds — the rectangle on the substrate an animal may roam
 * within (inside the glass). Pure math; the renderer and collision solver both
 * consume `GroundBounds`. Structurally identical to the renderer's own
 * GroundBounds so the two interoperate without conversion.
 */
import type { HabitatDimensions } from "./HabitatTypes";

export interface GroundBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** World Y of the substrate surface the animal walks on. */
  y: number;
}

export type Rng = () => number;

/** Interior walk rectangle inside the glass, pulled in by `margin` so the animal
 *  never clips the panes. */
export function boundsFromDimensions(d: HabitatDimensions, margin = 0.12): GroundBounds {
  const hw = d.width / 2;
  const hd = d.depth / 2;
  return {
    minX: -hw + d.glass + margin,
    maxX: hw - d.glass - margin,
    minZ: -hd + d.glass + margin,
    maxZ: hd - d.glass - margin,
    y: d.substrateTop,
  };
}

/** Shrink the walk area toward its centre by the given fractions (keeps the animal
 *  framed on camera / away from side UI panels without shrinking the glass). */
export function insetBounds(b: GroundBounds, fx: number, fz: number): GroundBounds {
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  return {
    minX: cx + (b.minX - cx) * fx,
    maxX: cx + (b.maxX - cx) * fx,
    minZ: cz + (b.minZ - cz) * fz,
    maxZ: cz + (b.maxZ - cz) * fz,
    y: b.y,
  };
}

export function containsXZ(b: GroundBounds, x: number, z: number, margin = 0): boolean {
  return (
    x >= b.minX + margin &&
    x <= b.maxX - margin &&
    z >= b.minZ + margin &&
    z <= b.maxZ - margin
  );
}

/** Clamp a point to stay `margin` inside the bounds. */
export function clampXZ(
  b: GroundBounds,
  x: number,
  z: number,
  margin = 0,
): { x: number; z: number } {
  return {
    x: Math.min(Math.max(x, b.minX + margin), b.maxX - margin),
    z: Math.min(Math.max(z, b.minZ + margin), b.maxZ - margin),
  };
}

export function randomPointInBounds(
  b: GroundBounds,
  rng: Rng = Math.random,
  margin = 0,
): { x: number; z: number } {
  const x = b.minX + margin + rng() * Math.max(0, b.maxX - b.minX - margin * 2);
  const z = b.minZ + margin + rng() * Math.max(0, b.maxZ - b.minZ - margin * 2);
  return { x, z };
}

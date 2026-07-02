/**
 * Authored-layout operations — add / move / rotate / scale / remove placed
 * objects, deep-clone a layout, and derive the walk bounds. These back both the
 * (future) player habitat editor and the small dev edit-mode. Pure data.
 */
import type { HabitatLayout, PlacedObject, Vec3 } from "./HabitatTypes";
import { boundsFromDimensions, insetBounds, type GroundBounds } from "./HabitatBounds";

/** JSON deep clone — layouts are plain data, so this is exact + safe. */
export function cloneLayout(layout: HabitatLayout): HabitatLayout {
  return JSON.parse(JSON.stringify(layout)) as HabitatLayout;
}

export function findObject(layout: HabitatLayout, id: string): PlacedObject | undefined {
  return layout.objects.find((o) => o.id === id);
}

export function addObject(layout: HabitatLayout, obj: PlacedObject): void {
  layout.objects.push(obj);
}

export function removeObject(layout: HabitatLayout, id: string): boolean {
  const i = layout.objects.findIndex((o) => o.id === id);
  if (i < 0) return false;
  layout.objects.splice(i, 1);
  return true;
}

export function moveObject(layout: HabitatLayout, id: string, position: Vec3): boolean {
  const o = findObject(layout, id);
  if (!o) return false;
  o.position = position;
  return true;
}

export function rotateObject(layout: HabitatLayout, id: string, rotation: Vec3): boolean {
  const o = findObject(layout, id);
  if (!o) return false;
  o.rotation = rotation;
  return true;
}

export function scaleObject(layout: HabitatLayout, id: string, scale: Vec3): boolean {
  const o = findObject(layout, id);
  if (!o) return false;
  o.scale = scale;
  return true;
}

/** A layout-unique id derived from `base` (base, then base-2, base-3, …). */
export function uniqueObjectId(layout: HabitatLayout, base: string): string {
  const taken = new Set(layout.objects.map((o) => o.id));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!taken.has(cand)) return cand;
  }
}

/**
 * Deep-clone the object with `id`, give it a fresh unique id, nudge it on XZ so it
 * doesn't hide exactly behind the original, append it, and return it (or null if
 * `id` is unknown). Used by the editor's Duplicate action.
 */
export function duplicateObject(
  layout: HabitatLayout,
  id: string,
  offset: [number, number] = [0.16, 0.16],
): PlacedObject | null {
  const src = findObject(layout, id);
  if (!src) return null;
  const copy = JSON.parse(JSON.stringify(src)) as PlacedObject;
  copy.id = uniqueObjectId(layout, `${id}-copy`);
  copy.position = [src.position[0] + offset[0], src.position[1], src.position[2] + offset[1]];
  layout.objects.push(copy);
  return copy;
}

/**
 * Walk bounds for a layout. `insetX/insetZ` shrink the roam rectangle toward the
 * centre (1 = full interior) so the animal stays framed away from the side UI.
 */
export function walkBounds(
  layout: HabitatLayout,
  insetX = 1,
  insetZ = 1,
  margin?: number,
): GroundBounds {
  const b = boundsFromDimensions(layout.dimensions, margin);
  return insetX === 1 && insetZ === 1 ? b : insetBounds(b, insetX, insetZ);
}

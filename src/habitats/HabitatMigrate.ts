/**
 * SAVE MIGRATION for habitat layouts. A persisted layout carries its own copy of
 * the enclosure dimensions and object transforms; when the shell's authored
 * numbers evolve (or a save was hand-edited / corrupted), `migrateLayout` heals
 * it instead of loading a broken tank:
 *   1. the persisted dimensions are snapped back to the nearest current catalog
 *      size preset (the ONE authored record — see EnclosureSpec),
 *   2. every placed object is clamped into the current placement rectangle
 *      (floor objects back onto the sand; elevated/hanging keep their height,
 *      clamped under the top band),
 *   3. zone centres and equipment are clamped into the enclosure.
 * Content is never deleted — a rogue object is moved to the nearest valid spot.
 * Pure (no Three.js/DOM), idempotent, unit-tested.
 */
import type { Equipment, HabitatLayout, HabitatSizeOption, PlacedObject, Zone } from "./HabitatTypes";
import { clampXZ } from "./HabitatBounds";
import { enclosureSpec, type EnclosureSpec } from "./EnclosureSpec";

export interface MigrationReport {
  /** True when the persisted dimensions were replaced by the catalog record. */
  dimensionsChanged: boolean;
  /** Ids of objects that had to be moved back inside the bounds. */
  movedObjects: string[];
  /** Ids of zones whose centres were clamped. */
  clampedZones: string[];
  /** Ids of equipment that were clamped into the enclosure. */
  clampedEquipment: string[];
}

const EPS = 1e-6;

/** Nearest size preset by footprint (width + depth distance). */
function nearestOption(layout: HabitatLayout, options: HabitatSizeOption[]): HabitatSizeOption | null {
  let best: HabitatSizeOption | null = null;
  let bestD = Infinity;
  for (const opt of options) {
    const d =
      Math.abs(opt.dimensions.width - layout.dimensions.width) +
      Math.abs(opt.dimensions.depth - layout.dimensions.depth);
    if (d < bestD) {
      bestD = d;
      best = opt;
    }
  }
  return best;
}

function sameDims(a: HabitatLayout["dimensions"], b: HabitatLayout["dimensions"]): boolean {
  return (
    Math.abs(a.width - b.width) < EPS &&
    Math.abs(a.depth - b.depth) < EPS &&
    Math.abs(a.height - b.height) < EPS &&
    Math.abs(a.glass - b.glass) < EPS &&
    Math.abs(a.substrateTop - b.substrateTop) < EPS
  );
}

function clampObject(o: PlacedObject, spec: EnclosureSpec): boolean {
  const [x0, y0, z0] = o.position;
  const { x, z } = clampXZ(spec.placement, x0, z0);
  let y = y0;
  if (!o.placement || o.placement === "floor") {
    y = spec.substrateTop;
  } else {
    // Elevated/hanging keep their height, boxed between the sand and the band.
    y = Math.min(spec.interior.topY - 0.05, Math.max(spec.substrateTop, y0));
  }
  const moved = Math.abs(x - x0) > EPS || Math.abs(y - y0) > EPS || Math.abs(z - z0) > EPS;
  if (moved) o.position = [x, y, z];
  return moved;
}

function clampZone(zn: Zone, spec: EnclosureSpec): boolean {
  const [x0, , z0] = zn.center;
  const { x, z } = clampXZ(spec.walk, x0, z0);
  const moved = Math.abs(x - x0) > EPS || Math.abs(z - z0) > EPS;
  if (moved) zn.center = [x, spec.substrateTop, z];
  return moved;
}

function clampEquipment(e: Equipment, spec: EnclosureSpec): boolean {
  const [x0, y0, z0] = e.position;
  const x = Math.min(spec.interior.maxX, Math.max(spec.interior.minX, x0));
  const z = Math.min(spec.interior.maxZ, Math.max(spec.interior.minZ, z0));
  const y = Math.min(spec.lampMountY, Math.max(spec.interior.floorY, y0));
  const moved = Math.abs(x - x0) > EPS || Math.abs(y - y0) > EPS || Math.abs(z - z0) > EPS;
  if (moved) e.position = [x, y, z];
  return moved;
}

/** Heal a loaded layout in place. Safe to run on every load (no-op when clean). */
export function migrateLayout(layout: HabitatLayout, options: HabitatSizeOption[]): MigrationReport {
  const report: MigrationReport = {
    dimensionsChanged: false,
    movedObjects: [],
    clampedZones: [],
    clampedEquipment: [],
  };

  const opt = nearestOption(layout, options);
  if (opt && !sameDims(layout.dimensions, opt.dimensions)) {
    layout.dimensions = { ...opt.dimensions };
    report.dimensionsChanged = true;
  }

  const spec = enclosureSpec(layout.dimensions);
  for (const o of layout.objects) if (clampObject(o, spec)) report.movedObjects.push(o.id);
  for (const zn of layout.zones) if (clampZone(zn, spec)) report.clampedZones.push(zn.id);
  for (const e of layout.equipment) if (clampEquipment(e, spec)) report.clampedEquipment.push(e.id);

  return report;
}

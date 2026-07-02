/**
 * GLASSWATER — pure PLACEMENT VALIDATION for the habitat editor (no Three.js /
 * DOM). Decides whether a prop may be dropped/moved to a spot: inside the glass,
 * not buried in another hard prop, and not on top of the animal or a live feeder.
 *
 * Deliberately lenient — this is a cozy builder, so a slight edge overlap with an
 * existing prop (and any overlap with soft/climbable decor) is fine. Only a DEEP
 * intrusion into a hard obstacle's core or landing right on a creature is rejected.
 */
import type { CollisionWorld } from "./HabitatCollision";
import { containsXZ } from "./HabitatBounds";
import type { HabitatDimensions, HabitatLayout, PlacedObject } from "./HabitatTypes";

/** A creature/feeder the new prop must not be dropped on top of. */
export interface PlacementBlocker {
  x: number;
  z: number;
  r: number;
}

/**
 * Can a prop with the given XZ `footprintRadius` be placed at (x,z)?
 *   - its centre is inside the walk bounds (inside the glass),
 *   - it isn't buried in an existing HARD obstacle's core (edge touch is ok),
 *   - it isn't dropped on top of the animal or a live feeder.
 */
export function canPlace(
  world: CollisionWorld,
  x: number,
  z: number,
  footprintRadius: number,
  blockers: PlacementBlocker[] = [],
): boolean {
  return placementIssue(world, x, z, footprintRadius, blockers) === null;
}

/**
 * The human-readable REASON a drop/move at (x,z) is invalid, or null when it's fine.
 * Same rules as {@link canPlace}; used to show the player WHY the red ghost is red.
 */
export function placementIssue(
  world: CollisionWorld,
  x: number,
  z: number,
  footprintRadius: number,
  blockers: PlacementBlocker[] = [],
): string | null {
  if (!containsXZ(world.bounds, x, z)) return "Outside the enclosure";
  if (world.tooSteepAt(x, z)) return "The ground is too steep here";
  // Reject only a DEEP overlap: probe with a fraction of the footprint so props can
  // still nestle up against each other (lenient for a cozy builder).
  if (world.isBlocked(x, z, footprintRadius * 0.35)) return "Overlaps a solid object";
  for (const b of blockers) {
    if (Math.hypot(x - b.x, z - b.z) < b.r + footprintRadius * 0.5) return "Too close to the gecko";
  }
  return null;
}

// ── Hanging / elevated ATTACHMENT rules ───────────────────────────────────────
// A hanging prop (vine, lamp) can't float alone in mid-air: it must reach the top
// frame, cling to a glass wall, or rest on a climbable branch/rock. What supports
// it is reported so the UI can explain (and drop it if its support is deleted).

export type HangingSupportKind = "ceiling" | "wall" | "prop";

/** How near the top frame a prop's TOP must reach to hang from the ceiling. */
const CEILING_REACH = 0.3;
/** How near a glass wall (inside face) a prop counts as wall-mounted. */
const WALL_REACH = 0.24;
/** Max XZ gap + vertical slack between a hanging prop's base and a support's top. */
const PROP_REACH_XZ = 0.4;
const PROP_REACH_Y = 0.08;

/** Rough world-space height of a placed object (footprint > authored > default). */
function heightOf(o: PlacedObject): number {
  const sy = o.scale[1] ?? 1;
  if (o.assetFootprint) return o.assetFootprint.half[1] * 2 * sy;
  if (o.collision?.halfExtents) return o.collision.halfExtents[1] * 2 * sy;
  if (o.collision?.radius != null) return o.collision.radius * 2 * sy;
  return 0.2 * sy;
}

/** World Y of a placed object's top (its position is its BASE). */
function topOf(o: PlacedObject): number {
  return o.position[1] + heightOf(o);
}

/** Can `other` support a hanging prop? Climbable decor + branches/rocks can. */
function canSupport(other: PlacedObject): boolean {
  if (other.placement === "hanging") return false; // vines don't hold vines (yet)
  return other.interaction === "climbable" || other.category === "branch" || other.category === "rock";
}

/**
 * What currently supports a hanging/elevated prop at its position — `ceiling`
 * (its top reaches the top frame), `wall` (against the glass), `prop` (its base
 * rests at a nearby climbable's top), or null = UNSUPPORTED (floating mid-air).
 */
export function hangingSupport(o: PlacedObject, layout: HabitatLayout, dims: HabitatDimensions): HangingSupportKind | null {
  const [x, y, z] = o.position;
  if (y + heightOf(o) >= dims.height - CEILING_REACH) return "ceiling";
  const wallX = dims.width / 2 - dims.glass - WALL_REACH;
  const wallZ = dims.depth / 2 - dims.glass - WALL_REACH;
  if (Math.abs(x) >= wallX || Math.abs(z) >= wallZ) return "wall";
  for (const other of layout.objects) {
    if (other.id === o.id || !canSupport(other)) continue;
    const dxz = Math.hypot(x - other.position[0], z - other.position[2]);
    if (dxz <= PROP_REACH_XZ && topOf(other) >= y - PROP_REACH_Y) return "prop";
  }
  return null;
}

/** Human-readable reason a hanging prop is invalid where it is (null = fine).
 *  Floor props always pass — attachment only applies to hanging/elevated modes. */
export function hangingIssue(o: PlacedObject, layout: HabitatLayout, dims: HabitatDimensions): string | null {
  if ((o.placement ?? "floor") === "floor") return null;
  if (hangingSupport(o, layout, dims)) return null;
  return "Needs support — attach to the top frame, a wall, or a branch";
}

/**
 * Drop every UNSUPPORTED hanging prop to the substrate (the chosen behaviour when
 * a support is moved/deleted: the vine falls rather than float). Returns the ids
 * that fell so the caller can log/toast them. Mutates the layout.
 */
export function settleHanging(layout: HabitatLayout, groundY: number, exceptId?: string): string[] {
  const fell: string[] = [];
  for (const o of layout.objects) {
    if (o.id === exceptId) continue; // the prop being actively edited is left alone
    if ((o.placement ?? "floor") === "floor") continue;
    if (o.position[1] <= groundY + 1e-6) continue; // already on the ground
    if (hangingSupport(o, layout, layout.dimensions)) continue;
    o.position = [o.position[0], groundY, o.position[2]];
    fell.push(o.id);
  }
  return fell;
}

/**
 * Authored leopard-gecko desert terrarium — the data-driven layout the 3D scene
 * builds from (matches the SUNSTONE DESERT reference: warm basking rock + lamp,
 * cave hide, humid hide, driftwood branch, water + feeding dishes on sand, with
 * an open roaming/feeding area). Every collidable piece carries collision data so
 * the gecko can't phase through it. Placeholder art today; drop-in GLBs later.
 *
 * This is DATA — it defines a habitat; it does not render one. `ThreeLizardScene`
 * consumes it. Swap the numbers (or build a different layout at runtime via
 * HabitatBuilder) to get a different terrarium; nothing here is hardcoded in the
 * renderer.
 */
import type { HabitatAnimal, HabitatCamera, HabitatLayout, HabitatState, PlacedObject } from "../HabitatTypes";
import { LIZARD_SIZE_OPTIONS, findPlaceable, makePlaced } from "../HabitatBuilder";
import { enclosureSpec } from "../EnclosureSpec";
import { createHabitatState } from "../HabitatState";

export const LIZARD_HABITAT_ID = "sunstone-desert";

/** y of the substrate surface (objects sit here). */
const SIZE = LIZARD_SIZE_OPTIONS[1]; // 40-gallon breeder
const GY = SIZE.dimensions.substrateTop;

function place(defId: string, id: string, x: number, z: number, rotationY = 0): PlacedObject {
  const def = findPlaceable(defId);
  if (!def) throw new Error(`Unknown placeable: ${defId}`);
  return makePlaced(def, id, [x, GY, z], rotationY);
}

function scaled(o: PlacedObject, s: number): PlacedObject {
  o.scale = [s, s, s];
  return o;
}

// Home view + centre of interest come from the SAME spec the shell/bounds use —
// no separately-authored camera numbers to drift out of sync with the tank.
const SPEC = enclosureSpec(SIZE.dimensions);
const CAMERA: HabitatCamera = { fov: 33, position: SPEC.cameraHome, target: SPEC.cameraTarget };

export function makeLizardHabitatLayout(): HabitatLayout {
  return {
    id: LIZARD_HABITAT_ID,
    name: "Sunstone Desert",
    type: "lizard_terrarium",
    dimensions: SIZE.dimensions,
    camera: CAMERA,
    substrate: { type: "sand", color: 0xd9c19a, depth: GY },
    objects: [
      // Warm side (back-left, under the lamp): a low CLIMBABLE basking rock cluster.
      place("rock_cluster", "basking_rock", -0.82, -0.42, 0.2),
      // A rounded rock mound on the right the gecko routes AROUND (blocked).
      place("rock_boulder", "boulder", 0.92, -0.52, 1.1),
      // Two rock cave HIDES — cool/front-left + humid mid-right. Both are
      // scaled so their INTERIOR pockets pass the body-fit check (the whole
      // gecko fits under the roof — see GECKO_HIDE_FIT; a too-small hide is
      // never entered, and the editor warns if the player shrinks one).
      scaled(place("hide_cave", "cave_hide", -0.78, 0.5, 0.5), 1.7),
      scaled(place("hide_moist", "humid_hide", 0.62, -0.1, -0.4), 1.8),
      // CLIMBABLE driftwood across the middle — food that lands behind it makes the
      // gecko climb over / route around rather than shove into it.
      place("branch_log", "driftwood", 0.05, 0.02, 0.7),
      // Water dish (blocked) on the cool side; feeding dish (step-over) up front.
      place("dish_water", "water_dish", 0.86, 0.52),
      place("dish_food", "feeding_dish", -0.15, 0.56),
      // Non-collidable desert planting for enrichment (two GLB variants + a third).
      place("plant_succulent", "succulent_l", -1.18, -0.66),
      place("plant_succulent_2", "succulent_r", 1.16, 0.62),
      place("plant_succulent", "succulent_f", -0.5, 0.72),
    ],
    equipment: [
      {
        id: "heat_lamp",
        kind: "heat_lamp",
        label: "Basking Lamp",
        position: [-0.85, 1.22, -0.42],
        target: [-0.85, GY, -0.42],
        power: 1,
        affectsStats: { basking: 50 },
        shape: "lamp",
        color: 0xffcaa0,
      },
      {
        id: "uvb",
        kind: "uvb_lamp",
        label: "UVB Tube",
        position: [0, 1.24, -0.7],
        power: 1,
        affectsStats: { basking: 10, enrichment: 6 },
      },
      { id: "thermo", kind: "thermometer", label: "Thermometer", position: [1.32, 0.7, -0.85], power: 1 },
      { id: "hygro", kind: "hygrometer", label: "Hygrometer", position: [1.32, 0.5, -0.85], power: 1 },
    ],
    zones: [
      { id: "basking", kind: "basking", center: [-0.85, GY, -0.42], radius: 0.38, temperatureC: 31 },
      { id: "cool", kind: "cool", center: [0.95, GY, 0.5], radius: 0.45, temperatureC: 24 },
      { id: "feeding", kind: "feeding", center: [0.1, GY, 0.35], radius: 0.32 },
    ],
  };
}

export function makeLeopardGecko(): HabitatAnimal {
  return {
    id: "gecko-1",
    speciesId: "leopard_gecko",
    name: "Leopard Gecko",
    stage: "adult",
    needs: { hunger: 68, stress: 14, health: 96, calcium: 80, bodyCondition: 50 },
  };
}

export function makeLizardHabitatState(): HabitatState {
  return createHabitatState(makeLizardHabitatLayout(), [makeLeopardGecko()]);
}

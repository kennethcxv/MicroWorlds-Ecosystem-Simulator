/**
 * Material + lighting factory for the experimental 3D tank. Aims for a premium
 * planted-aquarium read (glossy glass, teal water depth, soft hood light) rather
 * than a default gray model-viewer look — without expensive transmission passes,
 * so fish stay bright and readable through the front pane.
 */
import * as THREE from "three";

export const WATER_TINT = new THREE.Color(0x2f7e82);
export const FOG_COLOR = new THREE.Color(0x0e353b);
export const GLASS_TINT = new THREE.Color(0xbfeae6);

/** Front/side panes: faint tinted glass with a crisp clearcoat for specular
 *  streaks. Opacity (not transmission) keeps it cheap and the fish legible. */
export function makeGlassMaterial(): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: GLASS_TINT,
    metalness: 0,
    roughness: 0.05,
    transparent: true,
    opacity: 0.13,
    side: THREE.DoubleSide,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    depthWrite: false,
    ior: 1.45,
    reflectivity: 0.5,
  });
  return m;
}

/** Thin black tank frame (rim + corner pillars). */
export function makeRimMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x0c1416, roughness: 0.5, metalness: 0.2 });
}

/** The water body: a soft teal volume. depthWrite off so everything inside it
 *  renders; the global fog supplies the "deeper = bluer" gradient. */
export function makeWaterVolumeMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: WATER_TINT,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.BackSide,
  });
}

/** Bright animated water-surface sheet (shimmer handled in ThreeWater). */
export function makeWaterSurfaceMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x3a9aa0,
    transparent: true,
    opacity: 0.28,
    roughness: 0.15,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/** Granular substrate (gravel/sand/soil). Caustics may be layered on later
 *  (aquarium only). Default colour is wet aquarium gravel. */
export function makeSubstrateMaterial(color = 0x4a3a28): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.96, metalness: 0.0 });
}

/** Subtly push a loaded model's colours toward the water tint so decor reads as
 *  "submerged". Kept gentle, and skipped for fish so their colours stay vivid. */
export function tintUnderwater(obj: THREE.Object3D, amount: number): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      if (std.color) std.color.lerp(WATER_TINT, amount);
    }
  });
}

/** Soft, balanced aquarium lighting: cool fill from the water, warm-cool key,
 *  and a downward hood light to mimic an aquarium lamp. */
export function makeLights(): THREE.Group {
  const g = new THREE.Group();

  const hemi = new THREE.HemisphereLight(0xaef0ff, 0x16323a, 0.65);
  g.add(hemi);

  const key = new THREE.DirectionalLight(0xfff4e2, 1.15);
  key.position.set(1.6, 3.2, 2.2);
  g.add(key);

  const rim = new THREE.DirectionalLight(0x9fe6ff, 0.5);
  rim.position.set(-2.0, 1.4, -1.8);
  g.add(rim);

  // Hood lamp: a cool spotlight from just above the water pouring down.
  const hood = new THREE.SpotLight(0xdaf7ff, 14, 6, Math.PI / 3.4, 0.7, 1.4);
  hood.position.set(0, 2.6, 0.4);
  hood.target.position.set(0, 0.4, 0);
  g.add(hood);
  g.add(hood.target);

  const amb = new THREE.AmbientLight(0x2a5258, 0.4);
  g.add(amb);

  return g;
}

/** Balanced terrarium lighting (basking-lamp warmth without blowing out the
 *  animal's texture to flat gold). Neutral-ish key + cool fill keep the skin
 *  pattern readable; a gentle warm spot adds a basking accent. */
export function makeTerrariumLights(): THREE.Group {
  const g = new THREE.Group();

  g.add(new THREE.HemisphereLight(0xf3efe6, 0x3a3024, 0.62));

  const key = new THREE.DirectionalLight(0xfff3e6, 1.05);
  key.position.set(1.4, 3.4, 2.0);
  g.add(key);

  const fill = new THREE.DirectionalLight(0xbcd6ec, 0.5);
  fill.position.set(-2.0, 1.2, -1.4);
  g.add(fill);

  // Basking spotlight pouring down from a back corner — accent, not a wash.
  const basking = new THREE.SpotLight(0xffe6bc, 5.5, 6, Math.PI / 3.2, 0.6, 1.3);
  basking.position.set(-0.9, 2.6, -0.4);
  basking.target.position.set(-0.6, 0.1, -0.3);
  g.add(basking);
  g.add(basking.target);

  g.add(new THREE.AmbientLight(0x47433a, 0.3));

  return g;
}

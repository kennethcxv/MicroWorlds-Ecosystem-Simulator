/**
 * Offscreen CATALOG THUMBNAILS — renders each decor GLB once into a tiny
 * WebGL canvas (3/4 studio view, transparent background) and hands back a data
 * URL for the editor's catalog cards, so the player sees the ACTUAL rock / cave /
 * branch / dish instead of a symbolic icon. VARIANTS pass their tint + per-axis
 * default scale so a Slate Slab card shows a flat gray slab, not the parent rock.
 * Results are cached per (file, tint, scale) key; a failed load caches null so
 * the card keeps its icon fallback without retry spam. One small persistent
 * renderer (96²) is shared by every thumbnail.
 */
import * as THREE from "three";
import type { PlacedObject, Vec3 } from "../../habitats/HabitatTypes";
import { loadDecorModelCached } from "./ThreeAssetLoader";
import { applyDecorTint, buildPlaceholderObject } from "./ThreeTerrarium";

export interface ThumbVariant {
  /** Material recolour (lerped in — same treatment placement applies). */
  tint?: number;
  /** Per-axis variant scale (aspect only matters for a thumbnail). */
  scale?: Vec3;
  /** Y rotation in radians — the art extractor renders turntable angles
   *  so the Inventory's Rotate button can page through real views. */
  yaw?: number;
}

const SIZE = 96;
const cache = new Map<string, Promise<string | null>>();
let renderer: THREE.WebGLRenderer | null = null;
let rendererSize = 0;

function getRenderer(size: number): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  if (rendererSize !== size) {
    renderer.setSize(size, size);
    rendererSize = size;
  }
  return renderer;
}

async function render(file: string, variant: ThumbVariant | undefined, size: number): Promise<string | null> {
  const model = await loadDecorModelCached(file);
  if (!model) return null;
  if (variant?.scale) model.object.scale.set(variant.scale[0], variant.scale[1], variant.scale[2]);
  if (variant?.tint != null) applyDecorTint(model.object, variant.tint);
  model.object.rotation.y = variant?.yaw ?? 0;
  return studioShot(model.object, size);
}

/** Same 3/4 studio framing for any prepared object (GLB clone or placeholder). */
function studioShot(object: THREE.Object3D, size: number): string {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
  key.position.set(1.4, 2.2, 1.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe8ff, 0.7);
  rim.position.set(-1.2, 1.0, -1.4);
  scene.add(rim);
  scene.add(object);

  // Frame the model from a 3/4 angle so its silhouette reads on the card.
  const box = new THREE.Box3().setFromObject(object);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const radius = Math.max(s.x, s.y, s.z) * 0.5 || 0.1;
  const fov = 32;
  const d = (radius / Math.tan(((fov / 2) * Math.PI) / 180)) * 1.18;
  const cam = new THREE.PerspectiveCamera(fov, 1, radius * 0.01, radius * 40);
  cam.position.set(c.x + d * 0.72, c.y + d * 0.58, c.z + d * 0.82);
  cam.lookAt(c);

  const r = getRenderer(size);
  r.render(scene, cam);
  const url = r.domElement.toDataURL("image/png");
  // Geometry is shared with the decor cache — dispose nothing here (tinted
  // material clones are tiny and go with the temporary scene).
  return url;
}

/** Data-URL thumbnail of a decor GLB (cached per file+variant+size), or null if
 *  the asset can't load. Cards use the default 96²; the offline art extractor
 *  asks for larger renders. */
export function decorThumbnail(file: string, variant?: ThumbVariant, size = SIZE): Promise<string | null> {
  const ds = variant?.scale ?? [1, 1, 1];
  const key = `${file}|${variant?.tint ?? ""}|${ds[0]},${ds[1]},${ds[2]}|${size}|${variant?.yaw ?? 0}`;
  let p = cache.get(key);
  if (!p) {
    p = render(file, variant, size).catch(() => null);
    cache.set(key, p);
  }
  return p;
}

/** Studio thumbnail of a PROCEDURAL placeholder piece (grass clump, sign,
 *  gauge…) — the same framing GLB thumbs get, so catalogs read consistently. */
export function placeholderThumbnail(placed: PlacedObject, size = SIZE, yaw = 0): string | null {
  try {
    const obj = buildPlaceholderObject(placed);
    obj.rotation.y = yaw;
    return studioShot(obj, size);
  } catch {
    return null;
  }
}

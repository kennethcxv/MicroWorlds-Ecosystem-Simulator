/**
 * Offscreen CATALOG THUMBNAILS — renders each decor GLB once into a tiny
 * WebGL canvas (3/4 studio view, transparent background) and hands back a data
 * URL for the editor's catalog cards, so the player sees the ACTUAL rock / cave /
 * branch / dish instead of a symbolic icon. Results are cached per asset file;
 * a failed load caches null so the card keeps its emoji fallback without retry
 * spam. One small persistent renderer (96²) is shared by every thumbnail.
 */
import * as THREE from "three";
import { loadDecorModelCached } from "./ThreeAssetLoader";

const SIZE = 96;
const cache = new Map<string, Promise<string | null>>();
let renderer: THREE.WebGLRenderer | null = null;

function getRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  return renderer;
}

async function render(file: string): Promise<string | null> {
  const model = await loadDecorModelCached(file);
  if (!model) return null;
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
  key.position.set(1.4, 2.2, 1.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe8ff, 0.7);
  rim.position.set(-1.2, 1.0, -1.4);
  scene.add(rim);
  scene.add(model.object);

  // Frame the model from a 3/4 angle so its silhouette reads on the card.
  const box = new THREE.Box3().setFromObject(model.object);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const radius = Math.max(s.x, s.y, s.z) * 0.5 || 0.1;
  const fov = 32;
  const d = (radius / Math.tan(((fov / 2) * Math.PI) / 180)) * 1.18;
  const cam = new THREE.PerspectiveCamera(fov, 1, radius * 0.01, radius * 40);
  cam.position.set(c.x + d * 0.72, c.y + d * 0.58, c.z + d * 0.82);
  cam.lookAt(c);

  const r = getRenderer();
  r.render(scene, cam);
  const url = r.domElement.toDataURL("image/png");
  // Geometry/materials are shared with the decor cache — dispose nothing here.
  return url;
}

/** Data-URL thumbnail of a decor GLB (cached), or null if the asset can't load. */
export function decorThumbnail(file: string): Promise<string | null> {
  let p = cache.get(file);
  if (!p) {
    p = render(file).catch(() => null);
    cache.set(file, p);
  }
  return p;
}

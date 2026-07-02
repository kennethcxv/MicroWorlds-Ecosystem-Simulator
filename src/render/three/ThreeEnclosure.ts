/**
 * Reusable glass enclosure for land habitats (spider / lizard terrariums):
 * four glass panes + black rim/pillars + a substrate bed. Deliberately minimal —
 * the spike is about animal movement, not environment art. Returns the ground
 * swim/walk bounds (an inset rectangle on the substrate surface).
 */
import * as THREE from "three";
import {
  makeGlassMaterial,
  makeRimMaterial,
  makeSubstrateMaterial,
} from "./ThreeMaterials";

export interface EnclosureDims {
  width: number; // X
  depth: number; // Z
  height: number; // Y
  glass: number; // pane thickness
  substrateTop: number; // y of the substrate surface (floor at y=0)
}

export interface GroundBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number; // substrate surface height the animal walks on
}

/** Shrink walk bounds toward the centre (keeps the animal framed on-screen,
 *  away from the side UI panels, without shrinking the visible enclosure). */
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

export function buildEnclosure(
  scene: THREE.Scene,
  d: EnclosureDims,
  substrateColor: number,
  boundsMargin = 0.16,
): GroundBounds {
  const { width: w, height: h, depth: dep } = d;
  const glass = makeGlassMaterial();

  const pane = (gw: number, gh: number) => new THREE.PlaneGeometry(gw, gh);
  const front = new THREE.Mesh(pane(w, h), glass);
  front.position.set(0, h / 2, dep / 2);
  const back = new THREE.Mesh(pane(w, h), glass);
  back.position.set(0, h / 2, -dep / 2);
  back.rotation.y = Math.PI;
  const left = new THREE.Mesh(pane(dep, h), glass);
  left.position.set(-w / 2, h / 2, 0);
  left.rotation.y = Math.PI / 2;
  const right = new THREE.Mesh(pane(dep, h), glass);
  right.position.set(w / 2, h / 2, 0);
  right.rotation.y = -Math.PI / 2;
  for (const m of [front, back, left, right]) {
    m.renderOrder = 10;
    scene.add(m);
  }

  // Black rim frame (top + bottom) and corner pillars.
  const rimMat = makeRimMaterial();
  const t = 0.05;
  const rimRect = (y: number) => {
    const a = new THREE.Mesh(new THREE.BoxGeometry(w + t, t, t), rimMat);
    a.position.set(0, y, dep / 2);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w + t, t, t), rimMat);
    b.position.set(0, y, -dep / 2);
    const c = new THREE.Mesh(new THREE.BoxGeometry(t, t, dep + t), rimMat);
    c.position.set(w / 2, y, 0);
    const e = new THREE.Mesh(new THREE.BoxGeometry(t, t, dep + t), rimMat);
    e.position.set(-w / 2, y, 0);
    scene.add(a, b, c, e);
  };
  rimRect(h);
  rimRect(0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(t, h, t), rimMat);
      pillar.position.set((sx * w) / 2, h / 2, (sz * dep) / 2);
      scene.add(pillar);
    }
  }

  // Substrate bed (clean — no props/pebbles; the spike is about the animal).
  const innerW = w - d.glass * 2;
  const innerD = dep - d.glass * 2;
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(innerW, d.substrateTop, innerD),
    makeSubstrateMaterial(substrateColor),
  );
  bed.position.set(0, d.substrateTop / 2, 0);
  scene.add(bed);

  const m = boundsMargin;
  return {
    minX: -w / 2 + d.glass + m,
    maxX: w / 2 - d.glass - m,
    minZ: -dep / 2 + d.glass + m,
    maxZ: dep / 2 - d.glass - m,
    y: d.substrateTop,
  };
}


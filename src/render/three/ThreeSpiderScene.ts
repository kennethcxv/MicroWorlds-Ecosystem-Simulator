/**
 * Experimental SPIDER terrarium. Clean enclosure — just the animal on a soil
 * floor (no props), per the brief. The spider is **rigged** (armature + skin +
 * baked walk/idle clips authored in Blender) and driven by an AnimationMixer, so
 * the legs actually move and the body stays level (no bounce). Falls back to the
 * procedural (legless) spider if the rigged GLB is missing.
 */
import * as THREE from "three";
import type { CameraConfig, HabitatScene } from "./ThreeHabitat";
import { disposeScene } from "./ThreeHabitat";
import { makeTerrariumLights } from "./ThreeMaterials";
import { buildEnclosure, insetBounds, type EnclosureDims, type GroundBounds } from "./ThreeEnclosure";
import { loadRiggedAnimal, loadAnimal, makePlaceholderBox } from "./ThreeAssetLoader";
import { RiggedCreature, RIGGED_SPIDER } from "./ThreeRiggedController";
import { GroundCreature, SPIDER } from "./ThreeGroundController";

const DIMS: EnclosureDims = {
  width: 2.8,
  depth: 1.8,
  height: 1.2,
  glass: 0.05,
  substrateTop: 0.09,
};

interface Critter {
  object: THREE.Object3D;
  update(dt: number): void;
  excite(): void;
}

export class ThreeSpiderScene implements HabitatScene {
  readonly scene = new THREE.Scene();
  readonly camera: CameraConfig = { fov: 34, pos: [0.7, 1.55, 3.7], look: [0, 0.18, 0] };
  private roam: GroundBounds;
  private spider: Critter | null = null;

  constructor() {
    this.scene.fog = new THREE.Fog(0x241c14, 4.8, 9.0);
    this.scene.add(makeTerrariumLights());
    const bounds = buildEnclosure(this.scene, DIMS, 0x3a2c20, 0.32);
    this.roam = insetBounds(bounds, 0.8, 0.8);
  }

  async load(): Promise<void> {
    const rigged = await loadRiggedAnimal("spider_rigged.glb");
    if (rigged && rigged.clips.length) {
      this.spider = new RiggedCreature(rigged, RIGGED_SPIDER, this.roam);
    } else {
      const model =
        (await loadAnimal("spider.glb")) ??
        makePlaceholderBox(0x2a2622, new THREE.Vector3(0.6, 0.25, 0.7));
      this.spider = new GroundCreature(model, SPIDER, this.roam);
    }
    this.scene.add(this.spider.object);
  }

  update(dt: number): void {
    this.spider?.update(dt);
  }

  excite(): void {
    this.spider?.excite();
  }

  dispose(): void {
    disposeScene(this.scene);
  }
}

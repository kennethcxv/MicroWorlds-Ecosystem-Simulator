/**
 * Assembles the experimental 3D aquarium: procedural glass box + black rim,
 * water (volume/surface/caustics), gravel substrate, the wooden cabinet as a
 * stand, plant + root decor, and the swimming fish. Decor uses the loaded GLBs
 * when available and falls back to placeholder geometry otherwise.
 */
import * as THREE from "three";
import type { CameraConfig, HabitatScene } from "./ThreeHabitat";
import { disposeScene } from "./ThreeHabitat";
import { TANK, makeBounds, type TankBounds } from "./ThreeBounds";
import {
  makeGlassMaterial,
  makeRimMaterial,
  makeSubstrateMaterial,
  makeLights,
  tintUnderwater,
  FOG_COLOR,
} from "./ThreeMaterials";
import { Water } from "./ThreeWater";
import {
  loadTankModels,
  makePlaceholderFish,
  makePlaceholderBox,
  type LoadedModel,
} from "./ThreeAssetLoader";
import {
  Fish,
  SMALL_FISH,
  CENTERPIECE_FISH,
  type FishKindConfig,
} from "./ThreeFishController";
import { ThreeAquariumCreatures } from "./creatures/ThreeAquaticCreatures";
import type { TankSurfaceSpace } from "./creatures/ThreeSurfaceCreatures";
import { defaultAquariumPopulation } from "../../data/creatures/creatureRegistry";

export class ThreeTankScene implements HabitatScene {
  readonly scene = new THREE.Scene();
  readonly camera: CameraConfig = { fov: 33, pos: [0.42, 0.66, 3.05], look: [0, 0.58, 0] };
  private bounds: TankBounds = makeBounds();
  private water = new Water();
  private fish: Fish[] = [];
  private decor = new THREE.Group();
  private creatures: ThreeAquariumCreatures;
  /** Filled as decor lands — shrimp gather + otos rest around these. */
  private interest: THREE.Vector3[] = [];
  loaded = false;

  constructor() {
    this.scene.fog = new THREE.Fog(FOG_COLOR, 2.3, 5.0);
    this.scene.add(makeLights());
    this.buildGlass();
    this.buildSubstrate();
    this.scene.add(this.water.group);
    this.scene.add(this.decor);
    const space: TankSurfaceSpace = {
      hw: TANK.width / 2 - TANK.glass - 0.012,
      hd: TANK.depth / 2 - TANK.glass - 0.012,
      floorY: TANK.substrate + 0.002,
      topY: TANK.waterTop - 0.05,
      interest: this.interest,
    };
    this.creatures = new ThreeAquariumCreatures(this.bounds, space);
    this.scene.add(this.creatures.group);
  }

  async load(): Promise<void> {
    const models = await loadTankModels();
    this.buildDecor(models);
    this.buildFish(models.fishSmall, SMALL_FISH, 0x2f7be0);
    this.buildFish(models.fishCenterpiece, CENTERPIECE_FISH, 0xe06a3a);
    // The self-made creature batch: schools, grazers, snails + the daphnia
    // micro-layer, all data-driven from the registry.
    await this.creatures.load(defaultAquariumPopulation());
    try {
      Object.assign(globalThis, {
        __aquarium: {
          creatureCounts: (): Record<string, number> => this.creatures.counts(),
          creaturePositions: (id: string): [number, number, number][] =>
            this.creatures.positions(id as Parameters<ThreeAquariumCreatures["positions"]>[0]),
        },
      });
    } catch {
      /* non-browser */
    }
    this.loaded = true;
  }

  update(dt: number): void {
    this.water.update(dt);
    for (const f of this.fish) f.update(dt);
    this.creatures.update(dt);
  }

  /** Feeding response: all fish dart toward the upper-front water. */
  excite(): void {
    for (const f of this.fish) f.excite();
    this.creatures.excite();
  }

  dispose(): void {
    this.creatures.dispose();
    disposeScene(this.scene);
  }

  // ── construction ──────────────────────────────────────────────────────────

  private buildGlass(): void {
    const g = new THREE.Group();
    const glass = makeGlassMaterial();
    const { width: w, height: h, depth: d } = TANK;

    const pane = (gw: number, gh: number): THREE.PlaneGeometry =>
      new THREE.PlaneGeometry(gw, gh);

    const front = new THREE.Mesh(pane(w, h), glass);
    front.position.set(0, h / 2, d / 2);
    const back = new THREE.Mesh(pane(w, h), glass);
    back.position.set(0, h / 2, -d / 2);
    back.rotation.y = Math.PI;
    const left = new THREE.Mesh(pane(d, h), glass);
    left.position.set(-w / 2, h / 2, 0);
    left.rotation.y = Math.PI / 2;
    const right = new THREE.Mesh(pane(d, h), glass);
    right.position.set(w / 2, h / 2, 0);
    right.rotation.y = -Math.PI / 2;
    for (const m of [front, back, left, right]) {
      m.renderOrder = 10; // draw glass after the interior
      g.add(m);
    }

    // Black rim: top + bottom frames and corner pillars.
    const rimMat = makeRimMaterial();
    const t = 0.06;
    const rimRect = (y: number): void => {
      const a = new THREE.Mesh(new THREE.BoxGeometry(w + t, t, t), rimMat);
      a.position.set(0, y, d / 2);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w + t, t, t), rimMat);
      b.position.set(0, y, -d / 2);
      const c = new THREE.Mesh(new THREE.BoxGeometry(t, t, d + t), rimMat);
      c.position.set(w / 2, y, 0);
      const e = new THREE.Mesh(new THREE.BoxGeometry(t, t, d + t), rimMat);
      e.position.set(-w / 2, y, 0);
      g.add(a, b, c, e);
    };
    rimRect(h);
    rimRect(0);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(t, h, t), rimMat);
        pillar.position.set((sx * w) / 2, h / 2, (sz * d) / 2);
        g.add(pillar);
      }
    }

    this.scene.add(g);
  }

  private buildSubstrate(): void {
    const innerW = TANK.width - TANK.glass * 2;
    const innerD = TANK.depth - TANK.glass * 2;
    const mat = makeSubstrateMaterial();
    this.water.hookCaustics(mat); // animated caustic light on the gravel
    const bed = new THREE.Mesh(new THREE.BoxGeometry(innerW, TANK.substrate, innerD), mat);
    bed.position.set(0, TANK.substrate / 2, 0);
    this.scene.add(bed);

    // A scatter of pebbles for texture.
    const pebbleMat = new THREE.MeshStandardMaterial({ color: 0x5b4a36, roughness: 0.9 });
    for (let i = 0; i < 16; i++) {
      const r = 0.02 + Math.random() * 0.035;
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), pebbleMat);
      p.position.set(
        (Math.random() - 0.5) * innerW * 0.9,
        TANK.substrate - r * 0.3,
        (Math.random() - 0.5) * innerD * 0.9,
      );
      p.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.scene.add(p);
    }
  }

  private buildDecor(models: { aquarium: LoadedModel | null; plant: LoadedModel | null; root: LoadedModel | null }): void {
    // Wooden cabinet as the stand, sitting under the tank (top at y = 0).
    const cab =
      models.aquarium ?? makePlaceholderBox(0x4a3320, new THREE.Vector3(2, 1, 1.1));
    {
      const s = (TANK.width * 0.99) / Math.max(1e-3, cab.size.x);
      const o = cab.object;
      o.scale.setScalar(s);
      o.position.set(0, -(cab.size.y * s) / 2 - 0.02, 0);
      this.decor.add(o);
    }

    // Plant: back-left, rooted on the substrate.
    const plant =
      models.plant ?? makePlaceholderBox(0x2f7a3a, new THREE.Vector3(0.3, 0.6, 0.3));
    {
      const s = 0.6 / Math.max(1e-3, plant.size.y);
      const o = plant.object;
      o.scale.setScalar(s);
      o.position.set(-0.62, TANK.substrate + (plant.size.y * s) / 2 - 0.03, -0.26);
      tintUnderwater(o, 0.18);
      this.decor.add(o);
      this.interest.push(new THREE.Vector3(-0.62, TANK.substrate, -0.26));
    }

    // Root/log: hero hardscape, mid-tank, base sunk into the gravel.
    const root =
      models.root ?? makePlaceholderBox(0x6b4a2c, new THREE.Vector3(0.9, 0.35, 0.4));
    {
      const s = 0.74 / Math.max(1e-3, root.size.x);
      const o = root.object;
      o.scale.setScalar(s);
      const h = root.size.y * s;
      o.position.set(0.22, TANK.substrate + h * 0.32 - 0.03, -0.12);
      o.rotation.set(0, 0.6, 0.04);
      tintUnderwater(o, 0.14);
      this.decor.add(o);
      this.interest.push(new THREE.Vector3(0.22, TANK.substrate, -0.12));
    }
  }

  private buildFish(model: LoadedModel | null, cfg: FishKindConfig, fallbackColor: number): void {
    const src = model ?? makePlaceholderFish(fallbackColor);
    for (let i = 0; i < cfg.count; i++) {
      const fish = new Fish(src, cfg, this.bounds);
      this.fish.push(fish);
      this.scene.add(fish.object);
    }
  }
}

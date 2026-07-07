/**
 * Assembles the 3D aquarium — the player-facing FISH HABITAT: procedural glass
 * box + black rim, water (volume/surface/caustics + a sim-driven CLARITY mood),
 * gravel substrate, the wooden cabinet as a stand, plant + root decor, the
 * swimming fish and the registry-driven creature layer. Decor uses the loaded
 * GLBs when available and falls back to placeholder geometry otherwise.
 *
 * Care hooks (AquariumHooks) let the fish HUD feed REAL sinking food the fish
 * chase and eat, sparkle-scrub the front glass, vacuum the gravel and pulse a
 * water change — the SIM owns all numbers; this scene owns the visuals.
 */
import * as THREE from "three";
import type { AquariumHooks, CameraConfig, CameraLimits, FishFoodKind, HabitatScene } from "./ThreeHabitat";
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
import { defaultAquariumPopulation, getCreature } from "../../data/creatures/creatureRegistry";

interface FoodBit {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  /** Seconds left once resting on the gravel (then it fades away). */
  restLife: number;
  resting: boolean;
  /** True once this bit owns a CLONED material for its fade-out. */
  fading: boolean;
  wobble: number;
}

interface FxSprite {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

const MAX_FOOD_BITS = 48;
const EAT_RADIUS = 0.07;

const FOOD_STYLE: Record<FishFoodKind, { color: number; size: number; sink: number }> = {
  flakes: { color: 0xd9a066, size: 0.011, sink: 0.055 },
  pellets: { color: 0x6b4a2c, size: 0.014, sink: 0.11 },
  bloodworms: { color: 0xa03a2a, size: 0.012, sink: 0.08 },
};

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

  // Care-hook state.
  private foodGroup = new THREE.Group();
  private foodBits: FoodBit[] = [];
  private foodGeo = new THREE.SphereGeometry(1, 8, 6);
  private foodMats: Record<FishFoodKind, THREE.MeshStandardMaterial>;
  private fx: FxSprite[] = [];
  private fxGroup = new THREE.Group();
  private fxTexture: THREE.Texture | null = null;
  /** Water clarity 0 murky … 1 crystal (eases toward `clarityTarget`). */
  private clarity = 1;
  private clarityTarget = 1;
  /** Brief “fresh water” sparkle boost after a water change. */
  private freshPulse = 0;
  private eatScratch: THREE.Vector3[] = [];
  private hooks: AquariumHooks;

  constructor() {
    this.scene.fog = new THREE.Fog(FOG_COLOR, 2.3, 5.0);
    this.scene.add(makeLights());
    this.buildGlass();
    this.buildSubstrate();
    this.scene.add(this.water.group);
    this.scene.add(this.decor);
    this.scene.add(this.foodGroup);
    this.scene.add(this.fxGroup);
    const space: TankSurfaceSpace = {
      hw: TANK.width / 2 - TANK.glass - 0.012,
      hd: TANK.depth / 2 - TANK.glass - 0.012,
      floorY: TANK.substrate + 0.002,
      topY: TANK.waterTop - 0.05,
      interest: this.interest,
    };
    this.creatures = new ThreeAquariumCreatures(this.bounds, space);
    this.scene.add(this.creatures.group);

    this.foodMats = {
      flakes: new THREE.MeshStandardMaterial({ color: FOOD_STYLE.flakes.color, roughness: 0.9 }),
      pellets: new THREE.MeshStandardMaterial({ color: FOOD_STYLE.pellets.color, roughness: 0.95 }),
      bloodworms: new THREE.MeshStandardMaterial({ color: FOOD_STYLE.bloodworms.color, roughness: 0.8 }),
    };

    this.hooks = {
      feed: (kind, count, atX) => this.dropFood(kind, count, atX ?? 0),
      foodBitsLive: () => this.foodBits.length,
      scrubFxAt: (x, y) => this.spawnFx(x, y, TANK.depth / 2 - TANK.glass - 0.01, 0xcdeee6, 3, 0.06),
      vacuumFxAt: (x, z) => this.spawnFloorPuff(x, z),
      waterChangeFx: () => {
        this.freshPulse = 1;
        for (let i = 0; i < 14; i++) {
          this.spawnFx(
            (Math.random() - 0.5) * (TANK.width * 0.7),
            TANK.substrate + Math.random() * (TANK.waterTop - TANK.substrate) * 0.9,
            (Math.random() - 0.5) * (TANK.depth * 0.6),
            0xbfeaf5,
            1,
            0.05,
            0.16,
          );
        }
      },
      setWaterMood: (clarity01) => {
        this.clarityTarget = THREE.MathUtils.clamp(clarity01, 0, 1);
      },
      glassPane: () => ({
        z: TANK.depth / 2,
        cx: 0,
        cy: (TANK.waterTop + TANK.substrate) / 2,
        w: TANK.width - TANK.glass * 2,
        h: TANK.waterTop - TANK.substrate,
      }),
      floorRect: () => ({
        y: TANK.substrate,
        hw: TANK.width / 2 - TANK.glass,
        hd: TANK.depth / 2 - TANK.glass,
      }),
      population: () => this.population(),
    };
  }

  /** Anchored eco-center viewing (like the vivarium): lean around the FIXED
   *  tank — a yaw window, a sane pitch band, zoom limits and a pivot clamped
   *  inside the glass. Photo Mode restores the free orbit. */
  cameraLimits(): CameraLimits {
    return {
      minAzimuth: -0.95,
      maxAzimuth: 0.95,
      minPolar: 0.62,
      maxPolar: 1.52,
      minDistance: 1.35,
      maxDistance: 4.6,
      target: {
        minX: -TANK.width * 0.38,
        maxX: TANK.width * 0.38,
        minY: TANK.substrate + 0.05,
        maxY: TANK.waterTop,
        minZ: -TANK.depth * 0.3,
        maxZ: TANK.depth * 0.3,
      },
    };
  }

  getAquarium(): AquariumHooks {
    return this.hooks;
  }

  /** The gravel surface height — lets the renderer's pointer→ground raycast
   *  land tools exactly on the substrate (not the y=0 base plane). */
  surfaceYAt(): number {
    return TANK.substrate;
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
          foodBits: (): number => this.foodBits.length,
          feed: (kind: string, count: number): number => this.dropFood((kind as FishFoodKind) ?? "flakes", count, 0),
          clarity: (): number => +this.clarity.toFixed(3),
          population: (): { id: string; label: string; count: number }[] => this.population(),
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
    this.updateFood(dt);
    this.updateFx(dt);
    this.updateMood(dt);
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

  // ── Care hooks ────────────────────────────────────────────────────────────

  private dropFood(kind: FishFoodKind, count: number, atX01: number): number {
    const style = FOOD_STYLE[kind] ?? FOOD_STYLE.flakes;
    const cx = THREE.MathUtils.clamp(atX01, -1, 1) * (TANK.width / 2 - TANK.glass - 0.15);
    let placed = 0;
    for (let i = 0; i < count; i++) {
      if (this.foodBits.length >= MAX_FOOD_BITS) break;
      const m = new THREE.Mesh(this.foodGeo, this.foodMats[kind] ?? this.foodMats.flakes);
      const s = style.size * (0.8 + Math.random() * 0.5);
      m.scale.set(s, kind === "flakes" ? s * 0.45 : s, kind === "bloodworms" ? s * 1.9 : s);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.position.set(
        cx + (Math.random() - 0.5) * 0.34,
        TANK.waterTop - 0.015 - Math.random() * 0.02,
        (Math.random() - 0.5) * (TANK.depth * 0.4),
      );
      this.foodGroup.add(m);
      this.foodBits.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.02, -style.sink * (0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.02),
        restLife: 14 + Math.random() * 6,
        resting: false,
        fading: false,
        wobble: Math.random() * Math.PI * 2,
      });
      placed++;
    }
    if (placed > 0) this.excite();
    return placed;
  }

  private updateFood(dt: number): void {
    if (!this.foodBits.length) return;
    // Everything with a mouth: hero fish + the schooling creatures.
    this.eatScratch.length = 0;
    for (const f of this.fish) this.eatScratch.push(f.object.position);
    this.creatures.fishPositions(this.eatScratch);

    const floorY = TANK.substrate + 0.012;
    for (let i = this.foodBits.length - 1; i >= 0; i--) {
      const b = this.foodBits[i];
      b.wobble += dt * 3;
      if (!b.resting) {
        b.vel.x += Math.sin(b.wobble) * 0.004 * dt;
        b.vel.z += Math.cos(b.wobble * 0.8) * 0.004 * dt;
        b.mesh.position.addScaledVector(b.vel, dt);
        b.mesh.rotation.x += dt * 0.8;
        if (b.mesh.position.y <= floorY) {
          b.mesh.position.y = floorY;
          b.resting = true;
        }
      } else {
        b.restLife -= dt;
        if (b.restLife < 2) {
          // Fade on a PRIVATE material clone — the per-kind masters are shared,
          // so mutating them would dim every other bit of the same food.
          let mat = b.mesh.material as THREE.MeshStandardMaterial;
          if (!b.fading) {
            mat = mat.clone();
            mat.transparent = true;
            b.mesh.material = mat;
            b.fading = true;
          }
          mat.opacity = Math.max(0, b.restLife / 2);
        }
        if (b.restLife <= 0) {
          this.removeFoodBit(i);
          continue;
        }
      }
      // Fish mouths.
      for (const p of this.eatScratch) {
        if (p.distanceToSquared(b.mesh.position) < EAT_RADIUS * EAT_RADIUS) {
          this.spawnFx(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, 0xdfeecb, 1, 0.03, 0.05);
          this.removeFoodBit(i);
          break;
        }
      }
    }
  }

  private removeFoodBit(i: number): void {
    const b = this.foodBits[i];
    // Fading bits own a private material clone — dispose it with the bit.
    if (b.fading) (b.mesh.material as THREE.MeshStandardMaterial).dispose();
    this.foodGroup.remove(b.mesh);
    this.foodBits.splice(i, 1);
  }

  private fxTex(): THREE.Texture {
    if (this.fxTexture) return this.fxTexture;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.fxTexture = new THREE.CanvasTexture(c);
    return this.fxTexture;
  }

  /** A soft rising sprite burst (scrub sparkle / eat blip / fresh bubbles). */
  private spawnFx(x: number, y: number, z: number, color: number, count = 3, size = 0.05, rise = 0.1): void {
    if (this.fx.length > 90) return; // hard cap
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.fxTex(),
        color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.85,
      });
      const s = new THREE.Sprite(mat);
      const sc = size * (0.7 + Math.random() * 0.7);
      s.scale.set(sc, sc, sc);
      s.position.set(x + (Math.random() - 0.5) * 0.05, y + (Math.random() - 0.5) * 0.05, z + (Math.random() - 0.5) * 0.02);
      this.fxGroup.add(s);
      this.fx.push({
        sprite: s,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.05, rise * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * 0.03),
        life: 0.7 + Math.random() * 0.5,
        maxLife: 1.2,
      });
    }
  }

  /** Gravel-vacuum puff: dusty motes kicked up then settling. */
  private spawnFloorPuff(x: number, z: number): void {
    if (this.fx.length > 90) return;
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.fxTex(),
        color: 0x8a744f,
        transparent: true,
        depthWrite: false,
        opacity: 0.5,
      });
      const s = new THREE.Sprite(mat);
      const sc = 0.05 * (0.6 + Math.random());
      s.scale.set(sc, sc, sc);
      s.position.set(x + (Math.random() - 0.5) * 0.08, TANK.substrate + 0.02 + Math.random() * 0.03, z + (Math.random() - 0.5) * 0.08);
      this.fxGroup.add(s);
      this.fx.push({
        sprite: s,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.08, 0.05 + Math.random() * 0.06, (Math.random() - 0.5) * 0.08),
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
      });
    }
  }

  private updateFx(dt: number): void {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const p = this.fx[i];
      p.life -= dt;
      if (p.life <= 0) {
        (p.sprite.material as THREE.SpriteMaterial).map = null;
        (p.sprite.material as THREE.SpriteMaterial).dispose();
        this.fxGroup.remove(p.sprite);
        this.fx.splice(i, 1);
        continue;
      }
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.y *= Math.pow(0.5, dt);
      (p.sprite.material as THREE.SpriteMaterial).opacity = 0.85 * Math.min(1, p.life / (p.maxLife * 0.6));
    }
  }

  /** Ease water clarity toward the sim's mood: murky water pulls the fog in
   *  and greens it; a fresh change briefly sparkles clearer than normal.
   *  Even a filthy tank stays READABLE — the murk is a tint, not a wall. */
  private updateMood(dt: number): void {
    if (this.freshPulse > 0) this.freshPulse = Math.max(0, this.freshPulse - dt * 0.25);
    const target = Math.min(1, this.clarityTarget + this.freshPulse * 0.2);
    this.clarity += (target - this.clarity) * Math.min(1, dt * 1.6);
    const fog = this.scene.fog as THREE.Fog | null;
    if (!fog) return;
    const c = this.clarity;
    fog.near = THREE.MathUtils.lerp(1.7, 2.3, c);
    fog.far = THREE.MathUtils.lerp(3.9, 5.0, c);
    fog.color.set(FOG_COLOR).lerp(new THREE.Color(0x31584a), (1 - c) * 0.45);
  }

  /** The LIVE roster — exactly what swims in the scene right now. */
  private population(): { id: string; label: string; count: number }[] {
    const out: { id: string; label: string; count: number }[] = [];
    const heroSmall = this.fish.filter((f) => f.kind === SMALL_FISH).length;
    const heroCenter = this.fish.length - heroSmall;
    if (heroSmall) out.push({ id: "goldfish", label: "Fancy Goldfish", count: heroSmall });
    if (heroCenter) out.push({ id: "betta_3d", label: "Betta", count: heroCenter });
    const counts = this.creatures.counts();
    for (const [id, count] of Object.entries(counts)) {
      let label = id;
      try {
        label = getCreature(id as Parameters<typeof getCreature>[0]).displayName;
      } catch {
        /* unknown id — keep raw */
      }
      out.push({ id, label, count });
    }
    return out;
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

    // Root/log: hero hardscape, mid-tank, base sunk into the gravel. Scale is
    // capped by HEIGHT too — the upright twisted root must stay under the rim.
    const root =
      models.root ?? makePlaceholderBox(0x6b4a2c, new THREE.Vector3(0.9, 0.35, 0.4));
    {
      const s = Math.min(0.74 / Math.max(1e-3, root.size.x), 0.72 / Math.max(1e-3, root.size.y));
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

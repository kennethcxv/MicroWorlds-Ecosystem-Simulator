/**
 * RAINFOREST PALUDARIUM — "Emerald Hollow", the colorful frog's habitat scene.
 *
 * Deliberately LEANER than the gecko flagship (no decorate editor, no terrain
 * sculpting in v1) but built from the same load-bearing pieces so nothing here
 * is a fork: the shell comes from EnclosureSpec + buildVivariumShell (jungle
 * back panel), the floor is a REAL painted moss/leaf-litter/bioactive
 * composite (HabitatMaterialMap + MaterialFloor), the decor is authored
 * catalog PlacedObjects loaded through the shared decor pipeline, and the
 * animal is the commissioned rigged frog on its ThreeFrogHopper controller at
 * habitat world scale. New here: a shallow POND the frog soaks in (hydration),
 * a MISTING system (spray particles + humidity boost that decays), live
 * feeder crickets the frog genuinely hunts, and the pure FrogNeedsSystem
 * ticking hunger/hydration/stress/health. State persists via HabitatSaveLoad
 * under its own id.
 */
import * as THREE from "three";
import type { CameraConfig, CameraLimits, FrogHooks, FrogHudState, HabitatScene } from "./ThreeHabitat";
import { disposeScene } from "./ThreeHabitat";
import {
  FROG_HABITAT_ID,
  FROG_POND,
  FROG_WORLD_SCALE,
  insidePond,
  makeFrogHabitatState,
  paintFrogFloor,
  rehydrateFrogLayout,
} from "../../habitats/frog/FrogHabitatData";
import {
  FROG_NEEDS,
  currentHumidity,
  decayMist,
  feedFrog,
  frogComfort,
  sprayMist,
  updateFrogNeeds,
  type HumidityModel,
} from "../../habitats/frog/FrogNeedsSystem";
import type { HabitatState } from "../../habitats/HabitatTypes";
import { CollisionWorld } from "../../habitats/HabitatCollision";
import { enclosureSpec, type EnclosureSpec } from "../../habitats/EnclosureSpec";
import { loadHabitat, saveHabitat } from "../../habitats/HabitatSaveLoad";
import { logHabitatEvent } from "../../habitats/HabitatState";
import { computeScores } from "../../habitats/HabitatStats";
import { coverageFractions, ensureMaterialMap } from "../../habitats/HabitatMaterialMap";
import { terrainById } from "../../data/terrains";
import { getCreature } from "../../data/creatures/creatureRegistry";
import { buildVivariumShell, type VivariumShell } from "./ThreeVivariumShell";
import { MaterialFloor, makeRockMesh, DEFAULT_SAND_PALETTE } from "./ThreeSandTexture";
import { buildPlaceholderObject, loadTerrariumDecor, disposeObject } from "./ThreeTerrarium";
import { ThreeFrogHopper } from "./creatures/ThreeFrogHopper";
import { loadCreature, type CreatureModel } from "./creatures/ThreeCreatureLoader";

const TAU = Math.PI * 2;

/** Deterministic PRNG for the scene dressing (same jungle every load). */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface LooseCricket {
  model: CreatureModel;
  x: number;
  z: number;
  heading: number;
  /** Seconds until the next behaviour change. */
  t: number;
  moving: boolean;
}

const MAX_LOOSE_CRICKETS = 6;
const MIST_SPRAY_SECONDS = 2.6;
const CRICKET_EAT_RADIUS = 0.14;

export class ThreeFrogScene implements HabitatScene {
  readonly scene = new THREE.Scene();
  readonly camera: CameraConfig;

  private state: HabitatState;
  private spec: EnclosureSpec;
  private shell: VivariumShell;
  private matFloor: MaterialFloor;
  private floorMesh: THREE.Mesh;
  private plantGroup = new THREE.Group();

  // Pond.
  private pondWater!: THREE.Mesh;
  private pondT = 0;

  // Misting.
  private humidity: HumidityModel;
  private mistT = 0;
  private mistPoints!: THREE.Points;
  private mistVel: number[] = [];
  private mistFog!: THREE.Mesh;

  private frogs: ThreeFrogHopper;
  private crickets: LooseCricket[] = [];
  /** Hard-decor collision (built AFTER the GLBs load, so footprints are the
   *  measured contours). The frog's hop landings are nudged out of it. */
  private world: CollisionWorld | null = null;
  private frogRadius: number;

  private huntT = 0;
  private saveT = 0;
  private scoreCached: number;
  private disposed = false;

  constructor() {
    this.state = loadHabitat(FROG_HABITAT_ID) ?? makeFrogHabitatState();
    rehydrateFrogLayout(this.state.layout);
    const frog = this.state.animals[0];
    frog.needs.hydration ??= 75;

    const layout = this.state.layout;
    this.spec = enclosureSpec(layout.dimensions);
    this.camera = { fov: layout.camera.fov, pos: this.spec.cameraHome, look: this.spec.cameraTarget };

    // Deep-jungle atmosphere: green-tinted fog + soft canopy lighting.
    this.scene.fog = new THREE.Fog(0x14231a, 6.5, 12);
    this.scene.add(this.makeJungleLights());

    const substrateColor = terrainById(layout.substrate.terrainId ?? "mossy_soil")?.color ?? layout.substrate.color;
    this.shell = buildVivariumShell(this.scene, this.spec, {
      substrateColor,
      lampAnchor: null, // no desert basking lamp — the canopy tube lights it
      uvb: true, // reads as the canopy light tube under the screen top
      gauges: layout.equipment
        .filter((e) => e.kind === "thermometer" || e.kind === "hygrometer")
        .map((e) => ({ x: e.position[0], y: e.position[1], z: e.position[2] })),
      backPanel: "rainforest",
    });

    // ── Painted floor: mossy soil + leaf-litter drifts + bioactive pockets ──
    const map = ensureMaterialMap(this.state.materials, layout.substrate.terrainId ?? "mossy_soil");
    if (!this.state.materials) paintFrogFloor(map, layout.dimensions); // fresh floor gets its drifts
    this.state.materials = map;
    this.matFloor = new MaterialFloor(
      layout.dimensions,
      (id) => terrainById(id)?.palette ?? DEFAULT_SAND_PALETTE,
      this.spec.sandInset,
    );
    this.matFloor.paint(map);
    this.floorMesh = this.buildFloor();
    this.scene.add(this.floorMesh);

    this.buildPond();
    this.buildMist();
    this.plantGroup.add(...this.buildJunglePlants());
    this.scene.add(this.plantGroup);

    // Authored decor: placeholders now (direct scene children so the shared
    // loader can swap the real GLBs in by objectId during load()).
    for (const o of layout.objects) this.scene.add(buildPlaceholderObject(o));

    // Ambient humidity model: substrate coverage sets the resting base; a
    // persisted wetter reading restores as remaining mist boost.
    this.humidity = { base: this.substrateHumidityBase(), mistBoost: 0 };
    const saved = this.state.environment.humidity;
    this.humidity.mistBoost = Math.max(0, saved - (this.humidity.base + 8));
    this.state.environment.humidity = currentHumidity(this.humidity);

    this.frogRadius = (getCreature("colorful_frog").collision.radius ?? 0.024) * FROG_WORLD_SCALE;
    this.frogs = new ThreeFrogHopper(
      {
        minX: this.spec.walk.minX,
        maxX: this.spec.walk.maxX,
        minZ: this.spec.walk.minZ,
        maxZ: this.spec.walk.maxZ,
        groundY: (x, z) => this.groundY(x, z),
        shelters: () =>
          layout.objects
            .filter((o) => o.category === "plant" || o.category === "hide" || o.category === "rock")
            .map((o) => ({ x: o.position[0], z: o.position[2] })),
        threat: () => null,
        onEat: (x, z) => this.consumeCricketAt(x, z),
        freeSpot: (x, z) => this.world?.freePoint(x, z, this.frogRadius) ?? { x, z },
      },
      { scale: FROG_WORLD_SCALE },
    );
    this.scene.add(this.frogs.group);

    this.scoreCached = computeScores(layout).overall;

    // Read-only QA hooks (Playwright verification).
    Object.assign(globalThis, {
      __frog: {
        state: () => this.readState(),
        frogAt: () => this.frogs.primary(),
        frogStates: () => this.frogs.states(),
        crickets: () => this.crickets.map((c) => ({ x: c.x, z: c.z })),
        feed: (n: number) => this.feed(n ?? 3),
        mist: () => this.mist(),
        humidity: () => this.state.environment.humidity,
        inPond: () => this.frogInPond(),
        save: () => saveHabitat(this.state),
      },
    });
  }

  // ── Scene dressing ─────────────────────────────────────────────────────────

  private makeJungleLights(): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.HemisphereLight(0xe8f4e0, 0x1c2a1c, 0.6));
    const key = new THREE.DirectionalLight(0xf2ffe8, 0.85);
    key.position.set(1.2, 3.6, 1.8);
    g.add(key);
    const fill = new THREE.DirectionalLight(0xa8ccb8, 0.4);
    fill.position.set(-2.0, 1.4, -1.2);
    g.add(fill);
    // Canopy light pouring straight down through the screen top.
    const canopy = new THREE.SpotLight(0xdfffce, 4.2, 7, Math.PI / 3.4, 0.65, 1.2);
    canopy.position.set(0, this.specSafeTop(), 0.05);
    canopy.target.position.set(0, 0.1, 0.05);
    g.add(canopy, canopy.target);
    g.add(new THREE.AmbientLight(0x2c3a30, 0.4));
    return g;
  }

  private specSafeTop(): number {
    // Called before this.spec exists is impossible (constructor order), but a
    // fallback keeps it total.
    return this.spec ? this.spec.dims.height + 0.5 : 2.5;
  }

  private buildFloor(): THREE.Mesh {
    const d = this.state.layout.dimensions;
    const innerW = d.width - d.glass * 2 - this.spec.sandInset * 2;
    const innerD = d.depth - d.glass * 2 - this.spec.sandInset * 2;
    const geo = new THREE.PlaneGeometry(innerW, innerD, 72, 48);
    geo.rotateX(-Math.PI / 2);
    // Millimetre undulation so the soil doesn't read as a flat card — plus a
    // REAL basin scooped out where the pond sits (the water surface floats
    // inside it; without the depression the floor plane would roof the pool).
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const p = FROG_POND;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let y = (Math.sin(x * 5.1 + z * 2.7) * 0.5 + Math.sin(x * 2.3 - z * 6.1) * 0.5) * 0.007;
      const dx = (x - p.x) / p.rx;
      const dz = (z - p.z) / p.rz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1.25) {
        const k = Math.min(1, Math.max(0, 1.25 - d2) / 0.85);
        y -= (p.dip + 0.016) * k;
      }
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      map: this.matFloor.texture,
      bumpMap: this.matFloor.bumpTexture,
      bumpScale: 2.2,
      roughness: 0.96,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = d.substrateTop + 0.002;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildPond(): void {
    const p = FROG_POND;
    const top = this.state.layout.dimensions.substrateTop;
    const rng = mulberry(0x9f21);

    // Dark basin lining the scooped floor so the pool reads deep.
    const basin = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshStandardMaterial({ color: 0x11201a, roughness: 0.9 }),
    );
    basin.rotation.x = -Math.PI / 2;
    basin.scale.set(p.rx * 1.04, p.rz * 1.04, 1);
    basin.position.set(p.x, top - p.dip - 0.011, p.z);
    this.scene.add(basin);

    // The water surface — softly emissive teal, sitting INSIDE the basin just
    // below the floor line (the floor mesh is scooped under it).
    this.pondWater = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshPhysicalMaterial({
        color: 0x2e6b62,
        emissive: 0x0d2b28,
        roughness: 0.12,
        metalness: 0,
        transparent: true,
        opacity: 0.82,
        transmission: 0.25,
      }),
    );
    this.pondWater.rotation.x = -Math.PI / 2;
    this.pondWater.scale.set(p.rx * 1.0, p.rz * 1.0, 1);
    this.pondWater.position.set(p.x, top - p.dip + 0.004, p.z);
    this.pondWater.renderOrder = 3;
    this.scene.add(this.pondWater);

    // A ring of river stones around the rim (resting ON the floor — keep the
    // rock helper's rest-height offset when placing).
    const stones = new THREE.Group();
    const tones = [0x5c6154, 0x6d7261, 0x4c5148, 0x7a7f6c];
    const n = 15;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng() * 0.25;
      const r = 0.02 + rng() * 0.028;
      const rock = makeRockMesh(r, tones[i % tones.length], rng);
      const restY = rock.position.y;
      rock.position.set(p.x + Math.cos(a) * (p.rx + 0.03), top - 0.006 + restY, p.z + Math.sin(a) * (p.rz * 1.12 + 0.03));
      rock.rotation.y = rng() * TAU;
      stones.add(rock);
    }
    this.scene.add(stones);
  }

  private buildMist(): void {
    const d = this.state.layout.dimensions;
    // Nozzle fixtures under the screen top.
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x2a3236, roughness: 0.5, metalness: 0.5 });
    for (const nx of [-d.width * 0.22, d.width * 0.22]) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.05, 10), nozzleMat);
      body.position.set(nx, d.height - 0.03, -d.depth * 0.18);
      this.scene.add(body);
    }
    // Falling spray particles (recycled while a spray runs).
    const N = 260;
    const positions = new Float32Array(N * 3);
    this.mistVel = [];
    const rng = mulberry(0x33d1);
    for (let i = 0; i < N; i++) {
      positions[i * 3] = (rng() - 0.5) * d.width * 0.8;
      positions[i * 3 + 1] = d.height - rng() * 0.4;
      positions[i * 3 + 2] = (rng() - 0.5) * d.depth * 0.8;
      this.mistVel.push(0.9 + rng() * 1.1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xd8ecdf,
      size: 0.02,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.mistPoints = new THREE.Points(geo, mat);
    this.mistPoints.renderOrder = 8;
    this.scene.add(this.mistPoints);

    // A soft fog sheet that breathes with the mist boost.
    this.mistFog = new THREE.Mesh(
      new THREE.PlaneGeometry(d.width * 0.9, d.height * 0.55),
      new THREE.MeshBasicMaterial({ color: 0xcfe6d4, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.mistFog.position.set(0, d.height * 0.5, 0);
    this.mistFog.renderOrder = 7;
    this.scene.add(this.mistFog);
  }

  /** Procedural jungle dressing: broadleaf plants, arched ferns and moss
   *  cushions (visual only — the frog shelters at the AUTHORED decor). */
  private buildJunglePlants(): THREE.Object3D[] {
    const rng = mulberry(0x51e7);
    const top = this.state.layout.dimensions.substrateTop;
    const out: THREE.Object3D[] = [];

    const leafMat = (c: number): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });

    const broadleaf = (x: number, z: number, h: number, tone: number): THREE.Group => {
      const g = new THREE.Group();
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.014, h, 6),
        new THREE.MeshStandardMaterial({ color: 0x2c4a2c, roughness: 0.8 }),
      );
      stem.position.y = h / 2;
      g.add(stem);
      const leaves = 5 + Math.floor(rng() * 3);
      for (let i = 0; i < leaves; i++) {
        const L = h * (0.55 + rng() * 0.4);
        const geo = new THREE.PlaneGeometry(L * 0.34, L, 1, 6);
        // Curve the blade along its length + taper the tip.
        const posA = geo.attributes.position as THREE.BufferAttribute;
        for (let v = 0; v < posA.count; v++) {
          const yy = posA.getY(v) / L + 0.5; // 0..1 along the blade
          posA.setZ(v, Math.sin(yy * Math.PI * 0.9) * L * 0.18);
          posA.setX(v, posA.getX(v) * (1 - yy * 0.55));
        }
        posA.needsUpdate = true;
        geo.computeVertexNormals();
        const leaf = new THREE.Mesh(geo, leafMat(tone));
        leaf.position.y = h * (0.68 + rng() * 0.3);
        leaf.rotation.set(-0.5 - rng() * 0.7, (i / leaves) * TAU + rng() * 0.5, 0);
        g.add(leaf);
      }
      g.position.set(x, top, z);
      g.rotation.y = rng() * TAU;
      return g;
    };

    const fern = (x: number, z: number, s: number): THREE.Group => {
      const g = new THREE.Group();
      const fronds = 7;
      for (let i = 0; i < fronds; i++) {
        const L = s * (0.7 + rng() * 0.5);
        const geo = new THREE.PlaneGeometry(L * 0.16, L, 1, 8);
        const posA = geo.attributes.position as THREE.BufferAttribute;
        for (let v = 0; v < posA.count; v++) {
          const yy = posA.getY(v) / L + 0.5;
          posA.setZ(v, Math.sin(yy * Math.PI * 0.55) * L * 0.5); // arch outward
          posA.setX(v, posA.getX(v) * (1 - yy * 0.8) * (1 + Math.sin(yy * 34) * 0.35)); // leaflet nibbles
        }
        posA.needsUpdate = true;
        geo.computeVertexNormals();
        const frond = new THREE.Mesh(geo, leafMat(0x3f7a44));
        frond.rotation.set(-0.9, (i / fronds) * TAU, 0);
        g.add(frond);
      }
      g.position.set(x, top, z);
      return g;
    };

    const mossTuft = (x: number, z: number, r: number): THREE.Mesh => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(r, 8, 6, 0, TAU, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x4c7a3c, roughness: 1 }),
      );
      m.scale.y = 0.45 + rng() * 0.2;
      m.position.set(x, top, z);
      return m;
    };

    // Back + side planting, clear of the pond and the open mid-floor.
    out.push(broadleaf(-0.86, -0.5, 0.86, 0x2f6e3c));
    out.push(broadleaf(0.2, -0.6, 1.0, 0x387a44));
    out.push(broadleaf(0.88, 0.05, 0.7, 0x2a6136));
    out.push(fern(-0.5, -0.58, 0.5));
    out.push(fern(-0.88, 0.1, 0.42));
    for (let i = 0; i < 9; i++) {
      const x = -0.9 + rng() * 1.8;
      const z = -0.62 + rng() * 1.24;
      if (insidePond(x, z)) continue;
      out.push(mossTuft(x, z, 0.035 + rng() * 0.05));
    }
    return out;
  }

  // ── World queries ──────────────────────────────────────────────────────────

  private groundY(x: number, z: number): number {
    const top = this.state.layout.dimensions.substrateTop;
    return insidePond(x, z) ? top - FROG_POND.dip : top;
  }

  private frogInPond(): boolean {
    const p = this.frogs.primary();
    return !!p && insidePond(p.x, p.z);
  }

  private substrateHumidityBase(): number {
    // Coverage-weighted humidityBase over the painted floor (mossy soil ≈ 46,
    // leaf litter 45, bioactive 46 — a wet-forest floor rests in the mid-50s
    // once the pond bonus lands on top).
    const map = this.state.materials;
    if (!map) return terrainById("mossy_soil")?.humidityBase ?? 46;
    let base = 0;
    for (const [id, frac] of coverageFractions(map)) {
      base += (terrainById(id)?.humidityBase ?? 42) * frac;
    }
    return Math.round(base);
  }

  // ── HabitatScene ───────────────────────────────────────────────────────────

  async load(): Promise<void> {
    // Real GLBs swap in over the placeholders (shared decor pipeline), which
    // also MEASURES each mesh's true footprint — the collision world compiled
    // right after therefore hugs the visible decor, not authoring guesses.
    await loadTerrariumDecor(this.scene, this.state.layout);
    this.world = CollisionWorld.fromLayout(this.state.layout, this.spec.walk, {
      heightAt: (x, z) => this.groundY(x, z) - this.state.layout.dimensions.substrateTop,
      slopeAt: () => 0,
    });
    await this.frogs.spawn(1);
  }

  cameraLimits(): CameraLimits {
    const s = this.spec;
    return {
      minAzimuth: -0.75,
      maxAzimuth: 0.75,
      minPolar: 0.55,
      maxPolar: 1.5,
      minDistance: 1.6,
      maxDistance: 6.5,
      target: {
        minX: s.interior.minX * 0.85,
        maxX: s.interior.maxX * 0.85,
        minY: 0.05,
        maxY: s.interior.topY * 0.85,
        minZ: s.interior.minZ * 0.9,
        maxZ: s.interior.maxZ * 0.9,
      },
    };
  }

  update(dt: number): void {
    const step = Math.min(0.05, dt);
    const env = this.state.environment;
    const frog = this.state.animals[0];

    this.frogs.update(step);
    this.tickCrickets(step);

    // The frog hunts on its own when hungry: every few seconds it eyes the
    // nearest loose cricket and hops after it.
    this.huntT -= step;
    if (this.huntT <= 0) {
      this.huntT = 2.6;
      if (frog.needs.hunger < 68 && this.crickets.length) {
        const p = this.frogs.primary();
        if (p) {
          let best: LooseCricket | null = null;
          let bd = Infinity;
          for (const c of this.crickets) {
            const d = Math.hypot(c.x - p.x, c.z - p.z);
            if (d < bd) {
              bd = d;
              best = c;
            }
          }
          if (best) this.frogs.offerFood(best.x, best.z);
        }
      }
    }

    // Misting: particles fall while the spray runs; the humidity boost decays.
    if (this.mistT > 0) {
      this.mistT = Math.max(0, this.mistT - step);
      const pos = this.mistPoints.geometry.attributes.position as THREE.BufferAttribute;
      const d = this.state.layout.dimensions;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - this.mistVel[i] * step;
        if (y < d.substrateTop) y = d.height - Math.random() * 0.3;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
    (this.mistPoints.material as THREE.PointsMaterial).opacity = Math.min(0.55, this.mistT * 0.5);
    decayMist(this.humidity, step);
    (this.mistFog.material as THREE.MeshBasicMaterial).opacity = Math.min(0.14, this.humidity.mistBoost * 0.004);
    env.humidity = currentHumidity(this.humidity);

    // Cleanliness drifts gently toward "tended" in v1 (no cleaning tools yet).
    env.cleanliness = Math.min(100, Math.max(70, env.cleanliness + (88 - env.cleanliness) * 0.002 * step));

    // Pure needs tick (hydration loves the pond).
    updateFrogNeeds(frog, env, { inPond: this.frogInPond() }, step, FROG_NEEDS);

    // Pond shimmer.
    this.pondT += step;
    const mat = this.pondWater.material as THREE.MeshPhysicalMaterial;
    mat.opacity = 0.8 + Math.sin(this.pondT * 1.4) * 0.04;

    // Autosave.
    this.saveT += step;
    if (this.saveT >= 10) {
      this.saveT = 0;
      this.persist();
    }
  }

  private tickCrickets(dt: number): void {
    const frogAt = this.frogs.primary();
    for (const c of this.crickets) {
      c.t -= dt;
      // Flee burst when the frog looms.
      if (frogAt) {
        const d = Math.hypot(c.x - frogAt.x, c.z - frogAt.z);
        if (d < 0.4 && c.t < 1.2) {
          c.heading = Math.atan2(c.x - frogAt.x, c.z - frogAt.z) + (Math.random() - 0.5) * 0.8;
          c.moving = true;
          c.t = 0.5 + Math.random() * 0.5;
        }
      }
      if (c.t <= 0) {
        c.moving = !c.moving || Math.random() < 0.4;
        c.t = c.moving ? 0.5 + Math.random() * 1.2 : 0.8 + Math.random() * 2.4;
        if (c.moving) c.heading += (Math.random() - 0.5) * 1.8;
      }
      if (c.moving) {
        const speed = 0.14;
        let nx = c.x + Math.sin(c.heading) * speed * dt;
        let nz = c.z + Math.cos(c.heading) * speed * dt;
        // Stay on land and inside the walk rect.
        if (insidePond(nx, nz)) {
          c.heading += Math.PI * 0.5;
          nx = c.x;
          nz = c.z;
        }
        const w = this.spec.walk;
        if (nx < w.minX + 0.04 || nx > w.maxX - 0.04) {
          c.heading = -c.heading;
          nx = c.x;
        }
        if (nz < w.minZ + 0.04 || nz > w.maxZ - 0.04) {
          c.heading = Math.PI - c.heading;
          nz = c.z;
        }
        c.x = nx;
        c.z = nz;
      }
      c.model.root.position.set(c.x, this.groundY(c.x, c.z), c.z);
      c.model.root.rotation.y = c.heading;
    }
  }

  /** The frog's feeding lunge landed at (x,z): the nearest cricket within
   *  reach is taken — hunger restored, event logged. A miss costs nothing. */
  private consumeCricketAt(x: number, z: number): void {
    let bi = -1;
    let bd = Infinity;
    for (let i = 0; i < this.crickets.length; i++) {
      const c = this.crickets[i];
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    if (bi < 0 || bd > CRICKET_EAT_RADIUS) return;
    const [c] = this.crickets.splice(bi, 1);
    this.scene.remove(c.model.root);
    disposeObject(c.model.root);
    feedFrog(this.state.animals[0]);
    logHabitatEvent(this.state, `${this.state.animals[0].name} snapped up a cricket.`, "good");
  }

  // ── FrogHooks (the HUD drives these) ───────────────────────────────────────

  getFrog(): FrogHooks {
    return {
      readState: () => this.readState(),
      feed: (count) => this.feed(count),
      mist: () => this.mist(),
      frogPosition: () => this.frogs.primary(),
    };
  }

  private behaviourWord(): string {
    const s = this.frogs.states()[0];
    if (!s) return "Settling in";
    if (this.frogInPond()) return "Soaking in the pond";
    switch (s) {
      case "hop":
        return "Hopping";
      case "look":
        return "Looking around";
      case "travel":
        return "On the move";
      case "rest":
        return "Resting";
      default:
        return "Sitting quietly";
    }
  }

  private readState(): FrogHudState {
    const env = this.state.environment;
    const frog = this.state.animals[0];
    const species = getCreature("colorful_frog");
    return {
      habitatName: this.state.layout.name,
      animalName: frog.name,
      species: species.category ?? "Rainforest frog",
      scientific: species.scientificName ?? "Agalychnis callidryas",
      score: Math.round(this.scoreCached),
      humidity: Math.round(env.humidity),
      hunger: Math.round(frog.needs.hunger),
      hydration: Math.round(frog.needs.hydration ?? 0),
      stress: Math.round(frog.needs.stress),
      comfort: frogComfort(env, frog),
      health: Math.round(frog.needs.health),
      cleanliness: Math.round(env.cleanliness),
      baskingC: env.baskingC,
      coolC: env.coolC,
      cricketsLoose: this.crickets.length,
      mistActive: this.mistT > 0 || this.humidity.mistBoost > 4,
      behaviour: this.behaviourWord(),
      inPond: this.frogInPond(),
      events: this.state.events.slice(-14).reverse(),
    };
  }

  /** Release crickets by the feeding zone. Returns how many really landed
   *  (live cap keeps the floor from crawling). Async fill — instances load
   *  from the cached master, so they appear within a frame or two. */
  feed(count: number): number {
    const room = Math.max(0, MAX_LOOSE_CRICKETS - this.crickets.length);
    const n = Math.min(room, Math.max(0, Math.floor(count)));
    if (n === 0) return 0;
    const zone = this.state.layout.zones.find((z) => z.kind === "feeding");
    const cx = zone?.center[0] ?? -0.25;
    const cz = zone?.center[2] ?? 0.3;
    for (let i = 0; i < n; i++) {
      void loadCreature("feeder_cricket").then((model) => {
        if (!model || this.disposed) return;
        model.root.scale.setScalar(FROG_WORLD_SCALE);
        let x = cx + (Math.random() - 0.5) * 0.3;
        let z = cz + (Math.random() - 0.5) * 0.3;
        if (insidePond(x, z)) {
          x = cx;
          z = cz - 0.2;
        }
        const c: LooseCricket = { model, x, z, heading: Math.random() * TAU, t: 0.3, moving: true };
        c.model.root.position.set(x, this.groundY(x, z), z);
        this.scene.add(model.root);
        this.crickets.push(c);
      });
    }
    logHabitatEvent(this.state, `Released ${n} cricket${n > 1 ? "s" : ""} for ${this.state.animals[0].name}.`, "info");
    return n;
  }

  /** Fire the misting nozzles (no stacking sprays). */
  mist(): boolean {
    if (this.mistT > 0) return false;
    this.mistT = MIST_SPRAY_SECONDS;
    sprayMist(this.humidity);
    this.state.environment.humidity = currentHumidity(this.humidity);
    logHabitatEvent(this.state, "Misted the enclosure — the leaves drip and the air turns soft.", "good");
    return true;
  }

  // ── Renderer seams ─────────────────────────────────────────────────────────

  excite(): void {
    // No legacy poke behaviour for the paludarium — feeding/misting are the
    // real interactions (offerFood at the frog's own spot would fake a catch).
  }

  animalPickObject(): THREE.Object3D | null {
    return this.frogs.pickRoot();
  }

  animalPosition(): [number, number, number] | null {
    const p = this.frogs.primary();
    return p ? [p.x, this.groundY(p.x, p.z), p.z] : null;
  }

  surfaceYAt(x: number, z: number): number {
    return this.groundY(x, z);
  }

  private persist(): void {
    const p = this.frogs.primary();
    if (p) this.state.animals[0].position = [p.x, this.groundY(p.x, p.z), p.z];
    saveHabitat(this.state);
  }

  dispose(): void {
    this.disposed = true;
    this.persist();
    this.shell.dispose();
    this.matFloor.dispose();
    this.frogs.dispose();
    for (const c of this.crickets) disposeObject(c.model.root);
    this.crickets = [];
    disposeScene(this.scene);
  }
}

/**
 * Generic WebGL renderer for any experimental 3D habitat. Owns one canvas, one
 * renderer, and one camera, and swaps the active HabitatScene (fish / spider /
 * lizard) on demand. Fixed camera per habitat — no orbit/free camera. Only ever
 * active when the player selects a 3D habitat; the 2D CanvasRenderer stays the
 * default. The app's main loop drives `render(dt)`.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CameraConfig, CameraLimits, HabitatKind, HabitatScene } from "./ThreeHabitat";
import type { LizardController } from "../../habitats/lizard/LizardController";
import { ThreeTankScene } from "./ThreeTankScene";
import { ThreeSpiderScene } from "./ThreeSpiderScene";
import { ThreeLizardScene } from "./ThreeLizardScene";
import { ThreeCreatureLabScene } from "./ThreeCreatureLabScene";
import { ThreeHabitatEditor } from "./ThreeHabitatEditor";

function buildHabitat(kind: HabitatKind): HabitatScene {
  switch (kind) {
    case "spider":
      return new ThreeSpiderScene();
    case "lizard":
      return new ThreeLizardScene();
    case "creatures":
      return new ThreeCreatureLabScene();
    case "fish":
    default:
      return new ThreeTankScene();
  }
}

/** The historical free orbit (fish + spider keep this; Photo Mode restores it). */
const FREE_LIMITS: CameraLimits = {
  minAzimuth: -Infinity,
  maxAzimuth: Infinity,
  minPolar: 0.12,
  maxPolar: Math.PI * 0.52,
  minDistance: 0.8,
  maxDistance: 8,
  target: { minX: -3, maxX: 3, minY: -1, maxY: 3, minZ: -3, maxZ: 3 },
};

export type CameraMode = "normal" | "photo";
export type CameraPresetName = "front" | "left" | "right" | "top";

export class ThreeHabitatRenderer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private current: HabitatScene | null = null;
  private editor: ThreeHabitatEditor | null = null;
  private kind: HabitatKind | null = null;
  private cssW = 1;
  private cssH = 1;
  private raycaster = new THREE.Raycaster();
  /** The active scene's normal-mode viewing constraints (null ⇒ free orbit). */
  private sceneLimits: CameraLimits | null = null;
  private cameraMode: CameraMode = "normal";
  /** Scene-driven camera override (cinematic / feeding presentations). */
  private overriding = false;
  private ovLook = new THREE.Vector3();
  /** Where the camera stood before the override — it glides back here after. */
  private preOverride: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "scene3d";

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true, // transparent clear so the room backdrop shows behind
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.camera = new THREE.PerspectiveCamera(33, 1, 0.1, 50);

    // Orbit the tank — middle-mouse (and left) drag to rotate, wheel to zoom,
    // right to pan. Lets the player inspect the habitat from any side.
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.8;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 8;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.52; // keep at/above the substrate
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN,
    };

    // QA hook: OrbitControls moves the CAMERA around the fixed habitat — the scene /
    // enclosure is never rotated. Tests read these to prove the container doesn't spin.
    try {
      Object.assign(globalThis, {
        __habitat3d: {
          cameraPos: (): number[] => this.camera.position.toArray(),
          target: (): number[] => this.controls.target.toArray(),
          sceneRotationY: (): number => this.current?.scene.rotation.y ?? 0,
          azimuth: (): number => +this.controls.getAzimuthalAngle().toFixed(3),
          polar: (): number => +this.controls.getPolarAngle().toFixed(3),
          cameraMode: (): string => this.cameraMode,
          overrideActive: (): boolean => this.overriding,
          // True when the NORMAL camera is actively constrained by the scene.
          constrained: (): boolean => this.cameraMode === "normal" && this.sceneLimits != null,
          setCameraMode: (m: string): string => {
            this.setCameraMode(m === "photo" ? "photo" : "normal");
            return this.cameraMode;
          },
          preset: (name: string): number[] => {
            this.cameraPreset(name as CameraPresetName);
            return this.camera.position.toArray();
          },
          // Project the animal to client px (QA: click-the-gecko without screen math).
          animalScreen: (): number[] | null => {
            const pos = this.current?.animalPosition?.() ?? null;
            if (!pos) return null;
            const v = new THREE.Vector3(pos[0], pos[1] + 0.04, pos[2]).project(this.camera);
            const r = this.canvas.getBoundingClientRect();
            return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top];
          },
        },
      });
    } catch {
      /* non-browser */
    }
  }

  /** Raycast the active habitat's animal at a screen point (client px). */
  pickAnimal(clientX: number, clientY: number): boolean {
    const obj = this.current?.animalPickObject?.() ?? null;
    if (!obj) return false;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObject(obj, true).length > 0;
  }

  /** Point the orbit camera at the animal (Focus Animal button). */
  focusAnimal(): void {
    const pos = this.current?.animalPosition?.() ?? null;
    if (!pos) return;
    this.controls.target.set(pos[0], pos[1] + 0.05, pos[2]);
    this.controls.update();
  }

  /** Restore the habitat's default framing (Reset Camera button). */
  resetCamera(): void {
    if (this.current) this.applyCamera(this.current.camera);
  }

  /** Apply the ACTIVE limits to OrbitControls: the scene's viewing window in
   *  normal mode, the historical free orbit in Photo Mode / limit-less scenes. */
  private applyCameraLimits(): void {
    const lim = this.cameraMode === "normal" && this.sceneLimits ? this.sceneLimits : FREE_LIMITS;
    this.controls.minAzimuthAngle = lim.minAzimuth;
    this.controls.maxAzimuthAngle = lim.maxAzimuth;
    this.controls.minPolarAngle = lim.minPolar;
    this.controls.maxPolarAngle = lim.maxPolar;
    this.controls.minDistance = lim.minDistance;
    this.controls.maxDistance = lim.maxDistance;
    this.controls.update(); // snaps the camera into the window immediately
  }

  /** Normal (constrained eco-center viewing) vs Photo Mode (free orbit). */
  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.applyCameraLimits();
  }

  getCameraMode(): CameraMode {
    return this.cameraMode;
  }

  toggleCameraMode(): CameraMode {
    this.setCameraMode(this.cameraMode === "normal" ? "photo" : "normal");
    return this.cameraMode;
  }

  /** Named viewing angles (Front / Left-front / Right-front / Top-down inspect),
   *  built around the habitat's authored look-at point and clamped into the
   *  active limits so a preset never fights the constraint. */
  cameraPreset(name: CameraPresetName): void {
    if (!this.current) return;
    const c = this.current.camera;
    if (name === "front") {
      this.applyCamera(c);
      return;
    }
    this.flushOrbitMomentum();
    const look = new THREE.Vector3(c.look[0], c.look[1], c.look[2]);
    const dist = new THREE.Vector3(c.pos[0], c.pos[1], c.pos[2]).distanceTo(look);
    const lim = this.cameraMode === "normal" && this.sceneLimits ? this.sceneLimits : FREE_LIMITS;
    const spec =
      name === "left"
        ? { theta: -0.62, phi: 1.15, d: dist * 0.85 }
        : name === "right"
          ? { theta: 0.62, phi: 1.15, d: dist * 0.85 }
          : { theta: 0, phi: 0.58, d: dist * 0.8 }; // top-down inspect
    const theta = Math.max(lim.minAzimuth, Math.min(lim.maxAzimuth, spec.theta));
    const phi = Math.max(lim.minPolar, Math.min(lim.maxPolar, spec.phi));
    const d = Math.max(lim.minDistance, Math.min(lim.maxDistance, spec.d));
    const off = new THREE.Vector3().setFromSpherical(new THREE.Spherical(d, phi, theta));
    this.camera.position.copy(look).add(off);
    this.controls.target.copy(look);
    this.controls.update();
  }

  /** While an interactive care mode owns the LEFT button (brush / drop / sculpt),
   *  left-drag must not orbit; middle/right/wheel still drive the camera. */
  setLeftOrbit(enabled: boolean): void {
    (this.controls.mouseButtons as { LEFT: THREE.MOUSE | null }).LEFT = enabled ? THREE.MOUSE.ROTATE : null;
  }

  /** World point on the active habitat's substrate under a client pixel — the
   *  pointer→ground seam the interactive care modes (clean brush / feed drop /
   *  terrain sculpt) share. Null when the ray misses the floor plane. */
  groundAt(clientX: number, clientY: number): { x: number; z: number } | null {
    if (!this.current) return null;
    const gy = this.current.asEditable?.()?.groundY() ?? 0;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -gy);
    return this.raycaster.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
  }

  /** World point on the vertical plane z = `z` under a client pixel — the
   *  pointer→FRONT GLASS seam (interactive window wiping). Null on a miss. */
  pointAtZ(clientX: number, clientY: number, z: number): { x: number; y: number } | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
    return this.raycaster.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.y } : null;
  }

  get habitat(): HabitatKind | null {
    return this.kind;
  }

  /** Live care controller of the active habitat (lizard only today), or null. */
  get controller(): LizardController | null {
    return this.current?.getController?.() ?? null;
  }

  /** Decorate-mode editor for the active habitat (lizard only today), or null. */
  getEditor(): ThreeHabitatEditor | null {
    return this.editor;
  }

  /** Swap the active habitat: build the new scene (enclosure shows instantly),
   *  apply its camera, dispose the old, then async-load its animal/decor. */
  async setHabitat(kind: HabitatKind): Promise<void> {
    if (this.kind === kind && this.current) return;
    this.kind = kind;
    const old = this.current;
    this.editor?.dispose();
    this.editor = null;
    const next = buildHabitat(kind);
    this.current = next;
    // Adopt this habitat's viewing constraints (null ⇒ the free orbit stays).
    this.sceneLimits = next.cameraLimits?.() ?? null;
    this.cameraMode = "normal";
    this.applyCameraLimits();
    this.applyCamera(next.camera);
    this.resize(this.cssW, this.cssH);
    if (old) old.dispose();
    await next.load();
    // Wire the Decorate-mode editor if this habitat is editable (lizard).
    const editable = next.asEditable?.() ?? null;
    this.editor = editable ? new ThreeHabitatEditor(this.camera, this.canvas, this.controls, editable) : null;
  }

  /** Consume any leftover drag/fling momentum so an explicit camera set (preset /
   *  reset / habitat swap) LANDS there — with damping on, the residual delta would
   *  keep rotating the camera off the point it was just placed at. */
  private flushOrbitMomentum(): void {
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
  }

  private applyCamera(c: CameraConfig): void {
    this.flushOrbitMomentum();
    this.camera.fov = c.fov;
    this.camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
    this.camera.updateProjectionMatrix();
    this.controls.target.set(c.look[0], c.look[1], c.look[2]);
    this.controls.update();
    // Save as the orbit "home" so controls.reset() (the editor's Reset-Camera
    // button) restores this authored framing.
    this.controls.saveState();
  }

  /** Disturbance/feeding poke passthrough. */
  excite(): void {
    this.current?.excite?.();
  }

  resize(cssW: number, cssH: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.cssW, this.cssH, false);
    this.camera.aspect = this.cssW / this.cssH;
    this.camera.updateProjectionMatrix();
  }

  render(dt: number): void {
    if (!this.current) return;
    this.current.update(dt);

    // Scene-driven camera override: cinematic follow / feeding-presentation
    // angles. The camera EASES to the requested pose; OrbitControls sleeps
    // while it runs and wakes exactly where the shot ends.
    const ov = this.current.cameraOverride?.() ?? null;
    if (ov) {
      if (!this.overriding) {
        this.overriding = true;
        this.controls.enabled = false;
        this.ovLook.copy(this.controls.target);
        this.preOverride = { pos: this.camera.position.clone(), look: this.controls.target.clone() };
      }
      const k = 1 - Math.exp(-3.4 * dt);
      this.camera.position.lerp(new THREE.Vector3(ov.pos[0], ov.pos[1], ov.pos[2]), k);
      this.ovLook.lerp(new THREE.Vector3(ov.look[0], ov.look[1], ov.look[2]), k);
      this.camera.lookAt(this.ovLook);
      this.renderer.render(this.current.scene, this.camera);
      return;
    }
    if (this.overriding && this.preOverride) {
      // The shot is over — glide back to where the player left the camera,
      // then hand OrbitControls the wheel exactly there.
      const k = 1 - Math.exp(-3.4 * dt);
      this.camera.position.lerp(this.preOverride.pos, k);
      this.ovLook.lerp(this.preOverride.look, k);
      this.camera.lookAt(this.ovLook);
      if (this.camera.position.distanceTo(this.preOverride.pos) < 0.04) {
        this.overriding = false;
        this.controls.enabled = true;
        this.controls.target.copy(this.preOverride.look);
        this.preOverride = null;
        this.flushOrbitMomentum();
        this.applyCameraLimits();
      } else {
        this.renderer.render(this.current.scene, this.camera);
        return;
      }
    }

    // Keep the orbit pivot INSIDE the tank in constrained mode (a long right-drag
    // pan can't walk the viewpoint out of the room).
    if (this.cameraMode === "normal" && this.sceneLimits) {
      const t = this.sceneLimits.target;
      const p = this.controls.target;
      p.x = Math.max(t.minX, Math.min(t.maxX, p.x));
      p.y = Math.max(t.minY, Math.min(t.maxY, p.y));
      p.z = Math.max(t.minZ, Math.min(t.maxZ, p.z));
    }
    this.controls.update();
    this.renderer.render(this.current.scene, this.camera);
  }

  dispose(): void {
    this.editor?.dispose();
    this.current?.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}

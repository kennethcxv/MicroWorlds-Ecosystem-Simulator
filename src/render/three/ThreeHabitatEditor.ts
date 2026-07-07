/**
 * DECORATE-MODE interaction layer — a simplified Unity/Unreal-style habitat editor
 * (see docs/production/HABITAT_EDITOR.md for the UI decision). It wraps three.js
 * `TransformControls` as a real move/rotate/scale GIZMO plus click-select, a ghost
 * placement preview, and Blender-ish hotkeys, and translates every gesture into the
 * scene's `EditableHabitat` data ops (which own layout / collision / nav / save).
 *
 * Gizmo target: a lightweight PROXY object the editor owns, synced to the selected
 * prop. Dragging the proxy drives the layout (which moves the real mesh) — so the
 * gizmo survives the async placeholder→GLB swap, and never fights the mesh.
 *
 * Camera: while active, LEFT is editing (select/place/gizmo) and MIDDLE/RIGHT/wheel
 * stay with OrbitControls; OrbitControls is disabled for the duration of a gizmo
 * drag (via `dragging-changed`) so orbit never fights a transform.
 */
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { CatalogItem, EditableHabitat, PlacedSummary } from "./ThreeHabitat";
import type { ObstacleInteraction, PlacementMode } from "../../habitats/HabitatTypes";

const GHOST_OK = 0x86e05c; // soft leaf-green (valid drop)
const GHOST_BAD = 0xff5a5a; // warm red (invalid drop)
const GHOST_WARN = 0xf0b64b; // amber (legal, but pinches walking routes)
const GRID = 0.1; // metres — the snap grid
const ROT_SNAP = 15; // degrees — the snap rotation step
const SCALE_SNAP = 0.25; // gizmo scale snap step
const SNAP_KEY = "gw_decor_snap";
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

export type GizmoMode = "translate" | "rotate" | "scale";

export class ThreeHabitatEditor {
  private _active = false;
  private armed: string | null = null;
  private selected: string | null = null;

  private _mode: GizmoMode = "translate";
  private _advancedRotation = false; // unlock X/Z rotation
  private _uniformScale = true; // locked uniform (unlock → per-axis)

  private raycaster = new THREE.Raycaster();
  private plane: THREE.Plane;
  private ghost: THREE.Object3D | null = null;
  private ghostMat: THREE.MeshBasicMaterial | null = null;
  private ghostYaw = 0;
  /** Placement PREVIEW dressing under the ghost: a colour-coded double ring +
   *  a soft ground shadow, draped at the sculpted-terrain height. */
  private ghostRing: THREE.Group | null = null;
  private ghostRingMats: THREE.MeshBasicMaterial[] = [];
  private ghostShadow: THREE.Mesh | null = null;
  private _snapOn = false;
  private _armedWarning: string | null = null;
  private warnCb: ((warning: string | null) => void) | null = null;

  private proxy = new THREE.Object3D();
  private tc: TransformControls;
  private ctrlHeld = false;
  /** Full transform at gesture start — an invalid release restores ALL of it
   *  (move / rotate / scale / Y), so no invalid transform can ever persist. */
  private dragStart: {
    x: number; y: number; z: number;
    rotX: number; rotY: number; rotZ: number;
    scaleX: number; scaleY: number; scaleZ: number;
  } | null = null;
  private _armedReason: string | null = null;

  private changeCb: (() => void) | null = null;
  private selectCb: ((id: string | null) => void) | null = null;
  private animalCb: (() => void) | null = null;
  private reasonCb: ((reason: string | null) => void) | null = null;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private canvas: HTMLCanvasElement,
    private controls: OrbitControls,
    private edit: EditableHabitat,
  ) {
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -edit.groundY());
    this.proxy.name = "editor-proxy";
    this.tc = new TransformControls(this.camera, this.canvas);
    this.tc.setSpace("local");
    this.tc.addEventListener("dragging-changed", this.onDraggingChanged);
    this.tc.addEventListener("objectChange", this.onGizmoObjectChange);
    this.tc.addEventListener("mouseUp", this.onGizmoMouseUp);
    try {
      this._snapOn = globalThis.localStorage?.getItem(SNAP_KEY) === "1";
    } catch {
      /* default off */
    }
    this.applySnapState();
    // Read-only QA hook (Playwright): what the ghost preview currently is.
    Object.assign(globalThis, {
      __editorQA: {
        armed: () => this.armed,
        ghostKind: () => (this.ghost ? ((this.ghost.userData.kind as string) ?? "box") : null),
        ghostAt: () => (this.ghost ? [+this.ghost.position.x.toFixed(3), +this.ghost.position.y.toFixed(3), +this.ghost.position.z.toFixed(3)] : null),
        ringAt: () =>
          this.ghostRing
            ? [+this.ghostRing.position.x.toFixed(3), +this.ghostRing.position.y.toFixed(3), +this.ghostRing.position.z.toFixed(3)]
            : null,
        ringColor: () => (this.ghostRingMats[0] ? `#${this.ghostRingMats[0].color.getHexString()}` : null),
        warning: () => this._armedWarning,
        snap: () => this._snapOn,
        selected: () => this.selected,
        mode: () => this._mode,
        /** Project a world point to canvas-client pixels (drive REAL gizmo drags). */
        project: (x: number, y: number, z: number) => {
          const v = new THREE.Vector3(x, y, z).project(this.camera);
          const r = this.canvas.getBoundingClientRect();
          return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
        },
      },
    });
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  get active(): boolean {
    return this._active;
  }

  enable(): void {
    if (this._active) return;
    this._active = true;
    (this.controls.mouseButtons as { LEFT: THREE.MOUSE | null }).LEFT = null;
    this.edit.scene.add(this.proxy);
    this.edit.scene.add(this.tc.getHelper());
    window.addEventListener("pointerdown", this.onPointerDown, true);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("keydown", this.onKey);
  }

  disable(): void {
    if (!this._active) return;
    this._active = false;
    this.controls.enabled = true; // in case we were hovering a gizmo handle
    this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    this.tc.detach();
    this.edit.scene.remove(this.tc.getHelper());
    this.edit.scene.remove(this.proxy);
    window.removeEventListener("pointerdown", this.onPointerDown, true);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKey);
    this.cancelArm();
    this.select(null);
  }

  // ── Catalog / placement ───────────────────────────────────────────────────────
  catalog(): CatalogItem[] {
    return this.edit.catalog();
  }
  objects(): PlacedSummary[] {
    return this.edit.listObjects();
  }
  get armedDefId(): string | null {
    return this.armed;
  }

  arm(defId: string): void {
    this.cancelArm();
    this.armed = defId;
    this.ghostYaw = 0;
    this.select(null);
    this.ghostMat = new THREE.MeshBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.45, depthWrite: false });
    this.ghost = this.makeGhost(defId);
    this.edit.scene.add(this.ghost);
    // Swap the stand-in box for the REAL model as soon as its (cached) GLB is ready
    // — the preview is the actual asset at the exact scale/rotation/Y it will land.
    void this.edit.ghostModel(defId).then((m) => {
      if (!m || this.armed !== defId || !this.ghost || !this.ghostMat) return;
      const mat = this.ghostMat;
      m.object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if ((mesh as unknown as { isMesh?: boolean }).isMesh) mesh.material = mat;
      });
      m.object.userData.kind = "model"; // base at local y = 0
      m.object.userData.h = m.height;
      m.object.position.copy(this.ghost.position);
      m.object.position.y = this.edit.defaultPlaceY(defId);
      m.object.rotation.y = this.ghostYaw * RAD;
      this.replaceGhost(m.object);
    });
  }

  /** Swap the ghost visual, keeping pose/armed state. */
  private replaceGhost(next: THREE.Object3D): void {
    if (this.ghost) {
      this.edit.scene.remove(this.ghost);
      this.disposeGhostVisual(this.ghost);
    }
    this.ghost = next;
    this.edit.scene.add(next);
  }

  /** Dispose only what the ghost owns: the stand-in box's geometry. A real-model
   *  ghost shares its geometry/materials with the decor cache — never dispose it. */
  private disposeGhostVisual(g: THREE.Object3D): void {
    if (g.userData.kind !== "model") {
      const mesh = g as THREE.Mesh;
      mesh.geometry?.dispose();
    }
  }

  cancelArm(): void {
    this.armed = null;
    if (this._armedReason !== null) {
      this._armedReason = null;
      this.reasonCb?.(null);
    }
    if (this._armedWarning !== null) {
      this._armedWarning = null;
      this.warnCb?.(null);
    }
    if (this.ghost) {
      this.edit.scene.remove(this.ghost);
      this.disposeGhostVisual(this.ghost);
      this.ghost = null;
    }
    this.ghostMat?.dispose();
    this.ghostMat = null;
    this.removeGhostDressing();
  }

  // ── Snap (grid position + stepped rotation + stepped scale) ──────────────────
  get snapOn(): boolean {
    return this._snapOn;
  }

  setSnap(on: boolean): void {
    this._snapOn = on;
    try {
      globalThis.localStorage?.setItem(SNAP_KEY, on ? "1" : "0");
    } catch {
      /* non-fatal */
    }
    this.applySnapState();
    this.fireChange();
  }

  /** Effective snap = the toggle, momentarily INVERTED while Ctrl/Cmd is held
   *  (snap-off users can tap Ctrl for a gridded drop, and vice versa). */
  private snapActive(): boolean {
    return this.ctrlHeld ? !this._snapOn : this._snapOn;
  }

  /** Push the current snap state into the gizmo (position/rotation/scale steps). */
  private applySnapState(): void {
    const on = this.snapActive();
    this.tc.setTranslationSnap(on ? GRID : null);
    this.tc.setRotationSnap(on ? ROT_SNAP * RAD : null);
    this.tc.setScaleSnap(on ? SCALE_SNAP : null);
  }

  // ── Placement preview dressing (ring + soft shadow under the ghost) ──────────
  private ensureGhostDressing(): void {
    if (this.ghostRing) return;
    const group = new THREE.Group();
    this.ghostRingMats = [];
    const mk = (inner: number, outer: number, opacity: number): THREE.Mesh => {
      const mat = new THREE.MeshBasicMaterial({
        color: GHOST_OK,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      this.ghostRingMats.push(mat);
      const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 48), mat);
      m.rotation.x = -Math.PI / 2;
      return m;
    };
    group.add(mk(0.9, 1.0, 0.85)); // crisp outer ring
    group.add(mk(0.52, 0.56, 0.4)); // faint inner ring
    group.renderOrder = 1001;
    this.ghostRing = group;
    this.edit.scene.add(group);

    // Soft radial ground shadow (a canvas-gradient sprite plane).
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const cx = cv.getContext("2d")!;
    const grad = cx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, "rgba(0,0,0,0.5)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = grad;
    cx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.6, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 999;
    this.ghostShadow = shadow;
    this.edit.scene.add(shadow);
  }

  private removeGhostDressing(): void {
    if (this.ghostRing) {
      this.edit.scene.remove(this.ghostRing);
      for (const c of this.ghostRing.children) (c as THREE.Mesh).geometry.dispose();
      for (const m of this.ghostRingMats) m.dispose();
      this.ghostRingMats = [];
      this.ghostRing = null;
    }
    if (this.ghostShadow) {
      this.edit.scene.remove(this.ghostShadow);
      this.ghostShadow.geometry.dispose();
      const mat = this.ghostShadow.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      this.ghostShadow = null;
    }
  }

  /** Drape the ring + shadow at the drop point (sculpted-terrain height) and
   *  colour them by validity: green = valid, red = invalid, amber = tight fit. */
  private updateGhostDressing(x: number, z: number, state: "ok" | "bad" | "warn"): void {
    if (!this.armed) return;
    this.ensureGhostDressing();
    const r = Math.max(0.14, this.edit.footprintRadius(this.armed) + 0.06);
    const y = this.edit.surfaceYAt(x, z);
    const color = state === "bad" ? GHOST_BAD : state === "warn" ? GHOST_WARN : GHOST_OK;
    if (this.ghostRing) {
      this.ghostRing.position.set(x, y + 0.015, z);
      this.ghostRing.scale.set(r, r, 1);
      for (const m of this.ghostRingMats) m.color.setHex(color);
    }
    if (this.ghostShadow) {
      this.ghostShadow.position.set(x, y + 0.006, z);
      this.ghostShadow.scale.set(r, r, 1);
    }
  }

  /** Real-model thumbnail for a catalog card (pass-through for the DOM panel). */
  thumbnail(defId: string): Promise<string | null> {
    return this.edit.thumbnail(defId);
  }

  // ── Selection ───────────────────────────────────────────────────────────────
  get selectedId(): string | null {
    return this.selected;
  }
  selectedSummary(): PlacedSummary | null {
    return this.selected ? this.edit.getObject(this.selected) : null;
  }

  select(id: string | null): void {
    this.selected = id;
    this.edit.highlight(id);
    if (id) {
      this.syncProxy();
      this.tc.attach(this.proxy);
      this.applyConstraints();
    } else {
      this.tc.detach();
    }
    this.selectCb?.(id);
  }

  /** Align the gizmo proxy to the selected prop's current transform. */
  private syncProxy(): void {
    const s = this.selectedSummary();
    if (!s) return;
    this.proxy.position.set(s.x, s.y, s.z);
    this.proxy.rotation.set(s.rotX * RAD, s.rotY * RAD, s.rotZ * RAD);
    this.proxy.scale.set(s.scaleX, s.scaleY, s.scaleZ);
    this.proxy.updateMatrixWorld();
  }

  // ── Vertical placement (Y-axis for elevated / hanging props) ────────────────────
  selectedPlacement(): PlacementMode {
    return this.selected ? this.edit.placementMode(this.selected) : "floor";
  }
  selectedYRange(): [number, number] {
    return this.selected ? this.edit.yRange(this.selected) : [0, 0];
  }
  setSelectedY(v: number): void {
    if (!this.selected) return;
    this.edit.moveObjectY(this.selected, v);
    this.syncProxy();
  }

  // ── Collision-debug toggle (shared button with the HUD) ─────────────────────────
  toggleCollisionDebug(): boolean {
    return this.edit.toggleCollisionDebug();
  }
  collisionDebugVisible(): boolean {
    return this.edit.collisionDebugVisible();
  }

  get armedReason(): string | null {
    return this._armedReason;
  }

  // ── Gizmo mode + advanced toggles ─────────────────────────────────────────────
  get mode(): GizmoMode {
    return this._mode;
  }
  setMode(m: GizmoMode): void {
    this._mode = m;
    this.tc.setMode(m);
    this.applyConstraints();
    this.fireChange();
  }
  get advancedRotation(): boolean {
    return this._advancedRotation;
  }
  setAdvancedRotation(on: boolean): void {
    this._advancedRotation = on;
    this.applyConstraints();
    this.fireChange();
  }
  get uniformScale(): boolean {
    return this._uniformScale;
  }
  setUniformScale(on: boolean): void {
    this._uniformScale = on;
    this.applyConstraints();
    this.fireChange();
  }
  /** Toolbar "Advanced" — unlock X/Z rotation AND per-axis scale together. */
  setAdvancedAll(on: boolean): void {
    this._advancedRotation = on;
    this._uniformScale = !on;
    this.applyConstraints();
    this.fireChange();
  }

  /** Is vertical movement available for the selection? Elevated/hanging props
   *  always have their Y arrow; Advanced additionally unlocks Y for floor props. */
  private yUnlocked(): boolean {
    return this.selectedPlacement() !== "floor" || this._advancedRotation;
  }

  /** Show only the handles allowed by the current mode + advanced flags. */
  private applyConstraints(): void {
    this.tc.showX = true;
    this.tc.showY = true;
    this.tc.showZ = true;
    if (this._mode === "translate") {
      // Floor props: XZ only. Elevated / hanging props: a real vertical Y arrow
      // (Advanced unlocks it for everything).
      this.tc.showY = this.yUnlocked();
    } else if (this._mode === "rotate") {
      if (!this._advancedRotation) {
        this.tc.showX = false;
        this.tc.showZ = false; // simple → Y turn only
      }
    } else if (this._mode === "scale") {
      if (this._uniformScale) {
        this.tc.showY = false;
        this.tc.showZ = false; // uniform → drag X (or the centre box)
      }
    }
  }

  // ── Transform actions (panel + keys) ──────────────────────────────────────────
  beginGesture(): void {
    this.edit.beginEdit();
  }
  setSelectedRotationEuler(x: number, y: number, z: number): void {
    if (!this.selected) return;
    this.edit.setRotationEuler(this.selected, x, y, z);
    this.syncProxy();
  }
  setSelectedScaleUniform(s: number): void {
    if (!this.selected) return;
    this.edit.setScaleAxes(this.selected, s, s, s);
    this.syncProxy();
  }
  setSelectedScaleAxis(axis: "x" | "y" | "z", v: number): void {
    const s = this.selectedSummary();
    if (!s) return;
    this.edit.setScaleAxes(
      s.id,
      axis === "x" ? v : s.scaleX,
      axis === "y" ? v : s.scaleY,
      axis === "z" ? v : s.scaleZ,
    );
    this.syncProxy();
  }
  setSelectedInteraction(type: ObstacleInteraction): void {
    if (!this.selected) return;
    this.edit.setInteraction(this.selected, type);
    this.fireChange();
  }
  resetTransform(): void {
    if (!this.selected) return;
    this.edit.resetTransform(this.selected);
    this.syncProxy();
    this.fireChange();
  }
  snapToFloor(): void {
    if (!this.selected) return;
    this.edit.snapToFloor(this.selected);
    this.syncProxy();
    this.fireChange();
  }
  centerSelected(): void {
    if (!this.selected) return;
    this.edit.centerInHabitat(this.selected);
    this.syncProxy();
    this.fireChange();
  }
  duplicateSelected(): void {
    if (!this.selected) return;
    const id = this.edit.duplicateObject(this.selected);
    if (id) this.select(id);
    this.fireChange();
  }
  deleteSelected(): void {
    if (!this.selected) return;
    this.edit.removeObject(this.selected);
    this.select(null);
    this.fireChange();
  }
  resetLayout(): void {
    this.edit.resetLayout();
    this.select(null);
    this.fireChange();
  }
  commit(): void {
    this.edit.commit();
    this.syncProxy(); // re-align after any clamp
    this.fireChange();
  }

  // Undo / redo.
  undo(): void {
    this.edit.undo();
    this.select(null);
    this.fireChange();
  }
  redo(): void {
    this.edit.redo();
    this.select(null);
    this.fireChange();
  }
  canUndo(): boolean {
    return this.edit.canUndo();
  }
  canRedo(): boolean {
    return this.edit.canRedo();
  }

  // ── Notifications ─────────────────────────────────────────────────────────────
  onChange(cb: () => void): void {
    this.changeCb = cb;
  }
  onSelect(cb: (id: string | null) => void): void {
    this.selectCb = cb;
  }
  /** Fired when the gecko itself is clicked (open the animal info card). */
  onAnimalPick(cb: () => void): void {
    this.animalCb = cb;
  }
  /** Fired when the armed ghost's validity reason changes (null = valid). */
  onGhostReason(cb: (reason: string | null) => void): void {
    this.reasonCb = cb;
  }
  /** Fired when the ghost's soft PATHING advisory changes (null = all clear) —
   *  the drop is still legal, but would pinch the animal's walking corridors. */
  onGhostWarning(cb: (warning: string | null) => void): void {
    this.warnCb = cb;
  }
  private fireChange(): void {
    this.changeCb?.();
  }

  // ── Gizmo events ──────────────────────────────────────────────────────────────
  private onDraggingChanged = (e: { value: unknown }): void => {
    const dragging = e.value === true;
    this.controls.enabled = !dragging; // don't let orbit fight the gizmo drag
    if (dragging) {
      this.edit.beginEdit();
      const s = this.selectedSummary();
      // Remember the FULL last-valid transform, not just XZ.
      this.dragStart = s
        ? { x: s.x, y: s.y, z: s.z, rotX: s.rotX, rotY: s.rotY, rotZ: s.rotZ, scaleX: s.scaleX, scaleY: s.scaleY, scaleZ: s.scaleZ }
        : null;
    }
  };

  private onGizmoObjectChange = (): void => {
    if (!this.selected) return;
    if (this._mode === "scale" && this._uniformScale) {
      const s = clamp(this.proxy.scale.x, 0.05, 10);
      this.proxy.scale.set(s, s, s);
    }
    this.edit.moveObject(this.selected, this.proxy.position.x, this.proxy.position.z);
    if (this._mode === "translate" && this.yUnlocked()) {
      this.edit.moveObjectY(this.selected, this.proxy.position.y);
    }
    this.edit.setRotationEuler(
      this.selected,
      this.proxy.rotation.x * DEG,
      this.proxy.rotation.y * DEG,
      this.proxy.rotation.z * DEG,
    );
    this.edit.setScaleAxes(this.selected, this.proxy.scale.x, this.proxy.scale.y, this.proxy.scale.z);
    // Live invalid feedback in EVERY mode (a scale-up can overlap the gecko too).
    this.edit.markSelectionValid(this.gestureValid());
  };

  /** Would committing the proxy's current transform be allowed? (Scale/rotation
   *  validity keys off the same on-creature guard — footprintRadius reads the
   *  object's LIVE scale, so a grown prop overlapping the gecko reads invalid.) */
  private gestureValid(): boolean {
    if (!this.selected) return true;
    return this.edit.moveValid(this.selected, this.proxy.position.x, this.proxy.position.z);
  }

  private onGizmoMouseUp = (): void => {
    // Reject an invalid gesture by restoring the FULL start transform —
    // move, rotate, scale AND height. Invalid transforms never persist.
    if (this.selected && this.dragStart && !this.gestureValid()) {
      const d = this.dragStart;
      this.edit.moveObject(this.selected, d.x, d.z);
      this.edit.moveObjectY(this.selected, d.y);
      this.edit.setRotationEuler(this.selected, d.rotX, d.rotY, d.rotZ);
      this.edit.setScaleAxes(this.selected, d.scaleX, d.scaleY, d.scaleZ);
      this.syncProxy();
    }
    this.dragStart = null;
    this.edit.markSelectionValid(true);
    this.commit();
  };

  // ── Pointer + keyboard ────────────────────────────────────────────────────────
  private onPointerDown = (e: PointerEvent): void => {
    if (!this._active) return;
    if (e.target !== this.canvas) return; // DOM panel clicks aren't edits
    if (e.button !== 0) return; // middle/right → camera
    // If a gizmo handle is hovered, let TransformControls own this drag.
    if (this.selected && (this.tc.dragging || this.tc.axis !== null)) return;
    e.stopImmediatePropagation(); // take the click; keep OrbitControls out
    const g = this.groundPoint(e);
    if (this.armed) {
      if (g) this.place(this.armed, g.x, g.z);
      return;
    }
    // Clicking the ANIMAL (in front of any decor) opens its info card, not a decor
    // selection — matches "click animal while editing selects animal info".
    if (this.animalPickedFirst(e)) {
      this.select(null);
      this.animalCb?.();
      return;
    }
    const hit = this.pickObject(e);
    this.select(hit); // hit or null (deselect)
  };

  /** True if the gecko is the front-most thing under the cursor (nearer than decor). */
  private animalPickedFirst(e: PointerEvent): boolean {
    const animal = this.edit.animalPickObject();
    if (!animal) return false;
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const a = this.raycaster.intersectObject(animal, true);
    if (a.length === 0) return false;
    const d = this.raycaster.intersectObjects(this.edit.pickTargets(), true);
    return a[0].distance <= (d.length ? d[0].distance : Infinity);
  }

  private onPointerMove = (e: PointerEvent): void => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl !== this.ctrlHeld) {
      this.ctrlHeld = ctrl;
      this.applySnapState(); // Ctrl momentarily inverts the snap toggle
    }
    // Disable the camera while the cursor is over a gizmo handle, so grabbing the
    // gizmo never fights orbit (and OrbitControls' pointerdown never runs there).
    if (this._active) this.controls.enabled = this.tc.axis === null;
    if (this.armed && this.ghost) {
      const g = this.groundPoint(e);
      if (g) {
        const sx = this.snap(g.x), sz = this.snap(g.z);
        // Model ghosts sit base-at-Y (the exact Y placement will use — seated on
        // the sculpted terrain); the stand-in box is centred so it rides at half
        // its height above that.
        const baseY = this.edit.defaultPlaceY(this.armed, sx, sz);
        const y = this.ghost.userData.kind === "model" ? baseY : baseY + this.ghost.userData.h / 2;
        this.ghost.position.set(sx, y, sz);
        const reason = this.edit.placementReason(this.armed, sx, sz);
        const warning = reason ? null : this.edit.placementWarning(this.armed, sx, sz);
        this.ghostMat?.color.setHex(reason ? GHOST_BAD : warning ? GHOST_WARN : GHOST_OK);
        this.updateGhostDressing(sx, sz, reason ? "bad" : warning ? "warn" : "ok");
        if (reason !== this._armedReason) {
          this._armedReason = reason;
          this.reasonCb?.(reason);
        }
        if (warning !== this._armedWarning) {
          this._armedWarning = warning;
          this.warnCb?.(warning);
        }
      }
    }
  };

  private onPointerUp = (): void => {
    /* gizmo drag ends via TransformControls 'mouseUp'; nothing else to do */
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.armed) return; // let the wheel zoom the camera normally
    e.preventDefault();
    e.stopPropagation();
    this.rotateGhost(e.deltaY < 0 ? 15 : -15);
  };

  private onKey = (e: KeyboardEvent): void => {
    if (!this._active) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (ctrl && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      this.redo();
      return;
    }
    if (ctrl && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      this.duplicateSelected();
      return;
    }
    switch (e.key) {
      case "w":
      case "W":
        this.setMode("translate");
        break;
      case "e":
      case "E":
        this.setMode("rotate");
        break;
      case "r":
      case "R":
        if (this.armed) this.rotateGhost(e.shiftKey ? -15 : 15);
        else this.setMode("scale");
        break;
      case "q":
      case "Q":
        this.select(null);
        break;
      case "f":
      case "F":
        this.focusSelected();
        break;
      case "PageUp":
      case "PageDown": {
        if (!this.selected || !this.yUnlocked()) break;
        e.preventDefault();
        const step = (e.shiftKey ? 0.02 : 0.06) * (e.key === "PageUp" ? 1 : -1);
        const s = this.selectedSummary();
        if (!s) break;
        this.edit.beginEdit();
        this.edit.moveObjectY(this.selected, s.y + step);
        this.syncProxy();
        this.commit();
        break;
      }
      case "Escape":
        if (this.armed) this.cancelArm();
        else this.select(null);
        break;
      case "Delete":
      case "Backspace":
        if (this.selected) {
          e.preventDefault();
          this.deleteSelected();
        }
        break;
    }
  };

  // ── Camera helpers (visible buttons in the panel + the F hotkey) ───────────────
  /** Re-aim the orbit camera at the selected prop (or the animal when nothing is
   *  selected), keeping the current viewing offset — a Planet-Zoo-style "focus". */
  focusSelected(): void {
    let target: THREE.Vector3 | null = null;
    const s = this.selectedSummary();
    if (s) target = new THREE.Vector3(s.x, s.y + 0.08, s.z);
    else {
      const animal = this.edit.animalPickObject();
      if (animal) target = animal.getWorldPosition(new THREE.Vector3());
    }
    if (!target) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.copy(target);
    this.camera.position.copy(target.clone().add(offset));
    this.controls.update();
  }

  /** Reset the orbit camera to the habitat's authored framing (OrbitControls'
   *  saved home state — the camera moves; the vivarium itself never rotates). */
  resetCamera(): void {
    this.controls.reset();
  }

  private place(defId: string, x: number, z: number): void {
    const id = this.edit.addFromCatalog(defId, this.snap(x), this.snap(z));
    if (!id) return; // invalid drop → keep the ghost armed to try elsewhere
    if (this.ghostYaw) {
      this.edit.setRotationEuler(id, 0, this.ghostYaw, 0);
      this.edit.commit();
    }
    this.cancelArm();
    this.select(id);
    this.fireChange();
  }

  private rotateGhost(deg: number): void {
    this.ghostYaw = (this.ghostYaw + deg) % 360;
    if (this.ghost) this.ghost.rotation.y = this.ghostYaw * RAD;
  }

  private snap(v: number): number {
    return this.snapActive() ? Math.round(v / GRID) * GRID : v;
  }

  // ── Raycast helpers ───────────────────────────────────────────────────────────
  private ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  private groundPoint(e: PointerEvent): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, hit) ? hit : null;
  }
  private pickObject(e: PointerEvent): string | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.edit.pickTargets(), true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (typeof o.userData?.objectId === "string") return o.userData.objectId as string;
        o = o.parent;
      }
    }
    return null;
  }
  /** The instant stand-in shown for the first frames while the real model ghost
   *  loads from the cache (and the permanent fallback for asset-less placeables). */
  private makeGhost(defId: string): THREE.Mesh {
    const r = Math.max(0.06, this.edit.footprintRadius(defId));
    const h = Math.max(0.12, r * 1.4);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(r * 2, h, r * 2), this.ghostMat!);
    mesh.userData.ghost = true;
    mesh.userData.kind = "box"; // centred → offset by h/2 when positioned
    mesh.userData.h = h;
    return mesh;
  }

  dispose(): void {
    this.disable();
    this.tc.dispose();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

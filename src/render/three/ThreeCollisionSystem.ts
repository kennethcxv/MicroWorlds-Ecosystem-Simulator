/**
 * DEBUG visualisation for the pure collision system — draws the compiled solid
 * volumes (circle → wire cylinder, OBB → wire box, segment → wire box along the
 * log) and the walk bounds as a wire rectangle. OFF by default; a dev aid only.
 *
 * Toggle at runtime: `?debugCollision=1` in the URL, or press "C" while a 3D
 * habitat is focused (wired in ThreeLizardScene). The pure math lives in
 * HabitatCollision — this only renders what that solver already computes.
 */
import * as THREE from "three";
import type { CollisionWorld, SolidObstacle, SurfaceRef } from "../../habitats/HabitatCollision";
import type { ObstacleInteraction } from "../../habitats/HabitatTypes";

// Colour-code the volumes so the interaction mapping is legible at a glance:
// hard route-around volumes are warm (red/amber), climbable/low are cool (green/
// cyan). Matches the brief's interaction types.
const BOUNDS_COLOR = 0xffffff;
const INTERACTION_COLOR: Record<ObstacleInteraction, number> = {
  wall: 0xff3b3b,
  blocked: 0xff5a5a,
  hide: 0xffb020,
  climbable: 0x2dff93,
  lowObstacle: 0x3fd0ff,
  softObstacle: 0x9a7bff,
  feederZone: 0xffe066,
};

function wireMaterial(color: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false });
}

// The gecko's body-clearance ring (prop footprint + body radius) is drawn faintly
// so it's clearly the extra keep-out for the ANIMAL, distinct from the tight,
// solidly-coloured PROP footprint.
const CLEARANCE_COLOR = 0xbfe8ff;

export class ThreeCollisionDebug {
  readonly object = new THREE.Group();
  private mats = new Map<number, THREE.LineBasicMaterial>();
  private faintMats = new Map<number, THREE.LineBasicMaterial>();
  private fillMats = new Map<number, THREE.MeshBasicMaterial>();
  private surfMats = new Map<number, THREE.MeshLambertMaterial>();
  /** Prop ids whose measured SURFACE mesh is already drawn (one per prop — its
   *  heightfield covers every contour loop, so per-loop copies would z-fight). */
  private surfaced = new Set<string>();
  private clearanceMat = new THREE.LineBasicMaterial({
    color: CLEARANCE_COLOR,
    transparent: true,
    opacity: 0.26,
    depthTest: false,
  });

  constructor(world: CollisionWorld, bodyRadius = 0) {
    this.object.visible = false;
    const b = world.bounds;
    const y = b.y + 0.005;

    // Walk-bounds rectangle.
    const rect = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(b.minX, y, b.minZ),
      new THREE.Vector3(b.maxX, y, b.minZ),
      new THREE.Vector3(b.maxX, y, b.maxZ),
      new THREE.Vector3(b.minX, y, b.maxZ),
      new THREE.Vector3(b.minX, y, b.minZ),
    ]);
    this.object.add(new THREE.Line(rect, this.mat(BOUNDS_COLOR)));

    for (const ob of world.obstacles) {
      this.object.add(this.buildVolume(ob, b.y));
      // A faint outer footprint = prop + gecko body radius (only for hard props the
      // gecko routes AROUND; passable ones are crossed, so no keep-out ring).
      if (bodyRadius > 0 && !ob.passable) this.object.add(this.buildClearance(ob, b.y, bodyRadius));
    }
  }

  private mat(color: number): THREE.LineBasicMaterial {
    let m = this.mats.get(color);
    if (!m) {
      m = wireMaterial(color);
      this.mats.set(color, m);
    }
    return m;
  }

  /** Fainter line variant — top loops + cage struts (the base contour stays crisp). */
  private faintMat(color: number): THREE.LineBasicMaterial {
    let m = this.faintMats.get(color);
    if (!m) {
      m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.24, depthTest: false });
      this.faintMats.set(color, m);
    }
    return m;
  }

  /** Translucent fill — the silhouette itself, so the debug READS as the asset's
   *  real shape even with the mesh hidden (not just a thin outline). */
  private fillMat(color: number): THREE.MeshBasicMaterial {
    let m = this.fillMats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.fillMats.set(color, m);
    }
    return m;
  }

  /** A filled, flat silhouette of the contour lying on the sand. Earcut handles the
   *  concave outlines the marching-squares tracer produces. */
  private fillShape(pts: { x: number; z: number }[], y: number, color: number): THREE.Mesh {
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.z)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2); // shape XY → floor XZ
    const mesh = new THREE.Mesh(geo, this.fillMat(color));
    mesh.position.y = y;
    mesh.renderOrder = 998;
    return mesh;
  }

  /**
   * The prop's MEASURED collision surface as a translucent shrink-wrap mesh: every
   * heightfield cell at its true local top height, posed by the exact transform the
   * solver samples with. A sloped rock reads low on its low side and tall on its
   * crest; an arched branch shows the hollow under its span. Faint angle-filtered
   * ridge lines make the relief crisp — this is the AAA "collision matches the
   * asset" debug view, and it draws exactly what walk-height queries return.
   */
  private surfaceMesh(hf: SurfaceRef, color: number): THREE.Object3D | null {
    const f = hf.field;
    const step = Math.max(1, Math.ceil(Math.max(f.nx, f.nz) / 56));
    const at = (ix: number, iz: number): number => (ix < 0 || ix >= f.nx || iz < 0 || iz >= f.nz ? NaN : f.top[iz * f.nx + ix]);
    const lx = (ix: number): number => f.originX + (ix + 0.5) * f.cell;
    const lz = (iz: number): number => f.originZ + (iz + 0.5) * f.cell;
    const verts: number[] = [];
    for (let iz = 0; iz + step < f.nz; iz += step) {
      for (let ix = 0; ix + step < f.nx; ix += step) {
        const y00 = at(ix, iz);
        const y10 = at(ix + step, iz);
        const y01 = at(ix, iz + step);
        const y11 = at(ix + step, iz + step);
        if (Number.isNaN(y00) || Number.isNaN(y10) || Number.isNaN(y01) || Number.isNaN(y11)) continue;
        const x0 = lx(ix);
        const x1 = lx(ix + step);
        const z0 = lz(iz);
        const z1 = lz(iz + step);
        verts.push(x0, y00, z0, x1, y10, z0, x1, y11, z1);
        verts.push(x0, y00, z0, x1, y11, z1, x0, y01, z1);
      }
    }
    if (verts.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    // Non-indexed ⇒ computed normals are per-face: the relief reads as lit facets
    // (a clean sculpted wrap), with no noisy wireframe needed.
    geo.computeVertexNormals();
    let m = this.surfMats.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
      this.surfMats.set(color, m);
    }
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = 998;
    // Same local→world transform the collision sampler inverts (scale→yaw→pos);
    // lifted 6 mm so it wraps the real mesh instead of z-fighting it.
    mesh.position.set(hf.px, hf.py + 0.006, hf.pz);
    mesh.rotation.y = hf.yaw;
    mesh.scale.set(hf.sx, hf.sy, hf.sz);
    return mesh;
  }

  /** A few vertical struts from the base contour up to the mesh top, so a tall
   *  prop's collision reads as a volume instead of two disconnected loops. */
  private struts(pts: { x: number; z: number }[], y0: number, y1: number, mat: THREE.LineBasicMaterial): THREE.LineSegments {
    const step = Math.max(1, Math.ceil(pts.length / 4));
    const v: THREE.Vector3[] = [];
    for (let i = 0; i < pts.length; i += step) {
      v.push(new THREE.Vector3(pts[i].x, y0, pts[i].z), new THREE.Vector3(pts[i].x, y1, pts[i].z));
    }
    const seg = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(v), mat);
    seg.renderOrder = 999;
    return seg;
  }

  /** Area of a debug loop (shoelace) — tiny fragments skip the volume treatment. */
  private loopArea(pts: { x: number; z: number }[]): number {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
  }

  private edges(geom: THREE.BufferGeometry, material: THREE.LineBasicMaterial): THREE.LineSegments {
    const seg = new THREE.LineSegments(new THREE.EdgesGeometry(geom), material);
    seg.renderOrder = 999;
    geom.dispose();
    return seg;
  }

  /** A faint, flat outline expanded by the gecko's body radius — the actual keep-out
   *  the animal's centre respects around a hard prop. */
  private buildClearance(ob: SolidObstacle, groundY: number, pad: number): THREE.Object3D {
    const y = groundY + 0.006;
    const flat = 0.012;
    if (ob.shape === "hull" || ob.shape === "poly") {
      // Offset the outline outward from its centroid by the gecko's body radius.
      const off = ob.pts.map((p) => {
        const dx = p.x - ob.cx;
        const dz = p.z - ob.cz;
        const d = Math.hypot(dx, dz) || 1;
        return { x: p.x + (dx / d) * pad, z: p.z + (dz / d) * pad };
      });
      return this.loop(off, y, this.clearanceMat);
    }
    if (ob.shape === "circle") {
      const c = this.edges(new THREE.CylinderGeometry(ob.r + pad, ob.r + pad, flat, 24), this.clearanceMat);
      c.position.set(ob.cx, y, ob.cz);
      return c;
    }
    if (ob.shape === "obb") {
      const box = this.edges(new THREE.BoxGeometry((ob.hx + pad) * 2, flat, (ob.hz + pad) * 2), this.clearanceMat);
      box.position.set(ob.cx, y, ob.cz);
      box.rotation.y = ob.yaw;
      return box;
    }
    const dx = ob.x2 - ob.x1;
    const dz = ob.z2 - ob.z1;
    const len = Math.hypot(dx, dz) + (ob.r + pad) * 2;
    const box = this.edges(new THREE.BoxGeometry((ob.r + pad) * 2, flat, len), this.clearanceMat);
    box.position.set((ob.x1 + ob.x2) / 2, y, (ob.z1 + ob.z2) / 2);
    box.rotation.y = Math.atan2(dx, dz);
    return box;
  }

  /** A closed wire loop through XZ points at height `y`. */
  private loop(pts: { x: number; z: number }[], y: number, mat: THREE.LineBasicMaterial): THREE.Line {
    const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, y, p.z)).concat([new THREE.Vector3(pts[0].x, y, pts[0].z)]));
    const line = new THREE.Line(g, mat);
    line.renderOrder = 999;
    return line;
  }

  private buildVolume(ob: SolidObstacle, groundY: number): THREE.Object3D {
    const color = INTERACTION_COLOR[ob.interaction] ?? BOUNDS_COLOR;
    const mat = this.mat(color);
    const h = Math.max(0.05, ob.top - groundY);
    if (ob.shape === "hull" || ob.shape === "poly") {
      // The EXACT mesh silhouette: a translucent FILLED shape on the sand (reads as
      // the asset even with the mesh hidden) + a crisp base outline.
      const g = new THREE.Group();
      g.add(this.fillShape(ob.pts, groundY + 0.004, color));
      g.add(this.loop(ob.pts, groundY + 0.005, mat));
      if (ob.hf) {
        // MEASURED SURFACE: the per-point collision heights as a shrink-wrap mesh
        // (tall side tall, low rocks low, hollow under an arch). One per prop id —
        // its heightfield already covers every contour loop of that prop.
        if (!this.surfaced.has(ob.id)) {
          this.surfaced.add(ob.id);
          const s = this.surfaceMesh(ob.hf, color);
          if (s) g.add(s);
        }
      } else if (ob.top - groundY > 0.05 && this.loopArea(ob.pts) > 0.006) {
        // No height data (placeholder prop): the old flat-top loop + sparse struts,
        // and only for SIGNIFICANT loops — pebble fragments would read as noise.
        const faint = this.faintMat(color);
        g.add(this.loop(ob.pts, ob.top, faint));
        g.add(this.struts(ob.pts, groundY + 0.005, ob.top, faint));
      }
      return g;
    }
    if (ob.shape === "circle") {
      const cyl = this.edges(new THREE.CylinderGeometry(ob.r, ob.r, h, 20), mat);
      cyl.position.set(ob.cx, groundY + h / 2, ob.cz);
      return cyl;
    }
    if (ob.shape === "obb") {
      const box = this.edges(new THREE.BoxGeometry(ob.hx * 2, h, ob.hz * 2), mat);
      box.position.set(ob.cx, groundY + h / 2, ob.cz);
      box.rotation.y = ob.yaw;
      return box;
    }
    // segment (capsule footprint) → a wire box spanning the log + its radius.
    const dx = ob.x2 - ob.x1;
    const dz = ob.z2 - ob.z1;
    const len = Math.hypot(dx, dz) + ob.r * 2;
    const box = this.edges(new THREE.BoxGeometry(ob.r * 2, h, len), mat);
    box.position.set((ob.x1 + ob.x2) / 2, groundY + h / 2, (ob.z1 + ob.z2) / 2);
    box.rotation.y = Math.atan2(dx, dz);
    return box;
  }

  get visible(): boolean {
    return this.object.visible;
  }
  setVisible(v: boolean): void {
    this.object.visible = v;
  }
  toggle(): boolean {
    this.object.visible = !this.object.visible;
    return this.object.visible;
  }

  dispose(): void {
    this.object.traverse((o) => {
      const line = o as THREE.Line;
      line.geometry?.dispose();
    });
    for (const m of this.mats.values()) m.dispose();
    for (const m of this.faintMats.values()) m.dispose();
    for (const m of this.fillMats.values()) m.dispose();
    for (const m of this.surfMats.values()) m.dispose();
    this.clearanceMat.dispose();
  }
}

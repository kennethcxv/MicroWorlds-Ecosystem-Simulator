/**
 * Terrain + dirt VISUALS for the lizard terrarium:
 *   - `applyTerrainToSand` re-displaces the existing sand mesh from the sculpted
 *     height map (added on top of its baked dune noise),
 *   - `GroundOverlay` — a transparent canvas decal just above the sand that draws
 *     the DIRT map (warm dark blotches) and WATER patches (teal wet sheen), so
 *     grime + wet patches read exactly where the sim says they are,
 *   - `AnalysisOverlay` — the FILTERS tab's soft colour wash (heat / humidity /
 *     hide coverage / …): a second draped decal painted from a per-cell field
 *     through a registry colour ramp, with opacity + contrast controls,
 *   - `TerrainBrushCursor` — Terrain Mode's in-world brush: a soft white ring
 *     sized to the brush radius + a green centre badge showing the tool glyph,
 *   - `SparkleBurst` — a tiny star-points celebration when the tank is spotless.
 */
import * as THREE from "three";
import type { HabitatDimensions } from "../../habitats/HabitatTypes";
import type { Terrain } from "../../habitats/HabitatTerrain";
import { terrainHeightAt } from "../../habitats/HabitatTerrain";
import type { DirtMap } from "../../habitats/lizard/LizardDirtSystem";
import { scaleColor, type FilterColorStop } from "../../data/habitatFilters";
import type { CursorGlyph } from "../../data/terrainTools";

/** Re-displace the sand plane: baked dune noise + sculpted terrain heights. */
export function applyTerrainToSand(sand: THREE.Mesh, terrain: Terrain, dims: HabitatDimensions): void {
  const geo = sand.geometry as THREE.BufferGeometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  let base = sand.userData.baseY as Float32Array | undefined;
  if (!base) {
    base = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) base[i] = pos.getY(i);
    sand.userData.baseY = base;
  }
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, base[i] + terrainHeightAt(terrain, dims, pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/** A transparent decal plane drawing dirt blotches + wet patches over the sand.
 *  The plane is SUBDIVIDED and displaced by the sculpted terrain (see
 *  {@link GroundOverlay.applyTerrain}) so decals follow dunes + depressions
 *  instead of floating flat above a hole. Can also tint a HEIGHT HEATMAP
 *  (debug): depressions cyan, dunes amber, too-steep cells red. */
export class GroundOverlay {
  readonly mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private tex: THREE.CanvasTexture;
  private dims: HabitatDimensions;

  constructor(dims: HabitatDimensions, groundY: number, inset = 0.01) {
    this.dims = dims;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 176;
    this.canvas.height = 112;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    // Same footprint as the sand plane (pass the spec's sandInset) so decals align.
    const innerW = dims.width - dims.glass * 2 - inset * 2;
    const innerD = dims.depth - dims.glass * 2 - inset * 2;
    const geo = new THREE.PlaneGeometry(innerW, innerD, 72, 48);
    geo.rotateX(-Math.PI / 2); // bake the floor orientation so vertices carry x/z
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0.85 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = groundY + 0.004;
    this.mesh.renderOrder = 2;
    this.mesh.userData.groundOverlay = true;
  }

  /** Drape the decal plane over the sculpted terrain (same field as the sand). */
  applyTerrain(terrain: Terrain): void {
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, terrainHeightAt(terrain, this.dims, pos.getX(i), pos.getZ(i)));
    }
    pos.needsUpdate = true;
  }

  /** Redraw from the live dirt map + terrain water mask. `opts.heights` also
   *  tints the height heatmap (debug view). */
  redraw(dirt: DirtMap, terrain: Terrain, opts: { heights?: boolean } = {}): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    // Height heatmap (debug): cyan depressions, amber dunes, red too-steep cells.
    if (opts.heights) {
      const cw = W / terrain.nx;
      const ch = H / terrain.nz;
      const cellW = this.dims.width / terrain.nx;
      const cellD = this.dims.depth / terrain.nz;
      const hAt = (ix: number, iz: number): number =>
        terrain.heights[Math.min(terrain.nz - 1, Math.max(0, iz)) * terrain.nx + Math.min(terrain.nx - 1, Math.max(0, ix))];
      for (let iz = 0; iz < terrain.nz; iz++) {
        for (let ix = 0; ix < terrain.nx; ix++) {
          const h = terrain.heights[iz * terrain.nx + ix];
          const gx = (hAt(ix + 1, iz) - hAt(ix - 1, iz)) / (2 * cellW);
          const gz = (hAt(ix, iz + 1) - hAt(ix, iz - 1)) / (2 * cellD);
          const steep = Math.atan(Math.hypot(gx, gz)) > 0.7; // MAX_WALK_SLOPE
          if (!steep && Math.abs(h) < 0.008) continue;
          ctx.fillStyle = steep
            ? "rgba(240, 70, 56, 0.55)"
            : h > 0
              ? `rgba(240, 176, 70, ${Math.min(0.55, h * 2.6)})`
              : `rgba(72, 196, 228, ${Math.min(0.6, -h * 6)})`;
          ctx.fillRect(ix * cw, iz * ch, cw + 0.5, ch + 0.5);
        }
      }
    }
    // Wet patches: soft teal, slightly darker rim.
    for (let iz = 0; iz < terrain.nz; iz++) {
      for (let ix = 0; ix < terrain.nx; ix++) {
        if (!terrain.water[iz * terrain.nx + ix]) continue;
        const x = (ix / terrain.nx) * W;
        const y = (iz / terrain.nz) * H;
        ctx.fillStyle = "rgba(46, 118, 130, 0.55)";
        ctx.beginPath();
        ctx.ellipse(x, y, W / terrain.nx, H / terrain.nz, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Dirt: warm dark blotches whose alpha follows the local dirt level. Each
    // cell's blob is JITTERED (deterministic hash — stable between redraws) in
    // position, radius and rotation so a very dirty tank reads as organic grime,
    // never as a mechanical checker grid of aligned ellipses.
    const jit = (ix: number, iz: number, k: number): number => {
      const s = Math.sin(ix * 127.1 + iz * 311.7 + k * 74.7) * 43758.5453;
      return s - Math.floor(s);
    };
    for (let iz = 0; iz < dirt.nz; iz++) {
      for (let ix = 0; ix < dirt.nx; ix++) {
        const d = dirt.cells[iz * dirt.nx + ix];
        if (d < 0.07) continue;
        const x = ((ix + 0.5 + (jit(ix, iz, 1) - 0.5) * 0.9) / dirt.nx) * W;
        const y = ((iz + 0.5 + (jit(ix, iz, 2) - 0.5) * 0.9) / dirt.nz) * H;
        const rx = ((W / dirt.nx) * (0.55 + jit(ix, iz, 3) * 0.8) * (0.6 + d * 0.4));
        const ry = ((H / dirt.nz) * (0.55 + jit(ix, iz, 4) * 0.8) * (0.6 + d * 0.4));
        ctx.fillStyle = `rgba(72, 52, 30, ${(0.16 + 0.24 * d).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, jit(ix, iz, 5) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.geometry.dispose();
  }
}

/** World-space value field sampled by the analysis overlay (0 = legend low,
 *  1 = legend high). */
export type AnalysisField = (x: number, z: number) => number;

/**
 * The FILTERS tab's habitat wash: a second draped decal (same footprint as the
 * dirt overlay) painted from a per-cell field through a filter's colour ramp.
 * Low-res canvas + linear filtering keep the wash soft and blended, so the
 * habitat art reads through it. Opacity = the Overlay Opacity slider;
 * intensity = contrast exaggeration around the ramp's midpoint.
 */
export class AnalysisOverlay {
  readonly mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private off: HTMLCanvasElement;
  private tex: THREE.CanvasTexture;
  private dims: HabitatDimensions;
  private mat: THREE.MeshBasicMaterial;

  constructor(dims: HabitatDimensions, groundY: number, inset = 0.01) {
    this.dims = dims;
    // Field cells render on a small offscreen; the display canvas gets a
    // blur-scaled copy + an edge vignette so the wash reads soft + game-like.
    this.off = document.createElement("canvas");
    this.off.width = 120;
    this.off.height = 76;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 300;
    this.canvas.height = 190;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const innerW = dims.width - dims.glass * 2 - inset * 2;
    const innerD = dims.depth - dims.glass * 2 - inset * 2;
    const geo = new THREE.PlaneGeometry(innerW, innerD, 72, 48);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      depthWrite: false,
      opacity: 0.6,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = groundY + 0.006; // just above the dirt decal
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    this.mesh.userData.analysisOverlay = true;
  }

  /** Drape over the sculpted terrain (same field as the sand + dirt decal). */
  applyTerrain(terrain: Terrain): void {
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, terrainHeightAt(terrain, this.dims, pos.getX(i), pos.getZ(i)));
    }
    pos.needsUpdate = true;
  }

  /** Repaint from a field + colour ramp. `intensity` (0..1) exaggerates the
   *  contrast around the ramp midpoint (the Filters Intensity slider). The
   *  wash is blur-smoothed, extremes read slightly stronger than neutral
   *  values, and the edges fade before the glass. */
  paint(field: AnalysisField, scale: FilterColorStop[], intensity: number): void {
    const octx = this.off.getContext("2d");
    const ctx = this.canvas.getContext("2d");
    if (!octx || !ctx) return;
    const OW = this.off.width;
    const OH = this.off.height;
    const contrast = 0.55 + intensity * 0.9;
    const img = octx.createImageData(OW, OH);
    const data = img.data;
    for (let iz = 0; iz < OH; iz++) {
      for (let ix = 0; ix < OW; ix++) {
        const x = ((ix + 0.5) / OW - 0.5) * this.dims.width;
        const z = ((iz + 0.5) / OH - 0.5) * this.dims.depth;
        const raw = Math.max(0, Math.min(1, field(x, z)));
        const t = Math.max(0, Math.min(1, 0.5 + (raw - 0.5) * contrast));
        const c = parseInt(scaleColor(scale, t).slice(1), 16);
        const i4 = (iz * OW + ix) * 4;
        data[i4] = (c >> 16) & 255;
        data[i4 + 1] = (c >> 8) & 255;
        data[i4 + 2] = c & 255;
        // Extremes pop; neutral mid-values stay lighter so the art shows through.
        data[i4 + 3] = Math.round(168 + 80 * Math.abs(t - 0.5) * 2);
      }
    }
    octx.putImageData(img, 0, 0);

    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.filter = "blur(2.2px)";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.off, -3, -3, W + 6, H + 6);
    ctx.restore();
    // Edge vignette: the wash breathes out before the glass walls.
    const fade = (x0: number, y0: number, x1: number, y1: number): void => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    };
    ctx.globalCompositeOperation = "destination-out";
    const m = 14;
    fade(0, 0, m, 0);
    fade(W, 0, W - m, 0);
    fade(0, 0, 0, m * 0.8);
    fade(0, H, 0, H - m * 0.8);
    ctx.globalCompositeOperation = "source-over";
    this.tex.needsUpdate = true;
  }

  setOpacity(o: number): void {
    this.mat.opacity = Math.max(0, Math.min(1, o));
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v;
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  dispose(): void {
    this.tex.dispose();
    this.mat.dispose();
    this.mesh.geometry.dispose();
  }
}

/**
 * Terrain Mode's in-world brush cursor (reference): a soft white double ring
 * sized to the brush radius + a small green centre badge carrying the active
 * tool's glyph. Flat on the substrate, follows the pointer, never a debug gizmo.
 */
export class TerrainBrushCursor {
  readonly group: THREE.Group;
  private ring: THREE.Mesh;
  private badge: THREE.Mesh;
  private badgeTex: THREE.CanvasTexture | null = null;
  private ringMat: THREE.MeshBasicMaterial;
  private glyphShown: CursorGlyph | null = null;

  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.renderOrder = 8;

    // Soft white ring with a faint outer glow + a fainter inner ring.
    const rc = document.createElement("canvas");
    rc.width = rc.height = 256;
    const rctx = rc.getContext("2d")!;
    const ringAt = (r: number, w: number, a: number, blur: number): void => {
      rctx.save();
      rctx.strokeStyle = `rgba(255, 252, 240, ${a})`;
      rctx.lineWidth = w;
      rctx.shadowColor = "rgba(255, 248, 220, 0.9)";
      rctx.shadowBlur = blur;
      rctx.beginPath();
      rctx.arc(128, 128, r, 0, Math.PI * 2);
      rctx.stroke();
      rctx.restore();
    };
    ringAt(108, 5, 0.85, 14);
    ringAt(88, 2.5, 0.4, 8);
    const ringTex = new THREE.CanvasTexture(rc);
    ringTex.colorSpace = THREE.SRGBColorSpace;
    this.ringMat = new THREE.MeshBasicMaterial({
      map: ringTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;

    // Centre badge: green disc, glyph drawn per tool in setGlyph.
    this.badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
    );
    this.badge.rotation.x = -Math.PI / 2;
    this.badge.position.y = 0.004;
    this.group.add(this.ring, this.badge);
    this.setGlyph("up");
  }

  /** Redraw the centre badge for a tool glyph (cached per glyph). */
  setGlyph(glyph: CursorGlyph): void {
    if (this.glyphShown === glyph) return;
    this.glyphShown = glyph;
    const c = document.createElement("canvas");
    c.width = c.height = 96;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, 96, 96);
    // Green disc with a soft glow + subtle rim.
    ctx.save();
    ctx.shadowColor = "rgba(120, 220, 80, 0.9)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#54b03c";
    ctx.beginPath();
    ctx.arc(48, 48, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(48, 48, 30, 0, Math.PI * 2);
    ctx.stroke();
    // Glyph in white.
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const arrow = (up: boolean): void => {
      const dir = up ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(48, 48 - 14 * dir);
      ctx.lineTo(48, 48 + 13 * dir);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(37, 48 + 2 * dir);
      ctx.lineTo(48, 48 + 14 * dir);
      ctx.lineTo(59, 48 + 2 * dir);
      ctx.stroke();
    };
    switch (glyph) {
      case "up":
        arrow(true);
        break;
      case "down":
        arrow(false);
        break;
      case "wave":
        ctx.beginPath();
        ctx.moveTo(33, 44);
        ctx.quadraticCurveTo(40, 36, 48, 44);
        ctx.quadraticCurveTo(56, 52, 63, 44);
        ctx.moveTo(33, 56);
        ctx.quadraticCurveTo(40, 48, 48, 56);
        ctx.quadraticCurveTo(56, 64, 63, 56);
        ctx.stroke();
        break;
      case "cross":
        ctx.beginPath();
        ctx.moveTo(38, 38);
        ctx.lineTo(58, 58);
        ctx.moveTo(58, 38);
        ctx.lineTo(38, 58);
        ctx.stroke();
        break;
      case "flat":
        ctx.lineWidth = 5.5;
        ctx.beginPath();
        ctx.moveTo(34, 58);
        ctx.lineTo(62, 58);
        ctx.stroke();
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(42, 36);
        ctx.lineTo(42, 50);
        ctx.moveTo(37, 46);
        ctx.lineTo(42, 51);
        ctx.lineTo(47, 46);
        ctx.moveTo(54, 36);
        ctx.lineTo(54, 50);
        ctx.moveTo(49, 46);
        ctx.lineTo(54, 51);
        ctx.lineTo(59, 46);
        ctx.stroke();
        break;
      case "drop":
        ctx.beginPath();
        ctx.moveTo(48, 33);
        ctx.quadraticCurveTo(60, 50, 60, 56);
        ctx.arc(48, 56, 12, 0, Math.PI, false);
        ctx.quadraticCurveTo(36, 50, 48, 33);
        ctx.fill();
        break;
      case "sun":
        ctx.beginPath();
        ctx.arc(48, 48, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 4;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(48 + Math.cos(a) * 14, 48 + Math.sin(a) * 14);
          ctx.lineTo(48 + Math.cos(a) * 20, 48 + Math.sin(a) * 20);
          ctx.stroke();
        }
        break;
      case "brush":
        ctx.beginPath();
        ctx.moveTo(58, 34);
        ctx.lineTo(46, 48);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(44, 50);
        ctx.quadraticCurveTo(36, 52, 34, 62);
        ctx.quadraticCurveTo(44, 62, 48, 54);
        ctx.closePath();
        ctx.fill();
        break;
      case "box":
        ctx.lineWidth = 4.5;
        ctx.setLineDash([7, 6]);
        ctx.strokeRect(34, 34, 28, 28);
        ctx.setLineDash([]);
        break;
    }
    this.badgeTex?.dispose();
    this.badgeTex = new THREE.CanvasTexture(c);
    this.badgeTex.colorSpace = THREE.SRGBColorSpace;
    const mat = this.badge.material as THREE.MeshBasicMaterial;
    mat.map = this.badgeTex;
    mat.needsUpdate = true;
  }

  /** Place at world (x, groundY, z) with the ring sized to the brush radius.
   *  `active` brightens the ring while the player is stroking. */
  show(x: number, groundY: number, z: number, radius: number, active: boolean): void {
    this.group.position.set(x, groundY + 0.01, z);
    const d = Math.max(0.12, radius * 2);
    this.ring.scale.set(d, d, 1);
    this.ringMat.opacity = active ? 1 : 0.82;
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  dispose(): void {
    this.ringMat.map?.dispose();
    this.ringMat.dispose();
    this.badgeTex?.dispose();
    (this.badge.material as THREE.Material).dispose();
    this.ring.geometry.dispose();
    this.badge.geometry.dispose();
  }
}

/** A brief rising-stars celebration (fully clean tank). Add `points` to the scene,
 *  call update(dt) each frame; `done` flips true when it has faded out. */
export class SparkleBurst {
  readonly points: THREE.Points;
  private vel: number[] = [];
  private life = 0;
  private readonly DUR = 1.8;

  constructor(bounds: { minX: number; maxX: number; minZ: number; maxZ: number; y: number }) {
    const n = 26;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      positions[i * 3 + 1] = bounds.y + 0.03 + Math.random() * 0.05;
      positions[i * 3 + 2] = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      this.vel.push(0.14 + Math.random() * 0.22);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xfff3b0,
      size: 0.035,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.renderOrder = 10;
  }

  get done(): boolean {
    return this.life >= this.DUR;
  }

  update(dt: number): void {
    this.life += dt;
    const pos = this.points.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + this.vel[i] * dt);
    pos.needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).opacity = Math.max(0, 0.95 * (1 - this.life / this.DUR));
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

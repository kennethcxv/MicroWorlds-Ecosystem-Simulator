/**
 * Terrain + dirt VISUALS for the lizard terrarium:
 *   - `applyTerrainToSand` re-displaces the existing sand mesh from the sculpted
 *     height map (added on top of its baked dune noise),
 *   - `GroundOverlay` — a transparent canvas decal just above the sand that draws
 *     the DIRT map (warm dark blotches) and WATER patches (teal wet sheen), so
 *     grime + wet patches read exactly where the sim says they are,
 *   - `SparkleBurst` — a tiny star-points celebration when the tank is spotless.
 */
import * as THREE from "three";
import type { HabitatDimensions } from "../../habitats/HabitatTypes";
import type { Terrain } from "../../habitats/HabitatTerrain";
import { terrainHeightAt } from "../../habitats/HabitatTerrain";
import type { DirtMap } from "../../habitats/lizard/LizardDirtSystem";

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

/**
 * Procedural DESERT SAND for the lizard terrarium floor + scattered stone chips +
 * an organic low-poly rock helper. All generated in-code so the habitat looks like
 * warm, grainy sand with no art dependency — but a real tileable `sand_substrate_01
 * .png` dropped into public/assets/textures/habitats/lizard/ overrides the texture
 * (see ThreeLizardScene). The sand tiles with RepeatWrapping (it is a TEXTURE on a
 * floor plane, never a 3D model) and the floor plane carries subtle height noise so
 * it doesn't read as a flat card. The SCULPTED terrain height map displaces this
 * same plane, and the collision world samples the same field — what you see is
 * what the animal walks on.
 */
import * as THREE from "three";

const TAU = Math.PI * 2;

/** Tiny deterministic PRNG so the sand looks identical across reloads. */
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

/** Smooth-ish value noise from sines — enough for millimetre floor undulation. */
function noise2(x: number, z: number): number {
  return (
    Math.sin(x * 6.1 + z * 2.3) * 0.5 +
    Math.sin(x * 2.7 - z * 5.3) * 0.3 +
    Math.sin(x * 11.7 + z * 9.1) * 0.2
  );
}

import type { SandTextureStyle } from "../../data/terrains";

/** Colour roles for the procedural substrate texture (see src/data/terrains.ts
 *  SandPalette — same field names, so a registry palette drops straight in). */
export interface SandTexturePalette {
  base: string;
  patchDark: string;
  patchLight: string;
  grainDark: string;
  grainLight: string;
  coarse: string;
  coarseCount: number;
  /** Surface features drawn on top (real pebbles / cracks / ripples / …). */
  style?: SandTextureStyle;
}

/** The shipped warm desert sand (= the Sahara Sand registry entry). */
export const DEFAULT_SAND_PALETTE: SandTexturePalette = {
  base: "#d8bd8c",
  patchDark: "#c8a874",
  patchLight: "#e6d3a6",
  grainDark: "#9c8155",
  grainLight: "#f1e6c6",
  coarse: "#7d6440",
  coarseCount: 900,
  style: "sand",
};

/**
 * Generate a seamless substrate CANVAS from a palette: a base wash, soft
 * low-frequency tone patches, fine two-tone grain, and sparse coarse flecks
 * (rocky mixes pass a higher coarseCount and read grittier). Tileable — the
 * classic floor texture wraps it; the material-floor compositor samples it
 * per painted cell.
 */
export function makeSandCanvas(size = 256, palette: SandTexturePalette = DEFAULT_SAND_PALETTE): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rnd = mulberry(0x5a17);

  // Substrate base wash.
  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, size, size);

  // Low-frequency tone patches (warmer + cooler), drawn wrapped so edges tile.
  const patch = (fill: string, n: number, rMin: number, rMax: number, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    for (let i = 0; i < n; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = rMin + rnd() * (rMax - rMin);
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, r, 0, TAU);
          ctx.fill();
        }
      }
    }
  };
  // Kept SUBTLE: strong patches read as an obvious repeat once the texture tiles
  // across a metre-wide floor — the grain carries the sand, not the blotches.
  patch(palette.patchDark, 26, 10, 26, 0.09); // shadow patches
  patch(palette.patchLight, 22, 8, 22, 0.07); // pale highlights

  // Fine grain speckle.
  const speck = (color: string, n: number, sMax: number, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const s = 0.6 + rnd() * sMax;
      ctx.fillRect(rnd() * size, rnd() * size, s, s);
    }
  };
  speck(palette.grainDark, 5200, 1.4, 0.35); // dark grains
  speck(palette.grainLight, 4200, 1.4, 0.3); // light grains
  speck(palette.coarse, palette.coarseCount, 2.2, 0.4); // sparse coarse bits

  // ── REAL surface features per material (never just a tint) ──────────────
  const wrap = (draw: (dx: number, dy: number) => void): void => {
    // Draw 9× around the seams so features tile like everything else.
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) draw(dx, dy);
  };
  const style = palette.style ?? "sand";
  if (style === "pebbles" || style === "rocky") {
    // Individually shaded stones: body + top-light arc + under-shadow. Rocky
    // stones are fewer, larger and angular; pebbles rounder and denser.
    const n = style === "pebbles" ? 150 : 70;
    for (let i = 0; i < n; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = (style === "pebbles" ? 4.5 : 6.5) + rnd() * (style === "pebbles" ? 6 : 10);
      const squash = 0.65 + rnd() * 0.3;
      const rot = rnd() * Math.PI;
      const tone = [palette.grainDark, palette.coarse, palette.patchDark, palette.grainLight][i % 4];
      wrap((dx, dy) => {
        ctx.save();
        ctx.translate(x + dx, y + dy);
        ctx.rotate(rot);
        // Under-shadow.
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = "#241a10";
        ctx.beginPath();
        ctx.ellipse(1.4, 1.8, r, r * squash, 0, 0, TAU);
        ctx.fill();
        // Stone body (angular for rocky: jittered polygon; round for pebbles).
        ctx.globalAlpha = 0.96;
        ctx.fillStyle = tone;
        ctx.beginPath();
        if (style === "rocky") {
          const pts = 5 + ((i * 7) % 3);
          for (let p = 0; p < pts; p++) {
            const a = (p / pts) * TAU;
            const rr = r * (0.7 + rnd() * 0.45);
            const px = Math.cos(a) * rr;
            const py = Math.sin(a) * rr * squash;
            if (p === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        } else {
          ctx.ellipse(0, 0, r, r * squash, 0, 0, TAU);
        }
        ctx.fill();
        // Top-light highlight.
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = palette.patchLight;
        ctx.beginPath();
        ctx.ellipse(-r * 0.22, -r * squash * 0.32, r * 0.55, r * squash * 0.4, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      });
    }
  } else if (style === "clay") {
    // Sun-baked crack network: meandering dark fissures + pale plate edges.
    ctx.lineCap = "round";
    for (let i = 0; i < 26; i++) {
      let x = rnd() * size;
      let y = rnd() * size;
      let a = rnd() * TAU;
      const segs = 6 + Math.floor(rnd() * 7);
      const path: [number, number][] = [[x, y]];
      for (let s = 0; s < segs; s++) {
        a += (rnd() - 0.5) * 1.1;
        x += Math.cos(a) * (7 + rnd() * 9);
        y += Math.sin(a) * (7 + rnd() * 9);
        path.push([x, y]);
      }
      wrap((dx, dy) => {
        // Pale rim beside the crack (raised plate edge)…
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = palette.patchLight;
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(path[0][0] + dx + 1, path[0][1] + dy + 1);
        for (const [px, py] of path.slice(1)) ctx.lineTo(px + dx + 1, py + dy + 1);
        ctx.stroke();
        // …then the fissure itself.
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = "#3a2413";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(path[0][0] + dx, path[0][1] + dy);
        for (const [px, py] of path.slice(1)) ctx.lineTo(px + dx, py + dy);
        ctx.stroke();
      });
    }
  } else if (style === "ripples") {
    // Wind-carved ripple bands: soft dark troughs with bright crests.
    for (let i = 0; i < 13; i++) {
      const y0 = (i / 13) * size + rnd() * 8;
      const amp = 3 + rnd() * 5;
      const freq = 0.02 + rnd() * 0.02;
      const phase = rnd() * TAU;
      wrap((dx, dy) => {
        const band = (off: number, color: string, width: number, alpha: number): void => {
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.beginPath();
          for (let px = 0; px <= size; px += 4) {
            const py = y0 + Math.sin(px * freq * TAU + phase) * amp + off;
            if (px === 0) ctx.moveTo(px + dx, py + dy);
            else ctx.lineTo(px + dx, py + dy);
          }
          ctx.stroke();
        };
        band(2.4, palette.grainDark, 4.6, 0.34); // shadowed trough
        band(-1.6, palette.grainLight, 2.4, 0.42); // sunlit crest
      });
    }
  } else if (style === "litter") {
    // Fallen leaves: skewed ellipses with a midrib, in layered browns.
    for (let i = 0; i < 90; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const L = 7 + rnd() * 9;
      const rot = rnd() * TAU;
      const tone = [palette.patchDark, palette.grainDark, palette.patchLight, palette.coarse][i % 4];
      wrap((dx, dy) => {
        ctx.save();
        ctx.translate(x + dx, y + dy);
        ctx.rotate(rot);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = tone;
        ctx.beginPath();
        ctx.ellipse(0, 0, L, L * 0.42, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = "#2c1d0e";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(-L * 0.85, 0);
        ctx.lineTo(L * 0.85, 0);
        ctx.stroke();
        ctx.restore();
      });
    }
  } else if (style === "moss") {
    // Moss cushions: clustered soft green blobs over the damp soil.
    for (let i = 0; i < 46; i++) {
      const cx = rnd() * size;
      const cy = rnd() * size;
      const clump = 4 + Math.floor(rnd() * 6);
      wrap((dx, dy) => {
        for (let b = 0; b < clump; b++) {
          const bx = cx + (rnd() - 0.5) * 16;
          const by = cy + (rnd() - 0.5) * 16;
          const r = 2.5 + rnd() * 4.5;
          const g = ctx.createRadialGradient(bx + dx, by + dy, 0.5, bx + dx, by + dy, r);
          g.addColorStop(0, "rgba(122, 168, 92, 0.55)");
          g.addColorStop(1, "rgba(70, 104, 56, 0.05)");
          ctx.globalAlpha = 1;
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(bx + dx, by + dy, r, 0, TAU);
          ctx.fill();
        }
      });
    }
  }

  ctx.globalAlpha = 1;
  return canvas;
}

/** The classic tileable floor texture (a wrapped {@link makeSandCanvas}). */
export function makeSandTexture(size = 256, palette: SandTexturePalette = DEFAULT_SAND_PALETTE): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(makeSandCanvas(size, palette));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Minimal shape of the per-cell material map this compositor reads (the pure
 *  model lives in src/habitats/HabitatMaterialMap.ts). */
export interface MaterialMapLike {
  nx: number;
  nz: number;
  ids: string[];
  cells: number[];
}

/**
 * MATERIAL FLOOR — the painted-substrate compositor. One full-floor canvas
 * (not tiled) whose pixels copy from each material's procedural sand tile
 * according to the per-cell material map, with hash-jittered cell lookups so
 * boundaries read as hand-painted ragged edges instead of a grid. Painting
 * repaints only the stroked region, so drags stay smooth.
 */
export class MaterialFloor {
  readonly texture: THREE.CanvasTexture;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tiles = new Map<string, ImageData>();
  private paletteFor: (id: string) => SandTexturePalette;
  private dims: SandDims;
  private innerW: number;
  private innerD: number;
  private readonly TILE = 256;

  constructor(dims: SandDims, paletteFor: (id: string) => SandTexturePalette, inset = 0.01) {
    this.dims = dims;
    this.paletteFor = paletteFor;
    this.innerW = dims.width - dims.glass * 2 - inset * 2;
    this.innerD = dims.depth - dims.glass * 2 - inset * 2;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 896;
    this.canvas.height = Math.round((896 * this.innerD) / this.innerW);
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }

  private tile(id: string): ImageData {
    let t = this.tiles.get(id);
    if (!t) {
      const c = makeSandCanvas(this.TILE, this.paletteFor(id));
      t = c.getContext("2d")!.getImageData(0, 0, this.TILE, this.TILE);
      this.tiles.set(id, t);
    }
    return t;
  }

  /** Repaint the whole floor, or just the region around a brush stroke. */
  paint(map: MaterialMapLike, region?: { x: number; z: number; radius: number }): void {
    const W = this.canvas.width;
    const H = this.canvas.height;
    let px0 = 0;
    let py0 = 0;
    let px1 = W;
    let py1 = H;
    if (region) {
      // World → canvas pixels (the canvas spans the INNER floor plane), padded
      // by one map cell so the jittered boundary re-renders too.
      const pad = (this.dims.width / map.nx) * 1.5;
      const toPx = (x: number): number => ((x / this.innerW + 0.5) * W) | 0;
      const toPy = (z: number): number => ((z / this.innerD + 0.5) * H) | 0;
      px0 = Math.max(0, toPx(region.x - region.radius - pad));
      px1 = Math.min(W, toPx(region.x + region.radius + pad) + 1);
      py0 = Math.max(0, toPy(region.z - region.radius - pad));
      py1 = Math.min(H, toPy(region.z + region.radius + pad) + 1);
      if (px1 <= px0 || py1 <= py0) return;
    }
    const rw = px1 - px0;
    const rh = py1 - py0;
    const out = this.ctx.createImageData(rw, rh);
    const T = this.TILE;
    const cellW = this.dims.width / map.nx;
    const cellD = this.dims.depth / map.nz;
    for (let py = py0; py < py1; py++) {
      const z = ((py + 0.5) / H - 0.5) * this.innerD;
      for (let px = px0; px < px1; px++) {
        const x = ((px + 0.5) / W - 0.5) * this.innerW;
        // Ragged organic boundary: jitter the lookup by up to ~a third of a cell.
        const h = Math.sin(px * 127.1 + py * 311.7) * 43758.5453;
        const h2 = Math.sin(px * 269.5 + py * 183.3) * 28001.8384;
        const jx = (h - Math.floor(h) - 0.5) * cellW * 0.7;
        const jz = (h2 - Math.floor(h2) - 0.5) * cellD * 0.7;
        const ix = Math.max(0, Math.min(map.nx - 1, Math.floor((x + jx + this.dims.width / 2) / cellW)));
        const iz = Math.max(0, Math.min(map.nz - 1, Math.floor((z + jz + this.dims.depth / 2) / cellD)));
        const id = map.ids[map.cells[iz * map.nx + ix]] ?? map.ids[0];
        const tile = this.tile(id);
        const si = ((py % T) * T + (px % T)) * 4;
        const di = ((py - py0) * rw + (px - px0)) * 4;
        out.data[di] = tile.data[si];
        out.data[di + 1] = tile.data[si + 1];
        out.data[di + 2] = tile.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
    this.ctx.putImageData(out, px0, py0);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

export interface SandDims {
  width: number;
  depth: number;
  glass: number;
  substrateTop: number;
}

/**
 * A textured sand floor plane laid just above the substrate bed: subdivided +
 * gently height-displaced (mm scale) so it reads as real, uneven sand rather than
 * a flat card. Returns the mesh (userData.sand = true so the scene can swap the
 * map for a real PNG later). `tileMeters` controls how often the texture repeats.
 */
export function buildSandSurface(dims: SandDims, tex: THREE.Texture, tileMeters = 0.6, inset = 0.01): THREE.Mesh {
  const innerW = dims.width - dims.glass * 2 - inset * 2;
  const innerD = dims.depth - dims.glass * 2 - inset * 2;
  // Dense enough that sculpted depressions/dunes (± up to ~0.24 m) stay smooth.
  const geo = new THREE.PlaneGeometry(innerW, innerD, 96, 64);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, noise2(x, z) * 0.008); // ≈ up to 8 mm of dune
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const t = tex as THREE.Texture & { repeat: THREE.Vector2 };
  t.repeat.set(Math.max(2, Math.round(innerW / tileMeters)), Math.max(2, Math.round(innerD / tileMeters)));

  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.99, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = dims.substrateTop + 0.002;
  mesh.receiveShadow = true;
  mesh.userData.sand = true;
  return mesh;
}

/** An organic low-poly rock: a jittered icosahedron, squashed a little and sat on
 *  its base. Used for scattered pebbles and as the rock PLACEHOLDER fallback so
 *  even without a GLB nothing looks like a raw sphere/box. */
export function makeRockMesh(radius: number, color: number, rng: () => number): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const j = 1 + (rng() - 0.5) * 0.5;
    pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j * 0.72, pos.getZ(i) * j);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.02, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.geometry.computeBoundingBox();
  mesh.position.y = -mesh.geometry.boundingBox!.min.y; // rest on the ground
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Scatter small stone chips across the sand (visual only — no collision). */
export function scatterPebbles(dims: SandDims, count = 30): THREE.Group {
  const g = new THREE.Group();
  const rng = mulberry(0x7e3);
  const hw = dims.width / 2 - dims.glass - 0.12;
  const hd = dims.depth / 2 - dims.glass - 0.12;
  const tones = [0x8f7f66, 0xa89372, 0x766650, 0xb9a684];
  for (let i = 0; i < count; i++) {
    const r = 0.008 + rng() * 0.02;
    const rock = makeRockMesh(r, tones[i % tones.length], rng);
    rock.position.set((rng() * 2 - 1) * hw, dims.substrateTop, (rng() * 2 - 1) * hd);
    rock.rotation.y = rng() * TAU;
    g.add(rock);
  }
  g.userData.pebbles = true;
  return g;
}

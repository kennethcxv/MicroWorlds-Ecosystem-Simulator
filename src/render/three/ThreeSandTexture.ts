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

/**
 * Generate a seamless, warm desert-sand CanvasTexture: a sand base, soft low-
 * frequency tone patches, fine two-tone grain, and a few pale stone flecks.
 * Wrapped with RepeatWrapping so it tiles across the floor.
 */
export function makeSandTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rnd = mulberry(0x5a17);

  // Warm sand base.
  ctx.fillStyle = "#d8bd8c";
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
  patch("#c8a874", 26, 10, 26, 0.09); // warm shadow patches
  patch("#e6d3a6", 22, 8, 22, 0.07); // pale highlights

  // Fine grain speckle.
  const speck = (color: string, n: number, sMax: number, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const s = 0.6 + rnd() * sMax;
      ctx.fillRect(rnd() * size, rnd() * size, s, s);
    }
  };
  speck("#9c8155", 5200, 1.4, 0.35); // dark grains
  speck("#f1e6c6", 4200, 1.4, 0.3); // light grains
  speck("#7d6440", 900, 2.2, 0.4); // sparse coarse bits

  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
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

/**
 * PROCEDURAL SWATCH — a small canvas tile drawn from a terrain's palette for
 * materials that ship without a cropped photo swatch (terrains.ts `swatch:
 * ""`). Pure DOM canvas (no Three import — this renders in the always-loaded
 * UI bundle). Deliberately simpler than the floor generator: base wash, tone
 * patches, grain, and a stylised per-style feature pass, at card size.
 */
import type { TerrainDef } from "../data/terrains";

const TAU = Math.PI * 2;

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

/** Draw (and cache) a square swatch canvas for a terrain def. */
const cache = new Map<string, HTMLCanvasElement>();

export function terrainSwatchCanvas(t: TerrainDef, size = 96): HTMLCanvasElement {
  const key = `${t.id}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const p = t.palette;
  const rnd = mulberry(0x51a7 + t.id.length);

  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.14;
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = i % 2 ? p.patchDark : p.patchLight;
    ctx.beginPath();
    ctx.arc(rnd() * size, rnd() * size, 6 + rnd() * 14, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 0.4;
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = i % 2 ? p.grainDark : p.grainLight;
    const s = 0.6 + rnd() * 1.2;
    ctx.fillRect(rnd() * size, rnd() * size, s, s);
  }

  const style = p.style ?? "sand";
  if (style === "soil") {
    for (let i = 0; i < 90; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 1.4 + rnd() * 2.4;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = [p.grainDark, p.coarse, p.patchDark][i % 3];
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.8, rnd() * TAU, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = p.grainLight;
      ctx.beginPath();
      ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.28, 0, TAU);
      ctx.fill();
    }
  } else if (style === "bark") {
    for (let i = 0; i < 26; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const L = 10 + rnd() * 12;
      const W = L * (0.36 + rnd() * 0.2);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rnd() * TAU);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#1d1206";
      ctx.beginPath();
      ctx.roundRect(-L / 2 + 1, -W / 2 + 1.4, L, W, W * 0.4);
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = [p.patchDark, p.grainDark, p.base, p.patchLight][i % 4];
      ctx.beginPath();
      ctx.roundRect(-L / 2, -W / 2, L, W, W * 0.4);
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = p.grainLight;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-L * 0.36, -W * 0.24);
      ctx.lineTo(L * 0.36, -W * 0.24);
      ctx.stroke();
      ctx.restore();
    }
  } else if (style === "pebbles" || style === "rocky") {
    for (let i = 0; i < 28; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 4 + rnd() * 7;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = [p.grainDark, p.coarse, p.patchDark, p.grainLight][i % 4];
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.65 + rnd() * 0.3), rnd() * Math.PI, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = p.patchLight;
      ctx.beginPath();
      ctx.ellipse(x - r * 0.2, y - r * 0.3, r * 0.5, r * 0.3, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  cache.set(key, c);
  return c;
}

/** Data-URL form for plugging straight into an <img>. */
export function terrainSwatchUrl(t: TerrainDef, size = 96): string {
  return terrainSwatchCanvas(t, size).toDataURL("image/png");
}

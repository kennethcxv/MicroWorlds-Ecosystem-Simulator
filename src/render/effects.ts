/**
 * Reusable canvas drawing effects — the shared "render pipeline" for tank art.
 *
 * The centrepiece is `drawSprite`, which places a sprite by its *content* box
 * (ignoring transparent padding) and applies an underwater grade in one pass:
 * teal tint + depth haze + top-down lighting, confined to the sprite's pixels
 * via an offscreen 'source-atop' stamp. Everything else (water gradient, god
 * rays, caustics, surface shimmer, glass front, contact shadows) lives here too
 * so the scene composes from a consistent, cohesive set of primitives.
 */
import type { Rect, SceneLayout } from "./layers";
import type { TrimBox } from "../data/species";
import { drawSlicedStamp } from "./fishDeformation";

const TEAL = "22, 78, 86"; // underwater grade colour (rgb)

// ── Offscreen stamp used to grade individual sprites ──────────────────────────
const stamp: HTMLCanvasElement = document.createElement("canvas");
const sctx = stamp.getContext("2d")!;
let stampSize = 0;
function ensureStamp(w: number, h: number): void {
  const need = Math.max(w, h);
  if (need > stampSize) {
    stampSize = Math.min(2048, 1 << Math.ceil(Math.log2(need)));
    stamp.width = stampSize;
    stamp.height = stampSize;
  }
}

export interface SpritePlacement {
  anchorX: number;
  anchorY: number;
  /** Target on-screen content width in px (preferred). */
  contentW?: number;
  /** Or target content height in px. */
  contentH?: number;
  /** 0 = anchor at content top, 1 = anchor at content bottom (default 1). */
  anchorYFrac?: number;
  flip?: boolean;
  /**
   * Signed horizontal scale. Overrides `flip`. Sprites face left, so -1 faces
   * right and +1 faces left; magnitudes < 1 squash the body (used to animate a
   * fish turning "through" an edge-on profile rather than instantly mirroring).
   */
  scaleX?: number;
  rot?: number;
  alpha?: number;
  /**
   * Optional body deformation (sliced swim flex). Amplitudes are fractions of
   * the sprite's drawn height so they scale with on-screen size. When present the
   * sprite is drawn as vertical slices bent by a head→tail wave.
   */
  deform?: {
    headLeft: boolean;
    slices: number;
    /** Peak tail swing as a fraction of drawn height. */
    ampFrac: number;
    phase: number;
    waveSpan: number;
    /** Static turn curvature as a fraction of drawn height (signed). */
    turnBendFrac: number;
  };
}

export interface SpriteStyle {
  /** Teal tint amount 0..1 (underwater colour cast). */
  tint?: number;
  /** Depth haze 0..1 (fades far things toward the water colour). */
  haze?: number;
  /** Top-down light highlight 0..1. */
  light?: number;
}

/**
 * Draw a sprite placed by its content box with the underwater grade applied.
 * Returns the on-screen content rect (useful for shadows / hit-testing).
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  trim: TrimBox,
  place: SpritePlacement,
  style: SpriteStyle = {},
): Rect {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return { x: place.anchorX, y: place.anchorY, w: 0, h: 0 };

  const cwPx = trim.w * iw;
  const chPx = trim.h * ih;
  let scale: number;
  if (place.contentW != null) scale = place.contentW / cwPx;
  else if (place.contentH != null) scale = place.contentH / chPx;
  else scale = 1;

  const drawnW = iw * scale;
  const drawnH = ih * scale;
  const anchorYFrac = place.anchorYFrac ?? 1;

  // Anchor point inside the drawn (scaled) image.
  const ax = (trim.x * iw + (trim.w * iw) / 2) * scale;
  const ay = (trim.y * ih + trim.h * ih * anchorYFrac) * scale;

  const tint = style.tint ?? 0;
  const haze = style.haze ?? 0;
  const light = style.light ?? 0;

  ensureStamp(Math.ceil(drawnW), Math.ceil(drawnH));
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, drawnW + 2, drawnH + 2);
  sctx.globalCompositeOperation = "source-over";
  sctx.globalAlpha = 1;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(img, 0, 0, drawnW, drawnH);

  // Confine all grading to the sprite's own pixels.
  sctx.globalCompositeOperation = "source-atop";
  if (tint + haze > 0.001) {
    sctx.fillStyle = `rgba(${TEAL}, ${Math.min(0.85, tint * 0.5 + haze)})`;
    sctx.fillRect(0, 0, drawnW, drawnH);
  }
  if (light > 0.001) {
    const g = sctx.createLinearGradient(0, 0, 0, drawnH);
    g.addColorStop(0, `rgba(208, 244, 240, ${light})`);
    g.addColorStop(0.45, "rgba(208, 244, 240, 0)");
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, drawnW, drawnH);
  }
  sctx.globalCompositeOperation = "source-over";

  const SW = Math.ceil(drawnW) + 2;
  const SH = Math.ceil(drawnH) + 2;
  ctx.save();
  ctx.globalAlpha = place.alpha ?? 1;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(place.anchorX, place.anchorY);
  const sx = place.scaleX != null ? place.scaleX : place.flip ? -1 : 1;
  if (sx !== 1) ctx.scale(sx, 1);
  if (place.rot) ctx.rotate(place.rot);
  if (place.deform) {
    const d = place.deform;
    drawSlicedStamp(ctx, stamp, SW, SH, ax, ay, {
      headLeft: d.headLeft,
      slices: d.slices,
      amp: d.ampFrac * drawnH,
      phase: d.phase,
      waveSpan: d.waveSpan,
      turnBend: d.turnBendFrac * drawnH,
      contentX0: trim.x * iw * scale,
      contentW: trim.w * iw * scale,
    });
  } else {
    ctx.drawImage(stamp, 0, 0, SW, SH, -ax, -ay, SW, SH);
  }
  ctx.restore();

  const contentW = trim.w * iw * scale;
  const contentH = trim.h * ih * scale;
  return {
    x: place.anchorX - contentW / 2,
    y: place.anchorY - contentH * anchorYFrac,
    w: contentW,
    h: contentH,
  };
}

/** Soft contact shadow ellipse on the substrate. */
export function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  alpha = 0.32,
  squash = 0.3,
): void {
  const h = width * squash;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, squash);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, width / 2);
  g.addColorStop(0, `rgba(2, 14, 16, ${alpha})`);
  g.addColorStop(0.7, `rgba(2, 14, 16, ${alpha * 0.5})`);
  g.addColorStop(1, "rgba(2, 14, 16, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, width / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  void h;
}

// ── Water body ────────────────────────────────────────────────────────────────

export function paintWater(ctx: CanvasRenderingContext2D, interior: Rect, light: number): void {
  const { x, y, w, h } = interior;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  const topL = 0.5 + light * 0.5;
  g.addColorStop(0, `rgba(${mix(48, 86, topL)}, ${mix(110, 146, topL)}, ${mix(118, 152, topL)}, 1)`);
  g.addColorStop(0.42, "rgba(30, 86, 94, 1)");
  g.addColorStop(1, "rgba(10, 36, 41, 1)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  // Soft brighter pool of light in the upper-centre (light from above).
  const rg = ctx.createRadialGradient(
    x + w * 0.5,
    y - h * 0.1,
    w * 0.05,
    x + w * 0.5,
    y + h * 0.2,
    w * 0.75,
  );
  rg.addColorStop(0, `rgba(160, 226, 220, ${0.1 + light * 0.07})`);
  rg.addColorStop(1, "rgba(160, 226, 220, 0)");
  ctx.fillStyle = rg;
  ctx.fillRect(x, y, w, h);
}

/** Diagonal light shafts descending from the surface. */
export function paintGodRays(
  ctx: CanvasRenderingContext2D,
  layout: SceneLayout,
  time: number,
  intensity: number,
): void {
  const { interior } = layout;
  ctx.save();
  ctx.beginPath();
  ctx.rect(interior.x, interior.y, interior.w, interior.h);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";

  const rays = 5;
  for (let i = 0; i < rays; i++) {
    const phase = i * 1.7;
    const sway = Math.sin(time * 0.12 + phase) * interior.w * 0.04;
    const ox = interior.x + interior.w * (0.18 + 0.16 * i) + sway;
    const topW = interior.w * 0.05;
    const botW = interior.w * 0.12;
    const skew = interior.w * 0.09;
    const a = (0.05 + 0.035 * Math.sin(time * 0.3 + phase * 1.3)) * intensity;
    const g = ctx.createLinearGradient(0, interior.y, 0, interior.y + interior.h * 0.95);
    g.addColorStop(0, `rgba(196, 240, 230, ${a})`);
    g.addColorStop(1, "rgba(196, 240, 230, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox - topW, interior.y);
    ctx.lineTo(ox + topW, interior.y);
    ctx.lineTo(ox + skew + botW, interior.y + interior.h);
    ctx.lineTo(ox + skew - botW, interior.y + interior.h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Faint rippling caustic light on the substrate / back wall. */
export function paintCaustics(
  ctx: CanvasRenderingContext2D,
  layout: SceneLayout,
  time: number,
): void {
  const { interior } = layout;
  ctx.save();
  ctx.beginPath();
  ctx.rect(interior.x, interior.y, interior.w, interior.h);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    const p = i * 2.3;
    const cxn = 0.5 + 0.42 * Math.sin(time * 0.18 + p);
    const yn = 0.55 + 0.4 * Math.cos(time * 0.13 + p * 1.4);
    const cx = interior.x + interior.w * cxn;
    const cy = interior.y + interior.h * yn;
    const r = interior.w * (0.05 + 0.03 * Math.sin(time * 0.2 + p));
    const a = 0.04 + 0.025 * Math.sin(time * 0.27 + p);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(178, 230, 218, ${Math.max(0, a)})`);
    g.addColorStop(1, "rgba(170, 226, 214, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
}

/** The water surface line: bright shimmer band + meniscus highlight. */
export function paintSurface(
  ctx: CanvasRenderingContext2D,
  layout: SceneLayout,
  time: number,
): void {
  const { interior } = layout;
  const y = interior.y;
  const band = interior.h * 0.07;

  ctx.save();
  ctx.beginPath();
  ctx.rect(interior.x, y - band * 0.4, interior.w, band * 1.8);
  ctx.clip();

  // Soft bright surface glow.
  const g = ctx.createLinearGradient(0, y - band, 0, y + band);
  g.addColorStop(0, "rgba(180, 232, 226, 0)");
  g.addColorStop(0.5, "rgba(200, 242, 234, 0.58)");
  g.addColorStop(1, "rgba(120, 180, 182, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(interior.x, y - band, interior.w, band * 2);

  // Rippling highlight line.
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const step = Math.max(6, interior.w / 90);
  for (let sx = interior.x; sx <= interior.x + interior.w; sx += step) {
    const t = (sx - interior.x) / interior.w;
    const yy =
      y +
      Math.sin(t * 26 + time * 2.0) * band * 0.18 +
      Math.sin(t * 11 - time * 1.3) * band * 0.12;
    if (sx === interior.x) ctx.moveTo(sx, yy);
    else ctx.lineTo(sx, yy);
  }
  ctx.strokeStyle = "rgba(216, 250, 242, 0.64)";
  ctx.stroke();
  ctx.restore();
}

// ── Procedural glass front ────────────────────────────────────────────────────

/** Glossy glass front: inner shadow + sheen, sharp reflections, bright edges, glints, wet rim. */
export function paintGlassFront(ctx: CanvasRenderingContext2D, layout: SceneLayout, time = 0): void {
  const { tank, interior } = layout;

  ctx.save();
  ctx.beginPath();
  ctx.rect(interior.x, interior.y, interior.w, interior.h);
  ctx.clip();

  // ── Depth: inner edge shadow + corner vignette (gives the glass thickness) ──
  const sideShadow = (fromLeft: boolean) => {
    const gx = fromLeft ? interior.x : interior.x + interior.w;
    const dir = fromLeft ? 1 : -1;
    const g = ctx.createLinearGradient(gx, 0, gx + dir * interior.w * 0.12, 0);
    g.addColorStop(0, "rgba(4, 20, 24, 0.5)");
    g.addColorStop(1, "rgba(4, 20, 24, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(interior.x, interior.y, interior.w, interior.h);
  };
  sideShadow(true);
  sideShadow(false);
  const tg = ctx.createLinearGradient(0, interior.y, 0, interior.y + interior.h * 0.1);
  tg.addColorStop(0, "rgba(4, 18, 22, 0.5)");
  tg.addColorStop(1, "rgba(4, 18, 22, 0)");
  ctx.fillStyle = tg;
  ctx.fillRect(interior.x, interior.y, interior.w, interior.h * 0.12);
  const vg = ctx.createRadialGradient(
    interior.x + interior.w / 2,
    interior.y + interior.h / 2,
    interior.w * 0.2,
    interior.x + interior.w / 2,
    interior.y + interior.h / 2,
    interior.w * 0.62,
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(3, 16, 20, 0.34)");
  ctx.fillStyle = vg;
  ctx.fillRect(interior.x, interior.y, interior.w, interior.h);

  // ── Gloss (additive) ───────────────────────────────────────────────────────
  ctx.globalCompositeOperation = "lighter";

  // Soft vertical sheen — the whole pane catches ambient light, brightest at top.
  // Kept subtle so the glass reads clear/glossy rather than milky/foggy.
  const sheen = ctx.createLinearGradient(0, interior.y, 0, interior.y + interior.h);
  sheen.addColorStop(0, "rgba(156, 204, 210, 0.06)");
  sheen.addColorStop(0.4, "rgba(156, 204, 210, 0.015)");
  sheen.addColorStop(1, "rgba(156, 204, 210, 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(interior.x, interior.y, interior.w, interior.h);

  // Sharp diagonal pane reflections that drift slowly — the key "polished glass" cue.
  const drift = Math.sin(time * 0.05) * interior.w * 0.025;
  const pane = (cx: number, width: number, coreA: number) => {
    ctx.save();
    ctx.translate(cx + drift, interior.y);
    ctx.transform(1, 0, -0.5, 1, 0, 0); // slant
    const g = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
    g.addColorStop(0, "rgba(210, 238, 240, 0)");
    g.addColorStop(0.42, `rgba(226, 248, 250, ${coreA * 0.5})`);
    g.addColorStop(0.5, `rgba(238, 253, 255, ${coreA})`); // crisp hot core
    g.addColorStop(0.58, `rgba(226, 248, 250, ${coreA * 0.5})`);
    g.addColorStop(1, "rgba(210, 238, 240, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(-width / 2, -interior.h * 0.2, width, interior.h * 1.4);
    ctx.restore();
  };
  pane(interior.x + interior.w * 0.3, interior.w * 0.16, 0.16); // broad reflection
  pane(interior.x + interior.w * 0.345, interior.w * 0.025, 0.26); // thin hot streak beside it
  pane(interior.x + interior.w * 0.72, interior.w * 0.05, 0.1); // secondary

  // Top inner highlight band, just under the rim.
  const topHi = ctx.createLinearGradient(0, interior.y, 0, interior.y + interior.h * 0.06);
  topHi.addColorStop(0, "rgba(212, 244, 246, 0.22)");
  topHi.addColorStop(1, "rgba(212, 244, 246, 0)");
  ctx.fillStyle = topHi;
  ctx.fillRect(interior.x, interior.y, interior.w, interior.h * 0.06);

  ctx.restore(); // end clip + additive

  // ── Bright glass edges on the frame ─────────────────────────────────────────
  const lw = Math.max(2, tank.w * 0.006);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(174, 230, 230, 0.5)";
  ctx.lineWidth = lw;
  strokeRect(ctx, interior.x - lw * 0.5, interior.y - lw * 0.5, interior.w + lw, interior.h + lw);
  const edge = (ex: number) => {
    const g = ctx.createLinearGradient(ex - lw, 0, ex + lw, 0);
    g.addColorStop(0, "rgba(200, 240, 238, 0)");
    g.addColorStop(0.5, "rgba(224, 252, 250, 0.72)");
    g.addColorStop(1, "rgba(200, 240, 238, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(ex - lw, interior.y, lw * 2, interior.h);
  };
  edge(interior.x);
  edge(interior.x + interior.w);

  // Bright corner glints where the glass catches a hard highlight.
  ctx.globalCompositeOperation = "lighter";
  const glint = (gx: number, gy: number) => {
    const r = lw * 3.4;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, "rgba(242, 254, 255, 0.85)");
    g.addColorStop(1, "rgba(242, 254, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
  };
  glint(interior.x, interior.y);
  glint(interior.x + interior.w, interior.y);
  ctx.restore();

  paintRims(ctx, layout, lw);
}

function paintRims(ctx: CanvasRenderingContext2D, layout: SceneLayout, lw: number): void {
  const { tank, interior } = layout;
  // Top rim (dark bar with a highlight) — the black aquarium trim.
  const rimH = tank.h * 0.055;
  const rimY = tank.y + tank.h * 0.045;
  const rg = ctx.createLinearGradient(0, rimY, 0, rimY + rimH);
  rg.addColorStop(0, "rgba(18, 26, 28, 0.96)");
  rg.addColorStop(0.5, "rgba(30, 42, 44, 0.96)");
  rg.addColorStop(1, "rgba(10, 16, 18, 0.96)");
  ctx.fillStyle = rg;
  roundRectPath(ctx, interior.x - lw, rimY, interior.w + lw * 2, rimH, rimH * 0.28);
  ctx.fill();
  // Glossy wet specular highlight running along the top bevel of the rim.
  const rimHi = ctx.createLinearGradient(0, rimY, 0, rimY + rimH * 0.5);
  rimHi.addColorStop(0, "rgba(186, 234, 236, 0.7)");
  rimHi.addColorStop(0.5, "rgba(150, 200, 202, 0.2)");
  rimHi.addColorStop(1, "rgba(150, 200, 202, 0)");
  ctx.fillStyle = rimHi;
  ctx.fillRect(interior.x - lw, rimY, interior.w + lw * 2, Math.max(2, rimH * 0.32));
  // A thin hot specular line right at the very top edge.
  ctx.fillStyle = "rgba(232, 252, 252, 0.65)";
  ctx.fillRect(interior.x - lw + interior.w * 0.04, rimY + 1, interior.w * 0.92, Math.max(1, rimH * 0.06));

  // Bottom rim / base trim.
  const bRimH = tank.h * 0.04;
  const bRimY = tank.y + tank.h - bRimH * 0.5;
  const bg = ctx.createLinearGradient(0, bRimY, 0, bRimY + bRimH);
  bg.addColorStop(0, "rgba(14, 20, 22, 0.92)");
  bg.addColorStop(1, "rgba(8, 12, 14, 0.95)");
  ctx.fillStyle = bg;
  roundRectPath(ctx, interior.x - lw, bRimY, interior.w + lw * 2, bRimH, bRimH * 0.3);
  ctx.fill();
}

/** Optional: overlay the glass PNG with a screen blend for extra realism. */
export function drawGlassOverlay(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  tank: Rect,
  alpha: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, tank.x, tank.y, tank.w, tank.h);
  ctx.restore();
}

// ── Whole-frame colour grade ──────────────────────────────────────────────────

export function paintColorGrade(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layout: SceneLayout,
): void {
  // Cool glow around the tank to make it the luminous star of the room.
  const cx = layout.tank.x + layout.tank.w / 2;
  const cy = layout.tank.y + layout.tank.h / 2;
  const r = Math.max(layout.tank.w, layout.tank.h) * 0.95;
  const glow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
  glow.addColorStop(0, "rgba(70, 150, 156, 0.12)");
  glow.addColorStop(1, "rgba(70, 150, 156, 0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // Gentle full-frame vignette to seat everything in the dim room.
  const vg = ctx.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.36, w / 2, h * 0.5, Math.max(w, h) * 0.78);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(2, 8, 12, 0.4)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

// ── small path helpers ────────────────────────────────────────────────────────

function strokeRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.strokeRect(x, y, w, h);
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function mix(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

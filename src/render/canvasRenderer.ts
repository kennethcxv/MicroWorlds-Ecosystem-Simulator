/**
 * Top-level canvas renderer. Owns the <canvas>, DPR scaling, the pre-composed
 * cozy room backdrop, the wooden stand, and the per-frame composition:
 *
 *   room backdrop → tank back-shadow → stand → underwater scene →
 *   procedural glass front → glass sheen overlay → name plate → colour grade
 */
import { type GameState, getActiveTank } from "../core/state";
import { daylight } from "../core/sim";
import { computeLayout, type SceneLayout } from "./layers";
import { TankScene } from "./tankScene";
import { assets } from "./assetLoader";
import { ASSETS } from "../data/assets";
import {
  paintGlassFront,
  paintColorGrade,
  drawContactShadow,
} from "./effects";

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private scene = new TankScene();
  private layout: SceneLayout;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;

  private roomCanvas: HTMLCanvasElement;
  private roomDirty = true;
  private elapsed = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.roomCanvas = document.createElement("canvas");
    this.layout = computeLayout(1, 1);
    this.resize();
  }

  getLayout(): SceneLayout {
    return this.layout;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(640, Math.round(rect.width || window.innerWidth));
    const cssH = Math.max(420, Math.round(rect.height || window.innerHeight));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = cssW;
    this.cssH = cssH;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.layout = computeLayout(cssW, cssH);
    this.scene.setLayout(this.layout);
    this.roomDirty = true;
  }

  /** Pre-render the room backdrop once per resize: cover-fit + push it back. */
  private composeRoom(): void {
    const { cssW, cssH, dpr } = this;
    this.roomCanvas.width = Math.round(cssW * dpr);
    this.roomCanvas.height = Math.round(cssH * dpr);
    const rc = this.roomCanvas.getContext("2d")!;
    rc.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Base fill in case the image is still loading.
    const bg = rc.createLinearGradient(0, 0, 0, cssH);
    bg.addColorStop(0, "#0d2b30");
    bg.addColorStop(1, "#071a1f");
    rc.fillStyle = bg;
    rc.fillRect(0, 0, cssW, cssH);

    const img = assets.get(ASSETS.room.ecocenter);
    if (img && img.naturalWidth) {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const scale = Math.max(cssW / iw, cssH / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (cssW - dw) / 2;
      const dy = (cssH - dh) / 2;
      // Gentle blur so the room reads as soft background, but keep its warmth
      // and detail (lamps, shelves) so it feels cozy rather than crushed black.
      rc.save();
      rc.filter = "blur(1.6px) saturate(1.02) brightness(0.95)";
      rc.drawImage(img, dx, dy, dw, dh);
      rc.restore();

      // Light cool teal wash to marry the warm room to the teal UI.
      rc.fillStyle = "rgba(10, 40, 46, 0.16)";
      rc.fillRect(0, 0, cssW, cssH);
      // Soft vignette to frame the scene and keep the tank the focal point.
      const v = rc.createRadialGradient(
        cssW / 2,
        cssH * 0.42,
        Math.min(cssW, cssH) * 0.34,
        cssW / 2,
        cssH * 0.5,
        Math.max(cssW, cssH) * 0.72,
      );
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(3, 12, 15, 0.46)");
      rc.fillStyle = v;
      rc.fillRect(0, 0, cssW, cssH);
    }
    this.roomDirty = false;
  }

  render(state: GameState, dt: number): void {
    const ctx = this.ctx;
    const tank = getActiveTank(state);
    const light = daylight(state.clock.minutes);
    this.elapsed += dt;

    if (this.roomDirty) this.composeRoom();

    // 1) Room backdrop.
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(this.roomCanvas, 0, 0, this.cssW, this.cssH);

    // 2) Soft shadow the tank+stand cast onto the room behind/below.
    this.drawCastShadow(ctx);

    // 3) Wooden stand.
    this.drawStand(ctx);

    // 4) Underwater scene (god-ray intensity tracks daylight).
    this.scene.update(dt, tank);
    this.scene.draw(ctx, tank, light);

    // 5) Procedural glass front (edges, rim, reflections, inner shadow, gloss).
    //    NB: we deliberately do NOT screen-blend the tank_glass.png photo on top.
    //    That photo is a ¾-perspective shot of a real tank; over our flat,
    //    front-on procedural tank it stamped a second, mismatched glass outline
    //    inside the water. The procedural pass carries the glossiness instead.
    paintGlassFront(ctx, this.layout, this.elapsed);

    // 6) Whole-frame colour grade + vignette. (The tank name lives in the left
    //    panel; no canvas name plate floating over the scene.)
    paintColorGrade(ctx, this.cssW, this.cssH, this.layout);
  }

  private drawCastShadow(ctx: CanvasRenderingContext2D): void {
    const { tank } = this.layout;
    ctx.save();
    const g = ctx.createRadialGradient(
      tank.x + tank.w / 2,
      tank.y + tank.h,
      tank.w * 0.1,
      tank.x + tank.w / 2,
      tank.y + tank.h,
      tank.w * 0.75,
    );
    g.addColorStop(0, "rgba(0, 0, 0, 0.45)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(tank.x - tank.w * 0.3, tank.y + tank.h * 0.5, tank.w * 1.6, tank.h * 0.9);
    ctx.restore();
  }

  private drawStand(ctx: CanvasRenderingContext2D): void {
    const img = assets.get(ASSETS.tank.stand);
    const s = this.layout.stand;
    if (img && img.naturalWidth) {
      ctx.drawImage(img, s.x, s.y, s.w, s.h);
    } else {
      // Fallback wooden block.
      ctx.fillStyle = "#3a2519";
      ctx.fillRect(s.x + s.w * 0.05, s.y + s.h * 0.2, s.w * 0.9, s.h * 0.6);
    }
    // Contact shadow where the tank sits on the stand top.
    const { tank } = this.layout;
    drawContactShadow(ctx, tank.x + tank.w / 2, tank.y + tank.h + tank.h * 0.012, tank.w * 0.98, 0.4, 0.12);
  }

}

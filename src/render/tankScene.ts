/**
 * The living tank scene. Owns the cosmetic motion (fish schooling, shrimp/snail
 * crawling, plant sway, bubbles, drifting motes) and composes the underwater
 * picture by depth-sorting every plant, rock, log and creature into one list so
 * occlusion reads correctly in 2.5D. Reads game state; never mutates it.
 */
import type { Tank } from "../core/state";
import {
  type SceneLayout,
  groundY,
  perspX,
  depthScale,
  hazeAlpha,
  waterY,
} from "./layers";
import {
  drawSprite,
  drawContactShadow,
  paintWater,
  paintGodRays,
  paintCaustics,
  paintSurface,
} from "./effects";
import { SPECIES, CREATURE_TRIM, type Species, type Behavior } from "../data/species";
import { PLANTS } from "../data/plants";
import { HARDSCAPE } from "../data/hardscape";
import { ASSETS, SCENE_TRIM } from "../data/assets";
import { assets } from "./assetLoader";
import { clamp, clamp01 } from "../utils/math";

const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Agent {
  species: Species;
  behavior: Behavior;
  x: number; // interior-normalized 0..1
  y: number; // interior-normalized 0..1 (midwater) or hover offset (bottom)
  z: number; // depth 0..1
  vx: number;
  vy: number;
  dir: number; // +1 right, -1 left (intended heading)
  face: number; // signed horizontal scale, eases toward heading (turn animation)
  pitch: number; // eased nose tilt toward travel direction (up/down)
  phase: number;
  wig: number; // wiggle speed
  offX: number; // school offset
  offY: number;
  offZ: number; // school depth offset (front-back spread within the shoal)
  tz: number; // wandering target depth (non-school swimmers)
  pause: number; // dart pause timer
  bobAmp: number;
  bobSpeed: number;
  seed: number;
}

interface SchoolCenter {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  retarget: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  r: number;
  vx: number;
  vy: number;
  ph: number;
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  ph: number;
}

const CAP: Record<Behavior, number> = {
  school: 14,
  centerpiece: 3,
  mid: 12,
  bottom: 8,
  grazer: 20,
};

export class TankScene {
  private layout: SceneLayout | null = null;
  private agents: Agent[] = [];
  private schools = new Map<string, SchoolCenter>();
  private back: Particle[] = [];
  private front: Particle[] = [];
  private bubbles: Bubble[] = [];
  private bubbleTimer = 0;
  private signature = "";
  time = 0;

  setLayout(layout: SceneLayout): void {
    const first = !this.layout;
    this.layout = layout;
    if (first) this.seedParticles();
  }

  /** (Re)build creature agents when the population changes. */
  syncFromState(tank: Tank): void {
    const sig = tank.populations.map((p) => `${p.speciesId}:${p.count}`).join("|");
    if (sig === this.signature && this.agents.length) return;
    this.signature = sig;
    this.agents = [];
    this.schools.clear();

    for (const pop of tank.populations) {
      const species = SPECIES[pop.speciesId];
      if (!species) continue;
      const n = Math.min(pop.count, CAP[species.behavior]);

      if (species.behavior === "school" || species.behavior === "mid") {
        this.schools.set(species.id, this.newSchool(species));
      }
      for (let i = 0; i < n; i++) this.agents.push(this.newAgent(species));
    }
  }

  private newSchool(species: Species): SchoolCenter {
    // Wide depth range so the whole shoal drifts noticeably front-to-back.
    const z = rand(0.24, 0.74);
    const y = rand(species.zone[0], species.zone[1]);
    return { x: rand(0.3, 0.7), y, z, tx: rand(0.2, 0.8), ty: y, tz: z, retarget: rand(3, 7) };
  }

  private newAgent(species: Species): Agent {
    const zoneT = rand(species.zone[0], species.zone[1]);
    let z: number;
    switch (species.behavior) {
      case "centerpiece":
        z = rand(0.5, 0.82);
        break;
      case "bottom":
        z = rand(0.45, 0.95);
        break;
      case "grazer":
        z = rand(0.55, 0.98);
        break;
      default:
        z = rand(0.25, 0.7);
    }
    const dir0 = Math.random() < 0.5 ? 1 : -1;
    return {
      species,
      behavior: species.behavior,
      x: rand(0.1, 0.9),
      y: zoneT,
      z,
      vx: rand(-1, 1) * species.speed,
      vy: 0,
      dir: dir0,
      face: dir0 > 0 ? -1 : 1, // sprites face left; -1 mirrors to face right
      pitch: 0,
      phase: rand(0, Math.PI * 2),
      wig: rand(7, 11) * (species.type === "fish" ? 1 : 0.2),
      offX: rand(-0.12, 0.12),
      offY: rand(-0.06, 0.06),
      offZ: species.type === "fish" ? rand(-0.14, 0.14) : rand(-0.05, 0.05),
      tz: z,
      pause: rand(0, 2),
      bobAmp: species.type === "fish" ? rand(0.004, 0.012) : 0.002,
      bobSpeed: rand(0.6, 1.4),
      seed: rand(0, 100),
    };
  }

  private seedParticles(): void {
    this.back = [];
    this.front = [];
    for (let i = 0; i < 28; i++) {
      this.back.push({
        x: Math.random(),
        y: Math.random(),
        z: rand(0.05, 0.4),
        r: rand(0.6, 1.6),
        vx: rand(-0.004, 0.004),
        vy: rand(-0.006, 0.004),
        ph: rand(0, 6.28),
      });
    }
    for (let i = 0; i < 14; i++) {
      this.front.push({
        x: Math.random(),
        y: Math.random(),
        z: rand(0.7, 1),
        r: rand(1.2, 2.8),
        vx: rand(-0.006, 0.006),
        vy: rand(-0.01, 0.004),
        ph: rand(0, 6.28),
      });
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────
  update(dt: number, tank: Tank): void {
    this.time += dt;
    this.syncFromState(tank);

    // School centres wander slowly.
    for (const s of this.schools.values()) {
      s.retarget -= dt;
      if (s.retarget <= 0) {
        s.tx = rand(0.18, 0.82);
        s.ty = clamp(s.ty + rand(-0.12, 0.12), 0.22, 0.7);
        s.tz = rand(0.22, 0.76); // roam the full depth of the tank, front to back
        s.retarget = rand(3.5, 8);
      }
      s.x += (s.tx - s.x) * Math.min(1, dt * 0.5);
      s.y += (s.ty - s.y) * Math.min(1, dt * 0.5);
      s.z += (s.tz - s.z) * Math.min(1, dt * 0.4);
    }

    const foodExcite = clamp01(tank.food / 30); // fish liven up around food
    for (const a of this.agents) this.updateAgent(a, dt, foodExcite);

    this.updateParticles(this.back, dt);
    this.updateParticles(this.front, dt);
    this.updateBubbles(dt);
  }

  private updateAgent(a: Agent, dt: number, excite: number): void {
    const isFish = a.species.type === "fish";
    // Tail-beat frequency rises with effort (speed) and excitement.
    const sf = clamp(Math.hypot(a.vx, a.vy) / (a.species.speed + 1e-4), 0, 2.2);
    a.phase += dt * a.wig * (0.55 + sf * 0.7 + excite * 0.5);
    const sp = a.species.speed * (1 + excite * 0.6);

    if (a.behavior === "school" || a.behavior === "mid") {
      const s = this.schools.get(a.species.id);
      const tx = s ? s.x + a.offX : a.x;
      // When fed, the shoal surges up toward the food at the surface.
      const ty = clamp((s ? s.y + a.offY : a.y) - excite * 0.22, a.species.zone[0] - 0.05, a.species.zone[1]);
      // Each fish holds its own depth within the shoal's slab → real front-back spread.
      const tz = clamp((s ? s.z : a.z) + a.offZ, 0.08, 0.95);
      a.vx += (tx - a.x) * dt * 1.5 + rand(-0.02, 0.02) * dt;
      a.vy += (ty - a.y) * dt * 1.6;
      a.z += (tz - a.z) * dt * 0.9;
      this.limitSpeed(a, sp);
    } else if (a.behavior === "centerpiece") {
      a.pause -= dt;
      if (a.pause <= 0) {
        a.vx = rand(-1, 1) * sp;
        a.vy = rand(-0.3, 0.3) * sp;
        a.tz = rand(0.46, 0.86); // pick a new depth lane to cruise toward
        a.pause = rand(2.5, 5.5);
      }
      // Drift up toward food when fed.
      if (excite > 0.3) a.vy -= excite * dt * 0.35;
      a.vx *= 1 - dt * 0.4;
      a.vy *= 1 - dt * 0.6;
      a.z += (a.tz - a.z) * dt * 0.5; // glide forward/back between lanes
      a.y = clamp(a.y, a.species.zone[0] - excite * 0.12, a.species.zone[1]);
    } else {
      // bottom (cory) + grazer (shrimp / snail): hug the substrate, amble in depth.
      a.pause -= dt;
      if (a.pause <= 0) {
        a.vx = (Math.random() < 0.5 ? -1 : 1) * sp * (a.behavior === "bottom" ? rand(0.6, 1.4) : rand(0.4, 1));
        a.tz = rand(0.5, 0.97);
        a.pause = a.behavior === "bottom" ? rand(0.6, 2.2) : rand(2, 6);
      }
      if (a.behavior !== "bottom") a.vx *= 1 - dt * 0.2;
      a.z += (a.tz - a.z) * dt * (a.behavior === "bottom" ? 0.5 : 0.3);
      a.vy = 0;
    }

    a.x += a.vx * dt;
    a.y += a.vy * dt;

    // Keep inside the interior; steer/bounce off edges.
    if (a.x < 0.04) {
      a.x = 0.04;
      a.vx = Math.abs(a.vx);
    } else if (a.x > 0.96) {
      a.x = 0.96;
      a.vx = -Math.abs(a.vx);
    }
    const [zt, zb] = a.species.zone;
    if (a.behavior === "school" || a.behavior === "mid" || a.behavior === "centerpiece") {
      if (a.y < zt) {
        a.y = zt;
        a.vy = Math.abs(a.vy);
      } else if (a.y > zb) {
        a.y = zb;
        a.vy = -Math.abs(a.vy);
      }
    }
    a.z = clamp(a.z, 0.04, 0.99);
    if (Math.abs(a.vx) > 0.002) a.dir = a.vx > 0 ? 1 : -1;

    // Ease `face` toward the heading so the fish visibly turns (narrowing to an
    // edge-on profile as it passes through zero) instead of instantly mirroring.
    const faceTarget = a.dir > 0 ? -1 : 1;
    a.face += (faceTarget - a.face) * Math.min(1, dt * 9);

    // Ease nose pitch toward the actual travel direction (up when rising, down
    // when diving) so the fish points where it swims.
    const pitchTarget = isFish ? clamp(Math.atan2(a.vy, Math.abs(a.vx) + 0.04) * 0.6, -0.5, 0.5) : 0;
    a.pitch += (pitchTarget - a.pitch) * Math.min(1, dt * 6);
  }

  private limitSpeed(a: Agent, sp: number): void {
    const m = Math.hypot(a.vx, a.vy);
    const max = sp * 1.4;
    if (m > max) {
      a.vx = (a.vx / m) * max;
      a.vy = (a.vy / m) * max;
    }
  }

  private updateParticles(list: Particle[], dt: number): void {
    for (const p of list) {
      p.ph += dt;
      p.x += (p.vx + Math.sin(p.ph * 0.6) * 0.004) * dt;
      p.y += p.vy * dt;
      if (p.x < 0) p.x += 1;
      if (p.x > 1) p.x -= 1;
      if (p.y < 0) p.y += 1;
      if (p.y > 1) p.y -= 1;
    }
  }

  private updateBubbles(dt: number): void {
    this.bubbleTimer -= dt;
    if (this.bubbleTimer <= 0 && this.bubbles.length < 16) {
      this.bubbleTimer = rand(0.18, 0.5);
      this.bubbles.push({
        x: rand(0.9, 0.95),
        y: rand(0.7, 0.95),
        r: rand(1.2, 3),
        vy: rand(0.12, 0.22),
        ph: rand(0, 6.28),
      });
    }
    for (const b of this.bubbles) {
      b.ph += dt * 4;
      b.y -= b.vy * dt;
      b.x += Math.sin(b.ph) * 0.0016;
    }
    this.bubbles = this.bubbles.filter((b) => b.y > 0.02);
  }

  // ── Draw ────────────────────────────────────────────────────────────────────
  draw(ctx: CanvasRenderingContext2D, tank: Tank, light: number): void {
    const layout = this.layout;
    if (!layout) return;
    const { interior } = layout;

    paintWater(ctx, interior, light);

    ctx.save();
    ctx.beginPath();
    ctx.rect(interior.x, interior.y, interior.w, interior.h);
    ctx.clip();

    this.drawSubstrate(ctx, layout);
    paintCaustics(ctx, layout, this.time);
    this.drawParticles(ctx, this.back, 0.5);

    // Build one depth-sorted draw list of everything inside the tank.
    type Item = { z: number; baseY: number; draw: () => void };
    const items: Item[] = [];

    for (const h of tank.scape.hardscape) items.push(this.hardscapeItem(ctx, h, layout));
    for (const p of tank.scape.plants) items.push(this.plantItem(ctx, p, layout));
    for (const a of this.agents) items.push(this.agentItem(ctx, a, layout));

    items.sort((m, n) => (m.z === n.z ? m.baseY - n.baseY : m.z - n.z));
    for (const it of items) it.draw();

    paintGodRays(ctx, layout, this.time, 0.72 + light * 0.6);
    this.drawParticles(ctx, this.front, 0.85);
    this.drawBubbles(ctx, layout);

    ctx.restore();

    paintSurface(ctx, layout, this.time);
  }

  /** Gravel/sand bed across the whole tank floor, sloping up toward the back. */
  private drawSubstrate(ctx: CanvasRenderingContext2D, layout: SceneLayout): void {
    const { interior, groundBack } = layout;
    const top = groundBack - interior.h * 0.06;
    const bottom = interior.y + interior.h + 2;
    const dx = interior.x - interior.w * 0.03;
    const dw = interior.w * 1.06;
    const dh = bottom - top;

    const img = assets.get(ASSETS.tank.substrate);
    if (img && img.naturalWidth) {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const t = SCENE_TRIM.substrate;
      ctx.drawImage(img, t.x * iw, t.y * ih, t.w * iw, t.h * ih, dx, top, dw, dh);
    } else {
      ctx.fillStyle = "#3a4034";
      ctx.fillRect(dx, top, dw, dh);
    }

    // Underwater grade: subtle teal cast, darker toward the front-bottom.
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, "rgba(22, 74, 78, 0.22)");
    g.addColorStop(0.55, "rgba(14, 50, 54, 0.32)");
    g.addColorStop(1, "rgba(6, 24, 28, 0.6)");
    ctx.fillStyle = g;
    ctx.fillRect(dx, top, dw, dh);

    // Soft ambient occlusion where the bed meets the back wall.
    const occ = ctx.createLinearGradient(0, top - interior.h * 0.02, 0, top + interior.h * 0.07);
    occ.addColorStop(0, "rgba(4, 16, 20, 0.5)");
    occ.addColorStop(1, "rgba(4, 16, 20, 0)");
    ctx.fillStyle = occ;
    ctx.fillRect(dx, top - interior.h * 0.02, dw, interior.h * 0.09);
  }

  private hardscapeItem(
    ctx: CanvasRenderingContext2D,
    item: Tank["scape"]["hardscape"][number],
    layout: SceneLayout,
  ): { z: number; baseY: number; draw: () => void } {
    const hs = HARDSCAPE[item.ref];
    const img = hs && assets.get(ASSETS.hardscape[hs.asset as keyof typeof ASSETS.hardscape]);
    const z = item.z;
    const ds = 0.86 + z * 0.3;
    const anchorX = perspX(layout, item.x, z);
    const gY = groundY(layout, z);
    const contentW = hs ? hs.widthFrac * layout.interior.w * ds * item.scale : 0;
    const buryOff = hs ? contentW * hs.bury : 0;
    const baseY = gY + buryOff;
    return {
      z,
      baseY,
      draw: () => {
        if (!img || !hs) return;
        drawContactShadow(ctx, anchorX, gY + buryOff * 0.4, contentW * 0.9, 0.3);
        drawSprite(
          ctx,
          img,
          hs.trim,
          { anchorX, anchorY: baseY, contentW, flip: item.flip, rot: item.rot },
          { tint: (hs.tint ?? 0.5) * 0.7, haze: hazeAlpha(z) * 0.8, light: 0.08 + z * 0.16 },
        );
      },
    };
  }

  private plantItem(
    ctx: CanvasRenderingContext2D,
    item: Tank["scape"]["plants"][number],
    layout: SceneLayout,
  ): { z: number; baseY: number; draw: () => void } {
    const pl = PLANTS[item.ref];
    const img = pl && assets.get(ASSETS.plants[pl.asset as keyof typeof ASSETS.plants]);
    const z = item.z;
    const ds = 0.86 + z * 0.3;
    const anchorX = perspX(layout, item.x, z);
    const gY = groundY(layout, z);
    const contentH = pl ? pl.heightFrac * layout.interior.h * ds * item.scale : 0;
    const lift = (item.lift ?? 0) * layout.interior.h;
    const sink = pl?.sinkBase ? contentH * pl.sinkBase : 0;
    const baseY = gY - lift + sink;
    const sway = pl ? Math.sin(this.time * pl.swaySpeed + item.x * 7 + z * 3) * pl.sway * 4 : 0;
    return {
      z,
      baseY,
      draw: () => {
        if (!img || !pl) return;
        if (lift < 2) drawContactShadow(ctx, anchorX, gY, contentH * 0.5, 0.22);
        drawSprite(
          ctx,
          img,
          pl.trim,
          {
            anchorX,
            anchorY: baseY,
            contentH,
            flip: item.flip,
            rot: (item.rot ?? 0) + sway,
          },
          { tint: (pl.tint ?? 0.6) * 0.62, haze: hazeAlpha(z), light: 0.12 + z * 0.2 },
        );
      },
    };
  }

  private agentItem(
    ctx: CanvasRenderingContext2D,
    a: Agent,
    layout: SceneLayout,
  ): { z: number; baseY: number; draw: () => void } {
    const ds = depthScale(a.z);
    const contentW = a.species.sizeFrac * layout.interior.w * ds;
    const anchorX = perspX(layout, a.x, a.z);
    const onBottom = a.behavior === "bottom" || a.behavior === "grazer";
    const bob = Math.sin(a.phase * a.bobSpeed) * a.bobAmp * layout.interior.h;
    const baseY = onBottom
      ? groundY(layout, a.z) - contentW * 0.12 + bob * 0.3
      : waterY(layout, a.y) + bob;
    const trim = CREATURE_TRIM[a.species.asset];
    const img = assets.get(ASSETS.creatures[a.species.asset as keyof typeof ASSETS.creatures]);

    // The nose points where the fish is actually travelling (pitch is smoothed in
    // updateAgent). `face` is the signed mirror; under a flip a positive rotation
    // reads reversed, so compensate with faceSign to keep "nose up when rising".
    const faceSign = a.face < 0 ? -1 : 1;
    const rot = faceSign * a.pitch;

    // Body undulation: a head→tail wave whose amplitude grows with swim effort,
    // so the body flexes and the tail sweeps. Fish flex fully; shrimp flick a
    // little; snails not at all.
    const speedFrac = clamp(Math.hypot(a.vx, a.vy) / (a.species.speed + 1e-4), 0, 2);
    // Only fish get the swim-flex warp (shrimp/snails crawl; the warp isn't worth
    // its per-strip cost on the many tiny inverts).
    const bend =
      a.species.type === "fish"
        ? { amp: contentW * (0.06 + 0.12 * speedFrac), phase: a.phase, waves: 3.0 }
        : undefined;

    return {
      z: a.z,
      baseY,
      draw: () => {
        if (!img || !trim) return;
        if (onBottom) {
          drawContactShadow(ctx, anchorX, groundY(layout, a.z) + 1, contentW * 0.7, 0.3);
        } else if (a.y > 0.7) {
          drawContactShadow(ctx, anchorX, groundY(layout, a.z) + 1, contentW * 0.6, (0.12 * (a.y - 0.7)) / 0.3);
        }
        drawSprite(
          ctx,
          img,
          trim,
          { anchorX, anchorY: baseY, contentW, anchorYFrac: 0.5, scaleX: a.face, rot, bend },
          {
            tint: (a.species.tint ?? 0.5) * 0.5,
            haze: hazeAlpha(a.z) * 0.75,
            light: 0.16 + a.z * 0.16,
          },
        );
      },
    };
  }

  private drawParticles(ctx: CanvasRenderingContext2D, list: Particle[], baseAlpha: number): void {
    const { interior } = this.layout!;
    ctx.save();
    for (const p of list) {
      const x = interior.x + p.x * interior.w;
      const y = interior.y + p.y * interior.h;
      const a = baseAlpha * (0.12 + p.z * 0.22) * (0.7 + 0.3 * Math.sin(p.ph));
      ctx.fillStyle = `rgba(200, 232, 224, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBubbles(ctx: CanvasRenderingContext2D, layout: SceneLayout): void {
    const { interior } = layout;
    ctx.save();
    for (const b of this.bubbles) {
      const x = interior.x + b.x * interior.w;
      const y = interior.y + b.y * interior.h;
      ctx.beginPath();
      ctx.arc(x, y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(206, 240, 236, 0.16)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - b.r * 0.3, y - b.r * 0.3, b.r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(230, 250, 246, 0.5)";
      ctx.fill();
    }
    ctx.restore();
  }
}

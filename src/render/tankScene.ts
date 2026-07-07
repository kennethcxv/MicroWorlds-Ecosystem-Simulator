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
  type SpritePlacement,
} from "./effects";
import { SPECIES, CREATURE_TRIM, type Species, type Behavior } from "../data/species";
import { swimProfile, type SwimProfile } from "../data/swim";
import { PLANTS } from "../data/plants";
import { HARDSCAPE } from "../data/hardscape";
import { ASSETS, SCENE_TRIM } from "../data/assets";
import { assets } from "./assetLoader";
import { clamp, clamp01 } from "../utils/math";

const rand = (a: number, b: number) => a + Math.random() * (b - a);

type SwimState = "hover" | "cruise" | "dart";

interface Agent {
  species: Species;
  behavior: Behavior;
  prof: SwimProfile;
  x: number; // interior-normalized 0..1
  y: number; // interior-normalized 0..1
  z: number; // depth 0..1 (0 back wall, 1 front glass)
  vx: number;
  vy: number;
  /** Eased signed horizontal scale (sprites face left; -1 mirrors to face right). */
  face: number;
  /** Target facing sign with hysteresis so it doesn't flip-flop at vx≈0. */
  faceDir: number;
  /** Eased nose pitch toward travel direction. */
  pitch: number;
  /** Smoothed body-curve signal for turns/banking. */
  bend: number;
  /** Travelling tail-wave phase. */
  tailPhase: number;
  state: SwimState;
  stateT: number; // seconds left in the current state
  speedWob: number; // phase for gentle cruise-speed variation
  // Personal offsets / targets.
  offX: number;
  offY: number;
  offZ: number;
  wpX: number; // wander waypoint (non-school)
  wpY: number;
  wpT: number; // seconds left before re-picking a waypoint
  zTarget: number;
  zWander: number;
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
    const prof = swimProfile(species);
    const z = rand(prof.depth[0], prof.depth[1]);
    const zoneT = rand(species.zone[0], species.zone[1]);
    const dir0 = Math.random() < 0.5 ? -1 : 1; // -1 face right, +1 face left
    return {
      species,
      behavior: species.behavior,
      prof,
      x: rand(0.12, 0.88),
      y: zoneT,
      z,
      vx: -dir0 * species.speed * 0.5, // dir0 +1(left) → vx negative(left)
      vy: 0,
      face: dir0,
      faceDir: dir0,
      pitch: 0,
      bend: 0,
      tailPhase: rand(0, Math.PI * 2),
      state: "cruise",
      stateT: rand(1, 4),
      speedWob: rand(0, Math.PI * 2),
      offX: rand(-0.12, 0.12),
      offY: rand(-0.07, 0.07),
      offZ: species.type === "fish" ? rand(-0.16, 0.16) : rand(-0.05, 0.05),
      wpX: rand(0.2, 0.8),
      wpY: zoneT,
      wpT: rand(2, 5),
      zTarget: z,
      zWander: rand(3, 8),
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
    if (a.behavior === "grazer") this.updateGrazer(a, dt);
    else this.updateFish(a, dt, excite);
  }

  /** Real fish swimming: idle/cruise/dart state machine + smooth steering. */
  private updateFish(a: Agent, dt: number, excite: number): void {
    const p = a.prof;
    const [zoneTop, zoneBot] = a.species.zone;
    const school =
      a.behavior === "school" || a.behavior === "mid" ? this.schools.get(a.species.id) : undefined;

    // ── State machine: cruise ↔ hover, occasional dart ──────────────────────
    a.stateT -= dt;
    if (a.stateT <= 0) {
      const r = Math.random();
      if (r < p.dartChance * 6) {
        a.state = "dart";
        a.stateT = rand(0.4, 0.9);
      } else if (r < p.dartChance * 6 + p.hover) {
        a.state = "hover";
        a.stateT = rand(1.4, 3.4);
      } else {
        a.state = "cruise";
        a.stateT = rand(2.5, 6);
      }
    }
    // Feeding triggers staggered darts (not every fish at once).
    if (excite > 0.35 && a.state !== "dart" && Math.random() < excite * dt * 1.4) {
      a.state = "dart";
      a.stateT = rand(0.4, 0.8);
    }

    // ── Where does it want to be? ───────────────────────────────────────────
    let tx: number;
    let ty: number;
    if (school) {
      tx = school.x + a.offX;
      ty = clamp(school.y + a.offY - excite * 0.22, zoneTop - 0.05, zoneBot);
    } else {
      a.wpT -= dt;
      const near = Math.hypot(a.wpX - a.x, a.wpY - a.y) < 0.08;
      if (a.wpT <= 0 || near) {
        a.wpX = rand(0.15, 0.85);
        a.wpY = clamp(rand(zoneTop, zoneBot) - excite * 0.2, zoneTop, zoneBot);
        a.wpT = rand(2.5, 6);
      }
      tx = a.wpX;
      ty = a.wpY;
    }

    // ── Desired velocity toward the target, scaled by state ─────────────────
    a.speedWob += dt * 1.3;
    const cruise = p.cruise * (0.85 + 0.15 * Math.sin(a.speedWob));
    const stateMul = a.state === "dart" ? 2.6 : a.state === "hover" ? 0.16 : 1;
    const dx = tx - a.x;
    const dy = ty - a.y;
    const dist = Math.hypot(dx, dy) || 1e-4;
    const arrive = dist < 0.12 ? dist / 0.12 : 1; // ease off near the target
    let desVx = (dx / dist) * cruise * stateMul * arrive;
    let desVy = (dy / dist) * cruise * stateMul * arrive * 0.85;

    // Edge avoidance — steer inward before hitting a wall (no hard bounce).
    const m = 0.09;
    if (a.x < m) desVx += ((m - a.x) / m) * cruise * 1.6;
    else if (a.x > 1 - m) desVx -= ((a.x - (1 - m)) / m) * cruise * 1.6;
    if (a.y < zoneTop + 0.04) desVy += cruise * 0.7;
    else if (a.y > zoneBot - 0.04) desVy -= cruise * 0.7;

    // Steer current velocity toward desired (accel-limited → smooth curved path).
    const steer = p.turn * (a.state === "dart" ? 1.7 : 1);
    a.vx += (desVx - a.vx) * Math.min(1, steer * dt);
    a.vy += (desVy - a.vy) * Math.min(1, steer * dt);
    this.limitSpeed(a, cruise * stateMul * 1.25 + 1e-3);

    a.x = clamp(a.x + a.vx * dt, 0.03, 0.97);
    a.y = clamp(a.y + a.vy * dt, zoneTop - 0.03, zoneBot + 0.03);

    // ── Depth: ease toward shoal depth or a slowly wandering personal lane ───
    a.zWander -= dt;
    if (a.zWander <= 0) {
      a.zTarget = rand(p.depth[0], p.depth[1]);
      a.zWander = rand(4, 9);
    }
    const zt = school ? clamp(school.z + a.offZ, 0.06, 0.96) : a.zTarget;
    a.z = clamp(a.z + (zt - a.z) * Math.min(1, dt * 0.5), 0.05, 0.98);

    // ── Orientation: facing (with hysteresis), pitch, body bend ─────────────
    if (Math.abs(a.vx) > cruise * 0.22) a.faceDir = a.vx > 0 ? -1 : 1; // -1 = face right
    a.face += (a.faceDir - a.face) * Math.min(1, dt * 4); // smooth turn-through

    const pitchTarget = clamp(Math.atan2(a.vy, Math.abs(a.vx) + 0.05) * 0.5, -0.4, 0.4);
    a.pitch += (pitchTarget - a.pitch) * Math.min(1, dt * 5);

    // Body curves while turning (head leads, tail trails) and banks with vy.
    const bendTarget = clamp((a.faceDir - a.face) * 0.7 + clamp(a.vy * 1.4, -0.5, 0.5), -1, 1);
    a.bend += (bendTarget - a.bend) * Math.min(1, dt * 5);

    // ── Tail beat: frequency rises with state + speed ───────────────────────
    const sf = clamp(Math.hypot(a.vx, a.vy) / (p.cruise + 1e-4), 0, 2.5);
    const freq = p.tailFreq * (a.state === "dart" ? 2.2 : a.state === "hover" ? 0.5 : 0.7 + 0.5 * sf);
    a.tailPhase += dt * freq;
  }

  /** Shrimp/snails: short scoots and pauses near the substrate; no fish flex. */
  private updateGrazer(a: Agent, dt: number): void {
    const p = a.prof;
    a.stateT -= dt;
    if (a.stateT <= 0) {
      a.vx = (Math.random() < 0.5 ? -1 : 1) * p.cruise * rand(0.4, 1);
      a.stateT = rand(1.5, 5);
    }
    a.vx *= 1 - dt * 0.6;
    a.x = clamp(a.x + a.vx * dt, 0.03, 0.97);

    a.zWander -= dt;
    if (a.zWander <= 0) {
      a.zTarget = rand(p.depth[0], p.depth[1]);
      a.zWander = rand(4, 10);
    }
    a.z = clamp(a.z + (a.zTarget - a.z) * Math.min(1, dt * 0.3), 0.05, 0.98);

    if (Math.abs(a.vx) > 0.002) a.faceDir = a.vx > 0 ? -1 : 1;
    a.face += (a.faceDir - a.face) * Math.min(1, dt * 3);
    a.tailPhase += dt * 2;
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

    paintGodRays(ctx, layout, this.time, 0.4 + light * 0.4);
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
    const baseY = onBottom ? groundY(layout, a.z) - contentW * 0.1 : waterY(layout, a.y);
    const trim = CREATURE_TRIM[a.species.asset];
    const img = assets.get(ASSETS.creatures[a.species.asset as keyof typeof ASSETS.creatures]);

    // `face` is the eased signed mirror; under a flip a positive rotation reads
    // reversed, so compensate with faceSign to keep "nose up when rising".
    const faceSign = a.face < 0 ? -1 : 1;
    const rot = faceSign * a.pitch;
    // Keep a minimum visible width so a turning fish never collapses to a sliver.
    const scaleX = faceSign * Math.max(0.3, Math.abs(a.face));

    // Fish body deformation (sliced swim flex); inverts swim flat.
    const p = a.prof;
    let deform: SpritePlacement["deform"];
    if (a.species.type === "fish") {
      const sf = clamp(Math.hypot(a.vx, a.vy) / (p.cruise + 1e-4), 0, 2.5);
      const ampFrac = p.tailAmp * (a.state === "dart" ? 1.7 : a.state === "hover" ? 0.35 : 0.7 + 0.5 * sf);
      deform = {
        headLeft: true,
        slices: 18,
        ampFrac,
        phase: a.tailPhase,
        waveSpan: p.bodyFlex,
        turnBendFrac: a.bend * 0.45,
      };
    }

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
          { anchorX, anchorY: baseY, contentW, anchorYFrac: 0.5, scaleX, rot, deform },
          {
            tint: (a.species.tint ?? 0.5) * 0.5,
            haze: hazeAlpha(a.z) * 0.7,
            light: 0.16 + a.z * 0.18,
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

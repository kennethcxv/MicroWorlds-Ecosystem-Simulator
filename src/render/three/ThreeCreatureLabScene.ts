/**
 * CREATURE LAB — a DEV-ONLY showcase habitat (`?habitat=creatures`) for the
 * self-made animal batch. Three stations:
 *
 *   • LINE-UP (front): one of every species on a pedestal with a name label,
 *     idling in place — instant QA for scale / orientation / materials / parts.
 *   • WATER VOLUME (back left): the REAL aquarium creature layer running the
 *     full default population — schools school, otos attach, snails climb the
 *     invisible glass, daphnia pulse.
 *   • SAND PAD (back right): the vivarium crew — lab crickets scurry/hop/freeze
 *     and an isopod colony shelters under two rocks.
 *
 * A self-contained DOM side panel lists every species with live counts,
 * spawn/clear controls and a registry-driven info card (category, difficulty,
 * tier, tags, needs, ecosystem role). Everything is torn down on dispose.
 * This scene is intentionally NOT in the player-facing habitat switch.
 */
import * as THREE from "three";
import type { CameraConfig, HabitatScene } from "./ThreeHabitat";
import { disposeScene } from "./ThreeHabitat";
import type { TankBounds } from "./ThreeBounds";
import { ThreeAquariumCreatures } from "./creatures/ThreeAquaticCreatures";
import type { TankSurfaceSpace } from "./creatures/ThreeSurfaceCreatures";
import { ThreeIsopods } from "./creatures/ThreeIsopods";
import { loadCreature, preloadCreatures, type CreatureModel } from "./creatures/ThreeCreatureLoader";
import { CreatureAnimator } from "./creatures/ThreeCreatureAnimator";
import {
  creatureList,
  getCreature,
  defaultAquariumPopulation,
} from "../../data/creatures/creatureRegistry";
import type { CreatureId } from "../../data/creatures/CreatureTypes";

const WATER = { cx: -0.55, cz: -0.25, w: 1.7, h: 0.8, d: 0.95, floor: 0.02 };
const PAD = { cx: 0.85, cz: -0.25, w: 1.15, d: 0.95 };
const LINEUP_Z = 0.62;

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Simple floating name label (canvas sprite). */
function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const cx = canvas.getContext("2d")!;
  cx.font = "600 44px system-ui, sans-serif";
  cx.textAlign = "center";
  cx.textBaseline = "middle";
  cx.shadowColor = "rgba(0,0,0,0.9)";
  cx.shadowBlur = 10;
  cx.fillStyle = "#d9f2ec";
  cx.fillText(text, 256, 48);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(0.34, 0.064, 1);
  return sprite;
}

/** Lab-only cricket wanderer (the REAL feeding behaviour lives in the lizard
 *  habitat's InsectBehavior sim — this is just display motion for the pad). */
class LabCricket {
  private state: "idle" | "scurry" | "hop" | "freeze" = "idle";
  private timer = rand(0.5, 2);
  private heading = rand(0, Math.PI * 2);
  private hopT = 0;
  private x: number;
  private z: number;
  private anim: CreatureAnimator;

  constructor(readonly model: CreatureModel) {
    this.anim = new CreatureAnimator(model);
    this.x = rand(-PAD.w / 2 + 0.1, PAD.w / 2 - 0.1);
    this.z = rand(-PAD.d / 2 + 0.1, PAD.d / 2 - 0.1);
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      const r = Math.random();
      this.state = r < 0.35 ? "idle" : r < 0.7 ? "scurry" : r < 0.85 ? "hop" : "freeze";
      this.timer = this.state === "hop" ? 0.32 : rand(0.6, 2.4);
      if (this.state !== "idle" && this.state !== "freeze") this.heading += rand(-1.4, 1.4);
      if (this.state === "hop") this.hopT = 0;
    }
    let speed = 0;
    let hopY = 0;
    if (this.state === "scurry") speed = 0.12;
    else if (this.state === "hop") {
      this.hopT += dt;
      const f = Math.min(1, this.hopT / 0.32);
      hopY = Math.sin(f * Math.PI) * 0.05;
      speed = 0.3;
    }
    if (speed > 0) {
      this.x += Math.sin(this.heading) * speed * dt;
      this.z += Math.cos(this.heading) * speed * dt;
      const hx = PAD.w / 2 - 0.08;
      const hz = PAD.d / 2 - 0.08;
      if (Math.abs(this.x) > hx || Math.abs(this.z) > hz) {
        this.x = THREE.MathUtils.clamp(this.x, -hx, hx);
        this.z = THREE.MathUtils.clamp(this.z, -hz, hz);
        this.heading += Math.PI * rand(0.6, 1.4);
      }
    }
    this.model.root.position.set(this.x, hopY, this.z);
    this.model.root.rotation.set(0, this.heading, 0);
    this.anim.update(dt, {
      speedFrac: this.state === "freeze" ? 0 : speed > 0.2 ? 1 : speed > 0 ? 0.5 : 0.12,
      dartFrac: this.state === "hop" ? 1 : 0,
      resting: this.state === "freeze",
    });
  }
}

interface LineupUnit {
  anim: CreatureAnimator;
}

export class ThreeCreatureLabScene implements HabitatScene {
  readonly scene = new THREE.Scene();
  readonly camera: CameraConfig = { fov: 38, pos: [0, 0.88, 2.45], look: [0, 0.26, 0] };
  private aquatics: ThreeAquariumCreatures;
  private waterGroup = new THREE.Group();
  private padGroup = new THREE.Group();
  private isopods: ThreeIsopods;
  private crickets: LabCricket[] = [];
  private lineup: LineupUnit[] = [];
  private panel: HTMLElement | null = null;
  private countTimer: number | null = null;
  private disposed = false;

  constructor() {
    this.scene.background = new THREE.Color(0x14262d);
    this.buildStage();

    // Water volume — the aquarium layer runs in LOCAL coordinates centred on
    // the volume (the group carries the offset).
    this.waterGroup.position.set(WATER.cx, 0, WATER.cz);
    this.scene.add(this.waterGroup);
    const bounds: TankBounds = {
      min: new THREE.Vector3(-WATER.w / 2 + 0.05, WATER.floor + 0.05, -WATER.d / 2 + 0.05),
      max: new THREE.Vector3(WATER.w / 2 - 0.05, WATER.floor + WATER.h - 0.08, WATER.d / 2 - 0.05),
    };
    const space: TankSurfaceSpace = {
      hw: WATER.w / 2 - 0.02,
      hd: WATER.d / 2 - 0.02,
      floorY: WATER.floor + 0.004,
      topY: WATER.floor + WATER.h - 0.06,
      interest: [new THREE.Vector3(-0.3, WATER.floor, 0.1), new THREE.Vector3(0.35, WATER.floor, -0.2)],
    };
    this.aquatics = new ThreeAquariumCreatures(bounds, space);
    this.waterGroup.add(this.aquatics.group);

    // Sand pad for the vivarium crew.
    this.padGroup.position.set(PAD.cx, 0, PAD.cz);
    this.scene.add(this.padGroup);
    const shelters = [
      { x: -0.3, z: -0.18 },
      { x: 0.28, z: 0.2 },
    ];
    this.isopods = new ThreeIsopods({
      minX: -PAD.w / 2 + 0.04,
      maxX: PAD.w / 2 - 0.04,
      minZ: -PAD.d / 2 + 0.04,
      maxZ: PAD.d / 2 - 0.04,
      groundY: () => 0.001,
      shelters: () => shelters,
      threat: () => null,
    });
    this.padGroup.add(this.isopods.group);
  }

  private buildStage(): void {
    // Bright neutral studio lighting — this is an inspection bench, not a
    // mood piece; every texture must read.
    const lights = new THREE.Group();
    lights.add(new THREE.AmbientLight(0xcfe4e6, 0.9));
    const hemi = new THREE.HemisphereLight(0xeafcff, 0x2c414a, 1.05);
    lights.add(hemi);
    const key = new THREE.DirectionalLight(0xfff4dc, 1.7);
    key.position.set(1.4, 2.4, 1.8);
    lights.add(key);
    const fill = new THREE.DirectionalLight(0x9fd4e8, 0.6);
    fill.position.set(-1.8, 1.4, -1);
    lights.add(fill);
    this.scene.add(lights);

    // Studio floor.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 48),
      new THREE.MeshStandardMaterial({ color: 0x18262b, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    this.scene.add(floor);

    // Water volume shell: translucent panes + a soft surface sheen.
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x2e7f86,
      transparent: true,
      opacity: 0.12,
      roughness: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(WATER.w, WATER.h, WATER.d), waterMat);
    box.position.set(WATER.cx, WATER.floor + WATER.h / 2, WATER.cz);
    box.renderOrder = 5;
    this.scene.add(box);
    const surf = new THREE.Mesh(
      new THREE.PlaneGeometry(WATER.w, WATER.d),
      new THREE.MeshStandardMaterial({ color: 0x9fe8e2, transparent: true, opacity: 0.16, roughness: 0.2 }),
    );
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(WATER.cx, WATER.floor + WATER.h - 0.02, WATER.cz);
    surf.renderOrder = 6;
    this.scene.add(surf);
    const waterBase = new THREE.Mesh(
      new THREE.BoxGeometry(WATER.w, 0.02, WATER.d),
      new THREE.MeshStandardMaterial({ color: 0x3d3427, roughness: 0.95 }),
    );
    waterBase.position.set(WATER.cx, WATER.floor - 0.01 + 0.005, WATER.cz);
    this.scene.add(waterBase);

    // Sand pad + two shelter rocks.
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(PAD.w, 0.02, PAD.d),
      new THREE.MeshStandardMaterial({ color: 0xcbb489, roughness: 0.98 }),
    );
    pad.position.set(PAD.cx, -0.01 + 0.001, PAD.cz);
    this.scene.add(pad);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6f6154, roughness: 0.9 });
    for (const s of [
      { x: -0.3, z: -0.18, r: 0.09 },
      { x: 0.28, z: 0.2, r: 0.075 },
    ]) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s.r, 1), rockMat);
      rock.position.set(PAD.cx + s.x, s.r * 0.55, PAD.cz + s.z);
      rock.scale.y = 0.62;
      rock.rotation.y = s.x * 5;
      this.scene.add(rock);
    }

    // Station labels.
    const aqua = makeLabel("Aquarium creatures");
    aqua.position.set(WATER.cx, WATER.floor + WATER.h + 0.1, WATER.cz);
    aqua.scale.set(0.6, 0.11, 1);
    this.scene.add(aqua);
    const viva = makeLabel("Vivarium crew");
    viva.position.set(PAD.cx, 0.5, PAD.cz);
    viva.scale.set(0.5, 0.095, 1);
    this.scene.add(viva);
  }

  async load(): Promise<void> {
    await preloadCreatures(creatureList().map((c) => c.id));

    // LINE-UP: one of each on pedestals, real relative scale, labelled.
    const ids = creatureList().map((c) => c.id);
    const step = 0.34;
    const x0 = (-(ids.length - 1) / 2) * step;
    const pedMat = new THREE.MeshStandardMaterial({ color: 0x24363c, roughness: 0.85 });
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const x = x0 + i * step;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.05, 24), pedMat);
      ped.position.set(x, 0.025, LINEUP_Z);
      this.scene.add(ped);
      const model = await loadCreature(id);
      const c = getCreature(id);
      const cm = c.asset.bodyLength * 100;
      const label = makeLabel(`${c.displayName} · ${cm.toFixed(cm < 1 ? 1 : 0)} cm`);
      label.position.set(x, 0.34, LINEUP_Z);
      this.scene.add(label);
      if (!model) continue;
      // Specimen-bench magnification: every animal shown at ONE display length
      // (its REAL in-tank size lives on the label + in the live stations) so a
      // 9 mm daphnia is as inspectable as a 5 cm snail.
      const k = 0.16 / c.asset.bodyLength;
      model.root.scale.setScalar(k);
      // Swimmers are centred models — lift them so they hover over the disc.
      const lift = c.asset.groundCreature ? 0.051 : 0.051 + (model.height * k) / 2;
      model.root.position.set(x, lift, LINEUP_Z);
      model.root.rotation.y = Math.PI * 0.16; // three-quarter pose toward camera
      this.scene.add(model.root);
      this.lineup.push({ anim: new CreatureAnimator(model) });
    }

    // Live stations: the full default aquarium population + the vivarium crew.
    await this.aquatics.load(defaultAquariumPopulation());
    await this.isopods.spawn(5);
    for (let i = 0; i < 5; i++) {
      const m = await loadCreature("feeder_cricket");
      if (!m) break;
      const cricket = new LabCricket(m);
      this.padGroup.add(m.root);
      this.crickets.push(cricket);
    }

    this.buildPanel();

    try {
      Object.assign(globalThis, {
        __creatureLab: {
          counts: (): Record<string, number> => this.counts(),
          positions: (id: string): [number, number, number][] => this.aquatics.positions(id as CreatureId),
          isopods: (): [number, number, number][] => this.isopods.positions(),
          spawn: (id: string, n: number): Promise<number> => this.spawnMore(id as CreatureId, n),
          lineupCount: (): number => this.lineup.length,
        },
      });
    } catch {
      /* non-browser */
    }
  }

  private counts(): Record<string, number> {
    const out = this.aquatics.counts();
    if (this.isopods.count()) out.isopod = this.isopods.count();
    if (this.crickets.length) out.feeder_cricket = this.crickets.length;
    return out;
  }

  private async spawnMore(id: CreatureId, n: number): Promise<number> {
    const c = getCreature(id);
    if (c.habitatType === "aquarium") {
      const made = await this.aquatics.spawn(id, n);
      this.refreshCounts();
      return made;
    }
    if (id === "isopod") {
      const made = await this.isopods.spawn(n);
      this.refreshCounts();
      return made;
    }
    let made = 0;
    for (let i = 0; i < n; i++) {
      const m = await loadCreature("feeder_cricket");
      if (!m) break;
      this.padGroup.add(m.root);
      this.crickets.push(new LabCricket(m));
      made++;
    }
    this.refreshCounts();
    return made;
  }

  // ── DOM panel (dev tool — fully owned + removed by this scene) ────────────
  // innerHTML below renders ONLY compile-time constants from the creature
  // registry (authored TS data, no user/network input) — no injection surface.
  private buildPanel(): void {
    if (this.disposed) return;
    const p = document.createElement("div");
    p.id = "creature-lab-panel";
    p.style.cssText =
      "position:fixed;top:12px;right:12px;width:300px;max-height:calc(100vh - 24px);overflow:auto;z-index:60;" +
      "background:rgba(10,24,28,0.92);border:1px solid rgba(140,220,210,0.25);border-radius:14px;padding:12px 14px;" +
      "font:12px/1.45 system-ui,sans-serif;color:#d7ece8;backdrop-filter:blur(8px)";
    const info = document.createElement("div");
    const rows = document.createElement("div");
    const title = document.createElement("div");
    title.innerHTML = `<b style="font-size:14px">Creature Lab</b> <span style="opacity:0.6">dev · ?habitat=creatures</span>`;
    title.style.marginBottom = "8px";
    p.appendChild(title);
    p.appendChild(rows);
    info.style.cssText = "margin-top:10px;padding-top:8px;border-top:1px solid rgba(140,220,210,0.2)";
    info.innerHTML = `<span style="opacity:0.6">Click a species for its codex card.</span>`;
    p.appendChild(info);

    for (const c of creatureList()) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:6px;padding:3px 0";
      const name = document.createElement("span");
      name.textContent = c.displayName;
      name.style.cssText = "flex:1;cursor:pointer;font-weight:600;color:#bfe9de";
      name.onclick = (): void => {
        const needs: string[] = [];
        if (c.needs.plantNeed && c.needs.plantNeed > 60) needs.push("plants");
        if (c.needs.hidingNeed > 60) needs.push("hides");
        if (c.needs.algaeNeed && c.needs.algaeNeed > 60) needs.push("algae/biofilm");
        if (c.needs.calciumNeed && c.needs.calciumNeed > 60) needs.push("calcium");
        if (c.needs.leafLitterNeed && c.needs.leafLitterNeed > 60) needs.push("leaf litter");
        if (c.minimumGroupSize > 1) needs.push(`group of ${c.minimumGroupSize}+`);
        info.innerHTML =
          `<b style="font-size:13px">${c.displayName}</b> <i style="opacity:0.6">${c.scientificName ?? ""}</i><br>` +
          `<span style="opacity:0.75">${c.category} · ${c.habitatType} · Tier ${c.unlockTier} · ${c.difficulty}</span><br>` +
          `<div style="margin:6px 0">${c.descriptionUI}</div>` +
          `<div style="display:flex;flex-wrap:wrap;gap:4px;margin:4px 0">${c.personalityTags
            .slice(0, 6)
            .map((t) => `<span style="background:rgba(120,220,190,0.14);border-radius:8px;padding:1px 7px">${t}</span>`)
            .join("")}</div>` +
          `<b>Zone:</b> ${c.preferredZone}<br><b>Diet:</b> ${c.dietType}<br>` +
          `<b>Role:</b> ${c.ecosystemRole}<br>` +
          (needs.length ? `<b>Needs:</b> ${needs.join(", ")}<br>` : "") +
          `<b>Ecosystem:</b><ul style="margin:2px 0 0 16px;padding:0">${c.ecosystemEffects
            .slice(0, 3)
            .map((e) => `<li>${e}</li>`)
            .join("")}</ul>`;
      };
      const count = document.createElement("span");
      count.dataset.count = c.id;
      count.style.cssText = "opacity:0.7;min-width:20px;text-align:right";
      count.textContent = "0";
      const bt = (label: string, n: number): HTMLButtonElement => {
        const b = document.createElement("button");
        b.textContent = label;
        b.style.cssText =
          "background:rgba(120,220,190,0.12);color:#cdeee4;border:1px solid rgba(140,220,210,0.3);border-radius:7px;padding:1px 7px;cursor:pointer";
        b.onclick = (): void => {
          void this.spawnMore(c.id, n);
        };
        return b;
      };
      row.append(name, count, bt("+1", 1), bt(`+${Math.max(2, c.spawn.defaultCount)}`, Math.max(2, c.spawn.defaultCount)));
      rows.appendChild(row);
    }

    document.body.appendChild(p);
    this.panel = p;
    this.refreshCounts();
    this.countTimer = window.setInterval(() => this.refreshCounts(), 1500);
  }

  private refreshCounts(): void {
    if (!this.panel) return;
    const counts = this.counts();
    this.panel.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
      el.textContent = String(counts[el.dataset.count ?? ""] ?? 0);
    });
  }

  update(dt: number): void {
    this.aquatics.update(dt);
    this.isopods.update(dt);
    for (const c of this.crickets) c.update(dt);
    for (const u of this.lineup) u.anim.update(dt, { speedFrac: 0.3 });
  }

  excite(): void {
    this.aquatics.excite();
  }

  dispose(): void {
    this.disposed = true;
    if (this.countTimer !== null) window.clearInterval(this.countTimer);
    this.panel?.remove();
    this.panel = null;
    this.aquatics.dispose();
    this.isopods.dispose();
    disposeScene(this.scene);
  }
}

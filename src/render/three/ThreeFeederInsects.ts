/**
 * Renders the feeder insects with a DISTINCT procedural model per kind, coloured
 * from the reference food photos: tan hopping crickets, golden segmented
 * mealworms, long dark-headed superworms, flat mahogany dubia roaches and plump
 * pale waxworms. Behaviour lives in the sim (LizardFeedingSystem +
 * InsectBehavior); this layer draws each feeder at its sim position, faces it
 * along its heading, and animates kind-appropriate motion — crickets hop in flee
 * bursts, worms inch with a body wave, roaches scuttle with a nervous wobble,
 * alert insects freeze. `makeInsectVisual` is shared with the feeding
 * presentation (the insect pinched in the tongs / lying on the palm).
 */
import * as THREE from "three";
import type { FeederKind, FeederState } from "../../habitats/HabitatTypes";
import { cloneCreatureSync } from "./creatures/ThreeCreatureLoader";
import { CreatureAnimator } from "./creatures/ThreeCreatureAnimator";

interface InsectRig {
  group: THREE.Group;
  kind: FeederKind;
  /** Body segments for the crawl wave (worms) / body part for wobble. */
  segs: THREE.Object3D[];
  phase: number;
  /** Present when this rig uses the REAL part-separated creature GLB. */
  anim?: CreatureAnimator;
}

const PALETTE: Record<FeederKind, { body: number; accent: number }> = {
  cricket: { body: 0x9a7b52, accent: 0x6b5236 },
  mealworm: { body: 0xc89550, accent: 0x9c6f36 },
  superworm: { body: 0xb07e3f, accent: 0x4a2f18 },
  dubia_roach: { body: 0x5c2e1a, accent: 0x3d1f10 },
  waxworm: { body: 0xd9c9a4, accent: 0xbfae87 },
};

const mats = new Map<number, THREE.MeshStandardMaterial>();
function mat(color: number): THREE.MeshStandardMaterial {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.02 });
    mats.set(color, m);
  }
  return m;
}

/** Build one insect model (origin at ground, facing +Z). Shared with the
 *  presentation props. Caller owns adding/removing; materials are shared.
 *  Crickets use the REAL self-made creature GLB once its master has loaded
 *  (ThreeLizardScene preloads it); the procedural build stays the fallback. */
export function makeInsectVisual(kind: FeederKind): THREE.Group {
  if (kind === "cricket") {
    const model = cloneCreatureSync("feeder_cricket");
    if (model) {
      model.root.userData.creatureAnim = new CreatureAnimator(model);
      model.root.userData.segs = [];
      return model.root;
    }
  }
  const g = new THREE.Group();
  const p = PALETTE[kind] ?? PALETTE.cricket;
  const segs: THREE.Object3D[] = [];

  if (kind === "cricket") {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), mat(p.body));
    body.scale.set(0.72, 0.66, 1.55);
    body.position.y = 0.013;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), mat(p.accent));
    head.position.set(0, 0.014, 0.024);
    g.add(head);
    for (const sx of [-1, 1]) {
      // Big angled hind legs — the cricket read.
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.0035, 0.034), mat(p.accent));
      leg.position.set(sx * 0.013, 0.014, -0.012);
      leg.rotation.set(0.85, sx * 0.35, 0);
      g.add(leg);
      const ant = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.0022, 0.036), mat(p.accent));
      ant.position.set(sx * 0.005, 0.022, 0.042);
      ant.rotation.set(-0.5, sx * 0.22, 0);
      g.add(ant);
      segs.push(ant); // antennae twitch
    }
  } else if (kind === "mealworm" || kind === "superworm" || kind === "waxworm") {
    const n = kind === "superworm" ? 8 : kind === "waxworm" ? 5 : 6;
    const r = kind === "waxworm" ? 0.0092 : kind === "superworm" ? 0.008 : 0.0072;
    const gap = kind === "superworm" ? 0.0125 : 0.0105;
    for (let i = 0; i < n; i++) {
      const isHead = i === n - 1;
      const seg = new THREE.Mesh(
        new THREE.SphereGeometry(r * (1 - Math.abs(i - n / 2) * 0.03), 8, 6),
        mat(isHead && kind === "superworm" ? p.accent : i % 2 === 0 ? p.body : p.accent),
      );
      seg.position.set(0, r * 0.92, (i - (n - 1) / 2) * gap);
      g.add(seg);
      segs.push(seg);
    }
  } else {
    // Dubia roach: flat mahogany oval with a darker head shield + leg stubs.
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), mat(p.body));
    body.scale.set(1.0, 0.42, 1.4);
    body.position.y = 0.009;
    g.add(body);
    const shield = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), mat(p.accent));
    shield.scale.set(1.1, 0.5, 0.8);
    shield.position.set(0, 0.01, 0.02);
    g.add(shield);
    for (const sx of [-1, 1]) {
      for (const sz of [-0.012, 0, 0.012]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.0025, 0.012), mat(p.accent));
        leg.position.set(sx * 0.018, 0.004, sz);
        leg.rotation.y = sx * 0.9;
        g.add(leg);
        segs.push(leg);
      }
    }
  }
  g.userData.segs = segs;
  return g;
}

export class ThreeFeeders {
  readonly object = new THREE.Group();
  private rigs = new Map<number, InsectRig>();
  private t = 0;

  /** Match meshes to the current live feeders + animate kind-specific motion. */
  sync(feeders: FeederState[], dt: number): void {
    this.t += dt;
    const seen = new Set<number>();
    for (const f of feeders) {
      if (!f.alive) continue;
      seen.add(f.id);
      let rig = this.rigs.get(f.id);
      if (!rig || rig.kind !== f.kind) {
        if (rig) this.object.remove(rig.group);
        rig = {
          group: makeInsectVisual(f.kind),
          kind: f.kind,
          segs: [],
          phase: f.id * 1.37,
        };
        rig.segs = (rig.group.userData.segs as THREE.Object3D[]) ?? [];
        rig.anim = rig.group.userData.creatureAnim as CreatureAnimator | undefined;
        this.rigs.set(f.id, rig);
        this.object.add(rig.group);
      }
      this.animate(rig, f, dt);
    }
    for (const [id, rig] of this.rigs) {
      if (!seen.has(id)) {
        this.object.remove(rig.group);
        this.rigs.delete(id);
      }
    }
  }

  private animate(rig: InsectRig, f: FeederState, dt: number): void {
    const g = rig.group;
    const t = this.t + rig.phase;
    const fleeing = f.mood === "flee";
    const frozen = f.mood === "alert" || f.held;

    // Face the travel heading (models are built facing +Z).
    const h = f.heading ?? 0;
    g.rotation.y = Math.atan2(Math.cos(h), Math.sin(h));

    // Vertical: crickets HOP (big arcs in a flee burst), everything else stays
    // grounded; alert/held insects freeze dead still (that's the defence).
    let hop = 0;
    if (rig.kind === "cricket" && !frozen) {
      hop = Math.abs(Math.sin(t * (fleeing ? 16 : 6))) * (fleeing ? 0.034 : 0.006);
    }
    g.position.set(f.position[0], f.position[1] + hop, f.position[2]);

    // Real part-separated GLB: drive the shared creature animator (legs kick
    // in flee bursts, antennae sway, freeze = motionless defence).
    if (rig.anim) {
      rig.anim.update(dt, {
        speedFrac: frozen ? 0 : fleeing ? 1 : 0.35,
        dartFrac: fleeing ? 1 : 0,
        resting: frozen,
      });
      return;
    }

    if (frozen) return; // stillness — only placement updates

    if (rig.kind === "cricket") {
      // Antennae twitch.
      for (let i = 0; i < rig.segs.length; i++) {
        rig.segs[i].rotation.x = -0.5 + Math.sin(t * 7 + i * 2.1) * 0.12;
      }
    } else if (rig.kind === "dubia_roach") {
      // Nervous scuttle wobble + leg jitter.
      g.rotation.y += Math.sin(t * (fleeing ? 22 : 9)) * 0.05;
      for (let i = 0; i < rig.segs.length; i++) {
        rig.segs[i].rotation.x = Math.sin(t * (fleeing ? 26 : 10) + i * 1.7) * 0.5;
      }
    } else {
      // Worms: a crawl wave rippling down the segments (subtle when calm).
      const amp = fleeing ? 0.0035 : 0.0016;
      const rate = fleeing ? 9 : rig.kind === "waxworm" ? 2.2 : 3.6;
      for (let i = 0; i < rig.segs.length; i++) {
        rig.segs[i].position.x = Math.sin(t * rate + i * 0.95) * amp;
      }
    }
  }

  /** QA: does the live cricket visual use the real creature GLB? */
  cricketVisual(): "glb" | "procedural" | "none" {
    for (const [, rig] of this.rigs) {
      if (rig.kind === "cricket") return rig.anim ? "glb" : "procedural";
    }
    return "none";
  }

  clear(): void {
    for (const [, rig] of this.rigs) this.object.remove(rig.group);
    this.rigs.clear();
  }

  dispose(): void {
    this.clear();
    // Materials are shared module-wide (kept for the session); geometries are
    // tiny primitives — dispose per group.
    this.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((m as unknown as { isMesh?: boolean }).isMesh) m.geometry?.dispose();
    });
  }
}

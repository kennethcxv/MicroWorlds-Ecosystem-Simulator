/**
 * OPEN-WATER creatures + the AQUARIUM CREATURE LAYER.
 *
 * SchoolFishCreature: part-animated fish with real group behaviour — boids-lite
 * cohesion/alignment/separation (pure FlockMath) blended with per-fish roaming,
 * zone preference, wall avoidance, banking and dart/hover states. One class,
 * three personalities: neon tetras school loosely mid-water, zebra danios race
 * the upper lanes with burst sprints, guppies wander sociably near the surface.
 *
 * DaphniaSwarm: the micro-life layer — tiny pulse-hop drifters that sink gently
 * between antenna strokes, cluster, and scatter from passing fish. Deliberately
 * the cheapest possible update (no quaternions, no steering solves).
 *
 * ThreeAquariumCreatures: owns the whole registry-driven population for the 3D
 * tank (spawn/update/excite/dispose + QA counts) so the tank scene stays tiny.
 */
import * as THREE from "three";
import { type TankBounds, alongX, alongY, alongZ, clampInside, wallAvoid } from "../ThreeBounds";
import { flockAccel, type FlockAgent } from "../../../habitats/creatures/FlockMath";
import type { CreatureId, CreatureSpecies } from "../../../data/creatures/CreatureTypes";
import { getCreature } from "../../../data/creatures/creatureRegistry";
import { loadCreature, type CreatureModel } from "./ThreeCreatureLoader";
import { CreatureAnimator } from "./ThreeCreatureAnimator";
import { makeFusedSwimmer, type FusedSwimmer } from "./ThreeFusedSwimmer";
import { ShrimpCreature, SnailCreature, OtoCreature, type TankSurfaceSpace } from "./ThreeSurfaceCreatures";

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const ZP = new THREE.Vector3(0, 0, 1);
const _toTarget = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _avoid = new THREE.Vector3();
const _accel = new THREE.Vector3();
const _f = new THREE.Vector3();
const _baseQuat = new THREE.Quaternion();
const _bankQuat = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();

type FishState = "cruise" | "hover" | "dart" | "burst";

export class SchoolFishCreature {
  readonly object: THREE.Group;
  readonly agent: FlockAgent = { pos: [0, 0, 0], vel: [0, 0, 0] };
  // FUSED body + bounded wave (not the part animator): fish bodies must be
  // structurally unable to detach — see ThreeFusedSwimmer.
  private swim: FusedSwimmer;
  private cfg: CreatureSpecies;
  private pos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private target = new THREE.Vector3();
  private state: FishState = "cruise";
  private stateTimer = rand(2, 5);
  private headingY = 0;
  private bank = 0;
  private exciteT = 0;

  constructor(
    model: CreatureModel,
    private bounds: TankBounds,
  ) {
    this.swim = makeFusedSwimmer(model);
    this.object = this.swim.object;
    this.cfg = model.species;
    const m = this.cfg.movement;
    const y = m.yBand ?? [0.3, 0.8];
    const z = m.zBand ?? [0.1, 0.9];
    this.pos.set(alongX(bounds, Math.random()), alongY(bounds, rand(y[0], y[1])), alongZ(bounds, rand(z[0], z[1])));
    this.object.position.copy(this.pos);
    this.pickTarget();
    this.headingY = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z);
    this.syncAgent();
  }

  position(): THREE.Vector3 {
    return this.pos;
  }

  private syncAgent(): void {
    this.agent.pos[0] = this.pos.x;
    this.agent.pos[1] = this.pos.y;
    this.agent.pos[2] = this.pos.z;
    this.agent.vel[0] = this.vel.x;
    this.agent.vel[1] = this.vel.y;
    this.agent.vel[2] = this.vel.z;
  }

  excite(): void {
    this.exciteT = 2.6;
    this.state = "dart";
    this.stateTimer = rand(0.6, 1.0);
    this.target.set(alongX(this.bounds, Math.random()), alongY(this.bounds, rand(0.78, 0.96)), alongZ(this.bounds, rand(0.55, 1)));
  }

  private pickTarget(): void {
    const m = this.cfg.movement;
    const y = m.yBand ?? [0.3, 0.8];
    const z = m.zBand ?? [0.1, 0.9];
    const upper = this.exciteT > 0;
    this.target.set(
      alongX(this.bounds, Math.random()),
      alongY(this.bounds, upper ? rand(0.7, 0.96) : rand(y[0], y[1])),
      alongZ(this.bounds, upper ? rand(0.5, 1) : rand(z[0], z[1])),
    );
  }

  private advanceState(): void {
    const m = this.cfg.movement;
    if (this.state === "dart" || this.state === "burst") {
      this.state = "cruise";
      this.stateTimer = rand(2.5, 5);
      this.pickTarget();
      return;
    }
    const r = Math.random();
    const dartChance = m.dartChance ?? 0.1;
    const hoverChance = m.hoverChance ?? 0.15;
    if (this.exciteT > 0 || r < dartChance) {
      this.state = "dart";
      this.stateTimer = rand(0.5, 1);
      this.pickTarget();
    } else if (m.burstChance && r < dartChance + m.burstChance) {
      // Danio signature: a flat-out sprint clear across the tank.
      this.state = "burst";
      this.stateTimer = rand(0.7, 1.3);
      this.target.set(
        alongX(this.bounds, this.pos.x > 0 ? rand(0, 0.25) : rand(0.75, 1)),
        alongY(this.bounds, rand(0.5, 0.9)),
        alongZ(this.bounds, Math.random()),
      );
    } else if (r < dartChance + (m.burstChance ?? 0) + hoverChance) {
      this.state = "hover";
      this.stateTimer = rand(1.4, 3);
      this.target.copy(this.pos);
    } else {
      this.state = "cruise";
      this.stateTimer = rand(2.5, 5);
      this.pickTarget();
    }
  }

  update(dt: number, flockmates: FlockAgent[]): void {
    const m = this.cfg.movement;
    if (this.exciteT > 0) this.exciteT -= dt;
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) this.advanceState();

    const cruise = m.cruiseSpeed;
    const dartSpeed = m.dartSpeed ?? cruise * 3;
    const desiredSpeed =
      this.state === "dart" || this.state === "burst" ? dartSpeed : this.state === "hover" ? cruise * 0.16 : cruise;

    _toTarget.copy(this.target).sub(this.pos);
    const dist = _toTarget.length();
    const arrive = this.cfg.asset.bodyLength * 2;
    if (dist < arrive && this.state !== "dart" && this.state !== "burst") {
      this.pickTarget();
      _toTarget.copy(this.target).sub(this.pos);
    }

    _desired.copy(_toTarget);
    if (dist > 1e-4) _desired.multiplyScalar(desiredSpeed / dist);
    const slow = THREE.MathUtils.clamp(dist / Math.max(arrive, 1e-4), 0.25, 1);
    _desired.multiplyScalar(slow);

    _accel.copy(_desired).sub(this.vel).multiplyScalar(4);

    // Schooling: cohesion/alignment/separation with the same species.
    if (m.school && flockmates.length) {
      const a = flockAccel(this.agent, flockmates, {
        radius: m.school.radius,
        sepRadius: m.school.sepRadius,
        cohesion: m.school.cohesion,
        alignment: m.school.alignment,
        separation: m.school.separation,
        maxAccel: (m.accel ?? 1) * 1.6,
      });
      _accel.x += a[0];
      _accel.y += a[1];
      _accel.z += a[2];
    }

    wallAvoid(this.pos, this.bounds, this.cfg.asset.bodyLength * 1.8, (m.accel ?? 1) * 2.4, _avoid);
    _accel.add(_avoid);
    const aMax = (m.accel ?? 1) * (this.state === "dart" || this.state === "burst" ? 2.4 : 1);
    if (_accel.length() > aMax) _accel.setLength(aMax);

    this.vel.addScaledVector(_accel, dt);
    const vMax = desiredSpeed * 1.15;
    if (this.vel.length() > vMax) this.vel.setLength(vMax);

    this.pos.addScaledVector(this.vel, dt);
    clampInside(this.pos, this.bounds);
    this.object.position.copy(this.pos);
    this.syncAgent();

    const speed = this.vel.length();
    let yawRate = 0;
    if (speed > 0.02) {
      _f.copy(this.vel).divideScalar(speed);
      const newHeading = Math.atan2(_f.x, _f.z);
      yawRate = angleDiff(newHeading, this.headingY) / Math.max(dt, 1e-3);
      this.headingY = newHeading;
      _baseQuat.setFromUnitVectors(ZP, _f);
      const targetBank = THREE.MathUtils.clamp(-yawRate * 0.9, -0.55, 0.55);
      this.bank += (targetBank - this.bank) * Math.min(1, dt * 6);
      _bankQuat.setFromAxisAngle(_f, this.bank);
      _targetQuat.copy(_baseQuat).premultiply(_bankQuat);
      this.object.quaternion.slerp(_targetQuat, Math.min(1, (m.turnRate ?? 3.4) * dt));
    }

    const speedFrac = THREE.MathUtils.clamp((speed - cruise * 0.2) / Math.max(dartSpeed - cruise * 0.2, 1e-4), 0, 1);
    const turnFrac = THREE.MathUtils.clamp(yawRate * 0.22, -0.5, 0.5);
    this.swim.setSwim(
      this.state === "hover" ? 0.12 : 0.25 + speedFrac * 0.75,
      this.state === "dart" || this.state === "burst" ? 1 : 0,
      turnFrac,
    );
    this.swim.update(dt);
  }
}

// ── Daphnia swarm ────────────────────────────────────────────────────────────

interface DaphniaUnit {
  object: THREE.Group;
  anim: CreatureAnimator;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  nextPulse: number;
  pulsePhase: number;
}

export class DaphniaSwarm {
  readonly group = new THREE.Group();
  private units: DaphniaUnit[] = [];
  private cfg: CreatureSpecies;
  private centroid = new THREE.Vector3();

  constructor(private bounds: TankBounds) {
    this.cfg = getCreature("daphnia");
  }

  async spawn(count: number): Promise<number> {
    let made = 0;
    for (let i = 0; i < count; i++) {
      const model = await loadCreature("daphnia");
      if (!model) break;
      const b = this.bounds;
      const y = this.cfg.movement.yBand ?? [0.3, 0.85];
      const unit: DaphniaUnit = {
        object: model.root,
        anim: new CreatureAnimator(model),
        pos: new THREE.Vector3(
          alongX(b, rand(0.3, 0.7)),
          alongY(b, rand(y[0], y[1])),
          alongZ(b, rand(0.3, 0.7)),
        ),
        vel: new THREE.Vector3(),
        nextPulse: rand(0, 0.6),
        pulsePhase: rand(0, Math.PI * 2),
      };
      unit.object.position.copy(unit.pos);
      this.group.add(unit.object);
      this.units.push(unit);
      made++;
    }
    return made;
  }

  count(): number {
    return this.units.length;
  }

  positions(): THREE.Vector3[] {
    return this.units.map((u) => u.pos);
  }

  clear(): void {
    for (const u of this.units) this.group.remove(u.object);
    this.units = [];
  }

  excite(): void {
    for (const u of this.units) {
      u.vel.x += rand(-0.05, 0.05);
      u.vel.y += rand(0.01, 0.05);
      u.vel.z += rand(-0.05, 0.05);
    }
  }

  /** dt-advance every unit. `threats` = fish positions (flee response). */
  update(dt: number, threats: THREE.Vector3[]): void {
    if (!this.units.length) return;
    const m = this.cfg.movement;
    const [prMin, prMax] = m.pulseRate ?? [1.6, 2.6];
    this.centroid.set(0, 0, 0);
    for (const u of this.units) this.centroid.add(u.pos);
    this.centroid.divideScalar(this.units.length);

    for (const u of this.units) {
      u.nextPulse -= dt;
      u.pulsePhase += dt * 6;
      if (u.nextPulse <= 0) {
        u.nextPulse = 1 / rand(prMin, prMax);
        u.pulsePhase = 0;
        // One antenna stroke: an upward-biased hop with a drift toward the
        // cluster (keeps the cloud loosely together).
        const hop = m.cruiseSpeed ?? 0.03;
        u.vel.x += rand(-1, 1) * hop + (this.centroid.x - u.pos.x) * (m.clusterPull ?? 0.3) * hop * 8;
        u.vel.y += rand(0.7, 1.3) * hop * 1.6;
        u.vel.z += rand(-1, 1) * hop + (this.centroid.z - u.pos.z) * (m.clusterPull ?? 0.3) * hop * 8;
      }
      // Flee a close fish with a burst of panicked strokes.
      for (const t of threats) {
        const dx = u.pos.x - t.x;
        const dy = u.pos.y - t.y;
        const dz = u.pos.z - t.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 0.012 && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const k = (0.09 * dt) / d;
          u.vel.x += dx * k * 60;
          u.vel.y += dy * k * 60;
          u.vel.z += dz * k * 60;
        }
      }
      // Sink + drag between strokes — the signature daphnia bob.
      u.vel.y -= 0.010 * dt;
      u.vel.multiplyScalar(Math.pow(0.25, dt));
      u.pos.addScaledVector(u.vel, dt);
      clampInside(u.pos, this.bounds);
      u.object.position.copy(u.pos);
      u.object.rotation.z = Math.sin(u.pulsePhase * 0.5) * 0.12;
      u.anim.update(dt, { speedFrac: 0.5, pulsePhase: u.pulsePhase });
    }
  }
}

// ── The aquarium creature layer ──────────────────────────────────────────────

export interface AquariumPopulationEntry {
  id: CreatureId;
  count: number;
}

export class ThreeAquariumCreatures {
  readonly group = new THREE.Group();
  private fish: SchoolFishCreature[] = [];
  private fishByKind = new Map<CreatureId, SchoolFishCreature[]>();
  private shrimp: ShrimpCreature[] = [];
  private snails: SnailCreature[] = [];
  private otos: OtoCreature[] = [];
  private daphnia: DaphniaSwarm;
  private threatScratch: THREE.Vector3[] = [];

  constructor(
    private bounds: TankBounds,
    private space: TankSurfaceSpace,
  ) {
    this.daphnia = new DaphniaSwarm(bounds);
    this.group.add(this.daphnia.group);
  }

  /** Spawn `count` of a species (dev/test seam + initial population). Returns
   *  how many actually spawned (0 when the GLB is missing — never throws). */
  async spawn(id: CreatureId, count: number): Promise<number> {
    const c = getCreature(id);
    if (c.habitatType !== "aquarium") return 0;
    if (c.controllerType === "microSwarm") return this.daphnia.spawn(count);
    let made = 0;
    for (let i = 0; i < count; i++) {
      const model = await loadCreature(id);
      if (!model) break;
      switch (c.controllerType) {
        case "schoolFish": {
          const f = new SchoolFishCreature(model, this.bounds);
          this.fish.push(f);
          let arr = this.fishByKind.get(id);
          if (!arr) {
            arr = [];
            this.fishByKind.set(id, arr);
          }
          arr.push(f);
          this.group.add(f.object);
          break;
        }
        case "shrimpCrawler": {
          const s = new ShrimpCreature(model, this.space);
          this.shrimp.push(s);
          this.group.add(s.object);
          break;
        }
        case "snailGlider": {
          const s = new SnailCreature(model, this.space);
          this.snails.push(s);
          this.group.add(s.object);
          break;
        }
        case "surfaceGrazer": {
          const o = new OtoCreature(model, this.space);
          this.otos.push(o);
          this.group.add(o.object);
          break;
        }
        default:
          return made;
      }
      made++;
    }
    return made;
  }

  async load(population: AquariumPopulationEntry[]): Promise<void> {
    for (const p of population) await this.spawn(p.id, p.count);
  }

  update(dt: number): void {
    // Same-species flockmates only — a tetra schools with tetras, not danios.
    for (const [, arr] of this.fishByKind) {
      for (const f of arr) {
        // Cheap neighbour pass: every same-kind fish (n ≤ 6 → trivial).
        const mates = arr.filter((o) => o !== f).map((o) => o.agent);
        f.update(dt, mates);
      }
    }
    for (const s of this.shrimp) s.update(dt);
    for (const s of this.snails) s.update(dt);
    for (const o of this.otos) o.update(dt);
    if (this.daphnia.count()) {
      this.threatScratch.length = 0;
      for (const f of this.fish) this.threatScratch.push(f.position());
      this.daphnia.update(dt, this.threatScratch);
    }
  }

  /** Feeding / disturbance poke: fish rush up, shrimp + otos startle. */
  excite(): void {
    for (const f of this.fish) f.excite();
    for (const s of this.shrimp) s.excite();
    for (const o of this.otos) o.excite();
    this.daphnia.excite();
  }

  /** Push every open-water fish position into `out` (food-bite checks). */
  fishPositions(out: THREE.Vector3[]): void {
    for (const f of this.fish) out.push(f.position());
    for (const o of this.otos) out.push(o.position());
  }

  /** QA: live creature counts by species id. */
  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, arr] of this.fishByKind) out[id] = arr.length;
    if (this.shrimp.length) out.cherry_shrimp = this.shrimp.length;
    for (const s of this.snails) out[s.speciesId] = (out[s.speciesId] ?? 0) + 1;
    if (this.otos.length) out.otocinclus = this.otos.length;
    if (this.daphnia.count()) out.daphnia = this.daphnia.count();
    return out;
  }

  /** QA: world positions of one species (bounds checks). */
  positions(id: CreatureId): [number, number, number][] {
    const vecs: THREE.Vector3[] = [];
    if (id === "daphnia") vecs.push(...this.daphnia.positions());
    else if (id === "cherry_shrimp") vecs.push(...this.shrimp.map((s) => s.position()));
    else if (id === "otocinclus") vecs.push(...this.otos.map((o) => o.position()));
    else if (id === "nerite_snail" || id === "mystery_snail") {
      for (const s of this.snails) if (s.speciesId === id) vecs.push(s.position());
    } else {
      for (const f of this.fishByKind.get(id) ?? []) vecs.push(f.position());
    }
    return vecs.map((v) => [v.x, v.y, v.z]);
  }

  dispose(): void {
    this.daphnia.clear();
    this.fish = [];
    this.fishByKind.clear();
    this.shrimp = [];
    this.snails = [];
    this.otos = [];
  }
}

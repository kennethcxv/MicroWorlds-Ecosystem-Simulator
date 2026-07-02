/**
 * FEEDING PRESENTATIONS — each feeding method is a real little staged scene with
 * its own props, timing and CAMERA angle (the app lerps the camera to the pose
 * this module reports while a presentation runs):
 *
 *  · QUICK  — insects toss in from above the open screen top, arcing onto the
 *             sand around the chosen spot; brief elevated overview camera.
 *  · DISH   — an automatic pour: insects drop one-by-one into the food dish
 *             (the sim contains them there); close three-quarter dish camera.
 *  · TONG   — real steel feeding tongs the PLAYER HOLDS: they follow the
 *             pointer around the tank with a wiggling insect in the tips, and
 *             the gecko comes to them (it can only take the insect when the
 *             tips are held low enough to reach). One insect at a time. Low
 *             close-up camera.
 *  · HAND   — the keeper's open hand lowers palm-up with the meal; the gecko
 *             eats straight off the palm. Side close-up camera.
 *
 * The REAL insects are sim feeders (spawned via the hooks at the exact moment
 * they land / are offered — held ones stay frozen in the tongs/palm); this
 * module only animates props and courier visuals, so behaviour and nutrition
 * stay in the tested pure systems.
 */
import * as THREE from "three";
import type { FeederKind, FeedMethodKind } from "../../habitats/HabitatTypes";
import { makeInsectVisual } from "./ThreeFeederInsects";

export interface PresentationHooks {
  /** Spawn ONE real insect near (x,z) (scatter/dish rules apply). True = placed. */
  serveOne(x: number, z: number): boolean;
  /** Spawn one HELD insect exactly at (x,z); returns its feeder id or null. */
  serveHeld(x: number, z: number): number | null;
  /** Release a held insect (it becomes live prey where it sits). */
  releaseHeld(id: number): void;
  /** Is this feeder still uneaten? */
  feederAlive(id: number): boolean;
  /** Move a held insect (it rides the tong tips the player is steering). */
  moveHeld(id: number, x: number, y: number, z: number): void;
  /** Does the gecko still want food? (Full geckos end offer sessions early.) */
  geckoWants(): boolean;
  /** A validated CLEAR landing spot near (x,z), or null — tossed insects only
   *  ever land on open, reachable sand (never inside a rock). */
  freeSpotNear(x: number, z: number): { x: number; z: number } | null;
  gecko(): { x: number; z: number; heading: number };
  groundY(x: number, z: number): number;
  /** The dish's measured BOWL-FLOOR height at (x,z) — pour landings must end
   *  on the bowl's real interior surface, not the sand beneath it. */
  dishFloorY?(x: number, z: number): number;
  /** Fired when the presentation fully finishes (props exited). */
  onDone(): void;
}

interface Flight {
  mesh: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  delay: number;
  landed: boolean;
}

type Phase = "idle" | "enter" | "hold" | "exit";

const STEEL = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.28, metalness: 0.85 });
const SKIN = new THREE.MeshStandardMaterial({ color: 0xcf9d79, roughness: 0.58, metalness: 0.0 });
const SKIN_PAD = new THREE.MeshStandardMaterial({ color: 0xdead89, roughness: 0.52, metalness: 0.0 });
const SLEEVE = new THREE.MeshStandardMaterial({ color: 0x39412f, roughness: 0.9 });

/** Feeding tongs: two slim tapered prongs meeting at a long handle. Origin at
 *  the TIP (where the insect is pinched); the handle rises up and back. */
function buildTongs(): { group: THREE.Group; prongs: THREE.Object3D[] } {
  const g = new THREE.Group();
  const prongs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0028, 0.13), STEEL);
    p.position.set(s * 0.006, 0.065 * Math.SQRT1_2 * 0.5, 0); // angled below
    const pivot = new THREE.Group();
    pivot.add(p);
    p.position.set(s * 0.007, 0, -0.062);
    pivot.rotation.x = -0.95; // prong slants up-back from the tip
    pivot.rotation.y = s * 0.05;
    g.add(pivot);
    prongs.push(pivot);
  }
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0045, 0.22, 8), STEEL);
  handle.position.set(0, 0.155, 0.093);
  handle.rotation.x = -0.62;
  g.add(handle);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), SLEEVE);
  grip.position.set(0, 0.225, 0.135);
  grip.rotation.x = -0.62;
  g.add(grip);
  return { group: g, prongs };
}

/** The keeper's hand rig: articulated fingers whose joints curl live. */
interface HandRig {
  group: THREE.Group;
  /** 0 = open flat offer … 1 = closed. `sway` adds per-finger idle motion. */
  setCurl(curl: number, sway: number): void;
}

/** One finger: three capsule segments on chained joint pivots (curl at every
 *  knuckle like a real finger), a fingertip pad, built pointing -Z. */
function buildFinger(baseR: number, lengths: [number, number, number]): { root: THREE.Group; joints: THREE.Group[] } {
  const joints: THREE.Group[] = [];
  let parent: THREE.Group | null = null;
  let root: THREE.Group | null = null;
  for (let s = 0; s < 3; s++) {
    const joint = new THREE.Group();
    const len = lengths[s];
    const r = baseR * (1 - s * 0.12);
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), SKIN);
    seg.rotation.x = Math.PI / 2; // capsule axis → Z
    seg.position.z = -(len / 2 + r * 0.35);
    joint.add(seg);
    if (s === 2) {
      // Fingertip pad (palm-up → the pads face the camera and read as a hand).
      const pad = new THREE.Mesh(new THREE.SphereGeometry(r * 0.82, 10, 8), SKIN_PAD);
      pad.scale.set(1, 0.62, 1);
      pad.position.set(0, r * 0.28, -(len + r * 0.7));
      joint.add(pad);
    }
    if (parent) {
      joint.position.z = -(lengths[s - 1] + baseR * 0.5);
      parent.add(joint);
    } else {
      root = joint;
    }
    parent = joint;
    joints.push(joint);
  }
  return { root: root!, joints };
}

/**
 * The keeper's open hand, palm-up, fingers toward -Z; origin at the palm's
 * resting height. Real proportions (palm ~10 cm, middle finger longest, pinky
 * short), knuckle arc, thenar + hypothenar palm mounds, a two-segment thumb,
 * wrist + rolled sleeve cuff running up out of frame. Fingers CURL at every
 * joint via {@link HandRig.setCurl} — cupped while carrying, relaxing open to
 * offer, closing gently on exit, with a tiny per-finger idle sway.
 */
function buildHand(): HandRig {
  const g = new THREE.Group();

  // Palm slab + heel mounds (a palm is thick at the heel, thin at the fingers).
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 14), SKIN);
  palm.scale.set(0.92, 0.26, 1.05);
  palm.position.set(0, 0.012, -0.002);
  g.add(palm);
  const thenar = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 10), SKIN_PAD);
  thenar.scale.set(1.05, 0.5, 1.35);
  thenar.position.set(0.026, 0.017, 0.02);
  g.add(thenar);
  const hypothenar = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), SKIN_PAD);
  hypothenar.scale.set(0.9, 0.48, 1.5);
  hypothenar.position.set(-0.03, 0.016, 0.018);
  g.add(hypothenar);

  // Four fingers off the palm's leading edge, on a slight knuckle arc.
  const fingers: { joints: THREE.Group[]; phase: number; mult: number }[] = [];
  const defs: { x: number; scale: number }[] = [
    { x: -0.034, scale: 0.93 }, // index
    { x: -0.0115, scale: 1.0 }, // middle
    { x: 0.011, scale: 0.95 }, // ring
    { x: 0.0335, scale: 0.76 }, // pinky
  ];
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    const f = buildFinger(0.0095 * (i === 3 ? 0.86 : 1), [0.032 * d.scale, 0.02 * d.scale, 0.015 * d.scale]);
    f.root.position.set(d.x, 0.014 - Math.abs(d.x) * 0.06, -0.046 - d.scale * 0.006);
    f.root.rotation.y = d.x * -1.1; // fingers fan very slightly
    g.add(f.root);
    fingers.push({ joints: f.joints, phase: i * 1.7, mult: [0.96, 1, 0.97, 0.88][i] });
  }

  // Thumb: two segments, rooted at the palm side, opposing across the palm.
  const thumbRoot = new THREE.Group();
  thumbRoot.position.set(0.049, 0.014, 0.012);
  thumbRoot.rotation.set(0.12, -0.95, 0.35);
  const thumb = buildFinger(0.0115, [0.03, 0.024, 0.001]);
  thumb.joints[2].visible = false; // two real segments; the third is a stub
  thumbRoot.add(thumb.root);
  g.add(thumbRoot);

  // Wrist → forearm → rolled sleeve cuff, rising up-back out of frame.
  const wrist = new THREE.Mesh(new THREE.CapsuleGeometry(0.0235, 0.05, 6, 12), SKIN);
  wrist.rotation.x = Math.PI / 2 - 0.62;
  wrist.position.set(0, 0.03, 0.066);
  g.add(wrist);
  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.0265, 0.0295, 0.1, 14), SKIN);
  forearm.rotation.x = -0.62;
  forearm.position.set(0, 0.072, 0.118);
  g.add(forearm);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.037, 0.095, 14), SLEEVE);
  sleeve.rotation.x = -0.62;
  sleeve.position.set(0, 0.128, 0.158);
  g.add(sleeve);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.0345, 0.007, 10, 18), SLEEVE);
  cuff.rotation.x = Math.PI / 2 - 0.62;
  cuff.position.set(0, 0.098, 0.137);
  g.add(cuff);

  const CURL_PER_JOINT = [0.7, 0.95, 0.65]; // proximal / middle / distal knuckles
  const setCurl = (curl: number, sway: number): void => {
    for (const f of fingers) {
      const wiggle = Math.sin(sway + f.phase) * 0.045;
      for (let j = 0; j < f.joints.length; j++) {
        f.joints[j].rotation.x = Math.max(0, curl * f.mult * CURL_PER_JOINT[j] + (j === 0 ? wiggle : wiggle * 0.4));
      }
    }
    for (let j = 0; j < 2; j++) {
      thumb.joints[j].rotation.x = curl * 0.55 * CURL_PER_JOINT[j] + Math.sin(sway * 0.8) * 0.03;
    }
  };
  setCurl(0.12, 0);
  return { group: g, setCurl };
}

export class ThreeFeedingPresentation {
  readonly object = new THREE.Group();
  private tongs: THREE.Group;
  private tongProngs: THREE.Object3D[];
  private hand: THREE.Group;
  private handRig: HandRig;
  private handCurl = 0.5;
  private carried: THREE.Object3D[] = [];
  private flights: Flight[] = [];

  private method: FeedMethodKind = "quick";
  private kind: FeederKind = "cricket";
  private hooks: PresentationHooks | null = null;
  private phase: Phase = "idle";
  private t = 0;
  private at = { x: 0, z: 0 };
  private remaining = 0;
  private heldIds: number[] = [];
  private holdTimeout = 0;
  private camHold = 0;
  /** Player steering (tongs follow the pointer): target + smoothed position. */
  private steer = { x: 0, z: 0 };
  private tipPos = new THREE.Vector3();
  private grabRecoil = 0;
  /** Player-controlled EXTRA tip height (scroll): dangle high → the gecko jumps. */
  private holdLift = 0;
  /** Seconds the gecko has been uninterested (full) — ends the session early. */
  private fullT = 0;

  constructor() {
    const tg = buildTongs();
    this.tongs = tg.group;
    this.tongProngs = tg.prongs;
    this.handRig = buildHand();
    this.hand = this.handRig.group;
    this.tongs.visible = false;
    this.hand.visible = false;
    this.object.add(this.tongs, this.hand);
    this.object.renderOrder = 5;
  }

  active(): boolean {
    return this.phase !== "idle" || this.flights.length > 0 || this.camHold > 0;
  }

  /** Begin a presentation. `at` = serve point (dish centre / marker / gecko-front). */
  start(method: FeedMethodKind, kind: FeederKind, count: number, at: { x: number; z: number }, hooks: PresentationHooks): void {
    this.cancel(); // one at a time
    this.method = method;
    this.kind = kind;
    this.hooks = hooks;
    this.at = { ...at };
    this.remaining = count;
    this.t = 0;
    this.phase = "enter";
    this.camHold = 1.2;

    if (method === "quick" || method === "dish") {
      // A volley of tossed insects arcing in from above. Every QUICK landing
      // spot is validated CLEAR + reachable first (and the sim spawns exactly
      // there), so a toss never visually sinks into a rock.
      const gy = hooks.groundY(at.x, at.z);
      for (let i = 0; i < count; i++) {
        const a = (i / Math.max(1, count)) * Math.PI * 2 + 0.8;
        const rr = method === "dish" ? 0.03 + (i % 3) * 0.014 : 0.06 + (i % 4) * 0.045;
        let tx = at.x + Math.cos(a) * rr;
        let tz = at.z + Math.sin(a) * rr;
        if (method === "quick") {
          const spot = hooks.freeSpotNear(tx, tz);
          if (!spot) continue; // no clear ground there — skip rather than clip
          tx = spot.x;
          tz = spot.z;
        }
        const mesh = makeInsectVisual(kind);
        mesh.visible = false;
        this.object.add(mesh);
        const landY = method === "dish" && hooks.dishFloorY ? hooks.dishFloorY(tx, tz) : hooks.groundY(tx, tz);
        this.flights.push({
          mesh,
          from: new THREE.Vector3(at.x + Math.cos(a) * 0.1, gy + 0.55, at.z + Math.sin(a) * 0.1 - 0.06),
          to: new THREE.Vector3(tx, landY, tz),
          t: 0,
          dur: 0.55,
          delay: i * (method === "dish" ? 0.16 : 0.12),
          landed: false,
        });
      }
      this.phase = "hold"; // flights carry the whole show
    } else if (method === "tong") {
      this.tongs.visible = true;
      this.beginTongOffer();
    } else {
      // Hand: enter from the front-top, fingers gently CUPPED around the meal.
      this.hand.visible = true;
      this.handCurl = 0.5;
      this.handRig.setCurl(this.handCurl, 0);
      const gy = hooks.groundY(at.x, at.z);
      this.hand.position.set(at.x, gy + 0.5, at.z + 0.42);
      for (let i = 0; i < Math.min(count, 5); i++) {
        const c = makeInsectVisual(kind);
        c.scale.setScalar(1);
        c.position.set(-0.02 + (i % 3) * 0.02, 0.026, -0.018 + Math.floor(i / 3) * 0.026);
        this.hand.add(c);
        this.carried.push(c);
      }
    }
  }

  /** Point the gecko should approach for tong/hand feeding (in front of it). */
  static offerPoint(gecko: { x: number; z: number; heading: number }, dist = 0.22): { x: number; z: number } {
    return { x: gecko.x + Math.cos(gecko.heading) * dist, z: gecko.z + Math.sin(gecko.heading) * dist };
  }

  private beginTongOffer(): void {
    if (!this.hooks) return;
    const gy = this.hooks.groundY(this.at.x, this.at.z);
    this.steer = { x: this.at.x, z: this.at.z };
    this.tipPos.set(this.at.x, gy + 0.5, this.at.z + 0.3);
    this.tongs.position.copy(this.tipPos);
    this.phase = "enter";
    this.t = 0;
    this.holdTimeout = 30; // the player is in charge — plenty of time
    this.grabRecoil = 0;
    this.holdLift = 0; // each offer starts low; scroll to tease it upward
    // The insect rides the tong tips down.
    const c = makeInsectVisual(this.kind);
    c.position.set(0, -0.004, 0.012);
    this.tongs.add(c);
    this.carried.push(c);
  }

  /** The player steers the offer (tongs follow the pointer over the sand). */
  setHoldPoint(x: number, z: number): void {
    this.steer = { x, z };
  }

  /** Scroll: raise/lower the held offer. Held high enough, the gecko must JUMP
   *  for it. Clamped to a fair range (it can always be reached with a leap). */
  adjustHold(delta: number): void {
    this.holdLift = Math.max(0, Math.min(0.16, this.holdLift + delta));
  }

  /** Current extra lift (UI hint + jump gating). */
  get lift(): number {
    return this.holdLift;
  }

  /** How high the tips hover — low enough that a committed gecko can strike,
   *  high enough to read as "held", plus the player's scroll lift and a lively
   *  bit of hand sway. */
  private tongTipY(gy: number): number {
    return gy + 0.065 + this.holdLift + Math.sin(this.t * 2.1) * 0.006 + this.grabRecoil * 0.12;
  }

  update(dt: number): void {
    if (this.camHold > 0 && this.phase === "idle" && this.flights.length === 0) this.camHold -= dt;
    if (!this.hooks) return;
    this.t += dt;

    // ── Flights (quick toss / dish pour) ────────────────────────────────────
    if (this.flights.length > 0) {
      let allDone = true;
      for (const fl of this.flights) {
        if (fl.delay > 0) {
          fl.delay -= dt;
          allDone = false;
          continue;
        }
        fl.mesh.visible = true;
        fl.t = Math.min(1, fl.t + dt / fl.dur);
        const k = fl.t;
        const pos = fl.from.clone().lerp(fl.to, k);
        pos.y += Math.sin(k * Math.PI) * 0.1; // toss arc on top of the drop
        fl.mesh.position.copy(pos);
        fl.mesh.rotation.y += dt * 6;
        if (k >= 1 && !fl.landed) {
          fl.landed = true;
          this.hooks.serveOne(fl.to.x, fl.to.z);
          this.object.remove(fl.mesh);
        }
        if (!fl.landed) allDone = false;
      }
      if (allDone) {
        this.flights = [];
        if (this.method === "quick" || this.method === "dish") {
          this.phase = "idle";
          this.camHold = 0.9; // linger a beat, then the camera glides home
          this.hooks.onDone();
        }
      }
      return;
    }

    if (this.phase === "idle") return;

    // ── Tongs (player-held: they follow the pointer) ─────────────────────────
    if (this.method === "tong") {
      if (this.phase === "enter") {
        const gy = this.hooks.groundY(this.at.x, this.at.z);
        const k = Math.min(1, this.t / 1.0);
        const e = 1 - Math.pow(1 - k, 3);
        this.tongs.position.set(this.at.x, gy + 0.5 - e * (0.5 - 0.065), this.at.z + 0.3 - e * 0.3);
        // A touch of insect wiggle in the tips.
        if (this.carried[0]) this.carried[0].rotation.y = Math.sin(this.t * 9) * 0.4;
        if (k >= 1) {
          // Offer: the real (held) insect appears at the tips.
          const id = this.hooks.serveHeld(this.at.x, this.at.z);
          for (const c of this.carried) this.tongs.remove(c);
          this.carried = [];
          if (id == null) {
            this.exitProps();
          } else {
            this.heldIds = [id];
            this.phase = "hold";
            this.t = 0;
            this.tipPos.copy(this.tongs.position);
          }
        }
      } else if (this.phase === "hold") {
        // The tongs chase the player's pointer (smoothed like a real hand);
        // the held insect rides the tips, so the gecko chases the tongs.
        this.grabRecoil = Math.max(0, this.grabRecoil - dt * 3);
        const gy = this.hooks.groundY(this.steer.x, this.steer.z);
        const targetY = this.tongTipY(gy);
        const k = 1 - Math.exp(-13 * dt);
        this.tipPos.x += (this.steer.x - this.tipPos.x) * k;
        this.tipPos.z += (this.steer.z - this.tipPos.z) * k;
        this.tipPos.y += (targetY - this.tipPos.y) * k;
        this.tongs.position.copy(this.tipPos);
        for (let i = 0; i < this.tongProngs.length; i++) {
          this.tongProngs[i].rotation.y = (i === 0 ? -1 : 1) * (0.05 + Math.sin(this.t * 2.2) * 0.012);
        }
        const id = this.heldIds[0];
        if (id != null && this.hooks.feederAlive(id)) {
          // Keep the sim insect pinched in the tips wherever the player holds them.
          this.hooks.moveHeld(id, this.tipPos.x, this.tipPos.y - 0.006, this.tipPos.z);
        }
        if (id == null || !this.hooks.feederAlive(id)) {
          // Taken! A little upward recoil sells the grab.
          this.grabRecoil = 1;
          this.heldIds = [];
          this.remaining--;
          this.fullT = 0;
          this.exitTongThenMaybeReoffer();
        } else if (!this.hooks.geckoWants()) {
          // The gecko is full — no point dangling the rest of the portion.
          this.fullT += dt;
          if (this.fullT > 4) {
            this.hooks.releaseHeld(id);
            this.heldIds = [];
            this.remaining = 0;
            this.exitTongThenMaybeReoffer();
          }
        } else if (this.t > this.holdTimeout) {
          // The keeper's arm gets tired — set it down and let it roam.
          this.hooks.releaseHeld(id);
          this.heldIds = [];
          this.remaining--;
          this.exitTongThenMaybeReoffer();
        }
      } else if (this.phase === "exit") {
        const k = Math.min(1, this.t / 0.7);
        const e = k * k;
        this.tongs.position.set(this.tipPos.x, this.tipPos.y + e * 0.5, this.tipPos.z + e * 0.3);
        if (k >= 1) this.afterExit();
      }
      return;
    }

    // ── Hand ─────────────────────────────────────────────────────────────────
    if (this.method === "hand") {
      const gy = this.hooks.groundY(this.at.x, this.at.z);
      // Finger curl eases toward the phase's pose: cupped while carrying, open
      // to offer, closing gently as it withdraws — with a tiny idle sway.
      const targetCurl = this.phase === "enter" ? 0.5 : this.phase === "hold" ? 0.07 : 0.55;
      this.handCurl += (targetCurl - this.handCurl) * Math.min(1, 4.5 * dt);
      this.handRig.setCurl(this.handCurl, this.t * 1.7);

      if (this.phase === "enter") {
        const k = Math.min(1, this.t / 1.2);
        const e = 1 - Math.pow(1 - k, 3);
        this.hand.position.set(this.at.x, gy + 0.5 - e * 0.5, this.at.z + 0.42 - e * 0.42);
        // A natural approach: wrist rolls from carry-tilt to flat as it lands.
        this.hand.rotation.x = (1 - e) * -0.35;
        // Face the palm (fingers) toward the gecko.
        const g = this.hooks.gecko();
        this.hand.rotation.y = Math.atan2(g.x - this.at.x, g.z - this.at.z) + Math.PI;
        if (k >= 1) {
          // The meal is now really on offer: held insects on the palm.
          for (const c of this.carried) this.hand.remove(c);
          this.carried = [];
          this.heldIds = [];
          for (let i = 0; i < this.remaining; i++) {
            const a = (i / Math.max(1, this.remaining)) * Math.PI * 2;
            const id = this.hooks.serveHeld(this.at.x + Math.cos(a) * 0.024, this.at.z + Math.sin(a) * 0.024);
            if (id != null) this.heldIds.push(id);
          }
          this.phase = "hold";
          this.t = 0;
          this.holdTimeout = 25;
        }
      } else if (this.phase === "hold") {
        this.hand.rotation.x = 0;
        this.hand.position.y = gy + 0.002 + Math.sin(this.t * 1.6) * 0.0025; // steady keeper breathing
        this.heldIds = this.heldIds.filter((id) => this.hooks!.feederAlive(id));
        this.fullT = this.hooks.geckoWants() ? 0 : this.fullT + dt;
        if (this.heldIds.length === 0 || this.t > this.holdTimeout || this.fullT > 4) {
          for (const id of this.heldIds) this.hooks.releaseHeld(id); // uneaten → set free
          this.heldIds = [];
          this.exitProps();
        }
      } else if (this.phase === "exit") {
        const k = Math.min(1, this.t / 0.9);
        const e = k * k;
        this.hand.position.set(this.at.x, gy + 0.002 + e * 0.5, this.at.z + e * 0.42);
        this.hand.rotation.x = e * -0.3;
        if (k >= 1) this.afterExit();
      }
    }
  }

  private exitTongThenMaybeReoffer(): void {
    this.phase = "exit";
    this.t = 0;
  }

  private exitProps(): void {
    this.phase = "exit";
    this.t = 0;
  }

  private afterExit(): void {
    if (this.method === "tong" && this.remaining > 0 && this.hooks && this.hooks.geckoWants()) {
      // Next insect: re-aim at wherever the gecko is now.
      this.at = ThreeFeedingPresentation.offerPoint(this.hooks.gecko());
      this.beginTongOffer();
      return;
    }
    this.tongs.visible = false;
    this.hand.visible = false;
    this.phase = "idle";
    this.camHold = 0.8;
    this.hooks?.onDone();
  }

  /** Where the FOOD/action currently is (cinematic framing), or null. */
  focusPoint(): { x: number; z: number } | null {
    if (!this.active()) return null;
    if (this.method === "tong" && this.phase !== "idle") return { x: this.tipPos.x, z: this.tipPos.z };
    return { x: this.at.x, z: this.at.z };
  }

  /** The steered tong tips (ground-contact ring + steering feedback), or null. */
  tongTip(): { x: number; z: number } | null {
    return this.method === "tong" && this.phase === "hold" ? { x: this.tipPos.x, z: this.tipPos.z } : null;
  }

  /** The camera pose that frames this presentation, or null when inactive.
   *  TONG feeding returns NONE on purpose: the player is steering with the
   *  pointer, and a moving camera would keep changing what the pointer means —
   *  the view stays exactly where the player put it. (Cinematic mode has its
   *  own follow camera.) */
  cameraPose(): { pos: [number, number, number]; look: [number, number, number] } | null {
    if (!this.active() || !this.hooks) return null;
    if (this.method === "tong") return null;
    const gy = this.hooks.groundY(this.at.x, this.at.z);
    if (this.method === "quick") {
      return {
        pos: [this.at.x * 0.5, gy + 0.78, this.at.z + 1.5],
        look: [this.at.x * 0.75, gy + 0.04, this.at.z * 0.75],
      };
    }
    if (this.method === "dish") {
      return {
        pos: [this.at.x + 0.4, gy + 0.42, this.at.z + 0.62],
        look: [this.at.x, gy + 0.02, this.at.z],
      };
    }
    // Hand: low three-quarter shot framing gecko + the open palm.
    const g = this.hooks.gecko();
    const lx = (g.x + this.at.x) / 2;
    const lz = (g.z + this.at.z) / 2;
    return {
      pos: [lx - 0.52, gy + 0.36, lz + 0.88],
      look: [lx, gy + 0.07, lz],
    };
  }

  cancel(): void {
    for (const fl of this.flights) this.object.remove(fl.mesh);
    this.flights = [];
    for (const c of this.carried) c.parent?.remove(c);
    this.carried = [];
    if (this.hooks) for (const id of this.heldIds) this.hooks.releaseHeld(id);
    this.heldIds = [];
    this.tongs.visible = false;
    this.hand.visible = false;
    this.phase = "idle";
    this.camHold = 0;
  }

  dispose(): void {
    this.cancel();
  }
}

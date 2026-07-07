/**
 * FROG ANIMATION LAB — a DEV-ONLY animation bench (`?habitat=froglab`, alias
 * `?debugFrog=1`) for the colorful frog.
 *
 * One magnified frog on a studio stage + a side panel that makes the whole
 * animation story visible at a glance: every behavior state from the pure
 * map (src/data/creatures/frogAnimationMap) with a color-coded source badge —
 * real GLB Clip · Procedural Fallback · Missing (needs Fiverr) — play buttons,
 * prev/next through the playable set, loop + speed + reset-pose transport,
 * rig-support notes, the loud missing list, and a copy-report button. Nothing
 * is hidden: if a state can't animate on this rig, the Lab says so.
 *
 * Player-facing UI never links here (dev URL only, never persisted), and the
 * live paludarium controller (ThreeFrogHopper) is untouched.
 */
import * as THREE from "three";
import type { CameraConfig, HabitatScene } from "./ThreeHabitat";
import { disposeScene } from "./ThreeHabitat";
import { loadCreature, type CreatureModel } from "./creatures/ThreeCreatureLoader";
import { buildFrogProceduralClips, captureFrogRig, type FrogRigView } from "./creatures/FrogProceduralClips";
import { FrogClipPlayer } from "./creatures/FrogClipPlayer";
import {
  FROG_RIG_SUPPORT,
  frogAnimationReport,
  resolveFrogAnimations,
  type FrogBehaviorState,
  type FrogResolvedState,
} from "../../data/creatures/frogAnimationMap";
import { getCreature } from "../../data/creatures/creatureRegistry";

/** Display magnification: show the 6 cm frog at ~35 cm so motion reads. */
const DISPLAY_LEN = 0.35;

const GROUPS: { title: string; states: FrogBehaviorState[] }[] = [
  { title: "Idle & Awareness", states: ["idle_breathing", "idle_variation", "throat_pulse", "blink", "look_left", "look_right", "look_around"] },
  { title: "Poses & Rest", states: ["rest_sit", "sleep", "wake_up", "perch_idle"] },
  { title: "Locomotion", states: ["small_hop", "medium_hop", "big_jump", "landing", "turn_left", "turn_right", "slow_crawl", "climb_up", "climb_down"] },
  { title: "Hunting & Feeding", states: ["spot_prey", "tongue_catch", "bite", "chew_swallow", "missed_tongue"] },
  { title: "Water", states: ["water_float", "water_paddle", "water_struggle", "climb_out_water"] },
  { title: "Stress & Health", states: ["startled_jump", "hide_crouch", "stress_crouch", "weak_sick_idle", "collapsed_faint"] },
  { title: "Body Functions", states: ["poop"] },
];

const BADGE: Record<string, { label: string; css: string }> = {
  glb: { label: "GLB Clip", css: "background:rgba(120,220,130,0.16);color:#8ce25a;border:1px solid rgba(140,226,90,0.45)" },
  procedural: { label: "Procedural Fallback", css: "background:rgba(96,200,214,0.14);color:#7fd8e8;border:1px solid rgba(110,206,224,0.4)" },
  missing: { label: "Missing / Needs Animator", css: "background:rgba(240,182,75,0.14);color:#f0b64b;border:1px solid rgba(240,182,75,0.45)" },
};

function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 96;
  const cx = canvas.getContext("2d")!;
  cx.font = "600 40px system-ui, sans-serif";
  cx.textAlign = "center";
  cx.textBaseline = "middle";
  cx.shadowColor = "rgba(0,0,0,0.9)";
  cx.shadowBlur = 10;
  cx.fillStyle = "#d9f2e4";
  cx.fillText(text, 320, 48);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(0.72, 0.108, 1);
  return sprite;
}

export class ThreeFrogLabScene implements HabitatScene {
  readonly scene = new THREE.Scene();
  readonly camera: CameraConfig = { fov: 36, pos: [0.42, 0.52, 1.5], look: [0, 0.16, 0] };
  private model: CreatureModel | null = null;
  private rig: FrogRigView | null = null;
  private player: FrogClipPlayer | null = null;
  private resolved: FrogResolvedState[] = [];
  private playable: FrogResolvedState[] = [];
  private currentState: FrogBehaviorState | null = null;
  private skipped: { name: string; reason: string }[] = [];
  private panel: HTMLElement | null = null;
  private statusTimer: number | null = null;
  private disposed = false;
  // Panel refs (filled in buildPanel).
  private nowName: HTMLElement | null = null;
  private nowBadge: HTMLElement | null = null;
  private nowState: HTMLElement | null = null;
  private loopBox: HTMLInputElement | null = null;
  private speedOut: HTMLElement | null = null;

  constructor() {
    this.scene.background = new THREE.Color(0x0e1f1a);
    this.scene.fog = new THREE.Fog(0x0e1f1a, 3.2, 6.5);
    this.buildStage();
  }

  private buildStage(): void {
    const lights = new THREE.Group();
    lights.add(new THREE.AmbientLight(0xd8ecdf, 0.75));
    lights.add(new THREE.HemisphereLight(0xeafff2, 0x1e332b, 0.95));
    const key = new THREE.DirectionalLight(0xfff2d8, 1.6);
    key.position.set(1.2, 2.2, 1.6);
    lights.add(key);
    const rim = new THREE.DirectionalLight(0x8fe8b0, 0.55);
    rim.position.set(-1.6, 1.2, -1.4);
    lights.add(rim);
    this.scene.add(lights);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 56),
      new THREE.MeshStandardMaterial({ color: 0x182b23, roughness: 0.96 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    this.scene.add(floor);

    // Hop-distance rings: small-hop (~1.4 body lengths) + medium (~2.6).
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x3d6b52, transparent: true, opacity: 0.5 });
    for (const r of [1.4 * DISPLAY_LEN, 2.6 * DISPLAY_LEN]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.004, r + 0.004, 72), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.001;
      this.scene.add(ring);
    }

    // Soft contact blob under the frog.
    const shCanvas = document.createElement("canvas");
    shCanvas.width = shCanvas.height = 128;
    const sc = shCanvas.getContext("2d")!;
    const grad = sc.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, "rgba(0,0,0,0.42)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    sc.fillStyle = grad;
    sc.fillRect(0, 0, 128, 128);
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(DISPLAY_LEN * 1.6, DISPLAY_LEN * 1.2),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shCanvas), transparent: true, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.0015;
    this.scene.add(blob);

    const label = makeLabel("Colorful Frog · Agalychnis callidryas");
    label.position.set(0, 0.56, -0.2);
    this.scene.add(label);
  }

  async load(): Promise<void> {
    const species = getCreature("colorful_frog");
    this.model = await loadCreature("colorful_frog");
    if (!this.model) {
      this.buildPanel(); // panel reports the load failure honestly
      return;
    }
    const idleName = species.asset.rig?.clips.idle;
    const idle = idleName ? this.model.clips.find((c) => c.name === idleName) : this.model.clips[0];
    this.rig = captureFrogRig(this.model.root, idle, species.asset.bodyLength);

    const k = DISPLAY_LEN / species.asset.bodyLength;
    this.model.root.scale.setScalar(k);
    this.model.root.position.set(0, 0, 0);
    // Between three-quarter and profile, facing the OPEN side of the frame:
    // hop arcs cross the stage in silhouette instead of flying at the camera
    // (or under the panel).
    this.model.root.rotation.y = -Math.PI * 0.3;
    this.scene.add(this.model.root);

    let procedural: THREE.AnimationClip[] = [];
    if (this.rig) {
      const build = buildFrogProceduralClips(this.rig);
      procedural = build.clips;
      this.skipped = build.skipped;
      this.player = new FrogClipPlayer(this.rig, this.model.clips, procedural);
    }
    this.resolved = resolveFrogAnimations(
      this.model.clips.map((c) => c.name),
      procedural.map((c) => c.name),
    );
    this.playable = this.resolved.filter((r) => r.source !== "missing");

    this.buildPanel();
    this.playState("idle_breathing");

    try {
      Object.assign(globalThis, {
        __frogLab: {
          ready: (): boolean => !!this.player,
          states: (): { state: string; source: string; clip: string | null }[] =>
            this.resolved.map((r) => ({ state: r.state, source: r.source, clip: r.clip })),
          missing: (): string[] => this.resolved.filter((r) => r.source === "missing").map((r) => r.state),
          clips: (): string[] => this.player?.list().map((c) => c.name) ?? [],
          play: (state: string): boolean => this.playState(state as FrogBehaviorState),
          pose: (state: string, t01: number): boolean => {
            const r = this.resolved.find((x) => x.state === state);
            if (!r?.clip || !this.player) return false;
            const ok = this.player.seek(r.clip, t01);
            if (ok) {
              this.currentState = r.state;
              this.refreshNow();
              this.refreshRows();
            }
            return ok;
          },
          current: (): Record<string, unknown> => ({ state: this.currentState, ...this.player?.status() }),
          next: (): void => this.step(1),
          prev: (): void => this.step(-1),
          reset: (): void => this.doReset(),
          setSpeed: (v: number): void => this.player?.setSpeed(v),
          setLoop: (b: boolean | null): void => this.player?.setLoopOverride(b),
          report: (): string => this.reportText(),
          rootBoneWorld: (): [number, number, number] | null => {
            const b = this.rig?.bones.get(this.rig.rootBone);
            if (!b) return null;
            const v = b.node.getWorldPosition(new THREE.Vector3());
            return [v.x, v.y, v.z];
          },
        },
      });
    } catch {
      /* non-browser */
    }
  }

  private reportText(): string {
    return frogAnimationReport(
      this.model?.clips.map((c) => c.name) ?? [],
      this.player
        ?.list()
        .filter((c) => c.source === "procedural")
        .map((c) => c.name) ?? [],
    );
  }

  private playState(state: FrogBehaviorState): boolean {
    const r = this.resolved.find((x) => x.state === state);
    if (!r || !r.clip || !this.player) return false;
    const ok = this.player.play(r.clip);
    if (ok) {
      this.currentState = state;
      this.refreshNow();
      this.refreshRows();
    }
    return ok;
  }

  private step(dir: 1 | -1): void {
    if (!this.playable.length) return;
    const idx = this.playable.findIndex((r) => r.state === this.currentState);
    const next = this.playable[(idx + dir + this.playable.length) % this.playable.length];
    this.playState(next.state);
  }

  private doReset(): void {
    this.player?.resetPose();
    this.currentState = null;
    this.refreshNow();
    this.refreshRows();
  }

  // ── DOM panel (dev tool — fully owned + removed by this scene). All text
  //    below renders compile-time constants from the pure map (no injection
  //    surface). ────────────────────────────────────────────────────────────
  private buildPanel(): void {
    if (this.disposed) return;
    const p = document.createElement("div");
    p.id = "frog-lab-panel";
    p.style.cssText =
      "position:fixed;top:12px;right:12px;width:344px;max-height:calc(100vh - 24px);overflow:auto;z-index:60;" +
      "background:rgba(9,20,16,0.94);border:1px solid rgba(140,226,150,0.22);border-radius:14px;padding:13px 14px;" +
      "font:12px/1.45 system-ui,sans-serif;color:#dcefe4;backdrop-filter:blur(8px)";
    const h = document.createElement("div");
    const hb = document.createElement("b");
    hb.style.fontSize = "14.5px";
    hb.textContent = "🐸 Frog Animation Lab";
    const hs = document.createElement("span");
    hs.style.opacity = "0.55";
    hs.textContent = " dev · ?habitat=froglab";
    h.append(hb, hs);
    h.style.marginBottom = "9px";
    p.appendChild(h);

    if (!this.player) {
      const err = document.createElement("div");
      err.style.cssText = "padding:10px;border:1px solid rgba(240,120,90,0.5);border-radius:10px;color:#f0a08a";
      err.textContent = this.model
        ? "The frog loaded but its core bones were not found — procedural clips unavailable. Check the GLB export."
        : "colorful_frog.glb failed to load — no preview available. Check the console + asset path.";
      p.appendChild(err);
      document.body.appendChild(p);
      this.panel = p;
      return;
    }

    // — Transport card —
    const now = document.createElement("div");
    now.style.cssText =
      "padding:9px 10px;border:1px solid rgba(140,226,150,0.25);border-radius:11px;background:rgba(120,220,160,0.06);margin-bottom:9px";
    this.nowState = document.createElement("div");
    this.nowState.style.cssText = "font-weight:700;font-size:13.5px;color:#eafbe9";
    this.nowName = document.createElement("div");
    this.nowName.style.cssText = "opacity:0.72;margin-top:1px;font-size:11px";
    this.nowBadge = document.createElement("span");
    this.nowBadge.style.cssText = "display:inline-block;margin-top:5px;padding:2px 8px;border-radius:999px;font-weight:700;font-size:10.5px";
    now.append(this.nowState, this.nowName, this.nowBadge);

    const btn = (label: string, onClick: () => void, title = ""): HTMLButtonElement => {
      const b = document.createElement("button");
      b.textContent = label;
      b.title = title;
      b.style.cssText =
        "background:rgba(120,220,160,0.12);color:#d6f5df;border:1px solid rgba(140,226,150,0.35);border-radius:8px;" +
        "padding:5px 10px;cursor:pointer;font:600 11.5px system-ui";
      b.onclick = onClick;
      return b;
    };
    const row1 = document.createElement("div");
    row1.style.cssText = "display:flex;gap:6px;margin-top:8px;flex-wrap:wrap";
    row1.append(
      btn("⏮ Prev", () => this.step(-1)),
      btn("▶ Replay", () => {
        if (this.currentState) this.playState(this.currentState);
      }),
      btn("Next ⏭", () => this.step(1)),
      btn("Reset pose", () => this.doReset(), "Stop everything and snap to the crouch base pose"),
    );
    now.appendChild(row1);

    const row2 = document.createElement("div");
    row2.style.cssText = "display:flex;gap:10px;align-items:center;margin-top:8px";
    const loopWrap = document.createElement("label");
    loopWrap.style.cssText = "display:inline-flex;gap:5px;align-items:center;cursor:pointer";
    this.loopBox = document.createElement("input");
    this.loopBox.type = "checkbox";
    this.loopBox.checked = true;
    this.loopBox.onchange = (): void => this.player?.setLoopOverride(this.loopBox!.checked);
    loopWrap.append(this.loopBox, document.createTextNode("Loop"));
    const speed = document.createElement("input");
    speed.type = "range";
    speed.min = "0.25";
    speed.max = "2";
    speed.step = "0.05";
    speed.value = "1";
    speed.style.cssText = "flex:1";
    this.speedOut = document.createElement("span");
    this.speedOut.textContent = "1.00×";
    this.speedOut.style.cssText = "min-width:44px;text-align:right;opacity:0.85;font-variant-numeric:tabular-nums";
    speed.oninput = (): void => {
      const v = Number(speed.value);
      this.player?.setSpeed(v);
      this.speedOut!.textContent = `${v.toFixed(2)}×`;
    };
    row2.append(loopWrap, speed, this.speedOut);
    now.appendChild(row2);
    p.appendChild(now);

    // — Shipped clips summary —
    const shipped = document.createElement("div");
    shipped.style.cssText = "opacity:0.75;margin:0 2px 8px";
    const glbNames = this.model!.clips.map((c) => `"${c.name}" (${c.duration.toFixed(1)}s)`).join(", ");
    const procCount = this.player.list().filter((c) => c.source === "procedural").length;
    shipped.textContent = `GLB clips shipped: ${glbNames || "none"} · procedural built: ${procCount}`;
    p.appendChild(shipped);
    if (this.skipped.length) {
      const sk = document.createElement("div");
      sk.style.cssText = "color:#f0b64b;margin:0 2px 8px";
      sk.textContent = `Skipped: ${this.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}`;
      p.appendChild(sk);
    }

    // — Behavior-state list, grouped —
    for (const group of GROUPS) {
      const cap = document.createElement("div");
      cap.textContent = group.title;
      cap.style.cssText = "margin:10px 2px 4px;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;font-size:10px;color:#9fd6b4";
      p.appendChild(cap);
      for (const state of group.states) {
        const r = this.resolved.find((x) => x.state === state);
        if (!r) continue;
        const row = document.createElement("div");
        row.dataset.frogState = state;
        row.style.cssText =
          "display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:8px;border:1px solid transparent";
        const name = document.createElement("span");
        name.textContent = state;
        name.title = r.mapping.note;
        name.style.cssText = "flex:1;font-weight:600;color:#e6f6ec";
        const badge = document.createElement("span");
        const b = BADGE[r.source];
        badge.textContent = b.label;
        badge.title = r.mapping.note;
        badge.style.cssText = `padding:1.5px 7px;border-radius:999px;font-weight:700;font-size:9.5px;white-space:nowrap;${b.css}`;
        row.append(name, badge);
        if (r.source === "missing") {
          const miss = document.createElement("span");
          miss.textContent = r.mapping.requiredForRelease ? "Fiverr ★" : "Fiverr";
          miss.title = `Missing — needs Fiverr animation. ${r.mapping.note}`;
          miss.style.cssText = "opacity:0.8;color:#f0b64b;font-size:10px;white-space:nowrap";
          row.append(miss);
        } else {
          row.append(
            btn("▶", () => this.playState(state), `Play (${r.source === "glb" ? "real GLB clip" : "procedural fallback"}: ${r.clip})`),
          );
        }
        p.appendChild(row);
      }
    }

    // — Missing list (loud) —
    const missing = this.resolved.filter((r) => r.source === "missing");
    const missBox = document.createElement("div");
    missBox.style.cssText =
      "margin-top:11px;padding:9px 10px;border:1px solid rgba(240,182,75,0.4);border-radius:10px;background:rgba(240,182,75,0.07)";
    const missTitle = document.createElement("b");
    missTitle.style.color = "#f0b64b";
    missTitle.textContent = `Missing — needs Fiverr animation (${missing.length})`;
    missBox.appendChild(missTitle);
    for (const r of missing) {
      const line = document.createElement("div");
      line.textContent = `• ${r.state}${r.mapping.requiredForRelease ? " [required]" : ""}`;
      if (r.mapping.requiredForRelease) line.style.fontWeight = "700";
      missBox.appendChild(line);
    }
    p.appendChild(missBox);

    // — Rig support notes —
    const det = document.createElement("details");
    det.style.cssText = "margin-top:9px";
    const sum = document.createElement("summary");
    sum.textContent = "Rig support notes";
    sum.style.cssText = "cursor:pointer;font-weight:700;color:#9fd6b4";
    det.appendChild(sum);
    const ul = document.createElement("ul");
    ul.style.cssText = "margin:6px 0 2px 16px;padding:0;opacity:0.85";
    for (const line of FROG_RIG_SUPPORT) {
      const li = document.createElement("li");
      li.textContent = line;
      li.style.marginBottom = "3px";
      ul.appendChild(li);
    }
    det.appendChild(ul);
    p.appendChild(det);

    // — Copy report —
    const copy = btn("📋 Copy animation report", () => {
      const text = this.reportText();
      const fallback = (): void => {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      };
      try {
        void navigator.clipboard.writeText(text).catch(fallback);
      } catch {
        fallback();
      }
      copy.textContent = "📋 Copied!";
      window.setTimeout(() => (copy.textContent = "📋 Copy animation report"), 1400);
    });
    copy.style.marginTop = "10px";
    copy.style.width = "100%";
    p.appendChild(copy);

    document.body.appendChild(p);
    this.panel = p;
    this.statusTimer = window.setInterval(() => this.refreshNow(), 300);
    this.refreshNow();
    this.refreshRows();
  }

  private refreshNow(): void {
    if (!this.player || !this.nowState || !this.nowName || !this.nowBadge) return;
    const st = this.player.status();
    const r = this.currentState ? this.resolved.find((x) => x.state === this.currentState) : null;
    this.nowState.textContent = this.currentState ?? "— (base crouch pose)";
    this.nowName.textContent = st.name
      ? `clip: ${st.name} · ${st.finished ? "finished (holding pose)" : st.playing ? "playing" : "stopped"} · ${st.loop}`
      : "no clip playing";
    if (r && r.source !== "missing") {
      const b = BADGE[r.source];
      this.nowBadge.textContent = b.label;
      this.nowBadge.style.cssText =
        `display:inline-block;margin-top:5px;padding:2px 8px;border-radius:999px;font-weight:700;font-size:10.5px;${b.css}`;
      this.nowBadge.style.display = "inline-block";
    } else {
      this.nowBadge.style.display = "none";
    }
    if (this.loopBox) this.loopBox.checked = st.loop === "repeat";
  }

  private refreshRows(): void {
    this.panel?.querySelectorAll<HTMLElement>("[data-frog-state]").forEach((row) => {
      const on = row.dataset.frogState === this.currentState;
      row.style.background = on ? "rgba(140,226,150,0.1)" : "transparent";
      row.style.borderColor = on ? "rgba(140,226,150,0.4)" : "transparent";
    });
  }

  update(dt: number): void {
    this.player?.update(dt);
  }

  dispose(): void {
    this.disposed = true;
    if (this.statusTimer !== null) window.clearInterval(this.statusTimer);
    this.panel?.remove();
    this.panel = null;
    this.player?.dispose();
    try {
      delete (globalThis as Record<string, unknown>).__frogLab;
    } catch {
      /* non-browser */
    }
    disposeScene(this.scene);
  }
}

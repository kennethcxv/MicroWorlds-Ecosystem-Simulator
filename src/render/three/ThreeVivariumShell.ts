/**
 * VIVARIUM SHELL — the gecko enclosure's physical body, built ENTIRELY from the
 * pure `EnclosureSpec` (the single source of truth — no sizes are invented here):
 *   - four glass panes in a dark frame: corner posts, slim top band, and an
 *     opaque BASE TRAY whose lip rises just past the substrate line (so the sand
 *     bed's cut side never shows, while sculpted dunes stay visible through the
 *     glass),
 *   - a mesh SCREEN TOP hint inside the band, with the basking lamp CLAMPED on
 *     top of it over the basking zone (no more free-floating hood) + a drooping
 *     power cable, a UVB tube under the back band, and two gauge discs,
 *   - a desert BACK PANEL inside the rear glass (kills the noisy see-through),
 *   - a sand-coloured BEDROCK floor at the deepest diggable height, plus an
 *     inner sand skirt, so dug holes read as sand — never as a hollow box,
 *   - a WOODEN STAND under the tank (the real cabinet GLB when it loads, a
 *     walnut plinth fallback otherwise) + a soft floor shadow, so the vivarium
 *     sits IN the eco-center room instead of floating.
 *
 * The fish tank (ThreeTankScene) and spider enclosure (ThreeEnclosure) are
 * untouched — this module is the lizard shell only.
 */
import * as THREE from "three";
import type { EnclosureSpec } from "../../habitats/EnclosureSpec";
import { makeGlassMaterial, makeRimMaterial } from "./ThreeMaterials";
import { loadStandModel } from "./ThreeAssetLoader";

export interface VivariumOptions {
  /** Substrate colour (bedrock floor + inner skirt tint). */
  substrateColor: number;
  /** XZ the basking lamp hood sits over (null ⇒ no lamp fixture). */
  lampAnchor: { x: number; z: number } | null;
  /** Draw the UVB tube under the back band. */
  uvb: boolean;
  /** Small analogue gauges (thermometer/hygrometer) on the back panel. */
  gauges: { x: number; y: number; z: number }[];
  /** Back-panel artwork: warm desert strata (default) or a deep jungle wall. */
  backPanel?: "desert" | "rainforest";
}

export interface VivariumShell {
  group: THREE.Group;
  dispose(): void;
}

/** Warm walnut for the fallback stand. */
const STAND_WOOD = 0x4a3322;
const STAND_WOOD_DARK = 0x33241a;

function box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

/** Vertical desert-rock gradient for the back panel (canvas — no art dependency). */
function makeBackPanelTexture(style: "desert" | "rainforest" = "desert"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  if (style === "rainforest") {
    // Deep jungle wall: shaded green gradient + layered leaf silhouettes +
    // moss speckle, with the canopy light pooling from the top.
    const g = ctx.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, "#0a1610");
    g.addColorStop(0.5, "#10241a");
    g.addColorStop(1, "#1a3423");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    // Overlapping broad-leaf silhouettes, darker in front, hinting depth.
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 256;
      const L = 26 + Math.random() * 46;
      const rot = Math.random() * Math.PI;
      const dark = Math.random() < 0.62;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = 0.1 + Math.random() * 0.14;
      ctx.fillStyle = dark ? "#07120b" : "#2c5436";
      ctx.beginPath();
      ctx.ellipse(0, 0, L, L * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      // Midrib.
      ctx.globalAlpha *= 0.7;
      ctx.strokeStyle = dark ? "#0e1f13" : "#3c6a44";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-L * 0.8, 0);
      ctx.lineTo(L * 0.8, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = `rgba(140, 200, 130, ${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 256, 1.4, 1.4);
    }
    // Cool canopy light pooling from above.
    const r = ctx.createRadialGradient(256, 12, 10, 256, 12, 280);
    r.addColorStop(0, "rgba(190, 235, 170, 0.14)");
    r.addColorStop(1, "rgba(190, 235, 170, 0)");
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, 512, 256);
  } else {
    const g = ctx.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, "#191009");
    g.addColorStop(0.45, "#241811");
    g.addColorStop(1, "#33261a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    // Faint horizontal strata + speckle so it reads as stone, not a flat card.
    for (let i = 0; i < 26; i++) {
      const y = Math.random() * 256;
      ctx.fillStyle = `rgba(${90 + Math.random() * 60}, ${64 + Math.random() * 40}, ${40 + Math.random() * 26}, ${0.05 + Math.random() * 0.06})`;
      ctx.fillRect(0, y, 512, 1.5 + Math.random() * 5);
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(200, 160, 110, ${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 256, 1.4, 1.4);
    }
    // Warm glow pooling toward the lamp corner.
    const r = ctx.createRadialGradient(140, 40, 10, 140, 40, 300);
    r.addColorStop(0, "rgba(255, 172, 92, 0.16)");
    r.addColorStop(1, "rgba(255, 172, 92, 0)");
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, 512, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial floor-contact shadow (transparent decal). */
function makeShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,0.38)");
  g.addColorStop(0.7, "rgba(0,0,0,0.16)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** The fallback stand: a walnut plinth cabinet (top slab + body + kick base). */
function buildFallbackStand(spec: EnclosureSpec): THREE.Group {
  const g = new THREE.Group();
  const d = spec.dims;
  const ov = spec.stand.overhang;
  const H = spec.stand.height;
  const topY = spec.frame.trayBottomY - 0.005; // meets the tray skirt
  const woodTop = new THREE.MeshStandardMaterial({ color: STAND_WOOD, roughness: 0.6, metalness: 0.05 });
  const woodBody = new THREE.MeshStandardMaterial({ color: STAND_WOOD_DARK, roughness: 0.75, metalness: 0.03 });

  const slab = box(d.width + ov * 2 + 0.04, 0.05, d.depth + ov * 2 + 0.04, woodTop);
  slab.position.y = topY - 0.025;
  g.add(slab);

  const bodyH = H - 0.12;
  const body = box(d.width + ov * 2 - 0.06, bodyH, d.depth + ov * 2 - 0.06, woodBody);
  body.position.y = topY - 0.05 - bodyH / 2;
  g.add(body);

  // Recessed door panels for a furniture read.
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.8 });
  for (const sx of [-0.26, 0.26]) {
    const p = box(d.width * 0.4, bodyH * 0.72, 0.02, panelMat);
    p.position.set(sx * d.width, topY - 0.05 - bodyH / 2, (d.depth + ov * 2 - 0.06) / 2 + 0.002);
    g.add(p);
  }

  const kick = box(d.width + ov * 2 - 0.14, 0.07, d.depth + ov * 2 - 0.14, woodBody);
  kick.position.y = topY - H + 0.035;
  g.add(kick);
  return g;
}

/**
 * Build the shell. Synchronous for everything except the stand GLB, which swaps
 * in over the fallback plinth when it arrives (same silhouette, no pop of empty
 * space). Returns the group + a disposer.
 */
export function buildVivariumShell(
  scene: THREE.Scene,
  spec: EnclosureSpec,
  opts: VivariumOptions,
): VivariumShell {
  const g = new THREE.Group();
  g.name = "vivarium-shell";
  const d = spec.dims;
  const { post, topBand, trayLip, trayBottomY, trayHeight } = spec.frame;
  const rim = makeRimMaterial();
  const glass = makeGlassMaterial();

  // ── Glass panes (outer walls) ────────────────────────────────────────────────
  const pane = (w: number, h: number) => new THREE.PlaneGeometry(w, h);
  const glassTop = d.height;
  const front = new THREE.Mesh(pane(d.width, glassTop), glass);
  front.position.set(0, glassTop / 2, d.depth / 2);
  const back = new THREE.Mesh(pane(d.width, glassTop), glass);
  back.position.set(0, glassTop / 2, -d.depth / 2);
  back.rotation.y = Math.PI;
  const left = new THREE.Mesh(pane(d.depth, glassTop), glass);
  left.position.set(-d.width / 2, glassTop / 2, 0);
  left.rotation.y = Math.PI / 2;
  const right = new THREE.Mesh(pane(d.depth, glassTop), glass);
  right.position.set(d.width / 2, glassTop / 2, 0);
  right.rotation.y = -Math.PI / 2;
  for (const m of [front, back, left, right]) {
    m.renderOrder = 10;
    g.add(m);
  }

  // ── Base tray (opaque skirt hiding the bed side + closing the underside) ────
  const trayMidY = (trayLip + trayBottomY) / 2;
  const fSkirt = box(d.width + post * 2, trayHeight, post, rim);
  fSkirt.position.set(0, trayMidY, d.depth / 2 + post / 2 - 0.001);
  const bSkirt = box(d.width + post * 2, trayHeight, post, rim);
  bSkirt.position.set(0, trayMidY, -d.depth / 2 - post / 2 + 0.001);
  const lSkirt = box(post, trayHeight, d.depth + post * 2, rim);
  lSkirt.position.set(-d.width / 2 - post / 2 + 0.001, trayMidY, 0);
  const rSkirt = box(post, trayHeight, d.depth + post * 2, rim);
  rSkirt.position.set(d.width / 2 + post / 2 - 0.001, trayMidY, 0);
  const trayFloor = box(d.width + post * 2, 0.02, d.depth + post * 2, rim);
  trayFloor.position.y = trayBottomY + 0.01;
  g.add(fSkirt, bSkirt, lSkirt, rSkirt, trayFloor);

  // ── Top band + corner posts ──────────────────────────────────────────────────
  const bandY = d.height + topBand / 2;
  const fBand = box(d.width + post * 2, topBand, post, rim);
  fBand.position.set(0, bandY, d.depth / 2 + post / 2 - 0.001);
  const bBand = box(d.width + post * 2, topBand, post, rim);
  bBand.position.set(0, bandY, -d.depth / 2 - post / 2 + 0.001);
  const lBand = box(post, topBand, d.depth + post * 2, rim);
  lBand.position.set(-d.width / 2 - post / 2 + 0.001, bandY, 0);
  const rBand = box(post, topBand, d.depth + post * 2, rim);
  rBand.position.set(d.width / 2 + post / 2 - 0.001, bandY, 0);
  g.add(fBand, bBand, lBand, rBand);

  const postH = d.height - trayLip;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = box(post, postH, post, rim);
      p.position.set((sx * d.width) / 2, trayLip + postH / 2, (sz * d.depth) / 2);
      g.add(p);
    }
  }

  // ── Screen top (subtle mesh hint + cross ribs, inside the band) ─────────────
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x10181a,
    roughness: 0.75,
    metalness: 0.25,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(d.width - post, d.depth - post), screenMat);
  screen.rotation.x = -Math.PI / 2;
  screen.position.y = d.height + topBand * 0.45;
  screen.renderOrder = 9;
  g.add(screen);
  for (let i = -1; i <= 1; i++) {
    const rib = box(0.018, 0.014, d.depth - post, rim);
    rib.position.set((i * (d.width - post)) / 4, d.height + topBand * 0.45, 0);
    g.add(rib);
  }

  // ── Back panel (desert strata / jungle wall inside the rear glass) ──────────
  const backTex = makeBackPanelTexture(opts.backPanel ?? "desert");
  const backPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(spec.interior.width - 0.01, d.height - 0.02),
    new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
  );
  backPanel.position.set(0, d.height / 2, spec.interior.minZ + 0.006);
  g.add(backPanel);

  // ── Bedrock floor + inner sand skirt (dug holes always read as sand) ────────
  // One shared material, tagged so an applied substrate can re-tint it live.
  const bedrockMat = new THREE.MeshStandardMaterial({ color: opts.substrateColor, roughness: 1, metalness: 0 });
  const bedrock = new THREE.Mesh(new THREE.PlaneGeometry(spec.interior.width, spec.interior.depth), bedrockMat);
  bedrock.rotation.x = -Math.PI / 2;
  bedrock.position.y = spec.bedrockY - 0.004;
  bedrock.userData.substrateBed = true;
  g.add(bedrock);
  const skirtH = spec.substrateTop + 0.012 - (spec.bedrockY - 0.01);
  const skirtY = (spec.substrateTop + 0.012 + spec.bedrockY - 0.01) / 2;
  const mkSkirt = (w: number, x: number, z: number, ry: number) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, skirtH), bedrockMat);
    s.position.set(x, skirtY, z);
    s.rotation.y = ry;
    g.add(s);
  };
  mkSkirt(spec.interior.width, 0, spec.interior.maxZ - 0.004, Math.PI); // front (faces inward)
  mkSkirt(spec.interior.width, 0, spec.interior.minZ + 0.004, 0);
  mkSkirt(spec.interior.depth, spec.interior.minX + 0.004, 0, Math.PI / 2);
  mkSkirt(spec.interior.depth, spec.interior.maxX - 0.004, 0, -Math.PI / 2);

  // ── Basking lamp: dome hood CLAMPED on the screen over the basking zone ─────
  if (opts.lampAnchor) {
    const { x, z } = opts.lampAnchor;
    const lampY = spec.lampMountY;
    const hoodMat = new THREE.MeshStandardMaterial({ color: 0x1b2126, roughness: 0.42, metalness: 0.55, side: THREE.DoubleSide });
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.15, 0.13, 20, 1, true), hoodMat);
    hood.position.set(x, lampY + 0.075, z);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 20), hoodMat);
    cap.position.set(x, lampY + 0.145, z);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 14, 10),
      new THREE.MeshStandardMaterial({ color: 0xffd9ae, emissive: 0xff9a4a, emissiveIntensity: 1.6, roughness: 0.35 }),
    );
    bulb.position.set(x, lampY + 0.035, z);
    const glow = new THREE.PointLight(0xffb26b, 1.4, 0.9, 2.0);
    glow.position.set(x, lampY + 0.02, z);
    g.add(hood, cap, bulb, glow);

    // Power cable drooping to the back band.
    const cableEnd = new THREE.Vector3(x * 0.6, d.height + topBand, -d.depth / 2);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(x, lampY + 0.16, z),
      new THREE.Vector3((x + cableEnd.x) / 2, lampY + 0.3, (z + cableEnd.z) / 2),
      cableEnd,
    );
    const cable = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 20, 0.007, 6),
      new THREE.MeshStandardMaterial({ color: 0x14181b, roughness: 0.7 }),
    );
    g.add(cable);
  }

  // ── UVB tube under the back band ─────────────────────────────────────────────
  if (opts.uvb) {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, spec.interior.width * 0.55, 10),
      new THREE.MeshStandardMaterial({ color: 0xe8f4ff, emissive: 0xbfe4ff, emissiveIntensity: 0.5, roughness: 0.4 }),
    );
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0, d.height - 0.045, spec.interior.minZ + 0.1);
    const mount = box(spec.interior.width * 0.58, 0.02, 0.05, rim);
    mount.position.set(0, d.height - 0.02, spec.interior.minZ + 0.1);
    g.add(tube, mount);
  }

  // ── Gauges (small analogue discs on the back panel) ─────────────────────────
  const gaugeFace = new THREE.MeshStandardMaterial({ color: 0xf1ebdd, roughness: 0.5 });
  const gaugeRing = new THREE.MeshStandardMaterial({ color: 0x22292e, roughness: 0.5, metalness: 0.3 });
  for (const at of opts.gauges) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.014, 18), gaugeRing);
    ring.rotation.x = Math.PI / 2;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.033, 18), gaugeFace);
    face.position.z = 0.008;
    const gauge = new THREE.Group();
    gauge.add(ring, face);
    gauge.position.set(at.x, at.y, Math.max(spec.interior.minZ + 0.03, at.z));
    g.add(gauge);
  }

  // ── Stand + floor shadow (the vivarium sits IN the room, not in mid-air) ────
  const standGroup = new THREE.Group();
  standGroup.name = "vivarium-stand";
  const fallback = buildFallbackStand(spec);
  standGroup.add(fallback);
  g.add(standGroup);

  const shadowTex = makeShadowTexture();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(d.width * 1.75, d.depth * 2.6),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = spec.frame.trayBottomY - spec.stand.height - 0.004;
  shadow.renderOrder = 1;
  g.add(shadow);

  // Swap the real cabinet GLB in when it arrives (keeps the plinth silhouette
  // meanwhile; on failure the plinth simply stays).
  void loadStandModel().then((cab) => {
    if (!cab) return;
    const want = d.width + spec.stand.overhang * 2;
    const s = want / Math.max(1e-3, cab.size.x);
    const o = cab.object;
    o.scale.setScalar(s);
    // Non-uniform fit: never taller than the spec stand, never deeper than the
    // tank footprint + a small lip.
    const hScale = Math.min(1, spec.stand.height / Math.max(1e-3, cab.size.y * s));
    const dScale = Math.min(1, (d.depth + spec.stand.overhang * 2 + 0.05) / Math.max(1e-3, cab.size.z * s));
    o.scale.y *= hScale;
    o.scale.z *= dScale;
    const h = cab.size.y * s * hScale;
    o.position.set(0, spec.frame.trayBottomY - 0.005 - h / 2, 0);
    standGroup.remove(fallback);
    disposeSubtree(fallback);
    standGroup.add(o);
  });

  scene.add(g);
  return {
    group: g,
    dispose: () => {
      scene.remove(g);
      disposeSubtree(g);
      backTex.dispose();
      shadowTex.dispose();
    },
  };
}

function disposeSubtree(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((m as unknown as { isMesh?: boolean }).isMesh) {
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) mat?.dispose();
    }
  });
}

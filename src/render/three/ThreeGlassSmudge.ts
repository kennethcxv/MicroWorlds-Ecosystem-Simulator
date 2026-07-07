/**
 * FRONT-GLASS SMUDGES — an interactive layer of nose smears, paw prints and
 * dusty streaks on the inside of the front pane, drawn into a small canvas
 * texture. Smudges build up slowly over time (plus wherever the gecko presses
 * along the front glass); the keeper wipes them off by DRAGGING the squeegee
 * across the pane (Cleaning Mode → Wipe Glass). Coverage feeds the honest
 * "Crystal clear / A little smudged" status pill.
 */
import * as THREE from "three";

export class ThreeGlassSmudge {
  readonly mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private cx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private coverageCached = 0;
  private coverageDirty = true;
  private width: number;
  private height: number;

  constructor(
    private worldW: number,
    private worldH: number,
    position: THREE.Vector3,
  ) {
    this.width = 256;
    this.height = Math.max(64, Math.round((256 * worldH) / worldW));
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    // willReadFrequently: coverage checks call getImageData regularly — this
    // keeps the canvas on a readback-friendly path (and kills the console hint).
    this.cx = this.canvas.getContext("2d", { willReadFrequently: true })!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(worldW, worldH),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0.85 }),
    );
    this.mesh.position.copy(position);
    this.mesh.renderOrder = 900;
  }

  /** Add one smudge: a soft streak / smear / little paw cluster. */
  addSmudge(u: number, v: number, kind: "streak" | "smear" | "paws" = "smear", rng: () => number = Math.random): void {
    const c = this.cx;
    const x = u * this.width;
    const y = (1 - v) * this.height;
    c.save();
    c.globalAlpha = 0.3 + rng() * 0.14;
    c.fillStyle = "#e6ece8";
    if (kind === "streak") {
      c.translate(x, y);
      c.rotate((rng() - 0.5) * 0.9);
      const len = 22 + rng() * 30;
      for (let i = 0; i < 3; i++) {
        c.globalAlpha *= 0.85;
        c.beginPath();
        c.ellipse(0, (i - 1) * 2.4, len / 2, 2.2, 0, 0, Math.PI * 2);
        c.fill();
      }
    } else if (kind === "paws") {
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.ellipse(x + (rng() - 0.5) * 16, y + (rng() - 0.5) * 12, 2.6, 3.4, rng() * 3, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      const r = 7 + rng() * 9;
      const g = c.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, "rgba(230,236,232,0.75)");
      g.addColorStop(1, "rgba(230,236,232,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    this.tex.needsUpdate = true;
    this.coverageDirty = true;
  }

  /** Wipe a circle clean at world-plane coordinates (relative to the pane
   *  centre). Returns true when anything was actually removed. */
  wipeAt(localX: number, localY: number, radiusWorld: number): boolean {
    const u = localX / this.worldW + 0.5;
    const v = localY / this.worldH + 0.5;
    if (u < -0.1 || u > 1.1 || v < -0.1 || v > 1.1) return false;
    const r = (radiusWorld / this.worldW) * this.width;
    const c = this.cx;
    c.save();
    c.globalCompositeOperation = "destination-out";
    const x = u * this.width;
    const y = (1 - v) * this.height;
    // A firm blade: fully clears its core, only the rim feathers — repeated
    // passes converge instead of leaving eternal residue.
    const g = c.createRadialGradient(x, y, r * 0.65, x, y, r);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0.35)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.restore();
    this.tex.needsUpdate = true;
    this.coverageDirty = true;
    return true;
  }

  /** Fraction 0..1 of the pane carrying visible smudge (sampled, cached). */
  coverage(): number {
    if (!this.coverageDirty) return this.coverageCached;
    this.coverageDirty = false;
    const step = 6;
    const data = this.cx.getImageData(0, 0, this.width, this.height).data;
    let hit = 0;
    let total = 0;
    for (let y = 0; y < this.height; y += step) {
      for (let x = 0; x < this.width; x += step) {
        total++;
        if (data[(y * this.width + x) * 4 + 3] > 26) hit++;
      }
    }
    this.coverageCached = total > 0 ? hit / total : 0;
    return this.coverageCached;
  }

  clearAll(): void {
    this.cx.clearRect(0, 0, this.width, this.height);
    this.tex.needsUpdate = true;
    this.coverageDirty = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex.dispose();
  }
}

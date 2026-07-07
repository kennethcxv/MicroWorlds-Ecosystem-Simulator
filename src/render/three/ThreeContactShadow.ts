/**
 * Cheap, reliable CONTACT (blob) shadows for the terrarium — a soft radial-
 * gradient sprite laid flat on the sand under the gecko + large decor. We don't
 * use real shadow-mapping (it would need renderer-wide changes across all three
 * habitats + shadow-camera tuning); a blob shadow grounds objects with zero acne
 * and negligible cost, which suits the cozy stylised look. The gecko's blob
 * follows it each frame and softens/grows as it climbs.
 */
import * as THREE from "three";

let sharedTex: THREE.Texture | null = null;

function shadowTexture(): THREE.Texture {
  if (sharedTex) return sharedTex;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.55, "rgba(0,0,0,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  sharedTex = new THREE.CanvasTexture(canvas);
  return sharedTex;
}

export class ContactShadow {
  readonly mesh: THREE.Mesh;
  private baseR: number;
  private groundY: number;

  constructor(radius: number, groundY: number, opacity = 0.5) {
    this.baseR = radius;
    this.groundY = groundY;
    const mat = new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = groundY + 0.004;
    this.mesh.renderOrder = 1;
  }

  /** Move the blob under an object; `lift` (climb height) softens + spreads it. */
  follow(x: number, z: number, lift = 0): void {
    this.followOn(x, z, this.groundY, lift);
  }

  /** Terrain-aware follow: the blob sits on the SCULPTED sand at `surfaceY`
   *  (world), while `lift` = height of the animal ABOVE that sand (prop climbs)
   *  still softens/spreads it. */
  followOn(x: number, z: number, surfaceY: number, lift = 0): void {
    this.mesh.position.set(x, surfaceY + 0.004, z);
    const spread = 1 + lift * 2.2;
    this.mesh.scale.set(spread, spread, 1);
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.12, 0.5 - lift * 1.6);
  }

  setStatic(x: number, z: number, radius = this.baseR): void {
    this.mesh.position.set(x, this.groundY + 0.004, z);
    const s = radius / this.baseR;
    this.mesh.scale.set(s, s, 1);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/**
 * DROPPINGS — tiny meshes synced from `state.droppings` (LizardDigestion).
 * True to the animal: a small dark pellet with the WHITE URATE CAP leopard
 * geckos produce instead of liquid urine. They sit on the sand at the gecko's
 * chosen bathroom corner until the player cleans them up.
 */
import * as THREE from "three";
import type { Vec3 } from "../../habitats/HabitatTypes";

interface DroppingEntry {
  id: number;
  position: Vec3;
  age: number;
}

export class ThreeDroppings {
  readonly object = new THREE.Group();
  private meshes = new Map<number, THREE.Group>();

  constructor() {
    this.object.name = "droppings";
  }

  private makeOne(): THREE.Group {
    const g = new THREE.Group();
    const pellet = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x3d2b1c, roughness: 0.95 }),
    );
    pellet.scale.set(0.85, 0.55, 1.5);
    pellet.position.y = 0.006;
    g.add(pellet);
    const pellet2 = pellet.clone();
    pellet2.scale.set(0.7, 0.5, 1.0);
    pellet2.position.set(0.006, 0.005, -0.017);
    g.add(pellet2);
    // The white urate cap (solid urine — the desert-animal signature).
    const urate = new THREE.Mesh(
      new THREE.SphereGeometry(0.007, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.85 }),
    );
    urate.scale.set(1, 0.7, 1.1);
    urate.position.set(-0.004, 0.005, 0.02);
    g.add(urate);
    return g;
  }

  /** Sync meshes ← state list (adds new, removes cleaned). */
  sync(list: DroppingEntry[] | undefined): void {
    const live = new Set<number>();
    for (const d of list ?? []) {
      live.add(d.id);
      let m = this.meshes.get(d.id);
      if (!m) {
        m = this.makeOne();
        m.rotation.y = (d.id * 2.399963) % (Math.PI * 2); // varied, deterministic
        this.meshes.set(d.id, m);
        this.object.add(m);
      }
      m.position.set(d.position[0], d.position[1], d.position[2]);
    }
    for (const [id, m] of this.meshes) {
      if (!live.has(id)) {
        this.object.remove(m);
        m.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const mat = mesh.material as THREE.Material | undefined;
          if (mat) mat.dispose();
        });
        this.meshes.delete(id);
      }
    }
  }
}

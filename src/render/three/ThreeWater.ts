/**
 * Water for the experimental 3D tank: a tinted volume box, an animated surface
 * sheet (gentle ripple + shimmer), and a caustic pattern projected onto the
 * substrate. All driven by one shared time value so the motion stays coherent.
 */
import * as THREE from "three";
import { TANK } from "./ThreeBounds";
import {
  makeWaterVolumeMaterial,
  makeWaterSurfaceMaterial,
} from "./ThreeMaterials";

export class Water {
  readonly group = new THREE.Group();
  private surface: THREE.Mesh;
  private basePos: Float32Array;
  private t = 0;
  private causticUniforms: { value: number }[] = [];

  constructor() {
    const innerW = TANK.width - TANK.glass * 2;
    const innerD = TANK.depth - TANK.glass * 2;
    const waterH = TANK.waterTop - TANK.substrate;

    // Volume: a back-side box so we look "into" the water.
    const vol = new THREE.Mesh(
      new THREE.BoxGeometry(innerW, waterH, innerD),
      makeWaterVolumeMaterial(),
    );
    vol.position.set(0, TANK.substrate + waterH / 2, 0);
    vol.renderOrder = 1;
    this.group.add(vol);

    // Surface sheet with enough segments to ripple.
    const geo = new THREE.PlaneGeometry(innerW, innerD, 24, 24);
    geo.rotateX(-Math.PI / 2);
    this.surface = new THREE.Mesh(geo, makeWaterSurfaceMaterial());
    this.surface.position.set(0, TANK.waterTop, 0);
    this.surface.renderOrder = 2;
    this.group.add(this.surface);

    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    this.basePos = new Float32Array(pos.array.length);
    this.basePos.set(pos.array as Float32Array);
  }

  /** Inject an animated caustic pattern into a substrate/decor material. */
  hookCaustics(mat: THREE.Material): void {
    const u = { value: 0 };
    this.causticUniforms.push(u);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCausticT = u;
      shader.vertexShader =
        "varying vec3 vWorld;\n" +
        shader.vertexShader.replace(
          "#include <worldpos_vertex>",
          "#include <worldpos_vertex>\n  vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
      shader.fragmentShader =
        "uniform float uCausticT;\nvarying vec3 vWorld;\n" +
        shader.fragmentShader.replace(
          "#include <dithering_fragment>",
          `#include <dithering_fragment>
           vec2 cp = vWorld.xz * 3.4;
           float c = sin(cp.x + uCausticT) * sin(cp.y + uCausticT * 1.3)
                   + sin(cp.x * 1.7 - uCausticT * 0.8) * sin(cp.y * 1.4 + uCausticT);
           c = smoothstep(0.55, 1.0, c * 0.5 + 0.5);
           gl_FragColor.rgb += vec3(0.18, 0.32, 0.34) * c;
           #include <dithering_fragment>`,
        );
    };
    mat.customProgramCacheKey = () => "caustic-floor";
    mat.needsUpdate = true;
  }

  update(dt: number): void {
    this.t += dt;
    for (const u of this.causticUniforms) u.value = this.t * 1.1;

    // Ripple the surface vertices around their rest positions.
    const geo = this.surface.geometry as THREE.PlaneGeometry;
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = this.basePos[i];
      const z = this.basePos[i + 2];
      arr[i + 1] =
        this.basePos[i + 1] +
        Math.sin(x * 5.0 + this.t * 1.6) * 0.006 +
        Math.cos(z * 4.0 + this.t * 1.2) * 0.006;
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
}

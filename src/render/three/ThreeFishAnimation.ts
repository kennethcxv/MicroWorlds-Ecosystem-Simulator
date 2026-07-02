/**
 * Procedural body-wave animation for the experimental 3D tank.
 *
 * The supplied fish models are AI-generated (Tripo): a single fused shell split
 * only into colour chunks, with NO armature, NO shape keys, NO animation. So we
 * cannot drive bones or separate tail/fin objects. Instead we deform the whole
 * fish in the vertex shader: a head→tail travelling sine wave (lateral, local X)
 * whose amplitude ramps from ~0 at the head to max at the tail, giving a real
 * swimming swish + body undulation on a fused mesh. A separate steady "turn"
 * term curves the body into turns. Frequency/amplitude are driven by the
 * controller from the fish's speed + behaviour state.
 *
 * This is the honest best-case for fused/unrigged fish. Per-fin flutter would
 * require rigged or part-separated source art (see the spike report).
 */
import * as THREE from "three";

const TAU = Math.PI * 2;

export interface FishWave {
  /** Advance the wave; call once per frame before render. */
  update(dt: number): void;
  /** ampFrac = lateral tail sweep as a fraction of body length; freqHz = tail
   *  beats/sec; turnFrac = signed body curl into a turn (-0.5..0.5). */
  setMotion(ampFrac: number, freqHz: number, turnFrac: number): void;
}

interface WaveUniforms {
  uPhase: { value: number };
  uAmp: { value: number };
  uWavelength: { value: number };
  uTurn: { value: number };
  uHeadZ: { value: number };
  uInvLen: { value: number };
}

/**
 * Attach the swimming wave to every mesh material under `root`. The whole fish
 * shares one uniform set, so all colour-chunk meshes deform as one body.
 * `headPlusZ` = true when the model's head points toward +Z in its local frame.
 */
export function applyFishWave(root: THREE.Object3D, headPlusZ: boolean): FishWave {
  let zmin = Infinity;
  let zmax = -Infinity;
  let meshCount = 0;
  const materials: THREE.Material[] = [];

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    meshCount++;
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    zmin = Math.min(zmin, bb.min.z);
    zmax = Math.max(zmax, bb.max.z);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) materials.push(m);
  });

  const len = Math.max(1e-3, zmax - zmin);
  const headZ = headPlusZ ? zmax : zmin;
  const invLenSigned = headPlusZ ? -1 / len : 1 / len;

  const u: WaveUniforms = {
    uPhase: { value: 0 },
    uAmp: { value: 0 },
    uWavelength: { value: 4.6 },
    uTurn: { value: 0 },
    uHeadZ: { value: headZ },
    uInvLen: { value: invLenSigned },
  };

  for (const mat of materials) hookMaterial(mat, u);

  if (import.meta.env.DEV) {
    // Attachment guarantee: the fish is ONE body in ONE frame; the deform is a
    // bounded time-sine in local space (head anchored, hp=0), so no region can
    // drift away and nothing accumulates over time.
    console.info(
      `[3D fish] unified body: ${meshCount} mesh(es), len=${len.toFixed(3)}, ` +
        `head=${headPlusZ ? "+Z" : "-Z"}; deform = bounded local sine (no drift).`,
    );
  }

  // Safety caps so amplitude can never grow large enough to look detached.
  const MAX_AMP = 0.42 * len;
  const MAX_TURN = 0.6 * len;

  let curFreq = 1.5;
  return {
    update(dt: number): void {
      u.uPhase.value += dt * curFreq * TAU;
    },
    setMotion(ampFrac: number, freqHz: number, turnFrac: number): void {
      u.uAmp.value = THREE.MathUtils.clamp(ampFrac * len, 0, MAX_AMP);
      curFreq = freqHz;
      u.uTurn.value = THREE.MathUtils.clamp(turnFrac * len, -MAX_TURN, MAX_TURN);
    },
  };
}

function hookMaterial(mat: THREE.Material, u: WaveUniforms): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPhase = u.uPhase;
    shader.uniforms.uAmp = u.uAmp;
    shader.uniforms.uWavelength = u.uWavelength;
    shader.uniforms.uTurn = u.uTurn;
    shader.uniforms.uHeadZ = u.uHeadZ;
    shader.uniforms.uInvLen = u.uInvLen;

    shader.vertexShader =
      `uniform float uPhase;
       uniform float uAmp;
       uniform float uWavelength;
       uniform float uTurn;
       uniform float uHeadZ;
       uniform float uInvLen;
      ` +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float hp = clamp((position.z - uHeadZ) * uInvLen, 0.0, 1.0);
         float phase = hp * uWavelength - uPhase;
         transformed.x += (sin(phase) * uAmp + uTurn * hp) * hp;`,
      );
  };
  // Keep fish programs in their own cache namespace (per base-colour texture) so
  // the injected shader never collides with un-hooked decor materials.
  const map = (mat as THREE.MeshStandardMaterial).map;
  mat.customProgramCacheKey = () => "fishwave|" + (map ? map.uuid : "none");
  mat.needsUpdate = true;
}

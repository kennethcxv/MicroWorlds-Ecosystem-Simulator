/**
 * ANATOMY-FROM-GEOMETRY — classify a part-separated creature GLB's mesh nodes
 * into functional roles (body / head / tail / fins / legs / antennae / shell /
 * eyestalks) purely from their measured bounding boxes + triangle counts.
 *
 * Tripo part-separated exports name nodes `tripo_part_N` with no semantics, so
 * the procedural part animator needs a spatial read of "which part is the
 * tail?". This classifier answers that for the COMMON body plans (fish,
 * crawlers, snails); species with unusual splits fix the stragglers with 2-3
 * line `partOverrides` in the creature registry — the classifier stays the
 * scalable default for future animals.
 *
 * Pure math — no Three.js, no DOM. Unit-tested against the REAL measured part
 * bounds of all 10 first-batch creatures (tests/fixtures/creatureParts.ts).
 */

export type PartRole =
  | "body"
  | "head"
  | "tail"
  | "tailFan"
  | "finTop"
  | "finBottom"
  | "finSideL"
  | "finSideR"
  | "legL"
  | "legR"
  | "legs"
  | "antennaL"
  | "antennaR"
  | "eyestalk"
  | "shell"
  | "foot"
  | "static";

export type ForwardAxis = "+z" | "-z" | "+x" | "-x";

export interface ClassifiablePart {
  name: string;
  /** World-space AABB centre of the part (model units). */
  center: [number, number, number];
  /** World-space AABB size of the part. */
  size: [number, number, number];
  tris: number;
}

export interface ClassifyOptions {
  /** Snail-style: the two largest parts become shell (upper) + foot (lower),
   *  and tiny high parts become eyestalks. */
  shellCreature?: boolean;
  /** Low mirrored side pairs are legs (insects/crustaceans) instead of fins. */
  hasLegs?: boolean;
}

interface Frame {
  /** Signed forward coordinate of a point. */
  f(c: readonly number[]): number;
  /** Signed "toward the creature's LEFT" coordinate. */
  s(c: readonly number[]): number;
  /** Index of the side axis in a size triple. */
  sideAxis: 0 | 2;
}

function makeFrame(forward: ForwardAxis): Frame {
  switch (forward) {
    case "+z":
      return { f: (c) => c[2], s: (c) => c[0], sideAxis: 0 };
    case "-z":
      return { f: (c) => -c[2], s: (c) => -c[0], sideAxis: 0 };
    case "+x":
      return { f: (c) => c[0], s: (c) => -c[2], sideAxis: 2 };
    case "-x":
      return { f: (c) => -c[0], s: (c) => c[2], sideAxis: 2 };
  }
}

interface Normed {
  part: ClassifiablePart;
  /** 0 (rear) .. 1 (front) along the body. */
  f01: number;
  /** 0 (belly) .. 1 (top). */
  u01: number;
  /** Signed side offset as a fraction of body width (+ = creature's left). */
  sN: number;
  /** Part thickness across the body, as a fraction of the body part's. */
  thin: number;
}

/** Classify every part into a role. Every part receives a role (fallback:
 *  extra central mass → "body", specks → "static"). */
export function classifyParts(
  parts: ClassifiablePart[],
  forward: ForwardAxis,
  opts: ClassifyOptions = {},
): Record<string, PartRole> {
  const roles: Record<string, PartRole> = {};
  if (parts.length === 0) return roles;
  const fr = makeFrame(forward);

  // Model extents from the union of part boxes.
  let fMin = Infinity;
  let fMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const p of parts) {
    const hf = fr.f(p.size) / 2;
    const hs = fr.s(p.size) / 2;
    const f = fr.f(p.center);
    const s = fr.s(p.center);
    fMin = Math.min(fMin, f - Math.abs(hf));
    fMax = Math.max(fMax, f + Math.abs(hf));
    sMin = Math.min(sMin, s - Math.abs(hs));
    sMax = Math.max(sMax, s + Math.abs(hs));
    yMin = Math.min(yMin, p.center[1] - p.size[1] / 2);
    yMax = Math.max(yMax, p.center[1] + p.size[1] / 2);
  }
  const fLen = Math.max(1e-6, fMax - fMin);
  const height = Math.max(1e-6, yMax - yMin);
  const width = Math.max(1e-6, sMax - sMin);

  // 1. Main mass: largest part = body — or, for shell creatures, the two
  //    largest split into shell (upper) + foot (lower).
  const byTris = [...parts].sort((a, b) => b.tris - a.tris);
  const bodyPart = byTris[0];
  let bodySide = bodyPart.size[fr.sideAxis];
  if (opts.shellCreature && byTris.length >= 2) {
    const [a, b] = byTris;
    const upper = a.center[1] >= b.center[1] ? a : b;
    const lower = upper === a ? b : a;
    roles[upper.name] = "shell";
    roles[lower.name] = "foot";
    bodySide = Math.max(a.size[fr.sideAxis], b.size[fr.sideAxis]);
  } else {
    roles[bodyPart.name] = "body";
  }

  const norm: Normed[] = parts
    .filter((p) => !roles[p.name])
    .map((p) => ({
      part: p,
      f01: (fr.f(p.center) - fMin) / fLen,
      u01: (p.center[1] - yMin) / height,
      sN: fr.s(p.center) / width,
      thin: p.size[fr.sideAxis] / Math.max(1e-6, bodySide),
    }));

  // 2. Eyestalks (shell creatures) then static specks.
  for (const n of norm) {
    if (roles[n.part.name]) continue;
    if (opts.shellCreature && n.part.tris <= 150 && n.u01 >= 0.75) roles[n.part.name] = "eyestalk";
    else if (n.part.tris < 100) roles[n.part.name] = "static";
  }

  const remaining = (): Normed[] => norm.filter((n) => !roles[n.part.name]);

  // 3. Head: front-most substantial centre-line part.
  const headCand = remaining()
    .filter((n) => Math.abs(n.sN) <= 0.18 && n.part.tris >= 250)
    .sort((a, b) => b.f01 - a.f01)[0];
  if (headCand && headCand.f01 >= 0.7) roles[headCand.part.name] = "head";

  // 4. Tail: rear-most centre-line part.
  const tailCand = remaining()
    .filter((n) => Math.abs(n.sN) <= 0.18)
    .sort((a, b) => a.f01 - b.f01)[0];
  if (tailCand && tailCand.f01 <= 0.25) roles[tailCand.part.name] = "tail";

  // 5. Mirrored side pairs → antennae / legs / side fins.
  const pairPool = remaining().filter((n) => Math.abs(n.sN) >= 0.02);
  for (const n of pairPool) {
    if (roles[n.part.name]) continue;
    if (Math.abs(n.sN) < 0.04) continue; // needs a real side offset to anchor a pair
    let best: Normed | null = null;
    let bestScore = 0.35;
    for (const m of pairPool) {
      if (m === n || roles[m.part.name]) continue;
      if (Math.sign(m.sN) === Math.sign(n.sN)) continue;
      const dS = Math.abs(Math.abs(m.sN) - Math.abs(n.sN));
      if (dS > Math.max(0.35 * Math.max(Math.abs(m.sN), Math.abs(n.sN)), 0.03)) continue;
      const dF = Math.abs(m.f01 - n.f01);
      const dU = Math.abs(m.u01 - n.u01);
      if (dF > 0.15 || dU > 0.2) continue;
      const score = dF + dU + dS;
      if (score < bestScore) {
        bestScore = score;
        best = m;
      }
    }
    if (!best) continue;
    const u = (n.u01 + best.u01) / 2;
    const f = (n.f01 + best.f01) / 2;
    let kind: "antenna" | "leg" | "finSide";
    if (u >= 0.5 && f >= 0.5) kind = "antenna";
    else if (opts.hasLegs && u < 0.45) kind = "leg";
    else kind = "finSide";
    const left = n.sN > 0 ? n : best;
    const right = left === n ? best : n;
    roles[left.part.name] = kind === "antenna" ? "antennaL" : kind === "leg" ? "legL" : "finSideL";
    roles[right.part.name] = kind === "antenna" ? "antennaR" : kind === "leg" ? "legR" : "finSideR";
  }

  // 6. Unpaired thin centre-line plates → top / bottom fins.
  for (const n of remaining()) {
    if (Math.abs(n.sN) > 0.15 || n.thin > 0.4) continue;
    if (n.u01 >= 0.55) roles[n.part.name] = "finTop";
    else if (n.u01 <= 0.35) roles[n.part.name] = "finBottom";
  }

  // 7. Whatever is left rides along as extra body mass.
  for (const n of remaining()) roles[n.part.name] = "body";

  return roles;
}

/**
 * prep-rigged-creature.mjs — produce a runtime copy of a RIGGED animal GLB.
 *
 *   node tools/prep-rigged-creature.mjs <src.glb> <dst.glb> \
 *        [--max 1024] [--strip-name Plane] [--strip-prefix WGT-]
 *
 * What it does (source file is never modified):
 *   1. Resizes every texture above --max to fit --max (macOS `sips`, since the
 *      gltf-transform CLI needs a newer Node than this machine runs).
 *   2. Strips junk scene nodes (exact names via --strip-name, prefixes via
 *      --strip-prefix) — e.g. Blender export leftovers like a ground Plane or
 *      Rigify WGT-* bone-shape widgets. Skin joints are never stripped.
 *   3. Prunes unused meshes/materials/accessors and writes the runtime GLB.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { prune } from "@gltf-transform/functions";

const args = process.argv.slice(2);
const src = args[0];
const dst = args[1];
if (!src || !dst) {
  console.error("usage: node tools/prep-rigged-creature.mjs <src.glb> <dst.glb> [--max N] [--strip-name X]... [--strip-prefix Y]...");
  process.exit(1);
}
let maxSize = 1024;
const stripNames = [];
const stripPrefixes = [];
for (let i = 2; i < args.length; i++) {
  if (args[i] === "--max") maxSize = Number(args[++i]);
  else if (args[i] === "--strip-name") stripNames.push(args[++i]);
  else if (args[i] === "--strip-prefix") stripPrefixes.push(args[++i]);
}

const io = new NodeIO();
const doc = await io.read(src);
const root = doc.getRoot();

// -- 1. texture resize ------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "glbtex-"));
for (const tex of root.listTextures()) {
  const size = tex.getSize();
  const img = tex.getImage();
  if (!size || !img) continue;
  const [w, h] = size;
  if (Math.max(w, h) <= maxSize) {
    console.log(`texture "${tex.getName()}" ${w}x${h} — already within ${maxSize}`);
    continue;
  }
  const ext = tex.getMimeType() === "image/png" ? "png" : "jpg";
  const f = join(tmp, `t${Math.random().toString(36).slice(2)}.${ext}`);
  writeFileSync(f, img);
  execFileSync("sips", ["-Z", String(maxSize), f], { stdio: "pipe" });
  tex.setImage(readFileSync(f));
  const after = tex.getSize();
  console.log(`texture "${tex.getName()}" ${w}x${h} -> ${after?.[0]}x${after?.[1]}`);
}
rmSync(tmp, { recursive: true, force: true });

// -- 2. junk node strip (never a skin joint) --------------------------------
const joints = new Set();
for (const skin of root.listSkins()) for (const j of skin.listJoints()) joints.add(j);
let stripped = 0;
for (const node of root.listNodes()) {
  const name = node.getName();
  const match = stripNames.includes(name) || stripPrefixes.some((p) => name.startsWith(p));
  if (match && !joints.has(node)) {
    node.dispose();
    stripped++;
  }
}
console.log(`stripped ${stripped} junk nodes`);

// -- 3. prune + write --------------------------------------------------------
await doc.transform(prune());
await io.write(dst, doc);

const srcMB = (statSync(src).size / 1e6).toFixed(2);
const dstMB = (statSync(dst).size / 1e6).toFixed(2);
console.log(`nodes: ${root.listNodes().length} | skins: ${root.listSkins().length} | anims: ${root.listAnimations().map((a) => a.getName()).join(", ") || "none"}`);
console.log(`${srcMB} MB -> ${dstMB} MB  (${dst})`);

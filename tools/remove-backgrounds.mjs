#!/usr/bin/env node
/**
 * GLASSWATER — batch background-removal pipeline (remove.bg).
 *
 * Reads raw images from   assets/TankView_Assets/raw/
 * Writes cleaned PNGs to   assets/TankView_Assets/cleaned/
 *
 *  • Originals in raw/ are never modified.
 *  • Files that are already transparent (PNG with an alpha channel / tRNS) are
 *    skipped — they're assumed to be cut out already.
 *  • Already-cleaned outputs are skipped unless you pass --force.
 *  • Each cleaned file is logged; a summary is printed at the end.
 *
 * The API key is read from REMOVE_BG_API_KEY (env var or the project-root .env,
 * which is gitignored). Never hardcoded.
 *
 * Usage:
 *   npm run clean:bg                 # process raw/ → cleaned/
 *   npm run clean:bg -- --dry-run    # show what would be processed (no API calls)
 *   npm run clean:bg -- --force      # re-clean even if an output already exists
 *   npm run clean:bg -- --size full  # request full-resolution output (more credits)
 *   npm run clean:bg -- --help
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RAW_DIR = path.join(ROOT, "assets", "TankView_Assets", "raw");
const OUT_DIR = path.join(ROOT, "assets", "TankView_Assets", "cleaned");
const ENDPOINT = "https://api.remove.bg/v1.0/removebg";

dotenv.config({ path: path.join(ROOT, ".env"), quiet: true });

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

// ── Args ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { force: false, dryRun: false, help: false, size: "auto", includeTransparent: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--include-transparent") opts.includeTransparent = true;
    else if (a === "--size") opts.size = argv[++i];
    else if (a.startsWith("--size=")) opts.size = a.slice(7);
  }
  return opts;
}

function printHelp() {
  console.log(`
GLASSWATER background-removal pipeline (remove.bg)

  npm run clean:bg [-- options]

Reads  assets/TankView_Assets/raw/
Writes assets/TankView_Assets/cleaned/   (originals are preserved)

Options:
  --force                 Re-process even if a cleaned output already exists
  --include-transparent   Also process files that already have an alpha channel
  --size <auto|full|preview|small|regular>   Output size (default auto)
  --dry-run               List what would happen without calling the API (no cost)
  -h, --help              Show this help

API key: REMOVE_BG_API_KEY (env var, or a .env file in the project root)
`);
}

/**
 * True if a PNG already carries transparency (alpha colour type, or a tRNS
 * chunk). Dependency-free: reads the IHDR colour type + scans for tRNS. Non-PNG
 * formats (jpg/webp-as-opaque) return false so they always get processed.
 */
function alreadyTransparent(buf, ext) {
  if (ext !== ".png") return false;
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < sig.length; i++) if (buf[i] !== sig[i]) return false;
  // IHDR data starts at byte 16; colour type is the 10th data byte → offset 25.
  const colorType = buf[25];
  if (colorType === 4 || colorType === 6) return true; // grayscale+alpha / RGBA
  if (buf.includes(Buffer.from("tRNS"))) return true; // palette transparency
  return false;
}

async function removeBg(buf, fileName, ext, key, size) {
  const form = new FormData();
  form.append("size", size);
  form.append("format", "png");
  form.append("image_file", new Blob([buf], { type: MIME[ext] || "image/png" }), fileName);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "X-Api-Key": key },
    body: form,
  });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (j?.errors?.length) detail += ` — ${j.errors.map((e) => e.title || e.code).join("; ")}`;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  const credits = res.headers.get("x-credits-charged");
  return { data: Buffer.from(await res.arrayBuffer()), credits };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return printHelp();

  // Ensure the working folders exist.
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort();

  if (!files.length) {
    console.log(`\nNo images found in ${path.relative(ROOT, RAW_DIR)}/`);
    console.log(`Drop raw images (jpg/png/webp) there, then run \`npm run clean:bg\` again.\n`);
    return;
  }

  const key = process.env.REMOVE_BG_API_KEY;
  if (!key && !opts.dryRun) {
    console.error(
      "Missing REMOVE_BG_API_KEY.\n" +
        "Add it to your .env file in the project root:\n\n  REMOVE_BG_API_KEY=your-key\n\n" +
        "(.env is gitignored. See .env.example.) — or use --dry-run to preview without a key.",
    );
    process.exit(1);
  }

  console.log(`\n🧼 Background removal — ${files.length} file(s) in ${path.relative(ROOT, RAW_DIR)}/`);
  if (opts.dryRun) console.log(`   (dry-run: no API calls, nothing written)\n`);

  const stats = { cleaned: 0, transparent: 0, exists: 0, error: 0, credits: 0 };

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const inPath = path.join(RAW_DIR, file);
    const outName = `${path.parse(file).name}.png`;
    const outPath = path.join(OUT_DIR, outName);
    const buf = fs.readFileSync(inPath);

    if (!opts.includeTransparent && alreadyTransparent(buf, ext)) {
      console.log(`   ⏭  ${file} — already transparent (skipped)`);
      stats.transparent++;
      continue;
    }
    if (!opts.force && fs.existsSync(outPath)) {
      console.log(`   ⏭  ${file} — cleaned output exists (use --force to redo)`);
      stats.exists++;
      continue;
    }
    if (opts.dryRun) {
      console.log(`   →  ${file} — would clean → cleaned/${outName}`);
      stats.cleaned++;
      continue;
    }

    try {
      const { data, credits } = await removeBg(buf, file, ext, key, opts.size);
      fs.writeFileSync(outPath, data);
      const kb = (data.length / 1024).toFixed(0);
      console.log(`   ✅ ${file} → cleaned/${outName} (${kb} KB${credits ? `, ${credits} credit` : ""})`);
      stats.cleaned++;
      stats.credits += Number(credits) || 0;
    } catch (e) {
      console.error(`   ❌ ${file} — ${e.message}`);
      stats.error++;
    }
  }

  console.log(
    `\nDone. cleaned ${stats.cleaned}, already-transparent ${stats.transparent}, ` +
      `existing ${stats.exists}, errors ${stats.error}` +
      (stats.credits ? `, credits charged ${stats.credits}` : "") +
      `\n`,
  );
  if (stats.error) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\nError: ${e?.message || e}`);
  process.exit(1);
});

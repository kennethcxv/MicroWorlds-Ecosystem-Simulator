#!/usr/bin/env node
/**
 * GLASSWATER — asset editor (fal.ai · FLUX.1 Kontext, image-to-image).
 *
 * Takes an existing image (a screenshot, a generated plate, a sprite) plus a
 * text instruction and returns an edited version. Output is saved to
 *   assets/generated/fal/
 *
 * This is for EDITING art/screenshots (e.g. "make the water clearer", "remove
 * the background", "add warm rim light"). It is NOT for replacing the live,
 * interactive game scene with baked static images.
 *
 * The API key is read from FAL_KEY (env var or the project-root .env, which is
 * gitignored). Never hardcoded.
 *
 * Usage (via npm — note the `--` before flags):
 *   npm run edit:asset -- --input <path> "<edit instruction>" [options]
 *   npm run edit:asset -- --help
 *
 * Examples:
 *   npm run edit:asset -- -i public/assets/hardscape/driftwood_log.png "add soft green moss and a wet sheen"
 *   npm run edit:asset -- -i shot.png "make the underwater lighting clearer and more glossy" --model max
 *   npm run edit:asset -- -i public/assets/plants/plant_rotala.png "isolate on a transparent background" --format png
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fal } from "@fal-ai/client";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "generated", "fal");

dotenv.config({ path: path.join(ROOT, ".env"), quiet: true });

const MODELS = {
  default: "fal-ai/flux-pro/kontext",
  max: "fal-ai/flux-pro/kontext/max",
};

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

// ── Args ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = {
    input: null,
    model: "default",
    out: null,
    format: "png",
    guidance: "3.5",
    num: "1",
    aspect: null,
    seed: null,
    dryRun: false,
    help: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--input" || a === "-i") opts.input = argv[++i];
    else if (a === "--prompt" || a === "-p") opts.prompt = argv[++i];
    else if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
      const val = eq >= 0 ? a.slice(eq + 1) : argv[++i];
      opts[key] = val;
    } else positional.push(a);
  }
  if (!opts.prompt) opts.prompt = positional.join(" ").trim();
  return opts;
}

function slug(s) {
  return (s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "edit");
}
function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function printHelp() {
  console.log(`
GLASSWATER asset editor (fal.ai · FLUX.1 Kontext)

  npm run edit:asset -- --input <path> "<edit instruction>" [options]

Required:
  -i, --input <path>     Source image to edit
  "<instruction>"        What to change (or -p/--prompt "<instruction>")

Options:
  --model <default|max>  Kontext model (max = higher quality). Default: default
  --format <png|jpeg>    Output format. Default: png
  --guidance <n>         Guidance scale (how strongly to follow the prompt). Default: 3.5
  --num <n>              Number of variations. Default: 1
  --aspect <W:H>         Force an aspect ratio (otherwise keeps the input's)
  --seed <n>             Seed for reproducibility
  --out <name>           Output filename base (without extension)
  --dry-run              Validate & print the request without calling the API (no cost)
  -h, --help             Show this help

Output dir: assets/generated/fal/
API key:    FAL_KEY (env var, or a .env file in the project root)
`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return printHelp();

  const endpoint = MODELS[opts.model] || (opts.model.includes("/") ? opts.model : MODELS.default);

  if (!opts.input) {
    console.error("Missing --input <image path>.\n");
    printHelp();
    process.exit(1);
  }
  const inputPath = path.resolve(ROOT, opts.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input image not found: ${inputPath}`);
    process.exit(1);
  }
  if (!opts.prompt) {
    console.error("Missing edit instruction (a prompt).\n");
    printHelp();
    process.exit(1);
  }

  const key = process.env.FAL_KEY;
  if (!key) {
    console.error(
      "Missing FAL_KEY.\n" +
        "Add it to your .env file in the project root:\n\n  FAL_KEY=your-fal-key\n\n" +
        "(.env is gitignored. See .env.example.)",
    );
    process.exit(1);
  }

  const ext = opts.format === "jpeg" ? "jpg" : "png";
  const base =
    opts.out?.replace(/\.[a-z]+$/i, "") ||
    `kontext_${slug(path.parse(inputPath).name)}_${slug(opts.prompt)}_${stamp()}`;

  const input = {
    prompt: opts.prompt,
    num_images: Number(opts.num) || 1,
    output_format: opts.format === "jpeg" ? "jpeg" : "png",
    guidance_scale: Number(opts.guidance) || 3.5,
    safety_tolerance: "2",
  };
  if (opts.aspect) input.aspect_ratio = opts.aspect;
  if (opts.seed) input.seed = Number(opts.seed);

  console.log(`\n🖌  GLASSWATER asset editor (FLUX.1 Kontext)`);
  console.log(`   endpoint   ${endpoint}`);
  console.log(`   input      ${path.relative(ROOT, inputPath)}`);
  console.log(`   prompt     "${opts.prompt}"`);
  console.log(`   → assets/generated/fal/${base}.${ext}`);

  if (opts.dryRun) {
    console.log(`\n[dry-run] Would upload the input image, then call with input:\n`);
    console.log(JSON.stringify(input, null, 2));
    return;
  }

  fal.config({ credentials: key });

  // Upload the local image so Kontext can reference it by URL.
  console.log(`\n   Uploading source image…`);
  const buf = fs.readFileSync(inputPath);
  const mime = MIME[path.extname(inputPath).toLowerCase()] || "image/png";
  const imageUrl = await fal.storage.upload(new Blob([buf], { type: mime }));
  input.image_url = imageUrl;

  console.log(`   Editing… (this can take 10–40s)`);
  const result = await fal.subscribe(endpoint, {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        for (const l of update.logs ?? []) if (l.message) console.log(`     · ${l.message}`);
      }
    },
  });

  const images = result?.data?.images ?? result?.images ?? [];
  if (!images.length) {
    console.error(`\nNo image returned. Raw result:\n${JSON.stringify(result).slice(0, 800)}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let saved = 0;
  for (let i = 0; i < images.length; i++) {
    const url = images[i].url;
    if (!url) continue;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`   Failed to download result ${i}: ${res.status}`);
      continue;
    }
    const out = path.join(OUT_DIR, images.length > 1 ? `${base}_${i + 1}.${ext}` : `${base}.${ext}`);
    fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    const kb = (fs.statSync(out).size / 1024).toFixed(0);
    console.log(`\n✅ Saved ${path.relative(ROOT, out)} (${kb} KB)`);
    saved++;
  }
  if (!saved) process.exit(1);
  console.log("");
}

main().catch((e) => {
  console.error(`\nError: ${e?.message || e}`);
  process.exit(1);
});

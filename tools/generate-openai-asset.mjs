#!/usr/bin/env node
/**
 * GLASSWATER — internal asset generator (OpenAI Images API).
 *
 * Generates ONE game-art image at a time from a text prompt and saves it to
 *   assets/generated/openai/
 *
 * The API key is read from the OPENAI_API_KEY environment variable, falling back
 * to a .env file in the project root. The key is NEVER hardcoded and .env is
 * gitignored.
 *
 * Usage (via npm — note the `--` before flags):
 *   npm run gen:asset -- "<prompt>" [--preset <name>] [options]
 *   npm run gen:asset -- --list
 *   npm run gen:asset -- --help
 *
 * Examples:
 *   npm run gen:asset -- --preset plant "a lush red rotala stem cluster"
 *   npm run gen:asset -- --preset driftwood "a gnarled mopani driftwood branch with moss"
 *   npm run gen:asset -- --preset icon "a fish food shaker"
 *   npm run gen:asset -- --preset aquascape "iwagumi layout with seiryu stones and carpet"
 *   npm run gen:asset -- --preset room "shelves of jarred specimens, warm lamp glow"
 *   npm run gen:asset -- "anything custom" --size 1024x1024 --background transparent --out my_asset
 *
 * Run directly: node tools/generate-openai-asset.mjs -- "<prompt>" ...
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "generated", "openai");
const ENDPOINT = "https://api.openai.com/v1/images/generations";

// ── Minimal .env loader (no dependency) ──────────────────────────────────────
function loadEnv(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return; // no .env — that's fine if the var is already in the environment
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val; // don't override real env
  }
}
loadEnv(path.join(ROOT, ".env"));

// ── Style presets tuned for GLASSWATER's art direction ───────────────────────
const PRESETS = {
  none: {
    size: "1024x1024",
    background: "auto",
    quality: "high",
    suffix: "",
    note: "No style preset — your prompt is used verbatim.",
  },
  aquascape: {
    size: "1536x1024",
    background: "opaque",
    quality: "high",
    note: "Hero underwater aquascape plate (landscape).",
    suffix:
      "Hero aquascape plate for a premium 2.5D aquarium management game. Lush, naturally arranged planted freshwater underwater scene, semi-realistic, cohesive cool dark-teal underwater lighting with soft god rays, rich grounded detail, depth. No fish unless asked. No UI, no text, no watermark, no border.",
  },
  driftwood: {
    size: "1024x1024",
    background: "transparent",
    quality: "high",
    note: "Isolated driftwood / rock hardscape cutout (transparent).",
    suffix:
      "A single isolated aquarium hardscape piece (driftwood or rock), photorealistic, soft even top-down studio lighting, subtle moss accents, the entire object centered and fully in frame, on a fully transparent background, no cast shadow on the ground, no scene, no text, no watermark.",
  },
  plant: {
    size: "1024x1536",
    background: "transparent",
    quality: "high",
    note: "Isolated aquatic plant cluster cutout (transparent, portrait).",
    suffix:
      "A single isolated aquatic plant cluster, photorealistic, healthy and vivid, soft even studio lighting, the whole plant standing upright and fully in frame, on a fully transparent background, no pot, no substrate, no cast shadow, no text, no watermark.",
  },
  icon: {
    size: "1024x1024",
    background: "transparent",
    quality: "medium",
    note: "Clean UI glyph icon (transparent).",
    suffix:
      "A minimal UI glyph icon for a cozy aquarium management game. Clean rounded line-art style, a single soft cyan color, smooth consistent stroke weight, centered with generous padding, on a fully transparent background. No background shapes, no text, no watermark.",
  },
  room: {
    size: "1536x1024",
    background: "opaque",
    quality: "high",
    note: "Cozy eco-center room detail / background (landscape).",
    suffix:
      "A cozy, dim eco-center / aquarium workshop interior. Warm wood, warm hanging lamps, leafy plants, shelves of bottles and specimens, atmospheric and slightly subdued so it works as a background. Semi-realistic, painterly-photographic. No people, no UI, no text, no watermark.",
  },
};

// ── Arg parsing ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = {
    model: "gpt-image-1",
    preset: "none",
    out: null,
    format: "png",
    dryRun: false,
    help: false,
    list: false,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--list") opts.list = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
      const val = eq >= 0 ? a.slice(eq + 1) : argv[++i];
      opts[key] = val;
    } else {
      positional.push(a);
    }
  }
  opts.prompt = positional.join(" ").trim();
  return opts;
}

function slug(s) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 42) || "asset"
  );
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function printHelp() {
  console.log(`
GLASSWATER asset generator (OpenAI Images API)

  npm run gen:asset -- "<prompt>" [--preset <name>] [options]

Options:
  --preset <name>     Style preset: ${Object.keys(PRESETS).join(", ")}
  --size <WxH>        1024x1024 | 1536x1024 | 1024x1536 | auto
  --quality <q>       low | medium | high | auto
  --background <b>    transparent | opaque | auto   (transparent forces PNG)
  --format <f>        png | jpeg | webp             (default png)
  --model <m>         gpt-image-1 (default) | dall-e-3
  --out <name>        Output filename (without extension)
  --dry-run           Build & print the request without calling the API (no cost)
  --list              List presets and exit
  -h, --help          Show this help

Output dir: assets/generated/openai/
API key:    OPENAI_API_KEY (env var, or a .env file in the project root)
`);
}

function printPresets() {
  console.log("\nPresets:\n");
  for (const [name, p] of Object.entries(PRESETS)) {
    console.log(`  ${name.padEnd(10)} ${p.note}`);
    console.log(`  ${"".padEnd(10)} → size ${p.size}, background ${p.background}, quality ${p.quality}\n`);
  }
}

// ── Build the API request body ────────────────────────────────────────────────
function buildBody(opts, preset) {
  const finalPrompt = preset.suffix ? `${opts.prompt}\n\n${preset.suffix}` : opts.prompt;
  const size = opts.size || preset.size;
  const quality = opts.quality || preset.quality;
  let background = opts.background || preset.background;
  let format = opts.format || "png";

  // Transparency only works with PNG/WebP.
  if (background === "transparent" && format === "jpeg") format = "png";

  if (opts.model === "dall-e-3") {
    // DALL·E 3 has no transparent background / output_format controls.
    const dalleSize = ["1024x1024", "1792x1024", "1024x1792"].includes(size) ? size : "1024x1024";
    return {
      body: {
        model: "dall-e-3",
        prompt: finalPrompt,
        n: 1,
        size: dalleSize,
        quality: quality === "high" ? "hd" : "standard",
        response_format: "b64_json",
      },
      format: "png",
    };
  }

  return {
    body: {
      model: opts.model,
      prompt: finalPrompt,
      n: 1,
      size,
      quality,
      background,
      output_format: format,
    },
    format,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return printHelp();
  if (opts.list) return printPresets();

  const preset = PRESETS[opts.preset];
  if (!preset) {
    console.error(`Unknown preset "${opts.preset}". Run with --list to see options.`);
    process.exit(1);
  }
  if (!opts.prompt) {
    console.error("No prompt given.\n");
    printHelp();
    process.exit(1);
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error(
      "Missing OPENAI_API_KEY.\n" +
        "Create a .env file in the project root containing:\n\n" +
        "  OPENAI_API_KEY=sk-your-key-here\n\n" +
        "(.env is gitignored. See .env.example.)",
    );
    process.exit(1);
  }

  const { body, format } = buildBody(opts, preset);
  const ext = format === "jpeg" ? "jpg" : format;
  const fileName = `${(opts.out || `${opts.preset}_${slug(opts.prompt)}_${stamp()}`).replace(/\.[a-z]+$/i, "")}.${ext}`;
  const outPath = path.join(OUT_DIR, fileName);

  console.log(`\n🎨 GLASSWATER asset generator`);
  console.log(`   model      ${body.model}`);
  console.log(`   preset     ${opts.preset}`);
  console.log(`   size       ${body.size}`);
  console.log(`   quality    ${body.quality}`);
  if (body.background) console.log(`   background ${body.background}`);
  console.log(`   → ${path.relative(ROOT, outPath)}`);

  if (opts.dryRun) {
    console.log(`\n[dry-run] Request body (no API call made):\n`);
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  console.log(`\n   Generating… (this can take 10–30s)`);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`\nNetwork error calling OpenAI: ${e.message}`);
    process.exit(1);
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`\nOpenAI API error ${res.status} ${res.statusText}:\n${text}`);
    process.exit(1);
  }

  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) {
    console.error(`\nUnexpected response (no image data):\n${JSON.stringify(json).slice(0, 800)}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(b64, "base64"));

  const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(`\n✅ Saved ${path.relative(ROOT, outPath)} (${kb} KB)`);
  if (json.usage) {
    console.log(`   usage: ${JSON.stringify(json.usage)}`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

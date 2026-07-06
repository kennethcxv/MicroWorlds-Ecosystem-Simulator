# API Usage Log — GLASSWATER

Log **every** paid external API call here (asset generation/editing/cleanup).
Keys are read from `.env` (gitignored) — never hardcode or print them.

| Date | Tool / API | Action | Inputs | Output path | Credits | Notes |
|------|-----------|--------|--------|-------------|--------:|-------|
| 2026-06-29 | tools/generate-openai-asset.mjs (OpenAI Images) | dry-run only | — | — | 0 | smoke-test, no generation |
| 2026-06-29 | tools/edit-asset-with-fal.mjs (fal/Flux Kontext) | dry-run only | — | — | 0 | smoke-test, no edit |
| 2026-06-29 | tools/remove-backgrounds.mjs (remove.bg) | dry-run only | sample raw/ images | — | 0 | correctly skipped already-transparent, flagged opaque |
| 2026-07-05 | tools/generate-openai-asset.mjs (gpt-image-1) | generate | atrium main-menu backdrop prompt, 1536×1024 high | assets/generated/openai/eco_center_atrium_v1.png | ~1 img (~$0.17) | v1 candidate — good structure, a bit dark |
| 2026-07-05 | tools/generate-openai-asset.mjs (gpt-image-1) | generate | atrium backdrop prompt (brighter, larger central pond), 1536×1024 high | assets/generated/openai/eco_center_atrium_v2.png | ~1 img (~$0.17) | v2 candidate — was shipped; **SUPERSEDED by v3** (too sparse/flat per user) |
| 2026-07-05 | tools/generate-openai-asset.mjs (gpt-image-1) | dry-run only | reference-faithful dense-atrium prompt | — | 0 | verified long prompt survives the shell |
| 2026-07-05 | tools/generate-openai-asset.mjs (gpt-image-1) | generate | reference-faithful DENSE atrium (skylight+cascading vines, legible exhibit bays, central pond+emblem, foreground lounge), 1536×1024 high | assets/generated/openai/eco_center_atrium_v3.png | ~1 img (~$0.17) | **CHOSEN** — curated → public/assets/ui/hub/eco_center_atrium.jpg; far closer to Designs/Main_Menu/…12_25_17 AM.png |
| 2026-07-05 | tools/generate-openai-asset.mjs (gpt-image-1) | generate | taller two-tier variant (denser vine curtains, grander skylight) | assets/generated/openai/eco_center_atrium_v4.png | ~1 img (~$0.17) | alternate — grander mood but muddier exhibit legibility; kept as documented one-line swap |

**Total credits spent to date: ~4 gpt-image-1 high 1536×1024 images (~$0.68).**

## Rules
- Default to `-- --dry-run` when testing scripts.
- Generate/edit only high-value assets; don't spam.
- Curate outputs (`assets/generated/...`, `assets/TankView_Assets/cleaned/`)
  before promoting into `public/assets/`.
- Add a row here **before or immediately after** any real (non-dry-run) call.

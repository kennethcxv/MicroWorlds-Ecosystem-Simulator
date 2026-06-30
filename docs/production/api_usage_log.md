# API Usage Log — GLASSWATER

Log **every** paid external API call here (asset generation/editing/cleanup).
Keys are read from `.env` (gitignored) — never hardcode or print them.

| Date | Tool / API | Action | Inputs | Output path | Credits | Notes |
|------|-----------|--------|--------|-------------|--------:|-------|
| 2026-06-29 | tools/generate-openai-asset.mjs (OpenAI Images) | dry-run only | — | — | 0 | smoke-test, no generation |
| 2026-06-29 | tools/edit-asset-with-fal.mjs (fal/Flux Kontext) | dry-run only | — | — | 0 | smoke-test, no edit |
| 2026-06-29 | tools/remove-backgrounds.mjs (remove.bg) | dry-run only | sample raw/ images | — | 0 | correctly skipped already-transparent, flagged opaque |

**Total credits spent to date: 0.**

## Rules
- Default to `-- --dry-run` when testing scripts.
- Generate/edit only high-value assets; don't spam.
- Curate outputs (`assets/generated/...`, `assets/TankView_Assets/cleaned/`)
  before promoting into `public/assets/`.
- Add a row here **before or immediately after** any real (non-dry-run) call.

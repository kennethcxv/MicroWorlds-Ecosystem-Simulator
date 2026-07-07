# Generated assets — fal.ai (FLUX.1 Kontext)

Edited images produced by `tools/edit-asset-with-fal.mjs` (image-to-image). Use this
to **edit** existing art/screenshots — clean up a sprite, restyle a plate, add a sheen —
not to replace the live interactive game scene with static images.

Edit one at a time:

```bash
npm run edit:asset -- --input <path> "<edit instruction>" [--model max]
npm run edit:asset -- --help
```

Tip: add `--dry-run` to validate the request without spending API credits.
Curate keepers into `public/assets/...` and register paths in `src/data/assets.ts`.

# Generated assets — OpenAI

Images here are produced by `tools/generate-openai-asset.mjs`. Review/curate them,
then move keepers into `public/assets/...` (and register paths in
`src/data/assets.ts`) to use them in the game.

Generate one at a time:

```bash
npm run gen:asset -- "<prompt>" --preset <aquascape|driftwood|plant|icon|room>
npm run gen:asset -- --list      # see all presets
npm run gen:asset -- --help      # all options
```

Tip: add `--dry-run` to preview the request without spending API credits.

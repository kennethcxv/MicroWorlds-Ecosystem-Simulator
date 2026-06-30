# Raw assets (input)

Drop raw images (jpg / png / webp) here that need their background removed.
Then run:

```bash
npm run clean:bg                # cleaned PNGs land in ../cleaned/
npm run clean:bg -- --dry-run   # preview without spending credits
```

Originals here are never modified. Files that are already transparent are skipped.

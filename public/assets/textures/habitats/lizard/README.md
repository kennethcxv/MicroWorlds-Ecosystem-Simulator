# Lizard habitat textures

Runtime textures for the 3D Lizard terrarium (served by Vite from `public/`).

## Sand substrate (optional drop-in)

Drop a tileable desert-sand image here to override the procedural sand:

```
sand_substrate_01.png
```

- Any square, seamless/tileable sand image (1024² recommended; JPG/WebP also work
  if you also update the filename in `ThreeSandTexture.ts`).
- It is applied to the terrarium floor with `RepeatWrapping` (it tiles — it is
  **not** used as a 3D model).
- If this file is absent, the game generates a procedural tileable sand texture at
  runtime, so the terrarium still looks like warm desert sand with no art needed.

Auto-detected on the next load of the 3D Lizard habitat — no code changes needed.

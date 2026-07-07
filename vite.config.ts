import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

// Root-anchored ignore glob (a bare "**/assets/**" would also match
// public/assets and break new-asset serving — the public-file registry is
// maintained by this same watcher).
const root = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// GLASSWATER is a vanilla TS + Canvas/DOM game. No framework plugins needed.
export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    host: true,
    watch: {
      // This repo lives in iCloud-synced ~/Documents: fsevents replays ghost
      // "changed" events for files whose mtimes never moved (bird sync passes),
      // which made Vite phantom-restart every few seconds. Stat-polling only
      // fires on REAL mtime changes. Reference/art folders aren't runtime
      // inputs, so they're excluded from the poll set.
      usePolling: true,
      interval: 800,
      binaryInterval: 2500,
      ignored: [
        root("./3D_Assets/**"),
        root("./assets/**"),
        root("./screenshots/**"),
        root("./docs/**"),
        root("./Designs/**"),
        root("./dist/**"),
        root("./01_reference_screens/**"),
        root("./02_tankview_assets/**"),
        root("./03_species_refs/**"),
        root("./04_docs/**"),
        root("./UpScaled_Assets/**"),
        root("./.agents/**"),
      ],
    },
  },
  build: {
    target: "es2020",
    outDir: "dist",
    assetsInlineLimit: 0,
  },
});

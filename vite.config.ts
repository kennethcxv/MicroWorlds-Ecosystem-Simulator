import { defineConfig } from "vite";

// GLASSWATER is a vanilla TS + Canvas/DOM game. No framework plugins needed.
export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: "es2020",
    outDir: "dist",
    assetsInlineLimit: 0,
  },
});

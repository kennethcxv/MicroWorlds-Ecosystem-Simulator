/** Entry point: preload art (with a boot progress bar), then start the game. */
import "./styles.css";
import { assets } from "./render/assetLoader";
import { allAssetUrls } from "./data/assets";
import { GlasswaterApp } from "./app";

async function boot(): Promise<void> {
  const fill = document.getElementById("boot-fill");
  await assets.loadAll(allAssetUrls(), (loaded, total) => {
    if (fill) fill.style.width = `${Math.round((loaded / total) * 100)}%`;
  });

  const mount = document.getElementById("app");
  if (!mount) throw new Error("#app mount not found");

  const app = new GlasswaterApp(mount);
  app.start();
}

boot().catch((err) => {
  console.error("[GLASSWATER] boot failed:", err);
  const mount = document.getElementById("app");
  if (mount) {
    mount.innerHTML =
      '<div style="color:#cdeee6;font-family:Inter,sans-serif;display:grid;place-items:center;height:100vh;text-align:center">' +
      "<div><h2>GLASSWATER failed to start</h2><p>Check the console for details.</p></div></div>";
  }
});

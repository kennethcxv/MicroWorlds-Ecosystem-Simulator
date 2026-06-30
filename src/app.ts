/**
 * Application controller: owns game state, wires the UI to the simulation, and
 * runs the main loop (sim → render → throttled UI refresh → autosave).
 */
import { type GameState, type ScreenId, createInitialState } from "./core/state";
import { simStep, doAction } from "./core/sim";
import { loadGame, saveGame, clearSave } from "./core/save";
import { CanvasRenderer } from "./render/canvasRenderer";
import { createLayout, type GameLayout } from "./ui/layout";
import type { Controller } from "./ui/controller";
import type { ActionId } from "./data/tanks";

export class GlasswaterApp {
  private state: GameState;
  private layout: GameLayout;
  private renderer: CanvasRenderer;
  private controller: Controller;

  private last = 0;
  private uiAccum = 0;
  private saveAccum = 0;
  private running = false;

  constructor(mount: HTMLElement) {
    this.state = loadGame() ?? createInitialState();

    // `self` keeps the controller's `state` getter pointing at the live
    // (replaceable) state object even after a reset.
    const self = this;
    this.controller = {
      get state() {
        return self.state;
      },
      dispatch: (a) => this.onAction(a),
      navigate: (s) => this.navigate(s),
      toast: (m, tone) => this.layout.toast(m, tone),
      saveNow: () => this.save(true),
      resetGame: () => this.reset(),
    };

    this.layout = createLayout(this.controller);
    mount.innerHTML = "";
    mount.append(this.layout.root);

    this.renderer = new CanvasRenderer(this.layout.canvas);

    window.addEventListener("resize", () => this.renderer.resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.save(false);
    });
    window.addEventListener("beforeunload", () => this.save(false));

    this.layout.setScreen(this.state.screen, this.state);
    this.layout.update(this.state);
    // Defer one frame so the canvas has its final laid-out size.
    requestAnimationFrame(() => this.renderer.resize());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  private loop = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;

    simStep(this.state, dt);

    if (this.state.screen === "aquarium") {
      this.renderer.render(this.state, dt);
    }

    // Throttle DOM updates to ~12 Hz to avoid layout thrash.
    this.uiAccum += dt;
    if (this.uiAccum >= 0.08) {
      this.layout.update(this.state);
      this.uiAccum = 0;
    }

    // Autosave every 8 s.
    this.saveAccum += dt;
    if (this.saveAccum >= 8) {
      this.save(false);
      this.saveAccum = 0;
    }

    requestAnimationFrame(this.loop);
  };

  private onAction(a: ActionId): void {
    const result = doAction(this.state, a);
    this.layout.toast(result.message, result.tone);
    this.layout.update(this.state);
  }

  private navigate(screen: ScreenId): void {
    this.state.screen = screen;
    this.layout.canvas.style.visibility = screen === "aquarium" ? "visible" : "hidden";
    this.layout.setScreen(screen, this.state);
    if (screen === "aquarium") this.renderer.resize();
    this.layout.update(this.state);
  }

  private save(notify: boolean): void {
    const ok = saveGame(this.state);
    if (notify) this.layout.toast(ok ? "Game saved." : "Couldn't save.", ok ? "good" : "warn");
  }

  private reset(): void {
    clearSave();
    this.state = createInitialState();
    this.navigate("aquarium");
    this.layout.toast("Started a fresh eco-center.", "info");
  }
}

/**
 * Application controller: owns game state, wires the UI to the simulation, and
 * runs the main loop (sim → render → throttled UI refresh → autosave).
 */
import { type GameState, type ScreenId, createInitialState } from "./core/state";
import { simStep, doAction, resetSimState } from "./core/sim";
import { loadGame, saveGame, clearSave } from "./core/save";
import { CanvasRenderer } from "./render/canvasRenderer";
import type { ThreeHabitatRenderer } from "./render/three/ThreeHabitatRenderer";
import type { HabitatKind } from "./render/three/ThreeHabitat";
import { ASSETS } from "./data/assets";
import { createLayout, type GameLayout } from "./ui/layout";
import { LizardHud } from "./ui/lizardHud";
import { HabitatEditorPanel } from "./ui/habitatEditor";
import { AnimalInfoPanel } from "./ui/animalInfo";
import { ShortcutsOverlay } from "./ui/careModes";
import { GwCareDrawers, type CleanAction } from "./ui/gwDrawers";
import { sfx } from "./render/sfx";
import { GwModeMachine, regionsFor, type GwMode } from "./ui/gwModes";
import type { Controller } from "./ui/controller";
import type { ActionId } from "./data/tanks";

type TankMode = "2d" | "3d";

export class GlasswaterApp {
  private state: GameState;
  private layout: GameLayout;
  private renderer: CanvasRenderer;
  private controller: Controller;
  private lizardHud: LizardHud;
  private hudEl: HTMLElement | null = null;
  private editorPanel: HabitatEditorPanel | null = null;
  private editing = false;
  private animalPanel: AnimalInfoPanel;
  private animalInfoOpen = false;
  private debugLegend: HTMLElement | null = null;
  // One active UI mode (gecko-main / feed / clean / terrain / decorate /
  // animal-info / photo) — the pure machine decides which regions show.
  private uiMode = new GwModeMachine();
  private drawers: GwCareDrawers;
  private helpSheet: ShortcutsOverlay;
  private careStroking = false;

  private last = 0;
  private uiAccum = 0;
  private saveAccum = 0;
  private running = false;

  // Experimental hybrid 3D tank (lazily created on first switch; the 2D
  // CanvasRenderer above stays the default and the fallback).
  private three: ThreeHabitatRenderer | null = null;
  private threeLoading = false;
  private tankMode: TankMode = "2d";
  private habitat: HabitatKind = "fish";
  private backdrop3d: HTMLElement | null = null;
  private viewButtons: { btn: HTMLButtonElement; mode: TankMode; habitat: HabitatKind }[] = [];

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

    // Lizard-habitat HUD overlay (shown only in 3D lizard mode; the fish tank
    // UI beneath is untouched). Mounted before the view switch so the switch
    // stays on top + clickable.
    this.lizardHud = new LizardHud({
      requestMode: (m) => this.requestMode(m),
      cameraPreset: (name) => this.three?.cameraPreset(name as never),
      focusAnimal: () => this.three?.focusAnimal(),
      resetCamera: () => this.three?.resetCamera(),
      toggleDebug: () => this.three?.controller?.toggleDebug() ?? false,
      toggleDebugOption: (key) => this.three?.controller?.toggleDebugOption(key as never) ?? false,
      debugOptions: () =>
        this.three?.controller?.debugOptions() ?? { collisions: false, feet: false, normals: false, terrain: false },
      help: () => this.helpSheet.toggle(),
      addSpecies: () => this.layout.toast("Species catalog is coming soon.", "info"),
    });
    this.lizardHud.mount(this.layout.root);
    this.hudEl = this.layout.root.querySelector(".hud");

    // Bottom drawers (Clean / Feed / Terrain) + the H shortcuts sheet.
    this.drawers = new GwCareDrawers();
    this.drawers.mount(this.layout.root);
    this.drawers.onDone(() => this.uiMode.escape());
    this.drawers.onStrong((on) => this.three?.controller?.setStrongBrush(on));
    this.drawers.onFeedNow(() => this.serveFeed());
    this.drawers.onCinematic(() => {
      const c = this.three?.controller;
      if (!c) return;
      // Start the serving (unless one is already running), then go full-screen.
      if (!c.presentationActive()) {
        const res = c.serveMealNow(this.drawers.selected, this.drawers.portion, this.drawers.method, this.drawers.supplement);
        if (res.placed === 0) {
          this.drawers.setNote(`⚠ ${res.reason ?? "Couldn't serve."}`, true);
          return;
        }
      }
      this.requestMode("cinematic");
    });
    this.drawers.onIntakeOpen(() => {
      const c = this.three?.controller;
      if (c) this.drawers.renderIntake(c.feedingHistory(), c.intake());
    });
    this.drawers.onMethodChange((m) => {
      const c = this.three?.controller;
      if (!c) return;
      // Dish/tong/hand preview their serve point right away; quick waits for
      // the pointer (the dashed marker follows it).
      if (m === "quick") c.clearFeedHover();
      else c.feedHover({ x: 0, z: 0.2 }, m);
    });
    this.drawers.onCleanAction((a) => this.cleanAction(a));
    this.helpSheet = new ShortcutsOverlay();
    this.helpSheet.mount(this.layout.root);

    // Right-side Animal Info panel (Animal Info dock card or click the gecko).
    this.animalPanel = new AnimalInfoPanel({
      feed: () => this.requestMode("feed"),
      focus: () => this.three?.focusAnimal(),
      details: () => this.lizardHud.openDetails(),
      close: () => this.uiMode.escape(),
    });
    this.animalPanel.mount(this.layout.root);

    // The machine drives every region change (one place, no drift).
    this.uiMode.onChange((next, prev) => this.applyUiMode(next, prev));
    window.addEventListener("keydown", (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") {
        if (this.helpSheet.open) return this.helpSheet.toggle(false);
        if (this.uiMode.mode === "decorate") {
          // Let the editor's own Esc handle cancel-placement / deselect first.
          const ed = this.three?.getEditor();
          if (ed?.armedDefId || ed?.selectedSummary()) return;
        }
        if (this.uiMode.mode !== "gecko-main") {
          this.uiMode.escape();
          return;
        }
        this.lizardHud.closeFlyouts();
      }
      if (e.key === "Home" && this.tankMode === "3d" && this.state.screen === "aquarium") this.three?.resetCamera();

      // Lizard-habitat shortcuts (normal view; Decorate mode has its own keys).
      const lizardLive = this.tankMode === "3d" && this.habitat === "lizard" && this.state.screen === "aquarium" && !this.editing;
      if (!lizardLive) return;
      if (this.drawers.mode) {
        // Inside a drawer mode: 1–6 pick the card, [ ] size the brush, Enter done.
        if (e.key >= "1" && e.key <= "6") this.drawers.selectIndex(Number(e.key) - 1);
        else if (e.key === "[") this.drawers.adjustRadius(-1);
        else if (e.key === "]") this.drawers.adjustRadius(1);
        else if (e.key === "Enter") this.uiMode.escape();
        return;
      }
      switch (e.key) {
        case "d":
        case "D":
          this.requestMode("decorate");
          break;
        case "b":
        case "B":
          this.requestMode("clean");
          break;
        case "f":
        case "F":
          this.requestMode("feed");
          break;
        case "t":
        case "T":
          this.requestMode("terrain");
          break;
        case "p":
        case "P":
          this.requestMode("photo");
          break;
        case "v":
        case "V":
          this.requestMode("cinematic");
          break;
        case "h":
        case "H":
          this.helpSheet.toggle();
          break;
      }
    });

    window.addEventListener("resize", () => {
      this.renderer.resize();
      this.three?.resize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.save(false);
    });
    window.addEventListener("beforeunload", () => this.save(false));

    this.layout.setScreen(this.state.screen, this.state);
    this.layout.update(this.state);
    // Defer one frame so the canvas has its final laid-out size.
    requestAnimationFrame(() => this.renderer.resize());

    this.createViewSwitch();
    const init = this.readInitialView();
    this.select(init.mode, init.habitat);

    // Read-only QA hook (Playwright drives the care modes through real handlers).
    Object.assign(globalThis, {
      __app: {
        uiMode: () => this.uiMode.mode,
        requestMode: (m: string) => this.requestMode(m as GwMode),
        careMode: () => this.drawers.mode,
        applyCareAt: (cx: number, cy: number) => this.applyCareAt(cx, cy),
        groundAt: (cx: number, cy: number) => this.three?.groundAt(cx, cy) ?? null,
        helpOpen: () => this.helpSheet.open,
      },
    });
  }

  /** Enter/toggle a UI mode from the dock, slim nav, keys, or the camera button. */
  private requestMode(m: GwMode): void {
    const lizardLive = this.tankMode === "3d" && this.habitat === "lizard" && this.state.screen === "aquarium";
    if (!lizardLive) {
      this.layout.toast("Open the 3D Lizard habitat first.", "info");
      return;
    }
    if ((m === "feed" || m === "clean" || m === "terrain" || m === "decorate") && !this.three?.controller) {
      this.layout.toast("Habitat still loading — try again in a moment.", "warn");
      return;
    }
    this.uiMode.request(m);
  }

  /** The ONE place a mode change touches the world: drawers, editor, panel,
   *  camera, clean-spot rings, pointer ownership, HUD regions. */
  private applyUiMode(next: GwMode, prev: GwMode): void {
    const c = this.three?.controller;
    const r = regionsFor(next);

    // Bottom drawers (feed / clean / terrain share the drag-brush plumbing).
    if (r.drawer === "feed" || r.drawer === "clean" || r.drawer === "terrain") {
      this.drawers.open(r.drawer, c?.foodOptions() ?? []);
      if (c) {
        this.drawers.updateCleanProgress(c.cleanStatus());
        const s = c.readState();
        this.drawers.updateFeedInfo({
          next: c.nextFeeding(),
          feeders: s.feederCount,
          hunger: c.animalInfo().hunger,
          dish: c.dishInfo(),
          presenting: c.presentationActive(),
        });
      }
      this.three?.setLeftOrbit(false); // left = the brush/drop; middle/right = camera
    } else {
      this.drawers.close();
      this.careStroking = false;
      if (next !== "decorate") this.three?.setLeftOrbit(true);
    }

    // Cinematic: the scene drives its follow camera + the HUD letterboxes.
    if (next === "cinematic") c?.setCinematic(true);
    else if (prev === "cinematic") c?.setCinematic(false);

    // Leaving feed → drop the placement marker + restore the OS cursor.
    if (prev === "feed" && next !== "feed") {
      c?.clearFeedHover();
      if (this.three) this.three.canvas.style.cursor = "";
    }
    // Leaving clean → put the sponge away + restore the OS cursor + stop scrubbing.
    if (prev === "clean" && next !== "clean") {
      c?.clearCleanHover();
      sfx.brushStop();
      if (this.three) this.three.canvas.style.cursor = "";
    }

    // Amber rings over the dirty spots while cleaning.
    c?.setCleanHighlights(next === "clean");

    // Decorate mode owns the editor lifecycle.
    if (next === "decorate") this.enterEditor();
    else if (prev === "decorate") this.exitEditor();

    // Right-side Animal Info panel + gecko highlight.
    if (next === "animal-info") this.openAnimalPanel();
    else this.closeAnimalPanel();

    // Photo mode frees the camera; decorate manages its own camera.
    if (next === "photo") this.three?.setCameraMode("photo");
    else if (prev === "photo") this.three?.setCameraMode("normal");

    // Finally: which HUD regions show + active highlights.
    this.lizardHud.applyMode(next, r);
  }

  /** Serve the drawer's current selection with its staged presentation. `at`
   *  is the quick-feed marker point (click on the sand); other methods aim
   *  themselves (dish pour / offered right to the gecko). */
  private serveFeed(at?: { x: number; z: number }): void {
    const c = this.three?.controller;
    if (!c) return;
    const res = c.serveMealNow(this.drawers.selected, this.drawers.portion, this.drawers.method, this.drawers.supplement, at);
    if (res.placed > 0) {
      this.drawers.setNote(res.reason ? `Serving ${res.placed} — ${res.reason}.` : `Serving ${res.placed} — watch the tank!`, false);
    } else {
      this.drawers.setNote(`⚠ ${res.reason ?? "Couldn't serve."}`, true);
    }
  }

  /** One-click cleaning cards (Replace Water / Remove Waste) — each a real
   *  distinct behaviour with its own animation + sound. (Wipe Glass is a drag
   *  TOOL on the front pane, not a one-click.) */
  private cleanAction(a: CleanAction): void {
    const c = this.three?.controller;
    if (!c) return;
    if (a === "removeWaste") {
      const r = c.removeWasteNow();
      if (r.scooped > 0) {
        this.drawers.setNote(`Scooped ${r.scooped} dropping${r.scooped > 1 ? "s" : ""}. ✨`, false);
      } else if (r.cleanedSpot) {
        this.drawers.setNote("No droppings — cleared the dirtiest patch instead. ✨", false);
      } else {
        this.drawers.setNote("Nothing to remove — the habitat is tidy. ✨", false);
      }
    } else {
      const ok = c.replaceWaterNow();
      this.drawers.setNote(ok ? "Water dish emptied and refilled. 💧" : "No water dish placed — add one in Decorate.", !ok);
    }
    this.drawers.updateCleanProgress(c.cleanStatus());
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
      if (this.tankMode === "3d" && this.three) this.three.render(dt);
      else this.renderer.render(this.state, dt);
    }

    // Throttle DOM updates to ~12 Hz to avoid layout thrash.
    this.uiAccum += dt;
    if (this.uiAccum >= 0.08) {
      this.layout.update(this.state);
      const c = this.three?.controller;
      if (this.lizardHud.visible && c) {
        const hud = c.readState();
        const info = c.animalInfo();
        const clean = c.cleanliness();
        const spots = c.dirtSpots().length;
        this.lizardHud.update(hud, info, clean, spots);
        if (this.uiMode.mode === "clean") this.drawers.updateCleanProgress(c.cleanStatus());
        else if (this.uiMode.mode === "feed") {
          this.drawers.updateFeedInfo({
            next: c.nextFeeding(),
            feeders: hud.feederCount,
            hunger: info.hunger,
            dish: c.dishInfo(),
            presenting: c.presentationActive(),
          });
        }
        if (this.animalInfoOpen) this.animalPanel.update(info);
      }
      this.updateLegend(c ?? null);
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
    if (a === "feed" && this.tankMode === "3d") this.three?.excite();
    this.layout.toast(result.message, result.tone);
    this.layout.update(this.state);
  }

  private navigate(screen: ScreenId): void {
    this.state.screen = screen;
    this.layout.setScreen(screen, this.state);
    this.applyCanvasVisibility();
    if (screen === "aquarium") {
      this.renderer.resize();
      this.three?.resize(window.innerWidth, window.innerHeight);
    }
    this.layout.update(this.state);
  }

  private save(notify: boolean): void {
    const ok = saveGame(this.state);
    if (notify) this.layout.toast(ok ? "Game saved." : "Couldn't save.", ok ? "good" : "warn");
  }

  private reset(): void {
    clearSave();
    resetSimState(); // fresh RNG stream + clear stale warnings so the new game is reproducible
    this.state = createInitialState();
    this.navigate("aquarium");
    this.layout.toast("Started a fresh eco-center.", "info");
  }

  // ── Experimental 3D habitats (fish / spider / lizard) ─────────────────────

  private readInitialView(): { mode: TankMode; habitat: HabitatKind } {
    const p = new URLSearchParams(window.location.search);
    const hq = p.get("habitat");
    const tank = p.get("tank");
    const stored = localStorage.getItem("gw_habitat");
    let habitat: HabitatKind = "fish";
    // "creatures" = the dev-only Creature Lab (URL-only, no switch button).
    for (const h of ["fish", "spider", "lizard", "creatures"] as HabitatKind[]) {
      if (hq === h || (!hq && stored === h)) habitat = h;
    }
    let mode: TankMode;
    if (hq) mode = "3d"; // naming a habitat implies 3D
    else if (tank === "3d") mode = "3d";
    else if (tank === "2d") mode = "2d";
    else mode = localStorage.getItem("gw_tank_mode") === "3d" ? "3d" : "2d";
    return { mode, habitat };
  }

  private select(mode: TankMode, habitat?: HabitatKind): void {
    if (this.uiMode.mode !== "gecko-main") this.uiMode.escape(); // leaving the habitat closes any open mode
    this.tankMode = mode;
    if (habitat) this.habitat = habitat;
    try {
      localStorage.setItem("gw_tank_mode", mode);
      // The dev-only Creature Lab is never persisted — a plain reload always
      // returns to the player's real habitat.
      if (this.habitat !== "creatures") localStorage.setItem("gw_habitat", this.habitat);
    } catch {
      /* private mode / quota — non-fatal */
    }
    if (mode === "3d") {
      if (this.three) {
        void this.three.setHabitat(this.habitat).then(() => this.applyCanvasVisibility());
      } else {
        void this.ensureThree();
      }
    }
    this.applyCanvasVisibility();
    this.updateToggleState();
  }

  /** Lazily import + create the WebGL habitat renderer on first use, so 2D-only
   *  players never download or pay for Three.js. The 2D canvas stays visible
   *  until the 3D scene is ready, so the switch never flashes blank. */
  private async ensureThree(): Promise<void> {
    if (this.three || this.threeLoading) return;
    this.threeLoading = true;
    try {
      const { ThreeHabitatRenderer } = await import("./render/three/ThreeHabitatRenderer");
      const three = new ThreeHabitatRenderer();
      const root = this.layout.root;

      // Cozy room shows behind the transparent 3D canvas (same plate as 2D mode).
      const backdrop = document.createElement("div");
      backdrop.className = "tank3d-backdrop";
      backdrop.style.backgroundImage = `url("${ASSETS.room.ecocenter}")`;
      root.insertBefore(backdrop, this.layout.canvas.nextSibling);
      root.insertBefore(three.canvas, backdrop.nextSibling);

      // Click the gecko (in normal view) to open its info panel. In Decorate mode
      // the editor routes animal clicks itself, so skip here to avoid a double
      // toggle; in drawer modes the click IS the brush/drop.
      three.canvas.addEventListener("click", (e) => {
        if (this.editing || this.drawers.mode) return;
        if (this.tankMode !== "3d" || this.habitat !== "lizard") return;
        const mode = this.uiMode.mode;
        if (mode !== "gecko-main" && mode !== "animal-info") return;
        if (three.pickAnimal(e.clientX, e.clientY)) {
          if (mode !== "animal-info") this.uiMode.request("animal-info");
        } else if (mode === "animal-info") {
          this.uiMode.escape();
        }
      });

      // Drawer modes own the LEFT button on the canvas: Feed drops an insect per
      // click; Clean/Terrain apply their brush while dragging. Window-level with
      // capture (like the editor) so a pointer capture elsewhere can't swallow
      // the gesture; e.target keeps DOM-panel clicks out.
      window.addEventListener(
        "pointerdown",
        (e) => {
          if (e.button !== 0 || !this.drawers.mode || e.target !== three.canvas) return;
          e.stopImmediatePropagation();
          this.careStroking = true;
          // The scrub SOUND runs for as long as the tool is dragged (the
          // squeegee adds its own throttled squeaks on top).
          if (this.drawers.mode === "clean") sfx.brushStart();
          this.applyCareAt(e.clientX, e.clientY);
        },
        true,
      );
      window.addEventListener(
        "pointermove",
        (e) => {
          if (!this.careStroking || !this.drawers.mode || this.drawers.mode === "feed") return;
          this.applyCareAt(e.clientX, e.clientY);
        },
        true,
      );
      window.addEventListener("pointerup", () => {
        this.careStroking = false;
        sfx.brushStop();
      });

      // POINTER FEEDBACK over the vivarium — never just a bare cursor: in feed
      // mode the dashed teal placement marker rides the sand under the pointer
      // (the OS cursor hides); hovering the gecko glows it + shows a pointer.
      three.canvas.addEventListener("pointermove", (e) => {
        if (this.tankMode !== "3d" || this.habitat !== "lizard" || this.editing) return;
        const c = three.controller;
        if (!c) return;
        const mode = this.uiMode.mode;
        const g = three.groundAt(e.clientX, e.clientY);
        if (mode === "feed") {
          // While a presentation is on stage (hand / pour / toss), the props
          // ARE the feedback — no marker on top.
          if (c.presentationActive()) {
            c.clearFeedHover();
            three.canvas.style.cursor = "";
            return;
          }
          const r = c.feedHover(g, this.drawers.method);
          three.canvas.style.cursor = r.overGecko ? "pointer" : g && this.drawers.method === "quick" ? "none" : "";
        } else if (mode === "clean") {
          // The CLEANING TOOL rides the pointer instead of a bare cursor:
          // scoop (Spot Clean) / hand brush (Brush Sand) on the sand, the
          // SQUEEGEE on the front glass (Wipe Glass).
          const sel = this.drawers.selected;
          if (sel === "wipe") {
            const pane = c.glassPane();
            const pt = three.pointAtZ(e.clientX, e.clientY, pane.z);
            const onPane =
              !!pt &&
              Math.abs(pt.x - pane.cx) <= pane.w / 2 + 0.05 &&
              pt.y >= pane.cy - pane.h / 2 - 0.05 &&
              pt.y <= pane.cy + pane.h / 2 + 0.05;
            c.wipeHover(onPane ? pt : null, this.careStroking);
            three.canvas.style.cursor = onPane ? "none" : "";
          } else if ((sel === "spot" || sel === "sweep") && g) {
            c.cleanHover(g, this.careStroking, this.drawers.radius, sel);
            three.canvas.style.cursor = "none";
          } else {
            c.clearCleanHover();
            three.canvas.style.cursor = "";
          }
        } else if (mode === "gecko-main" || mode === "animal-info") {
          const gp = c.geckoPosition();
          const over = !!g && Math.hypot(g.x - gp.x, g.z - gp.z) < 0.2;
          c.setGeckoHover(over);
          three.canvas.style.cursor = over ? "pointer" : "";
        } else if (mode !== "terrain") {
          three.canvas.style.cursor = "";
        }
      });
      three.canvas.addEventListener("pointerleave", () => {
        three.controller?.clearFeedHover();
        three.controller?.clearCleanHover();
        three.canvas.style.cursor = "";
      });

      // (The tong wheel-height listener lived here — parked with the tong
      // mechanic; controller.adjustOffer stays for when it returns.)

      this.three = three;
      this.backdrop3d = backdrop;
      three.resize(window.innerWidth, window.innerHeight);
      void three.setHabitat(this.habitat).then(() => this.applyCanvasVisibility());
      this.applyCanvasVisibility();
    } catch (err) {
      console.error("[GLASSWATER] 3D habitat module failed to load:", err);
    } finally {
      this.threeLoading = false;
    }
  }

  private applyCanvasVisibility(): void {
    const aquarium = this.state.screen === "aquarium";
    const ready3d = this.tankMode === "3d" && !!this.three;
    // Keep the 2D canvas up until the 3D scene exists (no blank flash on switch).
    this.layout.canvas.style.visibility = aquarium && !ready3d ? "visible" : "hidden";
    if (this.three) this.three.canvas.style.display = aquarium && ready3d ? "block" : "none";
    if (this.backdrop3d) this.backdrop3d.style.display = aquarium && ready3d ? "block" : "none";
    // Lizard HUD only when the 3D lizard habitat is the active view; while it
    // owns the screen, hide the aquarium's own HUD chrome (the view switch +
    // lizard HUD are siblings of `.hud`, so they stay visible).
    const showLizard = aquarium && ready3d && this.habitat === "lizard";
    // Navigated away from the lizard 3D view → back to the main mode (closes
    // the editor / drawers / panel through the machine).
    if (!showLizard && this.uiMode.mode !== "gecko-main") this.uiMode.escape();
    this.lizardHud.setVisible(showLizard);
    // The dev Creature Lab owns the whole screen too — the aquarium HUD would
    // bury the stations + its own side panel.
    const bareScene = showLizard || (aquarium && ready3d && this.habitat === "creatures");
    if (this.hudEl) this.hudEl.style.display = bareScene ? "none" : "";
  }

  /** Apply the open drawer mode at a canvas pixel (pointer → substrate → system). */
  private applyCareAt(clientX: number, clientY: number): void {
    const c = this.three?.controller;
    const mode = this.drawers.mode;
    if (!c || !mode) return;
    // WIPE GLASS strokes live on the front PANE, not the sand.
    if (mode === "clean" && this.drawers.selected === "wipe") {
      const pane = c.glassPane();
      const pt = this.three!.pointAtZ(clientX, clientY, pane.z);
      if (pt && Math.abs(pt.x - pane.cx) <= pane.w / 2 + 0.05 && pt.y >= pane.cy - pane.h / 2 - 0.05 && pt.y <= pane.cy + pane.h / 2 + 0.05) {
        c.wipeStrokeAt(pt.x, pt.y);
      }
      return;
    }
    const g = this.three!.groundAt(clientX, clientY);
    if (!g) return;
    if (mode === "clean") {
      c.brushClean(g.x, g.z, this.drawers.radius);
    } else if (mode === "feed") {
      // Quick Feed: the click IS the serve — the whole portion tosses in at the
      // marker. The aimed methods (dish/tong/hand) serve via Start Feeding.
      if (this.drawers.method === "quick") {
        const probe = c.feedHover(g, "quick");
        if (!probe.valid) {
          this.drawers.setNote(`⚠ ${probe.reason ?? "Can't serve there"}`, true);
          return;
        }
        this.serveFeed({ x: g.x, z: g.z });
      } else {
        this.drawers.setNote(
          this.drawers.method === "dish"
            ? "Place in Dish aims itself — press Start Feeding."
            : "This method offers straight to the gecko — press Start Feeding.",
          false,
        );
      }
    } else {
      // Intensity = extra brush passes per stroke sample (1–3).
      for (let i = 0; i < this.drawers.intensity; i++) {
        c.sculptAt(this.drawers.selected as never, g.x, g.z, this.drawers.radius);
      }
    }
  }

  // ── Decorate mode (lizard habitat editor) — entered via the mode machine ──

  private enterEditor(): void {
    const editor = this.three?.getEditor();
    if (!editor) {
      this.layout.toast("Habitat still loading — try again in a moment.", "warn");
      this.uiMode.escape();
      return;
    }
    if (!this.editorPanel) {
      this.editorPanel = new HabitatEditorPanel(() => this.uiMode.escape());
      this.editorPanel.mount(this.layout.root);
    }
    editor.onAnimalPick(() => this.requestMode("animal-info")); // clicking the gecko → info panel
    editor.enable();
    this.editorPanel.open(editor);
    this.editing = true;
    // Building wants the free camera (advanced inspect); normal viewing is anchored.
    this.three?.setCameraMode("photo");
    this.layout.toast("Decorate Mode — click a piece, then click the sand to place it.", "info");
  }

  // ── Animal info card + collision legend ───────────────────────────────────

  private openAnimalPanel(): void {
    const c = this.three?.controller;
    if (!c || this.habitat !== "lizard") return;
    this.animalInfoOpen = true;
    this.animalPanel.update(c.animalInfo());
    this.animalPanel.open();
    c.highlightAnimal(true);
  }

  private closeAnimalPanel(): void {
    if (!this.animalInfoOpen) return;
    this.animalInfoOpen = false;
    this.animalPanel.close();
    this.three?.controller?.highlightAnimal(false);
  }

  /** Show a small colour legend whenever the collision debug overlay is on. */
  private updateLegend(c: { debugVisible(): boolean } | null): void {
    const show = this.state.screen === "aquarium" && this.tankMode === "3d" && this.habitat === "lizard" && !!c?.debugVisible();
    if (!show) {
      if (this.debugLegend) this.debugLegend.style.display = "none";
      return;
    }
    if (!this.debugLegend) this.debugLegend = this.buildLegend();
    this.debugLegend.style.display = "block";
  }

  private buildLegend(): HTMLElement {
    if (!document.getElementById("collide-legend-styles")) {
      const style = document.createElement("style");
      style.id = "collide-legend-styles";
      style.textContent = `
      .collide-legend { position: fixed; z-index: 5; left: clamp(12px,1.6vw,22px); bottom: clamp(84px,12vh,120px);
        pointer-events: none; background: rgba(8,26,30,0.82); border: 1px solid rgba(95,208,221,0.24);
        backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-radius: 12px; padding: 10px 12px;
        font: 500 11.5px/1.4 var(--font, system-ui, sans-serif); color: var(--ink,#e7f6f2); box-shadow: 0 8px 26px rgba(0,0,0,0.45); }
      .collide-legend .cl-title { font-weight: 800; font-size: 10.5px; letter-spacing: 1px; text-transform: uppercase;
        color: var(--ink-dim,#9fc4c4); margin-bottom: 6px; }
      .collide-legend .cl-row { display: flex; align-items: center; gap: 8px; padding: 1px 0; }
      .collide-legend .cl-sw { width: 13px; height: 13px; border-radius: 4px; flex: 0 0 auto; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.35); }
      `;
      document.head.append(style);
    }
    const box = document.createElement("div");
    box.className = "collide-legend";
    const rows: [string, string][] = [
      ["#ff5a5a", "Blocked / wall — route around"],
      ["#2dff93", "Climbable — climb over"],
      ["#3fd0ff", "Low obstacle — step over"],
      ["#ffb020", "Hide"],
      ["#9a7bff", "Soft — minor overlap ok"],
      ["#ffffff", "Enclosure bounds"],
      ["#9ad8ff", "Animal body probes"],
    ];
    const title = document.createElement("div");
    title.className = "cl-title";
    title.textContent = "Collision legend";
    box.append(title);
    for (const [color, label] of rows) {
      const row = document.createElement("div");
      row.className = "cl-row";
      const sw = document.createElement("span");
      sw.className = "cl-sw";
      sw.style.background = color;
      const tx = document.createElement("span");
      tx.textContent = label;
      row.append(sw, tx);
      box.append(row);
    }
    this.layout.root.append(box);
    return box;
  }

  private exitEditor(): void {
    if (!this.editing) return;
    this.editing = false;
    this.three?.getEditor()?.disable();
    this.editorPanel?.close();
    this.three?.setCameraMode("normal"); // back to the anchored eco-center view
  }

  private createViewSwitch(): void {
    const group = document.createElement("div");
    group.className = "tank-mode-switch";

    const make = (label: string, mode: TankMode, habitat: HabitatKind): void => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tank-mode-btn";
      b.textContent = label;
      b.addEventListener("click", () => {
        this.select(mode, habitat);
        this.layout.toast(
          mode === "2d" ? "2D aquarium." : `3D ${habitat} habitat (experimental).`,
          "info",
        );
      });
      group.append(b);
      this.viewButtons.push({ btn: b, mode, habitat });
    };

    make("◧ 2D Aquarium", "2d", "fish");
    make("🐟 3D Fish", "3d", "fish");
    make("🕷 3D Spider", "3d", "spider");
    make("🦎 3D Lizard", "3d", "lizard");
    this.layout.root.append(group);
    this.updateToggleState();
  }

  private updateToggleState(): void {
    for (const v of this.viewButtons) {
      const active =
        v.mode === "2d"
          ? this.tankMode === "2d"
          : this.tankMode === "3d" && this.habitat === v.habitat;
      v.btn.classList.toggle("is-active", active);
    }
  }
}

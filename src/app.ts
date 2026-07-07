/**
 * Application controller: owns game state, wires the UI to the simulation, and
 * runs the main loop (sim → render → throttled UI refresh → autosave).
 *
 * Player-facing navigation (the unified-game milestone):
 *   HOME HUB  →  Vivarium (3D gecko)  |  Aquarium (3D fish)  |  Shop / Inventory
 *   / Guide / Album / Settings. The old 2D aquarium chrome and the spider box
 *   are legacy: reachable only via dev URLs (?tank=2d, ?habitat=spider) or as
 *   the automatic fallback when WebGL fails — never from the player UI.
 */
import { type GameState, type ScreenId, createInitialState, getActiveTank } from "./core/state";
import { simStep, doAction, pushEvent } from "./core/sim";
import { loadGame, saveGame } from "./core/save";
import { CanvasRenderer } from "./render/canvasRenderer";
import type { ThreeHabitatRenderer } from "./render/three/ThreeHabitatRenderer";
import type { HabitatKind, FishFoodKind } from "./render/three/ThreeHabitat";
import { ASSETS } from "./data/assets";
import { createLayout, type GameLayout } from "./ui/layout";
import { LizardHud } from "./ui/lizardHud";
import { FishHud } from "./ui/fishHud";
import { FrogHud } from "./ui/frogHud";
import { HomeHub, loadHubMeta, saveHubMeta, type PlayerHabitat } from "./ui/homeHub";
import { HubScreens } from "./ui/hubScreens";
import type { HabitatsLiveData } from "./ui/habitatsScreen";
import { EMPTY_STREAK, bumpStreak, type CareStreak } from "./data/habitats";
import { SettingsScreen } from "./ui/settingsScreen";
import { LoadingOverlay } from "./ui/loadingOverlay";
import { ToastHost } from "./ui/toasts";
import { albumCount, captureToAlbum, shutterFlash } from "./ui/albumScreen";
import { PhotoAlbumScreen } from "./ui/photoAlbumScreen";
import { HabitatEditorPanel } from "./ui/habitatEditor";
import { AnimalInfoPanel } from "./ui/animalInfo";
import { ShortcutsOverlay } from "./ui/careModes";
import { GwCareDrawers, type TerrainTab } from "./ui/gwDrawers";
import { SubstrateSelection } from "./ui/substrateSelection";
import { terrainById, terrainUnlocked } from "./data/terrains";
import { toolById } from "./data/terrainTools";
import { sfx } from "./render/sfx";
import { GwModeMachine, regionsFor, type GwMode } from "./ui/gwModes";
import type { Controller } from "./ui/controller";
import type { ActionId } from "./data/tanks";
import {
  loadStock,
  saveStock,
  consumeSupply,
  stockCount,
  supplyById,
  decorPrice,
  type Stock,
} from "./game/economy";
import {
  loadOwned,
  saveOwned,
  addOwned,
  consumeOwned,
  ownedCount,
  sellOwned,
  sellAllSpares,
  readInUse,
  loadAcquired,
  saveAcquired,
  markAcquired,
  loadBuyback,
  saveBuyback,
  pushBuyback,
  takeBuyback,
  SELL_BACK_RATE,
} from "./game/decorInventory";
import { checkout as shopCheckout, type CartLine } from "./data/shopCatalog";
import { findPlaceable } from "./habitats/HabitatBuilder";
import { LIZARD_HABITAT_ID, makeLizardHabitatLayout } from "./habitats/lizard/LizardHabitatData";
import { FROG_HABITAT_ID, makeFrogHabitatLayout } from "./habitats/frog/FrogHabitatData";
import { fmtClockPref, getPrefs, onPrefsChange, type Prefs } from "./ui/prefs";
import { clamp01 } from "./utils/math";

type TankMode = "2d" | "3d";

type BootTarget = { kind: "hub" } | { kind: "habitat"; habitat: HabitatKind } | { kind: "legacy2d" };

export class GlasswaterApp {
  private state: GameState;
  private layout: GameLayout;
  private renderer: CanvasRenderer;
  private controller: Controller;
  private lizardHud: LizardHud;
  private fishHud: FishHud;
  private frogHud: FrogHud;
  private hub: HomeHub;
  private hubScreens: HubScreens;
  private settings: SettingsScreen;
  private loading = new LoadingOverlay();
  private toasts = new ToastHost();
  private hudEl: HTMLElement | null = null;
  private editorPanel: HabitatEditorPanel | null = null;
  /** Piece queued by the Inventory's "Place in Habitat" (armed on editor open). */
  private pendingDecorArm: string | null = null;
  private editing = false;
  private animalPanel: AnimalInfoPanel;
  private animalInfoOpen = false;
  private debugLegend: HTMLElement | null = null;
  // One active UI mode per habitat — the pure machines decide which regions
  // show (lizard home = gecko-main; fish home = fish-main; frog = frog-main).
  private uiMode = new GwModeMachine("gecko-main");
  private fishMode = new GwModeMachine("fish-main");
  private frogMode = new GwModeMachine("frog-main");
  private drawers: GwCareDrawers;
  private helpSheet: ShortcutsOverlay;
  private album!: PhotoAlbumScreen;
  private careStroking = false;
  private fishStroking = false;
  private squeakT = 0;
  // Consumable supplies (feeders + fish food) — the light economy layer.
  private stock: Stock;
  // Terrain editor: Materials preview/apply state (pure, tested) + the
  // Filters tab's selection, and a per-stroke latch for the Paint tool.
  private substrateSel: SubstrateSelection | null = null;
  private filterSel = { id: "hide_coverage", opacity: 0.6, intensity: 0.8 };
  private paintedThisStroke = false;
  private filterRefreshT = 0;

  private last = 0;
  private uiAccum = 0;
  private saveAccum = 0;
  /** Settings-driven loop knobs (applySettings keeps these current). */
  private fpsCap = 0;
  private autosaveSec = 8;
  /** Real accumulated play time (ms), persisted alongside autosaves. */
  private playtimeMs = ((): number => {
    try {
      return Math.max(0, Number(localStorage.getItem("gw_playtime.v1") ?? 0)) || 0;
    } catch {
      return 0;
    }
  })();
  private running = false;
  private resetting = false;

  // The WebGL habitat renderer (lazily created on first entry). The 2D
  // CanvasRenderer remains ONLY as the WebGL-failure fallback + dev view.
  private three: ThreeHabitatRenderer | null = null;
  private threeLoading = false;
  private tankMode: TankMode = "3d";
  private habitat: HabitatKind = "fish";
  /** True when the legacy 2D aquarium chrome should be shown (dev/fallback). */
  private legacy2d = false;
  private backdrop3d: HTMLElement | null = null;
  private viewButtons: { btn: HTMLButtonElement; mode: TankMode; habitat: HabitatKind }[] = [];

  constructor(mount: HTMLElement) {
    // A reset clears storage then reloads; finish the wipe if the previous
    // page's unload handlers managed to re-save something.
    try {
      if (localStorage.getItem("gw_reset_pending")) {
        this.clearAllSaves();
        localStorage.removeItem("gw_reset_pending");
      }
    } catch {
      /* private mode */
    }

    this.state = loadGame() ?? createInitialState();
    this.stock = loadStock();
    sfx.setVolume(getPrefs().volume);

    // `self` keeps the controller's `state` getter pointing at the live
    // (replaceable) state object even after a reset.
    const self = this;
    this.controller = {
      get state() {
        return self.state;
      },
      dispatch: (a) => this.onAction(a),
      navigate: (s) => this.navigate(s),
      toast: (m, tone) => this.toasts.show(m, tone),
      saveNow: () => this.save(true),
      resetGame: () => this.reset(),
    };

    this.layout = createLayout(this.controller);
    mount.innerHTML = "";
    mount.append(this.layout.root);

    this.renderer = new CanvasRenderer(this.layout.canvas);

    // Lizard-habitat HUD overlay (shown only in 3D lizard mode).
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
      addSpecies: () => this.toasts.show("Species adoption arrives with the Collection update.", "info"),
      unstuckAnimal: () => {
        const how = this.three?.controller?.unstuckAnimal();
        this.toasts.show(
          how === "teleported"
            ? "Gave the gecko a gentle lift back to open ground."
            : how === "walking"
              ? "The gecko is climbing down to free ground."
              : "All good — the gecko shook it off.",
          "info",
        );
      },
      openAlbum: () => this.album.toggle(),
      capturePhoto: () => this.capturePhoto(),
      goHome: () => this.goHome(),
      openSettings: () => this.settings.show(),
    });
    this.lizardHud.mount(this.layout.root);
    this.hudEl = this.layout.root.querySelector(".hud");

    // Fish-habitat HUD overlay (shown only in 3D fish mode).
    this.fishHud = new FishHud({
      requestMode: (m) => this.requestFishMode(m),
      cameraPreset: (name) => this.three?.cameraPreset(name as never),
      resetCamera: () => this.three?.resetCamera(),
      goHome: () => this.goHome(),
      openSettings: () => this.settings.show(),
      openAlbum: () => this.album.toggle(),
      capturePhoto: () => this.capturePhoto(),
      serveFood: (kind, portion) => this.serveFishFood(kind, portion),
      waterChange: () => this.fishWaterChange(),
    });
    this.fishHud.mount(this.layout.root);

    // Frog-habitat HUD overlay (shown only in 3D frog mode).
    this.frogHud = new FrogHud({
      requestMode: (m) => this.requestFrogMode(m),
      cameraPreset: (name) => this.three?.cameraPreset(name as never),
      resetCamera: () => this.three?.resetCamera(),
      focusAnimal: () => this.three?.focusAnimal(),
      goHome: () => this.goHome(),
      openSettings: () => this.settings.show(),
      openAlbum: () => this.album.toggle(),
      capturePhoto: () => this.capturePhoto(),
      feed: (count) => this.serveFrogFood(count),
      mist: () => this.frogMist(),
    });
    this.frogHud.mount(this.layout.root);

    // Photo ALBUM screen (persisted shots; the shutters fill it). A standalone
    // overlay so the in-habitat 🖼 buttons return exactly where you were.
    this.album = new PhotoAlbumScreen({
      stats: () => ({
        ecoPoints: Math.floor(this.state.resources.leaves),
        habitats: 3,
        reputation: Math.floor(this.state.resources.reputation),
        dayLabel: `Day ${this.state.clock.day} · ${fmtClockPref(this.state.clock.minutes)}`,
      }),
      toast: (m) => this.toasts.show(m, "info"),
      enterHabitat: (kind) => this.enterHabitat(kind),
    });
    this.album.mount(this.layout.root);

    // Home hub + its full-screen doors, settings, loading, toasts.
    this.hub = new HomeHub({
      enterHabitat: (kind) => this.enterHabitat(kind),
      openHabitats: () => this.hubScreens.show("habitats"),
      openShop: () => this.hubScreens.show("shop"),
      openInventory: () => this.hubScreens.show("inventory"),
      openGuide: () => this.hubScreens.show("guide"),
      openAlbum: () => this.album.toggle(),
      openSettings: () => this.settings.show(),
      careData: () => this.habitatsData(),
    });
    this.hub.mount(this.layout.root);
    this.hubScreens = new HubScreens({
      shopCheckout: (cart) => this.applyShopCheckout(cart),
      leaves: () => Math.floor(this.state.resources.leaves),
      guideStats: () => ({
        ecoPoints: Math.floor(this.state.resources.leaves),
        habitats: 3, // Sunstone Desert · Sapphire Stream · Emerald Hollow
        reputation: Math.floor(this.state.resources.reputation),
        dayLabel: `Day ${this.state.clock.day} · ${fmtClockPref(this.state.clock.minutes)}`,
      }),
      habitatsData: () => this.habitatsData(),
      inventoryData: () => ({
        owned: loadOwned(),
        inUse: this.decorInUse(),
        stock: this.stock,
        acquired: loadAcquired(),
      }),
      placeDecorFromInventory: (defId) => this.placeFromInventory(defId),
      editDecorInHabitat: () => this.placeFromInventory(null),
      sellDecor: (defId) => this.sellDecorPiece(defId),
      sellAllDecorSpares: () => this.sellAllDecorSpares(),
      buybackList: () => loadBuyback(),
      buyBackDecor: (index) => this.buyBackDecor(index),
      enterHabitat: (id) => this.enterHabitat(id),
      toast: (m) => this.toasts.show(m, "info"),
      close: () => {
        this.hubScreens.close();
        if (!this.hub.open) this.hub.show(this.storedPlayerHabitat());
      },
    });
    this.hubScreens.mount(this.layout.root);
    this.settings = new SettingsScreen({
      resetGame: () => this.reset(),
      saveNow: () => this.save(true),
      toast: (m) => this.toasts.show(m, "info"),
      playtimeMs: () => this.playtimeMs,
    });
    this.settings.mount(this.layout.root);
    this.loading.mount(this.layout.root);
    this.toasts.mount(this.layout.root);

    // ── Live settings application (ONE place wires prefs → systems) ──
    onPrefsChange((p) => this.applySettings(p));
    this.applySettings(getPrefs());

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
        const placed = this.lizardServe();
        if (placed === 0) return;
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
    // Terrain editor: Materials row (arming only — the Paint brush applies).
    this.drawers.onMaterialSelect((id) => this.materialSelect(id));
    // Terrain editor: the Terrain ↔ Filters tabs + the Filters tab's controls.
    this.drawers.onTerrainTab((tab) => this.terrainTabChanged(tab));
    this.drawers.onToolChange(() => this.three?.controller?.clearTerrainHover());
    this.drawers.onFilterSelect((id) => {
      this.filterSel.id = id;
      this.applyFilterSel();
    });
    this.drawers.onFilterOpacity((f) => {
      this.filterSel.opacity = f;
      this.three?.controller?.setAnalysisOpacity(f);
    });
    this.drawers.onFilterIntensity((f) => {
      this.filterSel.intensity = f;
      this.three?.controller?.setAnalysisIntensity(f);
    });
    this.drawers.onFiltersReset(() => {
      this.filterSel = { id: "hide_coverage", opacity: 0.6, intensity: 0.8 };
      this.applyFilterSel();
      this.drawers.setNote("Filters reset — Hide Coverage at default strength.", false);
    });
    this.drawers.onViewDetails(() => this.lizardHud.openDetails());
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

    // The machines drive every region change (one place, no drift).
    this.uiMode.onChange((next, prev) => this.applyUiMode(next, prev));
    this.fishMode.onChange((next, prev) => this.applyFishMode(next, prev));
    this.frogMode.onChange((next, prev) => this.applyFrogMode(next, prev));
    window.addEventListener("keydown", (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      // Full-screen overlays own their own Esc (settings / shop / guide).
      if (this.settings.open || this.hubScreens.openScreen) return;
      if (e.key === "Escape") {
        if (this.helpSheet.open) return this.helpSheet.toggle(false);
        if (this.hub.open) return; // the hub is home — nothing above it
        if (this.fishHud.visible && this.fishMode.mode !== "fish-main") {
          this.fishMode.escape();
          return;
        }
        if (this.frogHud.visible && this.frogMode.mode !== "frog-main") {
          this.frogMode.escape();
          return;
        }
        if (this.uiMode.mode === "decorate") {
          // Let the editor's own Esc handle cancel-placement / deselect first.
          const ed = this.three?.getEditor();
          if (ed?.armedDefId || ed?.selectedSummary()) return;
        }
        if (this.lizardHud.visible && this.uiMode.mode !== "gecko-main") {
          this.uiMode.escape();
          return;
        }
        this.lizardHud.closeFlyouts();
        this.fishHud.closeFlyouts();
        this.frogHud.closeFlyouts();
      }
      if (e.key === "Home" && this.tankMode === "3d" && this.state.screen === "aquarium") this.three?.resetCamera();

      // Lizard-habitat shortcuts (normal view; Decorate mode has its own keys).
      const lizardLive = this.lizardHud.visible && !this.editing;
      if (!lizardLive) return;
      if (this.drawers.mode) {
        // Inside a drawer mode: 1–8 pick the card, [ ] size the brush, Enter done.
        if (e.key >= "1" && e.key <= "8") this.drawers.selectIndex(Number(e.key) - 1);
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

    // Boot routing: dev URLs go straight in; players land on the home hub.
    const boot = this.readBootTarget();
    const devMode = new URLSearchParams(window.location.search).has("dev") || boot.kind === "legacy2d";
    if (devMode || (boot.kind === "habitat" && (boot.habitat === "spider" || boot.habitat === "creatures" || boot.habitat === "froglab"))) {
      this.createViewSwitch(); // dev-only corner switcher
    }
    if (boot.kind === "legacy2d") {
      this.legacy2d = true;
      this.tankMode = "2d";
      this.applyCanvasVisibility();
    } else if (boot.kind === "habitat") {
      this.enterHabitat(boot.habitat);
    } else {
      this.hub.show(this.storedPlayerHabitat());
      this.hub.update(this.state);
      this.applyCanvasVisibility();
    }

    // Read-only QA hook (Playwright drives the flows through real handlers).
    Object.assign(globalThis, {
      __app: {
        uiMode: () => this.uiMode.mode,
        fishMode: () => this.fishMode.mode,
        frogMode: () => this.frogMode.mode,
        requestMode: (m: string) => this.requestMode(m as GwMode),
        requestFishMode: (m: string) => this.requestFishMode(m as GwMode),
        requestFrogMode: (m: string) => this.requestFrogMode(m as GwMode),
        serveFrogFood: (n: number) => this.serveFrogFood(n),
        frogMist: () => this.frogMist(),
        careMode: () => this.drawers.mode,
        applyCareAt: (cx: number, cy: number) => this.applyCareAt(cx, cy),
        applyFishCareAt: (cx: number, cy: number) => this.applyFishCareAt(cx, cy),
        groundAt: (cx: number, cy: number) => this.three?.groundAt(cx, cy) ?? null,
        helpOpen: () => this.helpSheet.open,
        hubOpen: () => this.hub.open,
        hubScreen: () => this.hubScreens.openScreen,
        enterHabitat: (k: string) => this.enterHabitat(k as HabitatKind),
        goHome: () => this.goHome(),
        habitat: () => this.habitat,
        legacy2d: () => this.legacy2d,
        stock: () => ({ ...this.stock }),
        leaves: () => Math.floor(this.state.resources.leaves),
        serveFishFood: (k: string, p: number) => this.serveFishFood(k as FishFoodKind, p),
        cleanliness: () => getActiveTank(this.state).water.cleanliness,
        capturePhoto: () => this.capturePhoto(),
      },
    });
  }

  // ── Navigation (hub ↔ habitats) ─────────────────────────────────────────

  private readBootTarget(): BootTarget {
    const p = new URLSearchParams(window.location.search);
    const hq = p.get("habitat");
    const tank = p.get("tank");
    if (tank === "2d") return { kind: "legacy2d" };
    if (p.has("debugFrog")) return { kind: "habitat", habitat: "froglab" }; // Frog Animation Lab alias
    for (const h of ["fish", "spider", "lizard", "frog", "creatures", "froglab"] as HabitatKind[]) {
      if (hq === h) return { kind: "habitat", habitat: h };
    }
    if (tank === "3d") return { kind: "habitat", habitat: this.storedPlayerHabitat() };
    return { kind: "hub" };
  }

  private storedPlayerHabitat(): PlayerHabitat {
    try {
      const stored = localStorage.getItem("gw_habitat");
      if (stored === "lizard" || stored === "fish" || stored === "frog") return stored;
    } catch {
      /* default */
    }
    return "fish";
  }

  // ── Habitats page data (real scores, signals, visits, streak) ───────────

  private static readonly STREAK_KEY = "gw_care_streak";

  private careStreak(): CareStreak {
    try {
      const raw = localStorage.getItem(GlasswaterApp.STREAK_KEY);
      if (raw) return JSON.parse(raw) as CareStreak;
    } catch {
      /* default */
    }
    return EMPTY_STREAK;
  }

  /** Entering a habitat marks a real care visit: bump the daily streak and
   *  stamp the habitat's last-visit time (drives "Recently Visited"). */
  private stampCareVisit(kind: HabitatKind): void {
    if (kind !== "fish" && kind !== "lizard" && kind !== "frog") return;
    const now = new Date();
    const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    try {
      localStorage.setItem(GlasswaterApp.STREAK_KEY, JSON.stringify(bumpStreak(this.careStreak(), dayKey)));
    } catch {
      /* non-fatal */
    }
    saveHubMeta(
      kind === "lizard"
        ? { lastVisitLizard: Date.now() }
        : kind === "fish"
          ? { lastVisitFish: Date.now() }
          : { lastVisitFrog: Date.now() },
    );
  }

  /** Everything the Habitats page shows, from real sources: the aquarium is
   *  live from the sim, the vivarium/paludarium read their last-save stash. */
  private habitatsData(): HabitatsLiveData {
    const meta = loadHubMeta();
    const tank = getActiveTank(this.state);
    return {
      habitats: [
        {
          id: "lizard",
          name: meta.geckoName,
          score: meta.geckoScore,
          lastVisit: meta.lastVisitLizard,
          signals: { score: meta.geckoScore, cleanliness: meta.geckoCleanliness, hunger: meta.geckoHunger },
        },
        {
          id: "fish",
          name: tank.name,
          score: Math.round(tank.habitatScore),
          lastVisit: meta.lastVisitFish,
          signals: { score: tank.habitatScore, cleanliness: tank.water.cleanliness, nitrate: tank.water.nitrate },
        },
        {
          id: "frog",
          name: meta.frogName,
          score: meta.frogScore,
          lastVisit: meta.lastVisitFrog,
          signals: {
            score: meta.frogScore,
            cleanliness: meta.frogCleanliness,
            hunger: meta.frogHunger,
            humidity: meta.frogHumidity,
            hydration: meta.frogHydration,
          },
        },
      ],
      reputation: Math.floor(this.state.resources.reputation),
      photoCount: albumCount(),
      streakDays: this.careStreak().days,
      nowMs: Date.now(),
    };
  }

  /** Enter a habitat from the hub (or a dev URL/switch). Shows the cozy
   *  loading card until the scene + its GLBs are really ready. */
  private enterHabitat(kind: HabitatKind): void {
    this.hub.hide();
    this.hubScreens.close();
    this.legacy2d = false;
    this.tankMode = "3d";
    const changed = this.habitat !== kind || !this.three;
    this.habitat = kind;
    try {
      localStorage.setItem("gw_tank_mode", "3d");
      // Only the player habitats persist — dev views never do.
      if (kind === "fish" || kind === "lizard" || kind === "frog") localStorage.setItem("gw_habitat", kind);
    } catch {
      /* non-fatal */
    }
    // Real care bookkeeping for the Habitats page: last-visit timestamp +
    // the daily care streak (playing a habitat = caring for it).
    this.stampCareVisit(kind);
    this.applyCanvasVisibility();
    this.updateToggleState();
    if (!changed) return;

    const meta =
      kind === "lizard"
        ? { name: "Sunstone Desert", glyph: "🦎", sub: "Warming the basking lamp and raking the sand." }
        : kind === "fish"
          ? { name: "Sapphire Stream", glyph: "🐟", sub: "Conditioning the water and waking the fish." }
          : kind === "frog"
            ? { name: "Emerald Hollow", glyph: "🐸", sub: "Misting the leaves and waking the frog." }
            : kind === "froglab"
              ? { name: "the Frog Animation Lab", glyph: "🐸", sub: "Warming up the animation bench." }
              : { name: "the habitat", glyph: "🌿", sub: "Setting things up." };
    const token = this.loading.show(meta.name, meta.glyph, meta.sub);
    const done = (): void => {
      this.loading.hide(token);
      this.applyCanvasVisibility();
    };
    if (this.three) {
      void this.three
        .setHabitat(kind)
        .then(done)
        .catch((err) => {
          console.error("[GLASSWATER] habitat switch failed:", err);
          done();
        });
    } else {
      void this.ensureThree().then(done).catch(done);
    }
  }

  /** Back to the eco-center hub (habitats keep living underneath). */
  private goHome(): void {
    if (this.uiMode.mode !== "gecko-main") this.uiMode.escape();
    if (this.fishMode.mode !== "fish-main") this.fishMode.escape();
    if (this.frogMode.mode !== "frog-main") this.frogMode.escape();
    this.hub.show(this.storedPlayerHabitat());
    this.hub.update(this.state);
    this.applyCanvasVisibility();
    this.save(false);
  }

  // ── Mode machines ────────────────────────────────────────────────────────

  /** Enter/toggle a lizard UI mode from the dock, slim nav, keys, or buttons. */
  private requestMode(m: GwMode): void {
    if (!this.lizardHud.visible) {
      this.toasts.show("Open the vivarium first.", "info");
      return;
    }
    if ((m === "feed" || m === "clean" || m === "terrain" || m === "decorate") && !this.three?.controller) {
      this.toasts.show("Habitat still loading — one moment.", "warn");
      return;
    }
    this.uiMode.request(m);
  }

  /** Enter/toggle a fish UI mode from the aquarium dock. */
  private requestFishMode(m: GwMode): void {
    if (!this.fishHud.visible) {
      this.toasts.show("Open the aquarium first.", "info");
      return;
    }
    if ((m === "fish-feed" || m === "fish-clean") && !this.three?.aquarium) {
      this.toasts.show("Aquarium still loading — one moment.", "warn");
      return;
    }
    this.fishMode.request(m);
  }

  /** Enter/toggle a frog UI mode from the paludarium dock. */
  private requestFrogMode(m: GwMode): void {
    if (!this.frogHud.visible) {
      this.toasts.show("Open the paludarium first.", "info");
      return;
    }
    if (m === "frog-feed" && !this.three?.frog) {
      this.toasts.show("Habitat still loading — one moment.", "warn");
      return;
    }
    this.frogMode.request(m);
  }

  /** The ONE place a lizard mode change touches the world: drawers, editor,
   *  panel, camera, clean-spot rings, pointer ownership, HUD regions. */
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
        if (r.drawer === "feed") this.drawers.setNote(this.stockLine(), false);
        // Terrain: fresh Materials selection state from the applied substrate;
        // the editor always opens on the Terrain pane with no analysis wash.
        if (r.drawer === "terrain") {
          this.substrateSel = new SubstrateSelection(c.substrateInfo().id);
          this.pushMaterialState();
          c.setAnalysisFilter(null);
          c.clearTerrainHover();
        }
      }
      this.three?.setLeftOrbit(false); // left = the brush/drop; middle/right = camera
    } else {
      this.drawers.close();
      this.careStroking = false;
      if (next !== "decorate") this.three?.setLeftOrbit(true);
    }

    // Leaving terrain → the analysis wash + brush cursor clear and the OS
    // cursor comes back. The camera is NEVER hijacked by this editor — the
    // player's view stays exactly where they left it.
    if (prev === "terrain" && next !== "terrain") {
      this.substrateSel = null;
      c?.setAnalysisFilter(null);
      c?.clearTerrainHover();
      if (this.three) this.three.canvas.style.cursor = "";
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

  /** The ONE place a frog mode change touches the world. The paludarium's
   *  actions are all drawer/dock-driven (no canvas tools yet), so this only
   *  manages the camera + HUD regions. */
  private applyFrogMode(next: GwMode, prev: GwMode): void {
    const r = regionsFor(next);
    if (next === "photo") this.three?.setCameraMode("photo");
    else if (prev === "photo") this.three?.setCameraMode("normal");
    this.frogHud.applyMode(next, r);
  }

  /** The ONE place a fish mode change touches the world. */
  private applyFishMode(next: GwMode, prev: GwMode): void {
    const r = regionsFor(next);
    // Drawer modes own the LEFT button (scrub drag / feed click).
    if (r.drawer === "fish-clean" || r.drawer === "fish-feed") {
      this.three?.setLeftOrbit(false);
    } else {
      this.fishStroking = false;
      this.three?.setLeftOrbit(true);
    }
    if (prev === "fish-clean" && next !== "fish-clean") {
      sfx.brushStop();
      if (this.three) this.three.canvas.style.cursor = "";
    }
    if (next === "photo") this.three?.setCameraMode("photo");
    else if (prev === "photo") this.three?.setCameraMode("normal");
    this.fishHud.applyMode(next, r);
  }

  // ── Lizard feeding (stock-backed) ───────────────────────────────────────

  /** Human line of the insect pantry for the feed drawer. */
  private stockLine(): string {
    const parts = ["cricket", "mealworm", "dubia_roach", "superworm", "waxworm"]
      .map((id) => {
        const s = supplyById(id);
        return s ? `${s.icon}${stockCount(this.stock, id)}` : "";
      })
      .filter(Boolean);
    return `In stock: ${parts.join("  ")} — restock in the Supply Shop (⌂).`;
  }

  /** Serve the drawer's current selection from STOCK. Returns insects placed. */
  private lizardServe(at?: { x: number; z: number }): number {
    const c = this.three?.controller;
    if (!c) return 0;
    const foodId = this.drawers.selected;
    const label = supplyById(foodId)?.label ?? foodId;
    const have = stockCount(this.stock, foodId);
    if (have <= 0) {
      this.drawers.setNote(`⚠ Out of ${label} — buy more in the Supply Shop (⌂ Eco-Center).`, true);
      return 0;
    }
    const portion = Math.min(this.drawers.portion, have);
    const res = c.serveMealNow(foodId, portion, this.drawers.method, this.drawers.supplement, at);
    if (res.placed > 0) {
      consumeSupply(this.stock, foodId, res.placed);
      saveStock(this.stock);
      const left = stockCount(this.stock, foodId);
      this.drawers.setNote(
        res.reason ? `Serving ${res.placed} — ${res.reason}.` : `Serving ${res.placed} — ${left} ${label.toLowerCase()} left in stock.`,
        false,
      );
    } else {
      this.drawers.setNote(`⚠ ${res.reason ?? "Couldn't serve."}`, true);
    }
    return res.placed;
  }

  private serveFeed(at?: { x: number; z: number }): void {
    this.lizardServe(at);
  }

  // ── Fish care actions ────────────────────────────────────────────────────

  private serveFishFood(kind: FishFoodKind, portion: number, atX01 = 0): void {
    const aq = this.three?.aquarium;
    if (!aq) return;
    const label = supplyById(kind)?.label ?? kind;
    const used = consumeSupply(this.stock, kind, portion);
    if (used === 0) {
      this.fishHud.setFeedNote(`Out of ${label} — restock in the Supply Shop (⌂).`, true);
      return;
    }
    saveStock(this.stock);
    const tank = getActiveTank(this.state);
    tank.food = Math.min(100, tank.food + 8 * used);
    aq.feed(kind, used * 5, atX01);
    sfx.pop();
    const over = tank.food > 34;
    pushEvent(this.state, `Sprinkled ${label.toLowerCase()} over ${tank.name}.`, over ? "warn" : "good");
    const left = stockCount(this.stock, kind);
    this.fishHud.setFeedNote(
      over ? "That's plenty — uneaten food fouls the water." : `Sprinkled ${used} pinch${used > 1 ? "es" : ""} — ${left} left. Watch them dart!`,
      over,
    );
  }

  // ── Frog care actions ────────────────────────────────────────────────────

  /** Release crickets from STOCK into the paludarium. */
  private serveFrogFood(count: number): void {
    const hooks = this.three?.frog;
    if (!hooks) return;
    const have = stockCount(this.stock, "cricket");
    if (have <= 0) {
      this.frogHud.setFeedNote("Out of crickets — restock in the Supply Shop (⌂).", true);
      return;
    }
    const placed = hooks.feed(Math.min(count, have));
    if (placed === 0) {
      this.frogHud.setFeedNote("The floor is already crawling — let it hunt these first.", true);
      return;
    }
    consumeSupply(this.stock, "cricket", placed);
    saveStock(this.stock);
    sfx.pop();
    const left = stockCount(this.stock, "cricket");
    this.frogHud.setFeedNote(`Released ${placed} cricket${placed > 1 ? "s" : ""} — ${left} left in stock. Watch it hunt!`, false);
  }

  /** Fire the paludarium's misting nozzles. */
  private frogMist(): void {
    const hooks = this.three?.frog;
    if (!hooks) {
      this.toasts.show("Habitat still loading — one moment.", "warn");
      return;
    }
    if (hooks.mist()) {
      sfx.water();
      this.toasts.show("💦 A fine mist settles over the leaves.", "good");
    } else {
      this.toasts.show("The mister is already running.", "info");
    }
  }

  private fishWaterChange(): void {
    const res = doAction(this.state, "waterChange");
    if (res.ok) {
      this.three?.aquarium?.waterChangeFx();
      sfx.water();
      this.fishHud.setCleanNote("Fresh conditioned water in — chemistry settling.", false);
    } else {
      this.fishHud.setCleanNote(res.message, true);
    }
    this.toasts.show(res.message, res.tone);
  }

  /** Apply the fish clean tool at a pointer position (drag). */
  private applyFishCareAt(clientX: number, clientY: number): void {
    const aq = this.three?.aquarium;
    if (!aq || this.fishMode.mode !== "fish-clean") return;
    const tank = getActiveTank(this.state);
    if (this.fishHud.cleanTool === "scrub") {
      const pane = aq.glassPane();
      const pt = this.three!.pointAtZ(clientX, clientY, pane.z);
      if (
        pt &&
        Math.abs(pt.x - pane.cx) <= pane.w / 2 + 0.05 &&
        pt.y >= pane.cy - pane.h / 2 - 0.05 &&
        pt.y <= pane.cy + pane.h / 2 + 0.05
      ) {
        aq.scrubFxAt(pt.x, pt.y);
        tank.water.cleanliness = Math.min(100, tank.water.cleanliness + 0.06);
        this.squeakT -= 1;
        if (this.squeakT <= 0) {
          this.squeakT = 22;
          sfx.squeak();
        }
      }
    } else {
      const g = this.three!.groundAt(clientX, clientY);
      const fr = aq.floorRect();
      if (g && Math.abs(g.x) <= fr.hw && Math.abs(g.z) <= fr.hd) {
        aq.vacuumFxAt(g.x, g.z);
        tank.water.cleanliness = Math.min(100, tank.water.cleanliness + 0.07);
        tank.food = Math.max(0, tank.food - 0.1);
      }
    }
  }

  /** A click on the water in feed mode sprinkles right there. */
  private fishFeedAtPointer(clientX: number, clientY: number): void {
    const aq = this.three?.aquarium;
    if (!aq) return;
    const pane = aq.glassPane();
    const pt = this.three!.pointAtZ(clientX, clientY, pane.z);
    const atX01 = pt ? Math.max(-1, Math.min(1, pt.x / (pane.w / 2))) : 0;
    this.serveFishFood(this.fishHud.selectedFood, this.fishHud.portion, atX01);
  }

  // ── Shop ────────────────────────────────────────────────────────────────

  /** Supply Shop checkout: pure math validates + flattens the cart, then the
   *  app delivers for real — packs into the pantry, decor into the owned
   *  inventory, leaves out of the wallet. */
  private applyShopCheckout(cart: CartLine[]): { ok: boolean; message: string } {
    const res = shopCheckout(cart, this.state.resources.leaves);
    if (!res.ok) return { ok: false, message: res.reason ?? "Checkout failed." };
    let packUnits = 0;
    for (const [id, packs] of Object.entries(res.supplies)) {
      const def = supplyById(id);
      if (!def) continue;
      this.stock[id] = stockCount(this.stock, id) + packs * def.pack;
      packUnits += packs;
    }
    const owned = loadOwned();
    let pieces = 0;
    for (const [defId, count] of Object.entries(res.decor)) {
      addOwned(owned, defId, count);
      pieces += count;
    }
    // Stamp acquisition times so the Inventory's "Recent" sort tells the truth.
    const acquired = loadAcquired();
    markAcquired(
      acquired,
      [...Object.keys(res.supplies).map((id) => `supply:${id}`), ...Object.keys(res.decor).map((id) => `decor:${id}`)],
      Date.now(),
    );
    saveAcquired(acquired);
    this.state.resources.leaves -= res.spend;
    saveStock(this.stock);
    saveOwned(owned);
    this.save(false);
    sfx.done();
    const parts: string[] = [];
    if (packUnits > 0) parts.push(`${packUnits} pack${packUnits === 1 ? "" : "s"} stocked`);
    if (pieces > 0) parts.push(`${pieces} piece${pieces === 1 ? "" : "s"} in your Inventory`);
    return {
      ok: true,
      message: `Order delivered — ${parts.join(" · ")} (−${res.spend.toLocaleString()} leaves).`,
    };
  }

  // ── Terrain editor: tabs + Filters ─────────────────────────────────────────

  /** Terrain ↔ Filters tab: the analysis wash exists only while Filters shows. */
  private terrainTabChanged(tab: TerrainTab): void {
    const c = this.three?.controller;
    if (!c) return;
    if (tab === "filters") {
      c.clearTerrainHover();
      if (this.three) this.three.canvas.style.cursor = "";
      this.applyFilterSel();
    } else {
      c.setAnalysisFilter(null);
    }
  }

  /** Apply the selected filter to the world + mirror it into the drawer
   *  (list highlight, copy, score/info cards, legend, minimap, sliders). */
  private applyFilterSel(): void {
    const c = this.three?.controller;
    if (!c || this.uiMode.mode !== "terrain" || this.drawers.terrainTab !== "filters") return;
    c.setAnalysisFilter(this.filterSel.id);
    c.setAnalysisOpacity(this.filterSel.opacity);
    c.setAnalysisIntensity(this.filterSel.intensity);
    this.drawers.setFilterState(this.filterSel);
    this.drawers.setFilterReadout(c.filterReadout(this.filterSel.id));
    this.drawers.setFilterMap(c.filterMapCanvas());
  }

  // ── Terrain Mode: Materials row (preview → apply / revert) ────────────────

  /** Mirror the pure selection state into the drawer's tiles + info line. */
  private pushMaterialState(): void {
    const c = this.three?.controller;
    const sel = this.substrateSel;
    if (!c || !sel) return;
    this.drawers.setMaterialState({
      habitat: c.substrateInfo().habitat,
      appliedId: sel.appliedId,
      selectedId: sel.inspectedId,
    });
  }

  /** A material tile was clicked: ARM it for the Paint brush (never touches
   *  the world) or explain the lock — the pure SubstrateSelection decides. */
  private materialSelect(id: string): void {
    const c = this.three?.controller;
    const sel = this.substrateSel;
    const t = terrainById(id);
    if (!c || !sel || !t) return;
    const action = sel.select(id, terrainUnlocked(t, c.substrateInfo().habitat));
    if (action === "preview") {
      this.drawers.setNote(`${t.name} selected — drag on the sand to lay it down.`, false);
    } else if (action === "applied") {
      this.drawers.setNote(`${t.name} already lines the habitat.`, false);
    } else {
      this.drawers.setNote(`${t.name} belongs to humid habitats — the paludarium uses it.`, false);
    }
    this.pushMaterialState();
  }

  /** The photo shutter: fresh frame → scaled JPEG → the Album, with a
   *  flash + toast. Works in either 3D habitat (Photo Mode frames it best). */
  private capturePhoto(): void {
    const three = this.three;
    if (!three || this.tankMode !== "3d") {
      this.toasts.show("Photos live in the 3D habitats — enter one first.", "warn");
      return;
    }
    const mins = this.state.clock.minutes;
    const h24 = Math.floor(mins / 60) % 24;
    const ampm = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const when = `Day ${this.state.clock.day} · ${h12}:${String(Math.floor(mins % 60)).padStart(2, "0")} ${ampm}`;
    const hud = three.controller?.readState();
    const frogHud = this.habitat === "frog" ? three.frog?.readState() : null;
    const caption =
      this.habitat === "lizard" && hud
        ? `${hud.animal.name} · ${hud.habitatName}`
        : frogHud
          ? `${frogHud.animalName} · ${frogHud.habitatName}`
          : this.habitat === "fish"
            ? `${getActiveTank(this.state).name} · Community Aquarium`
            : "GLASSWATER";
    captureToAlbum(three.captureFrame(), when, caption);
    shutterFlash();
    sfx.done();
    this.toasts.show("📸 Saved to your Album.", "info");
    // The shot is taken — hop back out of Photo Mode. The shutter flash
    // covers the camera re-anchoring, so the transition reads as one beat.
    for (const machine of [this.uiMode, this.fishMode, this.frogMode]) {
      if (machine.mode === "photo") machine.escape();
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  private loop = (now: number): void => {
    // Settings → Max FPS: skip whole frames (dt accumulates into the next
    // processed one, clamped as ever — the sim never fast-forwards).
    if (this.fpsCap > 0 && now - this.last < 1000 / this.fpsCap - 0.5) {
      requestAnimationFrame(this.loop);
      return;
    }
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;

    simStep(this.state, dt);

    const overlayUp = this.hub.open || !!this.hubScreens.openScreen;
    if (this.state.screen === "aquarium" && !overlayUp) {
      if (this.tankMode === "3d" && this.three) this.three.render(dt);
      else if (this.legacy2d) this.renderer.render(this.state, dt);
    }

    // Throttle DOM updates to ~12 Hz to avoid layout thrash.
    this.uiAccum += dt;
    if (this.uiAccum >= 0.08) {
      if (this.legacy2d) this.layout.update(this.state);
      if (this.hub.open) this.hub.update(this.state);
      const c = this.three?.controller;
      if (this.lizardHud.visible && c) {
        const hud = c.readState();
        const info = c.animalInfo();
        const clean = c.cleanliness();
        const spots = c.dirtSpots().length;
        const care = c.cleanStatus();
        const history = c.feedingHistory();
        const lastFeed = history.entries[0];
        this.lizardHud.update(hud, info, clean, spots, care, {
          feedersAlive: hud.feederCount,
          lastFeedAgo: lastFeed ? agoWord(history.now - lastFeed.t) : null,
          terrainScore: c.filterReadout("substrate").score,
        });
        if (this.uiMode.mode === "clean") this.drawers.updateCleanProgress(c.cleanStatus());
        else if (this.uiMode.mode === "feed") {
          this.drawers.updateFeedInfo({
            next: c.nextFeeding(),
            feeders: hud.feederCount,
            hunger: info.hunger,
            dish: c.dishInfo(),
            presenting: c.presentationActive(),
          });
        } else if (this.uiMode.mode === "terrain") {
          // Live editor readouts: the tool-context meters every tick, the
          // Filters score/minimap ~1×/s (the wash itself repaints scene-side).
          this.drawers.setTerrainInfo(c.terrainInfo());
          this.filterRefreshT += 0.08;
          if (this.drawers.terrainTab === "filters" && this.filterRefreshT >= 1) {
            this.filterRefreshT = 0;
            this.drawers.setFilterReadout(c.filterReadout(this.filterSel.id));
            this.drawers.setFilterMap(c.filterMapCanvas());
          }
        }
        if (this.animalInfoOpen) this.animalPanel.update(info);
      }
      // Frog HUD.
      const fr = this.three?.frog;
      if (this.frogHud.visible && fr) {
        this.frogHud.update(fr.readState(), this.stock);
      }
      // Fish HUD + sim-driven water clarity.
      const aq = this.three?.aquarium;
      if (this.fishHud.visible && aq) {
        const tank = getActiveTank(this.state);
        const clarity = clamp01(
          0.25 + 0.75 * (tank.water.cleanliness / 100) - 0.3 * clamp01((tank.water.nitrate - 35) / 50),
        );
        aq.setWaterMood(clarity);
        this.fishHud.update(this.state, aq.population(), aq.foodBitsLive(), this.stock);
      }
      this.updateLegend(c ?? null);
      this.uiAccum = 0;
    }

    // Autosave on the player's chosen cadence (Settings → Gameplay).
    this.saveAccum += dt;
    this.playtimeMs += dt * 1000;
    if (this.saveAccum >= this.autosaveSec) {
      this.save(false);
      this.savePlaytime();
      this.saveAccum = 0;
    }

    requestAnimationFrame(this.loop);
  };

  // ── Settings application (the ONE prefs → systems seam) ───────────────────

  /** Wire every live setting into its real system. Runs at boot and on every
   *  setPrefs — the Settings screen itself only writes the store. */
  private applySettings(p: Prefs): void {
    sfx.setVolume(p.muted ? 0 : p.volume * p.sfxVolume);
    document.body.classList.toggle("gw-reduced-motion", p.reducedMotion);
    document.body.classList.toggle("gw-high-contrast", p.highContrast);
    // Menu-layer zoom (hub + full screens; habitat HUDs keep their tuned layout).
    const zoom = (p.uiScale * p.textScale).toFixed(3);
    for (const el of [this.hub.root, this.hubScreens.root, this.album.root]) {
      (el.style as CSSStyleDeclaration & { zoom?: string }).zoom = zoom;
    }
    // 3D renderer: resolution + orbit feel (re-applied when a renderer appears).
    const qualityScale = p.quality === "high" ? 1 : p.quality === "balanced" ? 0.85 : 0.65;
    this.three?.setRenderScale(p.renderScale * qualityScale);
    this.three?.setControlTuning(p.cameraSensitivity, p.invertDrag);
    this.fpsCap = p.maxFps;
    this.autosaveSec = p.autosaveSec;
  }

  /** Beginner-hint toasts respect the Gameplay setting. */
  private hint(message: string): void {
    if (getPrefs().hints) this.toasts.show(message, "info");
  }

  private savePlaytime(): void {
    try {
      localStorage.setItem("gw_playtime.v1", String(Math.round(this.playtimeMs)));
    } catch {
      /* non-fatal */
    }
  }

  private onAction(a: ActionId): void {
    const result = doAction(this.state, a);
    if (a === "feed" && this.tankMode === "3d") this.three?.excite();
    this.toasts.show(result.message, result.tone);
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
    if (this.resetting) return; // a reset must not be re-saved by unload hooks
    const ok = saveGame(this.state);
    saveStock(this.stock);
    // Stash the vivarium's last-known score + care signals for the hub card
    // and the Habitats page's reminders/insights.
    const c = this.three?.controller;
    if (this.habitat === "lizard" && c) {
      const s = c.readState();
      saveHubMeta({
        geckoScore: s.overall,
        geckoName: s.habitatName,
        geckoCleanliness: s.environment.cleanliness,
        geckoHunger: s.animal.hunger,
      });
    }
    // …and the paludarium's.
    const fr = this.three?.frog;
    if (this.habitat === "frog" && fr) {
      const s = fr.readState();
      saveHubMeta({
        frogScore: s.score,
        frogName: s.habitatName,
        frogCleanliness: s.cleanliness,
        frogHunger: s.hunger,
        frogHumidity: s.humidity,
        frogHydration: s.hydration,
      });
    }
    if (notify) this.toasts.show(ok ? "Game saved." : "Couldn't save.", ok ? "good" : "warn");
  }

  /** FULL reset (from the settings modal's confirmed danger button): wipe
   *  every save key (world, habitats, album, stock — prefs survive) and
   *  reload into a fresh eco-center. */
  private reset(): void {
    this.resetting = true;
    this.clearAllSaves();
    try {
      localStorage.setItem("gw_reset_pending", "1");
    } catch {
      /* non-fatal */
    }
    window.location.reload();
  }

  private clearAllSaves(): void {
    try {
      const keep = "glasswater.prefs.v1";
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if ((k.startsWith("glasswater.") && k !== keep) || k.startsWith("gw_")) doomed.push(k);
      }
      for (const k of doomed) localStorage.removeItem(k);
    } catch {
      /* private mode */
    }
  }

  // ── The WebGL habitats (fish / lizard + dev spider / creatures) ───────────

  /** Lazily import + create the WebGL habitat renderer on first use. On
   *  failure the classic 2D aquarium takes over so the player never strands. */
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
        if (this.tankMode !== "3d") return;
        // Click the FROG (normal/info view) → its info panel.
        if (this.habitat === "frog") {
          const fm = this.frogMode.mode;
          if (fm !== "frog-main" && fm !== "frog-info") return;
          if (three.pickAnimal(e.clientX, e.clientY)) {
            if (fm !== "frog-info") this.frogMode.request("frog-info");
          } else if (fm === "frog-info") {
            this.frogMode.escape();
          }
          return;
        }
        if (this.habitat !== "lizard") return;
        const mode = this.uiMode.mode;
        if (mode !== "gecko-main" && mode !== "animal-info") return;
        if (three.pickAnimal(e.clientX, e.clientY)) {
          if (mode !== "animal-info") this.uiMode.request("animal-info");
        } else if (mode === "animal-info") {
          this.uiMode.escape();
        }
      });

      // Drawer modes own the LEFT button on the canvas. Window-level with
      // capture (like the editor) so a pointer capture elsewhere can't swallow
      // the gesture; e.target keeps DOM-panel clicks out.
      window.addEventListener(
        "pointerdown",
        (e) => {
          if (e.button !== 0 || e.target !== three.canvas) return;
          // LIZARD drawer tools (feed drop / clean brush / terrain sculpt).
          if (this.drawers.mode) {
            e.stopImmediatePropagation();
            this.careStroking = true;
            this.paintedThisStroke = false;
            // The scrub SOUND runs for as long as the tool is dragged (the
            // squeegee adds its own throttled squeaks on top).
            if (this.drawers.mode === "clean") {
              sfx.brushStart();
              // The tool appears in the hand THE MOMENT the button goes down —
              // even before the pointer moves (held-still pours/scrubs work).
              three.controller?.setCleanScrubbing(true);
              this.driveCleanHover(e.clientX, e.clientY);
            }
            this.applyCareAt(e.clientX, e.clientY);
            return;
          }
          // FISH drawer tools (scrub/vacuum drag; feed click).
          if (this.habitat === "fish") {
            const fm = this.fishMode.mode;
            if (fm === "fish-clean") {
              e.stopImmediatePropagation();
              this.fishStroking = true;
              this.squeakT = 0;
              sfx.brushStart();
              this.applyFishCareAt(e.clientX, e.clientY);
            } else if (fm === "fish-feed") {
              e.stopImmediatePropagation();
              this.fishFeedAtPointer(e.clientX, e.clientY);
            }
          }
        },
        true,
      );
      window.addEventListener(
        "pointermove",
        (e) => {
          if (this.careStroking && this.drawers.mode && this.drawers.mode !== "feed") {
            this.applyCareAt(e.clientX, e.clientY);
          } else if (this.fishStroking && this.fishMode.mode === "fish-clean") {
            this.applyFishCareAt(e.clientX, e.clientY);
          }
        },
        true,
      );
      window.addEventListener("pointerup", () => {
        this.careStroking = false;
        this.fishStroking = false;
        sfx.brushStop();
        // Released hand: the tool leaves the hand + all work animation stops.
        this.three?.controller?.setCleanScrubbing(false);
        // A finished PAINT stroke commits its bookkeeping (dominant substrate,
        // bed tint, humidity blend, one event, save) + refreshes the tiles.
        if (this.paintedThisStroke) {
          this.paintedThisStroke = false;
          const c = this.three?.controller;
          if (c) {
            c.paintStrokeEnd();
            sfx.done();
            this.pushMaterialState();
            const name = terrainById(this.substrateSel?.inspectedId ?? "")?.name ?? "Substrate";
            this.drawers.setNote(`${name} painted in. ✨`, false);
          }
        }
      });

      // POINTER FEEDBACK over the habitats — never just a bare cursor where a
      // tool is armed: feed marker / clean tool (lizard), crosshair (fish).
      three.canvas.addEventListener("pointermove", (e) => {
        if (this.tankMode !== "3d" || this.editing) return;
        if (this.habitat === "fish") {
          const fm = this.fishMode.mode;
          three.canvas.style.cursor = fm === "fish-clean" || fm === "fish-feed" ? "crosshair" : "";
          return;
        }
        if (this.habitat === "frog") {
          const p = three.frog?.frogPosition();
          const g = three.groundAt(e.clientX, e.clientY);
          const over = !!g && !!p && Math.hypot(g.x - p.x, g.z - p.z) < 0.25;
          three.canvas.style.cursor = over ? "pointer" : "";
          return;
        }
        if (this.habitat !== "lizard") return;
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
          this.driveCleanHover(e.clientX, e.clientY);
        } else if (mode === "gecko-main" || mode === "animal-info") {
          const gp = c.geckoPosition();
          const over = !!g && Math.hypot(g.x - gp.x, g.z - gp.z) < 0.2;
          c.setGeckoHover(over);
          three.canvas.style.cursor = over ? "pointer" : "";
        } else if (mode === "terrain") {
          // The in-world BRUSH CURSOR rides the pointer on the Terrain pane
          // (soft ring + green tool glyph); the Filters pane never edits.
          const tool = this.drawers.terrainTab === "terrain" ? toolById(this.drawers.selected) : null;
          if (g && tool) {
            const shown = c.terrainHover(g, this.drawers.radius, tool.cursorGlyph, this.careStroking);
            three.canvas.style.cursor = shown ? "none" : "";
          } else {
            c.clearTerrainHover();
            three.canvas.style.cursor = "";
          }
        } else {
          three.canvas.style.cursor = "";
        }
      });
      three.canvas.addEventListener("pointerleave", () => {
        three.controller?.clearFeedHover();
        three.controller?.clearCleanHover();
        three.controller?.clearTerrainHover();
        three.canvas.style.cursor = "";
      });

      // Decor placement economy: an OWNED piece (bought in the Supply Shop)
      // places free — consumed from the decor inventory; otherwise the classic
      // pay-on-place path charges leaves. (The scene stays money-agnostic.)
      three.setPlacementEconomy(
        (defId) => {
          if (ownedCount(loadOwned(), defId) > 0) return null; // free — from your inventory
          const price = decorPrice(defId);
          return this.state.resources.leaves >= price
            ? null
            : `Need ${price} leaves (you have ${Math.floor(this.state.resources.leaves)})`;
        },
        (defId) => {
          const owned = loadOwned();
          if (consumeOwned(owned, defId)) {
            saveOwned(owned);
            const left = ownedCount(owned, defId);
            this.toasts.show(left > 0 ? `Placed from your inventory (${left} spare left).` : "Placed from your inventory.", "info");
            return;
          }
          const price = decorPrice(defId);
          if (price > 0) {
            this.state.resources.leaves -= price;
            this.toasts.show(`Placed — spent ${price} leaves.`, "info");
          }
        },
      );

      this.three = three;
      this.backdrop3d = backdrop;
      three.resize(window.innerWidth, window.innerHeight);
      await three.setHabitat(this.habitat);
      this.applyCanvasVisibility();
    } catch (err) {
      console.error("[GLASSWATER] 3D habitat module failed to load:", err);
      // Graceful fallback: the classic 2D aquarium (never a black screen).
      this.legacy2d = true;
      this.tankMode = "2d";
      this.hub.hide();
      this.toasts.show("3D isn't available here — showing the classic aquarium view.", "warn");
      this.applyCanvasVisibility();
    } finally {
      this.threeLoading = false;
    }
  }

  private applyCanvasVisibility(): void {
    const aquarium = this.state.screen === "aquarium";
    const overlayUp = this.hub.open || !!this.hubScreens.openScreen;
    const ready3d = this.tankMode === "3d" && !!this.three;
    // The legacy 2D canvas exists only for the dev URL / WebGL fallback.
    this.layout.canvas.style.visibility = aquarium && this.legacy2d && !overlayUp ? "visible" : "hidden";
    const show3d = aquarium && ready3d && !this.legacy2d && !overlayUp;
    if (this.three) this.three.canvas.style.display = show3d ? "block" : "none";
    if (this.backdrop3d) this.backdrop3d.style.display = show3d ? "block" : "none";
    const showLizard = show3d && this.habitat === "lizard";
    const showFish = show3d && this.habitat === "fish";
    const showFrog = show3d && this.habitat === "frog";
    // Navigating away from a habitat closes any open mode through its machine.
    if (!showLizard && this.uiMode.mode !== "gecko-main") this.uiMode.escape();
    if (!showFish && this.fishMode.mode !== "fish-main") this.fishMode.escape();
    if (!showFrog && this.frogMode.mode !== "frog-main") this.frogMode.escape();
    this.lizardHud.setVisible(showLizard);
    this.fishHud.setVisible(showFish);
    this.frogHud.setVisible(showFrog);
    // The old 2D chrome shows ONLY in legacy mode — never over the new game.
    if (this.hudEl) this.hudEl.style.display = this.legacy2d && !overlayUp ? "" : "none";
  }

  /** The CLEANING TOOL rides the pointer instead of a bare cursor: sponge
   *  (Spot Clean) / hand brush (Brush Sand) / scoop (Pick Up Waste) / pitcher
   *  (Refill Water) on the sand, the SQUEEGEE on the front glass. The tool
   *  mesh itself only shows while the button is held (aim ring otherwise). */
  private driveCleanHover(clientX: number, clientY: number): void {
    const three = this.three;
    const c = three?.controller;
    if (!three || !c) return;
    const sel = this.drawers.selected;
    if (sel === "wipe") {
      const pane = c.glassPane();
      const pt = three.pointAtZ(clientX, clientY, pane.z);
      const onPane =
        !!pt &&
        Math.abs(pt.x - pane.cx) <= pane.w / 2 + 0.05 &&
        pt.y >= pane.cy - pane.h / 2 - 0.05 &&
        pt.y <= pane.cy + pane.h / 2 + 0.05;
      c.wipeHover(onPane ? pt : null, this.careStroking);
      three.canvas.style.cursor = onPane ? "none" : "";
      return;
    }
    const g = three.groundAt(clientX, clientY);
    if ((sel === "spot" || sel === "sweep" || sel === "waste" || sel === "water") && g) {
      c.cleanHover(g, this.careStroking, this.drawers.radius, sel);
      three.canvas.style.cursor = "none";
    } else {
      c.clearCleanHover();
      three.canvas.style.cursor = "";
    }
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
      const sel = this.drawers.selected;
      if (sel === "waste") {
        // MANUAL pickup: each press/pass scoops the one dropping under it.
        const r = c.pickWasteAt(g.x, g.z, this.drawers.radius);
        if (r.picked) {
          this.drawers.setNote(
            r.remaining > 0 ? `Got it — ${r.remaining} more to pick up.` : "All droppings scooped. Fresh sand! ✨",
            false,
          );
          this.drawers.updateCleanProgress(c.cleanStatus());
        }
      } else if (sel === "water") {
        // MANUAL pour: progress runs in the sim tick while held over the dish.
        const status = c.pourAt(g);
        this.drawers.setNote(
          status === "pouring"
            ? "Pouring… hold steady — the water level is rising."
            : status === "full"
              ? "The dish is full to the brim."
              : status === "offDish"
                ? "Hold the pitcher over the water dish to pour."
                : "No water dish placed — add one in Decorate.",
          status === "noDish",
        );
      } else {
        c.brushClean(g.x, g.z, this.drawers.radius);
      }
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
      // Terrain editor: the Filters tab never edits; tools act per their
      // registry definition (paint = lay the armed material, sculpt tools =
      // brush ops at the Intensity × Brush Mode strength).
      if (this.drawers.terrainTab !== "terrain") return;
      const tool = toolById(this.drawers.selected);
      if (!tool) return;
      if (tool.action === "paintMaterial") {
        this.paintMaterialAt(g.x, g.z);
        return;
      }
      if (tool.id === "erase") {
        c.sculptAt("erase", g.x, g.z, this.drawers.radius, this.drawers.sculptStrength);
      } else {
        for (const op of tool.ops ?? []) {
          c.sculptAt(op, g.x, g.z, this.drawers.radius, this.drawers.sculptStrength);
        }
      }
      this.drawers.setTerrainInfo(c.terrainInfo());
    }
  }

  /** The Paint tool, PHYSICAL: each pointer sample lays the armed material
   *  into the per-cell map right under the brush — the floor changes exactly
   *  where the player strokes. Bookkeeping commits on pointer-up. */
  private paintMaterialAt(x: number, z: number): void {
    const c = this.three?.controller;
    const sel = this.substrateSel;
    if (!c || !sel) return;
    const t = terrainById(sel.inspectedId);
    if (!t) return;
    if (!terrainUnlocked(t, c.substrateInfo().habitat)) {
      this.drawers.setNote(`${t.name} belongs to humid habitats — the paludarium uses it.`, true);
      return;
    }
    if (c.paintMaterialAt(t.id, x, z, this.drawers.radius)) this.paintedThisStroke = true;
  }

  // ── Decorate mode (lizard habitat editor) — entered via the mode machine ──

  private enterEditor(): void {
    const editor = this.three?.getEditor();
    if (!editor) {
      this.toasts.show("Habitat still loading — one moment.", "warn");
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
    // Deep link from the Inventory's "Place in Habitat": arm the piece as if
    // its catalog card had been clicked.
    if (this.pendingDecorArm) {
      const def = findPlaceable(this.pendingDecorArm);
      const armed = this.editorPanel.armExternal(this.pendingDecorArm);
      this.pendingDecorArm = null;
      if (armed && def) {
        this.toasts.show(`${def.label} armed — click the sand to place it (free, from your inventory).`, "info");
        return;
      }
    }
    this.hint("Decorate Mode — click a piece, then click the sand to place it.");
  }

  /** Placed-decor counts for the Inventory. Habitats that have never been
   *  visited have no save yet — their AUTHORED default layouts still belong
   *  to the player, so those pieces count as "in habitat" too (otherwise a
   *  fresh keeper opens an empty Decorations tab). */
  private decorInUse(): Record<string, number> {
    const counts = readInUse([LIZARD_HABITAT_ID, FROG_HABITAT_ID]);
    const addDefaults = (habitatId: string, objects: Array<{ defId?: string }>): void => {
      try {
        if (window.localStorage.getItem(`glasswater.habitat.${habitatId}`)) return;
      } catch {
        return;
      }
      for (const o of objects) if (o.defId) counts[o.defId] = (counts[o.defId] ?? 0) + 1;
    };
    addDefaults(LIZARD_HABITAT_ID, makeLizardHabitatLayout().objects);
    addDefaults(FROG_HABITAT_ID, makeFrogHabitatLayout().objects);
    return counts;
  }

  /** Inventory → "Place in Habitat" (defId) or "Edit in Habitat" (null):
   *  enter the vivarium, open Decorate, and arm the piece once the scene is
   *  really ready (bounded retry while loading). A null arm just opens the
   *  editor so already-placed pieces can be moved / rotated / removed. */
  private placeFromInventory(defId: string | null): void {
    this.pendingDecorArm = defId;
    this.hubScreens.close();
    this.enterHabitat("lizard");
    let tries = 0;
    const attempt = (): void => {
      if (defId && !this.pendingDecorArm) return; // enterEditor already consumed it
      if (this.uiMode.mode === "decorate") return;
      if (this.lizardHud.visible && this.three?.controller && this.three?.getEditor()) {
        this.requestMode("decorate");
        return;
      }
      if (++tries < 120) window.setTimeout(attempt, 500);
      else this.pendingDecorArm = null; // habitat never became ready — give up quietly
    };
    attempt();
  }

  /** Inventory → Bulk Actions → sell every spare decor piece at once. Each
   *  piece lands in Buy Back (newest first, list capped) for easy undo. */
  private sellAllDecorSpares(): { ok: boolean; message: string } {
    const owned = loadOwned();
    const before = { ...owned };
    const res = sellAllSpares(owned, (id) => decorPrice(id));
    if (res.count === 0) return { ok: false, message: "No spare pieces to sell — placed decor stays placed." };
    let buyback = loadBuyback();
    const t = Date.now();
    for (const [defId, had] of Object.entries(before)) {
      const refund = Math.floor(decorPrice(defId) * SELL_BACK_RATE);
      for (let i = 0; i < Math.max(0, Math.floor(had)); i++) buyback = pushBuyback(buyback, defId, refund, t);
    }
    saveBuyback(buyback);
    saveOwned(owned);
    this.state.resources.leaves += res.refund;
    this.save(false);
    sfx.done();
    return { ok: true, message: `Sold ${res.count} spare piece${res.count === 1 ? "" : "s"} — +${res.refund} leaves. Undo any of it in Buy Back.` };
  }

  /** Inventory → sell one owned piece back for leaves. The sale lands in the
   *  Buy Back list so a mis-click can be undone at exactly the same price. */
  private sellDecorPiece(defId: string): { ok: boolean; message: string } {
    const owned = loadOwned();
    const res = sellOwned(owned, defId, decorPrice(defId));
    if (!res.ok) return { ok: false, message: res.reason ?? "Nothing to sell." };
    saveOwned(owned);
    saveBuyback(pushBuyback(loadBuyback(), defId, res.refund, Date.now()));
    this.state.resources.leaves += res.refund;
    this.save(false);
    sfx.done();
    const label = findPlaceable(defId)?.label ?? "Piece";
    return { ok: true, message: `${label} sold — +${res.refund} leaves. Changed your mind? It's in Buy Back.` };
  }

  /** Inventory → Buy Back: undo a sale at exactly the refunded price. */
  private buyBackDecor(index: number): { ok: boolean; message: string } {
    const owned = loadOwned();
    const list = loadBuyback();
    const entry = list[index];
    const { res, list: next } = takeBuyback(list, index, owned, Math.floor(this.state.resources.leaves));
    if (!res.ok) return { ok: false, message: res.reason ?? "Couldn't buy that back." };
    saveOwned(owned);
    saveBuyback(next);
    const acquired = loadAcquired();
    markAcquired(acquired, [`decor:${entry!.defId}`], Date.now());
    saveAcquired(acquired);
    this.state.resources.leaves -= res.cost;
    this.save(false);
    sfx.done();
    const label = findPlaceable(entry!.defId)?.label ?? "Piece";
    return { ok: true, message: `${label} bought back — −${res.cost} leaves.` };
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

  /** DEV-ONLY corner switcher (?dev=1 / legacy URLs) — players use the hub. */
  private createViewSwitch(): void {
    const group = document.createElement("div");
    group.className = "tank-mode-switch";

    const make = (label: string, mode: TankMode, habitat: HabitatKind, go?: () => void): void => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tank-mode-btn";
      b.textContent = label;
      b.addEventListener(
        "click",
        go ??
          (() => {
            if (mode === "2d") {
              this.legacy2d = true;
              this.tankMode = "2d";
              this.hub.hide();
              this.applyCanvasVisibility();
              this.updateToggleState();
            } else {
              this.enterHabitat(habitat);
            }
          }),
      );
      group.append(b);
      this.viewButtons.push({ btn: b, mode, habitat });
    };

    make("⌂ Hub", "3d", "fish", () => this.goHome());
    make("◧ 2D (legacy)", "2d", "fish");
    make("🐟 Fish", "3d", "fish");
    make("🕷 Spider (dev)", "3d", "spider");
    make("🦎 Lizard", "3d", "lizard");
    make("🐸 Frog", "3d", "frog");
    make("🎬 Frog Lab (dev)", "3d", "froglab");
    this.layout.root.append(group);
    this.updateToggleState();
  }

  private updateToggleState(): void {
    for (const v of this.viewButtons) {
      const active =
        v.mode === "2d"
          ? this.legacy2d
          : !this.legacy2d && this.tankMode === "3d" && this.habitat === v.habitat;
      v.btn.classList.toggle("is-active", active);
    }
  }
}

/** "34s ago" / "5m ago" / "1.2h ago" for the details panel's care history. */
function agoWord(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${(s / 3600).toFixed(1)}h ago`;
}

/**
 * FISH HUD — the aquarium habitat's GLASSWATER game UI, built to the same bar
 * as the gecko HUD (identity card · score card · stat strip · action dock ·
 * drawers · details panel · photo/album) but designed for a FISH TANK:
 * water chemistry is the star, feeding sprinkles real sinking food, cleaning
 * is glass-scrub + gravel-vacuum + water change, and the info panel lists the
 * tank's real residents.
 *
 * All numbers come from the deterministic nitrogen-cycle sim (src/core/sim.ts)
 * — the same model that powered the original aquarium, now wearing the game
 * UI. Which regions show is decided by the shared pure mode machine
 * (src/ui/gwModes.ts, home = "fish-main").
 */
import type { GameState } from "../core/state";
import { getActiveTank } from "../core/state";
import { readAllMetrics } from "../data/water";
import { stockCount, type Stock } from "../game/economy";
import { getAction } from "../data/tanks";
import type { FishFoodKind } from "../render/three/ThreeHabitat";
import { ensureGwStyles, gwEl as el, gwProgressRing } from "./gwTheme";
import { gwIcon, type GwIconName } from "./gwIcons";
import { regionsFor, type GwMode, type GwRegions } from "./gwModes";
import { fmtTemp } from "./prefs";
import { ASSETS } from "../data/assets";

export type FishCleanTool = "scrub" | "vacuum";

export interface FishHudCallbacks {
  requestMode(mode: GwMode): void;
  cameraPreset(name: string): void;
  resetCamera(): void;
  goHome(): void;
  openSettings(): void;
  openAlbum(): void;
  capturePhoto(): void;
  /** Sprinkle the selected food (portion = pinches). */
  serveFood(kind: FishFoodKind, portion: number): void;
  /** Partial water change (costs leaves via the sim action). */
  waterChange(): void;
}

interface StatItem {
  root: HTMLElement;
  fill: HTMLElement;
  status: HTMLElement;
  value: HTMLElement;
}

interface DockCard {
  root: HTMLButtonElement;
  sub: HTMLElement;
}

export interface FishPopulationRow {
  id: string;
  label: string;
  count: number;
}

const DOCK_ITEMS: { mode: GwMode; icon: GwIconName; color: string; label: string; sub: string }[] = [
  { mode: "fish-feed", icon: "bowl", color: "#e6d7ae", label: "Feed", sub: "Sprinkle food" },
  { mode: "fish-clean", icon: "broom", color: "#d9b678", label: "Clean", sub: "Glass & gravel" },
  { mode: "fish-info", icon: "fish", color: "#7fd0e8", label: "Tank Residents", sub: "Who lives here" },
];

const FOODS: { kind: FishFoodKind; stockId: string; label: string; icon: string; note: string }[] = [
  { kind: "flakes", stockId: "flakes", label: "Flake Food", icon: "🥣", note: "Community staple — floats, then sinks." },
  { kind: "pellets", stockId: "pellets", label: "Sinking Pellets", icon: "🟤", note: "Reaches the bottom dwellers." },
  { kind: "bloodworms", stockId: "bloodworms", label: "Bloodworm Treat", icon: "🍥", note: "Rich treat — don't overdo it." },
];

function ratingWord(score: number): string {
  return score >= 88 ? "Excellent" : score >= 75 ? "Thriving" : score >= 60 ? "Stable" : score >= 40 ? "Struggling" : "Critical";
}

export class FishHud {
  readonly root: HTMLElement;
  private cb: FishHudCallbacks;
  private _visible = false;
  private mode: GwMode = "fish-main";

  // Top cards.
  private topCard!: HTMLElement;
  private idName!: HTMLElement;
  private idPop!: HTMLElement;
  private scoreCard!: HTMLElement;
  private scoreNum!: HTMLElement;
  private scoreRating!: HTMLElement;
  private scoreLine!: HTMLElement;
  private scoreBtn!: HTMLButtonElement;
  private ring!: ReturnType<typeof gwProgressRing>;
  private homePill!: HTMLButtonElement;
  private photoBtn!: HTMLButtonElement;
  private albumBtn!: HTMLButtonElement;
  private shutterBtn!: HTMLButtonElement;
  private warnPill!: HTMLElement;
  private photoHint!: HTMLElement;

  // Bottom regions.
  private statStrip!: HTMLElement;
  private stats = new Map<string, StatItem>();
  private dockWrap!: HTMLElement;
  private dockCards = new Map<GwMode, DockCard>();

  // Drawers.
  private feedDrawer!: HTMLElement;
  private feedCards = new Map<string, { root: HTMLButtonElement; badge: HTMLElement }>();
  private feedNote!: HTMLElement;
  private portionVal!: HTMLElement;
  private foodMeterFill!: HTMLElement;
  private foodMeterText!: HTMLElement;
  selectedFood: FishFoodKind = "flakes";
  portion = 1;

  private cleanDrawer!: HTMLElement;
  private cleanCards = new Map<FishCleanTool, HTMLButtonElement>();
  private cleanNote!: HTMLElement;
  private cleanMeterFill!: HTMLElement;
  private cleanMeterText!: HTMLElement;
  private waterBtn!: HTMLButtonElement;
  cleanTool: FishCleanTool = "scrub";

  // Residents panel + flyouts.
  private infoPanel!: HTMLElement;
  private infoList!: HTMLElement;
  private infoHealth!: { fill: HTMLElement; text: HTMLElement };
  private detailsFly!: HTMLElement;
  private detailMeters = new Map<string, StatItem>();
  private detailScoreLine!: HTMLElement;
  private detailRing!: ReturnType<typeof gwProgressRing>;
  private detailTankLine!: HTMLElement;
  private detailWarns!: HTMLElement;
  private logFly!: HTMLElement;
  private logList!: HTMLElement;
  private settingsFly!: HTMLElement;

  private popBuiltFor = "";

  constructor(cb: FishHudCallbacks) {
    this.cb = cb;
    ensureGwStyles();
    this.root = el("div", "gw-hud");
    this.root.style.cssText = "position:fixed;inset:0;z-index:4;pointer-events:none;";
    this.root.classList.add("gw-hidden");
    this.build();
  }

  // ── Build ──────────────────────────────────────────────────────────────

  private build(): void {
    this.buildTopCards();
    this.buildStatStrip();
    this.buildDock();
    this.buildFeedDrawer();
    this.buildCleanDrawer();
    this.buildInfoPanel();
    this.buildFlyouts();

    this.warnPill = el("div", "gw-warn-pill gw-hidden");
    // Sits BELOW the ⌂ home button (both are top-centre).
    this.warnPill.style.top = "clamp(74px, 10vh, 96px)";
    this.photoHint = el("div", "gw-hint-pill gw-hidden", "Photo Mode — drag to orbit freely · Esc to exit");
    this.photoHint.prepend(gwIcon("camera", 14, "#dfe4da"));
    this.photoHint.style.display = "inline-flex";
    this.photoHint.style.alignItems = "center";
    this.photoHint.style.gap = "8px";
    this.root.append(this.warnPill, this.photoHint);
  }

  private buildTopCards(): void {
    // Home pill — the way back to the eco-center hub, top centre.
    this.homePill = el("button", "gw-icon-button square") as HTMLButtonElement;
    this.homePill.textContent = "⌂";
    this.homePill.title = "Back to the Eco-Center";
    this.homePill.style.cssText =
      "position:absolute; top: clamp(14px, 2vh, 26px); left: 50%; transform: translateX(-50%); font-size: 22px;";
    this.homePill.addEventListener("click", () => this.cb.goHome());

    // Identity card.
    this.topCard = el("div", "gw-panel gw-top-card");
    const row = el("div", "gw-id-row");
    const thumb = el("div", "gw-thumb");
    thumb.style.background = "radial-gradient(circle at 32% 28%, #1d4a56, #0c2026 78%)";
    const img = document.createElement("img");
    img.src = ASSETS.creatures.betta;
    img.alt = "Community aquarium";
    img.style.objectFit = "contain";
    thumb.append(img);
    const txt = el("div");
    this.idName = el("div", "gw-id-name");
    this.idName.append(document.createTextNode("Sapphire Stream"), gwIcon("leaf", 13, "#8ce25a"));
    const species = el("div", "gw-id-species", "Community Aquarium");
    const sci = el("div", "gw-id-sci", "Freshwater · planted · 120 L");
    txt.append(this.idName, species, sci);
    row.append(thumb, txt);
    const tags = el("div", "gw-tag-row");
    const tagDefs: [GwIconName, string, string][] = [
      ["drop", "#5db9f0", "Freshwater"],
      ["thermo", "#ef7a5e", "Tropical"],
      ["sprout", "#8ce25a", "Planted"],
    ];
    for (const [ic, color, label] of tagDefs) {
      const pill = el("span", "gw-pill");
      pill.append(gwIcon(ic, 12, color), document.createTextNode(label));
      tags.append(pill);
    }
    this.idPop = el("span", "gw-pill");
    this.idPop.style.borderColor = "rgba(93,185,240,0.4)";
    this.idPop.append(gwIcon("fish", 12, "#7fd0e8"), document.createTextNode("—"));
    tags.append(this.idPop);
    this.topCard.append(row, tags);

    // Score card.
    this.scoreCard = el("div", "gw-panel gw-score-card");
    const head = el("div", "gw-score-head");
    head.append(document.createTextNode("Aquarium Score"), el("span", "qi", "i"));
    const main = el("div", "gw-score-main");
    const numWrap = el("div");
    this.scoreNum = el("span", "gw-score-num", "—");
    this.scoreRating = el("span", "gw-score-rating", "");
    this.scoreRating.style.marginLeft = "9px";
    numWrap.append(this.scoreNum, this.scoreRating);
    this.ring = gwProgressRing(60, 5.5);
    this.ring.center.replaceChildren(gwIcon("fish", 24, "#7fd0e8"));
    main.append(numWrap, this.ring.root);
    this.scoreLine = el("div", "gw-score-line", "");
    this.scoreBtn = el("button", "gw-row-btn") as HTMLButtonElement;
    this.scoreBtn.append(gwIcon("chart", 14, "#c9cec4"), document.createTextNode("View Detailed Stats"), gwIcon("chevron", 12, "#a9b1a2"));
    (this.scoreBtn.lastChild as HTMLElement).style.marginLeft = "auto";
    this.scoreBtn.addEventListener("click", () => this.toggleFly(this.detailsFly));
    this.scoreCard.append(head, main, this.scoreLine, this.scoreBtn);

    // Photo + album buttons, right edge.
    this.photoBtn = el("button", "gw-icon-button square") as HTMLButtonElement;
    this.photoBtn.append(gwIcon("camera", 20, "#e8ebe3"));
    this.photoBtn.title = "Photo Mode — free camera for screenshots";
    this.photoBtn.style.cssText = "position:absolute; right: clamp(14px,1.6vw,28px); top: clamp(186px, 25.5vh, 238px);";
    this.photoBtn.addEventListener("click", () => this.cb.requestMode("photo"));
    this.albumBtn = el("button", "gw-icon-button square") as HTMLButtonElement;
    this.albumBtn.textContent = "🖼";
    this.albumBtn.style.fontSize = "17px";
    this.albumBtn.title = "Photo Album — your saved pictures";
    this.albumBtn.style.cssText +=
      ";position:absolute; right: clamp(14px,1.6vw,28px); top: calc(clamp(186px, 25.5vh, 238px) + 60px);";
    this.albumBtn.addEventListener("click", () => this.cb.openAlbum());

    this.shutterBtn = el("button", "gw-shutter gw-hidden") as HTMLButtonElement;
    this.shutterBtn.title = "Take a photo";
    this.shutterBtn.addEventListener("click", () => this.cb.capturePhoto());

    this.root.append(this.homePill, this.topCard, this.scoreCard, this.photoBtn, this.albumBtn, this.shutterBtn);
  }

  private statItem(key: string, icon: GwIconName, color: string, label: string, barClass = ""): HTMLElement {
    const item = el("div", "gw-stat-item");
    const top = el("div", "top");
    top.append(gwIcon(icon, 15, color), document.createTextNode(label));
    const bar = el("div", `gw-bar ${barClass}`.trim());
    const fill = el("i");
    bar.append(fill);
    const foot = el("div", "foot");
    const status = el("span", "st", "—");
    const value = el("span", undefined, "");
    foot.append(status, value);
    item.append(top, bar, foot);
    this.stats.set(key, { root: item, fill, status, value });
    return item;
  }

  private buildStatStrip(): void {
    this.statStrip = el("div", "gw-stat-strip");
    this.statStrip.append(
      this.statItem("temp", "thermo", "#ef7a5e", "Temperature", "amber"),
      this.statItem("ph", "flask", "#7fd6a8", "pH"),
      this.statItem("oxygen", "drop", "#5db9f0", "Oxygen", "blue"),
      this.statItem("ammonia", "flask", "#9ad36b", "Ammonia"),
      this.statItem("nitrite", "flask", "#e8b45a", "Nitrite"),
      this.statItem("nitrate", "flask", "#d98a5f", "Nitrate"),
      this.statItem("clean", "sparkle", "#f0b64b", "Cleanliness"),
      this.statItem("food", "fork", "#8ce25a", "Food Level"),
    );
    this.root.append(this.statStrip);
  }

  private buildDock(): void {
    this.dockWrap = el("div", "gw-dock-wrap");
    const menuBtn = el("button", "gw-icon-button") as HTMLButtonElement;
    menuBtn.append(gwIcon("menu", 19, "#e8ebe3"));
    menuBtn.title = "Event log";
    menuBtn.addEventListener("click", () => this.toggleFly(this.logFly));

    const dock = el("div", "gw-action-dock");
    for (const d of DOCK_ITEMS) {
      const card = el("button", "gw-action-card") as HTMLButtonElement;
      const txt = el("div");
      const sub = el("div", "sub", d.sub);
      txt.append(el("div", "lbl", d.label), sub);
      const ic = el("span", "ic");
      ic.append(gwIcon(d.icon, 30, d.color));
      card.append(ic, txt, el("span", "dot"));
      card.addEventListener("click", () => this.cb.requestMode(d.mode));
      this.dockCards.set(d.mode, { root: card, sub });
      dock.append(card);
    }

    const settingsBtn = el("button", "gw-icon-button") as HTMLButtonElement;
    settingsBtn.append(gwIcon("sliders", 19, "#e8ebe3"));
    settingsBtn.title = "Camera & settings";
    settingsBtn.addEventListener("click", () => this.toggleFly(this.settingsFly));

    this.dockWrap.append(menuBtn, dock, settingsBtn);
    this.root.append(this.dockWrap);
  }

  private drawerShell(title: string, subtitle: string): { drawer: HTMLElement; body: HTMLElement } {
    const drawer = el("div", "gw-panel gw-bottom-drawer gw-low gw-hidden");
    const head = el("div", "gw-drawer-head");
    head.append(el("div", "gw-drawer-title", title), el("div", "gw-drawer-sub", subtitle), el("div", "spacer"));
    const x = el("button", "gw-x", "✕");
    x.addEventListener("click", () => this.cb.requestMode(this.mode)); // toggles back home
    head.append(x);
    const body = el("div");
    drawer.append(head, body);
    this.root.append(drawer);
    return { drawer, body };
  }

  private buildFeedDrawer(): void {
    const { drawer, body } = this.drawerShell("Feed the Tank", "A pinch goes a long way — uneaten food fouls the water");
    this.feedDrawer = drawer;
    body.style.cssText = "display:flex; gap:18px; align-items:stretch;";

    const cards = el("div");
    cards.style.cssText = "display:grid; grid-template-columns: repeat(3, minmax(150px, 200px)); gap:10px;";
    for (const f of FOODS) {
      const card = el("button", "gw-item-card") as HTMLButtonElement;
      const art = el("span", "art", f.icon);
      const nm = el("span", "nm", f.label);
      const ds = el("span", "ds", f.note);
      const badge = el("span", "gw-badge dim", "—");
      badge.style.margin = "7px auto 0";
      card.append(art, nm, ds, badge, el("span", "check", "✓"));
      card.addEventListener("click", () => {
        this.selectedFood = f.kind;
        for (const [k, c] of this.feedCards) c.root.classList.toggle("gw-active", k === f.kind);
      });
      this.feedCards.set(f.kind, { root: card, badge });
      cards.append(card);
    }
    this.feedCards.get(this.selectedFood)?.root.classList.add("gw-active");

    const side = el("div");
    side.style.cssText = "display:flex; flex-direction:column; gap:10px; min-width: 250px;";
    const field = el("div", "gw-field");
    field.append(el("span", "cap", "Portion (pinches)"));
    const stepper = el("div", "gw-stepper");
    const minus = el("button", undefined, "−");
    this.portionVal = el("span", "val", "1");
    const plus = el("button", undefined, "+");
    minus.addEventListener("click", () => this.setPortion(this.portion - 1));
    plus.addEventListener("click", () => this.setPortion(this.portion + 1));
    stepper.append(minus, this.portionVal, plus);
    field.append(stepper);

    const meter = el("div", "gw-field");
    meter.append(el("span", "cap", "Uneaten food in the water"));
    const bar = el("div", "gw-bar amber");
    this.foodMeterFill = el("i");
    bar.append(this.foodMeterFill);
    this.foodMeterText = el("span", "note", "—");
    meter.append(bar, this.foodMeterText);

    const cta = el("button", "gw-primary-button", "Sprinkle Food") as HTMLButtonElement;
    cta.addEventListener("click", () => this.cb.serveFood(this.selectedFood, this.portion));
    this.feedNote = el("div");
    this.feedNote.style.cssText = "font:500 11.5px/1.4 var(--gw-font); color: var(--gw-ink-dim); min-height: 16px;";
    side.append(field, meter, cta, this.feedNote);

    body.append(cards, side);
  }

  private buildCleanDrawer(): void {
    const { drawer, body } = this.drawerShell("Clean & Water Care", "Hold and drag the tools on the tank");
    this.cleanDrawer = drawer;
    body.style.cssText = "display:flex; gap:16px; align-items:stretch;";

    const tools = el("div", "gw-tool-row");
    tools.style.flex = "1.4";
    const mkTool = (id: FishCleanTool, icon: string, name: string, desc: string): void => {
      const card = el("button", "gw-tool-card") as HTMLButtonElement;
      const row = el("div", "trow");
      row.append(el("span", "ic", icon), el("span", "nm", name));
      card.append(row, el("div", "ds", desc), el("span", "check", "✓"));
      card.addEventListener("click", () => {
        this.cleanTool = id;
        for (const [k, c] of this.cleanCards) c.classList.toggle("gw-active", k === id);
      });
      this.cleanCards.set(id, card);
      tools.append(card);
    };
    mkTool("scrub", "🧽", "Scrub Glass", "Drag on the front glass — algae film sparkles away.");
    mkTool("vacuum", "🌀", "Gravel Vacuum", "Drag on the gravel — siphons mulm and debris.");
    this.cleanCards.get(this.cleanTool)?.classList.add("gw-active");

    const side = el("div");
    side.style.cssText = "display:flex; flex-direction:column; gap:10px; min-width: 270px;";
    const meter = el("div", "gw-field");
    meter.append(el("span", "cap", "Cleanliness"));
    const bar = el("div", "gw-bar");
    this.cleanMeterFill = el("i");
    bar.append(this.cleanMeterFill);
    this.cleanMeterText = el("span", "note", "—");
    meter.append(bar, this.cleanMeterText);

    const cost = getAction("waterChange").cost;
    this.waterBtn = el("button", "gw-primary-button") as HTMLButtonElement;
    this.waterBtn.append(document.createTextNode("Water Change"), el("span", "subtx", `Fresh conditioned water · ${cost} leaves`));
    this.waterBtn.addEventListener("click", () => this.cb.waterChange());

    this.cleanNote = el("div");
    this.cleanNote.style.cssText = "font:500 11.5px/1.4 var(--gw-font); color: var(--gw-ink-dim); min-height: 16px;";
    side.append(meter, this.waterBtn, this.cleanNote);

    body.append(tools, side);
  }

  private buildInfoPanel(): void {
    this.infoPanel = el("div", "gw-panel gw-animal-panel gw-hidden");
    const head = el("div", "ap-head");
    head.append(el("div", "ap-title", "Tank Residents"));
    const x = el("button", "gw-x ap-x", "✕");
    x.addEventListener("click", () => this.cb.requestMode("fish-info"));
    head.append(x);
    const bodyEl = el("div", "ap-body");

    const status = el("div", "ap-status");
    const s1 = el("div", "s1");
    s1.append(el("span", "pulse"), document.createTextNode("Community health"));
    const barWrap = el("div", "gw-bar");
    barWrap.style.marginTop = "8px";
    const fill = el("i");
    barWrap.append(fill);
    const s2 = el("div", "s2", "—");
    status.append(s1, barWrap, s2);
    this.infoHealth = { fill, text: s2 };

    this.infoList = el("div");
    this.infoList.style.marginTop = "12px";
    bodyEl.append(status, this.infoList);

    const foot = el("div", "ap-foot");
    const feedBtn = el("button", "gw-primary-button", "Feed") as HTMLButtonElement;
    feedBtn.addEventListener("click", () => this.cb.requestMode("fish-feed"));
    const detailsBtn = el("button", "gw-ghost-button", "Habitat Details") as HTMLButtonElement;
    detailsBtn.addEventListener("click", () => {
      this.closeFlyouts();
      this.detailsFly.classList.remove("hidden");
    });
    foot.append(feedBtn, detailsBtn);

    this.infoPanel.append(head, bodyEl, foot);
    this.root.append(this.infoPanel);
  }

  private buildFlyouts(): void {
    // HABITAT DETAILS — water chemistry, tank, care.
    this.detailsFly = el("div", "gw-flyout hidden gw-details");
    const head = el("div", "dhead");
    const hTx = el("div");
    hTx.append(el("div", "gw-section-title", "Aquarium Details"), (this.detailScoreLine = el("div", "dscore", "—")));
    this.detailRing = gwProgressRing(56, 5);
    this.detailRing.center.replaceChildren(gwIcon("fish", 22, "#7fd0e8"));
    head.append(hTx, this.detailRing.root);
    this.detailsFly.append(head);

    const mk = (host: HTMLElement, key: string, icon: GwIconName, color: string, label: string): void => {
      const rowEl = el("div", "gw-meter");
      const bar = el("div", "gw-bar");
      const fill = el("i");
      bar.append(fill);
      const stat = el("div", "stat");
      const value = el("span", "pc", "—");
      const status = el("span", "st", "");
      stat.append(value, status);
      const ic = el("span", "ic");
      ic.append(gwIcon(icon, 13, color));
      rowEl.append(ic, el("span", "k", label), bar, stat);
      this.detailMeters.set(key, { root: rowEl, fill, status, value });
      host.append(rowEl);
    };
    const section = (title: string): HTMLElement => {
      const s = el("div", "dsec");
      s.append(el("div", "gw-section-title", title));
      this.detailsFly.append(s);
      return s;
    };

    const water = section("Water Chemistry");
    mk(water, "temperature", "thermo", "#ef7a5e", "Temperature");
    mk(water, "ph", "flask", "#7fd6a8", "pH Level");
    mk(water, "oxygen", "drop", "#5db9f0", "Oxygen");
    mk(water, "ammonia", "flask", "#9ad36b", "Ammonia");
    mk(water, "nitrite", "flask", "#e8b45a", "Nitrite");
    mk(water, "nitrate", "flask", "#d98a5f", "Nitrate");

    const care = section("Care & Upkeep");
    mk(care, "clean", "sparkle", "#f0b64b", "Cleanliness");
    mk(care, "food", "fork", "#8ce25a", "Uneaten Food");
    mk(care, "plants", "sprout", "#8ce25a", "Plant Cover");
    mk(care, "stock", "fish", "#7fd0e8", "Stocking Level");

    this.detailTankLine = el("div", "dline");
    this.detailsFly.append(this.detailTankLine);
    this.detailWarns = el("div");
    this.detailWarns.style.cssText = "margin-top:8px; font: 500 12px/1.45 var(--gw-font); color: var(--gw-amber);";
    this.detailsFly.append(this.detailWarns);

    // Event log flyout.
    this.logFly = el("div", "gw-flyout hidden");
    this.logFly.style.cssText = "bottom: clamp(78px, 11vh, 100px); left: clamp(14px, 4vw, 60px);";
    this.logFly.append(el("div", "gw-section-title", "Event Log"));
    this.logList = el("div");
    this.logFly.append(this.logList);

    // Settings flyout: camera presets + home/settings.
    this.settingsFly = el("div", "gw-flyout hidden");
    this.settingsFly.style.cssText = "bottom: clamp(78px, 11vh, 100px); right: clamp(14px, 4vw, 60px);";
    this.settingsFly.append(el("div", "gw-section-title", "Camera"));
    const camRow = el("div", "fx-btns");
    const cams: [string, string][] = [
      ["⌂ Front", "front"],
      ["◀ Left", "left"],
      ["▶ Right", "right"],
      ["⬒ Top", "top"],
    ];
    for (const [label, preset] of cams) {
      const b = el("button", "gw-chip", label) as HTMLButtonElement;
      b.addEventListener("click", () => this.cb.cameraPreset(preset));
      camRow.append(b);
    }
    const reset = el("button", "gw-chip", "⟲ Reset") as HTMLButtonElement;
    reset.addEventListener("click", () => this.cb.resetCamera());
    camRow.append(reset);
    this.settingsFly.append(camRow);
    this.settingsFly.append(el("div", "gw-section-title", "Game"));
    const extra = el("div", "fx-btns");
    const homeBtn = el("button", "gw-chip", "🏠 Eco-Center") as HTMLButtonElement;
    homeBtn.addEventListener("click", () => this.cb.goHome());
    const setBtn = el("button", "gw-chip", "⚙ Settings") as HTMLButtonElement;
    setBtn.addEventListener("click", () => this.cb.openSettings());
    extra.append(homeBtn, setBtn);
    this.settingsFly.append(extra);

    this.root.append(this.detailsFly, this.logFly, this.settingsFly);
  }

  private toggleFly(which: HTMLElement): void {
    for (const f of [this.detailsFly, this.logFly, this.settingsFly]) {
      if (f === which) continue;
      f.classList.add("hidden");
    }
    which.classList.toggle("hidden");
  }

  closeFlyouts(): void {
    for (const f of [this.detailsFly, this.logFly, this.settingsFly]) f.classList.add("hidden");
  }

  private setPortion(p: number): void {
    this.portion = Math.max(1, Math.min(3, p));
    this.portionVal.textContent = String(this.portion);
  }

  setFeedNote(text: string, warn = false): void {
    this.feedNote.textContent = text;
    this.feedNote.style.color = warn ? "var(--gw-amber)" : "var(--gw-ink-dim)";
  }

  setCleanNote(text: string, warn = false): void {
    this.cleanNote.textContent = text;
    this.cleanNote.style.color = warn ? "var(--gw-amber)" : "var(--gw-ink-dim)";
  }

  // ── Mode / visibility ────────────────────────────────────────────────────

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return this._visible;
  }

  setVisible(v: boolean): void {
    if (this._visible === v) return;
    this._visible = v;
    this.root.classList.toggle("gw-hidden", !v);
  }

  applyMode(mode: GwMode, regions: GwRegions = regionsFor(mode)): void {
    this.mode = mode;
    this.statStrip.classList.toggle("gw-hidden", !regions.statStrip);
    this.dockWrap.classList.toggle("gw-hidden", !regions.dock);
    this.feedDrawer.classList.toggle("gw-hidden", regions.drawer !== "fish-feed");
    this.cleanDrawer.classList.toggle("gw-hidden", regions.drawer !== "fish-clean");
    this.infoPanel.classList.toggle("gw-hidden", !regions.animalPanel);
    this.photoHint.classList.toggle("gw-hidden", mode !== "photo");
    this.shutterBtn.classList.toggle("gw-hidden", mode !== "photo");
    const compact = regions.topCards === "compact";
    const hidden = regions.topCards === "hidden";
    this.topCard.classList.toggle("gw-hidden", hidden);
    this.scoreCard.classList.toggle("gw-hidden", hidden);
    this.homePill.classList.toggle("gw-hidden", hidden || compact);
    this.photoBtn.classList.toggle("gw-hidden", hidden);
    this.albumBtn.classList.toggle("gw-hidden", hidden || compact);
    this.scoreBtn.classList.toggle("gw-hidden", compact || hidden);
    this.photoBtn.classList.toggle("gw-active", mode === "photo");
    for (const [m, card] of this.dockCards) card.root.classList.toggle("gw-active", m === mode);
    this.closeFlyouts();
  }

  // ── Live data ────────────────────────────────────────────────────────────

  update(state: GameState, population: FishPopulationRow[], foodBits: number, stock: Stock): void {
    const tank = getActiveTank(state);
    const metrics = readAllMetrics(tank.water);
    const byKey = new Map(metrics.map((m) => [m.def.key as string, m]));

    // Identity + population pill.
    this.idName.childNodes[0].textContent = tank.name;
    const totalPop = population.reduce((a, p) => a + p.count, 0);
    (this.idPop.childNodes[1] as Text).textContent = `${totalPop} residents`;

    // Score card.
    const score = Math.round(tank.habitatScore);
    this.scoreNum.textContent = String(score);
    this.scoreRating.textContent = ratingWord(score);
    this.ring.set(score);
    this.scoreLine.textContent =
      score >= 85 ? "The tank is thriving!" : score >= 65 ? "The tank is doing well." : "The water needs attention.";

    // Stat strip.
    const toneWord = (tone: string, goodWord = "Good"): { word: string; tone: string } =>
      tone === "good" ? { word: goodWord, tone: "" } : tone === "warn" ? { word: "Watch", tone: "warn" } : { word: "Bad", tone: "bad" };
    const setMetric = (key: string, decimalsOverride?: number): void => {
      const m = byKey.get(key);
      if (!m) return;
      const dec = decimalsOverride ?? m.def.decimals;
      const text = key === "temperature" ? fmtTemp(m.value, dec > 0 ? 1 : 0) : `${m.value.toFixed(dec)}${m.def.unit ? ` ${m.def.unit}` : ""}`;
      this.setStat(key === "temperature" ? "temp" : key, m.goodness * 100, text.trim(), toneWord(m.tone, key === "temperature" ? "Ideal" : "Good"));
    };
    setMetric("temperature");
    setMetric("ph");
    setMetric("oxygen");
    setMetric("ammonia");
    setMetric("nitrite");
    setMetric("nitrate");
    const clean = tank.water.cleanliness;
    this.setStat("clean", clean, `${Math.round(clean)}%`, {
      word: clean >= 80 ? "Sparkling" : clean >= 55 ? "Tidy" : clean >= 35 ? "Filmy" : "Grimy",
      tone: clean >= 55 ? "" : clean >= 35 ? "warn" : "bad",
    });
    this.setStat("food", Math.min(100, tank.food * 2.4), tank.food > 1 ? `${Math.round(tank.food)}` : "None", {
      word: tank.food > 34 ? "Too much" : tank.food > 12 ? "Plenty" : tank.food > 2 ? "Some" : "Eaten",
      tone: tank.food > 34 ? "bad" : "",
    });

    // Dock subtitles.
    const feed = this.dockCards.get("fish-feed");
    if (feed) feed.sub.textContent = tank.food > 34 ? "They're full — wait a bit" : "Sprinkle food";
    const cleanCard = this.dockCards.get("fish-clean");
    if (cleanCard) cleanCard.sub.textContent = clean < 55 ? "The glass needs a scrub" : "Glass & gravel";
    const info = this.dockCards.get("fish-info");
    if (info) info.sub.textContent = `${totalPop} residents`;

    // Warning pill — one at a time, worst first.
    const worst =
      byKey.get("ammonia")?.tone === "bad"
        ? "Ammonia is spiking — do a water change!"
        : byKey.get("nitrite")?.tone === "bad"
          ? "Nitrite is dangerously high — water change needed."
          : byKey.get("oxygen")?.tone === "bad"
            ? "Oxygen is low — check stocking and filtration."
            : tank.food > 34
              ? "Uneaten food is piling up — ease off the feeding."
              : clean < 35
                ? "The glass is getting grimy — time for a clean."
                : "";
    this.warnPill.textContent = worst ? `⚠ ${worst}` : "";
    this.warnPill.classList.toggle("gw-hidden", !worst || this.mode === "photo");

    // Drawer live bits.
    for (const f of FOODS) {
      const c = this.feedCards.get(f.kind);
      if (c) {
        const n = stockCount(stock, f.stockId);
        c.badge.textContent = n > 0 ? `${n} pinches` : "Out of stock";
        c.badge.className = `gw-badge ${n > 0 ? (n <= 3 ? "amber" : "green") : "amber"}`;
        c.root.disabled = n <= 0;
      }
    }
    this.foodMeterFill.style.width = `${Math.min(100, tank.food * 2.4)}%`;
    this.foodMeterText.textContent =
      foodBits > 0 ? `${foodBits} bits sinking · fish are on it` : tank.food > 34 ? "Too much — let them graze it down" : "The water is clear of food";
    this.cleanMeterFill.style.width = `${clean}%`;
    this.cleanMeterText.textContent = `${Math.round(clean)}% — ${clean >= 80 ? "sparkling" : clean >= 55 ? "tidy" : clean >= 35 ? "a film is forming" : "grimy"}`;
    this.waterBtn.disabled = state.resources.leaves < getAction("waterChange").cost;

    // Details panel.
    this.detailScoreLine.textContent = `${score} · ${ratingWord(score)}`;
    this.detailRing.set(score);
    for (const m of metrics) {
      const item = this.detailMeters.get(m.def.key);
      if (!item) continue;
      const text = m.def.key === "temperature" ? fmtTemp(m.value, 1) : `${m.value.toFixed(m.def.decimals)}${m.def.unit ? ` ${m.def.unit}` : ""}`;
      item.fill.style.width = `${Math.max(0, Math.min(100, m.goodness * 100))}%`;
      item.value.textContent = text.trim();
      item.status.textContent = m.tone === "good" ? "Good" : m.tone === "warn" ? "Watch" : "Bad";
      item.status.className = `st ${m.tone === "good" ? "" : m.tone}`.trim();
    }
    this.setMeter("clean", clean, `${Math.round(clean)}%`);
    this.setMeter("food", 100 - Math.min(100, tank.food * 2.4), tank.food > 1 ? `${Math.round(tank.food)} uneaten` : "All eaten");
    const plants = tank.scape.plants.length;
    this.setMeter("plants", Math.min(100, plants * 8), `${plants} plants`);
    this.setMeter("stock", Math.max(0, 100 - Math.max(0, totalPop - 36) * 4), `${totalPop} residents`);
    this.detailTankLine.replaceChildren(
      gwIcon("house", 12, "#c9cec4"),
      document.createTextNode(
        ` ${tank.sizeLiters} L · Filtration ${tank.filtration} · Lighting ${tank.lighting} · ${tank.scape.hardscape.length} hardscape pieces`,
      ),
    );
    this.detailWarns.textContent = worst ? `⚠ ${worst}` : "";

    // Residents panel (rebuild only when the roster changes).
    const health = tank.populations.length
      ? tank.populations.reduce((a, p) => a + p.health, 0) / tank.populations.length
      : 1;
    this.infoHealth.fill.style.width = `${Math.round(health * 100)}%`;
    this.infoHealth.text.textContent =
      health >= 0.85 ? "Everyone is doing great." : health >= 0.6 ? "Mostly healthy — watch the water." : "Stressed — improve the water quality.";
    const popKey = population.map((p) => `${p.id}:${p.count}`).join("|");
    if (popKey !== this.popBuiltFor) {
      this.popBuiltFor = popKey;
      this.infoList.replaceChildren();
      for (const p of population) {
        const row = el("div", "gw-meter");
        row.style.gridTemplateColumns = "26px 1fr 60px";
        const ic = el("span", "ic", "🐟");
        const k = el("span", "k", p.label);
        const n = el("span", "stat");
        n.append(el("span", "pc", `×${p.count}`));
        row.append(ic, k, n);
        this.infoList.append(row);
      }
    }

    // Event log flyout.
    if (!this.logFly.classList.contains("hidden")) {
      this.logList.replaceChildren();
      for (const ev of state.events.slice(0, 14)) {
        const line = el("div");
        line.style.cssText = `padding: 2.5px 0; font: 500 12px/1.4 var(--gw-font); color: ${
          ev.tone === "good" ? "var(--gw-green)" : ev.tone === "warn" ? "var(--gw-amber)" : ev.tone === "bad" ? "var(--gw-red)" : "var(--gw-ink-dim)"
        };`;
        line.textContent = `Day ${ev.day} · ${ev.time} — ${ev.message}`;
        this.logList.append(line);
      }
    }
  }

  private setStat(key: string, pct: number, valueText: string, s: { word: string; tone: string }): void {
    const item = this.stats.get(key);
    if (!item) return;
    item.fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    item.value.textContent = valueText;
    item.status.textContent = s.word;
    item.status.className = `st ${s.tone}`.trim();
  }

  private setMeter(key: string, pct: number, valueText: string): void {
    const m = this.detailMeters.get(key);
    if (!m) return;
    m.fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    m.value.textContent = valueText;
  }

  dispose(): void {
    this.root.remove();
  }
}

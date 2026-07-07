/**
 * GW BOTTOM DRAWERS — the Clean / Feed / Terrain mode UIs from the reference
 * images (docs/production/DESIGN_REFERENCE_MAP.md):
 *
 *  · Cleaning Mode  — "🧹 Cleaning Mode / Keep your habitat healthy" + five
 *    tool cards with live status badges + a cleanliness meter + Finish.
 *  · Feeding Mode   — method list (Quick Feed / Place in Dish / Tong Feed),
 *    food photo-cards, QUANTITY stepper, SUPPLEMENT choice, NEXT FEEDING and
 *    a big green Start Feeding CTA.
 *  · Terrain editor — TWO tabs riding the drawer's top edge (reference pair
 *    in Designs/Gecko):
 *      TERRAIN — left tool stack (Select · Paint · Raise · Lower · Smooth ·
 *      Erase + the compact Wet/Dry pair, from src/data/terrainTools.ts), the
 *      MATERIALS photo tiles (src/data/terrains.ts) with the selected-substrate
 *      info strip, and Brush Size / Intensity / Brush Mode / reset controls.
 *      FILTERS — analysis lenses (src/data/habitatFilters.ts): filter list,
 *      score + info cards, gradient legend + top-down minimap, ABOUT + TIPS,
 *      Overlay Opacity / Intensity / Reset Filters.
 *
 * One drawer is visible at a time (the app's mode machine decides). The class
 * keeps the old CareModeBar contract (mode/selected/radius/open/close/
 * setNote/selectIndex/adjustRadius/onDone) so the app's pointer → world
 * plumbing is unchanged, and adds feed/clean/substrate/filter callbacks on top.
 */
import type { FoodOption } from "../habitats/lizard/LizardController";
import type { FeedingLogEntry, HabitatType } from "../habitats/HabitatTypes";
import type { IntakeSummary } from "../habitats/lizard/LizardNutrition";
import { TERRAINS, terrainById, terrainUnlocked } from "../data/terrains";
import { terrainSwatchUrl } from "./terrainSwatch";
import { TERRAIN_TOOLS, toolById } from "../data/terrainTools";
import { HABITAT_FILTERS, filterById } from "../data/habitatFilters";
import { ensureGwStyles, gwEl as el, gwProgressRing } from "./gwTheme";
import { localizeTempText } from "./prefs";
import { gwIcon, type GwIconName } from "./gwIcons";

export type CareMode = "clean" | "feed" | "terrain";

/** The four real serving methods (the rail's fifth item, Track Intake, is a view). */
export type FeedMethod = "quick" | "hand" | "tong" | "dish";
type RailKey = FeedMethod | "intake";

/** Reference feed-card art (real photos cropped from the design reference). */
const FOOD_IMG: Record<string, string> = {
  mealworm: "/assets/ui/food/mealworms.png",
  superworm: "/assets/ui/food/superworms.png",
  cricket: "/assets/ui/food/crickets.png",
  dubia_roach: "/assets/ui/food/roaches.png",
  waxworm: "/assets/ui/food/treats.png",
};

/** Reference card order + display names (Treats = waxworms). */
const FOOD_ORDER = ["mealworm", "superworm", "cricket", "dubia_roach", "waxworm"];
const FOOD_CARD_NAME: Record<string, string> = {
  mealworm: "Mealworms",
  superworm: "Superworms",
  cricket: "Crickets",
  dubia_roach: "Roaches",
  waxworm: "Treats",
};

const SUPPLEMENT_OPTS: { key: string; label: string; sub: string }[] = [
  { key: "none", label: "None", sub: "No dusting" },
  { key: "calcium", label: "Calcium", sub: "Light dusting" },
  { key: "calcium_d3", label: "Calcium + D3", sub: "Light dusting" },
];

// NOTE: the player-steered TONG mechanic is PARKED for now (the steering UX
// needs another design pass) — its presentation/sim code stays dormant behind
// this rail list. Re-add { key: "tong", icon: "tongs", label: "Tongs" } to
// bring it back.
const METHODS: { key: RailKey; icon: GwIconName; label: string }[] = [
  { key: "quick", icon: "cricket", label: "Quick Feed" },
  { key: "hand", icon: "hand", label: "Hand Feed" },
  { key: "dish", icon: "dish", label: "Place in Dish" },
  { key: "intake", icon: "chart", label: "Track Intake" },
];

interface ToolDef {
  key: string;
  icon: string;
  label: string;
  desc: string;
  /** Designed SVG icon (preferred over the emoji when present) + its tint. */
  svg?: GwIconName;
  tint?: string;
}

/** The reference's Cleaning Mode cards — EVERY card is now a hands-on drag
 *  tool (no one-click clear-alls, per player direction): scrub spots, sweep
 *  sand, pour water into the dish, pick droppings up one by one, wipe glass. */
const CLEAN_TOOLS: ToolDef[] = [
  { key: "spot", icon: "🎯", svg: "target", tint: "#8ee65a", label: "Spot Clean", desc: "Scrub grime with the sponge" },
  { key: "sweep", icon: "🧹", svg: "broom", tint: "#f0b94b", label: "Brush Sand", desc: "Gently sweep sand and surfaces" },
  { key: "water", icon: "💧", svg: "drop", tint: "#57b8ff", label: "Refill Water", desc: "Hold the pitcher over the dish to pour" },
  { key: "waste", icon: "🗑️", svg: "bag", tint: "#f0b94b", label: "Pick Up Waste", desc: "Scoop each dropping by hand" },
  { key: "wipe", icon: "🪟", svg: "pane", tint: "#7fd8d4", label: "Wipe Glass", desc: "Drag across the front pane" },
];

/** What the app pushes so the Materials row renders honestly. `selectedId` is
 *  the ARMED material (highlighted; the Paint brush lays it down) — selecting
 *  never touches the world. */
export interface MaterialViewState {
  habitat: HabitatType;
  appliedId: string;
  selectedId: string;
}

/** Live terrain readouts for the tool-context card (non-paint tools). */
export interface TerrainInfo {
  /** Tallest dune above level (cm). */
  reliefCm: number;
  /** Deepest dig below level (cm, positive number). */
  deepCm: number;
  /** Damp-patch coverage of the floor (0..100 %). */
  wetPct: number;
  /** Elevation profile across the tank's centre line (metres, ± around level). */
  profile: number[];
}

/** Which pane of the Terrain editor is showing. */
export type TerrainTab = "terrain" | "filters";

/** Brush strength modes (the reference's ⚡ Brush Mode chip). Strong also
 *  engages the tall-dune + dig-to-bedrock limits. */
export type BrushMode = "soft" | "normal" | "strong";
const BRUSH_MODES: BrushMode[] = ["soft", "normal", "strong"];
const BRUSH_MODE_LABEL: Record<BrushMode, string> = { soft: "Soft", normal: "Normal", strong: "Strong" };
/** Sculpt-strength multiplier per mode (× the Intensity slider). */
const BRUSH_MODE_SCALE: Record<BrushMode, number> = { soft: 0.55, normal: 1, strong: 1.45 };

/** Live numbers the app pushes for the selected filter's score/info cards. */
export interface FilterReadout {
  id: string;
  score: number;
  word: string;
  tone: "good" | "warn" | "bad";
  detail: string;
}

/** Quantity 1–12; the caption mirrors the reference ("10 → Medium"). */
function portionName(n: number): string {
  return n <= 4 ? "Small" : n <= 10 ? "Medium" : "Large";
}

export class GwCareDrawers {
  readonly root: HTMLElement;
  private cleanEl!: HTMLElement;
  private feedEl!: HTMLElement;
  private terrainEl!: HTMLElement;

  private _mode: CareMode | null = null;
  private _selected = "";
  private _radius = 0.24;
  /** Sculpt intensity 0.1..1 (the reference's % slider). */
  private _intensity = 0.8;
  private _brushMode: BrushMode = "normal";
  private _terrainTab: TerrainTab = "terrain";
  private _portion = 10;
  private _method: FeedMethod = "quick";
  private _rail: RailKey = "quick";
  private _supplement = "calcium_d3";

  private doneCb: (() => void) | null = null;
  private strongCb: ((on: boolean) => void) | null = null;
  private feedNowCb: ((kind: string, portion: number, method: FeedMethod, supplement: string) => void) | null = null;
  private cinematicCb: (() => void) | null = null;

  // Clean widgets.
  private cleanCards = new Map<string, HTMLButtonElement>();
  private cleanBadges = new Map<string, HTMLElement>();
  private cleanFill!: HTMLElement;
  private cleanPct!: HTMLElement;
  private cleanNote!: HTMLElement;

  // Feed widgets.
  private methodBtns = new Map<RailKey, HTMLButtonElement>();
  private foodRow!: HTMLElement;
  private foodCards = new Map<string, HTMLButtonElement>();
  private foodPane!: HTMLElement;
  private intakePane!: HTMLElement;
  private portionVal!: HTMLElement;
  private portionNote!: HTMLElement;
  private suppFaceLabel!: HTMLElement;
  private suppFaceSub!: HTMLElement;
  private suppMenu!: HTMLElement;
  private suppMenuBtns = new Map<string, HTMLButtonElement>();
  private nextFaceLabel!: HTMLElement;
  private nextFaceSub!: HTMLElement;
  private feedNote!: HTMLElement;
  private feedNowBtn!: HTMLButtonElement;
  private cineBtn!: HTMLButtonElement;

  // Terrain widgets.
  private terrainCards = new Map<string, HTMLButtonElement>();
  private matTiles = new Map<string, { root: HTMLButtonElement; sub: HTMLElement }>();
  private modeChip!: HTMLButtonElement;
  private modeChipVal!: HTMLElement;
  private intenInput!: HTMLInputElement;
  private intenRead!: HTMLElement;
  private terrainNote!: HTMLElement;
  private matInfoEl!: HTMLElement;
  private matState: MaterialViewState | null = null;
  private toolContextEl!: HTMLElement;
  private paintPanel!: HTMLElement;
  private ctxPeakV: HTMLElement | null = null;
  private ctxDeepV: HTMLElement | null = null;
  private ctxWetV: HTMLElement | null = null;
  private ctxProfile: HTMLCanvasElement | null = null;
  private ctxBrushSize: HTMLElement | null = null;
  private ctxBrushInt: HTMLElement | null = null;
  private ctxBrushMode: HTMLElement | null = null;
  private lastTerrainInfo: TerrainInfo = { reliefCm: 0, deepCm: 0, wetPct: 0, profile: [] };
  private materialSelectCb: ((id: string) => void) | null = null;
  private toolChangeCb: ((id: string) => void) | null = null;

  // Terrain editor tabs + Filters widgets.
  private tabBtns = new Map<TerrainTab, HTMLButtonElement>();
  private paneTerrain!: HTMLElement;
  private paneFilters!: HTMLElement;
  private filterRows = new Map<string, HTMLButtonElement>();
  private filterTitle!: HTMLElement;
  private filterDesc!: HTMLElement;
  private filterScoreCap!: HTMLElement;
  private filterScoreNum!: HTMLElement;
  private filterScoreSt!: HTMLElement;
  private filterScoreBar!: HTMLElement;
  private filterRing: ReturnType<typeof gwProgressRing> | null = null;
  private filterRec!: HTMLElement;
  private filterInfoTx!: HTMLElement;
  private filterAboutA!: HTMLElement;
  private filterAboutB!: HTMLElement;
  private filterTips!: HTMLElement;
  private legendBar!: HTMLElement;
  private legendLow!: HTMLElement;
  private legendHigh!: HTMLElement;
  private minimapWrap!: HTMLElement;
  private opacityInput!: HTMLInputElement;
  private opacityRead!: HTMLElement;
  private fIntenInput!: HTMLInputElement;
  private fIntenRead!: HTMLElement;
  private terrainTabCb: ((tab: TerrainTab) => void) | null = null;
  private filterSelectCb: ((id: string) => void) | null = null;
  private filterOpacityCb: ((frac: number) => void) | null = null;
  private filterIntensityCb: ((frac: number) => void) | null = null;
  private filtersResetCb: (() => void) | null = null;
  private viewDetailsCb: (() => void) | null = null;

  constructor() {
    ensureGwStyles();
    this.root = el("div");
    this.root.style.cssText = "position:fixed;inset:0;z-index:7;pointer-events:none;";
    this.buildClean();
    this.buildFeed();
    this.buildTerrain();
  }

  // ── Shared bits ───────────────────────────────────────────────────────

  private drawerShell(title: string, icon: string, sub: string): { drawer: HTMLElement; head: HTMLElement } {
    const drawer = el("div", "gw-bottom-drawer gw-hidden");
    const head = el("div", "gw-drawer-head");
    const t = el("div", "gw-drawer-title");
    t.append(el("span", undefined, icon), document.createTextNode(title));
    head.append(t, el("span", "gw-drawer-sub", sub), el("span", "spacer"));
    drawer.append(head);
    this.root.append(drawer);
    return { drawer, head };
  }

  private doneButton(label = "✓ Finish"): HTMLButtonElement {
    const b = el("button", "gw-primary-button", label) as HTMLButtonElement;
    b.style.padding = "10px 20px";
    b.addEventListener("click", () => this.doneCb?.());
    return b;
  }

  // ── Cleaning Mode ─────────────────────────────────────────────────────

  private buildClean(): void {
    const { drawer, head } = this.drawerShell("Cleaning Mode", "🧹", "Keep your habitat healthy");
    this.cleanEl = drawer;

    // Header icon = the designed green broom (reference), not the emoji.
    const iconSpan = head.querySelector(".gw-drawer-title span") as HTMLElement | null;
    if (iconSpan) {
      iconSpan.replaceChildren(gwIcon("broom"));
      iconSpan.style.cssText = "display:inline-flex;width:21px;height:21px;color:#8ee65a;margin-right:2px;";
    }
    head.append(this.doneButton("✓ Finish Cleaning"));

    const row = el("div", "gw-tool-row");
    for (const t of CLEAN_TOOLS) {
      const card = this.toolCard(t, () => this.select(t.key));
      this.cleanCards.set(t.key, card);
      row.append(card);
    }
    drawer.append(row);

    // Footer: brush size + the cleanliness meter + the guidance note.
    const foot = el("div");
    foot.style.cssText = "display:flex;align-items:center;gap:14px;margin-top:12px;";
    foot.append(this.brushSizeSlider());
    const meter = el("div");
    meter.style.cssText = "display:flex;align-items:center;gap:9px;";
    const bar = el("div", "gw-bar");
    bar.style.width = "110px";
    this.cleanFill = el("i");
    bar.append(this.cleanFill);
    this.cleanPct = el("span", undefined, "—");
    this.cleanPct.style.cssText = "font:700 12.5px/1 var(--gw-font);color:var(--gw-ink);";
    meter.append(el("span", "gw-drawer-sub", "Cleanliness"), bar, this.cleanPct);
    foot.append(meter);
    this.cleanNote = el("span", "gw-drawer-sub", "Drag over the sand to scrub the grime away.");
    foot.append(this.cleanNote);
    drawer.append(foot);
  }

  private toolCard(t: ToolDef, onClick: () => void): HTMLButtonElement {
    const card = el("button", "gw-tool-card") as HTMLButtonElement;
    const trow = el("div", "trow");
    const ic = el("span", "ic");
    if (t.svg) {
      ic.replaceChildren(gwIcon(t.svg));
      ic.style.cssText = `display:inline-flex;width:22px;height:22px;color:${t.tint ?? "#8ee65a"};flex:0 0 auto;`;
    } else {
      ic.textContent = t.icon;
    }
    trow.append(ic, el("span", "nm", t.label));
    card.append(trow, el("div", "ds", t.desc), el("span", "check", "✓"));
    const badge = el("span", "gw-badge dim gw-hidden", "");
    card.append(badge);
    this.cleanBadges.set(t.key, badge);
    card.addEventListener("click", onClick);
    return card;
  }

  /** Live cleaning status → the reference's per-card pills + the meter. */
  updateCleanProgress(s: {
    cleanliness: number;
    spots: number;
    dustyAreas: number;
    droppings: number;
    waterQuality: "good" | "fair" | "stale" | "low" | "none";
    waterFill: number;
    glassSmudged: boolean;
  }): void {
    this.cleanFill.style.width = `${s.cleanliness}%`;
    this.cleanPct.textContent = `${Math.round(s.cleanliness)}%`;
    this.setBadge(
      "spot",
      s.spots > 0 ? `${s.spots} spot${s.spots > 1 ? "s" : ""} detected` : "All clear",
      s.spots > 0 ? "green" : "dim",
    );
    this.setBadge(
      "sweep",
      s.dustyAreas > 0 ? `${s.dustyAreas} area${s.dustyAreas > 1 ? "s" : ""} dusty` : "Sand looks fresh",
      s.dustyAreas > 0 ? "amber" : "green",
    );
    const fillPct = Math.round(s.waterFill * 100);
    this.setBadge(
      "water",
      s.waterQuality === "none"
        ? "No water dish"
        : s.waterQuality === "low"
          ? `Running low — ${fillPct}% full`
          : s.waterQuality === "good"
            ? `Fresh · ${fillPct}% full`
            : s.waterQuality === "fair"
              ? `OK · ${fillPct}% full`
              : `Stale — pour fresh water`,
      s.waterQuality === "good" ? "green" : s.waterQuality === "none" ? "dim" : "amber",
    );
    this.setBadge(
      "waste",
      s.droppings > 0 ? `${s.droppings} to pick up` : "Nothing to remove",
      s.droppings > 0 ? "amber" : "dim",
    );
    this.setBadge("wipe", s.glassSmudged ? "A little smudged" : "Crystal clear", s.glassSmudged ? "amber" : "green");
  }

  private setBadge(key: string, text: string, tone: "green" | "amber" | "dim"): void {
    const b = this.cleanBadges.get(key);
    if (!b) return;
    b.textContent = text;
    b.className = `gw-badge ${tone}`;
  }

  // ── Feeding Mode ──────────────────────────────────────────────────────

  private buildFeed(): void {
    // Headerless reference layout: method rail on the left, FOOD photo cards +
    // quantity/supplement/next-feeding/Start-Feeding on the right, ✕ to close.
    const drawer = el("div", "gw-bottom-drawer gw-low gw-hidden");
    drawer.style.position = "absolute";
    this.feedEl = drawer;
    this.root.append(drawer);

    const x = el("button", "gw-x", "✕") as HTMLButtonElement;
    x.title = "Close (Esc)";
    x.style.cssText = "position:absolute;top:12px;right:12px;";
    x.addEventListener("click", () => this.doneCb?.());
    drawer.append(x);

    const grid = el("div", "gw-feed-grid");

    // Left rail: Quick Feed / Hand Feed / Tongs / Place in Dish / Track Intake.
    const rail = el("div", "gw-method-rail");
    for (const m of METHODS) {
      const b = el("button", "gw-method") as HTMLButtonElement;
      b.append(gwIcon(m.icon, 22), document.createTextNode(m.label));
      const ic = b.querySelector(".gw-ic");
      ic?.classList.add("ic");
      b.addEventListener("click", () => this.setRail(m.key));
      this.methodBtns.set(m.key, b);
      rail.append(b);
    }

    // Right: FOOD pane (cards + controls) or the Track Intake pane.
    const right = el("div");
    right.style.cssText = "flex:1;display:flex;flex-direction:column;gap:13px;min-width:0;";

    this.foodPane = el("div");
    this.foodPane.style.cssText = "display:flex;flex-direction:column;gap:13px;min-width:0;";
    this.foodPane.append(el("div", "gw-section-title", "Food"));
    this.foodRow = el("div", "gw-food-row");
    this.foodPane.append(this.foodRow);

    const controls = el("div");
    controls.style.cssText = "display:flex;align-items:flex-end;gap:24px;flex-wrap:wrap;";

    // QUANTITY − 10 +  (caption: Small / Medium / Large).
    const qty = el("div", "gw-field");
    qty.append(el("span", "cap", "Quantity"));
    const stepper = el("div", "gw-stepper");
    const minus = el("button", undefined, "−") as HTMLButtonElement;
    this.portionVal = el("span", "val", String(this._portion));
    const plus = el("button", undefined, "+") as HTMLButtonElement;
    minus.addEventListener("click", () => this.setPortion(this._portion - 1));
    plus.addEventListener("click", () => this.setPortion(this._portion + 1));
    stepper.append(minus, this.portionVal, plus);
    this.portionNote = el("span", "note", portionName(this._portion));
    qty.append(stepper, this.portionNote);

    // SUPPLEMENT dropdown (sun icon · Calcium + D3 · Light Dusting · ▾).
    const supp = el("div", "gw-field");
    supp.append(el("span", "cap", "Supplement"));
    const sel = el("div", "gw-select");
    const face = el("button", "face") as HTMLButtonElement;
    face.append(gwIcon("sun", 20));
    face.querySelector(".gw-ic")?.classList.add("ic");
    const two = el("span", "two");
    this.suppFaceLabel = el("span", undefined, "Calcium + D3");
    this.suppFaceSub = el("span", "sub", "Light Dusting");
    two.append(this.suppFaceLabel, this.suppFaceSub);
    face.append(two, el("span", "car", "▼"));
    this.suppMenu = el("div", "menu gw-hidden");
    for (const o of SUPPLEMENT_OPTS) {
      const b = el("button", undefined, o.label) as HTMLButtonElement;
      b.addEventListener("click", () => {
        this.setSupplement(o.key);
        this.suppMenu.classList.add("gw-hidden");
      });
      this.suppMenuBtns.set(o.key, b);
      this.suppMenu.append(b);
    }
    face.addEventListener("click", () => this.suppMenu.classList.toggle("gw-hidden"));
    sel.append(face, this.suppMenu);
    supp.append(sel);

    // NEXT FEEDING (calendar icon · honest live readout).
    const next = el("div", "gw-field");
    next.append(el("span", "cap", "Next Feeding"));
    const nsel = el("div", "gw-select");
    const nface = el("div", "face");
    nface.style.cursor = "default";
    nface.append(gwIcon("calendar", 20));
    nface.querySelector(".gw-ic")?.classList.add("ic");
    const ntwo = el("span", "two");
    this.nextFaceLabel = el("span", undefined, "Ready now");
    this.nextFaceSub = el("span", "sub", "—");
    ntwo.append(this.nextFaceLabel, this.nextFaceSub);
    nface.append(ntwo);
    nsel.append(nface);
    next.append(nsel);

    // CTA: cinematic + the big green Start Feeding (Observe & enjoy).
    const cta = el("div");
    cta.style.cssText = "margin-left:auto;display:flex;align-items:flex-end;gap:10px;";
    this.cineBtn = el("button", "gw-ghost-button") as HTMLButtonElement;
    this.cineBtn.style.cssText = "display:flex;align-items:center;gap:8px;padding:13px 16px;";
    this.cineBtn.append(gwIcon("film", 17), document.createTextNode("Cinematic"));
    this.cineBtn.title = "Start feeding and watch it full-screen";
    this.cineBtn.addEventListener("click", () => this.cinematicCb?.());
    this.feedNowBtn = el("button", "gw-primary-button") as HTMLButtonElement;
    const mainLine = el("span");
    mainLine.style.cssText = "display:inline-flex;align-items:center;gap:8px;";
    mainLine.append(document.createTextNode("Start Feeding"), gwIcon("leaf", 15));
    this.feedNowBtn.append(mainLine, el("span", "subtx", "Observe & enjoy"));
    this.feedNowBtn.addEventListener("click", () =>
      this.feedNowCb?.(this._selected, this._portion, this._method, this._supplement),
    );
    cta.append(this.cineBtn, this.feedNowBtn);

    controls.append(qty, supp, next, cta);
    this.foodPane.append(controls);
    this.feedNote = el("div", "gw-drawer-sub", "");
    this.feedNote.style.minHeight = "14px";
    this.foodPane.append(this.feedNote);

    // Track Intake pane (feeding history + diet balance) — hidden by default.
    this.intakePane = el("div", "gw-hidden");
    right.append(this.foodPane, this.intakePane);

    grid.append(rail, right);
    drawer.append(grid);
  }

  private setRail(k: RailKey): void {
    this._rail = k;
    if (k !== "intake") this._method = k;
    for (const [key, b] of this.methodBtns) b.classList.toggle("gw-active", key === k);
    this.foodPane.classList.toggle("gw-hidden", k === "intake");
    this.intakePane.classList.toggle("gw-hidden", k !== "intake");
    if (k === "intake") {
      this.intakeCb?.();
      return;
    }
    this.setNote(
      k === "quick"
        ? "Start Feeding tosses the portion in — or click the sand to pick the spot."
        : k === "dish"
          ? "The meal is poured straight into the food dish — no aiming needed."
          : k === "tong"
            ? "YOU hold the tongs — the pointer moves them, SCROLL raises them. Hold low for a strike, raise for a JUMP."
            : "The keeper's hand lowers with the meal — the gecko eats off the palm.",
      false,
    );
    this.methodChangeCb?.(this._method);
  }

  private setPortion(n: number): void {
    this._portion = Math.max(1, Math.min(12, n));
    this.portionVal.textContent = String(this._portion);
    this.portionNote.textContent = portionName(this._portion);
  }

  private setSupplement(key: string): void {
    this._supplement = key;
    const opt = SUPPLEMENT_OPTS.find((o) => o.key === key) ?? SUPPLEMENT_OPTS[0];
    this.suppFaceLabel.textContent = opt.label;
    this.suppFaceSub.textContent = opt.sub;
    for (const [k, b] of this.suppMenuBtns) b.classList.toggle("gw-active", k === key);
  }

  /** Rebuild the Track Intake pane from live data. */
  renderIntake(history: { entries: FeedingLogEntry[]; now: number }, intake: IntakeSummary): void {
    this.intakePane.replaceChildren();
    const wrap = el("div", "gw-intake");

    const log = el("div", "col log");
    log.append(el("div", "gw-section-title", "Recent Feedings"));
    if (history.entries.length === 0) {
      log.append(el("div", "gw-drawer-sub", "No feedings recorded yet — serve the first meal."));
    }
    for (const e of history.entries.slice(0, 8)) {
      const row = el("div", "gw-log-row");
      const img = el("img") as HTMLImageElement;
      img.src = FOOD_IMG[e.kind] ?? FOOD_IMG.cricket;
      img.alt = "";
      const methodName = METHODS.find((m) => m.key === e.method)?.label ?? e.method;
      const dust = e.supplement === "none" ? "" : " · dusted";
      row.append(img, el("span", undefined, `${e.count} × ${FOOD_CARD_NAME[e.kind] ?? e.kind} — ${methodName}${dust}`));
      row.append(el("span", "t", agoLabel(history.now - e.t)));
      log.append(row);
    }

    const bal = el("div", "col");
    bal.append(el("div", "gw-section-title", "Diet Balance"));
    const meter = (label: string, frac: number, tone: "green" | "amber"): HTMLElement => {
      const m = el("div");
      m.style.cssText = "margin-bottom:9px;";
      const cap = el("div");
      cap.style.cssText = "display:flex;justify-content:space-between;font:600 11.5px/1 var(--gw-font);margin-bottom:5px;";
      cap.append(el("span", undefined, label), el("span", undefined, `${Math.round(frac * 100)}%`));
      const bar = el("div", `gw-bar${tone === "amber" ? " amber" : ""}`);
      const fill = el("i");
      fill.style.width = `${Math.round(frac * 100)}%`;
      bar.append(fill);
      m.append(cap, bar);
      return m;
    };
    bal.append(
      el("div", "gw-drawer-sub", `${intake.total} insect${intake.total === 1 ? "" : "s"} served in total`),
      meter("Calcium-dusted", intake.dustedFraction, "green"),
      meter("Treats (waxworms)", intake.treatFraction, "amber"),
    );
    for (const a of intake.advice) {
      const r = el("div");
      r.style.cssText = "display:flex;gap:7px;font:500 12px/1.4 var(--gw-font);color:var(--gw-ink);padding:2px 0;";
      r.append(el("span", undefined, "🌿"), el("span", undefined, a));
      bal.append(r);
    }

    wrap.append(log, bal);
    this.intakePane.append(wrap);
  }

  get portion(): number {
    return this._portion;
  }
  get method(): FeedMethod {
    return this._method;
  }
  get supplement(): string {
    return this._supplement;
  }

  onFeedNow(cb: (kind: string, portion: number, method: FeedMethod, supplement: string) => void): void {
    this.feedNowCb = cb;
  }
  /** The 🎬 Cinematic button (start feeding + full-screen follow camera). */
  onCinematic(cb: () => void): void {
    this.cinematicCb = cb;
  }
  /** Track Intake selected — the app pushes fresh history via renderIntake. */
  private intakeCb: (() => void) | null = null;
  onIntakeOpen(cb: () => void): void {
    this.intakeCb = cb;
  }
  /** Method switched (the feed-mode hover marker follows the method). */
  private methodChangeCb: ((m: FeedMethod) => void) | null = null;
  onMethodChange(cb: (m: FeedMethod) => void): void {
    this.methodChangeCb = cb;
  }

  /** Live feeding readouts: the honest NEXT FEEDING face + CTA availability. */
  updateFeedInfo(info: {
    next: { ready: boolean; label: string; sub: string };
    feeders: number;
    hunger: number;
    dish: { label: string; capacity: number; contained: number } | null;
    presenting: boolean;
  }): void {
    this.nextFaceLabel.textContent = info.next.label;
    this.nextFaceSub.textContent = info.next.sub;
    const full = info.hunger >= 96;
    this.feedNowBtn.disabled = full || info.presenting;
    this.cineBtn.disabled = false;
    if (info.presenting) this.setNote("Feeding in progress — watch the tank. 🎬", false);
    else if (full) this.setNote("The gecko is completely full — try again after it digests.", false);
    if (this._rail === "dish" && info.dish) {
      this.setNote(
        `${info.dish.label} holds ${info.dish.capacity} — ${info.dish.contained} in it now. Worms stay put; crickets may jump out.`,
        false,
      );
    }
  }

  // ── Terrain Mode ──────────────────────────────────────────────────────

  private buildTerrain(): void {
    // Headerless (reference): the two tabs ride the top edge; ✕ / Esc exit.
    // `gw-editor` = the blocky grouped panel, wider + flush to the bottom.
    const drawer = el("div", "gw-bottom-drawer gw-editor gw-hidden");
    this.terrainEl = drawer;
    this.root.append(drawer);

    const x = el("button", "gw-x", "✕") as HTMLButtonElement;
    x.title = "Close (Esc)";
    x.style.cssText = "position:absolute;top:10px;right:12px;z-index:2;";
    x.addEventListener("click", () => this.doneCb?.());
    drawer.append(x);

    // The Terrain editor's ONLY two tabs (reference): Terrain · Filters.
    const tabs = el("div", "gw-drawer-tabs");
    const mkTab = (tab: TerrainTab, icon: GwIconName, label: string): HTMLButtonElement => {
      const b = el("button", "gw-drawer-tab") as HTMLButtonElement;
      b.append(gwIcon(icon, 17), document.createTextNode(label));
      b.querySelector(".gw-ic")?.classList.add("ic");
      b.addEventListener("click", () => this.setTerrainTab(tab, true));
      this.tabBtns.set(tab, b);
      return b;
    };
    tabs.append(mkTab("terrain", "mound", "Terrain"), mkTab("filters", "sliders", "Filters"));
    drawer.append(tabs);

    this.paneTerrain = el("div");
    this.paneFilters = el("div");
    this.buildTerrainPane(this.paneTerrain);
    this.buildFiltersPane(this.paneFilters);
    drawer.append(this.paneTerrain, this.paneFilters);
    this.applyTerrainTab();
  }

  /** TERRAIN pane: 2-column tool grid + a tool-contextual right panel (sculpt
   *  tools → context card with live terrain readouts; Paint → the Materials
   *  tiles + armed-material info) + brush controls. */
  private buildTerrainPane(host: HTMLElement): void {
    const grid = el("div", "gw-terrain-grid");

    // Left: the 4×2 tool grid (registry-driven) — every tool a full-size card.
    const palette = el("div", "gw-tool-palette");
    for (const t of TERRAIN_TOOLS) {
      const card = el("button", "gw-tool-mini") as HTMLButtonElement;
      card.title = t.description;
      card.append(gwIcon(t.icon as GwIconName, 18), document.createTextNode(t.label));
      card.querySelector(".gw-ic")?.classList.add("ic");
      const ic = card.querySelector(".ic") as HTMLElement | null;
      if (ic) ic.style.color = t.tint;
      card.addEventListener("click", () => this.select(t.id));
      this.terrainCards.set(t.id, card);
      palette.append(card);
    }

    // Right: swaps per tool — context card OR the Paint materials panel.
    const right = el("div");
    right.style.cssText = "flex:1;display:flex;flex-direction:column;gap:7px;min-width:0;justify-content:center;";
    this.toolContextEl = el("div", "gw-tool-context");
    this.paintPanel = el("div", "gw-hidden");
    this.paintPanel.style.cssText = "display:flex;flex-direction:column;gap:7px;min-width:0;";
    const matRow = el("div", "gw-mat-row");
    for (const t of TERRAINS) {
      const tile = el("button", "gw-mat-tile") as HTMLButtonElement;
      const ph = el("span", "ph");
      const img = el("img") as HTMLImageElement;
      // Photo swatch when the art exists; a procedural palette swatch otherwise
      // (new materials never 404 or ship a placeholder box).
      img.src = t.swatch || terrainSwatchUrl(t);
      img.alt = t.name;
      img.loading = "lazy";
      const lk = el("span", "lk gw-hidden");
      lk.append(gwIcon("lock", 11));
      lk.querySelector(".gw-ic")?.classList.add("ic");
      ph.append(img, lk, el("span", "check", "✓"));
      const sub = el("span", "sub", "");
      tile.append(ph, el("span", "nm", t.name), sub);
      tile.addEventListener("click", () => this.materialSelectCb?.(t.id));
      this.matTiles.set(t.id, { root: tile, sub });
      matRow.append(tile);
    }
    this.matInfoEl = el("div", "gw-mat-info");
    this.paintPanel.append(matRow, this.matInfoEl);
    right.append(this.toolContextEl, this.paintPanel);
    grid.append(palette, right);
    host.append(grid);

    // Brush Size · Intensity % · Brush Mode · guidance · reset (reference row).
    const foot = el("div");
    foot.style.cssText = "display:flex;align-items:center;gap:12px;margin-top:10px;";
    foot.append(this.brushSizeSlider());

    const inten = el("div", "gw-slider pill");
    const ilbl = el("span", "lbl");
    ilbl.append(gwIcon("intensity", 16), document.createTextNode("Intensity"));
    ilbl.querySelector(".gw-ic")?.classList.add("ic");
    this.intenInput = el("input") as HTMLInputElement;
    this.intenInput.type = "range";
    this.intenInput.min = "10";
    this.intenInput.max = "100";
    this.intenInput.step = "10";
    this.intenInput.value = "80";
    this.intenRead = el("span", "rd", "80%");
    this.intenInput.addEventListener("input", () => {
      this._intensity = Number(this.intenInput.value) / 100;
      this.intenRead.textContent = `${this.intenInput.value}%`;
    });
    inten.append(ilbl, this.intenInput, this.intenRead);
    foot.append(inten);

    // Brush Mode chip (Soft → Normal → Strong; Strong also unlocks the tall
    // dunes + dig-to-bedrock limits).
    this.modeChip = el("button", "gw-mode-chip") as HTMLButtonElement;
    this.modeChip.title = "Brush strength — Strong also digs to the bedrock (the tank floor is never breached)";
    this.modeChip.append(gwIcon("bolt", 15), el("span", "lb", "Brush Mode"));
    this.modeChip.querySelector(".gw-ic")?.classList.add("ic");
    this.modeChipVal = el("span", "vl", BRUSH_MODE_LABEL[this._brushMode]);
    this.modeChip.append(this.modeChipVal, el("span", "car", "›"));
    this.modeChip.addEventListener("click", () => {
      const next = BRUSH_MODES[(BRUSH_MODES.indexOf(this._brushMode) + 1) % BRUSH_MODES.length];
      this.setBrushMode(next);
    });
    foot.append(this.modeChip);

    this.terrainNote = el("span", "gw-drawer-sub", "Drag over the sand to sculpt it.");
    this.terrainNote.style.cssText = "flex:1;min-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    foot.append(this.terrainNote);

    const reset = el("button", "gw-icon-button sm") as HTMLButtonElement;
    reset.title = "Reset brush settings";
    reset.append(gwIcon("reset", 17));
    reset.addEventListener("click", () => {
      this._radius = 0.24;
      this._intensity = 0.8;
      this.intenInput.value = "80";
      this.intenRead.textContent = "80%";
      this.setBrushMode("normal");
      this.syncBrushSliders();
    });
    foot.append(reset);
    host.append(foot);
  }

  /** FILTERS pane: filter list, score/info cards, legend + minimap, ABOUT +
   *  TIPS, and the Overlay Opacity / Intensity / Reset Filters row. */
  private buildFiltersPane(host: HTMLElement): void {
    const grid = el("div", "gw-filter-grid");

    // Left: the lens grid (2 columns of compact icon chips, JWE-style).
    const listWrap = el("div", "gw-filter-list");
    const cap = el("div", "gw-section-title", "Filters");
    cap.style.margin = "0 0 3px";
    listWrap.append(cap);
    for (const f of HABITAT_FILTERS) {
      const row = el("button", "gw-filter-row") as HTMLButtonElement;
      row.title = f.name;
      row.append(gwIcon(f.icon as GwIconName, 14), document.createTextNode(f.short));
      row.querySelector(".gw-ic")?.classList.add("ic");
      const ic = row.querySelector(".ic") as HTMLElement | null;
      if (ic) ic.style.color = f.tint;
      row.addEventListener("click", () => this.filterSelectCb?.(f.id));
      this.filterRows.set(f.id, row);
      listWrap.append(row);
    }

    // Main column: the SCORE HERO on top (big number + status + tinted ring),
    // then the verdict + View Details card beneath.
    const main = el("div", "gw-filter-main");
    this.filterTitle = el("div", "gw-filter-title");
    this.filterDesc = el("div", "gw-filter-desc");
    const scoreCard = el("div", "gw-fcard hero");
    this.filterScoreCap = el("div", "cap", "Score");
    const srow = el("div", "scorerow");
    this.filterScoreNum = el("span", "num", "—");
    this.filterScoreSt = el("span", "st", "");
    const ringwrap = el("span", "ringwrap");
    this.filterRing = gwProgressRing(44, 5);
    ringwrap.append(this.filterRing.root);
    srow.append(this.filterScoreNum, this.filterScoreSt, ringwrap);
    const bar = el("div", "gw-bar");
    this.filterScoreBar = el("i");
    bar.append(this.filterScoreBar);
    this.filterRec = el("div", "rec", "");
    scoreCard.append(this.filterScoreCap, srow, bar, this.filterRec);
    const infoCard = el("div", "gw-fcard");
    const inf = el("div", "info");
    this.filterInfoTx = el("span", undefined, "");
    inf.append(gwIcon("leaf", 16), this.filterInfoTx);
    inf.querySelector(".gw-ic")?.classList.add("ic");
    const vd = el("button", "gw-row-btn") as HTMLButtonElement;
    vd.append(el("span", undefined, "View Details"), el("span", "chev", "›"));
    vd.addEventListener("click", () => this.viewDetailsCb?.());
    infoCard.append(inf, vd);
    main.append(this.filterTitle, this.filterDesc, scoreCard, infoCard);

    const mapCol = el("div", "gw-filter-map");
    this.legendBar = el("div", "gw-legend-bar");
    const caps = el("div", "gw-legend-caps");
    this.legendLow = el("span", undefined, "Low");
    this.legendHigh = el("span", undefined, "High");
    caps.append(this.legendLow, this.legendHigh);
    this.minimapWrap = el("div", "gw-filter-minimap");
    mapCol.append(this.legendBar, caps, this.minimapWrap);

    const about = el("div", "gw-filter-about");
    about.append(el("div", "cap", "About this filter"));
    this.filterAboutA = el("p");
    this.filterAboutB = el("p");
    const tips = el("div", "gw-tips");
    const tcap = el("div", "cap");
    tcap.append(gwIcon("sparkle", 12), document.createTextNode("Tips"));
    tcap.querySelector(".gw-ic")?.classList.add("ic");
    this.filterTips = el("div", "tx");
    tips.append(tcap, this.filterTips);
    about.append(this.filterAboutA, this.filterAboutB, tips);

    grid.append(listWrap, main, mapCol, about);
    host.append(grid);

    // Overlay Opacity · Intensity · Reset Filters (reference row).
    const foot = el("div");
    foot.style.cssText = "display:flex;align-items:center;gap:12px;margin-top:10px;";
    const mkPct = (
      label: string,
      icon: GwIconName,
      init: number,
      onInput: (frac: number) => void,
    ): { wrap: HTMLElement; input: HTMLInputElement; read: HTMLElement } => {
      const wrap = el("div", "gw-slider pill");
      const lbl = el("span", "lbl");
      lbl.append(gwIcon(icon, 16), document.createTextNode(label));
      lbl.querySelector(".gw-ic")?.classList.add("ic");
      const input = el("input") as HTMLInputElement;
      input.type = "range";
      input.min = "10";
      input.max = "100";
      input.step = "5";
      input.value = String(init);
      const read = el("span", "rd", `${init}%`);
      input.addEventListener("input", () => {
        read.textContent = `${input.value}%`;
        onInput(Number(input.value) / 100);
      });
      wrap.append(lbl, input, read);
      return { wrap, input, read };
    };
    const op = mkPct("Overlay Opacity", "brushring", 60, (f) => this.filterOpacityCb?.(f));
    this.opacityInput = op.input;
    this.opacityRead = op.read;
    const fi = mkPct("Intensity", "intensity", 80, (f) => this.filterIntensityCb?.(f));
    this.fIntenInput = fi.input;
    this.fIntenRead = fi.read;
    foot.append(op.wrap, fi.wrap, el("span"));
    (foot.lastElementChild as HTMLElement).style.flex = "1";

    const reset = el("button", "gw-reset-pill") as HTMLButtonElement;
    reset.append(gwIcon("reset", 15), document.createTextNode("Reset Filters"));
    reset.querySelector(".gw-ic")?.classList.add("ic");
    reset.addEventListener("click", () => this.filtersResetCb?.());
    foot.append(reset);
    host.append(foot);
  }

  // ── Terrain editor tabs + brush mode ──────────────────────────────────

  private setTerrainTab(tab: TerrainTab, notify = false): void {
    if (this._terrainTab !== tab) {
      this._terrainTab = tab;
      this.applyTerrainTab();
      if (notify) this.terrainTabCb?.(tab);
    }
  }

  private applyTerrainTab(): void {
    for (const [k, b] of this.tabBtns) b.classList.toggle("gw-active", k === this._terrainTab);
    this.paneTerrain.classList.toggle("gw-hidden", this._terrainTab !== "terrain");
    this.paneFilters.classList.toggle("gw-hidden", this._terrainTab !== "filters");
  }

  private setBrushMode(mode: BrushMode): void {
    this._brushMode = mode;
    this.modeChipVal.textContent = BRUSH_MODE_LABEL[mode];
    this.modeChip.classList.toggle("strong", mode === "strong");
    this.strongCb?.(mode === "strong");
  }

  /** Swap the right panel per tool: Paint shows the materials, everything else
   *  shows the tool-context card. */
  private updateTerrainRight(): void {
    const tool = toolById(this._selected);
    const paint = tool?.action === "paintMaterial";
    this.paintPanel.classList.toggle("gw-hidden", !paint);
    this.toolContextEl.classList.toggle("gw-hidden", !!paint);
    if (!paint && tool) this.renderToolContext(tool.id);
  }

  /** The context card: big tinted tool icon, name, what the brush does, three
   *  LIVE terrain chips (peak / deepest / damp), a live ELEVATION PROFILE of
   *  the floor's centre line, and a husbandry tip. */
  private renderToolContext(toolId: string): void {
    const t = toolById(toolId);
    if (!t) return;
    const row = el("div", "row");
    const big = el("span", "big");
    big.append(gwIcon(t.icon as GwIconName, 23, t.tint));
    big.querySelector(".gw-ic")?.classList.add("ic");
    const tx = el("div", "tx");
    tx.append(el("div", "nm", t.label), el("div", "ds", t.note));

    const chips = el("div", "chips");
    const chip = (label: string, tint: string): { root: HTMLElement; v: HTMLElement } => {
      const c = el("span", "chip");
      const v = el("span", "v", "—");
      v.style.color = tint;
      c.append(el("span", "k", label), v);
      return { root: c, v };
    };
    const peak = chip("Peak", "#8ce25a");
    const deep = chip("Deepest", "#f0b64b");
    const damp = chip("Damp", "#57b8ff");
    this.ctxPeakV = peak.v;
    this.ctxDeepV = deep.v;
    this.ctxWetV = damp.v;
    chips.append(peak.root, deep.root, damp.root);
    row.append(big, tx, chips);

    // Live elevation profile (dunes + digs along the tank's centre line).
    const profile = el("div", "profile");
    this.ctxProfile = el("canvas") as HTMLCanvasElement;
    this.ctxProfile.width = 560;
    this.ctxProfile.height = 128;
    profile.append(this.ctxProfile, el("span", "lbl", "Elevation profile"));

    // Live brush settings — the same numbers the bottom pills hold, mirrored
    // where the eye already is while sculpting.
    const brush = el("div", "brushline");
    const bPart = (label: string): HTMLElement => {
      const wrap = el("span");
      const b = el("b", undefined, "—");
      wrap.append(document.createTextNode(`${label} `), b);
      return wrap;
    };
    const bs = bPart("Brush");
    const bi = bPart("Intensity");
    const bm = bPart("Mode");
    this.ctxBrushSize = bs.querySelector("b");
    this.ctxBrushInt = bi.querySelector("b");
    this.ctxBrushMode = bm.querySelector("b");
    brush.append(bs, el("span", "sep"), bi, el("span", "sep"), bm);

    const tip = el("div", "tip");
    tip.append(gwIcon("sparkle", 12), document.createTextNode(localizeTempText(t.tip)));
    tip.querySelector(".gw-ic")?.classList.add("ic");

    this.toolContextEl.replaceChildren(row, profile, brush, tip);
    this.setTerrainInfo(this.lastTerrainInfo);
  }

  /** Live terrain readouts for the context card (chips + elevation profile). */
  setTerrainInfo(info: TerrainInfo): void {
    this.lastTerrainInfo = info;
    if (this.ctxPeakV) this.ctxPeakV.textContent = `+${info.reliefCm.toFixed(1)} cm`;
    if (this.ctxDeepV) this.ctxDeepV.textContent = `−${info.deepCm.toFixed(1)} cm`;
    if (this.ctxWetV) this.ctxWetV.textContent = `${Math.round(info.wetPct)}%`;
    if (this.ctxBrushSize) this.ctxBrushSize.textContent = `${Math.round(this._radius * 100)} cm`;
    if (this.ctxBrushInt) this.ctxBrushInt.textContent = `${Math.round(this._intensity * 100)}%`;
    if (this.ctxBrushMode) this.ctxBrushMode.textContent = BRUSH_MODE_LABEL[this._brushMode];
    const c = this.ctxProfile;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || info.profile.length < 2) return;
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    // ±24 cm plotted around the vertical midline; level = dotted midline.
    const yFor = (h: number): number => H / 2 - (h / 0.24) * (H / 2 - 8);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Filled dune silhouette.
    ctx.beginPath();
    ctx.moveTo(0, yFor(info.profile[0]));
    for (let i = 1; i < info.profile.length; i++) {
      ctx.lineTo((i / (info.profile.length - 1)) * W, yFor(info.profile[i]));
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(216, 189, 140, 0.5)");
    g.addColorStop(1, "rgba(216, 189, 140, 0.08)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#d8bd8c";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, yFor(info.profile[0]));
    for (let i = 1; i < info.profile.length; i++) {
      ctx.lineTo((i / (info.profile.length - 1)) * W, yFor(info.profile[i]));
    }
    ctx.stroke();
  }

  /** Render the Materials row + armed-material info line from live state.
   *  Selecting a tile only ARMS it — the Paint brush lays it down. */
  setMaterialState(s: MaterialViewState): void {
    this.matState = s;
    for (const [id, tile] of this.matTiles) {
      const t = terrainById(id);
      if (!t) continue;
      const unlocked = terrainUnlocked(t, s.habitat);
      const applied = id === s.appliedId;
      const armed = id === s.selectedId && !applied && unlocked;
      tile.root.classList.toggle("gw-applied", applied);
      tile.root.classList.toggle("gw-armed", armed);
      tile.root.classList.toggle("gw-locked", !unlocked);
      tile.root.querySelector(".lk")!.classList.toggle("gw-hidden", unlocked);
      tile.sub.textContent = applied ? "Current" : armed ? "Selected" : unlocked ? "" : "Future habitat";
      tile.root.title = unlocked ? t.description : `${t.name} belongs to humid habitats — the paludarium uses it.`;
    }
    this.renderMaterialInfo(s);
  }

  /** The armed-material info line: swatch, name + state, description, tags,
   *  stat meters, and the paint hint (no buttons — the BRUSH applies). */
  private renderMaterialInfo(s: MaterialViewState): void {
    const t = terrainById(s.selectedId) ?? terrainById(s.appliedId);
    if (!t) return;
    const unlocked = terrainUnlocked(t, s.habitat);
    const applied = t.id === s.appliedId;

    const sw = el("span", "sw");
    const img = el("img") as HTMLImageElement;
    img.src = t.swatch || terrainSwatchUrl(t);
    img.alt = "";
    sw.append(img);

    const tx = el("div", "tx");
    const nm = el("div", "nm", t.name);
    tx.append(nm, el("div", "ds", t.description));

    const tags = el("div", "tags");
    for (const tag of t.tags) tags.append(el("span", "gw-pill", tag));

    const meters = el("div", "meters");
    const meter = (label: string, frac: number, tone?: "blue" | "amber"): HTMLElement => {
      const m = el("div", "gw-mat-meter");
      const bar = el("div", `gw-bar${tone ? ` ${tone}` : ""}`);
      const fill = el("i");
      fill.style.width = `${Math.round(frac * 100)}%`;
      bar.append(fill);
      m.append(el("span", "k", label), bar);
      return m;
    };
    meters.append(
      meter("Heat", t.stats.heat, "amber"),
      meter("Humidity", t.stats.humidity, "blue"),
      meter("Digging", t.stats.digging),
      meter("Clean", t.stats.cleanliness),
      meter("Bioactive", t.stats.bioactive),
    );

    const cta = el("div", "cta");
    const badge = (cls: string, text: string, icon?: GwIconName): HTMLElement => {
      const b = el("span", `gw-badge ${cls}`);
      b.style.marginTop = "0";
      if (icon) b.append(gwIcon(icon, 11));
      b.append(document.createTextNode(text));
      return b;
    };
    if (!unlocked) cta.append(badge("amber", "Unlocks with future humid habitats", "lock"));
    else if (applied) cta.append(badge("green", "✓ Current substrate"));
    else cta.append(badge("amber", "Drag on the sand to lay it down", "paint"));

    this.matInfoEl.replaceChildren(sw, tx, tags, meters, cta);
  }

  onMaterialSelect(cb: (id: string) => void): void {
    this.materialSelectCb = cb;
  }
  /** Terrain ↔ Filters tab switched by the player. */
  onTerrainTab(cb: (tab: TerrainTab) => void): void {
    this.terrainTabCb = cb;
  }
  /** A sculpt/select/paint tool was picked (the brush cursor follows it). */
  onToolChange(cb: (id: string) => void): void {
    this.toolChangeCb = cb;
  }
  onFilterSelect(cb: (id: string) => void): void {
    this.filterSelectCb = cb;
  }
  onFilterOpacity(cb: (frac: number) => void): void {
    this.filterOpacityCb = cb;
  }
  onFilterIntensity(cb: (frac: number) => void): void {
    this.filterIntensityCb = cb;
  }
  onFiltersReset(cb: () => void): void {
    this.filtersResetCb = cb;
  }
  onViewDetails(cb: () => void): void {
    this.viewDetailsCb = cb;
  }

  /** Render the FILTERS pane's static copy + sliders from the app's state. */
  setFilterState(s: { id: string; opacity: number; intensity: number }): void {
    for (const [k, b] of this.filterRows) b.classList.toggle("gw-active", k === s.id);
    const f = filterById(s.id);
    if (!f) return;
    this.filterTitle.replaceChildren(gwIcon(f.icon as GwIconName, 18, f.tint), document.createTextNode(f.name));
    this.filterTitle.querySelector(".gw-ic")?.classList.add("ic");
    this.filterDesc.textContent = f.description;
    const short = f.name.split(" ").pop() ?? f.name;
    this.filterScoreCap.textContent = `${short} Score`;
    this.filterRec.textContent = localizeTempText(f.recommendation);
    this.filterAboutA.textContent = localizeTempText(f.about[0]);
    this.filterAboutB.textContent = localizeTempText(f.about[1]);
    this.filterTips.textContent = localizeTempText(f.tips);
    this.legendLow.textContent = f.legend.low;
    this.legendHigh.textContent = f.legend.high;
    this.legendBar.style.background = `linear-gradient(90deg, ${f.scale
      .map((st) => `${st.color} ${Math.round(st.t * 100)}%`)
      .join(", ")})`;
    if (this.filterRing) this.filterRing.center.replaceChildren(gwIcon(f.icon as GwIconName, 15, f.tint));
    this.opacityInput.value = String(Math.round(s.opacity * 100));
    this.opacityRead.textContent = `${Math.round(s.opacity * 100)}%`;
    this.fIntenInput.value = String(Math.round(s.intensity * 100));
    this.fIntenRead.textContent = `${Math.round(s.intensity * 100)}%`;
  }

  /** Live score + status + info-sentence for the selected filter. */
  setFilterReadout(r: FilterReadout): void {
    const toneCls = r.tone === "good" ? "" : r.tone === "warn" ? " warn" : " bad";
    const toneColor = r.tone === "good" ? "#8ce25a" : r.tone === "warn" ? "#f0b64b" : "#ef7a5e";
    this.filterScoreNum.textContent = String(Math.round(r.score));
    this.filterScoreNum.className = `num${toneCls}`;
    this.filterScoreSt.textContent = r.word;
    this.filterScoreSt.className = `st${toneCls}`;
    this.filterScoreBar.style.width = `${Math.max(0, Math.min(100, Math.round(r.score)))}%`;
    if (this.filterRing) {
      this.filterRing.set(r.score);
      // The ring's fill stroke reads --gw-green from its root — tint per tone.
      this.filterRing.root.style.setProperty("--gw-green", toneColor);
    }
    this.filterInfoTx.textContent = r.detail;
  }

  /** Show the scene's top-down analysis map in the minimap frame. */
  setFilterMap(c: HTMLCanvasElement | null): void {
    this.minimapWrap.replaceChildren();
    if (c) this.minimapWrap.append(c);
  }

  private brushSizeSlider(): HTMLElement {
    const wrap = el("div", "gw-slider pill");
    const lbl = el("span", "lbl");
    lbl.append(gwIcon("brushring", 16), document.createTextNode("Brush Size"));
    lbl.querySelector(".gw-ic")?.classList.add("ic");
    const input = el("input") as HTMLInputElement;
    input.type = "range";
    input.min = "0.1";
    input.max = "0.5";
    input.step = "0.05";
    input.value = String(this._radius);
    const read = el("span", "rd", `${Math.round(this._radius * 100)} cm`);
    input.addEventListener("input", () => {
      this._radius = Number(input.value);
      this.syncBrushSliders();
    });
    wrap.append(lbl, input, read);
    // Two drawers (clean + terrain) share the radius — track every instance.
    this.sizeInputs.push({ input, read });
    return wrap;
  }

  private sizeInputs: { input: HTMLInputElement; read: HTMLElement }[] = [];

  private syncBrushSliders(): void {
    for (const s of this.sizeInputs) {
      s.input.value = String(this._radius);
      s.read.textContent = `${Math.round(this._radius * 100)} cm`;
    }
  }

  // ── Shared mode surface (CareModeBar-compatible) ──────────────────────

  get mode(): CareMode | null {
    return this._mode;
  }
  get selected(): string {
    return this._selected;
  }
  get radius(): number {
    return this._radius;
  }
  /** Sculpt intensity as a fraction 0.1..1 (the % slider). */
  get intensity(): number {
    return this._intensity;
  }
  get brushMode(): BrushMode {
    return this._brushMode;
  }
  /** Strong mode unlocks the tall-dune + dig-to-bedrock limits. */
  get strong(): boolean {
    return this._brushMode === "strong";
  }
  /** Effective sculpt strength: intensity % × the brush-mode multiplier. */
  get sculptStrength(): number {
    return this._intensity * BRUSH_MODE_SCALE[this._brushMode];
  }
  /** Which Terrain-editor pane is showing (terrain | filters). */
  get terrainTab(): TerrainTab {
    return this._terrainTab;
  }

  mount(parent: HTMLElement): void {
    parent.append(this.root);
  }

  onDone(cb: () => void): void {
    this.doneCb = cb;
  }
  onStrong(cb: (on: boolean) => void): void {
    this.strongCb = cb;
  }

  open(mode: CareMode, foods: FoodOption[] = []): void {
    this.close();
    this._mode = mode;
    if (mode === "clean") {
      this.select("spot");
      this.cleanEl.classList.remove("gw-hidden");
    } else if (mode === "feed") {
      this.buildFoodCards(foods);
      if (!this.foodCards.has(this._selected)) this.select(FOOD_ORDER.find((k) => this.foodCards.has(k)) ?? foods[0]?.kind ?? "");
      else this.select(this._selected);
      this.setRail(this._rail === "intake" ? "quick" : this._rail);
      this.setPortion(this._portion);
      this.setSupplement(this._supplement);
      this.feedEl.classList.remove("gw-hidden");
    } else {
      // The editor always opens on the Terrain pane with the Raise brush.
      this.setTerrainTab("terrain");
      this.select("raise");
      if (this.matState) this.setMaterialState(this.matState);
      this.terrainEl.classList.remove("gw-hidden");
    }
  }

  close(): void {
    this._mode = null;
    for (const d of [this.cleanEl, this.feedEl, this.terrainEl]) d.classList.add("gw-hidden");
  }

  /** The five reference photo cards (real macro shots, name plate, ✓ badge). */
  private buildFoodCards(foods: FoodOption[]): void {
    this.foodRow.replaceChildren();
    this.foodCards.clear();
    const ordered = [...foods].sort((a, b) => FOOD_ORDER.indexOf(a.kind) - FOOD_ORDER.indexOf(b.kind));
    for (const f of ordered) {
      const card = el("button", "gw-food-card") as HTMLButtonElement;
      const img = el("img") as HTMLImageElement;
      img.src = FOOD_IMG[f.kind] ?? "";
      img.alt = FOOD_CARD_NAME[f.kind] ?? f.label;
      card.append(img, el("span", "nm", FOOD_CARD_NAME[f.kind] ?? label(f.label)), el("span", "check", "✓"));
      card.title = `${f.label} — ${f.note}${f.role ? ` (${f.role})` : ""}`;
      card.addEventListener("click", () => this.select(f.kind));
      this.foodCards.set(f.kind, card);
      this.foodRow.append(card);
    }
  }

  select(key: string): void {
    this._selected = key;
    for (const [k, b] of this.cleanCards) b.classList.toggle("gw-active", k === key);
    for (const [k, b] of this.foodCards) b.classList.toggle("gw-active", k === key);
    for (const [k, b] of this.terrainCards) b.classList.toggle("gw-active", k === key);
    // Contextual guidance per cleaning tool.
    if (this._mode === "clean" && this.cleanNote) {
      this.cleanNote.textContent =
        key === "wipe"
          ? "Hold and drag the squeegee across the front glass to wipe the smudges away."
          : key === "spot"
            ? "Hold the button over a marked spot to scrub it with the sponge."
            : key === "waste"
              ? "Click and hold on each dropping to scoop it up — one at a time."
              : key === "water"
                ? "Hold the pitcher over the water dish and watch the level rise."
                : "Hold and drag over the sand to sweep the grime away.";
      this.cleanNote.style.color = "";
    }
    // Contextual guidance per terrain tool, the right panel swaps (context
    // card ↔ Paint materials), and the brush cursor follows the tool.
    if (this._mode === "terrain" && this.terrainNote) {
      const tool = toolById(key);
      if (tool) {
        this.terrainNote.textContent = tool.note;
        this.terrainNote.style.color = "";
        this.updateTerrainRight();
        this.toolChangeCb?.(key);
      }
    }
  }

  /** Select the Nth selectable chip in the open drawer (1–8 hotkeys). */
  selectIndex(i: number): void {
    const keys =
      this._mode === "feed"
        ? Array.from(this.foodCards.keys())
        : this._mode === "terrain"
          ? TERRAIN_TOOLS.map((t) => t.id)
          : CLEAN_TOOLS.map((t) => t.key);
    if (i >= 0 && i < keys.length) this.select(keys[i]);
  }

  /** Grow/shrink the brush ([ and ] keys). */
  adjustRadius(dir: 1 | -1): void {
    this._radius = Math.max(0.1, Math.min(0.5, this._radius + dir * 0.05));
    this.syncBrushSliders();
  }

  /** Live status line of the open drawer (refusals tint amber-red). */
  setNote(text: string, bad = false): void {
    const target = this._mode === "clean" ? this.cleanNote : this._mode === "feed" ? this.feedNote : this.terrainNote;
    target.textContent = text;
    target.style.color = bad ? "#ff9c8a" : "";
  }
}

/** "Cricket" → "Crickets", "Dubia Roach" → "Dubia Roaches" (reference cards use plurals). */
function label(s: string): string {
  if (s.endsWith("s")) return s;
  if (/(ch|sh|x|z)$/i.test(s)) return `${s}es`;
  return `${s}s`;
}

/** "34s ago" / "5m ago" / "2h ago" for the feeding-history rows. */
function agoLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${(s / 3600).toFixed(1)}h ago`;
}

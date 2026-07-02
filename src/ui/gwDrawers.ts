/**
 * GW BOTTOM DRAWERS — the Clean / Feed / Terrain mode UIs from the reference
 * images (docs/production/DESIGN_REFERENCE_MAP.md):
 *
 *  · Cleaning Mode  — "🧹 Cleaning Mode / Keep your habitat healthy" + five
 *    tool cards with live status badges + a cleanliness meter + Finish.
 *  · Feeding Mode   — method list (Quick Feed / Place in Dish / Tong Feed),
 *    food photo-cards, QUANTITY stepper, SUPPLEMENT choice, NEXT FEEDING and
 *    a big green Start Feeding CTA.
 *  · Terrain Mode   — Terrain/Materials tabs, sculpt tool cards, material
 *    swatches, styled Brush Size + Intensity sliders and the ⚡ Strong brush.
 *
 * One drawer is visible at a time (the app's mode machine decides). The class
 * keeps the old CareModeBar contract (mode/selected/radius/open/close/
 * setNote/selectIndex/adjustRadius/onDone/onStrong) so the app's pointer →
 * world plumbing is unchanged, and adds feed/clean action callbacks on top.
 */
import type { FoodOption } from "../habitats/lizard/LizardController";
import type { FeedingLogEntry } from "../habitats/HabitatTypes";
import type { IntakeSummary } from "../habitats/lizard/LizardNutrition";
import { ensureGwStyles, gwEl as el } from "./gwTheme";
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

/** One-click cleaning actions (beyond the drag tools). */
export type CleanAction = "refreshWater" | "removeWaste";

interface ToolDef {
  key: string;
  icon: string;
  label: string;
  desc: string;
  /** Designed SVG icon (preferred over the emoji when present) + its tint. */
  svg?: GwIconName;
  tint?: string;
}

/** The reference's Cleaning Mode cards, in its order: two drag BRUSHES first
 *  (Spot Clean selected by default), then the one-click actions. Every card =
 *  colored icon + title + description + a live status pill. */
const CLEAN_TOOLS: (ToolDef & { action?: CleanAction })[] = [
  { key: "spot", icon: "🎯", svg: "target", tint: "#8ee65a", label: "Spot Clean", desc: "Remove small waste" },
  { key: "sweep", icon: "🧹", svg: "broom", tint: "#f0b94b", label: "Brush Sand", desc: "Gently sweep sand and surfaces" },
  { key: "water", icon: "💧", svg: "drop", tint: "#57b8ff", label: "Replace Water", desc: "Empty and refill the water dish", action: "refreshWater" },
  { key: "waste", icon: "🗑️", svg: "bag", tint: "#f0b94b", label: "Remove Waste", desc: "Remove waste from habitat", action: "removeWaste" },
  { key: "wipe", icon: "🪟", svg: "pane", tint: "#7fd8d4", label: "Wipe Glass", desc: "Drag across the front pane" },
];

const TERRAIN_TOOLS: ToolDef[] = [
  { key: "raise", icon: "⛰️", label: "Raise", desc: "Pile the sand up" },
  { key: "lower", icon: "🕳️", label: "Lower", desc: "Dig a depression" },
  { key: "smooth", icon: "〰️", label: "Smooth", desc: "Relax bumps" },
  { key: "flatten", icon: "▭", label: "Flatten", desc: "Back to level" },
  { key: "water", icon: "💧", label: "Paint Wet", desc: "Damp patch — humidity" },
  { key: "dry", icon: "☀️", label: "Dry", desc: "Dry a wet patch" },
];

/** Material swatches (reference row). Desert Sand is the live substrate; the
 *  rest are visual previews until substrate painting ships. */
const MATERIALS: { key: string; label: string; tint: string; live: boolean }[] = [
  { key: "desert_sand", label: "Desert Sand", tint: "#c8a067", live: true },
  { key: "fine_sand", label: "Fine Sand", tint: "#d9bc8c", live: false },
  { key: "clay_mix", label: "Clay Mix", tint: "#9c6a4a", live: false },
  { key: "rocky_soil", label: "Rocky Soil", tint: "#7d6a55", live: false },
  { key: "pebble_mix", label: "Pebble Mix", tint: "#8f8578", live: false },
  { key: "leaf_litter", label: "Leaf Litter", tint: "#6d5c33", live: false },
  { key: "slate_edge", label: "Slate Edge", tint: "#5a6068", live: false },
  { key: "dune_ridge", label: "Dune Ridge", tint: "#c2925a", live: false },
];

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
  private _intensity = 1;
  private _strong = false;
  private _portion = 10;
  private _method: FeedMethod = "quick";
  private _rail: RailKey = "quick";
  private _supplement = "calcium_d3";

  private doneCb: (() => void) | null = null;
  private strongCb: ((on: boolean) => void) | null = null;
  private feedNowCb: ((kind: string, portion: number, method: FeedMethod, supplement: string) => void) | null = null;
  private cinematicCb: (() => void) | null = null;
  private cleanActionCb: ((action: CleanAction) => void) | null = null;

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
  private matCards = new Map<string, HTMLButtonElement>();
  private strongBtn!: HTMLButtonElement;
  private intenInput!: HTMLInputElement;
  private intenRead!: HTMLElement;
  private terrainNote!: HTMLElement;
  private tabTerrain!: HTMLButtonElement;
  private tabMaterials!: HTMLButtonElement;
  private terrainToolsWrap!: HTMLElement;
  private materialsWrap!: HTMLElement;

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
      const card = this.toolCard(t, () => {
        if (t.action) {
          // One-click action: press feedback + run.
          card.animate(
            [{ transform: "scale(1)" }, { transform: "scale(0.955)" }, { transform: "scale(1)" }],
            { duration: 220, easing: "ease-out" },
          );
          this.cleanActionCb?.(t.action);
        } else {
          this.select(t.key);
        }
      });
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
    waterQuality: "good" | "fair" | "stale" | "none";
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
    this.setBadge(
      "water",
      s.waterQuality === "none"
        ? "No water dish"
        : s.waterQuality === "good"
          ? "Water quality: Good"
          : s.waterQuality === "fair"
            ? "Water quality: Fair"
            : "Replace soon",
      s.waterQuality === "good" ? "green" : s.waterQuality === "none" ? "dim" : "amber",
    );
    this.setBadge(
      "waste",
      s.droppings > 0 ? `${s.droppings} item${s.droppings > 1 ? "s" : ""} ready` : "Nothing to remove",
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

  onCleanAction(cb: (action: CleanAction) => void): void {
    this.cleanActionCb = cb;
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
    const { drawer, head } = this.drawerShell("Terrain Mode", "⛰️", "Sculpt the sand & substrate");
    this.terrainEl = drawer;

    // Tabs.
    const tabs = el("div", "gw-seg");
    this.tabTerrain = el("button", "gw-active", "Terrain") as HTMLButtonElement;
    this.tabMaterials = el("button", undefined, "Materials") as HTMLButtonElement;
    this.tabTerrain.addEventListener("click", () => this.showTerrainTab(true));
    this.tabMaterials.addEventListener("click", () => this.showTerrainTab(false));
    tabs.append(this.tabTerrain, this.tabMaterials);
    head.append(tabs, this.doneButton("✓ Done"));
    head.insertBefore(el("span"), null);

    // Terrain tools.
    this.terrainToolsWrap = el("div", "gw-tool-row");
    for (const t of TERRAIN_TOOLS) {
      const card = el("button", "gw-tool-card") as HTMLButtonElement;
      const trow = el("div", "trow");
      trow.append(el("span", "ic", t.icon), el("span", "nm", t.label));
      card.append(trow, el("div", "ds", t.desc), el("span", "check", "✓"));
      card.addEventListener("click", () => this.select(t.key));
      this.terrainCards.set(t.key, card);
      this.terrainToolsWrap.append(card);
    }
    drawer.append(this.terrainToolsWrap);

    // Materials swatches.
    this.materialsWrap = el("div", "gw-scroll-x gw-hidden");
    for (const m of MATERIALS) {
      const card = el("button", "gw-item-card") as HTMLButtonElement;
      card.style.cssText = "flex:0 0 118px;";
      const art = el("span", "art");
      art.style.background = `radial-gradient(circle at 38% 30%, ${m.tint}, ${shade(m.tint)} 85%)`;
      art.append(el("span", undefined, m.live ? "" : "🔒"));
      card.append(art, el("span", "nm", m.label), el("span", "ds", m.live ? "Current substrate" : "Coming soon"), el("span", "check", "✓"));
      if (!m.live) card.disabled = true;
      else card.classList.add("gw-active");
      this.matCards.set(m.key, card);
      this.materialsWrap.append(card);
    }
    drawer.append(this.materialsWrap);

    // Sliders + Strong.
    const foot = el("div");
    foot.style.cssText = "display:flex;align-items:center;gap:20px;margin-top:12px;flex-wrap:wrap;";
    foot.append(this.brushSizeSlider());

    const inten = el("div", "gw-slider");
    const ilbl = el("span", "lbl");
    ilbl.append(el("span", undefined, "◉"), document.createTextNode("Intensity"));
    this.intenInput = el("input") as HTMLInputElement;
    this.intenInput.type = "range";
    this.intenInput.min = "1";
    this.intenInput.max = "3";
    this.intenInput.step = "1";
    this.intenInput.value = "1";
    this.intenRead = el("span", "rd", "Soft");
    this.intenInput.addEventListener("input", () => {
      this._intensity = Number(this.intenInput.value);
      this.intenRead.textContent = ["Soft", "Normal", "Strong"][this._intensity - 1];
    });
    inten.append(ilbl, this.intenInput, this.intenRead);
    foot.append(inten);

    this.strongBtn = el("button", "gw-chip", "⚡ Strong brush") as HTMLButtonElement;
    this.strongBtn.title = "Taller dunes + digging down to the bedrock (the tank floor is never breached)";
    this.strongBtn.addEventListener("click", () => this.setStrong(!this._strong));
    foot.append(this.strongBtn);

    this.terrainNote = el("span", "gw-drawer-sub", "Drag over the sand to sculpt it.");
    foot.append(this.terrainNote);
    drawer.append(foot);
  }

  private showTerrainTab(terrain: boolean): void {
    this.tabTerrain.classList.toggle("gw-active", terrain);
    this.tabMaterials.classList.toggle("gw-active", !terrain);
    this.terrainToolsWrap.classList.toggle("gw-hidden", !terrain);
    this.materialsWrap.classList.toggle("gw-hidden", terrain);
  }

  private brushSizeSlider(): HTMLElement {
    const wrap = el("div", "gw-slider");
    const lbl = el("span", "lbl");
    lbl.append(el("span", undefined, "⭕"), document.createTextNode("Brush Size"));
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
  get intensity(): number {
    return this._intensity;
  }
  get strong(): boolean {
    return this._strong;
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

  setStrong(on: boolean): void {
    this._strong = on;
    this.strongBtn.classList.toggle("gw-active", on);
    this.strongCb?.(on);
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
      this.select("raise");
      this.showTerrainTab(true);
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
          ? "Drag the squeegee across the front glass to wipe the smudges away."
          : key === "spot"
            ? "Drag the scoop over a marked spot to lift the waste."
            : "Drag over the sand to scrub the grime away.";
      this.cleanNote.style.color = "";
    }
  }

  /** Select the Nth selectable chip in the open drawer (1–6 hotkeys). */
  selectIndex(i: number): void {
    const keys =
      this._mode === "feed"
        ? Array.from(this.foodCards.keys())
        : this._mode === "terrain"
          ? TERRAIN_TOOLS.map((t) => t.key)
          : CLEAN_TOOLS.filter((t) => !t.action).map((t) => t.key);
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

/** Darken a #rrggbb tint for the swatch gradient edge. */
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.max(0, Math.round(v * 0.45));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

/**
 * GECKO HUD — the reference-match GLASSWATER game UI for the lizard habitat
 * (primary reference: Designs/Gecko "03_04_29 PM (1)" + "(6)"; map:
 * docs/production/DESIGN_REFERENCE_MAP.md).
 *
 * Layout: top-left habitat identity card (real gecko portrait, name, species,
 * scientific name, Desert/Warm/Lowlands tags) · top-right habitat-score card
 * (big green score + rating + progress ring + View Detailed Stats) · camera
 * (photo) button at the right edge · bottom stat strip (8 live stats: icon,
 * label, slim bar, status word + value) · large bottom action dock (Feed /
 * Clean / Decorate / Terrain / Animal Info) flanked by round menu + settings
 * buttons · a slim icon nav that replaces the dock while a drawer mode is
 * open. All icons are designed SVGs (src/ui/gwIcons.ts) — no emoji. Which
 * regions show is decided by the pure mode machine (src/ui/gwModes.ts).
 *
 * Every meter is REAL: hunger/stress/health come from the needs system,
 * comfort derives from them, hydration/security/enrichment from the wellbeing
 * model, cleanliness from the dirt map, temperature/humidity from the live
 * environment. Self-contained DOM overlay — never touches the fish-tank DOM.
 */
import type { AnimalInfoState, LizardHudState } from "../habitats/lizard/LizardController";
import { ensureGwStyles, gwEl as el, gwProgressRing } from "./gwTheme";
import { gwIcon, type GwIconName } from "./gwIcons";
import { regionsFor, type GwMode, type GwRegions } from "./gwModes";

/** The real leopard-gecko portrait (cropped from the reference art). */
export const GECKO_PORTRAIT = "/assets/ui/gecko_portrait_01.png";

export interface LizardHudCallbacks {
  /** Dock / slim-nav / camera-button mode requests (the app owns the machine). */
  requestMode(mode: GwMode): void;
  /** Named viewing angle: front / left / right / top. */
  cameraPreset(name: string): void;
  focusAnimal(): void;
  resetCamera(): void;
  toggleDebug(): boolean;
  toggleDebugOption(key: string): boolean;
  debugOptions(): Record<string, boolean>;
  help(): void;
  addSpecies(): void;
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

const DOCK_ITEMS: { mode: GwMode; icon: GwIconName; color: string; label: string; sub: string; dot: boolean }[] = [
  { mode: "feed", icon: "bowl", color: "#e6d7ae", label: "Feed", sub: "Live insects", dot: true },
  { mode: "clean", icon: "broom", color: "#d9b678", label: "Clean", sub: "Spot clean", dot: true },
  { mode: "decorate", icon: "sprout", color: "#8ce25a", label: "Decorate", sub: "Enhance habitat", dot: true },
  { mode: "terrain", icon: "mound", color: "#d6c29a", label: "Terrain", sub: "Sandy Desert", dot: true },
  { mode: "animal-info", icon: "gecko", color: "#dcc496", label: "Animal Info", sub: "View gecko details", dot: false },
];

/** Status word + tone for a 0..100 "higher is better" meter. */
function statusFor(v: number, words: [string, string, string, string]): { word: string; tone: string } {
  if (v >= 80) return { word: words[0], tone: "" };
  if (v >= 55) return { word: words[1], tone: "" };
  if (v >= 30) return { word: words[2], tone: "warn" };
  return { word: words[3], tone: "bad" };
}

export class LizardHud {
  readonly root: HTMLElement;
  private cb: LizardHudCallbacks;
  private _visible = false;
  private mode: GwMode = "gecko-main";

  // Top cards.
  private idName!: HTMLElement;
  private idSpecies!: HTMLElement;
  private idSci!: HTMLElement;
  private personaText!: Text;
  private topCard!: HTMLElement;
  private scoreCard!: HTMLElement;
  private scoreNum!: HTMLElement;
  private scoreRating!: HTMLElement;
  private scoreLine!: HTMLElement;
  private scoreBtn!: HTMLButtonElement;
  private ring!: ReturnType<typeof gwProgressRing>;
  private photoBtn!: HTMLButtonElement;
  private cineBtn!: HTMLButtonElement;
  private warnPill!: HTMLElement;

  // Bottom regions.
  private statStrip!: HTMLElement;
  private stats = new Map<string, StatItem>();
  private dockWrap!: HTMLElement;
  private dockCards = new Map<GwMode, DockCard>();
  private slimNav!: HTMLElement;
  private slimTabs = new Map<GwMode, HTMLButtonElement>();
  private photoHint!: HTMLElement;
  private letterTop!: HTMLElement;
  private letterBottom!: HTMLElement;
  private cineHint!: HTMLElement;

  // Flyouts.
  private detailsFly!: HTMLElement;
  private settingsFly!: HTMLElement;
  private logFly!: HTMLElement;
  private logList!: HTMLElement;
  private detailMeters = new Map<string, StatItem>();
  private detailWarns!: HTMLElement;
  private debugChecks = new Map<string, HTMLInputElement>();
  private rigBadge!: HTMLElement;

  constructor(cb: LizardHudCallbacks) {
    this.cb = cb;
    ensureGwStyles();
    this.root = el("div", "gw-hud");
    this.root.style.cssText = "position:fixed;inset:0;z-index:4;pointer-events:none;";
    this.root.classList.add("gw-hidden");
    this.build();
    window.addEventListener("keydown", this.onKey);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this._visible) return;
    if (e.key === "c" || e.key === "C") this.cb.toggleDebug();
  };

  // ── Build ──────────────────────────────────────────────────────────────

  private build(): void {
    this.buildTopCards();
    this.buildStatStrip();
    this.buildDock();
    this.buildSlimNav();
    this.buildFlyouts();

    this.warnPill = el("div", "gw-warn-pill gw-hidden");
    this.warnPill.style.top = "clamp(190px, 24vh, 240px)";
    this.photoHint = el("div", "gw-hint-pill gw-hidden", "Photo Mode — drag to orbit freely · Esc to exit");
    this.photoHint.prepend(gwIcon("camera", 14, "#dfe4da"));
    this.photoHint.style.display = "inline-flex";
    this.photoHint.style.alignItems = "center";
    this.photoHint.style.gap = "8px";
    // Cinematic mode: sliding cinema bars + a quiet exit hint.
    this.letterTop = el("div", "gw-letterbox top");
    this.letterBottom = el("div", "gw-letterbox bottom");
    this.cineHint = el("div", "gw-cine-hint gw-hidden");
    this.cineHint.append(gwIcon("film", 13, "#dfe4da"), document.createTextNode("Cinematic — Esc to exit"));
    this.cineHint.style.display = "inline-flex";
    this.cineHint.style.alignItems = "center";
    this.cineHint.style.gap = "7px";
    this.root.append(this.warnPill, this.photoHint, this.letterTop, this.letterBottom, this.cineHint);
  }

  private buildTopCards(): void {
    // Top-left identity card — portrait, name + leaf, species, sci name, tags.
    this.topCard = el("div", "gw-panel gw-top-card");
    const row = el("div", "gw-id-row");
    const thumb = el("div", "gw-thumb");
    const img = document.createElement("img");
    img.src = GECKO_PORTRAIT;
    img.alt = "Leopard gecko";
    thumb.append(img);
    const txt = el("div");
    this.idName = el("div", "gw-id-name");
    this.idName.append(document.createTextNode("Sunstone Desert"), gwIcon("leaf", 13, "#8ce25a"));
    this.idSpecies = el("div", "gw-id-species", "Leopard Gecko");
    this.idSci = el("div", "gw-id-sci", "Eublepharis macularius");
    txt.append(this.idName, this.idSpecies, this.idSci);
    row.append(thumb, txt);
    const tags = el("div", "gw-tag-row");
    const tagDefs: [GwIconName, string, string][] = [
      ["sun", "#f0a63e", "Desert"],
      ["thermo", "#ef7a5e", "Warm"],
      ["mountains", "#d6c29a", "Lowlands"],
    ];
    for (const [ic, color, label] of tagDefs) {
      const pill = el("span", "gw-pill");
      pill.append(gwIcon(ic, 12, color), document.createTextNode(label));
      tags.append(pill);
    }
    // This individual's rolled PERSONALITY (live from the sim).
    const persona = el("span", "gw-pill");
    persona.style.borderColor = "rgba(140,226,90,0.4)";
    this.personaText = document.createTextNode("—");
    persona.append(gwIcon("gecko", 12, "#8ce25a"), this.personaText);
    tags.append(persona);
    this.topCard.append(row, tags);

    // Top-right score card.
    this.scoreCard = el("div", "gw-panel gw-score-card");
    const head = el("div", "gw-score-head");
    head.append(document.createTextNode("Habitat Score"), el("span", "qi", "i"));
    const main = el("div", "gw-score-main");
    const numWrap = el("div");
    this.scoreNum = el("span", "gw-score-num", "—");
    this.scoreRating = el("span", "gw-score-rating", "");
    this.scoreRating.style.marginLeft = "9px";
    numWrap.append(this.scoreNum, this.scoreRating);
    this.ring = gwProgressRing(60, 5.5);
    this.ring.center.replaceChildren(gwIcon("leaf", 24, "#8ce25a"));
    main.append(numWrap, this.ring.root);
    this.scoreLine = el("div", "gw-score-line", "");
    this.scoreBtn = el("button", "gw-row-btn") as HTMLButtonElement;
    this.scoreBtn.append(gwIcon("chart", 14, "#c9cec4"), document.createTextNode("View Detailed Stats"), gwIcon("chevron", 12, "#a9b1a2"));
    (this.scoreBtn.lastChild as HTMLElement).style.marginLeft = "auto";
    this.scoreBtn.addEventListener("click", () => this.toggleFly(this.detailsFly));
    this.scoreCard.append(head, main, this.scoreLine, this.scoreBtn);

    // Camera (photo mode) button under the score card, right edge.
    this.photoBtn = el("button", "gw-icon-button square") as HTMLButtonElement;
    this.photoBtn.append(gwIcon("camera", 20, "#e8ebe3"));
    this.photoBtn.title = "Photo Mode — free camera for screenshots";
    this.photoBtn.style.cssText = "position:absolute; right: clamp(14px,1.6vw,28px); top: clamp(186px, 25.5vh, 238px);";
    this.photoBtn.addEventListener("click", () => this.cb.requestMode("photo"));

    // Cinematic button right below it — sit back and watch the gecko live its
    // life full-screen ANY time, feeding or not (V / Esc to exit).
    this.cineBtn = el("button", "gw-icon-button square") as HTMLButtonElement;
    this.cineBtn.append(gwIcon("film", 19, "#e8ebe3"));
    this.cineBtn.title = "Cinematic — sit back and watch (V)";
    this.cineBtn.style.cssText =
      "position:absolute; right: clamp(14px,1.6vw,28px); top: calc(clamp(186px, 25.5vh, 238px) + 60px);";
    this.cineBtn.addEventListener("click", () => this.cb.requestMode("cinematic"));

    this.root.append(this.topCard, this.scoreCard, this.photoBtn, this.cineBtn);
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
      this.statItem("hunger", "fork", "#8ce25a", "Hunger"),
      this.statItem("hydration", "drop", "#5db9f0", "Hydration", "blue"),
      this.statItem("stress", "flower", "#ef86a8", "Stress", "pink"),
      this.statItem("health", "heart", "#8ce25a", "Health"),
      this.statItem("comfort", "house", "#8ce25a", "Comfort"),
      this.statItem("clean", "sparkle", "#f0b64b", "Cleanliness"),
      this.statItem("temp", "thermo", "#ef7a5e", "Temperature", "amber"),
      this.statItem("humid", "drop", "#5db9f0", "Humidity", "blue"),
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
      if (d.dot) card.classList.add("has-dot");
      card.addEventListener("click", () => this.cb.requestMode(d.mode));
      this.dockCards.set(d.mode, { root: card, sub });
      dock.append(card);
    }

    const settingsBtn = el("button", "gw-icon-button") as HTMLButtonElement;
    settingsBtn.append(gwIcon("sliders", 19, "#e8ebe3"));
    settingsBtn.title = "Camera, overlays & help";
    settingsBtn.addEventListener("click", () => this.toggleFly(this.settingsFly));

    this.dockWrap.append(menuBtn, dock, settingsBtn);
    this.root.append(this.dockWrap);
  }

  private buildSlimNav(): void {
    this.slimNav = el("div", "gw-mode-tabs gw-hidden");
    for (const d of DOCK_ITEMS) {
      const tab = el("button", "gw-mode-tab") as HTMLButtonElement;
      tab.append(gwIcon(d.icon, 15, d.color), document.createTextNode(d.label));
      tab.addEventListener("click", () => this.cb.requestMode(d.mode));
      this.slimTabs.set(d.mode, tab);
      this.slimNav.append(tab);
    }
    this.root.append(this.slimNav);
  }

  private buildFlyouts(): void {
    // Habitat details flyout (score breakdown + environment) under the score card.
    this.detailsFly = el("div", "gw-flyout hidden");
    this.detailsFly.style.cssText = "top: clamp(186px, 25.5vh, 238px); right: clamp(70px, 5vw, 90px);";
    this.detailsFly.append(el("div", "gw-section-title", "Score Breakdown"));
    const meters = el("div");
    const mk = (key: string, icon: GwIconName, color: string, label: string): void => {
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
      meters.append(rowEl);
    };
    mk("hiding", "house", "#f0b64b", "Hiding Spots");
    mk("climbing", "mountains", "#d6c29a", "Climbing Space");
    mk("enrichment", "sprout", "#8ce25a", "Enrichment");
    mk("basking", "sun", "#f0a63e", "Basking Heat");
    mk("cool", "drop", "#5db9f0", "Cool Side");
    mk("humidity", "drop", "#5db9f0", "Humidity");
    mk("uvb", "sun", "#f0e05a", "UVB / Light");
    this.detailsFly.append(meters);
    this.rigBadge = el("div", "gw-badge dim", "");
    this.rigBadge.style.marginTop = "10px";
    this.detailWarns = el("div");
    this.detailWarns.style.cssText = "margin-top:8px; font: 500 12px/1.45 var(--gw-font); color: var(--gw-amber);";
    this.detailsFly.append(this.rigBadge, this.detailWarns);

    // Settings flyout: camera presets + debug overlays + help.
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
    const focus = el("button", "gw-chip", "🎯 Focus Gecko") as HTMLButtonElement;
    focus.addEventListener("click", () => this.cb.focusAnimal());
    const reset = el("button", "gw-chip", "⟲ Reset") as HTMLButtonElement;
    reset.addEventListener("click", () => this.cb.resetCamera());
    camRow.append(focus, reset);
    this.settingsFly.append(camRow);

    this.settingsFly.append(el("div", "gw-section-title", "Overlays"));
    const dbg: [string, string][] = [
      ["collisions", "View collisions (C)"],
      ["feet", "Foot contacts"],
      ["normals", "Surface normals"],
      ["terrain", "Terrain heights"],
    ];
    for (const [key, label] of dbg) {
      const row = el("label", "fx-row");
      const box = el("input") as HTMLInputElement;
      box.type = "checkbox";
      box.addEventListener("change", () => {
        box.checked = this.cb.toggleDebugOption(key);
      });
      this.debugChecks.set(key, box);
      row.append(box, document.createTextNode(label));
      this.settingsFly.append(row);
    }
    const extra = el("div", "fx-btns");
    extra.style.marginTop = "10px";
    const helpBtn = el("button", "gw-chip", "⌨ Help (H)") as HTMLButtonElement;
    helpBtn.addEventListener("click", () => this.cb.help());
    const speciesBtn = el("button", "gw-chip", "＋ Add Species") as HTMLButtonElement;
    speciesBtn.addEventListener("click", () => this.cb.addSpecies());
    extra.append(helpBtn, speciesBtn);
    this.settingsFly.append(extra);

    // Event log flyout.
    this.logFly = el("div", "gw-flyout hidden");
    this.logFly.style.cssText = "bottom: clamp(78px, 11vh, 100px); left: clamp(14px, 4vw, 60px);";
    this.logFly.append(el("div", "gw-section-title", "Event Log"));
    this.logList = el("div");
    this.logFly.append(this.logList);

    this.root.append(this.detailsFly, this.settingsFly, this.logFly);
  }

  private toggleFly(which: HTMLElement): void {
    for (const f of [this.detailsFly, this.settingsFly, this.logFly]) {
      if (f === which) continue;
      f.classList.add("hidden");
    }
    const open = which.classList.toggle("hidden");
    if (!open && which === this.settingsFly) {
      const opts = this.cb.debugOptions();
      for (const [key, box] of this.debugChecks) box.checked = !!opts[key];
    }
  }

  closeFlyouts(): void {
    for (const f of [this.detailsFly, this.settingsFly, this.logFly]) f.classList.add("hidden");
  }

  /** Open the habitat-details / score-breakdown flyout (Animal Info panel button). */
  openDetails(): void {
    this.closeFlyouts();
    this.detailsFly.classList.remove("hidden");
  }

  // ── Mode / visibility ──────────────────────────────────────────────────

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
    // Repositions global chrome (the view switch) while the gecko UI is up.
    document.body.classList.toggle("gw-lizard-ui", v);
    if (!v) document.body.classList.remove("gw-cinematic");
  }

  /** Apply the mode machine's answer: which regions show + active highlights. */
  applyMode(mode: GwMode, regions: GwRegions = regionsFor(mode)): void {
    this.mode = mode;
    this.statStrip.classList.toggle("gw-hidden", !regions.statStrip);
    this.dockWrap.classList.toggle("gw-hidden", !regions.dock);
    this.slimNav.classList.toggle("gw-hidden", !regions.slimNav);
    this.photoHint.classList.toggle("gw-hidden", mode !== "photo");
    const compact = regions.topCards === "compact";
    const hidden = regions.topCards === "hidden";
    this.topCard.classList.toggle("gw-hidden", hidden);
    this.scoreCard.classList.toggle("gw-hidden", hidden);
    this.photoBtn.classList.toggle("gw-hidden", hidden);
    this.cineBtn.classList.toggle("gw-hidden", hidden);
    this.scoreBtn.classList.toggle("gw-hidden", compact || hidden);
    this.photoBtn.classList.toggle("gw-active", mode === "photo");
    // Cinematic: the black bars slide in; everything else is already hidden.
    document.body.classList.toggle("gw-cinematic", regions.letterbox);
    this.cineHint.classList.toggle("gw-hidden", !regions.letterbox);
    for (const [m, card] of this.dockCards) card.root.classList.toggle("gw-active", m === mode);
    for (const [m, tab] of this.slimTabs) tab.classList.toggle("gw-active", m === mode);
    this.closeFlyouts();
  }

  // ── Live data ──────────────────────────────────────────────────────────

  update(s: LizardHudState, info: AnimalInfoState, cleanliness: number, dirtSpotCount: number): void {
    // Identity card.
    this.idName.childNodes[0].textContent = s.habitatName;
    this.idSpecies.textContent = info.species || "Leopard Gecko";
    this.idSci.textContent = info.scientific;
    this.personaText.textContent = info.personality || "—";

    // Score card.
    this.scoreNum.textContent = String(s.overall);
    this.scoreRating.textContent = s.rating;
    this.ring.set(s.overall);
    this.scoreLine.textContent =
      s.overall >= 85 ? "Your gecko is thriving!" : s.overall >= 65 ? "Your gecko is doing well." : "Your habitat needs attention.";

    // Stat strip — every value from live state (needs / wellbeing / dirt / env).
    const f = (c: number): string => `${Math.round((c * 9) / 5 + 32)}°F`;
    this.setStat("hunger", info.hunger, `${Math.round(info.hunger)}%`, statusFor(info.hunger, ["Full", "Fed", "Peckish", "Hungry"]));
    this.setStat(
      "hydration",
      info.wellbeing.hydration,
      `${Math.round(info.wellbeing.hydration)}%`,
      statusFor(info.wellbeing.hydration, ["Hydrated", "Good", "Low", "Thirsty"]),
    );
    const stress = Math.round(info.stress);
    this.setStat("stress", stress, `${stress}%`, {
      word: stress <= 20 ? "Low" : stress <= 45 ? "Mild" : stress <= 70 ? "Tense" : "High",
      tone: stress <= 45 ? "" : stress <= 70 ? "warn" : "bad",
    });
    this.setStat("health", info.health, `${Math.round(info.health)}%`, statusFor(info.health, ["Excellent", "Healthy", "Fair", "Poor"]));
    this.setStat("comfort", info.comfort, `${Math.round(info.comfort)}%`, statusFor(info.comfort, ["Great", "Good", "Okay", "Poor"]));
    this.setStat("clean", cleanliness, `${Math.round(cleanliness)}%`, statusFor(cleanliness, ["Clean", "Tidy", "Dusty", "Dirty"]));
    const bask = s.environment.baskingC;
    this.setStat("temp", ((bask - 15) / 25) * 100, f(bask), {
      word: bask >= 28 && bask <= 34 ? "Ideal" : bask >= 24 ? "Warm" : "Cool",
      tone: bask >= 28 && bask <= 34 ? "" : "warn",
    });
    const hum = Math.round(s.environment.humidity);
    this.setStat("humid", hum, `${hum}%`, { word: hum <= 50 ? "Optimal" : "Humid", tone: hum <= 50 ? "" : "warn" });

    // Dock subtitles (live where the data is live).
    const feed = this.dockCards.get("feed");
    if (feed) feed.sub.textContent = s.canFeed ? "Ready — live insects" : `Next in ${Math.ceil(s.feedCooldown)}s`;
    const clean = this.dockCards.get("clean");
    if (clean) clean.sub.textContent = dirtSpotCount > 0 ? `${dirtSpotCount} spot${dirtSpotCount > 1 ? "s" : ""} detected` : "Spot clean";

    // Warning pill (one at a time, most important first).
    const warn = s.warnings[0] ?? "";
    this.warnPill.textContent = warn ? `⚠ ${warn}` : "";
    this.warnPill.classList.toggle("gw-hidden", !warn || this.mode === "photo");

    // Details flyout.
    this.setMeter("hiding", s.scores.hidingSpots, `${Math.round(s.scores.hidingSpots)}`);
    this.setMeter("climbing", s.scores.climbing, `${Math.round(s.scores.climbing)}`);
    this.setMeter("enrichment", s.scores.enrichment, `${Math.round(s.scores.enrichment)}`);
    this.setMeter("basking", ((s.environment.baskingC - 15) / 25) * 100, `${s.environment.baskingC.toFixed(1)}°C`);
    this.setMeter("cool", ((s.environment.coolC - 15) / 25) * 100, `${s.environment.coolC.toFixed(1)}°C`);
    this.setMeter("humidity", s.environment.humidity, `${Math.round(s.environment.humidity)}%`);
    this.setMeter("uvb", s.uvbOn ? 100 : 0, s.uvbOn ? "On" : "Off");
    this.rigBadge.textContent = s.usingPlaceholder ? "PLACEHOLDER GECKO" : `FINAL RIG · ${s.clipNames.length} clips`;
    this.detailWarns.textContent = s.warnings.length ? `⚠ ${s.warnings.join(" · ")}` : "";

    // Event log flyout.
    if (!this.logFly.classList.contains("hidden")) {
      this.logList.replaceChildren();
      for (const ev of s.events) {
        const line = el("div");
        line.style.cssText = `padding: 2.5px 0; font: 500 12px/1.4 var(--gw-font); color: ${
          ev.tone === "good" ? "var(--gw-green)" : ev.tone === "warn" ? "var(--gw-amber)" : ev.tone === "bad" ? "var(--gw-red)" : "var(--gw-ink-dim)"
        };`;
        line.textContent = ev.message;
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
    window.removeEventListener("keydown", this.onKey);
    this.root.remove();
  }
}

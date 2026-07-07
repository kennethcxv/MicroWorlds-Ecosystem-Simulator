/**
 * FROG HUD — the rainforest paludarium's GLASSWATER game UI, built to the same
 * bar as the gecko + fish HUDs (identity card · score card · stat strip ·
 * action dock · feed drawer · animal panel · photo/album) but designed for an
 * AMPHIBIAN: humidity and hydration are the stars, MIST is a first-class dock
 * action, and feeding releases live crickets the frog genuinely hunts.
 *
 * All numbers come from the pure FrogNeedsSystem via the scene's FrogHooks;
 * which regions show is decided by the shared mode machine (home = "frog-main").
 */
import { stockCount, type Stock } from "../game/economy";
import type { FrogHudState } from "../render/three/ThreeHabitat";
import { ensureGwStyles, gwEl as el, gwProgressRing } from "./gwTheme";
import { gwIcon, type GwIconName } from "./gwIcons";
import { regionsFor, type GwMode, type GwRegions } from "./gwModes";
import { fmtTemp } from "./prefs";

export const FROG_PORTRAIT = "/assets/ui/frog_portrait_01.png";

export interface FrogHudCallbacks {
  requestMode(mode: GwMode): void;
  cameraPreset(name: string): void;
  resetCamera(): void;
  focusAnimal(): void;
  goHome(): void;
  openSettings(): void;
  openAlbum(): void;
  capturePhoto(): void;
  /** Release `count` crickets from stock. */
  feed(count: number): void;
  /** Fire the misting nozzles. */
  mist(): void;
}

interface StatItem {
  root: HTMLElement;
  fill: HTMLElement;
  status: HTMLElement;
  value: HTMLElement;
}

function ratingWord(score: number): string {
  return score >= 88 ? "Excellent" : score >= 75 ? "Thriving" : score >= 60 ? "Stable" : score >= 40 ? "Struggling" : "Critical";
}

const statusWord = (v: number, highGood = true): { word: string; tone: string } => {
  const g = highGood ? v : 100 - v;
  return g >= 75 ? { word: "Great", tone: "" } : g >= 45 ? { word: "Okay", tone: "" } : g >= 25 ? { word: "Low", tone: "warn" } : { word: "Critical", tone: "bad" };
};

export class FrogHud {
  readonly root: HTMLElement;
  private cb: FrogHudCallbacks;
  private _visible = false;
  private mode: GwMode = "frog-main";

  private topCard!: HTMLElement;
  private idName!: HTMLElement;
  private scoreCard!: HTMLElement;
  private scoreNum!: HTMLElement;
  private scoreRating!: HTMLElement;
  private scoreLine!: HTMLElement;
  private ring!: ReturnType<typeof gwProgressRing>;
  private homePill!: HTMLButtonElement;
  private photoBtn!: HTMLButtonElement;
  private albumBtn!: HTMLButtonElement;
  private shutterBtn!: HTMLButtonElement;
  private warnPill!: HTMLElement;
  private photoHint!: HTMLElement;

  private statStrip!: HTMLElement;
  private stats = new Map<string, StatItem>();
  private dockWrap!: HTMLElement;
  private dockCards = new Map<string, { root: HTMLButtonElement; sub: HTMLElement; dot: HTMLElement }>();

  private feedDrawer!: HTMLElement;
  private cricketBadge!: HTMLElement;
  private portionVal!: HTMLElement;
  private feedNote!: HTMLElement;
  private feedCta!: HTMLButtonElement;
  portion = 3;

  private infoPanel!: HTMLElement;
  private infoStatus!: HTMLElement;
  private infoMeters = new Map<string, StatItem>();
  private logFly!: HTMLElement;
  private logList!: HTMLElement;
  private settingsFly!: HTMLElement;

  constructor(cb: FrogHudCallbacks) {
    this.cb = cb;
    ensureGwStyles();
    this.root = el("div", "gw-hud");
    this.root.style.cssText = "position:fixed;inset:0;z-index:4;pointer-events:none;";
    this.root.classList.add("gw-hidden");
    this.build();
  }

  private build(): void {
    this.buildTopCards();
    this.buildStatStrip();
    this.buildDock();
    this.buildFeedDrawer();
    this.buildInfoPanel();
    this.buildFlyouts();

    this.warnPill = el("div", "gw-warn-pill gw-hidden");
    this.warnPill.style.top = "clamp(74px, 10vh, 96px)";
    this.photoHint = el("div", "gw-hint-pill gw-hidden", "Photo Mode — drag to orbit freely · Esc to exit");
    this.photoHint.prepend(gwIcon("camera", 14, "#dfe4da"));
    this.photoHint.style.display = "inline-flex";
    this.photoHint.style.alignItems = "center";
    this.photoHint.style.gap = "8px";
    this.root.append(this.warnPill, this.photoHint);
  }

  private buildTopCards(): void {
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
    thumb.style.background = "radial-gradient(circle at 32% 28%, #1d4a2e, #0c2016 78%)";
    const img = document.createElement("img");
    img.src = FROG_PORTRAIT;
    img.alt = "Colorful frog";
    img.style.objectFit = "cover";
    thumb.append(img);
    const txt = el("div");
    this.idName = el("div", "gw-id-name");
    this.idName.append(document.createTextNode("Emerald Hollow"), gwIcon("leaf", 13, "#8ce25a"));
    const species = el("div", "gw-id-species", "Colorful Frog Paludarium");
    const sci = el("div", "gw-id-sci", "Agalychnis callidryas");
    txt.append(this.idName, species, sci);
    row.append(thumb, txt);
    const tags = el("div", "gw-tag-row");
    const tagDefs: [GwIconName, string, string][] = [
      ["sprout", "#8ce25a", "Rainforest"],
      ["drop", "#5db9f0", "Humid"],
      ["heart", "#e88aa0", "1 animal"],
    ];
    for (const [ic, color, label] of tagDefs) {
      const pill = el("span", "gw-pill");
      pill.append(gwIcon(ic, 12, color), document.createTextNode(label));
      tags.append(pill);
    }
    this.topCard.append(row, tags);

    // Score card.
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
    this.ring.center.replaceChildren(gwIcon("sprout", 24, "#8ce25a"));
    main.append(numWrap, this.ring.root);
    this.scoreLine = el("div", "gw-score-line", "");
    this.scoreCard.append(head, main, this.scoreLine);

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
      this.statItem("hunger", "bowl", "#e6d7ae", "Hunger"),
      this.statItem("hydration", "drop", "#5db9f0", "Hydration", "blue"),
      this.statItem("humidity", "sparkle", "#7fd6a8", "Humidity"),
      this.statItem("temp", "thermo", "#ef7a5e", "Temperature", "amber"),
      this.statItem("stress", "bolt", "#f0b64b", "Stress"),
      this.statItem("comfort", "leaf", "#8ce25a", "Comfort"),
      this.statItem("health", "heart", "#e88aa0", "Health"),
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
    const card = (key: string, icon: GwIconName, color: string, label: string, sub: string, go: () => void): void => {
      const c = el("button", "gw-action-card") as HTMLButtonElement;
      const txt = el("div");
      const subEl = el("div", "sub", sub);
      txt.append(el("div", "lbl", label), subEl);
      const ic = el("span", "ic");
      ic.append(gwIcon(icon, 30, color));
      const dot = el("span", "dot");
      c.append(ic, txt, dot);
      c.addEventListener("click", go);
      this.dockCards.set(key, { root: c, sub: subEl, dot });
      dock.append(c);
    };
    card("feed", "bowl", "#e6d7ae", "Feed", "Release crickets", () => this.cb.requestMode("frog-feed"));
    card("mist", "drop", "#5db9f0", "Mist", "Spray the leaves", () => this.cb.mist());
    card("info", "heart", "#e88aa0", "Animal Info", "How is the frog?", () => this.cb.requestMode("frog-info"));

    const settingsBtn = el("button", "gw-icon-button") as HTMLButtonElement;
    settingsBtn.append(gwIcon("sliders", 19, "#e8ebe3"));
    settingsBtn.title = "Camera & settings";
    settingsBtn.addEventListener("click", () => this.toggleFly(this.settingsFly));

    this.dockWrap.append(menuBtn, dock, settingsBtn);
    this.root.append(this.dockWrap);
  }

  private buildFeedDrawer(): void {
    this.feedDrawer = el("div", "gw-panel gw-bottom-drawer gw-low gw-hidden");
    const head = el("div", "gw-drawer-head");
    head.append(
      el("div", "gw-drawer-title", "Feed the Frog"),
      el("div", "gw-drawer-sub", "Release live crickets — it hunts at its own pace"),
      el("div", "spacer"),
    );
    const x = el("button", "gw-x", "✕");
    x.addEventListener("click", () => this.cb.requestMode("frog-feed"));
    head.append(x);
    const body = el("div");
    body.style.cssText = "display:flex; gap:18px; align-items:stretch;";

    const cardWrap = el("div");
    cardWrap.style.cssText = "display:grid; grid-template-columns: minmax(170px, 220px); gap:10px;";
    const cricketCard = el("button", "gw-item-card gw-active") as HTMLButtonElement;
    const art = el("span", "art", "🦗");
    const nm = el("span", "nm", "Crickets");
    const ds = el("span", "ds", "Lean, active staple — a lively hunt.");
    this.cricketBadge = el("span", "gw-badge dim", "—");
    this.cricketBadge.style.margin = "7px auto 0";
    cricketCard.append(art, nm, ds, this.cricketBadge, el("span", "check", "✓"));
    cardWrap.append(cricketCard);

    const side = el("div");
    side.style.cssText = "display:flex; flex-direction:column; gap:10px; min-width: 250px;";
    const field = el("div", "gw-field");
    field.append(el("span", "cap", "Crickets to release"));
    const stepper = el("div", "gw-stepper");
    const minus = el("button", undefined, "−");
    this.portionVal = el("span", "val", String(this.portion));
    const plus = el("button", undefined, "+");
    minus.addEventListener("click", () => this.setPortion(this.portion - 1));
    plus.addEventListener("click", () => this.setPortion(this.portion + 1));
    stepper.append(minus, this.portionVal, plus);
    field.append(stepper);

    this.feedCta = el("button", "gw-primary-button", "Release Crickets") as HTMLButtonElement;
    this.feedCta.addEventListener("click", () => this.cb.feed(this.portion));
    this.feedNote = el("div");
    this.feedNote.style.cssText = "font:500 11.5px/1.4 var(--gw-font); color: var(--gw-ink-dim); min-height: 16px;";
    side.append(field, this.feedCta, this.feedNote);

    body.append(cardWrap, side);
    this.feedDrawer.append(head, body);
    this.root.append(this.feedDrawer);
  }

  private buildInfoPanel(): void {
    this.infoPanel = el("div", "gw-panel gw-animal-panel gw-hidden");
    const head = el("div", "ap-head");
    head.append(el("div", "ap-title", "Colorful Frog"));
    const x = el("button", "gw-x ap-x", "✕");
    x.addEventListener("click", () => this.cb.requestMode("frog-info"));
    head.append(x);
    const bodyEl = el("div", "ap-body");

    const photo = el("div");
    photo.style.cssText = "display:flex; align-items:center; gap:12px; margin-bottom:10px;";
    const pic = document.createElement("img");
    pic.src = FROG_PORTRAIT;
    pic.alt = "Colorful frog";
    pic.style.cssText = "width:64px; height:64px; border-radius:50%; object-fit:cover; border:2px solid rgba(140,226,90,0.4);";
    const pTx = el("div");
    this.infoStatus = el("div");
    this.infoStatus.style.cssText = "font:700 13px/1.3 var(--gw-font);";
    const sci = el("div", undefined, "Agalychnis callidryas · red-eyed tree frog");
    sci.style.cssText = "font:500 10.5px/1.35 var(--gw-font); color: var(--gw-ink-dim); margin-top:3px;";
    pTx.append(this.infoStatus, sci);
    photo.append(pic, pTx);
    bodyEl.append(photo);

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
      this.infoMeters.set(key, { root: rowEl, fill, status, value });
      bodyEl.append(rowEl);
    };
    mk("hunger", "bowl", "#e6d7ae", "Hunger");
    mk("hydration", "drop", "#5db9f0", "Hydration");
    mk("stress", "bolt", "#f0b64b", "Stress");
    mk("comfort", "leaf", "#8ce25a", "Comfort");
    mk("health", "heart", "#e88aa0", "Health");

    const tips = el("div");
    tips.style.cssText = "margin-top:11px; font:500 11px/1.5 var(--gw-font); color: var(--gw-ink-dim);";
    tips.append(
      el("div", undefined, "💧 Amphibians drink through their skin — keep humidity 70–95%."),
      el("div", undefined, "🌿 A nocturnal ambush hunter: it sits, watches, then strikes."),
      el("div", undefined, "🏞 The pond is shallow on purpose — tree frogs are weak swimmers."),
    );
    bodyEl.append(tips);

    const foot = el("div", "ap-foot");
    const feedBtn = el("button", "gw-primary-button", "Feed") as HTMLButtonElement;
    feedBtn.addEventListener("click", () => this.cb.requestMode("frog-feed"));
    const focusBtn = el("button", "gw-ghost-button", "Focus Camera") as HTMLButtonElement;
    focusBtn.addEventListener("click", () => this.cb.focusAnimal());
    foot.append(feedBtn, focusBtn);

    this.infoPanel.append(head, bodyEl, foot);
    this.root.append(this.infoPanel);
  }

  private buildFlyouts(): void {
    this.logFly = el("div", "gw-flyout hidden");
    this.logFly.style.cssText = "bottom: clamp(78px, 11vh, 100px); left: clamp(14px, 4vw, 60px);";
    this.logFly.append(el("div", "gw-section-title", "Event Log"));
    this.logList = el("div");
    this.logFly.append(this.logList);

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

    this.root.append(this.logFly, this.settingsFly);
  }

  private toggleFly(which: HTMLElement): void {
    for (const f of [this.logFly, this.settingsFly]) {
      if (f === which) continue;
      f.classList.add("hidden");
    }
    which.classList.toggle("hidden");
  }

  closeFlyouts(): void {
    for (const f of [this.logFly, this.settingsFly]) f.classList.add("hidden");
  }

  private setPortion(p: number): void {
    this.portion = Math.max(1, Math.min(6, p));
    this.portionVal.textContent = String(this.portion);
  }

  setFeedNote(text: string, warn = false): void {
    this.feedNote.textContent = text;
    this.feedNote.style.color = warn ? "var(--gw-amber)" : "var(--gw-ink-dim)";
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
    this.feedDrawer.classList.toggle("gw-hidden", regions.drawer !== "frog-feed");
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
    this.photoBtn.classList.toggle("gw-active", mode === "photo");
    for (const [key, card] of this.dockCards) {
      card.root.classList.toggle("gw-active", (key === "feed" && mode === "frog-feed") || (key === "info" && mode === "frog-info"));
    }
    this.closeFlyouts();
  }

  // ── Live data ────────────────────────────────────────────────────────────

  update(s: FrogHudState, stock: Stock): void {
    this.idName.childNodes[0].textContent = s.habitatName;

    this.scoreNum.textContent = String(s.score);
    this.scoreRating.textContent = ratingWord(s.score);
    this.ring.set(s.score);
    this.scoreLine.textContent =
      s.score >= 85 ? "The hollow is thriving!" : s.score >= 65 ? "A healthy little rainforest." : "The habitat needs attention.";

    const setStat = (key: string, pct: number, text: string, st: { word: string; tone: string }): void => {
      const item = this.stats.get(key);
      if (!item) return;
      item.fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      item.value.textContent = text;
      item.status.textContent = st.word;
      item.status.className = `st ${st.tone}`.trim();
    };
    setStat("hunger", s.hunger, `${s.hunger}%`, statusWord(s.hunger));
    setStat("hydration", s.hydration, `${s.hydration}%`, statusWord(s.hydration));
    const [hLo, hHi] = [70, 95];
    const hOk = s.humidity >= hLo && s.humidity <= hHi;
    setStat("humidity", s.humidity, `${s.humidity}%`, {
      word: hOk ? "Ideal" : s.humidity < hLo ? "Too dry" : "Soaked",
      tone: hOk ? "" : s.humidity < hLo - 12 ? "bad" : "warn",
    });
    const ambient = (s.baskingC + s.coolC) / 2;
    setStat("temp", Math.max(0, Math.min(100, (ambient - 15) * 6)), fmtTemp(ambient, 0), {
      word: ambient >= 22 && ambient <= 28 ? "Ideal" : "Watch",
      tone: ambient >= 22 && ambient <= 28 ? "" : "warn",
    });
    setStat("stress", s.stress, `${s.stress}%`, statusWord(s.stress, false));
    setStat("comfort", s.comfort, `${s.comfort}%`, statusWord(s.comfort));
    setStat("health", s.health, `${s.health}%`, statusWord(s.health));

    // Dock subtitles + attention dots.
    const feed = this.dockCards.get("feed");
    if (feed) {
      feed.sub.textContent = s.cricketsLoose > 0 ? `${s.cricketsLoose} loose — it's hunting` : s.hunger < 40 ? "It's hungry!" : "Release crickets";
      feed.dot.style.opacity = s.hunger < 35 ? "1" : "0.25";
    }
    const mist = this.dockCards.get("mist");
    if (mist) {
      mist.sub.textContent = s.mistActive ? "Air is misty & soft" : s.humidity < hLo ? "The air is drying!" : "Spray the leaves";
      mist.dot.style.opacity = s.humidity < hLo ? "1" : "0.25";
    }
    const info = this.dockCards.get("info");
    if (info) info.sub.textContent = s.behaviour;

    // One warning at a time, worst first.
    const worst =
      s.hydration < 25
        ? "Your frog is dehydrated — mist now or let it reach the pond!"
        : s.humidity < 55
          ? "The air is drying out — mist the enclosure."
          : s.hunger < 22
            ? "Your frog is very hungry — release some crickets."
            : s.stress > 65
              ? "The frog is stressed — check humidity and let it settle."
              : "";
    this.warnPill.textContent = worst ? `⚠ ${worst}` : "";
    this.warnPill.classList.toggle("gw-hidden", !worst || this.mode === "photo");

    // Feed drawer stock.
    const have = stockCount(stock, "cricket");
    this.cricketBadge.textContent = have > 0 ? `${have} in stock` : "Out of stock";
    this.cricketBadge.className = `gw-badge ${have > 0 ? (have <= 3 ? "amber" : "green") : "amber"}`;
    this.feedCta.disabled = have <= 0;

    // Info panel.
    this.infoStatus.textContent = s.behaviour;
    const setMeter = (key: string, v: number, highGood = true): void => {
      const m = this.infoMeters.get(key);
      if (!m) return;
      m.fill.style.width = `${Math.max(0, Math.min(100, v))}%`;
      m.value.textContent = `${v}%`;
      const st = statusWord(v, highGood);
      m.status.textContent = st.word;
      m.status.className = `st ${st.tone}`.trim();
    };
    setMeter("hunger", s.hunger);
    setMeter("hydration", s.hydration);
    setMeter("stress", s.stress, false);
    setMeter("comfort", s.comfort);
    setMeter("health", s.health);

    // Event log flyout.
    if (!this.logFly.classList.contains("hidden")) {
      this.logList.replaceChildren();
      for (const ev of s.events.slice(0, 14)) {
        const line = el("div");
        line.style.cssText = `padding: 2.5px 0; font: 500 12px/1.4 var(--gw-font); color: ${
          ev.tone === "good" ? "var(--gw-green)" : ev.tone === "warn" ? "var(--gw-amber)" : ev.tone === "bad" ? "var(--gw-red)" : "var(--gw-ink-dim)"
        };`;
        line.textContent = ev.message;
        this.logList.append(line);
      }
    }
  }

  dispose(): void {
    this.root.remove();
  }
}

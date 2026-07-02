/**
 * ANIMAL INFO — the right-side panel from the reference image
 * (Designs/Gecko "02_12_27 PM (6)"; map: docs/production/DESIGN_REFERENCE_MAP.md).
 * Opens from the Animal Info dock card or by clicking the gecko; the habitat
 * stays visible (the panel hugs the right edge) and the gecko gets a subtle
 * highlight ring. Round photo + identity, a green live-status line, ten
 * Live Metrics rows (icon · label · bar · % · status word), a friendly
 * Recommendations box, and Feed / Focus / Habitat Details actions.
 *
 * Pure DOM; reads an `AnimalInfoState` each UI tick — no Three.js.
 */
import type { AnimalInfoState } from "../habitats/lizard/LizardController";
import { ensureGwStyles, gwEl as el } from "./gwTheme";
import { GECKO_PORTRAIT } from "./lizardHud";

export interface AnimalInfoCallbacks {
  feed(): void;
  focus(): void;
  /** Open the habitat details / score breakdown. */
  details(): void;
  close(): void;
}

interface MeterRow {
  fill: HTMLElement;
  pc: HTMLElement;
  st: HTMLElement;
}

/** label → [icon, top, good, warn, bad] status words (higher = better). */
const METRICS: { key: string; icon: string; label: string; words: [string, string, string, string]; barClass?: string }[] = [
  { key: "hunger", icon: "🍽️", label: "Hunger", words: ["Full", "Fed", "Peckish", "Hungry"] },
  { key: "hydration", icon: "💧", label: "Hydration", words: ["Hydrated", "Good", "Low", "Thirsty"], barClass: "blue" },
  { key: "stress", icon: "🌸", label: "Stress", words: ["", "", "", ""], barClass: "pink" },
  { key: "health", icon: "💚", label: "Health", words: ["Healthy", "Good", "Fair", "Poor"] },
  { key: "calcium", icon: "🦴", label: "Calcium", words: ["Stocked", "Good", "Low", "Deficient"] },
  { key: "bodyCondition", icon: "⚖️", label: "Body Condition", words: ["", "", "", ""], barClass: "amber" },
  { key: "comfort", icon: "🏠", label: "Comfort", words: ["Comfortable", "Good", "Okay", "Poor"] },
  { key: "tempComfort", icon: "🌡️", label: "Temperature Comfort", words: ["Ideal", "Good", "Off", "Bad"], barClass: "amber" },
  { key: "humidComfort", icon: "💦", label: "Humidity Comfort", words: ["Optimal", "Good", "Off", "Bad"], barClass: "blue" },
  { key: "security", icon: "🛡️", label: "Shelter / Security", words: ["Secure", "Good", "Exposed", "Unsafe"] },
  { key: "enrichment", icon: "🌵", label: "Enrichment", words: ["Engaged", "Good", "Plain", "Bored"] },
  { key: "cleanExposure", icon: "✨", label: "Cleanliness Exposure", words: ["Clean", "Tidy", "Dusty", "Dirty"] },
];

export class AnimalInfoPanel {
  readonly root: HTMLElement;
  private cb: AnimalInfoCallbacks;
  private nameEl!: HTMLElement;
  private speciesEl!: HTMLElement;
  private metaEl!: HTMLElement;
  private statusLine!: HTMLElement;
  private statusSub!: HTMLElement;
  private meters = new Map<string, MeterRow>();
  private recWrap!: HTMLElement;
  private recList!: HTMLElement;
  private rigBadge!: HTMLElement;

  constructor(cb: AnimalInfoCallbacks) {
    this.cb = cb;
    ensureGwStyles();
    this.root = el("div", "gw-panel gw-animal-panel gw-hidden");
    this.build();
  }

  private build(): void {
    const head = el("div", "ap-head");
    head.append(el("span", "ap-title", "Animal Info"));
    const x = el("button", "gw-icon-button ap-x", "✕") as HTMLButtonElement;
    x.style.cssText = "width:32px;height:32px;font-size:13px;box-shadow:none;";
    x.title = "Close (Esc)";
    x.addEventListener("click", () => this.cb.close());
    head.append(x);

    const body = el("div", "ap-body");

    const hero = el("div", "ap-hero");
    const photo = el("div", "ap-photo");
    const img = document.createElement("img");
    img.src = GECKO_PORTRAIT;
    img.alt = "Leopard gecko";
    img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;";
    photo.append(img);
    hero.append(photo);
    const idc = el("div");
    this.nameEl = el("div", "ap-name", "—");
    this.speciesEl = el("div", "ap-species", "Leopard Gecko");
    this.metaEl = el("div", "ap-meta");
    idc.append(this.nameEl, this.speciesEl, this.metaEl);
    hero.append(idc);
    body.append(hero);

    const status = el("div", "ap-status");
    this.statusLine = el("div", "s1");
    this.statusSub = el("div", "s2", "");
    status.append(this.statusLine, this.statusSub);
    body.append(status);

    const metricsTitle = el("div", "gw-section-title", "Live Metrics");
    metricsTitle.style.marginTop = "14px";
    body.append(metricsTitle);
    const meters = el("div");
    for (const m of METRICS) {
      const row = el("div", "gw-meter");
      const bar = el("div", `gw-bar ${m.barClass ?? ""}`.trim());
      const fill = el("i");
      bar.append(fill);
      const stat = el("div", "stat");
      const pc = el("span", "pc", "—");
      const st = el("span", "st", "");
      stat.append(pc, st);
      row.append(el("span", "ic", m.icon), el("span", "k", m.label), bar, stat);
      this.meters.set(m.key, { fill, pc, st });
      meters.append(row);
    }
    body.append(meters);

    this.recWrap = el("div", "ap-rec");
    this.recWrap.append(el("div", "gw-section-title", "Recommendations"));
    this.recList = el("div");
    this.recWrap.append(this.recList);
    body.append(this.recWrap);

    this.rigBadge = el("div", "gw-badge dim", "");
    body.append(this.rigBadge);

    const foot = el("div", "ap-foot");
    const feed = el("button", "gw-ghost-button", "🦗 Feed") as HTMLButtonElement;
    feed.addEventListener("click", () => this.cb.feed());
    const focus = el("button", "gw-ghost-button", "🎯 Focus") as HTMLButtonElement;
    focus.addEventListener("click", () => this.cb.focus());
    const details = el("button", "gw-ghost-button", "🏜️ Habitat Details") as HTMLButtonElement;
    details.addEventListener("click", () => this.cb.details());
    foot.append(feed, focus, details);

    this.root.append(head, body, foot);
  }

  update(s: AnimalInfoState): void {
    this.nameEl.textContent = s.name;
    // Avoid "Leopard Gecko / Leopard Gecko" when the animal has no pet name yet.
    const dup = !s.species || s.species === s.name;
    this.speciesEl.textContent = dup ? s.scientific : s.species;
    this.speciesEl.style.fontStyle = dup ? "italic" : "";

    this.metaEl.replaceChildren();
    const stage = el("span", "gw-pill");
    stage.append(el("span", "ic", "🦎"), document.createTextNode(s.stage));
    this.metaEl.append(stage);
    if (s.personality) {
      const persona = el("span", "gw-pill");
      persona.style.borderColor = "rgba(140,226,90,0.4)";
      persona.style.color = "#b9e89a";
      persona.append(document.createTextNode(s.personality));
      persona.title = s.personalityBlurb;
      this.metaEl.append(persona);
    }
    if (!dup) {
      const sci = el("span", "gw-pill");
      sci.style.fontStyle = "italic";
      sci.append(document.createTextNode(s.scientific));
      this.metaEl.append(sci);
    }

    // Status: "Active & Exploring" style line + a caption sentence.
    this.statusLine.replaceChildren();
    this.statusLine.append(el("span", "pulse"), document.createTextNode(friendlyBehavior(s.behavior)));
    const heading = s.target && s.target !== "—" ? ` — heading for ${s.target}` : "";
    this.statusSub.textContent = `${s.name} is ${s.behavior.toLowerCase()}${heading}.${s.basking ? " ☀ Basking spot is on." : ""}`;

    const w = s.wellbeing;
    this.setMeter("hunger", s.hunger, wordsFor(s.hunger, ["Full", "Fed", "Peckish", "Hungry"]));
    this.setMeter("hydration", w.hydration, wordsFor(w.hydration, ["Hydrated", "Good", "Low", "Thirsty"]));
    this.setMeter("calcium", s.calcium, wordsFor(s.calcium, ["Stocked", "Good", "Low", "Deficient"]));
    const bc = Math.round(s.bodyCondition);
    this.setMeter("bodyCondition", bc, {
      word: bc < 35 ? "Lean" : bc <= 70 ? "Ideal" : bc <= 85 ? "Chubby" : "Overweight",
      tone: bc >= 35 && bc <= 70 ? "" : bc <= 85 ? "warn" : "bad",
    });
    const stress = Math.round(s.stress);
    this.setMeter("stress", stress, {
      word: stress <= 20 ? "Calm" : stress <= 45 ? "Settled" : stress <= 70 ? "Tense" : "Stressed",
      tone: stress <= 45 ? "" : stress <= 70 ? "warn" : "bad",
    });
    this.setMeter("health", s.health, wordsFor(s.health, ["Healthy", "Good", "Fair", "Poor"]));
    this.setMeter("comfort", s.comfort, wordsFor(s.comfort, ["Comfortable", "Good", "Okay", "Poor"]));
    this.setMeter("tempComfort", w.tempComfort, wordsFor(w.tempComfort, ["Ideal", "Good", "Off", "Cold"]));
    this.setMeter("humidComfort", w.humidComfort, wordsFor(w.humidComfort, ["Optimal", "Good", "Damp", "Wrong"]));
    this.setMeter("security", w.security, wordsFor(w.security, ["Secure", "Good", "Exposed", "Unsafe"]));
    this.setMeter("enrichment", w.enrichment, wordsFor(w.enrichment, ["Engaged", "Good", "Plain", "Bored"]));
    this.setMeter("cleanExposure", w.cleanExposure, wordsFor(w.cleanExposure, ["Clean", "Tidy", "Dusty", "Dirty"]));

    // Recommendations — friendly praise when there's nothing to fix.
    this.recList.replaceChildren();
    const recs = s.recommendations.slice(0, 3);
    if (recs.length === 0) recs.push(`Great job! ${s.name} is thriving in this habitat.`);
    for (const r of recs) {
      const row = el("div", "r");
      row.append(el("span", "lf", "🌿"), document.createTextNode(r));
      this.recList.append(row);
    }
    if (s.warnings.length) {
      const row = el("div", "r");
      row.style.color = "var(--gw-amber)";
      row.append(el("span", "lf", "⚠"), document.createTextNode(s.warnings[0]));
      this.recList.append(row);
    }

    this.rigBadge.textContent = s.usingPlaceholder ? "PLACEHOLDER GECKO" : `FINAL RIG · ${s.clipNames.length} clips`;
  }

  private setMeter(key: string, pct: number, s: { word: string; tone: string }): void {
    const m = this.meters.get(key);
    if (!m) return;
    m.fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    m.pc.textContent = `${Math.round(pct)}%`;
    m.st.textContent = s.word;
    m.st.className = `st ${s.tone}`.trim();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }
  open(): void {
    this.root.classList.remove("gw-hidden");
  }
  close(): void {
    this.root.classList.add("gw-hidden");
  }
  get isOpen(): boolean {
    return !this.root.classList.contains("gw-hidden");
  }
}

function wordsFor(v: number, words: [string, string, string, string]): { word: string; tone: string } {
  if (v >= 80) return { word: words[0], tone: "" };
  if (v >= 55) return { word: words[1], tone: "" };
  if (v >= 30) return { word: words[2], tone: "warn" };
  return { word: words[3], tone: "bad" };
}

/** "Roaming" → "Active & Exploring", etc. — the reference's friendly phrasing. */
function friendlyBehavior(behavior: string): string {
  const b = behavior.toLowerCase();
  if (b.includes("hunt")) return "On the Hunt";
  if (b.includes("eat")) return "Enjoying a Meal";
  if (b.includes("rest") || b.includes("shelter") || b.includes("hide")) return "Resting & Cozy";
  if (b.includes("bask")) return "Basking & Warm";
  if (b.includes("drink")) return "Taking a Drink";
  return "Active & Exploring";
}

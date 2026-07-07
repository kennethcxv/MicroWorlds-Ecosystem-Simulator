/**
 * SETTINGS — the reference-match screen (Designs/Settings_Page): a large
 * centered glass panel over the room with six tabs (schema-driven from
 * src/data/settingsSchema.ts), leaf-thumb sliders, game-styled selects and
 * toggles, a context sidebar (live description + real performance readout +
 * Auto-Detect + Reset to Defaults) and the Esc/R/Apply bottom bar.
 *
 * Every control writes the real Prefs store immediately; the app's central
 * applySettings listener wires the live systems (volume, renderer, zoom…).
 * Replaces the old SettingsModal — including its Save Now + two-step Reset.
 */
import { gwEl as el, ensureGwStyles, gwBackPill } from "./gwTheme";
import { gwIcon } from "./gwIcons";
import { ASSETS } from "../data/assets";
import { sfx } from "../render/sfx";
import { DEFAULT_PREFS, getPrefs, setPrefs, type Prefs } from "./prefs";
import { SETTINGS_TABS, settingsTab, tabPrefs, type SettingsRow, type SettingsTabId } from "../data/settingsSchema";

export interface SettingsScreenCallbacks {
  saveNow(): void;
  resetGame(): void;
  toast(message: string): void;
  /** Real accumulated play time (ms) for the status chip. */
  playtimeMs(): number;
}

let stylesIn = false;
function ensureStyles(): void {
  if (stylesIn) return;
  stylesIn = true;
  const css = `
  .gw-set { position: fixed; inset: 0; z-index: 40; display: none; flex-direction: column; align-items: center;
    color: var(--gw-ink); font-family: var(--gw-font); overflow: hidden;
    --set-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif; }
  .gw-set.open { display: flex; }
  .gw-set .st-bg { position: absolute; inset: 0; background-size: cover; background-position: center 34%; }
  .gw-set .st-bg::after { content: ""; position: absolute; inset: 0;
    background: radial-gradient(circle at 50% 42%, rgba(6,9,8,0.82), rgba(4,6,5,0.94) 78%); }

  .gw-set .st-panel { position: relative; z-index: 1; width: min(1280px, calc(100vw - 48px));
    height: min(86vh, 920px); margin-top: clamp(14px, 4vh, 44px); display: flex; flex-direction: column;
    border-radius: 26px; background: rgba(11,14,13,0.88); border: 1.5px solid var(--gw-border);
    box-shadow: 0 40px 110px rgba(0,0,0,0.65); backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur);
    padding: clamp(16px, 2.6vh, 30px) clamp(18px, 2.2vw, 34px); }

  .gw-set .st-head { display: flex; align-items: center; gap: 15px; }
  .gw-set .st-gear { width: 52px; height: 52px; border-radius: 15px; display: grid; place-items: center;
    border: 1.5px solid rgba(240,182,75,0.45); background: rgba(240,182,75,0.1); }
  .gw-set h1 { margin: 0; font: 600 clamp(22px, 2.2vw, 30px)/1 var(--set-display); letter-spacing: 5px; }
  .gw-set .st-sub { margin-top: 5px; font: 500 12px/1.3 var(--gw-font); color: var(--gw-ink-dim); }

  .gw-set .st-tabs { display: flex; gap: 6px; margin-top: 15px; padding: 6px; border-radius: 14px;
    background: rgba(255,255,255,0.04); border: 1px solid var(--gw-border-soft); flex-wrap: wrap; }
  .gw-set .st-tab { appearance: none; cursor: pointer; flex: 1; min-width: 110px; padding: 10px 14px;
    border-radius: 10px; border: 1.5px solid transparent; background: transparent; color: var(--gw-ink-dim);
    font: 700 12.5px/1 var(--gw-font); display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    transition: color .14s, border-color .14s, background .14s; }
  .gw-set .st-tab:hover { color: var(--gw-ink); background: rgba(255,255,255,0.05); }
  .gw-set .st-tab.on { color: var(--gw-green); border-color: var(--gw-green-line); background: rgba(120,200,80,0.1); }

  .gw-set .st-cols { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 320px;
    gap: clamp(12px, 1.6vw, 24px); margin-top: 14px; }
  .gw-set .st-rows { min-height: 0; overflow-y: auto; scrollbar-width: thin; padding: 2px 14px 10px 2px; }
  .gw-set .st-group { margin-top: 16px; }
  .gw-set .st-group:first-child { margin-top: 2px; }
  .gw-set .st-gtitle { font: 800 11px/1 var(--gw-font); letter-spacing: 1.6px; text-transform: uppercase;
    color: var(--gw-ink-dim); padding-bottom: 8px; }
  .gw-set .st-row { display: flex; align-items: center; gap: 14px; min-height: 52px; padding: 8px 4px;
    border-bottom: 1px solid rgba(255,255,255,0.055); }
  .gw-set .st-row:hover, .gw-set .st-row:focus-within { background: rgba(255,255,255,0.025); }
  .gw-set .st-row .lab { flex: 0 0 220px; font: 700 13px/1.3 var(--gw-font); }
  .gw-set .st-row .lab .fnote { display: block; margin-top: 3px; font: 600 9.5px/1.3 var(--gw-font); color: var(--gw-amber); }
  .gw-set .st-row .ctl { flex: 1; display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
  .gw-set .st-row.future .ctl { opacity: 0.62; }
  .gw-set .st-row .infoval { font: 700 12.5px/1.3 var(--gw-font); color: var(--gw-ink-dim); text-align: right; }

  .gw-set select { appearance: none; cursor: pointer; min-width: 230px; padding: 10px 32px 10px 13px; border-radius: 11px;
    background: rgba(255,255,255,0.06) url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23cfe0cf' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 11px center;
    border: 1px solid var(--gw-border-soft); color: var(--gw-ink); font: 700 12.5px/1 var(--gw-font); }
  .gw-set select:focus-visible { outline: 2px solid var(--gw-green); outline-offset: 2px; }

  .gw-set .st-slider { display: flex; align-items: center; gap: 12px; min-width: 300px; }
  .gw-set .st-slider input[type=range] { appearance: none; width: 210px; height: 6px; border-radius: 999px;
    background: linear-gradient(90deg, #6fbf49 var(--fill, 50%), rgba(255,255,255,0.12) var(--fill, 50%)); outline: none; }
  .gw-set .st-slider input[type=range]::-webkit-slider-thumb { appearance: none; width: 22px; height: 22px;
    border-radius: 50%; background: #101510 url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='13' height='13'%3E%3Cpath fill='%238ce25a' d='M20.3 3.7c.4 0 .7.3.7.7-.1 5.2-1.6 9.3-4.3 12-2.2 2.2-5.1 3.4-8.6 3.7-.9-1.5-1.4-3.2-1.4-4.9 0-6.6 5.4-11.2 13.6-11.5Z'/%3E%3C/svg%3E") center/13px no-repeat;
    border: 2px solid #6fbf49; box-shadow: 0 3px 9px rgba(0,0,0,0.5); cursor: pointer; }
  .gw-set .st-slider .chip { min-width: 56px; text-align: center; padding: 7px 10px; border-radius: 9px;
    background: rgba(255,255,255,0.07); border: 1px solid var(--gw-border-soft);
    font: 800 11.5px/1 var(--gw-font); font-variant-numeric: tabular-nums; }

  .gw-set .st-toggle { appearance: none; cursor: pointer; position: relative; width: 46px; height: 26px;
    border-radius: 999px; border: 1.5px solid var(--gw-border-soft); background: rgba(255,255,255,0.1);
    transition: background .16s, border-color .16s; }
  .gw-set .st-toggle::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px;
    border-radius: 50%; background: #cfd8cf; transition: transform .16s, background .16s; }
  .gw-set .st-toggle.on { background: rgba(120,200,80,0.4); border-color: var(--gw-green-line); }
  .gw-set .st-toggle.on::after { transform: translateX(20px); background: #a5e06b; }
  .gw-set .st-toggle-word { font: 700 12px/1 var(--gw-font); color: var(--gw-ink-dim); min-width: 26px; }

  .gw-set .st-side { min-height: 0; overflow-y: auto; scrollbar-width: thin; display: flex; flex-direction: column; gap: 12px; }
  .gw-set .st-card { border-radius: 16px; border: 1px solid var(--gw-border-soft); background: rgba(255,255,255,0.035); padding: 13px 14px; }
  .gw-set .st-preview { padding: 0; overflow: hidden; }
  .gw-set .st-preview img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; }
  .gw-set .st-ctx-t { font: 800 15px/1.2 var(--gw-font); }
  .gw-set .st-ctx-d { margin-top: 7px; font: 500 12px/1.55 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-set .st-perf .row { display: flex; justify-content: space-between; padding: 5px 0;
    font: 600 12px/1.2 var(--gw-font); color: var(--gw-ink-dim); border-bottom: 1px solid rgba(255,255,255,0.05); }
  .gw-set .st-perf .row:last-child { border-bottom: none; }
  .gw-set .st-perf .row b { color: var(--gw-ink); font-variant-numeric: tabular-nums; }
  .gw-set .st-bigbtn { appearance: none; cursor: pointer; width: 100%; display: flex; align-items: center; gap: 11px;
    padding: 12px 14px; border-radius: 14px; border: 1.5px solid var(--gw-border-soft); background: rgba(255,255,255,0.04);
    color: var(--gw-ink); font-family: var(--gw-font); text-align: left; transition: border-color .14s, background .14s; }
  .gw-set .st-bigbtn:hover { border-color: rgba(255,255,255,0.28); background: rgba(255,255,255,0.07); }
  .gw-set .st-bigbtn .bt { font: 800 13px/1.1 var(--gw-font); }
  .gw-set .st-bigbtn .bs { font: 500 10.5px/1.3 var(--gw-font); color: var(--gw-ink-dim); margin-top: 2px; }

  .gw-set .st-foot { position: relative; z-index: 1; display: flex; align-items: center; gap: 12px;
    width: min(1280px, calc(100vw - 48px)); padding: 12px 6px 16px; }
  .gw-set .st-key { display: inline-flex; align-items: center; gap: 8px; font: 600 12px/1 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-set .st-key kbd { padding: 6px 9px; border-radius: 8px; background: rgba(255,255,255,0.08);
    border: 1px solid var(--gw-border-soft); font: 800 11px/1 var(--gw-font); color: var(--gw-ink); }
  .gw-set .st-foot .sp { flex: 1; }
  .gw-set .st-playtime { display: inline-flex; align-items: center; gap: 8px; padding: 9px 13px; border-radius: 999px;
    background: rgba(12,15,14,0.8); border: 1px solid var(--gw-border-soft); font: 700 12px/1 var(--gw-font); }
  .gw-set .st-playtime span { color: var(--gw-ink-dim); font-weight: 600; }

  .gw-set .st-danger { border-color: rgba(226,105,78,0.45) !important; background: rgba(226,105,78,0.08) !important; }
  .gw-set .st-danger .bt { color: #ffb9a6; }
  .gw-set .st-confirm { display: none; margin-top: 9px; padding: 10px 12px; border-radius: 12px;
    background: rgba(226,105,78,0.1); border: 1px solid rgba(226,105,78,0.4); font: 600 11.5px/1.5 var(--gw-font); }
  .gw-set .st-confirm.on { display: block; }
  .gw-set .st-confirm .btns { display: flex; gap: 8px; margin-top: 9px; }

  body.gw-high-contrast { --gw-ink: #ffffff; --gw-ink-dim: #d9e2d9;
    --gw-border: rgba(255,255,255,0.4); --gw-border-soft: rgba(255,255,255,0.28); }
  body.gw-reduced-motion * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }

  @media (max-width: 1100px) {
    .gw-set .st-cols { grid-template-columns: 1fr; }
    .gw-set .st-side { display: none; }
    .gw-set .st-row .lab { flex-basis: 150px; }
  }
  .gw-set button:focus-visible { outline: 2px solid var(--gw-green); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .gw-set * { transition-duration: 0.01ms !important; } }
  `;
  const tag = document.createElement("style");
  tag.id = "gw-settingsscreen-styles";
  tag.textContent = css;
  document.head.append(tag);
}

function fmtPlaytime(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export class SettingsScreen {
  readonly root: HTMLElement;
  private rowsEl!: HTMLElement;
  private sideEl!: HTMLElement;
  private tabsEl!: HTMLElement;
  private playEl!: HTMLElement;
  private tab: SettingsTabId = "graphics";
  private ctxTitle!: HTMLElement;
  private ctxDesc!: HTMLElement;
  private fpsEl: HTMLElement | null = null;
  private fpsRaf = 0;
  private fpsFrames = 0;
  private fpsT0 = 0;

  constructor(private cb: SettingsScreenCallbacks) {
    ensureGwStyles();
    ensureStyles();
    this.root = el("div", "gw-set");
    const bg = el("div", "st-bg");
    bg.style.backgroundImage = `url("${ASSETS.room.ecocenter}")`;

    const panel = el("div", "st-panel");
    const head = el("div", "st-head");
    const gear = el("div", "st-gear");
    gear.append(gwIcon("sliders", 24, "#f0b64b"));
    const tx = el("div");
    tx.append(el("h1", undefined, "SETTINGS"), el("div", "st-sub", "Customize your eco-center experience"));
    head.append(gwBackPill(() => this.close()), gear, tx);
    this.tabsEl = el("div", "st-tabs");
    const cols = el("div", "st-cols");
    this.rowsEl = el("div", "st-rows");
    this.sideEl = el("div", "st-side");
    cols.append(this.rowsEl, this.sideEl);
    panel.append(head, this.tabsEl, cols);

    const foot = el("div", "st-foot");
    const escKey = el("span", "st-key");
    const escKbd = el("kbd", undefined, "Esc");
    escKey.append(escKbd, document.createTextNode("Back"));
    escKey.style.cursor = "pointer";
    escKey.addEventListener("click", () => this.close());
    const rKey = el("span", "st-key");
    rKey.append(el("kbd", undefined, "R"), document.createTextNode("Reset Tab"));
    rKey.style.cursor = "pointer";
    rKey.addEventListener("click", () => this.resetTab());
    this.playEl = el("span", "st-playtime");
    const apply = el("button", "gw-primary-button");
    apply.append(document.createTextNode("✓ Apply Changes"));
    apply.addEventListener("click", () => {
      this.cb.saveNow();
      this.cb.toast("Settings applied and saved.");
    });
    const sp = el("span", "sp");
    foot.append(this.playEl, sp, escKey, rKey, apply);

    this.root.append(bg, panel, foot);

    window.addEventListener("keydown", (e) => {
      if (!this.open) return;
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        this.close();
      } else if (e.key.toLowerCase() === "r" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
        e.stopImmediatePropagation(); // never leak into habitat hotkeys underneath
        this.resetTab();
      }
    });
  }

  mount(parent: HTMLElement): void {
    parent.append(this.root);
    // Apply persisted body-level prefs on boot (reduced motion, contrast).
    const p = getPrefs();
    document.body.classList.toggle("gw-reduced-motion", p.reducedMotion);
    document.body.classList.toggle("gw-high-contrast", p.highContrast);
  }

  get open(): boolean {
    return this.root.classList.contains("open");
  }

  show(): void {
    this.root.classList.add("open");
    this.render();
    this.startFpsMeter();
  }

  close(): void {
    this.root.classList.remove("open");
    this.stopFpsMeter();
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  private resetTab(): void {
    const keys = tabPrefs(settingsTab(this.tab));
    const patch: Partial<Prefs> = {};
    for (const k of keys) (patch as Record<string, unknown>)[k] = DEFAULT_PREFS[k];
    setPrefs(patch);
    this.render();
    this.cb.toast(`${settingsTab(this.tab).label} settings reset to defaults.`);
  }

  private render(): void {
    this.renderTabs();
    this.renderRows();
    this.renderSide();
    this.playEl.replaceChildren(gwIcon("clock", 13, "#f0b64b"), el("span", undefined, "Playtime"), document.createTextNode(fmtPlaytime(this.cb.playtimeMs())));
  }

  private renderTabs(): void {
    this.tabsEl.replaceChildren();
    for (const t of SETTINGS_TABS) {
      const b = el("button", `st-tab${this.tab === t.id ? " on" : ""}`);
      b.append(gwIcon(t.icon, 15, this.tab === t.id ? "#8ce25a" : "#f0b64b"), document.createTextNode(t.label));
      b.addEventListener("click", () => {
        this.tab = t.id;
        this.render();
      });
      this.tabsEl.append(b);
    }
  }

  private setContext(row: SettingsRow): void {
    this.ctxTitle.textContent = row.label;
    this.ctxDesc.textContent = row.desc + (row.future ? ` ${row.future}` : "");
  }

  private renderRows(): void {
    this.rowsEl.replaceChildren();
    const tab = settingsTab(this.tab);
    for (const g of tab.groups) {
      const group = el("div", "st-group");
      group.append(el("div", "st-gtitle", g.title));
      for (const row of g.rows) group.append(this.buildRow(row));
      this.rowsEl.append(group);
    }
  }

  private buildRow(row: SettingsRow): HTMLElement {
    const r = el("div", `st-row${row.future ? " future" : ""}`);
    const lab = el("div", "lab", row.label);
    if (row.future) lab.append(el("span", "fnote", row.future));
    const ctl = el("div", "ctl");
    r.append(lab, ctl);
    r.addEventListener("pointerenter", () => this.setContext(row));
    r.addEventListener("focusin", () => this.setContext(row));

    const p = getPrefs();
    if (row.kind === "info") {
      ctl.append(el("span", "infoval", row.info ?? "—"));
    } else if (row.kind === "toggle" && row.pref) {
      const on = Boolean(p[row.pref]);
      const word = el("span", "st-toggle-word", on ? "On" : "Off");
      const t = el("button", `st-toggle${on ? " on" : ""}`);
      t.setAttribute("role", "switch");
      t.setAttribute("aria-checked", String(on));
      t.setAttribute("aria-label", row.label);
      t.addEventListener("click", () => {
        const now = !Boolean(getPrefs()[row.pref!]);
        setPrefs({ [row.pref!]: now } as Partial<Prefs>);
        t.classList.toggle("on", now);
        t.setAttribute("aria-checked", String(now));
        word.textContent = now ? "On" : "Off";
      });
      ctl.append(word, t);
    } else if (row.kind === "select" && row.pref) {
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", row.label);
      for (const o of row.options ?? []) {
        const opt = document.createElement("option");
        opt.value = String(o.v);
        opt.textContent = o.label;
        if (p[row.pref] === o.v) opt.selected = true;
        sel.append(opt);
      }
      sel.addEventListener("change", () => {
        const raw = row.options?.find((o) => String(o.v) === sel.value)?.v;
        if (raw !== undefined) setPrefs({ [row.pref!]: raw } as Partial<Prefs>);
      });
      ctl.append(sel);
    } else if (row.kind === "slider" && row.pref) {
      const wrap = el("div", "st-slider");
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(row.min ?? 0);
      input.max = String(row.max ?? 1);
      input.step = String(row.step ?? 0.05);
      input.value = String(p[row.pref]);
      input.setAttribute("aria-label", row.label);
      const chip = el("span", "chip");
      const paint = (): void => {
        const v = Number(input.value);
        const frac = ((v - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
        input.style.setProperty("--fill", `${frac}%`);
        chip.textContent = row.fmt ? row.fmt(v) : String(v);
      };
      paint();
      input.addEventListener("input", () => {
        setPrefs({ [row.pref!]: Number(input.value) } as Partial<Prefs>);
        paint();
      });
      wrap.append(input, chip);
      ctl.append(wrap);
    } else if (row.kind === "action") {
      this.buildActionRow(row, ctl);
    }
    return r;
  }

  private buildActionRow(row: SettingsRow, ctl: HTMLElement): void {
    if (row.action === "display-mode") {
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", "Display Mode");
      for (const [v, label] of [
        ["win", "Windowed"],
        ["full", "Fullscreen"],
      ] as const) {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = label;
        sel.append(opt);
      }
      const sync = (): void => {
        sel.value = document.fullscreenElement ? "full" : "win";
      };
      sync();
      document.addEventListener("fullscreenchange", sync);
      sel.addEventListener("change", () => {
        if (sel.value === "full") {
          void document.documentElement.requestFullscreen?.().catch(() => {
            this.cb.toast("Your browser blocked fullscreen — try its own fullscreen shortcut.");
            sync();
          });
        } else void document.exitFullscreen?.().catch(() => sync());
      });
      ctl.append(sel);
    } else if (row.action === "test-sound") {
      const b = el("button", "gw-ghost-button");
      b.append(gwIcon("speaker", 14), document.createTextNode("Play test chime"));
      b.addEventListener("click", () => sfx.done());
      ctl.append(b);
    } else if (row.action === "save-now") {
      const b = el("button", "gw-ghost-button", "Save now");
      b.addEventListener("click", () => this.cb.saveNow());
      ctl.append(b);
    } else if (row.action === "reset-game") {
      const wrap = el("div");
      wrap.style.cssText = "display:flex; flex-direction:column; align-items:flex-end; flex:1;";
      const b = el("button", "gw-danger-button", "Reset Game…");
      const confirm = el("div", "st-confirm");
      confirm.append(el("span", undefined, "This erases your whole eco-center — habitats, photos, supplies and inventory. Really reset?"));
      const btns = el("div", "btns");
      const no = el("button", "gw-ghost-button", "Cancel");
      const yes = el("button", "gw-danger-button", "Yes, erase everything");
      no.addEventListener("click", () => confirm.classList.remove("on"));
      yes.addEventListener("click", () => {
        confirm.classList.remove("on");
        this.close();
        this.cb.resetGame();
      });
      btns.append(no, yes);
      confirm.append(btns);
      b.addEventListener("click", () => confirm.classList.toggle("on"));
      wrap.append(b, confirm);
      ctl.append(wrap);
    }
  }

  private renderSide(): void {
    this.sideEl.replaceChildren();
    const preview = el("div", "st-card st-preview");
    const img = document.createElement("img");
    img.src = "/assets/ui/habitats/sunstone_desert.jpg";
    img.alt = "Sunstone Desert vivarium";
    img.addEventListener("error", () => preview.remove());
    preview.append(img);

    const ctx = el("div", "st-card");
    this.ctxTitle = el("div", "st-ctx-t", `${settingsTab(this.tab).label} Settings`);
    this.ctxDesc = el(
      "div",
      "st-ctx-d",
      "Hover any row to read what it does. Everything applies instantly and saves with your game.",
    );
    ctx.append(this.ctxTitle, this.ctxDesc);

    const perf = el("div", "st-card st-perf");
    perf.append(el("div", "st-ctx-t", "Performance"));
    const fpsRow = el("div", "row");
    this.fpsEl = el("b", undefined, "—");
    fpsRow.append(el("span", undefined, "Frame rate"), this.fpsEl);
    const dprRow = el("div", "row");
    const dprB = el("b", undefined, `${(window.devicePixelRatio || 1).toFixed(2)}×`);
    dprRow.append(el("span", undefined, "Display density"), dprB);
    const coreRow = el("div", "row");
    coreRow.append(el("span", undefined, "CPU threads"), el("b", undefined, String(navigator.hardwareConcurrency ?? "—")));
    perf.append(fpsRow, dprRow, coreRow);

    const auto = el("button", "st-bigbtn");
    const autoTx = el("div");
    autoTx.append(el("div", "bt", "Auto-Detect"), el("div", "bs", "Pick a preset that fits this device"));
    auto.append(gwIcon("wand", 20, "#f0b64b"), autoTx);
    auto.addEventListener("click", () => {
      const cores = navigator.hardwareConcurrency ?? 4;
      const dpr = window.devicePixelRatio || 1;
      const quality = cores >= 8 ? "high" : cores >= 4 ? "balanced" : "performance";
      const renderScale = quality === "high" ? 1 : quality === "balanced" ? 0.75 : 0.5;
      setPrefs({ quality, renderScale, maxFps: dpr > 2 && cores < 6 ? 60 : 0 });
      this.render();
      this.cb.toast(`Auto-detected the ${quality[0].toUpperCase()}${quality.slice(1)} preset for this device.`);
    });

    const reset = el("button", "st-bigbtn");
    const resetTx = el("div");
    resetTx.append(el("div", "bt", "Reset to Defaults"), el("div", "bs", "Revert every setting on every tab"));
    reset.append(gwIcon("rotate", 20, "#f0b64b"), resetTx);
    reset.addEventListener("click", () => {
      setPrefs({ ...DEFAULT_PREFS });
      this.render();
      this.cb.toast("All settings reverted to their defaults.");
    });

    this.sideEl.append(preview, ctx, perf, auto, reset);
  }

  // ── Live FPS meter (real measurement while the screen is open) ────────────

  private startFpsMeter(): void {
    this.stopFpsMeter();
    this.fpsFrames = 0;
    this.fpsT0 = performance.now();
    const tick = (now: number): void => {
      if (!this.open) return;
      this.fpsFrames++;
      if (now - this.fpsT0 >= 500) {
        const fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsT0));
        if (this.fpsEl) this.fpsEl.textContent = `${fps} fps`;
        this.fpsFrames = 0;
        this.fpsT0 = now;
      }
      this.fpsRaf = requestAnimationFrame(tick);
    };
    this.fpsRaf = requestAnimationFrame(tick);
  }

  private stopFpsMeter(): void {
    if (this.fpsRaf) cancelAnimationFrame(this.fpsRaf);
    this.fpsRaf = 0;
  }
}

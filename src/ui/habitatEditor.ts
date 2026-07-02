/**
 * DECORATE MODE — reference-match pass (Designs/Gecko "03_04_30 PM (4)";
 * map: docs/production/DESIGN_REFERENCE_MAP.md). A cozy game builder, not
 * Blender:
 *
 *  · BOTTOM TRAY — category tabs (sections) + a horizontal carousel of asset
 *    cards with real GLB thumbnails; the armed card glows green with a ✓.
 *  · LEFT TOOL PALETTE — vertical icon cards: Move / Rotate / Scale /
 *    Advanced / Duplicate / Delete / Undo / Redo / Collisions / Focus / Cam.
 *  · FLOATING INSPECTOR — appears right side when a prop is selected:
 *    interaction (colour-coded), height / rotation / scale sliders, actions.
 *  · A reason line + Cancel-Placement pill float above the tray.
 *
 * Placement + gizmo dragging happen in the 3D viewport; this panel is chrome.
 * It talks only to `EditorHandle` (ThreeHabitatEditor) — no Three.js.
 */
import type { CatalogItem, PlacedSummary } from "../render/three/ThreeHabitat";
import type { GizmoMode } from "../render/three/ThreeHabitatEditor";
import type { ObstacleInteraction, PlacementMode } from "../habitats/HabitatTypes";
import { ensureGwStyles, gwEl as el } from "./gwTheme";

/** The subset of the 3D editor this panel drives (ThreeHabitatEditor satisfies it). */
export interface EditorHandle {
  catalog(): CatalogItem[];
  /** Real-model thumbnail (data URL) for a catalog card; null keeps the icon. */
  thumbnail(defId: string): Promise<string | null>;
  readonly armedDefId: string | null;
  readonly armedReason: string | null;
  arm(defId: string): void;
  cancelArm(): void;
  selectedSummary(): PlacedSummary | null;
  readonly mode: GizmoMode;
  setMode(m: GizmoMode): void;
  readonly advancedRotation: boolean;
  readonly uniformScale: boolean;
  setAdvancedAll(on: boolean): void;
  setUniformScale(on: boolean): void;
  beginGesture(): void;
  setSelectedRotationEuler(x: number, y: number, z: number): void;
  setSelectedScaleUniform(s: number): void;
  setSelectedScaleAxis(axis: "x" | "y" | "z", v: number): void;
  setSelectedInteraction(type: ObstacleInteraction): void;
  selectedPlacement(): PlacementMode;
  selectedYRange(): [number, number];
  setSelectedY(v: number): void;
  resetTransform(): void;
  snapToFloor(): void;
  centerSelected(): void;
  duplicateSelected(): void;
  deleteSelected(): void;
  resetLayout(): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  commit(): void;
  toggleCollisionDebug(): boolean;
  collisionDebugVisible(): boolean;
  /** Aim the orbit camera at the selection (or the animal). */
  focusSelected(): void;
  /** Restore the authored camera framing (the vivarium itself never rotates). */
  resetCamera(): void;
  onChange(cb: () => void): void;
  onSelect(cb: (id: string | null) => void): void;
  onGhostReason(cb: (reason: string | null) => void): void;
}

/** Interaction choices — colour dots match the View Collisions overlay. */
const INTERACTION_CHOICES: { key: ObstacleInteraction; label: string; desc: string; color: string }[] = [
  { key: "blocked", label: "Blocked", desc: "The gecko routes around this", color: "#ff5a5a" },
  { key: "climbable", label: "Climb", desc: "The gecko can climb / walk over it", color: "#2dff93" },
  { key: "lowObstacle", label: "Step-over", desc: "A low lip the gecko steps over", color: "#3fd0ff" },
  { key: "hide", label: "Hide", desc: "Shelter the gecko can use", color: "#ffb020" },
  { key: "softObstacle", label: "Soft", desc: "Visual only — no hard block", color: "#9a7bff" },
];

function iconFor(item: CatalogItem): string {
  if (item.id.includes("water")) return "💧";
  if (item.id.includes("food") || item.id.includes("feed")) return "🍽";
  if (item.placement === "hanging") return "🌿";
  switch (item.category) {
    case "rock":
      return "🪨";
    case "hide":
      return "🕳";
    case "branch":
      return "🪵";
    case "plant":
      return "🌵";
    case "dish":
      return "🥣";
    default:
      return "🧱";
  }
}

function placementLabel(p: PlacementMode): string {
  return p === "hanging" ? "hanging" : p === "elevated" ? "elevated" : "floor";
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .gwd { position: fixed; inset: 0; z-index: 6; pointer-events: none; font: 400 14px/1.35 var(--gw-font); color: var(--gw-ink); }
  .gwd.gw-hidden { display: none; }

  /* Left tool palette — a compact 2-column grid below the identity card. */
  .gwd-palette { position: absolute; left: clamp(12px, 1.4vw, 24px); top: clamp(216px, 28vh, 268px);
    display: grid; grid-template-columns: repeat(2, 58px); gap: 6px; padding: 9px; border-radius: 18px; pointer-events: auto;
    background: var(--gw-bg); border: 1px solid var(--gw-border);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); box-shadow: var(--gw-shadow); }
  .gwd-tool { appearance: none; cursor: pointer; width: 58px; padding: 8px 4px 7px; border-radius: 13px;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.035); border: 1.5px solid transparent; color: var(--gw-ink);
    font: 600 9.5px/1 var(--gw-font); transition: background 0.15s, border-color 0.15s; }
  .gwd-tool .ic { font-size: 17px; }
  .gwd-tool:hover { background: rgba(255,255,255,0.09); }
  .gwd-tool.gw-active { border-color: var(--gw-green-line); background: var(--gw-green-soft); color: var(--gw-green); }
  .gwd-tool:disabled { opacity: 0.38; cursor: default; }
  .gwd-sep { grid-column: 1 / -1; height: 1px; margin: 2px 4px; background: rgba(255,255,255,0.09); }

  /* Bottom tray. */
  .gwd-tray { position: absolute; left: 50%; transform: translateX(-50%); bottom: clamp(70px, 9.5vh, 92px);
    width: min(1240px, 96vw); pointer-events: auto; padding: 12px 16px 12px; border-radius: var(--gw-radius);
    background: var(--gw-bg); border: 1px solid var(--gw-border);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); box-shadow: var(--gw-shadow); }
  .gwd-tabs { display: flex; align-items: center; gap: 6px; margin-bottom: 11px; flex-wrap: wrap; }
  .gwd-tab { appearance: none; cursor: pointer; display: inline-flex; align-items: center; gap: 7px;
    padding: 9px 16px; border-radius: 999px; background: rgba(255,255,255,0.04);
    border: 1.5px solid transparent; color: var(--gw-ink-dim); font: 700 12.5px/1 var(--gw-font);
    transition: color 0.15s, background 0.15s, border-color 0.15s; }
  .gwd-tab:hover { color: var(--gw-ink); background: rgba(255,255,255,0.08); }
  .gwd-tab.gw-active { color: var(--gw-green); border-color: var(--gw-green-line); background: var(--gw-green-soft); }
  .gwd-search { margin-left: auto; display: flex; align-items: center; gap: 7px; }
  .gwd-search input { width: clamp(120px, 13vw, 200px); background: rgba(0,0,0,0.3); color: var(--gw-ink);
    border: 1px solid var(--gw-border-soft); border-radius: 999px; padding: 8px 14px; font: 500 12px var(--gw-font); }
  .gwd-search input:focus { outline: none; border-color: var(--gw-green-line); }
  .gwd-cards { display: flex; gap: 10px; overflow-x: auto; padding: 2px 2px 6px; scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.22) transparent; }
  .gwd-cards::-webkit-scrollbar { height: 7px; }
  .gwd-cards::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 4px; }
  .gwd-card { flex: 0 0 118px; }
  .gwd-empty { font: 500 12.5px var(--gw-font); color: var(--gw-ink-dim); padding: 14px 6px; }

  /* Floating messages above the tray. */
  .gwd-reason { position: absolute; left: 50%; transform: translateX(-50%); bottom: clamp(258px, 34vh, 300px);
    padding: 9px 16px; border-radius: 999px; font: 700 12px/1 var(--gw-font); color: #ffcdb8;
    background: rgba(60,22,12,0.88); border: 1px solid rgba(255,120,90,0.5); pointer-events: none;
    box-shadow: 0 10px 28px rgba(0,0,0,0.45); }
  .gwd-reason:empty { display: none; }
  .gwd-cancel { position: absolute; left: 50%; transform: translateX(-50%); bottom: clamp(300px, 40vh, 348px);
    pointer-events: auto; }

  /* Floating inspector (right, under the score card). */
  .gwd-insp { position: absolute; right: clamp(12px, 1.4vw, 24px); top: clamp(238px, 31vh, 286px);
    width: clamp(250px, 20vw, 300px); max-height: calc(100vh - 460px); overflow-y: auto;
    pointer-events: auto; padding: 13px 14px; border-radius: 18px;
    background: var(--gw-bg); border: 1px solid var(--gw-border);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); box-shadow: var(--gw-shadow);
    scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.22) transparent; }
  .gwd-insp.gw-hidden { display: none; }
  .gwd-insp .nm { font: 800 14px/1.2 var(--gw-font); }
  .gwd-insp .tg { font: 500 11px/1.3 var(--gw-font); color: var(--gw-ink-dim); text-transform: capitalize; margin: 2px 0 10px; }
  .gwd-seg { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 7px; }
  .gwd-segb { appearance: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
    color: var(--gw-ink); font: 700 10.5px/1 var(--gw-font); border: 1.5px solid var(--gw-border-soft);
    border-radius: 999px; padding: 6px 10px; background: rgba(255,255,255,0.04); transition: border-color 0.15s, background 0.15s; }
  .gwd-segb .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
  .gwd-segb.gw-active { background: var(--gw-green-soft); border-color: var(--gw-green-line); }
  .gwd-segd { font: 500 10.5px/1.3 var(--gw-font); color: var(--gw-ink-dim); margin: 0 0 9px; min-height: 13px; }
  .gwd-field { display: grid; grid-template-columns: 54px 1fr 44px; align-items: center; gap: 8px; margin-bottom: 7px; }
  .gwd-field.gw-hidden { display: none; }
  .gwd-field label { font: 600 11.5px var(--gw-font); color: var(--gw-ink-dim); }
  .gwd-field input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 5px;
    border-radius: 999px; background: rgba(255,255,255,0.13); outline: none; cursor: pointer; }
  .gwd-field input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;
    width: 15px; height: 15px; border-radius: 50%; background: var(--gw-green); border: 2px solid #17240f; }
  .gwd-field .rd { font: 600 11.5px var(--gw-font); font-variant-numeric: tabular-nums; text-align: right; }
  .gwd-btns { display: flex; gap: 6px; margin-top: 7px; }
  .gwd-btns > * { flex: 1; padding: 9px 6px; font-size: 11.5px; }
  `;
  const tag = document.createElement("style");
  tag.id = "habitat-editor-styles";
  tag.textContent = css;
  document.head.appendChild(tag);
}

interface Field {
  row: HTMLElement;
  input: HTMLInputElement;
  read: HTMLElement;
}

export class HabitatEditorPanel {
  readonly root: HTMLElement;
  private editor: EditorHandle | null = null;
  private onExit: () => void;

  private tabsEl!: HTMLElement;
  private cardsEl!: HTMLElement;
  private searchEl!: HTMLInputElement;
  private reasonEl!: HTMLElement;
  private cancelEl!: HTMLButtonElement;
  private inspEl!: HTMLElement;
  private nmEl!: HTMLElement;
  private tagsEl!: HTMLElement;
  private interBtns = new Map<ObstacleInteraction, HTMLButtonElement>();
  private interDesc!: HTMLElement;
  private posY!: Field;
  private rotX!: Field;
  private rotY!: Field;
  private rotZ!: Field;
  private scaleU!: Field;
  private scaleX!: Field;
  private scaleY!: Field;
  private scaleZ!: Field;
  private toolBtns = new Map<GizmoMode, HTMLButtonElement>();
  private advBtn!: HTMLButtonElement;
  private colBtn!: HTMLButtonElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private dupBtn!: HTMLButtonElement;
  private delBtn!: HTMLButtonElement;
  private cards = new Map<string, HTMLButtonElement>();
  private section = "All";
  private search = "";

  constructor(onExit: () => void) {
    this.onExit = onExit;
    ensureGwStyles();
    injectStyles();
    this.root = el("div", "gwd gw-hidden");
    this.build();
  }

  private build(): void {
    // ── Left tool palette ──
    const palette = el("div", "gwd-palette");
    const mkTool = (icon: string, label: string, title: string, onClick: () => void): HTMLButtonElement => {
      const b = el("button", "gwd-tool") as HTMLButtonElement;
      b.append(el("span", "ic", icon), document.createTextNode(label));
      b.title = title;
      b.addEventListener("click", onClick);
      palette.append(b);
      return b;
    };
    this.toolBtns.set("translate", mkTool("✥", "Move", "Move (W)", () => this.editor?.setMode("translate")));
    this.toolBtns.set("rotate", mkTool("⟳", "Rotate", "Rotate (E)", () => this.editor?.setMode("rotate")));
    this.toolBtns.set("scale", mkTool("⤢", "Scale", "Scale (R)", () => this.editor?.setMode("scale")));
    this.advBtn = mkTool("✦", "Advanced", "Unlock X/Z rotation + per-axis scale + Y move", () =>
      this.editor?.setAdvancedAll(!this.editor.advancedRotation),
    );
    palette.append(el("div", "gwd-sep"));
    this.dupBtn = mkTool("⧉", "Copy", "Duplicate (Ctrl+D)", () => this.editor?.duplicateSelected());
    this.delBtn = mkTool("🗑", "Delete", "Delete (Del)", () => this.editor?.deleteSelected());
    this.undoBtn = mkTool("↶", "Undo", "Undo (Ctrl+Z)", () => this.editor?.undo());
    this.redoBtn = mkTool("↷", "Redo", "Redo (Ctrl+Y)", () => this.editor?.redo());
    palette.append(el("div", "gwd-sep"));
    this.colBtn = mkTool("🔬", "Collide", "View Collisions (C)", () => {
      const on = this.editor?.toggleCollisionDebug() ?? false;
      this.colBtn.classList.toggle("gw-active", on);
    });
    mkTool("🎯", "Focus", "Focus selected / animal (F)", () => this.editor?.focusSelected());
    mkTool("🎥", "Camera", "Reset camera (Home) — the tank never spins", () => this.editor?.resetCamera());

    // ── Bottom tray ──
    const tray = el("div", "gwd-tray");
    this.tabsEl = el("div", "gwd-tabs");
    this.cardsEl = el("div", "gwd-cards");
    tray.append(this.tabsEl, this.cardsEl);

    // ── Floating reason + cancel ──
    this.reasonEl = el("div", "gwd-reason", "");
    this.cancelEl = el("button", "gw-danger-button gwd-cancel gw-hidden", "✕ Cancel placement (Esc)") as HTMLButtonElement;
    this.cancelEl.addEventListener("click", () => {
      this.editor?.cancelArm();
      this.refresh();
    });

    // ── Inspector ──
    this.inspEl = el("div", "gwd-insp gw-hidden");
    this.buildInspector(this.inspEl);

    this.root.append(palette, tray, this.reasonEl, this.cancelEl, this.inspEl);
  }

  private buildInspector(root: HTMLElement): void {
    this.nmEl = el("div", "nm", "");
    this.tagsEl = el("div", "tg", "");
    root.append(this.nmEl, this.tagsEl);

    root.append(el("div", "gw-section-title", "Gecko reacts"));
    const seg = el("div", "gwd-seg");
    for (const c of INTERACTION_CHOICES) {
      const b = el("button", "gwd-segb") as HTMLButtonElement;
      const dot = el("span", "dot");
      dot.style.background = c.color;
      b.append(dot, document.createTextNode(c.label));
      b.title = c.desc;
      b.addEventListener("click", () => {
        this.editor?.setSelectedInteraction(c.key);
        this.interDesc.textContent = c.desc;
        this.refresh();
      });
      this.interBtns.set(c.key, b);
      seg.append(b);
    }
    this.interDesc = el("div", "gwd-segd", "");
    root.append(seg, this.interDesc);

    const rd = () => this.editor?.selectedSummary();
    this.posY = this.field(root, "Height", 0, 1, 0.01, (v) => this.editor?.setSelectedY(v), "m");
    this.rotY = this.field(root, "Rot Y", 0, 359, 1, (v) => this.editor?.setSelectedRotationEuler(rd()?.rotX ?? 0, v, rd()?.rotZ ?? 0), "°");
    this.rotX = this.field(root, "Rot X", 0, 359, 1, (v) => this.editor?.setSelectedRotationEuler(v, rd()?.rotY ?? 0, rd()?.rotZ ?? 0), "°");
    this.rotZ = this.field(root, "Rot Z", 0, 359, 1, (v) => this.editor?.setSelectedRotationEuler(rd()?.rotX ?? 0, rd()?.rotY ?? 0, v), "°");
    this.scaleU = this.field(root, "Scale", 0.05, 8, 0.05, (v) => this.editor?.setSelectedScaleUniform(v), "×");
    this.scaleX = this.field(root, "Scale X", 0.05, 8, 0.05, (v) => this.editor?.setSelectedScaleAxis("x", v), "×");
    this.scaleY = this.field(root, "Scale Y", 0.05, 8, 0.05, (v) => this.editor?.setSelectedScaleAxis("y", v), "×");
    this.scaleZ = this.field(root, "Scale Z", 0.05, 8, 0.05, (v) => this.editor?.setSelectedScaleAxis("z", v), "×");

    const btns1 = el("div", "gwd-btns");
    const rt = el("button", "gw-ghost-button", "⤾ Reset") as HTMLButtonElement;
    rt.addEventListener("click", () => this.editor?.resetTransform());
    const sf = el("button", "gw-ghost-button", "⤓ Floor") as HTMLButtonElement;
    sf.addEventListener("click", () => this.editor?.snapToFloor());
    const ct = el("button", "gw-ghost-button", "⊕ Center") as HTMLButtonElement;
    ct.addEventListener("click", () => this.editor?.centerSelected());
    btns1.append(rt, sf, ct);
    root.append(btns1);
  }

  private field(
    parent: HTMLElement,
    label: string,
    min: number,
    max: number,
    step: number,
    onLive: (v: number) => void,
    unit = "",
  ): Field {
    const row = el("div", "gwd-field");
    row.append(el("label", undefined, label));
    const input = el("input") as HTMLInputElement;
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const read = el("span", "rd", "");
    input.addEventListener("pointerdown", () => this.editor?.beginGesture());
    input.addEventListener("input", () => {
      const v = Number(input.value);
      read.textContent = fmt(v, unit);
      onLive(v);
    });
    input.addEventListener("change", () => this.editor?.commit());
    row.append(input, read);
    parent.append(row);
    return { row, input, read };
  }

  // ── Catalog tray ────────────────────────────────────────────────────────

  private buildTabs(): void {
    if (!this.editor) return;
    this.tabsEl.replaceChildren();
    const sections = ["All"];
    for (const i of this.editor.catalog()) if (!sections.includes(i.section)) sections.push(i.section);
    for (const s of sections) {
      const tab = el("button", "gwd-tab") as HTMLButtonElement;
      tab.append(el("span", undefined, sectionIcon(s)), document.createTextNode(s));
      tab.classList.toggle("gw-active", s === this.section);
      tab.addEventListener("click", () => {
        this.section = s;
        this.buildTabs();
        this.buildCatalog();
      });
      this.tabsEl.append(tab);
    }
    // Search + Done on the right.
    const search = el("div", "gwd-search");
    this.searchEl = el("input") as HTMLInputElement;
    this.searchEl.type = "search";
    this.searchEl.placeholder = "Search…";
    this.searchEl.value = this.search;
    this.searchEl.addEventListener("input", () => {
      this.search = this.searchEl.value.trim().toLowerCase();
      this.buildCatalog();
    });
    const reset = el("button", "gw-ghost-button", "↺ Reset Layout") as HTMLButtonElement;
    reset.style.padding = "9px 13px";
    reset.addEventListener("click", () => this.editor?.resetLayout());
    const done = el("button", "gw-primary-button", "✓ Done") as HTMLButtonElement;
    done.style.padding = "10px 18px";
    done.addEventListener("click", () => this.onExit());
    search.append(this.searchEl, reset, done);
    this.tabsEl.append(search);
  }

  private buildCatalog(): void {
    if (!this.editor) return;
    this.cardsEl.replaceChildren();
    this.cards.clear();
    const items = this.editor
      .catalog()
      .filter((i) => this.section === "All" || i.section === this.section)
      .filter((i) => !this.search || i.label.toLowerCase().includes(this.search) || i.section.toLowerCase().includes(this.search));

    if (items.length === 0) {
      this.cardsEl.append(el("div", "gwd-empty", "No props match — clear the search or pick another category."));
      return;
    }
    for (const item of items) {
      const card = el("button", "gw-item-card gwd-card") as HTMLButtonElement;
      const art = el("span", "art", iconFor(item));
      if (item.hasAsset) {
        void this.editor?.thumbnail(item.id).then((url) => {
          if (!url || !art.isConnected) return;
          const img = document.createElement("img");
          img.src = url;
          img.alt = item.label;
          art.append(img);
        });
      }
      card.append(art, el("span", "nm", item.label), el("span", "ds", `${item.interaction} · ${placementLabel(item.placement)}`), el("span", "check", "✓"));
      card.addEventListener("click", () => {
        const already = this.editor?.armedDefId === item.id;
        if (already) this.editor?.cancelArm();
        else this.editor?.arm(item.id);
        this.refresh();
      });
      this.cards.set(item.id, card);
      this.cardsEl.append(card);
    }
    this.markArmed();
  }

  private markArmed(): void {
    const armed = this.editor?.armedDefId ?? null;
    for (const [id, card] of this.cards) card.classList.toggle("gw-active", id === armed);
    this.cancelEl.classList.toggle("gw-hidden", !armed);
  }

  /** Refresh palette state + armed highlight + undo/redo enablement. */
  refresh(): void {
    if (!this.editor) return;
    for (const [mode, b] of this.toolBtns) b.classList.toggle("gw-active", this.editor.mode === mode);
    this.advBtn.classList.toggle("gw-active", this.editor.advancedRotation);
    this.colBtn.classList.toggle("gw-active", this.editor.collisionDebugVisible());
    this.undoBtn.disabled = !this.editor.canUndo();
    this.redoBtn.disabled = !this.editor.canRedo();
    const hasSel = !!this.editor.selectedSummary();
    this.dupBtn.disabled = !hasSel;
    this.delBtn.disabled = !hasSel;
    this.markArmed();
    this.showSelection();
  }

  showSelection(): void {
    const s = this.editor?.selectedSummary() ?? null;
    if (!s || !this.editor) {
      this.inspEl.classList.add("gw-hidden");
      return;
    }
    this.inspEl.classList.remove("gw-hidden");
    this.nmEl.textContent = s.label;
    this.tagsEl.textContent = `${s.category} · ${placementLabel(s.placement)} · (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`;
    for (const [key, b] of this.interBtns) b.classList.toggle("gw-active", key === s.interaction);
    this.interDesc.textContent = INTERACTION_CHOICES.find((c) => c.key === s.interaction)?.desc ?? "";

    const yMove = this.editor.selectedPlacement() !== "floor" || this.editor.advancedRotation;
    this.posY.row.classList.toggle("gw-hidden", !yMove);
    if (yMove) {
      const [lo, hi] = this.editor.selectedYRange();
      this.posY.input.min = String(lo);
      this.posY.input.max = String(hi);
      setField(this.posY, s.y, "m");
    }

    const adv = this.editor.advancedRotation;
    setField(this.rotY, s.rotY, "°");
    setField(this.rotX, s.rotX, "°");
    setField(this.rotZ, s.rotZ, "°");
    this.rotX.row.classList.toggle("gw-hidden", !adv);
    this.rotZ.row.classList.toggle("gw-hidden", !adv);

    const perAxis = !this.editor.uniformScale;
    const max = adv ? 8 : 3;
    const min = adv ? 0.05 : 0.25;
    for (const f of [this.scaleU, this.scaleX, this.scaleY, this.scaleZ]) {
      f.input.min = String(min);
      f.input.max = String(max);
    }
    setField(this.scaleU, s.scaleX, "×");
    setField(this.scaleX, s.scaleX, "×");
    setField(this.scaleY, s.scaleY, "×");
    setField(this.scaleZ, s.scaleZ, "×");
    this.scaleU.row.classList.toggle("gw-hidden", perAxis);
    this.scaleX.row.classList.toggle("gw-hidden", !perAxis);
    this.scaleY.row.classList.toggle("gw-hidden", !perAxis);
    this.scaleZ.row.classList.toggle("gw-hidden", !perAxis);
  }

  open(editor: EditorHandle): void {
    this.editor = editor;
    this.buildTabs();
    this.buildCatalog();
    editor.onChange(() => this.refresh());
    editor.onSelect(() => this.refresh());
    editor.onGhostReason((reason) => {
      this.reasonEl.textContent = reason ? `⚠ ${reason}` : "";
    });
    this.refresh();
    this.root.classList.remove("gw-hidden");
  }

  close(): void {
    this.root.classList.add("gw-hidden");
    this.reasonEl.textContent = "";
    this.editor = null;
  }

  get isOpen(): boolean {
    return !this.root.classList.contains("gw-hidden");
  }

  /** The live habitat score shows on the main score card now; kept for API compatibility. */
  setScore(_overall: number, _rating: string): void {
    void _overall;
    void _rating;
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }
}

function sectionIcon(section: string): string {
  const s = section.toLowerCase();
  if (s.startsWith("rock")) return "🪨";
  if (s.startsWith("hide") || s.startsWith("cave")) return "🕳";
  if (s.startsWith("branch") || s.startsWith("drift")) return "🪵";
  if (s.startsWith("plant")) return "🌵";
  if (s.startsWith("hang")) return "🌿";
  if (s.startsWith("dish") || s.startsWith("food")) return "🥣";
  return "🧱";
}

function fmt(v: number, unit: string): string {
  if (unit === "°") return `${Math.round(v)}°`;
  if (unit === "m") return `${v.toFixed(2)}m`;
  return `${v.toFixed(2)}${unit}`;
}

function setField(f: Field, value: number, unit: string): void {
  f.input.value = String(value);
  f.read.textContent = fmt(value, unit);
}

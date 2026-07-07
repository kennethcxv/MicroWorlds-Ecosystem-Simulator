/**
 * DECORATE MODE — the habitat-building editor's chrome (reference:
 * Designs/Gecko "03_04_30 PM (4)"; map: docs/production/DESIGN_REFERENCE_MAP.md).
 * A cozy premium builder in the Terrain-editor design language, not Blender:
 *
 *  · BOTTOM TRAY — the five decor category tabs (Plants · Rocks · Caves & Hides ·
 *    Utilities · Decor) + search over a horizontal rail of object cards with real
 *    GLB thumbnails; the armed card glows green with a ✓; locked cards sit dim
 *    with a padlock + reason ("Art in production" / "Future humid habitat").
 *  · LEFT TOOL RAIL — the seven build tools (Place / Move / Rotate / Scale /
 *    Duplicate / Remove / Snap On·Off) + a compact utility row (Advanced, Undo,
 *    Redo, Collisions, Focus, Camera).
 *  · RIGHT DETAIL CARD — the armed object OR the selected placed object: name +
 *    badge, description, tag pills, HABITAT EFFECTS meters, an amber placement-
 *    tip strip, and (for a placed piece) the interaction segment + transform
 *    sliders + quick actions.
 *  · A red invalid-reason pill + an amber pathing-warning pill float above the
 *    tray while placing.
 *
 * Placement + gizmo dragging happen in the 3D viewport; this panel is chrome.
 * It talks only to `EditorHandle` (ThreeHabitatEditor) — no Three.js.
 */
import type { CatalogItem, PlacedSummary } from "../render/three/ThreeHabitat";
import type { GizmoMode } from "../render/three/ThreeHabitatEditor";
import type { ObstacleInteraction, PlacementMode } from "../habitats/HabitatTypes";
import { decorPrice } from "../game/economy";
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
  readonly snapOn: boolean;
  setSnap(on: boolean): void;
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
  onGhostWarning(cb: (warning: string | null) => void): void;
}

/** Interaction choices — colour dots match the View Collisions overlay. */
const INTERACTION_CHOICES: { key: ObstacleInteraction; label: string; desc: string; color: string }[] = [
  { key: "blocked", label: "Blocked", desc: "The gecko routes around this", color: "#ff5a5a" },
  { key: "climbable", label: "Climb", desc: "The gecko can climb / walk over it", color: "#2dff93" },
  { key: "lowObstacle", label: "Step-over", desc: "A low lip the gecko steps over", color: "#3fd0ff" },
  { key: "hide", label: "Hide", desc: "Shelter the gecko can use", color: "#ffb020" },
  { key: "softObstacle", label: "Soft", desc: "Visual only — no hard block", color: "#9a7bff" },
];

const INTERACTION_WORD: Record<string, string> = {
  blocked: "Routes around",
  climbable: "Climbable",
  lowObstacle: "Step-over",
  hide: "Shelter",
  softObstacle: "Soft (no block)",
  wall: "Wall",
  feederZone: "Feeding zone",
};

function sectionIcon(section: string): string {
  const s = section.toLowerCase();
  if (s.startsWith("plant")) return "🌵";
  if (s.startsWith("rock")) return "🪨";
  if (s.startsWith("cave") || s.startsWith("hide")) return "🕳";
  if (s.startsWith("util")) return "💧";
  return "🪵";
}

function iconFor(item: CatalogItem): string {
  if (item.id.includes("water") || item.id.includes("humid")) return "💧";
  if (item.id.includes("gauge")) return "🌡";
  if (item.id.includes("food") || item.id.includes("feed")) return "🍽";
  if (item.id.includes("grass")) return "🌾";
  if (item.id.includes("fern")) return "🌿";
  if (item.id.includes("skull")) return "💀";
  if (item.id.includes("sign")) return "🪧";
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

  /* ── Left tool rail — the 7 build tools + a compact utility grid. ── */
  .gwd-palette { position: absolute; left: clamp(12px, 1.4vw, 24px); top: clamp(188px, 24vh, 240px);
    width: 148px; max-height: calc(100vh - 556px); overflow-y: auto; scrollbar-width: none;
    display: flex; flex-direction: column; gap: 4px; padding: 9px; border-radius: 18px; pointer-events: auto;
    background: var(--gw-bg); border: 1px solid var(--gw-border);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); box-shadow: var(--gw-shadow); }
  .gwd-palette::-webkit-scrollbar { display: none; }
  .gwd-rail-title { font: 800 9.5px/1 var(--gw-font); letter-spacing: 0.12em; color: var(--gw-ink-dim);
    text-transform: uppercase; margin: 2px 2px 3px; }
  .gwd-tool { appearance: none; cursor: pointer; width: 100%; padding: 6px 10px; border-radius: 11px;
    display: flex; align-items: center; gap: 9px; text-align: left;
    background: rgba(255,255,255,0.035); border: 1.5px solid transparent; color: var(--gw-ink);
    font: 700 11.5px/1 var(--gw-font); transition: background 0.15s, border-color 0.15s; }
  .gwd-tool .ic { font-size: 15px; width: 18px; text-align: center; flex: 0 0 auto; }
  .gwd-tool .sub { margin-left: auto; font: 700 9.5px/1 var(--gw-font); color: var(--gw-ink-dim); }
  .gwd-tool:hover { background: rgba(255,255,255,0.09); }
  .gwd-tool.gw-active { border-color: var(--gw-green-line); background: var(--gw-green-soft); color: var(--gw-green); }
  .gwd-tool.gw-active .sub { color: var(--gw-green); }
  .gwd-tool:disabled { opacity: 0.38; cursor: default; }
  .gwd-sep { height: 1px; margin: 4px 2px; background: rgba(255,255,255,0.09); flex: 0 0 auto; }
  .gwd-minis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
  .gwd-mini { appearance: none; cursor: pointer; padding: 7px 2px 6px; border-radius: 10px;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    background: rgba(255,255,255,0.035); border: 1.5px solid transparent; color: var(--gw-ink);
    font: 600 8.5px/1 var(--gw-font); transition: background 0.15s, border-color 0.15s; }
  .gwd-mini .ic { font-size: 13px; }
  .gwd-mini:hover { background: rgba(255,255,255,0.09); }
  .gwd-mini.gw-active { border-color: var(--gw-green-line); background: var(--gw-green-soft); color: var(--gw-green); }
  .gwd-mini:disabled { opacity: 0.38; cursor: default; }

  /* ── Bottom tray — blocky grouped panel, flush to the bottom edge. ── */
  .gwd-tray { position: absolute; left: 50%; transform: translateX(-50%); bottom: 0;
    width: min(1560px, 98vw); pointer-events: auto;
    padding: 13px 20px calc(12px + env(safe-area-inset-bottom, 0px));
    border-radius: var(--gw-radius) var(--gw-radius) 0 0; border-bottom: none;
    background: var(--gw-bg); border: 1px solid var(--gw-border);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); box-shadow: var(--gw-shadow); }
  .gwd-tabs { display: flex; align-items: center; gap: 0; margin-bottom: 12px; flex-wrap: wrap; }
  .gwd-modechip { display: inline-flex; align-items: center; gap: 8px; margin-right: 14px;
    padding: 10px 16px; border-radius: 12px; background: var(--gw-green-soft);
    border: 1px solid var(--gw-green-line); color: var(--gw-green); font: 800 13px/1 var(--gw-font); }
  .gwd-tab { appearance: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
    padding: 11px 20px; min-width: 108px; justify-content: center; border-radius: 0;
    background: rgba(255,255,255,0.035); border: 1px solid var(--gw-border-soft);
    color: var(--gw-ink-dim); font: 700 12.5px/1 var(--gw-font);
    transition: color 0.15s, background 0.15s, border-color 0.15s; }
  .gwd-tab + .gwd-tab { border-left: none; }
  .gwd-tab:first-of-type { border-radius: 12px 0 0 12px; }
  .gwd-tab:last-of-type { border-radius: 0 12px 12px 0; }
  .gwd-tab:hover { color: var(--gw-ink); background: rgba(255,255,255,0.08); }
  .gwd-tab.gw-active { color: var(--gw-green); background: var(--gw-green-soft);
    box-shadow: inset 0 -3px 0 var(--gw-green-line); }
  .gwd-search { margin-left: auto; display: flex; align-items: center; gap: 7px; }
  .gwd-search input { width: clamp(110px, 12vw, 190px); background: rgba(0,0,0,0.3); color: var(--gw-ink);
    border: 1px solid var(--gw-border-soft); border-radius: 999px; padding: 8px 14px; font: 500 12px var(--gw-font); }
  .gwd-search input:focus { outline: none; border-color: var(--gw-green-line); }
  .gwd-cards { display: flex; gap: 10px; overflow-x: auto; padding: 2px 2px 6px; scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.22) transparent; }
  .gwd-cards::-webkit-scrollbar { height: 7px; }
  .gwd-cards::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 4px; }
  .gwd-card { flex: 0 0 132px; position: relative; }
  .gwd-card .cat { position: absolute; top: 6px; left: 8px; font-size: 11px; opacity: 0.75; }
  .gwd-card .tagchip { position: absolute; top: 5px; right: 7px; font: 700 8.5px/1 var(--gw-font);
    color: var(--gw-ink-dim); background: rgba(0,0,0,0.42); border: 1px solid var(--gw-border-soft);
    border-radius: 999px; padding: 3px 7px; }
  .gwd-card.gw-locked { opacity: 0.55; }
  .gwd-card.gw-locked .art { filter: grayscale(0.7); }
  .gwd-card.gw-locked .check { display: none !important; }
  .gwd-card .lock { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center;
    justify-content: center; gap: 4px; border-radius: inherit; background: rgba(8,10,9,0.45);
    font: 700 9.5px/1.2 var(--gw-font); color: #d8d4c8; text-align: center; padding: 6px; }
  .gwd-card.gw-locked .lock { display: flex; }
  .gwd-card .lock .pad { font-size: 15px; }
  .gwd-empty { font: 500 12.5px var(--gw-font); color: var(--gw-ink-dim); padding: 14px 6px; }
  .gwd-price { color: var(--gw-green) !important; font-weight: 800 !important; }
  .gwd-hint { margin-top: 6px; font: 500 10.5px/1.3 var(--gw-font); color: var(--gw-ink-dim); text-align: center; }

  /* ── Floating messages above the tray. ── */
  .gwd-reason { position: absolute; left: 50%; transform: translateX(-50%); bottom: clamp(262px, 34vh, 306px);
    padding: 9px 16px; border-radius: 999px; font: 700 12px/1 var(--gw-font); color: #ffcdb8;
    background: rgba(60,22,12,0.88); border: 1px solid rgba(255,120,90,0.5); pointer-events: none;
    box-shadow: 0 10px 28px rgba(0,0,0,0.45); }
  .gwd-reason.warn { color: #ffe2ae; background: rgba(58,42,10,0.88); border-color: rgba(240,182,75,0.55); }
  .gwd-reason:empty { display: none; }
  .gwd-cancel { position: absolute; left: 50%; transform: translateX(-50%); bottom: clamp(306px, 40vh, 354px);
    pointer-events: auto; }

  /* ── Right detail card (armed object OR placed selection). ── */
  /* Max-height keeps the card's bottom CLEAR of the tray (Done stays clickable). */
  .gwd-insp { position: absolute; right: clamp(12px, 1.4vw, 24px); top: clamp(188px, 24vh, 240px);
    width: clamp(262px, 21vw, 312px); max-height: max(220px, calc(100vh - 588px)); overflow-y: auto;
    pointer-events: auto; padding: 13px 14px; border-radius: 18px;
    background: var(--gw-bg); border: 1px solid var(--gw-border);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); box-shadow: var(--gw-shadow);
    scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.22) transparent; }
  .gwd-insp.gw-hidden { display: none; }
  .gwd-head { display: flex; align-items: center; gap: 8px; }
  .gwd-head .nm { font: 800 14.5px/1.2 var(--gw-font); }
  .gwd-badge { margin-left: auto; flex: 0 0 auto; font: 800 9px/1 var(--gw-font); letter-spacing: 0.08em;
    padding: 4px 8px; border-radius: 999px; color: var(--gw-green);
    background: var(--gw-green-soft); border: 1px solid var(--gw-green-line); }
  .gwd-badge.lockb { color: #d8d4c8; background: rgba(255,255,255,0.06); border-color: var(--gw-border-soft); }
  .gwd-desc { font: 500 11.5px/1.45 var(--gw-font); color: var(--gw-ink-dim); margin: 6px 0 8px; }
  .gwd-pills { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 9px; }
  .gwd-pill { font: 700 9.5px/1 var(--gw-font); color: var(--gw-ink); padding: 4px 9px;
    border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid var(--gw-border-soft); }
  .gwd-pill.beh { color: #9adcff; border-color: rgba(120,190,255,0.3); }
  .gwd-priceline { display: flex; align-items: center; gap: 6px; margin-bottom: 9px;
    font: 800 12px/1 var(--gw-font); color: var(--gw-green); }
  .gwd-fx { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 10px; margin-bottom: 9px; }
  .gwd-fxrow { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 6px; }
  .gwd-fxrow .lb { grid-column: 1 / -1; font: 600 9.5px/1 var(--gw-font); color: var(--gw-ink-dim); margin-bottom: 2px; }
  .gwd-fxbar { height: 4px; border-radius: 999px; background: rgba(255,255,255,0.12); overflow: hidden; }
  .gwd-fxbar > span { display: block; height: 100%; border-radius: 999px; background: var(--gw-green); }
  .gwd-fxbar.amber > span { background: #f0b64b; }
  .gwd-fxrow .vl { font: 700 9.5px/1 var(--gw-font); color: var(--gw-ink-dim); font-variant-numeric: tabular-nums; }
  .gwd-tip { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: 12px;
    background: rgba(58,42,10,0.5); border: 1px solid rgba(240,182,75,0.32);
    font: 500 10.5px/1.4 var(--gw-font); color: #ffe2ae; margin-bottom: 9px; }
  .gwd-tip .ti { flex: 0 0 auto; }
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
  // Detail-card nodes.
  private headIcon!: HTMLElement;
  private nmEl!: HTMLElement;
  private badgeEl!: HTMLElement;
  private descEl!: HTMLElement;
  private pillsEl!: HTMLElement;
  private priceEl!: HTMLElement;
  private fxEl!: HTMLElement;
  private tipEl!: HTMLElement;
  private tipTx!: HTMLElement;
  private editBits!: HTMLElement; // interaction + sliders + actions (placed only)
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
  // Tool rail.
  private placeBtn!: HTMLButtonElement;
  private toolBtns = new Map<GizmoMode, HTMLButtonElement>();
  private snapBtn!: HTMLButtonElement;
  private snapSub!: HTMLElement;
  private advBtn!: HTMLButtonElement;
  private colBtn!: HTMLButtonElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private dupBtn!: HTMLButtonElement;
  private delBtn!: HTMLButtonElement;
  private cards = new Map<string, HTMLButtonElement>();
  private section = "Plants";
  private search = "";
  /** Last card the player armed — the Place tool re-arms it. */
  private lastArmed: string | null = null;
  /** Card currently shown in the detail panel (armed or locked-preview). */
  private detailDefId: string | null = null;

  constructor(onExit: () => void) {
    this.onExit = onExit;
    ensureGwStyles();
    injectStyles();
    this.root = el("div", "gwd gw-hidden");
    this.build();
  }

  private build(): void {
    // ── Left tool rail ──
    const palette = el("div", "gwd-palette");
    palette.append(el("div", "gwd-rail-title", "Build Tools"));
    const mkTool = (icon: string, label: string, title: string, onClick: () => void, sub?: string): HTMLButtonElement => {
      const b = el("button", "gwd-tool") as HTMLButtonElement;
      b.append(el("span", "ic", icon), document.createTextNode(label));
      if (sub) b.append(el("span", "sub", sub));
      b.title = title;
      b.addEventListener("click", onClick);
      palette.append(b);
      return b;
    };
    this.placeBtn = mkTool("⊕", "Place", "Pick an object card, then click the sand", () => this.togglePlace());
    this.toolBtns.set("translate", mkTool("✥", "Move", "Move the selected object (W)", () => this.editor?.setMode("translate"), "W"));
    this.toolBtns.set("rotate", mkTool("⟳", "Rotate", "Rotate the selected object (E)", () => this.editor?.setMode("rotate"), "E"));
    this.toolBtns.set("scale", mkTool("⤢", "Scale", "Scale the selected object (R)", () => this.editor?.setMode("scale"), "R"));
    this.dupBtn = mkTool("⧉", "Duplicate", "Duplicate the selection (Ctrl+D)", () => this.editor?.duplicateSelected());
    this.delBtn = mkTool("🗑", "Remove", "Delete the selection (Del)", () => this.editor?.deleteSelected());
    this.snapBtn = mkTool("⌗", "Snap", "Snap to a 10 cm grid + 15° turns (hold Ctrl to invert)", () => {
      this.editor?.setSnap(!this.editor.snapOn);
    });
    this.snapSub = el("span", "sub", "Off");
    this.snapBtn.append(this.snapSub);

    palette.append(el("div", "gwd-sep"));
    const minis = el("div", "gwd-minis");
    const mkMini = (icon: string, label: string, title: string, onClick: () => void): HTMLButtonElement => {
      const b = el("button", "gwd-mini") as HTMLButtonElement;
      b.append(el("span", "ic", icon), document.createTextNode(label));
      b.title = title;
      b.addEventListener("click", onClick);
      minis.append(b);
      return b;
    };
    this.advBtn = mkMini("✦", "Advanced", "Unlock X/Z rotation + per-axis scale + Y move", () =>
      this.editor?.setAdvancedAll(!this.editor.advancedRotation),
    );
    this.undoBtn = mkMini("↶", "Undo", "Undo (Ctrl+Z)", () => this.editor?.undo());
    this.redoBtn = mkMini("↷", "Redo", "Redo (Ctrl+Y)", () => this.editor?.redo());
    this.colBtn = mkMini("🔬", "Collide", "View Collisions (C)", () => {
      const on = this.editor?.toggleCollisionDebug() ?? false;
      this.colBtn.classList.toggle("gw-active", on);
    });
    mkMini("🎯", "Focus", "Focus selected / animal (F)", () => this.editor?.focusSelected());
    mkMini("🎥", "Camera", "Reset camera (Home) — the tank never spins", () => this.editor?.resetCamera());
    palette.append(minis);

    // ── Bottom tray ──
    const tray = el("div", "gwd-tray");
    this.tabsEl = el("div", "gwd-tabs");
    this.cardsEl = el("div", "gwd-cards");
    tray.append(
      this.tabsEl,
      this.cardsEl,
      el("div", "gwd-hint", "Click a card, then click the sand to place · mouse wheel rotates the preview · Esc cancels"),
    );

    // ── Floating reason / warning + cancel ──
    this.reasonEl = el("div", "gwd-reason", "");
    this.cancelEl = el("button", "gw-danger-button gwd-cancel gw-hidden", "✕ Cancel placement (Esc)") as HTMLButtonElement;
    this.cancelEl.addEventListener("click", () => {
      this.editor?.cancelArm();
      this.refresh();
    });

    // ── Detail card ──
    this.inspEl = el("div", "gwd-insp gw-hidden");
    this.buildDetail(this.inspEl);

    this.root.append(palette, tray, this.reasonEl, this.cancelEl, this.inspEl);
  }

  /** The Place tool: re-arm the last card (or the current category's first). */
  private togglePlace(): void {
    if (!this.editor) return;
    if (this.editor.armedDefId) {
      this.editor.cancelArm();
    } else {
      const items = this.editor.catalog().filter((i) => !i.locked);
      const pick = items.find((i) => i.id === this.lastArmed) ?? items.find((i) => i.section === this.section) ?? items[0];
      if (pick) this.editor.arm(pick.id);
    }
    this.refresh();
  }

  private buildDetail(root: HTMLElement): void {
    const head = el("div", "gwd-head");
    this.headIcon = el("span", undefined, "");
    this.nmEl = el("span", "nm", "");
    this.badgeEl = el("span", "gwd-badge", "");
    head.append(this.headIcon, this.nmEl, this.badgeEl);
    this.descEl = el("div", "gwd-desc", "");
    this.pillsEl = el("div", "gwd-pills");
    this.priceEl = el("div", "gwd-priceline", "");
    root.append(head, this.descEl, this.pillsEl, this.priceEl);

    root.append(el("div", "gw-section-title", "Habitat effects"));
    this.fxEl = el("div", "gwd-fx");
    root.append(this.fxEl);

    this.tipEl = el("div", "gwd-tip");
    this.tipTx = el("span", undefined, "");
    this.tipEl.append(el("span", "ti", "💡"), this.tipTx);
    root.append(this.tipEl);

    // ── Placed-selection editing bits (hidden while previewing a card) ──
    this.editBits = el("div");
    this.editBits.append(el("div", "gw-section-title", "Gecko reacts"));
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
    this.editBits.append(seg, this.interDesc);

    const rd = () => this.editor?.selectedSummary();
    this.posY = this.field(this.editBits, "Height", 0, 1, 0.01, (v) => this.editor?.setSelectedY(v), "m");
    this.rotY = this.field(this.editBits, "Rot Y", 0, 359, 1, (v) => this.editor?.setSelectedRotationEuler(rd()?.rotX ?? 0, v, rd()?.rotZ ?? 0), "°");
    this.rotX = this.field(this.editBits, "Rot X", 0, 359, 1, (v) => this.editor?.setSelectedRotationEuler(v, rd()?.rotY ?? 0, rd()?.rotZ ?? 0), "°");
    this.rotZ = this.field(this.editBits, "Rot Z", 0, 359, 1, (v) => this.editor?.setSelectedRotationEuler(rd()?.rotX ?? 0, rd()?.rotY ?? 0, v), "°");
    this.scaleU = this.field(this.editBits, "Scale", 0.05, 8, 0.05, (v) => this.editor?.setSelectedScaleUniform(v), "×");
    this.scaleX = this.field(this.editBits, "Scale X", 0.05, 8, 0.05, (v) => this.editor?.setSelectedScaleAxis("x", v), "×");
    this.scaleY = this.field(this.editBits, "Scale Y", 0.05, 8, 0.05, (v) => this.editor?.setSelectedScaleAxis("y", v), "×");
    this.scaleZ = this.field(this.editBits, "Scale Z", 0.05, 8, 0.05, (v) => this.editor?.setSelectedScaleAxis("z", v), "×");

    const btns1 = el("div", "gwd-btns");
    const rt = el("button", "gw-ghost-button", "⤾ Reset") as HTMLButtonElement;
    rt.addEventListener("click", () => this.editor?.resetTransform());
    const sf = el("button", "gw-ghost-button", "⤓ Floor") as HTMLButtonElement;
    sf.addEventListener("click", () => this.editor?.snapToFloor());
    const ct = el("button", "gw-ghost-button", "⊕ Center") as HTMLButtonElement;
    ct.addEventListener("click", () => this.editor?.centerSelected());
    btns1.append(rt, sf, ct);
    this.editBits.append(btns1);
    root.append(this.editBits);
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
    this.tabsEl.append(el("span", "gwd-modechip", "🪴 Decorate"));
    const sections: string[] = [];
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
    // Search + Reset + Done on the right.
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

  private matchesSearch(i: CatalogItem): boolean {
    if (!this.search) return true;
    const q = this.search;
    return (
      i.label.toLowerCase().includes(q) ||
      i.section.toLowerCase().includes(q) ||
      i.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  private buildCatalog(): void {
    if (!this.editor) return;
    this.cardsEl.replaceChildren();
    this.cards.clear();
    // Searching looks across EVERY category; browsing shows the active tab.
    const items = this.editor
      .catalog()
      .filter((i) => (this.search ? true : i.section === this.section))
      .filter((i) => this.matchesSearch(i));

    if (items.length === 0) {
      this.cardsEl.append(el("div", "gwd-empty", "No pieces match — clear the search or pick another category."));
      return;
    }
    for (const item of items) {
      const card = el("button", "gw-item-card gwd-card") as HTMLButtonElement;
      if (item.locked) card.classList.add("gw-locked");
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
      const price = decorPrice(item.id);
      card.append(
        el("span", "cat", sectionIcon(item.section)),
        item.tags[0] ? el("span", "tagchip", item.tags[0]) : el("span"),
        art,
        el("span", "nm", item.label),
        el("span", "ds", INTERACTION_WORD[item.interaction] ?? item.interaction),
        el("span", "ds gwd-price", price > 0 ? `${price} 🍃` : "Free"),
        el("span", "check", "✓"),
      );
      if (item.locked) {
        const lock = el("span", "lock");
        lock.append(el("span", "pad", "🔒"), el("span", undefined, item.locked));
        card.append(lock);
        card.title = `${item.label} — ${item.locked}`;
      }
      card.addEventListener("click", () => {
        if (item.locked) {
          // Locked pieces can't arm, but the detail card still previews them.
          this.editor?.cancelArm();
          this.detailDefId = item.id;
          this.refresh();
          return;
        }
        const already = this.editor?.armedDefId === item.id;
        if (already) this.editor?.cancelArm();
        else {
          this.editor?.arm(item.id);
          this.lastArmed = item.id;
        }
        this.detailDefId = already ? null : item.id;
        this.refresh();
      });
      this.cards.set(item.id, card);
      this.cardsEl.append(card);
    }
    this.markArmed();
  }

  private markArmed(): void {
    const armed = this.editor?.armedDefId ?? null;
    for (const [id, card] of this.cards) {
      card.classList.toggle("gw-active", id === armed || (!armed && id === this.detailDefId && !!this.editor?.catalog().find((i) => i.id === id)?.locked));
    }
    this.cancelEl.classList.toggle("gw-hidden", !armed);
  }

  /** Refresh rail state + armed highlight + undo/redo enablement + detail card. */
  refresh(): void {
    if (!this.editor) return;
    const hasSel = !!this.editor.selectedSummary();
    const armed = !!this.editor.armedDefId;
    this.placeBtn.classList.toggle("gw-active", armed);
    for (const [mode, b] of this.toolBtns) {
      b.classList.toggle("gw-active", !armed && hasSel && this.editor.mode === mode);
      b.disabled = !hasSel;
    }
    this.snapBtn.classList.toggle("gw-active", this.editor.snapOn);
    this.snapSub.textContent = this.editor.snapOn ? "On" : "Off";
    this.advBtn.classList.toggle("gw-active", this.editor.advancedRotation);
    this.colBtn.classList.toggle("gw-active", this.editor.collisionDebugVisible());
    this.undoBtn.disabled = !this.editor.canUndo();
    this.redoBtn.disabled = !this.editor.canRedo();
    this.dupBtn.disabled = !hasSel;
    this.delBtn.disabled = !hasSel;
    this.markArmed();
    this.showDetail();
  }

  /** Arm a piece from OUTSIDE the editor (the Inventory's "Place in Habitat"):
   *  jump to its category tab, arm it and show its detail card — exactly as if
   *  the player had clicked that catalog card. */
  armExternal(defId: string): boolean {
    if (!this.editor) return false;
    const item = this.editor.catalog().find((i) => i.id === defId);
    if (!item || item.locked) return false;
    this.search = "";
    this.section = item.section;
    this.editor.arm(defId);
    this.lastArmed = defId;
    this.detailDefId = defId;
    this.buildTabs();
    this.buildCatalog();
    this.refresh();
    return true;
  }

  // ── Detail card (armed catalog item OR placed selection) ─────────────────

  private itemById(defId: string | null | undefined): CatalogItem | null {
    if (!defId || !this.editor) return null;
    return this.editor.catalog().find((i) => i.id === defId) ?? null;
  }

  private renderEffects(item: CatalogItem): void {
    this.fxEl.replaceChildren();
    const live = item.effects.filter((e) => e.v > 0);
    if (live.length === 0) {
      this.fxEl.append(el("div", "gwd-segd", "Pure set dressing — no measurable effects."));
      return;
    }
    for (const e of live) {
      const row = el("div", "gwd-fxrow");
      row.append(el("span", "lb", e.label));
      const bar = el("div", `gwd-fxbar${e.key === "cleanup" ? " amber" : ""}`);
      const fill = el("span");
      fill.style.width = `${Math.round((e.v / 10) * 100)}%`;
      bar.append(fill);
      row.append(bar, el("span", "vl", `${e.v}`));
      this.fxEl.append(row);
    }
  }

  private showDetail(): void {
    const s = this.editor?.selectedSummary() ?? null;
    const armedId = this.editor?.armedDefId ?? null;
    const previewId = armedId ?? (s ? null : this.detailDefId);
    const item = this.itemById(s ? s.defId : previewId);

    if (!s && !item) {
      this.inspEl.classList.add("gw-hidden");
      return;
    }
    this.inspEl.classList.remove("gw-hidden");

    // Header + copy come from the catalog def when we have one.
    const label = s ? s.label : (item?.label ?? "");
    this.headIcon.textContent = item ? iconFor(item) : "🧱";
    this.nmEl.textContent = label;
    if (s) {
      this.badgeEl.textContent = "SELECTED";
      this.badgeEl.classList.remove("lockb");
    } else if (item?.locked) {
      this.badgeEl.textContent = "🔒 LOCKED";
      this.badgeEl.classList.add("lockb");
    } else {
      this.badgeEl.textContent = "PLACING";
      this.badgeEl.classList.remove("lockb");
    }
    this.descEl.textContent = item?.desc ?? "";
    this.descEl.style.display = item?.desc ? "" : "none";

    // Tag pills + behaviour + placement mode.
    this.pillsEl.replaceChildren();
    if (item) {
      for (const t of item.tags) this.pillsEl.append(el("span", "gwd-pill", t));
      const inter = s ? s.interaction : item.interaction;
      this.pillsEl.append(el("span", "gwd-pill beh", INTERACTION_WORD[inter] ?? inter));
      const pm = s ? s.placement : item.placement;
      if (pm !== "floor") this.pillsEl.append(el("span", "gwd-pill", placementLabel(pm)));
    }

    // Price (armed/locked preview only — a placed piece is already paid for).
    if (!s && item) {
      const price = decorPrice(item.id);
      this.priceEl.textContent = price > 0 ? `${price} 🍃 to place` : "Free to place";
      this.priceEl.style.display = "";
    } else {
      this.priceEl.style.display = "none";
    }

    if (item) this.renderEffects(item);
    else this.fxEl.replaceChildren();
    this.tipTx.textContent = item?.tip ?? "";
    this.tipEl.style.display = item?.tip ? "" : "none";

    // Editing bits only for a real selection.
    this.editBits.style.display = s ? "" : "none";
    if (!s || !this.editor) return;

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

  /** Kept for API compatibility with older callers. */
  showSelection(): void {
    this.showDetail();
  }

  open(editor: EditorHandle): void {
    this.editor = editor;
    this.detailDefId = null;
    this.buildTabs();
    this.buildCatalog();
    editor.onChange(() => this.refresh());
    editor.onSelect(() => this.refresh());
    editor.onGhostReason((reason) => {
      if (reason) {
        this.reasonEl.textContent = `⚠ ${reason}`;
        this.reasonEl.classList.remove("warn");
      } else if (!this.reasonEl.classList.contains("warn")) {
        this.reasonEl.textContent = "";
      }
    });
    editor.onGhostWarning((warning) => {
      // Soft advisory (drop still allowed) — amber, never overrides a red reason.
      if (warning) {
        this.reasonEl.textContent = `⚠ ${warning}`;
        this.reasonEl.classList.add("warn");
      } else if (this.reasonEl.classList.contains("warn")) {
        this.reasonEl.classList.remove("warn");
        this.reasonEl.textContent = "";
      }
    });
    this.refresh();
    this.root.classList.remove("gw-hidden");
  }

  close(): void {
    this.root.classList.add("gw-hidden");
    this.reasonEl.textContent = "";
    this.reasonEl.classList.remove("warn");
    this.detailDefId = null;
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

function fmt(v: number, unit: string): string {
  if (unit === "°") return `${Math.round(v)}°`;
  if (unit === "m") return `${v.toFixed(2)}m`;
  return `${v.toFixed(2)}${unit}`;
}

function setField(f: Field, value: number, unit: string): void {
  f.input.value = String(value);
  f.read.textContent = fmt(value, unit);
}

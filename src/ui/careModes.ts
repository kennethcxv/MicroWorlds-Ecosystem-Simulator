/**
 * The H shortcuts overlay — one sheet listing every key in the lizard habitat.
 * (The interactive Clean / Feed / Terrain drawers live in src/ui/gwDrawers.ts;
 * the reference-match HUD in src/ui/lizardHud.ts.)
 */
import { ensureGwStyles, gwEl as el } from "./gwTheme";

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .help-sheet { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center;
    background: rgba(4,7,4,0.55); backdrop-filter: blur(4px); }
  .help-sheet.hidden { display: none; }
  .help-card { width: min(560px, 92vw); max-height: 82vh; overflow: auto; border-radius: 18px; padding: 18px 20px;
    background: var(--gw-bg, rgba(13,14,12,0.94)); border: 1px solid var(--gw-border, rgba(255,255,255,0.08));
    color: var(--gw-ink, #f2f4ec); box-shadow: 0 18px 60px rgba(0,0,0,0.55);
    font: 500 13px/1.5 var(--gw-font, system-ui, sans-serif); }
  .help-card h3 { margin: 0 0 10px; font-size: 15px; letter-spacing: 0.3px; }
  .help-card h4 { margin: 12px 0 6px; font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--gw-ink-dim, #a9b1a2); }
  .help-card table { width: 100%; border-collapse: collapse; }
  .help-card td { padding: 3px 6px 3px 0; vertical-align: top; }
  .help-card td:first-child { white-space: nowrap; width: 130px; }
  .help-card kbd { background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.16); border-bottom-width: 2px;
    border-radius: 5px; padding: 1px 6px; font: 700 11px/1.4 ui-monospace, monospace; }
  .help-close { float: right; appearance: none; cursor: pointer; border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.06); color: var(--gw-ink, #f2f4ec); border-radius: 9px; width: 26px; height: 26px; }
  `;
  const tag = document.createElement("style");
  tag.textContent = css;
  document.head.append(tag);
}

export class ShortcutsOverlay {
  readonly root: HTMLElement;

  constructor() {
    ensureGwStyles();
    injectStyles();
    this.root = el("div", "help-sheet hidden");
    const card = el("div", "help-card");
    const close = el("button", "help-close", "✕") as HTMLButtonElement;
    close.addEventListener("click", () => this.toggle(false));
    card.append(close, el("h3", undefined, "⌨ Shortcuts — Gecko Habitat"));
    const sections: [string, [string, string][]][] = [
      [
        "Modes",
        [
          ["F", "Feeding Mode (food tray drawer)"],
          ["B", "Cleaning Mode (tools drawer)"],
          ["T", "Terrain Mode (sculpt drawer)"],
          ["D", "Decorate Mode (build tray)"],
          ["P", "Photo Mode (free camera)"],
          ["C", "View Collisions overlay"],
          ["H", "This help sheet"],
          ["Esc", "Back to the main view"],
        ],
      ],
      [
        "Camera",
        [
          ["Drag", "Lean the view — the tank stays fixed in the room"],
          ["Wheel", "Zoom"],
          ["Right-drag", "Pan (the pivot stays inside the tank)"],
          ["⚙ menu", "Front / Left / Right / Top presets · Focus Gecko"],
          ["📷", "Photo Mode — full free orbit for screenshots"],
          ["Home", "Reset the camera"],
        ],
      ],
      [
        "Decorate Mode",
        [
          ["W / E / R", "Move · Rotate · Scale gizmo"],
          ["PgUp / PgDn", "Raise / lower (Shift = fine)"],
          ["Ctrl+Z / Ctrl+Y", "Undo · Redo"],
          ["Ctrl+D / Del", "Duplicate · Delete"],
          ["Ctrl (hold)", "Snap to grid"],
          ["Wheel / R", "Spin the placement ghost"],
          ["F", "Focus selected / animal"],
        ],
      ],
      [
        "In a drawer mode",
        [
          ["1 – 6", "Pick the food / tool card"],
          ["[ / ]", "Brush size"],
          ["⚡ Strong", "Terrain: taller dunes + dig to bedrock"],
          ["Click / drag", "Apply (drop food · scrub · sculpt)"],
          ["Enter", "Finish (same as Done)"],
        ],
      ],
    ];
    for (const [h, rows] of sections) {
      card.append(el("h4", undefined, h));
      const table = el("table");
      for (const [k, v] of rows) {
        const tr = el("tr");
        const td1 = el("td");
        td1.append(
          ...k.split(" / ").flatMap((part, i) => {
            const kbd = el("kbd", undefined, part);
            return i === 0 ? [kbd] : [document.createTextNode(" / "), kbd];
          }),
        );
        const td2 = el("td", undefined, v);
        tr.append(td1, td2);
        table.append(tr);
      }
      card.append(table);
    }
    this.root.append(card);
    this.root.addEventListener("click", (e) => {
      if (e.target === this.root) this.toggle(false);
    });
  }

  mount(parent: HTMLElement): void {
    parent.append(this.root);
  }

  get open(): boolean {
    return !this.root.classList.contains("hidden");
  }

  toggle(on = !this.open): void {
    this.root.classList.toggle("hidden", !on);
  }
}

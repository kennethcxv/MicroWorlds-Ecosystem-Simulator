/**
 * LOADING OVERLAY — the cozy "setting up the habitat…" card shown while a 3D
 * habitat's chunk + GLBs stream in. Kills the "empty glass box" moment: it
 * appears the instant a switch starts and fades the moment the scene reports
 * ready. Pure DOM, gw-styled, no dependencies on the scene.
 */
import { gwEl, ensureGwStyles } from "./gwTheme";

let stylesIn = false;
function ensureStyles(): void {
  if (stylesIn) return;
  stylesIn = true;
  const css = `
  .gw-loading { position: fixed; inset: 0; z-index: 24; display: grid; place-items: center;
    background: rgba(7, 10, 9, 0.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    opacity: 0; pointer-events: none; transition: opacity 0.28s ease; }
  .gw-loading.on { opacity: 1; pointer-events: auto; }
  .gw-loading .card { display: flex; flex-direction: column; align-items: center; gap: 14px;
    padding: 26px 40px 24px; text-align: center; }
  .gw-loading .glyph { font-size: 44px; line-height: 1; animation: gwBob 2.2s ease-in-out infinite; }
  .gw-loading .t1 { font: 800 18px/1.2 var(--gw-font); color: var(--gw-ink); }
  .gw-loading .t2 { font: 500 12.5px/1.4 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-loading .dots { display: flex; gap: 7px; margin-top: 2px; }
  .gw-loading .dots i { width: 8px; height: 8px; border-radius: 50%; background: var(--gw-green);
    opacity: 0.25; animation: gwDot 1.2s ease-in-out infinite; }
  .gw-loading .dots i:nth-child(2) { animation-delay: 0.18s; }
  .gw-loading .dots i:nth-child(3) { animation-delay: 0.36s; }
  @keyframes gwBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
  @keyframes gwDot { 0%,100% { opacity: 0.25; transform: scale(1); } 50% { opacity: 1; transform: scale(1.25); } }
  body.gw-reduced-motion .gw-loading .glyph, body.gw-reduced-motion .gw-loading .dots i { animation: none; }
  `;
  const tag = document.createElement("style");
  tag.id = "gw-loading-styles";
  tag.textContent = css;
  document.head.append(tag);
}

export class LoadingOverlay {
  readonly root: HTMLElement;
  private glyph: HTMLElement;
  private title: HTMLElement;
  private sub: HTMLElement;
  /** Guards against an old hide() racing a newer show(). */
  private token = 0;

  constructor() {
    ensureGwStyles();
    ensureStyles();
    this.root = gwEl("div", "gw-loading");
    const card = gwEl("div", "gw-panel card");
    this.glyph = gwEl("div", "glyph", "🌿");
    this.title = gwEl("div", "t1", "Setting up the habitat…");
    this.sub = gwEl("div", "t2", "Warming the lights and settling the water.");
    const dots = gwEl("div", "dots");
    dots.append(gwEl("i"), gwEl("i"), gwEl("i"));
    card.append(this.glyph, this.title, this.sub, dots);
    this.root.append(card);
  }

  mount(parent: HTMLElement): void {
    parent.append(this.root);
  }

  /** Show for a habitat; returns a token to pass to hide() (stale hides no-op). */
  show(habitatName: string, glyph: string, subtitle: string): number {
    this.token += 1;
    this.glyph.textContent = glyph;
    this.title.textContent = `Setting up ${habitatName}…`;
    this.sub.textContent = subtitle;
    this.root.classList.add("on");
    return this.token;
  }

  hide(token?: number): void {
    if (token !== undefined && token !== this.token) return;
    this.root.classList.remove("on");
  }

  get visible(): boolean {
    return this.root.classList.contains("on");
  }
}

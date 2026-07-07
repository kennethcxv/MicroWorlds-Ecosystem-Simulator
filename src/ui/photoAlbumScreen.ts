/**
 * PHOTO ALBUM — the reference-match screen (Designs/Photo_Album): serif
 * header + Eco-Keeper card, filter pills, collection cards for the player's
 * REAL habitats, a recent-photos grid with heart toggles, and a sidebar with
 * counted stats, favorite shots, slideshow/export and cover editing — all over
 * the real persisted album (albumScreen.ts). Standalone fullscreen overlay so
 * the in-habitat 🖼 buttons return you exactly where you were.
 *
 * Esc chain: slideshow → lightbox → cover-pick → close.
 */
import { gwEl as el, ensureGwStyles, gwBackPill } from "./gwTheme";
import { gwIcon } from "./gwIcons";
import { ASSETS } from "../data/assets";
import { keeperLevel } from "../data/habitats";
import type { CareGuideStats } from "./careGuide";
import { coverMap, deleteShot, favoriteIds, listShots, setCover, toggleFavorite } from "./albumScreen";
import {
  ALBUM_FILTERS,
  SEASONAL_NOTE,
  SHOWCASE_EMPTY_NOTE,
  collectionById,
  decorateShots,
  fmtStampDate,
  fmtStampTime,
  groupBySpecies,
  showcaseShots,
  sortShots,
  summarizeCollections,
  type AlbumCollectionId,
  type AlbumFilterId,
  type AlbumSort,
  type CollectionSummary,
  type ShotMeta,
} from "../data/photoAlbum";

export interface PhotoAlbumCallbacks {
  stats(): CareGuideStats;
  toast(message: string): void;
  enterHabitat(kind: "lizard" | "fish" | "frog"): void;
}

let stylesIn = false;
function ensureStyles(): void {
  if (stylesIn) return;
  stylesIn = true;
  const css = `
  .gw-pa { position: fixed; inset: 0; z-index: 26; display: none; flex-direction: column;
    color: var(--gw-ink); font-family: var(--gw-font);
    --pa-display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif; }
  .gw-pa.open { display: flex; }
  .gw-pa .pa-bg { position: absolute; inset: 0; background-size: cover; background-position: center 34%; }
  .gw-pa .pa-bg::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(6,9,8,0.94) 0%, rgba(6,9,8,0.88) 42%, rgba(5,8,7,0.96) 100%); }
  .gw-pa .pa-shell { position: relative; z-index: 1; flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin;
    width: min(1760px, 100%); margin: 0 auto; padding: clamp(14px, 2.6vh, 30px) clamp(16px, 2.2vw, 36px) 26px; }

  .gw-pa .pa-head { display: flex; align-items: flex-start; gap: 18px; }
  .gw-pa .pa-titlewrap { display: flex; align-items: center; gap: 15px; }
  .gw-pa .pa-camchip { width: 54px; height: 54px; border-radius: 15px; display: grid; place-items: center;
    border: 1.5px solid var(--gw-green-line); background: rgba(120,200,80,0.1); color: var(--gw-green); }
  .gw-pa h1 { margin: 0; font: 500 clamp(28px, 3vw, 42px)/1.02 var(--pa-display); letter-spacing: 0.4px; }
  .gw-pa .pa-sub { margin-top: 5px; font: 500 12.5px/1.4 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-pa .pa-head .sp { flex: 1; }
  .gw-pa .pa-keeper { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 16px;
    background: rgba(12,15,14,0.8); border: 1.5px solid var(--gw-border-soft);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); min-width: 230px; }
  .gw-pa .pa-keeper .ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center;
    background: rgba(120,200,80,0.12); border: 1px solid var(--gw-green-line); }
  .gw-pa .pa-keeper .nm { font: 800 13.5px/1.1 var(--gw-font); }
  .gw-pa .pa-keeper .lv { font: 600 11px/1.2 var(--gw-font); color: var(--gw-ink-dim); margin-top: 2px; }
  .gw-pa .pa-keeper .bar { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.1); overflow: hidden; margin-top: 6px; }
  .gw-pa .pa-keeper .fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #6fbf49, #a5e06b); }
  .gw-pa .pa-keeper .xp { font: 600 10px/1.2 var(--gw-font); color: var(--gw-ink-dim); margin-top: 4px; }

  .gw-pa .pa-pills { display: flex; align-items: center; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  .gw-pa .pa-pill { appearance: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 16px; border-radius: 13px; border: 1.5px solid var(--gw-border-soft); background: rgba(12,15,14,0.72);
    color: var(--gw-ink-dim); font: 700 12.5px/1 var(--gw-font); transition: color .14s, border-color .14s, background .14s; }
  .gw-pa .pa-pill:hover { color: var(--gw-ink); background: rgba(22,26,22,0.85); }
  .gw-pa .pa-pill.on { color: var(--gw-green); border-color: var(--gw-green-line); background: rgba(120,200,80,0.12); }
  .gw-pa .pa-pills .sp { flex: 1; }
  .gw-pa .pa-pills select { appearance: none; cursor: pointer; padding: 10px 30px 10px 13px; border-radius: 12px;
    background: rgba(12,15,14,0.8) url("data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23cfe0cf' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 11px center;
    border: 1.5px solid var(--gw-border-soft); color: var(--gw-ink); font: 700 12px/1 var(--gw-font); }

  .gw-pa .pa-cols { display: grid; grid-template-columns: minmax(0, 1fr) 356px; gap: clamp(12px, 1.4vw, 22px); margin-top: 16px; }
  .gw-pa .pa-main { min-width: 0; }

  .gw-pa .pa-albums { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; }
  .gw-pa .pa-album { position: relative; appearance: none; cursor: pointer; text-align: left; overflow: hidden;
    border-radius: 18px; border: 1.5px solid var(--gw-border-soft); background: rgba(12,15,14,0.8); color: var(--gw-ink);
    font-family: var(--gw-font); padding: 0; transition: transform .14s, border-color .15s, box-shadow .15s; }
  .gw-pa .pa-album:hover { transform: translateY(-3px); border-color: rgba(255,255,255,0.24); box-shadow: 0 14px 34px rgba(0,0,0,0.45); }
  .gw-pa .pa-album.sel { border-color: var(--gw-green-line); box-shadow: 0 0 0 1px var(--gw-green-line), 0 0 26px rgba(120,200,80,0.2); }
  .gw-pa .pa-album .art { position: relative; aspect-ratio: 16 / 11; display: grid; place-items: center; overflow: hidden; }
  .gw-pa .pa-album .art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .gw-pa .pa-album .art::after { content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(8,10,9,0.9) 100%); }
  .gw-pa .pa-album .body { position: relative; padding: 11px 13px 12px; }
  .gw-pa .pa-album .nm { font: 800 15px/1.15 var(--gw-font); }
  .gw-pa .pa-album .ct { font: 600 11px/1.2 var(--gw-font); color: var(--gw-ink-dim); margin-top: 3px; }
  .gw-pa .pa-album .chips { display: flex; gap: 6px; margin-top: 9px; flex-wrap: wrap; }
  .gw-pa .pa-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 999px;
    background: rgba(8,10,9,0.7); border: 1px solid var(--gw-border-soft); font: 700 10px/1 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-pa .pa-chip .dot { width: 7px; height: 7px; border-radius: 50%; background: #7ecb52; box-shadow: 0 0 7px rgba(126,203,82,0.8); }

  .gw-pa .pa-secthead { display: flex; align-items: center; gap: 10px; margin: 18px 0 10px; }
  .gw-pa .pa-secthead .t { font: 800 15px/1.2 var(--gw-font); display: flex; align-items: center; gap: 9px; }
  .gw-pa .pa-secthead .sp { flex: 1; }

  .gw-pa .pa-grid { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 10px; }
  .gw-pa .pa-shot { position: relative; appearance: none; cursor: pointer; padding: 0; overflow: hidden;
    border-radius: 14px; border: 1.5px solid var(--gw-border-soft); background: #0a0d0c; aspect-ratio: 16 / 11;
    transition: transform .13s, border-color .14s; }
  .gw-pa .pa-shot:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.28); }
  .gw-pa .pa-shot img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .gw-pa .pa-shot .fav { position: absolute; top: 7px; right: 7px; z-index: 2; appearance: none; cursor: pointer;
    width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; border: none;
    background: rgba(8,10,9,0.66); color: rgba(255,255,255,0.75); transition: color .13s, background .13s; }
  .gw-pa .pa-shot .fav:hover { background: rgba(8,10,9,0.9); }
  .gw-pa .pa-shot .fav.on { color: #8ce25a; }
  .gw-pa .pa-shot .cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 14px 9px 7px;
    background: linear-gradient(180deg, rgba(0,0,0,0), rgba(6,8,7,0.88)); font: 600 10px/1.25 var(--gw-font);
    color: var(--gw-ink-dim); text-align: left; opacity: 0; transition: opacity .15s; }
  .gw-pa .pa-shot:hover .cap { opacity: 1; }
  .gw-pa.pickmode .pa-shot { outline: 2px dashed rgba(240,182,75,0.6); outline-offset: -6px; }

  .gw-pa .pa-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .gw-pa .pa-panel { border-radius: 20px; background: rgba(12,15,14,0.84); border: 1.5px solid var(--gw-border-soft);
    backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); padding: 16px; }
  .gw-pa .pa-panel .ph { display: flex; align-items: center; gap: 11px; }
  .gw-pa .pa-panel .ph .ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center;
    background: rgba(120,200,80,0.12); border: 1px solid var(--gw-green-line); }
  .gw-pa .pa-panel .ph .nm { font: 800 17px/1.15 var(--gw-font); }
  .gw-pa .pa-panel .ph .tp { font: 600 11px/1.25 var(--gw-font); color: var(--gw-ink-dim); margin-top: 2px; }
  .gw-pa .pa-panel .ph .tp .act { color: #8ce25a; }
  .gw-pa .pa-desc { margin-top: 10px; font: 500 12px/1.55 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-pa .pa-stats { display: grid; grid-template-columns: 1fr 1fr 1.3fr; margin-top: 12px; border-radius: 13px;
    border: 1px solid var(--gw-border-soft); background: rgba(255,255,255,0.035); overflow: hidden; }
  .gw-pa .pa-stat { padding: 10px 8px; text-align: center; }
  .gw-pa .pa-stat + .pa-stat { border-left: 1px solid rgba(255,255,255,0.06); }
  .gw-pa .pa-stat b { display: block; font: 800 15px/1 var(--gw-font); font-variant-numeric: tabular-nums; }
  .gw-pa .pa-stat span { display: block; margin-top: 4px; font: 600 9.5px/1.2 var(--gw-font); color: var(--gw-ink-dim);
    letter-spacing: 0.3px; }
  .gw-pa .pa-favrow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 9px; }
  .gw-pa .pa-favrow .pa-shot { aspect-ratio: 1 / 0.78; }
  .gw-pa .pa-bigshot { margin-top: 9px; }
  .gw-pa .pa-bigshot .pa-shot { width: 100%; aspect-ratio: 16 / 9.4; }
  .gw-pa .pa-stamp { margin-top: 8px; font: 600 11px/1.3 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-pa .pa-open { width: 100%; margin-top: 12px; }
  .gw-pa .pa-btnrow { display: flex; gap: 8px; margin-top: 9px; }
  .gw-pa .pa-btnrow .gw-ghost-button { flex: 1; justify-content: center; display: inline-flex; align-items: center; gap: 7px; }
  .gw-pa .pa-dim-note { margin-top: 9px; font: 500 11px/1.45 var(--gw-font); color: var(--gw-ink-dim); }

  .gw-pa .pa-foot { position: relative; z-index: 1; display: flex; align-items: center; gap: 14px;
    padding: 10px clamp(16px, 2.2vw, 36px) 14px; border-top: 1px solid rgba(255,255,255,0.06);
    background: rgba(8,10,9,0.74); backdrop-filter: var(--gw-blur); -webkit-backdrop-filter: var(--gw-blur); }
  .gw-pa .pa-foot .hint { flex: 1; text-align: center; font: 600 12px/1.3 var(--gw-font); color: var(--gw-ink-dim); }

  /* Lightbox / slideshow */
  .gw-pa .pa-view { position: fixed; inset: 0; z-index: 5; display: none; flex-direction: column; align-items: center;
    justify-content: center; background: rgba(4,6,5,0.94); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
  .gw-pa .pa-view.open { display: flex; }
  .gw-pa .pa-view img { max-width: min(88vw, 1400px); max-height: 74vh; border-radius: 14px;
    box-shadow: 0 30px 80px rgba(0,0,0,0.7); border: 1px solid rgba(255,255,255,0.12); }
  .gw-pa .pa-view .vcap { margin-top: 14px; text-align: center; font: 700 14px/1.35 var(--gw-font); }
  .gw-pa .pa-view .vwhen { margin-top: 3px; font: 500 11.5px/1.3 var(--gw-font); color: var(--gw-ink-dim); }
  .gw-pa .pa-view .vbtns { display: flex; align-items: center; gap: 9px; margin-top: 14px; }
  .gw-pa .pa-view .vbtn { appearance: none; cursor: pointer; display: inline-flex; align-items: center; gap: 7px;
    padding: 10px 15px; border-radius: 12px; border: 1.5px solid var(--gw-border-soft); background: rgba(16,20,18,0.9);
    color: var(--gw-ink); font: 700 12px/1 var(--gw-font); }
  .gw-pa .pa-view .vbtn:hover { border-color: rgba(255,255,255,0.3); }
  .gw-pa .pa-view .vbtn.fav.on { color: #8ce25a; border-color: var(--gw-green-line); }
  .gw-pa .pa-view .vbtn.del { color: #ffb9a6; border-color: rgba(226,105,78,0.45); }
  .gw-pa .pa-view .arrow { position: absolute; top: 50%; transform: translateY(-50%); appearance: none; cursor: pointer;
    width: 52px; height: 52px; border-radius: 50%; border: 1.5px solid var(--gw-border-soft); background: rgba(12,15,14,0.85);
    color: var(--gw-ink); font: 800 20px/1 var(--gw-font); }
  .gw-pa .pa-view .arrow:hover { border-color: rgba(255,255,255,0.35); }
  .gw-pa .pa-view .arrow.prev { left: clamp(10px, 3vw, 44px); }
  .gw-pa .pa-view .arrow.next { right: clamp(10px, 3vw, 44px); }
  .gw-pa .pa-view .vx { position: absolute; top: 18px; right: 22px; }

  .gw-pa .pa-emptyhero { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center;
    padding: 70px 24px; border-radius: 24px; border: 1.5px dashed rgba(255,255,255,0.16); background: rgba(12,15,14,0.6);
    color: var(--gw-ink-dim); font: 500 13px/1.6 var(--gw-font); }
  .gw-pa .pa-emptyhero .big { font-size: 46px; }
  .gw-pa .pa-empty { padding: 62px 20px; gap: 11px; }
  .gw-pa .pa-empty .ic { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center;
    background: rgba(240,182,75,0.1); border: 1.5px solid rgba(240,182,75,0.32); }
  .gw-pa .pa-empty .t2 { font: 500 21px/1.2 var(--pa-display); color: var(--gw-ink); }
  .gw-pa .pa-emptyhero .t { font: 500 24px/1.2 var(--pa-display); color: var(--gw-ink); }

  @media (max-width: 1400px) { .gw-pa .pa-grid { grid-template-columns: repeat(4, minmax(0,1fr)); } }
  @media (max-width: 1240px) {
    .gw-pa .pa-cols { grid-template-columns: 1fr; }
    .gw-pa .pa-side { display: grid; grid-template-columns: 1fr 1fr; align-items: start; }
    .gw-pa .pa-albums { grid-template-columns: repeat(2, minmax(0,1fr)); }
  }
  @media (max-width: 900px) { .gw-pa .pa-grid { grid-template-columns: repeat(3, minmax(0,1fr)); } .gw-pa .pa-side { grid-template-columns: 1fr; } }
  .gw-pa button:focus-visible { outline: 2px solid var(--gw-green); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .gw-pa * { transition-duration: 0.01ms !important; } }
  `;
  const tag = document.createElement("style");
  tag.id = "gw-photoalbum-styles";
  tag.textContent = css;
  document.head.append(tag);
}

export class PhotoAlbumScreen {
  readonly root: HTMLElement;
  private shell!: HTMLElement;
  private viewer!: HTMLElement;
  private filter: AlbumFilterId = "habitat";
  private sort: AlbumSort = "new";
  private selected: AlbumCollectionId = "lizard";
  private expanded = false;
  private pickCover = false;
  private viewerList: ShotMeta[] = [];
  private viewerIndex = 0;
  private slideTimer: number | null = null;

  constructor(private cb: PhotoAlbumCallbacks) {
    ensureGwStyles();
    ensureStyles();
    this.root = el("div", "gw-pa");
    const bg = el("div", "pa-bg");
    bg.style.backgroundImage = `url("${ASSETS.room.ecocenter}")`;
    this.shell = el("div", "pa-shell");
    this.viewer = el("div", "pa-view");
    this.root.append(bg, this.shell, this.buildFooter(), this.viewer);
    window.addEventListener("keydown", (e) => {
      if (!this.isOpen) return;
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        if (this.slideTimer != null) this.stopSlideshow();
        else if (this.viewer.classList.contains("open")) this.closeViewer();
        else if (this.pickCover) this.setPickCover(false);
        else this.close();
      } else if (this.viewer.classList.contains("open")) {
        if (e.key === "ArrowRight") this.viewerGo(1);
        else if (e.key === "ArrowLeft") this.viewerGo(-1);
      }
    });
  }

  mount(parent: HTMLElement): void {
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return this.root.classList.contains("open");
  }

  open(): void {
    this.pickCover = false;
    this.expanded = false;
    this.root.classList.add("open");
    this.rebuild();
    this.shell.scrollTop = 0;
  }

  close(): void {
    this.stopSlideshow();
    this.closeViewer();
    this.setPickCover(false);
    this.root.classList.remove("open");
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  // ── Data snapshot ──────────────────────────────────────────────────────────

  private allShots(): ShotMeta[] {
    return decorateShots(listShots(), favoriteIds());
  }

  private summaries(): CollectionSummary[] {
    return summarizeCollections(this.allShots(), coverMap());
  }

  private rebuild(): void {
    this.shell.replaceChildren(this.buildHead(), this.buildPills());
    const shots = this.allShots();
    if (shots.length === 0) {
      const hero = el("div", "pa-emptyhero");
      hero.append(
        el("span", "big", "📷"),
        el("div", "t", "No photos yet"),
        el(
          "span",
          undefined,
          "Open a habitat, press the camera button for Photo Mode, frame your animal and hit the big shutter — every capture lands here.",
        ),
      );
      const go = el("button", "gw-primary-button", "Visit a habitat");
      go.addEventListener("click", () => {
        this.close();
        this.cb.enterHabitat("lizard");
      });
      hero.append(go);
      const wrap = el("div");
      wrap.style.marginTop = "18px";
      wrap.append(hero);
      this.shell.append(wrap);
      return;
    }
    const cols = el("div", "pa-cols");
    cols.append(this.buildMain(), this.buildSide());
    this.shell.append(cols);
  }

  private buildHead(): HTMLElement {
    const head = el("div", "pa-head");
    const tw = el("div", "pa-titlewrap");
    const cam = el("div", "pa-camchip");
    cam.append(gwIcon("camera", 26, "#8ce25a"));
    const tx = el("div");
    tx.append(el("h1", undefined, "Photo Album"), el("div", "pa-sub", "Preserve the stories of your habitats. Curate, explore & celebrate nature."));
    tw.append(cam, tx);
    head.append(gwBackPill(() => this.close()), tw, el("div", "sp"));

    const stats = this.cb.stats();
    const lvl = keeperLevel(stats.reputation);
    const keeper = el("div", "pa-keeper");
    const ic = el("div", "ic");
    ic.append(gwIcon("leaf", 20, "#8ce25a"));
    const kx = el("div");
    kx.style.flex = "1";
    const bar = el("div", "bar");
    const fill = el("div", "fill");
    fill.style.width = `${Math.round((lvl.into / lvl.span) * 100)}%`;
    bar.append(fill);
    kx.append(
      el("div", "nm", "Eco-Keeper"),
      el("div", "lv", `Level ${lvl.level}`),
      bar,
      el("div", "xp", `${lvl.toNext.toLocaleString()} ★ to next level`),
    );
    keeper.append(ic, kx);
    head.append(keeper);
    return head;
  }

  private buildPills(): HTMLElement {
    const row = el("div", "pa-pills");
    for (const f of ALBUM_FILTERS) {
      const b = el("button", `pa-pill${this.filter === f.id ? " on" : ""}`);
      b.append(gwIcon(f.icon, 14, this.filter === f.id ? "#8ce25a" : "#f0b64b"), document.createTextNode(f.label));
      b.addEventListener("click", () => {
        if (f.id === "seasonal") {
          this.cb.toast(SEASONAL_NOTE);
          return;
        }
        this.filter = f.id;
        this.expanded = false;
        this.rebuild();
      });
      row.append(b);
    }
    row.append(el("div", "sp"));
    const sel = document.createElement("select");
    for (const [v, label] of [
      ["new", "Newest First"],
      ["old", "Oldest First"],
    ] as const) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = label;
      if (this.sort === v) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener("change", () => {
      this.sort = sel.value as AlbumSort;
      this.rebuild();
    });
    row.append(sel);
    return row;
  }

  // ── Main column ────────────────────────────────────────────────────────────

  private buildMain(): HTMLElement {
    const main = el("div", "pa-main");
    if (this.filter === "habitat") {
      const sums = this.summaries();
      const albums = el("div", "pa-albums");
      for (const s of sums) albums.append(this.buildAlbumCard(s));
      main.append(albums);
      const sel = sums.find((s) => s.def.id === this.selected) ?? sums[0];
      if (sel) {
        const shots = sortShots(sel.shots, this.sort);
        main.append(this.sectionHead(`Recent Photos in ${sel.def.name}`, shots.length));
        main.append(this.buildShotGrid(this.expanded ? shots : shots.slice(0, 10), `No photos of ${sel.def.name} yet — visit and use Photo Mode.`));
      }
    } else if (this.filter === "species") {
      const groups = groupBySpecies(this.allShots());
      for (const g of groups) {
        main.append(this.sectionHead(g.species, g.shots.length));
        main.append(this.buildShotGrid(sortShots(g.shots, this.sort), ""));
      }
    } else if (this.filter === "favorites") {
      const favs = sortShots(
        this.allShots().filter((s) => s.fav),
        this.sort,
      );
      main.append(this.sectionHead("Favorites", favs.length));
      main.append(this.buildShotGrid(favs, "No favorites yet — tap the ♥ on any photo."));
    } else {
      const picks = showcaseShots(this.allShots(), coverMap());
      main.append(this.sectionHead("Showcase", picks.length));
      main.append(this.buildShotGrid(sortShots(picks, this.sort), SHOWCASE_EMPTY_NOTE));
    }
    return main;
  }

  private sectionHead(title: string, count: number): HTMLElement {
    const h = el("div", "pa-secthead");
    const t = el("div", "t");
    t.append(gwIcon("leaf", 14, "#8ce25a"), document.createTextNode(title));
    h.append(t, el("div", "sp"));
    if (this.filter === "habitat" && count > 10) {
      const b = el("button", "gw-ghost-button", this.expanded ? "Show Fewer" : `View All (${count})`);
      b.addEventListener("click", () => {
        this.expanded = !this.expanded;
        this.rebuild();
      });
      h.append(b);
    }
    return h;
  }

  private buildAlbumCard(s: CollectionSummary): HTMLElement {
    const card = el("button", `pa-album${this.selected === s.def.id && this.filter === "habitat" ? " sel" : ""}`);
    const art = el("div", "art");
    if (s.cover) {
      const img = document.createElement("img");
      img.src = s.cover.img;
      img.alt = s.def.name;
      art.append(img);
    } else {
      art.style.background = `radial-gradient(circle at 45% 35%, ${s.def.accent}33, rgba(10,12,11,0.65) 78%)`;
      art.append(gwIcon(s.def.icon, 42, s.def.accent));
    }
    const body = el("div", "body");
    const chips = el("div", "chips");
    const active = el("span", "pa-chip");
    active.append(el("span", "dot"), document.createTextNode("Active"));
    const biome = el("span", "pa-chip");
    biome.append(gwIcon(s.def.icon, 11, s.def.accent), document.createTextNode(s.def.biome));
    chips.append(active, biome);
    body.append(
      el("div", "nm", s.def.name),
      el("div", "ct", s.count === 0 ? "No photos yet" : `${s.count} Photo${s.count === 1 ? "" : "s"}`),
      chips,
    );
    card.append(art, body);
    card.addEventListener("click", () => {
      this.selected = s.def.id;
      this.filter = "habitat";
      this.expanded = false;
      this.rebuild();
    });
    return card;
  }

  private buildShotGrid(shots: ShotMeta[], emptyNote: string): HTMLElement {
    const grid = el("div", "pa-grid");
    if (shots.length === 0 && emptyNote) {
      const empty = el("div", "gw-empty-state pa-empty");
      empty.style.gridColumn = "1 / -1";
      const ic = el("span", "ic");
      ic.append(gwIcon(this.filter === "favorites" ? "heart" : "star", 28, "#f0b64b"));
      empty.append(
        ic,
        el("span", "t2", this.filter === "favorites" ? "No favorites yet" : "Your showcase is empty"),
        el("span", undefined, emptyNote),
      );
      grid.append(empty);
      return grid;
    }
    for (const s of shots) grid.append(this.buildThumb(s, shots));
    return grid;
  }

  private buildThumb(s: ShotMeta, list: ShotMeta[]): HTMLElement {
    const b = el("button", "pa-shot");
    const img = document.createElement("img");
    img.src = s.img;
    img.alt = s.caption;
    img.loading = "lazy";
    const fav = el("button", `fav${s.fav ? " on" : ""}`);
    fav.append(gwIcon("heart", 14));
    fav.title = s.fav ? "Un-favorite" : "Favorite";
    fav.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(s.id);
      this.rebuild();
    });
    const cap = el("div", "cap", `${s.caption} — ${s.when}`);
    b.append(img, fav, cap);
    b.addEventListener("click", () => {
      if (this.pickCover) {
        setCover(s.collection, s.id);
        this.setPickCover(false);
        this.cb.toast(`${collectionById(s.collection).name}'s album cover updated.`);
        this.rebuild();
        return;
      }
      this.openViewer(list, list.indexOf(s));
    });
    return b;
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────

  private buildSide(): HTMLElement {
    const side = el("div", "pa-side");
    const sums = this.summaries();
    const s = sums.find((x) => x.def.id === this.selected) ?? sums[0];
    if (!s) return side;

    const panel = el("div", "pa-panel");
    const ph = el("div", "ph");
    const ic = el("div", "ic");
    ic.append(gwIcon(s.def.icon, 20, s.def.accent));
    const tx = el("div");
    const tp = el("div", "tp");
    tp.append(document.createTextNode(`${s.def.type} · `), el("span", "act", "Active"));
    tx.append(el("div", "nm", s.def.name), tp);
    ph.append(ic, tx);
    panel.append(ph, el("div", "pa-desc", s.def.desc));

    const stats = el("div", "pa-stats");
    const stat = (v: string, k: string): HTMLElement => {
      const d = el("div", "pa-stat");
      d.append(el("b", undefined, v), el("span", undefined, k));
      return d;
    };
    stats.append(
      stat(String(s.count), s.count === 1 ? "Photo" : "Photos"),
      stat(String(s.favCount), s.favCount === 1 ? "Favorite" : "Favorites"),
      stat(s.createdT ? fmtStampDate(s.createdT) : "—", s.createdT ? "First shot" : "Not started"),
    );
    panel.append(stats);

    const favHead = el("div", "pa-secthead");
    favHead.style.margin = "14px 0 0";
    const ft = el("div", "t");
    ft.append(gwIcon("heart", 13, "#8ce25a"), document.createTextNode("Favorite Shots"));
    favHead.append(ft, el("div", "sp"));
    if (s.favCount > 0) {
      const viewAll = el("button", "gw-ghost-button", "View All");
      viewAll.addEventListener("click", () => {
        this.filter = "favorites";
        this.rebuild();
      });
      favHead.append(viewAll);
    }
    panel.append(favHead);
    const favs = s.shots.filter((x) => x.fav).slice(0, 3);
    if (favs.length) {
      const row = el("div", "pa-favrow");
      for (const f of favs) row.append(this.buildThumb(f, s.shots));
      panel.append(row);
    } else {
      panel.append(el("div", "pa-dim-note", "Tap the ♥ on a photo to keep it here."));
    }

    if (s.latest) {
      const nh = el("div", "pa-secthead");
      nh.style.margin = "14px 0 0";
      const nt = el("div", "t");
      nt.append(gwIcon("camera", 13, "#8ce25a"), document.createTextNode("Newest Shot"));
      nh.append(nt);
      panel.append(nh);
      const big = el("div", "pa-bigshot");
      big.append(this.buildThumb(s.latest, s.shots));
      panel.append(big, el("div", "pa-stamp", `Captured on ${fmtStampDate(s.latest.t)} · ${fmtStampTime(s.latest.t)} — ${s.latest.when}`));
    }

    const openBtn = el("button", "gw-primary-button pa-open", "Open Collection ›");
    openBtn.addEventListener("click", () => {
      this.filter = "habitat";
      this.expanded = true;
      this.rebuild();
    });
    panel.append(openBtn);

    const row1 = el("div", "pa-btnrow");
    const coverBtn = el("button", "gw-ghost-button");
    coverBtn.append(gwIcon("pencil", 13), document.createTextNode("Edit Album Cover"));
    coverBtn.addEventListener("click", () => {
      if (s.count === 0) {
        this.cb.toast("Take a photo first — then pick it as the cover.");
        return;
      }
      this.setPickCover(true);
      this.cb.toast("Cover pick: click any photo in the grid to make it this album's cover (Esc cancels).");
    });
    const slideBtn = el("button", "gw-ghost-button");
    slideBtn.append(gwIcon("play", 13), document.createTextNode("Make Slideshow"));
    slideBtn.addEventListener("click", () => {
      if (s.count === 0) {
        this.cb.toast("No photos to play yet — visit the habitat with your camera.");
        return;
      }
      this.startSlideshow(sortShots(s.shots, "old"));
    });
    row1.append(coverBtn, slideBtn);
    panel.append(row1);

    const row2 = el("div", "pa-btnrow");
    const exportBtn = el("button", "gw-ghost-button");
    exportBtn.append(gwIcon("download", 13), document.createTextNode("Export Newest"));
    exportBtn.addEventListener("click", () => {
      if (!s.latest) {
        this.cb.toast("Nothing to export yet.");
        return;
      }
      this.downloadShot(s.latest);
    });
    const visitBtn = el("button", "gw-ghost-button");
    visitBtn.append(gwIcon("eye", 13), document.createTextNode("Visit Habitat"));
    visitBtn.addEventListener("click", () => {
      if (s.def.id === "eco") {
        this.cb.toast("These were taken around the eco-center itself.");
        return;
      }
      this.close();
      this.cb.enterHabitat(s.def.id);
    });
    row2.append(exportBtn, visitBtn);
    panel.append(row2);

    side.append(panel);
    return side;
  }

  // ── Cover picking ──────────────────────────────────────────────────────────

  private setPickCover(on: boolean): void {
    this.pickCover = on;
    this.root.classList.toggle("pickmode", on);
  }

  // ── Lightbox + slideshow ───────────────────────────────────────────────────

  private openViewer(list: ShotMeta[], index: number): void {
    this.viewerList = list;
    this.viewerIndex = Math.max(0, index);
    this.renderViewer();
    this.viewer.classList.add("open");
  }

  private closeViewer(): void {
    this.stopSlideshow();
    this.viewer.classList.remove("open");
  }

  private viewerGo(dir: number): void {
    if (!this.viewerList.length) return;
    this.viewerIndex = (this.viewerIndex + dir + this.viewerList.length) % this.viewerList.length;
    this.renderViewer();
  }

  private startSlideshow(list: ShotMeta[]): void {
    if (!list.length) return;
    this.openViewer(list, 0);
    this.stopSlideshowTimerOnly();
    this.slideTimer = window.setInterval(() => this.viewerGo(1), 3500);
    this.renderViewer();
  }

  private stopSlideshowTimerOnly(): void {
    if (this.slideTimer != null) {
      window.clearInterval(this.slideTimer);
      this.slideTimer = null;
    }
  }

  private stopSlideshow(): void {
    const was = this.slideTimer != null;
    this.stopSlideshowTimerOnly();
    if (was && this.viewer.classList.contains("open")) this.renderViewer();
  }

  private downloadShot(s: ShotMeta): void {
    const a = document.createElement("a");
    a.href = s.img;
    a.download = `glasswater_${s.collection}_${s.id}.jpg`;
    document.body.append(a);
    a.click();
    a.remove();
    this.cb.toast("Photo saved to your downloads.");
  }

  private renderViewer(): void {
    const s = this.viewerList[this.viewerIndex];
    if (!s) {
      this.closeViewer();
      return;
    }
    this.viewer.replaceChildren();
    const img = document.createElement("img");
    img.src = s.img;
    img.alt = s.caption;
    const cap = el("div", "vcap", s.caption);
    const when = el("div", "vwhen", `${s.when} — captured ${fmtStampDate(s.t)} · ${fmtStampTime(s.t)}`);
    const btns = el("div", "vbtns");

    const fav = el("button", `vbtn fav${s.fav ? " on" : ""}`);
    fav.append(gwIcon("heart", 14), document.createTextNode(s.fav ? "Favorited" : "Favorite"));
    fav.addEventListener("click", () => {
      const now = toggleFavorite(s.id);
      s.fav = now;
      this.renderViewer();
      this.rebuild();
    });

    const dl = el("button", "vbtn");
    dl.append(gwIcon("download", 14), document.createTextNode("Download"));
    dl.addEventListener("click", () => this.downloadShot(s));

    const slide = el("button", "vbtn");
    slide.append(gwIcon("play", 14), document.createTextNode(this.slideTimer != null ? "Pause" : "Slideshow"));
    slide.addEventListener("click", () => {
      if (this.slideTimer != null) this.stopSlideshow();
      else {
        this.slideTimer = window.setInterval(() => this.viewerGo(1), 3500);
        this.renderViewer();
      }
    });

    const del = el("button", "vbtn del");
    del.append(gwIcon("trash", 14), document.createTextNode("Delete"));
    let confirming = false;
    del.addEventListener("click", () => {
      if (!confirming) {
        confirming = true;
        del.replaceChildren(gwIcon("trash", 14), document.createTextNode("Really delete? Click again"));
        window.setTimeout(() => {
          confirming = false;
          if (del.isConnected) del.replaceChildren(gwIcon("trash", 14), document.createTextNode("Delete"));
        }, 2600);
        return;
      }
      deleteShot(s.id);
      this.viewerList = this.viewerList.filter((x) => x.id !== s.id);
      this.cb.toast("Photo deleted.");
      if (!this.viewerList.length) this.closeViewer();
      else {
        this.viewerIndex = Math.min(this.viewerIndex, this.viewerList.length - 1);
        this.renderViewer();
      }
      this.rebuild();
    });

    btns.append(fav, dl, slide, del);

    const prev = el("button", "arrow prev", "‹");
    prev.addEventListener("click", () => {
      this.stopSlideshow();
      this.viewerGo(-1);
    });
    const next = el("button", "arrow next", "›");
    next.addEventListener("click", () => {
      this.stopSlideshow();
      this.viewerGo(1);
    });
    const x = el("button", "gw-x vx", "✕");
    x.addEventListener("click", () => this.closeViewer());

    this.viewer.append(img, cap, when, btns, prev, next, x);
  }

  private buildFooter(): HTMLElement {
    const foot = el("div", "pa-foot");
    const back = el("button", "gw-ghost-button", "‹ Back");
    back.addEventListener("click", () => this.close());
    const hint = el("div", "hint", "Click a photo to view it large — ♥ keeps your best shots in the showcase.");
    foot.append(back, hint);
    return foot;
  }
}

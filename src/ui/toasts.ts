/**
 * TOASTS — the ONE transient-notification surface for the whole game.
 *
 * Rules (the anti-spam contract, unit-tested in tests/toasts.test.ts):
 *   · one host, top-centre, BELOW the top cards and ABOVE nothing interactive —
 *     it can never cover the action dock, drawers, tabs or the score card;
 *   · repeats DEDUPE: firing the same message again bumps a "×N" counter and
 *     refreshes its life instead of stacking a clone;
 *   · at most MAX_VISIBLE at once — older ones retire early when a new one
 *     needs the space;
 *   · the queue itself is pure (times passed in) so the policy is testable.
 */
import { gwEl } from "./gwTheme";

export type ToastTone = "good" | "warn" | "bad" | "info";

export interface ToastEntry {
  id: number;
  message: string;
  tone: ToastTone;
  count: number;
  /** ms timestamp after which the toast should leave. */
  expiresAt: number;
}

export const TOAST_LIFE_MS = 3600;
export const MAX_VISIBLE = 3;

/** Pure dedupe/cap policy. The DOM host mirrors `list()` after each call. */
export class ToastQueue {
  private items: ToastEntry[] = [];
  private nextId = 1;

  /** Add (or bump) a toast at time `now`. Returns the live list. */
  add(message: string, tone: ToastTone, now: number): ToastEntry[] {
    const existing = this.items.find((t) => t.message === message && t.tone === tone);
    if (existing) {
      existing.count += 1;
      existing.expiresAt = now + TOAST_LIFE_MS;
      return this.list(now);
    }
    this.items.push({ id: this.nextId++, message, tone, count: 1, expiresAt: now + TOAST_LIFE_MS });
    // Cap: retire the oldest beyond the visible budget.
    while (this.items.length > MAX_VISIBLE) this.items.shift();
    return this.list(now);
  }

  /** Drop expired entries; returns the live list. */
  list(now: number): ToastEntry[] {
    this.items = this.items.filter((t) => t.expiresAt > now);
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }
}

/** DOM host — one fixed top-centre column of gw-styled pills. */
export class ToastHost {
  readonly root: HTMLElement;
  private queue = new ToastQueue();
  private nodes = new Map<number, HTMLElement>();
  private timer: number | null = null;

  constructor() {
    ensureToastStyles();
    this.root = gwEl("div", "gw-toast-host");
  }

  mount(parent: HTMLElement): void {
    parent.append(this.root);
  }

  show(message: string, tone: ToastTone = "info"): void {
    this.queue.add(message, tone, performance.now());
    this.render();
    if (this.timer == null) {
      this.timer = window.setInterval(() => {
        this.render();
        if (!this.root.childElementCount && this.timer != null) {
          window.clearInterval(this.timer);
          this.timer = null;
        }
      }, 400);
    }
  }

  private render(): void {
    const live = this.queue.list(performance.now());
    const liveIds = new Set(live.map((t) => t.id));
    // Remove departed.
    for (const [id, node] of this.nodes) {
      if (!liveIds.has(id)) {
        node.classList.remove("in");
        window.setTimeout(() => node.remove(), 250);
        this.nodes.delete(id);
      }
    }
    // Add / update.
    for (const t of live) {
      let node = this.nodes.get(t.id);
      if (!node) {
        node = gwEl("div", "gw-toast");
        node.dataset.tone = t.tone;
        const msg = gwEl("span", "msg", t.message);
        const count = gwEl("span", "xn");
        node.append(msg, count);
        this.root.append(node);
        this.nodes.set(t.id, node);
        requestAnimationFrame(() => node!.classList.add("in"));
      }
      const xn = node.querySelector(".xn") as HTMLElement;
      xn.textContent = t.count > 1 ? `×${t.count}` : "";
      xn.style.display = t.count > 1 ? "" : "none";
    }
  }
}

let stylesIn = false;
function ensureToastStyles(): void {
  if (stylesIn) return;
  stylesIn = true;
  const css = `
  .gw-toast-host { position: fixed; z-index: 46; left: 50%; transform: translateX(-50%);
    top: clamp(122px, 15vh, 150px); display: flex; flex-direction: column; align-items: center;
    gap: 8px; pointer-events: none; max-width: min(560px, 86vw); }
  .gw-toast { display: inline-flex; align-items: center; gap: 9px; padding: 10px 17px;
    border-radius: 999px; background: rgba(13, 14, 12, 0.92); border: 1px solid rgba(255,255,255,0.1);
    backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    color: #f2f4ec; font: 600 12.5px/1.35 var(--gw-font, system-ui, sans-serif);
    box-shadow: 0 12px 34px rgba(0,0,0,0.5); max-width: 100%;
    opacity: 0; transform: translateY(-6px); transition: opacity 0.22s ease, transform 0.22s ease; }
  .gw-toast.in { opacity: 1; transform: translateY(0); }
  .gw-toast .msg { overflow: hidden; text-overflow: ellipsis; }
  .gw-toast .xn { flex: 0 0 auto; padding: 2px 8px; border-radius: 999px; font: 800 10.5px/1.2 var(--gw-font, sans-serif);
    background: rgba(255,255,255,0.12); color: #fff; }
  .gw-toast[data-tone="good"] { border-color: rgba(140,226,90,0.5); }
  .gw-toast[data-tone="good"] .msg { color: #bdeea0; }
  .gw-toast[data-tone="warn"] { border-color: rgba(240,182,75,0.55); }
  .gw-toast[data-tone="warn"] .msg { color: #f4d296; }
  .gw-toast[data-tone="bad"] { border-color: rgba(239,122,94,0.6); }
  .gw-toast[data-tone="bad"] .msg { color: #ffb9a6; }
  `;
  const tag = document.createElement("style");
  tag.id = "gw-toast-styles";
  tag.textContent = css;
  document.head.append(tag);
}

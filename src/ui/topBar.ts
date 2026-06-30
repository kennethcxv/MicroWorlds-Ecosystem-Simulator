/** Persistent top bar: logo · resource counters · day/time · menu. */
import type { GameState } from "../core/state";
import type { Component, Controller } from "./controller";
import { el, formatInt, formatSigned } from "../utils/dom";
import { icon } from "./icons";
import { formatClock, incomeProjection } from "../core/sim";

const LOTUS = `
<svg viewBox="0 0 48 48" aria-hidden="true" class="lotus">
  <path d="M24 8c3 5 4 9 4 13 0 5-2 9-4 12-2-3-4-7-4-12 0-4 1-8 4-13Z" fill="#3fb6c4"/>
  <path d="M24 16c4 3 7 6 9 10 1 3 1 6 0 9-4-1-8-3-10-7-1-3-1-8 1-12Z" fill="#2f93a6" opacity="0.95"/>
  <path d="M24 16c-4 3-7 6-9 10-1 3-1 6 0 9 4-1 8-3 10-7 1-3 1-8-1-12Z" fill="#2f93a6" opacity="0.95"/>
  <path d="M33 20c4 1 7 3 9 6-2 3-5 5-9 6-2 1-5 1-7 0 3-2 5-4 6-7 1-2 1-3 1-5Z" fill="#256f80" opacity="0.9"/>
  <path d="M15 20c-4 1-7 3-9 6 2 3 5 5 9 6 2 1 5 1 7 0-3-2-5-4-6-7-1-2-1-3-1-5Z" fill="#256f80" opacity="0.9"/>
</svg>`;

export function createTopBar(controller: Controller): Component {
  const leavesVal = el("span", { class: "res-val" });
  const leavesRate = el("span", { class: "res-rate" });
  const waterVal = el("span", { class: "res-val" });
  const waterRate = el("span", { class: "res-rate" });
  const repVal = el("span", { class: "res-val" });
  const dayVal = el("span", { class: "clock-day" });
  const timeVal = el("span", { class: "clock-time" });

  const resPill = (iconName: string, valEl: HTMLElement, rateEl: HTMLElement | null, label: string) =>
    el("div", { class: "res-pill" }, [
      el("span", { class: `res-ico ico-${iconName}`, html: icon(iconName) }),
      el("div", { class: "res-text" }, rateEl ? [valEl, rateEl] : [valEl, el("span", { class: "res-rate", text: label })]),
    ]);

  const menuBtn = el("button", { class: "icon-btn menu-btn", title: "Menu", html: icon("menu") });
  const menu = buildMenu(controller);
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("open");
  });
  document.addEventListener("click", () => menu.classList.remove("open"));

  const root = el("header", { class: "topbar" }, [
    el("div", { class: "brand" }, [
      el("span", { class: "brand-mark", html: LOTUS }),
      el("div", { class: "brand-text" }, [
        el("div", { class: "brand-name", text: "GLASSWATER" }),
        el("div", { class: "brand-sub", text: "ECO-CENTER" }),
      ]),
    ]),
    el("div", { class: "res-group" }, [
      resPill("leaf", leavesVal, leavesRate, ""),
      resPill("droplet", waterVal, waterRate, ""),
      resPill("star", repVal, null, "Reputation"),
    ]),
    el("div", { class: "clock-group" }, [
      el("div", { class: "clock-pill" }, [
        el("div", { class: "clock-text" }, [dayVal, timeVal]),
        el("span", { class: "clock-sun", html: icon("sun") }),
      ]),
      el("div", { class: "menu-wrap" }, [menuBtn, menu]),
    ]),
  ]);

  return {
    el: root,
    update(state: GameState) {
      const inc = incomeProjection(state);
      leavesVal.textContent = formatInt(state.resources.leaves);
      leavesRate.textContent = `${formatSigned(inc.leaves)} / day`;
      waterVal.textContent = formatInt(state.resources.water);
      waterRate.textContent = `${formatSigned(inc.water)} / day`;
      repVal.textContent = formatInt(state.resources.reputation);
      dayVal.textContent = `DAY ${state.clock.day}`;
      timeVal.textContent = formatClock(state.clock.minutes);
    },
  };
}

function buildMenu(controller: Controller): HTMLElement {
  const item = (label: string, onClick: () => void) =>
    el("button", { class: "menu-item", text: label, onClick: () => { onClick(); } });
  return el("div", { class: "menu-pop" }, [
    item("Eco-Center Overview", () => controller.navigate("ecocenter")),
    item("Save Game", () => controller.saveNow()),
    item("Reset Game", () => controller.resetGame()),
  ]);
}

/**
 * Assembles the persistent game chrome over the canvas and routes between the
 * aquarium HUD and the secondary screens. Owns the event log + toast host.
 */
import type { GameState, ScreenId, EventTone } from "../core/state";
import type { Component, Controller } from "./controller";
import { el, clear } from "../utils/dom";
import { createTopBar } from "./topBar";
import { createLeftPanel, createRightPanel } from "./sidePanels";
import { createActionBar, createNavLeft, createNavRight } from "./bottomActions";
import { createScreenHost, type ScreenHost } from "./screens";

export interface GameLayout {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  update(state: GameState): void;
  setScreen(screen: ScreenId, state: GameState): void;
  toast(message: string, tone: EventTone): void;
}

function createEventLog(): Component {
  const list = el("div", { class: "event-log-list" });
  const root = el("div", { class: "event-log" }, [list]);
  let lastTop = -1;
  return {
    el: root,
    update(state) {
      const recent = state.events.slice(0, 4);
      const topId = recent[0]?.id ?? -1;
      if (topId === lastTop) return; // only rebuild when something new happened
      lastTop = topId;
      clear(list);
      recent.forEach((e, i) => {
        const row = el("div", { class: "event-row", dataset: { tone: e.tone } }, [
          el("span", { class: "event-dot" }),
          el("span", { class: "event-msg", text: e.message }),
        ]);
        if (i === 0) row.classList.add("fresh");
        list.append(row);
      });
    },
  };
}

export function createLayout(controller: Controller): GameLayout {
  const canvas = document.createElement("canvas");
  canvas.id = "scene";

  const topBar = createTopBar(controller);
  const leftPanel = createLeftPanel(controller);
  const rightPanel = createRightPanel(controller);
  const actionBar = createActionBar(controller);
  const navLeft = createNavLeft(controller);
  const navRight = createNavRight(controller);
  const eventLog = createEventLog();
  const screenHost: ScreenHost = createScreenHost(controller);

  const stage = el("main", { class: "stage" }, [
    leftPanel.el,
    rightPanel.el,
    actionBar.el,
    eventLog.el,
    screenHost.el,
  ]);

  const hud = el("div", { class: "hud is-aquarium" }, [
    topBar.el,
    stage,
    el("footer", { class: "bottom-bar" }, [navLeft.el, navRight.el]),
  ]);

  const toastHost = el("div", { class: "toast-host" });

  const root = el("div", { class: "game-root" }, [canvas, hud, toastHost]);

  let currentScreen: ScreenId = "aquarium";

  function setScreen(screen: ScreenId, state: GameState) {
    currentScreen = screen;
    const aquarium = screen === "aquarium";
    hud.classList.toggle("is-aquarium", aquarium);
    hud.classList.toggle("is-screen", !aquarium);
    if (!aquarium) screenHost.show(screen, state);
  }

  function toast(message: string, tone: EventTone) {
    const t = el("div", { class: "toast", dataset: { tone }, text: message });
    toastHost.append(t);
    requestAnimationFrame(() => t.classList.add("in"));
    const life = 3400;
    setTimeout(() => t.classList.remove("in"), life);
    setTimeout(() => t.remove(), life + 400);
    // Cap stack size.
    while (toastHost.children.length > 4) toastHost.firstElementChild?.remove();
  }

  return {
    root,
    canvas,
    setScreen,
    toast,
    update(state) {
      topBar.update(state);
      navLeft.update(state);
      navRight.update(state);
      if (currentScreen === "aquarium") {
        leftPanel.update(state);
        rightPanel.update(state);
        actionBar.update(state);
        eventLog.update(state);
      } else {
        screenHost.update(state);
      }
    },
  };
}

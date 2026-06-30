/** Bottom-centre action buttons, bottom-left navigation, bottom-right utilities. */
import type { GameState, ScreenId } from "../core/state";
import type { Component, Controller } from "./controller";
import { el } from "../utils/dom";
import { icon } from "./icons";
import { ACTIONS, type ActionId } from "../data/tanks";

const ACTION_ICON: Record<ActionId, string> = {
  feed: "fish",
  clean: "sponge",
  decorate: "plant",
  addSpecies: "fishPlus",
  waterChange: "dropletRefresh",
};

interface ActionButton {
  el: HTMLButtonElement;
  update(state: GameState): void;
}

function actionButton(controller: Controller, id: ActionId): ActionButton {
  const def = ACTIONS.find((a) => a.id === id)!;
  const costEl = def.cost > 0
    ? el("div", { class: "act-cost" }, [
        el("span", { class: "cost-ico", html: icon("leaf") }),
        el("span", { text: String(def.cost) }),
      ])
    : el("div", { class: "act-cost muted", text: "—" });

  const btn = el("button", {
    class: `act-btn act-${id}`,
    title: def.hint,
    onClick: () => controller.dispatch(id),
  }, [
    el("span", { class: "act-ico", html: icon(ACTION_ICON[id]) }),
    el("span", { class: "act-label", text: def.label.toUpperCase() }),
    costEl,
  ]) as HTMLButtonElement;

  if (!def.implemented) btn.classList.add("soon");

  return {
    el: btn,
    update(state) {
      const afford = state.resources.leaves >= def.cost;
      btn.classList.toggle("disabled", !afford && def.implemented);
    },
  };
}

export function createActionBar(controller: Controller): Component {
  const buttons = ACTIONS.map((a) => actionButton(controller, a.id));
  const root = el("div", { class: "action-bar" }, buttons.map((b) => b.el));
  return {
    el: root,
    update(state) {
      buttons.forEach((b) => b.update(state));
    },
  };
}

interface NavSpec {
  iconName: string;
  label: string;
  onClick: (c: Controller) => void;
  screen?: ScreenId;
}

function navCluster(controller: Controller, items: NavSpec[], cls: string): Component {
  const made = items.map((it) => {
    const b = el("button", {
      class: "nav-btn",
      title: it.label,
      onClick: () => it.onClick(controller),
    }, [
      el("span", { class: "nav-ico", html: icon(it.iconName) }),
      el("span", { class: "nav-label", text: it.label }),
    ]);
    return { el: b, screen: it.screen };
  });
  const root = el("nav", { class: `nav-cluster ${cls}` }, made.map((m) => m.el));
  return {
    el: root,
    update(state) {
      for (const m of made) {
        m.el.classList.toggle("active", !!m.screen && m.screen === state.screen);
      }
    },
  };
}

export function createNavLeft(controller: Controller): Component {
  return navCluster(controller, [
    { iconName: "shop", label: "SHOP", screen: "shop", onClick: (c) => c.navigate("shop") },
    { iconName: "inventory", label: "INVENTORY", onClick: (c) => c.toast("Inventory is coming soon.", "info") },
    { iconName: "guide", label: "GUIDE", screen: "shop", onClick: (c) => c.navigate("shop") },
    { iconName: "journal", label: "JOURNAL", screen: "journal", onClick: (c) => c.navigate("journal") },
  ], "nav-left");
}

export function createNavRight(controller: Controller): Component {
  return navCluster(controller, [
    { iconName: "info", label: "INFO", screen: "ecocenter", onClick: (c) => c.navigate("ecocenter") },
    { iconName: "schedule", label: "SCHEDULE", screen: "tasks", onClick: (c) => c.navigate("tasks") },
    { iconName: "notes", label: "NOTES", screen: "journal", onClick: (c) => c.navigate("journal") },
  ], "nav-right");
}

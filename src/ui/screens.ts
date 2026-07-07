/**
 * Secondary screens. Only the aquarium is fully built for the vertical slice;
 * these are intentionally light: Eco-Center + Shop are real-ish placeholders
 * driven by data, the rest are tasteful "coming soon" stubs. Journal surfaces
 * the live event log so it is genuinely useful.
 */
import type { GameState, ScreenId } from "../core/state";
import type { Controller } from "./controller";
import { el, clear } from "../utils/dom";
import { icon } from "./icons";
import { speciesList, RARITY_COLORS } from "../data/species";
import { ASSETS } from "../data/assets";
import { avgHabitatScore } from "../core/sim";

export interface ScreenHost {
  el: HTMLElement;
  show(screen: ScreenId, state: GameState): void;
  update(state: GameState): void;
}

function screenHeader(title: string, subtitle: string): HTMLElement {
  return el("div", { class: "screen-header" }, [
    el("h1", { class: "screen-title", text: title }),
    el("p", { class: "screen-subtitle", text: subtitle }),
  ]);
}

export function createScreenHost(controller: Controller): ScreenHost {
  const body = el("div", { class: "screen-body" });
  const root = el("div", { class: "screen-host" }, [
    el("div", { class: "screen-scroll" }, [body]),
  ]);
  let current: ScreenId = "aquarium";
  let dynamic: ((s: GameState) => void) | null = null;

  function show(screen: ScreenId, state: GameState) {
    current = screen;
    dynamic = null;
    clear(body);
    switch (screen) {
      case "ecocenter":
        body.append(...buildEcoCenter(controller, state));
        break;
      case "shop":
        body.append(...buildShop(controller));
        break;
      case "journal":
        dynamic = buildJournal(body);
        dynamic(state);
        break;
      default:
        body.append(buildStub(screen));
    }
  }

  return {
    el: root,
    show,
    update(state) {
      if (current === "journal" && dynamic) dynamic(state);
    },
  };
}

// ── Eco-Center overview (House tab) ───────────────────────────────────────────
function buildEcoCenter(controller: Controller, state: GameState): HTMLElement[] {
  const score = Math.round(avgHabitatScore(state));
  const rooms = [
    { iconName: "fish", title: "Freshwater Habitat", status: `${state.tanks.length} Tank${state.tanks.length > 1 ? "s" : ""} · Score ${score}`, ready: true, go: () => controller.navigate("aquarium") },
    { iconName: "molecule", title: "Breeding Room", status: "Unlocks soon", ready: false, go: () => controller.navigate("breeding") },
    { iconName: "flask", title: "Research Lab", status: "Unlocks soon", ready: false, go: () => controller.navigate("research") },
    { iconName: "habitat", title: "Rescue & Quarantine", status: "Unlocks soon", ready: false, go: () => controller.navigate("rescue") },
    { iconName: "schedule", title: "Tasks & Objectives", status: "View daily goals", ready: true, go: () => controller.navigate("tasks") },
    { iconName: "shop", title: "Supply Shop", status: "Browse species & gear", ready: true, go: () => controller.navigate("shop") },
  ];

  const grid = el("div", { class: "room-grid" });
  for (const r of rooms) {
    grid.append(
      el("button", { class: `room-card${r.ready ? "" : " locked"}`, onClick: r.go }, [
        el("span", { class: "room-ico", html: icon(r.iconName) }),
        el("div", { class: "room-text" }, [
          el("div", { class: "room-title", text: r.title }),
          el("div", { class: "room-status", text: r.status }),
        ]),
        el("span", { class: "room-chev", html: icon("chevron") }),
      ]),
    );
  }

  return [
    screenHeader("Eco-Center Overview", "Your living gallery of tiny ecosystems."),
    grid,
  ];
}

// ── Species shop / encyclopedia ───────────────────────────────────────────────
function buildShop(controller: Controller): HTMLElement[] {
  const grid = el("div", { class: "species-grid" });
  for (const s of speciesList()) {
    const url = ASSETS.creatures[s.asset as keyof typeof ASSETS.creatures];
    const thumb = el("div", { class: `species-thumb type-${s.type}` });
    const img = document.createElement("img");
    img.src = url;
    img.alt = s.name;
    img.loading = "lazy";
    thumb.append(img);
    grid.append(
      el("button", {
        class: "species-card",
        onClick: () => controller.toast(`${s.name}: ${s.blurb}`, "info"),
      }, [
        thumb,
        el("div", { class: "species-info" }, [
          el("div", { class: "species-name", text: s.name }),
          el("div", { class: "species-latin", text: s.latin }),
          el("div", { class: "species-tags" }, [
            el("span", {
              class: "rarity-tag",
              text: s.rarity,
              attrs: { style: `color:${RARITY_COLORS[s.rarity]};border-color:${RARITY_COLORS[s.rarity]}55` },
            }),
            el("span", { class: "type-tag", text: s.type }),
          ]),
        ]),
      ]),
    );
  }
  return [
    screenHeader("Species Shop & Encyclopedia", "Discover, collect, and care for aquatic life."),
    grid,
  ];
}

// ── Journal (live event log) ──────────────────────────────────────────────────
function buildJournal(body: HTMLElement): (s: GameState) => void {
  const list = el("div", { class: "journal-list" });
  body.append(screenHeader("Journal", "A running record of life in your tanks."), list);
  return (state: GameState) => {
    clear(list);
    if (!state.events.length) {
      list.append(el("div", { class: "journal-empty", text: "Nothing logged yet. Care for your tank to fill these pages." }));
      return;
    }
    for (const e of state.events) {
      list.append(
        el("div", { class: "journal-row", dataset: { tone: e.tone } }, [
          el("span", { class: "journal-when", text: `Day ${e.day} · ${e.time}` }),
          el("span", { class: "journal-msg", text: e.message }),
        ]),
      );
    }
  };
}

// ── Generic stub ──────────────────────────────────────────────────────────────
const STUB_META: Record<string, { title: string; sub: string; iconName: string }> = {
  research: { title: "Research Lab", sub: "Study species and unlock new techniques.", iconName: "flask" },
  breeding: { title: "Breeding Room", sub: "Pair compatible animals and chase rare morphs.", iconName: "molecule" },
  rescue: { title: "Rescue & Quarantine", sub: "Take in neglected animals and nurse them back to health.", iconName: "habitat" },
  tasks: { title: "Tasks & Objectives", sub: "Daily goals and longer-term projects.", iconName: "schedule" },
};

function buildStub(screen: ScreenId): HTMLElement {
  const meta = STUB_META[screen] ?? { title: "Coming Soon", sub: "This wing is still under construction.", iconName: "habitat" };
  return el("div", { class: "screen-stub" }, [
    el("span", { class: "stub-ico", html: icon(meta.iconName) }),
    el("h1", { class: "stub-title", text: meta.title }),
    el("p", { class: "stub-sub", text: meta.sub }),
    el("span", { class: "stub-badge", text: "COMING SOON" }),
  ]);
}
